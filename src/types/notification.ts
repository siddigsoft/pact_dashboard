
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
