/** Shared operational-cost tier approval logic (mirrors CostSubmission.tsx). */

export interface OperationalCostTierInput {
  tier1_status?: string | null;
  tier2_status?: string | null;
  tier3_status?: string | null;
  tier4_status?: string | null;
  submitter_role?: string | null;
  status?: string | null;
}

export const PENDING_COST_TIER_FILTER =
  'tier1_status.eq.pending,tier2_status.eq.pending,tier3_status.eq.pending,tier4_status.eq.pending';

const normRole = (role?: string | null) => (role ?? '').toLowerCase().replace(/[\s_-]/g, '');

export function isCoordinatorSubmission(oc: OperationalCostTierInput): boolean {
  return (oc.submitter_role ?? '').toLowerCase().includes('coordinator');
}

export function isSupervisorSubmission(oc: OperationalCostTierInput): boolean {
  const role = (oc.submitter_role ?? '').toLowerCase();
  return role.includes('supervisor') || role.includes('hubsupervisor');
}

export function isFomSubmission(oc: OperationalCostTierInput): boolean {
  const role = normRole(oc.submitter_role);
  return role === 'fom' || role.includes('fieldoperationmanager');
}

export function isCDSubmission(oc: OperationalCostTierInput): boolean {
  const role = normRole(oc.submitter_role);
  return role === 'countrydirector' || role === 'country_director';
}

export function hasThreeTiers(oc: OperationalCostTierInput): boolean {
  if (isFomSubmission(oc) || isCDSubmission(oc)) return false;
  return isSupervisorSubmission(oc);
}

export function hasFourTiers(oc: OperationalCostTierInput): boolean {
  if (isFomSubmission(oc) || isCDSubmission(oc)) return false;
  // Do NOT use oc.tier4_status != null — the 20260607 migration set DEFAULT 'pending'
  // on all existing rows, poisoning this check for Supervisor/FOM/CD submissions.
  // Always derive tier count from submitter_role only.
  return isCoordinatorSubmission(oc);
}

export function isFinalTier(oc: OperationalCostTierInput, tier: 1 | 2 | 3 | 4): boolean {
  if (isCDSubmission(oc)) return tier === 1;
  if (isFomSubmission(oc)) return tier === 2;
  if (hasFourTiers(oc)) return tier === 4;
  if (hasThreeTiers(oc)) return tier === 3;
  return tier === 2;
}

export function getPendingCostTierLabel(oc: OperationalCostTierInput): string | null {
  if (oc.tier1_status === 'pending') return 'Tier 1';
  if (oc.tier2_status === 'pending') return 'Tier 2';
  if (oc.tier3_status === 'pending') return 'Tier 3';
  if (oc.tier4_status === 'pending') return 'Tier 4';
  return null;
}

export function isCostPendingForClose(oc: OperationalCostTierInput): boolean {
  return getPendingCostTierLabel(oc) !== null;
}

export function isCostFullyApproved(oc: OperationalCostTierInput): boolean {
  if (isCDSubmission(oc)) return oc.tier1_status === 'approved';
  if (isFomSubmission(oc)) {
    return oc.tier1_status === 'approved' && oc.tier2_status === 'approved';
  }
  if (hasFourTiers(oc)) {
    return (
      oc.tier1_status === 'approved' &&
      oc.tier2_status === 'approved' &&
      oc.tier3_status === 'approved' &&
      oc.tier4_status === 'approved'
    );
  }
  if (hasThreeTiers(oc)) {
    return (
      oc.tier1_status === 'approved' &&
      oc.tier2_status === 'approved' &&
      oc.tier3_status === 'approved'
    );
  }
  return oc.tier1_status === 'approved' && oc.tier2_status === 'approved';
}

export function getActivePendingTier(oc: OperationalCostTierInput): 1 | 2 | 3 | 4 | null {
  if (oc.tier1_status === 'pending') return 1;
  if (oc.tier2_status === 'pending') return 2;
  if (oc.tier3_status === 'pending') return 3;
  if (oc.tier4_status === 'pending') return 4;
  return null;
}

export function buildCostApproveUpdate(
  cost: OperationalCostTierInput,
  userId: string,
): Record<string, string | null> {
  const now = new Date().toISOString();
  const tier = getActivePendingTier(cost);
  if (!tier) return {};

  const updates: Record<string, string | null> = {};

  if (tier === 1) {
    updates.tier1_status = 'approved';
    updates.tier1_approved_by = userId;
    updates.tier1_approved_at = now;
    updates.status = isCDSubmission(cost) ? 'approved' : 'under_review';
  } else if (tier === 2) {
    updates.tier2_status = 'approved';
    updates.tier2_approved_by = userId;
    updates.tier2_approved_at = now;
    if (isFinalTier(cost, 2)) {
      updates.status = 'approved';
    } else {
      updates.status = 'under_review';
      updates.tier3_status = 'pending';
    }
  } else if (tier === 3) {
    updates.tier3_status = 'approved';
    updates.tier3_approved_by = userId;
    updates.tier3_approved_at = now;
    if (isFinalTier(cost, 3)) {
      updates.status = 'approved';
    } else {
      updates.status = 'under_review';
      updates.tier4_status = 'pending';
    }
  } else if (tier === 4) {
    updates.tier4_status = 'approved';
    updates.tier4_approved_by = userId;
    updates.tier4_approved_at = now;
    updates.status = 'approved';
  }

  return updates;
}

export function buildCostRejectUpdate(
  cost: OperationalCostTierInput,
  userId: string,
  reason: string,
): Record<string, string | null> {
  const now = new Date().toISOString();
  const msg = reason || 'Rejected from MMP Cycle Close';
  const tier = getActivePendingTier(cost);
  if (!tier) return {};

  const updates: Record<string, string | null> = {
    status: 'rejected',
    rejection_reason: msg,
  };

  if (tier === 1) {
    updates.tier1_status = 'rejected';
    updates.tier1_approved_by = userId;
    updates.tier1_approved_at = now;
    updates.tier1_notes = msg;
  } else if (tier === 2) {
    updates.tier2_status = 'rejected';
    updates.tier2_approved_by = userId;
    updates.tier2_approved_at = now;
    updates.tier2_notes = msg;
  } else if (tier === 3) {
    updates.tier3_status = 'rejected';
    updates.tier3_approved_by = userId;
    updates.tier3_approved_at = now;
    updates.tier3_notes = msg;
  } else if (tier === 4) {
    updates.tier4_status = 'rejected';
    updates.tier4_approved_by = userId;
    updates.tier4_approved_at = now;
    updates.tier4_notes = msg;
  }

  return updates;
}

/** Merge approval update fields into cost row (for cascading approve-all). */
export function applyCostApproveUpdate<T extends OperationalCostTierInput>(
  cost: T,
  update: Record<string, string | null>,
): T {
  return { ...cost, ...update };
}
