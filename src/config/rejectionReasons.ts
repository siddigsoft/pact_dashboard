export type WorkflowType = 'mmp' | 'finance' | 'withdrawal' | 'site_visit' | 'cost_submission' | 'general';

export interface RejectionReasonOption {
  value: string;
  label: string;
}

export const REJECTION_REASONS: Record<WorkflowType, RejectionReasonOption[]> = {
  mmp: [
    { value: 'data_quality', label: 'Data Quality Issue' },
    { value: 'permit_missing', label: 'Permit Missing' },
    { value: 'coverage_gap', label: 'Coverage Gap' },
    { value: 'incomplete_entries', label: 'Incomplete Entries' },
    { value: 'duplicate_submission', label: 'Duplicate Submission' },
    { value: 'other', label: 'Other' },
  ],
  finance: [
    { value: 'receipt_missing', label: 'Receipt Missing' },
    { value: 'amount_mismatch', label: 'Amount Mismatch' },
    { value: 'duplicate', label: 'Duplicate Submission' },
    { value: 'insufficient_funds', label: 'Insufficient Funds' },
    { value: 'unauthorized_expense', label: 'Unauthorized Expense' },
    { value: 'other', label: 'Other' },
  ],
  withdrawal: [
    { value: 'insufficient_balance', label: 'Insufficient Balance' },
    { value: 'payment_method_invalid', label: 'Payment Method Invalid' },
    { value: 'policy_violation', label: 'Policy Violation' },
    { value: 'suspicious_activity', label: 'Suspicious Activity' },
    { value: 'documentation_required', label: 'Documentation Required' },
    { value: 'other', label: 'Other' },
  ],
  site_visit: [
    { value: 'incomplete_data', label: 'Incomplete Data Collected' },
    { value: 'gps_mismatch', label: 'GPS Location Mismatch' },
    { value: 'site_inaccessible', label: 'Site Was Inaccessible' },
    { value: 'wrong_site', label: 'Wrong Site Visited' },
    { value: 'photo_quality', label: 'Photo Quality Insufficient' },
    { value: 'other', label: 'Other' },
  ],
  cost_submission: [
    { value: 'receipt_missing', label: 'Receipt Missing' },
    { value: 'amount_mismatch', label: 'Amount Mismatch' },
    { value: 'duplicate', label: 'Duplicate Submission' },
    { value: 'out_of_policy', label: 'Out of Policy' },
    { value: 'wrong_category', label: 'Wrong Category' },
    { value: 'other', label: 'Other' },
  ],
  general: [
    { value: 'incomplete_information', label: 'Incomplete Information' },
    { value: 'policy_violation', label: 'Policy Violation' },
    { value: 'duplicate', label: 'Duplicate' },
    { value: 'not_authorized', label: 'Not Authorized' },
    { value: 'other', label: 'Other' },
  ],
};

export const APPROVAL_REASONS: Record<WorkflowType, RejectionReasonOption[]> = {
  mmp: [
    { value: 'verified_complete', label: 'Verified & Complete' },
    { value: 'meets_standards', label: 'Meets Quality Standards' },
    { value: 'permits_confirmed', label: 'Permits Confirmed' },
    { value: 'other', label: 'Other' },
  ],
  finance: [
    { value: 'receipts_verified', label: 'Receipts Verified' },
    { value: 'amounts_match', label: 'Amounts Match' },
    { value: 'budget_available', label: 'Budget Available' },
    { value: 'other', label: 'Other' },
  ],
  withdrawal: [
    { value: 'balance_sufficient', label: 'Balance Sufficient' },
    { value: 'request_valid', label: 'Request Valid' },
    { value: 'policy_compliant', label: 'Policy Compliant' },
    { value: 'other', label: 'Other' },
  ],
  site_visit: [
    { value: 'data_complete', label: 'Data Complete' },
    { value: 'location_verified', label: 'Location Verified' },
    { value: 'quality_acceptable', label: 'Quality Acceptable' },
    { value: 'other', label: 'Other' },
  ],
  cost_submission: [
    { value: 'receipts_verified', label: 'Receipts Verified' },
    { value: 'amounts_match', label: 'Amounts Match' },
    { value: 'policy_compliant', label: 'Policy Compliant' },
    { value: 'other', label: 'Other' },
  ],
  general: [
    { value: 'reviewed_approved', label: 'Reviewed & Approved' },
    { value: 'meets_requirements', label: 'Meets Requirements' },
    { value: 'other', label: 'Other' },
  ],
};

export function getRejectionReasonLabel(value: string, workflowType: WorkflowType = 'general'): string {
  const reasons = REJECTION_REASONS[workflowType];
  const found = reasons.find(r => r.value === value);
  if (found) return found.label;
  const general = REJECTION_REASONS.general.find(r => r.value === value);
  return general?.label || value;
}
