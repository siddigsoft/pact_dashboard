import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  NotificationContainer, 
  ActionableNotificationData, 
  NotificationType 
} from '@/components/notifications/ActionableNotification';
import notificationSoundService from '@/services/NotificationSoundService';
interface NotificationOptions {
  type: NotificationType;
  title: string;
  message: string;
  entityId?: string;
  entityType?: string;
  senderName?: string;
  senderAvatar?: string;
  link?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  playSound?: boolean;
}

interface ActionableNotificationContextType {
  showNotification: (options: NotificationOptions) => string;
  dismissNotification: (id: string) => void;
  dismissAll: () => void;
  notifications: ActionableNotificationData[];
}

const ActionableNotificationContext = createContext<ActionableNotificationContextType | null>(null);

export function useActionableNotification() {
  const context = useContext(ActionableNotificationContext);
  if (!context) {
    throw new Error('useActionableNotification must be used within ActionableNotificationProvider');
  }
  return context;
}

interface ActionableNotificationProviderProps {
  children: React.ReactNode;
  maxNotifications?: number;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center';
}

export function ActionableNotificationProvider({ 
  children, 
  maxNotifications = 5,
  position = 'top-right',
}: ActionableNotificationProviderProps) {
  const [notifications, setNotifications] = useState<ActionableNotificationData[]>([]);
  const navigate = useNavigate();

  const playNotificationSound = useCallback((type: NotificationType, priority?: string) => {
    switch (type) {
      case 'message':
        notificationSoundService.playMessage();
        break;
      case 'call':
        notificationSoundService.playRingtone();
        break;
      case 'alert':
        if (priority === 'urgent') {
          notificationSoundService.playSOS();
        } else {
          notificationSoundService.playWarning();
        }
        break;
      case 'success':
        notificationSoundService.playSuccess();
        break;
      case 'wallet':
      case 'approval':
        notificationSoundService.playNotification();
        break;
      default:
        notificationSoundService.playNotification();
    }
  }, []);

  const showNotification = useCallback((options: NotificationOptions): string => {
    const id = crypto.randomUUID();
    
    const notification: ActionableNotificationData = {
      id,
      type: options.type,
      title: options.title,
      message: options.message,
      timestamp: new Date(),
      entityId: options.entityId,
      entityType: options.entityType,
      senderName: options.senderName,
      senderAvatar: options.senderAvatar,
      link: options.link,
      priority: options.priority || 'normal',
    };

    setNotifications(prev => {
      const updated = [notification, ...prev];
      return updated.slice(0, maxNotifications);
    });

    // Play sound if enabled
    if (options.playSound !== false) {
      playNotificationSound(options.type, options.priority);
    }

    return id;
  }, [maxNotifications, playNotificationSound]);

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const handleOpen = useCallback((notification: ActionableNotificationData) => {
    // Navigate based on notification type and link
    if (notification.link) {
      navigate(notification.link);
    } else {
      switch (notification.type) {
        case 'message':
          navigate('/chat');
          break;
        case 'call':
          navigate('/calls');
          break;
        case 'email':
          navigate('/notifications');
          break;
        case 'site-update':
          if (notification.entityId) {
            navigate(`/site-visits/${notification.entityId}`);
          } else {
            navigate('/site-visits');
          }
          break;
        case 'approval':
          navigate('/approvals');
          break;
        case 'wallet':
          navigate('/finance');
          break;
        default:
          navigate('/notifications');
      }
    }
  }, [navigate]);

  const handleDismiss = useCallback((id: string) => {
    dismissNotification(id);
  }, [dismissNotification]);

  return (
    <ActionableNotificationContext.Provider 
      value={{ 
        showNotification, 
        dismissNotification, 
        dismissAll,
        notifications,
      }}
    >
      {children}
      <NotificationContainer
        notifications={notifications}
        onOpen={handleOpen}
        onDismiss={handleDismiss}
        position={position}
      />
    </ActionableNotificationContext.Provider>
  );
}

export default ActionableNotificationContext;
