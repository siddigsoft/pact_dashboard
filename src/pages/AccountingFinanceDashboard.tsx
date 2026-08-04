import { useMemo } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAppContext } from '@/context/AppContext';
import { fetchAccountingFinanceKpis } from '@/services/accountingFinanceKpis';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageLoader } from '@/components/ui/page-loader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Loader2, RefreshCw, TrendingUp, TrendingDown, DollarSign, Package,
  Clock, BookOpen, ArrowRight, AlertTriangle, Activity, BarChart3,
  CheckCircle2, XCircle, FileText, ShoppingCart, Zap, ChevronRight,
  Landmark, Wallet, Scale, CalendarDays, Layers, Settings2, ListOrdered,
  CreditCard, PiggyBank, Receipt, ArrowUpDown, ShieldAlert, Lock,
  Award, RotateCcw, Building2, ClipboardList, ArrowLeftRight, Heart, Shield, Banknote,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { formatNumber } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  BarChart, Bar, Cell, Legend,
} from 'recharts';

/* ─── types ─────────────────────────────────────────────────────────── */
interface KPIState<T> { data: T | null; loading: boolean; error: string | null }

interface BudgetKPI { totalBudget: number; totalSpent: number; utilizationPct: number; activeBudgets: number; overBudgetCount: number }
interface APSummary { outstanding: number; vendorCount: number; current: number; d1_30: number; d31_60: number; d61_90: number; over90: number }
interface AssetKPI { totalBookValue: number; totalCost: number; activeCount: number; depreciatedPct: number }
interface JournalSummary { draftCount: number; pendingCount: number; postedCount: number; recent: { id: string; date: string; desc: string; amount: number; status: string }[] }
interface MonthlyRevenueExpense { month: string; revenue: number; expense: number }
interface POSummary { pendingCount: number; pendingAmount: number; draftCount: number; approvedCount: number }
interface CashKPI { totalCash: number; accountCount: number; unreconciledCount: number }
interface RevenueKPI { totalRevenue: number; totalExpense: number; netIncome: number; ytdRevenue: number }
interface COAStatus { accountCount: number; fundCount: number; fiscalPeriodCount: number; activePeriod: string | null }
interface ModuleEntry { active: boolean; count: number }
interface ModuleStatus {
  coa: ModuleEntry; journals: ModuleEntry; journalLines: ModuleEntry;
  vendors: ModuleEntry; assets: ModuleEntry; purchaseOrders: ModuleEntry;
  fiscalPeriods: ModuleEntry; bankAccounts: ModuleEntry; funds: ModuleEntry;
  bankRecon: ModuleEntry;
}
interface Phase4KPI {
  sodViolations: number;
  openEncumbranceTotal: number;
  openEncumbranceCount: number;
  activeTaxCodes: number;
  periodCloseStatus: string | null;
}

interface Phase5KPI {
  activeGrants: number;
  totalGrantAwarded: number;
  lastDeprRunDate: string | null;
  lastDeprRunAmount: number;
  allocationRunsThisMonth: number;
  entityCount: number;
}

/* ─── health score ───────────────────────────────────────────────────── */
function calcHealth(
  budget: BudgetKPI | null,
  ap: APSummary | null,
  journals: JournalSummary | null,
  revenue: RevenueKPI | null,
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
  if (revenue) {
    if (revenue.netIncome < 0) score -= 10;
  }
  if (modules) {
    const active = Object.values(modules).filter(m => m.active).length;
    const total = Object.keys(modules).length;
    if (active < total * 0.5) score -= 15;
    else if (active < total * 0.8) score -= 5;
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

/* ─── section heading ────────────────────────────────────────────────── */
function SectionHeading({ label, labelAr }: { label: string; labelAr: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{label}</span>
      <span className="text-[10px] text-muted-foreground" dir="rtl">{labelAr}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

/* ─── quick link card ────────────────────────────────────────────────── */
function QuickLink({ href, icon: Icon, color, label, sub }: { href: string; icon: React.ElementType; color: string; label: string; sub: string }) {
  return (
    <Link to={href}>
      <Card className="hover:shadow-sm transition-shadow cursor-pointer h-full">
        <CardContent className="py-3 px-3">
          <Icon className={cn('h-4 w-4 mb-1.5', color)} />
          <div className="text-xs font-semibold leading-tight">{label}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{sub}</div>
        </CardContent>
      </Card>
    </Link>
  );
}

/* ─── main component ─────────────────────────────────────────────────── */
export default function AccountingFinanceDashboard() {
  const { authReady } = useAppContext();
  const { hasAnyRole } = useAuthorization();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);

  const {
    data: kpis,
    isLoading,
    isFetching,
    error,
    refetch,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ['accounting', 'finance-kpis'],
    queryFn: fetchAccountingFinanceKpis,
    enabled: authReady && allowed,
    staleTime: 1000 * 60 * 2,
  });

  const errMsg = error ? (error as Error).message : null;
  const wrap = <T,>(d: T | null | undefined): KPIState<T> => ({
    data: d ?? null,
    loading: isLoading,
    error: errMsg,
  });

  const budget = wrap(kpis?.budget);
  const ap = wrap(kpis?.ap);
  const assets = wrap(kpis?.assets);
  const journals = wrap(kpis?.journals);
  const monthlyRevExp = wrap(kpis?.monthlyRevExp ?? []);
  const pos = wrap(kpis?.pos);
  const cash = wrap(kpis?.cash);
  const revenue = wrap(kpis?.revenue);
  const coa = wrap(kpis?.coa);
  const modules = wrap(kpis?.modules);
  const phase4 = wrap(kpis?.phase4);
  const phase5 = wrap(kpis?.phase5);
  const preFundKPI = wrap(kpis?.preFund ?? null);
  const lastRefresh = useMemo(
    () => (dataUpdatedAt ? new Date(dataUpdatedAt) : new Date()),
    [dataUpdatedAt]
  );

  if (!authReady) return <PageLoader label="Checking session…" />;
  if (!allowed) return <Navigate to="/" replace />;

  const revExpTrend = monthlyRevExp.data ?? [];
  const hasRevExpData = revExpTrend.some(d => d.revenue > 0 || d.expense > 0);
  const health = calcHealth(budget.data, ap.data, journals.data, revenue.data, modules.data);
  const activeModules = modules.data ? Object.values(modules.data).filter(m => m.active).length : 0;
  const totalModules = modules.data ? Object.keys(modules.data).length : 10;

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
  if (cash.data && cash.data.unreconciledCount > 20)
    alerts.push({ icon: Landmark, color: 'text-indigo-500', label: `${cash.data.unreconciledCount} bank transactions are unreconciled`, action: 'Reconcile', href: '/accounting/bank-recon' });
  if (revenue.data && revenue.data.netIncome < 0)
    alerts.push({ icon: TrendingDown, color: 'text-rose-500', label: `Net loss of ${formatNumber(Math.abs(revenue.data.netIncome), 0)} YTD — review expense vs revenue`, action: 'Statements', href: '/accounting/reports' });

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
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">Accounting Dashboard</h1>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-400 text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20">
                <span className="mr-1 h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />LIVE
              </Badge>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-slate-300 text-slate-500">
                {activeModules}/{totalModules} modules active
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm">لوحة المحاسبة التنفيذية — Consolidated accounting & finance overview</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-[10px] text-muted-foreground">Financial Health</div>
            <div className={cn('text-xl font-bold tabular-nums', health.color)}>
              {health.grade} <span className="text-sm font-normal">({health.score})</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching} data-testid="button-refresh">
              <RefreshCw className={cn('h-4 w-4 mr-1', isFetching && 'animate-spin')} />Refresh
            </Button>
            <div className="text-[10px] text-muted-foreground text-right">
              {format(lastRefresh, 'HH:mm:ss')}
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

      {/* ── KPI row 1: Core financial metrics ── */}
      <SectionHeading label="Core Financial Metrics" labelAr="المؤشرات المالية الأساسية" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KpiCard
          title="YTD Revenue"
          titleAr="إيرادات السنة"
          value={revenue.data ? formatNumber(revenue.data.totalRevenue, 0) : '—'}
          sub={revenue.data ? `${formatNumber(revenue.data.totalExpense, 0)} expenses YTD` : undefined}
          icon={TrendingUp}
          accent="bg-emerald-600"
          href="/accounting/reports"
          loading={revenue.loading}
          error={revenue.error}
          trend={revenue.data && revenue.data.totalRevenue > revenue.data.totalExpense ? 'down' : null}
        />
        <KpiCard
          title="Net Income / Loss"
          titleAr="صافي الدخل / الخسارة"
          value={revenue.data ? formatNumber(revenue.data.netIncome, 0) : '—'}
          sub={revenue.data ? (revenue.data.netIncome >= 0 ? 'Surplus YTD' : 'Deficit YTD') : undefined}
          icon={Scale}
          accent={revenue.data && revenue.data.netIncome < 0 ? 'bg-rose-600' : 'bg-teal-600'}
          href="/accounting/reports"
          loading={revenue.loading}
          error={revenue.error}
          alert={revenue.data ? revenue.data.netIncome < 0 : false}
          trend={revenue.data && revenue.data.netIncome < 0 ? 'up' : null}
        />
        <KpiCard
          title="Cash Position"
          titleAr="الوضع النقدي"
          value={cash.data ? formatNumber(cash.data.totalCash, 0) : '—'}
          sub={cash.data ? `${cash.data.accountCount} bank account${cash.data.accountCount !== 1 ? 's' : ''}${cash.data.unreconciledCount > 0 ? ` · ${cash.data.unreconciledCount} unreconciled` : ''}` : undefined}
          icon={Wallet}
          accent="bg-sky-600"
          href="/accounting/bank-recon"
          loading={cash.loading}
          error={cash.error}
          alert={cash.data ? cash.data.unreconciledCount > 20 : false}
        />
        <KpiCard
          title="Budget Utilization"
          titleAr="نسبة استخدام الميزانية"
          value={budget.data ? `${budget.data.utilizationPct}%` : '—'}
          sub={budget.data ? `${formatNumber(budget.data.totalSpent, 0)} of ${formatNumber(budget.data.totalBudget, 0)} spent` : undefined}
          icon={BarChart3}
          accent={budget.data && budget.data.utilizationPct > 90 ? 'bg-rose-600' : 'bg-blue-600'}
          href="/budget"
          loading={budget.loading}
          error={budget.error}
          trend={budget.data && budget.data.utilizationPct > 80 ? 'up' : null}
          alert={budget.data ? budget.data.utilizationPct > 90 : false}
        />
      </div>

      {/* ── KPI row 2: Operations ── */}
      <SectionHeading label="Operational Overview" labelAr="نظرة عملية" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
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

      {/* ── KPI row 3: GL & Setup ── */}
      <SectionHeading label="GL & System Setup" labelAr="دفتر الأستاذ والإعداد" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KpiCard
          title="Chart of Accounts"
          titleAr="دليل الحسابات"
          value={coa.data ? String(coa.data.accountCount) : '—'}
          sub={coa.data ? `${coa.data.accountCount} accounts defined` : undefined}
          icon={ListOrdered}
          accent="bg-indigo-600"
          href="/accounting/coa"
          loading={coa.loading}
          error={coa.error}
        />
        <KpiCard
          title="Active Fiscal Period"
          titleAr="الفترة المالية الحالية"
          value={coa.data ? (coa.data.activePeriod ?? 'None') : '—'}
          sub={coa.data ? `${coa.data.fiscalPeriodCount} periods configured` : undefined}
          icon={CalendarDays}
          accent={coa.data && !coa.data.activePeriod ? 'bg-amber-600' : 'bg-teal-700'}
          href="/accounting/fiscal-years"
          loading={coa.loading}
          error={coa.error}
          alert={coa.data ? !coa.data.activePeriod : false}
        />
        <KpiCard
          title="Funds Registry"
          titleAr="سجل الصناديق"
          value={coa.data ? String(coa.data.fundCount) : '—'}
          sub={coa.data ? `${coa.data.fundCount} fund${coa.data.fundCount !== 1 ? 's' : ''} registered` : undefined}
          icon={PiggyBank}
          accent="bg-cyan-600"
          href="/accounting/funds"
          loading={coa.loading}
          error={coa.error}
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
      </div>

      {/* ── KPI row 4: Phase 4 Advanced Controls ── */}
      <SectionHeading label="Advanced Controls" labelAr="الضوابط المتقدمة" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KpiCard
          title="SOD Violations"
          titleAr="انتهاكات الفصل"
          value={phase4.data ? String(phase4.data.sodViolations) : '—'}
          sub={phase4.data ? (phase4.data.sodViolations === 0 ? 'No self-approvals detected' : `${phase4.data.sodViolations} self-approved entr${phase4.data.sodViolations === 1 ? 'y' : 'ies'}`) : undefined}
          icon={ShieldAlert}
          accent={phase4.data && phase4.data.sodViolations > 0 ? 'bg-rose-600' : 'bg-emerald-600'}
          href="/accounting/sod"
          loading={phase4.loading}
          error={phase4.error}
          alert={phase4.data ? phase4.data.sodViolations > 0 : false}
        />
        <KpiCard
          title="Open Encumbrances"
          titleAr="الالتزامات المفتوحة"
          value={phase4.data ? String(phase4.data.openEncumbranceCount) : '—'}
          sub={phase4.data ? `${formatNumber(phase4.data.openEncumbranceTotal, 0)} committed` : undefined}
          icon={Lock}
          accent={phase4.data && phase4.data.openEncumbranceCount > 0 ? 'bg-amber-600' : 'bg-slate-600'}
          href="/accounting/budget-encumbrance"
          loading={phase4.loading}
          error={phase4.error}
        />
        <KpiCard
          title="Active Tax Codes"
          titleAr="رموز الضريبة النشطة"
          value={phase4.data ? String(phase4.data.activeTaxCodes) : '—'}
          sub={phase4.data ? (phase4.data.activeTaxCodes === 0 ? 'Run Phase 4 migration' : `VAT / WHT / Customs configured`) : undefined}
          icon={Receipt}
          accent={phase4.data && phase4.data.activeTaxCodes === 0 ? 'bg-amber-600' : 'bg-indigo-600'}
          href="/accounting/tax"
          loading={phase4.loading}
          error={phase4.error}
        />
        <KpiCard
          title="Last Period Close"
          titleAr="آخر إغلاق دوري"
          value={phase4.data ? (phase4.data.periodCloseStatus ?? 'None') : '—'}
          sub={phase4.data ? (phase4.data.periodCloseStatus ? `Latest close status` : 'No close events logged yet') : undefined}
          icon={CalendarDays}
          accent={phase4.data && phase4.data.periodCloseStatus === 'locked' ? 'bg-slate-700' : phase4.data && phase4.data.periodCloseStatus ? 'bg-teal-600' : 'bg-gray-500'}
          href="/accounting/period-close"
          loading={phase4.loading}
          error={phase4.error}
        />
      </div>

      {/* ── KPI row 5: Phase 5 Expansion ── */}
      <SectionHeading label="Grants, Depreciation & Consolidation" labelAr="المنح والاستهلاك والتوحيد" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KpiCard
          title="Active Grants"
          titleAr="المنح النشطة"
          value={phase5.data ? String(phase5.data.activeGrants) : '—'}
          sub={phase5.data ? (phase5.data.activeGrants === 0 ? 'No active grants' : `${formatNumber(phase5.data.totalGrantAwarded, 0)} total awarded`) : undefined}
          icon={Award}
          accent={phase5.data && phase5.data.activeGrants > 0 ? 'bg-amber-600' : 'bg-slate-500'}
          href="/accounting/grants"
          loading={phase5.loading}
          error={phase5.error}
        />
        <KpiCard
          title="Last Depreciation Run"
          titleAr="آخر جولة إهلاك"
          value={phase5.data ? (phase5.data.lastDeprRunDate ?? 'None') : '—'}
          sub={phase5.data ? (phase5.data.lastDeprRunDate ? `${formatNumber(phase5.data.lastDeprRunAmount, 0)} posted` : 'No runs yet — open Depreciation Run') : undefined}
          icon={RotateCcw}
          accent={phase5.data && !phase5.data.lastDeprRunDate ? 'bg-amber-600' : 'bg-slate-700'}
          href="/accounting/depreciation-run"
          loading={phase5.loading}
          error={phase5.error}
          alert={phase5.data ? !phase5.data.lastDeprRunDate : false}
        />
        <KpiCard
          title="Allocation Runs (Month)"
          titleAr="جولات التوزيع"
          value={phase5.data ? String(phase5.data.allocationRunsThisMonth) : '—'}
          sub={phase5.data ? (phase5.data.allocationRunsThisMonth === 0 ? 'No runs this month' : `Overhead allocated to programs`) : undefined}
          icon={Zap}
          accent={phase5.data && phase5.data.allocationRunsThisMonth > 0 ? 'bg-violet-600' : 'bg-slate-500'}
          href="/accounting/cost-allocation"
          loading={phase5.loading}
          error={phase5.error}
        />
        <KpiCard
          title="Entities in GL"
          titleAr="الكيانات في دفتر الأستاذ"
          value={phase5.data ? String(phase5.data.entityCount) : '—'}
          sub={phase5.data ? (phase5.data.entityCount >= 2 ? 'Multi-entity — view Consolidation' : phase5.data.entityCount === 1 ? 'Single entity' : 'Assign country_id to accounts') : undefined}
          icon={Building2}
          accent={phase5.data && phase5.data.entityCount >= 2 ? 'bg-teal-700' : 'bg-slate-500'}
          href="/accounting/consolidation"
          loading={phase5.loading}
          error={phase5.error}
        />
      </div>

      {/* ── KPI row 6: Pre-Funding ── */}
      {preFundKPI.error !== 'table_missing' && (
        <>
          <SectionHeading label="Pre-Funding" labelAr="التمويل المسبق" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <KpiCard
              title="Active Pre-Funds"
              titleAr="الصناديق المسبقة النشطة"
              value={preFundKPI.data ? String(preFundKPI.data.activeCount) : '—'}
              sub={preFundKPI.data ? `${preFundKPI.data.activeCount} fund${preFundKPI.data.activeCount !== 1 ? 's' : ''} active` : undefined}
              icon={Banknote}
              accent="bg-sky-600"
              href="/pre-funding?tab=overview"
              loading={preFundKPI.loading}
              error={preFundKPI.data === null && !preFundKPI.loading && preFundKPI.error !== null && preFundKPI.error !== 'table_missing' ? preFundKPI.error : null}
            />
            <KpiCard
              title="Total Available Balance"
              titleAr="إجمالي الرصيد المتاح"
              value={preFundKPI.data ? formatNumber(preFundKPI.data.totalAvailable, 0) : '—'}
              sub="USD-equivalent total (FX-converted) — see Pre-Funding for per-currency detail"
              icon={DollarSign}
              accent={preFundKPI.data && preFundKPI.data.lowBalanceCount > 0 ? 'bg-orange-600' : 'bg-emerald-600'}
              href="/pre-funding?tab=overview"
              loading={preFundKPI.loading}
              error={preFundKPI.data === null && !preFundKPI.loading && preFundKPI.error !== null && preFundKPI.error !== 'table_missing' ? preFundKPI.error : null}
              alert={preFundKPI.data ? preFundKPI.data.lowBalanceCount > 0 : false}
            />
            <KpiCard
              title="Low Balance Alerts"
              titleAr="تنبيهات انخفاض الرصيد"
              value={preFundKPI.data ? String(preFundKPI.data.lowBalanceCount) : '—'}
              sub={preFundKPI.data ? (preFundKPI.data.lowBalanceCount === 0 ? 'All funds within threshold' : `${preFundKPI.data.lowBalanceCount} fund${preFundKPI.data.lowBalanceCount !== 1 ? 's' : ''} below threshold`) : undefined}
              icon={AlertTriangle}
              accent={preFundKPI.data && preFundKPI.data.lowBalanceCount > 0 ? 'bg-rose-600' : 'bg-emerald-600'}
              href="/pre-funding?tab=overview"
              loading={preFundKPI.loading}
              error={preFundKPI.data === null && !preFundKPI.loading && preFundKPI.error !== null && preFundKPI.error !== 'table_missing' ? preFundKPI.error : null}
              alert={preFundKPI.data ? preFundKPI.data.lowBalanceCount > 0 : false}
            />
            <KpiCard
              title="Pending Approval"
              titleAr="في انتظار الموافقة"
              value={preFundKPI.data ? String(preFundKPI.data.pendingApproval) : '—'}
              sub={preFundKPI.data ? (preFundKPI.data.pendingApproval === 0 ? 'No funds awaiting approval' : `${preFundKPI.data.pendingApproval} pending approval`) : undefined}
              icon={Clock}
              accent={preFundKPI.data && preFundKPI.data.pendingApproval > 0 ? 'bg-amber-600' : 'bg-slate-500'}
              href="/pre-funding?tab=approvals"
              loading={preFundKPI.loading}
              error={preFundKPI.data === null && !preFundKPI.loading && preFundKPI.error !== null && preFundKPI.error !== 'table_missing' ? preFundKPI.error : null}
              alert={preFundKPI.data ? preFundKPI.data.pendingApproval > 0 : false}
            />
          </div>
        </>
      )}

      {/* ── charts ── */}
      <SectionHeading label="Financial Charts" labelAr="الرسوم البيانية المالية" />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-5">

        {/* revenue vs expense chart */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Revenue vs Expenses — 6 Months</CardTitle>
              <Link to="/accounting/reports" className="text-xs text-primary hover:underline flex items-center gap-1">Statements <ArrowRight className="h-3 w-3" /></Link>
            </div>
          </CardHeader>
          <CardContent>
            {monthlyRevExp.loading ? (
              <div className="flex items-center justify-center h-44"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : !hasRevExpData ? (
              <div className="h-44 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <Activity className="h-8 w-8 opacity-30" />
                <span className="text-sm">No posted entries yet</span>
                <span className="text-xs">Post journal entries to see the trend</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={176}>
                <BarChart data={revExpTrend} margin={{ top: 4, right: 8, left: 4, bottom: 0 }} barCategoryGap="30%">
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 9 }} tickFormatter={v => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)} width={42} />
                  <Tooltip formatter={(v: number, name: string) => [formatNumber(v), name]} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="revenue" name="Revenue" fill="#10b981" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="expense" name="Expenses" fill="#f43f5e" radius={[2, 2, 0, 0]} />
                </BarChart>
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
                  <div className="flex items-center justify-center h-36"><Loader2 className="h-4 w-4 animate-spin" /></div>
                ) : ap.error ? (
                  <div className="text-xs text-amber-600 text-center py-8">Run acct_vendors migration to enable AP</div>
                ) : ap.data && ap.data.outstanding === 0 ? (
                  <div className="flex flex-col items-center justify-center h-36 gap-2 text-muted-foreground">
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
                  <div className="flex items-center justify-center h-36"><Loader2 className="h-4 w-4 animate-spin" /></div>
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
      <SectionHeading label="Core GL & Reporting" labelAr="دفتر الأستاذ والتقارير" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-2 mb-4">
        <QuickLink href="/accounting/journals"        icon={FileText}     color="text-amber-600 dark:text-amber-400"    label="Journal Entries"       sub="GL posting engine" />
        <QuickLink href="/accounting/ledger"          icon={BookOpen}     color="text-blue-600 dark:text-blue-400"      label="General Ledger"        sub="Transaction history" />
        <QuickLink href="/accounting/trial-balance"   icon={ArrowUpDown}  color="text-indigo-600 dark:text-indigo-400"  label="Trial Balance"         sub="Debit / Credit check" />
        <QuickLink href="/accounting/reports"         icon={TrendingUp}   color="text-emerald-600 dark:text-emerald-400" label="Financial Statements" sub="Income & Balance Sheet" />
        <QuickLink href="/accounting/coa"             icon={ListOrdered}  color="text-violet-600 dark:text-violet-400"  label="Chart of Accounts"     sub="Account hierarchy" />
        <QuickLink href="/accounting/fiscal-years"    icon={CalendarDays} color="text-teal-600 dark:text-teal-400"      label="Fiscal Years"          sub="Periods & close" />
        <QuickLink href="/accounting/funds"           icon={PiggyBank}    color="text-cyan-600 dark:text-cyan-400"      label="Fund Registry"         sub="Fund restrictions" />
        <QuickLink href="/accounting/gl-bridge"       icon={Zap}          color="text-fuchsia-600 dark:text-fuchsia-400" label="GL Bridge"            sub="Auto-posting engine" />
      </div>

      <SectionHeading label="Budget & Payables" labelAr="الميزانية والمدفوعات" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-2 mb-4">
        <QuickLink href="/accounting/budget-planning"  icon={PiggyBank}    color="text-purple-600 dark:text-purple-400"  label="Budget Planning"       sub="Set account targets" />
        <QuickLink href="/accounting/budget-variance"  icon={BarChart3}    color="text-purple-500 dark:text-purple-400"  label="Budget vs Actual"      sub="Variance analysis" />
        <QuickLink href="/accounting/purchase-requisitions" icon={ClipboardList} color="text-blue-600 dark:text-blue-400" label="Purchase Requisitions" sub="Internal purchase requests" />
        <QuickLink href="/accounting/purchase-orders"  icon={ShoppingCart} color="text-violet-600 dark:text-violet-400"  label="Purchase Orders"       sub="PO approvals" />
        <QuickLink href="/accounting/grn"              icon={Package}      color="text-teal-600 dark:text-teal-400"      label="Goods Receipts"        sub="3-way match GRN" />
        <QuickLink href="/accounting/ap-invoices"      icon={FileText}     color="text-rose-600 dark:text-rose-400"      label="AP Invoices"           sub="Accounts payable" />
        <QuickLink href="/accounting/cheque-register"  icon={CreditCard}   color="text-indigo-600 dark:text-indigo-400"  label="Cheque Register"       sub="Payments & cheques" />
        <QuickLink href="/accounting/vendors"          icon={Building2}    color="text-orange-600 dark:text-orange-400"  label="Vendor Registry"       sub="Manage suppliers" />
      </div>

      <SectionHeading label="Banking & Assets" labelAr="البنوك والأصول" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-2 mb-4">
        <QuickLink href="/accounting/bank-recon"       icon={Landmark}     color="text-sky-600 dark:text-sky-400"        label="Bank Reconciliation"   sub="Statement matching" />
        <QuickLink href="/accounting/cash-flow"        icon={Activity}     color="text-lime-600 dark:text-lime-400"      label="Cash Flow"             sub="6-month projection" />
        <QuickLink href="/accounting/cash-flow-forecast" icon={TrendingUp} color="text-emerald-600 dark:text-emerald-400" label="Cash Flow Forecast"   sub="12-month rolling" />
        <QuickLink href="/accounting/ap-aging"         icon={Clock}        color="text-rose-600 dark:text-rose-400"      label="AP Aging"              sub="Overdue payables" />
        <QuickLink href="/accounting/fixed-assets"     icon={Package}      color="text-slate-600 dark:text-slate-400"    label="Fixed Assets"          sub="Depreciation tracking" />
        <QuickLink href="/accounting/depreciation-run" icon={RotateCcw}    color="text-slate-500 dark:text-slate-400"    label="Depreciation Run"      sub="Batch GL posting" />
        <QuickLink href="/budget"                      icon={DollarSign}   color="text-emerald-700 dark:text-emerald-400" label="Project Budgets"      sub="Budget utilization" />
        <QuickLink href="/accounting/settings"         icon={Settings2}    color="text-gray-600 dark:text-gray-400"      label="Settings"              sub="Accounting config" />
      </div>

      <SectionHeading label="Phase 4 — Advanced Controls" labelAr="الضوابط المتقدمة" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-2 mb-4">
        <QuickLink href="/accounting/period-close"      icon={Lock}          color="text-slate-600 dark:text-slate-400"   label="Period Close"          sub="Soft / Hard / Lock" />
        <QuickLink href="/accounting/tax"               icon={Receipt}       color="text-amber-600 dark:text-amber-400"   label="Tax Management"        sub="VAT / WHT / Customs" />
        <QuickLink href="/accounting/multi-currency"    icon={ArrowLeftRight} color="text-sky-600 dark:text-sky-400"      label="Multi-Currency"        sub="FX rates & converter" />
        <QuickLink href="/accounting/budget-encumbrance" icon={Wallet}       color="text-violet-600 dark:text-violet-400" label="Budget Encumbrance"    sub="Commitment accounting" />
        <QuickLink href="/accounting/sod"               icon={ShieldAlert}   color="text-rose-600 dark:text-rose-400"     label="Segregation of Duties" sub="Self-approval detection" />
        <QuickLink href="/accounting/donor-reports"     icon={Heart}         color="text-pink-600 dark:text-pink-400"     label="Donor Fund Reports"    sub="Fund restriction split" />
        <QuickLink href="/accounting/aml"               icon={Shield}        color="text-teal-600 dark:text-teal-400"     label="AML & Compliance"      sub="Transaction monitoring" />
      </div>

      <SectionHeading label="Phase 5 — Grants & Consolidation" labelAr="المنح والتوحيد" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-2 mb-4">
        <QuickLink href="/accounting/grants"            icon={Award}        color="text-amber-600 dark:text-amber-400"   label="Grant Tracking"        sub="Donor grants & burn rate" />
        <QuickLink href="/accounting/cost-allocation"   icon={Zap}          color="text-violet-600 dark:text-violet-400" label="Cost Allocation"       sub="Overhead distribution" />
        <QuickLink href="/accounting/depreciation-run"  icon={RotateCcw}    color="text-slate-500 dark:text-slate-400"   label="Depreciation Run"      sub="Batch GL posting" />
        <QuickLink href="/accounting/consolidation"     icon={Building2}    color="text-teal-600 dark:text-teal-400"     label="Consolidation"         sub="Multi-entity P&L" />
        <QuickLink href="/accounting/budget-planning"   icon={PiggyBank}    color="text-purple-600 dark:text-purple-400" label="Budget Planning"        sub="Set account targets" />
      </div>

      <SectionHeading label="Tools" labelAr="الأدوات" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-2 mb-5">
        <QuickLink href="/accounting/search"            icon={ClipboardList} color="text-blue-600 dark:text-blue-400"    label="Accounting Search"     sub="Search all records" />
        <QuickLink href="/accounting/gl-audit"          icon={Activity}      color="text-indigo-600 dark:text-indigo-400" label="GL Bridge Audit"       sub="Posting log & coverage" />
        <QuickLink href="/accounting/finance-dashboard" icon={BarChart3}     color="text-emerald-600 dark:text-emerald-400" label="Finance Dashboard"   sub="KPIs & overview" />
      </div>

      {/* ── live module status ── */}
      <SectionHeading label="Live Module Status" labelAr="حالة الوحدات المباشرة" />
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden mb-2">
        {/* header bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Live Database Status</span>
            <span className="text-[10px] text-muted-foreground" dir="rtl">حالة قاعدة البيانات المباشرة</span>
          </div>
          <div className="flex items-center gap-2">
            {modules.loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            {!modules.loading && modules.data && (
              <>
                <span className="text-[10px] text-muted-foreground hidden sm:inline tabular-nums">
                  {Object.values(modules.data).reduce((s, m) => s + m.count, 0).toLocaleString()} rows total
                </span>
                <span className={cn(
                  'text-xs font-bold px-2.5 py-0.5 rounded-full',
                  activeModules === totalModules
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
                )}>
                  {activeModules}/{totalModules} live
                </span>
              </>
            )}
          </div>
        </div>

        {modules.loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Probing accounting tables…
          </div>
        ) : (() => {
          const md = modules.data;
          if (!md) return (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <AlertTriangle className="h-8 w-8 text-amber-500" />
              <p className="text-sm font-medium text-amber-600">Accounting Module Setup Required</p>
              <p className="text-xs text-muted-foreground max-w-sm">
                One or more accounting tables are missing. Ask your system administrator to run the latest accounting migrations.
              </p>
            </div>
          );

          type ModGroup = { heading: string; headingAr: string; icon: React.ElementType; iconColor: string; items: { label: string; labelAr: string; entry: ModuleEntry; href: string }[] };
          const groups: ModGroup[] = [
            {
              heading: 'Core GL', headingAr: 'دفتر الأستاذ', icon: BookOpen, iconColor: 'text-blue-600',
              items: [
                { label: 'Chart of Accounts', labelAr: 'دليل الحسابات',  entry: md.coa,          href: '/accounting/coa' },
                { label: 'Journal Entries',   labelAr: 'قيود اليومية',   entry: md.journals,     href: '/accounting/journals' },
                { label: 'Journal Lines',     labelAr: 'سطور القيود',    entry: md.journalLines, href: '/accounting/trial-balance' },
                { label: 'Fiscal Periods',    labelAr: 'الفترات المالية', entry: md.fiscalPeriods, href: '/accounting/fiscal-years' },
                { label: 'Funds',             labelAr: 'سجل الصناديق',   entry: md.funds,        href: '/accounting/funds' },
              ],
            },
            {
              heading: 'AP & Procurement', headingAr: 'الذمم والمشتريات', icon: ShoppingCart, iconColor: 'text-violet-600',
              items: [
                { label: 'Vendors',          labelAr: 'الموردون',          entry: md.vendors,        href: '/accounting/vendors' },
                { label: 'Purchase Orders',  labelAr: 'أوامر الشراء',      entry: md.purchaseOrders, href: '/accounting/purchase-orders' },
              ],
            },
            {
              heading: 'Cash & Banking', headingAr: 'النقد والبنوك', icon: Landmark, iconColor: 'text-sky-600',
              items: [
                { label: 'Bank Accounts', labelAr: 'الحسابات البنكية',  entry: md.bankAccounts, href: '/accounting/bank-recon' },
                { label: 'Recon Items',   labelAr: 'بنود التسوية',       entry: md.bankRecon,    href: '/accounting/bank-recon' },
              ],
            },
            {
              heading: 'Assets', headingAr: 'الأصول', icon: Package, iconColor: 'text-slate-600',
              items: [
                { label: 'Fixed Assets', labelAr: 'الأصول الثابتة', entry: md.assets, href: '/accounting/fixed-assets' },
              ],
            },
          ];

          const globalMax = Math.max(1, ...groups.flatMap(g => g.items.map(i => i.entry.count)));

          return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border">
              {groups.map(g => {
                const groupTotal = g.items.reduce((s, i) => s + (i.entry.active ? i.entry.count : 0), 0);
                const groupActive = g.items.filter(i => i.entry.active).length;
                return (
                  <div key={g.heading} className="p-4">
                    <div className="flex items-center gap-1.5 mb-3">
                      <g.icon className={cn('h-3.5 w-3.5 shrink-0', g.iconColor)} />
                      <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{g.heading}</span>
                      <span className="text-[9px] text-muted-foreground ml-1" dir="rtl">{g.headingAr}</span>
                      <span className="ml-auto flex items-center gap-1 shrink-0">
                        {groupActive < g.items.length && (
                          <span className="text-[9px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full font-medium">
                            {g.items.length - groupActive} pending
                          </span>
                        )}
                        {groupTotal > 0 && (
                          <span className="text-[9px] text-muted-foreground tabular-nums font-semibold">
                            {groupTotal.toLocaleString()} rec
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="space-y-2.5">
                      {g.items.map(item => {
                        const barPct = item.entry.active && globalMax > 0
                          ? Math.max(3, Math.round((item.entry.count / globalMax) * 100))
                          : 0;
                        return (
                          <Link key={item.label} to={item.href} className="flex items-center gap-2.5 group">
                            {item.entry.active ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                            ) : (
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1">
                                <span className={cn('text-xs font-medium truncate group-hover:text-primary transition-colors', !item.entry.active && 'text-muted-foreground line-through decoration-amber-400')}>
                                  {item.label}
                                </span>
                                {item.entry.active ? (
                                  <span className="text-[10px] tabular-nums font-semibold text-foreground shrink-0">
                                    {item.entry.count > 0 ? item.entry.count.toLocaleString() : <span className="text-muted-foreground">0</span>}
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-medium text-amber-600 dark:text-amber-400 shrink-0 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded-full">
                                    migrate
                                  </span>
                                )}
                              </div>
                              <div className="h-1 mt-1 rounded-full bg-muted overflow-hidden">
                                {item.entry.active ? (
                                  <div
                                    className={cn('h-full rounded-full transition-all duration-500', item.entry.count > 0 ? 'bg-emerald-400 dark:bg-emerald-500' : 'bg-muted-foreground/20')}
                                    style={{ width: `${barPct}%` }}
                                  />
                                ) : (
                                  <div className="h-full w-full bg-amber-200 dark:bg-amber-800/30" />
                                )}
                              </div>
                              <div className="flex items-center mt-0.5">
                                <span className="text-[9px] text-muted-foreground" dir="rtl">{item.labelAr}</span>
                              </div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* footer */}
        {modules.data && (() => {
          const totalRecords = Object.values(modules.data).reduce((s, m) => s + m.count, 0);
          const allActive = Object.values(modules.data).every(m => m.active);
          const pendingCount = totalModules - activeModules;
          return (
            <div className={cn(
              'flex items-center justify-between gap-3 px-4 py-2.5 text-[10px] border-t border-border',
              allActive
                ? 'bg-emerald-50/50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-300'
                : 'bg-amber-50/50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-300',
            )}>
              <div className="flex items-center gap-1.5">
                {allActive
                  ? <><CheckCircle2 className="h-3 w-3 shrink-0" /> All {totalModules} tables live — {totalRecords.toLocaleString()} total records</>
                  : <><AlertTriangle className="h-3 w-3 shrink-0" /> {pendingCount} table{pendingCount !== 1 ? 's' : ''} need SQL migration in the Supabase SQL Editor</>
                }
              </div>
              <div className="flex items-center gap-3 text-muted-foreground shrink-0">
                <span>{activeModules} active · {totalRecords.toLocaleString()} rows</span>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
