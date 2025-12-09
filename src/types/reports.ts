export type ReportCategory = 
  | 'financial'
  | 'analytics'
  | 'project_cost'
  | 'audit'
  | 'executive';

export type ReportFormat = 'pdf' | 'csv' | 'excel';

export type ReportFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'on_demand';

export type RAGStatus = 'green' | 'amber' | 'red';

export interface ReportDefinition {
  id: string;
  name: string;
  description: string;
  category: ReportCategory;
  allowedRoles: string[];
  dataSource: string;
  defaultFormat: ReportFormat;
  availableFormats: ReportFormat[];
  schedulable: boolean;
  kpiIds?: string[];
}

export interface KPIDefinition {
  id: string;
  name: string;
  description: string;
  category: ReportCategory;
  unit: 'percentage' | 'currency' | 'count' | 'days' | 'hours' | 'ratio';
  targetValue?: number;
  warningThreshold?: number;
  criticalThreshold?: number;
  higherIsBetter: boolean;
  calculationMethod: string;
}

export interface KPIValue {
  kpiId: string;
  value: number;
  previousValue?: number;
  changePercentage?: number;
  trend: 'up' | 'down' | 'stable';
  status: RAGStatus;
  calculatedAt: string;
  periodStart?: string;
  periodEnd?: string;
}

export interface FinancialSummary {
  totalBudget: number;
  totalSpent: number;
  totalRemaining: number;
  utilizationRate: number;
  burnRate: number;
  projectedRunway: number;
  cashFlow: CashFlowEntry[];
  expensesByCategory: ExpenseCategory[];
  budgetVsActual: BudgetVsActualEntry[];
  pendingApprovals: number;
  pendingApprovalsAmount: number;
}

export interface CashFlowEntry {
  period: string;
  inflow: number;
  outflow: number;
  netFlow: number;
  cumulativeBalance: number;
}

export interface ExpenseCategory {
  category: string;
  budgeted: number;
  actual: number;
  variance: number;
  variancePercentage: number;
}

export interface BudgetVsActualEntry {
  entityId: string;
  entityName: string;
  entityType: 'project' | 'mmp';
  budgeted: number;
  actual: number;
  variance: number;
  variancePercentage: number;
  status: RAGStatus;
}

export interface ProductivityMetrics {
  enumeratorId: string;
  enumeratorName: string;
  role: string;
  visitsAssigned: number;
  visitsCompleted: number;
  visitsPending: number;
  completionRate: number;
  averageTimeToComplete: number;
  slaAdherence: number;
  onTimeRate: number;
  qualityScore?: number;
  totalEarnings: number;
}

export interface OperationalEfficiency {
  totalVisits: number;
  completedVisits: number;
  pendingVisits: number;
  overdueVisits: number;
  averageCycleTime: number;
  firstPassAcceptance: number;
  reworkRate: number;
  assignmentLatency: number;
  routeEfficiency?: number;
  coverageByState: CoverageEntry[];
  coverageByHub: CoverageEntry[];
}

export interface CoverageEntry {
  name: string;
  totalSites: number;
  visitedSites: number;
  coveragePercentage: number;
  pendingSites: number;
}

export interface ProjectCostAnalysis {
  projectId: string;
  projectName: string;
  projectCode?: string;
  status: string;
  totalBudget: number;
  totalSpent: number;
  remaining: number;
  utilizationPercentage: number;
  forecastAtCompletion: number;
  contingencyAmount: number;
  contingencyUsed: number;
  costPerSite: number;
  costByRegion: RegionCost[];
  varianceFromPlan: number;
  variancePercentage: number;
  ragStatus: RAGStatus;
  blockedItems: number;
  overBudgetItems: number;
}

export interface RegionCost {
  region: string;
  state: string;
  totalCost: number;
  siteCount: number;
  averageCostPerSite: number;
}

export interface AuditTrailEntry {
  id: string;
  timestamp: string;
  action: string;
  entityType: string;
  entityId: string;
  entityName?: string;
  userId: string;
  userName: string;
  userRole: string;
  previousValue?: any;
  newValue?: any;
  details?: Record<string, any>;
  ipAddress?: string;
}

export interface AuditSummary {
  totalActions: number;
  actionsByType: { type: string; count: number }[];
  actionsByUser: { userId: string; userName: string; count: number }[];
  recentOverrides: BudgetOverrideEntry[];
  complianceIssues: ComplianceIssue[];
  dataQualityMetrics: DataQualityMetric[];
}

export interface BudgetOverrideEntry {
  id: string;
  timestamp: string;
  approvedBy: string;
  approverRole: string;
  projectName: string;
  mmpName?: string;
  originalAmount: number;
  overrideAmount: number;
  justification: string;
  status: 'approved' | 'rejected';
}

export interface ComplianceIssue {
  id: string;
  type: 'permit_expired' | 'document_missing' | 'approval_pending' | 'policy_violation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  entityType: string;
  entityId: string;
  entityName: string;
  description: string;
  detectedAt: string;
  resolvedAt?: string;
  status: 'open' | 'in_progress' | 'resolved';
}

export interface DataQualityMetric {
  metric: string;
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  completenessPercentage: number;
  issues: string[];
}

export interface ExecutiveSummary {
  portfolioHealth: RAGStatus;
  overallScore: number;
  budgetPosture: {
    totalBudget: number;
    totalSpent: number;
    utilizationRate: number;
    projectsOnTrack: number;
    projectsAtRisk: number;
    projectsOverBudget: number;
  };
  operationalStatus: {
    totalSiteVisits: number;
    completedVisits: number;
    onTimeRate: number;
    pendingApprovals: number;
    escalationsPending: number;
  };
  fieldCoverage: {
    totalStates: number;
    statesCovered: number;
    totalSites: number;
    sitesCovered: number;
    coveragePercentage: number;
  };
  topRisks: RiskItem[];
  topBlockers: BlockerItem[];
  recentExceptions: ExceptionItem[];
  trendData: TrendDataPoint[];
}

export interface RiskItem {
  id: string;
  category: string;
  description: string;
  impact: 'low' | 'medium' | 'high' | 'critical';
  likelihood: 'low' | 'medium' | 'high';
  mitigationStatus: 'identified' | 'in_progress' | 'mitigated';
  owner?: string;
}

export interface BlockerItem {
  id: string;
  type: string;
  description: string;
  affectedEntities: number;
  blockedAmount?: number;
  createdAt: string;
  resolvedAt?: string;
}

export interface ExceptionItem {
  id: string;
  type: 'budget_override' | 'policy_exception' | 'sla_breach' | 'escalation';
  description: string;
  approvedBy?: string;
  justification?: string;
  timestamp: string;
  amount?: number;
}

export interface TrendDataPoint {
  period: string;
  budgetUtilization: number;
  completionRate: number;
  onTimeRate: number;
  qualityScore?: number;
}

export interface ScheduledReport {
  id: string;
  reportId: string;
  reportName: string;
  frequency: ReportFrequency;
  format: ReportFormat;
  recipients: string[];
  lastRun?: string;
  nextRun?: string;
  enabled: boolean;
  createdBy: string;
  createdAt: string;
}

export interface ReportGenerationRequest {
  reportId: string;
  format: ReportFormat;
  dateRange?: {
    from: Date;
    to: Date;
  };
  filters?: Record<string, any>;
  includeCharts?: boolean;
}

export interface ReportGenerationResult {
  success: boolean;
  reportId: string;
  format: ReportFormat;
  filename: string;
  generatedAt: string;
  recordCount: number;
  downloadUrl?: string;
  error?: string;
}
