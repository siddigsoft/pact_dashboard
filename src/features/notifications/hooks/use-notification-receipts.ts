import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ensureValidSession } from '@/lib/session-health';
import { useNotifications } from '@/features/notifications/context/NotificationContext';
import type { Notification } from '@/types';

interface AcknowledgmentRecord {
  notificationId: string;
  acknowledgedAt: string;
  userId: string;
}

export function useNotificationReceipts() {
  const { notifications, markNotificationAsRead } = useNotifications();
  const reminderTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const acknowledgedRef = useRef<Set<string>>(new Set());

  const getUrgentUnacknowledged = useCallback(() => {
    return notifications.filter(n => 
      !n.isRead && 
      (n.priority === 'urgent' || n.priority === 'high' || n.type === 'error') &&
      !acknowledgedRef.current.has(n.id)
    );
  }, [notifications]);

  const acknowledgeNotification = useCallback(async (notificationId: string) => {
    acknowledgedRef.current.add(notificationId);
    markNotificationAsRead(notificationId);
    
    const timer = reminderTimersRef.current.get(notificationId);
    if (timer) {
      clearTimeout(timer);
      reminderTimersRef.current.delete(notificationId);
    }

    const session = await ensureValidSession();
    if (!session.success) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return;

      await supabase.from('notifications').update({
        is_read: true,
        updated_at: new Date().toISOString()
      }).eq('id', notificationId).eq('user_id', user.id);
    } catch (error) {
      console.error('Failed to record acknowledgment:', error);
    }
  }, [markNotificationAsRead]);

  const setupReminders = useCallback(() => {
    const urgentUnacked = getUrgentUnacknowledged();
    
    urgentUnacked.forEach(notification => {
      if (reminderTimersRef.current.has(notification.id)) return;
      
      const createdAt = new Date(notification.createdAt).getTime();
      const now = Date.now();
      const ageMinutes = (now - createdAt) / (1000 * 60);
      
      const reminderIntervalMs = notification.priority === 'urgent' 
        ? 15 * 60 * 1000
        : 30 * 60 * 1000;
      
      if (ageMinutes < 120) {
        const timer = setTimeout(() => {
          if (!acknowledgedRef.current.has(notification.id)) {
            if ('Notification' in window && Notification.permission === 'granted') {
              new window.Notification('Reminder: ' + notification.title, {
                body: notification.message,
                tag: 'reminder-' + notification.id,
                requireInteraction: true
              });
            }
          }
          reminderTimersRef.current.delete(notification.id);
        }, reminderIntervalMs);
        
        reminderTimersRef.current.set(notification.id, timer);
      }
    });
  }, [getUrgentUnacknowledged]);

  useEffect(() => {
    setupReminders();
    
    return () => {
      reminderTimersRef.current.forEach(timer => clearTimeout(timer));
      reminderTimersRef.current.clear();
    };
  }, [setupReminders]);

  return {
    acknowledgeNotification,
    getUrgentUnacknowledged,
    acknowledgedCount: acknowledgedRef.current.size
  };
}

export default useNotificationReceipts;
