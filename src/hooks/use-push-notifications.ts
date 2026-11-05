import { useState, useEffect, useCallback } from 'react';
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
  priority?: 'high' | 'normal' | 'urgent';
  sound?: boolean;
  badge?: number;
}

interface UsePushNotificationsOptions {
  onReceived?: (notification: { title?: string; body?: string; data?: any }) => void;
  onAction?: (action: { actionId?: string; notification?: { data?: any } }) => void;
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
  onReceived: _onReceived,
  onAction: _onAction,
  autoNavigate = true,
}: UsePushNotificationsOptions = {}): UsePushNotificationsReturn {
  const [isRegistered, setIsRegistered] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'prompt' | null>(null);

  const navigate = useNavigate();
  const { toast } = useToast();

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
    navigate(data.route || routeMap[data.type] || '/notifications');
  }, [autoNavigate, navigate]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      const granted = permission === 'granted';
      setPermissionStatus(granted ? 'granted' : 'denied');
      return granted;
    }
    return false;
  }, []);

  const register = useCallback(async (): Promise<boolean> => {
    const granted = await requestPermission();
    if (!granted) {
      toast({
        title: 'Notifications Disabled',
        description: 'Enable notifications in settings to receive alerts',
        variant: 'destructive',
      });
      return false;
    }
    setIsRegistered(true);
    addDiagnosticLog('info', 'Web notification permission granted');
    return true;
  }, [requestPermission, toast]);

  const unregister = useCallback(async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (session?.session?.user?.id) {
        await supabase
          .from('profiles')
          .update({ push_token: null, push_enabled: false })
          .eq('id', session.session.user.id);
      }
      setIsRegistered(false);
      setToken(null);
    } catch (error) {
      addDiagnosticLog('error', 'Failed to unregister push notifications', error);
    }
  }, []);

  const sendLocalNotification = useCallback(async (payload: NotificationPayload) => {
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        const n = new Notification(payload.title, {
          body: payload.body,
          data: { ...payload.data, route: payload.route, type: payload.type },
        });
        n.onclick = () => {
          handleNavigation({ ...payload.data, route: payload.route, type: payload.type });
          n.close();
        };
      }
      addDiagnosticLog('info', 'Local notification sent', { title: payload.title });
    } catch (error) {
      addDiagnosticLog('error', 'Failed to send local notification', error);
    }
  }, [handleNavigation]);

  const setBadgeCount = useCallback(async (_count: number) => {}, []);
  const clearBadge = useCallback(async () => {}, []);

  useEffect(() => {
    if ('Notification' in window) {
      const perm = Notification.permission;
      setPermissionStatus(perm === 'default' ? 'prompt' : perm);
    }
  }, []);

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

    navigate(data.route || routes[data.notification_type] || '/notifications');
  }, [navigate]);

  return { handleNotificationTap };
}
