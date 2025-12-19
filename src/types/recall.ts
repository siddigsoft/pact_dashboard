export type RecallTier = 'admin_to_fom' | 'fom_to_coordinator' | 'coordinator_to_collector' | 'super_admin_approved';

export type RecallScopeType = 
  | 'full_mmp' 
  | 'by_activity' 
  | 'by_site' 
  | 'by_locality' 
  | 'by_state' 
  | 'by_hub' 
  | 'by_cp' 
  | 'by_date';

export type RecallStatus = 
  | 'pending_approval' 
  | 'approved' 
  | 'rejected' 
  | 'completed' 
  | 'cancelled';

export type RecoveryMethod = 'deduct_future' | 'cash_return' | 'write_off';

export type RecoveryStatus = 
  | 'pending' 
  | 'in_progress' 
  | 'recovered' 
  | 'written_off' 
  | 'cancelled';

export interface RecallScopeFilter {
  activityIds?: string[];
  siteIds?: string[];
  siteNames?: string[];
  localities?: string[];
  states?: string[];
  hubs?: string[];
  cpIds?: string[];
  dateFrom?: string;
  dateTo?: string;
}

export interface RecallEvent {
  id: string;
  mmpId: string;
  tier: RecallTier;
  scopeType: RecallScopeType;
  scopeFilters: RecallScopeFilter;
  status: RecallStatus;
  recalledBy: string;
  recalledByEmail?: string;
  recalledByName?: string;
  reason: string;
  affectedSiteCount: number;
  affectedUserIds: string[];
  hasFinancialImpact: boolean;
  financialAmount?: number;
  approvalRequired: boolean;
  approvedBy?: string;
  approvedAt?: string;
  approvalNotes?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  completedAt?: string;
  isForceRecall: boolean;
  isCancellationRecall: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TransportAdvanceRecovery {
  id: string;
  recallEventId: string;
  mmpId: string;
  siteEntryId: string;
  dataCollectorId: string;
  dataCollectorName?: string;
  originalAmount: number;
  recoveredAmount: number;
  pendingAmount: number;
  currency: string;
  recoveryMethod: RecoveryMethod;
  status: RecoveryStatus;
  walletTransactionId?: string;
  deductionTransactionIds?: string[];
  notes?: string;
  processedBy?: string;
  processedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecallCheckResult {
  canRecall: boolean;
  reason?: string;
  blockers: string[];
  tier: RecallTier;
  requiresApproval: boolean;
  hasFinancialImpact: boolean;
  estimatedRecoveryAmount?: number;
  affectedSites?: number;
  affectedCollectors?: string[];
}

export interface RecallRequest {
  mmpId: string;
  tier: RecallTier;
  scopeType: RecallScopeType;
  scopeFilters: RecallScopeFilter;
  reason: string;
  isForceRecall?: boolean;
  isCancellationRecall?: boolean;
  recoveryMethod?: RecoveryMethod;
}

export interface RecallAuditLog {
  action: 'recall_initiated' | 'recall_approved' | 'recall_rejected' | 'recall_completed' | 'recovery_processed';
  recallEventId: string;
  tier: RecallTier;
  by: string;
  byEmail?: string;
  date: string;
  scopeType?: RecallScopeType;
  scopeFilters?: RecallScopeFilter;
  affectedSites?: number;
  financialAmount?: number;
  previousState?: any;
  newState?: any;
  reason?: string;
  notes?: string;
  isForceRecall?: boolean;
}

export interface RecallImpactPreview {
  affectedSiteCount: number;
  affectedCollectorCount: number;
  affectedCollectors: { id: string; name: string; email?: string }[];
  hasFinancialImpact: boolean;
  financialAmount: number;
  sitesWithAdvances: number;
  scopeSummary: string;
  warnings: string[];
}

export interface RecallSummary {
  totalRecalls: number;
  pendingApproval: number;
  completed: number;
  pendingRecoveries: number;
  totalRecoveryAmount: number;
  recoveredAmount: number;
}

export const RECALL_TIER_LABELS: Record<RecallTier, { en: string; ar: string }> = {
  admin_to_fom: { en: 'Admin to FOM', ar: 'من المسؤول إلى مسؤول العمليات الميدانية' },
  fom_to_coordinator: { en: 'FOM to Coordinator', ar: 'من مسؤول العمليات إلى المنسق' },
  coordinator_to_collector: { en: 'Coordinator to Data Collector', ar: 'من المنسق إلى جامع البيانات' },
  super_admin_approved: { en: 'Approved MMP (Super Admin)', ar: 'خطة معتمدة (المسؤول الأعلى)' }
};

export const RECALL_SCOPE_LABELS: Record<RecallScopeType, { en: string; ar: string }> = {
  full_mmp: { en: 'Entire MMP', ar: 'خطة المراقبة بالكامل' },
  by_activity: { en: 'By Activity', ar: 'حسب النشاط' },
  by_site: { en: 'By Site', ar: 'حسب الموقع' },
  by_locality: { en: 'By Locality', ar: 'حسب المحلية' },
  by_state: { en: 'By State', ar: 'حسب الولاية' },
  by_hub: { en: 'By Hub', ar: 'حسب المحور' },
  by_cp: { en: 'By Cooperating Partner', ar: 'حسب الشريك المتعاون' },
  by_date: { en: 'By Date Range', ar: 'حسب نطاق التاريخ' }
};

export const RECOVERY_METHOD_LABELS: Record<RecoveryMethod, { en: string; ar: string }> = {
  deduct_future: { en: 'Deduct from Future Payments', ar: 'خصم من المدفوعات المستقبلية' },
  cash_return: { en: 'Cash Return Required', ar: 'مطلوب إرجاع نقدي' },
  write_off: { en: 'Write Off (Super Admin Only)', ar: 'شطب (المسؤول الأعلى فقط)' }
};
