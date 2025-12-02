import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '@/context/notifications/NotificationContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bell, CheckCheck, Trash2, Link as LinkIcon } from 'lucide-react';

const formatDate = (iso?: string) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
};

const Notifications: React.FC = () => {
  const navigate = useNavigate();
  const { notifications, markNotificationAsRead, clearAllNotifications } = useNotifications();

  const unreadCount = useMemo(() => notifications.filter(n => !n.isRead).length, [notifications]);

  const handleOpen = async (id: string, link?: string) => {
    await markNotificationAsRead(id);
    if (link) navigate(link);
  };

  const markAllAsRead = async () => {
    const unread = notifications.filter(n => !n.isRead);
    for (const n of unread) {
      // fire-and-forget per item
      markNotificationAsRead(n.id);
    }
  };

  const handleClearAll = async () => {
    try {
      await clearAllNotifications();
    } catch (e) {
      console.warn('Failed to clear notifications', e);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-6 px-3 md:px-0">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-blue-600" />
          <h1 className="text-xl font-semibold">Notifications</h1>
          {unreadCount > 0 && (
            <Badge variant="destructive" className="ml-1">{unreadCount} new</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={markAllAsRead} disabled={unreadCount === 0}>
            <CheckCheck className="h-4 w-4 mr-1" /> Mark all read
          </Button>
          <Button variant="destructive" size="sm" onClick={handleClearAll}>
            <Trash2 className="h-4 w-4 mr-1" /> Clear all
          </Button>
        </div>
      </div>

      {notifications.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No notifications yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => handleOpen(n.id, n.link)}
              className={`w-full text-left`}
            >
              <Card className={`${n.isRead ? '' : 'border-blue-400'} hover:bg-blue-50/40 transition-colors`}>
                <CardContent className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {n.title}
                        {n.link && <LinkIcon className="h-3.5 w-3.5 text-blue-500" />}
                        {!n.isRead && <Badge className="ml-1" variant="secondary">new</Badge>}
                      </div>
                      {n.message && (
                        <div className="text-sm text-muted-foreground mt-0.5">
                          {n.message}
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(n.createdAt)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default Notifications;
