import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, RefreshCw, Download, Calculator, AlertTriangle } from 'lucide-react';
import { differenceInMonths, differenceInYears, parseISO, isValid, format } from 'date-fns';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';

interface StaffRow {
  id: string;
  full_name: string | null;
  hire_date: string | null;
  employment_type: string | null;
  role: string | null;
  salary: number; // manual override or from payroll
}

/**
 * EOSB calculation (Sudan Labour Law / common MENA formula):
 * < 1 year:  0 (no entitlement)
 * 1–5 years: (salary / 30) × 21 × years_completed
 * > 5 years: (salary / 30) × 30 × years_completed
 */
function calcEOSB(monthlySalary: number, hireDate: string | null): {
  serviceMonths: number; serviceYears: number; accrualDays: number; eosb: number; label: string;
} {
  if (!hireDate) return { serviceMonths: 0, serviceYears: 0, accrualDays: 0, eosb: 0, label: '—' };
  const start = parseISO(hireDate);
  if (!isValid(start)) return { serviceMonths: 0, serviceYears: 0, accrualDays: 0, eosb: 0, label: 'Invalid date' };

  const now = new Date();
  const serviceMonths = differenceInMonths(now, start);
  const serviceYears  = differenceInYears(now, start);
  if (serviceMonths < 12) return { serviceMonths, serviceYears: 0, accrualDays: 0, eosb: 0, label: '< 1 yr — no entitlement' };

  const dailyRate  = monthlySalary / 30;
  const accrualDays = serviceYears <= 5 ? 21 : 30;
  const eosb = dailyRate * accrualDays * serviceYears;
  return { serviceMonths, serviceYears, accrualDays, eosb, label: `${serviceYears}y` };
}

export default function EOSBPanel() {
  const [search, setSearch]               = useState('');
  const [deptFilter, setDeptFilter]       = useState('all');
  const [salaryOverrides, setSalaryOverrides] = useState<Record<string, string>>({});

  const { data: profiles, isLoading: profLoading, refetch } = useQuery({
    queryKey: ['eosb_profiles'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, hire_date, employment_type, role, department_id, departments(name)')
        .order('full_name')
        .limit(500);
      return (data ?? []) as any[];
    },
    staleTime: 2 * 60 * 1000,
  });

  const { data: latestPayroll } = useQuery({
    queryKey: ['eosb_payroll'],
    queryFn: async () => {
      // Try payroll_records table — falls back gracefully
      const res = await supabase
        .from('payroll_records' as any)
        .select('user_id, basic_salary, month')
        .order('month', { ascending: false })
        .limit(2000)
        .catch(() => ({ data: null }));
      const rows = (res as any).data ?? [];
      // Latest per user
      const map: Record<string, number> = {};
      for (const r of rows as any[]) {
        if (!map[r.user_id]) map[r.user_id] = Number(r.basic_salary ?? 0);
      }
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });

  const rows: StaffRow[] = (profiles ?? []).map((p: any) => ({
    id: p.id,
    full_name: p.full_name,
    hire_date: p.hire_date ?? null,
    employment_type: p.employment_type ?? null,
    role: p.role ?? null,
    dept: (p.departments as any)?.name ?? null,
    salary: parseFloat(salaryOverrides[p.id] ?? '') || (latestPayroll?.[p.id] ?? 0),
  }));

  const departments = [...new Set((profiles ?? []).map((p: any) => (p.departments as any)?.name).filter(Boolean))].sort();

  const filtered = rows.filter(r => {
    if (deptFilter !== 'all' && (r as any).dept !== deptFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.full_name ?? '').toLowerCase().includes(q) || (r.role ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  const totals = filtered.reduce((acc, r) => {
    const { eosb } = calcEOSB(r.salary, r.hire_date);
    return { eosb: acc.eosb + eosb, staff: acc.staff + 1 };
  }, { eosb: 0, staff: 0 });

  const exportXlsx = useCallback(() => {
    const data = filtered.map(r => {
      const { serviceYears, accrualDays, eosb } = calcEOSB(r.salary, r.hire_date);
      return {
        'Staff Name':      r.full_name ?? '—',
        'Hire Date':       r.hire_date ?? '—',
        'Service Years':   serviceYears,
        'Monthly Salary':  r.salary,
        'Accrual Days/Yr': accrualDays,
        'EOSB Amount':     Math.round(eosb * 100) / 100,
      };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'EOSB');
    XLSX.writeFile(wb, `EOSB_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  }, [filtered]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-teal-600 text-white shrink-0">
            <Calculator className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold">End-of-Service Benefits (EOSB)</h2>
            <p className="text-sm text-muted-foreground">مكافأة نهاية الخدمة — Accrued gratuity per staff member</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={profLoading}>
            <RefreshCw className={cn('h-4 w-4 mr-1', profLoading && 'animate-spin')} />Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportXlsx} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 mr-1" />Export
          </Button>
        </div>
      </div>

      {/* Info banner */}
      <div className="rounded-lg border border-teal-200 bg-teal-50 dark:bg-teal-950/20 px-4 py-3 text-sm text-teal-800 dark:text-teal-300">
        <strong>Formula:</strong> Daily Rate (salary ÷ 30) × Accrual Days × Service Years. Accrual = 21 days/yr for ≤5 yrs, 30 days/yr for &gt;5 yrs. Staff with &lt;12 months service have no entitlement. Override salary below if payroll records are unavailable.
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">Staff Included</div>
          <div className="text-2xl font-bold mt-1 text-teal-700 dark:text-teal-400">{totals.staff}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">Total Accrued EOSB</div>
          <div className="text-2xl font-bold mt-1 text-teal-700 dark:text-teal-400">{totals.eosb.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">Avg EOSB / Person</div>
          <div className="text-2xl font-bold mt-1">{totals.staff > 0 ? (totals.eosb / totals.staff).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'}</div>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Input
          className="h-9 text-sm max-w-xs"
          placeholder="Search staff…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          data-testid="input-eosb-search"
        />
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="h-9 w-44" data-testid="select-eosb-dept"><SelectValue placeholder="All departments" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {profLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">No staff found matching filters.</div>
      ) : (
        <Card>
          <CardContent className="px-0 pb-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Staff Member</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground w-24">Hire Date</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground w-20">Service</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground w-32">Monthly Salary</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground w-24">Days/Yr</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground w-32">EOSB Accrued</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground w-20">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => {
                    const { serviceYears, accrualDays, eosb, label } = calcEOSB(r.salary, r.hire_date);
                    const noSalary = r.salary === 0;
                    return (
                      <tr key={r.id} className={cn('border-b hover:bg-muted/20', i % 2 !== 0 && 'bg-muted/10')} data-testid={`row-eosb-${r.id}`}>
                        <td className="px-4 py-2.5">
                          <div className="font-medium">{r.full_name ?? '—'}</div>
                          <div className="text-muted-foreground text-[10px]">{r.role}</div>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{r.hire_date ?? <span className="text-rose-500">Not set</span>}</td>
                        <td className="px-4 py-2.5 text-right font-medium">{label}</td>
                        <td className="px-4 py-2.5 text-right">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            className="h-7 text-xs text-right w-28 ml-auto"
                            placeholder="0.00"
                            value={salaryOverrides[r.id] ?? (latestPayroll?.[r.id] ? String(latestPayroll[r.id]) : '')}
                            onChange={e => setSalaryOverrides(prev => ({ ...prev, [r.id]: e.target.value }))}
                            data-testid={`input-salary-${r.id}`}
                          />
                        </td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">{accrualDays > 0 ? `${accrualDays}d` : '—'}</td>
                        <td className={cn('px-4 py-2.5 text-right tabular-nums font-semibold', eosb > 0 ? 'text-teal-700 dark:text-teal-400' : 'text-muted-foreground')}>
                          {eosb > 0 ? eosb.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          {!r.hire_date ? (
                            <Badge variant="outline" className="text-[10px] text-rose-600 border-rose-300 gap-1"><AlertTriangle className="h-3 w-3" />No date</Badge>
                          ) : noSalary ? (
                            <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">No salary</Badge>
                          ) : serviceYears === 0 ? (
                            <Badge variant="outline" className="text-[10px] text-slate-500">No entitlement</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-teal-700 border-teal-300">Accruing</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
