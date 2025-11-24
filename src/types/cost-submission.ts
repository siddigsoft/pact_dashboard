/**
 * Cost Submission Types
 * 
 * Types for the actual cost-based transport fee system with approval workflow.
 * Enumerators submit real costs after site visits, which require admin/finance approval.
 */

export type CostSubmissionStatus = 
  | 'pending'        // Just submitted, awaiting review
  | 'under_review'   // Finance is reviewing
  | 'approved'       // Approved, awaiting payment
  | 'rejected'       // Rejected by finance
  | 'paid'          // Payment processed
  | 'cancelled';     // Cancelled by submitter

export type CostApprovalAction =
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'adjusted'
  | 'paid'
  | 'cancelled';

export interface SupportingDocument {
  url: string;
  type: string; // 'receipt' | 'photo' | 'invoice' | 'other'
  filename: string;
  uploadedAt: string;
  size?: number;
  description?: string;
}

/**
 * Site Visit Cost Submission
 * 
 * Represents an enumerator's submission of actual costs incurred during a site visit.
 * All costs are stored in cents for precision.
 */
export interface SiteVisitCostSubmission {
  id: string;
  siteVisitId: string;
  mmpFileId?: string;
  projectId?: string;

  // Submitter information
  submittedBy: string;
  submittedAt: string;

  // Actual costs (all in cents)
  transportationCostCents: number;
  accommodationCostCents: number;
  mealAllowanceCents: number;
  otherCostsCents: number;
  totalCostCents: number; // Auto-calculated
  currency: string;

  // Cost breakdown details
  transportationDetails?: string;
  accommodationDetails?: string;
  mealDetails?: string;
  otherCostsDetails?: string;
  submissionNotes?: string;

  // Supporting documents
  supportingDocuments: SupportingDocument[];

  // Approval workflow
  status: CostSubmissionStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewerNotes?: string;
  approvalNotes?: string;

  // Payment tracking
  walletTransactionId?: string;
  paidAt?: string;
  paidAmountCents?: number;
  paymentNotes?: string;

  // Classification reference
  classificationLevel?: string;
  roleScope?: string;

  // Metadata
  createdAt: string;
  updatedAt: string;
}

/**
 * Cost Approval History
 * 
 * Audit trail of all approval actions and status changes.
 */
export interface CostApprovalHistory {
  id: string;
  submissionId: string;

  // Action details
  action: CostApprovalAction;
  actorId?: string;
  actorRole?: string;
  actionTimestamp: string;

  // Before/after values
  previousStatus?: string;
  newStatus?: string;
  previousAmountCents?: number;
  newAmountCents?: number;

  // Action justification
  notes?: string;
  changes?: Record<string, any>;

  // Metadata
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

/**
 * Pending Cost Approval (View)
 * 
 * Extended submission info for approval queue display.
 */
export interface PendingCostApproval extends SiteVisitCostSubmission {
  submitterName?: string;
  submitterEmail?: string;
  submitterEmployeeId?: string;
  siteName?: string;
  siteEntryStatus?: string;
  mmpName?: string;
  projectName?: string;
  daysPending: number;
}

/**
 * User Cost Submission Summary (View)
 * 
 * Aggregate statistics for a user's cost submissions.
 */
export interface UserCostSubmissionSummary {
  userId: string;
  totalSubmissions: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  paidCount: number;
  totalApprovedCents: number;
  totalPaidCents: number;
  avgApprovedCents: number;
  lastSubmissionDate?: string;
}

/**
 * MMP Cost Submission Summary (View)
 * 
 * Aggregate cost statistics for an MMP.
 */
export interface MmpCostSubmissionSummary {
  mmpFileId: string;
  totalSubmissions: number;
  pendingSubmissions: number;
  totalApprovedCostCents: number;
  totalPaidCents: number;
  totalTransportCents: number;
  totalAccommodationCents: number;
  totalMealsCents: number;
  avgCostPerSiteCents: number;
}

/**
 * Create Cost Submission Request
 * 
 * Data required to create a new cost submission.
 */
export interface CreateCostSubmissionRequest {
  siteVisitId: string;
  mmpFileId?: string;
  projectId?: string;
  transportationCostCents: number;
  accommodationCostCents: number;
  mealAllowanceCents: number;
  otherCostsCents: number;
  currency?: string;
  transportationDetails?: string;
  accommodationDetails?: string;
  mealDetails?: string;
  otherCostsDetails?: string;
  submissionNotes?: string;
  supportingDocuments?: SupportingDocument[];
  classificationLevel?: string;
  roleScope?: string;
}

/**
 * Update Cost Submission Request
 * 
 * Data for updating an existing submission (only editable while pending).
 */
export interface UpdateCostSubmissionRequest {
  transportationCostCents?: number;
  accommodationCostCents?: number;
  mealAllowanceCents?: number;
  otherCostsCents?: number;
  transportationDetails?: string;
  accommodationDetails?: string;
  mealDetails?: string;
  otherCostsDetails?: string;
  submissionNotes?: string;
  supportingDocuments?: SupportingDocument[];
}

/**
 * Approve/Reject Cost Submission Request
 * 
 * Data for finance approval or rejection.
 */
export interface ReviewCostSubmissionRequest {
  submissionId: string;
  action: 'approve' | 'reject' | 'request_revision';
  reviewerNotes?: string;
  approvalNotes?: string;
  adjustedAmountCents?: number; // If adjusting the approved amount
  paymentNotes?: string;
}

/**
 * Cost Submission with Related Data
 * 
 * Extended submission with submitter and site visit details.
 */
export interface EnrichedCostSubmission extends SiteVisitCostSubmission {
  submitter?: {
    id: string;
    fullName?: string;
    email?: string;
    employeeId?: string;
    avatar?: string;
  };
  reviewer?: {
    id: string;
    fullName?: string;
    email?: string;
  };
  siteEntry?: {
    id: string;
    siteName: string;
    siteCode?: string;
    status: string;
    locality?: string;
    state?: string;
    completedAt?: string;
  };
  mmp?: {
    id: string;
    name: string;
    mmpId?: string;
  };
  project?: {
    id: string;
    name: string;
  };
  history?: CostApprovalHistory[];
}

/**
 * Cost Submission Filters
 * 
 * Filtering options for cost submission queries.
 */
export interface CostSubmissionFilters {
  status?: CostSubmissionStatus | CostSubmissionStatus[];
  submittedBy?: string;
  reviewedBy?: string;
  mmpFileId?: string;
  projectId?: string;
  dateFrom?: string;
  dateTo?: string;
  minAmount?: number;
  maxAmount?: number;
  classificationLevel?: string;
  roleScope?: string;
}

/**
 * Cost Submission Statistics
 * 
 * Overall statistics for cost submissions.
 */
export interface CostSubmissionStatistics {
  totalSubmissions: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  paidCount: number;
  totalPendingCents: number;
  totalApprovedCents: number;
  totalPaidCents: number;
  avgApprovalTimeDays: number;
  avgCostPerSubmissionCents: number;
  approvalRate: number; // Percentage
  rejectionRate: number; // Percentage
}
