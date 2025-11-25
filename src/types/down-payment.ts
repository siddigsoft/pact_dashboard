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

export interface DownPaymentRequest {
  id: string;
  
  // Request details
  siteVisitId?: string;
  mmpSiteEntryId?: string;
  siteName: string;
  
  // Requester information
  requestedBy: string;
  requestedAt: string;
  requesterRole: 'dataCollector' | 'coordinator';
  hubId?: string;
  hubName?: string;
  
  // Payment details
  totalTransportationBudget: number;
  requestedAmount: number;
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
  supervisorApprovedAt?: string;
  supervisorNotes?: string;
  supervisorRejectionReason?: string;
  
  // Admin approval (TIER 2)
  adminStatus?: AdminStatus;
  adminProcessedBy?: string;
  adminProcessedAt?: string;
  adminNotes?: string;
  adminRejectionReason?: string;
  
  // Payment tracking
  status: DownPaymentStatus;
  totalPaidAmount: number;
  remainingAmount: number;
  
  // Wallet transactions
  walletTransactionIds: string[];
  
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
}

export interface ApproveDownPaymentRequest {
  requestId: string;
  approvedBy: string;
  notes?: string;
}

export interface RejectDownPaymentRequest {
  requestId: string;
  rejectedBy: string;
  rejectionReason: string;
}

export interface ProcessPayment {
  requestId: string;
  installmentIndex?: number; // For installment payments
  amount: number;
  processedBy: string;
  notes?: string;
}
