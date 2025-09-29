
import React, { createContext, useContext, useState, useCallback } from 'react';
import { Notification } from '@/types';

// Remove direct dependency on useUser
// import { useUser } from '../user/UserContext';

const mockNotifications: Notification[] = [
  {
    id: 'not1',
    userId: 'usr6',
    title: 'New Site Visit Assigned',
    message: 'You have been assigned a new site visit at Port Harcourt Clinic.',
    type: 'info',
    isRead: false,
    createdAt: new Date(Date.now() - 86400000 * 0.5).toISOString(),
    link: '/site-visits/sv4',
    relatedEntityId: 'sv4',
    relatedEntityType: 'siteVisit',
  },
  {
    id: 'not2',
    userId: 'usr5',
    title: 'Site Visit Started',
    message: 'You have started the site visit at Kaduna School Project.',
    type: 'success',
    isRead: true,
    createdAt: new Date(Date.now() - 86400000 * 0.3).toISOString(),
    link: '/site-visits/sv5',
    relatedEntityId: 'sv5',
    relatedEntityType: 'siteVisit',
  },
  {
    id: 'not3',
    userId: 'usr3',
    title: 'MMP Pending Approval',
    message: 'May 2025 MMP is pending your approval.',
    type: 'warning',
    isRead: false,
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    link: '/mmp/mmp2',
    relatedEntityId: 'mmp2',
    relatedEntityType: 'mmpFile',
  },
];

interface NotificationContextType {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id' | 'isRead' | 'createdAt'>) => void;
  markNotificationAsRead: (notificationId: string) => void;
  getUnreadNotificationsCount: () => number;
  clearAllNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [appNotifications, setAppNotifications] = useState<Notification[]>(mockNotifications);
  // Safely try to get the current user ID
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  // Try to get the current user ID from the UserContext when it becomes available
  React.useEffect(() => {
    let cleanup: (() => void) | undefined;
    (async () => {
      try {
        const module = await import('../user/UserContext');
        const { createRoot } = await import('react-dom/client');

        const { useUser } = module;
        const UserIdGetter = () => {
          const { currentUser } = useUser();
          React.useEffect(() => {
            if (currentUser) {
              setCurrentUserId(currentUser.id);
            }
          }, [currentUser]);
          return null;
        };

        const div = document.createElement('div');
        document.body.appendChild(div);
        const root = createRoot(div);
        root.render(<UserIdGetter />);

        cleanup = () => {
          try { root.unmount(); } catch {}
          try { document.body.removeChild(div); } catch {}
        };
      } catch (error) {
        console.error('Failed to get current user ID:', error);
      }
    })();

    return () => { if (cleanup) cleanup(); };
  }, []);

  // Enhanced duplicate detection that checks content and creation time
  const isDuplicateNotification = useCallback((newNotification: Omit<Notification, 'id' | 'isRead' | 'createdAt'>) => {
    const now = Date.now();
    // Check for notifications with similar content created in the last 10 seconds
    return appNotifications.some(n => 
      n.userId === newNotification.userId && 
      n.title === newNotification.title && 
      n.message === newNotification.message &&
      n.type === newNotification.type &&
      !n.isRead &&
      now - new Date(n.createdAt).getTime() < 10000 // Notification from less than 10 seconds ago
    );
  }, [appNotifications]);

  const addNotification = useCallback((notification: Omit<Notification, 'id' | 'isRead' | 'createdAt'>) => {
    // Enhanced duplicate detection
    if (isDuplicateNotification(notification)) return;

    const newNotification: Notification = {
      id: `not${Date.now()}${Math.random().toString(36).substr(2, 5)}`, // More unique ID
      isRead: false,
      createdAt: new Date().toISOString(),
      ...notification,
    };

    setAppNotifications(prev => {
      // Limit to 50 notifications to prevent performance issues
      const updatedNotifications = [newNotification, ...prev];
      if (updatedNotifications.length > 50) {
        return updatedNotifications.slice(0, 50);
      }
      return updatedNotifications;
    });
  }, [isDuplicateNotification]);

  const markNotificationAsRead = useCallback((notificationId: string) => {
    setAppNotifications(prev => 
      prev.map(n => 
        n.id === notificationId ? { ...n, isRead: true } : n
      )
    );
  }, []);

  const clearAllNotifications = useCallback(() => {
    setAppNotifications([]);
  }, []);

  const getUnreadNotificationsCount = useCallback((): number => {
    // If we don't have a current user ID, return 0
    if (!currentUserId) return 0;
    return appNotifications.filter(n => 
      n.userId === currentUserId && !n.isRead
    ).length;
  }, [appNotifications, currentUserId]);

  return (
    <NotificationContext.Provider
      value={{
        notifications: appNotifications,
        addNotification,
        markNotificationAsRead,
        getUnreadNotificationsCount,
        clearAllNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
