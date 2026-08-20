import { describe, expect, it } from 'vitest';
import {
  buildRedirectCorrectionRequest,
  getFinanceReviewRecallAction,
  getFinanceReviewRecallMode,
  getRedirectCorrectionRpcName,
} from '../cycleRedirectFinanceReview';

describe('getFinanceReviewRecallAction', () => {
  it('recalls directly when an immutable Finance review was already saved', () => {
    expect(getFinanceReviewRecallAction('2026-08-20T05:00:00.000Z'))
      .toBe('recall_saved_review');
    expect(getRedirectCorrectionRpcName(getFinanceReviewRecallMode()))
      .toBe('reverse_reprocessed_cycle_redirect_for_correction');
    expect(buildRedirectCorrectionRequest(
      getFinanceReviewRecallMode(),
      'action-1',
      'Finance confirmed restoration to the pre-Redirect state.',
      'period-1',
      'retry-key-123',
    )).toEqual({
      rpcName: 'reverse_reprocessed_cycle_redirect_for_correction',
      params: {
        p_action_id: 'action-1',
        p_reason: 'Finance confirmed restoration to the pre-Redirect state.',
        p_period_id: 'period-1',
        p_idempotency_key: 'retry-key-123',
        p_confirm_reverse_later_payment: true,
      },
    });
  });

  it('automatically saves a new review when recall is clicked', () => {
    expect(getFinanceReviewRecallAction(undefined))
      .toBe('save_review_then_recall');
  });
});