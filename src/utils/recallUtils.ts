import { MMPFile } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import type {
  RecallTier,
  RecallScopeType,
  RecallScopeFilter,
  RecallCheckResult,
  RecallRequest,
  RecallEvent,
  RecallAuditLog,
  TransportAdvanceRecovery,
  RecoveryMethod,
  RecallImpactPreview
} from '@/types/recall';
import { RECALL_SCOPE_LABELS, RECALL_TIER_LABELS } from '@/types/recall';

export interface LegacyRecallCheckResult {
  canRecall: boolean;
  reason?: string;
  blockers: string[];
}

export function checkRecallAllowed(mmpFile: MMPFile): LegacyRecallCheckResult {
  const blockers: string[] = [];
  const workflow = (mmpFile.workflow as any) || {};
  const permits = (mmpFile.permits as any) || {};
  const comprehensiveVerification = (mmpFile.comprehensiveVerification as any) || {};
  const cpVerification = (mmpFile.cpVerification as any) || {};

  if (!Array.isArray(workflow.forwardedToFomIds) || workflow.forwardedToFomIds.length === 0) {
    return {
      canRecall: false,
      reason: 'MMP has not been forwarded to FOMs',
      blockers: ['Not forwarded']
    };
  }

  if (mmpFile.status === 'approved') {
    blockers.push('MMP is already approved');
  }

  if (permits.documents && Array.isArray(permits.documents) && permits.documents.length > 0) {
    blockers.push('FOM has attached permits');
  }

  if (permits.statePermits && Array.isArray(permits.statePermits)) {
    const hasStatePermitDocs = permits.statePermits.some(
      (sp: any) => sp.documents && sp.documents.length > 0
    );
    if (hasStatePermitDocs) {
      blockers.push('State permits have been attached');
    }
  }

  if (permits.localPermits && Array.isArray(permits.localPermits)) {
    const hasLocalPermitDocs = permits.localPermits.some(
      (lp: any) => lp.documents && lp.documents.length > 0
    );
    if (hasLocalPermitDocs) {
      blockers.push('Local permits have been attached');
    }
  }

  if (workflow.forwardedToCoordinators === true) {
    blockers.push('MMP has been forwarded to coordinators');
  }

  if (workflow.forwardedToCoordinatorIds && workflow.forwardedToCoordinatorIds.length > 0) {
    blockers.push('Sites have been assigned to coordinators');
  }

  if (workflow.coordinatorVerified === true) {
    blockers.push('Coordinator verification has started');
  }

  const cpStatus = (comprehensiveVerification as any)?.cpVerification?.verificationStatus;
  if (cpStatus && cpStatus !== 'not_started') {
    blockers.push('CP verification has started');
  }

  const permitStatus = (comprehensiveVerification as any)?.permitVerification?.status;
  if (permitStatus && permitStatus !== 'not_started') {
    blockers.push('Permit verification has started');
  }

  if ((cpVerification as any)?.overallVerified === true) {
    blockers.push('CP verification is complete');
  }

  return {
    canRecall: blockers.length === 0,
    reason: blockers.length > 0 ? blockers.join('; ') : undefined,
    blockers
  };
}

export function checkTieredRecallAllowed(
  mmpFile: MMPFile,
  tier: RecallTier,
  isForceRecall: boolean = false,
  userRole?: string
): RecallCheckResult {
  const blockers: string[] = [];
  const workflow = (mmpFile.workflow as any) || {};
  const isSuperAdmin = userRole === 'super_admin';
  const isAdmin = userRole === 'admin' || userRole === 'ict';

  if (isForceRecall && (isSuperAdmin || isAdmin)) {
    return {
      canRecall: true,
      blockers: [],
      tier,
      requiresApproval: false,
      hasFinancialImpact: tier === 'coordinator_to_collector'
    };
  }

  switch (tier) {
    case 'admin_to_fom':
      return checkAdminToFomRecall(mmpFile, blockers);
    
    case 'fom_to_coordinator':
      return checkFomToCoordinatorRecall(mmpFile, blockers);
    
    case 'coordinator_to_collector':
      return checkCoordinatorToCollectorRecall(mmpFile, blockers);
    
    case 'super_admin_approved':
      return checkSuperAdminApprovedRecall(mmpFile, blockers, userRole);
    
    default:
      return {
        canRecall: false,
        reason: 'Invalid recall tier',
        blockers: ['Invalid tier'],
        tier,
        requiresApproval: true,
        hasFinancialImpact: false
      };
  }
}

function checkAdminToFomRecall(mmpFile: MMPFile, blockers: string[]): RecallCheckResult {
  const workflow = (mmpFile.workflow as any) || {};
  const permits = (mmpFile.permits as any) || {};
  const comprehensiveVerification = (mmpFile.comprehensiveVerification as any) || {};

  if (!Array.isArray(workflow.forwardedToFomIds) || workflow.forwardedToFomIds.length === 0) {
    blockers.push('MMP has not been forwarded to FOMs');
  }

  if (workflow.forwardedToCoordinators || workflow.forwardedToCoordinatorIds?.length > 0) {
    blockers.push('MMP has been forwarded to coordinators - use FOM to Coordinator tier');
  }

  if (workflow.coordinatorVerified) {
    blockers.push('Coordinator verification has started');
  }

  const cpStatus = comprehensiveVerification?.cpVerification?.verificationStatus;
  if (cpStatus && cpStatus !== 'not_started') {
    blockers.push('CP verification has started');
  }

  return {
    canRecall: blockers.length === 0,
    reason: blockers.length > 0 ? blockers.join('; ') : undefined,
    blockers,
    tier: 'admin_to_fom',
    requiresApproval: true,
    hasFinancialImpact: false
  };
}

function checkFomToCoordinatorRecall(mmpFile: MMPFile, blockers: string[]): RecallCheckResult {
  const workflow = (mmpFile.workflow as any) || {};

  if (!workflow.forwardedToCoordinatorIds?.length) {
    blockers.push('MMP has not been forwarded to coordinators');
  }

  if (workflow.sitesDispatchedToCollectors) {
    blockers.push('Sites have been dispatched to data collectors');
  }

  if (workflow.coordinatorVerified) {
    blockers.push('Coordinator verification is complete');
  }

  return {
    canRecall: blockers.length === 0,
    reason: blockers.length > 0 ? blockers.join('; ') : undefined,
    blockers,
    tier: 'fom_to_coordinator',
    requiresApproval: true,
    hasFinancialImpact: false
  };
}

function checkCoordinatorToCollectorRecall(mmpFile: MMPFile, blockers: string[]): RecallCheckResult {
  const workflow = (mmpFile.workflow as any) || {};

  if (!workflow.sitesDispatchedToCollectors) {
    blockers.push('Sites have not been dispatched to data collectors');
  }

  return {
    canRecall: blockers.length === 0,
    reason: blockers.length > 0 ? blockers.join('; ') : undefined,
    blockers,
    tier: 'coordinator_to_collector',
    requiresApproval: true,
    hasFinancialImpact: true
  };
}

function checkSuperAdminApprovedRecall(mmpFile: MMPFile, blockers: string[], userRole?: string): RecallCheckResult {
  const role = (userRole || '').toLowerCase().replace(/\s+/g, '_');
  const isSuperAdmin = role === 'super_admin' || role === 'superadmin';

  if (!isSuperAdmin) {
    blockers.push('Only Super Admin can recall approved MMPs');
  }

  if (mmpFile.status !== 'approved') {
    blockers.push('MMP is not approved - use a different recall tier');
  }

  return {
    canRecall: blockers.length === 0,
    reason: blockers.length > 0 ? blockers.join('; ') : undefined,
    blockers,
    tier: 'super_admin_approved',
    requiresApproval: false,
    hasFinancialImpact: true
  };
}

export interface RecallAuditLogEntry {
  action: 'recall';
  by: string;
  byEmail?: string;
  date: string;
  previousFomIds?: string[];
  reason?: string;
}

export async function performRecall(
  mmpId: string,
  recallerName: string,
  recallerEmail?: string,
  reason?: string
): Promise<{ success: boolean; error?: string; previousFomIds?: string[] }> {
  try {
    const { data: mmpData, error: fetchError } = await supabase
      .from('mmp_files')
      .select('workflow, logs, name')
      .eq('id', mmpId)
      .single();

    if (fetchError) throw fetchError;

    const workflow = (mmpData?.workflow as any) || {};
    const existingLogs = (mmpData?.logs as any[]) || [];
    const previousFomIds = [...(workflow.forwardedToFomIds || [])];
    const mmpName = mmpData?.name || 'Unknown MMP';

    workflow.forwardedToFomIds = [];
    delete workflow.forwardedAt;
    delete workflow.forwardedToCoordinators;
    delete workflow.forwardedToCoordinatorIds;
    delete workflow.currentStage;
    delete workflow.coordinatorVerified;
    delete workflow.locked;
    
    workflow.recalledAt = new Date().toISOString();
    workflow.recalledBy = recallerName;
    workflow.lastRecallReason = reason || null;

    const recallLog: RecallAuditLogEntry = {
      action: 'recall',
      by: recallerName,
      byEmail: recallerEmail,
      date: new Date().toISOString(),
      previousFomIds,
      reason
    };

    const updatedLogs = [...existingLogs, recallLog];

    const { error: updateError } = await supabase
      .from('mmp_files')
      .update({
        workflow,
        logs: updatedLogs
      })
      .eq('id', mmpId);

    if (updateError) throw updateError;

    if (previousFomIds.length > 0) {
      try {
        const { data: fomUsers } = await supabase
          .from('profiles')
          .select('id, email, full_name')
          .in('id', previousFomIds);

        if (fomUsers) {
          for (const fom of fomUsers) {
            await supabase.from('notifications').insert({
              recipient_id: fom.id,
              title_en: 'MMP Recalled',
              title_ar: 'تم سحب خطة المراقبة الشهرية',
              message_en: `MMP "${mmpName}" has been recalled by ${recallerName}. ${reason ? `Reason: ${reason}` : ''}`,
              message_ar: `تم سحب خطة المراقبة "${mmpName}" بواسطة ${recallerName}. ${reason ? `السبب: ${reason}` : ''}`,
              action_url: `/mmp/${mmpId}`,
              entity_id: mmpId,
              entity_type: 'mmpFile',
              event_type: 'assignments',
              status: 'pending',
              priority: 'high'
            });
          }
        }
      } catch (notifError) {
        console.error('[RECALL] Failed to send notifications:', notifError);
      }
    }

    return { success: true, previousFomIds };
  } catch (error: any) {
    console.error('[RECALL] Error performing recall:', error);
    return { success: false, error: error.message };
  }
}

function generateRecallEventId(): string {
  return `recall_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export async function performTieredRecall(
  request: RecallRequest,
  recallerUserId: string,
  recallerName: string,
  recallerEmail?: string
): Promise<{ success: boolean; error?: string; recallEventId?: string; affectedSites?: number }> {
  try {
    const { data: mmpData, error: fetchError } = await supabase
      .from('mmp_files')
      .select('*, mmp_site_entries(*)')
      .eq('id', request.mmpId)
      .single();

    if (fetchError) throw fetchError;
    if (!mmpData) throw new Error('MMP not found');

    const workflow = (mmpData.workflow as any) || {};
    const existingLogs = (mmpData.logs as any[]) || [];
    const mmpName = mmpData.name || 'Unknown MMP';

    const affectedSites = await getAffectedSites(request);
    const affectedUserIds = await getAffectedUsers(request, mmpData);
    const hasFinancialImpact = request.tier === 'coordinator_to_collector';
    const financialAmount = hasFinancialImpact ? await calculateRecoveryAmount(affectedSites) : 0;

    const recallEventId = generateRecallEventId();

    if (request.isForceRecall) {
      await executeRecall(request, mmpData, workflow, affectedSites, recallerName, recallEventId);
      
      if (hasFinancialImpact && request.recoveryMethod) {
        await createRecoveryRecords(
          recallEventId,
          request.mmpId,
          affectedSites,
          request.recoveryMethod
        );
      }
    }

    const recallLog: RecallAuditLog = {
      action: request.isForceRecall ? 'recall_completed' : 'recall_initiated',
      recallEventId,
      tier: request.tier,
      by: recallerName,
      byEmail: recallerEmail,
      date: new Date().toISOString(),
      scopeType: request.scopeType,
      affectedSites: affectedSites.length,
      financialAmount,
      reason: request.reason,
      previousState: {
        forwardedToFomIds: workflow.forwardedToFomIds,
        forwardedToCoordinatorIds: workflow.forwardedToCoordinatorIds
      },
      isForceRecall: request.isForceRecall
    } as any;

    const updatedLogs = [...existingLogs, recallLog];

    const { error: updateError } = await supabase
      .from('mmp_files')
      .update({
        logs: updatedLogs,
        workflow: request.isForceRecall ? workflow : mmpData.workflow
      })
      .eq('id', request.mmpId);

    if (updateError) throw updateError;

    // Log to audit_logs table for comprehensive tracking
    try {
      await supabase.from('audit_logs').insert({
        module: 'mmp',
        action: request.isForceRecall ? 'force_recall' : 'recall',
        entity_type: 'mmp',
        entity_id: request.mmpId,
        entity_name: mmpName,
        description: request.isForceRecall 
          ? `Force recall executed on MMP "${mmpName}" by ${recallerName}` 
          : `Recall initiated on MMP "${mmpName}" by ${recallerName}`,
        success: true,
        actor_id: recallerUserId,
        actor_name: recallerName,
        actor_email: recallerEmail,
        severity: request.isForceRecall ? 'warning' : 'info',
        timestamp: new Date().toISOString(),
        metadata: {
          recallEventId,
          tier: request.tier,
          scopeType: request.scopeType,
          scopeFilters: request.scopeFilters,
          affectedSitesCount: affectedSites.length,
          affectedUserIds,
          hasFinancialImpact,
          financialAmount,
          recoveryMethod: request.recoveryMethod,
          reason: request.reason,
          isForceRecall: request.isForceRecall,
          previousState: {
            forwardedToFomIds: workflow.forwardedToFomIds,
            forwardedToCoordinatorIds: workflow.forwardedToCoordinatorIds
          }
        },
        tags: ['mmp', 'recall', request.tier, request.isForceRecall ? 'force_recall' : 'standard_recall']
      });
    } catch (auditError) {
      console.warn('[TIERED_RECALL] Audit log failed:', auditError);
    }

    await sendRecallNotifications(
      request.tier,
      mmpName,
      request.mmpId,
      recallerName,
      request.reason,
      affectedUserIds,
      request.isForceRecall
    );

    return {
      success: true,
      recallEventId,
      affectedSites: affectedSites.length
    };
  } catch (error: any) {
    console.error('[TIERED_RECALL] Error:', error);
    return { success: false, error: error.message };
  }
}

async function getAffectedSites(request: RecallRequest): Promise<any[]> {
  let query = supabase
    .from('mmp_site_entries')
    .select('*')
    .eq('mmp_file_id', request.mmpId);

  if (request.scopeType !== 'full_mmp' && request.scopeFilters) {
    const filters = request.scopeFilters;

    if (filters.siteIds?.length) {
      query = query.in('id', filters.siteIds);
    }
    if (filters.siteNames?.length) {
      query = query.in('site_name', filters.siteNames);
    }
    if (filters.localities?.length) {
      query = query.in('locality', filters.localities);
    }
    if (filters.states?.length) {
      query = query.in('state', filters.states);
    }
    if (filters.activityIds?.length) {
      query = query.in('main_activity', filters.activityIds);
    }
    if (filters.hubs?.length) {
      query = query.in('hub_office', filters.hubs);
    }
    if (filters.cpIds?.length) {
      query = query.in('cp_name', filters.cpIds);
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function getAffectedUsers(request: RecallRequest, mmpData: any): Promise<string[]> {
  const workflow = (mmpData.workflow as any) || {};
  const userIds: Set<string> = new Set();

  switch (request.tier) {
    case 'admin_to_fom':
      (workflow.forwardedToFomIds || []).forEach((id: string) => userIds.add(id));
      break;
    case 'fom_to_coordinator':
      (workflow.forwardedToCoordinatorIds || []).forEach((id: string) => userIds.add(id));
      break;
    case 'coordinator_to_collector':
      const sites = await getAffectedSites(request);
      sites.forEach((site: any) => {
        if (site.assigned_to) userIds.add(site.assigned_to);
        if (site.claimed_by) userIds.add(site.claimed_by);
      });
      break;
  }

  return Array.from(userIds);
}

async function calculateRecoveryAmount(sites: any[]): Promise<number> {
  let total = 0;
  for (const site of sites) {
    if (site.transport_advance_paid && site.transport_advance_amount) {
      total += site.transport_advance_amount;
    }
  }
  return total;
}

async function executeRecall(
  request: RecallRequest,
  mmpData: any,
  workflow: any,
  affectedSites: any[],
  recallerName: string,
  recallEventId: string
): Promise<void> {
  const now = new Date().toISOString();

  switch (request.tier) {
    case 'admin_to_fom':
      workflow.forwardedToFomIds = [];
      delete workflow.forwardedAt;
      delete workflow.forwardedToCoordinators;
      delete workflow.forwardedToCoordinatorIds;
      workflow.recalledAt = now;
      workflow.recalledBy = recallerName;
      workflow.lastRecallReason = request.reason;
      workflow.lastRecallEventId = recallEventId;
      break;

    case 'fom_to_coordinator':
      if (request.scopeType === 'full_mmp') {
        workflow.forwardedToCoordinatorIds = [];
        delete workflow.forwardedToCoordinators;
      }
      const fomSiteIds = affectedSites.map(s => s.id);
      if (fomSiteIds.length > 0) {
        await supabase
          .from('mmp_site_entries')
          .update({
            assigned_to: null,
            assignment_status: 'recalled',
            recall_status: 'recalled',
            recall_event_id: recallEventId,
            recalled_at: now,
            recalled_by: recallerName
          })
          .in('id', fomSiteIds);
      }
      workflow.fomRecalledAt = now;
      workflow.fomRecalledBy = recallerName;
      workflow.lastRecallEventId = recallEventId;
      break;

    case 'coordinator_to_collector':
      const siteIds = affectedSites.map(s => s.id);
      if (siteIds.length > 0) {
        await supabase
          .from('mmp_site_entries')
          .update({
            claimed_by: null,
            claim_status: 'recalled',
            dispatch_status: 'recalled',
            recall_status: 'recalled',
            recall_event_id: recallEventId,
            recalled_at: now,
            recalled_by: recallerName
          })
          .in('id', siteIds);
      }
      
      workflow.collectorRecalledAt = new Date().toISOString();
      workflow.collectorRecalledBy = recallerName;
      break;
  }

  await supabase
    .from('mmp_files')
    .update({ workflow })
    .eq('id', request.mmpId);
}

async function createRecoveryRecords(
  recallEventId: string,
  mmpId: string,
  sites: any[],
  recoveryMethod: RecoveryMethod
): Promise<void> {
  const recoveryRecords: Partial<TransportAdvanceRecovery>[] = [];

  for (const site of sites) {
    if (site.transport_advance_paid && site.transport_advance_amount > 0) {
      recoveryRecords.push({
        recallEventId,
        mmpId,
        siteEntryId: site.id,
        dataCollectorId: site.claimed_by || site.assigned_to,
        originalAmount: site.transport_advance_amount,
        recoveredAmount: 0,
        pendingAmount: site.transport_advance_amount,
        currency: site.currency || 'SDG',
        recoveryMethod,
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
  }

  console.log('[RECALL] Created recovery records:', recoveryRecords.length);
}

async function sendRecallNotifications(
  tier: RecallTier,
  mmpName: string,
  mmpId: string,
  recallerName: string,
  reason: string,
  affectedUserIds: string[],
  isForceRecall: boolean
): Promise<void> {
  const titleEn = isForceRecall ? 'MMP Force Recalled' : 'MMP Recall Initiated';
  const titleAr = isForceRecall ? 'تم سحب خطة المراقبة بالقوة' : 'تم بدء سحب خطة المراقبة';

  const tierLabels: Record<RecallTier, string> = {
    admin_to_fom: 'from FOM',
    fom_to_coordinator: 'from Coordinators',
    coordinator_to_collector: 'from Data Collectors',
    super_admin_approved: 'from Approved Status'
  };

  const messageEn = `MMP "${mmpName}" has been recalled ${tierLabels[tier]} by ${recallerName}. ${reason ? `Reason: ${reason}` : ''}`;
  const messageAr = `تم سحب خطة المراقبة "${mmpName}" بواسطة ${recallerName}. ${reason ? `السبب: ${reason}` : ''}`;

  for (const userId of affectedUserIds) {
    try {
      await supabase.from('notifications').insert({
        recipient_id: userId,
        title_en: titleEn,
        title_ar: titleAr,
        message_en: messageEn,
        message_ar: messageAr,
        action_url: `/mmp/${mmpId}`,
        entity_id: mmpId,
        entity_type: 'mmpFile',
        event_type: 'recall',
        status: 'pending',
        priority: 'high'
      });
    } catch (err) {
      console.error('[RECALL] Failed to send notification to:', userId, err);
    }
  }

  try {
    const { data: superAdmins } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'super_admin')
      .limit(2);

    if (superAdmins) {
      for (const admin of superAdmins) {
        if (!affectedUserIds.includes(admin.id)) {
          await supabase.from('notifications').insert({
            recipient_id: admin.id,
            title_en: titleEn,
            title_ar: titleAr,
            message_en: `[CC] ${messageEn}`,
            message_ar: `[نسخة] ${messageAr}`,
            action_url: `/mmp/${mmpId}`,
            entity_id: mmpId,
            entity_type: 'mmpFile',
            event_type: 'recall',
            status: 'pending',
            priority: 'medium'
          });
        }
      }
    }
  } catch (err) {
    console.error('[RECALL] Failed to CC super admins:', err);
  }
}

export async function approveRecall(
  mmpId: string,
  recallEventId: string,
  approverId: string,
  approverName: string,
  approverEmail?: string,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: mmpData, error: fetchError } = await supabase
      .from('mmp_files')
      .select('*, mmp_site_entries(*)')
      .eq('id', mmpId)
      .single();

    if (fetchError) throw fetchError;
    if (!mmpData) throw new Error('MMP not found');

    const existingLogs = (mmpData.logs as any[]) || [];
    const workflow = (mmpData.workflow as any) || {};

    const initiationLog = existingLogs.find(
      (log: any) => log.recallEventId === recallEventId && log.action === 'recall_initiated'
    );

    if (!initiationLog) {
      throw new Error('Recall event not found');
    }

    const tier = initiationLog.tier as RecallTier;
    const scopeType = initiationLog.scopeType as RecallScopeType;

    const request: RecallRequest = {
      mmpId,
      tier,
      scopeType,
      scopeFilters: initiationLog.scopeFilters || {},
      reason: initiationLog.reason || 'Approved recall',
      isForceRecall: false
    };

    const affectedSites = await getAffectedSites(request);
    await executeRecall(request, mmpData, workflow, affectedSites, approverName, recallEventId);

    const hasFinancialImpact = tier === 'coordinator_to_collector';
    if (hasFinancialImpact) {
      await createRecoveryRecords(recallEventId, mmpId, affectedSites, 'deduct_future');
    }

    const approvalLog: RecallAuditLog = {
      action: 'recall_approved',
      recallEventId,
      tier,
      by: approverName,
      byEmail: approverEmail,
      date: new Date().toISOString(),
      notes
    };

    const updatedLogs = [...existingLogs, approvalLog];

    const { error: updateError } = await supabase
      .from('mmp_files')
      .update({
        logs: updatedLogs,
        workflow
      })
      .eq('id', mmpId);

    if (updateError) throw updateError;

    return { success: true };
  } catch (error: any) {
    console.error('[RECALL] Approval error:', error);
    return { success: false, error: error.message };
  }
}

export async function rejectRecall(
  mmpId: string,
  recallEventId: string,
  rejecterId: string,
  rejecterName: string,
  rejecterEmail?: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: mmpData, error: fetchError } = await supabase
      .from('mmp_files')
      .select('logs')
      .eq('id', mmpId)
      .single();

    if (fetchError) throw fetchError;
    if (!mmpData) throw new Error('MMP not found');

    const existingLogs = (mmpData.logs as any[]) || [];
    const initiationLog = existingLogs.find(
      (log: any) => log.recallEventId === recallEventId && log.action === 'recall_initiated'
    );

    if (!initiationLog) {
      throw new Error('Recall event not found');
    }

    const rejectionLog: RecallAuditLog = {
      action: 'recall_rejected',
      recallEventId,
      tier: initiationLog.tier,
      by: rejecterName,
      byEmail: rejecterEmail,
      date: new Date().toISOString(),
      notes: reason
    };

    const updatedLogs = [...existingLogs, rejectionLog];

    const { error: updateError } = await supabase
      .from('mmp_files')
      .update({ logs: updatedLogs })
      .eq('id', mmpId);

    if (updateError) throw updateError;

    return { success: true };
  } catch (error: any) {
    console.error('[RECALL] Rejection error:', error);
    return { success: false, error: error.message };
  }
}

export interface ProcessRecoveryOptions {
  siteEntryId: string;
  processedBy: string;
  method: RecoveryMethod;
  amount: number;
  notes?: string;
  walletTransactionId?: string;
  receiptReference?: string;
}

export async function processRecovery(
  siteEntryIdOrOptions: string | ProcessRecoveryOptions,
  processedBy?: string,
  method?: RecoveryMethod,
  amount?: number,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    let options: ProcessRecoveryOptions;
    
    if (typeof siteEntryIdOrOptions === 'string') {
      options = {
        siteEntryId: siteEntryIdOrOptions,
        processedBy: processedBy || 'Unknown',
        method: method || 'deduct_future',
        amount: amount || 0,
        notes
      };
    } else {
      options = siteEntryIdOrOptions;
    }

    const { data: entry, error: fetchError } = await supabase
      .from('mmp_site_entries')
      .select('transport_advance_amount, transport_advance_recovered')
      .eq('id', options.siteEntryId)
      .single();

    if (fetchError) throw fetchError;
    if (!entry) throw new Error('Site entry not found');

    const originalAmount = entry.transport_advance_amount || 0;
    const currentRecovered = entry.transport_advance_recovered || 0;
    const newRecovered = currentRecovered + options.amount;
    const isFullyRecovered = newRecovered >= originalAmount;

    const status = options.method === 'write_off' 
      ? 'written_off' 
      : (isFullyRecovered ? 'recovered' : 'in_progress');

    const recoveryNotes = [
      options.notes,
      options.walletTransactionId ? `Wallet TX: ${options.walletTransactionId}` : null,
      options.receiptReference ? `Receipt: ${options.receiptReference}` : null
    ].filter(Boolean).join(' | ') || null;

    const { error: updateError } = await supabase
      .from('mmp_site_entries')
      .update({
        transport_advance_recovered: newRecovered,
        recall_recovery_method: options.method,
        recall_recovery_status: status,
        recall_recovery_notes: recoveryNotes,
        recall_recovery_processed_by: options.processedBy,
        recall_recovery_processed_at: new Date().toISOString()
      })
      .eq('id', options.siteEntryId);

    if (updateError) throw updateError;

    return { success: true };
  } catch (error: any) {
    console.error('[RECOVERY] Processing error:', error);
    return { success: false, error: error.message };
  }
}

export function getRecallTierForRole(userRole: string): RecallTier | null {
  const role = userRole.toLowerCase().replace(/\s+/g, '_');
  switch (role) {
    case 'super_admin':
    case 'superadmin':
    case 'admin':
    case 'ict':
      return 'admin_to_fom';
    case 'fom':
    case 'hub_supervisor':
    case 'hubsupervisor':
      return 'fom_to_coordinator';
    case 'coordinator':
      return 'coordinator_to_collector';
    default:
      return null;
  }
}

export function canForceRecall(userRole: string): boolean {
  const role = userRole.toLowerCase().replace(/\s+/g, '_');
  return role === 'super_admin' || role === 'superadmin' || role === 'admin' || role === 'ict';
}

export async function computeRecallImpact(
  request: RecallRequest
): Promise<RecallImpactPreview> {
  const warnings: string[] = [];

  let query = supabase
    .from('mmp_site_entries')
    .select('*')
    .eq('mmp_file_id', request.mmpId);

  if (request.scopeType !== 'full_mmp' && request.scopeFilters) {
    const filters = request.scopeFilters;
    if (filters.siteIds?.length) query = query.in('id', filters.siteIds);
    if (filters.siteNames?.length) query = query.in('site_name', filters.siteNames);
    if (filters.localities?.length) query = query.in('locality', filters.localities);
    if (filters.states?.length) query = query.in('state', filters.states);
    if (filters.activityIds?.length) query = query.in('main_activity', filters.activityIds);
    if (filters.hubs?.length) query = query.in('hub_office', filters.hubs);
    if (filters.cpIds?.length) query = query.in('cp_name', filters.cpIds);
  }

  const { data: sites, error } = await query;
  if (error) {
    console.error('Error computing recall impact:', error);
    return {
      affectedSiteCount: 0,
      affectedCollectorCount: 0,
      affectedCollectors: [],
      hasFinancialImpact: false,
      financialAmount: 0,
      sitesWithAdvances: 0,
      scopeSummary: 'Unable to compute impact',
      warnings: ['Error fetching site data']
    };
  }

  const affectedSites = sites || [];
  const affectedSiteCount = affectedSites.length;

  const collectorMap = new Map<string, { id: string; name: string; email?: string }>();
  let financialAmount = 0;
  let sitesWithAdvances = 0;

  for (const site of affectedSites) {
    if (site.assigned_to || site.claimed_by) {
      const collectorId = site.assigned_to || site.claimed_by;
      if (!collectorMap.has(collectorId)) {
        collectorMap.set(collectorId, {
          id: collectorId,
          name: site.assigned_to_name || site.claimed_by_name || 'Unknown',
          email: site.assigned_to_email || site.claimed_by_email
        });
      }
    }

    if (site.transport_advance_paid && site.transport_advance_amount) {
      financialAmount += Number(site.transport_advance_amount) || 0;
      sitesWithAdvances++;
    }
  }

  const affectedCollectors = Array.from(collectorMap.values());
  const hasFinancialImpact = request.tier === 'coordinator_to_collector' && sitesWithAdvances > 0;

  let scopeSummary = RECALL_SCOPE_LABELS[request.scopeType]?.en || 'Unknown scope';
  if (request.scopeType !== 'full_mmp' && request.scopeFilters) {
    const filterValues = Object.values(request.scopeFilters).flat().filter(Boolean);
    if (filterValues.length > 0) {
      scopeSummary += `: ${filterValues.slice(0, 3).join(', ')}`;
      if (filterValues.length > 3) {
        scopeSummary += ` (+${filterValues.length - 3} more)`;
      }
    }
  }

  if (hasFinancialImpact) {
    warnings.push(`Transportation advances of ${financialAmount.toLocaleString()} SDG will need recovery`);
  }

  if (affectedSiteCount === 0) {
    warnings.push('No sites match the selected criteria');
  }

  if (request.isForceRecall) {
    warnings.push('Force recall will bypass normal approval workflow');
  }

  const completedSites = affectedSites.filter(s => s.status === 'completed' || s.status === 'verified');
  if (completedSites.length > 0) {
    warnings.push(`${completedSites.length} site(s) have already been completed/verified`);
  }

  return {
    affectedSiteCount,
    affectedCollectorCount: collectorMap.size,
    affectedCollectors,
    hasFinancialImpact,
    financialAmount,
    sitesWithAdvances,
    scopeSummary,
    warnings
  };
}
