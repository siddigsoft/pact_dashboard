import { useState, useMemo } from 'react';
import {
  format, startOfMonth, endOfMonth, subMonths, parseISO, isValid, isWithinInterval,
} from 'date-fns';
import {
  Wallet, TrendingUp, CheckCircle2, Clock, ChevronLeft, ChevronRight,
  Award, Banknote, BarChart2, AlertCircle, ListChecks,
  Download, Search, X, CalendarRange, Tag, ArrowUpDown, Loader2,
  Briefcase, TrendingDown, Building2, UserCheck, ShieldCheck,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';
import { ConnectedPagesBar } from '@/components/ui/connected-pages-bar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie,
} from 'recharts';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────
interface PersonalTask {
  id: string; title: string; status: string; completed_at: string | null;
  completion_reward_amount: number | null; completion_reward_currency: string | null;
  due_date: string | null; priority: string | null; category: string | null;
}
interface WalletTx {
  id: string; amount: number; currency: string; tx_type: string;
  description: string | null; created_at: string; status: string | null;
}
interface WalletRow {
  id: string; balances: Record<string, number>; total_earned: number | null;
}
interface SalaryLineItem { name: string; amount: number; type: 'fixed' | 'percent'; }
interface SalaryConfig {
  id: string; user_id: string; base_salary: number; currency: string;
  allowances: SalaryLineItem[]; deductions: SalaryLineItem[];
  effective_date: string; notes: string | null;
}
interface EmploymentRecord {
  full_name: string | null; role: string | null; email: string | null;
  employment_type: string | null; contract_start_date: string | null;
  contract_end_date: string | null; department_name: string | null;
  manager_name: string | null;
}

// ── Constants ────────────────────────────────────────────────────────────────
const CURRENCY_SYMBOL: Record<string, string> = { USD: '$', SDG: 'SDG', EUR: '€', GBP: '£' };
const sym = (c: string) => CURRENCY_SYMBOL[c] ?? c;
const fmtAmt = (n: number, c = 'SDG') =>
  `${sym(c)} ${(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const TX_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  earning:    { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  withdrawal: { bg: 'bg-violet-50',  text: 'text-violet-700',  dot: 'bg-violet-500'  },
  adjustment: { bg: 'bg-slate-50',   text: 'text-slate-600',   dot: 'bg-slate-400'   },
  completed:  { bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500'    },
  pending:    { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400'   },
  failed:     { bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-500'     },
};

const PIE_COLORS  = ['#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#ec4899','#14b8a6','#a855f7'];
const BAR_PALETTE = ['#6366f1','#818cf8','#3b82f6','#06b6d4','#10b981','#f59e0b','#f97316','#ec4899','#8b5cf6','#14b8a6','#84cc16','#a855f7'];

function downloadCSV(rows: string[][], filename: string) {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: filename });
  a.click(); URL.revokeObjectURL(a.href);
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Payroll({ embedded = false }: { embedded?: boolean }) {
  const { currentUser } = useUser();
  const userId = currentUser?.id;

  const [monthOffset,  setMonthOffset]  = useState(0);
  const [txSearch,     setTxSearch]     = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState('all');

  const periodStart = startOfMonth(subMonths(new Date(), -monthOffset));
  const periodEnd   = endOfMonth(subMonths(new Date(), -monthOffset));
  const periodLabel = format(periodStart, 'MMMM yyyy');

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: wallet, isLoading: loadingWallet } = useQuery<WalletRow | null>({
    queryKey: ['payroll-wallet', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from('wallets').select('id, balances, total_earned').eq('user_id', userId!).maybeSingle();
      return data as WalletRow | null;
    },
  });

  const { data: transactions = [], isLoading: loadingTx } = useQuery<WalletTx[]>({
    queryKey: ['payroll-transactions', userId, wallet?.id],
    enabled: !!wallet?.id,
    queryFn: async () => {
      const { data } = await supabase.from('wallet_transactions').select('id, amount, currency, tx_type, description, created_at, status').eq('wallet_id', wallet!.id).order('created_at', { ascending: false }).limit(500);
      return (data ?? []) as WalletTx[];
    },
  });

  const { data: tasks = [], isLoading: loadingTasks } = useQuery<PersonalTask[]>({
    queryKey: ['payroll-tasks', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from('personal_tasks').select('id, title, status, completed_at, completion_reward_amount, completion_reward_currency, due_date, priority, category').eq('assigned_to', userId!).eq('status', 'completed').not('completion_reward_amount', 'is', null).order('completed_at', { ascending: false }).limit(500);
      return (data ?? []) as PersonalTask[];
    },
  });

  const { data: salaryConfig, isLoading: loadingSalary } = useQuery<SalaryConfig | null>({
    queryKey: ['payroll-salary-config', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from('employee_salary_config').select('*').eq('user_id', userId!).maybeSingle();
      if (!data) return null;
      return { ...data, allowances: Array.isArray(data.allowances) ? data.allowances : [], deductions: Array.isArray(data.deductions) ? data.deductions : [] } as SalaryConfig;
    },
  });

  const { data: employmentRecord, isLoading: loadingEmp } = useQuery<EmploymentRecord | null>({
    queryKey: ['payroll-employment-record', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: prof } = await supabase.from('profiles').select('full_name, role, email, employment_type, contract_start_date, contract_end_date, department_id, reports_to').eq('id', userId!).maybeSingle();
      if (!prof) return null;
      let dept_name: string | null = null;
      let mgr_name: string | null = null;
      if (prof.department_id) {
        const { data: dept } = await supabase.from('departments').select('name').eq('id', prof.department_id).maybeSingle();
        dept_name = dept?.name ?? null;
      }
      if (prof.reports_to) {
        const { data: mgr } = await supabase.from('profiles').select('full_name').eq('id', prof.reports_to).maybeSingle();
        mgr_name = (mgr as any)?.full_name ?? null;
      }
      return { full_name: prof.full_name, role: prof.role, email: prof.email, employment_type: prof.employment_type, contract_start_date: prof.contract_start_date, contract_end_date: prof.contract_end_date, department_name: dept_name, manager_name: mgr_name } as EmploymentRecord;
    },
  });

  // ── Derived ──────────────────────────────────────────────────────────────
  const inPeriod = (d: string | null) => {
    if (!d) return false;
    const dt = parseISO(d);
    return isValid(dt) && isWithinInterval(dt, { start: periodStart, end: periodEnd });
  };

  const periodTasks     = useMemo(() => tasks.filter(t => inPeriod(t.completed_at)), [tasks, periodStart, periodEnd]);
  const periodTx        = useMemo(() => transactions.filter(t => inPeriod(t.created_at)), [transactions, periodStart, periodEnd]);
  const periodEarnings  = useMemo(() => periodTasks.reduce((s, t) => s + (t.completion_reward_amount ?? 0), 0), [periodTasks]);
  const walletBalance   = useMemo(() => Object.values(wallet?.balances ?? {}).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0), [wallet]);
  const totalEarned     = wallet?.total_earned ?? 0;

  const chartData = useMemo(() => Array.from({ length: 6 }, (_, i) => {
    const mo = subMonths(new Date(), 5 - i);
    const s = startOfMonth(mo); const e = endOfMonth(mo);
    return { month: format(mo, 'MMM yy'), earned: tasks.filter(t => inPeriod2(t.completed_at, s, e)).reduce((sum, t) => sum + (t.completion_reward_amount ?? 0), 0) };
  }), [tasks]);

  const annualRows = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const mo = subMonths(new Date(), 11 - i);
    const s = startOfMonth(mo); const e = endOfMonth(mo);
    const mTasks = tasks.filter(t => inPeriod2(t.completed_at, s, e));
    const mTx    = transactions.filter(t => inPeriod2(t.created_at, s, e));
    return {
      label: format(mo, 'MMM yyyy'), isCurrentMonth: i === 11,
      taskCount: mTasks.length,
      taskEarned: mTasks.reduce((sum, t) => sum + (t.completion_reward_amount ?? 0), 0),
      withdrawn:  mTx.filter(t => t.tx_type === 'withdrawal').reduce((sum, t) => sum + Math.abs(t.amount), 0),
    };
  }), [tasks, transactions]);

  const annualTotal = useMemo(() => annualRows.reduce((s, r) => ({ taskEarned: s.taskEarned + r.taskEarned, taskCount: s.taskCount + r.taskCount, withdrawn: s.withdrawn + r.withdrawn }), { taskEarned: 0, taskCount: 0, withdrawn: 0 }), [annualRows]);

  const categoryData = useMemo(() => {
    const m: Record<string, { count: number; total: number }> = {};
    tasks.forEach(t => { const k = t.category || 'Uncategorized'; if (!m[k]) m[k] = { count: 0, total: 0 }; m[k].count++; m[k].total += t.completion_reward_amount ?? 0; });
    return Object.entries(m).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total);
  }, [tasks]);

  const txTypes = useMemo(() => Array.from(new Set(transactions.map(t => t.tx_type))), [transactions]);
  const filteredAllTx = useMemo(() => {
    let list = transactions;
    if (txTypeFilter !== 'all') list = list.filter(t => t.tx_type === txTypeFilter);
    if (txSearch.trim()) { const q = txSearch.toLowerCase(); list = list.filter(t => (t.description ?? '').toLowerCase().includes(q) || t.tx_type.toLowerCase().includes(q)); }
    return list;
  }, [transactions, txTypeFilter, txSearch]);

  // Salary calculation
  const salaryCalc = useMemo(() => {
    if (!salaryConfig) return null;
    const base = salaryConfig.base_salary;
    const allowances = salaryConfig.allowances.map(a => ({
      ...a,
      computed: a.type === 'fixed' ? a.amount : base * a.amount / 100,
    }));
    const allowTotal = allowances.reduce((s, a) => s + a.computed, 0);
    const gross = base + allowTotal;
    const deductions = salaryConfig.deductions.map(d => ({
      ...d,
      computed: d.type === 'fixed' ? d.amount : gross * d.amount / 100,
    }));
    const dedTotal = deductions.reduce((s, d) => s + d.computed, 0);
    const net = Math.max(0, gross - dedTotal);
    return { base, allowances, allowTotal, gross, deductions, dedTotal, net, currency: salaryConfig.currency };
  }, [salaryConfig]);

  const isLoading = loadingWallet || loadingTx || loadingTasks;

  const exportPeriodTasks = () => downloadCSV([
    ['Task', 'Category', 'Priority', 'Completed', 'Reward (SDG)'],
    ...periodTasks.map(t => [t.title, t.category ?? '', t.priority ?? '', t.completed_at ? format(parseISO(t.completed_at), 'dd MMM yyyy') : '', String(t.completion_reward_amount ?? 0)]),
    ['', '', '', 'TOTAL', String(periodEarnings)],
  ], `payroll-tasks-${format(periodStart, 'yyyy-MM')}.csv`);

  const exportAnnualReport = () => downloadCSV([
    ['Month', 'Tasks', 'Task Rewards (SDG)', 'Withdrawals (SDG)', 'Net'],
    ...annualRows.map(r => [r.label, String(r.taskCount), String(r.taskEarned), String(r.withdrawn), String(r.taskEarned - r.withdrawn)]),
    ['TOTAL', String(annualTotal.taskCount), String(annualTotal.taskEarned), String(annualTotal.withdrawn), String(annualTotal.taskEarned - annualTotal.withdrawn)],
  ], `payroll-annual-${format(new Date(), 'yyyy')}.csv`);

  const exportAllTx = () => downloadCSV([
    ['Date', 'Type', 'Description', 'Amount', 'Currency', 'Status'],
    ...filteredAllTx.map(t => [format(parseISO(t.created_at), 'dd MMM yyyy HH:mm'), t.tx_type, t.description ?? '', String(t.amount), t.currency, t.status ?? '']),
  ], `payroll-transactions-${format(new Date(), 'yyyy-MM')}.csv`);

  // ── Layout ───────────────────────────────────────────────────────────────
  return (
    <div className={cn('min-h-screen bg-[#f5f7fa] dark:bg-[#0d1117]', embedded && 'min-h-0')}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 space-y-5">

        {!embedded && <ConnectedPagesBar exclude="hr" />}

        {/* Page header */}
        {!embedded && (
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2"><Banknote className="h-6 w-6 text-amber-500" />My Payroll</h1>
              <p className="text-sm text-muted-foreground mt-0.5">{currentUser?.name ?? 'Employee'} · Earnings, rewards &amp; reports</p>
            </div>
          </div>
        )}

        {/* Summary KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard icon={<Wallet className="h-5 w-5" />} label="Wallet Balance" value={isLoading ? '…' : walletBalance > 0 ? fmtAmt(walletBalance) : '—'} sub="Available" color="indigo" />
          <KpiCard icon={<TrendingUp className="h-5 w-5" />} label={`${periodLabel} Rewards`} value={isLoading ? '…' : periodEarnings > 0 ? fmtAmt(periodEarnings) : '—'} sub={`${periodTasks.length} task${periodTasks.length !== 1 ? 's' : ''}`} color="emerald" />
          <KpiCard icon={<Award className="h-5 w-5" />} label="All-Time Earned" value={isLoading ? '…' : totalEarned > 0 ? fmtAmt(totalEarned) : '—'} sub="Total rewards" color="amber" />
          <KpiCard icon={<CheckCircle2 className="h-5 w-5" />} label="Rewarded Tasks" value={isLoading ? '…' : String(tasks.length)} sub="All time" color="blue" />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="salary">
          <TabsList className="w-full sm:w-auto h-10 bg-white dark:bg-slate-900 border shadow-sm rounded-xl p-1 flex-wrap gap-0">
            <TabsTrigger value="salary"        className="text-xs rounded-lg gap-1.5 data-[state=active]:bg-[#0F2041] data-[state=active]:text-white"><Briefcase className="h-3.5 w-3.5" />My Salary</TabsTrigger>
            <TabsTrigger value="overview"      className="text-xs rounded-lg gap-1.5 data-[state=active]:bg-[#0F2041] data-[state=active]:text-white"><BarChart2 className="h-3.5 w-3.5" />Task Rewards</TabsTrigger>
            <TabsTrigger value="annual"        className="text-xs rounded-lg gap-1.5 data-[state=active]:bg-[#0F2041] data-[state=active]:text-white"><CalendarRange className="h-3.5 w-3.5" />Annual</TabsTrigger>
            <TabsTrigger value="category"      className="text-xs rounded-lg gap-1.5 data-[state=active]:bg-[#0F2041] data-[state=active]:text-white"><Tag className="h-3.5 w-3.5" />By Category</TabsTrigger>
            <TabsTrigger value="transactions"  className="text-xs rounded-lg gap-1.5 data-[state=active]:bg-[#0F2041] data-[state=active]:text-white"><ArrowUpDown className="h-3.5 w-3.5" />Transactions</TabsTrigger>
          </TabsList>

          {/* ── MY SALARY ── */}
          <TabsContent value="salary" className="mt-4 space-y-4">
            <MySalaryTab
              salaryCalc={salaryCalc}
              salaryConfig={salaryConfig ?? null}
              employmentRecord={employmentRecord ?? null}
              loading={loadingSalary || loadingEmp}
            />
          </TabsContent>

          {/* ── OVERVIEW ── */}
          <TabsContent value="overview" className="mt-4 space-y-4">
            {/* Period row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground font-medium">Period:</span>
              <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border rounded-xl px-2 py-1 shadow-sm">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMonthOffset(o => o - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                <span className="text-sm font-semibold min-w-[130px] text-center">{periodLabel}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMonthOffset(o => o + 1)} disabled={monthOffset >= 0}><ChevronRight className="h-4 w-4" /></Button>
              </div>
              {monthOffset !== 0 && <Button variant="ghost" size="sm" onClick={() => setMonthOffset(0)}>This month</Button>}
              <Button variant="outline" size="sm" className="ml-auto gap-1.5 bg-white dark:bg-slate-900 shadow-sm" onClick={exportPeriodTasks}><Download className="h-3.5 w-3.5" />Export CSV</Button>
            </div>

            {/* Chart + breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="md:col-span-2 shadow-sm border-0 bg-white dark:bg-slate-900">
                <CardHeader className="pb-1 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold text-muted-foreground">Earnings — Last 6 Months</CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  {isLoading ? <ChartSkeleton /> : (
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f5" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip formatter={(v: number) => [fmtAmt(v), 'Earned']} contentStyle={{ fontSize: 12, borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,.1)' }} />
                        <Bar dataKey="earned" radius={[6, 6, 0, 0]}>
                          {chartData.map((_, i) => <Cell key={i} fill={BAR_PALETTE[i]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-sm border-0 bg-white dark:bg-slate-900">
                <CardHeader className="pb-1 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold text-muted-foreground">{periodLabel} Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-4">
                  {isLoading ? <div className="space-y-2">{Array(3).fill(0).map((_, i) => <div key={i} className="h-8 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />)}</div>
                  : periodTasks.length === 0 && periodTx.length === 0
                  ? <p className="text-sm text-muted-foreground italic py-4 text-center">No activity this period.</p>
                  : (
                    <div className="space-y-2 mt-1">
                      {periodTx.length > 0 && Object.entries(periodTx.reduce((m, t) => ({ ...m, [t.tx_type]: (m[t.tx_type] ?? 0) + t.amount }), {} as Record<string, number>)).map(([type, amt]) => (
                        <div key={type} className="flex items-center justify-between text-sm">
                          <span className="text-xs text-muted-foreground capitalize">{type.replace(/_/g, ' ')}</span>
                          <span className="font-semibold">{fmtAmt(amt)}</span>
                        </div>
                      ))}
                      {periodEarnings > 0 && (
                        <div className="pt-2 mt-1 border-t flex items-center justify-between font-bold text-sm">
                          <span className="text-muted-foreground">Task Rewards</span>
                          <span className="text-emerald-600">{fmtAmt(periodEarnings)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Tasks table */}
            <SectionCard title={`Completed Rewarded Tasks — ${periodLabel}`} icon={<ListChecks className="h-4 w-4 text-blue-500" />}>
              {isLoading ? <TableSkeleton /> : periodTasks.length === 0 ? <Empty msg="No rewarded tasks completed this period." /> : <TaskTable tasks={periodTasks} total={periodEarnings} />}
            </SectionCard>

            {/* Transactions list */}
            <SectionCard title={`Wallet Transactions — ${periodLabel}`} icon={<Clock className="h-4 w-4 text-violet-500" />}>
              {isLoading ? <TableSkeleton /> : periodTx.length === 0 ? <Empty msg="No transactions this period." /> : <TxList txs={periodTx} />}
            </SectionCard>
          </TabsContent>

          {/* ── ANNUAL REPORT ── */}
          <TabsContent value="annual" className="mt-4 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">12-Month Earnings Report</h2>
              <Button variant="outline" size="sm" className="gap-1.5 bg-white dark:bg-slate-900 shadow-sm" onClick={exportAnnualReport}><Download className="h-3.5 w-3.5" />Export CSV</Button>
            </div>

            <Card className="shadow-sm border-0 bg-white dark:bg-slate-900">
              <CardContent className="pt-4 px-2 pb-4">
                {isLoading ? <ChartSkeleton h={200} /> : (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={annualRows} margin={{ top: 4, right: 8, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f5" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={36} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(v: number) => [fmtAmt(v), 'Task Rewards']} contentStyle={{ fontSize: 12, borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,.1)' }} />
                      <Bar dataKey="taskEarned" name="Task Rewards" radius={[5, 5, 0, 0]}>
                        {annualRows.map((_, i) => <Cell key={i} fill={BAR_PALETTE[i % BAR_PALETTE.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm border-0 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/60 border-b">
                      {['Month', 'Tasks', 'Task Rewards', 'Withdrawals', 'Net'].map((h, i) => (
                        <th key={h} className={cn('text-xs font-semibold text-muted-foreground uppercase tracking-wide py-3 px-5', i > 0 && 'text-right')}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {annualRows.map((r, i) => {
                      const net = r.taskEarned - r.withdrawn;
                      return (
                        <tr key={r.label} className={cn('border-b last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors', r.isCurrentMonth && 'bg-blue-50/60 dark:bg-blue-950/20')}>
                          <td className="px-5 py-3 font-medium">{r.label} {r.isCurrentMonth && <Badge variant="outline" className="ml-1 text-[9px] bg-blue-100 text-blue-700 border-blue-200 py-0">Current</Badge>}</td>
                          <td className="px-5 py-3 text-right text-muted-foreground">{r.taskCount}</td>
                          <td className="px-5 py-3 text-right font-semibold text-emerald-600">{r.taskEarned > 0 ? fmtAmt(r.taskEarned) : '—'}</td>
                          <td className="px-5 py-3 text-right text-red-500">{r.withdrawn > 0 ? fmtAmt(r.withdrawn) : '—'}</td>
                          <td className={cn('px-5 py-3 text-right font-bold', net > 0 ? 'text-blue-600' : net < 0 ? 'text-red-500' : 'text-muted-foreground')}>{net !== 0 ? fmtAmt(net) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 bg-slate-50 dark:bg-slate-800/60">
                      <td className="px-5 py-3 font-bold text-sm">Total (12 months)</td>
                      <td className="px-5 py-3 text-right font-bold text-muted-foreground">{annualTotal.taskCount}</td>
                      <td className="px-5 py-3 text-right font-bold text-emerald-600">{fmtAmt(annualTotal.taskEarned)}</td>
                      <td className="px-5 py-3 text-right font-bold text-red-500">{fmtAmt(annualTotal.withdrawn)}</td>
                      <td className="px-5 py-3 text-right font-bold text-blue-600">{fmtAmt(annualTotal.taskEarned - annualTotal.withdrawn)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* ── BY CATEGORY ── */}
          <TabsContent value="category" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="shadow-sm border-0 bg-white dark:bg-slate-900">
                <CardHeader className="pb-1 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold text-muted-foreground">Distribution by Category</CardTitle>
                </CardHeader>
                <CardContent className="pb-4">
                  {isLoading ? <ChartSkeleton h={200} /> : categoryData.length === 0 ? <Empty msg="No category data." /> : (
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={categoryData} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40} paddingAngle={2}>
                          {categoryData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => [fmtAmt(v), 'Earned']} contentStyle={{ fontSize: 12, borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,.1)' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-sm border-0 bg-white dark:bg-slate-900">
                <CardHeader className="pb-1 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold text-muted-foreground">Earnings by Category</CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-4">
                  {isLoading ? <TableSkeleton /> : categoryData.length === 0 ? <Empty msg="No data." /> : (
                    <div className="space-y-3 mt-1">
                      {categoryData.map((cat, i) => {
                        const pct = tasks.length > 0 ? (cat.count / tasks.length) * 100 : 0;
                        return (
                          <div key={cat.name}>
                            <div className="flex items-center justify-between text-sm mb-1">
                              <span className="font-medium flex items-center gap-1.5 text-sm">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                                {cat.name}
                              </span>
                              <span className="text-xs text-muted-foreground">{cat.count} · <span className="font-semibold text-emerald-600">{fmtAmt(cat.total)}</span></span>
                            </div>
                            <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                            </div>
                          </div>
                        );
                      })}
                      <div className="pt-2 border-t flex items-center justify-between text-sm font-bold">
                        <span>Total</span>
                        <span className="text-emerald-600">{fmtAmt(tasks.reduce((s, t) => s + (t.completion_reward_amount ?? 0), 0))}</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <SectionCard title="All Rewarded Tasks (All Time)" icon={<ListChecks className="h-4 w-4 text-indigo-500" />}>
              {isLoading ? <TableSkeleton /> : tasks.length === 0 ? <Empty msg="No rewarded tasks." /> : <TaskTable tasks={tasks} total={tasks.reduce((s, t) => s + (t.completion_reward_amount ?? 0), 0)} />}
            </SectionCard>
          </TabsContent>

          {/* ── ALL TRANSACTIONS ── */}
          <TabsContent value="transactions" className="mt-4 space-y-4">
            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-3">
              <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Total Credits"      value={isLoading ? '…' : fmtAmt(transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0))} sub="" color="emerald" />
              <KpiCard icon={<Banknote className="h-4 w-4" />}  label="Total Debits"       value={isLoading ? '…' : fmtAmt(transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0))} sub="" color="red" />
              <KpiCard icon={<ArrowUpDown className="h-4 w-4" />} label="Transactions"    value={isLoading ? '…' : String(transactions.length)} sub="" color="indigo" />
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search transactions…" value={txSearch} onChange={e => setTxSearch(e.target.value)} className="pl-9 h-9 text-sm bg-white dark:bg-slate-900 shadow-sm" />
                {txSearch && <button onClick={() => setTxSearch('')} className="absolute right-3 top-2.5"><X className="h-4 w-4 text-muted-foreground hover:text-foreground" /></button>}
              </div>
              <select
                value={txTypeFilter}
                onChange={e => setTxTypeFilter(e.target.value)}
                className="h-9 rounded-lg border border-input bg-white dark:bg-slate-900 px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">All types</option>
                {txTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
              <Button variant="outline" size="sm" className="gap-1.5 bg-white dark:bg-slate-900 shadow-sm" onClick={exportAllTx}><Download className="h-3.5 w-3.5" />Export</Button>
            </div>

            <Card className="shadow-sm border-0 bg-white dark:bg-slate-900 overflow-hidden">
              {isLoading ? <TableSkeleton /> : filteredAllTx.length === 0 ? <div className="p-6"><Empty msg="No transactions found." /></div> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/60 border-b">
                        <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide px-5 py-3">Date</th>
                        <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 py-3">Type</th>
                        <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 py-3">Description</th>
                        <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 py-3">Status</th>
                        <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide px-5 py-3">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAllTx.map(tx => {
                        const style = TX_STYLE[tx.tx_type] ?? TX_STYLE.adjustment;
                        return (
                          <tr key={tx.id} className="border-b last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                            <td className="px-5 py-3.5 whitespace-nowrap">
                              <p className="text-sm font-medium">{format(parseISO(tx.created_at), 'dd MMM yyyy')}</p>
                              <p className="text-[11px] text-muted-foreground">{format(parseISO(tx.created_at), 'HH:mm')}</p>
                            </td>
                            <td className="px-3 py-3.5">
                              <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize', style.bg, style.text)}>
                                <span className={cn('w-1.5 h-1.5 rounded-full', style.dot)} />
                                {tx.tx_type.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="px-3 py-3.5 max-w-[200px] truncate text-sm text-muted-foreground">{tx.description ?? '—'}</td>
                            <td className="px-3 py-3.5">
                              {tx.status && <span className="text-[11px] font-medium text-muted-foreground capitalize">{tx.status}</span>}
                            </td>
                            <td className={cn('px-5 py-3.5 text-right font-bold whitespace-nowrap', tx.amount >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                              {tx.amount >= 0 ? '+' : ''}{fmtAmt(tx.amount, tx.currency)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="px-5 py-2.5 border-t bg-slate-50 dark:bg-slate-800/40 text-right">
                    <span className="text-xs text-muted-foreground">{filteredAllTx.length} transaction{filteredAllTx.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MY SALARY TAB
// ══════════════════════════════════════════════════════════════════════════════
function MySalaryTab({
  salaryCalc, salaryConfig, employmentRecord, loading,
}: {
  salaryCalc: { base: number; allowances: (SalaryLineItem & { computed: number })[]; allowTotal: number; gross: number; deductions: (SalaryLineItem & { computed: number })[]; dedTotal: number; net: number; currency: string } | null;
  salaryConfig: SalaryConfig | null;
  employmentRecord: EmploymentRecord | null;
  loading: boolean;
}) {
  if (loading) return (
    <div className="space-y-4">
      {Array(3).fill(0).map((_, i) => <div key={i} className="h-32 rounded-2xl bg-white border animate-pulse" />)}
    </div>
  );

  const fmt = (n: number, c = 'SDG') => `${c} ${(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-4">

      {/* Employment Record card */}
      {employmentRecord && (
        <Card className="shadow-sm border-0 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 pt-4 pb-3 border-b flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-indigo-500" />
            <h3 className="text-sm font-semibold">Employment Record</h3>
          </div>
          <CardContent className="pt-4 pb-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <EmpField icon={<UserCheck className="h-3.5 w-3.5 text-blue-500" />}  label="Employment Type" value={employmentRecord.employment_type?.replace(/_/g, ' ') ?? '—'} capitalize />
              <EmpField icon={<Building2 className="h-3.5 w-3.5 text-violet-500" />} label="Department"       value={employmentRecord.department_name ?? '—'} />
              <EmpField icon={<CalendarRange className="h-3.5 w-3.5 text-emerald-500" />} label="Contract Start" value={employmentRecord.contract_start_date ? format(parseISO(employmentRecord.contract_start_date), 'dd MMM yyyy') : '—'} />
              <EmpField icon={<CalendarRange className="h-3.5 w-3.5 text-rose-500" />}    label="Contract End"   value={employmentRecord.contract_end_date   ? format(parseISO(employmentRecord.contract_end_date),   'dd MMM yyyy') : 'Open-ended'} />
              {employmentRecord.manager_name && (
                <EmpField icon={<ShieldCheck className="h-3.5 w-3.5 text-amber-500" />} label="Reports To" value={employmentRecord.manager_name} />
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* No salary configured */}
      {!salaryCalc && (
        <Card className="shadow-sm border-0 bg-white dark:bg-slate-900">
          <CardContent className="py-16 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto">
              <AlertCircle className="h-7 w-7 text-amber-400" />
            </div>
            <p className="text-sm font-semibold text-foreground">No salary configuration yet</p>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">Your salary package has not been set up. Please contact your administrator or HR team.</p>
          </CardContent>
        </Card>
      )}

      {/* Full salary breakdown */}
      {salaryCalc && salaryConfig && (
        <>
          {/* Net pay hero */}
          <div
            className="rounded-2xl p-6 text-white relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #0F2041 0%, #1D3461 100%)' }}
          >
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, rgba(255,255,255,0.3) 0%, transparent 60%)' }} />
            <div className="relative z-10 flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="text-blue-200/80 text-xs font-medium uppercase tracking-wide mb-1">Monthly Net Pay</p>
                <p className="text-4xl font-bold tracking-tight">{fmt(salaryCalc.net, salaryCalc.currency)}</p>
                <p className="text-blue-200/70 text-xs mt-2">
                  Effective from {salaryConfig.effective_date ? format(parseISO(salaryConfig.effective_date), 'dd MMM yyyy') : '—'}
                </p>
              </div>
              <div className="space-y-1.5 text-right">
                <div><span className="text-blue-200/70 text-xs">Gross:</span> <span className="text-sm font-semibold ml-2">{fmt(salaryCalc.gross, salaryCalc.currency)}</span></div>
                <div><span className="text-blue-200/70 text-xs">Deductions:</span> <span className="text-sm font-semibold text-red-300 ml-2">−{fmt(salaryCalc.dedTotal, salaryCalc.currency)}</span></div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Earnings breakdown */}
            <Card className="shadow-sm border-0 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="px-5 pt-4 pb-3 border-b flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                <h3 className="text-sm font-semibold">Earnings Breakdown</h3>
              </div>
              <CardContent className="p-0">
                <div className="divide-y">
                  {/* Base salary row */}
                  <div className="flex items-center justify-between px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2 h-2 rounded-full bg-[#0F2041]" />
                      <span className="text-sm font-semibold">Base Salary</span>
                    </div>
                    <span className="text-sm font-bold">{fmt(salaryCalc.base, salaryCalc.currency)}</span>
                  </div>
                  {/* Allowances */}
                  {salaryCalc.allowances.map((a, i) => (
                    <div key={i} className="flex items-center justify-between px-5 py-3 bg-emerald-50/50 dark:bg-emerald-950/10">
                      <div className="flex items-center gap-2.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        <div>
                          <span className="text-sm">{a.name}</span>
                          <span className="ml-2 text-[11px] text-muted-foreground">({a.type === 'percent' ? `${a.amount}% of base` : 'Fixed'})</span>
                        </div>
                      </div>
                      <span className="text-sm font-medium text-emerald-600">+{fmt(a.computed, salaryCalc.currency)}</span>
                    </div>
                  ))}
                  {salaryCalc.allowances.length === 0 && (
                    <p className="px-5 py-3 text-xs text-muted-foreground italic">No allowances configured</p>
                  )}
                  {/* Gross total */}
                  <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50 dark:bg-slate-800/40">
                    <span className="text-sm font-bold">Gross Salary</span>
                    <span className="text-sm font-bold text-[#0F2041] dark:text-blue-300">{fmt(salaryCalc.gross, salaryCalc.currency)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Deductions breakdown */}
            <Card className="shadow-sm border-0 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="px-5 pt-4 pb-3 border-b flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-500" />
                <h3 className="text-sm font-semibold">Deductions</h3>
              </div>
              <CardContent className="p-0">
                <div className="divide-y">
                  {salaryCalc.deductions.length === 0 && (
                    <p className="px-5 py-6 text-xs text-muted-foreground italic">No deductions configured</p>
                  )}
                  {salaryCalc.deductions.map((d, i) => (
                    <div key={i} className="flex items-center justify-between px-5 py-3 bg-red-50/50 dark:bg-red-950/10">
                      <div className="flex items-center gap-2.5">
                        <span className="w-2 h-2 rounded-full bg-red-400" />
                        <div>
                          <span className="text-sm">{d.name}</span>
                          <span className="ml-2 text-[11px] text-muted-foreground">({d.type === 'percent' ? `${d.amount}% of gross` : 'Fixed'})</span>
                        </div>
                      </div>
                      <span className="text-sm font-medium text-red-600">−{fmt(d.computed, salaryCalc.currency)}</span>
                    </div>
                  ))}
                  {salaryCalc.deductions.length > 0 && (
                    <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50 dark:bg-slate-800/40">
                      <span className="text-sm font-bold">Total Deductions</span>
                      <span className="text-sm font-bold text-red-500">−{fmt(salaryCalc.dedTotal, salaryCalc.currency)}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Net pay summary bar */}
          <Card className="shadow-sm border-0 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="grid grid-cols-3 divide-x">
              <div className="py-4 px-5 text-center">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1">Gross Salary</p>
                <p className="text-lg font-bold text-[#0F2041] dark:text-blue-300">{fmt(salaryCalc.gross, salaryCalc.currency)}</p>
              </div>
              <div className="py-4 px-5 text-center">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1">Total Deductions</p>
                <p className="text-lg font-bold text-red-500">−{fmt(salaryCalc.dedTotal, salaryCalc.currency)}</p>
              </div>
              <div className="py-4 px-5 text-center bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/20">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1">Net Pay</p>
                <p className="text-lg font-bold text-blue-600">{fmt(salaryCalc.net, salaryCalc.currency)}</p>
              </div>
            </div>
          </Card>

          {salaryConfig.notes && (
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 text-sm text-amber-800 dark:text-amber-200">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
              <p><strong>Note:</strong> {salaryConfig.notes}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EmpField({ icon, label, value, capitalize }: { icon: React.ReactNode; label: string; value: string; capitalize?: boolean }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium uppercase tracking-wide">{icon}{label}</div>
      <p className={cn('text-sm font-semibold', capitalize && 'capitalize')}>{value}</p>
    </div>
  );
}

// ── Helper: period check ──────────────────────────────────────────────────────
function inPeriod2(d: string | null, s: Date, e: Date) {
  if (!d) return false;
  try { const dt = parseISO(d); return isValid(dt) && isWithinInterval(dt, { start: s, end: e }); } catch { return false; }
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub: string; color: 'indigo' | 'emerald' | 'amber' | 'blue' | 'red' }) {
  const styles: Record<string, string> = {
    indigo:  'from-indigo-50 to-white dark:from-indigo-950/40 dark:to-slate-900 border-indigo-100 dark:border-indigo-800/40 [&_svg]:text-indigo-500',
    emerald: 'from-emerald-50 to-white dark:from-emerald-950/40 dark:to-slate-900 border-emerald-100 dark:border-emerald-800/40 [&_svg]:text-emerald-500',
    amber:   'from-amber-50 to-white dark:from-amber-950/40 dark:to-slate-900 border-amber-100 dark:border-amber-800/40 [&_svg]:text-amber-500',
    blue:    'from-blue-50 to-white dark:from-blue-950/40 dark:to-slate-900 border-blue-100 dark:border-blue-800/40 [&_svg]:text-blue-500',
    red:     'from-red-50 to-white dark:from-red-950/40 dark:to-slate-900 border-red-100 dark:border-red-800/40 [&_svg]:text-red-500',
  };
  return (
    <div className={cn('rounded-2xl border bg-gradient-to-br p-4 shadow-sm', styles[color])}>
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-xs font-medium text-muted-foreground">{label}</span></div>
      <p className="text-xl font-bold leading-tight">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Section Card ──────────────────────────────────────────────────────────────
function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="shadow-sm border-0 bg-white dark:bg-slate-900 overflow-hidden">
      <CardHeader className="pb-0 pt-4 px-5 border-b">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 pb-3">{icon}{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  );
}

// ── Task Table ────────────────────────────────────────────────────────────────
function TaskTable({ tasks, total }: { tasks: PersonalTask[]; total: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-slate-50 dark:bg-slate-800/40">
            {['Task', 'Category', 'Priority', 'Completed', 'Reward'].map((h, i) => (
              <th key={h} className={cn('text-xs font-semibold text-muted-foreground uppercase tracking-wide px-5 py-3', i > 0 && i < 4 ? 'hidden sm:table-cell' : '', i === 4 ? 'text-right' : 'text-left')}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tasks.map(t => (
            <tr key={t.id} className="border-b last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
              <td className="px-5 py-3 font-medium max-w-[200px] truncate">{t.title}</td>
              <td className="px-5 py-3 hidden sm:table-cell">{t.category ? <Badge variant="outline" className="text-[10px]">{t.category}</Badge> : <span className="text-muted-foreground/30">—</span>}</td>
              <td className="px-5 py-3 hidden sm:table-cell">
                {t.priority ? <Badge variant="outline" className={cn('text-[10px] capitalize', { high: 'bg-red-50 text-red-700 border-red-200', medium: 'bg-amber-50 text-amber-700 border-amber-200', low: 'bg-slate-100 text-slate-600' }[t.priority] ?? '')}>{t.priority}</Badge> : <span className="text-muted-foreground/30">—</span>}
              </td>
              <td className="px-5 py-3 hidden sm:table-cell text-muted-foreground text-xs">
                {t.completed_at && isValid(parseISO(t.completed_at)) ? format(parseISO(t.completed_at), 'dd MMM yyyy') : '—'}
              </td>
              <td className="px-5 py-3 text-right font-bold text-emerald-600">{fmtAmt(t.completion_reward_amount!, t.completion_reward_currency ?? 'SDG')}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 bg-slate-50 dark:bg-slate-800/40">
            <td colSpan={4} className="px-5 py-3 text-sm font-semibold text-right text-muted-foreground">Total</td>
            <td className="px-5 py-3 text-right font-bold text-emerald-600">{fmtAmt(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Tx List ───────────────────────────────────────────────────────────────────
function TxList({ txs }: { txs: WalletTx[] }) {
  return (
    <div className="divide-y">
      {txs.map(tx => {
        const style = TX_STYLE[tx.tx_type] ?? TX_STYLE.adjustment;
        return (
          <div key={tx.id} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              <span className={cn('w-2 h-2 rounded-full shrink-0', style.dot)} />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{tx.description ?? tx.tx_type.replace(/_/g, ' ')}</p>
                <p className="text-[11px] text-muted-foreground">{format(parseISO(tx.created_at), 'dd MMM yyyy · HH:mm')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {tx.status && <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', TX_STYLE[tx.status]?.bg ?? TX_STYLE.adjustment.bg, TX_STYLE[tx.status]?.text ?? TX_STYLE.adjustment.text)}>{tx.status}</span>}
              <span className={cn('text-sm font-bold', tx.amount >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                {tx.amount >= 0 ? '+' : ''}{fmtAmt(tx.amount, tx.currency)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Skeletons & Empty ─────────────────────────────────────────────────────────
function ChartSkeleton({ h = 160 }: { h?: number }) {
  return <div className="animate-pulse bg-slate-100 dark:bg-slate-800 rounded-xl mx-2" style={{ height: h }} />;
}
function TableSkeleton() {
  return <div className="space-y-3 p-5">{Array(3).fill(0).map((_, i) => <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" style={{ opacity: 1 - i * 0.25 }} />)}</div>;
}
function Empty({ msg }: { msg: string }) {
  return (
    <div className="py-12 text-center">
      <AlertCircle className="h-6 w-6 mx-auto mb-2 opacity-20" />
      <p className="text-sm text-muted-foreground">{msg}</p>
    </div>
  );
}
