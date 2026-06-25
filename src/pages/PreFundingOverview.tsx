import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Banknote, RefreshCw, AlertTriangle, TrendingDown, Calendar,
  ArrowRight, ChevronRight, DollarSign, Clock, CheckCircle2,
  XCircle, Loader2, ArrowUpDown, Globe, Lock,
} from 'lucide-react';
import { format, differenceInDays, parseISO } from 'date-fns';
import { formatNumber } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';

interface PreFundRow {
  id: string;
  name: string;
  source: string | null;
  amount: number;
  currency: string;
  available_balance: number;
  committed_amount: number;
  paid_amount: number;
  status: string;
  period_type_name: string | null;
  start_date: string | null;
  end_date: string | null;
  country_id: string | null;
  project_id: string | null;
  threshold_pct: number | null;
  threshold_amount: number | null;
  warning_days: number | null;
  auto_renewal_mode: string;
  low_balance_alert: boolean;
  ending_soon_alert: boolean;
}

interface ExchangeRate { from_currency: string; to_currency: string; rate: number; effective_date: string }
interface Settings { base_currency: string }

const STATUS_CFG: Record<string, { label: string; color: string; badgeCls: string }> = {
  draft:            { label: 'Draft',            color: 'text-slate-500',   badgeCls: 'bg-slate-100 text-slate-600 border-slate-200' },
  pending_approval: { label: 'Awaiting Approval',color: 'text-amber-600',   badgeCls: 'bg-amber-100 text-amber-700 border-amber-200' },
  awaiting_receipt: { label: 'Awaiting Receipt', color: 'text-sky-600',     badgeCls: 'bg-sky-100 text-sky-700 border-sky-200' },
  active:           { label: 'Active',           color: 'text-emerald-600', badgeCls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  low_balance:      { label: 'Low Balance',      color: 'text-orange-600',  badgeCls: 'bg-orange-100 text-orange-700 border-orange-200' },
  closed:           { label: 'Closed',           color: 'text-slate-400',   badgeCls: 'bg-slate-100 text-slate-500 border-slate-200' },
  period_locked:    { label: 'Period Locked',    color: 'text-slate-500',   badgeCls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

function statusBadge(status: string) {
  const cfg = STATUS_CFG[status] ?? { label: status, badgeCls: 'bg-muted text-muted-foreground border-border' };
  return <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', cfg.badgeCls)}>{cfg.label}</Badge>;
}

function renewalBadge(mode: string) {
  if (mode === 'auto_activate') return <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-indigo-50 text-indigo-700 border-indigo-200">Auto-Activate</Badge>;
  if (mode === 'auto_draft')    return <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-purple-50 text-purple-700 border-purple-200">Auto-Draft</Badge>;
  return null;
}

function usedPct(amount: number, available: number): number {
  if (amount <= 0) return 0;
  const used = amount - available;
  return Math.min(100, Math.max(0, Math.round((used / amount) * 100)));
}

function calcHealthScore(f: PreFundRow): number {
  let score = 100;
  const pct = usedPct(f.amount, f.available_balance);
  if (pct >= 95) score -= 40;
  else if (pct >= 80) score -= 25;
  else if (pct >= 60) score -= 10;
  if (f.end_date) {
    const days = differenceInDays(parseISO(f.end_date), new Date());
    if (days < 0)   score -= 45;
    else if (days <= 7)  score -= 30;
    else if (days <= 14) score -= 20;
    else if (days <= 30) score -= 10;
  }
  if (f.low_balance_alert) score -= 15;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function calcBurnDaysLeft(f: PreFundRow): number | null {
  if (!f.start_date || f.paid_amount <= 0 || f.available_balance <= 0) return null;
  const elapsed = differenceInDays(new Date(), parseISO(f.start_date));
  if (elapsed <= 0) return null;
  const daily = f.paid_amount / elapsed;
  if (daily <= 0) return null;
  return Math.round(f.available_balance / daily);
}

export default function PreFundingOverview() {
  const { hasAnyRole } = useAuthorization();
  const navigate = useNavigate();
  const canAccess = hasAnyRole(['super_admin', 'admin', 'financialAdmin']);

  const [funds, setFunds]           = useState<PreFundRow[]>([]);
  const [rates, setRates]           = useState<ExchangeRate[]>([]);
  const [settings, setSettings]     = useState<Settings | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [baseCurrency, setBase]     = useState('USD');
  const [statusFilter, setStatus]   = useState<string>('active');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [fundsRes, ratesRes, settingsRes] = await Promise.all([
        supabase.from('pre_fund_requests')
          .select('id,name,source,amount,currency,available_balance,committed_amount,paid_amount,status,period_type_name,start_date,end_date,country_id,project_id,threshold_pct,threshold_amount,warning_days,auto_renewal_mode,low_balance_alert,ending_soon_alert')
          .order('created_at', { ascending: false }),
        supabase.from('acct_exchange_rates' as any).select('from_currency,to_currency,rate,effective_date').order('effective_date', { ascending: false }),
        supabase.from('pre_fund_settings').select('base_currency').maybeSingle(),
      ]);
      if (fundsRes.error && !fundsRes.error.message.includes('does not exist')) throw fundsRes.error;
      setFunds((fundsRes.data as any) ?? []);
      if (ratesRes.error && !ratesRes.error.message.includes('does not exist')) throw ratesRes.error;
      setRates((ratesRes.data as ExchangeRate[]) ?? []);
      if (settingsRes.data) {
        const s = settingsRes.data as any;
        setSettings({ base_currency: s.base_currency ?? 'USD' });
        setBase(s.base_currency ?? 'USD');
      }
    } catch (e: any) {
      setError(e.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Build latest-rate map from acct_exchange_rates (from_currency→to_currency pairs).
  // Rows are ordered effective_date DESC so first-seen per pair is the most recent.
  const latestRateMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rates) {
      const key = `${r.from_currency}→${r.to_currency}`;
      if (!m.has(key)) m.set(key, r.rate);
    }
    return m;
  }, [rates]);

  function getConversionRate(from: string, to: string): number | null {
    if (from === to) return 1;
    const direct = latestRateMap.get(`${from}→${to}`);
    if (direct !== undefined) return direct;
    const inverse = latestRateMap.get(`${to}→${from}`);
    if (inverse !== undefined) return 1 / inverse;
    // Via USD bridge
    const fromToUSD = from === 'USD' ? 1 : latestRateMap.get(`${from}→USD`) ?? (latestRateMap.has(`USD→${from}`) ? 1 / latestRateMap.get(`USD→${from}`)! : null);
    const usdToBase = to === 'USD' ? 1 : latestRateMap.get(`USD→${to}`) ?? (latestRateMap.has(`${to}→USD`) ? 1 / latestRateMap.get(`${to}→USD`)! : null);
    if (fromToUSD !== null && usdToBase !== null) return fromToUSD! * usdToBase!;
    return null;
  }

  function toBase(amount: number, currency: string): number {
    if (currency === baseCurrency) return amount;
    const r = getConversionRate(currency, baseCurrency);
    if (r === null) return 0; // missing rate: treat as 0 (not 1:1) to avoid misleading totals
    return amount * r;
  }

  const missingRateCurrencies = useMemo(() => {
    const missing = new Set<string>();
    for (const f of funds) {
      if (f.currency !== baseCurrency && getConversionRate(f.currency, baseCurrency) === null) {
        missing.add(f.currency);
      }
    }
    return [...missing];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funds, latestRateMap, baseCurrency]);

  const filtered = funds.filter(f => statusFilter === 'all' ? true : f.status === statusFilter);
  const activeFunds = funds.filter(f => ['active', 'low_balance'].includes(f.status));
  const totalFunded  = activeFunds.reduce((s, f) => s + toBase(f.amount, f.currency), 0);
  const totalAvail   = activeFunds.reduce((s, f) => s + toBase(f.available_balance, f.currency), 0);
  const totalCommit  = activeFunds.reduce((s, f) => s + toBase(f.committed_amount, f.currency), 0);
  const endingSoon   = activeFunds.filter(f => {
    if (!f.end_date) return false;
    const days = differenceInDays(parseISO(f.end_date), new Date());
    return days >= 0 && days <= (f.warning_days ?? 14);
  }).length;
  const nearExhaustion = activeFunds.filter(f => f.low_balance_alert).length;

  if (!canAccess) {
    return (
      <div className="p-8 text-center">
        <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-destructive" />
        <p className="text-muted-foreground">You don't have access to Pre-Funding.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Banknote className="h-5 w-5 text-sky-600" />
            Balance Dashboard
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">All pre-fund balances, commitments, and alerts at a glance</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Display in:</span>
          </div>
          <Select value={baseCurrency} onValueChange={setBase}>
            <SelectTrigger className="w-24 h-8 text-sm" data-testid="select-base-currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['USD', 'SDG', 'EUR', 'GBP', 'SAR', ...rates.map(r => r.from_currency), ...rates.map(r => r.to_currency)].filter((v, i, a) => a.indexOf(v) === i).map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} data-testid="button-refresh-overview">
            <RefreshCw className={cn('h-4 w-4 mr-1.5', refreshing && 'animate-spin')} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => navigate('/pre-funding?tab=registry')} data-testid="button-new-fund">
            + New Fund
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error} — run the pre_funding_migration.sql to set up tables.</AlertDescription>
        </Alert>
      )}

      {!loading && !error && missingRateCurrencies.length > 0 && (
        <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-700 dark:text-amber-400">
            No exchange rate found for{' '}
            <strong>{missingRateCurrencies.join(', ')}</strong> → {baseCurrency}.
            Funds in these currencies are excluded from aggregate totals to avoid incorrect figures.{' '}
            <button className="underline font-medium hover:no-underline" onClick={() => navigate('/accounting/multi-currency')}>
              Add rates in Accounting → Multi-Currency
            </button>.
          </AlertDescription>
        </Alert>
      )}

      {/* ── Expiry Alerts Banner ─────────────────────────────────────────────── */}
      {!loading && (() => {
        const expiring = activeFunds.filter(f => {
          if (!f.end_date || f.available_balance <= 0) return false;
          const d = differenceInDays(parseISO(f.end_date), new Date());
          return d >= 0 && d <= 30;
        });
        if (expiring.length === 0) return null;
        return (
          <Alert className="border-amber-300 bg-amber-50/80 dark:bg-amber-950/20">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <AlertDescription>
              <span className="font-semibold text-amber-700 dark:text-amber-400">
                {expiring.length} fund{expiring.length !== 1 ? 's' : ''} expiring within 30 days with remaining balance — action required:
              </span>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {expiring.map(f => {
                  const d = differenceInDays(parseISO(f.end_date!), new Date());
                  const urgency = d <= 7 ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
                  return (
                    <span key={f.id} className={cn('text-xs px-2 py-0.5 rounded-full font-medium', urgency)}>
                      {f.name} — {f.currency} {formatNumber(f.available_balance, 0)} left · {d}d remaining
                    </span>
                  );
                })}
              </div>
            </AlertDescription>
          </Alert>
        );
      })()}

      {/* Aggregate KPI row */}
      {!loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Total Funded', labelAr: 'إجمالي التمويل', value: formatNumber(totalFunded, 0), sub: `${activeFunds.length} active fund${activeFunds.length !== 1 ? 's' : ''}`, icon: DollarSign, accent: 'bg-sky-600' },
            { label: 'Available Balance', labelAr: 'الرصيد المتاح', value: formatNumber(totalAvail, 0), sub: `${baseCurrency} across all active funds`, icon: Banknote, accent: totalAvail < totalFunded * 0.2 ? 'bg-rose-600' : 'bg-emerald-600' },
            { label: 'Committed', labelAr: 'المرتبط', value: formatNumber(totalCommit, 0), sub: 'Reserved from active pre-funds', icon: Lock, accent: 'bg-violet-600' },
            { label: 'Needs Attention', labelAr: 'تحتاج انتباه', value: String(nearExhaustion + endingSoon), sub: `${nearExhaustion} low balance · ${endingSoon} ending soon`, icon: AlertTriangle, accent: (nearExhaustion + endingSoon) > 0 ? 'bg-amber-500' : 'bg-slate-500' },
          ].map(kpi => (
            <Card key={kpi.label} className="relative overflow-hidden">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">{kpi.label}</div>
                    <div className="text-[9px] text-muted-foreground" dir="rtl">{kpi.labelAr}</div>
                    <div className="mt-1.5 text-2xl font-bold tabular-nums leading-none">{kpi.value}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{kpi.sub}</div>
                  </div>
                  <div className={cn('flex items-center justify-center h-10 w-10 rounded-xl shrink-0 text-white', kpi.accent)}>
                    <kpi.icon className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Filter:</span>
        {['all', 'active', 'low_balance', 'pending_approval', 'awaiting_receipt', 'draft', 'closed'].map(s => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium border transition-all',
              statusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/50'
            )}
            data-testid={`filter-status-${s}`}
          >
            {s === 'all' ? 'All' : STATUS_CFG[s]?.label ?? s}
            {s !== 'all' && <span className="ml-1 opacity-60">{funds.filter(f => f.status === s).length}</span>}
          </button>
        ))}
      </div>

      {/* Fund cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1,2,3].map(i => <Skeleton key={i} className="h-56 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Banknote className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No pre-funds found</p>
          <p className="text-sm mt-1">Create your first fund in the Fund Registry</p>
          <Button className="mt-4" onClick={() => navigate('/pre-funding?tab=registry')}>+ New Pre-Fund</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(f => {
            const pct = usedPct(f.amount, f.available_balance);
            const daysLeft = f.end_date ? differenceInDays(parseISO(f.end_date), new Date()) : null;
            const endingSoonFlag = daysLeft !== null && daysLeft >= 0 && daysLeft <= (f.warning_days ?? 14);
            const isAlert = f.low_balance_alert || endingSoonFlag;
            const baseAvail = toBase(f.available_balance, f.currency);
            const baseAmount = toBase(f.amount, f.currency);
            const baseCommit = toBase(f.committed_amount, f.currency);

            const healthScore = calcHealthScore(f);
            const burnDays   = calcBurnDaysLeft(f);
            const healthCls  = healthScore >= 70 ? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300'
                             : healthScore >= 40 ? 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300'
                             :                    'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300';

            return (
              <Card
                key={f.id}
                className={cn('transition-shadow hover:shadow-md border', isAlert && 'ring-1 ring-amber-400')}
                data-testid={`card-fund-${f.id}`}
              >
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-sm font-semibold truncate">{f.name}</CardTitle>
                      {f.source && <p className="text-[11px] text-muted-foreground truncate">{f.source}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {statusBadge(f.status)}
                      <div className="flex items-center gap-1">
                        {renewalBadge(f.auto_renewal_mode)}
                        <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 font-semibold', healthCls)} title="Fund health score (0–100)">
                          ♥ {healthScore}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  {/* Balance bar */}
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-muted-foreground">Used {pct}%</span>
                      <span className="font-mono font-semibold">{f.currency} {formatNumber(f.available_balance, 0)} available</span>
                    </div>
                    <Progress value={pct} className={cn('h-2', pct >= 90 ? '[&>div]:bg-rose-500' : pct >= 70 ? '[&>div]:bg-amber-500' : '[&>div]:bg-emerald-500')} />
                  </div>

                  {/* Amounts grid */}
                  <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-[11px]">
                    <div>
                      <p className="text-muted-foreground">Funded</p>
                      <p className="font-mono font-medium">{f.currency} {formatNumber(f.amount, 0)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Committed</p>
                      <p className="font-mono font-medium text-violet-600">{f.currency} {formatNumber(f.committed_amount, 0)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Paid Out</p>
                      <p className="font-mono font-medium text-emerald-600">{f.currency} {formatNumber(f.paid_amount, 0)}</p>
                    </div>
                  </div>

                  {/* Base currency conversion (if different) */}
                  {f.currency !== baseCurrency && (
                    <div className="text-[10px] text-muted-foreground border-t pt-2 flex items-center gap-1">
                      <ArrowUpDown className="h-3 w-3" />
                      <span>{baseCurrency}: {formatNumber(baseAvail, 0)} avail · {formatNumber(baseCommit, 0)} committed · {formatNumber(baseAmount, 0)} total</span>
                    </div>
                  )}

                  {/* Period info + burn rate */}
                  <div className="border-t pt-2 space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {f.start_date && f.end_date
                          ? <span>{format(parseISO(f.start_date), 'MMM d')} – {format(parseISO(f.end_date), 'MMM d, yyyy')}</span>
                          : <span>{f.period_type_name ?? 'No period set'}</span>}
                      </div>
                      {daysLeft !== null && daysLeft >= 0 && (
                        <span className={cn('font-medium', endingSoonFlag ? 'text-amber-600' : '')}>
                          {daysLeft}d left
                        </span>
                      )}
                      {daysLeft !== null && daysLeft < 0 && (
                        <span className="text-rose-600 font-medium">Expired</span>
                      )}
                    </div>
                    {burnDays !== null && (
                      <div className={cn('flex items-center gap-1 text-[10px]',
                        burnDays <= 14 ? 'text-rose-600' : burnDays <= 30 ? 'text-amber-600' : 'text-muted-foreground'
                      )}>
                        <TrendingDown className="h-3 w-3 shrink-0" />
                        <span>At current burn rate: balance lasts ~{burnDays}d</span>
                      </div>
                    )}
                  </div>

                  {/* Alerts */}
                  {(f.low_balance_alert || endingSoonFlag) && (
                    <div className="flex flex-col gap-1">
                      {f.low_balance_alert && (
                        <div className="flex items-center gap-1.5 text-[11px] text-orange-600 bg-orange-50 dark:bg-orange-950/20 rounded px-2 py-1">
                          <TrendingDown className="h-3 w-3 shrink-0" />
                          Low balance — below threshold
                        </div>
                      )}
                      {endingSoonFlag && (
                        <div className="flex items-center gap-1.5 text-[11px] text-amber-600 bg-amber-50 dark:bg-amber-950/20 rounded px-2 py-1">
                          <Clock className="h-3 w-3 shrink-0" />
                          Ending in {daysLeft} day{daysLeft !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={() => navigate(`/pre-funding?tab=registry`)} data-testid={`button-view-fund-${f.id}`}>
                      View
                    </Button>
                    {['active', 'low_balance'].includes(f.status) && (
                      <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={() => navigate(`/pre-funding?tab=reconciliation`)}>
                        Reconcile
                        <ChevronRight className="h-3.5 w-3.5 ml-1" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
