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
  | 'other'
  // Legacy values kept for backward-compatibility with existing DB records
  | 'survey'
  | 'monitoring'
  | 'training';

export type ProjectStatus = 'draft' | 'active' | 'onHold' | 'completed' | 'cancelled';

export type ActivityStatus = 'pending' | 'inProgress' | 'completed' | 'cancelled';

export type ProjectRole = 'projectManager' | 'fieldAssistant' | 'dataCollector' | 'supervisor' | 'coordinator' | 'analyst' | 'reviewer' | 'other';

export interface ProjectActivity {
  id: string;
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
  status: ActivityStatus;
  isActive: boolean;
  assignedTo?: string;
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
  customFlowStages?: Array<{ id: string; skipped?: boolean; customLabel?: string; customDescription?: string; customOutputs?: string[]; parallelGroup?: number | null; plannedStart?: string | null; plannedEnd?: string | null; dueDate?: string | null }> | null;
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
    coordinates?: {
      latitude: number;
      longitude: number;
    }
  };
  team?: {
    projectManager?: string;
    members?: string[];
    teamComposition?: ProjectTeamMember[];
  };
  activities: ProjectActivity[];
  relatedMMPs?: string[];
  relatedSiteVisits?: string[];
  archived?: boolean;
  clientType?: 'internal' | 'customer';
  clientName?: string;
  partnerId?: string;
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
