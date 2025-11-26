import { useEffect, useRef } from 'react';
import { useNotifications } from '@/context/notifications/NotificationContext';
import { useSettings } from '@/context/settings/SettingsContext';
import { useNavigate } from 'react-router-dom';

const BrowserNotificationListener = () => {
  const { notifications } = useNotifications();
  const { notificationSettings } = useSettings();
  const navigate = useNavigate();
  const lastNotificationIdRef = useRef<string | null>(null);
  const shownNotificationsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!notificationSettings.enabled || !notificationSettings.browserPush) {
      return;
    }

    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    const newNotification = notifications[0];
    if (!newNotification) return;

    if (lastNotificationIdRef.current === newNotification.id) {
      return;
    }
    
    if (shownNotificationsRef.current.has(newNotification.id)) {
      return;
    }

    const createdAt = new Date(newNotification.createdAt).getTime();
    const now = Date.now();
    if (now - createdAt > 30000) {
      return;
    }

    const category = getCategoryFromType(
      newNotification.type, 
      newNotification.relatedEntityType,
      newNotification.title,
      newNotification.message
    );
    if (!notificationSettings.categories[category]) {
      return;
    }

    try {
      const notification = new Notification(newNotification.title, {
        body: newNotification.message,
        icon: '/pact-icon.png',
        tag: newNotification.id,
        requireInteraction: newNotification.type === 'error',
      });

      notification.onclick = () => {
        window.focus();
        if (newNotification.link) {
          navigate(newNotification.link);
        }
        notification.close();
      };

      if (notificationSettings.sound) {
        try {
          const audio = new Audio('/notification.mp3');
          audio.volume = 0.5;
          audio.play().catch(() => {});
        } catch (e) {}
      }

      lastNotificationIdRef.current = newNotification.id;
      shownNotificationsRef.current.add(newNotification.id);
      
      if (shownNotificationsRef.current.size > 100) {
        const arr = Array.from(shownNotificationsRef.current);
        shownNotificationsRef.current = new Set(arr.slice(-50));
      }
    } catch (error) {
      console.error('Failed to show browser notification:', error);
    }
  }, [notifications, notificationSettings, navigate]);

  return null;
};

function getCategoryFromType(
  type: string | undefined,
  relatedEntityType: string | undefined,
  title?: string,
  message?: string
): 'assignments' | 'approvals' | 'financial' | 'team' | 'system' {
  const titleLower = (title || '').toLowerCase();
  const messageLower = (message || '').toLowerCase();
  
  if (
    relatedEntityType === 'approval' ||
    titleLower.includes('approval') ||
    titleLower.includes('approved') ||
    titleLower.includes('rejected') ||
    titleLower.includes('pending review') ||
    messageLower.includes('awaiting approval') ||
    messageLower.includes('has been approved') ||
    messageLower.includes('has been rejected')
  ) {
    return 'approvals';
  }
  
  if (relatedEntityType === 'siteVisit' || relatedEntityType === 'mmpFile') {
    if (titleLower.includes('assign') || messageLower.includes('assign')) {
      return 'assignments';
    }
  }
  
  if (
    relatedEntityType === 'transaction' || 
    relatedEntityType === 'budget' ||
    relatedEntityType === 'downPayment' ||
    relatedEntityType === 'cost' ||
    titleLower.includes('payment') ||
    titleLower.includes('budget') ||
    titleLower.includes('cost') ||
    titleLower.includes('wallet')
  ) {
    return 'financial';
  }
  
  if (
    relatedEntityType === 'user' || 
    relatedEntityType === 'team' ||
    titleLower.includes('team') ||
    titleLower.includes('member') ||
    titleLower.includes('location')
  ) {
    return 'team';
  }
  
  return 'system';
}

export default BrowserNotificationListener;
