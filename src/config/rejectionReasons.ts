export type WorkflowType = 'mmp' | 'finance' | 'withdrawal' | 'site_visit' | 'cost_submission' | 'general';

export interface RejectionReasonOption {
  value: string;
  label: string;
  /** Optional group label for visual grouping in the dropdown */
  group?: string;
}

export const REJECTION_REASONS: Record<WorkflowType, RejectionReasonOption[]> = {
  mmp: [
    { value: 'data_quality',          label: 'Data Quality Issue',           group: 'Data' },
    { value: 'permit_missing',        label: 'Permit Missing',               group: 'Documentation' },
    { value: 'coverage_gap',          label: 'Coverage Gap',                 group: 'Data' },
    { value: 'incomplete_entries',    label: 'Incomplete Entries',           group: 'Data' },
    { value: 'duplicate_submission',  label: 'Duplicate Submission',         group: 'Data' },
    { value: 'other',                 label: 'Other',                        group: 'General' },
  ],
  finance: [
    { value: 'receipt_missing',       label: 'Receipt Missing',              group: 'Documentation' },
    { value: 'amount_mismatch',       label: 'Amount Mismatch',              group: 'Financial' },
    { value: 'duplicate',             label: 'Duplicate Submission',         group: 'Financial' },
    { value: 'insufficient_funds',    label: 'Insufficient Funds',           group: 'Financial' },
    { value: 'unauthorized_expense',  label: 'Unauthorized Expense',         group: 'Policy' },
    { value: 'other',                 label: 'Other',                        group: 'General' },
  ],
  withdrawal: [
    { value: 'insufficient_balance',  label: 'Insufficient Balance',         group: 'Financial' },
    { value: 'payment_method_invalid',label: 'Payment Method Invalid',       group: 'Financial' },
    { value: 'policy_violation',      label: 'Policy Violation',             group: 'Policy' },
    { value: 'suspicious_activity',   label: 'Suspicious Activity',          group: 'Compliance' },
    { value: 'documentation_required',label: 'Documentation Required',       group: 'Documentation' },
    { value: 'other',                 label: 'Other',                        group: 'General' },
  ],
  site_visit: [
    { value: 'incomplete_data',       label: 'Incomplete Data Collected',    group: 'Field' },
    { value: 'gps_mismatch',          label: 'GPS Location Mismatch',        group: 'Field' },
    { value: 'site_inaccessible',     label: 'Site Was Inaccessible',        group: 'Field' },
    { value: 'wrong_site',            label: 'Wrong Site Visited',           group: 'Field' },
    { value: 'photo_quality',         label: 'Photo Quality Insufficient',   group: 'Field' },
    { value: 'other',                 label: 'Other',                        group: 'General' },
  ],
  cost_submission: [
    // --- Documentation Issues ---
    { value: 'receipt_missing',         label: 'Receipt / Invoice Missing',            group: 'Documentation' },
    { value: 'supporting_docs_missing', label: 'Supporting Documents Missing',         group: 'Documentation' },
    { value: 'photo_evidence_poor',     label: 'Photo Evidence Insufficient',          group: 'Documentation' },
    { value: 'signature_missing',       label: 'Authorisation Signature Missing',      group: 'Documentation' },
    { value: 'tor_not_attached',        label: 'Consultancy ToR Not Attached',         group: 'Documentation' },
    // --- Financial Issues ---
    { value: 'amount_mismatch',         label: 'Amount Mismatch',                      group: 'Financial' },
    { value: 'exceeds_budget',          label: 'Exceeds Approved Budget Line',         group: 'Financial' },
    { value: 'duplicate',               label: 'Duplicate Submission',                 group: 'Financial' },
    { value: 'wrong_currency',          label: 'Wrong Currency Reported',              group: 'Financial' },
    { value: 'advance_not_cleared',     label: 'Previous Advance Not Cleared',         group: 'Financial' },
    // --- Policy & Compliance ---
    { value: 'out_of_policy',           label: 'Out of Policy',                        group: 'Policy & Compliance' },
    { value: 'unauthorized_expense',    label: 'Unauthorized Expense',                 group: 'Policy & Compliance' },
    { value: 'procurement_violation',   label: 'Procurement Rules Not Followed',       group: 'Policy & Compliance' },
    { value: 'donor_guidelines_breach', label: 'Donor Guidelines Not Met',             group: 'Policy & Compliance' },
    // --- Field & Activity ---
    { value: 'activity_not_confirmed',  label: 'Field Activity Not Confirmed',         group: 'Field & Activity' },
    { value: 'wrong_category',          label: 'Wrong Cost Category',                  group: 'Field & Activity' },
    { value: 'beneficiary_mismatch',    label: 'Beneficiary Count Mismatch',           group: 'Field & Activity' },
    { value: 'site_visit_unverified',   label: 'Site Visit Not Verified',              group: 'Field & Activity' },
    { value: 'dct_rate_unjustified',    label: 'Daily Rate (DCT) Not Justified',       group: 'Field & Activity' },
    // --- M&E ---
    { value: 'not_in_workplan',         label: 'Activity Not in Approved Work Plan',   group: 'M&E' },
    { value: 'mmp_not_linked',          label: 'Not Linked to Approved MMP',           group: 'M&E' },
    // --- General ---
    { value: 'other',                   label: 'Other',                                group: 'General' },
  ],
  general: [
    { value: 'incomplete_information',  label: 'Incomplete Information',       group: 'General' },
    { value: 'policy_violation',        label: 'Policy Violation',             group: 'General' },
    { value: 'duplicate',               label: 'Duplicate',                    group: 'General' },
    { value: 'not_authorized',          label: 'Not Authorized',               group: 'General' },
    { value: 'other',                   label: 'Other',                        group: 'General' },
  ],
};

export const APPROVAL_REASONS: Record<WorkflowType, RejectionReasonOption[]> = {
  mmp: [
    { value: 'verified_complete',   label: 'Verified & Complete',        group: 'Quality' },
    { value: 'meets_standards',     label: 'Meets Quality Standards',    group: 'Quality' },
    { value: 'permits_confirmed',   label: 'Permits Confirmed',          group: 'Compliance' },
    { value: 'other',               label: 'Other',                      group: 'General' },
  ],
  finance: [
    { value: 'receipts_verified',   label: 'Receipts Verified',          group: 'Financial' },
    { value: 'amounts_match',       label: 'Amounts Match',              group: 'Financial' },
    { value: 'budget_available',    label: 'Budget Available',           group: 'Financial' },
    { value: 'other',               label: 'Other',                      group: 'General' },
  ],
  withdrawal: [
    { value: 'balance_sufficient',  label: 'Balance Sufficient',         group: 'Financial' },
    { value: 'request_valid',       label: 'Request Valid',              group: 'General' },
    { value: 'policy_compliant',    label: 'Policy Compliant',           group: 'Policy' },
    { value: 'other',               label: 'Other',                      group: 'General' },
  ],
  site_visit: [
    { value: 'data_complete',       label: 'Data Complete',              group: 'Field' },
    { value: 'location_verified',   label: 'Location Verified',          group: 'Field' },
    { value: 'quality_acceptable',  label: 'Quality Acceptable',         group: 'Field' },
    { value: 'other',               label: 'Other',                      group: 'General' },
  ],
  cost_submission: [
    // --- Documentation & Finance ---
    { value: 'receipts_verified',         label: 'Receipts / Invoices Verified',           group: 'Documentation & Finance' },
    { value: 'invoices_authenticated',    label: 'Invoices Authenticated',                 group: 'Documentation & Finance' },
    { value: 'amounts_match',             label: 'Amounts Match Supporting Docs',          group: 'Documentation & Finance' },
    { value: 'supporting_docs_complete',  label: 'Supporting Documents Complete',          group: 'Documentation & Finance' },
    { value: 'budget_line_confirmed',     label: 'Budget Line Confirmed & Available',      group: 'Documentation & Finance' },
    // --- Policy & Compliance ---
    { value: 'policy_compliant',          label: 'Policy Compliant',                       group: 'Policy & Compliance' },
    { value: 'within_approved_budget',    label: 'Within Approved Budget',                 group: 'Policy & Compliance' },
    { value: 'donor_guidelines_met',      label: 'Donor Guidelines Met',                  group: 'Policy & Compliance' },
    { value: 'procurement_followed',      label: 'Procurement Rules Followed',             group: 'Policy & Compliance' },
    { value: 'pre_approved_advance',      label: 'Backed by Approved Advance Request',     group: 'Policy & Compliance' },
    // --- Field Operations ---
    { value: 'field_activity_confirmed',  label: 'Field Activity Confirmed',               group: 'Field Operations' },
    { value: 'site_evidence_attached',    label: 'Site Visit Evidence Attached',           group: 'Field Operations' },
    { value: 'beneficiary_count_verified',label: 'Beneficiary Count Verified',             group: 'Field Operations' },
    { value: 'dct_rate_justified',        label: 'Daily Rate (DCT) Justified',             group: 'Field Operations' },
    { value: 'transport_costs_verified',  label: 'Transportation Costs Verified',          group: 'Field Operations' },
    { value: 'field_allowances_verified', label: 'Field Team Allowances Verified',         group: 'Field Operations' },
    { value: 'hub_allocation_covered',    label: 'Hub Allocation Budget Covered',          group: 'Field Operations' },
    // --- M&E / Data Collection ---
    { value: 'linked_to_workplan',        label: 'Activity Linked to Approved Work Plan',  group: 'M&E / Data Collection' },
    { value: 'mmp_coverage_confirmed',    label: 'MMP Coverage Confirmed',                 group: 'M&E / Data Collection' },
    { value: 'enumerator_costs_justified',label: 'Enumerator / DCT Costs Justified',       group: 'M&E / Data Collection' },
    { value: 'output_indicator_supported',label: 'Output / Indicator Supported',           group: 'M&E / Data Collection' },
    { value: 'data_collection_verified',  label: 'Data Collection Activity Verified',      group: 'M&E / Data Collection' },
    // --- Consultancy ---
    { value: 'tor_attached',              label: 'Consultancy ToR Attached',               group: 'Consultancy' },
    { value: 'deliverable_completed',     label: 'Deliverable / Milestone Completed',      group: 'Consultancy' },
    { value: 'contract_rate_applied',     label: 'Contract Rate Correctly Applied',        group: 'Consultancy' },
    { value: 'consultancy_report_submitted', label: 'Consultancy Report Submitted',        group: 'Consultancy' },
    // --- General ---
    { value: 'other',                     label: 'Other',                                  group: 'General' },
  ],
  general: [
    { value: 'reviewed_approved',   label: 'Reviewed & Approved',        group: 'General' },
    { value: 'meets_requirements',  label: 'Meets Requirements',         group: 'General' },
    { value: 'other',               label: 'Other',                      group: 'General' },
  ],
};

/** Group a flat list of options by their `group` field for use with SelectGroup/SelectLabel */
export function groupReasonOptions(options: RejectionReasonOption[]): { group: string; items: RejectionReasonOption[] }[] {
  const hasGroups = options.some(o => o.group);
  if (!hasGroups) return [{ group: '', items: options }];

  const order: string[] = [];
  const map: Record<string, RejectionReasonOption[]> = {};
  for (const opt of options) {
    const g = opt.group ?? 'General';
    if (!map[g]) { map[g] = []; order.push(g); }
    map[g].push(opt);
  }
  return order.map(g => ({ group: g, items: map[g] }));
}

export function getRejectionReasonLabel(value: string, workflowType: WorkflowType = 'general'): string {
  const reasons = REJECTION_REASONS[workflowType];
  const found = reasons.find(r => r.value === value);
  if (found) return found.label;
  const general = REJECTION_REASONS.general.find(r => r.value === value);
  return general?.label || value;
}
