import { useEffect, useState, useCallback } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, TrendingUp, TrendingDown, DollarSign, Package, Clock, BookOpen, ArrowRight, AlertTriangle, Activity, BarChart3 } from 'lucide-react';
import { format, parseISO, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { formatNumber } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, BarChart, Bar, Cell } from 'recharts';

interface KPIState<T> { data: T | null; loading: boolean; error: string | null }
const INIT = <T,>(): KPIState<T> => ({ data: null, loading: true, error: null });

interface BudgetKPI { totalBudget: number; totalSpent: number; utilizationPct: number; activeBudgets: number }
interface APKpI { outstanding: number; vendorCount: number; highRisk: number }
interface AssetKPI { totalBookValue: number; totalCost: number; activeCount: number }
interface JournalEntry { id: string; entry_date: string; description_en: string; total_debit: number; status: string; period: string }
interface MonthlySpend { month: string; amount: number }

function KpiCard({ title, titleAr, value, sub, icon: Icon, color, href, loading, error }: { title: string; titleAr: string; value: string; sub?: string; icon: React.ElementType; color: string; href?: string; loading?: boolean; error?: string | null }) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground font-medium">{title}</div>
            <div className="text-[10px] text-muted-foreground" dir="rtl">{titleAr}</div>
            {loading ? (
              <div className="mt-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : error ? (
              <div className="text-xs text-amber-600 mt-1">Run migration to activate</div>
            ) : (
              <div className="mt-1">
                <div className="text-xl font-bold tabular-nums truncate">{value}</div>
                {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
              </div>
            )}
          </div>
          <div className={cn('flex items-center justify-center h-9 w-9 rounded-lg shrink-0 text-white', color)}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        {href && !loading && !error && (
          <Link to={href} className="absolute inset-0 rounded-lg" aria-label={`Go to ${title}`} />
        )}
      </CardContent>
    </Card>
  );
}

export default function AccountingFinanceDashboard() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);

  const [budget, setBudget] = useState<KPIState<BudgetKPI>>(INIT());
  const [ap, setAP] = useState<KPIState<APKpI>>(INIT());
  const [assets, setAssets] = useState<KPIState<AssetKPI>>(INIT());
  const [journals, setJournals] = useState<KPIState<JournalEntry[]>>(INIT());
  const [monthlySpend, setMonthlySpend] = useState<KPIState<MonthlySpend[]>>(INIT());
  const [pos, setPOs] = useState<KPIState<{ pendingCount: number; pendingAmount: number }>>(INIT());
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const loadBudget = useCallback(async () => {
    setBudget(p => ({ ...p, loading: true, error: null }));
    try {
      const { data, error } = await supabase.from('project_budgets').select('total_budget_cents, spent_budget_cents, status');
      if (error) throw error;
      const rows = data ?? [];
      const active = rows.filter((r: any) => r.status !== 'closed');
      const total = active.reduce((s: number, r: any) => s + Number(r.total_budget_cents ?? 0), 0) / 100;
      const spent = active.reduce((s: number, r: any) => s + Number(r.spent_budget_cents ?? 0), 0) / 100;
      setBudget({ data: { totalBudget: total, totalSpent: spent, utilizationPct: total > 0 ? Math.round((spent / total) * 100) : 0, activeBudgets: active.length }, loading: false, error: null });
    } catch (e: any) { setBudget({ data: null, loading: false, error: e.message }); }
  }, []);

  const loadAP = useCallback(async () => {
    setAP(p => ({ ...p, loading: true, error: null }));
    try {
      const { data, error } = await supabase.from('acct_journal_lines')
        .select('vendor_id, debit_credit, functional_amount')
        .not('vendor_id', 'is', null);
      if (error && error.code === '42P01') { setAP({ data: { outstanding: 0, vendorCount: 0, highRisk: 0 }, loading: false, error: null }); return; }
      if (error) throw error;
      const byVendor: Record<string, number> = {};
      for (const l of (data ?? [])) {
        const v = l.vendor_id as string;
        const sign = l.debit_credit === 'CR' ? 1 : -1;
        byVendor[v] = (byVendor[v] ?? 0) + sign * Number(l.functional_amount ?? 0);
      }
      const outstanding = Object.values(byVendor).filter(v => v > 0).reduce((s, v) => s + v, 0);
      const vendorCount = Object.values(byVendor).filter(v => v > 0).length;
      setAP({ data: { outstanding, vendorCount, highRisk: 0 }, loading: false, error: null });
    } catch (e: any) { setAP({ data: null, loading: false, error: e.message }); }
  }, []);

  const loadAssets = useCallback(async () => {
    setAssets(p => ({ ...p, loading: true, error: null }));
    try {
      const { data, error } = await supabase.from('acct_fixed_assets').select('acquisition_cost, salvage_value, useful_life_months, acquisition_date, depreciation_method, status');
      if (error && error.code === '42P01') { setAssets({ data: { totalBookValue: 0, totalCost: 0, activeCount: 0 }, loading: false, error: null }); return; }
      if (error) throw error;
      const active = (data ?? []).filter((a: any) => a.status === 'active');
      const now = new Date();
      let totalBookValue = 0;
      let totalCost = 0;
      for (const a of active) {
        const cost = Number(a.acquisition_cost);
        const salvage = Number(a.salvage_value);
        const life = Number(a.useful_life_months);
        totalCost += cost;
        const acq = new Date(a.acquisition_date);
        const elapsed = Math.min(Math.max(0, Math.floor((now.getTime() - acq.getTime()) / (1000 * 60 * 60 * 24 * 30))), life);
        const dep = life > 0 ? ((cost - salvage) / life) * elapsed : 0;
        totalBookValue += Math.max(cost - dep, salvage);
      }
      setAssets({ data: { totalBookValue, totalCost, activeCount: active.length }, loading: false, error: null });
    } catch (e: any) { setAssets({ data: null, loading: false, error: e.message }); }
  }, []);

  const loadJournals = useCallback(async () => {
    setJournals(p => ({ ...p, loading: true, error: null }));
    try {
      const { data, error } = await supabase.from('acct_journal_entries')
        .select('id, entry_date, description_en, total_debit, status, acct_fiscal_periods(period_no)')
        .eq('status', 'posted')
        .order('entry_date', { ascending: false })
        .limit(8);
      if (error && error.code === '42P01') { setJournals({ data: [], loading: false, error: null }); return; }
      if (error) throw error;
      setJournals({ data: ((data ?? []) as any[]).map(j => ({ id: j.id, entry_date: j.entry_date, description_en: j.description_en, total_debit: j.total_debit, status: j.status, period: j.acct_fiscal_periods ? `P${j.acct_fiscal_periods.period_no}` : '' })), loading: false, error: null });
    } catch (e: any) { setJournals({ data: null, loading: false, error: e.message }); }
  }, []);

  const loadMonthlySpend = useCallback(async () => {
    setMonthlySpend(p => ({ ...p, loading: true, error: null }));
    try {
      const months = Array.from({ length: 6 }, (_, i) => {
        const d = subMonths(new Date(), 5 - i);
        return { label: format(d, 'MMM'), start: format(startOfMonth(d), 'yyyy-MM-dd'), end: format(endOfMonth(d), 'yyyy-MM-dd') };
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
    } catch (e: any) { setMonthlySpend({ data: [], loading: false, error: null }); }
  }, []);

  const loadPOs = useCallback(async () => {
    setPOs(p => ({ ...p, loading: true, error: null }));
    try {
      const { data, error } = await supabase.from('acct_purchase_orders').select('amount, status').in('status', ['draft', 'submitted', 'approved']);
      if (error && error.code === '42P01') { setPOs({ data: { pendingCount: 0, pendingAmount: 0 }, loading: false, error: null }); return; }
      if (error) throw error;
      const rows = data ?? [];
      setPOs({ data: { pendingCount: rows.length, pendingAmount: rows.reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0) }, loading: false, error: null });
    } catch (e: any) { setPOs({ data: null, loading: false, error: e.message }); }
  }, []);

  const loadAll = useCallback(() => {
    setLastRefresh(new Date());
    void loadBudget();
    void loadAP();
    void loadAssets();
    void loadJournals();
    void loadMonthlySpend();
    void loadPOs();
  }, [loadBudget, loadAP, loadAssets, loadJournals, loadMonthlySpend, loadPOs]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  if (authLoading) return <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!allowed) return <Navigate to="/" replace />;

  const spendTrend = monthlySpend.data ?? [];
  const maxSpend = spendTrend.length > 0 ? Math.max(...spendTrend.map(d => d.amount), 1) : 1;

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl" data-testid="finance-dashboard">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-gradient-to-br from-blue-700 to-indigo-800 text-white shrink-0">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Finance Dashboard</h1>
            <p className="text-muted-foreground text-sm">لوحة المالية التنفيذية — Consolidated financial overview</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Updated {format(lastRefresh, 'HH:mm:ss')}</span>
          <Button variant="outline" size="sm" onClick={loadAll} data-testid="button-refresh">
            <RefreshCw className="h-4 w-4 mr-1" />Refresh
          </Button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <KpiCard
          title="Budget Utilization"
          titleAr="نسبة استخدام الميزانية"
          value={budget.data ? `${budget.data.utilizationPct}%` : '—'}
          sub={budget.data ? `${formatNumber(budget.data.totalSpent)} spent of ${formatNumber(budget.data.totalBudget)}` : undefined}
          icon={TrendingUp}
          color="bg-blue-600"
          href="/budget"
          loading={budget.loading}
          error={budget.error}
        />
        <KpiCard
          title="AP Outstanding"
          titleAr="مستحقات الموردين"
          value={ap.data ? formatNumber(ap.data.outstanding) : '—'}
          sub={ap.data ? `${ap.data.vendorCount} vendor${ap.data.vendorCount !== 1 ? 's' : ''} with balances` : undefined}
          icon={Clock}
          color="bg-rose-600"
          href="/accounting/ap-aging"
          loading={ap.loading}
          error={ap.error}
        />
        <KpiCard
          title="Asset Book Value"
          titleAr="القيمة الدفترية للأصول"
          value={assets.data ? formatNumber(assets.data.totalBookValue) : '—'}
          sub={assets.data ? `${assets.data.activeCount} active assets (cost: ${formatNumber(assets.data.totalCost)})` : undefined}
          icon={Package}
          color="bg-slate-700"
          href="/accounting/fixed-assets"
          loading={assets.loading}
          error={assets.error}
        />
        <KpiCard
          title="Open Purchase Orders"
          titleAr="طلبات الشراء المفتوحة"
          value={pos.data ? String(pos.data.pendingCount) : '—'}
          sub={pos.data ? `${formatNumber(pos.data.pendingAmount)} total value` : undefined}
          icon={BookOpen}
          color="bg-violet-600"
          href="/accounting/purchase-orders"
          loading={pos.loading}
          error={pos.error}
        />
        <KpiCard
          title="Active Project Budgets"
          titleAr="الميزانيات النشطة"
          value={budget.data ? String(budget.data.activeBudgets) : '—'}
          sub="Click to view all budgets"
          icon={DollarSign}
          color="bg-emerald-600"
          href="/budget"
          loading={budget.loading}
          error={budget.error}
        />
        <KpiCard
          title="Cash Flow (last period)"
          titleAr="التدفق النقدي"
          value={monthlySpend.data && monthlySpend.data.length > 0 ? formatNumber(monthlySpend.data[monthlySpend.data.length - 1]?.amount ?? 0) : '—'}
          sub="Expense outflows last month"
          icon={Activity}
          color="bg-indigo-600"
          href="/accounting/cash-flow"
          loading={monthlySpend.loading}
          error={monthlySpend.error}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Monthly expense trend chart */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2 pt-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">6-Month Expense Trend</CardTitle>
              <Link to="/accounting/cash-flow" className="text-xs text-primary hover:underline flex items-center gap-1">View Cash Flow <ArrowRight className="h-3 w-3" /></Link>
            </div>
          </CardHeader>
          <CardContent>
            {monthlySpend.loading ? (
              <div className="flex items-center justify-center h-36"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : spendTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={150}>
                <AreaChart data={spendTrend} margin={{ top: 4, right: 12, left: 12, bottom: 4 }}>
                  <defs>
                    <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} width={45} />
                  <Tooltip formatter={(v: number) => formatNumber(v)} />
                  <Area type="monotone" dataKey="amount" stroke="#6366f1" fill="url(#expGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-36 flex items-center justify-center text-sm text-muted-foreground">No expense data yet — post journal entries to see the trend</div>
            )}
          </CardContent>
        </Card>

        {/* Recent posted journal entries */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 pt-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Recent Journal Entries</CardTitle>
              <Link to="/accounting/journals" className="text-xs text-primary hover:underline flex items-center gap-1">All <ArrowRight className="h-3 w-3" /></Link>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {journals.loading ? (
              <div className="flex items-center justify-center h-36"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : !journals.data || journals.data.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-10">No posted entries yet</div>
            ) : (
              <div className="divide-y">
                {journals.data.map(j => (
                  <div key={j.id} className="flex items-start justify-between gap-2 px-4 py-2 hover:bg-muted/20">
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">{j.description_en || 'Journal Entry'}</div>
                      <div className="text-[10px] text-muted-foreground">{j.entry_date ? format(parseISO(j.entry_date), 'dd MMM yyyy') : ''} {j.period}</div>
                    </div>
                    <div className="text-xs font-medium tabular-nums shrink-0">{formatNumber(j.total_debit)}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick links row */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'General Ledger', sub: 'Transaction history', href: '/accounting/ledger', icon: BookOpen, color: 'text-blue-600 dark:text-blue-400' },
          { label: 'Financial Statements', sub: 'Income Statement & Balance Sheet', href: '/accounting/reports', icon: TrendingUp, color: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Budget vs. Actual', sub: 'Variance analysis', href: '/accounting/budget-variance', icon: BarChart3, color: 'text-violet-600 dark:text-violet-400' },
          { label: 'Bank Reconciliation', sub: 'Statement matching', href: '/accounting/bank-recon', icon: Activity, color: 'text-indigo-600 dark:text-indigo-400' },
        ].map(l => (
          <Link key={l.href} to={l.href}>
            <Card className="hover:shadow-sm transition-shadow cursor-pointer h-full">
              <CardContent className="py-3 px-3">
                <l.icon className={cn('h-5 w-5 mb-1.5', l.color)} />
                <div className="text-sm font-medium">{l.label}</div>
                <div className="text-[10px] text-muted-foreground">{l.sub}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
