export interface RedirectSettlementTarget {
  id: string;
  siteName?: string;
  status?: string | null;
  enumeratorFee?: number | null;
  transportFee?: number | null;
  settledFeeAmount?: number | null;
  enumeratorId?: string | null;
  sameEnumerator?: boolean;
}

export interface RedirectAllocationDraft {
  targetSiteId: string;
  targetSiteName?: string;
  amount: number;
  targetEnumeratorId?: string | null;
  sameEnumerator?: boolean;
  feeGrossAmount?: number;
  feePriorSettledAmount?: number;
  feeRemainingAmount?: number;
  feeSettlementStatus?: 'partially_paid' | 'paid';
  journalEntryId?: string;
}

export interface RedirectSettlement {
  grossFee: number;
  priorSettled: number;
  appliedAmount: number;
  remainingFee: number;
  status: 'partially_paid' | 'paid';
}

export interface RedirectAllocationSettlement extends RedirectAllocationDraft, RedirectSettlement {}

export interface RedirectAllocationSummary {
  allocations: RedirectAllocationSettlement[];
  totalAllocated: number;
  unallocatedAmount: number;
  isComplete: boolean;
  hasCrossEnumerator: boolean;
  errors: string[];
}

export interface FeeAdvanceDeductionInput {
  grossFee: number;
  activeTargetAdvance: number;
  recordedAdvanceOffset: number;
  hasRedirectAllocation: boolean;
}

/**
 * A Redirect allocation has already posted its source advance to GL. When a
 * partially settled target is later completed with cash, only the persisted
 * offset may be deducted; blending in a separate target-site advance would
 * misstate the cash component and leave that other advance unreconciled.
 */
export function resolveFeeAdvanceDeduction({
  grossFee,
  activeTargetAdvance,
  recordedAdvanceOffset,
  hasRedirectAllocation,
}: FeeAdvanceDeductionInput): number {
  const fee = Math.max(Number(grossFee) || 0, 0);
  const recorded = Math.max(Number(recordedAdvanceOffset) || 0, 0);
  if (hasRedirectAllocation) return Math.min(recorded, fee);
  const active = Math.max(Number(activeTargetAdvance) || 0, 0);
  return Math.min(Math.max(recorded, active), fee);
}

const money = (amount: number) => Math.round((Number.isFinite(amount) ? amount : 0) * 100) / 100;

export function getRedirectSettlement(
  target: Pick<RedirectSettlementTarget, 'enumeratorFee' | 'transportFee' | 'settledFeeAmount'>,
  advanceAmount: number,
): RedirectSettlement {
  const grossFee = money(Math.max((target.enumeratorFee ?? 0) + (target.transportFee ?? 0), 0));
  const priorSettled = money(Math.min(Math.max(target.settledFeeAmount ?? 0, 0), grossFee));
  const appliedAmount = money(Math.min(Math.max(advanceAmount, 0), Math.max(grossFee - priorSettled, 0)));
  const remainingFee = money(Math.max(grossFee - priorSettled - appliedAmount, 0));

  return {
    grossFee,
    priorSettled,
    appliedAmount,
    remainingFee,
    status: remainingFee === 0 ? 'paid' : 'partially_paid',
  };
}

export function getRedirectTargetCapacity(
  target: Pick<RedirectSettlementTarget, 'enumeratorFee' | 'transportFee' | 'settledFeeAmount'>,
): number {
  return getRedirectSettlement(target, Number.MAX_SAFE_INTEGER).appliedAmount;
}

export function isEligibleRedirectAllocationTarget(
  sourceSiteId: string,
  target: RedirectSettlementTarget,
): boolean {
  return target.id !== sourceSiteId
    && target.status?.toLowerCase() !== 'not_covered'
    && getRedirectTargetCapacity(target) > 0;
}

export function buildAutomaticRedirectAllocations(
  sourceSiteId: string,
  targets: RedirectSettlementTarget[],
  advanceAmount: number,
): RedirectAllocationDraft[] {
  let remaining = money(Math.max(advanceAmount, 0));
  const allocations: RedirectAllocationDraft[] = [];

  for (const target of targets
    .filter(candidate => isEligibleRedirectAllocationTarget(sourceSiteId, candidate))
    .sort((left, right) => Number(!!right.sameEnumerator) - Number(!!left.sameEnumerator)
      || (left.siteName ?? left.id).localeCompare(right.siteName ?? right.id))) {
    if (remaining <= 0) break;
    const amount = money(Math.min(remaining, getRedirectTargetCapacity(target)));
    if (amount <= 0) continue;
    allocations.push({
      targetSiteId: target.id,
      targetSiteName: target.siteName,
      amount,
      targetEnumeratorId: target.enumeratorId,
      sameEnumerator: target.sameEnumerator,
    });
    remaining = money(remaining - amount);
  }

  return allocations;
}

export function summarizeRedirectAllocations(
  sourceSiteId: string,
  targets: RedirectSettlementTarget[],
  allocations: RedirectAllocationDraft[] | undefined,
  advanceAmount: number,
): RedirectAllocationSummary {
  const targetById = new Map(targets.map(target => [target.id, target]));
  const seenTargets = new Set<string>();
  const errors: string[] = [];
  const settlementRows: RedirectAllocationSettlement[] = [];

  for (const allocation of allocations ?? []) {
    const target = targetById.get(allocation.targetSiteId);
    if (!target) {
      errors.push(`Target ${allocation.targetSiteName ?? allocation.targetSiteId} is no longer available.`);
      continue;
    }
    if (seenTargets.has(allocation.targetSiteId)) {
      errors.push(`Target ${target.siteName ?? target.id} is selected more than once.`);
      continue;
    }
    seenTargets.add(allocation.targetSiteId);
    if (!isEligibleRedirectAllocationTarget(sourceSiteId, target)) {
      errors.push(`Target ${target.siteName ?? target.id} is not an eligible covered site.`);
      continue;
    }
    const amount = money(allocation.amount);
    if (amount <= 0) {
      errors.push(`Allocation for ${target.siteName ?? target.id} must be greater than zero.`);
      continue;
    }
    const capacity = getRedirectTargetCapacity(target);
    if (amount > capacity) {
      errors.push(`Allocation for ${target.siteName ?? target.id} exceeds the remaining fee of SDG ${capacity.toLocaleString()}.`);
      continue;
    }
    settlementRows.push({
      ...allocation,
      targetSiteName: allocation.targetSiteName ?? target.siteName,
      targetEnumeratorId: allocation.targetEnumeratorId ?? target.enumeratorId,
      sameEnumerator: allocation.sameEnumerator ?? target.sameEnumerator,
      ...getRedirectSettlement(target, amount),
    });
  }

  const totalAllocated = money(settlementRows.reduce((sum, row) => sum + row.amount, 0));
  const normalizedAdvance = money(Math.max(advanceAmount, 0));
  if (totalAllocated > normalizedAdvance) {
    errors.push(`Allocations exceed the paid advance by SDG ${money(totalAllocated - normalizedAdvance).toLocaleString()}.`);
  }
  const unallocatedAmount = money(Math.max(normalizedAdvance - totalAllocated, 0));

  return {
    allocations: settlementRows,
    totalAllocated,
    unallocatedAmount,
    isComplete: errors.length === 0
      && settlementRows.length > 0
      && totalAllocated === normalizedAdvance,
    hasCrossEnumerator: settlementRows.some(row => row.sameEnumerator === false),
    errors,
  };
}

export function isCoveredRedirectTarget(
  sourceSiteId: string,
  target: RedirectSettlementTarget,
  advanceAmount: number,
): boolean {
  if (target.id === sourceSiteId || target.status?.toLowerCase() === 'not_covered') return false;
  const settlement = getRedirectSettlement(target, advanceAmount);
  return settlement.grossFee > 0
    && advanceAmount > 0
    && settlement.appliedAmount === advanceAmount;
}

export function canReassignToTarget(
  sourceSiteId: string,
  target: Pick<RedirectSettlementTarget, 'id' | 'status'>,
): boolean {
  return target.id !== sourceSiteId && target.status?.toLowerCase() !== 'not_covered';
}

export function buildRedirectPaymentTrace(input: {
  advanceId: string;
  paymentReferences?: string[];
  settlement: RedirectSettlement;
  journalEntryId?: string;
  targetSiteId: string;
}) {
  return {
    sourceAdvanceId: input.advanceId,
    originalPaymentReferences: input.paymentReferences ?? [],
    targetSiteId: input.targetSiteId,
    feeGrossAmount: input.settlement.grossFee,
    feePriorSettledAmount: input.settlement.priorSettled,
    feeSettledAmount: input.settlement.appliedAmount,
    feeRemainingAmount: input.settlement.remainingFee,
    feeSettlementStatus: input.settlement.status,
    journalEntryId: input.journalEntryId,
  };
}

export function buildRedirectAllocationTrace(input: {
  advanceId: string;
  paymentReferences?: string[];
  allocations: RedirectAllocationSettlement[];
  journalEntryId?: string;
}) {
  return {
    sourceAdvanceId: input.advanceId,
    originalPaymentReferences: input.paymentReferences ?? [],
    totalAllocatedAmount: money(input.allocations.reduce((sum, row) => sum + row.amount, 0)),
    allocations: input.allocations.map(row => ({
      targetSiteId: row.targetSiteId,
      targetSiteName: row.targetSiteName,
      amount: row.amount,
      feeGrossAmount: row.grossFee,
      feePriorSettledAmount: row.priorSettled,
      feeRemainingAmount: row.remainingFee,
      feeSettlementStatus: row.status,
    })),
    journalEntryId: input.journalEntryId,
  };
}
