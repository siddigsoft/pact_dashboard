import React, { createContext, useContext, ReactNode } from 'react';
import { useWhatsAppNotifications, WhatsAppNotification } from '@/hooks/useWhatsAppNotifications';

interface NotificationContextType {
  notifications: WhatsAppNotification[];
  success: (title: string, description?: string, duration?: number) => string;
  error: (title: string, description?: string, duration?: number) => string;
  warning: (title: string, description?: string, duration?: number) => string;
  info: (title: string, description?: string, duration?: number) => string;
  task: (title: string, description?: string, action?: { label: string; onClick: () => void }) => string;
  remove: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const notificationHook = useWhatsAppNotifications();

  const value: NotificationContextType = {
    notifications: notificationHook.notifications,
    success: notificationHook.success,
    error: notificationHook.error,
    warning: notificationHook.warning,
    info: notificationHook.info,
    task: notificationHook.task,
    remove: notificationHook.remove,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
};
