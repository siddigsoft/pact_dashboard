/**
 * Crash Reporting & Error Tracking Module
 * Firebase Analytics for web error tracking.
 */

let crashlyticsInitialized = false;
let analyticsInstance: any = null;

export interface CrashReport {
  message: string;
  stack?: string;
  componentStack?: string;
  metadata?: Record<string, string | number | boolean>;
}

export async function initializeCrashlytics(): Promise<boolean> {
  if (crashlyticsInitialized) return true;

  try {
    try {
      const { firebaseConfig, isFirebaseConfigured } = await import('@/config/firebase');

      if (!isFirebaseConfigured) {
        console.log('[Crashlytics] Firebase not configured - skipping Analytics initialization');
      } else {
        const { getApps, getApp, initializeApp } = await import('firebase/app');
        let app;
        if (getApps().length === 0) {
          app = initializeApp(firebaseConfig);
        } else {
          app = getApp();
        }

        if (app) {
          const { getAnalytics } = await import('firebase/analytics');
          analyticsInstance = getAnalytics(app);
        }
      }
    } catch (analyticsError) {
      console.warn('[Crashlytics] Firebase Analytics not available:', analyticsError);
    }

    crashlyticsInitialized = true;
    return true;
  } catch (error) {
    console.warn('[Crashlytics] Failed to initialize:', error);
    return false;
  }
}

export async function setUser(userId: string, properties?: Record<string, string>): Promise<void> {
  try {
    if (analyticsInstance) {
      const { setUserId, setUserProperties } = await import('firebase/analytics');
      setUserId(analyticsInstance, userId);
      if (properties) {
        setUserProperties(analyticsInstance, properties);
      }
    }
  } catch (error) {
    console.error('[Crashlytics] Failed to set user:', error);
  }
}

export async function logCrash(error: Error, metadata?: Record<string, string | number | boolean>): Promise<void> {
  console.error('[Crashlytics] Fatal error:', error.message, error.stack);

  try {
    if (analyticsInstance) {
      const { logEvent } = await import('firebase/analytics');
      logEvent(analyticsInstance, 'exception', {
        description: `${error.name}: ${error.message}`,
        fatal: true,
        stack: error.stack?.substring(0, 500),
        platform: 'web',
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
    if (analyticsInstance) {
      const { logEvent } = await import('firebase/analytics');
      logEvent(analyticsInstance, 'exception', {
        description: `${errorObj.name}: ${errorObj.message}`,
        fatal: false,
        platform: 'web',
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

    const msg = error.message ?? '';
    if (/loading chunk|failed to fetch dynamically imported module|importing a module script failed/i.test(msg)) {
      if (originalOnUnhandledRejection) {
        originalOnUnhandledRejection.call(window, event);
      }
      return;
    }

    logNonFatalError(error, {
      handler: 'unhandledrejection',
    });

    if (originalOnUnhandledRejection) {
      originalOnUnhandledRejection.call(window, event);
    }
  };
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
    hasNativeCrashlytics: false,
    hasAnalytics: analyticsInstance !== null,
    isNative: false,
  };
}

export async function sendUnsentReports(): Promise<void> {}
