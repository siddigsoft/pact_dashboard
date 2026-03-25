/**
 * React Query keys and hooks for Budget data.
 * Fetch logic lives in budgetRepository — this file owns only the hooks and cache keys.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchProjectBudgets,
  fetchMMPBudgets,
  fetchBudgetTransactions,
  fetchBudgetAlerts,
  transformProjectBudgetFromDB,
  transformMMPBudgetFromDB,
} from '@/features/budget/repository/budgetRepository';

export { transformProjectBudgetFromDB, transformMMPBudgetFromDB };

export const budgetQueryKeys = {
  all: ['budget'] as const,
  projectBudgets: () => [...budgetQueryKeys.all, 'project'] as const,
  mmpBudgets: () => [...budgetQueryKeys.all, 'mmp'] as const,
  transactions: () => [...budgetQueryKeys.all, 'transactions'] as const,
  alerts: () => [...budgetQueryKeys.all, 'alerts'] as const,
};

const STALE_MS = 60 * 1000;

export function useProjectBudgetsQuery(enabled = true) {
  return useQuery({
    queryKey: budgetQueryKeys.projectBudgets(),
    queryFn: fetchProjectBudgets,
    staleTime: STALE_MS,
    placeholderData: (prev) => prev,
    enabled,
  });
}

export function useMMPBudgetsQuery(enabled = true) {
  return useQuery({
    queryKey: budgetQueryKeys.mmpBudgets(),
    queryFn: fetchMMPBudgets,
    staleTime: STALE_MS,
    placeholderData: (prev) => prev,
    enabled,
  });
}

export function useBudgetTransactionsQuery(enabled = true) {
  return useQuery({
    queryKey: budgetQueryKeys.transactions(),
    queryFn: fetchBudgetTransactions,
    staleTime: STALE_MS,
    placeholderData: (prev) => prev,
    enabled,
  });
}

export function useBudgetAlertsQuery(enabled = true) {
  return useQuery({
    queryKey: budgetQueryKeys.alerts(),
    queryFn: fetchBudgetAlerts,
    staleTime: STALE_MS,
    placeholderData: (prev) => prev,
    enabled,
  });
}

export function useInvalidateBudgetQueries() {
  const queryClient = useQueryClient();
  return {
    invalidateAll: () => queryClient.invalidateQueries({ queryKey: budgetQueryKeys.all }),
    invalidateProjectBudgets: () => queryClient.invalidateQueries({ queryKey: budgetQueryKeys.projectBudgets() }),
    invalidateMMPBudgets: () => queryClient.invalidateQueries({ queryKey: budgetQueryKeys.mmpBudgets() }),
    invalidateTransactions: () => queryClient.invalidateQueries({ queryKey: budgetQueryKeys.transactions() }),
    invalidateAlerts: () => queryClient.invalidateQueries({ queryKey: budgetQueryKeys.alerts() }),
  };
}
