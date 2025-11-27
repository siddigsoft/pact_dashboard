import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Notification } from '@/types';
import { Clock, AlertCircle, AlertTriangle, CheckCircle2, Info, ChevronRight } from 'lucide-react';

export interface NotificationGroupProps {
  title: string;
  icon: React.ReactNode;
  notifications: Notification[];
  onNotificationClick?: (notification: Notification) => void;
  actionButtons?: (notification: Notification) => React.ReactNode;
  variant?: 'urgent' | 'warning' | 'info';
}

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

export const NotificationGroup: React.FC<NotificationGroupProps> = ({
  title,
  icon,
  notifications,
  onNotificationClick,
  actionButtons,
  variant = 'info',
}) => {
  if (notifications.length === 0) return null;

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
        {notifications.map((notification) => (
          <Card
            key={notification.id}
            className={`border-l-4 bg-gradient-to-r ${getGradientClass(
              notification.type === 'error' ? 'urgent' :
              notification.type === 'warning' ? 'warning' : 'info'
            )} hover-elevate cursor-pointer transition-all duration-200 ${
              notification.isRead ? 'opacity-60' : ''
            }`}
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
        ))}
      </div>
    </div>
  );
};
