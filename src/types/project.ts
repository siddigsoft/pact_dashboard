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
  // Fee / cost tracking
  memberType?: TeamMemberType;
  feeType?: TeamFeeType;
  rate?: number;
  plannedHours?: number;
  currency?: string;
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
