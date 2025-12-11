export interface ProjectBudget {
  id: string;
  projectId: string;
  totalBudgetCents: number;
  allocatedBudgetCents: number;
  spentBudgetCents: number;
  remainingBudgetCents: number;
  budgetPeriod: 'monthly' | 'quarterly' | 'annual' | 'project_lifetime';
  periodStartDate?: string;
  periodEndDate?: string;
  categoryAllocations: {
    transportation_and_visit_fees: number;
    permit_fee: number;
    internet_and_communication_fees: number;
  };
  status: 'draft' | 'submitted' | 'approved' | 'active' | 'closed' | 'exceeded';
  approvedBy?: string;
  approvedAt?: string;
  fiscalYear?: number;
  budgetNotes?: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MMPBudget {
  id: string;
  mmpFileId: string;
  mmpId?: string;
  projectBudgetId?: string;
  projectId?: string;
  allocatedBudgetCents: number;
  spentBudgetCents: number;
  remainingBudgetCents: number;
  totalSites: number;
  budgetedSites: number;
  completedSites: number;
  averageCostPerSiteCents: number;
  categoryBreakdown: {
    transportation_and_visit_fees: number;
    permit_fee: number;
    internet_and_communication_fees: number;
  };
  sourceType: 'project_allocation' | 'top_up' | 'reallocation' | 'additional_funding';
  parentBudgetId?: string;
  status: 'draft' | 'active' | 'completed' | 'exceeded' | 'closed';
  budgetNotes?: string;
  allocatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Task-Level Budget Tracking
 * For granular budget management at individual task/activity level
 */
export interface TaskBudget {
  id: string;
  taskId: string;
  taskName: string;
  projectId: string;
  mmpFileId?: string;
  
  allocatedBudgetCents: number;
  spentBudgetCents: number;
  remainingBudgetCents: number;
  
  plannedStartDate?: string;
  plannedEndDate?: string;
  actualStartDate?: string;
  actualEndDate?: string;
  
  estimatedHours?: number;
  actualHours?: number;
  
  categoryBreakdown: {
    labor: number;
    transportation: number;
    materials: number;
    other: number;
  };
  
  variance: TaskBudgetVariance;
  
  status: 'draft' | 'active' | 'completed' | 'exceeded' | 'on_hold';
  priority: 'low' | 'medium' | 'high' | 'critical';
  
  assignedTo?: string;
  createdBy?: string;
  approvedBy?: string;
  approvedAt?: string;
  
  budgetNotes?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Task Budget Variance Analysis
 */
export interface TaskBudgetVariance {
  budgetVarianceCents: number;
  budgetVariancePercentage: number;
  timeVarianceDays?: number;
  timeVariancePercentage?: number;
  costPerformanceIndex: number;
  schedulePerformanceIndex?: number;
  estimateAtCompletion?: number;
  varianceStatus: 'under_budget' | 'on_budget' | 'over_budget' | 'critical';
  trendDirection: 'improving' | 'stable' | 'worsening';
}

export interface BudgetTransaction {
  id: string;
  projectBudgetId?: string;
  projectId?: string;
  mmpBudgetId?: string;
  mmpId?: string;
  siteVisitId?: string;
  walletTransactionId?: string;
  transactionType: 'allocation' | 'spend' | 'top_up' | 'reallocation' | 'adjustment' | 'refund';
  amountCents: number;
  currency: string;
  category?: 'transportation_and_visit_fees' | 'permit_fee' | 'internet_and_communication_fees';
  balanceBeforeCents?: number;
  balanceAfterCents?: number;
  description?: string;
  metadata?: any;
  referenceNumber?: string;
  requiresApproval: boolean;
  approvedBy?: string;
  approvedAt?: string;
  createdBy?: string;
  createdAt: string;
}

export interface BudgetAlert {
  id: string;
  projectBudgetId?: string;
  mmpBudgetId?: string;
  alertType: 'low_budget' | 'overspending' | 'budget_exceeded' | 'threshold_reached';
  severity: 'info' | 'warning' | 'critical';
  thresholdPercentage?: number;
  title: string;
  message?: string;
  status: 'active' | 'acknowledged' | 'resolved' | 'dismissed';
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  metadata?: any;
  createdAt: string;
  resolvedAt?: string;
}

export interface ProjectBudgetSummary {
  id: string;
  projectId: string;
  projectName: string;
  totalBudgetCents: number;
  allocatedBudgetCents: number;
  spentBudgetCents: number;
  remainingBudgetCents: number;
  budgetPeriod: string;
  status: string;
  mmpCount: number;
  totalMmpSpent: number;
  utilizationPercentage: number;
  createdAt: string;
  updatedAt: string;
}

export interface MMPBudgetSummary {
  id: string;
  mmpFileId: string;
  mmpName: string;
  projectId: string;
  allocatedBudgetCents: number;
  spentBudgetCents: number;
  remainingBudgetCents: number;
  totalSites: number;
  completedSites: number;
  averageCostPerSiteCents: number;
  status: string;
  transactionCount: number;
  utilizationPercentage: number;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetStats {
  totalBudget: number;
  totalAllocated: number;
  totalSpent: number;
  totalRemaining: number;
  utilizationRate: number;
  averageCostPerSite: number;
  projectedOverspend: number;
  burnRate: number;
}

export interface CreateProjectBudgetInput {
  projectId: string;
  totalBudgetCents: number;
  budgetPeriod: ProjectBudget['budgetPeriod'];
  periodStartDate?: string;
  periodEndDate?: string;
  categoryAllocations?: Partial<ProjectBudget['categoryAllocations']>;
  fiscalYear?: number;
  budgetNotes?: string;
}

export interface CreateMMPBudgetInput {
  mmpFileId: string;
  projectBudgetId?: string;
  allocatedBudgetCents: number;
  totalSites: number;
  categoryBreakdown?: Partial<MMPBudget['categoryBreakdown']>;
  sourceType?: MMPBudget['sourceType'];
  budgetNotes?: string;
}

export interface TopUpBudgetInput {
  budgetId: string;
  amountCents: number;
  reason: string;
  category?: string;
}

export interface BudgetAllocationInput {
  fromBudgetId: string;
  toBudgetId: string;
  amountCents: number;
  category?: string;
  reason: string;
}

export const DEFAULT_CURRENCY = 'SDG';

export const BUDGET_STATUS_COLORS = {
  draft: 'gray',
  submitted: 'blue',
  approved: 'green',
  active: 'green',
  completed: 'gray',
  exceeded: 'red',
  closed: 'gray',
} as const;

export const BUDGET_ALERT_SEVERITY_COLORS = {
  info: 'blue',
  warning: 'yellow',
  critical: 'red',
} as const;

/**
 * Task Budget Summary for reporting
 */
export interface TaskBudgetSummary {
  id: string;
  taskId: string;
  taskName: string;
  projectId: string;
  projectName: string;
  allocatedBudgetCents: number;
  spentBudgetCents: number;
  remainingBudgetCents: number;
  utilizationPercentage: number;
  variance: TaskBudgetVariance;
  status: TaskBudget['status'];
  priority: TaskBudget['priority'];
  assignedToName?: string;
  daysRemaining?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Create Task Budget Input
 */
export interface CreateTaskBudgetInput {
  taskId: string;
  taskName: string;
  projectId: string;
  mmpFileId?: string;
  allocatedBudgetCents: number;
  plannedStartDate?: string;
  plannedEndDate?: string;
  estimatedHours?: number;
  categoryBreakdown?: Partial<TaskBudget['categoryBreakdown']>;
  priority?: TaskBudget['priority'];
  assignedTo?: string;
  budgetNotes?: string;
}

/**
 * Update Task Budget Input
 */
export interface UpdateTaskBudgetInput {
  allocatedBudgetCents?: number;
  plannedStartDate?: string;
  plannedEndDate?: string;
  actualStartDate?: string;
  actualEndDate?: string;
  estimatedHours?: number;
  actualHours?: number;
  categoryBreakdown?: Partial<TaskBudget['categoryBreakdown']>;
  status?: TaskBudget['status'];
  priority?: TaskBudget['priority'];
  assignedTo?: string;
  budgetNotes?: string;
}

/**
 * Task Budget Spend Input
 */
export interface TaskBudgetSpendInput {
  taskBudgetId: string;
  amountCents: number;
  category: keyof TaskBudget['categoryBreakdown'];
  description?: string;
  referenceId?: string;
}

/**
 * Task Budget Variance Thresholds
 */
export const TASK_BUDGET_VARIANCE_THRESHOLDS = {
  onBudget: 5,        // +/- 5% considered on budget
  overBudget: 15,     // > 15% over is warning
  critical: 25,       // > 25% over is critical
} as const;

export const TASK_VARIANCE_STATUS_COLORS = {
  under_budget: 'green',
  on_budget: 'blue',
  over_budget: 'yellow',
  critical: 'red',
} as const;
