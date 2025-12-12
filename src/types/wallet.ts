export interface Wallet {
  id: string;
  userId: string;
  balances: Record<string, number>;
  totalEarned: number;
  totalWithdrawn: number;
  createdAt: string;
  updatedAt: string;
}

// Transaction types allowed by production Supabase database
export type WalletTransactionType = 
  | 'earning'          // Earnings from completed site visits (current)
  | 'site_visit_fee'   // Legacy: Earnings from completed site visits
  | 'withdrawal'       // Money withdrawn from wallet (negative)
  | 'adjustment'       // Manual admin adjustments (can be +/-)
  | 'bonus'            // Performance rewards (positive)
  | 'penalty';         // Deductions for violations (negative)

export interface WalletTransaction {
  id: string;
  walletId: string;
  userId: string;
  type: WalletTransactionType;
  amount: number;
  currency: string;
  siteVisitId?: string;
  withdrawalRequestId?: string;
  description?: string;
  metadata?: Record<string, any>;
  balanceBefore?: number;
  balanceAfter?: number;
  createdBy?: string;
  createdAt: string;
}

// Two-step withdrawal approval statuses
export type WithdrawalStatus = 
  | 'pending'              // Initial state - awaiting supervisor review
  | 'supervisor_approved'  // Step 1 complete - supervisor approved, awaiting finance
  | 'processing'           // Finance is processing the payment
  | 'approved'             // Final state - payment completed
  | 'rejected'             // Rejected by supervisor or admin
  | 'cancelled';           // Cancelled by user

export interface WithdrawalRequest {
  id: string;
  userId: string;
  walletId: string;
  amount: number;
  currency: string;
  status: WithdrawalStatus;
  requestReason?: string;
  // Step 1: Supervisor approval
  supervisorId?: string;
  supervisorNotes?: string;
  approvedAt?: string;        // When supervisor approved (step 1)
  rejectedAt?: string;
  // Step 2: Admin/Finance processing
  adminProcessedBy?: string;
  adminProcessedAt?: string;
  adminNotes?: string;
  // Payment details
  paymentMethod?: string;
  paymentDetails?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface SiteVisitCost {
  id: string;
  siteVisitId: string;
  transportationCost: number;
  accommodationCost: number;
  mealAllowance: number;
  otherCosts: number;
  totalCost: number;
  currency: string;
  assignedBy?: string;
  adjustedBy?: string;
  adjustmentReason?: string;
  costNotes?: string;
  
  // Classification-based fee information
  classificationLevel?: string;
  roleScope?: string;
  baseFeeCents?: number;
  complexityMultiplier?: number;
  
  createdAt: string;
  updatedAt: string;
}

export interface WalletBalance {
  currency: string;
  balance: number;
}

export interface WalletStats {
  totalEarned: number;
  totalWithdrawn: number;
  pendingWithdrawals: number;
  currentBalance: number;
  totalTransactions: number;
  completedSiteVisits: number;
  // Enhanced stats for earnings summaries
  weeklyEarnings?: number;
  monthlyEarnings?: number;
  weeklySiteVisits?: number;
}

export const SUPPORTED_CURRENCIES = ['SDG', 'USD', 'EUR', 'GBP', 'SAR', 'AED'] as const;
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

export const DEFAULT_CURRENCY = 'SDG';

/**
 * WithdrawalRequest with additional metadata for supervisor-facing views
 * Includes profile data from the requesting user (subordinate)
 */
export interface SupervisedWithdrawalRequest extends WithdrawalRequest {
  requesterName?: string;
  requesterEmail?: string;
  requesterHub?: string;
  requesterState?: string;
  requesterRole?: string;
}

/**
 * WithdrawalRequest with full admin metadata for finance/admin processing
 * Extends SupervisedWithdrawalRequest to ensure requester metadata persists throughout approval chain
 */
export interface AdminWithdrawalRequest extends SupervisedWithdrawalRequest {
  // Inherits all fields from SupervisedWithdrawalRequest including:
  // - All base WithdrawalRequest fields
  // - requesterName, requesterEmail, requesterHub, requesterState, requesterRole
}
