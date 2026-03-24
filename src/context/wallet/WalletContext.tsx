import { createContext, useContext, useState, useMemo, useCallback, ReactNode, useEffect } from 'react';
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
import {
  fetchSupervisedWithdrawalRequests,
  createWithdrawalRequest as dbCreateWithdrawalRequest,
  cancelWithdrawalRequest as dbCancelWithdrawalRequest,
  approveWithdrawalRequest as dbApproveWithdrawalRequest,
  rejectWithdrawalRequest as dbRejectWithdrawalRequest,
  adminProcessWithdrawal as dbAdminProcessWithdrawal,
  adminRejectWithdrawal as dbAdminRejectWithdrawal,
  confirmFundReceipt as dbConfirmFundReceipt,
  getSiteVisitCost as dbGetSiteVisitCost,
  assignSiteVisitCost as dbAssignSiteVisitCost,
  updateSiteVisitCost as dbUpdateSiteVisitCost,
  addRetainerToWallet as dbAddRetainerToWallet,
  processMonthlyRetainers as dbProcessMonthlyRetainers,
  listWallets as dbListWallets,
  adminAdjustBalance as dbAdminAdjustBalance,
  adminListWithdrawalRequests as dbAdminListWithdrawalRequests,
} from '@/repositories/wallet/walletRepository';
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

// Module-level Set to track in-flight fee additions and prevent race conditions
const pendingFeeAdditions = new Set<string>();

const WALLET_MUTATION_TIMEOUT_MS = 15000;

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
      await dbCreateWithdrawalRequest({
        userId: currentUser.id,
        walletId: wallet.id,
        amount,
        reason,
        paymentMethod,
      });
      toast({ title: 'Withdrawal Request Submitted', description: 'Your request is pending supervisor approval' });
      await invalidate.invalidateAll(userId);
    } catch (error: any) {
      console.error('Failed to create withdrawal request:', error);
      toast({ title: 'Error', description: 'Failed to submit withdrawal request', variant: 'destructive' });
    }
  };

  const cancelWithdrawalRequest = async (requestId: string) => {
    const session = await ensureValidSession();
    if (!session.success) return;

    try {
      await dbCancelWithdrawalRequest(requestId);
      toast({ title: 'Request Cancelled', description: 'Your withdrawal request has been cancelled' });
      await invalidate.invalidateAll(userId);
    } catch (error: any) {
      console.error('Failed to cancel withdrawal request:', error);
      toast({ title: 'Error', description: 'Failed to cancel withdrawal request', variant: 'destructive' });
    }
  };

  const approveWithdrawalRequest = async (requestId: string, notes?: string) => {
    if (!currentUser?.id) return;

    const session = await ensureValidSession();
    if (!session.success) {
      toast({ title: 'Session may have expired', description: session.error || 'Please refresh and try again.', variant: 'destructive' });
      return;
    }

    try {
      await withTimeout(
        (async () => {
          const { userId: requestUserId, amount } = await dbApproveWithdrawalRequest(requestId, currentUser.id, notes);
          toast({ title: 'Withdrawal Approved by Supervisor', description: 'The request has been forwarded to Finance for processing' });
          NotificationTriggerService.withdrawalStatusChanged(requestUserId, 'pending_final', amount);
          await invalidate.invalidateAll(userId);
        })(),
        WALLET_MUTATION_TIMEOUT_MS,
        'Request timed out. Please try again or refresh the page.',
      );
    } catch (error: any) {
      console.error('Failed to approve withdrawal:', error);
      toast({ title: 'Error', description: error.message || 'Failed to approve withdrawal request', variant: 'destructive' });
    }
  };

  const adminProcessWithdrawal = async (requestId: string, notes?: string) => {
    if (!currentUser?.id) return;

    const session = await ensureValidSession();
    if (!session.success) {
      toast({ title: 'Session may have expired', description: session.error || 'Please refresh and try again.', variant: 'destructive' });
      return;
    }

    try {
      await withTimeout(
        (async () => {
          const { userId: requestUserId, amount } = await dbAdminProcessWithdrawal(requestId, currentUser.id, notes);
          toast({ title: 'Withdrawal Processed', description: 'Payment processed. The recipient will be asked to confirm receipt.' });
          NotificationTriggerService.withdrawalStatusChanged(requestUserId, 'approved', amount);
          await invalidate.invalidateAll(userId);
        })(),
        WALLET_MUTATION_TIMEOUT_MS,
        'Request timed out. Please try again or refresh the page.',
      );
    } catch (error: any) {
      console.error('Failed to process withdrawal:', error);
      toast({ title: 'Error', description: error.message || 'Failed to process withdrawal', variant: 'destructive' });
    }
  };

  const adminRejectWithdrawal = async (requestId: string, notes: string) => {
    if (!currentUser?.id) return;

    const session = await ensureValidSession();
    if (!session.success) {
      toast({ title: 'Session may have expired', description: session.error || 'Please refresh and try again.', variant: 'destructive' });
      return;
    }

    try {
      await withTimeout(
        (async () => {
          const { userId: requestUserId, amount } = await dbAdminRejectWithdrawal(requestId, currentUser.id, notes);
          toast({ title: 'Withdrawal Rejected by Finance', description: 'The withdrawal request has been rejected' });
          NotificationTriggerService.withdrawalStatusChanged(requestUserId, 'rejected', amount);
          await invalidate.invalidateAll(userId);
        })(),
        WALLET_MUTATION_TIMEOUT_MS,
        'Request timed out. Please try again or refresh the page.',
      );
    } catch (error: any) {
      console.error('Failed to reject withdrawal:', error);
      toast({ title: 'Error', description: error.message || 'Failed to reject withdrawal request', variant: 'destructive' });
    }
  };

  const rejectWithdrawalRequest = async (requestId: string, notes: string) => {
    if (!currentUser?.id) return;

    const session = await ensureValidSession();
    if (!session.success) {
      toast({ title: 'Session may have expired', description: session.error || 'Please refresh and try again.', variant: 'destructive' });
      return;
    }

    try {
      await withTimeout(
        (async () => {
          const { userId: requestUserId, amount } = await dbRejectWithdrawalRequest(requestId, currentUser.id, notes);
          toast({ title: 'Withdrawal Rejected', description: 'The withdrawal request has been rejected' });
          if (requestUserId) NotificationTriggerService.withdrawalStatusChanged(requestUserId, 'rejected', amount);
          await invalidate.invalidateAll(userId);
        })(),
        WALLET_MUTATION_TIMEOUT_MS,
        'Request timed out. Please try again or refresh the page.',
      );
    } catch (error: any) {
      console.error('Failed to reject withdrawal:', error);
      toast({ title: 'Error', description: error.message || 'Failed to reject withdrawal request', variant: 'destructive' });
    }
  };

  const confirmFundReceipt = async (requestId: string, signatureData: { signatureId: string; signatureHash: string; signatureMethod: string; signedAt: string; notes?: string }) => {
    if (!currentUser?.id) return;

    const session = await ensureValidSession();
    if (!session.success) {
      toast({ title: 'Session may have expired', description: session.error || 'Please refresh and try again.', variant: 'destructive' });
      return;
    }

    try {
      await withTimeout(
        (async () => {
          const confirmedByName = currentUser.fullName || currentUser.email || '';
          const { userId: requestUserId, amount } = await dbConfirmFundReceipt(requestId, currentUser.id, confirmedByName, signatureData);
          toast({ title: 'تم تأكيد الاستلام / Fund Receipt Confirmed', description: 'You have confirmed receiving the funds with your digital signature.' });
          NotificationTriggerService.withdrawalStatusChanged(requestUserId, 'approved', amount);
          await invalidate.invalidateWithdrawalRequests(userId);
        })(),
        WALLET_MUTATION_TIMEOUT_MS,
        'Request timed out. Please try again or refresh the page.',
      );
    } catch (error: any) {
      console.error('Failed to confirm fund receipt:', error);
      toast({ title: 'Error', description: error.message || 'Failed to confirm fund receipt', variant: 'destructive' });
    }
  };

  const getBalance = (currency: string = 'SDG'): number => {
    if (!wallet) return 0;
    return wallet.balances[currency] ?? 0;
  };

  const getSiteVisitCost = async (siteVisitId: string): Promise<SiteVisitCost | null> => {
    try {
      return await dbGetSiteVisitCost(siteVisitId);
    } catch (error: any) {
      console.error('Failed to fetch site visit cost:', error);
      return null;
    }
  };

  const assignSiteVisitCost = async (siteVisitId: string, costs: Partial<SiteVisitCost>) => {
    if (!currentUser?.id) return;
    try {
      await dbAssignSiteVisitCost(siteVisitId, costs, currentUser.id);
      toast({ title: 'Cost Assigned', description: 'Site visit cost has been assigned successfully' });
    } catch (error: any) {
      console.error('Failed to assign site visit cost:', error);
      toast({ title: 'Error', description: 'Failed to assign site visit cost', variant: 'destructive' });
    }
  };

  const updateSiteVisitCost = async (costId: string, costs: Partial<SiteVisitCost>) => {
    if (!currentUser?.id) return;
    try {
      await dbUpdateSiteVisitCost(costId, costs, currentUser.id);
      toast({ title: 'Cost Updated', description: 'Site visit cost has been updated successfully' });
    } catch (error: any) {
      console.error('Failed to update site visit cost:', error);
      toast({ title: 'Error', description: 'Failed to update site visit cost', variant: 'destructive' });
    }
  };

  const calculateClassificationFee = async (userId: string, complexityMultiplier: number = 1.0): Promise<number> => {
    try {
      const classification = getUserClassification(userId);
      if (!classification) {
        console.warn(`No classification found for user ${userId}, using default fee of 50 SDG`);
        return 50;
      }
      const feeStructure = getActiveFeeStructure(classification.classificationLevel, classification.roleScope);
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
      // Fetch from mmp_site_entries for additional validations
      const { data: entry, error: entryError } = await supabase
        .from('mmp_site_entries')
        .select('site_name, site_code, status, accepted_by, enumerator_fee, transport_fee, cost, visit_completed_at, visit_date')
        .eq('id', siteVisitId)
        .single();

      if (entryError) {
        console.error(`[Wallet] Failed to fetch site entry: ${entryError.message}`);
        toast({ title: 'Site Visit Not Found', description: 'Cannot add fee - site visit record not found or inaccessible.', variant: 'destructive' });
        throw new Error(`Site entry fetch failed: ${entryError.message}`);
      }

      if (!entry) {
        console.error(`[Wallet] Site entry is null for ${siteVisitId}`);
        toast({ title: 'Site Visit Not Found', description: 'Cannot add fee - site visit record not found.', variant: 'destructive' });
        throw new Error('Site entry is null');
      }

      if (!entry.site_code) {
        console.error(`[Wallet] Site entry ${siteVisitId} missing site_code - cannot verify uniqueness`);
        toast({ title: 'Data Integrity Issue', description: 'Site visit is missing site code. Cannot verify uniqueness for fee.', variant: 'destructive' });
        throw new Error('Site entry missing site_code - cannot verify uniqueness');
      }

      let duplicateVisits: any[] = [];
      let dupError: any = null;

      if (entry.visit_completed_at) {
        const visitDate = new Date(entry.visit_completed_at);
        const weekStart = new Date(visitDate);
        weekStart.setDate(visitDate.getDate() - visitDate.getDay());
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);

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
      }

      if (dupError) {
        console.error(`[Wallet] Failed to check for duplicate visits: ${dupError.message}`);
        toast({ title: 'Validation Failed', description: 'Cannot verify if site was already visited this week. Please try again.', variant: 'destructive' });
        throw new Error(`Duplicate visit check failed: ${dupError.message}`);
      }

      if (duplicateVisits && duplicateVisits.length > 0) {
        console.warn(`[Wallet] Duplicate site visit detected in same week for site ${entry.site_code}`);
        toast({ title: 'Duplicate Site Visit', description: `Site "${entry.site_name}" was already visited this week. Cannot add fee twice.`, variant: 'destructive' });
        return;
      }

      let amount: number | undefined;
      let description: string | undefined;

      const storedEnumFee = Number(entry.enumerator_fee) || 0;
      const storedTransportFee = Number(entry.transport_fee) || 0;
      const storedCost = Number(entry.cost) || 0;
      const calculatedFromFees = storedEnumFee + storedTransportFee;

      if (calculatedFromFees > 0) {
        amount = calculatedFromFees;
        description = `Site visit completed: ${entry.site_name || 'Site'}`;
      } else if (storedCost > 0) {
        amount = storedCost;
        description = `Site visit completed: ${entry.site_name || 'Site'}`;
      } else {
        amount = await calculateClassificationFee(userId, complexityMultiplier);
        description = `Site visit fee (${complexityMultiplier}x complexity)`;
      }

      const result = await createSiteVisitWalletTransaction({
        siteVisitId,
        userId,
        amount,
        description,
        showNotifications: true,
        toast,
      });

      if (result.success) {
        if (userId === currentUser?.id) {
          await invalidate.invalidateWallet(userId);
          await invalidate.invalidateTransactions(userId);
        }
      } else {
        console.error(`[Wallet] Failed to create wallet transaction: ${result.message}`);
        throw new Error(result.message);
      }
    } catch (error: any) {
      console.error('Failed to add site visit fee:', error);
      throw error;
    } finally {
      pendingFeeAdditions.delete(`${userId}-${siteVisitId}`);
    }
  };

  const reconcileSiteVisitFee = async (siteVisitId: string): Promise<{ success: boolean; message: string }> => {
    try {
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

      const userIdToPay = entry.accepted_by || entry.visit_completed_by;
      if (!userIdToPay) {
        return { success: false, message: 'Site has no user assigned (checked accepted_by, visit_completed_by)' };
      }

      const { data: existingTx } = await supabase
        .from('wallet_transactions')
        .select('id, amount')
        .eq('site_visit_id', siteVisitId)
        .eq('type', 'earning')
        .maybeSingle();

      if (existingTx) {
        return { success: false, message: `Fee already recorded: ${existingTx.amount} SDG (Transaction: ${existingTx.id})` };
      }

      const enumFeePart = Number(entry.enumerator_fee) || 0;
      const transportFeePart = Number(entry.transport_fee) || 0;
      const calculatedFromParts = enumFeePart + transportFeePart;
      const cost = calculatedFromParts > 0 ? calculatedFromParts : (Number(entry.cost) || 0);

      if (cost <= 0) {
        return { success: false, message: 'Site has no fee assigned (cost is 0)' };
      }

      await addSiteVisitFeeToWallet(userIdToPay, siteVisitId, 1.0);
      return { success: true, message: `Successfully added ${cost} SDG to wallet for site "${entry.site_name || 'Unknown'}"` };
    } catch (error: any) {
      console.error('[Wallet Reconciliation] Error:', error);
      return { success: false, message: `Failed to reconcile: ${error.message}` };
    }
  };

  const addRetainerToWallet = async (userId: string, amountCents: number, currency: string, period: string) => {
    try {
      await dbAddRetainerToWallet(userId, amountCents, currency, period, currentUser?.id);
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
      const result = await dbProcessMonthlyRetainers();
      toast({
        title: 'Retainer Processing Complete',
        description: `Processed ${result.processed} of ${result.total} retainers. ${result.failed} failed.`,
      });
      return result;
    } catch (error: any) {
      console.error('Failed to process monthly retainers:', error);
      toast({ title: 'Error', description: 'Failed to process monthly retainers', variant: 'destructive' });
      throw error;
    }
  };

  const listWallets = async (): Promise<Wallet[]> => {
    try {
      return await dbListWallets();
    } catch (error: any) {
      console.error('Failed to list wallets:', error);
      return [];
    }
  };

  const adminAdjustBalance = async (
    targetUserId: string,
    amount: number,
    currency: string,
    reason: string,
    adjustmentType: 'credit' | 'debit',
  ) => {
    if (!currentUser?.id) throw new Error('Admin user not authenticated');

    try {
      const { txId } = await dbAdminAdjustBalance({ targetUserId, adminId: currentUser.id, amount, currency, reason, adjustmentType });

      try {
        if (adjustmentType === 'credit') {
          await NotificationTriggerService.walletCredited(targetUserId, amount, currency, `Admin credit: ${reason}`, txId);
        } else {
          await NotificationTriggerService.walletDebited(targetUserId, amount, currency, `Admin debit: ${reason}`, txId);
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
      toast({ title: 'Error', description: error.message || 'Failed to adjust balance', variant: 'destructive' });
      throw error;
    }
  };

  const adminListWithdrawalRequests = async (): Promise<AdminWithdrawalRequest[]> => {
    try {
      return await dbAdminListWithdrawalRequests();
    } catch (error: any) {
      console.error('Failed to list withdrawal requests:', error);
      return [];
    }
  };

  const listSupervisedWithdrawalRequests = async (): Promise<SupervisedWithdrawalRequest[]> => {
    if (!currentUser?.id) return [];
    try {
      return await fetchSupervisedWithdrawalRequests(userForSupervised!);
    } catch (error: any) {
      console.error('Failed to list supervised withdrawal requests:', error);
      return [];
    }
  };

  // ─── Realtime subscriptions ───────────────────────────────────────────────

  useEffect(() => {
    if (!currentUser?.id || !userId) return;

    const userRole = currentUser.role?.toLowerCase();
    const isSupervisorRole = userRole === 'supervisor' || userRole === 'hubsupervisor' || userRole === 'fom';
    const isAdmin = userRole === 'admin' || userRole === 'financialadmin';

    const walletChannel = supabase
      .channel('wallet_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets', filter: `user_id=eq.${currentUser.id}` }, () => {
        queryClient.invalidateQueries({ queryKey: walletQueryKeys.wallet(userId) });
        setLastRefresh(new Date());
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallet_transactions', filter: `user_id=eq.${currentUser.id}` }, () => {
        queryClient.invalidateQueries({ queryKey: walletQueryKeys.transactions(userId) });
        setLastRefresh(new Date());
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'withdrawal_requests', filter: `user_id=eq.${currentUser.id}` }, () => {
        queryClient.invalidateQueries({ queryKey: walletQueryKeys.withdrawalRequests(userId) });
        setLastRefresh(new Date());
      })
      .subscribe();

    let supervisorChannel: ReturnType<typeof supabase.channel> | null = null;
    if (isSupervisorRole || isAdmin) {
      supervisorChannel = supabase
        .channel('supervisor_withdrawal_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'withdrawal_requests' }, () => {
          queryClient.invalidateQueries({ queryKey: walletQueryKeys.supervisedWithdrawalRequests(userId) });
          setLastRefresh(new Date());
        })
        .subscribe();
    }

    return () => {
      supabase.removeChannel(walletChannel);
      if (supervisorChannel) supabase.removeChannel(supervisorChannel);
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
