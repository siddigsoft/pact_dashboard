/**
 * useFocusReconnect Hook
 * Automatically triggers realtime reconnection when window regains focus
 * or becomes visible again (e.g., user switches back to tab)
 * 
 * Note: This hook uses throttling to prevent excessive API calls:
 * - Minimum 60 second interval between refreshes
 * - Only refreshes if the tab was hidden for at least 30 seconds
 */

import { useEffect, useCallback, useRef } from 'react';
import { queryClient } from '@/lib/queryClient';

interface FocusReconnectOptions {
  onFocus?: () => void;
  onVisible?: () => void;
  onOnline?: () => void;
  invalidateQueries?: boolean;
  queryKeys?: string[];
  reconnectDelay?: number;
  minRefreshInterval?: number;
}

export function useFocusReconnect(options: FocusReconnectOptions = {}) {
  const {
    onFocus,
    onVisible,
    onOnline,
    invalidateQueries = false,
    queryKeys,
    reconnectDelay = 1000,
    minRefreshInterval = 60000,
  } = options;

  const lastFocusTime = useRef<number>(Date.now());
  const lastHiddenTime = useRef<number>(0);

  const handleRefresh = useCallback(() => {
    const now = Date.now();
    
    if (now - lastFocusTime.current < minRefreshInterval) {
      return;
    }
    
    if (lastHiddenTime.current > 0 && now - lastHiddenTime.current < 30000) {
      return;
    }
    
    lastFocusTime.current = now;

    if (invalidateQueries) {
      setTimeout(() => {
        if (queryKeys && queryKeys.length > 0) {
          queryKeys.forEach(key => {
            queryClient.invalidateQueries({ queryKey: [key] });
          });
        }
      }, reconnectDelay);
    }
  }, [invalidateQueries, queryKeys, reconnectDelay, minRefreshInterval]);

  const handleFocus = useCallback(() => {
    onFocus?.();
    handleRefresh();
  }, [onFocus, handleRefresh]);

  const handleVisibilityChange = useCallback(() => {
    if (document.visibilityState === 'hidden') {
      lastHiddenTime.current = Date.now();
    } else if (document.visibilityState === 'visible') {
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
