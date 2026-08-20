import { describe, expect, it } from 'vitest';
import { getFinanceReviewRecallAction } from '../cycleRedirectFinanceReview';

describe('getFinanceReviewRecallAction', () => {
  it('recalls directly when an immutable Finance review was already saved', () => {
    expect(getFinanceReviewRecallAction('2026-08-20T05:00:00.000Z', false))
      .toBe('recall_saved_review');
  });

  it('requires an initial confirmation before saving a new review', () => {
    expect(getFinanceReviewRecallAction(undefined, false))
      .toBe('confirmation_required');
    expect(getFinanceReviewRecallAction(undefined, true))
      .toBe('save_review_then_recall');
  });
});