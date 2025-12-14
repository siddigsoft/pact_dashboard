import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { useWhatsAppNotifications, WhatsAppNotification } from '@/hooks/useWhatsAppNotifications';
import { usePersistentNotifications, PersistentNotification } from '@/hooks/usePersistentNotifications';

class NotificationErrorBoundary extends React.Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('NotificationProvider error:', error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

interface NotificationContextType {
  notifications: WhatsAppNotification[];
  success: (title: string, description?: string, duration?: number) => string;
  error: (title: string, description?: string, duration?: number) => string;
  warning: (title: string, description?: string, duration?: number) => string;
  info: (title: string, description?: string, duration?: number) => string;
  task: (title: string, description?: string, action?: { label: string; onClick: () => void }) => string;
  remove: (id: string) => void;
  persistentNotifications: PersistentNotification[];
  unreadCount: number;
  urgentCount: number;
  isPersistentLoading: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  refreshNotifications: () => Promise<void>;
  getNotificationsByPriority: (priority: 'urgent' | 'high' | 'normal') => PersistentNotification[];
  getUnreadNotifications: () => PersistentNotification[];
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const NotificationProviderInner: React.FC<{ children: ReactNode }> = ({ children }) => {
  const notificationHook = useWhatsAppNotifications();
  const persistentHook = usePersistentNotifications();

  const value: NotificationContextType = {
    notifications: notificationHook.notifications,
    success: notificationHook.success,
    error: notificationHook.error,
    warning: notificationHook.warning,
    info: notificationHook.info,
    task: notificationHook.task,
    remove: notificationHook.remove,
    persistentNotifications: persistentHook.notifications,
    unreadCount: persistentHook.unreadCount,
    urgentCount: persistentHook.urgentCount,
    isPersistentLoading: persistentHook.isLoading,
    markAsRead: persistentHook.markAsRead,
    markAllAsRead: persistentHook.markAllAsRead,
    deleteNotification: persistentHook.deleteNotification,
    refreshNotifications: persistentHook.fetchNotifications,
    getNotificationsByPriority: persistentHook.getNotificationsByPriority,
    getUnreadNotifications: persistentHook.getUnreadNotifications,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

// Default fallback values when notification system fails
const defaultValue: NotificationContextType = {
  notifications: [],
  success: () => '',
  error: () => '',
  warning: () => '',
  info: () => '',
  task: () => '',
  remove: () => {},
  persistentNotifications: [],
  unreadCount: 0,
  urgentCount: 0,
  isPersistentLoading: false,
  markAsRead: async () => {},
  markAllAsRead: async () => {},
  deleteNotification: async () => {},
  refreshNotifications: async () => {},
  getNotificationsByPriority: () => [],
  getUnreadNotifications: () => [],
};

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <NotificationErrorBoundary
      fallback={
        <NotificationContext.Provider value={defaultValue}>
          {children}
        </NotificationContext.Provider>
      }
    >
      <NotificationProviderInner>{children}</NotificationProviderInner>
    </NotificationErrorBoundary>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
};
