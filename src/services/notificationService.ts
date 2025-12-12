import { supabase } from '@/integrations/supabase/client';

export interface NotificationPayload {
  event_type: string;
  entity_type?: string;
  entity_id?: string;
  priority?: 'urgent' | 'high' | 'normal';
  recipient_ids?: string[];
  recipient_roles?: string[];
  title_en: string;
  title_ar?: string;
  message_en: string;
  message_ar?: string;
  triggered_by?: string;
  triggered_by_name?: string;
  workflow_stage?: string;
  action_url?: string;
  metadata?: Record<string, any>;
  send_email?: boolean;
}

export interface NotificationResult {
  success: boolean;
  notifications_created?: number;
  emails_sent?: number;
  emails_failed?: number;
  error?: string;
}

const eventMessages: Record<string, { en: string; ar: string }> = {
  'mmp_created': {
    en: 'A new Monthly Monitoring Plan has been created and requires your attention.',
    ar: 'تم إنشاء خطة مراقبة شهرية جديدة وتحتاج إلى انتباهك.'
  },
  'mmp_assigned': {
    en: 'You have been assigned to a Monthly Monitoring Plan.',
    ar: 'تم تعيينك لخطة مراقبة شهرية.'
  },
  'mmp_updated': {
    en: 'A Monthly Monitoring Plan has been updated.',
    ar: 'تم تحديث خطة المراقبة الشهرية.'
  },
  'mmp_completed': {
    en: 'A Monthly Monitoring Plan has been completed.',
    ar: 'اكتملت خطة المراقبة الشهرية.'
  },
  'task_assigned': {
    en: 'A new task has been assigned to you.',
    ar: 'تم تعيين مهمة جديدة لك.'
  },
  'task_completed': {
    en: 'A task has been marked as completed.',
    ar: 'تم وضع علامة اكتمال على المهمة.'
  },
  'site_visit_assigned': {
    en: 'You have been assigned to a site visit.',
    ar: 'تم تعيينك لزيارة ميدانية.'
  },
  'site_visit_completed': {
    en: 'A site visit has been completed.',
    ar: 'اكتملت الزيارة الميدانية.'
  },
  'cost_submitted': {
    en: 'A new cost submission has been received and requires your review.',
    ar: 'تم استلام طلب تكلفة جديد ويحتاج إلى مراجعتك.'
  },
  'cost_approved': {
    en: 'Your cost submission has been approved.',
    ar: 'تمت الموافقة على طلب التكلفة الخاص بك.'
  },
  'cost_rejected': {
    en: 'Your cost submission has been rejected. Please review the feedback.',
    ar: 'تم رفض طلب التكلفة الخاص بك. يرجى مراجعة الملاحظات.'
  },
  'payment_processed': {
    en: 'A payment has been processed.',
    ar: 'تمت معالجة الدفع.'
  },
  'wallet_updated': {
    en: 'Your wallet balance has been updated.',
    ar: 'تم تحديث رصيد محفظتك.'
  },
  'approval_required': {
    en: 'An item requires your approval.',
    ar: 'عنصر يحتاج إلى موافقتك.'
  },
  'user_approved': {
    en: 'Your account has been approved. You can now access the system.',
    ar: 'تمت الموافقة على حسابك. يمكنك الآن الوصول إلى النظام.'
  }
};

export const notificationService = {
  async dispatch(payload: NotificationPayload): Promise<NotificationResult> {
    try {
      const defaults = eventMessages[payload.event_type] || { en: '', ar: '' };
      
      const { data, error } = await supabase.functions.invoke('dispatch-notification', {
        body: {
          ...payload,
          message_en: payload.message_en || defaults.en,
          message_ar: payload.message_ar || defaults.ar || payload.message_en,
          send_email: payload.send_email ?? true
        }
      });

      if (error) {
        console.error('Notification dispatch error:', error);
        return { success: false, error: error.message };
      }

      return data as NotificationResult;
    } catch (err) {
      console.error('Notification service error:', err);
      return { success: false, error: (err as Error).message };
    }
  },

  async notifyMmpCreated(mmpId: string, mmpName: string, createdBy: string, createdByName: string) {
    return this.dispatch({
      event_type: 'mmp_created',
      entity_type: 'mmp',
      entity_id: mmpId,
      priority: 'high',
      recipient_roles: ['fom', 'field_supervisor', 'field_coordinator'],
      title_en: 'New MMP Created',
      title_ar: 'تم إنشاء خطة مراقبة شهرية جديدة',
      message_en: `A new Monthly Monitoring Plan "${mmpName}" has been created and requires your attention.`,
      message_ar: `تم إنشاء خطة مراقبة شهرية جديدة "${mmpName}" وتحتاج إلى انتباهك.`,
      triggered_by: createdBy,
      triggered_by_name: createdByName,
      action_url: `/mmp/${mmpId}`,
      workflow_stage: 'fom'
    });
  },

  async notifyMmpAssigned(mmpId: string, mmpName: string, assigneeIds: string[], assignedBy: string, assignedByName: string) {
    return this.dispatch({
      event_type: 'mmp_assigned',
      entity_type: 'mmp',
      entity_id: mmpId,
      priority: 'high',
      recipient_ids: assigneeIds,
      title_en: 'MMP Assigned to You',
      title_ar: 'تم تعيين خطة مراقبة شهرية لك',
      message_en: `You have been assigned to the Monthly Monitoring Plan "${mmpName}".`,
      message_ar: `تم تعيينك لخطة المراقبة الشهرية "${mmpName}".`,
      triggered_by: assignedBy,
      triggered_by_name: assignedByName,
      action_url: `/mmp/${mmpId}`
    });
  },

  async notifySiteVisitAssigned(visitId: string, siteName: string, assigneeId: string, assignedBy: string, assignedByName: string) {
    return this.dispatch({
      event_type: 'site_visit_assigned',
      entity_type: 'site_visit',
      entity_id: visitId,
      priority: 'high',
      recipient_ids: [assigneeId],
      title_en: 'Site Visit Assigned',
      title_ar: 'تم تعيين زيارة ميدانية',
      message_en: `You have been assigned to visit "${siteName}".`,
      message_ar: `تم تعيينك لزيارة "${siteName}".`,
      triggered_by: assignedBy,
      triggered_by_name: assignedByName,
      action_url: `/site-visits/${visitId}`
    });
  },

  async notifySiteVisitCompleted(visitId: string, siteName: string, completedBy: string, completedByName: string, supervisorIds: string[]) {
    return this.dispatch({
      event_type: 'site_visit_completed',
      entity_type: 'site_visit',
      entity_id: visitId,
      priority: 'normal',
      recipient_ids: supervisorIds,
      title_en: 'Site Visit Completed',
      title_ar: 'اكتملت الزيارة الميدانية',
      message_en: `The site visit to "${siteName}" has been completed by ${completedByName}.`,
      message_ar: `اكتملت الزيارة الميدانية إلى "${siteName}" بواسطة ${completedByName}.`,
      triggered_by: completedBy,
      triggered_by_name: completedByName,
      action_url: `/site-visits/${visitId}`
    });
  },

  async notifyCostSubmitted(submissionId: string, amount: number, submittedBy: string, submittedByName: string, approverIds: string[]) {
    return this.dispatch({
      event_type: 'cost_submitted',
      entity_type: 'cost_submission',
      entity_id: submissionId,
      priority: 'high',
      recipient_ids: approverIds,
      title_en: 'Cost Submission Received',
      title_ar: 'تم استلام طلب التكلفة',
      message_en: `A cost submission of ${amount} SDG has been submitted by ${submittedByName} and requires your approval.`,
      message_ar: `تم تقديم طلب تكلفة بقيمة ${amount} جنيه سوداني بواسطة ${submittedByName} ويحتاج إلى موافقتك.`,
      triggered_by: submittedBy,
      triggered_by_name: submittedByName,
      action_url: `/finance/cost-submissions/${submissionId}`
    });
  },

  async notifyCostApproved(submissionId: string, amount: number, submitterId: string, approvedBy: string, approvedByName: string) {
    return this.dispatch({
      event_type: 'cost_approved',
      entity_type: 'cost_submission',
      entity_id: submissionId,
      priority: 'normal',
      recipient_ids: [submitterId],
      title_en: 'Cost Approved',
      title_ar: 'تمت الموافقة على التكلفة',
      message_en: `Your cost submission of ${amount} SDG has been approved by ${approvedByName}.`,
      message_ar: `تمت الموافقة على طلب التكلفة الخاص بك بقيمة ${amount} جنيه سوداني بواسطة ${approvedByName}.`,
      triggered_by: approvedBy,
      triggered_by_name: approvedByName,
      action_url: `/finance/cost-submissions/${submissionId}`
    });
  },

  async notifyCostRejected(submissionId: string, amount: number, submitterId: string, rejectedBy: string, rejectedByName: string, reason?: string) {
    return this.dispatch({
      event_type: 'cost_rejected',
      entity_type: 'cost_submission',
      entity_id: submissionId,
      priority: 'urgent',
      recipient_ids: [submitterId],
      title_en: 'Cost Rejected',
      title_ar: 'تم رفض التكلفة',
      message_en: `Your cost submission of ${amount} SDG has been rejected by ${rejectedByName}.${reason ? ` Reason: ${reason}` : ''}`,
      message_ar: `تم رفض طلب التكلفة الخاص بك بقيمة ${amount} جنيه سوداني بواسطة ${rejectedByName}.${reason ? ` السبب: ${reason}` : ''}`,
      triggered_by: rejectedBy,
      triggered_by_name: rejectedByName,
      action_url: `/finance/cost-submissions/${submissionId}`
    });
  },

  async notifyPaymentProcessed(paymentId: string, amount: number, recipientId: string, processedBy: string, processedByName: string) {
    return this.dispatch({
      event_type: 'payment_processed',
      entity_type: 'payment',
      entity_id: paymentId,
      priority: 'normal',
      recipient_ids: [recipientId],
      title_en: 'Payment Processed',
      title_ar: 'تمت معالجة الدفع',
      message_en: `A payment of ${amount} SDG has been processed to your account.`,
      message_ar: `تمت معالجة دفعة بقيمة ${amount} جنيه سوداني إلى حسابك.`,
      triggered_by: processedBy,
      triggered_by_name: processedByName,
      action_url: `/finance/payments/${paymentId}`
    });
  },

  async notifyUserApproved(userId: string, userName: string, approvedBy: string, approvedByName: string) {
    return this.dispatch({
      event_type: 'user_approved',
      entity_type: 'user',
      entity_id: userId,
      priority: 'normal',
      recipient_ids: [userId],
      title_en: 'Account Approved',
      title_ar: 'تمت الموافقة على الحساب',
      message_en: `Welcome ${userName}! Your account has been approved. You can now access the PACT Command Center.`,
      message_ar: `مرحباً ${userName}! تمت الموافقة على حسابك. يمكنك الآن الوصول إلى مركز قيادة باكت.`,
      triggered_by: approvedBy,
      triggered_by_name: approvedByName,
      action_url: '/dashboard'
    });
  },

  async notifyTaskAssigned(taskId: string, taskName: string, assigneeIds: string[], assignedBy: string, assignedByName: string) {
    return this.dispatch({
      event_type: 'task_assigned',
      entity_type: 'task',
      entity_id: taskId,
      priority: 'high',
      recipient_ids: assigneeIds,
      title_en: 'New Task Assigned',
      title_ar: 'تم تعيين مهمة جديدة',
      message_en: `You have been assigned to the task "${taskName}".`,
      message_ar: `تم تعيينك للمهمة "${taskName}".`,
      triggered_by: assignedBy,
      triggered_by_name: assignedByName,
      action_url: `/tasks/${taskId}`
    });
  }
};

export default notificationService;
