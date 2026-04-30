/**
 * Cost Submission Types
 * 
 * Enhanced two-phase cost submission workflow supporting:
 * - ADVANCE PAYMENTS: Request → Approve → Disburse → Reconcile → Close
 * - REIMBURSEMENTS: Request with Receipts → Approve → Pay → Close
 * 
 * Features project and budget line integration for financial tracking.
 * Extended to support Operational Cost Submissions for FOM/Coordinators.
 */

// Request type distinguishes advance payments from reimbursements
export type CostRequestType = 'advance' | 'reimbursement';

export type CostSubmissionStatus = 
  | 'pending'                    // Just submitted, awaiting review
  | 'under_review'               // Finance is reviewing
  | 'approved'                   // Approved, awaiting payment/disbursement
  | 'rejected'                   // Rejected by finance
  | 'disbursed'                  // Money sent to requester (advance only) - BALANCE OPEN
  | 'reconciliation_pending'     // User submitted receipts, awaiting verification
  | 'reconciled'                 // Receipts verified, balance settled
  | 'paid'                       // Payment processed (reimbursement complete)
  | 'closed'                     // Final state - fully reconciled
  | 'cancelled';                 // Cancelled by submitter

// Balance status for advance payments
export type BalanceStatus = 
  | 'not_applicable'   // Reimbursement - no balance tracking
  | 'open'             // Money disbursed, awaiting reconciliation
  | 'settled'          // Exact amount spent
  | 'underspent'       // Spent less than received, returning balance
  | 'overspent';       // Spent more than received, needs top-up

export const COST_REQUEST_TYPE_LABELS: Record<CostRequestType, { en: string; ar: string }> = {
  advance: { en: 'Advance Payment', ar: 'دفعة مقدمة' },
  reimbursement: { en: 'Reimbursement', ar: 'استرداد' },
};

export const BALANCE_STATUS_LABELS: Record<BalanceStatus, { en: string; ar: string }> = {
  not_applicable: { en: 'N/A', ar: 'غير قابل للتطبيق' },
  open: { en: 'Open Balance', ar: 'رصيد مفتوح' },
  settled: { en: 'Settled', ar: 'تمت التسوية' },
  underspent: { en: 'Underspent', ar: 'إنفاق أقل' },
  overspent: { en: 'Overspent', ar: 'إنفاق زائد' },
};

// Two-tier approval status for operational costs
export type TierOneApprovalStatus = 
  | 'pending'        // Waiting for Tier 1 (Supervisor/FOM) review
  | 'approved'       // Tier 1 approved, moves to Tier 2
  | 'rejected'       // Tier 1 rejected
  | 'changes_requested'; // Tier 1 requested changes

export type TierTwoApprovalStatus = 
  | 'pending'        // Waiting for Tier 2 (Admin) review
  | 'approved'       // Tier 2 approved, ready for payment
  | 'rejected';      // Tier 2 rejected

export type CostApprovalAction =
  | 'submitted'
  | 'under_review'
  | 'tier1_approved'
  | 'tier1_rejected'
  | 'tier2_approved'
  | 'tier2_rejected'
  | 'approved'
  | 'rejected'
  | 'adjusted'
  | 'paid'
  | 'cancelled';

// Submission types to distinguish site visit costs from operational costs
export type CostSubmissionType = 
  | 'site_visit'      // Data Collector site visit expenses
  | 'operational';    // FOM/Coordinator operational expenses

// Operational expense categories (for FOM/Coordinators)
export type OperationalExpenseCategory =
  | 'permits'              // Locality permits, access permissions
  | 'incentives'           // Team incentives, bonuses
  | 'communications'       // Phone credit, internet, SIM cards
  | 'training'             // Workshops, materials, venue
  | 'general_transport'    // Office travel, hub visits (NOT site visit transport)
  | 'equipment'            // Field equipment, supplies
  | 'printing'             // Forms, reports, materials
  | 'meetings'             // Venue, refreshments
  | 'other';               // Any other operational cost

export const OPERATIONAL_EXPENSE_LABELS: Record<OperationalExpenseCategory, { en: string; ar: string }> = {
  permits: { en: 'Permits', ar: 'التصاريح' },
  incentives: { en: 'Incentives', ar: 'الحوافز' },
  communications: { en: 'Communications', ar: 'الاتصالات' },
  training: { en: 'Training', ar: 'التدريب' },
  general_transport: { en: 'General Transportation', ar: 'النقل العام' },
  equipment: { en: 'Equipment & Supplies', ar: 'المعدات واللوازم' },
  printing: { en: 'Printing & Materials', ar: 'الطباعة والمواد' },
  meetings: { en: 'Meetings & Events', ar: 'الاجتماعات والفعاليات' },
  other: { en: 'Other', ar: 'أخرى' },
};

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
   fund_receipt_confirmed?: boolean | null;

   // Classification reference
  classificationLevel?: string;
  roleScope?: string;

  // Metadata
  createdAt: string;
  updatedAt: string;
}

/**
 * Operational Cost Submission
 * 
 * Represents a FOM/Coordinator's submission of operational expenses.
 * These are NOT tied to specific site visits - they cover permits, training, communications, etc.
 * Uses two-tier approval: Supervisor/FOM approves first, then Admin approves.
 */
export interface OperationalCostSubmission {
  id: string;
  submissionType: 'operational';
  
  // Expense category
  expenseCategory: OperationalExpenseCategory;
  
  // Optional linkage (can be standalone or linked to hub/project/mmp)
  hubId?: string;
  projectId?: string;
  mmpFileId?: string;
  
  // Submitter information
  submittedBy: string;
  submittedAt: string;
  submitterRole: string; // 'FOM' | 'Coordinator'
  
  // Cost details (in cents)
  amountCents: number;
  currency: string;
  
  // Expense details
  description: string;
  expenseDate: string; // When the expense occurred
  vendor?: string; // Vendor/supplier name
  referenceNumber?: string; // Invoice/receipt number
  
  // Supporting documents
  supportingDocuments: SupportingDocument[];
  
  // Two-tier approval workflow
  status: CostSubmissionStatus;
  
  // Tier 1 - Supervisor/FOM approval
  tier1Status: TierOneApprovalStatus;
  tier1ReviewedBy?: string;
  tier1ReviewedAt?: string;
  tier1Notes?: string;
  
  // Tier 2 - Admin approval
  tier2Status: TierTwoApprovalStatus;
  tier2ReviewedBy?: string;
  tier2ReviewedAt?: string;
  tier2Notes?: string;
  
  // Payment tracking
  walletTransactionId?: string;
  paidAt?: string;
  paidAmountCents?: number;
  paymentNotes?: string;
  
  // Metadata
  createdAt: string;
  updatedAt: string;
}

/**
 * Create Operational Cost Submission Request
 */
export interface CreateOperationalCostRequest {
  expenseCategory: OperationalExpenseCategory;
  hubId?: string;
  projectId?: string;
  mmpFileId?: string;
  amountCents: number;
  currency?: string;
  description: string;
  expenseDate: string;
  vendor?: string;
  referenceNumber?: string;
  supportingDocuments?: SupportingDocument[];
}

/**
 * Review Operational Cost Request (for approvers)
 */
export interface ReviewOperationalCostRequest {
  submissionId: string;
  tier: 1 | 2; // Which tier is reviewing
  action: 'approve' | 'reject' | 'request_changes';
  notes?: string;
  adjustedAmountCents?: number;
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

// ============================================================
// ENHANCED TWO-PHASE COST REQUEST SYSTEM
// ============================================================

/**
 * Budget Line Categories for Cost Requests
 * Links expenses to specific budget categories for tracking
 */
export type BudgetLineCategory = 
  | 'transportation_and_visit_fees'
  | 'permit_fee'
  | 'internet_and_communication_fees'
  | 'training_and_capacity_building'
  | 'equipment_and_supplies'
  | 'office_and_admin'
  | 'personnel_allowances'
  | 'other';

export const BUDGET_LINE_LABELS: Record<BudgetLineCategory, { en: string; ar: string }> = {
  transportation_and_visit_fees: { en: 'Transportation & Visit Fees', ar: 'رسوم النقل والزيارة' },
  permit_fee: { en: 'Permit Fees', ar: 'رسوم التصاريح' },
  internet_and_communication_fees: { en: 'Internet & Communications', ar: 'الإنترنت والاتصالات' },
  training_and_capacity_building: { en: 'Training & Capacity Building', ar: 'التدريب وبناء القدرات' },
  equipment_and_supplies: { en: 'Equipment & Supplies', ar: 'المعدات واللوازم' },
  office_and_admin: { en: 'Office & Admin', ar: 'المكتب والإدارة' },
  personnel_allowances: { en: 'Personnel Allowances', ar: 'بدلات الموظفين' },
  other: { en: 'Other', ar: 'أخرى' },
};

/**
 * Enhanced Cost Request
 * 
 * Two-phase workflow:
 * - ADVANCE: Request → Approve → Disburse → [User Spends] → Upload Receipts → Reconcile → Close
 * - REIMBURSEMENT: Request + Receipts → Approve → Pay → Close
 */
export interface EnhancedCostRequest {
  id: string;
  
  // Request Type
  requestType: CostRequestType;
  
  // Project & Budget Linking (REQUIRED)
  projectId: string;
  projectName?: string;
  budgetLineCategory: BudgetLineCategory;
  budgetLineId?: string;
  
  // Submitter Information
  submittedBy: string;
  submitterName?: string;
  submitterRole?: string;
  submittedAt: string;
  
  // Request Details
  requestedAmountCents: number;
  currency: string;
  title: string;
  description: string;
  justification: string;
  
  // Phase 1: Justification Documents (quotes, estimates, approvals)
  justificationDocuments: SupportingDocument[];
  
  // Approval Workflow
  status: CostSubmissionStatus;
  
  // Tier 1 Approval (Supervisor/FOM)
  tier1Status: TierOneApprovalStatus;
  tier1ReviewedBy?: string;
  tier1ReviewedAt?: string;
  tier1Notes?: string;
  
  // Tier 2 Approval (Admin)
  tier2Status: TierTwoApprovalStatus;
  tier2ReviewedBy?: string;
  tier2ReviewedAt?: string;
  tier2Notes?: string;
  approvedAmountCents?: number;
  
  // Disbursement (Advance Payments Only)
  disbursedAmountCents?: number;
  disbursedAt?: string;
  disbursedBy?: string;
  disbursementMethod?: 'bank_transfer' | 'cash' | 'mobile_money' | 'wallet';
  disbursementReference?: string;
  
  // Balance Tracking (Advance Payments Only)
  balanceStatus: BalanceStatus;
  balanceCents?: number;
  
  // Phase 2: Reconciliation (Advance) / Receipts (Reimbursement)
  actualSpentCents?: number;
  reconciliationDocuments: SupportingDocument[];
  reconciliationNotes?: string;
  reconciliationSubmittedAt?: string;
  
  // Reconciliation Review
  reconciledBy?: string;
  reconciledAt?: string;
  reconciliationVerified?: boolean;
  balanceReturnedCents?: number;
  additionalPaymentCents?: number;
  
  // Final Payment (Reimbursement) / Top-up (Overspent Advance)
  paidAmountCents?: number;
  paidAt?: string;
  paidBy?: string;
  paymentMethod?: 'bank_transfer' | 'cash' | 'mobile_money' | 'wallet';
  paymentReference?: string;
  
  // Optional Linkages
  hubId?: string;
  mmpFileId?: string;
  siteVisitId?: string;
  
  // Audit & Metadata
  walletTransactionId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Create Enhanced Cost Request
 */
export interface CreateEnhancedCostRequest {
  requestType: CostRequestType;
  projectId: string;
  budgetLineCategory: BudgetLineCategory;
  requestedAmountCents: number;
  currency?: string;
  title: string;
  description: string;
  justification: string;
  justificationDocuments?: SupportingDocument[];
  reconciliationDocuments?: SupportingDocument[];
  hubId?: string;
  mmpFileId?: string;
  siteVisitId?: string;
}

/**
 * Submit Reconciliation Request
 */
export interface SubmitReconciliationRequest {
  requestId: string;
  actualSpentCents: number;
  reconciliationDocuments: SupportingDocument[];
  reconciliationNotes?: string;
}

/**
 * Review Enhanced Cost Request
 */
export interface ReviewEnhancedCostRequest {
  requestId: string;
  tier: 1 | 2;
  action: 'approve' | 'reject' | 'request_changes';
  notes?: string;
  adjustedAmountCents?: number;
}

/**
 * Disburse Funds Request (Admin/Finance)
 */
export interface DisburseFundsRequest {
  requestId: string;
  disbursedAmountCents: number;
  disbursementMethod: 'bank_transfer' | 'cash' | 'mobile_money' | 'wallet';
  disbursementReference?: string;
  notes?: string;
}

/**
 * Verify Reconciliation Request (Admin/Finance)
 */
export interface VerifyReconciliationRequest {
  requestId: string;
  verified: boolean;
  notes?: string;
  balanceReturnedCents?: number;
  additionalPaymentCents?: number;
}

/**
 * Enriched Cost Request with related data
 */
export interface EnrichedCostRequest extends EnhancedCostRequest {
  submitter?: {
    id: string;
    fullName?: string;
    email?: string;
    avatar?: string;
  };
  project?: {
    id: string;
    name: string;
    budgetRemaining?: number;
  };
  budgetLine?: {
    category: BudgetLineCategory;
    allocated: number;
    spent: number;
    remaining: number;
  };
  history?: CostApprovalHistory[];
}

/**
 * Cost Request Filters
 */
export interface CostRequestFilters {
  requestType?: CostRequestType;
  status?: CostSubmissionStatus | CostSubmissionStatus[];
  balanceStatus?: BalanceStatus;
  submittedBy?: string;
  projectId?: string;
  budgetLineCategory?: BudgetLineCategory;
  dateFrom?: string;
  dateTo?: string;
  minAmount?: number;
  maxAmount?: number;
  requiresReconciliation?: boolean;
}

/**
 * Outstanding Advances Summary
 * For tracking open balances that need reconciliation
 */
export interface OutstandingAdvancesSummary {
  totalOpenAdvances: number;
  totalDisbursedCents: number;
  totalReconciledCents: number;
  totalOpenBalanceCents: number;
  overdueCount: number;
  byUser: Array<{
    userId: string;
    userName: string;
    openCount: number;
    totalOpenCents: number;
    oldestDisbursementDate?: string;
  }>;
  byProject: Array<{
    projectId: string;
    projectName: string;
    openCount: number;
    totalOpenCents: number;
  }>;
}

/**
 * Cost Report Data for Export
 */
export interface CostReportData {
  id: string;
  requestType: CostRequestType;
  title: string;
  projectName: string;
  budgetLine: string;
  submitterName: string;
  requestedAmount: number;
  approvedAmount?: number;
  disbursedAmount?: number;
  actualSpent?: number;
  balance?: number;
  status: string;
  balanceStatus: string;
  submittedDate: string;
  approvedDate?: string;
  disbursedDate?: string;
  reconciledDate?: string;
  currency: string;
}
