/**
 * React Query keys and hooks for Budget data.
 * Provides cached, deduplicated fetches for budgets, transactions, and alerts.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  ProjectBudget,
  MMPBudget,
  BudgetTransaction,
  BudgetAlert,
} from '@/types/budget';

export const budgetQueryKeys = {
  all: ['budget'] as const,
  projectBudgets: () => [...budgetQueryKeys.all, 'project'] as const,
  mmpBudgets: () => [...budgetQueryKeys.all, 'mmp'] as const,
  transactions: () => [...budgetQueryKeys.all, 'transactions'] as const,
  alerts: () => [...budgetQueryKeys.all, 'alerts'] as const,
};

export function transformProjectBudgetFromDB(data: any): ProjectBudget {
  return {
    id: data.id,
    projectId: data.project_id,
    totalBudgetCents: parseInt(data.total_budget_cents || 0),
    allocatedBudgetCents: parseInt(data.allocated_budget_cents || 0),
    spentBudgetCents: parseInt(data.spent_budget_cents || 0),
    remainingBudgetCents: parseInt(data.remaining_budget_cents || 0),
    budgetPeriod: data.budget_period,
    periodStartDate: data.period_start_date,
    periodEndDate: data.period_end_date,
    categoryAllocations: data.category_allocations || {
      site_visits: 0,
      transportation: 0,
      accommodation: 0,
      meals: 0,
      equipment: 0,
      other: 0,
    },
    status: data.status,
    approvedBy: data.approved_by,
    approvedAt: data.approved_at,
    fiscalYear: data.fiscal_year,
    budgetNotes: data.budget_notes,
    createdBy: data.created_by,
    updatedBy: data.updated_by,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export function transformMMPBudgetFromDB(data: any): MMPBudget {
  return {
    id: data.id,
    mmpFileId: data.mmp_file_id,
    projectBudgetId: data.project_budget_id,
    allocatedBudgetCents: parseInt(data.allocated_budget_cents || 0),
    spentBudgetCents: parseInt(data.spent_budget_cents || 0),
    remainingBudgetCents: parseInt(data.remaining_budget_cents || 0),
    totalSites: data.total_sites || 0,
    budgetedSites: data.budgeted_sites || 0,
    completedSites: data.completed_sites || 0,
    averageCostPerSiteCents: parseInt(data.average_cost_per_site_cents || 0),
    categoryBreakdown: data.category_breakdown || {
      site_visit_fees: 0,
      transportation: 0,
      accommodation: 0,
      meals: 0,
      other: 0,
    },
    sourceType: data.source_type,
    parentBudgetId: data.parent_budget_id,
    status: data.status,
    budgetNotes: data.budget_notes,
    allocatedBy: data.allocated_by,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

function transformBudgetTransactionFromDB(data: any): BudgetTransaction {
  return {
    id: data.id,
    projectBudgetId: data.project_budget_id,
    mmpBudgetId: data.mmp_budget_id,
    siteVisitId: data.site_visit_id,
    walletTransactionId: data.wallet_transaction_id,
    transactionType: data.transaction_type,
    amountCents: parseInt(data.amount_cents),
    currency: data.currency,
    category: data.category,
    balanceBeforeCents: data.balance_before_cents ? parseInt(data.balance_before_cents) : undefined,
    balanceAfterCents: data.balance_after_cents ? parseInt(data.balance_after_cents) : undefined,
    description: data.description,
    metadata: data.metadata,
    referenceNumber: data.reference_number,
    requiresApproval: data.requires_approval,
    approvedBy: data.approved_by,
    approvedAt: data.approved_at,
    createdBy: data.created_by,
    createdAt: data.created_at,
  };
}

function transformBudgetAlertFromDB(data: any): BudgetAlert {
  return {
    id: data.id,
    projectBudgetId: data.project_budget_id,
    mmpBudgetId: data.mmp_budget_id,
    alertType: data.alert_type,
    severity: data.severity,
    thresholdPercentage: data.threshold_percentage,
    title: data.title,
    message: data.message,
    status: data.status,
    acknowledgedBy: data.acknowledged_by,
    acknowledgedAt: data.acknowledged_at,
    metadata: data.metadata,
    createdAt: data.created_at,
    resolvedAt: data.resolved_at,
  };
}

async function fetchProjectBudgets(): Promise<ProjectBudget[]> {
  const { data, error } = await supabase
    .from('project_budgets')
    .select('id, project_id, total_budget_cents, allocated_budget_cents, spent_budget_cents, remaining_budget_cents, budget_period, period_start_date, period_end_date, category_allocations, status, approved_by, approved_at, fiscal_year, budget_notes, created_by, updated_by, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(transformProjectBudgetFromDB);
}

async function fetchMMPBudgets(): Promise<MMPBudget[]> {
  const { data, error } = await supabase
    .from('mmp_budgets')
    .select('id, mmp_file_id, project_budget_id, allocated_budget_cents, spent_budget_cents, remaining_budget_cents, total_sites, budgeted_sites, completed_sites, average_cost_per_site_cents, category_breakdown, source_type, parent_budget_id, status, budget_notes, allocated_by, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(transformMMPBudgetFromDB);
}

async function fetchBudgetTransactions(): Promise<BudgetTransaction[]> {
  const { data, error } = await supabase
    .from('budget_transactions')
    .select('id, project_budget_id, mmp_budget_id, site_visit_id, wallet_transaction_id, transaction_type, amount_cents, currency, category, balance_before_cents, balance_after_cents, description, metadata, reference_number, requires_approval, approved_by, approved_at, created_by, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;
  return (data || []).map(transformBudgetTransactionFromDB);
}

async function fetchBudgetAlerts(): Promise<BudgetAlert[]> {
  const { data, error } = await supabase
    .from('budget_alerts')
    .select('id, project_budget_id, mmp_budget_id, alert_type, severity, threshold_percentage, title, message, status, acknowledged_by, acknowledged_at, metadata, created_at, resolved_at')
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(transformBudgetAlertFromDB);
}

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
