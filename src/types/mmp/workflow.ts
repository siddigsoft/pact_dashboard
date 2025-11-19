
import { MMPStage } from './base';

export interface MMPApprovalStep {
  approvedBy: string;
  approvedAt: string;
  comments: string;
}

export interface MMPApprovalWorkflow {
  firstApproval: MMPApprovalStep | null;
  finalApproval: MMPApprovalStep | null;
}

export interface MMPWorkflow {
  currentStage: MMPStage;
  lastUpdated?: string;
  assignedTo?: string;
  comments?: string;
  forwardedToCoordinators?: boolean;
  forwardedToCoordinatorIds?: string[];
  coordinatorVerified?: boolean;
  coordinatorVerifiedAt?: string;
  coordinatorVerifiedBy?: string;
}
