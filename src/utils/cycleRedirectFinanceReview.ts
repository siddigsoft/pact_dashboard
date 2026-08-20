export type RedirectCorrectionMode =
  | 'reopen_advance'
  | 'historical_accounting_only'
  | 'reverse_reprocessed_payment';

/** Automatic recall always uses the full later-payment reversal. */
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