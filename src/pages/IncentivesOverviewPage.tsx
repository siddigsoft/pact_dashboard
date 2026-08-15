import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAppContext } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Award, Settings2, ExternalLink, Search, RefreshCw,
  TrendingUp, CheckCircle2, Banknote, Clock, ListFilter,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MMPRow {
  id: string;
  name: string;
  mmp_id: string | null;
  hub_name: string | null;
  hub_id: string | null;
  cycle_status: string | null;
  status: string;
  created_at: string;
  uploaded_at: string | null;
  // nested snapshot (null if no incentives started yet)
  mmp_incentive_snapshots: {
    id: string;
    status: string;
    total_bonus_cents: number;
    coordinator_count: number;
    supervisor_count: number;
    currency: string;
    pre_approved_at: string | null;
    approved_at: string | null;
  } | null;
}

interface MyPaymentRow {
  id: string;
  role: string;
  hub_name: string | null;
  bonus_pct: number | null;
  bonus_amount_cents: number;
  currency: string;
  excluded: boolean;
  status: string;
  payment_method: string | null;
  paid_at: string | null;
  mmp_incentive_snapshots: { id: string; status: string } | null;
  mmp_files: { id: string; name: string; mmp_id: string } | null;
}

// ─── Status helpers ───────────────────────────────────────────────────────────

/** Derive a single incentive status label from the MMP row */
function incentiveStatus(mmp: MMPRow): string {
  const snap = mmp.mmp_incentive_snapshots;
  if (!snap) return 'not_started';
  return snap.status; // calculating | pre_approved | approved | paid
}

const INC_LABEL: Record<string, string> = {
  not_started:  'Not Started',
  calculating:  'Calculating',
  pre_approved: 'Pre-Approved',
  approved:     'Approved',
  paid:         'Paid',
};

const INC_CLASS: Record<string, string> = {
  not_started:  'bg-slate-100 text-slate-600 border-slate-200',
  calculating:  'bg-blue-100 text-blue-700 border-blue-200',
  pre_approved: 'bg-amber-100 text-amber-700 border-amber-200',
  approved:     'bg-emerald-100 text-emerald-700 border-emerald-200',
  paid:         'bg-purple-100 text-purple-700 border-purple-200',
};

const CYCLE_CLASS: Record<string, string> = {
  closed: 'bg-slate-100 text-slate-600 border-slate-200',
  open:   'bg-sky-100 text-sky-700 border-sky-200',
};

function fmt(cents: number, currency = 'SDG') {
  return `${(cents / 100).toLocaleString()} ${currency}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, Icon, accent,
}: {
  label: string; value: string | number; sub?: string; Icon: React.ElementType; accent: string;
}) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-4 flex items-start gap-3">
        <div className={cn('rounded-lg p-2 shrink-0', accent)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-bold leading-tight truncate">{value}</p>
          {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function IncentivesOverviewPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAppContext();
  const { hasAnyRole } = useAuthorization();

  const isAdmin      = hasAnyRole(['super_admin', 'superAdmin', 'admin', 'ict']);
  const isFinance    = hasAnyRole(['finance', 'financial_admin', 'financialAdmin']);
  const isFOM        = hasAnyRole(['fom']);
  const isSenior     = hasAnyRole(['Senior Management', 'country_director']);
  const isCoord      = hasAnyRole(['coordinator']);
  const isSupervisor = hasAnyRole(['supervisor']);

  const canSeeAll = isAdmin || isFinance || isFOM || isSenior;
  const canSeeOwn = isCoord || isSupervisor;

  // ── Data ──────────────────────────────────────────────────────────────────
  const [mmps, setMmps]           = useState<MMPRow[]>([]);
  const [loadingMmps, setLoadingMmps] = useState(false);

  const [myPayments, setMyPayments]     = useState<MyPaymentRow[]>([]);
  const [loadingMine, setLoadingMine]   = useState(false);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [search, setSearch]           = useState('');
  const [incFilter, setIncFilter]     = useState('all');   // incentive status
  const [cycleFilter, setCycleFilter] = useState('all');   // cycle_status

  // ─────────────────────────────────────────────────────────────────────────
  const fetchMMPs = useCallback(async () => {
    setLoadingMmps(true);
    try {
      let q = supabase
        .from('mmp_files')
        .select(`
          id, name, mmp_id, hub_name, hub_id, cycle_status, status, created_at, uploaded_at,
          mmp_incentive_snapshots(
            id, status, total_bonus_cents, coordinator_count, supervisor_count,
            currency, pre_approved_at, approved_at
          )
        `)
        .not('status', 'in', '("deleted","archived")')
        .order('created_at', { ascending: false })
        .limit(300);

      const { data, error } = await q;
      if (error) throw error;

      // Supabase returns the 1-to-1 relation as an array; unwrap to object or null
      const rows = (data ?? []).map((r: any) => ({
        ...r,
        mmp_incentive_snapshots: Array.isArray(r.mmp_incentive_snapshots)
          ? (r.mmp_incentive_snapshots[0] ?? null)
          : (r.mmp_incentive_snapshots ?? null),
      })) as MMPRow[];

      setMmps(rows);
    } catch (err: any) {
      toast({ title: 'Error loading MMPs', description: err.message, variant: 'destructive' });
    } finally {
      setLoadingMmps(false);
    }
  }, [toast]);

  const fetchMyPayments = useCallback(async () => {
    if (!user?.id) return;
    setLoadingMine(true);
    try {
      const { data, error } = await supabase
        .from('mmp_incentive_payments')
        .select(`
          id, role, hub_name, bonus_pct,
          bonus_amount_cents, currency, excluded, status,
          payment_method, paid_at,
          mmp_incentive_snapshots(id, status),
          mmp_files(id, name, mmp_id)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      const visible = (data ?? []).filter(
        (p: any) => (p.mmp_incentive_snapshots as any)?.status !== 'calculating'
      );
      setMyPayments(visible as unknown as MyPaymentRow[]);
    } catch (err: any) {
      toast({ title: 'Error loading bonuses', description: err.message, variant: 'destructive' });
    } finally {
      setLoadingMine(false);
    }
  }, [user?.id, toast]);

  useEffect(() => { if (canSeeAll) fetchMMPs(); }, [canSeeAll, fetchMMPs]);
  useEffect(() => { if (canSeeOwn && !canSeeAll) fetchMyPayments(); }, [canSeeOwn, canSeeAll, fetchMyPayments]);

  // ── Filtered rows ─────────────────────────────────────────────────────────
  const filteredMMPs = mmps.filter(mmp => {
    const iStatus = incentiveStatus(mmp);
    const matchSearch = !search
      || (mmp.name ?? '').toLowerCase().includes(search.toLowerCase())
      || (mmp.mmp_id ?? '').toLowerCase().includes(search.toLowerCase())
      || (mmp.hub_name ?? '').toLowerCase().includes(search.toLowerCase());
    const matchInc   = incFilter === 'all'   || iStatus === incFilter;
    const matchCycle = cycleFilter === 'all' || (mmp.cycle_status ?? 'open') === cycleFilter;
    return matchSearch && matchInc && matchCycle;
  });

  const filteredPayments = myPayments.filter(p => {
    const displayStatus = p.status === 'paid'
      ? 'paid'
      : (p.mmp_incentive_snapshots?.status ?? 'pre_approved');
    const matchSearch = !search
      || (p.mmp_files?.name ?? '').toLowerCase().includes(search.toLowerCase());
    const matchInc = incFilter === 'all' || displayStatus === incFilter;
    return matchSearch && matchInc;
  });

  // ── Derived summary stats ─────────────────────────────────────────────────
  const totalPaidCents = canSeeAll
    ? mmps.filter(m => m.mmp_incentive_snapshots?.status === 'paid')
        .reduce((s, m) => s + (m.mmp_incentive_snapshots?.total_bonus_cents ?? 0), 0)
    : myPayments.filter(p => p.status === 'paid' && !p.excluded)
        .reduce((s, p) => s + p.bonus_amount_cents, 0);

  const totalApprovedCents = canSeeAll
    ? mmps.filter(m => m.mmp_incentive_snapshots?.status === 'approved')
        .reduce((s, m) => s + (m.mmp_incentive_snapshots?.total_bonus_cents ?? 0), 0)
    : myPayments.filter(p => p.mmp_incentive_snapshots?.status === 'approved' && !p.excluded)
        .reduce((s, p) => s + p.bonus_amount_cents, 0);

  const pendingMMPCount = mmps.filter(m => !m.mmp_incentive_snapshots && m.cycle_status !== 'closed').length;

  const currency = mmps.find(m => m.mmp_incentive_snapshots?.currency)
    ?.mmp_incentive_snapshots?.currency ?? 'SDG';

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-100 p-2">
              <Award className="h-5 w-5 text-amber-700" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Incentive Bonuses</h1>
              <p className="text-sm text-muted-foreground">
                {canSeeAll
                  ? 'All MMPs — incentive status, amounts and payment progress'
                  : 'Your bonus payments across all MMP cycles'}
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {canSeeAll && (
              <Button variant="outline" size="sm" onClick={fetchMMPs}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Refresh
              </Button>
            )}
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => navigate('/mmp/incentive-settings')}>
                <Settings2 className="h-3.5 w-3.5 mr-1.5" />
                Incentive Settings
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6 max-w-7xl mx-auto">

        {/* ── Summary stat cards ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            label="Total Paid Out"
            value={fmt(totalPaidCents, currency)}
            Icon={Banknote}
            accent="bg-purple-100 text-purple-700"
          />
          <StatCard
            label="Approved (pending payment)"
            value={fmt(totalApprovedCents, currency)}
            Icon={CheckCircle2}
            accent="bg-emerald-100 text-emerald-700"
          />
          {canSeeAll && (
            <>
              <StatCard
                label="MMPs not yet started"
                value={pendingMMPCount}
                sub="open cycles with no incentive snapshot"
                Icon={Clock}
                accent="bg-slate-100 text-slate-600"
              />
              <StatCard
                label="Total MMPs shown"
                value={filteredMMPs.length}
                sub={`of ${mmps.length} total`}
                Icon={ListFilter}
                accent="bg-sky-100 text-sky-700"
              />
            </>
          )}
          {!canSeeAll && (
            <StatCard
              label="Pre-Approved (awaiting finance)"
              value={fmt(
                myPayments
                  .filter(p => p.mmp_incentive_snapshots?.status === 'pre_approved' && !p.excluded)
                  .reduce((s, p) => s + p.bonus_amount_cents, 0),
                myPayments[0]?.currency ?? 'SDG'
              )}
              Icon={TrendingUp}
              accent="bg-amber-100 text-amber-700"
            />
          )}
        </div>

        {/* ── Filters ────────────────────────────────────────────────────── */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder={canSeeAll ? 'Search MMP name or hub…' : 'Search MMP name…'}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Select value={incFilter} onValueChange={setIncFilter}>
            <SelectTrigger className="w-44 h-9">
              <SelectValue placeholder="Incentive status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All incentive statuses</SelectItem>
              <SelectItem value="not_started">Not Started</SelectItem>
              <SelectItem value="calculating">Calculating</SelectItem>
              <SelectItem value="pre_approved">Pre-Approved</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
            </SelectContent>
          </Select>
          {canSeeAll && (
            <Select value={cycleFilter} onValueChange={setCycleFilter}>
              <SelectTrigger className="w-36 h-9">
                <SelectValue placeholder="Cycle status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All cycles</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {/* ── Admin / finance: full MMP list ────────────────────────────── */}
        {canSeeAll && (
          <Card className="shadow-sm">
            <CardHeader className="p-4 border-b bg-muted/30">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">MMP Incentive Status</CardTitle>
                <span className="text-xs text-muted-foreground">{filteredMMPs.length} MMPs</span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingMmps ? (
                <div className="flex items-center justify-center gap-3 py-10 text-muted-foreground">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
                  <span className="text-sm">Loading MMPs…</span>
                </div>
              ) : filteredMMPs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Award className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No MMPs match the current filters</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/20 text-xs text-muted-foreground">
                        <th className="text-left px-4 py-2 font-medium">MMP</th>
                        <th className="text-left px-4 py-2 font-medium">Hub</th>
                        <th className="text-left px-4 py-2 font-medium">Cycle</th>
                        <th className="text-left px-4 py-2 font-medium">Incentive Status</th>
                        <th className="text-right px-4 py-2 font-medium">Coordinators</th>
                        <th className="text-right px-4 py-2 font-medium">Supervisors</th>
                        <th className="text-right px-4 py-2 font-medium">Total Bonus</th>
                        <th className="text-left px-4 py-2 font-medium">Pre-Approved</th>
                        <th className="text-right px-4 py-2 font-medium w-20">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMMPs.map(mmp => {
                        const iStatus = incentiveStatus(mmp);
                        const snap    = mmp.mmp_incentive_snapshots;
                        const cycleLabel = mmp.cycle_status === 'closed' ? 'Closed' : 'Open';
                        const cycleKey   = mmp.cycle_status === 'closed' ? 'closed' : 'open';
                        return (
                          <tr key={mmp.id} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                            {/* MMP name */}
                            <td className="px-4 py-3">
                              <div>
                                <a
                                  href={`/mmp/${mmp.id}?tab=incentives`}
                                  className="text-primary hover:underline font-medium text-xs"
                                >
                                  {mmp.name || mmp.mmp_id || mmp.id}
                                </a>
                                {mmp.mmp_id && mmp.name && (
                                  <p className="text-[10px] text-muted-foreground mt-0.5">{mmp.mmp_id}</p>
                                )}
                              </div>
                            </td>
                            {/* Hub */}
                            <td className="px-4 py-3 text-xs text-muted-foreground">
                              {mmp.hub_name ?? '—'}
                            </td>
                            {/* Cycle status */}
                            <td className="px-4 py-3">
                              <Badge className={cn('text-xs border', CYCLE_CLASS[cycleKey])}>
                                {cycleLabel}
                              </Badge>
                            </td>
                            {/* Incentive status */}
                            <td className="px-4 py-3">
                              <Badge className={cn('text-xs border', INC_CLASS[iStatus] ?? INC_CLASS.not_started)}>
                                {INC_LABEL[iStatus] ?? iStatus}
                              </Badge>
                            </td>
                            {/* Coordinator count */}
                            <td className="px-4 py-3 text-right text-xs">
                              {snap ? snap.coordinator_count : '—'}
                            </td>
                            {/* Supervisor count */}
                            <td className="px-4 py-3 text-right text-xs">
                              {snap ? snap.supervisor_count : '—'}
                            </td>
                            {/* Total bonus */}
                            <td className="px-4 py-3 text-right text-xs font-semibold">
                              {snap
                                ? fmt(snap.total_bonus_cents ?? 0, snap.currency)
                                : <span className="text-muted-foreground">—</span>}
                            </td>
                            {/* Pre-approved date */}
                            <td className="px-4 py-3 text-xs text-muted-foreground">
                              {fmtDate(snap?.pre_approved_at ?? null)}
                            </td>
                            {/* Action */}
                            <td className="px-4 py-3 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => navigate(`/mmp/${mmp.id}?tab=incentives`)}
                              >
                                <ExternalLink className="h-3 w-3 mr-1" />
                                Open
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {/* Footer totals for visible rows that have snapshots */}
                    {(() => {
                      const withSnap = filteredMMPs.filter(m => m.mmp_incentive_snapshots);
                      if (!withSnap.length) return null;
                      const total = withSnap.reduce(
                        (s, m) => s + (m.mmp_incentive_snapshots?.total_bonus_cents ?? 0), 0
                      );
                      return (
                        <tfoot>
                          <tr className="border-t bg-muted/30">
                            <td colSpan={6} className="px-4 py-2 text-xs font-semibold text-right text-muted-foreground">
                              Shown total ({withSnap.length} MMPs with snapshots)
                            </td>
                            <td className="px-4 py-2 text-right text-xs font-bold">
                              {fmt(total, currency)}
                            </td>
                            <td colSpan={2} />
                          </tr>
                        </tfoot>
                      );
                    })()}
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Coordinator / supervisor: my bonus payments ────────────────── */}
        {canSeeOwn && !canSeeAll && (
          <Card className="shadow-sm">
            <CardHeader className="p-4 border-b bg-muted/30">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Award className="h-4 w-4 text-muted-foreground" />
                  My Bonus Payments
                </CardTitle>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={fetchMyPayments}>
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingMine ? (
                <div className="flex items-center justify-center gap-3 py-10 text-muted-foreground">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
                  <span className="text-sm">Loading…</span>
                </div>
              ) : filteredPayments.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Award className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No incentive payments yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/20 text-xs text-muted-foreground">
                        <th className="text-left px-4 py-2 font-medium">MMP</th>
                        <th className="text-left px-4 py-2 font-medium">Role</th>
                        <th className="text-left px-4 py-2 font-medium">Hub</th>
                        <th className="text-right px-4 py-2 font-medium">Bonus Amount</th>
                        <th className="text-left px-4 py-2 font-medium">Status</th>
                        <th className="text-left px-4 py-2 font-medium">Paid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPayments.map(p => {
                        const displayStatus = p.status === 'paid'
                          ? 'paid'
                          : (p.mmp_incentive_snapshots?.status ?? 'pre_approved');
                        const mmpName = (p.mmp_files as any)?.name ?? (p.mmp_files as any)?.mmp_id ?? '—';
                        const mmpFileId = (p.mmp_files as any)?.id;
                        return (
                          <tr key={p.id} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3">
                              {mmpFileId ? (
                                <a href={`/mmp/${mmpFileId}`} className="text-primary hover:underline font-medium text-xs">
                                  {mmpName}
                                </a>
                              ) : (
                                <span className="text-xs font-medium">{mmpName}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 capitalize text-xs">{p.role}</td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">{p.hub_name ?? '—'}</td>
                            <td className="px-4 py-3 text-right text-xs font-semibold">
                              {p.excluded
                                ? <span className="line-through text-muted-foreground">{fmt(p.bonus_amount_cents, p.currency)}</span>
                                : fmt(p.bonus_amount_cents, p.currency)
                              }
                            </td>
                            <td className="px-4 py-3">
                              <Badge className={cn('text-xs border', INC_CLASS[displayStatus] ?? INC_CLASS.not_started)}>
                                {INC_LABEL[displayStatus] ?? displayStatus}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">
                              {p.status === 'paid' ? (
                                <div>
                                  <span className="capitalize">{p.payment_method ?? 'wallet'}</span>
                                  {p.paid_at && <p className="text-[10px] mt-0.5">{fmtDate(p.paid_at)}</p>}
                                </div>
                              ) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {filteredPayments.some(p => p.status === 'paid') && (() => {
                      const totalPaid = filteredPayments
                        .filter(p => p.status === 'paid' && !p.excluded)
                        .reduce((s, p) => s + p.bonus_amount_cents, 0);
                      return (
                        <tfoot>
                          <tr className="border-t bg-muted/30">
                            <td colSpan={3} className="px-4 py-2 text-xs font-semibold text-right text-muted-foreground">Total Paid</td>
                            <td className="px-4 py-2 text-right text-xs font-bold">
                              {fmt(totalPaid, filteredPayments[0]?.currency ?? 'SDG')}
                            </td>
                            <td colSpan={2} />
                          </tr>
                        </tfoot>
                      );
                    })()}
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
