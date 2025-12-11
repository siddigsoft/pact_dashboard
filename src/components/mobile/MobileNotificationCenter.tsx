import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bell, 
  BellOff, 
  Check, 
  CheckCheck, 
  X, 
  Trash2, 
  Settings,
  MessageSquare,
  AlertCircle,
  Info,
  CheckCircle2,
  Calendar,
  MapPin,
  Wallet,
  Users,
  FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';
import { formatDistanceToNow } from 'date-fns';

type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'message' | 'calendar' | 'location' | 'wallet' | 'team' | 'document';

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  actionUrl?: string;
  actionLabel?: string;
  imageUrl?: string;
  sender?: {
    name: string;
    avatar?: string;
  };
}

interface MobileNotificationCenterProps {
  notifications: Notification[];
  onNotificationPress?: (notification: Notification) => void;
  onMarkAsRead?: (id: string) => void;
  onMarkAllAsRead?: () => void;
  onDelete?: (id: string) => void;
  onClearAll?: () => void;
  onSettingsPress?: () => void;
  className?: string;
}

export function MobileNotificationCenter({
  notifications,
  onNotificationPress,
  onMarkAsRead,
  onMarkAllAsRead,
  onDelete,
  onClearAll,
  onSettingsPress,
  className,
}: MobileNotificationCenterProps) {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  
  const unreadCount = notifications.filter(n => !n.read).length;
  const filteredNotifications = filter === 'unread' 
    ? notifications.filter(n => !n.read)
    : notifications;

  const groupedNotifications = groupNotificationsByDate(filteredNotifications);

  return (
    <div className={cn("flex flex-col h-full bg-background", className)} data-testid="notification-center">
      <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-black/10 dark:border-white/10">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Bell className="h-6 w-6 text-black dark:text-white" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-black dark:bg-white text-white dark:text-black text-[10px] font-bold flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </div>
          <h1 className="text-lg font-semibold text-black dark:text-white">Notifications</h1>
        </div>

        <div className="flex items-center gap-2">
          {onMarkAllAsRead && unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                hapticPresets.buttonPress();
                onMarkAllAsRead();
              }}
              className="text-xs"
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="h-4 w-4 mr-1" />
              Mark all read
            </Button>
          )}

          {onSettingsPress && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                hapticPresets.buttonPress();
                onSettingsPress();
              }}
              data-testid="button-notification-settings"
            >
              <Settings className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 px-4 py-2 border-b border-black/5 dark:border-white/5">
        {(['all', 'unread'] as const).map((f) => (
          <button
            key={f}
            onClick={() => {
              hapticPresets.selection();
              setFilter(f);
            }}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
              filter === f
                ? "bg-black dark:bg-white text-white dark:text-black"
                : "bg-black/5 dark:bg-white/5 text-black/60 dark:text-white/60"
            )}
            data-testid={`button-filter-${f}`}
          >
            {f === 'all' ? 'All' : `Unread (${unreadCount})`}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <BellOff className="h-12 w-12 text-black/20 dark:text-white/20 mb-4" />
            <p className="text-sm font-medium text-black/60 dark:text-white/60">
              {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            </p>
          </div>
        ) : (
          Object.entries(groupedNotifications).map(([date, dateNotifications]) => (
            <div key={date}>
              <div className="sticky top-0 px-4 py-2 bg-background/95 backdrop-blur-sm z-10">
                <span className="text-xs font-medium text-black/40 dark:text-white/40 uppercase">
                  {date}
                </span>
              </div>

              <div className="divide-y divide-black/5 dark:divide-white/5">
                {dateNotifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onPress={() => {
                      hapticPresets.buttonPress();
                      if (!notification.read) {
                        onMarkAsRead?.(notification.id);
                      }
                      onNotificationPress?.(notification);
                    }}
                    onDelete={() => {
                      hapticPresets.warning();
                      onDelete?.(notification.id);
                    }}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {onClearAll && filteredNotifications.length > 0 && (
        <div className="p-4 border-t border-black/10 dark:border-white/10">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              hapticPresets.warning();
              onClearAll();
            }}
            className="w-full rounded-full"
            data-testid="button-clear-all"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear All
          </Button>
        </div>
      )}
    </div>
  );
}

interface NotificationItemProps {
  notification: Notification;
  onPress: () => void;
  onDelete?: () => void;
}

function NotificationItem({ notification, onPress, onDelete }: NotificationItemProps) {
  const [showDelete, setShowDelete] = useState(false);

  const getIcon = () => {
    const iconClass = "h-5 w-5";
    switch (notification.type) {
      case 'success':
        return <CheckCircle2 className={cn(iconClass, "text-black dark:text-white")} />;
      case 'warning':
        return <AlertCircle className={cn(iconClass, "text-black dark:text-white")} />;
      case 'error':
        return <AlertCircle className={cn(iconClass, "text-destructive")} />;
      case 'message':
        return <MessageSquare className={cn(iconClass, "text-black dark:text-white")} />;
      case 'calendar':
        return <Calendar className={cn(iconClass, "text-black dark:text-white")} />;
      case 'location':
        return <MapPin className={cn(iconClass, "text-black dark:text-white")} />;
      case 'wallet':
        return <Wallet className={cn(iconClass, "text-black dark:text-white")} />;
      case 'team':
        return <Users className={cn(iconClass, "text-black dark:text-white")} />;
      case 'document':
        return <FileText className={cn(iconClass, "text-black dark:text-white")} />;
      default:
        return <Info className={cn(iconClass, "text-black dark:text-white")} />;
    }
  };

  return (
    <motion.div
      className={cn(
        "relative overflow-hidden",
        !notification.read && "bg-black/[0.02] dark:bg-white/[0.02]"
      )}
      data-testid={`notification-${notification.id}`}
    >
      <motion.button
        className="w-full flex items-start gap-3 p-4 text-left touch-manipulation"
        onClick={onPress}
        drag={onDelete ? "x" : false}
        dragConstraints={{ left: -80, right: 0 }}
        onDragEnd={(_, info) => {
          if (info.offset.x < -60) {
            setShowDelete(true);
          }
        }}
      >
        {!notification.read && (
          <div className="absolute left-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-black dark:bg-white" />
        )}

        <div className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
          notification.sender?.avatar ? "" : "bg-black/5 dark:bg-white/5"
        )}>
          {notification.sender?.avatar ? (
            <img 
              src={notification.sender.avatar} 
              alt="" 
              className="w-full h-full rounded-full object-cover"
            />
          ) : notification.imageUrl ? (
            <img 
              src={notification.imageUrl} 
              alt="" 
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            getIcon()
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={cn(
              "text-sm",
              notification.read 
                ? "text-black/80 dark:text-white/80" 
                : "text-black dark:text-white font-medium"
            )}>
              {notification.title}
            </p>
            <span className="text-xs text-black/40 dark:text-white/40 flex-shrink-0">
              {formatDistanceToNow(notification.timestamp, { addSuffix: true })}
            </span>
          </div>

          <p className="text-sm text-black/60 dark:text-white/60 mt-0.5 line-clamp-2">
            {notification.message}
          </p>

          {notification.actionLabel && (
            <span className="inline-block mt-2 text-xs font-medium text-black dark:text-white underline underline-offset-2">
              {notification.actionLabel}
            </span>
          )}
        </div>
      </motion.button>

      <AnimatePresence>
        {showDelete && onDelete && (
          <motion.button
            initial={{ x: 80 }}
            animate={{ x: 0 }}
            exit={{ x: 80 }}
            className="absolute right-0 top-0 bottom-0 w-20 bg-destructive flex items-center justify-center"
            onClick={() => {
              setShowDelete(false);
              onDelete();
            }}
            data-testid="button-delete-notification"
          >
            <Trash2 className="h-5 w-5 text-white" />
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function groupNotificationsByDate(notifications: Notification[]): Record<string, Notification[]> {
  const groups: Record<string, Notification[]> = {};
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  notifications.forEach(notification => {
    const date = new Date(notification.timestamp);
    let dateKey: string;

    if (date.toDateString() === today.toDateString()) {
      dateKey = 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      dateKey = 'Yesterday';
    } else {
      dateKey = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    }

    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(notification);
  });

  return groups;
}

interface NotificationBadgeProps {
  count: number;
  className?: string;
}

export function NotificationBadge({ count, className }: NotificationBadgeProps) {
  if (count === 0) return null;

  return (
    <span 
      className={cn(
        "min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center",
        className
      )}
      data-testid="notification-badge"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

interface NotificationToastProps {
  notification: Notification;
  onPress?: () => void;
  onDismiss?: () => void;
  duration?: number;
}

export function NotificationToast({
  notification,
  onPress,
  onDismiss,
  duration = 5000,
}: NotificationToastProps) {
  const [isVisible, setIsVisible] = useState(true);

  useCallback(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(() => onDismiss?.(), 200);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [duration, onDismiss]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -50, scale: 0.95 }}
          className="fixed top-4 left-4 right-4 z-50"
          data-testid="notification-toast"
        >
          <button
            className="w-full bg-white dark:bg-neutral-900 rounded-2xl shadow-xl p-4 flex items-start gap-3 text-left"
            onClick={() => {
              hapticPresets.buttonPress();
              onPress?.();
              setIsVisible(false);
            }}
          >
            <div className="w-10 h-10 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center flex-shrink-0">
              <Bell className="h-5 w-5 text-black dark:text-white" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-black dark:text-white">
                {notification.title}
              </p>
              <p className="text-sm text-black/60 dark:text-white/60 line-clamp-2">
                {notification.message}
              </p>
            </div>

            <button
              className="p-1"
              onClick={(e) => {
                e.stopPropagation();
                hapticPresets.buttonPress();
                setIsVisible(false);
                onDismiss?.();
              }}
              data-testid="button-dismiss-toast"
            >
              <X className="h-4 w-4 text-black/40 dark:text-white/40" />
            </button>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
