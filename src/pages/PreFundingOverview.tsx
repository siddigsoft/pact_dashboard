import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
  ChevronRight, DollarSign, Clock, Lock,
  Globe, ArrowUpDown, Users, ChevronDown, ChevronUp,
  Flame, Layers, User, Receipt, ArrowRight, Download,
} from 'lucide-react';
import { usePreFundPaymentGate } from '@/hooks/usePreFundPaymentGate';
import { format, differenceInDays, parseISO } from 'date-fns';
import { formatNumber } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import { exportToExcel } from '@/utils/report-export';

/** Fetch ALL rows from a Supabase query — auto-paginates 1000 rows at a time so no rows are ever silently dropped. */
async function fetchAll<T = any>(queryFn: () => any): Promise<T[]> {
  const PAGE = 1000;
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await queryFn().range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

/** Batched .in() fetch — splits large ID lists into 500-ID chunks to avoid URL-length limits. */
async function fetchAllIn<T = any>(queryFn: (chunk: string[]) => any, ids: string[]): Promise<T[]> {
  if (ids.length === 0) return [];
  const CHUNK = 500;
  const batches: Promise<T[]>[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    batches.push(fetchAll<T>(() => queryFn(slice)));
  }
  const results = await Promise.all(batches);
  return results.flat();
}

const _DP_NO_DISBURSE_OV = new Set(['pending','pending_supervisor','pending_admin','draft','rejected','cancelled']);

/**
 * Per-fund effective paid amount — mirrors PreFundingReconciliation.loadTxns exactly.
 * Runs one isolated query per fund (parallel) so cross-fund DP-set contamination
 * cannot inflate any fund's paid-out total.
 * Falls back to paid_amount DB column when no payment transactions exist.
 */
async function computePerFundEffectivePaid(
  fundIds: string[],
  fallbacks: Map<string, number>,
  sb: any,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  await Promise.all(fundIds.map(async fundId => {
    try {
      // Only need payment-type txns for the paid-amount total (mirrors Reconciliation)
      const rawTxns: any[] = await fetchAll(() =>
        sb.from('pre_fund_transactions')
          .select('id,transaction_type,amount,source_table,source_id')
          .eq('pre_fund_request_id', fundId)
          .eq('transaction_type', 'payment'),
      );
      if (rawTxns.length === 0) {
        result.set(fundId, fallbacks.get(fundId) ?? 0);
        return;
      }
      const dpIds = [...new Set(rawTxns.filter((t: any) => t.source_table === 'down_payment_requests' && t.source_id).map((t: any) => t.source_id as string))];
      const txnIds = rawTxns.map((t: any) => t.id as string).filter(Boolean);
      const [validDpData, backLinked] = await Promise.all([
        fetchAllIn((chunk: string[]) => sb.from('down_payment_requests').select('id,status,metadata').in('id', chunk), dpIds),
        fetchAllIn((chunk: string[]) => sb.from('down_payment_requests').select('pre_fund_transaction_id,status,metadata').in('pre_fund_transaction_id', chunk), txnIds),
      ]);
      const paidDpSet = new Set<string>(
        (validDpData as any[]).filter(d => !_DP_NO_DISBURSE_OV.has(d.status) && d.metadata?.deleted !== true).map(d => d.id as string),
      );
      const nonPaidBackIds = new Set<string>(
        (backLinked as any[]).filter(d => _DP_NO_DISBURSE_OV.has(d.status) || d.metadata?.deleted === true).map(d => d.pre_fund_transaction_id as string),
      );
      let sum = 0;
      for (const t of rawTxns) {
        if (t.source_table === 'down_payment_requests') {
          if (!t.source_id || paidDpSet.has(t.source_id)) sum += Number(t.amount ?? 0);
        } else if (!t.source_table) {
          if (!nonPaidBackIds.has(t.id)) sum += Number(t.amount ?? 0);
        } else {
          sum += Number(t.amount ?? 0);
        }
      }
      result.set(fundId, sum > 0 ? sum : (fallbacks.get(fundId) ?? 0));
    } catch {
      result.set(fundId, fallbacks.get(fundId) ?? 0);
    }
  }));
  return result;
}

interface PreFundRow {
  id: string; name: string; source: string | null;
  amount: number; currency: string;
  available_balance: number; committed_amount: number; paid_amount: number;
  status: string; period_type_name: string | null;
  start_date: string | null; end_date: string | null;
  country_id: string | null; project_id: string | null;
  threshold_pct: number | null; threshold_amount: number | null;
  warning_days: number | null; auto_renewal_mode: string;
  low_balance_alert: boolean; ending_soon_alert: boolean;
}

interface AllocRow {
  id: string; pre_fund_request_id: string; user_id: string;
  allocated_amount: number; spent_amount: number; currency: string; notes: string | null;
}

interface TxnRow {
  id: string; pre_fund_request_id: string; transaction_type: string;
  amount: number; currency: string; user_id: string | null; created_by: string | null;
  description: string | null; transaction_date: string | null;
  reconciled: boolean | null;
  source_table: string | null; source_id: string | null;
}

interface ExchangeRate { from_currency: string; to_currency: string; rate: number; effective_date: string }
interface Settings { base_currency: string }

const STATUS_CFG: Record<string, { label: string; badgeCls: string }> = {
  draft:            { label: 'Draft',             badgeCls: 'bg-slate-100 text-slate-600 border-slate-200' },
  pending_approval: { label: 'Awaiting Approval', badgeCls: 'bg-amber-100 text-amber-700 border-amber-200' },
  awaiting_receipt: { label: 'Awaiting Receipt',  badgeCls: 'bg-sky-100 text-sky-700 border-sky-200' },
  active:           { label: 'Active',            badgeCls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  low_balance:      { label: 'Low Balance',       badgeCls: 'bg-orange-100 text-orange-700 border-orange-200' },
  closed:           { label: 'Closed',            badgeCls: 'bg-slate-100 text-slate-500 border-slate-200' },
  period_locked:    { label: 'Period Locked',     badgeCls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const TXN_TYPE_LABEL: Record<string, string> = {
  payment: 'Payment', receipt: 'Receipt', commitment: 'Commitment',
  reversal: 'Reversal', carry_forward: 'Carry-Fwd', return: 'Return', adjustment: 'Adjustment',
};

const TXN_TYPE_COLOR: Record<string, string> = {
  payment:      'bg-rose-100 text-rose-700',
  receipt:      'bg-emerald-100 text-emerald-700',
  commitment:   'bg-violet-100 text-violet-700',
  reversal:     'bg-purple-100 text-purple-700',
  carry_forward:'bg-sky-100 text-sky-700',
  return:       'bg-cyan-100 text-cyan-700',
  adjustment:   'bg-slate-100 text-slate-600',
};

function statusBadge(status: string) {
  const cfg = STATUS_CFG[status] ?? { label: status, badgeCls: 'bg-muted text-muted-foreground border-border' };
  return <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 shrink-0', cfg.badgeCls)}>{cfg.label}</Badge>;
}

function renewalBadge(mode: string) {
  if (mode === 'auto_activate') return <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-indigo-50 text-indigo-700 border-indigo-200 shrink-0">Auto-Activate</Badge>;
  if (mode === 'auto_draft')    return <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-purple-50 text-purple-700 border-purple-200 shrink-0">Auto-Draft</Badge>;
  return null;
}

function usedPct(amount: number, available: number): number {
  if (amount <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round(((amount - available) / amount) * 100)));
}

function calcHealthScore(f: PreFundRow, unreconciledPayments: number): number {
  let score = 100;
  // Factor 1: % used (balance exhaustion)
  const pct = usedPct(f.amount, f.available_balance);
  if (pct >= 95) score -= 40; else if (pct >= 80) score -= 25; else if (pct >= 60) score -= 10;
  // Factor 2: days remaining
  if (f.end_date) {
    const d = differenceInDays(parseISO(f.end_date), new Date());
    if (d < 0) score -= 45; else if (d <= 7) score -= 30; else if (d <= 14) score -= 20; else if (d <= 30) score -= 10;
  }
  // Factor 3: low balance flag
  if (f.low_balance_alert) score -= 15;
  // Factor 4: unreconciled payment transactions (each one is a loose end)
  if (unreconciledPayments >= 10) score -= 15;
  else if (unreconciledPayments >= 5) score -= 10;
  else if (unreconciledPayments >= 2) score -= 5;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function SpendRateSparkline({ fundId, txns, currency }: { fundId: string; txns: TxnRow[]; currency: string }) {
  const WEEKS = 8;
  const now = new Date();
  const buckets = Array.from({ length: WEEKS }, (_, i) => {
    const end = new Date(now);
    end.setDate(now.getDate() - (WEEKS - 1 - i) * 7);
    const start = new Date(end);
    start.setDate(end.getDate() - 6);
    return { start, end, total: 0, label: format(start, 'MMM d') };
  });

  const fundPayments = txns.filter(
    t => t.pre_fund_request_id === fundId &&
         t.transaction_type === 'payment' &&
         t.transaction_date
  );
  for (const t of fundPayments) {
    const d = parseISO(t.transaction_date!);
    for (const b of buckets) {
      if (d >= b.start && d <= b.end) { b.total += t.amount; break; }
    }
  }

  if (buckets.every(b => b.total === 0)) return null;

  const maxVal = Math.max(...buckets.map(b => b.total), 1);

  return (
    <div className="mt-2.5 pt-2.5 border-t">
      <p className="text-[10px] text-muted-foreground mb-1.5 flex items-center gap-1">
        <TrendingDown className="h-3 w-3 shrink-0" />
        Weekly payment spend — last 8 wks
      </p>
      <div className="flex items-end gap-0.5 h-8" title="Weekly payment spend rate">
        {buckets.map((b, i) => {
          const pct = b.total > 0 ? Math.max(10, (b.total / maxVal) * 100) : 0;
          const cls = (b.total / maxVal) > 0.7 ? 'bg-rose-400 dark:bg-rose-500' :
                      (b.total / maxVal) > 0.4 ? 'bg-amber-400 dark:bg-amber-500' :
                      b.total > 0 ? 'bg-emerald-400 dark:bg-emerald-500' : 'bg-muted';
          return (
            <div
              key={i}
              className={cn('flex-1 rounded-sm transition-all', cls)}
              style={{ height: b.total > 0 ? `${pct}%` : '12%', opacity: b.total > 0 ? 1 : 0.3 }}
              title={b.total > 0 ? `${b.label}: ${currency} ${formatNumber(b.total, 0)}` : `${b.label}: no spend`}
            />
          );
        })}
      </div>
    </div>
  );
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
  // Finance/admin: full management; coordinators/supervisors/field staff: read-only balance view
  const isFinanceAdmin = hasAnyRole(['super_admin', 'admin', 'financialAdmin']);
  // countryDirector gets read-only balance dashboard view (same as field staff — no write actions)
  const canAccess = isFinanceAdmin || hasAnyRole(['coordinator', 'supervisor', 'fom', 'dataTeam', 'data_collector', 'employee', 'countryDirector']);
  const { status: gateStatus, allocatedFunds } = usePreFundPaymentGate();

  const [funds, setFunds]         = useState<PreFundRow[]>([]);
  const [allocs, setAllocs]       = useState<AllocRow[]>([]);
  const [txns, setTxns]           = useState<TxnRow[]>([]);
  // Raw (unfiltered) per-fund payment sums — mirrors what PreFundingReconciliation uses.
  // Stored separately from txns so DP/OCS validation does not reduce the paid-out total.
  const [rawFundPaySums, setRawFundPaySums] = useState<Map<string, number>>(new Map());
  const [profiles, setProfiles]   = useState<Map<string, string>>(new Map());
  // dpId → userId: built from validDpData.created_by so txnsByFundUser can attribute
  // spend correctly when pre_fund_transactions.user_id is null (officer stored in created_by).
  const [dpUserMap, setDpUserMap] = useState<Map<string, string>>(new Map());
  // ocsId → submitted_by (actual staff member who owns the OCS allocation spend)
  const [ocsUserMap, setOcsUserMap] = useState<Map<string, string>>(new Map());
  const [rates, setRates]         = useState<ExchangeRate[]>([]);
  const [settings, setSettings]   = useState<Settings | null>(null);
  const [loading, setLoading]         = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [baseCurrency, setBase]   = useState('USD');
  const [statusFilter, setStatus] = useState<string>('active');
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded]   = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      setError(null);
      setLoadingDetails(true);
      // ── Phase 1: fund headers only — renders the page immediately ──────────────
      // All three queries use fetchAll / maybeSingle — no row cap.
      const [loadedFunds, loadedRates, settingsRes] = await Promise.all([
        fetchAll(() => supabase.from('pre_fund_requests')
          .select('id,name,source,amount,currency,available_balance,committed_amount,paid_amount,status,period_type_name,start_date,end_date,country_id,project_id,threshold_pct,threshold_amount,warning_days,auto_renewal_mode,low_balance_alert,ending_soon_alert')
          .order('created_at', { ascending: false })),
        fetchAll(() => (supabase as any).from('acct_exchange_rates').select('from_currency,to_currency,rate,effective_date').order('effective_date', { ascending: false })),
        supabase.from('pre_fund_settings').select('base_currency').maybeSingle(),
      ]);

      setFunds(loadedFunds);
      setRates(loadedRates as ExchangeRate[]);
      if (settingsRes.data) {
        const s = settingsRes.data as any;
        setSettings({ base_currency: s.base_currency ?? 'USD' });
        setBase(s.base_currency ?? 'USD');
      }
      // ← Show fund cards NOW; rawFundPaySums fills in Phase 2 with accurate filtered sums
      setLoading(false);

      // ── Phase 2: allocation + transaction details (background) ─────────────────
      const fundIds = loadedFunds.map((f: any) => f.id as string);
      const fallbacks = new Map<string, number>(loadedFunds.map((f: any) => [f.id as string, Number(f.paid_amount ?? 0)]));
      const [allocsData, rawTxns, perFundPaid] = await Promise.all([
        fetchAllIn(chunk => (supabase as any).from('pre_fund_allocations').select('id,pre_fund_request_id,user_id,allocated_amount,spent_amount,currency,notes').in('pre_fund_request_id', chunk).order('allocated_amount', { ascending: false }), fundIds),
        fetchAllIn(chunk => (supabase as any).from('pre_fund_transactions').select('id,pre_fund_request_id,transaction_type,amount,currency,user_id,created_by,description,transaction_date,reconciled,source_table,source_id').in('pre_fund_request_id', chunk).order('transaction_date', { ascending: false }), fundIds),
        // Per-fund isolated computation — same as Reconciliation's loadTxns — avoids cross-fund
        // DP-set contamination that inflates paid-out totals in the global query.
        computePerFundEffectivePaid(fundIds, fallbacks, supabase),
      ]);
      // Update rawFundPaySums immediately so KPI cards reflect accurate paid/available totals.
      setRawFundPaySums(perFundPaid);

      setAllocs(allocsData as any);
      {
        // Filter out transactions whose source DP/OCS has been deleted or cancelled
        const dpIds = [...new Set(rawTxns.filter((t: any) => t.source_table === 'down_payment_requests' && t.source_id).map((t: any) => t.source_id as string))];
        const ocsIds = [...new Set(rawTxns.filter((t: any) => t.source_table === 'operational_cost_submissions' && t.source_id).map((t: any) => t.source_id as string))];
        // For old txns with NULL source_table, the DP stores back-link via pre_fund_transaction_id
        const rawTxnIds = rawTxns.map((t: any) => t.id as string).filter(Boolean);
        // Collect all user IDs from allocations for targeted profile lookup
        const allocUserIds = [...new Set((allocsData as any[]).map((a: any) => a.user_id as string).filter(Boolean))];
        // Also collect user IDs referenced directly by transactions (user_id + created_by)
        // so profiles for those users are available when showing the breakdown.
        const txnDirectUserIds = [
          ...new Set([
            ...rawTxns.map((t: any) => t.user_id as string).filter(Boolean),
            ...rawTxns.map((t: any) => t.created_by as string).filter(Boolean),
          ])
        ];
        // Merged unique set — fetched all at once to avoid separate round-trips
        const allPreFetchUserIds = [...new Set([...allocUserIds, ...txnDirectUserIds])];
        // Fetch validation data + profiles in parallel
        // requested_by = who the DP was raised FOR (allocation holder).
        // NOTE: down_payment_requests has no created_by / submitted_by — only requested_by.
        const [validDpData, validOcsData, backLinkedDpData, profData] = await Promise.all([
          fetchAllIn(chunk => (supabase as any).from('down_payment_requests').select('id,status,metadata,requested_by').in('id', chunk), dpIds),
          fetchAllIn(chunk => (supabase as any).from('operational_cost_submissions').select('id,submitted_by').in('id', chunk), ocsIds),
          fetchAllIn(chunk => (supabase as any).from('down_payment_requests').select('pre_fund_transaction_id,status,metadata').in('pre_fund_transaction_id', chunk), rawTxnIds),
          // Targeted profiles fetch for ALL users referenced (allocation holders + txn users)
          allPreFetchUserIds.length > 0
            ? fetchAllIn(chunk => supabase.from('profiles').select('id,full_name,email').in('id', chunk), allPreFetchUserIds)
            : Promise.resolve([]),
        ]);
        // DPs that still exist (non-cancelled, non-deleted) — used for commitment tracking
        const validDpSet  = new Set(validDpData.filter((d: any) => d.status !== 'cancelled' && d.metadata?.deleted !== true).map((d: any) => d.id as string));
        // DPs whose money has NOT yet moved (pre-disbursement / reverted / deleted).
        // Payment txns linked to these DPs are excluded from Paid Out totals.
        // 'approved' and all terminal paid states are intentionally NOT in this set.
        const DP_NO_DISBURSE = new Set(['pending', 'pending_supervisor', 'pending_admin', 'draft', 'rejected', 'cancelled']);
        const paidDpSet = new Set(
          validDpData
            .filter((d: any) => !DP_NO_DISBURSE.has(d.status) && d.metadata?.deleted !== true)
            .map((d: any) => d.id as string)
        );
        const validOcsSet = new Set(validOcsData.map((o: any) => o.id as string));
        // pre_fund_transactions IDs that are back-linked from deleted/cancelled DPs
        const deletedDpTxnIds = new Set<string>(
          backLinkedDpData
            .filter((d: any) => d.status === 'cancelled' || d.metadata?.deleted === true)
            .map((d: any) => d.pre_fund_transaction_id as string)
        );
        // Old-style txns (NULL source_table): IDs back-linked from a DP that has NOT disbursed
        const nonPaidBackLinkedTxnIds = new Set<string>(
          backLinkedDpData
            .filter((d: any) => DP_NO_DISBURSE.has(d.status) || d.metadata?.deleted === true)
            .map((d: any) => d.pre_fund_transaction_id as string)
        );
        const validTxns = rawTxns.filter(t => {
          if (t.source_table === 'down_payment_requests') {
            if (!t.source_id) return true;
            // payment txns excluded only if DP is in a pre-disbursement / reverted state
            if (t.transaction_type === 'payment') return paidDpSet.has(t.source_id);
            // commitment/other txns count if DP is not cancelled/deleted
            return validDpSet.has(t.source_id);
          }
          if (t.source_table === 'operational_cost_submissions') return !t.source_id || validOcsSet.has(t.source_id);
          // Old rows with NULL source_table — check back-links:
          // Exclude only if a pre-disbursement/reverted DP back-links here.
          // Manual payments (no DP back-link at all) are always included.
          if (!t.source_table && t.transaction_type === 'payment') {
            return !nonPaidBackLinkedTxnIds.has(t.id);
          }
          if (!t.source_table && t.transaction_type === 'commitment') {
            return !deletedDpTxnIds.has(t.id);
          }
          return true;
        });
        setTxns(validTxns);
        // rawFundPaySums already set from perFundPaid above (per-fund isolated computation).
        // Build dpId → userId map so txnsByFundUser can credit the right staff member
        // when pre_fund_transactions.user_id is null.
        // requested_by = the allocation holder (who the DP was raised for).
        const dpMap = new Map<string, string>();
        for (const dp of validDpData) {
          const uid = (dp as any).requested_by;
          if (uid) dpMap.set(dp.id as string, uid as string);
        }
        setDpUserMap(dpMap);
        // Build ocsId → submitted_by map so OCS payment txns are credited to the right staff member
        const ocsMap = new Map<string, string>();
        for (const ocs of validOcsData) {
          const uid = (ocs as any).submitted_by;
          if (uid) ocsMap.set(ocs.id as string, uid as string);
        }
        setOcsUserMap(ocsMap);
        // Build profiles map — only store rows with a real name or email; omit UUID-only placeholders
        const profRows: any[] = Array.isArray(profData) ? profData : ((profData as any).data ?? []);
        const m = new Map<string, string>();
        profRows.forEach((p: any) => {
          const name = (p.full_name || '').trim() || (p.email || '').trim();
          if (name) m.set(p.id, name);
        });
        // Supplement with DP/OCS-resolved user IDs whose profiles may not have been included above
        const dpResolvedIds = [...new Set([...dpMap.values(), ...ocsMap.values()])].filter(uid => !m.has(uid));
        if (dpResolvedIds.length > 0) {
          const extraProfs = await fetchAllIn(
            chunk => supabase.from('profiles').select('id,full_name,email').in('id', chunk),
            dpResolvedIds
          );
          for (const p of extraProfs as any[]) {
            const name = (p.full_name || '').trim() || (p.email || '').trim();
            if (name) m.set(p.id, name);
          }
        }
        setProfiles(m);
      }
    } catch (e: any) {
      setError(e.message ?? 'Failed to load');
    } finally {
      setLoading(false);
      setLoadingDetails(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh whenever a fund's paid_amount / available_balance changes in the DB.
  // This fires when directLinkPayment (or any other path) writes a new balance — so the
  // Overview always reflects the latest Paid-Out figure without needing a manual refresh.
  useEffect(() => {
    const channel = supabase
      .channel('overview_pre_fund_balance')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pre_fund_requests' },
        () => { load(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const handleRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

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
    const fromToUSD = from === 'USD' ? 1 : latestRateMap.get(`${from}→USD`) ?? (latestRateMap.has(`USD→${from}`) ? 1 / latestRateMap.get(`USD→${from}`)! : null);
    const usdToBase = to === 'USD' ? 1 : latestRateMap.get(`USD→${to}`) ?? (latestRateMap.has(`${to}→USD`) ? 1 / latestRateMap.get(`${to}→USD`)! : null);
    if (fromToUSD !== null && usdToBase !== null) return fromToUSD! * usdToBase!;
    return null;
  }

  function toBase(amount: number, currency: string): number {
    if (currency === baseCurrency) return amount;
    const r = getConversionRate(currency, baseCurrency);
    return r === null ? 0 : amount * r;
  }

  const missingRateCurrencies = useMemo(() => {
    const missing = new Set<string>();
    for (const f of funds) {
      if (f.currency !== baseCurrency && getConversionRate(f.currency, baseCurrency) === null) missing.add(f.currency);
    }
    return [...missing];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funds, latestRateMap, baseCurrency]);

  // Build per-fund allocation maps
  const allocsByFund = useMemo(() => {
    const m = new Map<string, AllocRow[]>();
    for (const a of allocs) {
      const list = m.get(a.pre_fund_request_id) ?? [];
      list.push(a);
      m.set(a.pre_fund_request_id, list);
    }
    return m;
  }, [allocs]);

  // Build per-fund allocation holder sets — needed for allocation-aware attribution below.
  const allocHoldersByFund = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const a of allocs) {
      if (!a.pre_fund_request_id || !a.user_id) continue;
      if (!m.has(a.pre_fund_request_id)) m.set(a.pre_fund_request_id, new Set());
      m.get(a.pre_fund_request_id)!.add(a.user_id);
    }
    return m;
  }, [allocs]);

  // Build per-fund, per-user, per-type spending from transactions.
  // Priority for user attribution (allocation-aware):
  //   1. t.user_id — if it's one of the fund's allocation holders, use it directly.
  //   2. dpUserMap.get(t.source_id) — DP's requested_by (who raised the DP) when user_id is null.
  //   3. t.created_by — if it IS an allocation holder (officer drew from their allocation).
  //   4. Resolved owner or created_by as last resort (may be '__unknown__').
  //
  // The allocation-aware fallback ensures that when a transaction's user_id resolves to a
  // non-allocated user (e.g., a field beneficiary) but the approving officer IS the allocation
  // holder, the spend is credited to the correct row instead of disappearing into __unknown__.
  const txnsByFundUser = useMemo(() => {
    const m = new Map<string, Map<string, Map<string, number>>>();
    for (const t of txns) {
      // Step 1: resolve best candidate owner
      let resolved = t.user_id as string | null;
      if (!resolved && t.source_table === 'down_payment_requests' && t.source_id) {
        resolved = dpUserMap.get(t.source_id) ?? null;
      }
      // OCS: submitted_by is the allocation holder (staff member who incurred the cost)
      if (!resolved && t.source_table === 'operational_cost_submissions' && t.source_id) {
        resolved = ocsUserMap.get(t.source_id) ?? null;
      }

      // Step 2: allocation-aware attribution
      const holders = allocHoldersByFund.get(t.pre_fund_request_id) ?? new Set<string>();
      let attrUid: string;
      if (resolved && holders.has(resolved)) {
        // Resolved owner is an allocation holder — perfect match
        attrUid = resolved;
      } else if (t.created_by && holders.has(t.created_by)) {
        // Officer who processed payment holds the allocation — credit them
        attrUid = t.created_by;
      } else {
        // Neither matches — fall back to resolved owner (or unknown)
        attrUid = resolved ?? t.created_by ?? '__unknown__';
      }

      const byUser = m.get(t.pre_fund_request_id) ?? new Map<string, Map<string, number>>();
      const byType = byUser.get(attrUid) ?? new Map<string, number>();
      byType.set(t.transaction_type, (byType.get(t.transaction_type) ?? 0) + (t.amount ?? 0));
      byUser.set(attrUid, byType);
      m.set(t.pre_fund_request_id, byUser);
    }
    return m;
  }, [txns, dpUserMap, ocsUserMap, allocHoldersByFund]);

  // Effective paid amount for a fund — highest (most conservative) of:
  //   1. Raw (unfiltered) payment transaction sum — exact same source as Reconciliation page.
  //      Stored in rawFundPaySums; populated at Phase-2 load before DP/OCS validation runs.
  //   2. paid_amount DB column — updated by directLinkPayment even when txn insert is blocked.
  // Falls back to 0 when Phase 2 has not completed yet (safe — transitions correctly once loaded).
  const effectivePaid = (f: { id: string; amount: number; paid_amount?: number }) => {
    const fromRawTxns = rawFundPaySums.get(f.id) ?? 0;
    const fromCol     = Number(f.paid_amount ?? 0);
    return Math.max(fromRawTxns, fromCol);
  };

  // True available = amount − effectivePaid, further capped by available_balance DB column.
  // Taking the minimum ensures a stale-high available_balance never inflates the figure.
  const conservativeAvail = (f: { id: string; amount: number; available_balance?: number; paid_amount?: number; currency: string }) => {
    const paid      = effectivePaid(f);
    const fromPaid  = Math.max(0, f.amount - paid);
    return f.available_balance != null ? Math.min(Number(f.available_balance), fromPaid) : fromPaid;
  };

  const filtered = funds.filter(f => statusFilter === 'all' ? true : f.status === statusFilter);
  const activeFunds = funds.filter(f => ['active', 'low_balance'].includes(f.status));
  const totalFunded  = activeFunds.reduce((s, f) => s + toBase(f.amount, f.currency), 0);
  const totalAvail   = activeFunds.reduce((s, f) => s + toBase(conservativeAvail(f), f.currency), 0);
  const totalCommit  = activeFunds.reduce((s, f) => s + toBase(f.committed_amount, f.currency), 0);
  // Paid-out total also uses the transaction-accurate effectivePaid figure
  const totalPaidOut = activeFunds.reduce((s, f) => s + toBase(effectivePaid(f), f.currency), 0);
  const endingSoon  = activeFunds.filter(f => {
    if (!f.end_date) return false;
    return differenceInDays(parseISO(f.end_date), new Date()) >= 0 && differenceInDays(parseISO(f.end_date), new Date()) <= (f.warning_days ?? 14);
  }).length;
  const nearExhaustion = activeFunds.filter(f => f.low_balance_alert).length;

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  function exportBalances() {
    const rows = filtered.map(f => {
      return {
        'Fund Name': f.name,
        'Source': f.source ?? '—',
        'Status': STATUS_CFG[f.status]?.label ?? f.status,
        'Amount': f.amount,
        'Paid Out': effectivePaid(f),
        'Committed': f.committed_amount,
        'Available': conservativeAvail(f),
        'Currency': f.currency,
        'Start Date': f.start_date ?? '—',
        'End Date': f.end_date ?? '—',
      };
    });
    exportToExcel(rows, 'Pre-Fund Balances', `pre-fund-balances-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  }

  if (!canAccess) {
    return (
      <div className="p-8 text-center">
        <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-destructive" />
        <p className="text-muted-foreground">You don't have access to Pre-Funding.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Banknote className="h-5 w-5 text-sky-600" />
            Balance Dashboard
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">All pre-fund balances, commitments, and staff allocations at a glance</p>
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
              {[...new Set([...funds.map(f => f.currency), ...rates.map(r => r.from_currency), ...rates.map(r => r.to_currency)])].sort().map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportBalances} data-testid="button-export-prefunding-overview">
            <Download className="h-4 w-4 mr-1.5" />Export
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} data-testid="button-refresh-overview">
            <RefreshCw className={cn('h-4 w-4 mr-1.5', refreshing && 'animate-spin')} />
            Refresh
          </Button>
          {isFinanceAdmin && (
          <Button size="sm" onClick={() => navigate('/pre-funding?tab=registry')} data-testid="button-new-fund">
            + New Fund
          </Button>
          )}
        </div>
      </div>

      {/* ── Pre-Funding Action Banner (for allocated non-admin users) ─────── */}
      {gateStatus === 'prefund_only' && !isFinanceAdmin && (
        <div className="rounded-xl border border-emerald-400/50 bg-emerald-50 dark:bg-emerald-900/15 p-4 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-start gap-3 flex-1">
            <Receipt className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="font-semibold text-emerald-800 dark:text-emerald-300 text-sm">
                You have an active pre-fund allocation / لديك تخصيص تمويل مسبق نشط
              </p>
              {allocatedFunds.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {allocatedFunds.map(f => (
                    <span key={f.id} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-800/40 text-emerald-800 dark:text-emerald-300 font-medium border border-emerald-300/50">
                      {f.name} · {f.currency} {f.remaining.toLocaleString()} remaining
                    </span>
                  ))}
                </div>
              )}
              <p className="text-xs text-emerald-700 dark:text-emerald-400">
                Submit your field expenses here — they will be deducted from your allocation automatically.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
            onClick={() => navigate('/cost-submission')}
            data-testid="button-submit-expense-prefund"
          >
            <Receipt className="h-3.5 w-3.5" />
            Submit Expense
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error} — run the pre_funding_migration.sql to set up tables.</AlertDescription>
        </Alert>
      )}

      {!loading && !error && missingRateCurrencies.length > 0 && (
        <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-700 dark:text-amber-400">
            No exchange rate for <strong>{missingRateCurrencies.join(', ')}</strong> → {baseCurrency}.
            Funds in these currencies are excluded from aggregate totals.{' '}
            <button className="underline font-medium" onClick={() => navigate('/accounting/multi-currency')}>
              Add rates in Accounting → Multi-Currency
            </button>.
          </AlertDescription>
        </Alert>
      )}

      {/* Expiry Alerts Banner */}
      {!loading && (() => {
        const expiring = activeFunds.filter(f => {
          if (!f.end_date) return false;
          const effAvail = conservativeAvail(f);
          if (effAvail <= 0) return false;
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
                  const effAvail = conservativeAvail(f);
                  const cls = d <= 7 ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
                  return (
                    <span key={f.id} className={cn('text-xs px-2 py-0.5 rounded-full font-medium', cls)}>
                      {f.name} — {f.currency} {formatNumber(effAvail, 0)} left · {d}d remaining
                    </span>
                  );
                })}
              </div>
            </AlertDescription>
          </Alert>
        );
      })()}

      {/* KPI Row */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: 'Total Funded', labelAr: 'إجمالي التمويل', value: formatNumber(totalFunded, 0), sub: `${activeFunds.length} active fund${activeFunds.length !== 1 ? 's' : ''}`, icon: DollarSign, accent: 'bg-sky-600' },
            { label: 'Available Balance', labelAr: 'الرصيد المتاح', value: formatNumber(totalAvail, 0), sub: loadingDetails ? 'Calculating…' : `${baseCurrency} across all active funds`, icon: Banknote, accent: totalAvail < totalFunded * 0.2 ? 'bg-rose-600' : 'bg-emerald-600', calculating: loadingDetails },
            { label: 'Paid Out', labelAr: 'المدفوع', value: formatNumber(totalPaidOut, 0), sub: loadingDetails ? 'Calculating…' : `${baseCurrency} disbursed from active funds`, icon: TrendingDown, accent: 'bg-rose-600', calculating: loadingDetails },
            { label: 'Committed', labelAr: 'المرتبط', value: formatNumber(totalCommit, 0), sub: 'Reserved from active pre-funds', icon: Lock, accent: 'bg-violet-600' },
            { label: 'Needs Attention', labelAr: 'تحتاج انتباه', value: String(nearExhaustion + endingSoon), sub: `${nearExhaustion} low balance · ${endingSoon} ending soon`, icon: AlertTriangle, accent: (nearExhaustion + endingSoon) > 0 ? 'bg-amber-500' : 'bg-slate-500' },
          ].map(kpi => (
            <Card key={kpi.label} className="relative overflow-hidden">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <div className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">{kpi.label}</div>
                      {(kpi as any).calculating && <div className="h-2.5 w-2.5 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin shrink-0" />}
                    </div>
                    <div className="text-[9px] text-muted-foreground" dir="rtl">{kpi.labelAr}</div>
                    {(kpi as any).calculating
                      ? <div className="mt-1.5 h-8 w-36 rounded bg-muted animate-pulse" />
                      : <div className="mt-1.5 text-2xl font-bold tabular-nums leading-none">{kpi.value}</div>
                    }
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

      {/* Filter bar */}
      <div className="flex items-center gap-0 border rounded-lg overflow-hidden divide-x bg-background">
        <span className="text-xs text-muted-foreground px-3 py-2 bg-muted/40 font-medium shrink-0">Filter:</span>
        {(['all', 'active', 'low_balance', 'pending_approval', 'awaiting_receipt', 'draft', 'closed'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={cn(
              'flex-1 text-center px-3 py-2 text-xs font-medium transition-all whitespace-nowrap',
              statusFilter === s
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
            )}
            data-testid={`filter-status-${s}`}
          >
            {s === 'all' ? 'All' : STATUS_CFG[s]?.label ?? s}
            {<span className={cn('ml-1', statusFilter === s ? 'opacity-80' : 'opacity-50')}>
              {s === 'all' ? funds.length : funds.filter(f => f.status === s).length}
            </span>}
          </button>
        ))}
      </div>

      {/* Fund cards — full width, one per row */}
      {loading ? (
        <div className="space-y-4">
          {[1,2,3].map(i => <Skeleton key={i} className="h-48 rounded-xl w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Banknote className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No pre-funds found</p>
          <p className="text-sm mt-1">Create your first fund in the Fund Registry</p>
          {isFinanceAdmin && <Button className="mt-4" onClick={() => navigate('/pre-funding?tab=registry')}>+ New Pre-Fund</Button>}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(f => {
            // Use transaction-accurate figures — mirrors what Reconciliation page shows.
            // effectivePaid = MAX(txn sum, paid_amount DB col); conservativeAvail uses MIN logic.
            const effPaid  = effectivePaid(f);
            const effAvail = conservativeAvail(f);
            // ef is a corrected copy of f — all helper functions that accept f get right values
            const ef = { ...f, paid_amount: effPaid, available_balance: effAvail };

            const pct = usedPct(ef.amount, ef.available_balance);
            const daysLeft = f.end_date ? differenceInDays(parseISO(f.end_date), new Date()) : null;
            const endingSoonFlag = daysLeft !== null && daysLeft >= 0 && daysLeft <= (f.warning_days ?? 14);
            const isAlert = f.low_balance_alert || endingSoonFlag;
            const baseAvail  = toBase(ef.available_balance, f.currency);
            const baseAmount = toBase(f.amount, f.currency);
            const baseCommit = toBase(f.committed_amount, f.currency);
            const burnDays    = calcBurnDaysLeft(ef);

            const fundAllocs = allocsByFund.get(f.id) ?? [];
            const fundTxnsByUser = txnsByFundUser.get(f.id) ?? new Map();
            const isOpen = expanded.has(f.id);

            // Unreconciled payment count — factored into health score and shown as pill
            const unreconciledCount = txns.filter(
              t => t.pre_fund_request_id === f.id &&
                   t.transaction_type === 'payment' &&
                   t.reconciled === false
            ).length;
            const healthScore = calcHealthScore(f, unreconciledCount);
            const healthCls = healthScore >= 70
              ? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300'
              : healthScore >= 40
              ? 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300'
              : 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300';

            return (
              <Card
                key={f.id}
                className={cn('transition-shadow hover:shadow-md border w-full', isAlert && 'ring-1 ring-amber-400')}
                data-testid={`card-fund-${f.id}`}
              >
                {/* ── Card Header ─────────────────────────────────────── */}
                <CardHeader className="pb-3 pt-4 px-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base font-semibold">{f.name}</CardTitle>
                      {f.source && <p className="text-[11px] text-muted-foreground mt-0.5">{f.source}</p>}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end shrink-0">
                      {statusBadge(f.status)}
                      {renewalBadge(f.auto_renewal_mode)}
                      {unreconciledCount > 0 && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/20 dark:text-orange-300"
                          title={`${unreconciledCount} unreconciled payment transaction${unreconciledCount !== 1 ? 's' : ''}`}
                        >
                          ⚠ {unreconciledCount} unreconciled
                        </Badge>
                      )}
                      <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 font-semibold', healthCls)} title="Fund health score (0–100): weighted from % used, days remaining, and unreconciled payments">
                        ♥ {healthScore}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>

                {/* ── Main Body ───────────────────────────────────────── */}
                <CardContent className="px-5 pb-4 space-y-4">

                  {/* Top row: balance bar + key amounts + period info */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                    {/* Col 1 — Balance bar + spend rate sparkline */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-end">
                        <span className="text-[11px] text-muted-foreground">Used {pct}%</span>
                        <span className="text-sm font-bold font-mono">{f.currency} {formatNumber(ef.available_balance, 0)}</span>
                      </div>
                      <Progress
                        value={pct}
                        className={cn('h-3 rounded-full', pct >= 90 ? '[&>div]:bg-rose-500' : pct >= 70 ? '[&>div]:bg-amber-500' : '[&>div]:bg-emerald-500')}
                      />
                      <p className="text-[10px] text-muted-foreground">Available balance</p>
                      {f.currency !== baseCurrency && (
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <ArrowUpDown className="h-3 w-3" />
                          <span>{baseCurrency}: {formatNumber(baseAvail, 0)} avail · {formatNumber(baseAmount, 0)} total</span>
                        </div>
                      )}
                      <SpendRateSparkline fundId={f.id} txns={txns} currency={f.currency} />
                    </div>

                    {/* Col 2 — Amounts grid */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                      <div>
                        <p className="text-muted-foreground">Funded</p>
                        <p className="font-mono font-semibold text-sm">{f.currency} {formatNumber(f.amount, 0)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Available</p>
                        <p className="font-mono font-semibold text-sm text-emerald-600">{f.currency} {formatNumber(ef.available_balance, 0)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Committed</p>
                        <p className="font-mono font-medium text-violet-600">{f.currency} {formatNumber(f.committed_amount, 0)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Paid Out</p>
                        <p className="font-mono font-medium text-rose-600">{f.currency} {formatNumber(ef.paid_amount, 0)}</p>
                      </div>
                      {f.currency !== baseCurrency && (
                        <div className="col-span-2 text-[10px] text-muted-foreground">
                          {baseCurrency}: {formatNumber(baseCommit, 0)} committed
                        </div>
                      )}
                    </div>

                    {/* Col 3 — Period + burn + alerts */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5 shrink-0" />
                        {f.start_date && f.end_date
                          ? <span>{format(parseISO(f.start_date), 'MMM d')} – {format(parseISO(f.end_date), 'MMM d, yyyy')}</span>
                          : <span>{f.period_type_name ?? 'No period set'}</span>}
                        {daysLeft !== null && daysLeft >= 0 && (
                          <span className={cn('ml-auto font-semibold shrink-0', endingSoonFlag ? 'text-amber-600' : 'text-foreground')}>
                            {daysLeft}d left
                          </span>
                        )}
                        {daysLeft !== null && daysLeft < 0 && (
                          <span className="ml-auto text-rose-600 font-semibold shrink-0">Expired</span>
                        )}
                      </div>
                      {burnDays !== null && (
                        <div className={cn('flex items-center gap-1.5 text-[11px] rounded-md px-2 py-1',
                          burnDays <= 14 ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/20' :
                          burnDays <= 30 ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/20' :
                          'bg-muted/50 text-muted-foreground'
                        )}>
                          <Flame className="h-3.5 w-3.5 shrink-0" />
                          <span>Burn rate: balance lasts ~{burnDays}d</span>
                        </div>
                      )}
                      {f.low_balance_alert && (
                        <div className="flex items-center gap-1.5 text-[11px] text-orange-600 bg-orange-50 dark:bg-orange-950/20 rounded-md px-2 py-1">
                          <TrendingDown className="h-3.5 w-3.5 shrink-0" />
                          Low balance — below threshold
                        </div>
                      )}
                      {endingSoonFlag && (
                        <div className="flex items-center gap-1.5 text-[11px] text-amber-600 bg-amber-50 dark:bg-amber-950/20 rounded-md px-2 py-1">
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                          Ending in {daysLeft} day{daysLeft !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── Action bar ──────────────────────────────────────── */}
                  <div className="flex items-center justify-between gap-3 pt-1 border-t">
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="h-7 text-xs px-3" onClick={() => navigate('/pre-funding?tab=registry')} data-testid={`button-view-fund-${f.id}`}>
                        View
                      </Button>
                      {isFinanceAdmin && ['active', 'low_balance'].includes(f.status) && (
                        <Button variant="outline" size="sm" className="h-7 text-xs px-3" onClick={() => navigate('/pre-funding?tab=reconciliation')}>
                          Reconcile <ChevronRight className="h-3.5 w-3.5 ml-1" />
                        </Button>
                      )}
                    </div>

                    {/* Toggle allocations */}
                    <button
                      onClick={() => toggleExpand(f.id)}
                      className={cn(
                        'flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border transition-all',
                        isOpen
                          ? 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-300'
                          : 'text-muted-foreground border-border hover:border-sky-300 hover:text-sky-700'
                      )}
                      data-testid={`button-toggle-alloc-${f.id}`}
                    >
                      <Users className="h-3.5 w-3.5" />
                      {fundAllocs.length > 0
                        ? `${isOpen ? 'Hide' : 'Show'} ${fundAllocs.length} staff allocation${fundAllocs.length !== 1 ? 's' : ''}`
                        : 'No staff allocations'}
                      {fundAllocs.length > 0 && (isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />)}
                    </button>
                  </div>

                  {/* ── User Allocations Panel ──────────────────────────── */}
                  {isOpen && (
                    <div className="border rounded-lg overflow-hidden bg-muted/20 dark:bg-muted/10">
                      {loadingDetails ? (
                        <div className="p-4 space-y-2">
                          {[1,2].map(i => <Skeleton key={i} className="h-10 w-full rounded" />)}
                        </div>
                      ) : fundAllocs.length === 0 ? (
                        <div className="text-center py-6 text-muted-foreground text-sm">
                          <User className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          No allocations yet for this fund
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          {(() => {
                            // Fund-level unattributed spend — distributed proportionally as fallback
                            const totAllocAmt = fundAllocs.reduce((s, a) => s + a.allocated_amount, 0);
                            const unknownPayment = fundTxnsByUser.get('__unknown__')?.get('payment') ?? 0;
                            return (
                          <table className="w-full text-[12px]">
                            <thead>
                              <tr className="bg-muted/50 border-b">
                                <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Staff Member</th>
                                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Allocated</th>
                                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Spent</th>
                                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Remaining</th>
                                <th className="text-center px-4 py-2.5 font-semibold text-muted-foreground">% Used</th>
                                <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Transaction Breakdown</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {fundAllocs.map(a => {
                                // Name: use profile → fallback to "Staff (id-prefix)"
                                const userName = profiles.get(a.user_id) ?? `Staff (${a.user_id.slice(0, 8)})`;
                                // Transaction breakdown for this user
                                const userTxns = fundTxnsByUser.get(a.user_id) ?? new Map<string, number>();
                                const txnSpent = userTxns.get('payment') ?? 0;
                                // Spent priority: 1) DB spent_amount  2) attributed txns  3) proportional share of unattributed
                                const propSpent = unknownPayment > 0 && totAllocAmt > 0
                                  ? Math.round(unknownPayment * a.allocated_amount / totAllocAmt) : 0;
                                const isEstimated = txnSpent === 0 && (a.spent_amount ?? 0) === 0 && propSpent > 0;
                                const displaySpent = (a.spent_amount ?? 0) > 0 ? (a.spent_amount ?? 0)
                                  : txnSpent > 0 ? txnSpent
                                  : propSpent;
                                const remaining = a.allocated_amount - displaySpent;
                                const pctUsed = a.allocated_amount > 0
                                  ? Math.min(100, Math.round((displaySpent / a.allocated_amount) * 100))
                                  : 0;

                                return (
                                  <tr key={a.id} className="hover:bg-muted/30 transition-colors">
                                    {/* Staff name */}
                                    <td className="px-4 py-3">
                                      <div className="flex items-center gap-2">
                                        <div className="h-7 w-7 rounded-full bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center text-sky-700 dark:text-sky-300 font-semibold text-[11px] shrink-0">
                                          {userName.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                          <p className="font-medium text-foreground">{userName}</p>
                                          {a.notes && <p className="text-[10px] text-muted-foreground truncate max-w-[160px]">{a.notes}</p>}
                                        </div>
                                      </div>
                                    </td>

                                    {/* Allocated */}
                                    <td className="px-4 py-3 text-right">
                                      <span className="font-mono font-semibold">{a.currency} {formatNumber(a.allocated_amount, 0)}</span>
                                    </td>

                                    {/* Spent */}
                                    <td className="px-4 py-3 text-right">
                                      <span
                                        className={cn('font-mono font-medium', displaySpent > 0 ? 'text-rose-600' : 'text-muted-foreground')}
                                        title={isEstimated ? 'Estimated: proportionally distributed from unattributed fund payments' : undefined}
                                      >
                                        {isEstimated ? '~' : ''}{a.currency} {formatNumber(displaySpent, 0)}
                                      </span>
                                    </td>

                                    {/* Remaining */}
                                    <td className="px-4 py-3 text-right">
                                      <span className={cn('font-mono font-semibold',
                                        remaining <= 0 ? 'text-rose-600' :
                                        pctUsed >= 80 ? 'text-amber-600' :
                                        'text-emerald-600'
                                      )}>
                                        {a.currency} {formatNumber(remaining, 0)}
                                      </span>
                                    </td>

                                    {/* % Used with mini bar */}
                                    <td className="px-4 py-3">
                                      <div className="flex flex-col items-center gap-1 min-w-[64px]">
                                        <span className={cn('font-semibold text-[11px]',
                                          pctUsed >= 90 ? 'text-rose-600' : pctUsed >= 70 ? 'text-amber-600' : 'text-emerald-600'
                                        )}>{pctUsed}%</span>
                                        <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                                          <div
                                            className={cn('h-full rounded-full transition-all',
                                              pctUsed >= 90 ? 'bg-rose-500' : pctUsed >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
                                            )}
                                            style={{ width: `${pctUsed}%` }}
                                          />
                                        </div>
                                      </div>
                                    </td>

                                    {/* Transaction breakdown by type */}
                                    <td className="px-4 py-3">
                                      {userTxns.size === 0 ? (
                                        <span className="text-muted-foreground text-[10px]">No transactions</span>
                                      ) : (
                                        <div className="flex flex-wrap gap-1">
                                          {[...userTxns.entries()].map(([type, amount]) => (
                                            <span
                                              key={type}
                                              className={cn('inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium', TXN_TYPE_COLOR[type] ?? 'bg-slate-100 text-slate-600')}
                                              title={`${TXN_TYPE_LABEL[type] ?? type}: ${f.currency} ${formatNumber(amount, 0)}`}
                                            >
                                              <Layers className="h-2.5 w-2.5" />
                                              {TXN_TYPE_LABEL[type] ?? type}: {f.currency} {formatNumber(amount, 0)}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>

                            {/* Footer totals */}
                            {fundAllocs.length > 1 && (() => {
                              const totAlloc = fundAllocs.reduce((s, a) => s + a.allocated_amount, 0);
                              // Mirror the same priority logic as per-row: DB spent_amount → attributed txns → proportional
                              const totSpent = fundAllocs.reduce((s, a) => {
                                const uTxns = fundTxnsByUser.get(a.user_id) ?? new Map<string, number>();
                                const txnPaid = uTxns.get('payment') ?? 0;
                                const prop = unknownPayment > 0 && totAllocAmt > 0
                                  ? Math.round(unknownPayment * a.allocated_amount / totAllocAmt) : 0;
                                const spent = (a.spent_amount ?? 0) > 0 ? (a.spent_amount ?? 0) : txnPaid > 0 ? txnPaid : prop;
                                return s + spent;
                              }, 0);
                              const totRem   = totAlloc - totSpent;
                              const totPct   = totAlloc > 0 ? Math.min(100, Math.round((totSpent / totAlloc) * 100)) : 0;
                              const cur      = fundAllocs[0]?.currency ?? f.currency;
                              return (
                                <tfoot>
                                  <tr className="bg-muted/40 border-t font-semibold">
                                    <td className="px-4 py-2.5 text-[11px] text-muted-foreground">
                                      <div className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> {fundAllocs.length} staff total</div>
                                    </td>
                                    <td className="px-4 py-2.5 text-right font-mono text-[12px]">{cur} {formatNumber(totAlloc, 0)}</td>
                                    <td className="px-4 py-2.5 text-right font-mono text-[12px] text-rose-600">{cur} {formatNumber(totSpent, 0)}</td>
                                    <td className="px-4 py-2.5 text-right font-mono text-[12px] text-emerald-600">{cur} {formatNumber(totRem, 0)}</td>
                                    <td className="px-4 py-2.5 text-center text-[11px] font-semibold">{totPct}%</td>
                                    <td className="px-4 py-2.5" />
                                  </tr>
                                </tfoot>
                              );
                            })()}
                          </table>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
