import { supabase } from '@/integrations/supabase/client';
import { logAuditEvent } from '@/utils/audit-logger';

export type MMPAuditAction = 
  | 'upload'
  | 'forward_to_fom'
  | 'forward_to_coordinator'
  | 'recall_admin_to_fom'
  | 'recall_fom_to_coordinator'
  | 'recall_coordinator_to_collector'
  | 'recall_approved'
  | 'force_recall'
  | 'approve'
  | 'reject'
  | 'verify'
  | 'delete'
  | 'archive'
  | 'restore'
  | 'status_change'
  | 'site_dispatch'
  | 'site_claim'
  | 'site_complete'
  | 'permit_upload'
  | 'permit_verify'
  | 'cost_update'
  | 'bulk_operation';

export interface MMPAuditContext {
  mmpId: string;
  mmpName: string;
  action: MMPAuditAction;
  performedBy: string;
  performedByEmail?: string;
  performedByName?: string;
  previousStatus?: string;
  newStatus?: string;
  reason?: string;
  affectedSites?: number;
  affectedUsers?: string[];
  metadata?: Record<string, unknown>;
  isForceAction?: boolean;
}

export interface SiteAuditContext {
  siteId: string;
  siteName: string;
  mmpId?: string;
  action: string;
  performedBy: string;
  performedByEmail?: string;
  performedByName?: string;
  previousStatus?: string;
  newStatus?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

const ACTION_DESCRIPTIONS: Record<MMPAuditAction, string> = {
  upload: 'MMP file uploaded',
  forward_to_fom: 'MMP forwarded to FOM',
  forward_to_coordinator: 'MMP forwarded to coordinators',
  recall_admin_to_fom: 'MMP recalled from FOM to Admin',
  recall_fom_to_coordinator: 'MMP recalled from Coordinators to FOM',
  recall_coordinator_to_collector: 'MMP recalled from Data Collectors to Coordinator',
  recall_approved: 'Approved MMP recalled for revision',
  force_recall: 'MMP force recalled (admin override)',
  approve: 'MMP approved',
  reject: 'MMP rejected',
  verify: 'MMP verified',
  delete: 'MMP deleted',
  archive: 'MMP archived',
  restore: 'MMP restored from archive',
  status_change: 'MMP status changed',
  site_dispatch: 'Sites dispatched to data collectors',
  site_claim: 'Site claimed by data collector',
  site_complete: 'Site visit completed',
  permit_upload: 'Permit document uploaded',
  permit_verify: 'Permit verified',
  cost_update: 'Cost information updated',
  bulk_operation: 'Bulk operation performed'
};

export async function logMMPAudit(context: MMPAuditContext): Promise<string | null> {
  const timestamp = new Date().toISOString();
  
  const description = context.reason 
    ? `${ACTION_DESCRIPTIONS[context.action]}: ${context.reason}`
    : ACTION_DESCRIPTIONS[context.action];

  const auditId = await logAuditEvent({
    module: 'mmp',
    action: context.action as any,
    entityType: 'mmp',
    entityId: context.mmpId,
    entityName: context.mmpName,
    description: `${description} by ${context.performedByName || context.performedByEmail || 'Unknown'}`,
    severity: context.action.includes('delete') || context.action.includes('recall') ? 'warning' : 'info',
    previousState: context.previousStatus ? { status: context.previousStatus } : undefined,
    newState: context.newStatus ? { status: context.newStatus } : undefined,
    changes: context.previousStatus && context.newStatus ? {
      status: { from: context.previousStatus, to: context.newStatus }
    } : undefined,
    metadata: {
      ...context.metadata,
      performedAt: timestamp,
      performedBy: context.performedBy,
      performedByEmail: context.performedByEmail,
      performedByName: context.performedByName,
      affectedSites: context.affectedSites,
      affectedUsers: context.affectedUsers,
      isForceAction: context.isForceAction,
      reason: context.reason
    },
    tags: ['mmp', context.action, context.isForceAction ? 'force_action' : 'standard'].filter(Boolean) as string[]
  });

  console.log(`[MMP Audit] ${context.action} logged for MMP "${context.mmpName}" at ${timestamp}`);
  
  return auditId;
}

export async function logSiteAudit(context: SiteAuditContext): Promise<string | null> {
  const timestamp = new Date().toISOString();

  const auditId = await logAuditEvent({
    module: 'mmp',
    action: context.action as any,
    entityType: 'mmp_site_entry',
    entityId: context.siteId,
    entityName: context.siteName,
    description: `Site "${context.siteName}" - ${context.action} by ${context.performedByName || 'Unknown'}`,
    severity: context.action.includes('delete') || context.action.includes('recall') ? 'warning' : 'info',
    previousState: context.previousStatus ? { status: context.previousStatus } : undefined,
    newState: context.newStatus ? { status: context.newStatus } : undefined,
    changes: context.previousStatus && context.newStatus ? {
      status: { from: context.previousStatus, to: context.newStatus }
    } : undefined,
    metadata: {
      ...context.metadata,
      mmpId: context.mmpId,
      performedAt: timestamp,
      performedBy: context.performedBy,
      performedByEmail: context.performedByEmail,
      performedByName: context.performedByName,
      reason: context.reason
    },
    relatedEntityIds: context.mmpId ? [context.mmpId] : undefined,
    tags: ['mmp', 'site', context.action]
  });

  return auditId;
}

export async function logForwardingAudit(
  mmpId: string,
  mmpName: string,
  forwardType: 'to_fom' | 'to_coordinator',
  recipientIds: string[],
  performedBy: string,
  performedByName?: string,
  performedByEmail?: string,
  siteCount?: number
): Promise<string | null> {
  const timestamp = new Date().toISOString();
  
  const action: MMPAuditAction = forwardType === 'to_fom' ? 'forward_to_fom' : 'forward_to_coordinator';
  const recipientType = forwardType === 'to_fom' ? 'FOM(s)' : 'Coordinator(s)';

  return logMMPAudit({
    mmpId,
    mmpName,
    action,
    performedBy,
    performedByEmail,
    performedByName,
    previousStatus: forwardType === 'to_fom' ? 'pending' : 'forwarded_to_fom',
    newStatus: forwardType === 'to_fom' ? 'forwarded_to_fom' : 'with_coordinators',
    affectedSites: siteCount,
    affectedUsers: recipientIds,
    metadata: {
      forwardedAt: timestamp,
      recipientCount: recipientIds.length,
      recipientType,
      recipientIds
    }
  });
}

export async function logRecallAudit(
  mmpId: string,
  mmpName: string,
  recallTier: string,
  reason: string,
  performedBy: string,
  performedByName?: string,
  performedByEmail?: string,
  affectedSites?: number,
  affectedUserIds?: string[],
  isForceRecall?: boolean,
  previousStatus?: string
): Promise<string | null> {
  const tierToAction: Record<string, MMPAuditAction> = {
    'admin_to_fom': 'recall_admin_to_fom',
    'fom_to_coordinator': 'recall_fom_to_coordinator',
    'coordinator_to_collector': 'recall_coordinator_to_collector',
    'super_admin_approved': 'recall_approved'
  };

  const action = isForceRecall ? 'force_recall' : (tierToAction[recallTier] || 'recall_admin_to_fom');
  const timestamp = new Date().toISOString();

  return logMMPAudit({
    mmpId,
    mmpName,
    action,
    performedBy,
    performedByEmail,
    performedByName,
    previousStatus,
    newStatus: 'pending',
    reason,
    affectedSites,
    affectedUsers: affectedUserIds,
    isForceAction: isForceRecall,
    metadata: {
      recalledAt: timestamp,
      recallTier,
      isForceRecall
    }
  });
}

export async function logDeletionAudit(
  entityType: 'mmp' | 'site' | 'permit' | 'document',
  entityId: string,
  entityName: string,
  performedBy: string,
  performedByName?: string,
  performedByEmail?: string,
  reason?: string,
  parentMmpId?: string,
  metadata?: Record<string, unknown>
): Promise<string | null> {
  const timestamp = new Date().toISOString();

  return logAuditEvent({
    module: 'mmp',
    action: 'delete',
    entityType,
    entityId,
    entityName,
    description: `${entityType.toUpperCase()} "${entityName}" deleted by ${performedByName || 'Unknown'}${reason ? `: ${reason}` : ''}`,
    severity: 'warning',
    metadata: {
      ...metadata,
      deletedAt: timestamp,
      deletedBy: performedBy,
      deletedByEmail: performedByEmail,
      deletedByName: performedByName,
      reason,
      parentMmpId
    },
    relatedEntityIds: parentMmpId ? [parentMmpId] : undefined,
    tags: ['mmp', 'deletion', entityType]
  });
}

export async function logStatusChangeAudit(
  entityType: 'mmp' | 'site',
  entityId: string,
  entityName: string,
  previousStatus: string,
  newStatus: string,
  performedBy: string,
  performedByName?: string,
  performedByEmail?: string,
  reason?: string,
  mmpId?: string
): Promise<string | null> {
  const timestamp = new Date().toISOString();

  return logAuditEvent({
    module: 'mmp',
    action: 'status_change',
    entityType,
    entityId,
    entityName,
    description: `${entityType.toUpperCase()} "${entityName}" status changed from "${previousStatus}" to "${newStatus}" by ${performedByName || 'Unknown'}`,
    severity: 'info',
    previousState: { status: previousStatus },
    newState: { status: newStatus },
    changes: {
      status: { from: previousStatus, to: newStatus }
    },
    metadata: {
      changedAt: timestamp,
      changedBy: performedBy,
      changedByEmail: performedByEmail,
      changedByName: performedByName,
      reason,
      mmpId
    },
    relatedEntityIds: mmpId ? [mmpId] : undefined,
    tags: ['mmp', 'status_change', entityType, newStatus]
  });
}

export async function logBulkOperationAudit(
  operationType: string,
  mmpId: string,
  mmpName: string,
  affectedCount: number,
  performedBy: string,
  performedByName?: string,
  performedByEmail?: string,
  details?: Record<string, unknown>
): Promise<string | null> {
  const timestamp = new Date().toISOString();

  return logMMPAudit({
    mmpId,
    mmpName,
    action: 'bulk_operation',
    performedBy,
    performedByEmail,
    performedByName,
    affectedSites: affectedCount,
    metadata: {
      operationType,
      performedAt: timestamp,
      affectedCount,
      ...details
    }
  });
}

export async function getAuditTrailForMMP(mmpId: string, limit: number = 50): Promise<any[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .or(`entity_id.eq.${mmpId},metadata->mmpId.eq.${mmpId}`)
    .eq('module', 'mmp')
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[MMP Audit] Failed to fetch audit trail:', error);
    return [];
  }

  return data || [];
}

export async function getAuditTrailForSite(siteId: string, limit: number = 50): Promise<any[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('entity_id', siteId)
    .eq('entity_type', 'mmp_site_entry')
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[MMP Audit] Failed to fetch site audit trail:', error);
    return [];
  }

  return data || [];
}
