import { useEffect, useCallback } from 'react';
import { useServiceWorker } from '@/hooks/use-service-worker';
import { useNotificationCleanup } from '@/hooks/use-notification-cleanup';
import { useBrowserNotifications } from '@/hooks/use-browser-notifications';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { useFCM } from '@/hooks/useFCM';

export function NotificationInitializer() {
  const { isSupported, isRegistered, registration, error } = useServiceWorker();
  const { cleanupOldNotifications } = useNotificationCleanup();
  const { permission, isEnabled } = useBrowserNotifications();
  const navigate = useNavigate();
  const { toast } = useToast();
  useFCM();

  const handleServiceWorkerMessage = useCallback((event: MessageEvent) => {
    const { type, payload, url, notificationId } = event.data || {};

    switch (type) {
      case 'PUSH_RECEIVED':
        console.log('Push notification received:', payload);
        window.dispatchEvent(new CustomEvent('notification-received', { detail: payload }));
        break;

      case 'NAVIGATE_TO':
        if (url) {
          navigate(url);
        }
        break;

      case 'NOTIFICATION_DISMISSED':
      case 'NOTIFICATION_CLOSED':
        console.log('Notification closed:', notificationId);
        window.dispatchEvent(new CustomEvent('notification-closed', { detail: { notificationId } }));
        break;

      case 'SYNC_NOTIFICATIONS':
        window.dispatchEvent(new CustomEvent('sync-notifications'));
        break;

      case 'SUBSCRIPTION_CHANGED':
        console.log('Push subscription changed');
        toast({
          title: 'Push Notifications Updated',
          description: 'Your notification subscription has been renewed.',
        });
        break;
    }
  }, [navigate, toast]);

  useEffect(() => {
    if (isSupported && isRegistered) {
      console.log('Service Worker registered successfully for push notifications');
    }
    if (error) {
      console.warn('Service Worker error:', error);
    }
  }, [isSupported, isRegistered, error]);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
      return () => {
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      };
    }
  }, [handleServiceWorkerMessage]);

  useEffect(() => {
    if (permission === 'default' && isEnabled) {
      console.log('Browser notifications supported, permission not yet requested');
    }
  }, [permission, isEnabled]);

  useEffect(() => {
    if (registration && permission === 'granted') {
      registration.pushManager.getSubscription().then((subscription) => {
        if (subscription) {
          console.log('Existing push subscription found');
        } else {
          console.log('No push subscription, user may need to enable push notifications');
        }
      });
    }
  }, [registration, permission]);

  return null;
}

export default NotificationInitializer;
