import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Download, Search, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { exportToExcel } from '@/utils/report-export';
import { differenceInMonths, parseISO, isValid } from 'date-fns';

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
  grade_min: number | null;
  grade_mid: number | null;
  grade_max: number | null;
  compa_ratio: number | null;
  is_below_min: boolean;
  is_above_max: boolean;
  time_in_role_months: number | null;
}

type BandStatus = 'below_min' | 'above_max' | 'in_range' | 'no_grade';

function bandStatus(e: EmployeeRow): BandStatus {
  if (!e.grade_id) return 'no_grade';
  if (e.is_below_min) return 'below_min';
  if (e.is_above_max) return 'above_max';
  return 'in_range';
}

function BandBadge({ e }: { e: EmployeeRow }) {
  const status = bandStatus(e);
  if (status === 'no_grade')   return <Badge className="bg-gray-100 text-gray-500 dark:bg-gray-800 text-xs">No grade</Badge>;
  if (status === 'below_min')  return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 text-xs">Below min ({Math.round((e.compa_ratio ?? 0) * 100)}%)</Badge>;
  if (status === 'above_max')  return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 text-xs">Above max ({Math.round((e.compa_ratio ?? 0) * 100)}%)</Badge>;
  const pct = Math.round((e.compa_ratio ?? 0) * 100);
  if (pct >= 95 && pct <= 105) return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 text-xs">On target ({pct}%)</Badge>;
  return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 text-xs">In range ({pct}%)</Badge>;
}

function BandBar({ e }: { e: EmployeeRow }) {
  if (!e.grade_min || !e.grade_max) {
    return <div className="w-32 h-2 bg-gray-100 dark:bg-gray-800 rounded-full" />;
  }
  const spread = e.grade_max - e.grade_min;
  if (spread <= 0) return null;
  const salaryPct = Math.max(0, Math.min(((e.base_salary - e.grade_min) / spread) * 100, 100));
  const midPct    = e.grade_mid ? Math.max(0, Math.min(((e.grade_mid - e.grade_min) / spread) * 100, 100)) : 50;
  const color     = e.is_below_min ? 'bg-red-400' : e.is_above_max ? 'bg-amber-400' : 'bg-emerald-400';
  return (
    <div className="relative w-32 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-visible" title={`Min: ${e.grade_min.toLocaleString()} | Mid: ${e.grade_mid?.toLocaleString()} | Max: ${e.grade_max.toLocaleString()}`}>
      <div className={`absolute top-0 h-full rounded-full ${color} transition-all`} style={{ width: `${salaryPct}%` }} />
      <div className="absolute top-1/2 -translate-y-1/2 w-px h-3 bg-gray-400 dark:bg-gray-500" style={{ left: `${midPct}%` }} title="Midpoint" />
    </div>
  );
}

function GradeGroup({ grade, rows, collapsed, onToggle }: {
  grade: { code: string; title: string; min: number; mid: number; max: number; currency: string } | null;
  rows: EmployeeRow[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  const outliers = rows.filter(e => e.is_below_min || e.is_above_max);
  return (
    <>
      <tr
        className="bg-slate-50 dark:bg-slate-900/70 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800/80"
        onClick={onToggle}
      >
        <td colSpan={7} className="px-4 py-2">
          <div className="flex items-center gap-2">
            {collapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
            <span className="text-xs font-bold text-[#0F2041] dark:text-blue-300">
              {grade ? `${grade.code} — ${grade.title}` : 'No Grade Assigned'}
            </span>
            {grade && (
              <span className="text-xs text-muted-foreground">
                {grade.min.toLocaleString()} – {grade.max.toLocaleString()} {grade.currency} · mid {grade.mid.toLocaleString()}
              </span>
            )}
            <span className="ml-auto text-xs text-muted-foreground">{rows.length} employee{rows.length !== 1 ? 's' : ''}</span>
            {outliers.length > 0 && (
              <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 text-xs">{outliers.length} outlier{outliers.length !== 1 ? 's' : ''}</Badge>
            )}
          </div>
        </td>
      </tr>
      {!collapsed && rows.map(e => (
        <tr key={e.user_id} className="border-b border-border last:border-0 hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
          <td className="px-4 py-3 font-medium text-sm">{e.full_name}</td>
          <td className="px-4 py-3 text-muted-foreground text-xs">{e.department}</td>
          <td className="px-4 py-3 text-right tabular-nums font-semibold text-sm">
            {e.base_salary.toLocaleString()} <span className="text-xs text-muted-foreground">{e.currency}</span>
          </td>
          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground text-xs">
            {e.grade_mid ? e.grade_mid.toLocaleString() : '—'}
          </td>
          <td className="px-4 py-3">
            <div className="flex items-center gap-2">
              <BandBar e={e} />
              <span className="text-xs tabular-nums text-muted-foreground">
                {e.compa_ratio !== null ? Math.round(e.compa_ratio * 100) + '%' : '—'}
              </span>
            </div>
          </td>
          <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
            {e.time_in_role_months !== null ? `${e.time_in_role_months}mo` : '—'}
          </td>
          <td className="px-4 py-3"><BandBadge e={e} /></td>
        </tr>
      ))}
    </>
  );
}

export default function PayEquityReport() {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'below_min' | 'above_max' | 'in_range' | 'no_grade'>('all');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const { data: grades = [] } = useQuery<Grade[]>({
    queryKey: ['pay-equity-grades'],
    queryFn: async () => {
      const { data } = await supabase.from('hr_compensation_grades' as any).select('*').eq('is_active', true).order('code');
      return (data ?? []) as Grade[];
    },
    staleTime: 60_000,
  });

  const { data: rawEmployees = [], isLoading } = useQuery({
    queryKey: ['pay-equity-employees'],
    queryFn: async () => {
      const { data } = await supabase
        .from('employee_salary_config')
        .select('user_id, base_salary, currency, grade_id, profiles!inner(full_name, department_id, contract_start_date, departments(name))')
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
    const now = new Date();
    return rawEmployees.map((r: any) => {
      const grade = r.grade_id ? gradeMap[r.grade_id] : null;
      const salary = Number(r.base_salary) || 0;
      const compa = grade && grade.midpoint_salary > 0
        ? Math.round((salary / grade.midpoint_salary) * 1000) / 1000
        : null;
      const isBelowMin = !!grade && salary < grade.min_salary;
      const isAboveMax = !!grade && salary > grade.max_salary;
      const csDate = r.profiles?.contract_start_date;
      const timeInRole = csDate && isValid(parseISO(csDate))
        ? differenceInMonths(now, parseISO(csDate))
        : null;
      return {
        user_id: r.user_id,
        full_name: r.profiles?.full_name ?? 'Unknown',
        department: r.profiles?.departments?.name ?? 'Unassigned',
        base_salary: salary,
        currency: r.currency ?? 'SDG',
        grade_id: r.grade_id ?? null,
        grade_code: grade?.code ?? null,
        grade_title: grade?.title ?? null,
        grade_min: grade?.min_salary ?? null,
        grade_mid: grade?.midpoint_salary ?? null,
        grade_max: grade?.max_salary ?? null,
        compa_ratio: compa,
        is_below_min: isBelowMin,
        is_above_max: isAboveMax,
        time_in_role_months: timeInRole,
      };
    });
  }, [rawEmployees, gradeMap]);

  const filtered = useMemo(() => {
    let rows = employees;
    if (filterStatus !== 'all') rows = rows.filter(e => bandStatus(e) === filterStatus);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(e =>
        e.full_name.toLowerCase().includes(q) ||
        (e.grade_code ?? '').toLowerCase().includes(q) ||
        e.department.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [employees, filterStatus, search]);

  const grouped = useMemo(() => {
    const map: Record<string, { grade: Grade | null; rows: EmployeeRow[] }> = {};
    filtered.forEach(e => {
      const key = e.grade_id ?? '__none';
      if (!map[key]) map[key] = { grade: e.grade_id ? (gradeMap[e.grade_id] ?? null) : null, rows: [] };
      map[key].rows.push(e);
    });
    return Object.entries(map).sort(([a], [b]) => {
      if (a === '__none') return 1;
      if (b === '__none') return -1;
      const ga = map[a].grade?.code ?? '';
      const gb = map[b].grade?.code ?? '';
      return ga.localeCompare(gb);
    });
  }, [filtered, gradeMap]);

  const outliersBelowMin = useMemo(() => employees.filter(e => e.is_below_min).length, [employees]);
  const outliersAboveMax = useMemo(() => employees.filter(e => e.is_above_max).length, [employees]);
  const noGrade          = useMemo(() => employees.filter(e => !e.grade_id).length, [employees]);
  const totalOutliers    = outliersBelowMin + outliersAboveMax;

  const exportReport = () => {
    const rows = filtered.map(e => ({
      'Employee':         e.full_name,
      'Department':       e.department,
      'Grade Code':       e.grade_code ?? '—',
      'Grade Title':      e.grade_title ?? '—',
      'Base Salary':      e.base_salary,
      'Grade Min':        e.grade_min ?? '—',
      'Grade Midpoint':   e.grade_mid ?? '—',
      'Grade Max':        e.grade_max ?? '—',
      'Compa-Ratio (%)':  e.compa_ratio !== null ? Math.round(e.compa_ratio * 100) : '—',
      'Currency':         e.currency,
      'Band Status':      bandStatus(e) === 'no_grade' ? 'No grade' : e.is_below_min ? 'Below min' : e.is_above_max ? 'Above max' : 'In range',
      'Time in Role (mo)': e.time_in_role_months ?? '—',
    }));
    exportToExcel(rows, 'Pay Equity Report', `pay-equity-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const toggleGroup = (key: string) => setCollapsed(p => ({ ...p, [key]: !p[key] }));

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-[#0F2041] dark:text-white">Pay Equity Report</h2>
          <p className="text-sm text-muted-foreground">
            {employees.length} employees · Compa-ratio = Salary ÷ Grade Midpoint · Outlier = salary outside band min/max
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportReport} className="gap-1.5 h-9 text-xs">
          <Download className="h-3.5 w-3.5" />Export Excel
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Employees',  value: employees.length, color: 'text-[#0F2041] dark:text-blue-300', accent: 'bg-blue-500' },
          { label: 'Below Band Min',   value: outliersBelowMin, color: 'text-red-600 dark:text-red-400',    accent: 'bg-red-500' },
          { label: 'Above Band Max',   value: outliersAboveMax, color: 'text-amber-700 dark:text-amber-300',accent: 'bg-amber-500' },
          { label: 'No Grade Assigned',value: noGrade,          color: 'text-slate-600 dark:text-slate-400',accent: 'bg-slate-400' },
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
      {totalOutliers > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">{totalOutliers} salary outlier{totalOutliers !== 1 ? 's' : ''} detected</p>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
              {outliersBelowMin} below band minimum · {outliersAboveMax} above band maximum.
              Review to ensure compliance with compensation policy.
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search employee or grade…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm w-56"
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as typeof filterStatus)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">All</option>
          <option value="below_min">Below Band Min</option>
          <option value="above_max">Above Band Max</option>
          <option value="in_range">In Range</option>
          <option value="no_grade">No Grade</option>
        </select>
        {grouped.length > 1 && (
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-xs"
            onClick={() => {
              const allCollapsed = grouped.every(([k]) => collapsed[k]);
              const next: Record<string, boolean> = {};
              grouped.forEach(([k]) => { next[k] = !allCollapsed; });
              setCollapsed(next);
            }}
          >
            {grouped.every(([k]) => collapsed[k]) ? 'Expand All' : 'Collapse All'}
          </Button>
        )}
      </div>

      {/* Grouped table */}
      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin opacity-30" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">No employees match the filter.</div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900 border-b border-border">
                <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-2.5">Employee</th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-2.5">Department</th>
                <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-2.5">Salary</th>
                <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-2.5">Midpoint</th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-2.5 w-44">Position in Band</th>
                <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-2.5">In Role</th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(([key, { grade, rows }]) => (
                <GradeGroup
                  key={key}
                  grade={grade ? { code: grade.code, title: grade.title, min: grade.min_salary, mid: grade.midpoint_salary, max: grade.max_salary, currency: grade.currency } : null}
                  rows={rows}
                  collapsed={!!collapsed[key]}
                  onToggle={() => toggleGroup(key)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        "In Role" = months since contract start date. Compa-ratio uses grade midpoint. Outliers are flagged when salary is outside the grade min/max band.
      </p>
    </div>
  );
}
