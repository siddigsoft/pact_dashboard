
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
  relatedEntityType?: 'siteVisit' | 'mmpFile' | 'transaction' | 'chat';
}
