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
