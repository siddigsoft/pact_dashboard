import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getMessaging, getToken, isSupported, Messaging, onMessage } from 'firebase/messaging';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
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
  private nativeListeners = false;

  get platform(): Platform {
    if (Capacitor.getPlatform() === 'android') return 'android';
    if (Capacitor.getPlatform() === 'ios') return 'ios';
    return 'web';
    }

  async init({ config, vapidKey, swRegistration }: InitOptions) {
    if (!this.initialized) {
      if (!getApps().length) {
        this.app = initializeApp(config);
      } else {
        this.app = getApps()[0]!;
      }

      if (this.platform === 'web') {
        const supported = await isSupported().catch(() => false);
        if (!supported) {
          console.warn('[FCM] Web messaging is not supported in this browser');
          this.initialized = true;
          return;
        }
        this.messaging = getMessaging(this.app);

        // Inform SW of VAPID key for resubscribe events
        if (swRegistration && vapidKey && 'active' in swRegistration) {
          swRegistration.active?.postMessage({ type: 'SET_VAPID_KEY', key: vapidKey });
        }
      } else {
        this.registerNativeListeners();
      }

      this.initialized = true;
    }
  }

  registerNativeListeners() {
    if (this.platform === 'web' || this.nativeListeners) return;
    this.nativeListeners = true;
    PushNotifications.addListener('pushNotificationReceived', (notification: any) => {
      try {
        const data = notification?.data || {};
        const title = notification?.title || data?.title || 'Notification';
        const body = notification?.body || data?.body || '';
        window.dispatchEvent(new CustomEvent('native-notification-received', { detail: { title, body, data } }));
      } catch (_) {}
    });
    PushNotifications.addListener('pushNotificationActionPerformed', (action: any) => {
      try {
        const data = action?.notification?.data || {};
        const url = data?.url || data?.link || '/notifications';
        window.dispatchEvent(new CustomEvent('native-notification-action', { detail: { url, data } }));
      } catch (_) {}
    });
  }

  async requestPermission(): Promise<NotificationPermission> {
    if (this.platform === 'web') {
      return await Notification.requestPermission();
    }
    // Native (Capacitor)
    const permStatus = await PushNotifications.checkPermissions();
    if (permStatus.receive !== 'granted') {
      const asked = await PushNotifications.requestPermissions();
      return asked.receive === 'granted' ? 'granted' : 'denied';
    }
    return 'granted';
  }

  async getToken(options: { vapidKey?: string; swRegistration?: ServiceWorkerRegistration | null } = {}) {
    if (this.platform === 'web') {
      if (!this.messaging) return null;
      try {
        const token = await getToken(this.messaging, {
          vapidKey: options.vapidKey,
          serviceWorkerRegistration: options.swRegistration ?? undefined,
        });
        return token || null;
      } catch (err) {
        console.warn('[FCM] Failed to get web token:', err);
        return null;
      }
    }

    // Native (Android/iOS)
    try {
      return new Promise<string | null>(async (resolve) => {
        const regSub = await PushNotifications.addListener('registration', (token: any) => {
          regSub.remove();
          errSub.remove();
          resolve(token?.value ?? null);
        });
        const errSub = await PushNotifications.addListener('registrationError', (_error) => {
          regSub.remove();
          errSub.remove();
          resolve(null);
        });
        await PushNotifications.register();
      });
    } catch (e) {
      console.error('[FCM] Native getToken failed:', e);
      return null;
    }
  }

  onForegroundMessage(cb: (payload: FcmNotificationPayload) => void) {
    if (this.platform !== 'web' || !this.messaging) return () => {};
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
