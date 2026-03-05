/**
 * React Query keys and hooks for Wallet data.
 * Provides cached, deduplicated fetches for wallet, transactions, and withdrawal requests.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  Wallet,
  WalletTransaction,
  WithdrawalRequest,
  SupervisedWithdrawalRequest,
} from '@/types/wallet';

/** Minimal user shape for supervised withdrawal fetch */
export interface UserForWallet {
  id: string;
  hubId?: string | null;
  secondaryHubId?: string | null;
  stateId?: string | null;
  role?: string | null;
}

export const walletQueryKeys = {
  all: ['wallet'] as const,
  wallet: (userId: string) => ['wallet', 'balance', userId] as const,
  transactions: (userId: string) => ['wallet-transactions', userId] as const,
  withdrawalRequests: (userId: string) => ['withdrawal-requests', userId] as const,
  supervisedWithdrawalRequests: (userId: string) => ['supervised-withdrawal-requests', userId] as const,
  disbursedAdvanceRequestIds: (userId: string) => ['disbursed-advance-request-ids', userId] as const,
};

function transformWalletFromDB(data: any): Wallet {
  let balances = data.balances || { SDG: 0 };
  if (typeof balances === 'string') {
    try {
      balances = JSON.parse(balances);
    } catch {
      balances = { SDG: 0 };
    }
  }
  if (balances.SDG !== undefined) {
    balances.SDG = Number(balances.SDG) || 0;
  }
  return {
    id: data.id,
    userId: data.user_id,
    balances,
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

async function fetchWallet(userId: string): Promise<Wallet | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data, error } = await supabase
    .from('wallets')
    .select('id, user_id, balances, total_earned, total_withdrawn, created_at, updated_at')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      const { data: newWallet, error: createError } = await supabase
        .from('wallets')
        .insert({ user_id: userId, balances: { SDG: 0 } })
        .select()
        .single();
      if (createError) throw createError;
      return transformWalletFromDB(newWallet);
    }
    throw error;
  }
  return transformWalletFromDB(data);
}

async function fetchTransactions(userId: string): Promise<WalletTransaction[]> {
  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('id, wallet_id, user_id, type, amount, currency, site_visit_id, withdrawal_request_id, description, metadata, balance_before, balance_after, created_by, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;
  return (data || []).map(transformTransactionFromDB);
}

async function fetchWithdrawalRequests(userId: string): Promise<WithdrawalRequest[]> {
  const { data, error } = await supabase
    .from('withdrawal_requests')
    .select('id, user_id, wallet_id, amount, currency, status, request_reason, supervisor_id, supervisor_notes, approved_at, rejected_at, admin_processed_by, admin_processed_at, admin_notes, payment_method, payment_details, fund_receipt_confirmed, fund_receipt_confirmed_at, fund_receipt_signature_url, fund_receipt_notes, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(transformWithdrawalRequestFromDB);
}

/** IDs of down_payment_requests in approved/fully_paid/partially_paid (disbursed advances). */
async function fetchDisbursedAdvanceRequestIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('down_payment_requests')
    .select('id')
    .eq('requested_by', userId)
    .in('status', ['approved', 'fully_paid', 'partially_paid']);

  if (error) return [];
  return (data || []).map((r: { id: string }) => r.id);
}

async function fetchSupervisedWithdrawalRequests(user: UserForWallet): Promise<SupervisedWithdrawalRequest[]> {
  const userRole = user.role?.toLowerCase();
  const isSupervisorRole = userRole === 'supervisor' || userRole === 'hubsupervisor' || userRole === 'fom';
  const isAdmin = userRole === 'admin' || userRole === 'financialadmin';

  if (!isSupervisorRole && !isAdmin) return [];

  if (isAdmin) {
    const { data, error } = await supabase
      .from('withdrawal_requests')
      .select(`
        id, user_id, wallet_id, amount, currency, status, request_reason, supervisor_id, supervisor_notes, approved_at, rejected_at, admin_processed_by, admin_processed_at, admin_notes, payment_method, payment_details, fund_receipt_confirmed, fund_receipt_confirmed_at, fund_receipt_signature_url, fund_receipt_notes, created_at, updated_at,
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

  const supervisorHubId = user.hubId;
  const supervisorSecondaryHubId = user.secondaryHubId;
  const supervisorStateId = user.stateId;

  if (!supervisorHubId && !supervisorStateId) return [];

  let hubFilter = `hub_id.eq.${supervisorHubId || 'none'},state_id.eq.${supervisorStateId || 'none'}`;
  if (supervisorSecondaryHubId) {
    hubFilter += `,hub_id.eq.${supervisorSecondaryHubId}`;
  }

  const { data: teamMembers, error: teamError } = await supabase
    .from('profiles')
    .select('id, full_name, email, hub_id, state_id, role')
    .or(hubFilter);

  if (teamError) return [];

  const teamMemberIds = (teamMembers || [])
    .map((m: any) => m.id)
    .filter((id: string) => id !== user.id);

  if (teamMemberIds.length === 0) return [];

  const { data, error } = await supabase
    .from('withdrawal_requests')
    .select(`
      id, user_id, wallet_id, amount, currency, status, request_reason, supervisor_id, supervisor_notes, approved_at, rejected_at, admin_processed_by, admin_processed_at, admin_notes, payment_method, payment_details, fund_receipt_confirmed, fund_receipt_confirmed_at, fund_receipt_signature_url, fund_receipt_notes, created_at, updated_at,
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
}

const STALE_MS = 30 * 1000;

export function useWalletQuery(userId: string | undefined) {
  return useQuery({
    queryKey: walletQueryKeys.wallet(userId!),
    queryFn: () => fetchWallet(userId!),
    staleTime: STALE_MS,
    placeholderData: (prev) => prev,
    enabled: !!userId,
  });
}

export function useTransactionsQuery(userId: string | undefined) {
  return useQuery({
    queryKey: walletQueryKeys.transactions(userId!),
    queryFn: () => fetchTransactions(userId!),
    staleTime: STALE_MS,
    placeholderData: (prev) => prev,
    enabled: !!userId,
  });
}

export function useWithdrawalRequestsQuery(userId: string | undefined) {
  return useQuery({
    queryKey: walletQueryKeys.withdrawalRequests(userId!),
    queryFn: () => fetchWithdrawalRequests(userId!),
    staleTime: STALE_MS,
    placeholderData: (prev) => prev,
    enabled: !!userId,
  });
}

export function useDisbursedAdvanceRequestIdsQuery(userId: string | undefined) {
  return useQuery({
    queryKey: walletQueryKeys.disbursedAdvanceRequestIds(userId!),
    queryFn: () => fetchDisbursedAdvanceRequestIds(userId!),
    staleTime: STALE_MS,
    placeholderData: (prev) => prev,
    enabled: !!userId,
  });
}

export function useSupervisedWithdrawalRequestsQuery(user: UserForWallet | null) {
  const userRole = user?.role?.toLowerCase();
  const isSupervisorRole = userRole === 'supervisor' || userRole === 'hubsupervisor' || userRole === 'fom';
  const isAdmin = userRole === 'admin' || userRole === 'financialadmin';
  const enabled = !!user?.id && (isSupervisorRole || isAdmin);

  return useQuery({
    queryKey: walletQueryKeys.supervisedWithdrawalRequests(user?.id ?? ''),
    queryFn: () => fetchSupervisedWithdrawalRequests(user!),
    staleTime: STALE_MS,
    placeholderData: (prev) => prev,
    enabled,
  });
}

export function useInvalidateWalletQueries() {
  const queryClient = useQueryClient();
  return {
    invalidateWallet: (userId?: string) =>
      queryClient.invalidateQueries({ queryKey: userId ? walletQueryKeys.wallet(userId) : ['wallet'] }),
    invalidateTransactions: (userId?: string) =>
      queryClient.invalidateQueries({ queryKey: userId ? walletQueryKeys.transactions(userId) : ['wallet-transactions'] }),
    invalidateWithdrawalRequests: (userId?: string) =>
      queryClient.invalidateQueries({ queryKey: userId ? walletQueryKeys.withdrawalRequests(userId) : ['withdrawal-requests'] }),
    invalidateSupervised: (userId?: string) =>
      queryClient.invalidateQueries({ queryKey: userId ? walletQueryKeys.supervisedWithdrawalRequests(userId) : ['supervised-withdrawal-requests'] }),
    invalidateAll: (userId?: string) => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['withdrawal-requests'] });
      queryClient.invalidateQueries({ queryKey: ['supervised-withdrawal-requests'] });
      queryClient.invalidateQueries({ queryKey: ['disbursed-advance-request-ids'] });
    },
  };
}
