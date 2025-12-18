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
export type NotificationPriority = 'normal' | 'high' | 'urgent';

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

/**
 * Helper function to get CC emails for super admins only
 * Returns only approved super admin emails
 */
const getSuperAdminCcEmails = async (): Promise<string[]> => {
  try {
    const { data: superAdmins } = await supabase
      .from('profiles')
      .select('email')
      .in('role', ['superAdmin', 'super_admin', 'SuperAdmin'])
      .eq('status', 'approved');
    
    if (!superAdmins) return [];
    
    return superAdmins
      .filter(sa => sa.email)
      .map(sa => sa.email as string);
  } catch (error) {
    console.error('Error fetching super admin CC emails:', error);
    return [];
  }
};

/**
 * Helper function to get hub supervisor emails for a specific hub
 * Returns emails of supervisors assigned to the hub for accountability
 */
const getHubSupervisorEmails = async (hubId: string): Promise<string[]> => {
  if (!hubId) return [];
  
  try {
    const { data: supervisors } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('role', 'supervisor')
      .eq('hub_id', hubId)
      .eq('status', 'approved');
    
    if (!supervisors) return [];
    
    const emails = supervisors
      .filter(s => s.email)
      .map(s => s.email as string);
    
    if (emails.length > 0) {
      console.log(`[NOTIFICATION] Found ${emails.length} hub supervisor(s) for hub ${hubId}: ${emails.join(', ')}`);
    }
    
    return emails;
  } catch (error) {
    console.error('Error fetching hub supervisor emails:', error);
    return [];
  }
};

/**
 * Helper function to get all CC emails (Super Admins + Hub Supervisor for the MMP's hub)
 * Used for MMP-related notifications to ensure accountability
 */
const getAllCcEmails = async (hubId?: string): Promise<string[]> => {
  const superAdminEmails = await getSuperAdminCcEmails();
  const hubSupervisorEmails = hubId ? await getHubSupervisorEmails(hubId) : [];
  
  // Combine and deduplicate
  const allEmails = [...new Set([...superAdminEmails, ...hubSupervisorEmails])];
  
  console.log(`[NOTIFICATION] CC list - Super Admins: ${superAdminEmails.length}, Hub Supervisors: ${hubSupervisorEmails.length}, Total: ${allEmails.length}`);
  
  return allEmails;
};

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
      priority = 'normal',
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
      const safePriority = priority || 'normal';
      
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

      // Send email ONLY if explicitly requested via sendEmail=true
      // Do NOT auto-send for high priority - bilingual emails are sent separately
      const shouldSendEmail = sendEmail === true;
      console.log(`[NOTIFICATION] Should send email: ${shouldSendEmail} (sendEmail=${sendEmail})`);
      
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
      priority: 'normal',
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
    const urgency = hoursUntilDeadline <= 4 ? 'urgent' : hoursUntilDeadline <= 24 ? 'high' : 'normal';
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
    const priority: NotificationPriority = status === 'approved' || status === 'rejected' ? 'high' : 'normal';
    
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
    const priority = percentUsed >= 100 ? 'urgent' : percentUsed >= 90 ? 'high' : 'normal';
    
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
      priority: 'normal',
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
      priority: 'normal',
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
      priority: 'normal',
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
      priority: 'normal',
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
      priority: 'normal',
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
        try {
          const { data: teamMembers, error: teamError } = await supabase
            .from('team_members')
            .select('user_id')
            .eq('project_id', projectId);
          
          if (!teamError && teamMembers) {
            const projectUserIds = teamMembers.map(m => m.user_id);
            targetUserIds = targetUserIds.filter(id => projectUserIds.includes(id));
          }
        } catch {
          // team_members table may not exist - skip project filtering
          console.debug('[Notifications] team_members table not available');
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
      // Try to get team members, but this table may not exist
      const { data: teamMembers, error } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('project_id', projectId);
      
      if (error) {
        // If table doesn't exist (404), fall back to all users in the project scope
        if (error.code === 'PGRST116' || error.message?.includes('does not exist')) {
          console.debug('[Notifications] team_members table not found, falling back to all users');
          // Fall back: send to admins/FOMs who might be interested
          return await this.sendToRoles(['super_admin', 'admin', 'fom'], {
            ...options,
          });
        }
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
        priority: 'normal'
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
      priority: 'normal',
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
        priority: 'normal' as NotificationPriority,
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
    const priority: NotificationPriority = hoursUntilDeadline <= 12 ? 'urgent' : hoursUntilDeadline <= 24 ? 'high' : 'normal';
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
      '24h': 'normal',
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

      // Note: Regular admins removed from hub management notifications
      // Only super admins receive management notifications now

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
   * Notify coordinators when MMP is forwarded to them
   * - Sends in-app notification to selected coordinators only
   * - Sends bilingual email to coordinators (CC one Super Admin)
   * - Simplified to reduce email volume and avoid rate limiting
   */
  async mmpForwardedToCoordinators(
    hubId: string,
    mmpName: string,
    coordinatorCount: number,
    mmpId?: string,
    forwarderName?: string,
    coordinatorUserIds?: string[]
  ): Promise<number> {
    try {
      let successCount = 0;
      const sender = forwarderName || 'Field Operations Manager';

      // 1. Build CC list: Super Admins + Hub Supervisor for accountability
      const ccEmails = await getAllCcEmails(hubId);

      // 2. If specific coordinators provided, notify them directly
      if (coordinatorUserIds && coordinatorUserIds.length > 0) {
        const { data: coordinators, error: coordError } = await supabase
          .from('profiles')
          .select('id, full_name, email, role')
          .in('id', coordinatorUserIds);

        if (coordError) {
          console.error('Error fetching coordinator details:', coordError);
        }

        for (const coord of coordinators || []) {
          // Create in-app notification
          const sent = await this.send({
            userId: coord.id,
            title: 'MMP Forwarded to You',
            message: `MMP "${mmpName}" has been forwarded to you for site assignment by ${sender}`,
            type: 'info',
            category: 'assignments',
            priority: 'high',
            link: mmpId ? `/mmp/${mmpId}` : '/mmp',
            relatedEntityId: mmpId,
            relatedEntityType: 'mmpFile',
            sendEmail: false
          });
          if (sent) successCount++;

          // Send bilingual email to coordinator (CC Super Admins only)
          if (coord.email) {
            try {
              const roleInfo = formatRoleName(coord.role);
              console.log(`[NOTIFICATION] Sending email to Coordinator: ${coord.email}${ccEmails.length ? `, CC: ${ccEmails.join(', ')}` : ''}`);
              await EmailNotificationService.sendMMPForwardedToCoordinators(
                coord.email,
                coord.full_name || 'Coordinator',
                mmpName,
                sender,
                coordinatorCount,
                mmpId,
                roleInfo,
                ccEmails.length > 0 ? ccEmails : undefined
              );
              console.log(`[NOTIFICATION] Email sent to Coordinator: ${coord.email}`);
            } catch (emailError) {
              console.error(`[NOTIFICATION] Failed to send email to ${coord.email}:`, emailError);
            }
          }
          
          // Add delay between emails to prevent rate limiting
          if ((coordinators || []).indexOf(coord) < (coordinators || []).length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
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
   * Notify FOM when a site is verified by a coordinator
   * - Sends in-app notification to the FOM only
   * - Sends bilingual email to FOM (CC one Super Admin)
   * - Simplified to reduce email volume
   */
  async siteVerifiedByCoordinator(
    hubId: string,
    siteName: string,
    mmpName: string,
    coordinatorName: string,
    siteId?: string,
    fomUserId?: string
  ): Promise<number> {
    try {
      let successCount = 0;

      // 1. Build CC list: Super Admins + Hub Supervisor for accountability
      const ccEmails = await getAllCcEmails(hubId);

      // 2. If specific FOM provided, notify them directly
      if (fomUserId) {
        const { data: fomUser } = await supabase
          .from('profiles')
          .select('id, full_name, email, role')
          .eq('id', fomUserId)
          .single();

        if (fomUser) {
          const sent = await this.send({
            userId: fomUser.id,
            title: 'Site Verified - Ready for Review',
            message: `Site "${siteName}" from MMP "${mmpName}" has been verified by Coordinator ${coordinatorName}. Ready for your approval.`,
            type: 'success',
            category: 'assignments',
            priority: 'high',
            link: siteId ? `/mmp?site=${siteId}` : '/mmp',
            relatedEntityId: siteId,
            relatedEntityType: 'siteVisit',
            sendEmail: false
          });
          if (sent) successCount++;

          // Send bilingual email to FOM (CC Super Admins only)
          if (fomUser.email) {
            try {
              const roleInfo = formatRoleName(fomUser.role);
              console.log(`[NOTIFICATION] Sending Site Verified email to FOM: ${fomUser.email}${ccEmails.length ? `, CC: ${ccEmails.join(', ')}` : ''}`);
              await EmailNotificationService.sendSiteVerifiedByCoordinator(
                fomUser.email,
                fomUser.full_name || 'Field Operations Manager',
                siteName,
                mmpName,
                coordinatorName,
                siteId,
                roleInfo,
                ccEmails.length > 0 ? ccEmails : undefined
              );
              console.log(`[NOTIFICATION] Site Verified email sent to FOM: ${fomUser.email}`);
            } catch (emailError) {
              console.error(`[NOTIFICATION] Failed to send email to FOM ${fomUser.email}:`, emailError);
            }
          }
        }
      } else {
        // Fallback: Get hub's FOM if not specified
        const { data: hubFoms } = await supabase
          .from('profiles')
          .select('id, full_name, email, role')
          .eq('hub_id', hubId)
          .in('role', ['fom', 'FOM'])
          .limit(1);

        if (hubFoms && hubFoms.length > 0) {
          const fom = hubFoms[0];
          const sent = await this.send({
            userId: fom.id,
            title: 'Site Verified - Ready for Review',
            message: `Site "${siteName}" from MMP "${mmpName}" has been verified by Coordinator ${coordinatorName}. Ready for your approval.`,
            type: 'success',
            category: 'assignments',
            priority: 'high',
            link: siteId ? `/mmp?site=${siteId}` : '/mmp',
            relatedEntityId: siteId,
            relatedEntityType: 'siteVisit',
            sendEmail: false
          });
          if (sent) successCount++;

          if (fom.email) {
            try {
              const roleInfo = formatRoleName(fom.role);
              console.log(`[NOTIFICATION] Sending Site Verified email to fallback FOM: ${fom.email}${ccEmails.length ? `, CC: ${ccEmails.join(', ')}` : ''}`);
              await EmailNotificationService.sendSiteVerifiedByCoordinator(
                fom.email,
                fom.full_name || 'Field Operations Manager',
                siteName,
                mmpName,
                coordinatorName,
                siteId,
                roleInfo,
                ccEmails.length > 0 ? ccEmails : undefined
              );
            } catch (emailError) {
              console.error(`[NOTIFICATION] Failed to send email to FOM ${fom.email}:`, emailError);
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
        priority: 'normal' as NotificationPriority
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
        priority: 'normal' as NotificationPriority
      },
      approved: {
        title: 'Site Approved',
        message: `Site "${siteName}" has been approved${details?.actorName ? ` by ${details.actorName}` : ''}`,
        type: 'success' as const,
        priority: 'normal' as NotificationPriority
      },
      dispatched: {
        title: 'Sites Dispatched',
        message: details?.siteCount 
          ? `${details.siteCount} sites including "${siteName}" have been dispatched`
          : `Site "${siteName}" has been dispatched`,
        type: 'info' as const,
        priority: 'normal' as NotificationPriority
      },
      completed: {
        title: 'Site Visit Completed',
        message: `Site visit to "${siteName}" has been completed${details?.actorName ? ` by ${details.actorName}` : ''}`,
        type: 'success' as const,
        priority: 'normal' as NotificationPriority
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
      priority: status === 'pending' ? 'high' : 'normal',
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
      priority: isComplete ? 'high' : 'normal',
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
      priority: isToday ? 'high' : 'normal',
      link: '/mmp'
    });
  },

  /**
   * Notify FOM when MMP is forwarded to them
   * - Sends in-app notification and bilingual email to selected FOM(s) only
   * - CC one Super Admin on email (not all admins)
   * - Simplified to reduce email volume and avoid rate limiting
   */
  async mmpForwardedToFOM(
    fomUserIds: string[],
    mmpName: string,
    mmpId: string,
    forwarderName?: string,
    hubId?: string
  ): Promise<number> {
    try {
      let successCount = 0;
      const sender = forwarderName || 'Admin';

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

      // 3. Build CC list: Super Admins + Hub Supervisor for accountability
      const ccEmails = await getAllCcEmails(hubId);
      
      // 4. Notify CC recipients (super admins + hub supervisor) with bilingual email
      for (const ccEmail of ccEmails) {
        // Find user details for the CC recipient
        const { data: ccUser } = await supabase
          .from('profiles')
          .select('id, full_name, email, role')
          .eq('email', ccEmail)
          .single();
        
        if (ccUser) {
          const recipientName = ccUser.full_name || (ccUser.role === 'supervisor' ? 'Hub Supervisor' : 'Super Administrator');
          
          // Create in-app notification
          const sent = await this.send({
            userId: ccUser.id,
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
          try {
            await EmailNotificationService.sendMMPForwardedToFOM(
              ccEmail,
              recipientName,
              mmpName,
              sender,
              mmpId,
              false // Not the direct recipient
            );
            console.log(`[NOTIFICATION] Sent bilingual MMP forwarded email to ${ccUser.role}: ${ccEmail}`);
          } catch (emailError) {
            console.error(`[NOTIFICATION] Failed to send bilingual email to ${ccEmail}:`, emailError);
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
