import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { syncManager, type SyncProgress, type SyncResult, type ConflictResolution } from '@/lib/sync-manager';
import { getOfflineStats } from '@/lib/offline-db';

export interface OfflineStats {
  pendingActions: number;
  unsyncedVisits: number;
  unsyncedLocations: number;
  cachedItems: number;
}

export interface SyncStatusState {
  isOnline: boolean;
  isSyncing: boolean;
  progress: SyncProgress;
  lastResult: SyncResult | null;
  stats: OfflineStats | null;
  pendingCount: number;
  justCameOnline: boolean;
  hasErrors: boolean;
}

interface SyncStatusContextValue extends SyncStatusState {
  sync: () => Promise<SyncResult>;
  forceSync: () => Promise<SyncResult>;
  refreshStats: () => Promise<void>;
  setConflictResolution: (resolution: ConflictResolution) => void;
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

  const refreshStats = useCallback(async () => {
    try {
      const offlineStats = await getOfflineStats();
      setStats(offlineStats);
    } catch (error) {
      console.error('[SyncStatusContext] Failed to get offline stats:', error);
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setJustCameOnline(true);
      onNetworkChange?.(true);
      setTimeout(() => setJustCameOnline(false), ONLINE_NOTIFICATION_DURATION);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setJustCameOnline(false);
      onNetworkChange?.(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubProgress = syncManager.onProgress(setProgress);
    const unsubComplete = syncManager.onComplete((result) => {
      setLastResult(result);
      refreshStats();
      onSyncComplete?.(result);
    });

    refreshStats();
    const statsInterval = setInterval(refreshStats, STATS_REFRESH_INTERVAL);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubProgress();
      unsubComplete();
      clearInterval(statsInterval);
    };
  }, [refreshStats, onSyncComplete, onNetworkChange]);

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
    pendingCount,
    justCameOnline,
    hasErrors,
    sync,
    forceSync,
    refreshStats,
    setConflictResolution,
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
