import { useEffect } from 'react';
import { useNotifications } from '@/context/notifications/NotificationContext';

export function useNotificationBadge() {
  const { getUnreadNotificationsCount } = useNotifications();
  const unreadCount = getUnreadNotificationsCount();
  const originalTitle = 'PACT Command Center';

  useEffect(() => {
    if (unreadCount > 0) {
      document.title = `(${unreadCount > 99 ? '99+' : unreadCount}) ${originalTitle}`;
    } else {
      document.title = originalTitle;
    }

    return () => {
      document.title = originalTitle;
    };
  }, [unreadCount]);

  useEffect(() => {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const handleVisibilityChange = () => {
      if (document.hidden && unreadCount > 0) {
        try {
          if (navigator.setAppBadge) {
            navigator.setAppBadge(unreadCount);
          }
        } catch {}
      } else {
        try {
          if (navigator.clearAppBadge) {
            navigator.clearAppBadge();
          }
        } catch {}
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    handleVisibilityChange();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      try { if (navigator.clearAppBadge) navigator.clearAppBadge(); } catch {}
    };
  }, [unreadCount]);

  return { unreadCount };
}
