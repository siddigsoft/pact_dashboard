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
  Landmark, Wallet, Scale, CalendarDays, Layers, Settings2, ListOrdered,
  CreditCard, PiggyBank, Receipt, ArrowUpDown, ShieldAlert, Lock,
  Award, RotateCcw, Building2,
} from 'lucide-react';
import {
  format, parseISO, subMonths, startOfMonth, endOfMonth,
  differenceInDays, startOfYear,
} from 'date-fns';
import { formatNumber } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  BarChart, Bar, Cell, Legend,
} from 'recharts';

/* ─── types ─────────────────────────────────────────────────────────── */
interface KPIState<T> { data: T | null; loading: boolean; error: string | null }
const INIT = <T,>(): KPIState<T> => ({ data: null, loading: true, error: null });

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
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);

  const [budget, setBudget] = useState<KPIState<BudgetKPI>>(INIT());
  const [ap, setAP] = useState<KPIState<APSummary>>(INIT());
  const [assets, setAssets] = useState<KPIState<AssetKPI>>(INIT());
  const [journals, setJournals] = useState<KPIState<JournalSummary>>(INIT());
  const [monthlyRevExp, setMonthlyRevExp] = useState<KPIState<MonthlyRevenueExpense[]>>(INIT());
  const [pos, setPOs] = useState<KPIState<POSummary>>(INIT());
  const [cash, setCash] = useState<KPIState<CashKPI>>(INIT());
  const [revenue, setRevenue] = useState<KPIState<RevenueKPI>>(INIT());
  const [coa, setCOA] = useState<KPIState<COAStatus>>(INIT());
  const [modules, setModules] = useState<KPIState<ModuleStatus>>(INIT());
  const [phase4, setPhase4] = useState<KPIState<Phase4KPI>>(INIT());
  const [phase5, setPhase5] = useState<KPIState<Phase5KPI>>(INIT());
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [countdown, setCountdown] = useState(60);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── budget ── */
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

  /* ── AP with aging buckets ── */
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

  /* ── fixed assets ── */
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

  /* ── journals — counts + recent ── */
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

  /* ── monthly revenue vs expense (6 months) ── */
  const loadMonthlyRevExp = useCallback(async () => {
    setMonthlyRevExp(p => ({ ...p, loading: true, error: null }));
    try {
      const months = Array.from({ length: 6 }, (_, i) => {
        const d = subMonths(new Date(), 5 - i);
        return { label: format(d, 'MMM yy'), start: format(startOfMonth(d), 'yyyy-MM-dd'), end: format(endOfMonth(d), 'yyyy-MM-dd') };
      });
      const results: MonthlyRevenueExpense[] = [];
      for (const m of months) {
        const { data } = await supabase.from('acct_journal_lines')
          .select('functional_amount, debit_credit, acct_accounts!inner(account_type), acct_journal_entries!inner(posting_date, status)')
          .in('acct_accounts.account_type', ['revenue', 'expense'])
          .eq('acct_journal_entries.status', 'posted')
          .gte('acct_journal_entries.posting_date', m.start)
          .lte('acct_journal_entries.posting_date', m.end);
        let rev = 0, exp = 0;
        for (const l of (data ?? []) as any[]) {
          const type = (l.acct_accounts as any)?.account_type;
          const amt = Number(l.functional_amount ?? 0);
          if (type === 'revenue' && l.debit_credit === 'CR') rev += amt;
          if (type === 'expense' && l.debit_credit === 'DR') exp += amt;
        }
        results.push({ month: m.label, revenue: rev, expense: exp });
      }
      setMonthlyRevExp({ data: results, loading: false, error: null });
    } catch { setMonthlyRevExp({ data: [], loading: false, error: null }); }
  }, []);

  /* ── purchase orders ── */
  const loadPOs = useCallback(async () => {
    setPOs(p => ({ ...p, loading: true, error: null }));
    try {
      const { data, error } = await supabase.from('acct_purchase_orders').select('amount, status').limit(2000);
      if (error?.code === '42P01') { setPOs({ data: { pendingCount: 0, pendingAmount: 0, draftCount: 0, approvedCount: 0 }, loading: false, error: null }); return; }
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const pending = rows.filter(r => r.status === 'submitted');
      setPOs({ data: { pendingCount: pending.length, pendingAmount: pending.reduce((s, r) => s + Number(r.amount ?? 0), 0), draftCount: rows.filter(r => r.status === 'draft').length, approvedCount: rows.filter(r => r.status === 'approved').length }, loading: false, error: null });
    } catch (e: any) { setPOs({ data: null, loading: false, error: e.message }); }
  }, []);

  /* ── cash position (bank accounts) ── */
  const loadCash = useCallback(async () => {
    setCash(p => ({ ...p, loading: true, error: null }));
    try {
      const [bankRes, reconRes] = await Promise.all([
        supabase.from('acct_bank_accounts').select('current_balance, currency, is_active').limit(200),
        supabase.from('acct_bank_recon_items').select('id, status').limit(5000),
      ]);
      if (bankRes.error?.code === '42P01') { setCash({ data: { totalCash: 0, accountCount: 0, unreconciledCount: 0 }, loading: false, error: null }); return; }
      if (bankRes.error) throw bankRes.error;
      const activeAccounts = ((bankRes.data ?? []) as any[]).filter(a => a.is_active !== false);
      const totalCash = activeAccounts.reduce((s: number, a: any) => s + Number(a.current_balance ?? 0), 0);
      const unreconciledCount = reconRes.error ? 0 : ((reconRes.data ?? []) as any[]).filter((r: any) => r.status === 'unreconciled').length;
      setCash({ data: { totalCash, accountCount: activeAccounts.length, unreconciledCount }, loading: false, error: null });
    } catch (e: any) { setCash({ data: null, loading: false, error: e.message }); }
  }, []);

  /* ── revenue & net income (YTD) ── */
  const loadRevenue = useCallback(async () => {
    setRevenue(p => ({ ...p, loading: true, error: null }));
    try {
      const ytdStart = format(startOfYear(new Date()), 'yyyy-MM-dd');
      const { data, error } = await supabase.from('acct_journal_lines')
        .select('functional_amount, debit_credit, acct_accounts!inner(account_type), acct_journal_entries!inner(posting_date, status)')
        .in('acct_accounts.account_type', ['revenue', 'expense'])
        .eq('acct_journal_entries.status', 'posted')
        .gte('acct_journal_entries.posting_date', ytdStart);
      if (error?.code === '42P01') { setRevenue({ data: { totalRevenue: 0, totalExpense: 0, netIncome: 0, ytdRevenue: 0 }, loading: false, error: null }); return; }
      if (error) throw error;
      let totalRevenue = 0, totalExpense = 0;
      for (const l of (data ?? []) as any[]) {
        const type = (l.acct_accounts as any)?.account_type;
        const amt = Number(l.functional_amount ?? 0);
        if (type === 'revenue' && l.debit_credit === 'CR') totalRevenue += amt;
        if (type === 'expense' && l.debit_credit === 'DR') totalExpense += amt;
      }
      setRevenue({ data: { totalRevenue, totalExpense, netIncome: totalRevenue - totalExpense, ytdRevenue: totalRevenue }, loading: false, error: null });
    } catch (e: any) { setRevenue({ data: null, loading: false, error: e.message }); }
  }, []);

  /* ── COA / fiscal / funds meta ── */
  const loadCOA = useCallback(async () => {
    setCOA(p => ({ ...p, loading: true, error: null }));
    try {
      const [acctRes, fundRes, periodRes] = await Promise.all([
        supabase.from('acct_accounts').select('id').limit(5000),
        supabase.from('acct_funds').select('id').limit(500),
        supabase.from('acct_fiscal_periods').select('id, period_name, is_open').limit(100),
      ]);
      const activePeriod = ((periodRes.data ?? []) as any[]).find(p => p.is_open)?.period_name ?? null;
      setCOA({
        data: {
          accountCount: (acctRes.error?.code === '42P01') ? 0 : (acctRes.data?.length ?? 0),
          fundCount: (fundRes.error?.code === '42P01') ? 0 : (fundRes.data?.length ?? 0),
          fiscalPeriodCount: (periodRes.error?.code === '42P01') ? 0 : (periodRes.data?.length ?? 0),
          activePeriod,
        },
        loading: false, error: null,
      });
    } catch (e: any) { setCOA({ data: null, loading: false, error: e.message }); }
  }, []);

  /* ── Phase 4 advanced controls ── */
  const loadPhase4 = useCallback(async () => {
    setPhase4(p => ({ ...p, loading: true, error: null }));
    try {
      const [journalRes, encRes, taxRes, periodRes] = await Promise.all([
        supabase.from('acct_journal_entries').select('id, created_by, posted_by').eq('status', 'posted').not('posted_by', 'is', null).limit(3000),
        supabase.from('acct_budget_encumbrances' as any).select('amount, status').eq('status', 'open').limit(3000),
        supabase.from('acct_tax_codes' as any).select('id, is_active').eq('is_active', true).limit(500),
        supabase.from('acct_period_close_log' as any).select('status, closed_at').order('closed_at', { ascending: false }).limit(1),
      ]);
      const sodViolations = journalRes.error ? 0 : ((journalRes.data ?? []) as any[]).filter(e => e.created_by && e.created_by === e.posted_by).length;
      const encRows = (encRes.error?.code === '42P01') ? [] : ((encRes.data ?? []) as any[]);
      const openEncumbranceTotal = encRows.reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
      const openEncumbranceCount = encRows.length;
      const activeTaxCodes = (taxRes.error?.code === '42P01') ? 0 : (taxRes.data?.length ?? 0);
      const latestClose = (periodRes.error?.code === '42P01') ? null : ((periodRes.data ?? []) as any[])[0]?.status ?? null;
      setPhase4({ data: { sodViolations, openEncumbranceTotal, openEncumbranceCount, activeTaxCodes, periodCloseStatus: latestClose }, loading: false, error: null });
    } catch (e: any) { setPhase4({ data: null, loading: false, error: e.message }); }
  }, []);

  /* ── Phase 5 expansion KPIs ── */
  const loadPhase5 = useCallback(async () => {
    setPhase5(p => ({ ...p, loading: true, error: null }));
    try {
      const thisMonth = new Date().toISOString().slice(0, 7);
      const [grantsRes, deprRunRes, allocRunRes, acctRes] = await Promise.all([
        supabase.from('acct_grants' as any).select('id, status, award_amount').in('status', ['active', 'expiring_soon']).limit(500),
        supabase.from('acct_depreciation_runs' as any).select('run_date, total_depreciation').order('run_date', { ascending: false }).limit(1),
        supabase.from('acct_allocation_runs' as any).select('run_date').gte('run_date', `${thisMonth}-01`).limit(100),
        supabase.from('acct_accounts').select('country_id', { count: 'estimated' }).not('country_id', 'is', null).limit(1),
      ]);
      const grants = (grantsRes.error?.code === '42P01') ? [] : ((grantsRes.data ?? []) as any[]);
      const deprRuns = (deprRunRes.error?.code === '42P01') ? [] : ((deprRunRes.data ?? []) as any[]);
      const allocRuns = (allocRunRes.error?.code === '42P01') ? [] : ((allocRunRes.data ?? []) as any[]);
      const { data: countryData } = await supabase.from('acct_accounts').select('country_id').not('country_id', 'is', null).limit(1000);
      const entityCount = new Set(((countryData ?? []) as any[]).map((r: any) => r.country_id)).size;
      setPhase5({
        data: {
          activeGrants: grants.length,
          totalGrantAwarded: grants.reduce((s: number, g: any) => s + Number(g.award_amount ?? 0), 0),
          lastDeprRunDate: deprRuns[0]?.run_date ?? null,
          lastDeprRunAmount: Number(deprRuns[0]?.total_depreciation ?? 0),
          allocationRunsThisMonth: allocRuns.length,
          entityCount,
        },
        loading: false, error: null,
      });
    } catch (e: any) { setPhase5({ data: null, loading: false, error: e.message }); }
  }, []);

  /* ── module status probe — checks table existence AND fetches record count ── */
  const loadModules = useCallback(async () => {
    setModules(p => ({ ...p, loading: true, error: null }));
    const probe = async (table: string): Promise<ModuleEntry> => {
      const { count, error } = await supabase
        .from(table as any)
        .select('*', { count: 'exact', head: true });
      const active = !error || error.code !== '42P01';
      return { active, count: active ? (count ?? 0) : 0 };
    };
    const [coa, journals, journalLines, vendors, assets, purchaseOrders, fiscalPeriods, bankAccounts, funds, bankRecon] = await Promise.all([
      probe('acct_accounts'),
      probe('acct_journal_entries'),
      probe('acct_journal_lines'),
      probe('acct_vendors'),
      probe('acct_fixed_assets'),
      probe('acct_purchase_orders'),
      probe('acct_fiscal_periods'),
      probe('acct_bank_accounts'),
      probe('acct_funds'),
      probe('acct_bank_recon_items'),
    ]);
    setModules({ data: { coa, journals, journalLines, vendors, assets, purchaseOrders, fiscalPeriods, bankAccounts, funds, bankRecon }, loading: false, error: null });
  }, []);

  const loadAll = useCallback(() => {
    setLastRefresh(new Date());
    setCountdown(60);
    void loadBudget(); void loadAP(); void loadAssets(); void loadJournals();
    void loadMonthlyRevExp(); void loadPOs(); void loadCash(); void loadRevenue();
    void loadCOA(); void loadModules(); void loadPhase4(); void loadPhase5();
  }, [loadBudget, loadAP, loadAssets, loadJournals, loadMonthlyRevExp, loadPOs, loadCash, loadRevenue, loadCOA, loadModules, loadPhase4, loadPhase5]);

  useEffect(() => { void loadAll(); }, [loadAll]);

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

      {/* ── quick links — all 16 modules ── */}
      <SectionHeading label="All Accounting Modules" labelAr="جميع وحدات المحاسبة" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-2 mb-5">
        <QuickLink href="/accounting/journals"       icon={FileText}    color="text-amber-600 dark:text-amber-400"   label="Journal Entries"      sub="GL posting engine" />
        <QuickLink href="/accounting/ledger"         icon={BookOpen}    color="text-blue-600 dark:text-blue-400"     label="General Ledger"       sub="Transaction history" />
        <QuickLink href="/accounting/trial-balance"  icon={ArrowUpDown} color="text-indigo-600 dark:text-indigo-400" label="Trial Balance"        sub="Debit / Credit check" />
        <QuickLink href="/accounting/reports"        icon={TrendingUp}  color="text-emerald-600 dark:text-emerald-400" label="Financial Statements" sub="Income & Balance Sheet" />
        <QuickLink href="/accounting/coa"            icon={ListOrdered} color="text-violet-600 dark:text-violet-400" label="Chart of Accounts"    sub="Account hierarchy" />
        <QuickLink href="/accounting/fiscal-years"   icon={CalendarDays} color="text-teal-600 dark:text-teal-400"   label="Fiscal Years"         sub="Periods & close" />
        <QuickLink href="/accounting/funds"          icon={PiggyBank}   color="text-cyan-600 dark:text-cyan-400"    label="Fund Registry"        sub="Fund restrictions" />
        <QuickLink href="/accounting/budget-variance" icon={BarChart3}  color="text-purple-600 dark:text-purple-400" label="Budget vs Actual"    sub="Variance analysis" />
        <QuickLink href="/accounting/bank-recon"     icon={Landmark}    color="text-sky-600 dark:text-sky-400"      label="Bank Reconciliation"  sub="Statement matching" />
        <QuickLink href="/accounting/cash-flow"      icon={Activity}    color="text-lime-600 dark:text-lime-400"    label="Cash Flow"            sub="6-month projection" />
        <QuickLink href="/accounting/ap-aging"       icon={Clock}       color="text-rose-600 dark:text-rose-400"    label="AP Aging"             sub="Overdue payables" />
        <QuickLink href="/accounting/vendors"        icon={Zap}         color="text-orange-600 dark:text-orange-400" label="Vendor Registry"     sub="Manage suppliers" />
        <QuickLink href="/accounting/purchase-orders" icon={ShoppingCart} color="text-violet-600 dark:text-violet-400" label="Purchase Orders"   sub="PO approvals" />
        <QuickLink href="/accounting/fixed-assets"   icon={Package}     color="text-slate-600 dark:text-slate-400"  label="Fixed Assets"         sub="Depreciation tracking" />
        <QuickLink href="/accounting/settings"       icon={Settings2}   color="text-gray-600 dark:text-gray-400"   label="Settings"             sub="Accounting config" />
        <QuickLink href="/budget"                    icon={DollarSign}  color="text-emerald-700 dark:text-emerald-400" label="Project Budgets"   sub="Budget utilization" />
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
          if (!md) return null;

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
                <span>{activeModules} active · {totalRecords.toLocaleString()} rows · auto-refresh in {countdown}s</span>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
