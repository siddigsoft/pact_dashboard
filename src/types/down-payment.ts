// Down-Payment Request Types

export type PaymentType = 'full_advance' | 'installments';

export type DownPaymentStatus = 
  | 'pending_supervisor'  // Waiting for hub supervisor approval
  | 'pending_admin'       // Supervisor approved, waiting for admin
  | 'approved'            // Admin approved but not yet paid
  | 'rejected'            // Rejected by supervisor or admin
  | 'partially_paid'      // Some installments paid
  | 'fully_paid'          // All installments paid
  | 'cancelled';          // Cancelled by requester or system

export type SupervisorStatus = 
  | 'pending' 
  | 'approved' 
  | 'rejected' 
  | 'changes_requested';

export type AdminStatus = 
  | 'pending' 
  | 'approved' 
  | 'rejected';

export type ApprovalType = 
  | 'full'           // Approve full requested amount
  | 'half'           // Approve 50% of requested amount
  | 'percentage'     // Approve custom percentage
  | 'custom';        // Approve custom fixed amount

export interface InstallmentPlan {
  amount: number;
  stage: string; // 'before_travel' | 'after_completion' | etc.
  description: string;
  paid: boolean;
  paid_at?: string;
  transaction_id?: string;
}

export interface PaidInstallment {
  amount: number;
  paid_at: string;
  transaction_id: string;
  processed_by: string;
  notes?: string;
}

export interface SupportingDocument {
  fileName: string;
  fileUrl: string;
  uploadedAt: string;
  fileSize?: number;
  fileType?: string;
}

export interface ApprovalAuditEntry {
  id: string;
  action: 'created' | 'supervisor_approved' | 'supervisor_rejected' | 'admin_approved' | 'admin_rejected' | 'payment_processed' | 'amount_modified' | 'cancelled' | 'restored' | 'receipt_confirmed' | 'request_edited';
  performedBy: string;
  performedByName?: string;
  performedByRole?: string;
  timestamp: string;
  previousValue?: any;
  newValue?: any;
  notes?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface DownPaymentRequest {
  id: string;
  
  // Request details
  siteVisitId?: string;
  mmpSiteEntryId?: string;
  siteName: string;
  
  // Geographic information (from related MMP entry)
  stateName?: string;
  localityName?: string;
  projectName?: string;
  activityType?: string;
  
  // Requester information
  requestedBy: string;
  requestedByName?: string;
  requestedAt: string;
  requesterRole: 'dataCollector' | 'coordinator';
  hubId?: string;
  hubName?: string;
  
  // Payment details
  totalTransportationBudget: number;
  requestedAmount: number;
  approvedAmount?: number;  // May differ from requested if partial approval
  approvalType?: ApprovalType;
  approvalPercentage?: number;
  paymentType: PaymentType;
  
  // Installment details
  installmentPlan: InstallmentPlan[];
  paidInstallments: PaidInstallment[];
  
  // Justification
  justification: string;
  supportingDocuments: SupportingDocument[];
  
  // Supervisor approval (TIER 1)
  supervisorId?: string;
  supervisorStatus?: SupervisorStatus;
  supervisorApprovedBy?: string;
  supervisorApprovedByName?: string;
  supervisorApprovedAt?: string;
  supervisorNotes?: string;
  supervisorRejectionReason?: string;
  supervisorApprovedAmount?: number;
  
  // Admin approval (TIER 2)
  adminStatus?: AdminStatus;
  adminProcessedBy?: string;
  adminProcessedByName?: string;
  adminProcessedAt?: string;
  adminNotes?: string;
  adminRejectionReason?: string;
  adminApprovedAmount?: number;
  
  // Payment tracking
  status: DownPaymentStatus;
  totalPaidAmount: number;
  remainingAmount: number;
  
  // Wallet transactions
  walletTransactionIds: string[];
  
  // Audit trail
  auditLog: ApprovalAuditEntry[];
  
  // Audit
  createdAt: string;
  updatedAt: string;
  
  // Metadata
  metadata?: Record<string, any>;
}

export interface CreateDownPaymentRequest {
  siteVisitId?: string;
  mmpSiteEntryId?: string;
  siteName: string;
  requestedBy: string;
  requesterRole: 'dataCollector' | 'coordinator';
  hubId?: string;
  hubName?: string;
  totalTransportationBudget: number;
  requestedAmount: number;
  paymentType: PaymentType;
  installmentPlan?: InstallmentPlan[];
  justification: string;
  supportingDocuments?: SupportingDocument[];
  localityName?: string;
  activityType?: string;
}

export interface ApproveDownPaymentRequest {
  requestId: string;
  approvedBy: string;
  approvedByName?: string;
  notes?: string;
  approvalType?: ApprovalType;
  approvalPercentage?: number;
  customAmount?: number;
}

export interface RejectDownPaymentRequest {
  requestId: string;
  rejectedBy: string;
  rejectedByName?: string;
  rejectionReason: string;
}

export interface ProcessPayment {
  requestId: string;
  installmentIndex?: number; // For installment payments
  amount: number;
  processedBy: string;
  processedByName?: string;
  notes?: string;
}

export interface DownPaymentFilter {
  status?: DownPaymentStatus[];
  hubId?: string;
  stateName?: string;
  localityName?: string;
  siteName?: string;
  activityType?: string;
  dataCollectorId?: string;
  dateFrom?: string;
  dateTo?: string;
  amountMin?: number;
  amountMax?: number;
  searchTerm?: string;
}

export interface DownPaymentReportConfig {
  filters: DownPaymentFilter;
  includeAuditLog: boolean;
  includeSignature: boolean;
  signatureData?: {
    signerName: string;
    signerTitle: string;
    signatureImage?: string;
    stampImage?: string;
    signedAt: string;
  };
  reportTitle?: string;
  reportNotes?: string;
}

export interface BulkApprovalRequest {
  requestIds: string[];
  approvalType: ApprovalType;
  approvalPercentage?: number;
  customAmount?: number;
  notes?: string;
  approvedBy: string;
  approvedByName?: string;
}
