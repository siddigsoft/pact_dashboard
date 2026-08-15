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
  TrendingUp, Users, CheckCircle2, Banknote,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SnapshotRow {
  id: string;
  status: string;
  approved_at: string | null;
  created_at: string;
  coordinator_count: number;
  supervisor_count: number;
  total_bonus_cents: number;
  currency: string;
  mmp_files: { id: string; name: string; mmp_id: string } | null;
}

interface MyPaymentRow {
  id: string;
  role: string;
  hub_name: string | null;
  dc_fee_pool_cents: number | null;
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

const SNAP_STATUS_LABEL: Record<string, string> = {
  calculating:  'Calculating',
  pre_approved: 'Pre-Approved',
  approved:     'Approved',
  paid:         'Paid',
};

const SNAP_STATUS_CLASS: Record<string, string> = {
  calculating:  'bg-slate-100 text-slate-700 border-slate-200',
  pre_approved: 'bg-amber-100 text-amber-700 border-amber-200',
  approved:     'bg-emerald-100 text-emerald-700 border-emerald-200',
  paid:         'bg-purple-100 text-purple-700 border-purple-200',
};

const PAY_STATUS_CLASS: Record<string, string> = {
  pre_approved: 'bg-amber-100 text-amber-700 border-amber-200',
  approved:     'bg-emerald-100 text-emerald-700 border-emerald-200',
  paid:         'bg-purple-100 text-purple-700 border-purple-200',
};

function fmt(cents: number, currency = 'SDG') {
  return `${(cents / 100).toLocaleString()} ${currency}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, Icon, accent }: {
  label: string; value: string; sub?: string; Icon: React.ElementType; accent: string;
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

  const canSeeAll   = isAdmin || isFinance || isFOM || isSenior;
  const canSeeOwn   = isCoord || isSupervisor;

  // ── Admin / finance overview ──────────────────────────────────────────────
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [loadingSnaps, setLoadingSnaps] = useState(false);

  // ── Field staff "my bonuses" ──────────────────────────────────────────────
  const [myPayments, setMyPayments] = useState<MyPaymentRow[]>([]);
  const [loadingMine, setLoadingMine] = useState(false);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // ─────────────────────────────────────────────────────────────────────────
  const fetchSnapshots = useCallback(async () => {
    setLoadingSnaps(true);
    try {
      const { data, error } = await supabase
        .from('mmp_incentive_snapshots')
        .select(`
          id, status, approved_at, created_at,
          coordinator_count, supervisor_count,
          total_bonus_cents, currency,
          mmp_files(id, name, mmp_id)
        `)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      setSnapshots((data ?? []) as unknown as SnapshotRow[]);
    } catch (err: any) {
      toast({ title: 'Error loading snapshots', description: err.message, variant: 'destructive' });
    } finally {
      setLoadingSnaps(false);
    }
  }, [toast]);

  const fetchMyPayments = useCallback(async () => {
    if (!user?.id) return;
    setLoadingMine(true);
    try {
      const { data, error } = await supabase
        .from('mmp_incentive_payments')
        .select(`
          id, role, hub_name, dc_fee_pool_cents, bonus_pct,
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

  useEffect(() => { if (canSeeAll) fetchSnapshots(); }, [canSeeAll, fetchSnapshots]);
  useEffect(() => { if (canSeeOwn && !canSeeAll) fetchMyPayments(); }, [canSeeOwn, canSeeAll, fetchMyPayments]);

  // ── Derived totals ─────────────────────────────────────────────────────────
  const totalPaidCents = canSeeAll
    ? snapshots.filter(s => s.status === 'paid').reduce((s, r) => s + r.total_bonus_cents, 0)
    : myPayments.filter(p => p.status === 'paid' && !p.excluded).reduce((s, p) => s + p.bonus_amount_cents, 0);

  const totalApprovedCents = canSeeAll
    ? snapshots.filter(s => s.status === 'approved').reduce((s, r) => s + r.total_bonus_cents, 0)
    : myPayments.filter(p => (p.mmp_incentive_snapshots?.status === 'approved') && !p.excluded).reduce((s, p) => s + p.bonus_amount_cents, 0);

  const totalPreApprovedCents = canSeeAll
    ? snapshots.filter(s => s.status === 'pre_approved').reduce((s, r) => s + r.total_bonus_cents, 0)
    : myPayments.filter(p => (p.mmp_incentive_snapshots?.status === 'pre_approved') && !p.excluded).reduce((s, p) => s + p.bonus_amount_cents, 0);

  const currency = canSeeAll
    ? (snapshots[0]?.currency ?? 'SDG')
    : (myPayments[0]?.currency ?? 'SDG');

  // ── Filtered snapshots ─────────────────────────────────────────────────────
  const filteredSnaps = snapshots.filter(s => {
    const matchSearch = !search ||
      (s.mmp_files?.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (s.mmp_files?.mmp_id ?? '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const filteredPayments = myPayments.filter(p => {
    const displayStatus = p.status === 'paid' ? 'paid' : (p.mmp_incentive_snapshots?.status ?? 'pre_approved');
    const matchSearch = !search ||
      (p.mmp_files?.name ?? '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || displayStatus === statusFilter;
    return matchSearch && matchStatus;
  });

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
                {canSeeAll ? 'All MMP incentive snapshots and payment status' : 'Your bonus payments across all MMP cycles'}
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {canSeeAll && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { if (canSeeAll) fetchSnapshots(); else fetchMyPayments(); }}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Refresh
              </Button>
            )}
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/mmp/incentive-settings')}
              >
                <Settings2 className="h-3.5 w-3.5 mr-1.5" />
                Incentive Settings
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* ── Summary stats ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
          <StatCard
            label="Pre-Approved (awaiting finance)"
            value={fmt(totalPreApprovedCents, currency)}
            Icon={TrendingUp}
            accent="bg-amber-100 text-amber-700"
          />
        </div>

        {/* ── Filters ────────────────────────────────────────────────────── */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search MMP name…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44 h-9">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pre_approved">Pre-Approved</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              {canSeeAll && <SelectItem value="calculating">Calculating</SelectItem>}
            </SelectContent>
          </Select>
        </div>

        {/* ── Admin / finance: snapshot table ───────────────────────────── */}
        {canSeeAll && (
          <Card className="shadow-sm">
            <CardHeader className="p-4 border-b bg-muted/30">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  All MMP Incentive Snapshots
                </CardTitle>
                <span className="text-xs text-muted-foreground">{filteredSnaps.length} records</span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingSnaps ? (
                <div className="flex items-center justify-center gap-3 py-10 text-muted-foreground">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
                  <span className="text-sm">Loading…</span>
                </div>
              ) : filteredSnaps.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Award className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No incentive snapshots found</p>
                  <p className="text-xs mt-1">Pre-approve an MMP's Incentives tab to create one</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/20 text-xs text-muted-foreground">
                        <th className="text-left px-4 py-2 font-medium">MMP</th>
                        <th className="text-left px-4 py-2 font-medium">Status</th>
                        <th className="text-right px-4 py-2 font-medium">Coordinators</th>
                        <th className="text-right px-4 py-2 font-medium">Supervisors</th>
                        <th className="text-right px-4 py-2 font-medium">Total Bonus</th>
                        <th className="text-left px-4 py-2 font-medium">Approved</th>
                        <th className="text-right px-4 py-2 font-medium w-24">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSnaps.map(snap => (
                        <tr key={snap.id} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3">
                            <a
                              href={`/mmp/${snap.mmp_files?.id}?tab=incentives`}
                              className="text-primary hover:underline font-medium text-xs"
                            >
                              {snap.mmp_files?.name ?? snap.mmp_files?.mmp_id ?? '—'}
                            </a>
                          </td>
                          <td className="px-4 py-3">
                            <Badge className={cn('text-xs border', SNAP_STATUS_CLASS[snap.status] ?? 'bg-slate-100 text-slate-700')}>
                              {SNAP_STATUS_LABEL[snap.status] ?? snap.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right text-xs">{snap.coordinator_count ?? 0}</td>
                          <td className="px-4 py-3 text-right text-xs">{snap.supervisor_count ?? 0}</td>
                          <td className="px-4 py-3 text-right text-xs font-semibold">
                            {fmt(snap.total_bonus_cents ?? 0, snap.currency)}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {fmtDate(snap.approved_at)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => navigate(`/mmp/${snap.mmp_files?.id}?tab=incentives`)}
                            >
                              <ExternalLink className="h-3 w-3 mr-1" />
                              Open
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {/* Total row */}
                    {filteredSnaps.length > 0 && (() => {
                      const total = filteredSnaps.reduce((s, r) => s + (r.total_bonus_cents ?? 0), 0);
                      return (
                        <tfoot>
                          <tr className="border-t bg-muted/30">
                            <td colSpan={4} className="px-4 py-2 text-xs font-semibold text-right text-muted-foreground">
                              Shown total
                            </td>
                            <td className="px-4 py-2 text-right text-xs font-bold">
                              {fmt(total, filteredSnaps[0]?.currency ?? 'SDG')}
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

        {/* ── Coordinator / supervisor: my bonus table ──────────────────── */}
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
                      {filteredPayments.map((p: MyPaymentRow) => {
                        const displayStatus = p.status === 'paid'
                          ? 'paid'
                          : (p.mmp_incentive_snapshots?.status ?? 'pre_approved');
                        return (
                          <tr key={p.id} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3">
                              <a
                                href={`/mmp/${p.mmp_files?.id}`}
                                className="text-primary hover:underline font-medium text-xs"
                              >
                                {p.mmp_files?.name ?? p.mmp_files?.mmp_id ?? '—'}
                              </a>
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
                              <Badge className={cn('text-xs border', PAY_STATUS_CLASS[displayStatus] ?? 'bg-slate-100 text-slate-700')}>
                                {SNAP_STATUS_LABEL[displayStatus] ?? displayStatus}
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
                            <td colSpan={3} className="px-4 py-2 text-xs font-semibold text-right text-muted-foreground">
                              Total Paid
                            </td>
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
