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
        .select('id, month, year')
        .eq('id', mmpId)
        .single();

      const mmpRow = mmpRes.data as { id: string; month: number | null; year: number | null } | null;
      const month = mmpRow?.month ?? null;
      const year = mmpRow?.year ?? null;
      setCycleMonth(month);
      setCycleYear(year);

      // Gate 6: WFP confirmation upload applied
      let wfpApplied = false;
      let wfpError = false;
      let submittedCount = 0;
      try {
        const [wfpRes, submittedRes] = await Promise.all([
          supabase.from('wfp_confirmation_uploads').select('id, status').eq('mmp_id', mmpId).eq('status', 'applied').limit(1),
          supabase.from('mmp_site_entries').select('id', { count: 'exact', head: true }).eq('mmp_file_id', mmpId).eq('status', 'submitted'),
        ]);
        if (wfpRes.error && wfpRes.error.code !== '42P01') {
          wfpError = true;
        } else if (wfpRes.error && wfpRes.error.code === '42P01') {
          wfpError = true; // table not yet created → notConfigured
        } else {
          wfpApplied = (wfpRes.data || []).length > 0;
          submittedCount = submittedRes.count ?? 0;
        }
      } catch {
        wfpError = true;
      }

      let costSubsQuery = supabase
        .from('operational_cost_submissions')
        .select('id, tier1_status, tier2_status, expense_date')
        .or('tier1_status.eq.pending,tier2_status.eq.pending');

      if (year !== null && month !== null) {
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        costSubsQuery = costSubsQuery
          .gte('expense_date', startDate)
          .lte('expense_date', endDate);
      }

      const [siteVisitsRes, costSubsRes, advancesRes, withdrawalsRes] = await Promise.all([
        supabase
          .from('mmp_site_entries')
          .select('id, status, not_covered_flag, not_covered_reason')
          .eq('mmp_file_id', mmpId)
          .limit(10000),
        costSubsQuery,
        supabase
          .from('down_payment_requests')
          .select('id, status, metadata')
          .eq('mmp_id', mmpId),
        supabase
          .from('withdrawal_requests')
          .select('id, status')
          .eq('mmp_id', mmpId),
      ]);

      // ── Gate 5: Cost Recovery — all not-covered sites with approved advances
      // must have a decision in cost_recovery_log before cycle can close.
      // Gracefully handles Phase B migration not yet applied (shows notConfigured).
      let costRecoveryPending = 0;
      let costRecoveryError = false;
      try {
        // Find not-covered site ids for this MMP
        const notCoveredIds = (siteVisitsRes.data || [])
          .filter((s: { status: string; not_covered_flag: boolean | null }) =>
            (s.not_covered_flag === true) || (s.status ?? '').toLowerCase() === 'not_covered',
          )
          .map((s: { id: string }) => s.id);

        if (notCoveredIds.length > 0) {
          // Find which of those have approved/paid advances but no recovery log entry
          const [advNotCoveredRes, recoveryLogRes] = await Promise.all([
            supabase
              .from('down_payment_requests')
              .select('id, mmp_site_entry_id')
              .in('status', ['approved', 'partially_paid', 'fully_paid'])
              .in('mmp_site_entry_id', notCoveredIds),
            supabase
              .from('cost_recovery_log')
              .select('site_entry_id')
              .eq('mmp_id', mmpId),
          ]);

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
            // Sites that are not-covered AND have an advance AND have NO recovery decision
            costRecoveryPending = notCoveredIds.filter(
              id => advancedSiteIds.has(id) && !resolvedSiteIds.has(id),
            ).length;
          }
        }
      } catch {
        costRecoveryError = true;
      }

      // Fail readiness on critical query errors to prevent false-green states
      if (siteVisitsRes.error) throw new Error(siteVisitsRes.error.message);
      if (costSubsRes.error) throw new Error(costSubsRes.error.message);
      // down_payment_requests and withdrawal_requests may not exist in all environments;
      // treat their errors as empty (handled gracefully rather than blocking)

      const siteVisits = siteVisitsRes.data || [];
      const totalSites = siteVisits.length;
      // Phase A: 'completed' renamed to 'submitted'; 'wfp_confirmed' and 'not_covered' added.
      // All of these count as resolved for the Pre-Close Checklist gate.
      const RESOLVED_STATUSES = new Set([
        'submitted',      // enumerator self-reported (Phase A)
        'wfp_confirmed',  // WFP confirmed (Phase C)
        'rejected',       // WFP rejected — still needs resolution but counts as processed
        'not_covered',    // officially not visited
        'approved',       // legacy
        'cancelled',      // cancelled during close
        'completed',      // legacy pre-Phase A records
        'verified',       // legacy permit-verified
      ]);

      const resolvedSites = siteVisits.filter(
        (s: { status: string; not_covered_flag: boolean | null; not_covered_reason: string | null }) =>
          RESOLVED_STATUSES.has((s.status ?? '').toLowerCase().trim()) ||
          s.not_covered_flag === true ||
          Boolean(s.not_covered_reason),
      ).length;
      const unresolvedSites = totalSites - resolvedSites;

      const pendingCostSubs = (costSubsRes.data || []).length;

      // Advances: gracefully handle missing tables — show notConfigured warning
      const advancesError = !advancesRes.error ? false : true;
      const advances = (!advancesRes.error && advancesRes.data || []) as Array<{
        id: string;
        status: string;
        metadata: Record<string, unknown> | null;
      }>;
      const totalAdvances = advances.length;
      const unreconciledAdvances = advances.filter(a => {
        const isTerminal = a.status === 'approved' || a.status === 'paid';
        const meta = a.metadata ?? {};
        const isReconciled = meta['reconciled'] === true || Boolean(meta['reconciled_at']);
        return isTerminal && !isReconciled;
      }).length;

      // Withdrawals: gracefully handle missing tables — show notConfigured warning
      const withdrawalsError = !withdrawalsRes.error ? false : true;
      const withdrawals = (!withdrawalsRes.error && withdrawalsRes.data || []) as Array<{ id: string; status: string }>;
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
          label: 'All transport advances reconciled',
          description: 'Approved transport advances for this cycle must be reconciled.',
          // Table unavailable: passed=true with notConfigured warning (informational; server gate enforces)
          passed: advancesError || unreconciledAdvances === 0,
          count: totalAdvances - unreconciledAdvances,
          total: totalAdvances,
          link: '/reconciliation-dashboard',
          notConfigured: advancesError,
        },
        {
          id: 'withdrawal_requests',
          label: 'All withdrawal requests processed',
          description: 'All withdrawal requests must be approved, rejected, or completed.',
          // Table unavailable: passed=true with notConfigured warning (informational; server gate enforces)
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
          // Table unavailable (Phase B migration not applied): treat as passed with notConfigured warning
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
          // Table unavailable (Phase C migration not applied): treat as passed with notConfigured warning
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
