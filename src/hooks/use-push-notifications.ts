import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, ActionPerformed, PushNotificationSchema } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { addDiagnosticLog } from '@/components/mobile/MobileAppShell';

interface NotificationPayload {
  id?: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  route?: string;
  type?: 'site_visit' | 'approval' | 'wallet' | 'mmp' | 'team' | 'general';
  priority?: 'high' | 'normal' | 'low';
  sound?: boolean;
  badge?: number;
}

interface UsePushNotificationsOptions {
  onReceived?: (notification: PushNotificationSchema) => void;
  onAction?: (action: ActionPerformed) => void;
  autoNavigate?: boolean;
}

interface UsePushNotificationsReturn {
  isRegistered: boolean;
  token: string | null;
  permissionStatus: 'granted' | 'denied' | 'prompt' | null;
  register: () => Promise<boolean>;
  unregister: () => Promise<void>;
  sendLocalNotification: (payload: NotificationPayload) => Promise<void>;
  setBadgeCount: (count: number) => Promise<void>;
  clearBadge: () => Promise<void>;
  requestPermission: () => Promise<boolean>;
}

export function usePushNotifications({
  onReceived,
  onAction,
  autoNavigate = true,
}: UsePushNotificationsOptions = {}): UsePushNotificationsReturn {
  const [isRegistered, setIsRegistered] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'prompt' | null>(null);
  
  const navigate = useNavigate();
  const { toast } = useToast();
  const isNative = Capacitor.isNativePlatform();

  const handleNavigation = useCallback((data?: Record<string, any>) => {
    if (!autoNavigate || !data) return;

    const routeMap: Record<string, string> = {
      site_visit: '/mmp',
      approval: '/cost-approval',
      wallet: '/wallet',
      mmp: '/mmp',
      team: '/team-locations',
      finance: '/finance-approval',
      notification: '/notifications',
    };

    const route = data.route || routeMap[data.type] || '/notifications';
    navigate(route);
  }, [autoNavigate, navigate]);

  const saveTokenToServer = useCallback(async (pushToken: string) => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (session?.session?.user?.id) {
        const { error } = await supabase
          .from('profiles')
          .update({ 
            push_token: pushToken,
            push_enabled: true,
            device_platform: Capacitor.getPlatform(),
          })
          .eq('id', session.session.user.id);

        if (error) throw error;
        addDiagnosticLog('info', 'Push token saved to server');
      }
    } catch (error) {
      addDiagnosticLog('error', 'Failed to save push token', error);
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isNative) {
      if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        const granted = permission === 'granted';
        setPermissionStatus(granted ? 'granted' : 'denied');
        return granted;
      }
      return false;
    }

    try {
      const result = await PushNotifications.requestPermissions();
      const granted = result.receive === 'granted';
      setPermissionStatus(granted ? 'granted' : 'denied');
      addDiagnosticLog('info', 'Push permission request result', { granted });
      return granted;
    } catch (error) {
      addDiagnosticLog('error', 'Failed to request push permissions', error);
      setPermissionStatus('denied');
      return false;
    }
  }, [isNative]);

  const register = useCallback(async (): Promise<boolean> => {
    if (!isNative) {
      addDiagnosticLog('warn', 'Push notifications only available on native platforms');
      return false;
    }

    try {
      const permissions = await PushNotifications.checkPermissions();
      setPermissionStatus(permissions.receive as 'granted' | 'denied' | 'prompt');

      if (permissions.receive !== 'granted') {
        const granted = await requestPermission();
        if (!granted) {
          toast({
            title: 'Notifications Disabled',
            description: 'Enable notifications in settings to receive alerts',
            variant: 'destructive',
          });
          return false;
        }
      }

      await PushNotifications.register();

      PushNotifications.addListener('registration', async (tokenData: Token) => {
        addDiagnosticLog('info', 'Push registration successful');
        setToken(tokenData.value);
        setIsRegistered(true);
        await saveTokenToServer(tokenData.value);
      });

      PushNotifications.addListener('registrationError', (error) => {
        addDiagnosticLog('error', 'Push registration error', error);
        setIsRegistered(false);
        toast({
          title: 'Registration Failed',
          description: 'Could not register for push notifications',
          variant: 'destructive',
        });
      });

      PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
        addDiagnosticLog('info', 'Push notification received', { title: notification.title });
        
        onReceived?.(notification);

        LocalNotifications.schedule({
          notifications: [{
            id: Math.floor(Math.random() * 100000),
            title: notification.title || 'PACT Notification',
            body: notification.body || '',
            schedule: { at: new Date() },
            sound: 'beep.wav',
            smallIcon: 'ic_stat_icon_config_sample',
            iconColor: '#1e40af',
            extra: notification.data,
          }],
        });

        toast({
          title: notification.title || 'New Notification',
          description: notification.body,
        });
      });

      PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
        addDiagnosticLog('info', 'Push notification action', { actionId: action.actionId });
        onAction?.(action);
        handleNavigation(action.notification.data);
      });

      addDiagnosticLog('info', 'Push notification listeners registered');
      return true;
    } catch (error) {
      addDiagnosticLog('error', 'Failed to register push notifications', error);
      return false;
    }
  }, [isNative, requestPermission, saveTokenToServer, onReceived, onAction, handleNavigation, toast]);

  const unregister = useCallback(async () => {
    if (!isNative) return;

    try {
      await PushNotifications.removeAllListeners();
      
      const { data: session } = await supabase.auth.getSession();
      if (session?.session?.user?.id) {
        await supabase
          .from('profiles')
          .update({ push_token: null, push_enabled: false })
          .eq('id', session.session.user.id);
      }

      setIsRegistered(false);
      setToken(null);
      addDiagnosticLog('info', 'Push notifications unregistered');
    } catch (error) {
      addDiagnosticLog('error', 'Failed to unregister push notifications', error);
    }
  }, [isNative]);

  const sendLocalNotification = useCallback(async (payload: NotificationPayload) => {
    try {
      const notificationId = payload.id ? parseInt(payload.id, 10) : Math.floor(Math.random() * 100000);

      await LocalNotifications.schedule({
        notifications: [{
          id: notificationId,
          title: payload.title,
          body: payload.body,
          schedule: { at: new Date() },
          sound: payload.sound !== false ? 'beep.wav' : undefined,
          smallIcon: 'ic_stat_icon_config_sample',
          iconColor: '#1e40af',
          extra: {
            ...payload.data,
            route: payload.route,
            type: payload.type,
          },
        }],
      });

      addDiagnosticLog('info', 'Local notification sent', { title: payload.title });
    } catch (error) {
      addDiagnosticLog('error', 'Failed to send local notification', error);
    }
  }, []);

  const setBadgeCount = useCallback(async (count: number) => {
    try {
      if (isNative && 'setBadgeCount' in LocalNotifications) {
        await (LocalNotifications as any).setBadgeCount({ count });
        addDiagnosticLog('info', 'Badge count set', { count });
      }
    } catch (error) {
      addDiagnosticLog('error', 'Failed to set badge count', error);
    }
  }, [isNative]);

  const clearBadge = useCallback(async () => {
    await setBadgeCount(0);
  }, [setBadgeCount]);

  useEffect(() => {
    if (!isNative) return;

    const checkPermissions = async () => {
      const permissions = await PushNotifications.checkPermissions();
      setPermissionStatus(permissions.receive as 'granted' | 'denied' | 'prompt');
    };

    checkPermissions();

    return () => {
      PushNotifications.removeAllListeners();
    };
  }, [isNative]);

  return {
    isRegistered,
    token,
    permissionStatus,
    register,
    unregister,
    sendLocalNotification,
    setBadgeCount,
    clearBadge,
    requestPermission,
  };
}

export function useNotificationRouting() {
  const navigate = useNavigate();

  const handleNotificationTap = useCallback((data?: Record<string, any>) => {
    if (!data) {
      navigate('/notifications');
      return;
    }

    const routes: Record<string, string> = {
      site_visit_reminder: '/mmp',
      site_visit_assigned: '/mmp',
      approval_required: '/cost-approval',
      approval_completed: '/wallet',
      withdrawal_approved: '/wallet',
      withdrawal_rejected: '/wallet',
      mmp_uploaded: '/mmps',
      team_location: '/team-locations',
      finance_approval: '/finance-approval',
      down_payment: '/cost-approval',
    };

    const route = data.route || routes[data.notification_type] || '/notifications';
    navigate(route);
  }, [navigate]);

  return { handleNotificationTap };
}
