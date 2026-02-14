import { useState, useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Notification } from '@/types';
import { Clock, AlertCircle, AlertTriangle, CheckCircle2, Info, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';

export interface GroupedNotification extends Notification {
  groupCount?: number;
  groupedIds?: string[];
}

export interface NotificationGroupProps {
  title: string;
  icon: React.ReactNode;
  notifications: Notification[];
  onNotificationClick?: (notification: Notification) => void;
  actionButtons?: (notification: Notification) => React.ReactNode;
  variant?: 'urgent' | 'warning' | 'info';
}

const ONE_HOUR_MS = 60 * 60 * 1000;

const groupNotifications = (notifications: Notification[]): GroupedNotification[] => {
  if (notifications.length === 0) return [];

  const sorted = [...notifications].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const grouped: GroupedNotification[] = [];
  const used = new Set<string>();

  for (let i = 0; i < sorted.length; i++) {
    if (used.has(sorted[i].id)) continue;

    const current = sorted[i];
    const similarIds: string[] = [current.id];

    if (current.relatedEntityType) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (used.has(sorted[j].id)) continue;
        const other = sorted[j];

        if (
          other.relatedEntityType === current.relatedEntityType &&
          Math.abs(
            new Date(current.createdAt).getTime() - new Date(other.createdAt).getTime()
          ) <= ONE_HOUR_MS
        ) {
          similarIds.push(other.id);
          used.add(other.id);
        }
      }
    }

    used.add(current.id);

    if (similarIds.length > 1) {
      grouped.push({
        ...current,
        groupCount: similarIds.length,
        groupedIds: similarIds,
      });
    } else {
      grouped.push({ ...current });
    }
  }

  return grouped;
};

const getNotificationIcon = (type: string) => {
  switch (type) {
    case 'error':
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    case 'warning':
      return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    case 'success':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    default:
      return <Info className="h-4 w-4 text-blue-500" />;
  }
};

const getGradientClass = (variant?: string) => {
  switch (variant) {
    case 'urgent':
      return 'from-red-500/10 to-red-600/5 border-l-red-500';
    case 'warning':
      return 'from-amber-500/10 to-amber-600/5 border-l-amber-500';
    case 'info':
    default:
      return 'from-blue-500/10 to-blue-600/5 border-l-blue-500';
  }
};

const NotificationCard = ({
  notification,
  onNotificationClick,
  actionButtons,
  isGroupChild,
}: {
  notification: Notification;
  onNotificationClick?: (notification: Notification) => void;
  actionButtons?: (notification: Notification) => React.ReactNode;
  isGroupChild?: boolean;
}) => (
  <Card
    className={`border-l-4 bg-gradient-to-r ${getGradientClass(
      notification.type === 'error' ? 'urgent' :
      notification.type === 'warning' ? 'warning' : 'info'
    )} hover-elevate cursor-pointer transition-all duration-200 ${
      notification.isRead ? 'opacity-60' : ''
    } ${isGroupChild ? 'ml-4 border-l-2' : ''}`}
    onClick={() => onNotificationClick?.(notification)}
    data-testid={`notification-card-${notification.id}`}
  >
    <CardContent className="p-3">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {getNotificationIcon(notification.type)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4 className={`text-sm font-medium leading-tight ${
              notification.isRead ? 'text-muted-foreground' : 'text-foreground'
            }`}>
              {notification.title}
            </h4>
            {!notification.isRead && (
              <span className="flex-shrink-0 w-2 h-2 rounded-full bg-primary animate-pulse" />
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {notification.message}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
            </div>
            {notification.link && (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
          </div>
          
          {actionButtons && (
            <div className="flex gap-2 mt-2 pt-2 border-t border-border/50">
              {actionButtons(notification)}
            </div>
          )}
        </div>
      </div>
    </CardContent>
  </Card>
);

export const NotificationGroup: React.FC<NotificationGroupProps> = ({
  title,
  icon,
  notifications,
  onNotificationClick,
  actionButtons,
  variant = 'info',
}) => {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const groupedNotifications = useMemo(
    () => groupNotifications(notifications),
    [notifications]
  );

  if (notifications.length === 0) return null;

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getChildNotifications = (grouped: GroupedNotification): Notification[] => {
    if (!grouped.groupedIds) return [];
    return notifications.filter(
      (n) => grouped.groupedIds!.includes(n.id) && n.id !== grouped.id
    );
  };

  return (
    <div className="space-y-2" data-testid={`notification-group-${title.toLowerCase()}`}>
      <div className="flex items-center gap-2 px-1">
        <div className={`p-1.5 rounded-md ${
          variant === 'urgent' ? 'bg-red-100 dark:bg-red-900/30' :
          variant === 'warning' ? 'bg-amber-100 dark:bg-amber-900/30' :
          'bg-blue-100 dark:bg-blue-900/30'
        }`}>
          {icon}
        </div>
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <Badge 
          variant="secondary" 
          className={`text-xs ${
            variant === 'urgent' ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' :
            variant === 'warning' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300' :
            'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
          }`}
        >
          {notifications.length}
        </Badge>
      </div>
      
      <div className="space-y-2">
        {groupedNotifications.map((grouped) => {
          const isExpanded = expandedGroups.has(grouped.id);
          const hasGroup = (grouped.groupCount ?? 0) > 1;

          return (
            <div key={grouped.id} className="space-y-1">
              <div className="relative">
                <NotificationCard
                  notification={grouped}
                  onNotificationClick={onNotificationClick}
                  actionButtons={actionButtons}
                />
                {hasGroup && (
                  <div className="flex items-center gap-1 mt-1 ml-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleGroup(grouped.id);
                      }}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded"
                      data-testid={`button-toggle-group-${grouped.id}`}
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {grouped.groupCount} similar notifications
                      </Badge>
                    </button>
                  </div>
                )}
              </div>

              {hasGroup && isExpanded && (
                <div className="space-y-1 animate-in slide-in-from-top-1 duration-200">
                  {getChildNotifications(grouped).map((child) => (
                    <NotificationCard
                      key={child.id}
                      notification={child}
                      onNotificationClick={onNotificationClick}
                      actionButtons={actionButtons}
                      isGroupChild
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
