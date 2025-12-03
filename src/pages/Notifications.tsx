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
    <div className="max-w-2xl mx-auto py-4 sm:py-6 px-3 md:px-0 min-h-screen">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-blue-600" />
          <h1 className="text-xl font-semibold">Notifications</h1>
          {unreadCount > 0 && (
            <Badge variant="destructive" className="ml-1">{unreadCount} new</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={markAllAsRead} disabled={unreadCount === 0} className="min-h-[36px]">
            <CheckCheck className="h-4 w-4 mr-1" /> Mark all read
          </Button>
          <Button variant="destructive" size="sm" onClick={handleClearAll} className="min-h-[36px]">
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
        <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto pb-4">
          {notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => handleOpen(n.id, n.link)}
              className={`w-full text-left`}
            >
              <Card className={`${n.isRead ? '' : 'border-blue-400'} hover:bg-blue-50/40 transition-colors`}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium flex items-center gap-2 mb-1">
                        {n.title}
                        {n.link && <LinkIcon className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />}
                        {!n.isRead && <Badge className="ml-1 flex-shrink-0" variant="secondary">new</Badge>}
                      </div>
                      {n.message && (
                        <div className="text-sm text-muted-foreground line-clamp-2">
                          {n.message}
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
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
