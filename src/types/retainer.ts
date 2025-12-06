/**
 * Retainer System Types
 * Comprehensive types for retainer management, approvals, and audit trails
 */

export type RetainerStatus = 'pending' | 'approved' | 'released' | 'expired' | 'cancelled';
export type RetainerApprovalStatus = 'pending' | 'approved' | 'rejected';
export type RetainerPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Retainer {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  projectId?: string;
  projectName?: string;
  amountCents: number;
  currency: string;
  period: string;
  status: RetainerStatus;
  priority: RetainerPriority;
  holdReason?: string;
  releaseConditions?: string;
  approvalStatus: RetainerApprovalStatus;
  approvedBy?: string;
  approvedAt?: string;
  approverSignature?: string;
  releasedBy?: string;
  releasedAt?: string;
  releaseSignature?: string;
  expiresAt?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface RetainerApproval {
  id: string;
  retainerId: string;
  approverId: string;
  approverName?: string;
  approverRole?: string;
  action: 'approve' | 'reject' | 'request_changes';
  comments?: string;
  signatureData?: string;
  signatureMethod?: 'drawn' | 'typed' | 'biometric';
  createdAt: string;
}

export interface RetainerAuditEntry {
  id: string;
  retainerId: string;
  action: string;
  previousStatus?: RetainerStatus;
  newStatus?: RetainerStatus;
  previousAmount?: number;
  newAmount?: number;
  performedBy: string;
  performedByName?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

export interface RetainerKPIs {
  totalOutstanding: number;
  totalOutstandingCount: number;
  pendingApproval: number;
  pendingApprovalCount: number;
  expiringThisWeek: number;
  expiringThisWeekCount: number;
  releasedThisMonth: number;
  releasedThisMonthCount: number;
  averageHoldDays: number;
  currency: string;
}

export interface RetainerFilter {
  status?: RetainerStatus[];
  approvalStatus?: RetainerApprovalStatus[];
  priority?: RetainerPriority[];
  userId?: string;
  projectId?: string;
  dateFrom?: string;
  dateTo?: string;
  amountMin?: number;
  amountMax?: number;
  search?: string;
}

export interface CreateRetainerRequest {
  userId: string;
  projectId?: string;
  amountCents: number;
  currency?: string;
  period: string;
  priority?: RetainerPriority;
  holdReason?: string;
  releaseConditions?: string;
  expiresAt?: string;
  notes?: string;
}

export interface UpdateRetainerRequest {
  amountCents?: number;
  priority?: RetainerPriority;
  holdReason?: string;
  releaseConditions?: string;
  expiresAt?: string;
  notes?: string;
}

export interface ApproveRetainerRequest {
  retainerId: string;
  comments?: string;
  signatureData?: string;
  signatureMethod?: 'drawn' | 'typed' | 'biometric';
}

export interface ReleaseRetainerRequest {
  retainerId: string;
  releaseReason?: string;
  signatureData?: string;
  signatureMethod?: 'drawn' | 'typed' | 'biometric';
}

export interface RetainerSummaryByStatus {
  status: RetainerStatus;
  count: number;
  totalAmountCents: number;
}

export interface RetainerSummaryByPeriod {
  period: string;
  created: number;
  approved: number;
  released: number;
  totalAmountCents: number;
}
