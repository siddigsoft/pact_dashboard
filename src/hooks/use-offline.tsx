import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { 
  getOfflineStats,
  saveSiteVisitOffline,
  getOfflineSiteVisit,
  updateSiteVisitOffline,
  saveLocationOffline,
  addPendingSync,
  cacheSiteData,
  getCachedSiteData,
  cleanExpiredCache,
  type OfflineSiteVisit,
} from '@/lib/offline-db';
import { syncManager, setupAutoSync, type SyncProgress, type SyncResult } from '@/lib/sync-manager';

interface OfflineStats {
  pendingActions: number;
  unsyncedVisits: number;
  unsyncedLocations: number;
  cachedItems: number;
}

interface UseOfflineReturn {
  isOnline: boolean;
  stats: OfflineStats;
  syncProgress: SyncProgress | null;
  isSyncing: boolean;
  lastSyncResult: SyncResult | null;
  syncNow: () => Promise<SyncResult>;
  startSiteVisitOffline: (data: {
    siteEntryId: string;
    siteName: string;
    siteCode: string;
    state: string;
    locality: string;
    location?: { lat: number; lng: number; accuracy?: number };
  }) => Promise<string>;
  completeSiteVisitOffline: (
    siteEntryId: string,
    data: {
      notes?: string;
      photos?: string[];
      location?: { lat: number; lng: number; accuracy?: number };
    }
  ) => Promise<boolean>;
  getOfflineVisit: (siteEntryId: string) => Promise<OfflineSiteVisit | undefined>;
  saveLocation: (location: { lat: number; lng: number; accuracy?: number }) => Promise<void>;
  queuePhotoUpload: (siteEntryId: string, photoData: string, fileName: string) => Promise<void>;
  cacheData: <T>(key: string, data: T, ttlMinutes?: number) => Promise<void>;
  getCached: <T>(key: string) => Promise<T | null>;
  refreshStats: () => Promise<void>;
}

export function useOffline(): UseOfflineReturn {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [stats, setStats] = useState<OfflineStats>({
    pendingActions: 0,
    unsyncedVisits: 0,
    unsyncedLocations: 0,
    cachedItems: 0,
  });
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const { toast } = useToast();

  const refreshStats = useCallback(async () => {
    try {
      const newStats = await getOfflineStats();
      setStats(newStats);
    } catch (error) {
      console.error('[useOffline] Failed to get stats:', error);
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast({
        title: 'Back Online',
        description: 'Your connection has been restored. Syncing data...',
        duration: 3000,
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast({
        title: 'You are Offline',
        description: 'Changes will be saved locally and synced when back online.',
        variant: 'destructive',
        duration: 5000,
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubProgress = syncManager.onProgress((progress) => {
      setSyncProgress(progress);
      setIsSyncing(progress.isRunning);
    });

    const unsubComplete = syncManager.onComplete((result) => {
      setLastSyncResult(result);
      refreshStats();
      
      if (result.synced > 0 || result.failed > 0) {
        toast({
          title: result.success ? 'Sync Complete' : 'Sync Completed with Errors',
          description: `Synced: ${result.synced}, Failed: ${result.failed}`,
          variant: result.success ? 'default' : 'destructive',
          duration: 4000,
        });
      }
    });

    const cleanupAutoSync = setupAutoSync();

    refreshStats();
    cleanExpiredCache().catch(console.error);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubProgress();
      unsubComplete();
      cleanupAutoSync();
    };
  }, [toast, refreshStats]);

  const syncNow = useCallback(async (): Promise<SyncResult> => {
    const result = await syncManager.syncAll();
    return result;
  }, []);

  const startSiteVisitOffline = useCallback(async (data: {
    siteEntryId: string;
    siteName: string;
    siteCode: string;
    state: string;
    locality: string;
    location?: { lat: number; lng: number; accuracy?: number };
  }): Promise<string> => {
    const id = await saveSiteVisitOffline({
      siteEntryId: data.siteEntryId,
      siteName: data.siteName,
      siteCode: data.siteCode,
      state: data.state,
      locality: data.locality,
      status: 'started',
      startedAt: new Date().toISOString(),
      startLocation: data.location,
    });
    await refreshStats();
    return id;
  }, [refreshStats]);

  const completeSiteVisitOffline = useCallback(async (
    siteEntryId: string,
    data: {
      notes?: string;
      photos?: string[];
      location?: { lat: number; lng: number; accuracy?: number };
    }
  ): Promise<boolean> => {
    const visit = await getOfflineSiteVisit(siteEntryId);
    if (!visit) {
      console.error('[useOffline] No offline visit found for:', siteEntryId);
      return false;
    }

    await updateSiteVisitOffline(visit.id, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      notes: data.notes,
      photos: data.photos,
      endLocation: data.location,
    });

    await refreshStats();
    return true;
  }, [refreshStats]);

  const getOfflineVisit = useCallback(async (siteEntryId: string): Promise<OfflineSiteVisit | undefined> => {
    return getOfflineSiteVisit(siteEntryId);
  }, []);

  const saveLocation = useCallback(async (location: { lat: number; lng: number; accuracy?: number }) => {
    const { data: session } = await (await import('@/integrations/supabase/client')).supabase.auth.getSession();
    if (!session?.session?.user?.id) return;

    await saveLocationOffline({
      userId: session.session.user.id,
      lat: location.lat,
      lng: location.lng,
      accuracy: location.accuracy,
      timestamp: Date.now(),
    });

    await refreshStats();
  }, [refreshStats]);

  const queuePhotoUpload = useCallback(async (siteEntryId: string, photoData: string, fileName: string) => {
    await addPendingSync({
      type: 'photo_upload',
      payload: { siteEntryId, photoData, fileName },
    });
    await refreshStats();
  }, [refreshStats]);

  const cacheData = useCallback(async <T,>(key: string, data: T, ttlMinutes: number = 60) => {
    await cacheSiteData(key, data, ttlMinutes);
    await refreshStats();
  }, [refreshStats]);

  const getCached = useCallback(async <T,>(key: string): Promise<T | null> => {
    return getCachedSiteData<T>(key);
  }, []);

  return {
    isOnline,
    stats,
    syncProgress,
    isSyncing,
    lastSyncResult,
    syncNow,
    startSiteVisitOffline,
    completeSiteVisitOffline,
    getOfflineVisit,
    saveLocation,
    queuePhotoUpload,
    cacheData,
    getCached,
    refreshStats,
  };
}
