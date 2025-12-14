import { useState, useEffect, useCallback } from 'react';
import { 
  offlinePrefetchService, 
  type PrefetchProgress, 
  type PrefetchResult,
  getCachedProfiles,
  getCachedSites,
  getCachedHubs,
  getCachedStates,
  getCachedLocalities,
  getOfflineDataStats,
} from '@/lib/offline-prefetch';
import { getCachedSiteData } from '@/lib/offline-db';

interface OfflineDataStats {
  profiles: number;
  sites: number;
  hubs: number;
  states: number;
  localities: number;
  mmps: number;
  lastPrefetchAt: Date | null;
}

interface UseOfflineDataReturn {
  stats: OfflineDataStats | null;
  isDownloading: boolean;
  downloadProgress: PrefetchProgress | null;
  lastResult: PrefetchResult | null;
  downloadForOffline: (userId?: string) => Promise<PrefetchResult>;
  getProfiles: <T = any>() => Promise<T[]>;
  getSites: <T = any>() => Promise<T[]>;
  getHubs: <T = any>() => Promise<T[]>;
  getStates: <T = any>() => Promise<T[]>;
  getLocalities: <T = any>() => Promise<T[]>;
  getCachedData: <T = any>(key: string) => Promise<T | null>;
  refreshStats: () => Promise<void>;
  hasOfflineData: boolean;
}

export function useOfflineData(): UseOfflineDataReturn {
  const [stats, setStats] = useState<OfflineDataStats | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<PrefetchProgress | null>(null);
  const [lastResult, setLastResult] = useState<PrefetchResult | null>(null);

  const refreshStats = useCallback(async () => {
    try {
      const newStats = await getOfflineDataStats();
      setStats(newStats);
    } catch (error) {
      console.error('[useOfflineData] Failed to get stats:', error);
    }
  }, []);

  useEffect(() => {
    refreshStats();

    const unsubProgress = offlinePrefetchService.onProgress((progress) => {
      setDownloadProgress(progress);
      setIsDownloading(progress.phase !== 'idle' && progress.phase !== 'complete');
    });

    return () => {
      unsubProgress();
    };
  }, [refreshStats]);

  const downloadForOffline = useCallback(async (userId?: string): Promise<PrefetchResult> => {
    setIsDownloading(true);
    try {
      const result = await offlinePrefetchService.prefetchAll(userId);
      setLastResult(result);
      await refreshStats();
      return result;
    } finally {
      setIsDownloading(false);
    }
  }, [refreshStats]);

  const getProfiles = useCallback(async <T = any>(): Promise<T[]> => {
    return getCachedProfiles<T>();
  }, []);

  const getSites = useCallback(async <T = any>(): Promise<T[]> => {
    return getCachedSites<T>();
  }, []);

  const getHubs = useCallback(async <T = any>(): Promise<T[]> => {
    return getCachedHubs<T>();
  }, []);

  const getStates = useCallback(async <T = any>(): Promise<T[]> => {
    return getCachedStates<T>();
  }, []);

  const getLocalities = useCallback(async <T = any>(): Promise<T[]> => {
    return getCachedLocalities<T>();
  }, []);

  const getCachedData = useCallback(async <T = any>(key: string): Promise<T | null> => {
    return getCachedSiteData<T>(key);
  }, []);

  const hasOfflineData = stats 
    ? (stats.profiles > 0 || stats.sites > 0 || stats.hubs > 0)
    : false;

  return {
    stats,
    isDownloading,
    downloadProgress,
    lastResult,
    downloadForOffline,
    getProfiles,
    getSites,
    getHubs,
    getStates,
    getLocalities,
    getCachedData,
    refreshStats,
    hasOfflineData,
  };
}
