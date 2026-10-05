import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getMessaging, getToken, isSupported, Messaging, onMessage } from 'firebase/messaging';
import { supabase } from '@/integrations/supabase/client';
import type { FirebaseConfig, FcmNotificationPayload } from '@/types/fcm';

export type Platform = 'web' | 'android' | 'ios';

interface InitOptions {
  config: FirebaseConfig;
  vapidKey?: string;
  swRegistration?: ServiceWorkerRegistration | null;
}

class _FCMService {
  private app: FirebaseApp | null = null;
  private messaging: Messaging | null = null;
  private initialized = false;
  private firebaseSWRegistration: ServiceWorkerRegistration | null = null;

  get platform(): Platform {
    return 'web';
  }

  async init({ config, vapidKey, swRegistration }: InitOptions) {
    if (!this.initialized) {
      if (!getApps().length) {
        this.app = initializeApp(config);
      } else {
        this.app = getApps()[0]!;
      }

      const supported = await isSupported().catch(() => false);
      if (!supported) {
        console.warn('[FCM] Web messaging is not supported in this browser');
        this.initialized = true;
        return;
      }
      this.messaging = getMessaging(this.app);
      await this.initFirebaseServiceWorker(config, vapidKey);

      if (swRegistration && vapidKey && 'active' in swRegistration) {
        swRegistration.active?.postMessage({ type: 'SET_VAPID_KEY', key: vapidKey });
      }

      this.initialized = true;
    }
  }

  private async initFirebaseServiceWorker(config: FirebaseConfig, vapidKey?: string) {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    try {
      const swPath = '/firebase-messaging-sw.js';
      const registration = await navigator.serviceWorker.register(swPath, {
        scope: '/firebase-cloud-messaging-push-scope',
      });

      await navigator.serviceWorker.ready;

      const sendConfig = () => {
        const sw = registration.active || registration.installing || registration.waiting;
        if (sw) {
          sw.postMessage({ type: 'INIT_FIREBASE', config });
          if (vapidKey) {
            sw.postMessage({ type: 'SET_VAPID_KEY', key: vapidKey });
          }
          console.log('[FCM] Firebase config sent to service worker');
        }
      };

      if (registration.active) {
        sendConfig();
      } else {
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'activated') {
                sendConfig();
              }
            });
          }
        });
      }

      this.firebaseSWRegistration = registration;
    } catch (err) {
      console.warn('[FCM] Failed to register Firebase messaging service worker:', err);
    }
  }

  registerNativeListeners() {}

  async requestPermission(): Promise<NotificationPermission> {
    return await Notification.requestPermission();
  }

  async getToken(options: { vapidKey?: string; swRegistration?: ServiceWorkerRegistration | null } = {}) {
    if (!this.messaging) return null;
    try {
      const swReg = this.firebaseSWRegistration || options.swRegistration;
      const token = await getToken(this.messaging, {
        vapidKey: options.vapidKey,
        serviceWorkerRegistration: swReg ?? undefined,
      });
      return token || null;
    } catch (err) {
      console.warn('[FCM] Failed to get web token:', err);
      return null;
    }
  }

  onForegroundMessage(cb: (payload: FcmNotificationPayload) => void) {
    if (!this.messaging) return () => {};
    const unsubscribe = onMessage(this.messaging, (payload) => {
      cb(payload as unknown as FcmNotificationPayload);
    });
    return unsubscribe;
  }

  async saveTokenForUser(userId: string, token: string) {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ fcm_token: token, fcm_token_updated_at: new Date().toISOString() })
        .eq('id', userId);
      if (error) throw error;
      return true;
    } catch (e) {
      console.error('[FCM] Failed to save token to profile:', e);
      return false;
    }
  }
}

export const FCMService = new _FCMService();
