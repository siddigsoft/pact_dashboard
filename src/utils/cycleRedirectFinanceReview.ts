export type FinanceReviewRecallAction =
  | 'recall_saved_review'
  | 'save_review_then_recall'
  | 'confirmation_required';

/**
 * A saved Finance review is immutable. On a retry, consume it directly instead
 * of attempting to create another review with a new idempotency key.
 */
export const getFinanceReviewRecallAction = (
  snapshotReviewedAt: string | undefined,
  confirmSnapshotReview: boolean,
): FinanceReviewRecallAction => {
  if (snapshotReviewedAt) return 'recall_saved_review';
  return confirmSnapshotReview
    ? 'save_review_then_recall'
    : 'confirmation_required';
};