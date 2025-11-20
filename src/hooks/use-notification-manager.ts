
import { useToast } from '@/hooks/toast';
import { useNotifications } from '@/context/notifications/NotificationContext';

export const useNotificationManager = () => {
  const { toast } = useToast();
  const { addNotification } = useNotifications();

  const sendNotification = ({
    title,
    message,
    type = 'info',
    link,
    userId,
    entityId,
    entityType,
    showToast = true,
    important = false,
    duration
  }: {
    title: string;
    message: string;
    type?: 'info' | 'success' | 'warning' | 'error' | 'chat';
    link?: string;
    userId?: string;
    entityId?: string;
    entityType?: 'siteVisit' | 'mmpFile' | 'transaction' | 'chat';
    showToast?: boolean;
    important?: boolean;
    duration?: number;
  }) => {
    // Add to notifications center
    if (userId) {
      addNotification({
        userId,
        title,
        message,
        // Convert chat type to info for the notification center
        // Convert error type to warning for the notification center
        type: type === 'chat' ? 'info' : (type === 'error' ? 'warning' : type),
        link,
        relatedEntityId: entityId,
        relatedEntityType: entityType
      });
    }

    // Define durations based on notification type
    const defaultDurations = {
      info: 5000,
      success: 4000,
      warning: 6000,
      error: 8000,
      chat: 4000
    };

    // Show toast if requested
    if (showToast) {
      // Map notification types to toast variant types
      let toastVariant: 'default' | 'destructive' | 'success' | 'warning' | 'info' | 'siddig';
      
      switch(type) {
        case 'error':
          toastVariant = 'destructive';
          break;
        case 'chat':
          toastVariant = 'info';
          break;
        case 'success':
        case 'warning':
        case 'info':
          toastVariant = type;
          break;
        default:
          toastVariant = 'default';
      }
      
      toast({
        title,
        description: message,
        variant: toastVariant,
        duration: duration || defaultDurations[type],
        important
      });
    }
  };

  return { sendNotification };
};
