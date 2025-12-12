/**
 * Notification Bubble Component
 * WhatsApp/Telegram-style chat bubble for notifications
 */

import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatNotificationTime } from '@/utils/notifications/formatTimestamp';
import { NotificationData, NotificationPriority } from '@/theme/notifications-theme';
import { Check, CheckCheck } from 'lucide-react';

interface NotificationBubbleProps {
  notification: NotificationData;
  variant?: 'own' | 'other';
  showAvatar?: boolean;
  showTail?: boolean;
  locale?: 'en' | 'ar';
  onClick?: () => void;
  className?: string;
}

export function NotificationBubble({
  notification,
  variant = 'other',
  showAvatar = true,
  showTail = true,
  locale = 'en',
  onClick,
  className,
}: NotificationBubbleProps) {
  const isOwn = variant === 'own';
  
  return (
    <div
      className={cn(
        'flex gap-2',
        isOwn ? 'flex-row-reverse' : 'flex-row',
        className
      )}
      onClick={onClick}
      data-testid={`notification-bubble-${notification.id}`}
    >
      {showAvatar && (
        <Avatar className="h-8 w-8 flex-shrink-0">
          {notification.avatarUrl && (
            <AvatarImage src={notification.avatarUrl} alt={notification.title} />
          )}
          <AvatarFallback className="text-xs">
            {notification.avatarInitials || notification.title.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      )}
      
      <div
        className={cn(
          'notification-bubble',
          isOwn ? 'notification-bubble--own' : 'notification-bubble--other',
          !showTail && 'rounded-br-[1rem] rounded-bl-[1rem]',
          onClick && 'cursor-pointer hover-elevate'
        )}
      >
        <div className="flex items-start justify-between gap-2 mb-1">
          <span className="notification-title text-sm font-semibold">
            {notification.title}
          </span>
          <PriorityIndicator priority={notification.priority} />
        </div>
        
        <p className="text-sm text-foreground/80 whitespace-pre-wrap">
          {notification.body}
        </p>
        
        <div className="flex items-center justify-end gap-1.5 mt-2">
          <span className="notification-timestamp">
            {formatNotificationTime(notification.timestamp, locale)}
          </span>
          <ReadIndicator isRead={notification.isRead} />
        </div>
      </div>
    </div>
  );
}

interface PriorityIndicatorProps {
  priority: NotificationPriority;
}

export function PriorityIndicator({ priority }: PriorityIndicatorProps) {
  if (priority === 'low') return null;
  
  return (
    <span
      className={cn(
        'notification-priority',
        priority === 'high' && 'notification-priority--high',
        priority === 'medium' && 'notification-priority--medium'
      )}
      data-testid={`priority-indicator-${priority}`}
    />
  );
}

interface ReadIndicatorProps {
  isRead: boolean;
  className?: string;
}

export function ReadIndicator({ isRead, className }: ReadIndicatorProps) {
  return (
    <span
      className={cn(
        'notification-read-indicator',
        isRead ? 'notification-read-indicator--read' : 'notification-read-indicator--unread',
        className
      )}
      data-testid={`read-indicator-${isRead ? 'read' : 'unread'}`}
    >
      {isRead ? (
        <CheckCheck className="h-3.5 w-3.5" />
      ) : (
        <Check className="h-3.5 w-3.5" />
      )}
    </span>
  );
}

interface UnreadBadgeProps {
  count: number;
  className?: string;
}

export function UnreadBadge({ count, className }: UnreadBadgeProps) {
  if (count <= 0) return null;
  
  const displayCount = count > 99 ? '99+' : count.toString();
  
  return (
    <span
      className={cn('notification-unread-badge', className)}
      data-testid="unread-badge"
    >
      {displayCount}
    </span>
  );
}

export default NotificationBubble;
