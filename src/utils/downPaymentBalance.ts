import type { DownPaymentRequest } from '@/types/down-payment';

/**
 * The status values used by old Down Payment rows are intentionally kept
 * separate from the UI buckets.  In particular, `closed` is a settled
 * payment status; the Closed tab is the rejection/cancellation bucket.
 */
export type DownPaymentStatusClassification =
  | 'pending'
  | 'approved'
  | 'settled'
  | 'closed'
  | 'deleted'
  | 'unknown';

export type DownPaymentPaymentBasis =
  | 'active_immutable_links'
  | 'legacy_source_total'
  | 'no_payment_evidence';

export interface DownPaymentPaymentEvidence {
  paymentAmount?: number | null;
  amount?: number | null;
  historyStatus?: string | null;
  isDeleted?: boolean;
}

export interface DownPaymentBalance {
  /** Amount approved for the request, excluding rejected/cancelled/deleted rows. */
  approved: number;
  /** Amount paid according to immutable evidence, or the legacy source total. */
  paid: number;
  /** Always non-negative and never greater than approved. */
  remaining: number;
  paymentBasis: DownPaymentPaymentBasis;
  reconciliationRequired: boolean;
  reconciliationReason?: string;
}

export type DownPaymentBalanceInput = Pick<DownPaymentRequest, 'status' | 'requestedAmount'> &
  Partial<Pick<DownPaymentRequest, 'approvedAmount' | 'totalPaidAmount' | 'paymentEvidenceSource' | 'reconciliationRequired' | 'reconciliationReason'>>;

export const SETTLED_DOWN_PAYMENT_STATUSES = [
  'fully_paid',
  'paid',
  'reconciled',
  'completed',
  'closed',
] as const;

export const APPROVED_DOWN_PAYMENT_STATUSES = [
  'approved',
  'partially_paid',
  ...SETTLED_DOWN_PAYMENT_STATUSES,
] as const;

export const CLOSED_DOWN_PAYMENT_STATUSES = ['rejected', 'cancelled'] as const;

export const PENDING_DOWN_PAYMENT_STATUSES = [
  'pending_supervisor',
  'pending_admin',
] as const;

export type CanonicalDownPaymentStatus =
  | typeof PENDING_DOWN_PAYMENT_STATUSES[number]
  | typeof APPROVED_DOWN_PAYMENT_STATUSES[number]
  | typeof CLOSED_DOWN_PAYMENT_STATUSES[number]
  | 'deleted'
  | 'unknown';

const KNOWN_DOWN_PAYMENT_STATUSES = new Set<string>([
  ...PENDING_DOWN_PAYMENT_STATUSES,
  ...APPROVED_DOWN_PAYMENT_STATUSES,
  ...CLOSED_DOWN_PAYMENT_STATUSES,
  'deleted',
]);

/**
 * Classify a status into its canonical lifecycle. Unknown values are not
 * treated as approved (which prevents new/incorrect statuses from inflating
 * financial totals).
 */
export function classifyDownPaymentStatus(status: string | null | undefined): DownPaymentStatusClassification {
  if (typeof status !== 'string' || !KNOWN_DOWN_PAYMENT_STATUSES.has(status)) return 'unknown';
  if ((PENDING_DOWN_PAYMENT_STATUSES as readonly string[]).includes(status)) return 'pending';
  if (status === 'approved' || status === 'partially_paid') return 'approved';
  if ((SETTLED_DOWN_PAYMENT_STATUSES as readonly string[]).includes(status)) return 'settled';
  if ((CLOSED_DOWN_PAYMENT_STATUSES as readonly string[]).includes(status)) return 'closed';
  // deleted has no financial value, but is deliberately not in the Closed UI
  // bucket (the UI bucket is rejected/cancelled only).
  if (status === 'deleted') return 'deleted';
  return 'unknown';
}

/** Normalize a stored status without applying a lifecycle/UI bucket. */
export function getCanonicalDownPaymentStatus(status: string | null | undefined): CanonicalDownPaymentStatus {
  if (typeof status !== 'string' || !KNOWN_DOWN_PAYMENT_STATUSES.has(status)) return 'unknown';
  return status as CanonicalDownPaymentStatus;
}

/** True for statuses shown in the Closed UI tab. */
export function isDownPaymentClosedStatus(status: string | null | undefined): boolean {
  return (CLOSED_DOWN_PAYMENT_STATUSES as readonly string[]).includes(status ?? '');
}

/** True for approved and all legacy/modern settled statuses. */
export function isDownPaymentApprovedLifecycleStatus(status: string | null | undefined): boolean {
  return (APPROVED_DOWN_PAYMENT_STATUSES as readonly string[]).includes(status ?? '');
}

export function isDownPaymentSettledStatus(status: string | null | undefined): boolean {
  return (SETTLED_DOWN_PAYMENT_STATUSES as readonly string[]).includes(status ?? '');
}

/** Canonical user-facing status labels used by screens and all exports. */
export function getDownPaymentStatusLabel(status: string | null | undefined): string {
  const labels: Record<string, string> = {
    pending_supervisor: 'Pending Supervisor',
    pending_admin: 'Pending Admin',
    approved: 'Approved',
    partially_paid: 'Partially Paid',
    fully_paid: 'Fully Paid',
    paid: 'Paid',
    reconciled: 'Reconciled',
    completed: 'Completed',
    closed: 'Closed',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
    deleted: 'Deleted',
  };
  return labels[status ?? ''] ?? 'Unknown';
}

function finiteAmount(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

function isActiveEvidence(evidence: DownPaymentPaymentEvidence): boolean {
  return (evidence.historyStatus ?? (evidence.isDeleted ? 'deleted' : 'active')) === 'active';
}

function evidenceAmount(evidence: DownPaymentPaymentEvidence): number {
  return finiteAmount(evidence.paymentAmount ?? evidence.amount);
}

/**
 * Derive the one canonical financial view of a request.
 *
 * Active immutable payment events are authoritative.  Legacy source totals
 * are retained as a compatibility fallback, but settled rows without an
 * active event are explicitly marked for reconciliation instead of silently
 * presenting an apparently trustworthy balance.
 */
export function getDownPaymentBalance(
  request: DownPaymentBalanceInput,
  paymentEvidence: readonly DownPaymentPaymentEvidence[] = [],
): DownPaymentBalance {
  const status = request.status as string;
  const isFinancial = isDownPaymentApprovedLifecycleStatus(status);
  const approved = isFinancial
    ? finiteAmount(request.approvedAmount ?? request.requestedAmount)
    : 0;

  const activeEvidence = paymentEvidence.filter(isActiveEvidence);
  // Pages that already resolved immutable links attach the basis to their
  // enriched row. Preserve that authority when a grouped/export view receives
  // the row without the separate evidence map.
  const declaredActiveEvidence = request.paymentEvidenceSource === 'active_immutable_links';
  const hasEvidence = activeEvidence.length > 0 || declaredActiveEvidence;
  const paid = activeEvidence.length > 0
    ? activeEvidence.reduce((sum, evidence) => sum + evidenceAmount(evidence), 0)
    : isFinancial
      ? finiteAmount(request.totalPaidAmount)
      : 0;
  const remaining = Math.max(0, approved - paid);

  const legacyPositiveTotal = !hasEvidence && finiteAmount(request.totalPaidAmount) > 0;
  const settledWithoutEvidence = isDownPaymentSettledStatus(status) && !hasEvidence;
  const reconciliationRequired = Boolean(
    request.reconciliationRequired || legacyPositiveTotal || settledWithoutEvidence,
  );

  let reconciliationReason = request.reconciliationReason || undefined;
  if (!reconciliationReason && legacyPositiveTotal) {
    reconciliationReason = 'Positive legacy payment total has no active immutable payment evidence.';
  } else if (!reconciliationReason && settledWithoutEvidence) {
    reconciliationReason = 'Settled status has no active immutable payment evidence.';
  }

  return {
    approved,
    paid,
    remaining,
    paymentBasis: hasEvidence
      ? 'active_immutable_links'
      : paid > 0
        ? 'legacy_source_total'
        : 'no_payment_evidence',
    reconciliationRequired,
    ...(reconciliationReason ? { reconciliationReason } : {}),
  };
}

/** Short alias useful at call sites that already have a Down Payment row. */
export const getDownPaymentRowBalance = getDownPaymentBalance;

export interface DownPaymentBalanceTotals {
  approved: number;
  paid: number;
  remaining: number;
}

export function sumDownPaymentBalances(
  requests: readonly (DownPaymentBalanceInput & { id?: string })[],
  evidenceByRequest?: ReadonlyMap<string, readonly DownPaymentPaymentEvidence[]>,
): DownPaymentBalanceTotals {
  return requests.reduce((totals, request) => {
    const evidence = request.id ? (evidenceByRequest?.get(request.id) ?? []) : [];
    const balance = getDownPaymentBalance(request, evidence);
    return {
      approved: totals.approved + balance.approved,
      paid: totals.paid + balance.paid,
      remaining: totals.remaining + balance.remaining,
    };
  }, { approved: 0, paid: 0, remaining: 0 });
}

// Compatibility aliases make the policy easy to consume from older screens
// while keeping one implementation and one set of status arrays.
export const classifyStatus = classifyDownPaymentStatus;
export const classifyDownPaymentLifecycle = classifyDownPaymentStatus;
export const getDownPaymentStatusClassification = classifyDownPaymentStatus;
export const getDownPaymentStatusBucket = classifyDownPaymentStatus;
export const normalizeDownPaymentStatus = getCanonicalDownPaymentStatus;
export const getDownPaymentMetrics = getDownPaymentBalance;
export const getDownPaymentFinancials = getDownPaymentBalance;
export const calculateDownPaymentBalance = getDownPaymentBalance;