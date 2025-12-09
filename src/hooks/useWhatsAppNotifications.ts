// WhatsApp-Style Notifications Utility Hook
import { useState, useCallback } from 'react';

export type NotificationType = 'success' | 'error' | 'warning' | 'info' | 'task';

export interface WhatsAppNotification {
  id: string;
  type: NotificationType;
  title: string;
  description?: string;
  icon?: string;
  duration?: number; // milliseconds, 0 = persistent
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const useWhatsAppNotifications = () => {
  const [notifications, setNotifications] = useState<WhatsAppNotification[]>([]);

  const show = useCallback((notification: Omit<WhatsAppNotification, 'id'>) => {
    const id = `notification-${Date.now()}-${Math.random()}`;
    const newNotification: WhatsAppNotification = {
      ...notification,
      id,
      duration: notification.duration ?? 3000,
    };

    setNotifications(prev => [...prev, newNotification]);

    // Auto-dismiss if duration is set
    if (newNotification.duration > 0) {
      setTimeout(() => {
        removeNotification(id);
      }, newNotification.duration);
    }

    return id;
  }, []);

  const remove = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const success = useCallback((title: string, description?: string, duration = 3000) => {
    return show({
      type: 'success',
      title,
      description,
      duration,
      icon: '✓',
    });
  }, [show]);

  const error = useCallback((title: string, description?: string, duration = 4000) => {
    return show({
      type: 'error',
      title,
      description,
      duration,
      icon: '!',
    });
  }, [show]);

  const warning = useCallback((title: string, description?: string, duration = 4000) => {
    return show({
      type: 'warning',
      title,
      description,
      duration,
      icon: '⚠',
    });
  }, [show]);

  const info = useCallback((title: string, description?: string, duration = 3000) => {
    return show({
      type: 'info',
      title,
      description,
      duration,
      icon: 'ℹ',
    });
  }, [show]);

  const task = useCallback((title: string, description?: string, action?: { label: string; onClick: () => void }) => {
    return show({
      type: 'task',
      title,
      description,
      duration: 0, // Persistent
      icon: '◆',
      action,
    });
  }, [show]);

  return {
    notifications,
    show,
    remove: removeNotification,
    success,
    error,
    warning,
    info,
    task,
  };
};

// Preset notification messages
export const notificationMessages = {
  success: {
    saved: { title: 'Saved', description: 'Changes saved successfully' },
    created: { title: 'Created', description: 'Item created successfully' },
    deleted: { title: 'Deleted', description: 'Item deleted successfully' },
    completed: { title: 'Completed', description: 'Task completed successfully' },
    uploaded: { title: 'Uploaded', description: 'File uploaded successfully' },
    copied: { title: 'Copied', description: 'Copied to clipboard' },
  },
  error: {
    failed: { title: 'Failed', description: 'Operation failed' },
    invalid: { title: 'Invalid Input', description: 'Please check your input' },
    network: { title: 'Network Error', description: 'Please check your connection' },
    unauthorized: { title: 'Unauthorized', description: 'You do not have permission' },
    notfound: { title: 'Not Found', description: 'The item could not be found' },
    server: { title: 'Server Error', description: 'Something went wrong on the server' },
  },
  warning: {
    unsaved: { title: 'Unsaved Changes', description: 'You have unsaved changes' },
    confirm: { title: 'Confirm Action', description: 'Are you sure you want to continue?' },
    deprecated: { title: 'Deprecated', description: 'This feature will be removed soon' },
    limit: { title: 'Limit Reached', description: 'You have reached the limit' },
  },
  info: {
    processing: { title: 'Processing', description: 'Please wait...' },
    syncing: { title: 'Syncing', description: 'Your data is being synced' },
    loading: { title: 'Loading', description: 'Loading content...' },
    info: { title: 'Information', description: 'Here is some information for you' },
  },
  task: {
    assigned: { title: 'New Task Assigned', description: 'You have a new task' },
    reminder: { title: 'Task Reminder', description: 'Remember to complete this task' },
    due: { title: 'Task Due', description: 'Your task is due soon' },
    approved: { title: 'Approved', description: 'Your request has been approved' },
    rejected: { title: 'Rejected', description: 'Your request has been rejected' },
  },
};
