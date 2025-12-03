import { useEffect, useRef } from 'react';
import { useAppContext } from '@/context/AppContext';
import { useServiceWorker } from '@/hooks/use-service-worker';
import { FCMService } from '@/services/FCMService';
import { firebaseConfig, firebaseVapidPublicKey } from '@/config/firebase';
import { NotificationService } from '@/services/NotificationService';

export function useFCM() {
  const { currentUser, authReady } = useAppContext();
  const { registration } = useServiceWorker();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!authReady || !currentUser) return;
    if (initializedRef.current) return;

    // On web, wait for service worker registration before initializing FCM
    const needsSW = typeof window !== 'undefined' && 'serviceWorker' in navigator;
    if (needsSW && !registration) return;

    (async () => {
      initializedRef.current = true;
      await FCMService.init({
        config: firebaseConfig,
        vapidKey: firebaseVapidPublicKey,
        swRegistration: registration,
      });

      const permission = await FCMService.requestPermission();
      if (permission !== 'granted') {
        return;
      }

      const token = await FCMService.getToken({
        vapidKey: firebaseVapidPublicKey,
        swRegistration: registration,
      });

      if (token) {
        await FCMService.saveTokenForUser(currentUser.id, token);
      }

      const unsub = FCMService.onForegroundMessage((payload) => {
        const title = payload.notification?.title || payload.data?.title || 'Notification';
        const body = payload.notification?.body || payload.data?.body || '';
        const type = (payload.data?.type as any) || 'info';
        NotificationService.send({ title, message: body, type, showToast: true });
      });

      return () => {
        if (typeof unsub === 'function') unsub();
      };
    })();
  }, [authReady, currentUser, registration]);
}
