/**
 * Web Notification View Component
 * Integrated notification center for web platform with Uber theme
 */

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Bell } from 'lucide-react';
import { NotificationData } from '@/theme/notifications-theme';
import { NotificationList } from './NotificationList';
import { NotificationPopup } from './NotificationPopup';
import { UnreadBadge } from '../shared/NotificationBubble';

interface WebNotificationViewProps {
  notifications: NotificationData[];
  locale?: 'en' | 'ar';
  popupPosition?: 'top' | 'top-right' | 'bottom' | 'bottom-right';
  soundEnabled?: boolean;
  onNotificationClick?: (notification: NotificationData) => void;
  onMarkAsRead?: (id: string) => void;
  onMarkAllAsRead?: () => void;
  onDelete?: (id: string) => void;
  onClearAll?: () => void;
  className?: string;
}

export function WebNotificationView({
  notifications,
  locale = 'en',
  popupPosition = 'top-right',
  soundEnabled = true,
  onNotificationClick,
  onMarkAsRead,
  onMarkAllAsRead,
  onDelete,
  onClearAll,
  className,
}: WebNotificationViewProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [latestPopupNotification, setLatestPopupNotification] = useState<NotificationData | null>(null);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleNotificationClick = useCallback((notification: NotificationData) => {
    setIsOpen(false);
    onNotificationClick?.(notification);
  }, [onNotificationClick]);

  const showPopupNotification = useCallback((notification: NotificationData) => {
    if (!isOpen) {
      setLatestPopupNotification(notification);
    }
  }, [isOpen]);

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn('relative', className)}
            data-testid="button-notifications"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1">
                <UnreadBadge count={unreadCount} />
              </span>
            )}
            <span className="sr-only">
              {locale === 'ar' ? 'الإشعارات' : 'Notifications'}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-96 p-0"
          align="end"
          sideOffset={8}
        >
          <NotificationList
            notifications={notifications}
            locale={locale}
            onNotificationClick={handleNotificationClick}
            onMarkAsRead={onMarkAsRead}
            onMarkAllAsRead={onMarkAllAsRead}
            onDelete={onDelete}
            onClearAll={onClearAll}
            maxHeight="450px"
          />
        </PopoverContent>
      </Popover>

      <NotificationPopup
        notification={latestPopupNotification}
        position={popupPosition}
        soundEnabled={soundEnabled}
        locale={locale}
        onDismiss={() => setLatestPopupNotification(null)}
        onAction={handleNotificationClick}
      />
    </>
  );
}

export default WebNotificationView;
