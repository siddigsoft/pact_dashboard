/**
 * AdminCycleHealth — Enhancement 5
 * Super Admin cross-cycle health dashboard.
 *
 * Shows all active MMP cycles with live KPI cards per cycle:
 * total sites / submitted / wfp_confirmed / rejected / not_covered / unresolved
 * Plus financial summary: advances approved, recovery decisions pending.
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircle2, XCircle, AlertTriangle, Clock, RefreshCw,
  Loader2, Search, ExternalLink, TrendingUp, Shield, Activity,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface CycleHealthRow {
  id: string;
  name: string;
  month: number | null;
  year: number | null;
  hub: string | null;
  cycle_status: string;
  total: number;
  submitted: number;
  wfp_confirmed: number;
  rejected: number;
  not_covered: number;
  unresolved: number;
  advances_pending: number;
  recovery_pending: number;
  wfp_applied: boolean;
  readiness_score: number;
}

const STATUS_BADGE: Record<string, { label: string; class: string }> = {
  active:           { label: 'Active',           class: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
  closing:          { label: 'Closing',           class: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  pending_approval: { label: 'Pending Approval',  class: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300' },
  closed:           { label: 'Closed',            class: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' },
};

export default function AdminCycleHealth() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [cycles, setCycles] = useState<CycleHealthRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all non-closed MMPs
      const { data: mmps, error: mmpErr } = await supabase
        .from('mmp_files')
        .select('id, name, month, year, hub, cycle_status')
        .in('cycle_status', ['active', 'closing', 'pending_approval'])
        .order('year', { ascending: false })
        .order('month', { ascending: false });

      if (mmpErr) throw mmpErr;
      if (!mmps || mmps.length === 0) { setCycles([]); return; }

      const mmpIds = mmps.map(m => m.id);

      // Fetch site entries for all MMPs at once
      const { data: sites } = await supabase
        .from('mmp_site_entries')
        .select('id, mmp_file_id, status, not_covered_flag')
        .in('mmp_file_id', mmpIds);

      // Fetch down payment requests (advances pending)
      const { data: advances } = await supabase
        .from('down_payment_requests')
        .select('id, mmp_site_entry_id, status')
        .in('status', ['pending', 'submitted'])
        .in('mmp_site_entry_id', (sites || []).map(s => s.id));

      // Fetch cost recovery log (recovery decisions done)
      const { data: recoveryLog } = await supabase
        .from('cost_recovery_log')
        .select('site_entry_id, decision')
        .in('site_entry_id', (sites || []).map(s => s.id));

      // Fetch WFP uploads applied
      const { data: wfpUploads } = await supabase
        .from('wfp_confirmation_uploads')
        .select('mmp_id, status')
        .in('mmp_id', mmpIds)
        .eq('status', 'applied');

      const recoveredSiteIds = new Set((recoveryLog || []).map(r => r.site_entry_id));
      const wfpAppliedMmpIds = new Set((wfpUploads || []).map(w => w.mmp_id));

      // Advance counts by site entry id
      const advancePendingBySiteId = new Set(
        (advances || []).map(a => a.mmp_site_entry_id).filter(Boolean),
      );

      const RESOLVED_STATUSES = new Set([
        'submitted', 'wfp_confirmed', 'rejected', 'not_covered',
        'approved', 'cancelled', 'completed', 'verified',
      ]);

      const rows: CycleHealthRow[] = mmps.map(mmp => {
        const mmpSites = (sites || []).filter(s => s.mmp_file_id === mmp.id);
        const total         = mmpSites.length;
        const submitted     = mmpSites.filter(s => (s.status ?? '').toLowerCase() === 'submitted').length;
        const wfp_confirmed = mmpSites.filter(s => (s.status ?? '').toLowerCase() === 'wfp_confirmed').length;
        const rejected      = mmpSites.filter(s => (s.status ?? '').toLowerCase() === 'rejected').length;
        const not_covered   = mmpSites.filter(s =>
          (s.status ?? '').toLowerCase() === 'not_covered' || s.not_covered_flag === true,
        ).length;
        const resolved    = mmpSites.filter(s => RESOLVED_STATUSES.has((s.status ?? '').toLowerCase()) || s.not_covered_flag === true).length;
        const unresolved  = total - resolved;

        // Advances pending for this MMP's sites
        const advances_pending = mmpSites.filter(s => advancePendingBySiteId.has(s.id)).length;

        // Not-covered sites without a recovery decision
        const notCoveredSiteIds = mmpSites
          .filter(s => (s.status ?? '').toLowerCase() === 'not_covered' || s.not_covered_flag === true)
          .map(s => s.id);
        const recovery_pending = notCoveredSiteIds.filter(id => !recoveredSiteIds.has(id)).length;

        const wfp_applied = wfpAppliedMmpIds.has(mmp.id);

        // Readiness score: % of checklist items passing
        const gates = [
          unresolved === 0,
          advances_pending === 0,
          recovery_pending === 0,
          wfp_applied || submitted === 0,
        ];
        const readiness_score = Math.round((gates.filter(Boolean).length / gates.length) * 100);

        return {
          id: mmp.id,
          name: mmp.name || 'Unnamed MMP',
          month: mmp.month,
          year: mmp.year,
          hub: mmp.hub,
          cycle_status: mmp.cycle_status || 'active',
          total,
          submitted,
          wfp_confirmed,
          rejected,
          not_covered,
          unresolved,
          advances_pending,
          recovery_pending,
          wfp_applied,
          readiness_score,
        };
      });

      setCycles(rows);
      setLastRefreshed(new Date());
    } catch (err: any) {
      toast({ title: 'Failed to load cycle health', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const filtered = cycles.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.hub ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  // Summary KPIs
  const totalCycles     = cycles.length;
  const readyToClose    = cycles.filter(c => c.readiness_score === 100).length;
  const needsAttention  = cycles.filter(c => c.unresolved > 0 || c.recovery_pending > 0).length;
  const totalUnresolved = cycles.reduce((s, c) => s + c.unresolved, 0);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-blue-600" />
            Cycle Health Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Real-time status across all active MMP cycles
            {lastRefreshed && (
              <span className="ml-2 text-xs">· Last updated {lastRefreshed.toLocaleTimeString()}</span>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} data-testid="button-refresh-health">
          {loading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
          Refresh
        </Button>
      </div>

      {/* Summary KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Active Cycles</p>
            <p className="text-2xl font-bold">{totalCycles}</p>
          </CardContent>
        </Card>
        <Card className="border-green-200 dark:border-green-800">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Ready to Close</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{readyToClose}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 dark:border-amber-800">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Needs Attention</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{needsAttention}</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 dark:border-red-800">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Unresolved Sites</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{totalUnresolved}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      {cycles.length > 3 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by MMP name or hub..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-cycles"
          />
        </div>
      )}

      {/* Cycle rows */}
      {loading && cycles.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading cycle data…
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <TrendingUp className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No active cycles found.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(cycle => {
            const coverageRate = cycle.total > 0
              ? Math.round(((cycle.wfp_confirmed + cycle.submitted) / cycle.total) * 100)
              : 0;
            const statusInfo = STATUS_BADGE[cycle.cycle_status] ?? STATUS_BADGE.active;
            const isReady = cycle.readiness_score === 100;

            return (
              <Card
                key={cycle.id}
                className={`transition-all ${isReady ? 'border-green-300 dark:border-green-700' : cycle.unresolved > 0 ? 'border-amber-300 dark:border-amber-700' : ''}`}
                data-testid={`card-cycle-health-${cycle.id}`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-base" data-testid={`text-cycle-name-${cycle.id}`}>
                          {cycle.name}
                        </CardTitle>
                        <Badge className={`text-xs ${statusInfo.class}`}>
                          {statusInfo.label}
                        </Badge>
                        {isReady && (
                          <Badge className="text-xs bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300 gap-1">
                            <Shield className="h-3 w-3" /> Ready to close
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-xs mt-0.5">
                        {cycle.hub && <span>{cycle.hub} · </span>}
                        {cycle.month && cycle.year
                          ? new Date(cycle.year, (cycle.month ?? 1) - 1).toLocaleString('default', { month: 'long', year: 'numeric' })
                          : 'No date'}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Readiness</p>
                        <p className={`text-lg font-bold ${isReady ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                          {cycle.readiness_score}%
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/mmp/cycle-close?mmpId=${cycle.id}`)}
                        data-testid={`button-open-cycle-${cycle.id}`}
                      >
                        Open <ExternalLink className="h-3.5 w-3.5 ml-1" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  {/* Site status bar */}
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Site Coverage ({coverageRate}%)</span>
                      <span>{cycle.total} total sites</span>
                    </div>
                    <Progress value={coverageRate} className="h-2" data-testid={`progress-coverage-${cycle.id}`} />
                  </div>

                  {/* Status chips */}
                  <div className="flex flex-wrap gap-2">
                    <div className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800" data-testid={`chip-confirmed-${cycle.id}`}>
                      <CheckCircle2 className="h-3 w-3" />
                      {cycle.wfp_confirmed} WFP confirmed
                    </div>
                    <div className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800" data-testid={`chip-submitted-${cycle.id}`}>
                      <Clock className="h-3 w-3" />
                      {cycle.submitted} submitted
                    </div>
                    {cycle.rejected > 0 && (
                      <div className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800" data-testid={`chip-rejected-${cycle.id}`}>
                        <XCircle className="h-3 w-3" />
                        {cycle.rejected} rejected
                      </div>
                    )}
                    {cycle.not_covered > 0 && (
                      <div className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-gray-50 dark:bg-gray-900/30 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700" data-testid={`chip-not-covered-${cycle.id}`}>
                        {cycle.not_covered} not covered
                      </div>
                    )}
                    {cycle.unresolved > 0 && (
                      <div className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800" data-testid={`chip-unresolved-${cycle.id}`}>
                        <AlertTriangle className="h-3 w-3" />
                        {cycle.unresolved} unresolved
                      </div>
                    )}
                  </div>

                  {/* Finance flags */}
                  {(cycle.advances_pending > 0 || cycle.recovery_pending > 0 || !cycle.wfp_applied) && (
                    <div className="flex flex-wrap gap-2 pt-1 border-t">
                      {cycle.advances_pending > 0 && (
                        <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {cycle.advances_pending} advance{cycle.advances_pending !== 1 ? 's' : ''} pending
                        </span>
                      )}
                      {cycle.recovery_pending > 0 && (
                        <span className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {cycle.recovery_pending} recovery decision{cycle.recovery_pending !== 1 ? 's' : ''} needed
                        </span>
                      )}
                      {!cycle.wfp_applied && cycle.submitted > 0 && (
                        <span className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          WFP file not yet applied
                        </span>
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
