export type AuditModule = 
  | 'site_visit'
  | 'mmp'
  | 'project'
  | 'user'
  | 'role'
  | 'wallet'
  | 'transaction'
  | 'cost_submission'
  | 'down_payment'
  | 'approval'
  | 'financial'
  | 'hub_operations'
  | 'classification'
  | 'signature'
  | 'report'
  | 'settings'
  | 'auth'
  | 'notification'
  | 'system';

export type AuditAction =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'approve'
  | 'reject'
  | 'submit'
  | 'dispatch'
  | 'claim'
  | 'accept'
  | 'assign'
  | 'complete'
  | 'cancel'
  | 'archive'
  | 'restore'
  | 'upload'
  | 'download'
  | 'export'
  | 'login'
  | 'logout'
  | 'transfer'
  | 'withdraw'
  | 'deposit'
  | 'sign'
  | 'verify'
  | 'lock'
  | 'unlock'
  | 'status_change'
  | 'permission_change'
  | 'role_assign'
  | 'role_revoke'
  | 'bypass'
  | 'view'
  | 'send';

export type AuditSeverity = 'info' | 'warning' | 'error' | 'critical';

export type WorkflowStep = 
  | 'initiated'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'failed';

export interface AuditLogEntry {
  id: string;
  module: AuditModule;
  action: AuditAction;
  entityType: string;
  entityId: string;
  entityName?: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  actorEmail?: string;
  timestamp: string;
  severity: AuditSeverity;
  workflowStep?: WorkflowStep;
  previousState?: Record<string, any>;
  newState?: Record<string, any>;
  changes?: Record<string, { from: any; to: any }>;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  description: string;
  details?: string;
  tags?: string[];
  relatedEntityIds?: string[];
  duration?: number;
  success: boolean;
  errorMessage?: string;
}

export interface CreateAuditLogInput {
  module: AuditModule;
  action: AuditAction;
  entityType: string;
  entityId: string;
  entityName?: string;
  description: string;
  severity?: AuditSeverity;
  workflowStep?: WorkflowStep;
  previousState?: Record<string, any>;
  newState?: Record<string, any>;
  changes?: Record<string, { from: any; to: any }>;
  metadata?: Record<string, any>;
  details?: string;
  tags?: string[];
  relatedEntityIds?: string[];
  success?: boolean;
  errorMessage?: string;
}

export interface AuditLogFilter {
  module?: AuditModule | AuditModule[];
  action?: AuditAction | AuditAction[];
  actorId?: string;
  entityType?: string;
  entityId?: string;
  severity?: AuditSeverity | AuditSeverity[];
  workflowStep?: WorkflowStep | WorkflowStep[];
  startDate?: string;
  endDate?: string;
  searchQuery?: string;
  tags?: string[];
  success?: boolean;
  limit?: number;
  offset?: number;
}

export interface AuditStats {
  totalLogs: number;
  byModule: Record<AuditModule, number>;
  byAction: Record<AuditAction, number>;
  bySeverity: Record<AuditSeverity, number>;
  recentActivity: AuditLogEntry[];
  topActors: { actorId: string; actorName: string; count: number }[];
}

export const AUDIT_MODULE_LABELS: Record<AuditModule, string> = {
  site_visit: 'Site Visits',
  mmp: 'MMP Management',
  project: 'Projects',
  user: 'Users',
  role: 'Roles',
  wallet: 'Wallets',
  transaction: 'Transactions',
  cost_submission: 'Cost Submissions',
  down_payment: 'Down Payments',
  approval: 'Approvals',
  financial: 'Financial Operations',
  hub_operations: 'Hub Operations',
  classification: 'Classifications',
  signature: 'Signatures',
  report: 'Reports',
  settings: 'Settings',
  auth: 'Authentication',
  notification: 'Notifications',
  system: 'System',
};

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  create: 'Created',
  read: 'Viewed',
  update: 'Updated',
  delete: 'Deleted',
  approve: 'Approved',
  reject: 'Rejected',
  submit: 'Submitted',
  dispatch: 'Dispatched',
  claim: 'Claimed',
  accept: 'Accepted',
  assign: 'Assigned',
  complete: 'Completed',
  cancel: 'Cancelled',
  archive: 'Archived',
  restore: 'Restored',
  upload: 'Uploaded',
  download: 'Downloaded',
  export: 'Exported',
  login: 'Logged In',
  logout: 'Logged Out',
  transfer: 'Transferred',
  withdraw: 'Withdrew',
  deposit: 'Deposited',
  sign: 'Signed',
  verify: 'Verified',
  lock: 'Locked',
  unlock: 'Unlocked',
  status_change: 'Status Changed',
  permission_change: 'Permission Changed',
  role_assign: 'Role Assigned',
  role_revoke: 'Role Revoked',
  bypass: 'Bypassed',
  view: 'Viewed',
  send: 'Sent',
};

export const AUDIT_SEVERITY_LABELS: Record<AuditSeverity, string> = {
  info: 'Info',
  warning: 'Warning',
  error: 'Error',
  critical: 'Critical',
};

export const WORKFLOW_STEP_LABELS: Record<WorkflowStep, string> = {
  initiated: 'Initiated',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  failed: 'Failed',
};
