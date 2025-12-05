import { useEffect, useCallback, useState, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App, URLOpenListenerEvent } from '@capacitor/app';
import { Network, ConnectionStatus } from '@capacitor/network';
import { Geolocation, Position } from '@capacitor/geolocation';
import { PushNotifications, Token, ActionPerformed, PushNotificationSchema } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { StatusBar, Style } from '@capacitor/status-bar';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { saveLocationOffline, addPendingSync, getOfflineStats } from '@/lib/offline-db';
import { syncManager, setupAutoSync, type SyncResult } from '@/lib/sync-manager';
import { OfflineBanner, SyncStatusBar } from './SyncStatusBar';

interface MobileAppShellProps {
  children: React.ReactNode;
  onNetworkChange?: (isOnline: boolean) => void;
  onLocationUpdate?: (position: Position) => void;
  onPushReceived?: (notification: PushNotificationSchema) => void;
  showSyncStatus?: boolean;
}

interface DiagnosticLog {
  timestamp: Date;
  level: 'info' | 'warn' | 'error';
  message: string;
  details?: any;
}

export function MobileAppShell({ 
  children, 
  onNetworkChange,
  onLocationUpdate,
  onPushReceived,
  showSyncStatus = true,
}: MobileAppShellProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isNative] = useState(Capacitor.isNativePlatform());
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showOfflineBanner, setShowOfflineBanner] = useState(false);
  const locationWatchId = useRef<string | null>(null);
  const diagnosticLogs = useRef<DiagnosticLog[]>([]);
  const autoSyncCleanup = useRef<(() => void) | null>(null);

  const log = useCallback((level: DiagnosticLog['level'], message: string, details?: any) => {
    const logEntry: DiagnosticLog = {
      timestamp: new Date(),
      level,
      message,
      details
    };
    diagnosticLogs.current.push(logEntry);
    if (diagnosticLogs.current.length > 100) {
      diagnosticLogs.current.shift();
    }
    console[level](`[MobileAppShell] ${message}`, details || '');
  }, []);

  const handleDeepLink = useCallback((url: string) => {
    log('info', 'Deep link received', { url });
    
    try {
      const parsedUrl = new URL(url);
      let path = parsedUrl.pathname;
      
      if (parsedUrl.protocol === 'pact:') {
        path = parsedUrl.host + parsedUrl.pathname;
      }

      const routeMap: Record<string, string> = {
        'dashboard': '/dashboard',
        'mmp': '/mmp',
        'wallet': '/wallet',
        'notifications': '/notifications',
        'site-visit': '/site-visits',
        'approval': '/cost-approval',
        'finance': '/finance-approval',
        'team': '/team-locations',
        'profile': '/profile',
        'settings': '/settings',
        'signatures': '/signatures',
      };

      for (const [key, route] of Object.entries(routeMap)) {
        if (path.includes(key)) {
          navigate(route);
          log('info', 'Navigated via deep link', { route });
          return;
        }
      }

      if (path && path !== '/') {
        navigate(path);
      }
    } catch (error) {
      log('error', 'Failed to handle deep link', { url, error });
    }
  }, [navigate, log]);

  const initializeDeepLinks = useCallback(async () => {
    if (!isNative) return;

    try {
      App.addListener('appUrlOpen', (event: URLOpenListenerEvent) => {
        handleDeepLink(event.url);
      });

      const { url } = await App.getLaunchUrl() || {};
      if (url) {
        handleDeepLink(url);
      }

      log('info', 'Deep link handlers initialized');
    } catch (error) {
      log('error', 'Failed to initialize deep links', error);
    }
  }, [isNative, handleDeepLink, log]);

  const handleNetworkChange = useCallback(async (connected: boolean) => {
    setIsOnline(connected);
    onNetworkChange?.(connected);

    if (connected) {
      setShowOfflineBanner(true);
      
      // Get pending items count
      const stats = await getOfflineStats();
      const pendingCount = stats.pendingActions + stats.unsyncedVisits + stats.unsyncedLocations;
      
      if (pendingCount > 0) {
        toast({
          title: 'Back Online',
          description: `${pendingCount} items ready to sync. Tap "Sync Now" to sync.`,
        });
      } else {
        toast({
          title: 'Back Online',
          description: 'Connection restored.',
        });
      }
      
      // Hide banner after a delay
      setTimeout(() => setShowOfflineBanner(false), 5000);
    } else {
      setShowOfflineBanner(true);
      toast({
        title: 'Offline Mode',
        description: 'Your changes will be saved locally and synced when back online.',
        variant: 'destructive',
      });
    }
  }, [onNetworkChange, toast]);

  const initializeNetwork = useCallback(async () => {
    if (!isNative) {
      // Web fallback
      const handleOnline = () => handleNetworkChange(true);
      const handleOffline = () => handleNetworkChange(false);
      
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }

    try {
      const status = await Network.getStatus();
      setIsOnline(status.connected);
      onNetworkChange?.(status.connected);
      log('info', 'Initial network status', status);

      Network.addListener('networkStatusChange', (status: ConnectionStatus) => {
        log('info', 'Network status changed', status);
        handleNetworkChange(status.connected);
      });
    } catch (error) {
      log('error', 'Failed to initialize network monitoring', error);
    }
  }, [isNative, onNetworkChange, handleNetworkChange, log]);

  const saveLocation = useCallback(async (position: Position) => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user?.id) return;

      const userId = session.session.user.id;
      const { latitude, longitude, accuracy } = position.coords;

      if (navigator.onLine) {
        const { error } = await supabase
          .from('profiles')
          .update({
            location: {
              lat: latitude,
              lng: longitude,
              accuracy,
              lastUpdated: new Date().toISOString(),
            },
          })
          .eq('id', userId);

        if (error) throw error;
        log('info', 'Location synced to server', { lat: latitude, lng: longitude });
      } else {
        await saveLocationOffline({
          userId,
          lat: latitude,
          lng: longitude,
          accuracy: accuracy || undefined,
          timestamp: Date.now(),
        });
        log('info', 'Location saved offline', { lat: latitude, lng: longitude });
      }

      onLocationUpdate?.(position);
    } catch (error) {
      log('error', 'Failed to save location', error);
    }
  }, [onLocationUpdate, log]);

  const requestLocationPermission = useCallback(async (): Promise<boolean> => {
    if (!isNative) return true;

    try {
      const permissions = await Geolocation.checkPermissions();
      log('info', 'GPS permissions', permissions);

      if (permissions.location !== 'granted') {
        // Show rationale before requesting
        toast({
          title: 'Location Access Required',
          description: 'We need your location to track site visits and show your position on the team map.',
        });

        const requested = await Geolocation.requestPermissions();
        if (requested.location !== 'granted') {
          log('warn', 'GPS permission denied');
          toast({
            title: 'Location Access Denied',
            description: 'Some features may not work without location access. You can enable it in Settings.',
            variant: 'destructive',
          });
          return false;
        }
      }

      return true;
    } catch (error) {
      log('error', 'Failed to request location permission', error);
      return false;
    }
  }, [isNative, toast, log]);

  const initializeGPS = useCallback(async () => {
    if (!isNative) return;

    const hasPermission = await requestLocationPermission();
    if (!hasPermission) return;

    try {
      locationWatchId.current = await Geolocation.watchPosition(
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 30000,
        },
        (position, err) => {
          if (err) {
            log('error', 'GPS watch error', err);
            return;
          }
          if (position) {
            saveLocation(position);
          }
        }
      );

      log('info', 'GPS tracking started', { watchId: locationWatchId.current });
    } catch (error) {
      log('error', 'Failed to initialize GPS', error);
    }
  }, [isNative, requestLocationPermission, saveLocation, log]);

  const initializePushNotifications = useCallback(async () => {
    if (!isNative) return;

    try {
      const permissions = await PushNotifications.checkPermissions();
      log('info', 'Push permissions', permissions);

      if (permissions.receive !== 'granted') {
        // Show rationale before requesting
        toast({
          title: 'Enable Notifications',
          description: 'Get notified about new site visits, approvals, and important updates.',
        });

        const requested = await PushNotifications.requestPermissions();
        if (requested.receive !== 'granted') {
          log('warn', 'Push notification permission denied');
          return;
        }
      }

      await PushNotifications.register();

      PushNotifications.addListener('registration', async (token: Token) => {
        log('info', 'Push registration successful', { token: token.value.substring(0, 20) + '...' });
        
        try {
          const { data: session } = await supabase.auth.getSession();
          if (session?.session?.user?.id) {
            await supabase
              .from('profiles')
              .update({ 
                push_token: token.value,
                push_token_updated_at: new Date().toISOString(),
              })
              .eq('id', session.session.user.id);
          }
        } catch (error) {
          log('error', 'Failed to save push token', error);
        }
      });

      PushNotifications.addListener('registrationError', (error) => {
        log('error', 'Push registration failed', error);
      });

      PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
        log('info', 'Push notification received', notification);
        onPushReceived?.(notification);

        // Show local notification only if app is in background
        // The native service handles foreground notifications
        if (document.visibilityState === 'hidden') {
          LocalNotifications.schedule({
            notifications: [
              {
                id: Math.floor(Math.random() * 100000),
                title: notification.title || 'PACT Notification',
                body: notification.body || '',
                schedule: { at: new Date() },
                sound: 'beep.wav',
                smallIcon: 'ic_notification',
                iconColor: '#1e40af',
              },
            ],
          });
        }
      });

      PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
        log('info', 'Push notification action', action);
        
        const data = action.notification.data;
        if (data?.route) {
          navigate(data.route);
        } else if (data?.type === 'site_visit') {
          navigate('/mmp');
        } else if (data?.type === 'approval') {
          navigate('/cost-approval');
        } else if (data?.type === 'wallet') {
          navigate('/wallet');
        } else if (data?.type === 'sync') {
          syncManager.forceSync();
        }
      });

      log('info', 'Push notifications initialized');
    } catch (error) {
      log('error', 'Failed to initialize push notifications', error);
    }
  }, [isNative, navigate, onPushReceived, toast, log]);

  const initializeStatusBar = useCallback(async () => {
    if (!isNative) return;

    try {
      await StatusBar.setOverlaysWebView({ overlay: true });
      await StatusBar.setBackgroundColor({ color: '#00000000' });
      
      const isDark = document.documentElement.classList.contains('dark');
      await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });

      log('info', 'Status bar configured');
    } catch (error) {
      log('error', 'Failed to configure status bar', error);
    }
  }, [isNative, log]);

  const initializeAppLifecycle = useCallback(async () => {
    if (!isNative) return;

    try {
      App.addListener('appStateChange', async ({ isActive }) => {
        log('info', 'App state changed', { isActive });

        if (isActive) {
          // Refresh FCM token on app resume
          try {
            const { data: session } = await supabase.auth.getSession();
            if (session?.session) {
              // Token refresh will be handled by the native service
              log('info', 'App resumed, checking for pending syncs');
            }
          } catch (error) {
            log('error', 'Failed to refresh session on resume', error);
          }

          // Check for pending syncs
          const stats = await getOfflineStats();
          if (stats.pendingActions > 0 || stats.unsyncedVisits > 0) {
            log('info', 'Pending items found, triggering sync');
            // Don't auto-sync, just update UI - let user decide
          }
        }
      });

      App.addListener('pause', () => {
        log('info', 'App paused');
      });

      App.addListener('resume', async () => {
        log('info', 'App resumed');
        
        // Update online status
        if (isNative) {
          const status = await Network.getStatus();
          setIsOnline(status.connected);
        }
      });

      // Handle back button on Android
      App.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack) {
          window.history.back();
        } else {
          App.exitApp();
        }
      });

      log('info', 'App lifecycle handlers initialized');
    } catch (error) {
      log('error', 'Failed to initialize app lifecycle', error);
    }
  }, [isNative, log]);

  const handleSyncComplete = useCallback((result: SyncResult) => {
    if (result.success && result.synced > 0) {
      toast({
        title: 'Sync Complete',
        description: `Successfully synced ${result.synced} items.`,
      });
    } else if (!result.success && result.errors.length > 0) {
      toast({
        title: 'Sync Issues',
        description: `${result.failed} items failed to sync. Will retry automatically.`,
        variant: 'destructive',
      });
    }
  }, [toast]);

  useEffect(() => {
    const initialize = async () => {
      log('info', 'Initializing mobile app shell...');
      
      await initializeStatusBar();
      await initializeDeepLinks();
      await initializeNetwork();
      await initializeAppLifecycle();
      await initializePushNotifications();
      await initializeGPS();

      // Setup auto sync with 60 second interval
      autoSyncCleanup.current = setupAutoSync(60000);

      log('info', 'Mobile app shell initialized');
    };

    initialize();

    return () => {
      autoSyncCleanup.current?.();
      
      if (locationWatchId.current) {
        Geolocation.clearWatch({ id: locationWatchId.current });
      }

      if (isNative) {
        App.removeAllListeners();
        Network.removeAllListeners();
        PushNotifications.removeAllListeners();
      }
    };
  }, [
    isNative,
    initializeStatusBar,
    initializeDeepLinks,
    initializeNetwork,
    initializeAppLifecycle,
    initializePushNotifications,
    initializeGPS,
    log,
  ]);

  useEffect(() => {
    if (!isNative) return;

    const observer = new MutationObserver(async () => {
      const isDark = document.documentElement.classList.contains('dark');
      try {
        await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
      } catch (error) {
        log('error', 'Failed to update status bar style', error);
      }
    });

    observer.observe(document.documentElement, { 
      attributes: true, 
      attributeFilter: ['class'] 
    });

    return () => observer.disconnect();
  }, [isNative, log]);

  return (
    <div className="flex flex-col h-full">
      {/* Offline Banner */}
      {showOfflineBanner && <OfflineBanner />}
      
      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        {children}
      </div>
      
      {/* Sync Status Bar - Fixed at bottom on mobile */}
      {showSyncStatus && isNative && (
        <div className="fixed bottom-16 left-0 right-0 z-40 px-4 pb-2">
          <SyncStatusBar 
            compact={false}
            showDetails={true}
            onSyncComplete={handleSyncComplete}
          />
        </div>
      )}
    </div>
  );
}

export function useDiagnosticLogs() {
  const [logs, setLogs] = useState<DiagnosticLog[]>([]);

  const refresh = useCallback(() => {
    setLogs([...diagnosticLogs]);
  }, []);

  const clear = useCallback(() => {
    diagnosticLogs.length = 0;
    setLogs([]);
  }, []);

  return { logs, refresh, clear };
}

const diagnosticLogs: DiagnosticLog[] = [];

export function addDiagnosticLog(level: DiagnosticLog['level'], message: string, details?: any) {
  const logEntry: DiagnosticLog = {
    timestamp: new Date(),
    level,
    message,
    details
  };
  diagnosticLogs.push(logEntry);
  if (diagnosticLogs.length > 100) {
    diagnosticLogs.shift();
  }
  console[level](`[PACT] ${message}`, details || '');
}

export function getDiagnosticLogs(): DiagnosticLog[] {
  return [...diagnosticLogs];
}
