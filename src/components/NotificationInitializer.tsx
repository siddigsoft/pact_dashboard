import { useEffect } from 'react';
import { useServiceWorker } from '@/hooks/use-service-worker';
import { useNotificationCleanup } from '@/hooks/use-notification-cleanup';
import { useBrowserNotifications } from '@/hooks/use-browser-notifications';

export function NotificationInitializer() {
  const { isSupported, isRegistered, error } = useServiceWorker();
  const { cleanupOldNotifications } = useNotificationCleanup();
  const { permission, requestPermission, isEnabled } = useBrowserNotifications();

  useEffect(() => {
    if (isSupported && isRegistered) {
      console.log('Service Worker registered successfully');
    }
    if (error) {
      console.warn('Service Worker error:', error);
    }
  }, [isSupported, isRegistered, error]);

  useEffect(() => {
    if (permission === 'default' && isEnabled) {
      console.log('Browser notifications supported, permission not yet requested');
    }
  }, [permission, isEnabled]);

  return null;
}

export default NotificationInitializer;
