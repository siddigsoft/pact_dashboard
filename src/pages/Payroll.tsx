import { useState, useMemo } from 'react';
import {
  format, startOfMonth, endOfMonth, subMonths, parseISO, isValid, isWithinInterval,
  getYear, getMonth,
} from 'date-fns';
import {
  Wallet, TrendingUp, CheckCircle2, Clock, ChevronLeft, ChevronRight,
  Award, DollarSign, Banknote, BarChart2, AlertCircle, ListChecks,
  RefreshCw, Download, FileText, PieChart as PieIcon, Search, X,
  CalendarRange, Tag, ArrowUpDown,
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
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts';
import { cn } from '@/lib/utils';

// ── Types ───────────────────────────────────────────────────────────────────
interface PersonalTask {
  id: string;
  title: string;
  status: string;
  completed_at: string | null;
  completion_reward_amount: number | null;
  completion_reward_currency: string | null;
  due_date: string | null;
  priority: string | null;
  category: string | null;
}

interface WalletTx {
  id: string;
  amount: number;
  currency: string;
  tx_type: string;
  description: string | null;
  created_at: string;
  status: string | null;
}

interface WalletRow {
  id: string;
  balances: Record<string, number>;
  total_earned: number | null;
  balance_cents: number | null;
}

// ── Constants ────────────────────────────────────────────────────────────────
const CURRENCY_SYMBOL: Record<string, string> = { USD: '$', SDG: 'SDG', EUR: '€', GBP: '£' };
const sym = (c: string) => CURRENCY_SYMBOL[c] ?? c;
const fmtAmt = (amount: number, currency = 'SDG') =>
  `${sym(currency)} ${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const TX_COLOR: Record<string, string> = {
  earning:    'bg-emerald-100 text-emerald-700',
  withdrawal: 'bg-purple-100 text-purple-700',
  adjustment: 'bg-slate-100 text-slate-600',
  completed:  'bg-blue-100 text-blue-700',
  pending:    'bg-amber-100 text-amber-700',
  failed:     'bg-red-100 text-red-700',
};

const PIE_COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#ec4899','#14b8a6','#a855f7'];
const BAR_COLORS = ['#6366f1','#8b5cf6','#3b82f6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#14b8a6','#f97316','#84cc16','#a855f7'];

// ── CSV Export ───────────────────────────────────────────────────────────────
function downloadCSV(rows: string[][], filename: string) {
  const content = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function Payroll({ embedded = false }: { embedded?: boolean }) {
  const { currentUser } = useUser();
  const userId = currentUser?.id;

  const [monthOffset, setMonthOffset] = useState(0);
  const [txSearch, setTxSearch] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState('all');

  const periodStart = startOfMonth(subMonths(new Date(), -monthOffset));
  const periodEnd   = endOfMonth(subMonths(new Date(), -monthOffset));
  const periodLabel = format(periodStart, 'MMMM yyyy');

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: wallet, isLoading: loadingWallet } = useQuery<WalletRow | null>({
    queryKey: ['payroll-wallet', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from('wallets')
        .select('id, balances, total_earned, balance_cents')
        .eq('user_id', userId!)
        .maybeSingle();
      return data as WalletRow | null;
    },
  });

  const { data: transactions = [], isLoading: loadingTx } = useQuery<WalletTx[]>({
    queryKey: ['payroll-transactions', userId, wallet?.id],
    enabled: !!wallet?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('wallet_transactions')
        .select('id, amount, currency, tx_type, description, created_at, status')
        .eq('wallet_id', wallet!.id)
        .order('created_at', { ascending: false })
        .limit(500);
      return (data ?? []) as WalletTx[];
    },
  });

  const { data: tasks = [], isLoading: loadingTasks } = useQuery<PersonalTask[]>({
    queryKey: ['payroll-tasks', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from('personal_tasks')
        .select('id, title, status, completed_at, completion_reward_amount, completion_reward_currency, due_date, priority, category')
        .eq('assigned_to', userId!)
        .eq('status', 'completed')
        .not('completion_reward_amount', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(500);
      return (data ?? []) as PersonalTask[];
    },
  });

  // ── Derived ──────────────────────────────────────────────────────────────
  const periodTasks = useMemo(() => tasks.filter(t => {
    if (!t.completed_at) return false;
    const d = parseISO(t.completed_at);
    return isValid(d) && isWithinInterval(d, { start: periodStart, end: periodEnd });
  }), [tasks, periodStart, periodEnd]);

  const periodTx = useMemo(() => transactions.filter(t => {
    const d = parseISO(t.created_at);
    return isValid(d) && isWithinInterval(d, { start: periodStart, end: periodEnd });
  }), [transactions, periodStart, periodEnd]);

  const periodEarnings = useMemo(() =>
    periodTasks.reduce((s, t) => s + (t.completion_reward_amount ?? 0), 0), [periodTasks]);

  const walletBalance = useMemo(() => {
    if (!wallet?.balances) return 0;
    return Object.values(wallet.balances).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
  }, [wallet]);

  const totalEarned = wallet?.total_earned ?? 0;

  // 12-month table for Annual Report
  const annualRows = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => {
      const mo = subMonths(new Date(), 11 - i);
      const s = startOfMonth(mo); const e = endOfMonth(mo);
      const mTasks = tasks.filter(t => {
        if (!t.completed_at) return false;
        const d = parseISO(t.completed_at);
        return isValid(d) && isWithinInterval(d, { start: s, end: e });
      });
      const mTx = transactions.filter(t => {
        const d = parseISO(t.created_at);
        return isValid(d) && isWithinInterval(d, { start: s, end: e });
      });
      const taskEarned = mTasks.reduce((sum, t) => sum + (t.completion_reward_amount ?? 0), 0);
      const txEarned   = mTx.filter(t => t.tx_type === 'earning').reduce((sum, t) => sum + t.amount, 0);
      const withdrawn  = mTx.filter(t => t.tx_type === 'withdrawal').reduce((sum, t) => sum + Math.abs(t.amount), 0);
      return { label: format(mo, 'MMM yyyy'), taskCount: mTasks.length, taskEarned, txEarned, withdrawn };
    }), [tasks, transactions]);

  const annualTotal = useMemo(() =>
    annualRows.reduce((s, r) => ({ taskEarned: s.taskEarned + r.taskEarned, taskCount: s.taskCount + r.taskCount, withdrawn: s.withdrawn + r.withdrawn }),
      { taskEarned: 0, taskCount: 0, withdrawn: 0 }), [annualRows]);

  // 6-month bar chart
  const chartData = useMemo(() =>
    Array.from({ length: 6 }, (_, i) => {
      const mo = subMonths(new Date(), 5 - i);
      const s = startOfMonth(mo); const e = endOfMonth(mo);
      const earned = tasks
        .filter(t => {
          if (!t.completed_at) return false;
          const d = parseISO(t.completed_at);
          return isValid(d) && isWithinInterval(d, { start: s, end: e });
        })
        .reduce((sum, t) => sum + (t.completion_reward_amount ?? 0), 0);
      return { month: format(mo, 'MMM yy'), earned, color: BAR_COLORS[i] };
    }), [tasks]);

  // Category breakdown (for pie chart and table)
  const categoryData = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {};
    tasks.forEach(t => {
      const key = t.category || 'Uncategorized';
      if (!map[key]) map[key] = { count: 0, total: 0 };
      map[key].count++;
      map[key].total += t.completion_reward_amount ?? 0;
    });
    return Object.entries(map)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [tasks]);

  // Transaction breakdown by type (for period)
  const txByType = useMemo(() => {
    const map: Record<string, number> = {};
    periodTx.forEach(t => { map[t.tx_type] = (map[t.tx_type] ?? 0) + t.amount; });
    return map;
  }, [periodTx]);

  // Filtered transactions (All Transactions tab)
  const txTypes = useMemo(() => Array.from(new Set(transactions.map(t => t.tx_type))), [transactions]);
  const filteredAllTx = useMemo(() => {
    let list = transactions;
    if (txTypeFilter !== 'all') list = list.filter(t => t.tx_type === txTypeFilter);
    if (txSearch.trim()) {
      const q = txSearch.toLowerCase();
      list = list.filter(t =>
        (t.description ?? '').toLowerCase().includes(q) ||
        t.tx_type.toLowerCase().includes(q) ||
        fmtAmt(t.amount, t.currency).toLowerCase().includes(q)
      );
    }
    return list;
  }, [transactions, txTypeFilter, txSearch]);

  const isLoading = loadingWallet || loadingTx || loadingTasks;

  // ── Export helpers ───────────────────────────────────────────────────────
  const exportPeriodTasks = () => {
    const rows = [
      ['Task', 'Category', 'Priority', 'Completed', 'Reward (SDG)'],
      ...periodTasks.map(t => [
        t.title,
        t.category ?? '',
        t.priority ?? '',
        t.completed_at ? format(parseISO(t.completed_at), 'dd MMM yyyy') : '',
        String(t.completion_reward_amount ?? 0),
      ]),
      ['', '', '', 'TOTAL', String(periodEarnings)],
    ];
    downloadCSV(rows, `payroll-tasks-${format(periodStart, 'yyyy-MM')}.csv`);
  };

  const exportAnnualReport = () => {
    const rows = [
      ['Month', 'Tasks Completed', 'Task Rewards (SDG)', 'Withdrawals (SDG)'],
      ...annualRows.map(r => [r.label, String(r.taskCount), String(r.taskEarned), String(r.withdrawn)]),
      ['TOTAL', String(annualTotal.taskCount), String(annualTotal.taskEarned), String(annualTotal.withdrawn)],
    ];
    downloadCSV(rows, `payroll-annual-${format(new Date(), 'yyyy')}.csv`);
  };

  const exportAllTransactions = () => {
    const rows = [
      ['Date', 'Type', 'Description', 'Amount', 'Currency', 'Status'],
      ...filteredAllTx.map(t => [
        format(parseISO(t.created_at), 'dd MMM yyyy HH:mm'),
        t.tx_type, t.description ?? '', String(t.amount), t.currency, t.status ?? '',
      ]),
    ];
    downloadCSV(rows, `payroll-transactions-${format(new Date(), 'yyyy-MM')}.csv`);
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

        {!embedded && <ConnectedPagesBar exclude="hr" />}

        {/* Page header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Banknote className="h-6 w-6 text-amber-500" />
              My Payroll
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {currentUser?.name ?? 'Employee'} · Earnings, rewards &amp; reports
            </p>
          </div>
          {/* All-time stats pill */}
          <div className="flex items-center gap-3 text-xs">
            <span className="bg-amber-50 border border-amber-200 text-amber-700 px-3 py-1.5 rounded-full font-semibold">
              {isLoading ? '…' : `Total earned: ${fmtAmt(totalEarned, 'SDG')}`}
            </span>
            <span className="bg-indigo-50 border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-full font-semibold">
              {isLoading ? '…' : `Wallet: ${fmtAmt(walletBalance, 'SDG')}`}
            </span>
          </div>
        </div>

        {/* ── Tabs ── */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="h-9">
            <TabsTrigger value="overview" className="text-xs gap-1.5">
              <BarChart2 className="h-3.5 w-3.5" />Overview
            </TabsTrigger>
            <TabsTrigger value="annual" className="text-xs gap-1.5">
              <CalendarRange className="h-3.5 w-3.5" />Annual Report
            </TabsTrigger>
            <TabsTrigger value="category" className="text-xs gap-1.5">
              <Tag className="h-3.5 w-3.5" />By Category
            </TabsTrigger>
            <TabsTrigger value="transactions" className="text-xs gap-1.5">
              <ArrowUpDown className="h-3.5 w-3.5" />All Transactions
            </TabsTrigger>
          </TabsList>

          {/* ── TAB: OVERVIEW ── */}
          <TabsContent value="overview" className="space-y-5 mt-0">
            {/* Period selector */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground font-medium">Period:</span>
              <Button variant="outline" size="sm" onClick={() => setMonthOffset(o => o - 1)} data-testid="btn-prev-month">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-semibold min-w-[130px] text-center">{periodLabel}</span>
              <Button variant="outline" size="sm" onClick={() => setMonthOffset(o => o + 1)} disabled={monthOffset >= 0} data-testid="btn-next-month">
                <ChevronRight className="h-4 w-4" />
              </Button>
              {monthOffset !== 0 && (
                <Button variant="ghost" size="sm" onClick={() => setMonthOffset(0)}>Current month</Button>
              )}
              <Button variant="outline" size="sm" className="ml-auto gap-1.5" onClick={exportPeriodTasks} data-testid="btn-export-period">
                <Download className="h-3.5 w-3.5" />Export CSV
              </Button>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SummaryCard icon={<Wallet className="h-5 w-5 text-indigo-500" />} label="Wallet Balance" value={isLoading ? '…' : walletBalance > 0 ? fmtAmt(walletBalance, 'SDG') : '—'} sub="Current available" color="indigo" />
              <SummaryCard icon={<TrendingUp className="h-5 w-5 text-emerald-500" />} label="This Period" value={isLoading ? '…' : periodEarnings > 0 ? fmtAmt(periodEarnings, 'SDG') : '—'} sub={`${periodTasks.length} task reward${periodTasks.length !== 1 ? 's' : ''}`} color="emerald" />
              <SummaryCard icon={<Award className="h-5 w-5 text-amber-500" />} label="Total Earned" value={isLoading ? '…' : totalEarned > 0 ? fmtAmt(totalEarned, 'SDG') : '—'} sub="All time" color="amber" />
              <SummaryCard icon={<CheckCircle2 className="h-5 w-5 text-blue-500" />} label="Rewarded Tasks" value={isLoading ? '…' : String(tasks.length)} sub="All time" color="blue" />
            </div>

            {/* Chart + breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="md:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <BarChart2 className="h-4 w-4 text-indigo-500" />Earnings — Last 6 Months
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoading ? <Spinner /> : (
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v: number) => [fmtAmt(v), 'Earned']} contentStyle={{ fontSize: 12 }} />
                        <Bar dataKey="earned" radius={[4, 4, 0, 0]}>
                          {chartData.map((_, i) => <Cell key={i} fill={BAR_COLORS[i]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-emerald-500" />{periodLabel} Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
                    : Object.keys(txByType).length === 0 && periodEarnings === 0
                    ? <p className="text-sm text-muted-foreground italic">No activity this period.</p>
                    : (
                      <>
                        {Object.entries(txByType).map(([type, amt]) => (
                          <div key={type} className="flex items-center justify-between text-sm">
                            <Badge variant="outline" className={cn('capitalize text-[10px]', TX_COLOR[type] ?? TX_COLOR.adjustment)}>
                              {type.replace(/_/g, ' ')}
                            </Badge>
                            <span className="font-semibold">{fmtAmt(amt)}</span>
                          </div>
                        ))}
                        {periodEarnings > 0 && (
                          <div className="pt-2 border-t flex items-center justify-between text-sm font-bold">
                            <span>Task Rewards</span>
                            <span className="text-emerald-600">{fmtAmt(periodEarnings)}</span>
                          </div>
                        )}
                      </>
                    )}
                </CardContent>
              </Card>
            </div>

            {/* Period tasks table */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-blue-500" />
                  Completed Tasks with Rewards — {periodLabel}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? <Spinner /> : periodTasks.length === 0 ? (
                  <Empty msg="No rewarded tasks completed this period." />
                ) : (
                  <TaskTable tasks={periodTasks} total={periodEarnings} />
                )}
              </CardContent>
            </Card>

            {/* Period transactions */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-purple-500" />
                  Wallet Transactions — {periodLabel}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? <Spinner /> : periodTx.length === 0 ? (
                  <Empty msg="No transactions this period." />
                ) : (
                  <TxList txs={periodTx} />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── TAB: ANNUAL REPORT ── */}
          <TabsContent value="annual" className="space-y-4 mt-0">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <CalendarRange className="h-4 w-4 text-indigo-500" />
                12-Month Earnings Report
              </h2>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={exportAnnualReport} data-testid="btn-export-annual">
                <Download className="h-3.5 w-3.5" />Export CSV
              </Button>
            </div>

            {/* Annual bar chart */}
            <Card>
              <CardContent className="pt-4">
                {isLoading ? <Spinner /> : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={annualRows} margin={{ top: 4, right: 4, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={40} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => [fmtAmt(v), 'Task Rewards']} contentStyle={{ fontSize: 12 }} />
                      <Bar dataKey="taskEarned" name="Task Rewards" radius={[4, 4, 0, 0]}>
                        {annualRows.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Annual table */}
            <Card>
              <CardContent className="pt-4">
                {isLoading ? <Spinner /> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs text-muted-foreground">
                          <th className="pb-2 font-medium">Month</th>
                          <th className="pb-2 font-medium text-right">Tasks</th>
                          <th className="pb-2 font-medium text-right">Task Rewards</th>
                          <th className="pb-2 font-medium text-right">Withdrawals</th>
                          <th className="pb-2 font-medium text-right">Net</th>
                        </tr>
                      </thead>
                      <tbody>
                        {annualRows.map((r, i) => {
                          const net = r.taskEarned - r.withdrawn;
                          const isCurrentMonth = i === 11;
                          return (
                            <tr key={r.label} className={cn('border-b last:border-0 hover:bg-muted/20 transition-colors', isCurrentMonth && 'bg-indigo-50/50 dark:bg-indigo-950/20')} data-testid={`annual-row-${i}`}>
                              <td className="py-2 pr-3 font-medium">{r.label} {isCurrentMonth && <Badge variant="outline" className="ml-1 text-[9px] bg-indigo-100 text-indigo-700 border-indigo-200">Current</Badge>}</td>
                              <td className="py-2 pr-3 text-right text-muted-foreground">{r.taskCount}</td>
                              <td className="py-2 pr-3 text-right font-semibold text-emerald-600">{r.taskEarned > 0 ? fmtAmt(r.taskEarned) : '—'}</td>
                              <td className="py-2 pr-3 text-right text-red-500">{r.withdrawn > 0 ? fmtAmt(r.withdrawn) : '—'}</td>
                              <td className={cn('py-2 text-right font-bold', net > 0 ? 'text-emerald-600' : net < 0 ? 'text-red-500' : 'text-muted-foreground')}>{net !== 0 ? fmtAmt(net) : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-border">
                          <td className="pt-2 font-bold">Total (12 months)</td>
                          <td className="pt-2 text-right font-bold text-muted-foreground">{annualTotal.taskCount}</td>
                          <td className="pt-2 text-right font-bold text-emerald-600">{fmtAmt(annualTotal.taskEarned)}</td>
                          <td className="pt-2 text-right font-bold text-red-500">{fmtAmt(annualTotal.withdrawn)}</td>
                          <td className="pt-2 text-right font-bold text-emerald-600">{fmtAmt(annualTotal.taskEarned - annualTotal.withdrawn)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── TAB: BY CATEGORY ── */}
          <TabsContent value="category" className="space-y-4 mt-0">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Tag className="h-4 w-4 text-amber-500" />
              Earnings by Task Category (All Time)
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Pie chart */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <PieIcon className="h-4 w-4 text-indigo-500" />Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoading ? <Spinner /> : categoryData.length === 0 ? (
                    <Empty msg="No category data." />
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={categoryData} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                          {categoryData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => [fmtAmt(v), 'Earned']} contentStyle={{ fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Category table */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-emerald-500" />By Category
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoading ? <Spinner /> : categoryData.length === 0 ? (
                    <Empty msg="No tasks with rewards found." />
                  ) : (
                    <div className="space-y-2">
                      {categoryData.map((cat, i) => {
                        const pct = tasks.length > 0 ? Math.round((cat.count / tasks.length) * 100) : 0;
                        return (
                          <div key={cat.name} data-testid={`cat-row-${i}`}>
                            <div className="flex items-center justify-between text-sm mb-0.5">
                              <span className="font-medium flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                                {cat.name}
                              </span>
                              <span className="text-xs text-muted-foreground">{cat.count} tasks · <span className="font-semibold text-emerald-600">{fmtAmt(cat.total)}</span></span>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: PIE_COLORS[i % PIE_COLORS.length] }} />
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

            {/* All rewarded tasks list */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-blue-500" />All Rewarded Tasks (All Time)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? <Spinner /> : tasks.length === 0 ? <Empty msg="No rewarded tasks." /> : (
                  <TaskTable tasks={tasks} total={tasks.reduce((s, t) => s + (t.completion_reward_amount ?? 0), 0)} />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── TAB: ALL TRANSACTIONS ── */}
          <TabsContent value="transactions" className="space-y-4 mt-0">
            {/* Toolbar */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search transactions…"
                  value={txSearch}
                  onChange={e => setTxSearch(e.target.value)}
                  className="pl-8 h-9 text-sm"
                  data-testid="input-tx-search"
                />
                {txSearch && (
                  <button onClick={() => setTxSearch('')} className="absolute right-2 top-2.5">
                    <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                  </button>
                )}
              </div>
              <select
                value={txTypeFilter}
                onChange={e => setTxTypeFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                data-testid="select-tx-type"
              >
                <option value="all">All types</option>
                {txTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
              <Button variant="outline" size="sm" className="gap-1.5 ml-auto" onClick={exportAllTransactions} data-testid="btn-export-all-tx">
                <Download className="h-3.5 w-3.5" />Export CSV
              </Button>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: 'Total Credits', value: transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0), color: 'text-emerald-600' },
                { label: 'Total Debits', value: transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0), color: 'text-red-500' },
                { label: 'Transactions', value: transactions.length, color: 'text-indigo-600', raw: true },
              ].map(s => (
                <Card key={s.label} className="py-3 px-2">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className={cn('text-lg font-bold mt-0.5', s.color)}>
                    {isLoading ? '…' : s.raw ? s.value : fmtAmt(s.value as number)}
                  </p>
                </Card>
              ))}
            </div>

            {/* Transactions table */}
            <Card>
              <CardContent className="pt-4">
                {isLoading ? <Spinner /> : filteredAllTx.length === 0 ? (
                  <Empty msg="No transactions found." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs text-muted-foreground">
                          <th className="pb-2 font-medium">Date</th>
                          <th className="pb-2 font-medium">Type</th>
                          <th className="pb-2 font-medium">Description</th>
                          <th className="pb-2 font-medium">Status</th>
                          <th className="pb-2 font-medium text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAllTx.map(tx => (
                          <tr key={tx.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors" data-testid={`tx-row-${tx.id}`}>
                            <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap text-xs">
                              {format(parseISO(tx.created_at), 'dd MMM yyyy')}
                              <br />
                              <span className="opacity-60">{format(parseISO(tx.created_at), 'HH:mm')}</span>
                            </td>
                            <td className="py-2 pr-3">
                              <Badge variant="outline" className={cn('text-[10px] capitalize', TX_COLOR[tx.tx_type] ?? TX_COLOR.adjustment)}>
                                {tx.tx_type.replace(/_/g, ' ')}
                              </Badge>
                            </td>
                            <td className="py-2 pr-3 max-w-[200px] truncate">{tx.description ?? '—'}</td>
                            <td className="py-2 pr-3">
                              {tx.status && (
                                <Badge variant="outline" className={cn('text-[10px] capitalize', TX_COLOR[tx.status] ?? TX_COLOR.adjustment)}>
                                  {tx.status}
                                </Badge>
                              )}
                            </td>
                            <td className={cn('py-2 text-right font-bold whitespace-nowrap', tx.amount >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                              {tx.amount >= 0 ? '+' : ''}{fmtAmt(tx.amount, tx.currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="text-xs text-muted-foreground mt-3 text-right">{filteredAllTx.length} transaction{filteredAllTx.length !== 1 ? 's' : ''}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────
function SummaryCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub: string;
  color: 'indigo' | 'emerald' | 'amber' | 'blue';
}) {
  const bg = { indigo: 'bg-indigo-50 dark:bg-indigo-950/30', emerald: 'bg-emerald-50 dark:bg-emerald-950/30', amber: 'bg-amber-50 dark:bg-amber-950/30', blue: 'bg-blue-50 dark:bg-blue-950/30' };
  return (
    <Card className={cn('border-0 shadow-sm', bg[color])}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">{icon}<span className="text-xs text-muted-foreground font-medium">{label}</span></div>
        <p className="text-xl font-bold leading-tight">{value}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
      </CardContent>
    </Card>
  );
}

function PriorityBadge({ priority }: { priority: string | null }) {
  if (!priority) return <span className="text-muted-foreground/50 text-xs">—</span>;
  const map: Record<string, string> = { high: 'bg-red-100 text-red-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-slate-100 text-slate-600', urgent: 'bg-red-200 text-red-800' };
  return <Badge variant="outline" className={cn('text-[10px] capitalize', map[priority] ?? 'bg-slate-100 text-slate-600')}>{priority}</Badge>;
}

function TaskTable({ tasks, total }: { tasks: PersonalTask[]; total: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="pb-2 font-medium">Task</th>
            <th className="pb-2 font-medium">Category</th>
            <th className="pb-2 font-medium">Priority</th>
            <th className="pb-2 font-medium">Completed</th>
            <th className="pb-2 font-medium text-right">Reward</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map(t => (
            <tr key={t.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors" data-testid={`task-row-${t.id}`}>
              <td className="py-2 pr-3 font-medium max-w-[200px] truncate">{t.title}</td>
              <td className="py-2 pr-3">{t.category ? <Badge variant="outline" className="text-[10px] capitalize">{t.category}</Badge> : <span className="text-muted-foreground/40">—</span>}</td>
              <td className="py-2 pr-3"><PriorityBadge priority={t.priority} /></td>
              <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">
                {t.completed_at && isValid(parseISO(t.completed_at)) ? format(parseISO(t.completed_at), 'dd MMM yyyy') : '—'}
              </td>
              <td className="py-2 text-right font-bold text-emerald-600 whitespace-nowrap">
                {fmtAmt(t.completion_reward_amount!, t.completion_reward_currency ?? 'SDG')}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t">
            <td colSpan={4} className="pt-2 text-sm font-semibold text-right pr-3">Total</td>
            <td className="pt-2 text-right font-bold text-emerald-600">{fmtAmt(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function TxList({ txs }: { txs: WalletTx[] }) {
  return (
    <div className="space-y-1.5">
      {txs.map(tx => (
        <div key={tx.id} className="flex items-start justify-between gap-3 py-2 border-b last:border-0" data-testid={`tx-item-${tx.id}`}>
          <div className="flex items-start gap-3 min-w-0">
            <div className={cn('mt-1 w-2 h-2 rounded-full shrink-0', tx.amount >= 0 ? 'bg-emerald-500' : 'bg-red-400')} />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{tx.description ?? tx.tx_type.replace(/_/g, ' ')}</p>
              <p className="text-[11px] text-muted-foreground">{format(parseISO(tx.created_at), 'dd MMM yyyy · HH:mm')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {tx.status && <Badge variant="outline" className={cn('text-[10px]', TX_COLOR[tx.status] ?? TX_COLOR.adjustment)}>{tx.status}</Badge>}
            <span className={cn('text-sm font-bold whitespace-nowrap', tx.amount >= 0 ? 'text-emerald-600' : 'text-red-500')}>
              {tx.amount >= 0 ? '+' : ''}{fmtAmt(tx.amount, tx.currency)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Spinner() {
  return (
    <div className="py-8 flex flex-col items-center gap-2 text-muted-foreground">
      <RefreshCw className="h-5 w-5 animate-spin opacity-40" />
      <span className="text-sm">Loading…</span>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="py-8 text-center text-sm text-muted-foreground">
      <AlertCircle className="h-5 w-5 mx-auto mb-2 opacity-30" />
      {msg}
    </div>
  );
}
