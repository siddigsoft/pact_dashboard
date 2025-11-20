
import { toast } from "@/hooks/toast";

type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'chat';

interface NotificationOptions {
  title: string;
  message: string;
  type?: NotificationType;
  duration?: number;
  important?: boolean;
  link?: string;
  userId?: string;
  entityId?: string;
  entityType?: 'siteVisit' | 'mmpFile' | 'transaction' | 'chat';
  showToast?: boolean;
}

// Default durations by notification type (in milliseconds)
const DEFAULT_DURATIONS = {
  info: 5000,
  success: 4000,
  warning: 6000,
  error: 8000,
  chat: 4000
};

// Map notification types to toast variant types
const mapNotificationTypeToToastVariant = (
  type: NotificationType
): 'default' | 'destructive' | 'success' | 'warning' | 'info' | 'siddig' => {
  switch(type) {
    case 'error':
      return 'destructive';
    case 'chat':
      return 'info';
    case 'success':
    case 'warning':
    case 'info':
      return type;
    default:
      return 'default';
  }
};

export const NotificationService = {
  /**
   * Send a notification that can appear as both a toast and in the notification center
   */
  send: (options: NotificationOptions) => {
    const { 
      title, 
      message, 
      type = 'info', 
      duration,
      important = false,
      showToast = true,
      userId,
      entityId,
      entityType,
      link
    } = options;
    
    // Show toast notification
    if (showToast) {
      // Map notification types to toast variants
      const toastVariant = mapNotificationTypeToToastVariant(type);
      
      toast({
        title,
        description: message,
        variant: toastVariant,
        duration: duration || DEFAULT_DURATIONS[type],
        important
      });
    }
  },
  
  /**
   * Show only a toast notification (doesn't add to notification center)
   */
  toast: (title: string, message: string, type: NotificationType = 'info', important: boolean = false) => {
    // Map notification types to toast variants
    const toastVariant = mapNotificationTypeToToastVariant(type);
    
    toast({
      title,
      description: message,
      variant: toastVariant,
      duration: DEFAULT_DURATIONS[type],
      important
    });
  },
  
  /**
   * Create a success notification
   */
  success: (title: string, message: string, important: boolean = false) => {
    NotificationService.toast(title, message, 'success', important);
  },
  
  /**
   * Create an error notification
   */
  error: (title: string, message: string, important: boolean = false) => {
    NotificationService.toast(title, message, 'error', important);
  },
  
  /**
   * Create a warning notification
   */
  warning: (title: string, message: string, important: boolean = false) => {
    NotificationService.toast(title, message, 'warning', important);
  },
  
  /**
   * Create an info notification
   */
  info: (title: string, message: string, important: boolean = false) => {
    NotificationService.toast(title, message, 'info', important);
  }
};
