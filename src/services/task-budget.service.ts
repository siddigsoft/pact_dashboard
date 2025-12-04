/**
 * Task Budget Service
 * Provides task-level budget tracking with variance analysis
 */

import { supabase } from '@/integrations/supabase/client';
import type {
  TaskBudget,
  TaskBudgetVariance,
  TaskBudgetSummary,
  CreateTaskBudgetInput,
  UpdateTaskBudgetInput,
  TaskBudgetSpendInput,
  TASK_BUDGET_VARIANCE_THRESHOLDS,
} from '@/types/budget';
import { BudgetNotificationService } from './budget-notification.service';
import { differenceInDays, parseISO } from 'date-fns';

const THRESHOLDS = {
  onBudget: 5,
  overBudget: 15,
  critical: 25,
};

/**
 * Calculate variance analysis for a task budget
 */
function calculateVariance(
  allocatedCents: number,
  spentCents: number,
  plannedStart?: string,
  plannedEnd?: string,
  actualStart?: string,
  actualEnd?: string,
  estimatedHours?: number,
  actualHours?: number,
  previousSpentCents?: number
): TaskBudgetVariance {
  const budgetVarianceCents = allocatedCents - spentCents;
  const budgetVariancePercentage = allocatedCents > 0 
    ? ((spentCents - allocatedCents) / allocatedCents) * 100 
    : 0;
  
  const costPerformanceIndex = spentCents > 0 
    ? allocatedCents / spentCents 
    : 1;

  let varianceStatus: TaskBudgetVariance['varianceStatus'] = 'on_budget';
  const absVariance = Math.abs(budgetVariancePercentage);
  
  if (budgetVariancePercentage > THRESHOLDS.critical) {
    varianceStatus = 'critical';
  } else if (budgetVariancePercentage > THRESHOLDS.overBudget) {
    varianceStatus = 'over_budget';
  } else if (budgetVariancePercentage < -THRESHOLDS.onBudget) {
    varianceStatus = 'under_budget';
  }

  let timeVarianceDays: number | undefined;
  let timeVariancePercentage: number | undefined;
  let schedulePerformanceIndex: number | undefined;

  if (plannedStart && plannedEnd) {
    const plannedDuration = differenceInDays(parseISO(plannedEnd), parseISO(plannedStart));
    
    if (actualStart && actualEnd) {
      const actualDuration = differenceInDays(parseISO(actualEnd), parseISO(actualStart));
      timeVarianceDays = actualDuration - plannedDuration;
      timeVariancePercentage = plannedDuration > 0 
        ? ((actualDuration - plannedDuration) / plannedDuration) * 100 
        : 0;
      schedulePerformanceIndex = actualDuration > 0 ? plannedDuration / actualDuration : 1;
    } else if (actualStart) {
      const currentDuration = differenceInDays(new Date(), parseISO(actualStart));
      const remainingPlanned = differenceInDays(parseISO(plannedEnd), new Date());
      if (remainingPlanned < 0) {
        timeVarianceDays = Math.abs(remainingPlanned);
      }
    }
  }

  let estimateAtCompletion: number | undefined;
  if (spentCents > 0 && costPerformanceIndex > 0) {
    estimateAtCompletion = allocatedCents / costPerformanceIndex;
  }

  let trendDirection: TaskBudgetVariance['trendDirection'] = 'stable';
  if (previousSpentCents !== undefined) {
    const previousUtilization = allocatedCents > 0 ? previousSpentCents / allocatedCents : 0;
    const currentUtilization = allocatedCents > 0 ? spentCents / allocatedCents : 0;
    const utilizationChange = currentUtilization - previousUtilization;
    
    if (utilizationChange > 0.05) {
      trendDirection = 'worsening';
    } else if (utilizationChange < -0.02) {
      trendDirection = 'improving';
    }
  }

  return {
    budgetVarianceCents,
    budgetVariancePercentage,
    timeVarianceDays,
    timeVariancePercentage,
    costPerformanceIndex,
    schedulePerformanceIndex,
    estimateAtCompletion,
    varianceStatus,
    trendDirection,
  };
}

export const TaskBudgetService = {
  /**
   * Create a new task budget
   */
  async createTaskBudget(
    input: CreateTaskBudgetInput,
    createdBy: string
  ): Promise<TaskBudget | null> {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    const categoryBreakdown = {
      labor: input.categoryBreakdown?.labor || 0,
      transportation: input.categoryBreakdown?.transportation || 0,
      materials: input.categoryBreakdown?.materials || 0,
      other: input.categoryBreakdown?.other || 0,
    };

    const variance = calculateVariance(
      input.allocatedBudgetCents,
      0,
      input.plannedStartDate,
      input.plannedEndDate
    );

    const taskBudget: TaskBudget = {
      id,
      taskId: input.taskId,
      taskName: input.taskName,
      projectId: input.projectId,
      mmpFileId: input.mmpFileId,
      allocatedBudgetCents: input.allocatedBudgetCents,
      spentBudgetCents: 0,
      remainingBudgetCents: input.allocatedBudgetCents,
      plannedStartDate: input.plannedStartDate,
      plannedEndDate: input.plannedEndDate,
      estimatedHours: input.estimatedHours,
      categoryBreakdown,
      variance,
      status: 'draft',
      priority: input.priority || 'medium',
      assignedTo: input.assignedTo,
      createdBy,
      budgetNotes: input.budgetNotes,
      createdAt: now,
      updatedAt: now,
    };

    const { error } = await supabase
      .from('task_budgets')
      .insert({
        id: taskBudget.id,
        task_id: taskBudget.taskId,
        task_name: taskBudget.taskName,
        project_id: taskBudget.projectId,
        mmp_file_id: taskBudget.mmpFileId,
        allocated_budget_cents: taskBudget.allocatedBudgetCents,
        spent_budget_cents: taskBudget.spentBudgetCents,
        remaining_budget_cents: taskBudget.remainingBudgetCents,
        planned_start_date: taskBudget.plannedStartDate,
        planned_end_date: taskBudget.plannedEndDate,
        estimated_hours: taskBudget.estimatedHours,
        category_breakdown: taskBudget.categoryBreakdown,
        variance: taskBudget.variance,
        status: taskBudget.status,
        priority: taskBudget.priority,
        assigned_to: taskBudget.assignedTo,
        created_by: createdBy,
        budget_notes: taskBudget.budgetNotes,
        created_at: taskBudget.createdAt,
        updated_at: taskBudget.updatedAt,
      });

    if (error) {
      console.error('[TaskBudgetService] Error creating task budget:', error);
      return null;
    }

    return taskBudget;
  },

  /**
   * Get task budget by ID
   */
  async getTaskBudget(taskBudgetId: string): Promise<TaskBudget | null> {
    const { data, error } = await supabase
      .from('task_budgets')
      .select('*')
      .eq('id', taskBudgetId)
      .single();

    if (error || !data) {
      return null;
    }

    return this.mapToTaskBudget(data);
  },

  /**
   * Get all task budgets for a project
   */
  async getProjectTaskBudgets(projectId: string): Promise<TaskBudget[]> {
    const { data, error } = await supabase
      .from('task_budgets')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      return [];
    }

    return data.map(this.mapToTaskBudget);
  },

  /**
   * Get task budgets for an MMP
   */
  async getMMPTaskBudgets(mmpFileId: string): Promise<TaskBudget[]> {
    const { data, error } = await supabase
      .from('task_budgets')
      .select('*')
      .eq('mmp_file_id', mmpFileId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      return [];
    }

    return data.map(this.mapToTaskBudget);
  },

  /**
   * Update task budget
   */
  async updateTaskBudget(
    taskBudgetId: string,
    input: UpdateTaskBudgetInput,
    updatedBy: string
  ): Promise<TaskBudget | null> {
    const existing = await this.getTaskBudget(taskBudgetId);
    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();

    const updatedBudget = {
      ...existing,
      allocatedBudgetCents: input.allocatedBudgetCents ?? existing.allocatedBudgetCents,
      plannedStartDate: input.plannedStartDate ?? existing.plannedStartDate,
      plannedEndDate: input.plannedEndDate ?? existing.plannedEndDate,
      actualStartDate: input.actualStartDate ?? existing.actualStartDate,
      actualEndDate: input.actualEndDate ?? existing.actualEndDate,
      estimatedHours: input.estimatedHours ?? existing.estimatedHours,
      actualHours: input.actualHours ?? existing.actualHours,
      status: input.status ?? existing.status,
      priority: input.priority ?? existing.priority,
      assignedTo: input.assignedTo ?? existing.assignedTo,
      budgetNotes: input.budgetNotes ?? existing.budgetNotes,
      updatedAt: now,
    };

    if (input.categoryBreakdown) {
      updatedBudget.categoryBreakdown = {
        ...existing.categoryBreakdown,
        ...input.categoryBreakdown,
      };
    }

    updatedBudget.remainingBudgetCents = updatedBudget.allocatedBudgetCents - updatedBudget.spentBudgetCents;

    updatedBudget.variance = calculateVariance(
      updatedBudget.allocatedBudgetCents,
      updatedBudget.spentBudgetCents,
      updatedBudget.plannedStartDate,
      updatedBudget.plannedEndDate,
      updatedBudget.actualStartDate,
      updatedBudget.actualEndDate,
      updatedBudget.estimatedHours,
      updatedBudget.actualHours,
      existing.spentBudgetCents
    );

    const { error } = await supabase
      .from('task_budgets')
      .update({
        allocated_budget_cents: updatedBudget.allocatedBudgetCents,
        remaining_budget_cents: updatedBudget.remainingBudgetCents,
        planned_start_date: updatedBudget.plannedStartDate,
        planned_end_date: updatedBudget.plannedEndDate,
        actual_start_date: updatedBudget.actualStartDate,
        actual_end_date: updatedBudget.actualEndDate,
        estimated_hours: updatedBudget.estimatedHours,
        actual_hours: updatedBudget.actualHours,
        category_breakdown: updatedBudget.categoryBreakdown,
        variance: updatedBudget.variance,
        status: updatedBudget.status,
        priority: updatedBudget.priority,
        assigned_to: updatedBudget.assignedTo,
        budget_notes: updatedBudget.budgetNotes,
        updated_at: now,
      })
      .eq('id', taskBudgetId);

    if (error) {
      console.error('[TaskBudgetService] Error updating task budget:', error);
      return null;
    }

    return updatedBudget;
  },

  /**
   * Record spend against a task budget
   */
  async recordSpend(input: TaskBudgetSpendInput, spentBy: string): Promise<{
    success: boolean;
    taskBudget?: TaskBudget;
    error?: string;
    requiresApproval?: boolean;
  }> {
    const existing = await this.getTaskBudget(input.taskBudgetId);
    if (!existing) {
      return { success: false, error: 'Task budget not found' };
    }

    const newSpentCents = existing.spentBudgetCents + input.amountCents;
    const newRemainingCents = existing.allocatedBudgetCents - newSpentCents;
    const utilizationPct = (newSpentCents / existing.allocatedBudgetCents) * 100;

    if (newRemainingCents < 0 && existing.status !== 'exceeded') {
      return {
        success: false,
        error: `Insufficient task budget. Requested: ${(input.amountCents / 100).toFixed(2)} SDG, Available: ${(existing.remainingBudgetCents / 100).toFixed(2)} SDG`,
        requiresApproval: true,
      };
    }

    const now = new Date().toISOString();
    const newCategoryBreakdown = { ...existing.categoryBreakdown };
    newCategoryBreakdown[input.category] += input.amountCents;

    const newVariance = calculateVariance(
      existing.allocatedBudgetCents,
      newSpentCents,
      existing.plannedStartDate,
      existing.plannedEndDate,
      existing.actualStartDate,
      existing.actualEndDate,
      existing.estimatedHours,
      existing.actualHours,
      existing.spentBudgetCents
    );

    let newStatus = existing.status;
    if (newRemainingCents < 0) {
      newStatus = 'exceeded';
    }

    const { error: updateError } = await supabase
      .from('task_budgets')
      .update({
        spent_budget_cents: newSpentCents,
        remaining_budget_cents: newRemainingCents,
        category_breakdown: newCategoryBreakdown,
        variance: newVariance,
        status: newStatus,
        updated_at: now,
      })
      .eq('id', input.taskBudgetId);

    if (updateError) {
      console.error('[TaskBudgetService] Error recording spend:', updateError);
      return { success: false, error: 'Failed to record spend' };
    }

    const { error: txError } = await supabase
      .from('task_budget_transactions')
      .insert({
        id: crypto.randomUUID(),
        task_budget_id: input.taskBudgetId,
        transaction_type: 'spend',
        amount_cents: input.amountCents,
        category: input.category,
        description: input.description,
        reference_id: input.referenceId,
        balance_before_cents: existing.remainingBudgetCents,
        balance_after_cents: newRemainingCents,
        created_by: spentBy,
        created_at: now,
      });

    if (txError) {
      console.warn('[TaskBudgetService] Failed to record transaction:', txError);
    }

    if (utilizationPct >= 80 && existing.variance.varianceStatus !== 'critical') {
      try {
        await BudgetNotificationService.send80PercentThresholdAlert({
          projectId: existing.projectId,
          projectName: existing.taskName,
          mmpName: `Task: ${existing.taskName}`,
          utilizationPercentage: utilizationPct,
          budgetAmount: existing.allocatedBudgetCents / 100,
          spentAmount: newSpentCents / 100,
          remainingAmount: newRemainingCents / 100,
          triggeredBy: spentBy,
        });
      } catch (notifError) {
        console.warn('[TaskBudgetService] Failed to send threshold notification:', notifError);
      }
    }

    return {
      success: true,
      taskBudget: {
        ...existing,
        spentBudgetCents: newSpentCents,
        remainingBudgetCents: newRemainingCents,
        categoryBreakdown: newCategoryBreakdown,
        variance: newVariance,
        status: newStatus,
        updatedAt: now,
      },
    };
  },

  /**
   * Get task budget variance summary for a project
   */
  async getProjectVarianceSummary(projectId: string): Promise<{
    totalAllocated: number;
    totalSpent: number;
    totalRemaining: number;
    averageVariance: number;
    tasksUnderBudget: number;
    tasksOnBudget: number;
    tasksOverBudget: number;
    tasksCritical: number;
    overallCPI: number;
    byTask: TaskBudgetSummary[];
  }> {
    const taskBudgets = await this.getProjectTaskBudgets(projectId);

    if (taskBudgets.length === 0) {
      return {
        totalAllocated: 0,
        totalSpent: 0,
        totalRemaining: 0,
        averageVariance: 0,
        tasksUnderBudget: 0,
        tasksOnBudget: 0,
        tasksOverBudget: 0,
        tasksCritical: 0,
        overallCPI: 1,
        byTask: [],
      };
    }

    let totalAllocated = 0;
    let totalSpent = 0;
    let totalRemaining = 0;
    let varianceSum = 0;
    let tasksUnderBudget = 0;
    let tasksOnBudget = 0;
    let tasksOverBudget = 0;
    let tasksCritical = 0;

    const byTask: TaskBudgetSummary[] = [];

    for (const task of taskBudgets) {
      totalAllocated += task.allocatedBudgetCents;
      totalSpent += task.spentBudgetCents;
      totalRemaining += task.remainingBudgetCents;
      varianceSum += task.variance.budgetVariancePercentage;

      switch (task.variance.varianceStatus) {
        case 'under_budget':
          tasksUnderBudget++;
          break;
        case 'on_budget':
          tasksOnBudget++;
          break;
        case 'over_budget':
          tasksOverBudget++;
          break;
        case 'critical':
          tasksCritical++;
          break;
      }

      byTask.push({
        id: task.id,
        taskId: task.taskId,
        taskName: task.taskName,
        projectId: task.projectId,
        projectName: '',
        allocatedBudgetCents: task.allocatedBudgetCents,
        spentBudgetCents: task.spentBudgetCents,
        remainingBudgetCents: task.remainingBudgetCents,
        utilizationPercentage: task.allocatedBudgetCents > 0 
          ? (task.spentBudgetCents / task.allocatedBudgetCents) * 100 
          : 0,
        variance: task.variance,
        status: task.status,
        priority: task.priority,
        daysRemaining: task.plannedEndDate 
          ? differenceInDays(parseISO(task.plannedEndDate), new Date())
          : undefined,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      });
    }

    const averageVariance = taskBudgets.length > 0 ? varianceSum / taskBudgets.length : 0;
    const overallCPI = totalSpent > 0 ? totalAllocated / totalSpent : 1;

    return {
      totalAllocated: totalAllocated / 100,
      totalSpent: totalSpent / 100,
      totalRemaining: totalRemaining / 100,
      averageVariance,
      tasksUnderBudget,
      tasksOnBudget,
      tasksOverBudget,
      tasksCritical,
      overallCPI,
      byTask,
    };
  },

  /**
   * Check task budget restriction before spending
   */
  async checkTaskBudgetRestriction(
    taskBudgetId: string,
    requestedAmountCents: number
  ): Promise<{
    allowed: boolean;
    reason: string;
    requiresApproval: boolean;
    budgetDetails: {
      allocated: number;
      spent: number;
      remaining: number;
      utilizationPercentage: number;
      requestedAmount: number;
      shortfall: number;
    };
  }> {
    const taskBudget = await this.getTaskBudget(taskBudgetId);

    if (!taskBudget) {
      return {
        allowed: false,
        reason: 'Task budget not found',
        requiresApproval: false,
        budgetDetails: {
          allocated: 0,
          spent: 0,
          remaining: 0,
          utilizationPercentage: 0,
          requestedAmount: requestedAmountCents / 100,
          shortfall: requestedAmountCents / 100,
        },
      };
    }

    const projectedSpent = taskBudget.spentBudgetCents + requestedAmountCents;
    const projectedRemaining = taskBudget.allocatedBudgetCents - projectedSpent;
    const projectedUtilization = (projectedSpent / taskBudget.allocatedBudgetCents) * 100;
    const shortfall = Math.max(0, requestedAmountCents - taskBudget.remainingBudgetCents);

    const budgetDetails = {
      allocated: taskBudget.allocatedBudgetCents / 100,
      spent: taskBudget.spentBudgetCents / 100,
      remaining: taskBudget.remainingBudgetCents / 100,
      utilizationPercentage: (taskBudget.spentBudgetCents / taskBudget.allocatedBudgetCents) * 100,
      requestedAmount: requestedAmountCents / 100,
      shortfall: shortfall / 100,
    };

    if (projectedRemaining < 0) {
      return {
        allowed: false,
        reason: `Transaction would exceed task budget. Shortfall: ${(shortfall / 100).toFixed(2)} SDG`,
        requiresApproval: true,
        budgetDetails,
      };
    }

    if (projectedUtilization >= 80) {
      return {
        allowed: true,
        reason: `Warning: Task budget will reach ${projectedUtilization.toFixed(1)}% utilization`,
        requiresApproval: false,
        budgetDetails,
      };
    }

    return {
      allowed: true,
      reason: 'Transaction approved within task budget limits',
      requiresApproval: false,
      budgetDetails,
    };
  },

  /**
   * Map database row to TaskBudget type
   */
  mapToTaskBudget(data: any): TaskBudget {
    return {
      id: data.id,
      taskId: data.task_id,
      taskName: data.task_name,
      projectId: data.project_id,
      mmpFileId: data.mmp_file_id,
      allocatedBudgetCents: data.allocated_budget_cents,
      spentBudgetCents: data.spent_budget_cents,
      remainingBudgetCents: data.remaining_budget_cents,
      plannedStartDate: data.planned_start_date,
      plannedEndDate: data.planned_end_date,
      actualStartDate: data.actual_start_date,
      actualEndDate: data.actual_end_date,
      estimatedHours: data.estimated_hours,
      actualHours: data.actual_hours,
      categoryBreakdown: data.category_breakdown || {
        labor: 0,
        transportation: 0,
        materials: 0,
        other: 0,
      },
      variance: data.variance || {
        budgetVarianceCents: 0,
        budgetVariancePercentage: 0,
        costPerformanceIndex: 1,
        varianceStatus: 'on_budget',
        trendDirection: 'stable',
      },
      status: data.status,
      priority: data.priority,
      assignedTo: data.assigned_to,
      createdBy: data.created_by,
      approvedBy: data.approved_by,
      approvedAt: data.approved_at,
      budgetNotes: data.budget_notes,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  },
};

export default TaskBudgetService;
