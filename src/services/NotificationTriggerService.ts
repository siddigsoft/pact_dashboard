import { supabase } from '@/integrations/supabase/client';

export type NotificationCategory = 'assignments' | 'approvals' | 'financial' | 'team' | 'system';
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
  relatedEntityType?: 'siteVisit' | 'mmpFile' | 'transaction' | 'chat';
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
        link,
        related_entity_id: relatedEntityId,
        related_entity_type: relatedEntityType,
        is_read: false
      });

      if (error) {
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
  }
};

export default NotificationTriggerService;
