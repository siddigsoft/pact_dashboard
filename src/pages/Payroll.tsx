import { useState, useMemo } from 'react';
import {
  format, startOfMonth, endOfMonth, subMonths, parseISO, isValid, isWithinInterval,
} from 'date-fns';
import {
  Wallet, TrendingUp, CheckCircle2, Clock, Calendar, Download,
  ChevronLeft, ChevronRight, Award, DollarSign, Banknote, BarChart2,
  AlertCircle, ListChecks, RefreshCw,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';
import { ConnectedPagesBar } from '@/components/ui/connected-pages-bar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────
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

interface Wallet {
  id: string;
  balances: Record<string, number>;
  total_earned: number | null;
  balance_cents: number | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────
const CURRENCY_SYMBOL: Record<string, string> = {
  USD: '$', SDG: 'SDG', EUR: '€', GBP: '£',
};
const sym = (c: string) => CURRENCY_SYMBOL[c] ?? c;

function fmtAmt(amount: number, currency: string) {
  return `${sym(currency)} ${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

const STATUS_COLOR: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-700',
  pending:   'bg-amber-100 text-amber-700',
  failed:    'bg-red-100 text-red-700',
  earning:   'bg-blue-100 text-blue-700',
  withdrawal:'bg-purple-100 text-purple-700',
  adjustment:'bg-slate-100 text-slate-700',
};

const MONTH_COLORS = ['#6366f1','#8b5cf6','#3b82f6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#14b8a6','#f97316','#84cc16','#a855f7'];

// ── Main Component ─────────────────────────────────────────────────────────
export default function Payroll() {
  const { currentUser } = useUser();
  const userId = currentUser?.id;
  const [monthOffset, setMonthOffset] = useState(0); // 0 = current month

  const periodStart = startOfMonth(subMonths(new Date(), -monthOffset));
  const periodEnd   = endOfMonth(subMonths(new Date(), -monthOffset));
  const periodLabel = format(periodStart, 'MMMM yyyy');

  // ── Fetch data ─────────────────────────────────────────────────────────
  const { data: wallet, isLoading: loadingWallet } = useQuery<Wallet | null>({
    queryKey: ['payroll-wallet', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from('wallets')
        .select('id, balances, total_earned, balance_cents')
        .eq('user_id', userId!)
        .maybeSingle();
      return data as Wallet | null;
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
        .limit(200);
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
        .limit(300);
      return (data ?? []) as PersonalTask[];
    },
  });

  // ── Derived data ───────────────────────────────────────────────────────
  const periodTasks = useMemo(() => tasks.filter(t => {
    if (!t.completed_at) return false;
    const d = parseISO(t.completed_at);
    return isValid(d) && isWithinInterval(d, { start: periodStart, end: periodEnd });
  }), [tasks, periodStart, periodEnd]);

  const periodTx = useMemo(() => transactions.filter(t => {
    const d = parseISO(t.created_at);
    return isValid(d) && isWithinInterval(d, { start: periodStart, end: periodEnd });
  }), [transactions, periodStart, periodEnd]);

  const periodEarnings = useMemo(() => {
    return periodTasks.reduce((sum, t) => sum + (t.completion_reward_amount ?? 0), 0);
  }, [periodTasks]);

  const totalEarned = wallet?.total_earned ?? 0;
  const walletBalance = useMemo(() => {
    if (!wallet?.balances) return 0;
    return Object.values(wallet.balances).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
  }, [wallet]);

  // Last 6 months chart data
  const chartData = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const mo = subMonths(new Date(), 5 - i);
      const s = startOfMonth(mo);
      const e = endOfMonth(mo);
      const earned = tasks
        .filter(t => {
          if (!t.completed_at) return false;
          const d = parseISO(t.completed_at);
          return isValid(d) && isWithinInterval(d, { start: s, end: e });
        })
        .reduce((sum, t) => sum + (t.completion_reward_amount ?? 0), 0);
      return { month: format(mo, 'MMM'), earned, color: MONTH_COLORS[i] };
    });
  }, [tasks]);

  // Group period transactions by type
  const txByType = useMemo(() => {
    const map: Record<string, number> = {};
    periodTx.forEach(t => {
      map[t.tx_type] = (map[t.tx_type] ?? 0) + t.amount;
    });
    return map;
  }, [periodTx]);

  const isLoading = loadingWallet || loadingTx || loadingTasks;

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* Connected pages bar */}
        <ConnectedPagesBar exclude="task-admin" />

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Banknote className="h-6 w-6 text-amber-500" />
              My Payroll
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {currentUser?.name ?? 'Employee'} · Task earnings &amp; wallet summary
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm"
              onClick={() => setMonthOffset(o => o - 1)}
              data-testid="btn-prev-month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold min-w-[120px] text-center">{periodLabel}</span>
            <Button
              variant="outline" size="sm"
              onClick={() => setMonthOffset(o => o + 1)}
              disabled={monthOffset >= 0}
              data-testid="btn-next-month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            {monthOffset !== 0 && (
              <Button variant="ghost" size="sm" onClick={() => setMonthOffset(0)} data-testid="btn-current-month">
                Today
              </Button>
            )}
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <SummaryCard
            icon={<Wallet className="h-5 w-5 text-indigo-500" />}
            label="Wallet Balance"
            value={isLoading ? '…' : walletBalance > 0 ? fmtAmt(walletBalance, 'SDG') : '—'}
            sub="Current available"
            color="indigo"
          />
          <SummaryCard
            icon={<TrendingUp className="h-5 w-5 text-emerald-500" />}
            label="This Period"
            value={isLoading ? '…' : periodEarnings > 0 ? fmtAmt(periodEarnings, 'SDG') : '—'}
            sub={`${periodTasks.length} task reward${periodTasks.length !== 1 ? 's' : ''}`}
            color="emerald"
          />
          <SummaryCard
            icon={<Award className="h-5 w-5 text-amber-500" />}
            label="Total Earned"
            value={isLoading ? '…' : totalEarned > 0 ? fmtAmt(totalEarned, 'SDG') : '—'}
            sub="All time"
            color="amber"
          />
          <SummaryCard
            icon={<CheckCircle2 className="h-5 w-5 text-blue-500" />}
            label="Rewarded Tasks"
            value={isLoading ? '…' : String(tasks.length)}
            sub="All time"
            color="blue"
          />
        </div>

        {/* Chart + breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 6-month earnings chart */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-indigo-500" />
                Earnings — Last 6 Months
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
              ) : (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(v: number) => [fmtAmt(v, 'SDG'), 'Earned']}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Bar dataKey="earned" radius={[4, 4, 0, 0]}>
                      {chartData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* This period breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-emerald-500" />
                {periodLabel} Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {isLoading ? (
                <div className="text-sm text-muted-foreground">Loading…</div>
              ) : Object.keys(txByType).length === 0 ? (
                <div className="text-sm text-muted-foreground italic">No transactions this period.</div>
              ) : (
                Object.entries(txByType).map(([type, amt]) => (
                  <div key={type} className="flex items-center justify-between text-sm">
                    <Badge variant="outline" className={cn('capitalize text-[10px]', STATUS_COLOR[type] ?? STATUS_COLOR.adjustment)}>
                      {type.replace(/_/g, ' ')}
                    </Badge>
                    <span className="font-semibold">{fmtAmt(amt, 'SDG')}</span>
                  </div>
                ))
              )}
              {periodEarnings > 0 && (
                <div className="pt-2 border-t flex items-center justify-between text-sm font-bold">
                  <span>Task Rewards</span>
                  <span className="text-emerald-600">{fmtAmt(periodEarnings, 'SDG')}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Rewarded tasks table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-blue-500" />
              Completed Tasks with Rewards — {periodLabel}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 opacity-40" />
                Loading tasks…
              </div>
            ) : periodTasks.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <AlertCircle className="h-5 w-5 mx-auto mb-2 opacity-30" />
                No rewarded tasks completed this month.
              </div>
            ) : (
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
                    {periodTasks.map(t => (
                      <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors" data-testid={`payroll-task-${t.id}`}>
                        <td className="py-2 pr-3 font-medium max-w-[200px] truncate">{t.title}</td>
                        <td className="py-2 pr-3">
                          {t.category ? (
                            <Badge variant="outline" className="text-[10px] capitalize">{t.category}</Badge>
                          ) : <span className="text-muted-foreground/50">—</span>}
                        </td>
                        <td className="py-2 pr-3">
                          <PriorityBadge priority={t.priority} />
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">
                          {t.completed_at && isValid(parseISO(t.completed_at))
                            ? format(parseISO(t.completed_at), 'dd MMM yyyy')
                            : '—'}
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
                      <td className="pt-2 text-right font-bold text-emerald-600">{fmtAmt(periodEarnings, 'SDG')}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Wallet transaction history */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-purple-500" />
              Transaction History — {periodLabel}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 opacity-40" />
                Loading transactions…
              </div>
            ) : periodTx.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <AlertCircle className="h-5 w-5 mx-auto mb-2 opacity-30" />
                No transactions this period.
              </div>
            ) : (
              <div className="space-y-2">
                {periodTx.map(tx => (
                  <div key={tx.id} className="flex items-start justify-between gap-3 py-2 border-b last:border-0" data-testid={`payroll-tx-${tx.id}`}>
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={cn('mt-0.5 w-2 h-2 rounded-full shrink-0', tx.amount >= 0 ? 'bg-emerald-500' : 'bg-red-400')} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{tx.description ?? tx.tx_type.replace(/_/g, ' ')}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {format(parseISO(tx.created_at), 'dd MMM yyyy · HH:mm')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {tx.status && (
                        <Badge variant="outline" className={cn('text-[10px]', STATUS_COLOR[tx.status] ?? STATUS_COLOR.adjustment)}>
                          {tx.status}
                        </Badge>
                      )}
                      <span className={cn('text-sm font-bold whitespace-nowrap', tx.amount >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                        {tx.amount >= 0 ? '+' : ''}{fmtAmt(tx.amount, tx.currency)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────
function SummaryCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub: string;
  color: 'indigo' | 'emerald' | 'amber' | 'blue';
}) {
  const bg: Record<string, string> = {
    indigo: 'bg-indigo-50 dark:bg-indigo-950/30',
    emerald: 'bg-emerald-50 dark:bg-emerald-950/30',
    amber:   'bg-amber-50 dark:bg-amber-950/30',
    blue:    'bg-blue-50 dark:bg-blue-950/30',
  };
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
  const map: Record<string, string> = {
    high:   'bg-red-100 text-red-700',
    medium: 'bg-amber-100 text-amber-700',
    low:    'bg-slate-100 text-slate-600',
    urgent: 'bg-red-200 text-red-800',
  };
  return (
    <Badge variant="outline" className={cn('text-[10px] capitalize', map[priority] ?? 'bg-slate-100 text-slate-600')}>
      {priority}
    </Badge>
  );
}
