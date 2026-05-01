import { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/context/user/UserContext';
import { ensureValidSession } from '@/lib/session-health';
import { withTimeout } from '@/utils/promise-with-timeout';
import { useClassification } from '@/context/classification/ClassificationContext';
import { NotificationTriggerService } from '@/services/NotificationTriggerService';
import { createSiteVisitWalletTransaction } from '@/utils/wallet-transactions';
import {
  useWalletQuery,
  useTransactionsQuery,
  useWithdrawalRequestsQuery,
  useSupervisedWithdrawalRequestsQuery,
  useDisbursedAdvanceRequestIdsQuery,
  useInvalidateWalletQueries,
  walletQueryKeys,
  type UserForWallet,
} from './walletQueries';
import type {
  Wallet,
  WalletTransaction,
  WithdrawalRequest,
  SiteVisitCost,
  WalletStats,
  SupervisedWithdrawalRequest,
  AdminWithdrawalRequest,
} from '@/types/wallet';

interface WalletContextType {
  wallet: Wallet | null;
  transactions: WalletTransaction[];
  withdrawalRequests: WithdrawalRequest[];
  supervisedWithdrawalRequests: SupervisedWithdrawalRequest[];
  stats: WalletStats | null;
  loading: boolean;
  lastRefresh: Date;
  refreshWallet: () => Promise<void>;
  refreshTransactions: () => Promise<void>;
  refreshWithdrawalRequests: () => Promise<void>;
  refreshSupervisedWithdrawalRequests: () => Promise<void>;
  createWithdrawalRequest: (amount: number, reason: string, paymentMethod?: string) => Promise<void>;
  cancelWithdrawalRequest: (requestId: string) => Promise<void>;
  // Step 1: Supervisor approval (changes status to 'supervisor_approved')
  approveWithdrawalRequest: (requestId: string, notes?: string) => Promise<void>;
  rejectWithdrawalRequest: (requestId: string, notes: string) => Promise<void>;
  // Step 2: Admin/Finance processing (changes status to 'approved' and releases funds)
  adminProcessWithdrawal: (requestId: string, notes?: string) => Promise<void>;
  adminRejectWithdrawal: (requestId: string, notes: string) => Promise<void>;
  getBalance: (currency?: string) => number;
  getSiteVisitCost: (siteVisitId: string) => Promise<SiteVisitCost | null>;
  assignSiteVisitCost: (siteVisitId: string, costs: Partial<SiteVisitCost>) => Promise<void>;
  updateSiteVisitCost: (costId: string, costs: Partial<SiteVisitCost>) => Promise<void>;
  addSiteVisitFeeToWallet: (userId: string, siteVisitId: string, complexityMultiplier?: number) => Promise<void>;
  calculateClassificationFee: (userId: string, complexityMultiplier?: number) => Promise<number>;
  processMonthlyRetainers: () => Promise<{ processed: number; failed: number; total: number }>;
  addRetainerToWallet: (userId: string, amountCents: number, currency: string, period: string) => Promise<void>;
  listWallets: () => Promise<Wallet[]>;
  adminAdjustBalance: (userId: string, amount: number, currency: string, reason: string, adjustmentType: 'credit' | 'debit') => Promise<void>;
  adminListWithdrawalRequests: () => Promise<AdminWithdrawalRequest[]>;
  listSupervisedWithdrawalRequests: () => Promise<SupervisedWithdrawalRequest[]>;
  reconcileSiteVisitFee: (siteVisitId: string) => Promise<{ success: boolean; message: string }>;
  confirmFundReceipt: (requestId: string, signatureData: { signatureId: string; signatureHash: string; signatureMethod: string; signedAt: string; notes?: string }) => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

function transformWalletFromDB(data: any): Wallet {
  // Parse balances - handle both object and string formats
  let balances = data.balances || { SDG: 0 };
  if (typeof balances === 'string') {
    try {
      balances = JSON.parse(balances);
    } catch (e) {
      console.error('[Wallet] Failed to parse balances string:', e);
      balances = { SDG: 0 };
    }
  }
  
  // Ensure SDG balance is a number
  if (balances.SDG !== undefined) {
    balances.SDG = Number(balances.SDG) || 0;
  }
  
  return {
    id: data.id,
    userId: data.user_id,
    balances: balances,
    totalEarned: parseFloat(data.total_earned || 0),
    totalWithdrawn: parseFloat(data.total_withdrawn || 0),
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

function transformTransactionFromDB(data: any): WalletTransaction {
  return {
    id: data.id,
    walletId: data.wallet_id,
    userId: data.user_id,
    type: data.type,
    amount: parseFloat(data.amount),
    currency: data.currency,
    siteVisitId: data.site_visit_id,
    withdrawalRequestId: data.withdrawal_request_id,
    description: data.description,
    metadata: data.metadata,
    balanceBefore: data.balance_before ? parseFloat(data.balance_before) : undefined,
    balanceAfter: data.balance_after ? parseFloat(data.balance_after) : undefined,
    createdBy: data.created_by,
    createdAt: data.created_at,
  };
}

function transformWithdrawalRequestFromDB(data: any): WithdrawalRequest {
  return {
    id: data.id,
    userId: data.user_id,
    walletId: data.wallet_id,
    amount: parseFloat(data.amount),
    currency: data.currency,
    status: data.status,
    requestReason: data.request_reason,
    supervisorId: data.supervisor_id,
    supervisorNotes: data.supervisor_notes,
    approvedAt: data.approved_at,
    rejectedAt: data.rejected_at,
    adminProcessedBy: data.admin_processed_by,
    adminProcessedAt: data.admin_processed_at,
    adminNotes: data.admin_notes,
    paymentMethod: data.payment_method,
    paymentDetails: data.payment_details,
    fundReceiptConfirmed: data.fund_receipt_confirmed || false,
    fundReceiptConfirmedAt: data.fund_receipt_confirmed_at,
    fundReceiptSignatureUrl: data.fund_receipt_signature_url,
    fundReceiptNotes: data.fund_receipt_notes,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

function transformSiteVisitCostFromDB(data: any): SiteVisitCost {
  return {
    id: data.id,
    siteVisitId: data.site_visit_id,
    transportationCost: parseFloat(data.transportation_cost || 0),
    accommodationCost: parseFloat(data.accommodation_cost || 0),
    mealAllowance: parseFloat(data.meal_allowance || 0),
    otherCosts: parseFloat(data.other_costs || 0),
    totalCost: parseFloat(data.total_cost || 0),
    currency: data.currency,
    assignedBy: data.assigned_by,
    adjustedBy: data.adjusted_by,
    adjustmentReason: data.adjustment_reason,
    costNotes: data.cost_notes,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

// Module-level Set to track in-flight fee additions and prevent race conditions
const pendingFeeAdditions = new Set<string>();

export function WalletProvider({ children }: { children: ReactNode }) {
  const { currentUser, authReady } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateWalletQueries();
  const { getUserClassification, getActiveFeeStructure } = useClassification();

  const userId = currentUser?.id;
  const userForSupervised: UserForWallet | null = currentUser
    ? { id: currentUser.id, hubId: currentUser.hubId, secondaryHubId: currentUser.secondaryHubId, stateId: currentUser.stateId, role: currentUser.role }
    : null;

  const walletQuery = useWalletQuery(userId);
  const transactionsQuery = useTransactionsQuery(userId);
  const withdrawalRequestsQuery = useWithdrawalRequestsQuery(userId);
  const supervisedQuery = useSupervisedWithdrawalRequestsQuery(userForSupervised);
  const disbursedAdvanceIdsQuery = useDisbursedAdvanceRequestIdsQuery(userId);

  const wallet = walletQuery.data ?? null;
  const transactions = transactionsQuery.data ?? [];
  const withdrawalRequests = withdrawalRequestsQuery.data ?? [];
  const supervisedWithdrawalRequests = supervisedQuery.data ?? [];
  const disbursedAdvanceRequestIds = disbursedAdvanceIdsQuery.data ?? [];

  const loading = !authReady || (!!userId && (walletQuery.isLoading || transactionsQuery.isLoading || withdrawalRequestsQuery.isLoading));

  const [lastRefresh, setLastRefresh] = useState<Date>(() => new Date());

  const stats = useMemo((): WalletStats | null => {
    if (!wallet || !transactions || !withdrawalRequests) return null;

    const pendingWithdrawals = withdrawalRequests
      .filter(r => r.status === 'pending')
      .reduce((sum, r) => sum + r.amount, 0);

    const earningTransactions = transactions.filter(
      t => t.type === 'earning' || t.type === 'site_visit_fee'
    );
    const completedSiteVisits = earningTransactions.length;

    const now = new Date();
    const utcNow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const dayOfWeek = new Date(utcNow).getUTCDay();
    const weekStartMs = utcNow - (dayOfWeek * 24 * 60 * 60 * 1000);

    // This week = full total (earnings + disbursed advances this week), no subtraction.
    const disbursedIdSet = new Set(disbursedAdvanceRequestIds);
    const advancesThisWeek = transactions
      .filter(t => t.type === 'down_payment_advance' && disbursedIdSet.has(t.metadata?.down_payment_request_id))
      .filter(t => new Date(t.createdAt).getTime() >= weekStartMs)
      .reduce((sum, t) => sum + t.amount, 0);
    const weeklyEarnings =
      earningTransactions
        .filter(t => new Date(t.createdAt).getTime() >= weekStartMs)
        .reduce((sum, t) => sum + t.amount, 0) + advancesThisWeek;

    const monthStartMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    const advancesThisMonth = transactions
      .filter(t => t.type === 'down_payment_advance' && disbursedIdSet.has(t.metadata?.down_payment_request_id))
      .filter(t => new Date(t.createdAt).getTime() >= monthStartMs)
      .reduce((sum, t) => sum + t.amount, 0);
    const monthlyEarnings =
      earningTransactions
        .filter(t => new Date(t.createdAt).getTime() >= monthStartMs)
        .reduce((sum, t) => sum + t.amount, 0) + advancesThisMonth;

    const weeklySiteVisits = earningTransactions
      .filter(t => new Date(t.createdAt).getTime() >= weekStartMs)
      .length;

    const calculatedWithdrawn = transactions
      .filter(t => t.type === 'withdrawal')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const totalWithdrawn = Math.max(wallet.totalWithdrawn ?? 0, calculatedWithdrawn);

    return {
      totalEarned: wallet.totalEarned ?? 0,
      totalWithdrawn,
      pendingWithdrawals,
      currentBalance: wallet.balances?.SDG ?? 0,
      totalTransactions: transactions.length,
      completedSiteVisits,
      weeklyEarnings,
      monthlyEarnings,
      weeklySiteVisits,
    };
  }, [wallet, transactions, withdrawalRequests, disbursedAdvanceRequestIds]);

  const refreshWallet = useCallback(async (_showErrorToast?: boolean) => {
    await invalidate.invalidateAll(userId);
    setLastRefresh(new Date());
  }, [invalidate, userId]);

  const refreshTransactions = useCallback(async () => {
    await invalidate.invalidateTransactions(userId);
  }, [invalidate, userId]);

  const refreshWithdrawalRequests = useCallback(async () => {
    await invalidate.invalidateWithdrawalRequests(userId);
  }, [invalidate, userId]);

  const refreshSupervisedWithdrawalRequests = useCallback(async () => {
    await invalidate.invalidateSupervised(userId);
  }, [invalidate, userId]);

  const createWithdrawalRequest = async (amount: number, reason: string, paymentMethod?: string) => {
    if (!currentUser?.id || !wallet) return;

    const session = await ensureValidSession();
    if (!session.success) return;

    const currentBalance = wallet.balances.SDG || 0;
    if (amount > currentBalance) {
      toast({
        title: 'Insufficient Balance',
        description: `You only have SDG ${currentBalance.toFixed(2)} available`,
        variant: 'destructive',
      });
      return;
    }

    try {
      const { error } = await supabase.from('withdrawal_requests').insert({
        user_id: currentUser.id,
        wallet_id: wallet.id,
        amount,
        currency: 'SDG',
        request_reason: reason,
        payment_method: paymentMethod,
        status: 'pending',
      });

      if (error) throw error;

      toast({
        title: 'Withdrawal Request Submitted',
        description: 'Your request is pending supervisor approval',
      });

      await invalidate.invalidateAll(userId);
    } catch (error: any) {
      console.error('Failed to create withdrawal request:', error);
      toast({
        title: 'Error',
        description: 'Failed to submit withdrawal request',
        variant: 'destructive',
      });
    }
  };

  const cancelWithdrawalRequest = async (requestId: string) => {
    const session = await ensureValidSession();
    if (!session.success) return;

    try {
      const { error } = await supabase
        .from('withdrawal_requests')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', requestId)
        .eq('status', 'pending');

      if (error) throw error;

      toast({
        title: 'Request Cancelled',
        description: 'Your withdrawal request has been cancelled',
      });

      await invalidate.invalidateAll(userId);
    } catch (error: any) {
      console.error('Failed to cancel withdrawal request:', error);
      toast({
        title: 'Error',
        description: 'Failed to cancel withdrawal request',
        variant: 'destructive',
      });
    }
  };

  const WALLET_MUTATION_TIMEOUT_MS = 15000;

  // Step 1: Supervisor approval - moves request to 'supervisor_approved' status
  // Funds are NOT released at this stage - only verified by supervisor
  const approveWithdrawalRequest = async (requestId: string, notes?: string) => {
    if (!currentUser?.id) return;

    const session = await ensureValidSession();
    if (!session.success) {
      toast({
        title: 'Session may have expired',
        description: session.error || 'Please refresh and try again.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await withTimeout(
        (async () => {
      // Look in both personal and supervised withdrawal requests
      let request = withdrawalRequests.find(r => r.id === requestId);
      if (!request) {
        request = supervisedWithdrawalRequests.find(r => r.id === requestId);
      }
      if (!request) throw new Error('Request not found');

      // Verify the request is in pending status
      if (request.status !== 'pending') {
        throw new Error('Only pending requests can be approved by supervisor');
      }

      // Verify wallet has sufficient balance (for validation, funds not released yet)
      const { data: requestWallet, error: walletError } = await supabase
        .from('wallets')
        .select('*')
        .eq('id', request.walletId)
        .single();

      if (walletError) throw walletError;

      const currentBalance = requestWallet.balances[request.currency] || 0;
      if (currentBalance < request.amount) {
        throw new Error('Insufficient wallet balance');
      }

      // Update status to 'supervisor_approved' - awaiting finance processing
      const { error: requestError } = await supabase
        .from('withdrawal_requests')
        .update({
          status: 'supervisor_approved',
          supervisor_id: currentUser.id,
          supervisor_notes: notes,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (requestError) throw requestError;

      toast({
        title: 'Withdrawal Approved by Supervisor',
        description: 'The request has been forwarded to Finance for processing',
      });

      // Send email notification to the requester
      NotificationTriggerService.withdrawalStatusChanged(
        request.userId,
        'pending_final',
        request.amount
      );

      // Refresh both personal and supervised withdrawal requests
      await invalidate.invalidateAll(userId);
        })(),
        WALLET_MUTATION_TIMEOUT_MS,
        'Request timed out. Please try again or refresh the page.'
      );
    } catch (error: any) {
      console.error('Failed to approve withdrawal:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to approve withdrawal request',
        variant: 'destructive',
      });
    }
  };

  // Step 2: Admin/Finance processing - releases funds and marks as 'approved'
  const adminProcessWithdrawal = async (requestId: string, notes?: string) => {
    if (!currentUser?.id) return;

    const session = await ensureValidSession();
    if (!session.success) {
      toast({
        title: 'Session may have expired',
        description: session.error || 'Please refresh and try again.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await withTimeout(
        (async () => {
      // First try to find in local state, then fetch from database if not found
      let request: WithdrawalRequest | SupervisedWithdrawalRequest | undefined = withdrawalRequests.find(r => r.id === requestId);
      if (!request) {
        request = supervisedWithdrawalRequests.find(r => r.id === requestId);
      }
      
      // If still not found, fetch directly from database with profile info (for admin list view)
      if (!request) {
        const { data: requestData, error: fetchError } = await supabase
          .from('withdrawal_requests')
          .select(`
            *,
            profiles:profiles!withdrawal_requests_user_id_fkey(full_name, email, hub_id, state_id, role)
          `)
          .eq('id', requestId)
          .single();
          
        if (fetchError) throw new Error('Request not found');
        request = {
          ...transformWithdrawalRequestFromDB(requestData),
          requesterName: requestData.profiles?.full_name || 'Unknown User',
          requesterEmail: requestData.profiles?.email,
          requesterHub: requestData.profiles?.hub_id,
          requesterState: requestData.profiles?.state_id,
          requesterRole: requestData.profiles?.role,
        } as SupervisedWithdrawalRequest;
      }
      
      if (!request) throw new Error('Request not found');

      // Verify the request is in supervisor_approved status
      if (request.status !== 'supervisor_approved') {
        throw new Error('Only supervisor-approved requests can be processed by Finance');
      }

      const { data: requestWallet, error: walletError } = await supabase
        .from('wallets')
        .select('*')
        .eq('id', request.walletId)
        .single();

      if (walletError) throw walletError;

      const currentBalance = Number(requestWallet.balances?.[request.currency] ?? 0) || 0;
      if (currentBalance < request.amount) {
        throw new Error('Insufficient wallet balance');
      }

      // Deduct balance from wallet
      const newBalances = {
        ...requestWallet.balances,
        [request.currency]: Number((currentBalance - Number(request.amount)).toFixed(2)),
      };

      const { error: updateError } = await supabase
        .from('wallets')
        .update({
          balances: newBalances,
          total_withdrawn: parseFloat(requestWallet.total_withdrawn) + request.amount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', request.walletId);

      if (updateError) throw updateError;

      // Create withdrawal transaction record
      const { error: transactionError } = await supabase.from('wallet_transactions').insert({
        wallet_id: request.walletId,
        user_id: request.userId,
        type: 'withdrawal',
        amount: -request.amount,
        amount_cents: Math.round(request.amount * 100),
        currency: request.currency,
        withdrawal_request_id: requestId,
        description: `Withdrawal processed by Finance: ${notes || 'Payment completed'}`,
        balance_before: currentBalance,
        balance_after: currentBalance - request.amount,
        created_by: currentUser.id,
      });

      if (transactionError) throw transactionError;

      // Update request to final 'approved' status with admin details
      const processedAt = new Date().toISOString();
      const { error: requestError } = await supabase
        .from('withdrawal_requests')
        .update({
          status: 'approved',
          admin_processed_by: currentUser.id,
          admin_processed_at: processedAt,
          admin_notes: notes,
          updated_at: processedAt,
        })
        .eq('id', requestId);

      if (requestError) throw requestError;

      toast({
        title: 'Withdrawal Processed',
        description: 'Payment processed. The recipient will be asked to confirm receipt.',
      });

      // Send email notification to the requester
      NotificationTriggerService.withdrawalStatusChanged(
        request.userId,
        'approved',
        request.amount
      );

      // Refresh all relevant data including supervised requests
      await invalidate.invalidateAll(userId);
        })(),
        WALLET_MUTATION_TIMEOUT_MS,
        'Request timed out. Please try again or refresh the page.'
      );
    } catch (error: any) {
      console.error('Failed to process withdrawal:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to process withdrawal',
        variant: 'destructive',
      });
    }
  };

  // Admin/Finance rejection - rejects a supervisor-approved request
  const adminRejectWithdrawal = async (requestId: string, notes: string) => {
    if (!currentUser?.id) return;

    const session = await ensureValidSession();
    if (!session.success) {
      toast({
        title: 'Session may have expired',
        description: session.error || 'Please refresh and try again.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await withTimeout(
        (async () => {
      // First try to find in local state, then fetch from database if not found
      let request: WithdrawalRequest | SupervisedWithdrawalRequest | undefined = withdrawalRequests.find(r => r.id === requestId);
      if (!request) {
        request = supervisedWithdrawalRequests.find(r => r.id === requestId);
      }
      
      // If still not found, fetch directly from database with profile info (for admin list view)
      if (!request) {
        const { data: requestData, error: fetchError } = await supabase
          .from('withdrawal_requests')
          .select(`
            *,
            profiles:profiles!withdrawal_requests_user_id_fkey(full_name, email, hub_id, state_id, role)
          `)
          .eq('id', requestId)
          .single();
          
        if (fetchError) throw new Error('Request not found');
        request = {
          ...transformWithdrawalRequestFromDB(requestData),
          requesterName: requestData.profiles?.full_name || 'Unknown User',
          requesterEmail: requestData.profiles?.email,
          requesterHub: requestData.profiles?.hub_id,
          requesterState: requestData.profiles?.state_id,
          requesterRole: requestData.profiles?.role,
        } as SupervisedWithdrawalRequest;
      }
      
      if (!request) throw new Error('Request not found');

      // Verify the request is in supervisor_approved status
      if (request.status !== 'supervisor_approved') {
        throw new Error('Only supervisor-approved requests can be rejected by Finance');
      }

      const { error } = await supabase
        .from('withdrawal_requests')
        .update({
          status: 'rejected',
          admin_processed_by: currentUser.id,
          admin_processed_at: new Date().toISOString(),
          admin_notes: notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (error) throw error;

      toast({
        title: 'Withdrawal Rejected by Finance',
        description: 'The withdrawal request has been rejected',
      });

      // Send email notification to the requester
      NotificationTriggerService.withdrawalStatusChanged(
        request.userId,
        'rejected',
        request.amount
      );

      // Refresh all relevant data including supervised requests
      await invalidate.invalidateAll(userId);
        })(),
        WALLET_MUTATION_TIMEOUT_MS,
        'Request timed out. Please try again or refresh the page.'
      );
    } catch (error: any) {
      console.error('Failed to reject withdrawal:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to reject withdrawal request',
        variant: 'destructive',
      });
    }
  };

  const rejectWithdrawalRequest = async (requestId: string, notes: string) => {
    if (!currentUser?.id) return;

    const session = await ensureValidSession();
    if (!session.success) {
      toast({
        title: 'Session may have expired',
        description: session.error || 'Please refresh and try again.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await withTimeout(
        (async () => {
      // Find the request to get userId and amount for notification
      let request = withdrawalRequests.find(r => r.id === requestId);
      if (!request) {
        request = supervisedWithdrawalRequests.find(r => r.id === requestId);
      }

      const { error } = await supabase
        .from('withdrawal_requests')
        .update({
          status: 'rejected',
          supervisor_id: currentUser.id,
          supervisor_notes: notes,
          rejected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (error) throw error;

      toast({
        title: 'Withdrawal Rejected',
        description: 'The withdrawal request has been rejected',
      });

      // Send email notification to the requester
      if (request) {
        NotificationTriggerService.withdrawalStatusChanged(
          request.userId,
          'rejected',
          request.amount
        );
      }

      // Refresh both personal and supervised withdrawal requests
      await invalidate.invalidateAll(userId);
        })(),
        WALLET_MUTATION_TIMEOUT_MS,
        'Request timed out. Please try again or refresh the page.'
      );
    } catch (error: any) {
      console.error('Failed to reject withdrawal:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to reject withdrawal request',
        variant: 'destructive',
      });
    }
  };

  const confirmFundReceipt = async (requestId: string, signatureData: { signatureId: string; signatureHash: string; signatureMethod: string; signedAt: string; notes?: string }) => {
    if (!currentUser?.id) return;

    const session = await ensureValidSession();
    if (!session.success) {
      toast({
        title: 'Session may have expired',
        description: session.error || 'Please refresh and try again.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await withTimeout(
        (async () => {
      const request = withdrawalRequests.find(r => r.id === requestId);
      if (!request) throw new Error('Withdrawal request not found');

      if (request.status !== 'approved') {
        throw new Error('Only approved withdrawals can be confirmed');
      }

      if (request.fundReceiptConfirmed) {
        throw new Error('Fund receipt already confirmed / تم تأكيد الاستلام مسبقاً');
      }

      const signatureRecord = JSON.stringify({
        signatureId: signatureData.signatureId,
        signatureHash: signatureData.signatureHash,
        signatureMethod: signatureData.signatureMethod,
        signedAt: signatureData.signedAt,
        confirmedBy: currentUser.id,
        confirmedByName: currentUser.fullName || currentUser.email,
      });

      const { error } = await supabase
        .from('withdrawal_requests')
        .update({
          fund_receipt_confirmed: true,
          fund_receipt_confirmed_at: signatureData.signedAt,
          fund_receipt_signature_url: signatureRecord,
          fund_receipt_notes: signatureData.notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId)
        .eq('user_id', currentUser.id);

      if (error) throw error;

      toast({
        title: 'تم تأكيد الاستلام / Fund Receipt Confirmed',
        description: 'You have confirmed receiving the funds with your digital signature.',
      });

      NotificationTriggerService.withdrawalStatusChanged(
        request.userId,
        'approved',
        request.amount
      );

      await invalidate.invalidateWithdrawalRequests(userId);
        })(),
        WALLET_MUTATION_TIMEOUT_MS,
        'Request timed out. Please try again or refresh the page.'
      );
    } catch (error: any) {
      console.error('Failed to confirm fund receipt:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to confirm fund receipt',
        variant: 'destructive',
      });
    }
  };

  const getBalance = (currency: string = 'SDG'): number => {
    if (!wallet) return 0;
    return wallet.balances[currency] ?? 0;
  };

  const getSiteVisitCost = async (siteVisitId: string): Promise<SiteVisitCost | null> => {
    try {
      const { data, error } = await supabase
        .from('site_visit_costs')
        .select('*')
        .eq('site_visit_id', siteVisitId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }

      return transformSiteVisitCostFromDB(data);
    } catch (error: any) {
      console.error('Failed to fetch site visit cost:', error);
      return null;
    }
  };

  const assignSiteVisitCost = async (siteVisitId: string, costs: Partial<SiteVisitCost>) => {
    if (!currentUser?.id) return;

    try {
      const { error } = await supabase.from('site_visit_costs').insert({
        site_visit_id: siteVisitId,
        transportation_cost: costs.transportationCost || 0,
        accommodation_cost: costs.accommodationCost || 0,
        meal_allowance: costs.mealAllowance || 0,
        other_costs: costs.otherCosts || 0,
        currency: costs.currency || 'SDG',
        cost_notes: costs.costNotes,
        assigned_by: currentUser.id,
      });

      if (error) throw error;

      toast({
        title: 'Cost Assigned',
        description: 'Site visit cost has been assigned successfully',
      });
    } catch (error: any) {
      console.error('Failed to assign site visit cost:', error);
      toast({
        title: 'Error',
        description: 'Failed to assign site visit cost',
        variant: 'destructive',
      });
    }
  };

  const updateSiteVisitCost = async (costId: string, costs: Partial<SiteVisitCost>) => {
    if (!currentUser?.id) return;

    try {
      const { error } = await supabase
        .from('site_visit_costs')
        .update({
          transportation_cost: costs.transportationCost,
          accommodation_cost: costs.accommodationCost,
          meal_allowance: costs.mealAllowance,
          other_costs: costs.otherCosts,
          cost_notes: costs.costNotes,
          adjustment_reason: costs.adjustmentReason,
          adjusted_by: currentUser.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', costId);

      if (error) throw error;

      toast({
        title: 'Cost Updated',
        description: 'Site visit cost has been updated successfully',
      });
    } catch (error: any) {
      console.error('Failed to update site visit cost:', error);
      toast({
        title: 'Error',
        description: 'Failed to update site visit cost',
        variant: 'destructive',
      });
    }
  };

  const calculateClassificationFee = async (userId: string, complexityMultiplier: number = 1.0): Promise<number> => {
    try {
      const classification = getUserClassification(userId);
      
      if (!classification) {
        console.warn(`No classification found for user ${userId}, using default fee of 50 SDG`);
        return 50;
      }

      const feeStructure = getActiveFeeStructure(
        classification.classificationLevel,
        classification.roleScope
      );

      if (!feeStructure) {
        console.warn(`No fee structure found for ${classification.classificationLevel}/${classification.roleScope}, using default fee of 50 SDG`);
        return 50;
      }

      const baseFeeSDG = feeStructure.siteVisitBaseFeeCents;
      const structureMultiplier = feeStructure.complexityMultiplier || 1.0;
      const effectiveMultiplier = complexityMultiplier !== 1.0 ? complexityMultiplier : structureMultiplier;
      const totalSDG = Math.round(baseFeeSDG * effectiveMultiplier * 100) / 100;
      
      console.log(`📊 Classification fee calculated: ${baseFeeSDG} × ${effectiveMultiplier} (structure: ${structureMultiplier}) = ${totalSDG} SDG for Level ${classification.classificationLevel}`);
      return totalSDG;
    } catch (error: any) {
      console.error('Failed to calculate classification fee:', error);
      return 50;
    }
  };

  const addSiteVisitFeeToWallet = async (userId: string, siteVisitId: string, complexityMultiplier: number = 1.0) => {
    // RACE CONDITION GUARD: Prevent concurrent calls for same site visit
    const lockKey = `${userId}-${siteVisitId}`;
    if (pendingFeeAdditions.has(lockKey)) {
      console.warn(`[Wallet] Fee addition already in progress for ${siteVisitId}, skipping duplicate call`);
      return;
    }
    pendingFeeAdditions.add(lockKey);
    
    try {
      // ADDITIONAL VALIDATIONS (beyond what centralized function does):
      // 1. Check site_code and visit date (visit_completed_at or visit_date) requirements
      // 2. Check for duplicate visits in same week
      
      // Fetch from mmp_site_entries for additional validations
      const { data: entry, error: entryError } = await supabase
        .from('mmp_site_entries')
        .select('site_name, site_code, status, accepted_by, enumerator_fee, transport_fee, cost, visit_completed_at, visit_date')
        .eq('id', siteVisitId)
        .single();

      // CRITICAL: Abort if we cannot fetch site entry (fail-safe - no payment without validation)
      if (entryError) {
        console.error(`[Wallet] Failed to fetch site entry: ${entryError.message}`);
        toast({
          title: 'Site Visit Not Found',
          description: 'Cannot add fee - site visit record not found or inaccessible.',
          variant: 'destructive',
        });
        throw new Error(`Site entry fetch failed: ${entryError.message}`);
      }

      if (!entry) {
        console.error(`[Wallet] Site entry is null for ${siteVisitId}`);
        toast({
          title: 'Site Visit Not Found',
          description: 'Cannot add fee - site visit record not found.',
          variant: 'destructive',
        });
        throw new Error('Site entry is null');
      }

      // CRITICAL: Require site_code for deduplication - abort if missing
      if (!entry.site_code) {
        console.error(`[Wallet] Site entry ${siteVisitId} missing site_code - cannot verify uniqueness`);
        toast({
          title: 'Data Integrity Issue',
          description: 'Site visit is missing site code. Cannot verify uniqueness for fee.',
          variant: 'destructive',
        });
        throw new Error('Site entry missing site_code - cannot verify uniqueness');
      }

      // VALIDATION: Check if same site was visited in the same week (prevent duplicate site visits)
      // This is an additional validation - we only perform it if visit_completed_at is available
      // If not available, we skip this check (it's not critical for transaction creation)
      let duplicateVisits: any[] = [];
      let dupError: any = null;

      if (entry.visit_completed_at) {
        const visitDate = new Date(entry.visit_completed_at);
        const weekStart = new Date(visitDate);
        weekStart.setDate(visitDate.getDate() - visitDate.getDay()); // Start of week (Sunday)
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7); // End of week

        // Check for duplicates using visit_completed_at
        const { data: duplicateVisitsData, error: dupErrorData } = await supabase
          .from('mmp_site_entries')
          .select('id, site_name, visit_completed_at')
          .eq('site_code', entry.site_code)
          .eq('status', 'completed')
          .neq('id', siteVisitId)
          .not('visit_completed_at', 'is', null)
          .gte('visit_completed_at', weekStart.toISOString())
          .lt('visit_completed_at', weekEnd.toISOString());

        duplicateVisits = duplicateVisitsData || [];
        dupError = dupErrorData;
      } else {
        // If no visit_completed_at, skip week-based duplicate check
        // This is an additional validation, not critical for transaction creation
        console.log(`[Wallet] Skipping week-based duplicate check - visit_completed_at not available for site ${siteVisitId}`);
      }

      // CRITICAL: Abort if we cannot verify duplicate visits (fail-safe)
      if (dupError) {
        console.error(`[Wallet] Failed to check for duplicate visits: ${dupError.message}`);
        toast({
          title: 'Validation Failed',
          description: 'Cannot verify if site was already visited this week. Please try again.',
          variant: 'destructive',
        });
        throw new Error(`Duplicate visit check failed: ${dupError.message}`);
      }

      if (duplicateVisits && duplicateVisits.length > 0) {
        console.warn(`[Wallet] Duplicate site visit detected in same week for site ${entry.site_code}`);
        toast({
          title: 'Duplicate Site Visit',
          description: `Site "${entry.site_name}" was already visited this week. Cannot add fee twice.`,
          variant: 'destructive',
        });
        return;
      }

      // Calculate amount and description (for fallback to classification-based fee)
      let amount: number | undefined;
      let description: string | undefined;
      
      const storedEnumFee = Number(entry.enumerator_fee) || 0;
      const storedTransportFee = Number(entry.transport_fee) || 0;
      const storedCost = Number(entry.cost) || 0;
      
      const calculatedFromFees = storedEnumFee + storedTransportFee;
      if (calculatedFromFees > 0) {
        amount = calculatedFromFees;
        description = `Site visit completed: ${entry.site_name || 'Site'}`;
        console.log(`💰 Using enumerator_fee (${storedEnumFee}) + transport_fee (${storedTransportFee}) = ${amount} SDG for site entry ${siteVisitId}`);
      } else if (storedCost > 0) {
        amount = storedCost;
        description = `Site visit completed: ${entry.site_name || 'Site'}`;
        console.log(`💰 Using cost field for site entry ${siteVisitId}: ${amount} SDG`);
      } else {
        // Fallback to classification-based calculation
        amount = await calculateClassificationFee(userId, complexityMultiplier);
        description = `Site visit fee (${complexityMultiplier}x complexity)`;
        console.log(`💰 Using calculated fee for site entry ${siteVisitId}: ${amount} SDG`);
      }

      // Use centralized function to create the wallet transaction
      // This ensures consistency across all completion flows
      const result = await createSiteVisitWalletTransaction({
        siteVisitId: siteVisitId,
        userId: userId,
        amount: amount,
        description: description,
        showNotifications: true,
        toast: toast,
      });

      if (result.success) {
        console.log(`[Wallet] ✅ Successfully created wallet transaction: ${result.message}`);
        
        // Refresh wallet and transactions if this is the current user
        if (userId === currentUser?.id) {
          await invalidate.invalidateWallet(userId);
          await invalidate.invalidateTransactions(userId);
        }
      } else {
        // The centralized function already shows toast notifications, but we'll log the error
        console.error(`[Wallet] Failed to create wallet transaction: ${result.message}`);
        throw new Error(result.message);
      }
    } catch (error: any) {
      console.error('Failed to add site visit fee:', error);
      // Re-throw to let caller handle (they may want to show additional notifications)
      throw error;
    } finally {
      // Release the lock so future attempts can proceed (after previous one completes)
      const lockKey = `${userId}-${siteVisitId}`;
      pendingFeeAdditions.delete(lockKey);
    }
  };

  const reconcileSiteVisitFee = async (siteVisitId: string): Promise<{ success: boolean; message: string }> => {
    try {
      // 1. Get the site entry details (siteVisitId is mmp_site_entries.id)
      const { data: entry, error: entryError } = await supabase
        .from('mmp_site_entries')
        .select('id, site_name, status, accepted_by, visit_completed_by, enumerator_fee, transport_fee, cost')
        .eq('id', siteVisitId)
        .single();

      if (entryError || !entry) {
        return { success: false, message: `Site entry not found: ${entryError?.message || 'Unknown error'}` };
      }

      if ((entry.status || '').toLowerCase() !== 'completed') {
        return { success: false, message: `Site is not completed. Current status: ${entry.status}` };
      }

      // Check multiple fields to determine who should be paid
      const userIdToPay = entry.accepted_by || entry.visit_completed_by;
      
      if (!userIdToPay) {
        return { success: false, message: 'Site has no user assigned (checked accepted_by, visit_completed_by)' };
      }

      // 2. Check if fee was already added (check for both old 'site_visit_fee' and new 'earning' types)
      const { data: existingTx, error: txError } = await supabase
        .from('wallet_transactions')
        .select('id, amount')
        .eq('site_visit_id', siteVisitId)
        .eq('type', 'earning')
        .maybeSingle();

      if (existingTx) {
        return { success: false, message: `Fee already recorded: ${existingTx.amount} SDG (Transaction: ${existingTx.id})` };
      }

      // 3. Add the fee to wallet - prioritize enumerator_fee + transport_fee over cost field
      const enumFeePart = Number(entry.enumerator_fee) || 0;
      const transportFeePart = Number(entry.transport_fee) || 0;
      const calculatedFromParts = enumFeePart + transportFeePart;
      const cost = calculatedFromParts > 0 ? calculatedFromParts : (Number(entry.cost) || 0);
      
      if (cost <= 0) {
        return { success: false, message: 'Site has no fee assigned (cost is 0)' };
      }

      const feeSource = calculatedFromParts > 0
        ? `(enumerator: ${enumFeePart} + transport: ${transportFeePart})`
        : '(from cost field)';
      console.log(`[Wallet Reconciliation] Adding fee of ${cost} SDG ${feeSource} for site entry ${siteVisitId} to user ${userIdToPay}`);

      await addSiteVisitFeeToWallet(userIdToPay, siteVisitId, 1.0);

      return { success: true, message: `Successfully added ${cost} SDG to wallet for site "${entry.site_name || 'Unknown'}"` };
    } catch (error: any) {
      console.error('[Wallet Reconciliation] Error:', error);
      return { success: false, message: `Failed to reconcile: ${error.message}` };
    }
  };

  const addRetainerToWallet = async (
    userId: string,
    amountCents: number,
    currency: string,
    period: string
  ) => {
    try {
      const amount = amountCents / 100;

      const { data: targetWallet, error: walletError } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (walletError) {
        if (walletError.code === 'PGRST116') {
          const { data: newWallet, error: createError } = await supabase
            .from('wallets')
            .insert({ user_id: userId, balances: { [currency]: amount }, total_earned: amount })
            .select()
            .single();

          if (createError) throw createError;

          const { data: newTxData } = await supabase.from('wallet_transactions').insert({
            wallet_id: newWallet.id,
            user_id: userId,
            type: 'adjustment',
            amount,
            amount_cents: Math.round(amount * 100),
            currency,
            description: `Monthly retainer - ${period}`,
            balance_before: 0,
            balance_after: amount,
            created_by: currentUser?.id,
            metadata: { type: 'retainer', period },
          }).select('id').single();

          try {
            await NotificationTriggerService.walletCredited(
              userId, amount, currency,
              `Monthly retainer for ${period} / مكافأة شهرية لـ ${period}`,
              newTxData?.id
            );
          } catch (notifErr) {
            console.warn('[Wallet] Failed to send retainer wallet credited notification:', notifErr);
          }

          return;
        }
        throw walletError;
      }

      const currentBalance = Number(targetWallet.balances?.[currency] ?? 0) || 0;
      const newBalance = Number((currentBalance + Number(amount)).toFixed(2));
      const newBalances = { ...targetWallet.balances, [currency]: newBalance };

      const currentTotalEarned = parseFloat(targetWallet.total_earned || 0);
      const { error: updateError } = await supabase
        .from('wallets')
        .update({
          balances: newBalances,
          total_earned: currentTotalEarned + amount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', targetWallet.id);

      if (updateError) throw updateError;

      const { data: txData, error: transactionError } = await supabase.from('wallet_transactions').insert({
        wallet_id: targetWallet.id,
        user_id: userId,
        type: 'adjustment',
        amount,
        amount_cents: Math.round(amount * 100),
        currency,
        description: `Monthly retainer - ${period}`,
        balance_before: currentBalance,
        balance_after: newBalance,
        created_by: currentUser?.id,
        metadata: { type: 'retainer', period },
      }).select('id').single();

      if (transactionError) throw transactionError;

      try {
        await NotificationTriggerService.walletCredited(
          userId, amount, currency,
          `Monthly retainer for ${period} / مكافأة شهرية لـ ${period}`,
          txData?.id
        );
      } catch (notifErr) {
        console.warn('[Wallet] Failed to send retainer wallet credited notification:', notifErr);
      }

      if (userId === currentUser?.id) {
        await invalidate.invalidateWallet(userId);
        await invalidate.invalidateTransactions(userId);
      }
    } catch (error: any) {
      console.error('Failed to add retainer to wallet:', error);
      throw error;
    }
  };

  const processMonthlyRetainers = async (): Promise<{ processed: number; failed: number; total: number }> => {
    try {
      const now = new Date();
      const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const { data: eligibleUsers, error: fetchError } = await supabase
        .from('current_user_classifications')
        .select('*')
        .eq('has_retainer', true)
        .eq('is_active', true);

      if (fetchError) throw fetchError;

      if (!eligibleUsers || eligibleUsers.length === 0) {
        return { processed: 0, failed: 0, total: 0 };
      }

      let processed = 0;
      let failed = 0;

      for (const user of eligibleUsers) {
        try {
          // Transactions are inserted with type='adjustment' + metadata.type='retainer'.
          // Previously the check used type='retainer' which never matched — meaning
          // every call to processMonthlyRetainers would re-pay ALL retainers.
          const { data: existingRetainer, error: checkError } = await supabase
            .from('wallet_transactions')
            .select('id')
            .eq('user_id', user.user_id)
            .eq('type', 'adjustment')
            .ilike('description', `%Monthly retainer%`)
            .ilike('description', `%${currentPeriod}%`)
            .maybeSingle();

          if (checkError && checkError.code !== 'PGRST116') {
            throw checkError;
          }

          if (existingRetainer) {
            console.log(`Retainer already processed for user ${user.user_id} in ${currentPeriod}`);
            continue;
          }

          await addRetainerToWallet(
            user.user_id,
            user.retainer_amount_cents,
            user.retainer_currency,
            currentPeriod
          );

          processed++;
        } catch (error: any) {
          console.error(`Failed to process retainer for user ${user.user_id}:`, error);
          failed++;
        }
      }

      toast({
        title: 'Retainer Processing Complete',
        description: `Processed ${processed} of ${eligibleUsers.length} retainers. ${failed} failed.`,
      });

      return { processed, failed, total: eligibleUsers.length };
    } catch (error: any) {
      console.error('Failed to process monthly retainers:', error);
      toast({
        title: 'Error',
        description: 'Failed to process monthly retainers',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const listWallets = async (): Promise<Wallet[]> => {
    try {
      const { data, error } = await supabase
        .from('wallets')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data.map(transformWalletFromDB);
    } catch (error: any) {
      console.error('Failed to list wallets:', error);
      return [];
    }
  };

  const adminAdjustBalance = async (
    userId: string,
    amount: number,
    currency: string,
    reason: string,
    adjustmentType: 'credit' | 'debit'
  ) => {
    if (!currentUser?.id) {
      throw new Error('Admin user not authenticated');
    }

    try {
      const { data: targetWallet, error: walletError } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (walletError) {
        if (walletError.code === 'PGRST116') {
          // Wallet does not exist
          if (adjustmentType === 'debit') {
            throw new Error('Cannot debit from non-existent wallet. Please credit first to create the wallet.');
          }

          // Only allow credit for new wallets
          const { data: newWallet, error: createError } = await supabase
            .from('wallets')
            .insert({ user_id: userId, balances: { [currency]: amount }, total_earned: amount })
            .select()
            .single();

          if (createError) throw createError;

          const { data: newTx } = await supabase.from('wallet_transactions').insert({
            wallet_id: newWallet.id,
            user_id: userId,
            type: 'adjustment',
            amount,
            currency,
            description: `Admin ${adjustmentType}: ${reason}`,
            balance_before: 0,
            balance_after: amount,
            created_by: currentUser.id,
            metadata: { adjustmentType, adminReason: reason },
          }).select('id').single();

          try {
            await NotificationTriggerService.walletCredited(userId, amount, currency, `Admin credit: ${reason}`, newTx?.id);
          } catch (notifErr) {
            console.warn('[Wallet] Failed to send wallet credited notification:', notifErr);
          }

          toast({
            title: 'Balance Adjusted',
            description: `Successfully credited ${currency} ${amount.toFixed(2)}`,
          });
          return;
        }
        throw walletError;
      }

      const currentBalance = Number(targetWallet.balances?.[currency] ?? 0) || 0;
      const adjustmentAmount = adjustmentType === 'credit' ? amount : -amount;
      const newBalance = currentBalance + adjustmentAmount;

      if (newBalance < 0) {
        throw new Error('Adjustment would result in negative balance');
      }

      const newBalances = { ...targetWallet.balances, [currency]: newBalance };

      const { error: updateError } = await supabase
        .from('wallets')
        .update({
          balances: newBalances,
          updated_at: new Date().toISOString(),
        })
        .eq('id', targetWallet.id);

      if (updateError) throw updateError;

      const { data: insertedTx, error: transactionError } = await supabase.from('wallet_transactions').insert({
        wallet_id: targetWallet.id,
        user_id: userId,
        type: 'adjustment',
        amount: adjustmentAmount,
        currency,
        description: `Admin ${adjustmentType}: ${reason}`,
        balance_before: currentBalance,
        balance_after: newBalance,
        created_by: currentUser.id,
        metadata: { adjustmentType, adminReason: reason },
      }).select('id').single();

      if (transactionError) throw transactionError;

      try {
        if (adjustmentType === 'credit') {
          await NotificationTriggerService.walletCredited(userId, amount, currency, `Admin credit: ${reason}`, insertedTx?.id);
        } else {
          await NotificationTriggerService.walletDebited(userId, amount, currency, `Admin debit: ${reason}`, insertedTx?.id);
        }
      } catch (notifErr) {
        console.warn('[Wallet] Failed to send wallet adjustment notification:', notifErr);
      }

      toast({
        title: 'Balance Adjusted',
        description: `Successfully ${adjustmentType === 'credit' ? 'credited' : 'debited'} ${currency} ${amount.toFixed(2)}`,
      });
    } catch (error: any) {
      console.error('Failed to adjust balance:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to adjust balance',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const adminListWithdrawalRequests = async (): Promise<AdminWithdrawalRequest[]> => {
    try {
      const { data, error } = await supabase
        .from('withdrawal_requests')
        .select(`
          *,
          profiles:profiles!withdrawal_requests_user_id_fkey(full_name, email, hub_id, state_id, role)
        `)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;

      return (data || []).map((item: any): AdminWithdrawalRequest => ({
        ...transformWithdrawalRequestFromDB(item),
        requesterName: item.profiles?.full_name || 'Unknown User',
        requesterEmail: item.profiles?.email,
        requesterHub: item.profiles?.hub_id,
        requesterState: item.profiles?.state_id,
        requesterRole: item.profiles?.role,
      }));
    } catch (error: any) {
      console.error('Failed to list withdrawal requests:', error);
      return [];
    }
  };

  const listSupervisedWithdrawalRequests = async (): Promise<SupervisedWithdrawalRequest[]> => {
    if (!currentUser?.id) return [];
    
    try {
      const userRole = currentUser.role?.toLowerCase();
      const isSupervisorRole = userRole === 'supervisor' || userRole === 'hubsupervisor' || userRole === 'fom';
      const isAdmin = userRole === 'admin' || userRole === 'financialadmin';
      
      if (!isSupervisorRole && !isAdmin) {
        return [];
      }

      if (isAdmin) {
        const { data, error } = await supabase
          .from('withdrawal_requests')
          .select(`
            *,
            profiles:profiles!withdrawal_requests_user_id_fkey(full_name, email, hub_id, state_id, role)
          `)
          .order('created_at', { ascending: false })
          .limit(200);

        if (error) throw error;

        return (data || []).map((item: any): SupervisedWithdrawalRequest => ({
          ...transformWithdrawalRequestFromDB(item),
          requesterName: item.profiles?.full_name || 'Unknown User',
          requesterEmail: item.profiles?.email,
          requesterHub: item.profiles?.hub_id,
          requesterState: item.profiles?.state_id,
          requesterRole: item.profiles?.role,
        }));
      }

      /**
       * HUB-BASED SUPERVISION MODEL
       * ============================
       * Hub Supervisors manage MULTIPLE STATES within their hub:
       * - Kosti Hub: 7 states (white-nile, north-kordofan, south-kordofan, west-kordofan, north-darfur, south-darfur, east-darfur)
       * - Kassala Hub: 5 states (kassala, gedarif, gezira, sennar, blue-nile)
       * - Dongola Hub: 2 states (northern, river-nile)
       * - Forchana Hub: 2 states (west-darfur, central-darfur)
       * - Country Office: 2 states (khartoum, red-sea)
       * 
       * Hub supervisors are assigned `hub_id` (NOT state_id) and see ALL team members
       * across ALL states within their hub. Team members need matching `hub_id` to appear.
       */
      const supervisorHubId = currentUser.hubId;
      const supervisorSecondaryHubId = currentUser.secondaryHubId;
      const supervisorStateId = currentUser.stateId;

      if (!supervisorHubId && !supervisorStateId) {
        console.warn('[Wallet] Hub Supervisor has no hub_id assigned. Assign hub_id in User Management to see team members across all states in the hub.');
        return [];
      }

      // Query team members by hub_id (primary), secondary_hub_id, or state_id (fallback for legacy support)
      // Hub supervisors should have hub_id set - they see ALL team members in ALL states of their hub(s)
      // SECONDARY HUB: Supervisors with secondary_hub_id also see team members from that hub
      let hubFilter = `hub_id.eq.${supervisorHubId || 'none'},state_id.eq.${supervisorStateId || 'none'}`;
      if (supervisorSecondaryHubId) {
        hubFilter += `,hub_id.eq.${supervisorSecondaryHubId}`;
        console.log('[Wallet] Supervisor has secondary hub:', supervisorSecondaryHubId);
      }
      const { data: teamMembers, error: teamError } = await supabase
        .from('profiles')
        .select('id, full_name, email, hub_id, state_id, role')
        .or(hubFilter);

      if (teamError) {
        console.error('Failed to fetch team members:', teamError);
        return [];
      }

      const teamMemberIds = (teamMembers || [])
        .map((m: any) => m.id)
        .filter((id: string) => id !== currentUser.id);

      if (teamMemberIds.length === 0) {
        return [];
      }

      const { data, error } = await supabase
        .from('withdrawal_requests')
        .select(`
          *,
          profiles:profiles!withdrawal_requests_user_id_fkey(full_name, email, hub_id, state_id, role)
        `)
        .in('user_id', teamMemberIds)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;

      return (data || []).map((item: any): SupervisedWithdrawalRequest => ({
        ...transformWithdrawalRequestFromDB(item),
        requesterName: item.profiles?.full_name || 'Unknown User',
        requesterEmail: item.profiles?.email,
        requesterHub: item.profiles?.hub_id,
        requesterState: item.profiles?.state_id,
        requesterRole: item.profiles?.role,
      }));
    } catch (error: any) {
      console.error('Failed to list supervised withdrawal requests:', error);
      return [];
    }
  };

  useEffect(() => {
    if (!currentUser?.id || !userId) return;

    const userRole = currentUser.role?.toLowerCase();
    const isSupervisorRole = userRole === 'supervisor' || userRole === 'hubsupervisor' || userRole === 'fom';
    const isAdmin = userRole === 'admin' || userRole === 'financialadmin';

    const walletChannel = supabase
      .channel('wallet_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wallets',
          filter: `user_id=eq.${currentUser.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: walletQueryKeys.wallet(userId) });
          setLastRefresh(new Date());
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wallet_transactions',
          filter: `user_id=eq.${currentUser.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: walletQueryKeys.transactions(userId) });
          setLastRefresh(new Date());
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'withdrawal_requests',
          filter: `user_id=eq.${currentUser.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: walletQueryKeys.withdrawalRequests(userId) });
          setLastRefresh(new Date());
        }
      )
      .subscribe();

    let supervisorChannel: ReturnType<typeof supabase.channel> | null = null;
    if (isSupervisorRole || isAdmin) {
      supervisorChannel = supabase
        .channel('supervisor_withdrawal_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'withdrawal_requests',
          },
          () => {
            queryClient.invalidateQueries({ queryKey: walletQueryKeys.supervisedWithdrawalRequests(userId) });
            setLastRefresh(new Date());
          }
        )
        .subscribe();
    }

    return () => {
      supabase.removeChannel(walletChannel);
      if (supervisorChannel) {
        supabase.removeChannel(supervisorChannel);
      }
    };
  }, [currentUser?.id, currentUser?.role, queryClient, userId]);

  return (
    <WalletContext.Provider
      value={{
        wallet,
        transactions,
        withdrawalRequests,
        supervisedWithdrawalRequests,
        stats,
        loading,
        lastRefresh,
        refreshWallet,
        refreshTransactions,
        refreshWithdrawalRequests,
        refreshSupervisedWithdrawalRequests,
        createWithdrawalRequest,
        cancelWithdrawalRequest,
        approveWithdrawalRequest,
        rejectWithdrawalRequest,
        adminProcessWithdrawal,
        adminRejectWithdrawal,
        getBalance,
        getSiteVisitCost,
        assignSiteVisitCost,
        updateSiteVisitCost,
        addSiteVisitFeeToWallet,
        calculateClassificationFee,
        processMonthlyRetainers,
        addRetainerToWallet,
        listWallets,
        adminAdjustBalance,
        adminListWithdrawalRequests,
        listSupervisedWithdrawalRequests,
        reconcileSiteVisitFee,
        confirmFundReceipt,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
