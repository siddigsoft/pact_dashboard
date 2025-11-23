/**
 * Adapter for snake_case to camelCase transformation of cost submission data
 * Maps Supabase database responses to TypeScript interfaces
 */

import {
  SiteVisitCostSubmission,
  CostApprovalHistory,
  PendingCostApproval,
  UserCostSubmissionSummary,
  MmpCostSubmissionSummary,
  CostSubmissionStatus,
  CostApprovalAction,
  SupportingDocument
} from '@/types/cost-submission';

/**
 * Database row from site_visit_cost_submissions table
 */
interface DBCostSubmission {
  id: string;
  site_visit_id: string;
  mmp_file_id?: string;
  project_id?: string;
  submitted_by: string;
  submitted_at: string;
  transportation_cost_cents: number;
  accommodation_cost_cents: number;
  meal_allowance_cents: number;
  other_costs_cents: number;
  total_cost_cents: number;
  transportation_details?: string;
  accommodation_details?: string;
  meal_details?: string;
  other_details?: string;
  supporting_documents?: any; // JSONB array of {url, type, filename, uploadedAt}
  submission_notes?: string;
  status: string;
  reviewed_by?: string;
  reviewed_at?: string;
  reviewer_notes?: string;
  approval_notes?: string;
  wallet_transaction_id?: string;
  paid_at?: string;
  paid_amount_cents?: number;
  payment_notes?: string;
  classification_level?: string;
  role_scope?: string;
  currency: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Database row from cost_approval_history table
 */
interface DBCostApprovalHistory {
  id: string;
  submission_id: string;
  action: string; // submitted, under_review, approved, rejected, adjusted, paid, cancelled
  actor_id?: string;
  actor_role?: string;
  action_timestamp: string;
  previous_status?: string;
  new_status?: string;
  previous_amount_cents?: number;
  new_amount_cents?: number;
  notes?: string;
  changes?: any;
  created_at?: string;
}

/**
 * Database row from pending_cost_approvals view
 */
interface DBPendingCostApproval extends DBCostSubmission {
  submitter_name?: string;
  submitter_email?: string;
  submitter_employee_id?: string;
  site_name?: string;
  site_entry_status?: string;
  mmp_name?: string;
  project_name?: string;
  days_pending: number;
}

/**
 * Database row from user_cost_submission_summary view
 */
interface DBUserCostSummary {
  user_id: string;
  full_name?: string;
  employee_id?: string;
  total_submissions: number;
  pending_count: number;
  approved_count: number;
  rejected_count: number;
  total_approved_amount_cents: number;
  total_paid_amount_cents: number;
  currency: string;
  last_submission_at?: string;
}

/**
 * Database row from mmp_cost_submission_summary view
 */
interface DBMMPCostSummary {
  mmp_file_id: string;
  mmp_name?: string;
  project_name?: string;
  total_submissions: number;
  pending_count: number;
  approved_count: number;
  rejected_count: number;
  total_submitted_cents: number;
  total_approved_cents: number;
  total_paid_cents: number;
  currency: string;
  first_submission_at?: string;
  last_submission_at?: string;
}

/**
 * Maps database status string to TypeScript type
 */
const mapStatus = (status: string): CostSubmissionStatus => {
  const validStatuses: CostSubmissionStatus[] = ['pending', 'under_review', 'approved', 'rejected', 'paid', 'cancelled'];
  return validStatuses.includes(status as CostSubmissionStatus) ? status as CostSubmissionStatus : 'pending';
};

/**
 * Maps database action string to TypeScript type
 */
const mapAction = (action: string): CostApprovalAction => {
  const validActions: CostApprovalAction[] = ['submitted', 'under_review', 'approved', 'rejected', 'adjusted', 'paid', 'cancelled'];
  return validActions.includes(action as CostApprovalAction) ? action as CostApprovalAction : 'submitted';
};

/**
 * Maps JSONB supporting documents to TypeScript type
 */
const mapSupportingDocuments = (docs: any): SupportingDocument[] => {
  if (!docs || !Array.isArray(docs)) return [];
  
  return docs.map((doc: any) => ({
    url: doc.url || '',
    type: doc.type || 'other',
    filename: doc.filename || 'document',
    uploadedAt: doc.uploadedAt || doc.uploaded_at || new Date().toISOString(),
    size: doc.size,
    description: doc.description
  }));
};

/**
 * Transforms database cost submission to frontend format
 */
export const mapDBCostSubmissionToFrontend = (
  db: DBCostSubmission
): SiteVisitCostSubmission => {
  return {
    id: db.id,
    siteVisitId: db.site_visit_id,
    mmpFileId: db.mmp_file_id,
    projectId: db.project_id,
    submittedBy: db.submitted_by,
    submittedAt: db.submitted_at,
    transportationCostCents: db.transportation_cost_cents,
    accommodationCostCents: db.accommodation_cost_cents,
    mealAllowanceCents: db.meal_allowance_cents,
    otherCostsCents: db.other_costs_cents,
    totalCostCents: db.total_cost_cents,
    currency: db.currency || 'SDG',
    transportationDetails: db.transportation_details,
    accommodationDetails: db.accommodation_details,
    mealDetails: db.meal_details,
    otherCostsDetails: db.other_details,
    submissionNotes: db.submission_notes,
    supportingDocuments: mapSupportingDocuments(db.supporting_documents),
    status: mapStatus(db.status),
    reviewedBy: db.reviewed_by,
    reviewedAt: db.reviewed_at,
    reviewerNotes: db.reviewer_notes,
    approvalNotes: db.approval_notes,
    walletTransactionId: db.wallet_transaction_id,
    paidAt: db.paid_at,
    paidAmountCents: db.paid_amount_cents,
    paymentNotes: db.payment_notes,
    classificationLevel: db.classification_level,
    roleScope: db.role_scope,
    createdAt: db.created_at || new Date().toISOString(),
    updatedAt: db.updated_at || new Date().toISOString()
  };
};

/**
 * Transforms database history entry to frontend format
 */
export const mapDBHistoryToFrontend = (
  db: DBCostApprovalHistory
): CostApprovalHistory => {
  return {
    id: db.id,
    submissionId: db.submission_id,
    action: mapAction(db.action), // Use explicit action column, not derived from status
    actorId: db.actor_id,
    actorRole: db.actor_role,
    actionTimestamp: db.action_timestamp,
    previousStatus: db.previous_status,
    newStatus: db.new_status,
    previousAmountCents: db.previous_amount_cents,
    newAmountCents: db.new_amount_cents,
    notes: db.notes,
    changes: db.changes,
    createdAt: db.created_at || db.action_timestamp
  };
};

/**
 * Transforms pending approval view row to frontend format
 */
export const mapDBPendingApprovalToFrontend = (
  db: DBPendingCostApproval
): PendingCostApproval => {
  return {
    ...mapDBCostSubmissionToFrontend(db),
    submitterName: db.submitter_name,
    submitterEmail: db.submitter_email,
    submitterEmployeeId: db.submitter_employee_id,
    siteName: db.site_name,
    siteEntryStatus: db.site_entry_status,
    mmpName: db.mmp_name,
    projectName: db.project_name,
    daysPending: db.days_pending
  };
};

/**
 * Transforms user summary view row to frontend format
 */
export const mapDBUserSummaryToFrontend = (
  db: DBUserCostSummary
): UserCostSubmissionSummary => {
  return {
    userId: db.user_id,
    totalSubmissions: db.total_submissions,
    pendingCount: db.pending_count,
    approvedCount: db.approved_count,
    rejectedCount: db.rejected_count,
    paidCount: 0, // Not in view, calculate separately if needed
    totalApprovedCents: db.total_approved_amount_cents,
    totalPaidCents: db.total_paid_amount_cents,
    avgApprovedCents: db.approved_count > 0 ? Math.round(db.total_approved_amount_cents / db.approved_count) : 0,
    lastSubmissionDate: db.last_submission_at
  };
};

/**
 * Transforms MMP summary view row to frontend format
 */
export const mapDBMMPSummaryToFrontend = (
  db: DBMMPCostSummary
): MmpCostSubmissionSummary => {
  return {
    mmpFileId: db.mmp_file_id,
    totalSubmissions: db.total_submissions,
    pendingSubmissions: db.pending_count,
    totalApprovedCostCents: db.total_approved_cents,
    totalPaidCents: db.total_paid_cents,
    totalTransportCents: 0, // Not in view, calculate separately if needed
    totalAccommodationCents: 0, // Not in view
    totalMealsCents: 0, // Not in view
    avgCostPerSiteCents: db.total_submissions > 0 ? Math.round(db.total_submitted_cents / db.total_submissions) : 0
  };
};
