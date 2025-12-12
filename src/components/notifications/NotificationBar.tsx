import { useState } from 'react';
import { Bell, Check, CheckCheck, Trash2, X, AlertTriangle, Clock, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useNotifications } from '@/context/NotificationContext';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

export function NotificationBar() {
  const {
    persistentNotifications,
    unreadCount,
    urgentCount,
    isPersistentLoading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    getNotificationsByPriority,
    getUnreadNotifications
  } = useNotifications();

  const [isOpen, setIsOpen] = useState(false);

  const urgentNotifications = getNotificationsByPriority('urgent');
  const highNotifications = getNotificationsByPriority('high');
  const normalNotifications = getNotificationsByPriority('normal');
  const unreadNotifications = getUnreadNotifications();

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500 text-white';
      case 'high': return 'bg-amber-500 text-white';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'urgent': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'high': return <Clock className="h-4 w-4 text-amber-500" />;
      default: return <Mail className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const handleNotificationClick = async (notification: any) => {
    if (notification.status !== 'read') {
      await markAsRead(notification.id);
    }
    if (notification.action_url) {
      window.location.href = notification.action_url;
      setIsOpen(false);
    }
  };

  const NotificationItem = ({ notification }: { notification: any }) => (
    <div
      className={cn(
        "p-3 border-b last:border-b-0 hover-elevate cursor-pointer transition-colors",
        notification.status !== 'read' && "bg-muted/50"
      )}
      onClick={() => handleNotificationClick(notification)}
      data-testid={`notification-item-${notification.id}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-1">
          {getPriorityIcon(notification.priority)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm truncate">{notification.title_en}</span>
            <Badge variant="outline" className={cn("text-xs px-1.5 py-0", getPriorityColor(notification.priority))}>
              {notification.priority}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2 mb-1">
            {notification.message_en}
          </p>
          {notification.title_ar && (
            <p className="text-xs text-muted-foreground/70 line-clamp-1 mb-1" dir="rtl">
              {notification.title_ar}
            </p>
          )}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}</span>
            {notification.triggered_by_name && (
              <span>by {notification.triggered_by_name}</span>
            )}
            {notification.email_sent && (
              <Mail className="h-3 w-3" />
            )}
          </div>
        </div>
        <div className="flex-shrink-0 flex flex-col gap-1">
          {notification.status !== 'read' && (
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                markAsRead(notification.id);
              }}
              data-testid={`button-mark-read-${notification.id}`}
            >
              <Check className="h-3 w-3" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              deleteNotification(notification.id);
            }}
            data-testid={`button-delete-notification-${notification.id}`}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );

  const EmptyState = ({ message }: { message: string }) => (
    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
      <Bell className="h-8 w-8 mb-2 opacity-50" />
      <p className="text-sm">{message}</p>
    </div>
  );

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          data-testid="button-notification-bar"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className={cn(
              "absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white",
              urgentCount > 0 ? "bg-red-500 animate-pulse" : "bg-primary"
            )}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between p-3 border-b">
          <h3 className="font-semibold">Notifications</h3>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => markAllAsRead()}
                data-testid="button-mark-all-read"
              >
                <CheckCheck className="h-4 w-4 mr-1" />
                Mark all read
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Tabs defaultValue="all" className="w-full">
          <TabsList className="w-full justify-start rounded-none border-b px-3">
            <TabsTrigger value="all" className="text-xs">
              All ({persistentNotifications.length})
            </TabsTrigger>
            <TabsTrigger value="unread" className="text-xs">
              Unread ({unreadCount})
            </TabsTrigger>
            <TabsTrigger value="urgent" className="text-xs">
              <AlertTriangle className="h-3 w-3 mr-1 text-red-500" />
              Urgent ({urgentNotifications.length})
            </TabsTrigger>
            <TabsTrigger value="high" className="text-xs">
              <Clock className="h-3 w-3 mr-1 text-amber-500" />
              High ({highNotifications.length})
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="h-80">
            <TabsContent value="all" className="m-0">
              {isPersistentLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
                </div>
              ) : persistentNotifications.length === 0 ? (
                <EmptyState message="No notifications yet" />
              ) : (
                persistentNotifications.map(n => (
                  <NotificationItem key={n.id} notification={n} />
                ))
              )}
            </TabsContent>

            <TabsContent value="unread" className="m-0">
              {unreadNotifications.length === 0 ? (
                <EmptyState message="All caught up!" />
              ) : (
                unreadNotifications.map(n => (
                  <NotificationItem key={n.id} notification={n} />
                ))
              )}
            </TabsContent>

            <TabsContent value="urgent" className="m-0">
              {urgentNotifications.length === 0 ? (
                <EmptyState message="No urgent notifications" />
              ) : (
                urgentNotifications.map(n => (
                  <NotificationItem key={n.id} notification={n} />
                ))
              )}
            </TabsContent>

            <TabsContent value="high" className="m-0">
              {highNotifications.length === 0 ? (
                <EmptyState message="No high priority notifications" />
              ) : (
                highNotifications.map(n => (
                  <NotificationItem key={n.id} notification={n} />
                ))
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
