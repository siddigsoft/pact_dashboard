import { supabase } from '@/integrations/supabase/client';
import { PENDING_COST_TIER_FILTER } from '@/utils/operationalCostApproval';

/** Terminal statuses — site is considered visited/resolved without a not-covered reason. */
export const RESOLVED_SITE_STATUSES = new Set([
  'submitted',
  'wfp_confirmed',
  'rejected',
  'not_covered',
  'approved',
  'cancelled',
  'completed',
  'verified',
]);

export interface SiteResolutionInput {
  status?: string | null;
  not_covered_flag?: boolean | null;
  not_covered_reason?: string | null;
}

/**
 * A site counts as resolved if its status is terminal OR it has an official not-covered reason.
 * not_covered_flag alone is NOT sufficient (prevents green checklist / submit-failure mismatch).
 */
export function isSiteResolved(site: SiteResolutionInput): boolean {
  const st = (site.status ?? '').toLowerCase().trim();
  if (RESOLVED_SITE_STATUSES.has(st)) return true;
  return Boolean(site.not_covered_reason);
}

export function isAdvanceCleared(a: { status: string; metadata?: Record<string, unknown> | null }): boolean {
  const meta = a.metadata ?? {};
  return (
    a.status === 'fully_paid' ||
    a.status === 'paid' ||
    meta['reconciled'] === true ||
    Boolean(meta['reconciled_at'])
  );
}

/** Parse mmp_files.month — supports integer month, "2026-04", or "April 2026" style strings. */
export function parseMmpMonthYear(month: string | number | null | undefined): {
  month: number | null;
  year: number | null;
} {
  if (month == null || month === '') return { month: null, year: null };

  if (typeof month === 'number') {
    return { month, year: null };
  }

  const s = String(month).trim();

  const isoMatch = s.match(/^(\d{4})-(\d{1,2})$/);
  if (isoMatch) {
    return { month: parseInt(isoMatch[2], 10), year: parseInt(isoMatch[1], 10) };
  }

  const num = parseInt(s, 10);
  if (!Number.isNaN(num) && num >= 1 && num <= 12) {
    return { month: num, year: null };
  }

  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return { month: parsed.getMonth() + 1, year: parsed.getFullYear() };
  }

  return { month: null, year: null };
}

/** Supabase filter: match cost submissions linked to an MMP via either FK column. */
export function mmpCostSubmissionOrFilter(mmpId: string): string {
  return `mmp_id.eq.${mmpId},mmp_file_id.eq.${mmpId}`;
}

export interface FinanceReadinessResult {
  ok: boolean;
  issues: string[];
  pendingViaReport: number;
}

export async function checkFinanceReadinessForClose(mmpId: string): Promise<FinanceReadinessResult> {
  let siteEntryIds: string[] = [];

  const { data: entries, error: entriesErr } = await supabase
    .from('mmp_site_entries')
    .select('id')
    .eq('mmp_file_id', mmpId);

  if (!entriesErr && entries) {
    siteEntryIds = entries.map((e: { id: string }) => e.id);
  }

  const costSubsQuery = supabase
    .from('operational_cost_submissions')
    .select('id, tier1_status, tier2_status, tier3_status, tier4_status')
    .or(mmpCostSubmissionOrFilter(mmpId))
    .or(PENDING_COST_TIER_FILTER);

  const advancesQuery =
    siteEntryIds.length > 0
      ? supabase.from('down_payment_requests').select('id, status, metadata').in('mmp_site_entry_id', siteEntryIds)
      : Promise.resolve({ data: [] as Array<{ id: string; status: string; metadata: Record<string, unknown> | null }>, error: null });

  const [advancesRes, withdrawalsRes, costSubsRes] = await Promise.all([
    advancesQuery,
    supabase.from('withdrawal_requests').select('id, status').eq('mmp_id', mmpId),
    costSubsQuery,
  ]);

  if (costSubsRes.error) {
    return { ok: false, issues: ['Finance readiness check failed — cannot proceed'], pendingViaReport: 0 };
  }

  const advances = (!advancesRes.error && advancesRes.data ? advancesRes.data : []) as Array<{
    id: string;
    status: string;
    metadata: Record<string, unknown> | null;
  }>;

  const unreconciledAdvances = advances.filter(
    (a) => a.status === 'partially_paid' && !isAdvanceCleared(a),
  ).length;

  const pendingViaReport = advances.filter(
    (a) => a.status === 'approved' && !isAdvanceCleared(a),
  ).length;

  const pendingWithdrawals = (
    (!withdrawalsRes.error && withdrawalsRes.data ? withdrawalsRes.data : []) as Array<{ id: string; status: string }>
  ).filter((w) => !['approved', 'rejected', 'completed', 'paid'].includes(w.status ?? '')).length;

  const pendingCostSubs = (costSubsRes.data || []).length;

  const issues: string[] = [];
  if (unreconciledAdvances > 0) {
    issues.push(`${unreconciledAdvances} partially-paid transport advance(s) not yet reconciled`);
  }
  if (pendingWithdrawals > 0) {
    issues.push(`${pendingWithdrawals} pending withdrawal request(s)`);
  }
  if (pendingCostSubs > 0) {
    issues.push(`${pendingCostSubs} pending cost submission(s) awaiting tier approval`);
  }

  return { ok: issues.length === 0, issues, pendingViaReport };
}

export interface SubmitApprovalState {
  allReadinessPassed: boolean;
  feesLockedAt: string | null;
  paymentsConfirmedAt: string | null;
  unreasonedSiteCount: number;
}

export function canSubmitForApproval(state: SubmitApprovalState): { ok: boolean; blockers: string[] } {
  const blockers: string[] = [];

  if (!state.allReadinessPassed) {
    blockers.push('Complete all readiness checklist gates (sites, finance, WFP, cost recovery)');
  }
  if (!state.feesLockedAt) {
    blockers.push('Lock exchange rate and fees (Step 6)');
  }
  if (!state.paymentsConfirmedAt) {
    blockers.push('Confirm all payments done (Step 7)');
  }
  if (state.unreasonedSiteCount > 0) {
    blockers.push(
      `${state.unreasonedSiteCount} uncovered site(s) still need a not-covered reason`,
    );
  }

  return { ok: blockers.length === 0, blockers };
}
