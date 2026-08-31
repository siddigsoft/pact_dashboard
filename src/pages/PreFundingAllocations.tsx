import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAppContext } from '@/context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Users, RefreshCw, AlertTriangle, Search, ChevronDown, ChevronRight,
  Wallet, TrendingDown, CheckCircle2, Info, Download, Pencil, Check, X,
} from 'lucide-react';
import { formatNumber } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import { exportToExcel } from '@/utils/report-export';
import { format } from 'date-fns';

/** Auto-paginates through all rows 1000 at a time — bypasses Supabase default cap. */
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

/** Batched .in() — splits large ID lists into 500-ID chunks to avoid URL limits. */
async function fetchAllIn<T = any>(queryFn: (chunk: string[]) => any, ids: string[]): Promise<T[]> {
  if (ids.length === 0) return [];
  const CHUNK = 500;
  const batches: Promise<T[]>[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    batches.push(fetchAll<T>(() => queryFn(ids.slice(i, i + CHUNK))));
  }
  return (await Promise.all(batches)).flat();
}

interface AllocRow {
  id: string;
  user_id: string;
  pre_fund_request_id: string;
  allocated_amount: number;
  spent_amount: number;
  currency: string;
  notes: string | null;
  created_at: string;
  fund_name: string;
  fund_status: string;
  user_name: string;
  user_email: string;
  user_role: string;
}

interface StaffSummary {
  user_id: string;
  user_name: string;
  user_email: string;
  user_role: string;
  total_allocated: number;
  total_spent: number;
  funds_count: number;
  allocations: AllocRow[];
  primary_currency: string;
}

function healthColor(pct: number) {
  if (pct >= 90) return 'text-rose-600';
  if (pct >= 70) return 'text-amber-600';
  return 'text-emerald-600';
}

function progressColor(pct: number) {
  if (pct >= 90) return '[&>div]:bg-rose-500';
  if (pct >= 70) return '[&>div]:bg-amber-500';
  return '[&>div]:bg-emerald-500';
}

function roleBadge(role: string) {
  const cfg: Record<string, string> = {
    super_admin: 'bg-gray-100 text-gray-700',
    admin: 'bg-red-100 text-red-700',
    financialAdmin: 'bg-green-100 text-green-700',
    financial_admin: 'bg-green-100 text-green-700',
    coordinator: 'bg-violet-100 text-violet-700',
    supervisor: 'bg-orange-100 text-orange-700',
    data_collector: 'bg-blue-100 text-blue-700',
    employee: 'bg-slate-100 text-slate-700',
  };
  const cls = cfg[role] ?? 'bg-muted text-muted-foreground';
  return (
    <Badge variant="secondary" className={cn('text-[10px] px-1.5 py-0', cls)}>
      {role.replace(/_/g, ' ')}
    </Badge>
  );
}

export default function PreFundingAllocations() {
  const { hasAnyRole } = useAuthorization();
  const { currentUser } = useAppContext();
  const navigate = useNavigate();
  // Finance/Admin can see all funds and all staff allocations
  // Fund holders (CD, FOM, etc.) see only allocations within their assigned funds
  // Other roles see only their own allocation row
  const isFinanceAdmin       = hasAnyRole(['super_admin', 'admin', 'financialAdmin']);
  // CD / FOM / etc. are now fund holders with a scoped view — they are NOT
  // full finance admins, so canManageAllocations is finance-only.
  const canManageAllocations = isFinanceAdmin;
  const canAccess            = canManageAllocations || !!currentUser?.id;

  const [allAllocations, setAll] = useState<AllocRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [detailsReady, setDetailsReady] = useState(false);
  const [search, setSearch]     = useState('');
  const [fundFilter, setFund]   = useState('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [funds, setFunds]       = useState<{ id: string; name: string }[]>([]);
  // Fund-level paid_amount — source of truth for actual total spend
  const [fundPaidMap, setFundPaidMap] = useState<Map<string, number>>(new Map());
  // Inline allocation editing — available to Finance Admin and Country Director
  const [editingAllocId, setEditingAllocId] = useState<string | null>(null);
  const [editAllocAmt, setEditAllocAmt]     = useState('');
  const loadVersion = useRef(0);

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    setDetailsLoading(true);
    setDetailsReady(false);
    try {
      // For non-finance-admin users (fund holders: CD, FOM, etc.):
      // fetch their assigned fund IDs first, then scope allocations to those funds.
      let holderFundIds: string[] | null = null;
      if (!isFinanceAdmin && currentUser?.id) {
        const { data: holderFunds } = await (supabase as any)
          .from('pre_fund_requests')
          .select('id')
          .eq('holder_user_id', currentUser.id);
        holderFundIds = (holderFunds ?? []).map((f: any) => f.id as string);
      }

      // Fetch allocations — unlimited, scoped by holder funds or own user_id
      const allocs: any[] = await fetchAll(() => {
        let q = (supabase as any)
          .from('pre_fund_allocations')
          .select('id,user_id,pre_fund_request_id,allocated_amount,spent_amount,currency,notes,created_at')
          .order('created_at', { ascending: false });
        if (!isFinanceAdmin) {
          if (holderFundIds && holderFundIds.length > 0) {
            // Fund holder: see all staff allocations within their assigned funds
            q = q.in('pre_fund_request_id', holderFundIds);
          } else if (currentUser?.id) {
            // Not a holder or no funds found — show own row only
            q = q.eq('user_id', currentUser.id);
          }
        }
        return q;
      });

      if (version !== loadVersion.current) return;
      if (allocs.length === 0) {
        setAll([]);
        setFunds([]);
        setLoading(false);
        setDetailsLoading(false);
        setDetailsReady(true);
        return;
      }

      const userIds  = [...new Set(allocs.map((a: any) => a.user_id as string).filter(Boolean))];
      const fundIds  = [...new Set(allocs.map((a: any) => a.pre_fund_request_id as string).filter(Boolean))];

      // Profiles and fund labels are sufficient for first paint. Ledger
      // attribution is loaded immediately afterward without blocking the page.
      const [profilesData, fundsData] = await Promise.all([
        fetchAllIn(chunk => supabase.from('profiles').select('id,full_name,email,role').in('id', chunk), userIds),
        fetchAllIn(chunk => (supabase as any).from('pre_fund_requests').select('id,name,status,currency,paid_amount').in('id', chunk), fundIds),
      ]);
      if (version !== loadVersion.current) return;

      const profileMap = new Map(profilesData.map((p: any) => [p.id as string, p]));
      const fundMap    = new Map(fundsData.map((f: any) => [f.id as string, f]));
      const baseEnriched: AllocRow[] = allocs.map((a: any) => {
        const p = profileMap.get(a.user_id) as any;
        const f = fundMap.get(a.pre_fund_request_id) as any;
        return {
          ...a,
          allocated_amount: Number(a.allocated_amount),
          spent_amount: Math.max(0, Number(a.spent_amount ?? 0)),
          fund_name:   f?.name   ?? 'Unknown Fund',
          fund_status: f?.status ?? 'unknown',
          user_name:   p?.full_name ?? p?.email ?? 'Unknown',
          user_email:  p?.email  ?? '',
          user_role:   p?.role   ?? 'employee',
        };
      });
      setAll(baseEnriched);
      setFunds(fundsData.map((f: any) => ({ id: f.id as string, name: f.name as string })));

      const paidMap = new Map<string, number>();
      for (const f of fundsData as any[]) {
        const dbPaid  = Number(f.paid_amount ?? 0);
        paidMap.set(f.id as string, dbPaid);
      }
      setFundPaidMap(paidMap as Map<string, number>);
      setLoading(false);

      const rawTxns = await fetchAllIn(
        chunk => (supabase as any)
          .from('pre_fund_event_ledger_v')
          .select('id,user_id,pre_fund_request_id,amount,signed_paid_amount,transaction_type,source_table,source_id,created_by,reversal_of_id')
          .in('pre_fund_request_id', chunk)
          .eq('source_is_verified', true)
          .neq('signed_paid_amount', 0),
        fundIds,
      );
      if (version !== loadVersion.current) return;
      const validTxns = rawTxns;
      const txnById = new Map(validTxns.map((t: any) => [t.id, t]));

      // Some transactions (esp. manually added via Reconciliation, or auto-linked
      // where the staff member has no allocation yet) are saved with user_id = NULL
      // even though the underlying source record (a down-payment request or a cost
      // submission) clearly belongs to a specific staff member. Recover that
      // ownership from the source record so per-staff totals aren't silently
      // dropped into "unattributed" when we can actually identify the owner.
      const untaggedDpIds = [...new Set(
        validTxns.filter(t => !t.user_id && t.source_table === 'down_payment_requests' && t.source_id)
          .map(t => t.source_id as string)
      )];
      const untaggedOcsIds = [...new Set(
        validTxns.filter(t => !t.user_id && t.source_table === 'operational_cost_submissions' && t.source_id)
          .map(t => t.source_id as string)
      )];
      const [dpOwnerRows, ocsOwnerRows] = await Promise.all([
        fetchAllIn(chunk => (supabase as any).from('down_payment_requests').select('id,requested_by').in('id', chunk), untaggedDpIds),
        fetchAllIn(chunk => (supabase as any).from('operational_cost_submissions').select('id,submitted_by').in('id', chunk), untaggedOcsIds),
      ]);
      const dpOwnerMap  = new Map<string, string>(dpOwnerRows.map((r: any) => [r.id as string, r.requested_by as string]));
      const ocsOwnerMap = new Map<string, string>(ocsOwnerRows.map((r: any) => [r.id as string, r.submitted_by as string]));
      const resolveOwner = (t: any): string | null => {
        if (t.user_id) return t.user_id;
        if (t.source_table === 'down_payment_requests' && t.source_id) return dpOwnerMap.get(t.source_id as string) ?? null;
        if (t.source_table === 'operational_cost_submissions' && t.source_id) return ocsOwnerMap.get(t.source_id as string) ?? null;
        return null;
      };

      // Some funds allocate budget to a *disbursing officer* (e.g. a Finance/Ops
      // lead responsible for a slice of the pool) rather than to the individual
      // field beneficiaries who ultimately receive each down-payment. In that
      // case every transaction's user_id points at the (unallocated) recipient,
      // while created_by correctly identifies the officer who approved/processed
      // the payment out of their allocation. Build, per fund, the set of user_ids
      // that actually hold an allocation, so we can fall back to created_by when
      // the recipient isn't one of the fund's allocated staff.
      const allocatedUserIdsByFund = new Map<string, Set<string>>();
      for (const a of allocs) {
        if (!a.pre_fund_request_id || !a.user_id) continue;
        if (!allocatedUserIdsByFund.has(a.pre_fund_request_id)) allocatedUserIdsByFund.set(a.pre_fund_request_id, new Set());
        allocatedUserIdsByFund.get(a.pre_fund_request_id)!.add(a.user_id);
      }
      const resolveAttributedStaff = (t: any): string | null => {
        const allocatedIds = allocatedUserIdsByFund.get(t.pre_fund_request_id);
        const orig = t.reversal_of_id ? txnById.get(t.reversal_of_id) : null;
        const effOwnerId = orig ? resolveOwner(orig) : resolveOwner(t);
        const effCreatedBy = orig?.created_by ?? t.created_by;
        if (effOwnerId && allocatedIds?.has(effOwnerId)) return effOwnerId;
        if (effCreatedBy && allocatedIds?.has(effCreatedBy)) return effCreatedBy;
        // Neither the recipient nor the approver is an allocated staff member —
        // fall back to whichever owner we could resolve (may still be null).
        return effOwnerId;
      };

      // Build per-user per-fund spend from transactions, preferring an allocated
      // staff match (recipient, then approving/disbursing officer) over a
      // non-allocated recipient so real disbursements aren't shown as "spent 0".
      const spendKey = (userId: string, fundId: string) => `${userId}::${fundId}`;
      const spendMap = new Map<string, number>();
      for (const t of validTxns) {
        const ownerId = resolveAttributedStaff(t);
        if (!ownerId || !t.pre_fund_request_id) continue;
        const key  = spendKey(ownerId, t.pre_fund_request_id);
        const prev = spendMap.get(key) ?? 0;
        const amt  = Number(t.signed_paid_amount) || 0;
        spendMap.set(key, prev + amt);
      }

      const enriched: AllocRow[] = allocs.map((a: any) => {
        const p = profileMap.get(a.user_id) as any;
        const f = fundMap.get(a.pre_fund_request_id) as any;
        const txnSpent     = spendMap.get(spendKey(a.user_id, a.pre_fund_request_id)) ?? 0;
        const spent        = Math.max(0, txnSpent);
        return {
          ...a,
          allocated_amount: Number(a.allocated_amount),
          spent_amount: spent,
          fund_name:   f?.name   ?? 'Unknown Fund',
          fund_status: f?.status ?? 'unknown',
          user_name:   p?.full_name ?? p?.email ?? 'Unknown',
          user_email:  p?.email  ?? '',
          user_role:   p?.role   ?? 'employee',
        };
      });

      setAll(enriched);
      setDetailsLoading(false);
      setDetailsReady(true);
    } catch (e: any) {
      console.error('Allocations load error', e);
    } finally {
      if (version === loadVersion.current) {
        setLoading(false);
        setDetailsLoading(false);
      }
    }
  }, [isFinanceAdmin, currentUser?.id]);

  useEffect(() => { load(); }, [load]);

  const filtered = allAllocations.filter(a => {
    if (fundFilter !== 'all' && a.pre_fund_request_id !== fundFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!a.user_name.toLowerCase().includes(q) && !a.user_email.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const byStaff = new Map<string, StaffSummary>();
  for (const a of filtered) {
    if (!byStaff.has(a.user_id)) {
      byStaff.set(a.user_id, {
        user_id: a.user_id, user_name: a.user_name, user_email: a.user_email,
        user_role: a.user_role, total_allocated: 0, total_spent: 0,
        funds_count: 0, allocations: [], primary_currency: a.currency,
      });
    }
    const s = byStaff.get(a.user_id)!;
    s.total_allocated += a.allocated_amount;
    s.total_spent     += a.spent_amount;
    s.funds_count     += 1;
    s.allocations.push(a);
  }
  const staff = Array.from(byStaff.values()).sort((a, b) => b.total_allocated - a.total_allocated);

  const totalAllocated = staff.reduce((s, p) => s + p.total_allocated, 0);
  const totalSpent     = staff.reduce((s, p) => s + p.total_spent, 0);
  const overUsed       = staff.filter(p => p.total_spent > p.total_allocated).length;

  // Fund-level totals: use the authoritative paid_amount from pre_fund_requests
  // This captures spend that was linked without user attribution (null user_id transactions)
  const visibleFundIds = fundFilter === 'all'
    ? [...fundPaidMap.keys()]
    : [fundFilter];
  const fundTotalPaid = visibleFundIds.reduce((s, id) => s + (fundPaidMap.get(id) ?? 0), 0);
  // Spend attributed to specific allocated users
  const attributedSpend = totalSpent;
  // Spend in the fund that hasn't been attributed to any allocation yet
  const unattributedSpend = Math.max(0, fundTotalPaid - attributedSpend);

  const toggleExpand = (uid: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(uid) ? n.delete(uid) : n.add(uid); return n; });

  async function saveAllocAmount(allocId: string) {
    const newAmt = parseFloat(editAllocAmt);
    if (isNaN(newAmt) || newAmt < 0) return;
    const { error } = await (supabase as any)
      .from('pre_fund_allocations')
      .update({ allocated_amount: newAmt, updated_at: new Date().toISOString() })
      .eq('id', allocId);
    if (error) { console.error('Allocation update failed:', error.message); return; }
    setEditingAllocId(null);
    setEditAllocAmt('');
    load();
  }

  function exportAllocations() {
    const rows = staff.flatMap(s => s.allocations.map(a => ({
      'Staff Name': s.user_name,
      'Email': s.user_email,
      'Role': s.user_role.replace(/_/g, ' '),
      'Fund Name': a.fund_name,
      'Allocated Amount': a.allocated_amount,
      'Spent Amount': a.spent_amount,
      'Remaining': Math.max(0, a.allocated_amount - a.spent_amount),
      'Currency': a.currency,
      'Allocated At': format(new Date(a.created_at), 'yyyy-MM-dd'),
      'Notes': a.notes ?? '',
    })));
    exportToExcel(rows, 'Pre-Fund Allocations', `pre-fund-allocations-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  }

  if (!canAccess) return (
    <div className="p-8 text-center">
      <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-destructive" />
      <p className="text-muted-foreground">You don't have access to Allocation Dashboard.</p>
    </div>
  );


  return (
    <div className="space-y-5 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Users className="h-5 w-5 text-violet-600" />
            {canManageAllocations ? 'Allocation Dashboard' : 'My Pre-Fund Allocation'}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {canManageAllocations
              ? 'Per-staff fund allocations — how much each person was assigned, spent, and has remaining'
              : 'Your personal fund allocation — what you were assigned, what has been spent, and what remains'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportAllocations} disabled={!detailsReady} data-testid="button-export-allocations">
            <Download className="h-4 w-4 mr-1.5" />Export
          </Button>
          <Button variant="outline" size="sm" onClick={load} data-testid="button-refresh-allocs">
            <RefreshCw className="h-4 w-4 mr-1.5" />Refresh
          </Button>
        </div>
      </div>

      {/* KPI row */}
      {!loading && detailsReady && (
        <div className={`grid gap-3 ${canManageAllocations ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5' : 'grid-cols-2'}`}>
          {(canManageAllocations ? [
            { label: 'Staff Allocated',   value: String(staff.length),                                   sub: 'unique people',           icon: Users,          accent: 'bg-violet-600' },
            { label: 'Total Allocated',   value: formatNumber(totalAllocated, 0),                        sub: 'across all funds',        icon: Wallet,         accent: 'bg-sky-600' },
            { label: 'Total Paid Out',    value: formatNumber(fundTotalPaid, 0),                         sub: 'from fund balance',       icon: TrendingDown,   accent: 'bg-emerald-600' },
            { label: 'Total Remaining',   value: formatNumber(Math.max(0, totalAllocated - fundTotalPaid), 0), sub: 'unspent allocation',   icon: CheckCircle2,   accent: totalAllocated - fundTotalPaid < 0 ? 'bg-rose-600' : 'bg-teal-600' },
            { label: 'Over Budget',       value: String(overUsed),                                       sub: 'staff exceeded limit',    icon: AlertTriangle,  accent: overUsed > 0 ? 'bg-rose-600' : 'bg-slate-400' },
          ] : [
            { label: 'My Allocation',   value: formatNumber(totalAllocated, 0),   sub: 'assigned to you',        icon: Wallet,         accent: 'bg-sky-600' },
            { label: 'Spent So Far',    value: formatNumber(fundTotalPaid, 0),    sub: 'from fund (all payments)', icon: TrendingDown,  accent: fundTotalPaid > totalAllocated ? 'bg-rose-600' : 'bg-emerald-600' },
          ]).map(k => (
            <Card key={k.label}>
              <CardContent className="pt-3 pb-3 px-4">
                {/* Label row + icon badge — icon never competes with numbers */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground leading-tight">
                    {k.label}
                  </div>
                  <div className={cn('flex items-center justify-center h-7 w-7 rounded-lg shrink-0 text-white', k.accent)}>
                    <k.icon className="h-3.5 w-3.5" />
                  </div>
                </div>
                {/* Number on its own row — full width, never clipped */}
                <div className="text-xl font-bold tabular-nums leading-none tracking-tight">
                  {k.value}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">{k.sub}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Unattributed spend alert — shows when fund has paid out more than is tracked in allocations */}
      {!loading && !detailsLoading && !detailsReady && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>Live payment attribution could not be loaded. Financial totals and export remain unavailable.</span>
            <Button variant="outline" size="sm" onClick={load}>Retry</Button>
          </AlertDescription>
        </Alert>
      )}

      {!loading && detailsReady && isFinanceAdmin && unattributedSpend > 0 && ( // Unattributed alert is finance-only (requires Reconciliation access)
        <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
          <Info className="h-4 w-4 text-amber-600 mt-0.5" />
          <AlertDescription className="text-sm text-amber-800 dark:text-amber-300">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <span className="font-semibold">Unattributed spend detected:</span>{' '}
                The fund has paid out{' '}
                <span className="font-mono font-semibold">{formatNumber(fundTotalPaid, 0)}</span> total,
                but only{' '}
                <span className="font-mono font-semibold">{formatNumber(attributedSpend, 0)}</span> is
                tracked against specific allocations.{' '}
                <span className="font-mono font-semibold text-amber-700">{formatNumber(unattributedSpend, 0)}</span>{' '}
                was paid out without user attribution.
                Open the Reconciliation page, filter by <strong>Unattributed</strong>, and use the{' '}
                <strong>Assign Staff</strong> button on each transaction to fix this.
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 h-7 text-xs border-amber-400 text-amber-800 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-300 dark:hover:bg-amber-900/30"
                onClick={() => navigate('/pre-funding?tab=reconciliation')}
              >
                Fix in Reconciliation →
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Filters — show for anyone who sees all staff (finance admin or CD) */}
      {canManageAllocations && (
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search staff…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 w-48 text-sm"
            data-testid="input-search-staff"
          />
        </div>
        <Select value={fundFilter} onValueChange={setFund}>
          <SelectTrigger className="h-8 w-52 text-sm" data-testid="select-fund-filter">
            <SelectValue placeholder="All funds" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Funds</SelectItem>
            {funds.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      )}

      {/* Staff list */}
      {loading ? (
        <div className="space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : staff.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border rounded-xl">
          <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{canManageAllocations ? 'No allocations found' : 'No allocation assigned to you yet'}</p>
          <p className="text-sm mt-1">{canManageAllocations ? 'Allocate staff in the Fund Registry → User Allocations dialog' : 'Contact your finance team to set up your pre-fund allocation.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {staff.map(s => {
            const usedPct = s.total_allocated > 0 ? Math.min(100, Math.round((s.total_spent / s.total_allocated) * 100)) : 0;
            const remaining = s.total_allocated - s.total_spent;
            const isExpanded = expanded.has(s.user_id);

            return (
              <Card key={s.user_id} className={cn('transition-shadow', usedPct >= 90 && 'ring-1 ring-rose-300')} data-testid={`card-staff-${s.user_id}`}>
                <CardContent className="px-4 py-3">
                  {/* Staff header row */}
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className={cn('h-9 w-9 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0',
                      usedPct >= 90 ? 'bg-rose-500' : usedPct >= 70 ? 'bg-amber-500' : 'bg-violet-500'
                    )}>
                      {s.user_name.charAt(0).toUpperCase()}
                    </div>

                    {/* Name + role */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm truncate">{s.user_name}</span>
                        {roleBadge(s.user_role)}
                        <span className="text-[10px] text-muted-foreground">{s.funds_count} fund{s.funds_count !== 1 ? 's' : ''}</span>
                      </div>
                      <span className="text-[11px] text-muted-foreground">{s.user_email}</span>
                    </div>

                    {/* Amounts */}
                    <div className="hidden sm:flex flex-col items-end text-[11px] shrink-0">
                      <span className="font-mono font-semibold">{s.primary_currency} {formatNumber(s.total_allocated, 0)}</span>
                      <span className="text-muted-foreground">allocated</span>
                    </div>
                    <div className="hidden md:flex flex-col items-end text-[11px] shrink-0">
                      <span className={cn('font-mono font-semibold', healthColor(usedPct))}>{s.primary_currency} {formatNumber(s.total_spent, 0)}</span>
                      <span className="text-muted-foreground">spent</span>
                    </div>
                    <div className="hidden md:flex flex-col items-end text-[11px] shrink-0">
                      <span className={cn('font-mono font-semibold', remaining < 0 ? 'text-rose-600' : 'text-emerald-600')}>
                        {s.primary_currency} {formatNumber(Math.max(0, remaining), 0)}
                      </span>
                      <span className="text-muted-foreground">remaining</span>
                    </div>

                    {/* Used % + expand */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn('text-sm font-bold tabular-nums', healthColor(usedPct))}>{usedPct}%</span>
                      <button onClick={() => toggleExpand(s.user_id)} className="p-1 hover:bg-muted rounded" data-testid={`button-expand-${s.user_id}`}>
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-2.5">
                    <Progress value={usedPct} className={cn('h-1.5', progressColor(usedPct))} />
                  </div>

                  {/* Expanded per-fund breakdown */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Fund Breakdown</p>
                      {s.allocations.map(a => {
                        const fp = a.allocated_amount > 0 ? Math.min(100, Math.round((a.spent_amount / a.allocated_amount) * 100)) : 0;
                        const fRem = a.allocated_amount - a.spent_amount;
                        const isEditing = editingAllocId === a.id;
                        return (
                          <div key={a.id} className="group/allocrow flex items-center gap-2 text-[11px]" data-testid={`row-alloc-${a.id}`}>
                            <div className={cn('h-2 w-2 rounded-full shrink-0',
                              a.fund_status === 'active' ? 'bg-emerald-500' :
                              a.fund_status === 'low_balance' ? 'bg-amber-500' :
                              a.fund_status === 'closed' ? 'bg-slate-400' : 'bg-sky-500'
                            )} />
                            <span className="flex-1 truncate font-medium">{a.fund_name}</span>
                            {/* Allocated amount — editable for Finance Admin and CD */}
                            {isEditing ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number"
                                  value={editAllocAmt}
                                  onChange={e => setEditAllocAmt(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') saveAllocAmount(a.id); if (e.key === 'Escape') { setEditingAllocId(null); setEditAllocAmt(''); } }}
                                  className="h-5 w-28 text-[11px] px-1.5 py-0"
                                  autoFocus
                                  data-testid={`input-alloc-${a.id}`}
                                />
                                <button onClick={() => saveAllocAmount(a.id)} className="text-emerald-600 hover:text-emerald-700" data-testid={`button-save-alloc-${a.id}`}><Check className="h-3 w-3" /></button>
                                <button onClick={() => { setEditingAllocId(null); setEditAllocAmt(''); }} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
                              </div>
                            ) : (
                              <span className="font-mono text-muted-foreground flex items-center gap-1">
                                {a.currency} {formatNumber(a.allocated_amount, 0)} allocated
                                {canManageAllocations && (
                                  <button
                                    onClick={() => { setEditingAllocId(a.id); setEditAllocAmt(String(a.allocated_amount)); }}
                                    className="opacity-0 group-hover/allocrow:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                                    title="Edit allocated amount"
                                    data-testid={`button-edit-alloc-${a.id}`}
                                  ><Pencil className="h-2.5 w-2.5" /></button>
                                )}
                              </span>
                            )}
                            <span className={cn('font-mono', healthColor(fp))}>{formatNumber(a.spent_amount, 0)} spent</span>
                            <span className={cn('font-mono', fRem < 0 ? 'text-rose-600' : 'text-emerald-600')}>
                              {fRem >= 0 ? formatNumber(fRem, 0) : `−${formatNumber(-fRem, 0)}`} left
                            </span>
                            {a.spent_amount >= a.allocated_amount && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 bg-rose-50 text-rose-700 border-rose-200">Over</Badge>
                            )}
                            {a.spent_amount === 0 && a.allocated_amount > 0 && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 bg-sky-50 text-sky-700 border-sky-200">Unused</Badge>
                            )}
                          </div>
                        );
                      })}
                      {/* Per-staff total bar */}
                      <div className="flex items-center gap-2 mt-1 pt-1 border-t text-[11px]">
                        <span className="flex-1 font-semibold">Total</span>
                        <span className="font-mono">{s.primary_currency} {formatNumber(s.total_allocated, 0)}</span>
                        <span className={cn('font-mono font-semibold', healthColor(usedPct))}>{usedPct}% used</span>
                        {usedPct >= 90 && <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />}
                        {usedPct < 50 && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                      </div>
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
