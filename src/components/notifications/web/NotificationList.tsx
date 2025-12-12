/**
 * Web Notification List Component
 * WhatsApp/Telegram-style notification list for web platform
 */

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NotificationData, NotificationType } from '@/theme/notifications-theme';
import { NotificationListItem, NotificationEmptyState } from '../shared/NotificationListItem';
import { UnreadBadge } from '../shared/NotificationBubble';
import { Check, Trash2, Filter } from 'lucide-react';

type FilterType = 'all' | 'unread' | NotificationType;

interface NotificationListProps {
  notifications: NotificationData[];
  locale?: 'en' | 'ar';
  onNotificationClick?: (notification: NotificationData) => void;
  onMarkAsRead?: (id: string) => void;
  onMarkAllAsRead?: () => void;
  onDelete?: (id: string) => void;
  onClearAll?: () => void;
  showFilters?: boolean;
  maxHeight?: string;
  className?: string;
}

export function NotificationList({
  notifications,
  locale = 'en',
  onNotificationClick,
  onMarkAsRead,
  onMarkAllAsRead,
  onDelete,
  onClearAll,
  showFilters = true,
  maxHeight = '400px',
  className,
}: NotificationListProps) {
  const [filter, setFilter] = useState<FilterType>('all');

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

  const filteredNotifications = useMemo(() => {
    if (filter === 'all') return notifications;
    if (filter === 'unread') return notifications.filter((n) => !n.isRead);
    return notifications.filter((n) => n.type === filter);
  }, [notifications, filter]);

  const handleClick = (notification: NotificationData) => {
    if (!notification.isRead) {
      onMarkAsRead?.(notification.id);
    }
    onNotificationClick?.(notification);
  };

  return (
    <div className={cn('flex flex-col', className)} data-testid="notification-list">
      <div className="flex items-center justify-between gap-2 p-3 border-b">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">
            {locale === 'ar' ? 'الإشعارات' : 'Notifications'}
          </h3>
          <UnreadBadge count={unreadCount} />
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && onMarkAllAsRead && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onMarkAllAsRead}
              data-testid="button-mark-all-read"
            >
              <Check className="h-4 w-4 mr-1" />
              {locale === 'ar' ? 'قراءة الكل' : 'Mark all read'}
            </Button>
          )}
          {notifications.length > 0 && onClearAll && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearAll}
              data-testid="button-clear-all"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              {locale === 'ar' ? 'مسح الكل' : 'Clear all'}
            </Button>
          )}
        </div>
      </div>

      {showFilters && (
        <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterType)} className="w-full">
          <div className="border-b px-2">
            <TabsList className="h-9 bg-transparent p-0">
              <TabsTrigger value="all" className="text-xs px-3">
                {locale === 'ar' ? 'الكل' : 'All'}
              </TabsTrigger>
              <TabsTrigger value="unread" className="text-xs px-3">
                {locale === 'ar' ? 'غير مقروء' : 'Unread'}
                {unreadCount > 0 && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({unreadCount})
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="message" className="text-xs px-3">
                {locale === 'ar' ? 'رسائل' : 'Messages'}
              </TabsTrigger>
              <TabsTrigger value="alert" className="text-xs px-3">
                {locale === 'ar' ? 'تنبيهات' : 'Alerts'}
              </TabsTrigger>
            </TabsList>
          </div>
        </Tabs>
      )}

      <ScrollArea style={{ maxHeight }} className="flex-1">
        <div className="notification-list">
          {filteredNotifications.length === 0 ? (
            <NotificationEmptyState
              locale={locale}
              message={
                filter !== 'all'
                  ? locale === 'ar'
                    ? 'لا توجد إشعارات في هذا التصنيف'
                    : 'No notifications in this category'
                  : undefined
              }
            />
          ) : (
            filteredNotifications.map((notification) => (
              <NotificationListItem
                key={notification.id}
                notification={notification}
                locale={locale}
                onClick={() => handleClick(notification)}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export default NotificationList;
