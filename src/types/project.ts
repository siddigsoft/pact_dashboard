// Define project types and models for the Project Planning & Activity Management Module

export type ProjectType =
  | 'tpm'
  | 'baseline_survey'
  | 'endline_survey'
  | 'assessment'
  | 'evaluation'
  | 'research'
  | 'capacity_building'
  | 'compliance'
  | 'infrastructure'
  | 'proposal'
  | 'other'
  // Legacy values kept for backward-compatibility with existing DB records
  | 'survey'
  | 'monitoring'
  | 'training';

export type ProjectStatus = 'draft' | 'active' | 'onHold' | 'completed' | 'cancelled';
export type ActivityStatus = 'pending' | 'inProgress' | 'completed' | 'cancelled';
export type ProjectRole =
  | 'projectManager'
  | 'fieldAssistant'
  | 'dataCollector'
  | 'supervisor'
  | 'coordinator'
  | 'analyst'
  | 'reviewer'
  | 'consultant'
  | 'other';
export type ActivityPriority = 'low' | 'medium' | 'high';
export type TeamFeeType = 'per_hour' | 'fixed_fee' | 'percent_budget';
export type TeamMemberType = 'internal' | 'external';

/** How a professional fee is paid over time */
export type PaymentScheduleType =
  | 'lump_sum'      // single payment
  | 'monthly'       // every calendar month
  | 'quarterly'     // every 3 months
  | 'bi_weekly'     // every 2 weeks
  | 'fixed_dates'   // arbitrary user-defined dates
  | 'milestone';    // tied to project milestones

/** A single payment installment within a professional fee schedule */
export interface PaymentInstallment {
  id: string;
  label: string;           // e.g. "Month 1", "Milestone: Inception Report"
  dueDate: string;         // ISO date YYYY-MM-DD
  amount: number;          // amount in the member's currency
  status: 'pending' | 'paid' | 'overdue';
  paidDate?: string;       // when payment was made
  paidAmount?: number;     // actual amount paid (may differ from scheduled)
  notes?: string;
  milestoneRef?: string;   // optional reference to a project stage/milestone
}

export interface ProjectActivity {
  id: string;
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
  dueDate?: string;
  status: ActivityStatus;
  priority?: ActivityPriority;
  progress?: number;
  isActive: boolean;
  assignedTo?: string;
  assignees?: string[];
  activityTypeId?: string;
  activityTypeName?: string;
  subActivities: SubActivity[];
}

export interface SubActivity {
  id: string;
  name: string;
  description?: string;
  status: ActivityStatus;
  isActive: boolean;
  dueDate?: string;
  assignedTo?: string;
}

export interface ProjectTeamMember {
  userId: string;
  name: string;
  role: ProjectRole;
  joinedAt: string;
  assignedActivities?: string[];
  workload?: number;
  // Member identity (external contributors may not have a system account)
  memberType?: TeamMemberType;
  email?: string;          // email address (required for externals, optional for internals)
  organization?: string;   // external org / consultancy firm
  accessToken?: string;    // unique token for external contributor portal access
  // Fee / cost tracking
  feeType?: TeamFeeType;
  rate?: number;
  plannedHours?: number;
  currency?: string;
  // Payment schedule
  paymentScheduleType?: PaymentScheduleType;
  paymentStartDate?: string;
  installmentCount?: number;
  installments?: PaymentInstallment[];
  // Legacy single-payment fields (still valid for lump_sum or when no schedule set)
  paymentDueDate?: string;
  paymentStatus?: 'unpaid' | 'partially_paid' | 'paid';
  amountPaid?: number;
}

export interface Project {
  id: string;
  name: string;
  projectCode: string;
  description?: string;
  projectType: ProjectType;
  status: ProjectStatus;
  startDate: string;
  endDate: string;
  currentFlowStage?: string;
  customFlowStages?: Array<{
    id: string;
    skipped?: boolean;
    customLabel?: string;
    customDescription?: string;
    customOutputs?: string[];
    parallelGroup?: number | null;
    plannedStart?: string | null;
    plannedEnd?: string | null;
    dueDate?: string | null;
  }> | null;
  budget?: {
    total: number;
    currency: string;
    /** Currency used for operational cost / expense submissions */
    expenseCurrency?: string;
    allocated: number;
    remaining: number;
  };
  location: {
    country: string;
    region: string;
    state: string;
    selectedStates?: string[];
    locality?: string;
    coordinates?: { latitude: number; longitude: number };
  };
  team?: {
    projectManager?: string;
    members?: string[];
    teamComposition?: ProjectTeamMember[];
    deliverablesState?: Record<string, boolean>;
  };
  activities: ProjectActivity[];
  relatedMMPs?: string[];
  relatedSiteVisits?: string[];
  archived?: boolean;
  clientType?: 'internal' | 'customer';
  clientName?: string;
  partnerId?: string;
  crmOpportunityId?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

/** Normalise legacy project type values from older DB records */
export function normaliseProjectType(raw: string | undefined | null): ProjectType {
  const legacyMap: Record<string, ProjectType> = {
    survey: 'baseline_survey',
    monitoring: 'tpm',
    training: 'capacity_building',
  };
  if (!raw) return 'other';
  return (legacyMap[raw] ?? raw) as ProjectType;
}

/** Calculate total cost for a team member based on their fee structure */
export function calcMemberTotalCost(member: ProjectTeamMember, projectBudget?: number): number {
  if (!member.feeType || member.rate === undefined) return 0;
  switch (member.feeType) {
    case 'per_hour':
      return (member.rate || 0) * (member.plannedHours || 0);
    case 'fixed_fee':
      return member.rate || 0;
    case 'percent_budget':
      return projectBudget ? projectBudget * ((member.rate || 0) / 100) : 0;
    default:
      return 0;
  }
}

/** Auto-generate a payment installment schedule */
export function generateInstallmentSchedule(
  totalAmount: number,
  count: number,
  scheduleType: PaymentScheduleType,
  startDate: string,
): PaymentInstallment[] {
  if (count <= 0 || !startDate) return [];
  const perInstallment = Math.round((totalAmount / count) * 100) / 100;
  const installments: PaymentInstallment[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(startDate);
    switch (scheduleType) {
      case 'monthly':    d.setMonth(d.getMonth() + i); break;
      case 'quarterly':  d.setMonth(d.getMonth() + i * 3); break;
      case 'bi_weekly':  d.setDate(d.getDate() + i * 14); break;
      case 'milestone':  d.setMonth(d.getMonth() + i); break; // placeholder dates
      default:           d.setMonth(d.getMonth() + i); break;
    }
    // Adjust last installment for rounding
    const amount = i === count - 1
      ? Math.round((totalAmount - perInstallment * (count - 1)) * 100) / 100
      : perInstallment;
    installments.push({
      id: crypto.randomUUID(),
      label: scheduleType === 'quarterly' ? `Quarter ${i + 1}`
           : scheduleType === 'bi_weekly'  ? `Bi-week ${i + 1}`
           : scheduleType === 'milestone'  ? `Milestone ${i + 1}`
           : `Installment ${i + 1}`,
      dueDate: d.toISOString().split('T')[0],
      amount,
      status: 'pending',
    });
  }
  return installments;
}

/** Derive overall payment status from installments list */
export function derivePaymentStatus(
  installments: PaymentInstallment[],
): 'unpaid' | 'partially_paid' | 'paid' {
  if (!installments.length) return 'unpaid';
  const paid = installments.filter(i => i.status === 'paid').length;
  if (paid === 0) return 'unpaid';
  if (paid === installments.length) return 'paid';
  return 'partially_paid';
}

/** Total amount paid across all installments */
export function totalPaidFromInstallments(installments: PaymentInstallment[]): number {
  return installments.reduce((s, i) => s + (i.paidAmount ?? (i.status === 'paid' ? i.amount : 0)), 0);
}
