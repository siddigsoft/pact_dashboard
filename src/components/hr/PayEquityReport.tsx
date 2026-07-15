import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Download, Search, AlertTriangle, TrendingUp } from 'lucide-react';
import { exportToExcel } from '@/utils/report-export';

interface Grade {
  id: string;
  code: string;
  title: string;
  min_salary: number;
  midpoint_salary: number;
  max_salary: number;
  currency: string;
}

interface EmployeeRow {
  user_id: string;
  full_name: string;
  department: string;
  base_salary: number;
  currency: string;
  grade_id: string | null;
  grade_code: string | null;
  grade_title: string | null;
  grade_mid: number | null;
  grade_min: number | null;
  grade_max: number | null;
  compa_ratio: number | null;
}

function CompaRatioBadge({ ratio }: { ratio: number | null }) {
  if (ratio === null) return <Badge className="bg-gray-100 text-gray-500 dark:bg-gray-800 text-xs">No grade</Badge>;
  if (ratio < 0.8)   return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 text-xs">Below band ({Math.round(ratio * 100)}%)</Badge>;
  if (ratio > 1.2)   return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 text-xs">Above band ({Math.round(ratio * 100)}%)</Badge>;
  if (ratio >= 0.95 && ratio <= 1.05) return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 text-xs">On target ({Math.round(ratio * 100)}%)</Badge>;
  return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 text-xs">In range ({Math.round(ratio * 100)}%)</Badge>;
}

function RatioBar({ ratio }: { ratio: number | null }) {
  if (ratio === null) return <div className="w-32 h-2 bg-gray-100 dark:bg-gray-800 rounded-full" />;
  const pct = Math.min(Math.max(ratio * 100, 0), 150);
  const color = ratio < 0.8 ? 'bg-red-400' : ratio > 1.2 ? 'bg-amber-400' : 'bg-emerald-400';
  return (
    <div className="relative w-32 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${(pct / 150) * 100}%` }} />
      <div className="absolute top-0 left-[66.7%] w-px h-full bg-gray-400 dark:bg-gray-600" title="100% target" />
    </div>
  );
}

export default function PayEquityReport() {
  const [search, setSearch] = useState('');
  const [filterGrade, setFilterGrade] = useState('all');

  const { data: grades = [] } = useQuery<Grade[]>({
    queryKey: ['pay-equity-grades'],
    queryFn: async () => {
      const { data } = await supabase.from('hr_compensation_grades').select('*').eq('is_active', true).order('code');
      return (data ?? []) as Grade[];
    },
    staleTime: 60_000,
  });

  const { data: rawEmployees = [], isLoading } = useQuery({
    queryKey: ['pay-equity-employees'],
    queryFn: async () => {
      const { data } = await supabase
        .from('employee_salary_config')
        .select('user_id, base_salary, currency, grade_id, profiles!inner(full_name, department_id, departments(name))')
        .eq('profiles.is_employee', true);
      return (data ?? []) as any[];
    },
    staleTime: 60_000,
  });

  const gradeMap = useMemo(() => {
    const m: Record<string, Grade> = {};
    grades.forEach(g => { m[g.id] = g; });
    return m;
  }, [grades]);

  const employees = useMemo<EmployeeRow[]>(() => {
    return rawEmployees.map((r: any) => {
      const grade = r.grade_id ? gradeMap[r.grade_id] : null;
      const compa = grade && grade.midpoint_salary > 0
        ? Math.round((Number(r.base_salary) / grade.midpoint_salary) * 1000) / 1000
        : null;
      return {
        user_id: r.user_id,
        full_name: r.profiles?.full_name ?? 'Unknown',
        department: r.profiles?.departments?.name ?? 'Unassigned',
        base_salary: Number(r.base_salary) || 0,
        currency: r.currency ?? 'SDG',
        grade_id: r.grade_id ?? null,
        grade_code: grade?.code ?? null,
        grade_title: grade?.title ?? null,
        grade_mid: grade?.midpoint_salary ?? null,
        grade_min: grade?.min_salary ?? null,
        grade_max: grade?.max_salary ?? null,
        compa_ratio: compa,
      };
    });
  }, [rawEmployees, gradeMap]);

  const filtered = useMemo(() => {
    let rows = employees;
    if (filterGrade !== 'all') rows = rows.filter(e => e.grade_id === filterGrade);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(e => e.full_name.toLowerCase().includes(q) || (e.grade_code ?? '').toLowerCase().includes(q) || e.department.toLowerCase().includes(q));
    }
    return rows.sort((a, b) => (a.grade_code ?? 'zzz').localeCompare(b.grade_code ?? 'zzz') || b.base_salary - a.base_salary);
  }, [employees, filterGrade, search]);

  const outliers = useMemo(() => employees.filter(e => e.compa_ratio !== null && (e.compa_ratio < 0.8 || e.compa_ratio > 1.2)), [employees]);
  const noGrade  = useMemo(() => employees.filter(e => !e.grade_id).length, [employees]);

  const exportReport = () => {
    const rows = filtered.map(e => ({
      'Employee': e.full_name,
      'Department': e.department,
      'Grade Code': e.grade_code ?? '—',
      'Grade Title': e.grade_title ?? '—',
      'Base Salary': e.base_salary,
      'Grade Midpoint': e.grade_mid ?? '—',
      'Grade Min': e.grade_min ?? '—',
      'Grade Max': e.grade_max ?? '—',
      'Compa-Ratio': e.compa_ratio !== null ? Math.round(e.compa_ratio * 100) + '%' : '—',
      'Currency': e.currency,
      'Status': e.compa_ratio === null ? 'No grade' : e.compa_ratio < 0.8 ? 'Below band' : e.compa_ratio > 1.2 ? 'Above band' : 'In range',
    }));
    exportToExcel(rows, 'Pay Equity Report', `pay-equity-${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#0F2041] dark:text-white">Pay Equity Report</h2>
          <p className="text-sm text-muted-foreground">{employees.length} employees · Compa-ratio = Salary ÷ Grade Midpoint</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportReport} className="gap-1.5 h-9 text-xs">
          <Download className="h-3.5 w-3.5" />Export Excel
        </Button>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Employees', value: employees.length, color: 'text-[#0F2041] dark:text-blue-300', accent: 'bg-blue-500' },
          { label: 'Outliers', value: outliers.length, color: 'text-red-600 dark:text-red-400', accent: 'bg-red-500' },
          { label: 'No Grade Assigned', value: noGrade, color: 'text-amber-700 dark:text-amber-300', accent: 'bg-amber-500' },
          { label: 'Grades Active', value: grades.length, color: 'text-emerald-700 dark:text-emerald-300', accent: 'bg-emerald-500' },
        ].map(k => (
          <Card key={k.label} className="overflow-hidden">
            <div className={`h-1 ${k.accent}`} />
            <CardContent className="pt-3 pb-3 px-4">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className={`text-2xl font-bold ${k.color}`}>{isLoading ? '—' : k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Outlier alert */}
      {outliers.length > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">{outliers.length} outlier{outliers.length !== 1 ? 's' : ''} detected</p>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
              {outliers.filter(e => e.compa_ratio! < 0.8).length} below 80% · {outliers.filter(e => e.compa_ratio! > 1.2).length} above 120% of grade midpoint
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search employee or grade…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 text-sm w-56" />
        </div>
        <select value={filterGrade} onChange={e => setFilterGrade(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="all">All Grades</option>
          <option value="">No Grade</option>
          {grades.map(g => <option key={g.id} value={g.id}>{g.code} — {g.title}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin opacity-30" /></div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900 border-b border-border">
                <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-2.5">Employee</th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-2.5">Department</th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-2.5">Grade</th>
                <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-2.5">Salary</th>
                <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-2.5">Midpoint</th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-2.5 w-36">Compa-Ratio</th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">No employees found</td></tr>
              ) : filtered.map(e => (
                <tr key={e.user_id} className="border-b border-border last:border-0 hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                  <td className="px-4 py-3 font-medium">{e.full_name}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{e.department}</td>
                  <td className="px-4 py-3">
                    {e.grade_code
                      ? <span className="font-bold text-[#0F2041] dark:text-blue-300">{e.grade_code}<span className="font-normal text-muted-foreground ml-1 text-xs">{e.grade_title}</span></span>
                      : <span className="text-muted-foreground text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{e.base_salary.toLocaleString()} <span className="text-xs text-muted-foreground">{e.currency}</span></td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{e.grade_mid ? e.grade_mid.toLocaleString() : '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <RatioBar ratio={e.compa_ratio} />
                      <span className="text-xs tabular-nums">{e.compa_ratio !== null ? Math.round(e.compa_ratio * 100) + '%' : '—'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3"><CompaRatioBadge ratio={e.compa_ratio} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
