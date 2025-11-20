
export interface MMPTrackingLog {
  timestamp: string;
  action: string;
  location: string;
}

export interface MMPIncident {
  type: string;
  description: string;
  resolved: boolean;
}

export interface MMPPerformance {
  completionStatus?: string;
  progress?: number;
  startDate?: string;
  estimatedEndDate?: string;
  supervisorRating?: number;
  supervisorFeedback?: string;
  trackingLogs?: MMPTrackingLog[];
  incidents?: MMPIncident[];
  complianceIssues?: any[];
}
