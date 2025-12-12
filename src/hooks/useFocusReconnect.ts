/**
 * useFocusReconnect Hook
 * Automatically triggers realtime reconnection when window regains focus
 * or becomes visible again (e.g., user switches back to tab)
 */

import { useEffect, useCallback, useRef } from 'react';
import { queryClient } from '@/lib/queryClient';

interface FocusReconnectOptions {
  onFocus?: () => void;
  onVisible?: () => void;
  onOnline?: () => void;
  invalidateQueries?: boolean;
  reconnectDelay?: number;
}

export function useFocusReconnect(options: FocusReconnectOptions = {}) {
  const {
    onFocus,
    onVisible,
    onOnline,
    invalidateQueries = true,
    reconnectDelay = 500,
  } = options;

  const lastFocusTime = useRef<number>(0);
  const minRefreshInterval = 30000; // Don't refresh more than once every 30 seconds

  const handleRefresh = useCallback(() => {
    const now = Date.now();
    if (now - lastFocusTime.current < minRefreshInterval) {
      return; // Skip if we recently refreshed
    }
    lastFocusTime.current = now;

    if (invalidateQueries) {
      // Delay to allow connection to be re-established
      setTimeout(() => {
        queryClient.invalidateQueries();
      }, reconnectDelay);
    }
  }, [invalidateQueries, reconnectDelay]);

  const handleFocus = useCallback(() => {
    onFocus?.();
    handleRefresh();
  }, [onFocus, handleRefresh]);

  const handleVisibilityChange = useCallback(() => {
    if (document.visibilityState === 'visible') {
      onVisible?.();
      handleRefresh();
    }
  }, [onVisible, handleRefresh]);

  const handleOnline = useCallback(() => {
    onOnline?.();
    handleRefresh();
  }, [onOnline, handleRefresh]);

  useEffect(() => {
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, [handleFocus, handleVisibilityChange, handleOnline]);
}

/**
 * Hook to track document visibility state
 */
export function useDocumentVisibility(): boolean {
  const isVisible = useRef(document.visibilityState === 'visible');

  useEffect(() => {
    const handleVisibilityChange = () => {
      isVisible.current = document.visibilityState === 'visible';
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  return isVisible.current;
}

/**
 * Hook to track online/offline status
 */
export function useOnlineStatus(): boolean {
  const isOnline = useRef(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => { isOnline.current = true; };
    const handleOffline = () => { isOnline.current = false; };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline.current;
}
