/**
 * Budget repository — all Supabase DB access for the budget domain.
 * Pure async functions: no React, no hooks, no toasts.
 * Throws on error so callers (context/hooks) can handle UI feedback.
 */
import { supabase } from '@/integrations/supabase/client';
import type {
  ProjectBudget,
  MMPBudget,
  BudgetTransaction,
  BudgetAlert,
  ProjectBudgetSummary,
  MMPBudgetSummary,
  CreateProjectBudgetInput,
  CreateMMPBudgetInput,
  TopUpBudgetInput,
} from '@/types/budget';

// ─── Transforms ───────────────────────────────────────────────────────────────

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

// ─── Fetchers ─────────────────────────────────────────────────────────────────

export async function fetchProjectBudgets(): Promise<ProjectBudget[]> {
  const { data, error } = await supabase
    .from('project_budgets')
    .select('id, project_id, total_budget_cents, allocated_budget_cents, spent_budget_cents, remaining_budget_cents, budget_period, period_start_date, period_end_date, category_allocations, status, approved_by, approved_at, fiscal_year, budget_notes, created_by, updated_by, created_at, updated_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(transformProjectBudgetFromDB);
}

export async function fetchMMPBudgets(): Promise<MMPBudget[]> {
  const { data, error } = await supabase
    .from('mmp_budgets')
    .select('id, mmp_file_id, project_budget_id, allocated_budget_cents, spent_budget_cents, remaining_budget_cents, total_sites, budgeted_sites, completed_sites, average_cost_per_site_cents, category_breakdown, source_type, parent_budget_id, status, budget_notes, allocated_by, created_at, updated_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(transformMMPBudgetFromDB);
}

export async function fetchBudgetTransactions(): Promise<BudgetTransaction[]> {
  const { data, error } = await supabase
    .from('budget_transactions')
    .select('id, project_budget_id, mmp_budget_id, site_visit_id, wallet_transaction_id, transaction_type, amount_cents, currency, category, balance_before_cents, balance_after_cents, description, metadata, reference_number, requires_approval, approved_by, approved_at, created_by, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data || []).map(transformBudgetTransactionFromDB);
}

export async function fetchBudgetAlerts(): Promise<BudgetAlert[]> {
  const { data, error } = await supabase
    .from('budget_alerts')
    .select('id, project_budget_id, mmp_budget_id, alert_type, severity, threshold_percentage, title, message, status, acknowledged_by, acknowledged_at, metadata, created_at, resolved_at')
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(transformBudgetAlertFromDB);
}

// ─── On-demand reads ──────────────────────────────────────────────────────────

export async function getProjectBudgetSummary(projectId: string): Promise<ProjectBudgetSummary | null> {
  const { data, error } = await supabase
    .from('project_budget_summary')
    .select('*')
    .eq('project_id', projectId)
    .single();
  if (error) throw error;
  return data;
}

export async function getMMPBudgetSummary(mmpFileId: string): Promise<MMPBudgetSummary | null> {
  const { data, error } = await supabase
    .from('mmp_budget_summary')
    .select('*')
    .eq('mmp_file_id', mmpFileId)
    .single();
  if (error) throw error;
  return data;
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createProjectBudget(input: CreateProjectBudgetInput, actorId: string): Promise<ProjectBudget> {
  const { data, error } = await supabase
    .from('project_budgets')
    .insert({
      project_id: input.projectId,
      total_budget_cents: input.totalBudgetCents,
      budget_period: input.budgetPeriod,
      period_start_date: input.periodStartDate,
      period_end_date: input.periodEndDate,
      category_allocations: input.categoryAllocations,
      fiscal_year: input.fiscalYear,
      budget_notes: input.budgetNotes,
      created_by: actorId,
      status: 'draft',
    })
    .select()
    .single();
  if (error) throw error;
  return transformProjectBudgetFromDB(data);
}

export async function updateProjectBudget(id: string, updates: Partial<ProjectBudget>, actorId: string): Promise<void> {
  const dbUpdates: any = {
    updated_by: actorId,
    updated_at: new Date().toISOString(),
  };
  if (updates.totalBudgetCents !== undefined) dbUpdates.total_budget_cents = updates.totalBudgetCents;
  if (updates.allocatedBudgetCents !== undefined) dbUpdates.allocated_budget_cents = updates.allocatedBudgetCents;
  if (updates.remainingBudgetCents !== undefined) dbUpdates.remaining_budget_cents = updates.remainingBudgetCents;
  if (updates.budgetPeriod !== undefined) dbUpdates.budget_period = updates.budgetPeriod;
  if (updates.fiscalYear !== undefined) dbUpdates.fiscal_year = updates.fiscalYear;
  if (updates.status) dbUpdates.status = updates.status;
  if (updates.budgetNotes !== undefined) dbUpdates.budget_notes = updates.budgetNotes;
  if (updates.categoryAllocations) dbUpdates.category_allocations = updates.categoryAllocations;

  const { error } = await supabase.from('project_budgets').update(dbUpdates).eq('id', id);
  if (error) throw error;
}

export async function deleteProjectBudget(id: string): Promise<void> {
  const { error } = await supabase.from('project_budgets').delete().eq('id', id);
  if (error) throw error;
}

export async function createMMPBudget(input: CreateMMPBudgetInput, actorId: string): Promise<MMPBudget> {
  const { data, error } = await supabase
    .from('mmp_budgets')
    .insert({
      mmp_file_id: input.mmpFileId,
      project_budget_id: input.projectBudgetId,
      allocated_budget_cents: input.allocatedBudgetCents,
      total_sites: input.totalSites,
      budgeted_sites: input.totalSites,
      category_breakdown: input.categoryBreakdown,
      source_type: input.sourceType || 'project_allocation',
      budget_notes: input.budgetNotes,
      allocated_by: actorId,
      status: 'active',
    })
    .select()
    .single();
  if (error) throw error;

  if (input.projectBudgetId) {
    const { error: txnError } = await supabase
      .from('budget_transactions')
      .insert({
        project_budget_id: input.projectBudgetId,
        mmp_budget_id: data.id,
        transaction_type: 'allocation',
        amount_cents: input.allocatedBudgetCents,
        currency: 'SDG',
        description: `Budget allocated to MMP`,
        created_by: actorId,
      });
    if (txnError) console.error('Failed to create allocation transaction:', txnError);

    const { data: projectBudget, error: fetchError } = await supabase
      .from('project_budgets')
      .select('allocated_budget_cents')
      .eq('id', input.projectBudgetId)
      .single();
    if (!fetchError && projectBudget) {
      const { error: updateError } = await supabase
        .from('project_budgets')
        .update({
          allocated_budget_cents: parseInt(projectBudget.allocated_budget_cents) + input.allocatedBudgetCents,
        })
        .eq('id', input.projectBudgetId);
      if (updateError) console.error('Failed to update project budget allocated cents:', updateError);
    }
  }

  return transformMMPBudgetFromDB(data);
}

export async function updateMMPBudget(id: string, updates: Partial<MMPBudget>): Promise<void> {
  const dbUpdates: any = { updated_at: new Date().toISOString() };
  if (updates.allocatedBudgetCents !== undefined) dbUpdates.allocated_budget_cents = updates.allocatedBudgetCents;
  if (updates.status) dbUpdates.status = updates.status;
  if (updates.budgetNotes) dbUpdates.budget_notes = updates.budgetNotes;
  if (updates.completedSites !== undefined) dbUpdates.completed_sites = updates.completedSites;

  const { error } = await supabase.from('mmp_budgets').update(dbUpdates).eq('id', id);
  if (error) throw error;
}

export async function topUpMMPBudget(
  input: TopUpBudgetInput,
  currentAllocatedCents: number,
  actorId: string,
): Promise<void> {
  const { error: updateError } = await supabase
    .from('mmp_budgets')
    .update({ allocated_budget_cents: currentAllocatedCents + input.amountCents })
    .eq('id', input.budgetId);
  if (updateError) throw updateError;

  const { error: txnError } = await supabase
    .from('budget_transactions')
    .insert({
      mmp_budget_id: input.budgetId,
      transaction_type: 'top_up',
      amount_cents: input.amountCents,
      currency: 'SDG',
      category: input.category,
      description: input.reason,
      created_by: actorId,
    });
  if (txnError) throw txnError;
}

export async function recordBudgetSpend(
  mmpBudgetId: string,
  currentBudget: { spentBudgetCents: number; remainingBudgetCents: number },
  amountCents: number,
  category: string,
  description: string | undefined,
  actorId: string,
): Promise<void> {
  const { error: updateError } = await supabase
    .from('mmp_budgets')
    .update({ spent_budget_cents: currentBudget.spentBudgetCents + amountCents })
    .eq('id', mmpBudgetId);
  if (updateError) throw updateError;

  const { error: txnError } = await supabase
    .from('budget_transactions')
    .insert({
      mmp_budget_id: mmpBudgetId,
      transaction_type: 'spend',
      amount_cents: amountCents,
      currency: 'SDG',
      category,
      description,
      balance_before_cents: currentBudget.remainingBudgetCents,
      balance_after_cents: currentBudget.remainingBudgetCents - amountCents,
      created_by: actorId,
    });
  if (txnError) throw txnError;
}

export async function acknowledgeAlert(alertId: string, actorId: string): Promise<void> {
  const { error } = await supabase
    .from('budget_alerts')
    .update({
      status: 'acknowledged',
      acknowledged_by: actorId,
      acknowledged_at: new Date().toISOString(),
    })
    .eq('id', alertId);
  if (error) throw error;
}

export async function dismissAlert(alertId: string, actorId: string): Promise<void> {
  const { error } = await supabase
    .from('budget_alerts')
    .update({
      status: 'dismissed',
      acknowledged_by: actorId,
      acknowledged_at: new Date().toISOString(),
    })
    .eq('id', alertId);
  if (error) throw error;
}
