import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CycleChecklistItem {
  id: string;
  label: string;
  description: string;
  passed: boolean;
  count: number;
  total: number;
  link?: string;
  notConfigured?: boolean;
  pendingViaReport?: number;
}

export interface CycleCloseReadiness {
  items: CycleChecklistItem[];
  score: number;
  allPassed: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  cycleMonth: number | null;
  cycleYear: number | null;
}

async function fetchAllSiteEntries(mmpId: string) {
  const PAGE = 1000;
  let all: Array<{ id: string; status: string; not_covered_flag: boolean | null; not_covered_reason: string | null }> = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('mmp_site_entries')
      .select('id, status, not_covered_flag, not_covered_reason')
      .eq('mmp_file_id', mmpId)
      .range(from, from + PAGE - 1);
    if (error || !data) break;
    all = [...all, ...data];
    if (data.length < PAGE) break;
  }
  return all;
}

export function useCycleCloseReadiness(mmpId: string | null): CycleCloseReadiness {
  const [items, setItems] = useState<CycleChecklistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cycleMonth, setCycleMonth] = useState<number | null>(null);
  const [cycleYear, setCycleYear] = useState<number | null>(null);

  const check = useCallback(async () => {
    if (!mmpId) return;
    setLoading(true);
    setError(null);
    try {
      // ── Phase 1: Fetch MMP metadata + site entries + cost submissions in parallel
      const mmpRes = await supabase
        .from('mmp_files')
        .select('id, month, year')
        .eq('id', mmpId)
        .single();

      const mmpRow = mmpRes.data as { id: string; month: number | null; year: number | null } | null;
      const month = mmpRow?.month ?? null;
      const year = mmpRow?.year ?? null;
      setCycleMonth(month);
      setCycleYear(year);

      // Filter cost submissions by mmp_id FK directly.
      // Using a date-range filter picks up submissions from other MMPs that
      // share the same calendar month — giving inflated totals.
      const costSubsQuery = supabase
        .from('operational_cost_submissions')
        .select('id, tier1_status, tier2_status')
        .eq('mmp_id', mmpId)
        .or('tier1_status.eq.pending,tier2_status.eq.pending');

      // Fetch site entries (paginated) and cost submissions in parallel
      const [siteVisits, costSubsRes] = await Promise.all([
        fetchAllSiteEntries(mmpId),
        costSubsQuery,
      ]);

      if (costSubsRes.error) throw new Error(costSubsRes.error.message);

      const siteEntryIds = siteVisits.map(s => s.id);

      // ── Phase 2: Fetch advances, withdrawals, cost recovery, WFP — all parallel
      // Transport advances: filter via mmp_site_entry_id (the actual FK on down_payment_requests)
      const advancesPromise = siteEntryIds.length > 0
        ? (async () => {
            const PAGE = 1000;
            let all: Array<{ id: string; status: string; metadata: Record<string, unknown> | null }> = [];
            for (let from = 0; ; from += PAGE) {
              const { data, error } = await supabase
                .from('down_payment_requests')
                .select('id, status, metadata')
                .in('mmp_site_entry_id', siteEntryIds)
                .range(from, from + PAGE - 1);
              if (error) return { data: null, error };
              if (!data) break;
              all = [...all, ...data];
              if (data.length < PAGE) break;
            }
            return { data: all, error: null };
          })()
        : Promise.resolve({ data: [] as Array<{ id: string; status: string; metadata: Record<string, unknown> | null }>, error: null });

      const [advancesRes, withdrawalsRes, wfpRes, submittedRes, advNotCoveredRes, recoveryLogRes] = await Promise.all([
        advancesPromise,
        supabase.from('withdrawal_requests').select('id, status').eq('mmp_id', mmpId),
        supabase.from('wfp_confirmation_uploads').select('id, status').eq('mmp_id', mmpId).eq('status', 'applied').limit(1),
        supabase.from('mmp_site_entries').select('id', { count: 'exact', head: true }).eq('mmp_file_id', mmpId).eq('status', 'submitted'),
        (() => {
          const notCoveredIds = siteVisits
            .filter(s => s.not_covered_flag === true || (s.status ?? '').toLowerCase() === 'not_covered')
            .map(s => s.id);
          return notCoveredIds.length > 0
            ? supabase.from('down_payment_requests').select('id, mmp_site_entry_id').in('status', ['approved', 'partially_paid', 'fully_paid']).in('mmp_site_entry_id', notCoveredIds)
            : Promise.resolve({ data: [], error: null });
        })(),
        supabase.from('cost_recovery_log').select('site_entry_id').eq('mmp_id', mmpId),
      ]);

      // ── WFP confirmation gate
      let wfpApplied = false;
      let wfpError = false;
      const submittedCount = submittedRes.count ?? 0;
      if (wfpRes.error && wfpRes.error.code !== '42P01') {
        wfpError = true;
      } else if (wfpRes.error) {
        wfpError = true;
      } else {
        wfpApplied = (wfpRes.data || []).length > 0;
      }

      // ── Cost recovery gate
      let costRecoveryPending = 0;
      let costRecoveryError = false;
      if (advNotCoveredRes.error || recoveryLogRes.error) {
        costRecoveryError = true;
      } else {
        const advancedSiteIds = new Set(
          (advNotCoveredRes.data || [])
            .map((d: { mmp_site_entry_id: string | null }) => d.mmp_site_entry_id)
            .filter(Boolean),
        );
        const resolvedSiteIds = new Set(
          (recoveryLogRes.data || [])
            .map((r: { site_entry_id: string }) => r.site_entry_id),
        );
        const notCoveredIds = siteVisits
          .filter(s => s.not_covered_flag === true || (s.status ?? '').toLowerCase() === 'not_covered')
          .map(s => s.id);
        costRecoveryPending = notCoveredIds.filter(
          id => advancedSiteIds.has(id) && !resolvedSiteIds.has(id),
        ).length;
      }

      // ── Resolved sites gate
      const totalSites = siteVisits.length;
      const RESOLVED_STATUSES = new Set([
        'submitted',
        'wfp_confirmed',
        'rejected',
        'not_covered',
        'approved',
        'cancelled',
        'completed',
        'verified',
      ]);
      const resolvedSites = siteVisits.filter(
        s =>
          RESOLVED_STATUSES.has((s.status ?? '').toLowerCase().trim()) ||
          s.not_covered_flag === true ||
          Boolean(s.not_covered_reason),
      ).length;
      const unresolvedSites = totalSites - resolvedSites;

      // ── Cost submissions gate
      const pendingCostSubs = (costSubsRes.data || []).length;

      // ── Transport advances gate
      const advancesError = Boolean(advancesRes.error);
      const advances = advancesError
        ? []
        : (advancesRes.data || []) as Array<{ id: string; status: string; metadata: Record<string, unknown> | null }>;
      const totalAdvances = advances.length;

      // Advances split into three buckets:
      // 1. Cleared   — fully_paid / paid, OR explicitly reconciled via metadata
      // 2. Via report — approved but zero disbursement yet; these will be
      //                 settled in the "report of payments" (transport + enumerator
      //                 fees paid together). NOT blocking — just informational.
      // 3. Blocking  — partially_paid (some payment made, not completed) and
      //                NOT explicitly reconciled. Must resolve before close.
      const isCleared = (a: { status: string; metadata: Record<string, unknown> | null }) => {
        const meta = a.metadata ?? {};
        return (
          a.status === 'fully_paid' ||
          a.status === 'paid' ||
          meta['reconciled'] === true ||
          Boolean(meta['reconciled_at'])
        );
      };

      // Advances pending payment via report (approved, zero disbursement)
      const pendingViaReport = advances.filter(
        a => a.status === 'approved' && !isCleared(a),
      ).length;

      // Blocking: partially paid but not reconciled
      const unreconciledAdvances = advances.filter(
        a => a.status === 'partially_paid' && !isCleared(a),
      ).length;

      const clearedAdvances = advances.filter(isCleared).length;

      // ── Withdrawal requests gate
      const withdrawalsError = Boolean(withdrawalsRes.error);
      const withdrawals = withdrawalsError
        ? []
        : (withdrawalsRes.data || []) as Array<{ id: string; status: string }>;
      const totalWithdrawals = withdrawals.length;
      const pendingWithdrawals = withdrawals.filter(
        w => !['approved', 'rejected', 'completed', 'paid'].includes(w.status ?? ''),
      ).length;

      const cycleLabel =
        year !== null && month !== null
          ? ` for ${new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}`
          : '';

      const newItems: CycleChecklistItem[] = [
        {
          id: 'site_visits',
          label: 'All site visits resolved',
          description:
            'Every site must be completed, approved, cancelled, or officially marked as not covered.',
          passed: unresolvedSites === 0,
          count: resolvedSites,
          total: totalSites,
          link: '/mmp/cycle-close?tab=uncovered',
        },
        {
          id: 'cost_submissions',
          label: `No pending cost submissions${cycleLabel}`,
          description:
            'All cost submissions (tier 1 & tier 2) for this cycle month must be approved or rejected before closing.',
          passed: pendingCostSubs === 0,
          count: 0,
          total: pendingCostSubs,
          link: '/finance',
        },
        {
          id: 'transport_advances',
          label: 'Transport advances settled',
          description:
            unreconciledAdvances > 0
              ? `${unreconciledAdvances} partially-paid advance(s) must be completed or reconciled before closing.`
              : pendingViaReport > 0
              ? `${pendingViaReport} advance(s) not yet disbursed — include in the payment report (transport + enumerator fees) and mark as paid.`
              : 'All transport advances for this cycle are cleared.',
          passed: advancesError || unreconciledAdvances === 0,
          count: clearedAdvances,
          total: totalAdvances,
          link: '/down-payment-approval',
          notConfigured: advancesError,
          pendingViaReport,
        },
        {
          id: 'withdrawal_requests',
          label: 'All withdrawal requests processed',
          description: 'All withdrawal requests must be approved, rejected, or completed.',
          passed: withdrawalsError || pendingWithdrawals === 0,
          count: totalWithdrawals - pendingWithdrawals,
          total: totalWithdrawals,
          link: '/finance',
          notConfigured: withdrawalsError,
        },
        {
          id: 'cost_recovery',
          label: 'All not-covered cost recoveries addressed',
          description:
            'Every not-covered site that received an advance payment must have a recovery decision: Roll to Next MMP, Return Required, or Write-Off.',
          passed: costRecoveryError || costRecoveryPending === 0,
          count: 0,
          total: costRecoveryPending,
          link: '/mmp/cycle-close?tab=exceptions',
          notConfigured: costRecoveryError,
        },
        {
          id: 'wfp_confirmation',
          label: 'WFP confirmation file applied',
          description:
            'Upload and apply the WFP cleaned Excel to confirm or reject each submitted site visit before closing the cycle.',
          passed: wfpError || submittedCount === 0 || wfpApplied,
          count: wfpApplied ? submittedCount : 0,
          total: submittedCount,
          link: '/mmp/cycle-close?tab=wfp',
          notConfigured: wfpError,
        },
      ];

      setItems(newItems);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to check cycle readiness');
    } finally {
      setLoading(false);
    }
  }, [mmpId]);

  useEffect(() => {
    check();
  }, [check]);

  const passedCount = items.filter(i => i.passed).length;
  const score = items.length > 0 ? Math.round((passedCount / items.length) * 100) : 100;
  const allPassed = items.length > 0 && items.every(i => i.passed);

  return { items, score, allPassed, loading, error, refresh: check, cycleMonth, cycleYear };
}
