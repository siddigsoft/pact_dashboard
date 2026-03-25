import { useState, useEffect, useCallback } from 'react';

interface ServiceWorkerState {
  isSupported: boolean;
  isRegistered: boolean;
  isReady: boolean;
  registration: ServiceWorkerRegistration | null;
  error: string | null;
}

export function useServiceWorker() {
  const [state, setState] = useState<ServiceWorkerState>({
    isSupported: false,
    isRegistered: false,
    isReady: false,
    registration: null,
    error: null,
  });

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      setState(prev => ({ ...prev, isSupported: false }));
      return;
    }

    setState(prev => ({ ...prev, isSupported: true }));

    const registerServiceWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/service-worker.js', {
          scope: '/',
        });

        setState(prev => ({
          ...prev,
          isRegistered: true,
          registration,
        }));

        if (registration.active) {
          setState(prev => ({ ...prev, isReady: true }));
        }

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'activated') {
                setState(prev => ({ ...prev, isReady: true }));
              }
            });
          }
        });

        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }

      } catch (error) {
        console.error('Service Worker registration failed:', error);
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Registration failed',
        }));
      }
    };

    registerServiceWorker();

    return () => {
    };
  }, []);

  const unregister = useCallback(async () => {
    if (state.registration) {
      await state.registration.unregister();
      setState(prev => ({
        ...prev,
        isRegistered: false,
        isReady: false,
        registration: null,
      }));
    }
  }, [state.registration]);

  const update = useCallback(async () => {
    if (state.registration) {
      await state.registration.update();
    }
  }, [state.registration]);

  const requestPushSubscription = useCallback(async (vapidPublicKey?: string) => {
    if (!state.registration) {
      throw new Error('Service worker not registered');
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Notification permission denied');
    }

    const subscribeOptions: PushSubscriptionOptionsInit = {
      userVisibleOnly: true,
    };

    if (vapidPublicKey) {
      subscribeOptions.applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
    }

    const subscription = await state.registration.pushManager.subscribe(subscribeOptions);
    return subscription;
  }, [state.registration]);

  return {
    ...state,
    unregister,
    update,
    requestPushSubscription,
  };
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer as ArrayBuffer;
}

export default useServiceWorker;
