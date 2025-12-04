import React, { useEffect, useState } from 'react';
import { WhatsAppNotification, NotificationType } from '@/hooks/useWhatsAppNotifications';
import { X, CheckCircle, AlertCircle, Info, Zap } from 'lucide-react';

interface NotificationDisplayProps {
  notification: WhatsAppNotification;
  onRemove: (id: string) => void;
}

const getIconForType = (type: NotificationType) => {
  switch (type) {
    case 'success':
      return <CheckCircle className="w-5 h-5" />;
    case 'error':
      return <AlertCircle className="w-5 h-5" />;
    case 'warning':
      return <AlertCircle className="w-5 h-5" />;
    case 'info':
      return <Info className="w-5 h-5" />;
    case 'task':
      return <Zap className="w-5 h-5" />;
    default:
      return null;
  }
};

export const TopNotificationDisplay: React.FC<NotificationDisplayProps> = ({ notification, onRemove }) => {
  const [isExiting, setIsExiting] = useState(false);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      onRemove(notification.id);
    }, 300);
  };

  useEffect(() => {
    if (notification.duration && notification.duration > 0) {
      const timer = setTimeout(handleClose, notification.duration);
      return () => clearTimeout(timer);
    }
  }, [notification.duration, notification.id]);

  return (
    <div
      className={`whatsapp-notification notification-${notification.type} ${isExiting ? 'exit' : ''}`}
      role="alert"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="notification-icon">
        {getIconForType(notification.type)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate">{notification.title}</div>
        {notification.description && (
          <div className="text-sm opacity-90 truncate">{notification.description}</div>
        )}
      </div>
      {notification.duration !== 0 && (
        <button
          onClick={handleClose}
          className="flex-shrink-0 ml-2 opacity-70 hover:opacity-100 transition-opacity"
          aria-label="Close notification"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

export const ToastNotificationDisplay: React.FC<NotificationDisplayProps> = ({ notification, onRemove }) => {
  const [isExiting, setIsExiting] = useState(false);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      onRemove(notification.id);
    }, 300);
  };

  useEffect(() => {
    if (notification.duration && notification.duration > 0) {
      const timer = setTimeout(handleClose, notification.duration);
      return () => clearTimeout(timer);
    }
  }, [notification.duration, notification.id]);

  return (
    <div
      className={`toast-item toast-${notification.type} ${isExiting ? 'exit' : ''}`}
      role="alert"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className={`toast-icon toast-${notification.type}-icon`}>
        {getIconForType(notification.type)}
      </div>
      <div className="toast-content">
        <div className="toast-title">{notification.title}</div>
        {notification.description && (
          <div className="toast-description">{notification.description}</div>
        )}
      </div>
      {notification.action && (
        <button
          onClick={() => {
            notification.action?.onClick();
            handleClose();
          }}
          className="toast-action"
          aria-label={notification.action.label}
        >
          {notification.action.label}
        </button>
      )}
      {notification.duration !== 0 && (
        <button
          onClick={handleClose}
          className="toast-close"
          aria-label="Close notification"
        >
          ×
        </button>
      )}
    </div>
  );
};

interface NotificationStackProps {
  notifications: WhatsAppNotification[];
  onRemove: (id: string) => void;
  displayType?: 'top' | 'bottom';
}

export const NotificationStack: React.FC<NotificationStackProps> = ({
  notifications,
  onRemove,
  displayType = 'top',
}) => {
  const NotificationComponent = displayType === 'top' ? TopNotificationDisplay : ToastNotificationDisplay;

  if (displayType === 'top') {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 flex flex-col gap-2 pointer-events-none p-4">
        {notifications.map((notification) => (
          <div key={notification.id} className="pointer-events-auto">
            <TopNotificationDisplay notification={notification} onRemove={onRemove} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="toast-container">
      {notifications.map((notification) => (
        <div key={notification.id}>
          <ToastNotificationDisplay notification={notification} onRemove={onRemove} />
        </div>
      ))}
    </div>
  );
};
