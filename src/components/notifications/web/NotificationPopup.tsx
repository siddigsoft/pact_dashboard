/**
 * Web Notification Popup Component
 * WhatsApp/Telegram-style popup for web platform
 */

import { useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { X, ExternalLink } from 'lucide-react';
import { NotificationData } from '@/theme/notifications-theme';
import { NotificationBubble } from '../shared/NotificationBubble';
import { useNotificationAnimation } from '@/hooks/notifications/useNotificationAnimation';
import { useNotificationSound } from '@/hooks/notifications/useNotificationSound';

interface NotificationPopupProps {
  notification: NotificationData | null;
  position?: 'top' | 'top-right' | 'bottom' | 'bottom-right';
  autoHideDuration?: number;
  soundEnabled?: boolean;
  locale?: 'en' | 'ar';
  onDismiss?: () => void;
  onAction?: (notification: NotificationData) => void;
  className?: string;
}

export function NotificationPopup({
  notification,
  position = 'top-right',
  autoHideDuration = 5000,
  soundEnabled = true,
  locale = 'en',
  onDismiss,
  onAction,
  className,
}: NotificationPopupProps) {
  const direction = position.includes('top') ? 'top' : 'bottom';
  
  const {
    notifications,
    show,
    dismiss,
    pauseAutoHide,
    resumeAutoHide,
  } = useNotificationAnimation<NotificationData>({
    direction,
    autoHideDuration,
  });

  const { playSoundForId } = useNotificationSound({
    enabled: soundEnabled,
  });

  useEffect(() => {
    if (notification) {
      show(notification.id, notification);
      playSoundForId(notification.id);
    }
  }, [notification, show, playSoundForId]);

  const handleDismiss = useCallback((id: string) => {
    dismiss(id);
    onDismiss?.();
  }, [dismiss, onDismiss]);

  const handleAction = useCallback((notif: NotificationData) => {
    if (notif.actionUrl) {
      window.open(notif.actionUrl, '_blank');
    }
    onAction?.(notif);
    handleDismiss(notif.id);
  }, [onAction, handleDismiss]);

  const positionClasses = {
    top: 'notification-popup-container--top',
    'top-right': 'notification-popup-container--top-right',
    bottom: 'notification-popup-container--bottom',
    'bottom-right': 'notification-popup-container--bottom-right',
  };

  if (notifications.length === 0) return null;

  return (
    <div
      className={cn('notification-popup-container', positionClasses[position], className)}
      role="alert"
      aria-live="polite"
    >
      <div className="flex flex-col gap-2">
        {notifications.map((animatedNotif) => (
          <div
            key={animatedNotif.id}
            className={cn('notification-popup', animatedNotif.className)}
            onMouseEnter={() => pauseAutoHide(animatedNotif.id)}
            onMouseLeave={() => resumeAutoHide(animatedNotif.id)}
            data-testid={`notification-popup-${animatedNotif.id}`}
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex-1 min-w-0">
                <NotificationBubble
                  notification={animatedNotif.data}
                  variant="other"
                  showAvatar={true}
                  showTail={false}
                  locale={locale}
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="flex-shrink-0 h-8 w-8"
                onClick={() => handleDismiss(animatedNotif.id)}
                data-testid={`button-dismiss-${animatedNotif.id}`}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Dismiss</span>
              </Button>
            </div>

            {(animatedNotif.data.actionUrl || animatedNotif.data.actionLabel) && (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleAction(animatedNotif.data)}
                  data-testid={`button-action-${animatedNotif.id}`}
                >
                  {animatedNotif.data.actionLabel || 'View'}
                  <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default NotificationPopup;
