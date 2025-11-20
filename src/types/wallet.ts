export type WalletTransactionType =
  | 'earning'
  | 'adjustment_credit'
  | 'adjustment_debit'
  | 'payout_hold'
  | 'payout_paid'
  | 'reversal'
  | 'correction';

export type WalletTransactionStatus = 'pending' | 'posted' | 'reversed' | 'failed';

export interface WalletTransaction {
  id: string;
  userId: string;
  amountCents: number;
  currency: string;
  type: WalletTransactionType;
  status: WalletTransactionStatus;
  createdAt: string;
  postedAt?: string;
  memo?: string;
  relatedSiteVisitId?: string;
  visitCode?: string;
  siteName?: string;
}

export interface WalletSummary {
  userId: string;
  currency: string;
  balanceCents: number;
  pendingPayoutCents: number;
  totalEarnedCents: number;
  totalPaidOutCents: number;
  lifetimeEarningsCents: number;
  periodEarningsCents: number;
  pendingEarningsCents: number;
  completedEarningsCents: number;
}

export interface PayoutRequest {
  id: string;
  userId: string;
  amountCents: number;
  method: 'bank' | 'mobile_money' | 'manual';
  destination: any;
  status: 'requested' | 'approved' | 'declined' | 'paid' | 'cancelled';
  requestedAt: string;
}

export interface EarningRow {
  siteName: string;
  visitId: string;
  visitCode?: string;
  visitDate?: string;
  earningAmountCents: number;
  status: 'approved' | 'pending' | 'rejected';
}
