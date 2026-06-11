import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  isSiteResolved,
  isAdvanceCleared,
  parseMmpMonthYear,
  mmpCostSubmissionOrFilter,
} from '@/utils/cycleCloseGates';
import { PENDING_COST_TIER_FILTER } from '@/utils/operationalCostApproval';

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
      const mmpRes = await supabase
        .from('mmp_files')
        .select('id, name, month')
        .eq('id', mmpId)
        .single();

      const mmpRow = mmpRes.data as { id: string; name: string | null; month: string | number | null } | null;
      const mmpName = mmpRow?.name ?? '';
      const parsed = parseMmpMonthYear(mmpRow?.month ?? null);
      setCycleMonth(parsed.month);
      setCycleYear(parsed.year);

      const costSubsQuery = supabase
        .from('operational_cost_submissions')
        .select('id, tier1_status, tier2_status, tier3_status, tier4_status, description, amount_cents, currency, expense_category, vendor, expense_date')
        .or(mmpCostSubmissionOrFilter(mmpId))
        .or(PENDING_COST_TIER_FILTER);

      const [siteVisits, costSubsRes] = await Promise.all([
        fetchAllSiteEntries(mmpId),
        costSubsQuery,
      ]);

      if (costSubsRes.error) throw new Error(costSubsRes.error.message);

      const siteEntryIds = siteVisits.map(s => s.id);

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

      const totalSites = siteVisits.length;
      const resolvedSites = siteVisits.filter(s => isSiteResolved(s)).length;
      const completedSites = siteVisits.filter(s => {
        const st = (s.status ?? '').toLowerCase().trim();
        return st === 'completed' || st === 'submitted' || st === 'wfp_confirmed';
      }).length;
      const unresolvedSites = totalSites - resolvedSites;

      type PendingCostSub = {
        id: string;
        tier1_status: string | null;
        tier2_status: string | null;
        description: string | null;
        amount_cents: number | null;
        currency: string | null;
        expense_category: string | null;
        vendor: string | null;
        expense_date: string | null;
      };
      const pendingCostSubRows = (costSubsRes.data || []) as PendingCostSub[];
      const pendingCostSubs = pendingCostSubRows.length;

      const advancesError = Boolean(advancesRes.error);
      const advances = advancesError
        ? []
        : (advancesRes.data || []) as Array<{ id: string; status: string; metadata: Record<string, unknown> | null }>;
      const totalAdvances = advances.length;

      const pendingViaReport = advances.filter(
        a => a.status === 'approved' && !isAdvanceCleared(a),
      ).length;

      const unreconciledAdvances = advances.filter(
        a => a.status === 'partially_paid' && !isAdvanceCleared(a),
      ).length;

      const clearedAdvances = advances.filter(isAdvanceCleared).length;

      const withdrawalsError = Boolean(withdrawalsRes.error);
      const withdrawals = withdrawalsError
        ? []
        : (withdrawalsRes.data || []) as Array<{ id: string; status: string }>;
      const totalWithdrawals = withdrawals.length;
      const pendingWithdrawals = withdrawals.filter(
        w => !['approved', 'rejected', 'completed', 'paid'].includes(w.status ?? ''),
      ).length;

      const cycleLabel =
        parsed.year !== null && parsed.month !== null
          ? ` for ${new Date(parsed.year, parsed.month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}`
          : '';

      const costSubsDescription = (() => {
        if (pendingCostSubs === 0) {
          return 'All cost submissions (tier 1 & tier 2) for this cycle are approved or rejected.';
        }
        const lines = pendingCostSubRows.slice(0, 3).map(s => {
          const label = s.vendor || s.description || s.expense_category || 'Unnamed submission';
          const amt = s.amount_cents != null
            ? `${(s.amount_cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })} ${s.currency ?? ''}`.trim()
            : '';
          const date = s.expense_date ? new Date(s.expense_date).toLocaleDateString() : '';
          const parts = [label, amt, date].filter(Boolean);
          return `• ${parts.join(' — ')}`;
        });
        if (pendingCostSubs > 3) lines.push(`• …and ${pendingCostSubs - 3} more`);
        return `${pendingCostSubs} submission${pendingCostSubs !== 1 ? 's' : ''} still pending approval:\n${lines.join('\n')}`;
      })();

      const newItems: CycleChecklistItem[] = [
        {
          id: 'site_visits',
          label: 'All site visits resolved',
          description: unresolvedSites > 0
            ? `${unresolvedSites} site${unresolvedSites !== 1 ? 's' : ''} still pending — each must be visited (submitted/approved) or officially marked as Not Covered with a reason before closing.`
            : `All sites are resolved. ${completedSites} visit${completedSites !== 1 ? 's' : ''} completed; remaining sites are approved, confirmed, or officially marked as not covered.`,
          passed: unresolvedSites === 0,
          count: completedSites,
          total: totalSites,
          link: `/mmp/cycle-close?tab=uncovered&mmpId=${mmpId}`,
        },
        {
          id: 'cost_submissions',
          label: `No pending cost submissions${cycleLabel}`,
          description: costSubsDescription,
          passed: pendingCostSubs === 0,
          count: 0,
          total: pendingCostSubs,
          link: `/cost-submission?mmpId=${mmpId}&mmpName=${encodeURIComponent(mmpName)}&tab=pending`,
        },
        {
          id: 'transport_advances',
          label: 'Transport advances settled',
          description: advancesError
            ? 'Could not check transport advance status — please retry. Do not close the cycle until this is confirmed.'
            : unreconciledAdvances > 0
            ? `${unreconciledAdvances} advance${unreconciledAdvances !== 1 ? 's' : ''} partially paid — complete or reconcile each one before closing.`
            : pendingViaReport > 0
            ? `${clearedAdvances} advance${clearedAdvances !== 1 ? 's' : ''} fully cleared. ${pendingViaReport} advance${pendingViaReport !== 1 ? 's' : ''} not yet disbursed — include in the payment report (transport + enumerator fees) and mark as paid.`
            : totalAdvances === 0
            ? 'No transport advances recorded for this cycle.'
            : `All ${totalAdvances} advance${totalAdvances !== 1 ? 's' : ''} fully cleared.`,
          passed: !advancesError && unreconciledAdvances === 0,
          count: clearedAdvances + pendingViaReport,
          total: totalAdvances,
          link: `/down-payment-approval?mmpName=${encodeURIComponent(mmpName)}`,
          notConfigured: advancesError,
          pendingViaReport,
        },
        {
          id: 'withdrawal_requests',
          label: 'All withdrawal requests processed',
          description: withdrawalsError
            ? 'Could not check withdrawal request status — please retry. Do not close the cycle until this is confirmed.'
            : totalWithdrawals === 0
            ? 'No withdrawal requests tagged to this MMP.'
            : 'All withdrawal requests tagged to this MMP must be approved, rejected, or completed.',
          passed: !withdrawalsError && pendingWithdrawals === 0,
          count: totalWithdrawals - pendingWithdrawals,
          total: totalWithdrawals,
          link: '/finance',
          notConfigured: withdrawalsError,
        },
        {
          id: 'cost_recovery',
          label: 'All not-covered cost recoveries addressed',
          description: costRecoveryError
            ? 'Could not check cost recovery status — please retry. Do not close the cycle until this is confirmed.'
            : 'Every not-covered site that received an advance payment must have a recovery decision: Roll to Next MMP, Return Required, or Write-Off.',
          passed: !costRecoveryError && costRecoveryPending === 0,
          count: 0,
          total: costRecoveryPending,
          link: '/mmp/cycle-close?tab=exceptions',
          notConfigured: costRecoveryError,
        },
        {
          id: 'wfp_confirmation',
          label: 'WFP confirmation file applied',
          description: wfpError
            ? 'Could not check WFP confirmation status — please retry. Do not close the cycle until this is confirmed.'
            : 'Upload and apply the WFP cleaned Excel to confirm or reject each submitted site visit before closing the cycle.',
          passed: !wfpError && (submittedCount === 0 || wfpApplied),
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
