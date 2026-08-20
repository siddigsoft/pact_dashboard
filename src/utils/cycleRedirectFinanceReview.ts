export type FinanceReviewRecallAction =
  | 'recall_saved_review'
  | 'save_review_then_recall';

export type RedirectCorrectionMode =
  | 'reopen_advance'
  | 'historical_accounting_only'
  | 'reverse_reprocessed_payment';

/**
 * A saved Finance review is immutable. On a retry, consume it directly instead
 * of attempting to create another review with a new idempotency key.
 */
export const getFinanceReviewRecallAction = (
  snapshotReviewedAt: string | undefined,
): FinanceReviewRecallAction => {
  if (snapshotReviewedAt) return 'recall_saved_review';
  return 'save_review_then_recall';
};

/** Finance attestations are valid only for the full later-payment reversal. */
export const getFinanceReviewRecallMode = (): RedirectCorrectionMode =>
  'reverse_reprocessed_payment';

export const getRedirectCorrectionRpcName = (
  mode: RedirectCorrectionMode,
): 'reopen_cycle_redirect_for_correction'
  | 'reconcile_reprocessed_cycle_redirect'
  | 'reverse_reprocessed_cycle_redirect_for_correction' => {
  if (mode === 'historical_accounting_only') {
    return 'reconcile_reprocessed_cycle_redirect';
  }
  if (mode === 'reverse_reprocessed_payment') {
    return 'reverse_reprocessed_cycle_redirect_for_correction';
  }
  return 'reopen_cycle_redirect_for_correction';
};

export const buildRedirectCorrectionRequest = (
  mode: RedirectCorrectionMode,
  actionId: string,
  reason: string,
  periodId: string,
  idempotencyKey: string,
) => {
  const rpcName = getRedirectCorrectionRpcName(mode);
  const params: Record<string, unknown> = {
    p_action_id: actionId,
    p_reason: reason,
    p_period_id: periodId,
    p_idempotency_key: idempotencyKey,
  };
  if (mode === 'reverse_reprocessed_payment') {
    params.p_confirm_reverse_later_payment = true;
  }
  return { rpcName, params };
};