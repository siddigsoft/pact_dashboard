export interface RedirectSettlementTarget {
  id: string;
  status?: string | null;
  enumeratorFee?: number | null;
  transportFee?: number | null;
  settledFeeAmount?: number | null;
}

export interface RedirectSettlement {
  grossFee: number;
  priorSettled: number;
  appliedAmount: number;
  remainingFee: number;
  status: 'partially_paid' | 'paid';
}

export function getRedirectSettlement(
  target: Pick<RedirectSettlementTarget, 'enumeratorFee' | 'transportFee' | 'settledFeeAmount'>,
  advanceAmount: number,
): RedirectSettlement {
  const grossFee = Math.max((target.enumeratorFee ?? 0) + (target.transportFee ?? 0), 0);
  const priorSettled = Math.min(Math.max(target.settledFeeAmount ?? 0, 0), grossFee);
  const appliedAmount = Math.min(Math.max(advanceAmount, 0), Math.max(grossFee - priorSettled, 0));
  const remainingFee = Math.max(grossFee - priorSettled - appliedAmount, 0);

  return {
    grossFee,
    priorSettled,
    appliedAmount,
    remainingFee,
    status: remainingFee === 0 ? 'paid' : 'partially_paid',
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