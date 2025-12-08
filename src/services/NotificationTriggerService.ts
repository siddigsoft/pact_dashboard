import { supabase } from '@/integrations/supabase/client';

export type NotificationCategory = 'assignments' | 'approvals' | 'financial' | 'team' | 'system' | 'signatures' | 'calls' | 'messages';
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
      relatedEntityType
    } = options;

    const shouldSend = await shouldSendNotification(userId, category, priority);
    if (!shouldSend) {
      console.log(`Notification suppressed for user ${userId}: ${title}`);
      return false;
    }

    try {
      const { error } = await supabase.from('notifications').insert({
        user_id: userId,
        title,
        message,
        type,
        category,
        priority,
        link,
        related_entity_id: relatedEntityId,
        related_entity_type: relatedEntityType,
        is_read: false
      });

      if (error) {
        // If category/priority columns don't exist, try without them
        if (error.message?.includes('column') || error.code === '42703') {
          console.warn('Notifications table missing category/priority columns, inserting without them');
          const { error: fallbackError } = await supabase.from('notifications').insert({
            user_id: userId,
            title,
            message,
            type,
            link,
            related_entity_id: relatedEntityId,
            related_entity_type: relatedEntityType,
            is_read: false
          });
          
          if (fallbackError) {
            console.error('Failed to create notification (fallback):', fallbackError);
            return false;
          }
          return true;
        }
        
        console.error('Failed to create notification:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error sending notification:', error);
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
    
    await this.send({
      userId,
      title: statusInfo.title,
      message: statusInfo.message,
      type: statusInfo.type,
      category: 'financial',
      priority: status === 'approved' ? 'high' : 'medium',
      link: '/wallet'
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
  }
};

export default NotificationTriggerService;
