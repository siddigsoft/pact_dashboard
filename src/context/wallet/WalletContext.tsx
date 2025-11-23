import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/context/user/UserContext';
import { useClassification } from '@/context/classification/ClassificationContext';
import type {
  Wallet,
  WalletTransaction,
  WithdrawalRequest,
  SiteVisitCost,
  WalletStats,
} from '@/types/wallet';

interface WalletContextType {
  wallet: Wallet | null;
  transactions: WalletTransaction[];
  withdrawalRequests: WithdrawalRequest[];
  stats: WalletStats | null;
  loading: boolean;
  refreshWallet: () => Promise<void>;
  refreshTransactions: () => Promise<void>;
  refreshWithdrawalRequests: () => Promise<void>;
  createWithdrawalRequest: (amount: number, reason: string, paymentMethod?: string) => Promise<void>;
  cancelWithdrawalRequest: (requestId: string) => Promise<void>;
  approveWithdrawalRequest: (requestId: string, notes?: string) => Promise<void>;
  rejectWithdrawalRequest: (requestId: string, notes: string) => Promise<void>;
  getBalance: (currency?: string) => number;
  getSiteVisitCost: (siteVisitId: string) => Promise<SiteVisitCost | null>;
  assignSiteVisitCost: (siteVisitId: string, costs: Partial<SiteVisitCost>) => Promise<void>;
  updateSiteVisitCost: (costId: string, costs: Partial<SiteVisitCost>) => Promise<void>;
  addSiteVisitFeeToWallet: (userId: string, siteVisitId: string, complexityMultiplier?: number) => Promise<void>;
  calculateClassificationFee: (userId: string, complexityMultiplier?: number) => Promise<number>;
  listWallets: () => Promise<Wallet[]>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

function transformWalletFromDB(data: any): Wallet {
  return {
    id: data.id,
    userId: data.user_id,
    balances: data.balances || { SDG: 0 },
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

export function WalletProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const { getUserClassification, getActiveFeeStructure } = useClassification();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [withdrawalRequests, setWithdrawalRequests] = useState<WithdrawalRequest[]>([]);
  const [stats, setStats] = useState<WalletStats | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshWallet = async () => {
    if (!currentUser?.id) return;

    try {
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
      toast({
        title: 'Error',
        description: 'Failed to load wallet information',
        variant: 'destructive',
      });
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
      t => t.type === 'site_visit_fee'
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

      await refreshWithdrawalRequests();
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

      await refreshWithdrawalRequests();
    } catch (error: any) {
      console.error('Failed to cancel withdrawal request:', error);
      toast({
        title: 'Error',
        description: 'Failed to cancel withdrawal request',
        variant: 'destructive',
      });
    }
  };

  const approveWithdrawalRequest = async (requestId: string, notes?: string) => {
    if (!currentUser?.id) return;

    try {
      const request = withdrawalRequests.find(r => r.id === requestId);
      if (!request) throw new Error('Request not found');

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

      const newBalances = {
        ...requestWallet.balances,
        [request.currency]: currentBalance - request.amount,
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

      const { error: transactionError } = await supabase.from('wallet_transactions').insert({
        wallet_id: request.walletId,
        user_id: request.userId,
        type: 'withdrawal',
        amount: -request.amount,
        currency: request.currency,
        withdrawal_request_id: requestId,
        description: `Withdrawal approved: ${notes || 'N/A'}`,
        balance_before: currentBalance,
        balance_after: currentBalance - request.amount,
        created_by: currentUser.id,
      });

      if (transactionError) throw transactionError;

      const { error: requestError } = await supabase
        .from('withdrawal_requests')
        .update({
          status: 'approved',
          supervisor_id: currentUser.id,
          supervisor_notes: notes,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (requestError) throw requestError;

      toast({
        title: 'Withdrawal Approved',
        description: 'The withdrawal request has been approved and processed',
      });

      await Promise.all([refreshWallet(), refreshTransactions(), refreshWithdrawalRequests()]);
    } catch (error: any) {
      console.error('Failed to approve withdrawal:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to approve withdrawal request',
        variant: 'destructive',
      });
    }
  };

  const rejectWithdrawalRequest = async (requestId: string, notes: string) => {
    if (!currentUser?.id) return;

    try {
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

      await refreshWithdrawalRequests();
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
        console.warn(`No classification found for user ${userId}, using default fee`);
        return 5000;
      }

      const feeStructure = getActiveFeeStructure(
        classification.classificationLevel,
        classification.roleScope
      );

      if (!feeStructure) {
        console.warn(`No fee structure found for ${classification.classificationLevel}/${classification.roleScope}, using default fee`);
        return 5000;
      }

      const baseFeeCents = feeStructure.siteVisitBaseFeeCents;
      const transportFeeCents = feeStructure.siteVisitTransportFeeCents;
      const multiplier = complexityMultiplier * feeStructure.complexityMultiplier;
      
      const totalCents = Math.round((baseFeeCents + transportFeeCents) * multiplier);
      const totalSDG = totalCents / 100;

      return totalSDG;
    } catch (error: any) {
      console.error('Failed to calculate classification fee:', error);
      return 5000;
    }
  };

  const addSiteVisitFeeToWallet = async (userId: string, siteVisitId: string, complexityMultiplier: number = 1.0) => {
    try {
      const amount = await calculateClassificationFee(userId, complexityMultiplier);

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
            type: 'site_visit_fee',
            amount,
            currency: 'SDG',
            site_visit_id: siteVisitId,
            description: `Site visit fee (${complexityMultiplier}x complexity)`,
            balance_before: 0,
            balance_after: amount,
            created_by: currentUser?.id,
          });

          return;
        }
        throw walletError;
      }

      const currentBalance = targetWallet.balances.SDG || 0;
      const newBalance = currentBalance + amount;
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
        type: 'site_visit_fee',
        amount,
        currency: 'SDG',
        site_visit_id: siteVisitId,
        description: `Site visit fee (${complexityMultiplier}x complexity)`,
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

  useEffect(() => {
    const initWallet = async () => {
      if (!currentUser?.id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      await Promise.all([refreshWallet(), refreshTransactions(), refreshWithdrawalRequests()]);
      setLoading(false);
    };

    initWallet();
  }, [currentUser?.id]);

  useEffect(() => {
    calculateStats();
  }, [wallet, transactions, withdrawalRequests]);

  useEffect(() => {
    if (!currentUser?.id) return;

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
          refreshWithdrawalRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(walletChannel);
    };
  }, [currentUser?.id]);

  return (
    <WalletContext.Provider
      value={{
        wallet,
        transactions,
        withdrawalRequests,
        stats,
        loading,
        refreshWallet,
        refreshTransactions,
        refreshWithdrawalRequests,
        createWithdrawalRequest,
        cancelWithdrawalRequest,
        approveWithdrawalRequest,
        rejectWithdrawalRequest,
        getBalance,
        getSiteVisitCost,
        assignSiteVisitCost,
        updateSiteVisitCost,
        addSiteVisitFeeToWallet,
        calculateClassificationFee,
        listWallets,
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
