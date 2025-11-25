
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Notification } from '@/types';

export interface NotificationGroupProps {
  title: string;
  icon: React.ReactNode;
  notifications: Notification[];
  onNotificationClick?: (notification: Notification) => void;
  actionButtons?: (notification: Notification) => React.ReactNode;
}

export const NotificationGroup: React.FC<NotificationGroupProps> = ({
  title,
  icon,
  notifications,
  onNotificationClick,
  actionButtons,
}) => {
  if (notifications.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-1 px-2 mb-1">
        {icon}
        <span className="text-xs font-medium">{title}</span>
        <span className="text-xs text-muted-foreground ml-1">({notifications.length})</span>
      </div>
      
      <div className="space-y-2">
        {notifications.map((notification) => (
          <Card
            key={notification.id}
            className={`border-l-2 ${
              notification.type === 'error' ? 'border-l-destructive' :
              notification.type === 'warning' ? 'border-l-amber-500' :
              notification.type === 'success' ? 'border-l-green-500' :
              'border-l-blue-500'
            } ${notification.isRead ? 'opacity-70' : ''}`}
          >
            <CardContent className="p-3">
              <div className="flex justify-between items-start">
                <h4 className="text-sm font-medium">{notification.title}</h4>
                <span className="text-xs text-muted-foreground">
                  {new Date(notification.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-xs mt-1 text-muted-foreground">{notification.message}</p>
              
              {actionButtons && (
                <div className="flex gap-2 mt-2">
                  {actionButtons(notification)}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
