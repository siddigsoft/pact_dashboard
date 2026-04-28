import { useEffect, useState, useCallback, useRef } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Loader2, RefreshCw, TrendingUp, TrendingDown, DollarSign, Package,
  Clock, BookOpen, ArrowRight, AlertTriangle, Activity, BarChart3,
  CheckCircle2, XCircle, FileText, ShoppingCart, Zap, ChevronRight,
} from 'lucide-react';
import { format, parseISO, subMonths, startOfMonth, endOfMonth, differenceInDays } from 'date-fns';
import { formatNumber } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  BarChart, Bar, Cell, PieChart, Pie,
} from 'recharts';

/* ─── types ─────────────────────────────────────────────────────────── */
interface KPIState<T> { data: T | null; loading: boolean; error: string | null }
const INIT = <T,>(): KPIState<T> => ({ data: null, loading: true, error: null });

interface BudgetKPI { totalBudget: number; totalSpent: number; utilizationPct: number; activeBudgets: number; overBudgetCount: number }
interface APSummary { outstanding: number; vendorCount: number; current: number; d1_30: number; d31_60: number; d61_90: number; over90: number }
interface AssetKPI { totalBookValue: number; totalCost: number; activeCount: number; depreciatedPct: number }
interface JournalSummary { draftCount: number; pendingCount: number; postedCount: number; recent: { id: string; date: string; desc: string; amount: number; status: string }[] }
interface MonthlySpend { month: string; amount: number }
interface POSummary { pendingCount: number; pendingAmount: number; draftCount: number; approvedCount: number }
interface ModuleStatus { journals: boolean; vendors: boolean; assets: boolean; purchaseOrders: boolean; fiscalPeriods: boolean }

/* ─── health score ───────────────────────────────────────────────────── */
function calcHealth(
  budget: BudgetKPI | null,
  ap: APSummary | null,
  journals: JournalSummary | null,
  modules: ModuleStatus | null,
): { score: number; grade: 'A' | 'B' | 'C' | 'D' | 'F'; color: string } {
  let score = 100;
  if (budget) {
    if (budget.utilizationPct > 95) score -= 20;
    else if (budget.utilizationPct > 90) score -= 10;
    if (budget.overBudgetCount > 0) score -= 15;
  }
  if (ap) {
    const risky = ap.d61_90 + ap.over90;
    if (risky > ap.outstanding * 0.3) score -= 20;
    else if (risky > ap.outstanding * 0.1) score -= 10;
  }
  if (journals) {
    if (journals.draftCount > 20) score -= 15;
    else if (journals.draftCount > 5) score -= 5;
    if (journals.pendingCount > 10) score -= 5;
  }
  if (modules) {
    const active = Object.values(modules).filter(Boolean).length;
    if (active < 3) score -= 10;
  }
  score = Math.max(0, Math.min(100, score));
  if (score >= 90) return { score, grade: 'A', color: 'text-emerald-600' };
  if (score >= 75) return { score, grade: 'B', color: 'text-blue-600' };
  if (score >= 60) return { score, grade: 'C', color: 'text-amber-600' };
  if (score >= 45) return { score, grade: 'D', color: 'text-orange-600' };
  return { score, grade: 'F', color: 'text-rose-600' };
}

/* ─── KPI card ───────────────────────────────────────────────────────── */
function KpiCard({
  title, titleAr, value, sub, icon: Icon, accent, href, loading, error, trend, alert,
}: {
  title: string; titleAr: string; value: string; sub?: string; icon: React.ElementType;
  accent: string; href?: string; loading?: boolean; error?: string | null; trend?: 'up' | 'down' | null; alert?: boolean;
}) {
  return (
    <Card className={cn('relative overflow-hidden transition-shadow hover:shadow-sm', alert && 'ring-1 ring-amber-400')}>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">{title}</div>
            <div className="text-[9px] text-muted-foreground" dir="rtl">{titleAr}</div>
            {loading ? (
              <div className="mt-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : error ? (
              <div className="text-[11px] text-amber-600 mt-1 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Run migration</div>
            ) : (
              <div className="mt-1.5 flex items-end gap-1.5">
                <div className="text-2xl font-bold tabular-nums leading-none">{value}</div>
                {trend === 'up' && <TrendingUp className="h-3.5 w-3.5 text-rose-500 mb-0.5" />}
                {trend === 'down' && <TrendingDown className="h-3.5 w-3.5 text-emerald-500 mb-0.5" />}
              </div>
            )}
            {!loading && !error && sub && <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</div>}
          </div>
          <div className={cn('flex items-center justify-center h-10 w-10 rounded-xl shrink-0 text-white', accent)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        {href && !loading && !error && <Link to={href} className="absolute inset-0 rounded-lg" aria-label={`Open ${title}`} />}
      </CardContent>
    </Card>
  );
}

/* ─── alert item ─────────────────────────────────────────────────────── */
function AlertItem({ icon: Icon, color, label, action, href }: { icon: React.ElementType; color: string; label: string; action: string; href: string }) {
  return (
    <Link to={href} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background border hover:bg-muted/40 transition-colors group">
      <Icon className={cn('h-4 w-4 shrink-0', color)} />
      <span className="text-xs flex-1">{label}</span>
      <span className="text-[10px] text-primary font-medium group-hover:underline">{action}</span>
      <ChevronRight className="h-3 w-3 text-muted-foreground" />
    </Link>
  );
}

/* ─── AP Aging bar ───────────────────────────────────────────────────── */
function AgingBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-14 text-muted-foreground shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-20 text-right tabular-nums font-medium shrink-0">{formatNumber(value, 0)}</span>
      <span className="w-8 text-right text-muted-foreground shrink-0">{pct}%</span>
    </div>
  );
}

/* ─── module status pill ─────────────────────────────────────────────── */
function ModulePill({ label, active }: { label: string; active: boolean }) {
  return (
    <div className={cn('flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium border', active ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800' : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800')}>
      {active ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {label}
    </div>
  );
}

/* ─── main component ─────────────────────────────────────────────────── */
export default function AccountingFinanceDashboard() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);

  const [budget, setBudget] = useState<KPIState<BudgetKPI>>(INIT());
  const [ap, setAP] = useState<KPIState<APSummary>>(INIT());
  const [assets, setAssets] = useState<KPIState<AssetKPI>>(INIT());
  const [journals, setJournals] = useState<KPIState<JournalSummary>>(INIT());
  const [monthlySpend, setMonthlySpend] = useState<KPIState<MonthlySpend[]>>(INIT());
  const [pos, setPOs] = useState<KPIState<POSummary>>(INIT());
  const [modules, setModules] = useState<KPIState<ModuleStatus>>(INIT());
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [countdown, setCountdown] = useState(60);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* budget */
  const loadBudget = useCallback(async () => {
    setBudget(p => ({ ...p, loading: true, error: null }));
    try {
      const { data, error } = await supabase.from('project_budgets').select('total_budget_cents, spent_budget_cents, status');
      if (error) throw error;
      const rows = data ?? [];
      const active = rows.filter((r: any) => r.status !== 'closed');
      const total = active.reduce((s: number, r: any) => s + Number(r.total_budget_cents ?? 0), 0) / 100;
      const spent = active.reduce((s: number, r: any) => s + Number(r.spent_budget_cents ?? 0), 0) / 100;
      const overBudgetCount = active.filter((r: any) => Number(r.spent_budget_cents ?? 0) > Number(r.total_budget_cents ?? 1)).length;
      setBudget({ data: { totalBudget: total, totalSpent: spent, utilizationPct: total > 0 ? Math.round((spent / total) * 100) : 0, activeBudgets: active.length, overBudgetCount }, loading: false, error: null });
    } catch (e: any) { setBudget({ data: null, loading: false, error: e.message }); }
  }, []);

  /* AP with aging buckets */
  const loadAP = useCallback(async () => {
    setAP(p => ({ ...p, loading: true, error: null }));
    try {
      const [vendorRes, lineRes] = await Promise.all([
        supabase.from('acct_vendors').select('id, payment_terms').limit(2000),
        supabase.from('acct_journal_lines').select('vendor_id, debit_credit, functional_amount, acct_journal_entries!inner(posting_date, status)').not('vendor_id', 'is', null).limit(5000),
      ]);
      if (lineRes.error?.code === '42P01') { setAP({ data: { outstanding: 0, vendorCount: 0, current: 0, d1_30: 0, d31_60: 0, d61_90: 0, over90: 0 }, loading: false, error: null }); return; }
      if (lineRes.error) throw lineRes.error;

      const termsMap: Record<string, number> = {};
      for (const v of (vendorRes.data ?? []) as any[]) termsMap[v.id] = v.payment_terms ?? 30;

      const byVendor: Record<string, { balance: number; dates: string[] }> = {};
      for (const l of (lineRes.data ?? []) as any[]) {
        const v = l.vendor_id as string;
        const pd = (l.acct_journal_entries as any)?.posting_date as string;
        const sign = l.debit_credit === 'CR' ? 1 : -1;
        if (!byVendor[v]) byVendor[v] = { balance: 0, dates: [] };
        byVendor[v].balance += sign * Number(l.functional_amount ?? 0);
        if (pd) byVendor[v].dates.push(pd);
      }

      let outstanding = 0, current = 0, d1_30 = 0, d31_60 = 0, d61_90 = 0, over90 = 0;
      const today = new Date();
      for (const [vid, vd] of Object.entries(byVendor)) {
        if (vd.balance <= 0) continue;
        outstanding += vd.balance;
        const oldest = vd.dates.length > 0 ? vd.dates.reduce((a, b) => (a < b ? a : b)) : null;
        if (!oldest) { current += vd.balance; continue; }
        const due = new Date(oldest);
        due.setDate(due.getDate() + (termsMap[vid] ?? 30));
        const overdue = differenceInDays(today, due);
        if (overdue <= 0) current += vd.balance;
        else if (overdue <= 30) d1_30 += vd.balance;
        else if (overdue <= 60) d31_60 += vd.balance;
        else if (overdue <= 90) d61_90 += vd.balance;
        else over90 += vd.balance;
      }
      setAP({ data: { outstanding, vendorCount: Object.values(byVendor).filter(v => v.balance > 0).length, current, d1_30, d31_60, d61_90, over90 }, loading: false, error: null });
    } catch (e: any) { setAP({ data: null, loading: false, error: e.message }); }
  }, []);

  /* fixed assets */
  const loadAssets = useCallback(async () => {
    setAssets(p => ({ ...p, loading: true, error: null }));
    try {
      const { data, error } = await supabase.from('acct_fixed_assets').select('acquisition_cost, salvage_value, useful_life_months, acquisition_date, status');
      if (error?.code === '42P01') { setAssets({ data: { totalBookValue: 0, totalCost: 0, activeCount: 0, depreciatedPct: 0 }, loading: false, error: null }); return; }
      if (error) throw error;
      const active = (data ?? []).filter((a: any) => a.status === 'active');
      const now = new Date();
      let totalBookValue = 0, totalCost = 0;
      for (const a of active as any[]) {
        const cost = Number(a.acquisition_cost); const salvage = Number(a.salvage_value); const life = Number(a.useful_life_months);
        totalCost += cost;
        const elapsed = Math.min(Math.max(0, Math.floor((now.getTime() - new Date(a.acquisition_date).getTime()) / (1000 * 60 * 60 * 24 * 30))), life);
        totalBookValue += Math.max(cost - (life > 0 ? ((cost - salvage) / life) * elapsed : 0), salvage);
      }
      const depreciatedPct = totalCost > 0 ? Math.round(((totalCost - totalBookValue) / totalCost) * 100) : 0;
      setAssets({ data: { totalBookValue, totalCost, activeCount: active.length, depreciatedPct }, loading: false, error: null });
    } catch (e: any) { setAssets({ data: null, loading: false, error: e.message }); }
  }, []);

  /* journals — counts + recent */
  const loadJournals = useCallback(async () => {
    setJournals(p => ({ ...p, loading: true, error: null }));
    try {
      const [countRes, recentRes] = await Promise.all([
        supabase.from('acct_journal_entries').select('status').limit(5000),
        supabase.from('acct_journal_entries').select('id, posting_date, description_en, status, acct_journal_lines(functional_amount, debit_credit)').order('posting_date', { ascending: false }).limit(8),
      ]);
      if (countRes.error?.code === '42P01') { setJournals({ data: { draftCount: 0, pendingCount: 0, postedCount: 0, recent: [] }, loading: false, error: null }); return; }
      if (countRes.error) throw countRes.error;
      const entries = (countRes.data ?? []) as any[];
      const draftCount = entries.filter(e => e.status === 'draft').length;
      const pendingCount = entries.filter(e => e.status === 'pending_approval').length;
      const postedCount = entries.filter(e => e.status === 'posted').length;
      const recent = ((recentRes.data ?? []) as any[]).map(j => {
        const lines: any[] = j.acct_journal_lines ?? [];
        const amount = lines.filter((l: any) => l.debit_credit === 'DR').reduce((s: number, l: any) => s + Number(l.functional_amount ?? 0), 0);
        return { id: j.id, date: j.posting_date, desc: j.description_en || 'Journal Entry', amount, status: j.status };
      });
      setJournals({ data: { draftCount, pendingCount, postedCount, recent }, loading: false, error: null });
    } catch (e: any) { setJournals({ data: null, loading: false, error: e.message }); }
  }, []);

  /* monthly expense spend */
  const loadMonthlySpend = useCallback(async () => {
    setMonthlySpend(p => ({ ...p, loading: true, error: null }));
    try {
      const months = Array.from({ length: 6 }, (_, i) => {
        const d = subMonths(new Date(), 5 - i);
        return { label: format(d, 'MMM yy'), start: format(startOfMonth(d), 'yyyy-MM-dd'), end: format(endOfMonth(d), 'yyyy-MM-dd') };
      });
      const results: MonthlySpend[] = [];
      for (const m of months) {
        const { data } = await supabase.from('acct_journal_lines')
          .select('functional_amount, debit_credit, acct_accounts!inner(account_type), acct_journal_entries!inner(posting_date, status)')
          .eq('acct_accounts.account_type', 'expense')
          .eq('acct_journal_entries.status', 'posted')
          .gte('acct_journal_entries.posting_date', m.start)
          .lte('acct_journal_entries.posting_date', m.end);
        const total = ((data ?? []) as any[]).reduce((s, l) => s + (l.debit_credit === 'DR' ? Number(l.functional_amount ?? 0) : 0), 0);
        results.push({ month: m.label, amount: total });
      }
      setMonthlySpend({ data: results, loading: false, error: null });
    } catch { setMonthlySpend({ data: [], loading: false, error: null }); }
  }, []);

  /* purchase orders */
  const loadPOs = useCallback(async () => {
    setPOs(p => ({ ...p, loading: true, error: null }));
    try {
      const { data, error } = await supabase.from('acct_purchase_orders').select('amount, status').limit(2000);
      if (error?.code === '42P01') { setPOs({ data: { pendingCount: 0, pendingAmount: 0, draftCount: 0, approvedCount: 0 }, loading: false, error: null }); return; }
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const pending = rows.filter(r => ['submitted'].includes(r.status));
      const draft = rows.filter(r => r.status === 'draft');
      const approved = rows.filter(r => r.status === 'approved');
      setPOs({ data: { pendingCount: pending.length, pendingAmount: pending.reduce((s, r) => s + Number(r.amount ?? 0), 0), draftCount: draft.length, approvedCount: approved.length }, loading: false, error: null });
    } catch (e: any) { setPOs({ data: null, loading: false, error: e.message }); }
  }, []);

  /* module status probe */
  const loadModules = useCallback(async () => {
    setModules(p => ({ ...p, loading: true, error: null }));
    const check = async (table: string) => { const { error } = await supabase.from(table as any).select('id').limit(1); return !error || error.code !== '42P01'; };
    const [journals, vendors, assets, purchaseOrders, fiscalPeriods] = await Promise.all([
      check('acct_journal_entries'), check('acct_vendors'), check('acct_fixed_assets'), check('acct_purchase_orders'), check('acct_fiscal_periods'),
    ]);
    setModules({ data: { journals, vendors, assets, purchaseOrders, fiscalPeriods }, loading: false, error: null });
  }, []);

  const loadAll = useCallback(() => {
    setLastRefresh(new Date());
    setCountdown(60);
    void loadBudget(); void loadAP(); void loadAssets();
    void loadJournals(); void loadMonthlySpend(); void loadPOs(); void loadModules();
  }, [loadBudget, loadAP, loadAssets, loadJournals, loadMonthlySpend, loadPOs, loadModules]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  /* auto-refresh every 60 s */
  useEffect(() => {
    countdownRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { loadAll(); return 60; }
        return c - 1;
      });
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [loadAll]);

  if (authLoading) return <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!allowed) return <Navigate to="/" replace />;

  const spendTrend = monthlySpend.data ?? [];
  const health = calcHealth(budget.data, ap.data, journals.data, modules.data);

  /* alerts */
  const alerts: { icon: React.ElementType; color: string; label: string; action: string; href: string }[] = [];
  if (journals.data && journals.data.draftCount > 0)
    alerts.push({ icon: FileText, color: 'text-amber-500', label: `${journals.data.draftCount} draft journal entr${journals.data.draftCount === 1 ? 'y' : 'ies'} awaiting review and posting`, action: 'Review', href: '/accounting/journals' });
  if (journals.data && journals.data.pendingCount > 0)
    alerts.push({ icon: Clock, color: 'text-orange-500', label: `${journals.data.pendingCount} journal entr${journals.data.pendingCount === 1 ? 'y' : 'ies'} pending approval`, action: 'Approve', href: '/accounting/journals' });
  if (pos.data && pos.data.pendingCount > 0)
    alerts.push({ icon: ShoppingCart, color: 'text-violet-500', label: `${pos.data.pendingCount} purchase order${pos.data.pendingCount === 1 ? '' : 's'} submitted and awaiting approval`, action: 'Review', href: '/accounting/purchase-orders' });
  if (budget.data && budget.data.overBudgetCount > 0)
    alerts.push({ icon: AlertTriangle, color: 'text-rose-500', label: `${budget.data.overBudgetCount} budget${budget.data.overBudgetCount === 1 ? '' : 's'} are over 100% utilization`, action: 'View', href: '/budget' });
  if (ap.data && ap.data.over90 > 0)
    alerts.push({ icon: XCircle, color: 'text-rose-600', label: `${formatNumber(ap.data.over90, 0)} in AP balances overdue by more than 90 days`, action: 'AP Aging', href: '/accounting/ap-aging' });

  const apTotal = ap.data ? ap.data.outstanding : 0;

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl" data-testid="finance-dashboard">

      {/* ── header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-11 w-11 rounded-xl bg-gradient-to-br from-blue-700 to-indigo-800 text-white shrink-0 shadow-sm">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">Finance Dashboard</h1>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-400 text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20">
                <span className="mr-1 h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />LIVE
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm">لوحة المالية التنفيذية — Consolidated accounting overview</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* health score */}
          <div className="text-right hidden sm:block">
            <div className="text-[10px] text-muted-foreground">Financial Health</div>
            <div className={cn('text-xl font-bold tabular-nums', health.color)}>
              {health.grade} <span className="text-sm font-normal">({health.score})</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Button variant="outline" size="sm" onClick={loadAll} data-testid="button-refresh">
              <RefreshCw className="h-4 w-4 mr-1" />Refresh
            </Button>
            <div className="text-[10px] text-muted-foreground text-right">
              {format(lastRefresh, 'HH:mm:ss')} · auto in {countdown}s
            </div>
          </div>
        </div>
      </div>

      {/* ── alerts ── */}
      {alerts.length > 0 && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">{alerts.length} item{alerts.length !== 1 ? 's' : ''} need attention</span>
          </div>
          <div className="space-y-1.5">
            {alerts.map((a, i) => <AlertItem key={i} {...a} />)}
          </div>
        </div>
      )}

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
        <KpiCard
          title="Budget Utilization"
          titleAr="نسبة استخدام الميزانية"
          value={budget.data ? `${budget.data.utilizationPct}%` : '—'}
          sub={budget.data ? `${formatNumber(budget.data.totalSpent, 0)} of ${formatNumber(budget.data.totalBudget, 0)} spent` : undefined}
          icon={TrendingUp}
          accent={budget.data && budget.data.utilizationPct > 90 ? 'bg-rose-600' : 'bg-blue-600'}
          href="/budget"
          loading={budget.loading}
          error={budget.error}
          trend={budget.data && budget.data.utilizationPct > 80 ? 'up' : null}
          alert={budget.data ? budget.data.utilizationPct > 90 : false}
        />
        <KpiCard
          title="AP Outstanding"
          titleAr="مستحقات الموردين"
          value={ap.data ? formatNumber(ap.data.outstanding, 0) : '—'}
          sub={ap.data ? `${ap.data.vendorCount} vendor${ap.data.vendorCount !== 1 ? 's' : ''} with open balances` : undefined}
          icon={Clock}
          accent="bg-rose-600"
          href="/accounting/ap-aging"
          loading={ap.loading}
          error={ap.error}
          alert={ap.data ? ap.data.over90 > 0 : false}
        />
        <KpiCard
          title="Asset Book Value"
          titleAr="القيمة الدفترية للأصول"
          value={assets.data ? formatNumber(assets.data.totalBookValue, 0) : '—'}
          sub={assets.data ? `${assets.data.activeCount} active · ${assets.data.depreciatedPct}% depreciated` : undefined}
          icon={Package}
          accent="bg-slate-700"
          href="/accounting/fixed-assets"
          loading={assets.loading}
          error={assets.error}
        />
        <KpiCard
          title="Open POs (Submitted)"
          titleAr="طلبات الشراء المفتوحة"
          value={pos.data ? String(pos.data.pendingCount) : '—'}
          sub={pos.data ? `${formatNumber(pos.data.pendingAmount, 0)} pending · ${pos.data.draftCount} draft` : undefined}
          icon={ShoppingCart}
          accent="bg-violet-600"
          href="/accounting/purchase-orders"
          loading={pos.loading}
          error={pos.error}
          alert={pos.data ? pos.data.pendingCount > 0 : false}
        />
        <KpiCard
          title="Draft Journals"
          titleAr="القيود المسودة"
          value={journals.data ? String(journals.data.draftCount + journals.data.pendingCount) : '—'}
          sub={journals.data ? `${journals.data.draftCount} draft · ${journals.data.pendingCount} pending · ${journals.data.postedCount} posted` : undefined}
          icon={FileText}
          accent={journals.data && (journals.data.draftCount + journals.data.pendingCount) > 0 ? 'bg-amber-600' : 'bg-emerald-600'}
          href="/accounting/journals"
          loading={journals.loading}
          error={journals.error}
          alert={journals.data ? (journals.data.draftCount + journals.data.pendingCount) > 5 : false}
        />
        <KpiCard
          title="Active Project Budgets"
          titleAr="الميزانيات النشطة"
          value={budget.data ? String(budget.data.activeBudgets) : '—'}
          sub={budget.data && budget.data.overBudgetCount > 0 ? `⚠ ${budget.data.overBudgetCount} over budget` : 'All within budget'}
          icon={DollarSign}
          accent="bg-emerald-600"
          href="/budget"
          loading={budget.loading}
          error={budget.error}
          alert={budget.data ? budget.data.overBudgetCount > 0 : false}
        />
      </div>

      {/* ── charts + journals ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-5">

        {/* expense trend */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">6-Month Expense Trend</CardTitle>
              <Link to="/accounting/cash-flow" className="text-xs text-primary hover:underline flex items-center gap-1">Cash Flow <ArrowRight className="h-3 w-3" /></Link>
            </div>
          </CardHeader>
          <CardContent>
            {monthlySpend.loading ? (
              <div className="flex items-center justify-center h-40"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : spendTrend.every(d => d.amount === 0) ? (
              <div className="h-40 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <Activity className="h-8 w-8 opacity-30" />
                <span className="text-sm">No posted expense entries yet</span>
                <span className="text-xs">Post journal entries to see the trend</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={spendTrend} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 9 }} tickFormatter={v => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)} width={42} />
                  <Tooltip formatter={(v: number) => [formatNumber(v), 'Expenses']} />
                  <Area type="monotone" dataKey="amount" stroke="#6366f1" fill="url(#expGrad)" strokeWidth={2} dot={{ r: 3, fill: '#6366f1' }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* AP Aging + journal tabs */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-0 pt-4">
            <CardTitle className="text-sm">AP Aging & Journals</CardTitle>
          </CardHeader>
          <CardContent className="pt-2 pb-3">
            <Tabs defaultValue="aging">
              <TabsList className="h-7 text-[11px] mb-3">
                <TabsTrigger value="aging" className="h-6 px-2">AP Aging</TabsTrigger>
                <TabsTrigger value="journals" className="h-6 px-2">Recent Entries</TabsTrigger>
              </TabsList>

              <TabsContent value="aging" className="mt-0">
                {ap.loading ? (
                  <div className="flex items-center justify-center h-32"><Loader2 className="h-4 w-4 animate-spin" /></div>
                ) : ap.error ? (
                  <div className="text-xs text-amber-600 text-center py-8">Run acct_vendors migration to enable AP</div>
                ) : ap.data && ap.data.outstanding === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
                    <CheckCircle2 className="h-7 w-7 text-emerald-500 opacity-70" />
                    <span className="text-xs">No outstanding AP balances</span>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <AgingBar label="Current" value={ap.data?.current ?? 0} total={apTotal} color="bg-emerald-500" />
                    <AgingBar label="1–30d" value={ap.data?.d1_30 ?? 0} total={apTotal} color="bg-lime-500" />
                    <AgingBar label="31–60d" value={ap.data?.d31_60 ?? 0} total={apTotal} color="bg-amber-500" />
                    <AgingBar label="61–90d" value={ap.data?.d61_90 ?? 0} total={apTotal} color="bg-orange-500" />
                    <AgingBar label="90d+" value={ap.data?.over90 ?? 0} total={apTotal} color="bg-rose-600" />
                    <div className="pt-1 border-t text-[10px] flex justify-between text-muted-foreground">
                      <span>Total outstanding</span>
                      <span className="font-medium text-foreground tabular-nums">{formatNumber(apTotal, 0)}</span>
                    </div>
                    <Link to="/accounting/ap-aging" className="text-xs text-primary hover:underline flex items-center gap-1 justify-end"><span>Full AP Aging</span><ArrowRight className="h-3 w-3" /></Link>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="journals" className="mt-0 -mx-2">
                {journals.loading ? (
                  <div className="flex items-center justify-center h-32"><Loader2 className="h-4 w-4 animate-spin" /></div>
                ) : !journals.data || journals.data.recent.length === 0 ? (
                  <div className="text-center text-xs text-muted-foreground py-10">No journal entries yet</div>
                ) : (
                  <div className="divide-y">
                    {journals.data.recent.map(j => (
                      <div key={j.id} className="flex items-start justify-between gap-2 px-3 py-2 hover:bg-muted/20">
                        <div className="min-w-0">
                          <div className="text-xs font-medium truncate">{j.desc}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-muted-foreground">{j.date ? format(parseISO(j.date), 'dd MMM yy') : '—'}</span>
                            <Badge variant="outline" className={cn('text-[9px] px-1 py-0 h-4',
                              j.status === 'posted' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                              j.status === 'pending_approval' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                              'bg-slate-50 text-slate-600 border-slate-200')}>{j.status}</Badge>
                          </div>
                        </div>
                        <div className="text-xs tabular-nums text-right shrink-0">{formatNumber(j.amount, 0)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* ── quick links ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-5">
        {[
          { label: 'General Ledger', sub: 'Transaction history', href: '/accounting/ledger', icon: BookOpen, color: 'text-blue-600 dark:text-blue-400' },
          { label: 'Financial Statements', sub: 'Income & Balance Sheet', href: '/accounting/reports', icon: TrendingUp, color: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Budget vs. Actual', sub: 'Variance analysis', href: '/accounting/budget-variance', icon: BarChart3, color: 'text-violet-600 dark:text-violet-400' },
          { label: 'Bank Reconciliation', sub: 'Statement matching', href: '/accounting/bank-recon', icon: Activity, color: 'text-indigo-600 dark:text-indigo-400' },
          { label: 'Cash Flow', sub: '6-month projection', href: '/accounting/cash-flow', icon: TrendingDown, color: 'text-sky-600 dark:text-sky-400' },
          { label: 'Vendor Registry', sub: 'Manage suppliers', href: '/accounting/vendors', icon: Zap, color: 'text-rose-600 dark:text-rose-400' },
        ].map(l => (
          <Link key={l.href} to={l.href}>
            <Card className="hover:shadow-sm transition-shadow cursor-pointer h-full">
              <CardContent className="py-3 px-3">
                <l.icon className={cn('h-4 w-4 mb-1.5', l.color)} />
                <div className="text-xs font-semibold leading-tight">{l.label}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{l.sub}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* ── module status ── */}
      <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Module Status</span>
        </div>
        {modules.loading ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Checking…</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <ModulePill label="Journal Entries" active={modules.data?.journals ?? false} />
            <ModulePill label="Vendors / AP" active={modules.data?.vendors ?? false} />
            <ModulePill label="Fixed Assets" active={modules.data?.assets ?? false} />
            <ModulePill label="Purchase Orders" active={modules.data?.purchaseOrders ?? false} />
            <ModulePill label="Fiscal Periods" active={modules.data?.fiscalPeriods ?? false} />
          </div>
        )}
        {modules.data && Object.values(modules.data).some(v => !v) && (
          <p className="text-[10px] text-muted-foreground mt-2">Modules showing ⚠ need their SQL migration applied in the Supabase SQL Editor.</p>
        )}
      </div>
    </div>
  );
}
