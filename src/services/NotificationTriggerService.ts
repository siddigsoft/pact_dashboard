import { supabase } from '@/integrations/supabase/client';
import { EmailNotificationService } from './email-notification.service';

export type NotificationCategory = 'assignments' | 'approvals' | 'financial' | 'team' | 'system' | 'signatures' | 'calls' | 'messages';

/**
 * Helper function to format role strings into displayable titles
 * Supports both English display and bilingual greetings
 */
export const formatRoleName = (role: string | null | undefined): { en: string; ar: string } => {
  if (!role) return { en: 'Team Member', ar: 'عضو الفريق' };
  
  const roleMap: Record<string, { en: string; ar: string }> = {
    'super_admin': { en: 'Super Administrator', ar: 'المدير العام' },
    'superAdmin': { en: 'Super Administrator', ar: 'المدير العام' },
    'SuperAdmin': { en: 'Super Administrator', ar: 'المدير العام' },
    'admin': { en: 'Administrator', ar: 'المدير' },
    'Admin': { en: 'Administrator', ar: 'المدير' },
    'fom': { en: 'Field Operations Manager', ar: 'مدير العمليات الميدانية' },
    'FOM': { en: 'Field Operations Manager', ar: 'مدير العمليات الميدانية' },
    'supervisor': { en: 'Hub Supervisor', ar: 'مشرف المحور' },
    'Supervisor': { en: 'Hub Supervisor', ar: 'مشرف المحور' },
    'coordinator': { en: 'Coordinator', ar: 'المنسق' },
    'Coordinator': { en: 'Coordinator', ar: 'المنسق' },
    'data_collector': { en: 'Data Collector', ar: 'جامع البيانات' },
    'dataCollector': { en: 'Data Collector', ar: 'جامع البيانات' },
    'enumerator': { en: 'Enumerator', ar: 'العداد' },
    'Enumerator': { en: 'Enumerator', ar: 'العداد' },
    'finance': { en: 'Finance Officer', ar: 'موظف المالية' },
    'Finance': { en: 'Finance Officer', ar: 'موظف المالية' },
    'viewer': { en: 'Viewer', ar: 'مشاهد' },
    'Viewer': { en: 'Viewer', ar: 'مشاهد' },
  };
  
  return roleMap[role] || { en: role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), ar: role };
};

// Type for hub management users with role information
interface HubManagementUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
}
export type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';

interface TriggerNotificationOptions {
  userId: string;
  title: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  category?: NotificationCategory;
  priority?: NotificationPriority;
  link?: string;
  relatedEntityId?: string;
  relatedEntityType?: 'siteVisit' | 'mmpFile' | 'transaction' | 'chat' | 'call' | 'signature' | 'document';
  targetRoles?: string[];
  projectId?: string;
  sendEmail?: boolean;
  emailActionUrl?: string;
  emailActionLabel?: string;
}

interface QuietHoursSettings {
  enabled: boolean;
  startHour: number;
  endHour: number;
  timezone?: string;
}

const isWithinQuietHours = (quietHours: QuietHoursSettings): boolean => {
  if (!quietHours.enabled) return false;
  
  const now = new Date();
  const currentHour = now.getHours();
  
  const { startHour, endHour } = quietHours;
  
  if (startHour <= endHour) {
    return currentHour >= startHour && currentHour < endHour;
  } else {
    return currentHour >= startHour || currentHour < endHour;
  }
};

const shouldSendNotification = async (
  userId: string,
  category: NotificationCategory,
  priority: NotificationPriority
): Promise<boolean> => {
  try {
    const { data: settings } = await supabase
      .from('user_settings')
      .select('settings')
      .eq('user_id', userId)
      .limit(1)
      .single();

    if (!settings?.settings?.notificationPreferences) {
      return true;
    }

    const prefs = settings.settings.notificationPreferences;

    if (!prefs.enabled) return false;

    if (!prefs.categories?.[category]) return false;

    if (prefs.quietHours && priority !== 'urgent') {
      if (isWithinQuietHours(prefs.quietHours)) {
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('Error checking notification settings:', error);
    return true;
  }
};

export const NotificationTriggerService = {
  async send(options: TriggerNotificationOptions): Promise<boolean> {
    const {
      userId,
      title,
      message,
      type = 'info',
      category = 'system',
      priority = 'medium',
      link,
      relatedEntityId,
      relatedEntityType,
      targetRoles,
      projectId,
      sendEmail = false,
      emailActionUrl,
      emailActionLabel
    } = options;

    console.log(`[NOTIFICATION] Starting send to user ${userId}: "${title}"`);

    const shouldSend = await shouldSendNotification(userId, category, priority);
    if (!shouldSend) {
      console.log(`[NOTIFICATION] Suppressed for user ${userId}: ${title}`);
      return false;
    }

    try {
      // Ensure event_type is never null - database constraint requires it
      const safeEventType = category || 'system';
      const safePriority = priority || 'medium';
      
      // Map to actual database schema columns
      const notificationData = {
        recipient_id: userId,
        title_en: title || 'Notification',
        title_ar: title || 'إشعار',
        message_en: message || '',
        message_ar: message || '',
        priority: safePriority,
        action_url: link || null,
        entity_id: relatedEntityId || null,
        entity_type: relatedEntityType || null,
        event_type: safeEventType,
        status: 'pending',
        email_sent: false
      };

      console.log(`[NOTIFICATION] Inserting into database:`, JSON.stringify(notificationData));
      console.log(`[NOTIFICATION] event_type="${safeEventType}", priority="${safePriority}"`);

      const { data, error } = await supabase.from('notifications').insert(notificationData).select('id');

      if (error) {
        console.error('[NOTIFICATION] Failed to create notification:', error);
        return false;
      }

      console.log(`[NOTIFICATION] Successfully inserted notification with id:`, data?.[0]?.id);

      // Send email for high priority or explicit email requests
      const shouldSendEmail = sendEmail || priority === 'urgent' || priority === 'high';
      console.log(`[NOTIFICATION] Should send email: ${shouldSendEmail} (sendEmail=${sendEmail}, priority=${priority})`);
      
      if (shouldSendEmail) {
        try {
          const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://app.pactorg.com';
          console.log(`[NOTIFICATION] Sending email to user ${userId}`);
          const emailResult = await EmailNotificationService.sendToUser(userId, {
            title,
            message,
            type,
            actionUrl: emailActionUrl || (link ? `${baseUrl}${link}` : undefined),
            actionLabel: emailActionLabel || 'View Details'
          });
          console.log(`[NOTIFICATION] Email result:`, emailResult);
          
          // Update notification with email status
          if (data?.[0]?.id) {
            await supabase.from('notifications').update({
              email_sent: emailResult.success,
              email_sent_at: emailResult.success ? new Date().toISOString() : null,
              email_error: emailResult.error || null
            }).eq('id', data[0].id);
          }
        } catch (emailError) {
          console.error('[NOTIFICATION] Failed to send email notification:', emailError);
        }
      }

      return true;
    } catch (error) {
      console.error('[NOTIFICATION] Error sending notification:', error);
      return false;
    }
  },

  async mmpUploadComplete(userId: string, mmpName: string, siteCount: number, mmpId: string): Promise<void> {
    await this.send({
      userId,
      title: 'MMP Upload Complete',
      message: `Successfully uploaded "${mmpName}" with ${siteCount} sites`,
      type: 'success',
      category: 'system',
      priority: 'medium',
      link: `/mmp/${mmpId}`,
      relatedEntityId: mmpId,
      relatedEntityType: 'mmpFile'
    });
  },

  async mmpUploadFailed(userId: string, fileName: string, errorMessage: string): Promise<void> {
    await this.send({
      userId,
      title: 'MMP Upload Failed',
      message: `Failed to upload "${fileName}": ${errorMessage}`,
      type: 'error',
      category: 'system',
      priority: 'high'
    });
  },

  async siteVisitReminder(userId: string, siteName: string, hoursUntilDeadline: number, siteId: string): Promise<void> {
    const urgency = hoursUntilDeadline <= 4 ? 'urgent' : hoursUntilDeadline <= 24 ? 'high' : 'medium';
    const type = hoursUntilDeadline <= 4 ? 'error' : hoursUntilDeadline <= 24 ? 'warning' : 'info';
    
    await this.send({
      userId,
      title: hoursUntilDeadline <= 0 ? 'Site Visit Overdue' : 'Site Visit Reminder',
      message: hoursUntilDeadline <= 0 
        ? `Site visit to "${siteName}" is overdue!`
        : `Site visit to "${siteName}" is due in ${hoursUntilDeadline} hours`,
      type,
      category: 'assignments',
      priority: urgency,
      link: `/site-visits/${siteId}`,
      relatedEntityId: siteId,
      relatedEntityType: 'siteVisit'
    });
  },

  async withdrawalStatusChanged(
    userId: string, 
    status: 'approved' | 'rejected' | 'pending_final', 
    amount: number
  ): Promise<void> {
    const statusMessages = {
      approved: { title: 'Withdrawal Approved', message: `Your withdrawal of SDG ${amount.toLocaleString()} has been approved`, type: 'success' as const },
      rejected: { title: 'Withdrawal Rejected', message: `Your withdrawal of SDG ${amount.toLocaleString()} has been rejected`, type: 'error' as const },
      pending_final: { title: 'Withdrawal Pending Final Approval', message: `Your withdrawal of SDG ${amount.toLocaleString()} is pending final approval`, type: 'info' as const }
    };

    const statusInfo = statusMessages[status];
    
    // All withdrawal status changes should trigger email notifications
    const priority: NotificationPriority = status === 'approved' || status === 'rejected' ? 'high' : 'medium';
    
    await this.send({
      userId,
      title: statusInfo.title,
      message: statusInfo.message,
      type: statusInfo.type,
      category: 'financial',
      priority,
      link: '/wallet',
      sendEmail: true // Always send email for withdrawal status changes
    });
  },

  async newTeamMemberAssigned(userId: string, memberName: string, role: string, projectName: string): Promise<void> {
    await this.send({
      userId,
      title: 'New Team Member',
      message: `${memberName} (${role}) has been assigned to ${projectName}`,
      type: 'info',
      category: 'team',
      priority: 'low'
    });
  },

  async siteAssigned(userId: string, siteName: string, siteId: string): Promise<void> {
    await this.send({
      userId,
      title: 'New Site Assignment',
      message: `You have been assigned to visit "${siteName}"`,
      type: 'info',
      category: 'assignments',
      priority: 'high',
      link: `/mmp`,
      relatedEntityId: siteId,
      relatedEntityType: 'siteVisit'
    });
  },

  async budgetThresholdAlert(userId: string, projectName: string, percentUsed: number): Promise<void> {
    const type = percentUsed >= 100 ? 'error' : percentUsed >= 90 ? 'warning' : 'info';
    const priority = percentUsed >= 100 ? 'urgent' : percentUsed >= 90 ? 'high' : 'medium';
    
    await this.send({
      userId,
      title: percentUsed >= 100 ? 'Budget Exceeded' : 'Budget Alert',
      message: `${projectName} has used ${percentUsed}% of its allocated budget`,
      type,
      category: 'financial',
      priority,
      link: '/budget'
    });
  },

  async approvalRequired(userId: string, itemType: string, itemName: string, link: string): Promise<void> {
    await this.send({
      userId,
      title: 'Approval Required',
      message: `${itemType} "${itemName}" requires your approval`,
      type: 'warning',
      category: 'approvals',
      priority: 'high',
      link
    });
  },

  async siteVisitCompleted(userId: string, siteName: string, collectorName: string, siteId: string): Promise<void> {
    await this.send({
      userId,
      title: 'Site Visit Completed',
      message: `${collectorName} has completed the visit to "${siteName}"`,
      type: 'success',
      category: 'assignments',
      priority: 'medium',
      link: `/mmp`,
      relatedEntityId: siteId,
      relatedEntityType: 'siteVisit'
    });
  },

  async sendBulk(userIds: string[], options: Omit<TriggerNotificationOptions, 'userId'>): Promise<number> {
    let successCount = 0;
    
    await Promise.all(
      userIds.map(async (userId) => {
        const success = await this.send({ ...options, userId });
        if (success) successCount++;
      })
    );

    return successCount;
  },

  // Signature-related notifications
  async transactionSigned(userId: string, transactionId: string, amount: number, currency: string): Promise<void> {
    await this.send({
      userId,
      title: 'Transaction Signed',
      message: `Your transaction of ${currency} ${amount.toLocaleString()} has been digitally signed and recorded`,
      type: 'success',
      category: 'signatures',
      priority: 'medium',
      link: '/wallet',
      relatedEntityId: transactionId,
      relatedEntityType: 'transaction'
    });
  },

  async signatureVerified(userId: string, signatureType: 'transaction' | 'document', itemName: string): Promise<void> {
    await this.send({
      userId,
      title: 'Signature Verified',
      message: `Your ${signatureType} signature for "${itemName}" has been verified successfully`,
      type: 'success',
      category: 'signatures',
      priority: 'low',
      link: '/signatures'
    });
  },

  async documentSignedByParty(userId: string, documentTitle: string, signerName: string, documentId: string): Promise<void> {
    await this.send({
      userId,
      title: 'Document Signed',
      message: `${signerName} has signed "${documentTitle}"`,
      type: 'info',
      category: 'signatures',
      priority: 'medium',
      link: '/signatures',
      relatedEntityId: documentId,
      relatedEntityType: 'document'
    });
  },

  async signatureRequired(userId: string, documentTitle: string, documentId: string): Promise<void> {
    await this.send({
      userId,
      title: 'Signature Required',
      message: `Your signature is required for "${documentTitle}"`,
      type: 'warning',
      category: 'signatures',
      priority: 'high',
      link: '/signatures',
      relatedEntityId: documentId,
      relatedEntityType: 'document'
    });
  },

  async signatureRevoked(userId: string, signatureType: 'transaction' | 'document', reason: string): Promise<void> {
    await this.send({
      userId,
      title: 'Signature Revoked',
      message: `A ${signatureType} signature has been revoked. Reason: ${reason}`,
      type: 'warning',
      category: 'signatures',
      priority: 'high',
      link: '/signatures'
    });
  },

  async verificationCodeSent(userId: string, method: 'phone' | 'email', destination: string): Promise<void> {
    const methodLabel = method === 'phone' ? 'SMS' : 'email';
    const maskedDestination = method === 'phone' 
      ? `***${destination.slice(-4)}`
      : `${destination.slice(0, 3)}***@${destination.split('@')[1]}`;
    
    await this.send({
      userId,
      title: 'Verification Code Sent',
      message: `A verification code has been sent via ${methodLabel} to ${maskedDestination}`,
      type: 'info',
      category: 'signatures',
      priority: 'high'
    });
  },

  // Call notifications
  async missedCall(userId: string, callerName: string, callerId: string): Promise<void> {
    await this.send({
      userId,
      title: 'Missed Call',
      message: `You missed a call from ${callerName}`,
      type: 'warning',
      category: 'calls',
      priority: 'high',
      link: '/calls',
      relatedEntityId: callerId,
      relatedEntityType: 'call'
    });
  },

  async incomingCall(userId: string, callerName: string, callerId: string): Promise<void> {
    await this.send({
      userId,
      title: 'Incoming Call',
      message: `${callerName} is calling you`,
      type: 'info',
      category: 'calls',
      priority: 'urgent',
      link: '/calls',
      relatedEntityId: callerId,
      relatedEntityType: 'call'
    });
  },

  async callEnded(userId: string, participantName: string, duration: number): Promise<void> {
    const mins = Math.floor(duration / 60);
    const secs = duration % 60;
    const durationStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    
    await this.send({
      userId,
      title: 'Call Ended',
      message: `Call with ${participantName} ended (${durationStr})`,
      type: 'info',
      category: 'calls',
      priority: 'low',
      link: '/calls'
    });
  },

  // Message notifications
  async newMessage(userId: string, senderName: string, messagePreview: string, chatId?: string): Promise<void> {
    await this.send({
      userId,
      title: 'New Message',
      message: `${senderName}: ${messagePreview.slice(0, 50)}${messagePreview.length > 50 ? '...' : ''}`,
      type: 'info',
      category: 'messages',
      priority: 'medium',
      link: chatId ? `/chat?userId=${chatId}` : '/chat',
      relatedEntityId: chatId,
      relatedEntityType: 'chat'
    });
  },

  async unreadMessages(userId: string, count: number): Promise<void> {
    await this.send({
      userId,
      title: 'Unread Messages',
      message: `You have ${count} unread message${count > 1 ? 's' : ''}`,
      type: 'info',
      category: 'messages',
      priority: 'medium',
      link: '/chat'
    });
  },

  // Role-based notifications (sent to all users with specific roles)
  async sendToRoles(
    roles: string[], 
    options: Omit<TriggerNotificationOptions, 'userId' | 'targetRoles'>,
    projectId?: string
  ): Promise<number> {
    try {
      // Fetch users with the specified roles
      let query = supabase.from('profiles').select('id, role');
      
      if (roles.length > 0) {
        query = query.in('role', roles);
      }
      
      const { data: users, error } = await query;
      
      if (error) {
        console.error('Failed to fetch users by roles:', error);
        return 0;
      }
      
      if (!users || users.length === 0) return 0;
      
      // If projectId is specified, filter by project membership
      let targetUserIds = users.map(u => u.id);
      
      if (projectId) {
        const { data: teamMembers } = await supabase
          .from('team_members')
          .select('user_id')
          .eq('project_id', projectId);
        
        if (teamMembers) {
          const projectUserIds = teamMembers.map(m => m.user_id);
          targetUserIds = targetUserIds.filter(id => projectUserIds.includes(id));
        }
      }
      
      // Send notifications to all matching users
      return await this.sendBulk(targetUserIds, {
        ...options,
        targetRoles: roles,
        projectId
      });
    } catch (error) {
      console.error('Failed to send role-based notifications:', error);
      return 0;
    }
  },

  // Project-specific notifications
  async sendToProjectTeam(
    projectId: string,
    options: Omit<TriggerNotificationOptions, 'userId' | 'projectId'>
  ): Promise<number> {
    try {
      const { data: teamMembers, error } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('project_id', projectId);
      
      if (error) {
        console.error('Failed to fetch project team members:', error);
        return 0;
      }
      
      if (!teamMembers || teamMembers.length === 0) return 0;
      
      const userIds = teamMembers.map(m => m.user_id).filter((id): id is string => id !== null);
      
      return await this.sendBulk(userIds, {
        ...options,
        projectId
      });
    } catch (error) {
      console.error('Failed to send project team notifications:', error);
      return 0;
    }
  },

  // System update notifications (sent to specific roles only)
  async systemUpdate(
    title: string, 
    message: string, 
    targetRoles?: string[],
    projectId?: string
  ): Promise<number> {
    if (targetRoles && targetRoles.length > 0) {
      return await this.sendToRoles(targetRoles, {
        title,
        message,
        type: 'info',
        category: 'system',
        priority: 'medium'
      }, projectId);
    }
    
    // If no roles specified, send to all users
    const { data: users } = await supabase.from('profiles').select('id').limit(100);
    if (!users) return 0;
    
    return await this.sendBulk(users.map(u => u.id), {
      title,
      message,
      type: 'info',
      category: 'system',
      priority: 'medium',
      projectId
    });
  },

  /**
   * Site claim notification with role-based fan-out
   * - When Data Collector claims: Notify Coordinator, Supervisor, Admins
   * - When Coordinator claims: Notify Admins, Hub Supervisor
   */
  async siteClaimNotification(
    claimerUserId: string,
    claimerName: string,
    claimerRole: string,
    siteName: string,
    siteId: string,
    hubId?: string,
    projectId?: string
  ): Promise<number> {
    try {
      const isDataCollector = ['data_collector', 'enumerator', 'dc'].includes(claimerRole?.toLowerCase() || '');
      const isCoordinator = ['coordinator', 'field_coordinator'].includes(claimerRole?.toLowerCase() || '');

      let targetRoles: string[] = [];
      let additionalUserIds: string[] = [];

      if (isDataCollector) {
        targetRoles = ['coordinator', 'supervisor', 'admin', 'super_admin'];
      } else if (isCoordinator) {
        targetRoles = ['admin', 'super_admin'];
        
        if (hubId) {
          const { data: hubSupervisors } = await supabase
            .from('profiles')
            .select('id')
            .eq('hub_id', hubId)
            .eq('role', 'supervisor');
          
          if (hubSupervisors) {
            additionalUserIds = hubSupervisors.map(s => s.id).filter(id => id !== claimerUserId);
          }
        }
      } else {
        targetRoles = ['admin', 'super_admin'];
      }

      const notificationOptions = {
        title: 'Site Claimed',
        message: `${claimerName} has claimed the site "${siteName}"`,
        type: 'info' as const,
        category: 'assignments' as NotificationCategory,
        priority: 'medium' as NotificationPriority,
        link: `/mmp`,
        relatedEntityId: siteId,
        relatedEntityType: 'siteVisit' as const
      };

      let successCount = 0;

      if (targetRoles.length > 0) {
        successCount += await this.sendToRoles(targetRoles, notificationOptions, projectId);
      }

      if (additionalUserIds.length > 0) {
        successCount += await this.sendBulk(additionalUserIds, notificationOptions);
      }

      return successCount;
    } catch (error) {
      console.error('Failed to send site claim notifications:', error);
      return 0;
    }
  },

  /**
   * Confirmation deadline reminder notification
   * Sent to the assignee at specified intervals before the deadline
   */
  async confirmationReminder(
    userId: string,
    siteName: string,
    siteId: string,
    hoursUntilDeadline: number
  ): Promise<void> {
    const priority: NotificationPriority = hoursUntilDeadline <= 12 ? 'urgent' : hoursUntilDeadline <= 24 ? 'high' : 'medium';
    const type = hoursUntilDeadline <= 12 ? 'warning' : 'info';
    
    let message: string;
    if (hoursUntilDeadline <= 0) {
      message = `Your confirmation deadline for "${siteName}" has passed. The site may be released.`;
    } else if (hoursUntilDeadline <= 12) {
      message = `Urgent: Confirm your assignment to "${siteName}" within ${Math.round(hoursUntilDeadline)} hours or it may be released.`;
    } else if (hoursUntilDeadline <= 24) {
      message = `Reminder: Please confirm your assignment to "${siteName}" within ${Math.round(hoursUntilDeadline)} hours.`;
    } else {
      message = `Don't forget to confirm your assignment to "${siteName}". Deadline is in ${Math.round(hoursUntilDeadline / 24)} days.`;
    }

    await this.send({
      userId,
      title: 'Confirm Your Site Visit',
      message,
      type,
      category: 'assignments',
      priority,
      link: `/mmp`,
      relatedEntityId: siteId,
      relatedEntityType: 'siteVisit'
    });
  },

  /**
   * Auto-release notification sent to the former assignee
   */
  async siteAutoReleased(
    userId: string,
    siteName: string,
    siteId: string
  ): Promise<void> {
    await this.send({
      userId,
      title: 'Site Released',
      message: `Your claim on "${siteName}" has been automatically released due to no confirmation before the deadline.`,
      type: 'warning',
      category: 'assignments',
      priority: 'high',
      link: `/mmp`,
      relatedEntityId: siteId,
      relatedEntityType: 'siteVisit'
    });
  },

  /**
   * Send reminder at specific intervals (24h, 12h, 6h before deadline)
   * Validates that hoursUntilDeadline is appropriate for the reminderType
   */
  async sendScheduledReminder(
    userId: string,
    siteName: string,
    siteId: string,
    hoursUntilDeadline: number,
    reminderType: '24h' | '12h' | '6h'
  ): Promise<boolean> {
    const reminderThresholds: Record<string, { min: number; max: number }> = {
      '24h': { min: 20, max: 28 },
      '12h': { min: 10, max: 14 },
      '6h': { min: 4, max: 8 }
    };

    const threshold = reminderThresholds[reminderType];
    if (hoursUntilDeadline < threshold.min || hoursUntilDeadline > threshold.max) {
      console.log(`[Notification] Skipping ${reminderType} reminder: ${hoursUntilDeadline}h outside range`);
      return false;
    }

    const priorityMap: Record<string, NotificationPriority> = {
      '24h': 'medium',
      '12h': 'high',
      '6h': 'urgent'
    };

    const messageMap: Record<string, string> = {
      '24h': `Reminder: Please confirm your assignment to "${siteName}" within 24 hours.`,
      '12h': `Important: Confirm your assignment to "${siteName}" within 12 hours or it may be released.`,
      '6h': `Urgent: Only 6 hours left to confirm "${siteName}". Confirm now to keep your assignment.`
    };

    await this.send({
      userId,
      title: reminderType === '6h' ? 'Urgent: Confirm Now' : 'Confirm Your Site Visit',
      message: messageMap[reminderType],
      type: reminderType === '6h' ? 'warning' : 'info',
      category: 'assignments',
      priority: priorityMap[reminderType],
      link: `/mmp`,
      relatedEntityId: siteId,
      relatedEntityType: 'siteVisit'
    });

    return true;
  },

  // =============================================
  // HUB SUPERVISOR & MANAGEMENT NOTIFICATION METHODS
  // =============================================

  /**
   * Helper: Find all management users for hub notifications
   * Includes: Hub Supervisors, Hub FOMs, all Super Admins, and all Admins
   * Returns role information for personalized email greetings
   */
  async getHubManagementUsers(hubId: string): Promise<HubManagementUser[]> {
    try {
      const allUsers: HubManagementUser[] = [];
      const seenIds = new Set<string>();

      // 1. Get hub supervisors (role = 'supervisor' in the specific hub)
      const { data: supervisors, error: supError } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('hub_id', hubId)
        .eq('role', 'supervisor');

      if (!supError && supervisors) {
        supervisors.forEach(s => {
          if (!seenIds.has(s.id)) {
            seenIds.add(s.id);
            allUsers.push({ ...s, role: s.role || 'supervisor' });
          }
        });
      }

      // 2. Get hub FOMs (role = 'fom' in the specific hub)
      const { data: foms, error: fomError } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('hub_id', hubId)
        .eq('role', 'fom');

      if (!fomError && foms) {
        foms.forEach(f => {
          if (!seenIds.has(f.id)) {
            seenIds.add(f.id);
            allUsers.push({ ...f, role: f.role || 'fom' });
          }
        });
      }

      // 3. Get all super admins (global, not hub-specific)
      const { data: superAdmins, error: saError } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .in('role', ['super_admin', 'superAdmin']);

      if (!saError && superAdmins) {
        superAdmins.forEach(sa => {
          if (!seenIds.has(sa.id)) {
            seenIds.add(sa.id);
            allUsers.push({ ...sa, role: sa.role || 'super_admin' });
          }
        });
      }

      // 4. Get all admins (global, not hub-specific)
      const { data: admins, error: adminError } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('role', 'admin');

      if (!adminError && admins) {
        admins.forEach(a => {
          if (!seenIds.has(a.id)) {
            seenIds.add(a.id);
            allUsers.push({ ...a, role: a.role || 'admin' });
          }
        });
      }

      return allUsers;
    } catch (error) {
      console.error('Error getting hub management users:', error);
      return [];
    }
  },

  /**
   * @deprecated Use getHubManagementUsers instead
   * Helper: Find all supervisors for a given hub (legacy method for backward compatibility)
   */
  async getHubSupervisors(hubId: string): Promise<{ id: string; full_name: string; email: string }[]> {
    return this.getHubManagementUsers(hubId);
  },

  /**
   * Notify all hub management users (supervisors, FOMs, admins, super admins)
   */
  async notifyHubSupervisor(
    hubId: string,
    options: Omit<TriggerNotificationOptions, 'userId'>
  ): Promise<number> {
    try {
      const managementUsers = await this.getHubManagementUsers(hubId);
      
      if (managementUsers.length === 0) {
        console.log(`No management users found for hub ${hubId}`);
        return 0;
      }

      const userIds = managementUsers.map(u => u.id);
      return await this.sendBulk(userIds, options);
    } catch (error) {
      console.error('Failed to notify hub management:', error);
      return 0;
    }
  },

  /**
   * Notify supervisors, admins, and super admins when MMP is forwarded from FOM to Coordinators
   * - Sends in-app notification to all hub management users
   * - Sends bilingual email to supervisors, admins, and super admins
   */
  async mmpForwardedToCoordinators(
    hubId: string,
    mmpName: string,
    coordinatorCount: number,
    mmpId?: string,
    forwarderName?: string
  ): Promise<number> {
    try {
      let successCount = 0;
      const sender = forwarderName || 'Field Operations Manager';

      // 1. Get hub management users (supervisors, FOMs, admins)
      const managementUsers = await this.getHubManagementUsers(hubId);
      
      // 2. Send in-app notifications to all management users
      for (const user of managementUsers) {
        const sent = await this.send({
          userId: user.id,
          title: 'MMP Forwarded to Coordinators',
          message: `MMP "${mmpName}" has been forwarded to ${coordinatorCount} coordinator(s) for site assignment by ${sender}`,
          type: 'info',
          category: 'assignments',
          priority: 'high',
          link: mmpId ? `/mmp/${mmpId}` : '/mmp',
          relatedEntityId: mmpId,
          relatedEntityType: 'mmpFile',
          sendEmail: false // We send bilingual email separately
        });
        if (sent) successCount++;

        // Send bilingual email with role-based greeting
        if (user.email) {
          try {
            const roleInfo = formatRoleName(user.role);
            await EmailNotificationService.sendMMPForwardedToCoordinators(
              user.email,
              user.full_name || 'Team Member',
              mmpName,
              sender,
              coordinatorCount,
              mmpId,
              roleInfo
            );
            console.log(`[NOTIFICATION] Sent bilingual MMP->Coordinators email to ${roleInfo.en}: ${user.email}`);
          } catch (emailError) {
            console.error(`[NOTIFICATION] Failed to send bilingual email to ${user.email}:`, emailError);
          }
        }
      }

      // 3. Also notify Admins and Super Admins who may not be in the hub
      const { data: adminUsers, error: adminError } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .in('role', ['admin', 'super_admin', 'Admin', 'SuperAdmin']);

      if (adminError) {
        console.error('Error fetching admins for MMP->Coordinators notification:', adminError);
      } else if (adminUsers && adminUsers.length > 0) {
        // Filter out admins already notified via hub management
        const notifiedIds = new Set(managementUsers.map(u => u.id));
        const remainingAdmins = adminUsers.filter(a => !notifiedIds.has(a.id));

        for (const admin of remainingAdmins) {
          const sent = await this.send({
            userId: admin.id,
            title: 'MMP Forwarded to Coordinators',
            message: `MMP "${mmpName}" has been forwarded to ${coordinatorCount} coordinator(s) for site assignment by ${sender}`,
            type: 'info',
            category: 'assignments',
            priority: 'high',
            link: mmpId ? `/mmp/${mmpId}` : '/mmp',
            relatedEntityId: mmpId,
            relatedEntityType: 'mmpFile',
            sendEmail: false
          });
          if (sent) successCount++;

          // Send bilingual email with role-based greeting
          if (admin.email) {
            try {
              const roleInfo = formatRoleName(admin.role);
              await EmailNotificationService.sendMMPForwardedToCoordinators(
                admin.email,
                admin.full_name || 'Administrator',
                mmpName,
                sender,
                coordinatorCount,
                mmpId,
                roleInfo
              );
              console.log(`[NOTIFICATION] Sent bilingual MMP->Coordinators email to ${roleInfo.en}: ${admin.email}`);
            } catch (emailError) {
              console.error(`[NOTIFICATION] Failed to send bilingual email to ${admin.email}:`, emailError);
            }
          }
        }
      }

      return successCount;
    } catch (error) {
      console.error('Failed to send MMP forwarded to coordinators notifications:', error);
      return 0;
    }
  },

  /**
   * Notify supervisors, FOMs, admins, and super admins when a site is verified by a coordinator
   * - Sends in-app notification to all hub management users
   * - Sends bilingual email with role-based personalized greetings
   */
  async siteVerifiedByCoordinator(
    hubId: string,
    siteName: string,
    mmpName: string,
    coordinatorName: string,
    siteId?: string
  ): Promise<number> {
    try {
      let successCount = 0;

      // 1. Get hub management users (supervisors, FOMs, admins)
      const managementUsers = await this.getHubManagementUsers(hubId);
      
      // 2. Send in-app notifications and bilingual emails to all management users
      for (const user of managementUsers) {
        const sent = await this.send({
          userId: user.id,
          title: 'Site Verified by Coordinator',
          message: `Site "${siteName}" from MMP "${mmpName}" has been verified by Coordinator ${coordinatorName}`,
          type: 'success',
          category: 'assignments',
          priority: 'medium',
          link: siteId ? `/mmp?site=${siteId}` : '/mmp',
          relatedEntityId: siteId,
          relatedEntityType: 'siteVisit',
          sendEmail: false // We send bilingual email separately
        });
        if (sent) successCount++;

        // Send bilingual email with role-based greeting
        if (user.email) {
          try {
            const roleInfo = formatRoleName(user.role);
            await EmailNotificationService.sendSiteVerifiedByCoordinator(
              user.email,
              user.full_name || 'Team Member',
              siteName,
              mmpName,
              coordinatorName,
              siteId,
              roleInfo
            );
            console.log(`[NOTIFICATION] Sent bilingual Site Verified email to ${roleInfo.en}: ${user.email}`);
          } catch (emailError) {
            console.error(`[NOTIFICATION] Failed to send bilingual email to ${user.email}:`, emailError);
          }
        }
      }

      // 3. Also notify Admins and Super Admins who may not be in the hub
      const { data: adminUsers, error: adminError } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .in('role', ['admin', 'super_admin', 'Admin', 'SuperAdmin']);

      if (adminError) {
        console.error('Error fetching admins for Site Verified notification:', adminError);
      } else if (adminUsers && adminUsers.length > 0) {
        // Filter out admins already notified via hub management
        const notifiedIds = new Set(managementUsers.map(u => u.id));
        const remainingAdmins = adminUsers.filter(a => !notifiedIds.has(a.id));

        for (const admin of remainingAdmins) {
          const sent = await this.send({
            userId: admin.id,
            title: 'Site Verified by Coordinator',
            message: `Site "${siteName}" from MMP "${mmpName}" has been verified by Coordinator ${coordinatorName}`,
            type: 'success',
            category: 'assignments',
            priority: 'medium',
            link: siteId ? `/mmp?site=${siteId}` : '/mmp',
            relatedEntityId: siteId,
            relatedEntityType: 'siteVisit',
            sendEmail: false
          });
          if (sent) successCount++;

          // Send bilingual email with role-based greeting
          if (admin.email) {
            try {
              const roleInfo = formatRoleName(admin.role);
              await EmailNotificationService.sendSiteVerifiedByCoordinator(
                admin.email,
                admin.full_name || 'Administrator',
                siteName,
                mmpName,
                coordinatorName,
                siteId,
                roleInfo
              );
              console.log(`[NOTIFICATION] Sent bilingual Site Verified email to ${roleInfo.en}: ${admin.email}`);
            } catch (emailError) {
              console.error(`[NOTIFICATION] Failed to send bilingual email to ${admin.email}:`, emailError);
            }
          }
        }
      }

      return successCount;
    } catch (error) {
      console.error('Failed to send site verified notifications:', error);
      return 0;
    }
  },

  /**
   * Notify supervisor when sites are sent back to FOM
   */
  async siteReturnedToFOM(
    hubId: string,
    siteName: string,
    siteCount: number,
    reason: string,
    coordinatorName?: string
  ): Promise<number> {
    const message = siteCount > 1
      ? `${siteCount} sites including "${siteName}" have been sent back to FOM${coordinatorName ? ` by ${coordinatorName}` : ''}. Reason: ${reason}`
      : `Site "${siteName}" has been sent back to FOM${coordinatorName ? ` by ${coordinatorName}` : ''}. Reason: ${reason}`;

    return await this.notifyHubSupervisor(hubId, {
      title: 'Sites Returned to FOM',
      message,
      type: 'warning',
      category: 'assignments',
      priority: 'high',
      link: '/mmp'
    });
  },

  /**
   * Notify supervisor of various site operations
   */
  async siteOperationNotification(
    hubId: string,
    operation: 'claimed' | 'rejected' | 'verified' | 'approved' | 'dispatched' | 'completed',
    siteName: string,
    details?: {
      actorName?: string;
      siteCount?: number;
      siteId?: string;
      reason?: string;
    }
  ): Promise<number> {
    const operationMessages = {
      claimed: {
        title: 'Site Claimed',
        message: `Site "${siteName}" has been claimed${details?.actorName ? ` by ${details.actorName}` : ''}`,
        type: 'info' as const,
        priority: 'medium' as NotificationPriority
      },
      rejected: {
        title: 'Site Rejected',
        message: `Site "${siteName}" has been rejected${details?.actorName ? ` by ${details.actorName}` : ''}${details?.reason ? `. Reason: ${details.reason}` : ''}`,
        type: 'warning' as const,
        priority: 'high' as NotificationPriority
      },
      verified: {
        title: 'Site Verified',
        message: `Site "${siteName}" has been verified${details?.actorName ? ` by ${details.actorName}` : ''}`,
        type: 'success' as const,
        priority: 'medium' as NotificationPriority
      },
      approved: {
        title: 'Site Approved',
        message: `Site "${siteName}" has been approved${details?.actorName ? ` by ${details.actorName}` : ''}`,
        type: 'success' as const,
        priority: 'medium' as NotificationPriority
      },
      dispatched: {
        title: 'Sites Dispatched',
        message: details?.siteCount 
          ? `${details.siteCount} sites including "${siteName}" have been dispatched`
          : `Site "${siteName}" has been dispatched`,
        type: 'info' as const,
        priority: 'medium' as NotificationPriority
      },
      completed: {
        title: 'Site Visit Completed',
        message: `Site visit to "${siteName}" has been completed${details?.actorName ? ` by ${details.actorName}` : ''}`,
        type: 'success' as const,
        priority: 'medium' as NotificationPriority
      }
    };

    const opDetails = operationMessages[operation];

    return await this.notifyHubSupervisor(hubId, {
      title: opDetails.title,
      message: opDetails.message,
      type: opDetails.type,
      category: 'assignments',
      priority: opDetails.priority,
      link: '/mmp',
      relatedEntityId: details?.siteId,
      relatedEntityType: 'siteVisit'
    });
  },

  /**
   * Notify supervisor of financial transaction approvals
   */
  async financialTransactionApproval(
    hubId: string,
    transactionType: 'withdrawal' | 'cost_submission' | 'down_payment' | 'reimbursement',
    amount: number,
    currency: string = 'SDG',
    details?: {
      userName?: string;
      status?: 'approved' | 'rejected' | 'pending';
      transactionId?: string;
    }
  ): Promise<number> {
    const typeLabels = {
      withdrawal: 'Withdrawal',
      cost_submission: 'Cost Submission',
      down_payment: 'Down Payment',
      reimbursement: 'Reimbursement'
    };

    const statusLabels = {
      approved: 'approved',
      rejected: 'rejected',
      pending: 'pending approval'
    };

    const label = typeLabels[transactionType];
    const status = details?.status || 'pending';
    const statusLabel = statusLabels[status];

    return await this.notifyHubSupervisor(hubId, {
      title: `${label} ${status === 'pending' ? 'Request' : status.charAt(0).toUpperCase() + status.slice(1)}`,
      message: `${label} of ${currency} ${amount.toLocaleString()}${details?.userName ? ` by ${details.userName}` : ''} has been ${statusLabel}`,
      type: status === 'approved' ? 'success' : status === 'rejected' ? 'error' : 'info',
      category: 'financial',
      priority: status === 'pending' ? 'high' : 'medium',
      link: '/finance-approval',
      relatedEntityId: details?.transactionId,
      relatedEntityType: 'transaction'
    });
  },

  /**
   * Notify supervisor of activity coverage updates
   */
  async activityCoverageUpdate(
    hubId: string,
    activityName: string,
    coveragePercent: number,
    totalSites: number,
    completedSites: number
  ): Promise<number> {
    const isComplete = coveragePercent >= 100;
    const isMilestone = coveragePercent === 25 || coveragePercent === 50 || coveragePercent === 75 || coveragePercent >= 100;

    if (!isMilestone) {
      return 0;
    }

    return await this.notifyHubSupervisor(hubId, {
      title: isComplete ? 'Activity Coverage Complete' : 'Activity Coverage Milestone',
      message: isComplete 
        ? `Activity "${activityName}" has reached 100% coverage (${completedSites}/${totalSites} sites completed)`
        : `Activity "${activityName}" has reached ${coveragePercent}% coverage (${completedSites}/${totalSites} sites)`,
      type: isComplete ? 'success' : 'info',
      category: 'assignments',
      priority: isComplete ? 'high' : 'medium',
      link: '/tracker'
    });
  },

  /**
   * Notify supervisor when MMP is uploaded to their hub
   */
  async mmpUploadedToHub(
    hubId: string,
    mmpName: string,
    siteCount: number,
    uploaderName?: string,
    mmpId?: string
  ): Promise<number> {
    return await this.notifyHubSupervisor(hubId, {
      title: 'New MMP Uploaded',
      message: `MMP "${mmpName}" with ${siteCount} sites has been uploaded${uploaderName ? ` by ${uploaderName}` : ''}`,
      type: 'info',
      category: 'assignments',
      priority: 'high',
      link: '/mmp',
      relatedEntityId: mmpId,
      relatedEntityType: 'mmpFile'
    });
  },

  /**
   * Notify supervisor of activity dates in their hub
   */
  async activityDateNotification(
    hubId: string,
    activityName: string,
    siteName: string,
    activityDate: string,
    daysUntil: number
  ): Promise<number> {
    if (daysUntil > 7) {
      return 0;
    }

    const isToday = daysUntil === 0;
    const isTomorrow = daysUntil === 1;

    return await this.notifyHubSupervisor(hubId, {
      title: isToday ? 'Activity Today' : isTomorrow ? 'Activity Tomorrow' : 'Upcoming Activity',
      message: isToday 
        ? `Activity "${activityName}" at "${siteName}" is scheduled for today (${activityDate})`
        : isTomorrow
        ? `Activity "${activityName}" at "${siteName}" is scheduled for tomorrow (${activityDate})`
        : `Activity "${activityName}" at "${siteName}" is scheduled in ${daysUntil} days (${activityDate})`,
      type: isToday ? 'warning' : 'info',
      category: 'assignments',
      priority: isToday ? 'high' : 'medium',
      link: '/mmp'
    });
  },

  /**
   * Notify FOM and all Admins/Super Admins when MMP is forwarded to FOM
   * - Sends notification to all selected FOMs with bilingual email
   * - Sends notification to all Admins and Super Admins with bilingual email
   * - Uses dedicated bilingual email template for professional formatting
   */
  async mmpForwardedToFOM(
    fomUserIds: string[],
    mmpName: string,
    mmpId: string,
    forwarderName?: string
  ): Promise<number> {
    try {
      let successCount = 0;
      const sender = forwarderName || 'System';

      // 1. Fetch FOM user details for bilingual emails
      const { data: fomUsers, error: fomError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', fomUserIds);

      if (fomError) {
        console.error('Error fetching FOM user details:', fomError);
      }

      // 2. Notify all selected FOMs with bilingual email
      for (const fomId of fomUserIds) {
        const fomUser = fomUsers?.find(u => u.id === fomId);
        const recipientName = fomUser?.full_name || 'Field Operations Manager';
        const recipientEmail = fomUser?.email;

        // Create in-app notification
        const sent = await this.send({
          userId: fomId,
          title: 'MMP Forwarded to You',
          message: `MMP "${mmpName}" has been forwarded to you for permits attachment by ${sender}`,
          type: 'info',
          category: 'assignments',
          priority: 'high',
          link: `/mmp/${mmpId}`,
          relatedEntityId: mmpId,
          relatedEntityType: 'mmpFile',
          sendEmail: false // We send bilingual email separately
        });
        if (sent) successCount++;

        // Send bilingual email directly
        if (recipientEmail) {
          try {
            await EmailNotificationService.sendMMPForwardedToFOM(
              recipientEmail,
              recipientName,
              mmpName,
              sender,
              mmpId,
              true // isRecipientFOM
            );
            console.log(`[NOTIFICATION] Sent bilingual MMP forwarded email to FOM: ${recipientEmail}`);
          } catch (emailError) {
            console.error(`[NOTIFICATION] Failed to send bilingual email to FOM ${recipientEmail}:`, emailError);
          }
        }
      }

      // 3. Fetch all Admins and Super Admins
      const { data: adminUsers, error: adminError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('role', ['admin', 'super_admin', 'Admin', 'SuperAdmin']);

      if (adminError) {
        console.error('Error fetching admins for MMP forward notification:', adminError);
      } else if (adminUsers && adminUsers.length > 0) {
        // 4. Notify all Admins/Super Admins with bilingual email
        for (const admin of adminUsers) {
          const recipientName = admin.full_name || 'Administrator';
          
          // Create in-app notification
          const sent = await this.send({
            userId: admin.id,
            title: 'MMP Forwarded to FOM',
            message: `MMP "${mmpName}" has been forwarded to ${fomUserIds.length} Field Operations Manager(s) by ${sender}`,
            type: 'info',
            category: 'assignments',
            priority: 'high',
            link: `/mmp/${mmpId}`,
            relatedEntityId: mmpId,
            relatedEntityType: 'mmpFile',
            sendEmail: false // We send bilingual email separately
          });
          if (sent) successCount++;

          // Send bilingual email directly
          if (admin.email) {
            try {
              await EmailNotificationService.sendMMPForwardedToFOM(
                admin.email,
                recipientName,
                mmpName,
                sender,
                mmpId,
                false // isRecipientFOM (admin gets info notification, not action required)
              );
              console.log(`[NOTIFICATION] Sent bilingual MMP forwarded email to Admin: ${admin.email}`);
            } catch (emailError) {
              console.error(`[NOTIFICATION] Failed to send bilingual email to Admin ${admin.email}:`, emailError);
            }
          }
        }
      }

      return successCount;
    } catch (error) {
      console.error('Failed to send MMP forwarded to FOM notifications:', error);
      return 0;
    }
  }
};

export default NotificationTriggerService;
