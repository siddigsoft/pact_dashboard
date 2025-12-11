import { initializeApp, FirebaseApp, getApps, getApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, Messaging, isSupported } from 'firebase/messaging';
import { firebaseConfig, firebaseVapidPublicKey, isFirebaseConfigured } from '@/config/firebase';
import { supabase } from '@/integrations/supabase/client';
import type { FcmNotificationPayload } from '@/types/fcm';

type ForegroundMessageHandler = (payload: FcmNotificationPayload) => void;

class FCMMessagingService {
  private app: FirebaseApp | null = null;
  private messaging: Messaging | null = null;
  private currentToken: string | null = null;
  private currentUserId: string | null = null;
  private foregroundHandlers: Set<ForegroundMessageHandler> = new Set();
  private isInitialized: boolean = false;
  private initPromise: Promise<boolean> | null = null;

  async initialize(userId: string): Promise<boolean> {
    if (this.isInitialized && this.currentUserId === userId) {
      return true;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._initialize(userId);
    const result = await this.initPromise;
    this.initPromise = null;
    return result;
  }

  private async _initialize(userId: string): Promise<boolean> {
    this.currentUserId = userId;

    if (!isFirebaseConfigured) {
      console.warn('[FCM] Firebase not configured - push notifications disabled');
      return false;
    }

    const supported = await isSupported();
    if (!supported) {
      console.warn('[FCM] Push messaging not supported in this browser');
      return false;
    }

    try {
      if (getApps().length === 0) {
        this.app = initializeApp(firebaseConfig);
      } else {
        this.app = getApp();
      }

      this.messaging = getMessaging(this.app);
      await this.registerServiceWorker();
      await this.setupForegroundHandler();

      this.isInitialized = true;
      console.log('[FCM] Messaging initialized successfully');
      return true;
    } catch (error) {
      console.error('[FCM] Failed to initialize:', error);
      return false;
    }
  }

  private async registerServiceWorker(): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      console.warn('[FCM] Service workers not supported');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js', {
        scope: '/'
      });

      await navigator.serviceWorker.ready;

      if (firebaseVapidPublicKey) {
        registration.active?.postMessage({
          type: 'SET_VAPID_KEY',
          key: firebaseVapidPublicKey
        });
      }

      console.log('[FCM] Service worker registered');
    } catch (error) {
      console.error('[FCM] Service worker registration failed:', error);
    }
  }

  private async setupForegroundHandler(): Promise<void> {
    if (!this.messaging) return;

    onMessage(this.messaging, (payload) => {
      console.log('[FCM] Foreground message received:', payload);
      
      const fcmPayload: FcmNotificationPayload = {
        notification: payload.notification,
        data: payload.data as FcmNotificationPayload['data'],
        from: payload.from,
        fcmMessageId: payload.messageId
      };

      this.foregroundHandlers.forEach(handler => {
        try {
          handler(fcmPayload);
        } catch (e) {
          console.error('[FCM] Foreground handler error:', e);
        }
      });

      if (Notification.permission === 'granted' && payload.notification) {
        const { title, body, icon } = payload.notification;
        new Notification(title || 'PACT Notification', {
          body: body || '',
          icon: icon || '/icons/icon-192x192.png',
          tag: `fcm-${Date.now()}`,
          data: payload.data
        });
      }
    });
  }

  async requestPermissionAndGetToken(): Promise<string | null> {
    if (!this.messaging || !firebaseVapidPublicKey) {
      console.warn('[FCM] Messaging not initialized or VAPID key missing');
      return null;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.warn('[FCM] Notification permission denied');
        return null;
      }

      const registration = await navigator.serviceWorker.ready;
      
      const token = await getToken(this.messaging, {
        vapidKey: firebaseVapidPublicKey,
        serviceWorkerRegistration: registration
      });

      if (token) {
        this.currentToken = token;
        await this.saveTokenToServer(token);
        console.log('[FCM] Token obtained:', token.substring(0, 20) + '...');
        return token;
      }

      console.warn('[FCM] No registration token available');
      return null;
    } catch (error) {
      console.error('[FCM] Error getting token:', error);
      return null;
    }
  }

  private async saveTokenToServer(token: string): Promise<void> {
    if (!this.currentUserId) return;

    try {
      const { data: existing } = await supabase
        .from('user_settings')
        .select('settings')
        .eq('user_id', this.currentUserId)
        .single();

      const mergedSettings = {
        ...(existing?.settings || {}),
        fcm_token: token,
        fcm_token_updated_at: new Date().toISOString(),
        push_enabled: true
      };

      if (existing) {
        const { error } = await supabase
          .from('user_settings')
          .update({ settings: mergedSettings })
          .eq('user_id', this.currentUserId);

        if (error) {
          console.error('[FCM] Failed to update token:', error);
          return;
        }
      } else {
        const { error } = await supabase
          .from('user_settings')
          .insert({
            user_id: this.currentUserId,
            settings: mergedSettings
          });

        if (error) {
          console.error('[FCM] Failed to insert token:', error);
          return;
        }
      }

      console.log('[FCM] Token saved to server');
    } catch (error) {
      console.error('[FCM] Failed to save token:', error);
    }
  }

  onForegroundMessage(handler: ForegroundMessageHandler): () => void {
    this.foregroundHandlers.add(handler);
    return () => {
      this.foregroundHandlers.delete(handler);
    };
  }

  getToken(): string | null {
    return this.currentToken;
  }

  async deleteToken(): Promise<void> {
    if (!this.currentUserId) return;

    try {
      const { data: existing } = await supabase
        .from('user_settings')
        .select('settings')
        .eq('user_id', this.currentUserId)
        .single();

      if (existing?.settings) {
        const updatedSettings = {
          ...existing.settings,
          fcm_token: null,
          push_enabled: false
        };

        await supabase
          .from('user_settings')
          .update({ settings: updatedSettings })
          .eq('user_id', this.currentUserId);
      }

      this.currentToken = null;
      console.log('[FCM] Token deleted');
    } catch (error) {
      console.error('[FCM] Failed to delete token:', error);
    }
  }

  cleanup(): void {
    this.foregroundHandlers.clear();
    this.currentUserId = null;
    this.currentToken = null;
    this.isInitialized = false;
  }
}

export const fcmMessagingService = new FCMMessagingService();
