
export type NotificationCategory = 'assignments' | 'approvals' | 'financial' | 'team' | 'system' | 'signatures' | 'calls' | 'messages';

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  isRead: boolean;
  createdAt: string;
  link?: string;
  relatedEntityId?: string;
  relatedEntityType?: 'siteVisit' | 'mmpFile' | 'transaction' | 'chat' | 'call' | 'signature' | 'document';
  category?: NotificationCategory;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  targetRoles?: string[];  // Roles that should see this notification
  projectId?: string;      // Project this notification is related to
}

// Email preference categories
export type EmailPreferenceCategory = 
  | 'mmp_notifications'      // MMP forwarding, completion
  | 'site_notifications'     // Site assignments, approvals
  | 'task_reminders'         // Task deadline reminders
  | 'permit_alerts'          // Permit expiration alerts
  | 'financial_updates'      // Withdrawal, balance updates
  | 'weekly_summary'         // Weekly summary reports
  | 'system_updates';        // System announcements

// User email preferences
export interface EmailPreferences {
  userId: string;
  preferences: {
    [K in EmailPreferenceCategory]: {
      enabled: boolean;
      inApp: boolean;    // Show in-app notifications
      email: boolean;    // Send email notifications
    };
  };
  updatedAt: string;
}

// Default email preferences for new users
export const DEFAULT_EMAIL_PREFERENCES: EmailPreferences['preferences'] = {
  mmp_notifications: { enabled: true, inApp: true, email: true },
  site_notifications: { enabled: true, inApp: true, email: true },
  task_reminders: { enabled: true, inApp: true, email: true },
  permit_alerts: { enabled: true, inApp: true, email: true },
  financial_updates: { enabled: true, inApp: true, email: true },
  weekly_summary: { enabled: true, inApp: false, email: true },
  system_updates: { enabled: true, inApp: true, email: false },
};
