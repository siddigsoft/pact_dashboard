/**
 * Crash Reporting & Error Tracking Module
 * 
 * Uses @capacitor-firebase/crashlytics for native crash reporting on Android/iOS,
 * with Firebase Analytics as a fallback for web error tracking.
 */

let crashlyticsInitialized = false;
let analyticsInstance: any = null;
let isNativeApp = false;
let nativeCrashlyticsAvailable = false;

export interface CrashReport {
  message: string;
  stack?: string;
  componentStack?: string;
  metadata?: Record<string, string | number | boolean>;
}

export async function initializeCrashlytics(): Promise<boolean> {
  if (crashlyticsInitialized) return true;

  try {
    isNativeApp = typeof (window as any).Capacitor !== 'undefined' && 
                  (window as any).Capacitor?.getPlatform?.() !== 'web';

    if (isNativeApp) {
      try {
        const { FirebaseCrashlytics } = await import('@capacitor-firebase/crashlytics');
        await FirebaseCrashlytics.setEnabled({ enabled: true });
        nativeCrashlyticsAvailable = true;
        console.log('[Crashlytics] Native Firebase Crashlytics enabled');
        
        const { crashed } = await FirebaseCrashlytics.didCrashOnPreviousExecution();
        if (crashed) {
          console.log('[Crashlytics] App crashed on previous execution');
        }
      } catch (error) {
        console.warn('[Crashlytics] Native Crashlytics not available:', error);
      }
    }

    try {
      const { getApp } = await import('firebase/app');
      const app = getApp();
      const { getAnalytics } = await import('firebase/analytics');
      analyticsInstance = getAnalytics(app);
      console.log('[Crashlytics] Firebase Analytics initialized');
    } catch (analyticsError) {
      console.warn('[Crashlytics] Firebase Analytics not available:', analyticsError);
    }

    crashlyticsInitialized = true;
    console.log('[Crashlytics] Initialized - Native:', nativeCrashlyticsAvailable, 'Analytics:', !!analyticsInstance);
    return true;
  } catch (error) {
    console.warn('[Crashlytics] Failed to initialize:', error);
    return false;
  }
}

export async function setUser(userId: string, properties?: Record<string, string>): Promise<void> {
  try {
    if (nativeCrashlyticsAvailable) {
      const { FirebaseCrashlytics } = await import('@capacitor-firebase/crashlytics');
      await FirebaseCrashlytics.setUserId({ userId });
      
      if (properties) {
        for (const [key, value] of Object.entries(properties)) {
          await FirebaseCrashlytics.setCustomKey({ key, value, type: 'string' });
        }
      }
    }

    if (analyticsInstance) {
      const { setUserId, setUserProperties } = await import('firebase/analytics');
      setUserId(analyticsInstance, userId);
      if (properties) {
        setUserProperties(analyticsInstance, properties);
      }
    }
    console.log('[Crashlytics] User set:', userId);
  } catch (error) {
    console.error('[Crashlytics] Failed to set user:', error);
  }
}

export async function logCrash(error: Error, metadata?: Record<string, string | number | boolean>): Promise<void> {
  console.error('[Crashlytics] Fatal error:', error.message, error.stack);

  try {
    if (nativeCrashlyticsAvailable) {
      const { FirebaseCrashlytics } = await import('@capacitor-firebase/crashlytics');
      
      if (metadata) {
        for (const [key, value] of Object.entries(metadata)) {
          await FirebaseCrashlytics.setCustomKey({ 
            key, 
            value: String(value), 
            type: 'string' 
          });
        }
      }
      
      await FirebaseCrashlytics.log({ message: `Fatal: ${error.name}: ${error.message}` });
      
      await FirebaseCrashlytics.recordException({ 
        message: error.message,
      });
    }

    if (analyticsInstance) {
      const { logEvent } = await import('firebase/analytics');
      logEvent(analyticsInstance, 'exception', {
        description: `${error.name}: ${error.message}`,
        fatal: true,
        stack: error.stack?.substring(0, 500),
        platform: isNativeApp ? 'native' : 'web',
        timestamp: new Date().toISOString(),
        ...metadata,
      });
    }
  } catch (err) {
    console.error('[Crashlytics] Failed to log crash:', err);
  }
}

export async function logNonFatalError(
  error: Error | string, 
  metadata?: Record<string, string | number | boolean>
): Promise<void> {
  const errorObj = typeof error === 'string' ? new Error(error) : error;
  console.warn('[Crashlytics] Non-fatal error:', errorObj.message);

  try {
    if (nativeCrashlyticsAvailable) {
      const { FirebaseCrashlytics } = await import('@capacitor-firebase/crashlytics');
      
      if (metadata) {
        for (const [key, value] of Object.entries(metadata)) {
          await FirebaseCrashlytics.setCustomKey({ 
            key, 
            value: String(value), 
            type: 'string' 
          });
        }
      }
      
      await FirebaseCrashlytics.recordException({ 
        message: errorObj.message,
      });
    }

    if (analyticsInstance) {
      const { logEvent } = await import('firebase/analytics');
      logEvent(analyticsInstance, 'exception', {
        description: `${errorObj.name}: ${errorObj.message}`,
        fatal: false,
        platform: isNativeApp ? 'native' : 'web',
        ...metadata,
      });
    }
  } catch (err) {
    console.error('[Crashlytics] Failed to log non-fatal error:', err);
  }
}

export async function logBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, string | number | boolean>
): Promise<void> {
  try {
    if (nativeCrashlyticsAvailable) {
      const { FirebaseCrashlytics } = await import('@capacitor-firebase/crashlytics');
      await FirebaseCrashlytics.log({ message: `[${category}] ${message}` });
    }

    if (analyticsInstance) {
      const { logEvent } = await import('firebase/analytics');
      logEvent(analyticsInstance, 'app_breadcrumb', {
        category,
        message,
        timestamp: new Date().toISOString(),
        ...data,
      });
    }
  } catch (error) {
    console.error('[Crashlytics] Failed to log breadcrumb:', error);
  }
}

export async function logScreenView(screenName: string, screenClass?: string): Promise<void> {
  try {
    if (nativeCrashlyticsAvailable) {
      const { FirebaseCrashlytics } = await import('@capacitor-firebase/crashlytics');
      await FirebaseCrashlytics.log({ message: `Screen: ${screenName}` });
      await FirebaseCrashlytics.setCustomKey({ key: 'current_screen', value: screenName, type: 'string' });
    }

    if (analyticsInstance) {
      const { logEvent } = await import('firebase/analytics');
      logEvent(analyticsInstance, 'screen_view', {
        firebase_screen: screenName,
        firebase_screen_class: screenClass || screenName,
      });
    }
  } catch (error) {
    console.error('[Crashlytics] Failed to log screen view:', error);
  }
}

export async function logCustomEvent(
  eventName: string,
  params?: Record<string, string | number | boolean>
): Promise<void> {
  try {
    if (nativeCrashlyticsAvailable) {
      const { FirebaseCrashlytics } = await import('@capacitor-firebase/crashlytics');
      await FirebaseCrashlytics.log({ message: `Event: ${eventName} ${JSON.stringify(params || {})}` });
    }

    if (analyticsInstance) {
      const { logEvent } = await import('firebase/analytics');
      logEvent(analyticsInstance, eventName, params);
    }
  } catch (error) {
    console.error('[Crashlytics] Failed to log custom event:', error);
  }
}

export function setupGlobalErrorHandler(): void {
  if (typeof window === 'undefined') return;

  const originalOnError = window.onerror;
  window.onerror = (message, source, lineno, colno, error) => {
    const errorToLog = error || new Error(String(message));
    logCrash(errorToLog, {
      source: source || 'unknown',
      line: lineno || 0,
      column: colno || 0,
      handler: 'window.onerror',
    });
    
    if (originalOnError) {
      return originalOnError(message, source, lineno, colno, error);
    }
    return false;
  };

  const originalOnUnhandledRejection = window.onunhandledrejection;
  window.onunhandledrejection = (event) => {
    const error = event.reason instanceof Error 
      ? event.reason 
      : new Error(String(event.reason));
    
    logNonFatalError(error, {
      handler: 'unhandledrejection',
    });
    
    if (originalOnUnhandledRejection) {
      originalOnUnhandledRejection.call(window, event);
    }
  };

  console.log('[Crashlytics] Global error handlers configured');
}


export async function recordApiError(
  endpoint: string,
  statusCode: number,
  errorMessage: string
): Promise<void> {
  await logNonFatalError(new Error(`API Error: ${endpoint}`), {
    endpoint,
    status_code: statusCode,
    error_message: errorMessage,
    error_type: 'api_error',
  });
}

export async function recordOfflineSyncError(
  syncType: string,
  itemCount: number,
  errorMessage: string
): Promise<void> {
  await logNonFatalError(new Error(`Sync Error: ${syncType}`), {
    sync_type: syncType,
    item_count: itemCount,
    error_message: errorMessage,
    error_type: 'sync_error',
  });
}

export async function recordLocationError(
  errorCode: number,
  errorMessage: string
): Promise<void> {
  await logNonFatalError(new Error('Location Error'), {
    error_code: errorCode,
    error_message: errorMessage,
    error_type: 'location_error',
  });
}

export async function recordNetworkChange(
  previousState: 'online' | 'offline',
  newState: 'online' | 'offline'
): Promise<void> {
  await logBreadcrumb('network', `Connection: ${previousState} -> ${newState}`, {
    previous_state: previousState,
    new_state: newState,
  });
}

export function getCrashlyticsStatus(): { 
  initialized: boolean;
  hasNativeCrashlytics: boolean;
  hasAnalytics: boolean;
  isNative: boolean;
} {
  return { 
    initialized: crashlyticsInitialized,
    hasNativeCrashlytics: nativeCrashlyticsAvailable,
    hasAnalytics: analyticsInstance !== null,
    isNative: isNativeApp,
  };
}

export async function sendUnsentReports(): Promise<void> {
  if (!nativeCrashlyticsAvailable) return;
  
  try {
    const { FirebaseCrashlytics } = await import('@capacitor-firebase/crashlytics');
    await FirebaseCrashlytics.sendUnsentReports();
    console.log('[Crashlytics] Sent unsent reports');
  } catch (error) {
    console.error('[Crashlytics] Failed to send unsent reports:', error);
  }
}
