// Define project types and models for the Project Planning & Activity Management Module

export type ProjectType = 'infrastructure' | 'survey' | 'compliance' | 'monitoring' | 'training' | 'other';

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
  assignedActivities?: string[];  // IDs of activities assigned to this member
  workload?: number;  // Current workload percentage (0-100)
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
    selectedStates?: string[];  // Added for multi-selection of Sudan states
    locality?: string;
    coordinates?: {
      latitude: number;
      longitude: number;
    }
  };
  team?: {
    projectManager?: string;
    members?: string[];
    teamComposition?: ProjectTeamMember[];  // Detailed team composition with roles
  };
  activities: ProjectActivity[];
  relatedMMPs?: string[];
  relatedSiteVisits?: string[];
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}
