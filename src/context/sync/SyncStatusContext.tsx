import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { syncManager, type SyncProgress, type SyncResult, type ConflictResolution } from '@/lib/sync-manager';
import { getOfflineStats } from '@/lib/offline-db';

export interface OfflineStats {
  pendingActions: number;
  unsyncedVisits: number;
  unsyncedLocations: number;
  cachedItems: number;
}

export interface CacheStats {
  staticCache: number;
  apiCache: number;
  dynamicCache: number;
}

export interface SyncStatusState {
  isOnline: boolean;
  isSyncing: boolean;
  progress: SyncProgress;
  lastResult: SyncResult | null;
  stats: OfflineStats | null;
  cacheStats: CacheStats | null;
  pendingCount: number;
  justCameOnline: boolean;
  hasErrors: boolean;
  isServingFromCache: boolean;
}

interface SyncStatusContextValue extends SyncStatusState {
  sync: () => Promise<SyncResult>;
  forceSync: () => Promise<SyncResult>;
  refreshStats: () => Promise<void>;
  setConflictResolution: (resolution: ConflictResolution) => void;
  registerBackgroundSync: (tag?: string) => Promise<boolean>;
  clearApiCache: (pattern?: string) => Promise<void>;
  invalidateCacheEntry: (url: string) => Promise<void>;
  prefetchEndpoints: (urls: string[]) => Promise<void>;
}

const SyncStatusContext = createContext<SyncStatusContextValue | null>(null);

const STATS_REFRESH_INTERVAL = 10000;
const ONLINE_NOTIFICATION_DURATION = 5000;

interface SyncStatusProviderProps {
  children: ReactNode;
  onSyncComplete?: (result: SyncResult) => void;
  onNetworkChange?: (isOnline: boolean) => void;
}

export function SyncStatusProvider({ 
  children, 
  onSyncComplete,
  onNetworkChange 
}: SyncStatusProviderProps) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [justCameOnline, setJustCameOnline] = useState(false);
  const [progress, setProgress] = useState<SyncProgress>(syncManager.getProgress());
  const [lastResult, setLastResult] = useState<SyncResult | null>(syncManager.getLastResult());
  const [stats, setStats] = useState<OfflineStats | null>(null);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [isServingFromCache, setIsServingFromCache] = useState(false);

  const refreshStats = useCallback(async () => {
    try {
      const offlineStats = await getOfflineStats();
      setStats(offlineStats);
    } catch (error) {
      console.error('[SyncStatusContext] Failed to get offline stats:', error);
    }
  }, []);

  const sendSWMessage = useCallback((message: any): Promise<any> => {
    return new Promise((resolve) => {
      if (!navigator.serviceWorker?.controller) {
        resolve(null);
        return;
      }
      const messageChannel = new MessageChannel();
      messageChannel.port1.onmessage = (event) => resolve(event.data);
      navigator.serviceWorker.controller.postMessage(message, [messageChannel.port2]);
      setTimeout(() => resolve(null), 3000);
    });
  }, []);

  const registerBackgroundSync = useCallback(async (tag = 'sync-pending-actions'): Promise<boolean> => {
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'TRIGGER_SYNC', tag });
        return true;
      }
      return false;
    } catch (error) {
      console.error('[SyncStatusContext] Failed to register background sync:', error);
      return false;
    }
  }, []);

  const clearApiCache = useCallback(async (pattern?: string): Promise<void> => {
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_API_CACHE', pattern });
    }
  }, []);

  const invalidateCacheEntry = useCallback(async (url: string): Promise<void> => {
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'INVALIDATE_CACHE', url });
    }
  }, []);

  const prefetchEndpoints = useCallback(async (urls: string[]): Promise<void> => {
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'PREFETCH_API', urls });
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setJustCameOnline(true);
      onNetworkChange?.(true);
      registerBackgroundSync('sync-pending-actions');
      setTimeout(() => setJustCameOnline(false), ONLINE_NOTIFICATION_DURATION);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setJustCameOnline(false);
      onNetworkChange?.(false);
    };

    const handleSWMessage = (event: MessageEvent) => {
      const { type } = event.data || {};
      
      switch (type) {
        case 'TRIGGER_SYNC_MANAGER':
          syncManager.syncAll();
          break;
        case 'SERVING_FROM_CACHE':
          setIsServingFromCache(true);
          setTimeout(() => setIsServingFromCache(false), 3000);
          break;
        case 'SYNC_FALLBACK':
          syncManager.syncAll();
          break;
        case 'MUTATION_SUCCESS':
          refreshStats();
          break;
        case 'MUTATION_FAILED':
          refreshStats();
          if (!event.data.syncRegistered) {
            registerBackgroundSync('sync-pending-actions');
          }
          break;
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSWMessage);
    }

    const unsubProgress = syncManager.onProgress(setProgress);
    const unsubComplete = syncManager.onComplete((result) => {
      setLastResult(result);
      refreshStats();
      onSyncComplete?.(result);
    });

    refreshStats();
    sendSWMessage({ type: 'GET_CACHE_STATS' }).then((stats) => {
      if (stats) setCacheStats(stats);
    });
    
    const statsInterval = setInterval(refreshStats, STATS_REFRESH_INTERVAL);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSWMessage);
      }
      unsubProgress();
      unsubComplete();
      clearInterval(statsInterval);
    };
  }, [refreshStats, onSyncComplete, onNetworkChange, registerBackgroundSync, sendSWMessage]);

  const sync = useCallback(async () => {
    return syncManager.syncAll();
  }, []);

  const forceSync = useCallback(async () => {
    return syncManager.forceSync();
  }, []);

  const setConflictResolution = useCallback((resolution: ConflictResolution) => {
    syncManager.setConflictResolution(resolution);
  }, []);

  const pendingCount = stats 
    ? stats.pendingActions + stats.unsyncedVisits + stats.unsyncedLocations 
    : 0;

  const hasErrors = lastResult ? lastResult.failed > 0 : false;

  const value: SyncStatusContextValue = {
    isOnline,
    isSyncing: progress.isRunning,
    progress,
    lastResult,
    stats,
    cacheStats,
    pendingCount,
    justCameOnline,
    hasErrors,
    isServingFromCache,
    sync,
    forceSync,
    refreshStats,
    setConflictResolution,
    registerBackgroundSync,
    clearApiCache,
    invalidateCacheEntry,
    prefetchEndpoints,
  };

  return (
    <SyncStatusContext.Provider value={value}>
      {children}
    </SyncStatusContext.Provider>
  );
}

export function useSyncStatus(): SyncStatusContextValue {
  const context = useContext(SyncStatusContext);
  if (!context) {
    throw new Error('useSyncStatus must be used within a SyncStatusProvider');
  }
  return context;
}

export function useSyncStatusSafe(): SyncStatusContextValue | null {
  return useContext(SyncStatusContext);
}

export function useNetworkStatus() {
  const context = useSyncStatusSafe();
  
  const [fallbackOnline, setFallbackOnline] = useState(navigator.onLine);
  
  useEffect(() => {
    if (context) return;
    
    const handleOnline = () => setFallbackOnline(true);
    const handleOffline = () => setFallbackOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [context]);
  
  return {
    isOnline: context?.isOnline ?? fallbackOnline,
    justCameOnline: context?.justCameOnline ?? false,
  };
}

export function usePendingSync() {
  const context = useSyncStatusSafe();
  
  const [fallbackPending, setFallbackPending] = useState(0);
  
  useEffect(() => {
    if (context) return;
    
    const checkPending = async () => {
      try {
        const stats = await getOfflineStats();
        setFallbackPending(stats.pendingActions + stats.unsyncedVisits + stats.unsyncedLocations);
      } catch {
        setFallbackPending(0);
      }
    };
    
    checkPending();
    const interval = setInterval(checkPending, 10000);
    
    return () => clearInterval(interval);
  }, [context]);
  
  return {
    pendingCount: context?.pendingCount ?? fallbackPending,
    isSyncing: context?.isSyncing ?? false,
    hasErrors: context?.hasErrors ?? false,
  };
}

export type { SyncProgress, SyncResult, ConflictResolution };
