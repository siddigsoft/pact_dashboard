export type ApprovalRequestType = 
  | 'delete_user'
  | 'delete_project'
  | 'delete_mmp'
  | 'delete_site_visit'
  | 'delete_wallet'
  | 'delete_transaction'
  | 'delete_report'
  | 'assign_admin_role'
  | 'delete_cost_submission'
  | 'delete_activity'
  | 'system_override';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface ApprovalRequest {
  id: string;
  type: ApprovalRequestType;
  resourceType: string;
  resourceId: string;
  resourceName?: string;
  resourceDetails?: Record<string, any>;
  requestedBy: string;
  requestedByName?: string;
  requestedAt: string;
  status: ApprovalStatus;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  reason: string;
  notificationSent: boolean;
  expiresAt?: string;
}

export interface CreateApprovalRequest {
  type: ApprovalRequestType;
  resourceType: string;
  resourceId: string;
  resourceName?: string;
  resourceDetails?: Record<string, any>;
  reason: string;
}

export interface ReviewApprovalRequest {
  requestId: string;
  action: 'approve' | 'reject';
  notes?: string;
}

export const APPROVAL_REQUEST_TYPE_LABELS: Record<ApprovalRequestType, string> = {
  delete_user: 'Delete User',
  delete_project: 'Delete Project',
  delete_mmp: 'Delete MMP',
  delete_site_visit: 'Delete Site Visit',
  delete_wallet: 'Delete Wallet',
  delete_transaction: 'Delete Transaction',
  delete_report: 'Delete Report',
  assign_admin_role: 'Assign Admin Role',
  delete_cost_submission: 'Delete Cost Submission',
  delete_activity: 'Delete Activity',
  system_override: 'System Override',
};

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};
