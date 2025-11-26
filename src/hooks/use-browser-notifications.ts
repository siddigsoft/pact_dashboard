import { useState, useEffect, useCallback } from 'react';
import { useSettings } from '@/context/settings/SettingsContext';

export type BrowserNotificationPermission = 'granted' | 'denied' | 'default' | 'unsupported';

interface BrowserNotificationOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  requireInteraction?: boolean;
  onClick?: () => void;
}

export function useBrowserNotifications() {
  const { notificationSettings } = useSettings();
  const [permission, setPermission] = useState<BrowserNotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setIsSupported(true);
      setPermission(Notification.permission as BrowserNotificationPermission);
    } else {
      setIsSupported(false);
      setPermission('unsupported');
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<BrowserNotificationPermission> => {
    if (!isSupported) {
      return 'unsupported';
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result as BrowserNotificationPermission);
      return result as BrowserNotificationPermission;
    } catch (error) {
      console.error('Failed to request notification permission:', error);
      return 'denied';
    }
  }, [isSupported]);

  const showNotification = useCallback((options: BrowserNotificationOptions): Notification | null => {
    if (!isSupported || permission !== 'granted') {
      console.warn('Browser notifications not available or not permitted');
      return null;
    }

    if (!notificationSettings.enabled || !notificationSettings.browserPush) {
      return null;
    }

    try {
      const notification = new Notification(options.title, {
        body: options.body,
        icon: options.icon || '/pact-icon.png',
        tag: options.tag,
        requireInteraction: options.requireInteraction || false,
      });

      if (options.onClick) {
        notification.onclick = () => {
          window.focus();
          options.onClick?.();
          notification.close();
        };
      }

      if (notificationSettings.sound) {
        try {
          const audio = new Audio('/notification.mp3');
          audio.volume = 0.5;
          audio.play().catch(() => {});
        } catch (e) {}
      }

      return notification;
    } catch (error) {
      console.error('Failed to show notification:', error);
      return null;
    }
  }, [isSupported, permission, notificationSettings]);

  const showCategoryNotification = useCallback((
    category: 'assignments' | 'approvals' | 'financial' | 'team' | 'system',
    options: BrowserNotificationOptions
  ): Notification | null => {
    if (!notificationSettings.categories[category]) {
      return null;
    }
    return showNotification(options);
  }, [showNotification, notificationSettings.categories]);

  return {
    isSupported,
    permission,
    requestPermission,
    showNotification,
    showCategoryNotification,
    isEnabled: notificationSettings.enabled && notificationSettings.browserPush && permission === 'granted',
  };
}
