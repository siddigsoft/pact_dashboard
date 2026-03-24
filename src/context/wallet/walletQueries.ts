/**
 * React Query hooks for Wallet data.
 * Fetch logic and transforms live in walletRepository — this file owns only the hooks and cache keys.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchWallet,
  fetchTransactions,
  fetchWithdrawalRequests,
  fetchDisbursedAdvanceRequestIds,
  fetchSupervisedWithdrawalRequests,
} from '@/repositories/wallet/walletRepository';
import type { UserForWallet } from '@/repositories/wallet/walletRepository';

export type { UserForWallet };

export const walletQueryKeys = {
  all: ['wallet'] as const,
  wallet: (userId: string) => ['wallet', 'balance', userId] as const,
  transactions: (userId: string) => ['wallet-transactions', userId] as const,
  withdrawalRequests: (userId: string) => ['withdrawal-requests', userId] as const,
  supervisedWithdrawalRequests: (userId: string) => ['supervised-withdrawal-requests', userId] as const,
  disbursedAdvanceRequestIds: (userId: string) => ['disbursed-advance-request-ids', userId] as const,
};

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
    invalidateAll: (_userId?: string) => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['withdrawal-requests'] });
      queryClient.invalidateQueries({ queryKey: ['supervised-withdrawal-requests'] });
      queryClient.invalidateQueries({ queryKey: ['disbursed-advance-request-ids'] });
    },
  };
}
