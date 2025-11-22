export interface Wallet {
  id: string;
  userId: string;
  balances: Record<string, number>;
  totalEarned: number;
  totalWithdrawn: number;
  createdAt: string;
  updatedAt: string;
}

export type WalletTransactionType = 
  | 'site_visit_fee' 
  | 'withdrawal' 
  | 'adjustment' 
  | 'bonus' 
  | 'penalty';

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

export type WithdrawalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface WithdrawalRequest {
  id: string;
  userId: string;
  walletId: string;
  amount: number;
  currency: string;
  status: WithdrawalStatus;
  requestReason?: string;
  supervisorId?: string;
  supervisorNotes?: string;
  approvedAt?: string;
  rejectedAt?: string;
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
}

export const SUPPORTED_CURRENCIES = ['SDG', 'USD', 'EUR', 'GBP', 'SAR', 'AED'] as const;
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

export const DEFAULT_CURRENCY = 'SDG';
