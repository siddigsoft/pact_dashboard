/**
 * Notification List Item Component
 * Individual notification item for list views
 */

import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatNotificationTime } from '@/utils/notifications/formatTimestamp';
import { NotificationData, getTypeIcon } from '@/theme/notifications-theme';
import { PriorityIndicator, UnreadBadge } from './NotificationBubble';
import { 
  Bell, 
  MessageSquare, 
  AlertTriangle, 
  CheckCircle, 
  AlertCircle, 
  XCircle, 
  Info, 
  Settings, 
  ClipboardList, 
  ThumbsUp, 
  AtSign,
  LucideIcon 
} from 'lucide-react';

const iconMap: Record<string, LucideIcon> = {
  MessageSquare,
  AlertTriangle,
  CheckCircle,
  AlertCircle,
  XCircle,
  Info,
  Settings,
  ClipboardList,
  ThumbsUp,
  AtSign,
  Bell,
};

interface NotificationListItemProps {
  notification: NotificationData;
  locale?: 'en' | 'ar';
  onClick?: () => void;
  onMarkAsRead?: () => void;
  onDismiss?: () => void;
  showIcon?: boolean;
  className?: string;
}

export function NotificationListItem({
  notification,
  locale = 'en',
  onClick,
  showIcon = true,
  className,
}: NotificationListItemProps) {
  const iconName = getTypeIcon(notification.type);
  const IconComponent = iconMap[iconName] || Bell;
  
  return (
    <div
      className={cn(
        'notification-list-item',
        !notification.isRead && 'notification-list-item--unread',
        onClick && 'cursor-pointer',
        className
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      data-testid={`notification-item-${notification.id}`}
    >
      <div className="relative flex-shrink-0">
        {notification.avatarUrl ? (
          <Avatar className="h-10 w-10">
            <AvatarImage src={notification.avatarUrl} alt={notification.title} />
            <AvatarFallback>
              {notification.avatarInitials || notification.title.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        ) : showIcon ? (
          <div className="notification-avatar">
            <IconComponent className="h-5 w-5" />
          </div>
        ) : (
          <Avatar className="h-10 w-10">
            <AvatarFallback>
              {notification.avatarInitials || notification.title.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        )}
        
        {!notification.isRead && (
          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[hsl(var(--notification-unread))]" />
        )}
      </div>
      
      <div className="notification-content">
        <div className="notification-header">
          <div className="flex items-center gap-2 min-w-0">
            <span className="notification-title truncate">
              {notification.title}
            </span>
            <PriorityIndicator priority={notification.priority} />
          </div>
          <span className="notification-timestamp flex-shrink-0">
            {formatNotificationTime(notification.timestamp, locale)}
          </span>
        </div>
        
        <p className="notification-body">
          {notification.body}
        </p>
      </div>
    </div>
  );
}

interface NotificationEmptyStateProps {
  message?: string;
  locale?: 'en' | 'ar';
}

export function NotificationEmptyState({ 
  message, 
  locale = 'en' 
}: NotificationEmptyStateProps) {
  const defaultMessage = locale === 'ar' 
    ? 'لا توجد إشعارات' 
    : 'No notifications';
  
  return (
    <div className="notification-empty" data-testid="notification-empty">
      <LucideIcons.Bell className="notification-empty-icon" />
      <p className="text-sm">{message || defaultMessage}</p>
    </div>
  );
}

export default NotificationListItem;
