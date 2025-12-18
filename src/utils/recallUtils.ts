import { MMPFile } from '@/types';
import { supabase } from '@/integrations/supabase/client';

export interface RecallCheckResult {
  canRecall: boolean;
  reason?: string;
  blockers: string[];
}

export function checkRecallAllowed(mmpFile: MMPFile): RecallCheckResult {
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

export interface RecallAuditLog {
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

    // Reset all forwarding-related workflow fields
    workflow.forwardedToFomIds = [];
    delete workflow.forwardedAt;
    delete workflow.forwardedToCoordinators;
    delete workflow.forwardedToCoordinatorIds;
    delete workflow.currentStage;
    delete workflow.coordinatorVerified;
    delete workflow.locked;
    
    // Add recall tracking
    workflow.recalledAt = new Date().toISOString();
    workflow.recalledBy = recallerName;
    workflow.lastRecallReason = reason || null;

    const recallLog: RecallAuditLog = {
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
