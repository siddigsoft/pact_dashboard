import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/context/user/UserContext';
import { useClassification } from '@/context/classification/ClassificationContext';
import { NotificationTriggerService } from '@/services/NotificationTriggerService';
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
  const { getUserClassification, getActiveFeeStructure } = useClassification();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [withdrawalRequests, setWithdrawalRequests] = useState<WithdrawalRequest[]>([]);
  const [supervisedWithdrawalRequests, setSupervisedWithdrawalRequests] = useState<SupervisedWithdrawalRequest[]>([]);
  const [stats, setStats] = useState<WalletStats | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshWallet = async (showErrorToast: boolean = false) => {
    if (!currentUser?.id) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data, error } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', currentUser.id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          const { data: newWallet, error: createError } = await supabase
            .from('wallets')
            .insert({ user_id: currentUser.id, balances: { SDG: 0 } })
            .select()
            .single();

          if (createError) throw createError;
          setWallet(transformWalletFromDB(newWallet));
        } else {
          throw error;
        }
      } else {
        setWallet(transformWalletFromDB(data));
      }
    } catch (error: any) {
      console.error('Failed to fetch wallet:', error);
      if (showErrorToast) {
        toast({
          title: 'Error',
          description: 'Failed to load wallet information',
          variant: 'destructive',
        });
      }
    }
  };

  const refreshTransactions = async () => {
    if (!currentUser?.id) return;

    try {
      const { data, error} = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setTransactions((data || []).map(transformTransactionFromDB));
    } catch (error: any) {
      console.error('Failed to fetch transactions:', error);
    }
  };

  const refreshWithdrawalRequests = async () => {
    if (!currentUser?.id) return;

    try {
      const { data, error } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false});

      if (error) throw error;
      setWithdrawalRequests((data || []).map(transformWithdrawalRequestFromDB));
    } catch (error: any) {
      console.error('Failed to fetch withdrawal requests:', error);
    }
  };

  const calculateStats = () => {
    if (!wallet || !transactions || !withdrawalRequests) return;

    const pendingWithdrawals = withdrawalRequests
      .filter(r => r.status === 'pending')
      .reduce((sum, r) => sum + r.amount, 0);

    const completedSiteVisits = transactions.filter(
      t => t.type === 'earning' || t.type === 'site_visit_fee'
    ).length;

    setStats({
      totalEarned: wallet.totalEarned,
      totalWithdrawn: wallet.totalWithdrawn,
      pendingWithdrawals,
      currentBalance: wallet.balances.SDG || 0,
      totalTransactions: transactions.length,
      completedSiteVisits,
    });
  };

  const createWithdrawalRequest = async (amount: number, reason: string, paymentMethod?: string) => {
    if (!currentUser?.id || !wallet) return;

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

      // Refresh both personal and supervised requests (supervisors will see new requests)
      await Promise.all([refreshWithdrawalRequests(), refreshSupervisedWithdrawalRequests()]);
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

      // Refresh both personal and supervised requests
      await Promise.all([refreshWithdrawalRequests(), refreshSupervisedWithdrawalRequests()]);
    } catch (error: any) {
      console.error('Failed to cancel withdrawal request:', error);
      toast({
        title: 'Error',
        description: 'Failed to cancel withdrawal request',
        variant: 'destructive',
      });
    }
  };

  // Step 1: Supervisor approval - moves request to 'supervisor_approved' status
  // Funds are NOT released at this stage - only verified by supervisor
  const approveWithdrawalRequest = async (requestId: string, notes?: string) => {
    if (!currentUser?.id) return;

    try {
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
      await Promise.all([refreshWithdrawalRequests(), refreshSupervisedWithdrawalRequests()]);
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

    try {
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
      const { error: requestError } = await supabase
        .from('withdrawal_requests')
        .update({
          status: 'approved',
          admin_processed_by: currentUser.id,
          admin_processed_at: new Date().toISOString(),
          admin_notes: notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (requestError) throw requestError;

      toast({
        title: 'Withdrawal Processed',
        description: 'The payment has been completed and funds released',
      });

      // Send email notification to the requester
      NotificationTriggerService.withdrawalStatusChanged(
        request.userId,
        'approved',
        request.amount
      );

      // Refresh all relevant data including supervised requests
      await Promise.all([refreshWallet(), refreshTransactions(), refreshWithdrawalRequests(), refreshSupervisedWithdrawalRequests()]);
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

    try {
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
      await Promise.all([refreshWithdrawalRequests(), refreshSupervisedWithdrawalRequests()]);
    } catch (error: any) {
      console.error('Failed to reject withdrawal:', error);
      toast({
        title: 'Error',
        description: 'Failed to reject withdrawal request',
        variant: 'destructive',
      });
    }
  };

  const rejectWithdrawalRequest = async (requestId: string, notes: string) => {
    if (!currentUser?.id) return;

    try {
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
      await Promise.all([refreshWithdrawalRequests(), refreshSupervisedWithdrawalRequests()]);
    } catch (error: any) {
      console.error('Failed to reject withdrawal:', error);
      toast({
        title: 'Error',
        description: 'Failed to reject withdrawal request',
        variant: 'destructive',
      });
    }
  };

  const getBalance = (currency: string = 'SDG'): number => {
    if (!wallet) return 0;
    return wallet.balances[currency] || 0;
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

      // Note: Despite the column name "siteVisitBaseFeeCents", fees are stored directly in SDG
      // This is a legacy naming convention - the values are already in SDG
      const baseFeeSDG = feeStructure.siteVisitBaseFeeCents;
      
      // Apply complexity multiplier and round to 2 decimal places
      const totalSDG = Math.round(baseFeeSDG * complexityMultiplier * 100) / 100;
      
      console.log(`📊 Classification fee calculated: ${baseFeeSDG} × ${complexityMultiplier} = ${totalSDG} SDG`);
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
      // VALIDATION 1: Check if fee was already added for this site visit (prevent duplicate fees)
      // Check both site_visit_id (from online completion) and reference_id (from offline sync)
      // Using separate queries for more reliable matching
      const { data: existingBySiteVisitId, error: check1Error } = await supabase
        .from('wallet_transactions')
        .select('id, amount')
        .eq('site_visit_id', siteVisitId)
        .in('type', ['earning', 'site_visit_fee']);
      
      const { data: existingByRefId, error: check2Error } = await supabase
        .from('wallet_transactions')
        .select('id, amount')
        .eq('reference_id', siteVisitId)
        .in('type', ['earning', 'site_visit_fee']);
      
      // Combine results
      const existingFees = [...(existingBySiteVisitId || []), ...(existingByRefId || [])];
      const feeCheckError = check1Error || check2Error;

      // CRITICAL: Abort if we cannot verify whether fee exists (fail-safe)
      if (feeCheckError) {
        console.error(`[Wallet] Failed to check for existing fees: ${feeCheckError.message}`);
        toast({
          title: 'Validation Failed',
          description: 'Cannot verify if fee was already recorded. Please try again.',
          variant: 'destructive',
        });
        throw new Error(`Fee check failed: ${feeCheckError.message}`);
      }

      // Block if any fee already exists for this site visit
      if (existingFees && existingFees.length > 0) {
        const totalExisting = existingFees.reduce((sum, f) => sum + Number(f.amount || 0), 0);
        console.warn(`[Wallet] Fee already recorded for site visit ${siteVisitId}: ${totalExisting} SDG (${existingFees.length} transaction(s))`);
        toast({
          title: 'Fee Already Recorded',
          description: `This site visit already has ${existingFees.length} fee transaction(s) totaling ${totalExisting} SDG.`,
          variant: 'destructive',
        });
        return;
      }

      // Fetch from mmp_site_entries (siteVisitId is the mmp_site_entries.id)
      const { data: entry, error: entryError } = await supabase
        .from('mmp_site_entries')
        .select('site_name, site_code, status, accepted_by, enumerator_fee, transport_fee, cost, visited_at')
        .eq('id', siteVisitId)
        .single();

      // CRITICAL: Abort if we cannot fetch site entry (fail-safe - no payment without validation)
      if (entryError) {
        // PGRST116 means "no rows found" - site visit doesn't exist
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

      // CRITICAL: Require visited_at for week-based deduplication - abort if missing
      if (!entry.visited_at) {
        console.error(`[Wallet] Site entry ${siteVisitId} missing visited_at - cannot verify week uniqueness`);
        toast({
          title: 'Data Integrity Issue',
          description: 'Site visit is missing visit date. Cannot verify uniqueness for fee.',
          variant: 'destructive',
        });
        throw new Error('Site entry missing visited_at - cannot verify week uniqueness');
      }

      // VALIDATION 2: Check if same site was visited in the same week (prevent duplicate site visits)
      const visitDate = new Date(entry.visited_at);
      const weekStart = new Date(visitDate);
      weekStart.setDate(visitDate.getDate() - visitDate.getDay()); // Start of week (Sunday)
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7); // End of week

      const { data: duplicateVisits, error: dupError } = await supabase
        .from('mmp_site_entries')
        .select('id, site_name, visited_at')
        .eq('site_code', entry.site_code)
        .eq('status', 'completed')
        .neq('id', siteVisitId)
        .gte('visited_at', weekStart.toISOString())
        .lt('visited_at', weekEnd.toISOString());

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
      
      let amount: number;
      let transportAmount: number = 0;
      let description: string;
      
      const storedEnumFee = Number(entry.enumerator_fee) || 0;
      const storedTransportFee = Number(entry.transport_fee) || 0;
      const storedCost = Number(entry.cost) || 0;
      
      // Use stored fees if available
      if (storedCost > 0 || storedEnumFee > 0) {
        amount = storedCost > 0 ? storedCost : (storedEnumFee + storedTransportFee);
        transportAmount = storedTransportFee;
        description = `Site visit fee: ${storedEnumFee} SDG enumerator + ${storedTransportFee} SDG transport`;
        console.log(`💰 Using stored fees for site entry ${siteVisitId}: ${amount} SDG`);
      } else {
        // Fallback to classification-based calculation
        amount = await calculateClassificationFee(userId, complexityMultiplier);
        description = `Site visit fee (${complexityMultiplier}x complexity)`;
        console.log(`💰 Using calculated fee for site entry ${siteVisitId}: ${amount} SDG`);
      }

      const { data: targetWallet, error: walletError } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (walletError) {
        if (walletError.code === 'PGRST116') {
          const { data: newWallet, error: createError } = await supabase
            .from('wallets')
            .insert({ user_id: userId, balances: { SDG: amount }, total_earned: amount })
            .select()
            .single();

          if (createError) throw createError;

          await supabase.from('wallet_transactions').insert({
            wallet_id: newWallet.id,
            user_id: userId,
            type: 'earning',
            amount,
            amount_cents: Math.round(amount * 100),
            currency: 'SDG',
            site_visit_id: siteVisitId,
            description,
            balance_before: 0,
            balance_after: amount,
            created_by: currentUser?.id,
          });

          return;
        }
        throw walletError;
      }

      const currentBalance = Number(targetWallet.balances?.SDG ?? 0) || 0;
      const newBalance = Number((currentBalance + Number(amount)).toFixed(2));
      const newBalances = { ...targetWallet.balances, SDG: newBalance };

      const { error: updateError } = await supabase
        .from('wallets')
        .update({
          balances: newBalances,
          total_earned: parseFloat(targetWallet.total_earned) + amount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', targetWallet.id);

      if (updateError) throw updateError;

      const { error: transactionError } = await supabase.from('wallet_transactions').insert({
        wallet_id: targetWallet.id,
        user_id: userId,
        type: 'earning',
        amount,
        amount_cents: Math.round(amount * 100),
        currency: 'SDG',
        site_visit_id: siteVisitId,
        description,
        balance_before: currentBalance,
        balance_after: newBalance,
        created_by: currentUser?.id,
      });

      if (transactionError) throw transactionError;

      if (userId === currentUser?.id) {
        await refreshWallet();
        await refreshTransactions();
      }
    } catch (error: any) {
      console.error('Failed to add site visit fee:', error);
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
        .select('id, site_name, status, accepted_by, enumerator_fee, transport_fee, cost')
        .eq('id', siteVisitId)
        .single();

      if (entryError || !entry) {
        return { success: false, message: `Site entry not found: ${entryError?.message || 'Unknown error'}` };
      }

      if ((entry.status || '').toLowerCase() !== 'completed') {
        return { success: false, message: `Site is not completed. Current status: ${entry.status}` };
      }

      if (!entry.accepted_by) {
        return { success: false, message: 'Site has no accepted/assigned user' };
      }

      // 2. Check if fee was already added (check for both old 'site_visit_fee' and new 'earning' types)
      const { data: existingTx, error: txError } = await supabase
        .from('wallet_transactions')
        .select('id, amount')
        .eq('site_visit_id', siteVisitId)
        .in('type', ['earning', 'site_visit_fee'])
        .maybeSingle();

      if (existingTx) {
        return { success: false, message: `Fee already recorded: ${existingTx.amount} SDG (Transaction: ${existingTx.id})` };
      }

      // 3. Add the fee to wallet
      const cost = Number(entry.cost) || (Number(entry.enumerator_fee) + Number(entry.transport_fee)) || 0;
      
      if (cost <= 0) {
        return { success: false, message: 'Site has no fee assigned (cost is 0)' };
      }

      console.log(`[Wallet Reconciliation] Adding fee of ${cost} SDG for site entry ${siteVisitId} to user ${entry.accepted_by}`);

      await addSiteVisitFeeToWallet(entry.accepted_by, siteVisitId, 1.0);

      return { success: true, message: `Successfully added ${cost} SDG to wallet for site "${entry.site_name}"` };
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

          await supabase.from('wallet_transactions').insert({
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
          });

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

      const { error: transactionError } = await supabase.from('wallet_transactions').insert({
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
      });

      if (transactionError) throw transactionError;

      if (userId === currentUser?.id) {
        await refreshWallet();
        await refreshTransactions();
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
          const { data: existingRetainer, error: checkError } = await supabase
            .from('wallet_transactions')
            .select('id')
            .eq('user_id', user.user_id)
            .eq('type', 'retainer')
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

          await supabase.from('wallet_transactions').insert({
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
          });

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

      const { error: transactionError } = await supabase.from('wallet_transactions').insert({
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
      });

      if (transactionError) throw transactionError;

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
       * - Kassala Hub: 5 states (kassala, gedaref, gezira, sennar, blue-nile)
       * - Dongola Hub: 2 states (northern, river-nile)
       * - Forchana Hub: 2 states (west-darfur, central-darfur)
       * - Country Office: 2 states (khartoum, red-sea)
       * 
       * Hub supervisors are assigned `hub_id` (NOT state_id) and see ALL team members
       * across ALL states within their hub. Team members need matching `hub_id` to appear.
       */
      const supervisorHubId = currentUser.hubId;
      const supervisorStateId = currentUser.stateId;

      if (!supervisorHubId && !supervisorStateId) {
        console.warn('[Wallet] Hub Supervisor has no hub_id assigned. Assign hub_id in User Management to see team members across all states in the hub.');
        return [];
      }

      // Query team members by hub_id (primary) or state_id (fallback for legacy support)
      // Hub supervisors should have hub_id set - they see ALL team members in ALL states of their hub
      const { data: teamMembers, error: teamError } = await supabase
        .from('profiles')
        .select('id, full_name, email, hub_id, state_id, role')
        .or(`hub_id.eq.${supervisorHubId || 'none'},state_id.eq.${supervisorStateId || 'none'}`);

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

  const refreshSupervisedWithdrawalRequests = async () => {
    const requests = await listSupervisedWithdrawalRequests();
    setSupervisedWithdrawalRequests(requests);
  };

  useEffect(() => {
    const initWallet = async () => {
      if (!authReady) {
        setLoading(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }

      if (!currentUser?.id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      const initPromises = [refreshWallet(), refreshTransactions(), refreshWithdrawalRequests()];
      
      const userRole = currentUser.role?.toLowerCase();
      const isSupervisorRole = userRole === 'supervisor' || userRole === 'hubsupervisor' || userRole === 'fom';
      const isAdmin = userRole === 'admin' || userRole === 'financialadmin';
      
      if (isSupervisorRole || isAdmin) {
        initPromises.push(refreshSupervisedWithdrawalRequests());
      }
      
      await Promise.all(initPromises);
      setLoading(false);
    };

    initWallet();
  }, [authReady, currentUser?.id]);

  useEffect(() => {
    calculateStats();
  }, [wallet, transactions, withdrawalRequests]);

  useEffect(() => {
    if (!currentUser?.id) return;

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
          console.log('[Wallet Realtime] Wallet updated');
          refreshWallet();
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
          console.log('[Wallet Realtime] Transactions updated');
          refreshTransactions();
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
          console.log('[Wallet Realtime] Withdrawal requests updated');
          refreshWithdrawalRequests();
        }
      )
      .subscribe((status) => {
        console.log('[Wallet Realtime] Channel status:', status);
      });

    // Supervisors/Admins: Subscribe to ALL withdrawal requests for real-time team updates
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
            console.log('[Wallet Realtime] Supervised withdrawal requests updated');
            refreshSupervisedWithdrawalRequests();
          }
        )
        .subscribe((status) => {
          console.log('[Wallet Realtime] Supervisor channel status:', status);
        });
    }

    return () => {
      supabase.removeChannel(walletChannel);
      if (supervisorChannel) {
        supabase.removeChannel(supervisorChannel);
      }
    };
  }, [currentUser?.id, currentUser?.role]);

  return (
    <WalletContext.Provider
      value={{
        wallet,
        transactions,
        withdrawalRequests,
        supervisedWithdrawalRequests,
        stats,
        loading,
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
