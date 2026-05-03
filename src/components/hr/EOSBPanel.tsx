import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Loader2, RefreshCw, Download, Calculator, AlertTriangle,
  CheckCircle2, XCircle, Pencil, Save, X, BookOpen,
} from 'lucide-react';
import { differenceInMonths, differenceInYears, parseISO, isValid, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';

interface StaffRow {
  id: string;
  full_name: string | null;
  hire_date: string | null;
  employment_type: string | null;
  role: string | null;
  dept: string | null;
  salary: number;
}

interface EosbAccrual {
  id: string;
  user_id: string;
  period: string;
  opening_balance: number;
  accrued_amount: number;
  closing_balance: number;
  base_salary: number | null;
  currency: string;
  created_at: string;
  staff_name?: string;
  gl_status?: 'success' | 'error' | 'skipped' | null;
}

function calcEOSB(monthlySalary: number, hireDate: string | null) {
  if (!hireDate) return { serviceMonths: 0, serviceYears: 0, accrualDays: 0, eosb: 0, label: '—' };
  const start = parseISO(hireDate);
  if (!isValid(start)) return { serviceMonths: 0, serviceYears: 0, accrualDays: 0, eosb: 0, label: 'Invalid date' };
  const now = new Date();
  const serviceMonths = differenceInMonths(now, start);
  const serviceYears  = differenceInYears(now, start);
  if (serviceMonths < 12) return { serviceMonths, serviceYears: 0, accrualDays: 0, eosb: 0, label: '< 1 yr — no entitlement' };
  const dailyRate   = monthlySalary / 30;
  const accrualDays = serviceYears <= 5 ? 21 : 30;
  const eosb        = dailyRate * accrualDays * serviceYears;
  return { serviceMonths, serviceYears, accrualDays, eosb, label: `${serviceYears}y` };
}

function currentYearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function EOSBPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch]         = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [salaryOverrides, setSalaryOverrides] = useState<Record<string, string>>({});
  const [mainTab, setMainTab]       = useState<'calculator' | 'accruals'>('calculator');

  // hire_date inline editing
  const [editingHireDate, setEditingHireDate] = useState<Record<string, string>>({});
  const [savingHireDate, setSavingHireDate]   = useState<string | null>(null);

  // Provision posting
  const [provisionMonth, setProvisionMonth] = useState(currentYearMonth());
  const [posting, setPosting]               = useState(false);

  const { data: profiles, isLoading: profLoading, refetch: refetchProfiles } = useQuery({
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
      const { data } = await supabase
        .from('employee_salary_config' as any)
        .select('user_id, base_salary')
        .limit(1000)
        .catch(() => ({ data: null }));
      const map: Record<string, number> = {};
      for (const r of (data ?? []) as any[]) {
        if (r.user_id && !map[r.user_id]) map[r.user_id] = Number(r.base_salary ?? 0);
      }
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: accruals, isLoading: accrualsLoading, refetch: refetchAccruals } = useQuery({
    queryKey: ['eosb_accruals_history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eosb_accruals' as any)
        .select('*')
        .order('period', { ascending: false })
        .limit(2000);
      if (error) return [] as EosbAccrual[];
      // Fetch GL bridge log for these accrual IDs
      const ids = ((data ?? []) as any[]).map((a: any) => a.id);
      let glMap: Record<string, string> = {};
      if (ids.length > 0) {
        const { data: logData } = await supabase
          .from('acct_gl_bridge_log' as any)
          .select('source_id, status')
          .eq('source_table', 'eosb_accruals')
          .in('source_id', ids.slice(0, 500));
        for (const l of (logData ?? []) as any[]) {
          glMap[l.source_id] = l.status;
        }
      }
      return ((data ?? []) as any[]).map((a: any) => ({
        ...a,
        gl_status: glMap[a.id] ?? null,
      })) as EosbAccrual[];
    },
    enabled: mainTab === 'accruals',
    staleTime: 30_000,
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
    if (deptFilter !== 'all' && r.dept !== deptFilter) return false;
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

  const noDateCount = filtered.filter(r => !r.hire_date).length;

  const saveHireDate = async (userId: string) => {
    const dateVal = editingHireDate[userId];
    if (!dateVal) { toast({ title: 'Please enter a date', variant: 'destructive' }); return; }
    setSavingHireDate(userId);
    const { error } = await supabase.from('profiles').update({ hire_date: dateVal }).eq('id', userId);
    setSavingHireDate(null);
    if (error) { toast({ title: 'Failed to save hire date', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Hire date saved' });
    setEditingHireDate(prev => { const n = { ...prev }; delete n[userId]; return n; });
    void refetchProfiles();
    void queryClient.invalidateQueries({ queryKey: ['eosb_profiles'] });
  };

  const postProvision = async () => {
    if (!provisionMonth.match(/^\d{4}-\d{2}$/)) {
      toast({ title: 'Invalid period — use YYYY-MM format', variant: 'destructive' }); return;
    }
    setPosting(true);
    const { data, error } = await supabase.rpc('accrue_eosb_for_period' as any, { p_period: provisionMonth });
    setPosting(false);
    if (error) {
      toast({ title: 'Provision failed', description: error.message, variant: 'destructive' }); return;
    }
    const result = data as any;
    toast({
      title: `Provision posted for ${provisionMonth}`,
      description: `${result?.processed ?? 0} employees processed, ${result?.skipped ?? 0} skipped (already run). Journal entries posted to GL automatically.`,
    });
    void refetchAccruals();
    void queryClient.invalidateQueries({ queryKey: ['eosb_accruals_history'] });
  };

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

  const profNameMap = (profiles ?? []).reduce((m: Record<string, string>, p: any) => {
    m[p.id] = p.full_name ?? p.id.slice(0, 8);
    return m;
  }, {});

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
            <p className="text-sm text-muted-foreground">مكافأة نهاية الخدمة — Accrued gratuity with automatic GL posting</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { void refetchProfiles(); void refetchAccruals(); }} disabled={profLoading}>
            <RefreshCw className={cn('h-4 w-4 mr-1', profLoading && 'animate-spin')} />Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportXlsx} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 mr-1" />Export
          </Button>
        </div>
      </div>

      {/* Info banner */}
      <div className="rounded-lg border border-teal-200 bg-teal-50 dark:bg-teal-950/20 px-4 py-3 text-sm text-teal-800 dark:text-teal-300">
        <strong>Formula:</strong> Daily Rate (salary ÷ 30) × Accrual Days × Service Years.
        Accrual = 21 days/yr for ≤5 yrs, 30 days/yr for &gt;5 yrs.
        <strong className="ml-2">GL Bridge:</strong> "Post Monthly Provision" auto-creates DR: EOSB Expense (6200) / CR: EOSB Provision Liability (2350) journal entries for every eligible employee.
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
        <Card className={cn(noDateCount > 0 && 'border-rose-200 dark:border-rose-800/50')}><CardContent className="p-3">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            {noDateCount > 0 && <AlertTriangle className="h-3 w-3 text-rose-500" />}
            Missing Hire Date
          </div>
          <div className={cn('text-2xl font-bold mt-1', noDateCount > 0 ? 'text-rose-600' : 'text-muted-foreground')}>{noDateCount}</div>
        </CardContent></Card>
      </div>

      {/* Monthly Provision posting */}
      <Card className="border-indigo-200 dark:border-indigo-800/40 bg-indigo-50/40 dark:bg-indigo-950/10">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <BookOpen className="h-5 w-5 text-indigo-600 shrink-0" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">Post Monthly Provision to GL</div>
              <div className="text-xs text-indigo-700 dark:text-indigo-400 mt-0.5">
                Runs the EOSB accrual for every active employee and automatically posts DR: EOSB Expense / CR: EOSB Provision Liability journal entries. Idempotent — safe to re-run.
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Input
                type="month"
                className="h-8 text-sm w-36"
                value={provisionMonth}
                onChange={e => setProvisionMonth(e.target.value)}
                data-testid="input-provision-month"
              />
              <Button
                size="sm"
                className="h-8 bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={postProvision}
                disabled={posting}
                data-testid="button-post-provision"
              >
                {posting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <BookOpen className="h-4 w-4 mr-1" />}
                Post Provision
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs: Calculator vs Accruals History */}
      <Tabs value={mainTab} onValueChange={v => setMainTab(v as any)}>
        <TabsList>
          <TabsTrigger value="calculator" data-testid="tab-eosb-calculator">
            <Calculator className="h-4 w-4 mr-1.5" />Calculator
          </TabsTrigger>
          <TabsTrigger value="accruals" data-testid="tab-eosb-accruals">
            <BookOpen className="h-4 w-4 mr-1.5" />GL Accruals History
          </TabsTrigger>
        </TabsList>

        {/* CALCULATOR TAB */}
        <TabsContent value="calculator" className="space-y-4 mt-4">
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
              <SelectTrigger className="h-9 w-44" data-testid="select-eosb-dept">
                <SelectValue placeholder="All departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {profLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
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
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground w-44">Hire Date</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground w-20">Service</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground w-32">Monthly Salary</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground w-20">Days/Yr</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground w-32">EOSB Accrued</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground w-24">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r, i) => {
                        const { serviceYears, accrualDays, eosb, label } = calcEOSB(r.salary, r.hire_date);
                        const noSalary = r.salary === 0;
                        const isEditingDate = r.id in editingHireDate;

                        return (
                          <tr key={r.id} className={cn('border-b hover:bg-muted/20', i % 2 !== 0 && 'bg-muted/10')} data-testid={`row-eosb-${r.id}`}>
                            <td className="px-4 py-2.5">
                              <div className="font-medium">{r.full_name ?? '—'}</div>
                              <div className="text-muted-foreground text-[10px]">{r.role}</div>
                            </td>

                            {/* Hire Date — inline edit */}
                            <td className="px-4 py-2.5">
                              {isEditingDate ? (
                                <div className="flex items-center gap-1">
                                  <Input
                                    type="date"
                                    className="h-6 text-xs w-28"
                                    value={editingHireDate[r.id] ?? ''}
                                    onChange={e => setEditingHireDate(prev => ({ ...prev, [r.id]: e.target.value }))}
                                    data-testid={`input-hire-date-${r.id}`}
                                  />
                                  <button
                                    className="text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
                                    onClick={() => saveHireDate(r.id)}
                                    disabled={savingHireDate === r.id}
                                    data-testid={`button-save-hire-date-${r.id}`}
                                  >
                                    {savingHireDate === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                  </button>
                                  <button
                                    className="text-muted-foreground hover:text-foreground"
                                    onClick={() => setEditingHireDate(prev => { const n = { ...prev }; delete n[r.id]; return n; })}
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 group">
                                  <span className={cn(r.hire_date ? 'text-foreground' : 'text-rose-500')}>
                                    {r.hire_date ?? 'Not set'}
                                  </span>
                                  <button
                                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                                    onClick={() => setEditingHireDate(prev => ({ ...prev, [r.id]: r.hire_date ?? '' }))}
                                    data-testid={`button-edit-hire-date-${r.id}`}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                </div>
                              )}
                            </td>

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
                                <Badge variant="outline" className="text-[10px] text-rose-600 border-rose-300 gap-1">
                                  <AlertTriangle className="h-3 w-3" />No date
                                </Badge>
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
                <div className="px-4 py-2 text-[10px] text-muted-foreground border-t">
                  Hover the hire date cell to edit it inline. Changes save directly to staff profiles.
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ACCRUALS HISTORY TAB */}
        <TabsContent value="accruals" className="mt-4 space-y-4">
          {accrualsLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !accruals || accruals.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm space-y-2">
              <BookOpen className="h-8 w-8 mx-auto opacity-30" />
              <p>No accrual records yet.</p>
              <p className="text-xs">Use "Post Monthly Provision" above to create the first GL-posted accrual entries.</p>
            </div>
          ) : (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  GL-Posted EOSB Accruals
                  <Badge variant="outline" className="text-[10px]">{accruals.length} records</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">Staff Member</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground w-24">Period</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground w-28">Opening Bal</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground w-28">Accrued</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground w-28">Closing Bal</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground w-20">Currency</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground w-24">GL Status</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground w-36">Posted At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accruals.map((a, i) => (
                        <tr key={a.id} className={cn('border-b hover:bg-muted/20', i % 2 !== 0 && 'bg-muted/10')} data-testid={`row-accrual-${a.id}`}>
                          <td className="px-4 py-2.5 font-medium">{profNameMap[a.user_id] ?? a.user_id.slice(0, 8)}</td>
                          <td className="px-4 py-2.5 font-mono text-muted-foreground">{a.period}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{a.opening_balance.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-teal-700 dark:text-teal-400">
                            +{a.accrued_amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{a.closing_balance.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{a.currency}</td>
                          <td className="px-4 py-2.5">
                            {a.gl_status === 'success' ? (
                              <Badge variant="outline" className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-300 gap-1">
                                <CheckCircle2 className="h-3 w-3" />GL Posted
                              </Badge>
                            ) : a.gl_status === 'error' ? (
                              <Badge variant="outline" className="text-[10px] bg-rose-100 text-rose-700 border-rose-300 gap-1">
                                <XCircle className="h-3 w-3" />GL Error
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-slate-500">Pending</Badge>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                            {format(parseISO(a.created_at), 'dd MMM yyyy HH:mm')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2 text-[10px] text-muted-foreground border-t">
                  Each row = one DR: EOSB Expense (6200) / CR: EOSB Provision Liability (2350) journal entry posted automatically by the GL Bridge Engine.
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
