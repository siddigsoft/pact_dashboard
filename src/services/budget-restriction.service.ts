import { supabase } from '@/integrations/supabase/client';
import type { BudgetAlert } from '@/types/budget';
import type { AppRole } from '@/types/roles';

export interface BudgetRestrictionResult {
  allowed: boolean;
  reason: string;
  requiresEscalation: boolean;
  escalationLevel?: 'senior_operations_lead' | 'admin';
  budgetDetails: {
    allocated: number;
    spent: number;
    remaining: number;
    utilizationPercentage: number;
    requestedAmount: number;
    shortfall: number;
  };
  alerts: BudgetAlert[];
}

export interface BudgetThresholdConfig {
  warningThreshold: number;
  criticalThreshold: number;
  autoBlockThreshold: number;
}

const DEFAULT_THRESHOLDS: BudgetThresholdConfig = {
  warningThreshold: 70,
  criticalThreshold: 80,
  autoBlockThreshold: 100,
};

const BUDGET_OVERRIDE_ROLES: AppRole[] = ['SuperAdmin', 'Admin', 'SeniorOperationsLead'];

export async function checkBudgetRestriction(
  mmpFileId: string,
  requestedAmountCents: number,
  thresholds: BudgetThresholdConfig = DEFAULT_THRESHOLDS
): Promise<BudgetRestrictionResult> {
  try {
    const { data: mmpBudget, error } = await supabase
      .from('mmp_budgets')
      .select('*')
      .eq('mmp_file_id', mmpFileId)
      .eq('status', 'active')
      .single();

    if (error || !mmpBudget) {
      return {
        allowed: true,
        reason: 'No budget tracking configured for this MMP',
        requiresEscalation: false,
        budgetDetails: {
          allocated: 0,
          spent: 0,
          remaining: 0,
          utilizationPercentage: 0,
          requestedAmount: requestedAmountCents / 100,
          shortfall: 0,
        },
        alerts: [],
      };
    }

    const allocated = parseInt(mmpBudget.allocated_budget_cents || '0');
    const spent = parseInt(mmpBudget.spent_budget_cents || '0');
    const remaining = parseInt(mmpBudget.remaining_budget_cents || '0');
    const utilizationPercentage = allocated > 0 ? (spent / allocated) * 100 : 0;
    const projectedUtilization = allocated > 0 ? ((spent + requestedAmountCents) / allocated) * 100 : 0;

    const budgetDetails = {
      allocated: allocated / 100,
      spent: spent / 100,
      remaining: remaining / 100,
      utilizationPercentage,
      requestedAmount: requestedAmountCents / 100,
      shortfall: Math.max(0, (requestedAmountCents - remaining) / 100),
    };

    const alerts: BudgetAlert[] = [];
    let allowed = true;
    let reason = 'Transaction approved - within budget limits';
    let requiresEscalation = false;
    let escalationLevel: 'senior_operations_lead' | 'admin' | undefined;

    if (projectedUtilization >= thresholds.autoBlockThreshold) {
      allowed = false;
      reason = `Transaction blocked: Would exceed budget (${projectedUtilization.toFixed(1)}% utilization)`;
      requiresEscalation = true;
      escalationLevel = 'senior_operations_lead';

      alerts.push({
        id: crypto.randomUUID(),
        mmpBudgetId: mmpBudget.id,
        alertType: 'budget_exceeded',
        severity: 'critical',
        thresholdPercentage: thresholds.autoBlockThreshold,
        title: 'Budget Exceeded',
        message: `Requested amount (${budgetDetails.requestedAmount.toLocaleString()} SDG) exceeds remaining budget (${budgetDetails.remaining.toLocaleString()} SDG). Shortfall: ${budgetDetails.shortfall.toLocaleString()} SDG`,
        status: 'active',
        createdAt: new Date().toISOString(),
      });
    } else if (projectedUtilization >= thresholds.criticalThreshold) {
      allowed = true;
      reason = `Warning: Transaction approaches budget limit (${projectedUtilization.toFixed(1)}% utilization after approval)`;
      requiresEscalation = false;

      alerts.push({
        id: crypto.randomUUID(),
        mmpBudgetId: mmpBudget.id,
        alertType: 'threshold_reached',
        severity: 'warning',
        thresholdPercentage: thresholds.criticalThreshold,
        title: '80% Budget Threshold Reached',
        message: `Budget utilization at ${projectedUtilization.toFixed(1)}% after this transaction. Consider reviewing upcoming expenses.`,
        status: 'active',
        createdAt: new Date().toISOString(),
      });
    } else if (projectedUtilization >= thresholds.warningThreshold) {
      alerts.push({
        id: crypto.randomUUID(),
        mmpBudgetId: mmpBudget.id,
        alertType: 'low_budget',
        severity: 'info',
        thresholdPercentage: thresholds.warningThreshold,
        title: 'Budget Running Low',
        message: `Budget utilization at ${projectedUtilization.toFixed(1)}% after this transaction.`,
        status: 'active',
        createdAt: new Date().toISOString(),
      });
    }

    return {
      allowed,
      reason,
      requiresEscalation,
      escalationLevel,
      budgetDetails,
      alerts,
    };
  } catch (error) {
    console.error('Error checking budget restriction:', error);
    return {
      allowed: true,
      reason: 'Budget check failed - allowing transaction',
      requiresEscalation: false,
      budgetDetails: {
        allocated: 0,
        spent: 0,
        remaining: 0,
        utilizationPercentage: 0,
        requestedAmount: requestedAmountCents / 100,
        shortfall: 0,
      },
      alerts: [],
    };
  }
}

export async function checkProjectBudgetRestriction(
  projectId: string,
  requestedAmountCents: number,
  thresholds: BudgetThresholdConfig = DEFAULT_THRESHOLDS
): Promise<BudgetRestrictionResult> {
  try {
    const { data: projectBudget, error } = await supabase
      .from('project_budgets')
      .select('*')
      .eq('project_id', projectId)
      .in('status', ['active', 'approved'])
      .single();

    if (error || !projectBudget) {
      return {
        allowed: true,
        reason: 'No budget tracking configured for this project',
        requiresEscalation: false,
        budgetDetails: {
          allocated: 0,
          spent: 0,
          remaining: 0,
          utilizationPercentage: 0,
          requestedAmount: requestedAmountCents / 100,
          shortfall: 0,
        },
        alerts: [],
      };
    }

    const total = parseInt(projectBudget.total_budget_cents || '0');
    const spent = parseInt(projectBudget.spent_budget_cents || '0');
    const remaining = parseInt(projectBudget.remaining_budget_cents || '0');
    const utilizationPercentage = total > 0 ? (spent / total) * 100 : 0;
    const projectedUtilization = total > 0 ? ((spent + requestedAmountCents) / total) * 100 : 0;

    const budgetDetails = {
      allocated: total / 100,
      spent: spent / 100,
      remaining: remaining / 100,
      utilizationPercentage,
      requestedAmount: requestedAmountCents / 100,
      shortfall: Math.max(0, (requestedAmountCents - remaining) / 100),
    };

    const alerts: BudgetAlert[] = [];
    let allowed = true;
    let reason = 'Transaction approved - within project budget limits';
    let requiresEscalation = false;
    let escalationLevel: 'senior_operations_lead' | 'admin' | undefined;

    if (projectedUtilization >= thresholds.autoBlockThreshold) {
      allowed = false;
      reason = `Transaction blocked: Would exceed project budget (${projectedUtilization.toFixed(1)}% utilization)`;
      requiresEscalation = true;
      escalationLevel = 'senior_operations_lead';

      alerts.push({
        id: crypto.randomUUID(),
        alertType: 'budget_exceeded',
        severity: 'critical',
        thresholdPercentage: thresholds.autoBlockThreshold,
        title: 'Project Budget Exceeded',
        message: `Requested amount exceeds remaining project budget. Shortfall: ${budgetDetails.shortfall.toLocaleString()} SDG`,
        status: 'active',
        createdAt: new Date().toISOString(),
      });
    } else if (projectedUtilization >= thresholds.criticalThreshold) {
      allowed = true;
      reason = `Warning: Approaching project budget limit (${projectedUtilization.toFixed(1)}% utilization)`;

      alerts.push({
        id: crypto.randomUUID(),
        alertType: 'threshold_reached',
        severity: 'warning',
        thresholdPercentage: thresholds.criticalThreshold,
        title: 'Project Budget 80% Threshold',
        message: `Project budget at ${projectedUtilization.toFixed(1)}% after this transaction.`,
        status: 'active',
        createdAt: new Date().toISOString(),
      });
    }

    return {
      allowed,
      reason,
      requiresEscalation,
      escalationLevel,
      budgetDetails,
      alerts,
    };
  } catch (error) {
    console.error('Error checking project budget restriction:', error);
    return {
      allowed: true,
      reason: 'Budget check failed - allowing transaction',
      requiresEscalation: false,
      budgetDetails: {
        allocated: 0,
        spent: 0,
        remaining: 0,
        utilizationPercentage: 0,
        requestedAmount: requestedAmountCents / 100,
        shortfall: 0,
      },
      alerts: [],
    };
  }
}

export function canOverrideBudgetRestriction(userRole: AppRole): boolean {
  return BUDGET_OVERRIDE_ROLES.includes(userRole);
}

export function hasFinanceOverridePermission(userRole: AppRole): boolean {
  return userRole === 'SuperAdmin' || userRole === 'Admin' || userRole === 'SeniorOperationsLead';
}

export async function recordBudgetAlert(alert: Omit<BudgetAlert, 'id' | 'createdAt'>): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('budget_alerts')
      .insert({
        project_budget_id: alert.projectBudgetId,
        mmp_budget_id: alert.mmpBudgetId,
        alert_type: alert.alertType,
        severity: alert.severity,
        threshold_percentage: alert.thresholdPercentage,
        title: alert.title,
        message: alert.message,
        status: alert.status,
        metadata: alert.metadata,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error recording budget alert:', error);
      return null;
    }

    return data.id;
  } catch (error) {
    console.error('Error recording budget alert:', error);
    return null;
  }
}

export async function getActiveAlerts(
  mmpBudgetId?: string,
  projectBudgetId?: string
): Promise<BudgetAlert[]> {
  try {
    let query = supabase
      .from('budget_alerts')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (mmpBudgetId) {
      query = query.eq('mmp_budget_id', mmpBudgetId);
    }
    if (projectBudgetId) {
      query = query.eq('project_budget_id', projectBudgetId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching active alerts:', error);
      return [];
    }

    return (data || []).map(alert => ({
      id: alert.id,
      projectBudgetId: alert.project_budget_id,
      mmpBudgetId: alert.mmp_budget_id,
      alertType: alert.alert_type as BudgetAlert['alertType'],
      severity: alert.severity as BudgetAlert['severity'],
      thresholdPercentage: alert.threshold_percentage,
      title: alert.title,
      message: alert.message,
      status: alert.status as BudgetAlert['status'],
      acknowledgedBy: alert.acknowledged_by,
      acknowledgedAt: alert.acknowledged_at,
      metadata: alert.metadata,
      createdAt: alert.created_at,
      resolvedAt: alert.resolved_at,
    }));
  } catch (error) {
    console.error('Error fetching active alerts:', error);
    return [];
  }
}

export async function acknowledgeAlert(alertId: string, userId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('budget_alerts')
      .update({
        status: 'acknowledged',
        acknowledged_by: userId,
        acknowledged_at: new Date().toISOString(),
      })
      .eq('id', alertId);

    return !error;
  } catch (error) {
    console.error('Error acknowledging alert:', error);
    return false;
  }
}

export async function resolveAlert(alertId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('budget_alerts')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
      })
      .eq('id', alertId);

    return !error;
  } catch (error) {
    console.error('Error resolving alert:', error);
    return false;
  }
}

export async function processOverBudgetApproval(
  transactionId: string,
  approverId: string,
  approverRole: AppRole,
  overrideReason: string
): Promise<{ success: boolean; message: string }> {
  if (!canOverrideBudgetRestriction(approverRole)) {
    return {
      success: false,
      message: 'Insufficient permissions to override budget restrictions',
    };
  }

  try {
    const { error: updateError } = await supabase
      .from('budget_transactions')
      .update({
        requires_approval: false,
        approved_by: approverId,
        approved_at: new Date().toISOString(),
        metadata: {
          override_reason: overrideReason,
          override_by_role: approverRole,
          override_at: new Date().toISOString(),
        },
      })
      .eq('id', transactionId);

    if (updateError) {
      return {
        success: false,
        message: `Failed to process override: ${updateError.message}`,
      };
    }

    const { error: logError } = await supabase
      .from('audit_logs')
      .insert({
        action: 'budget_override',
        entity_type: 'budget_transaction',
        entity_id: transactionId,
        user_id: approverId,
        details: {
          override_reason: overrideReason,
          approver_role: approverRole,
        },
      });

    if (logError) {
      console.warn('Failed to log budget override audit:', logError);
    }

    return {
      success: true,
      message: 'Budget restriction override approved successfully',
    };
  } catch (error) {
    console.error('Error processing over-budget approval:', error);
    return {
      success: false,
      message: 'An unexpected error occurred',
    };
  }
}

export function getBudgetStatusColor(utilizationPercentage: number): 'green' | 'yellow' | 'orange' | 'red' {
  if (utilizationPercentage >= 100) return 'red';
  if (utilizationPercentage >= 80) return 'orange';
  if (utilizationPercentage >= 70) return 'yellow';
  return 'green';
}

export function formatBudgetAmount(amountCents: number, currency: string = 'SDG'): string {
  const amount = amountCents / 100;
  return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}
