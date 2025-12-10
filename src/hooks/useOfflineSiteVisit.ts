import { useState, useCallback, useEffect } from 'react';
import { v4 as uuid } from 'uuid';
import {
  addPendingSync,
  saveSiteVisitOffline,
  getOfflineSiteVisit,
  updateSiteVisitOffline,
  getUnsyncedSiteVisits,
  cacheSiteData,
  getCachedSiteData,
  getOfflineStats,
  type OfflineSiteVisit,
  type PendingSyncAction,
} from '@/lib/offline-db';
import { syncManager } from '@/lib/sync-manager';
import { supabase } from '@/integrations/supabase/client';

export interface SiteVisitData {
  siteEntryId: string;
  siteName: string;
  siteCode: string;
  state: string;
  locality: string;
  targetCoordinates?: { lat: number; lng: number };
}

export interface ClaimParams {
  siteEntryId: string;
  userId: string;
  isDispatchedSite?: boolean;
  enumeratorFee?: number;
  transportFee?: number;
  totalCost?: number;
  classificationLevel?: string;
  roleScope?: string;
  feeSource?: string;
}

export interface StartParams {
  siteEntryId: string;
  userId: string;
  location?: { lat: number; lng: number; accuracy?: number };
}

export interface CompleteParams {
  siteEntryId: string;
  userId: string;
  location?: { lat: number; lng: number; accuracy?: number };
  notes?: string;
  photos?: string[];
}

interface OfflineSiteVisitState {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  lastSyncAt: Date | null;
}

export function useOfflineSiteVisit() {
  const [state, setState] = useState<OfflineSiteVisitState>({
    isOnline: navigator.onLine,
    pendingCount: 0,
    isSyncing: false,
    lastSyncAt: null,
  });

  useEffect(() => {
    const handleOnline = () => setState(s => ({ ...s, isOnline: true }));
    const handleOffline = () => setState(s => ({ ...s, isOnline: false }));

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubProgress = syncManager.onProgress(progress => {
      setState(s => ({
        ...s,
        isSyncing: progress.isRunning,
        lastSyncAt: progress.lastSyncAt,
      }));
    });

    const refreshStats = async () => {
      try {
        const stats = await getOfflineStats();
        setState(s => ({
          ...s,
          pendingCount: stats.pendingActions + stats.unsyncedVisits,
        }));
      } catch (error) {
        console.error('Failed to get offline stats:', error);
      }
    };

    refreshStats();
    const interval = setInterval(refreshStats, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubProgress();
      clearInterval(interval);
    };
  }, []);

  const claimSiteVisit = useCallback(async (params: ClaimParams): Promise<{ success: boolean; offline: boolean; error?: string }> => {
    const { siteEntryId, userId, isDispatchedSite, enumeratorFee, transportFee, totalCost, classificationLevel, roleScope, feeSource } = params;

    if (navigator.onLine) {
      try {
        if (isDispatchedSite) {
          const { data, error } = await supabase.rpc('claim_site_visit', {
            p_site_id: siteEntryId,
            p_user_id: userId,
            p_enumerator_fee: enumeratorFee || null,
            p_total_cost: totalCost || null,
            p_classification_level: classificationLevel || null,
            p_role_scope: roleScope || null,
            p_fee_source: feeSource || 'budget'
          });

          if (error) throw error;

          const result = data as { success: boolean; error?: string; message: string };
          if (!result.success) {
            throw new Error(result.message || result.error || 'Claim failed');
          }
        } else {
          const { error } = await supabase
            .from('mmp_site_entries')
            .update({
              status: 'accepted',
              accepted_by: userId,
              accepted_at: new Date().toISOString(),
              enumerator_fee: enumeratorFee,
              transport_fee: transportFee,
              cost: totalCost,
            })
            .eq('id', siteEntryId);

          if (error) throw error;
        }

        return { success: true, offline: false };
      } catch (error) {
        console.error('Online claim failed:', error);
        return { success: false, offline: false, error: error instanceof Error ? error.message : 'Claim failed' };
      }
    }

    try {
      await addPendingSync({
        type: 'site_visit_claim',
        payload: {
          siteEntryId,
          userId,
          isDispatchedSite,
          enumeratorFee,
          transportFee,
          totalCost,
          classificationLevel,
          roleScope,
          feeSource,
          claimedAt: new Date().toISOString(),
        },
      });

      return { success: true, offline: true };
    } catch (error) {
      console.error('Offline claim save failed:', error);
      return { success: false, offline: true, error: 'Failed to save offline' };
    }
  }, []);

  const startSiteVisit = useCallback(async (
    siteData: SiteVisitData,
    params: StartParams
  ): Promise<{ success: boolean; offline: boolean; visitId?: string; error?: string }> => {
    const { siteEntryId, userId, location } = params;
    const startedAt = new Date().toISOString();

    if (navigator.onLine) {
      try {
        const { error } = await supabase
          .from('mmp_site_entries')
          .update({
            status: 'In Progress',
            visit_started_at: startedAt,
            visit_started_by: userId,
            additional_data: {
              start_location: location,
            },
          })
          .eq('id', siteEntryId);

        if (error) throw error;

        const visitId = await saveSiteVisitOffline({
          siteEntryId,
          siteName: siteData.siteName,
          siteCode: siteData.siteCode,
          state: siteData.state,
          locality: siteData.locality,
          status: 'started',
          startedAt,
          startLocation: location,
        });

        await updateSiteVisitOffline(visitId, { synced: true, syncedAt: new Date().toISOString() });

        return { success: true, offline: false, visitId };
      } catch (error) {
        console.error('Online start failed, saving offline:', error);
      }
    }

    try {
      const visitId = await saveSiteVisitOffline({
        siteEntryId,
        siteName: siteData.siteName,
        siteCode: siteData.siteCode,
        state: siteData.state,
        locality: siteData.locality,
        status: 'started',
        startedAt,
        startLocation: location,
      });

      await addPendingSync({
        type: 'site_visit_start',
        payload: {
          siteEntryId,
          userId,
          startedAt,
          location,
        },
      });

      return { success: true, offline: true, visitId };
    } catch (error) {
      console.error('Offline start save failed:', error);
      return { success: false, offline: true, error: 'Failed to save offline' };
    }
  }, []);

  const completeSiteVisit = useCallback(async (
    params: CompleteParams
  ): Promise<{ success: boolean; offline: boolean; error?: string }> => {
    const { siteEntryId, userId, location, notes, photos } = params;
    const completedAt = new Date().toISOString();

    if (navigator.onLine) {
      try {
        const { data: existing, error: fetchError } = await supabase
          .from('mmp_site_entries')
          .select('additional_data')
          .eq('id', siteEntryId)
          .single();

        if (fetchError) throw fetchError;

        const { error } = await supabase
          .from('mmp_site_entries')
          .update({
            status: 'Completed',
            visit_completed_at: completedAt,
            visit_completed_by: userId,
            notes,
            additional_data: {
              ...(existing?.additional_data || {}),
              end_location: location,
              photos,
            },
          })
          .eq('id', siteEntryId);

        if (error) throw error;

        const offlineVisit = await getOfflineSiteVisit(siteEntryId);
        if (offlineVisit) {
          await updateSiteVisitOffline(offlineVisit.id, {
            status: 'completed',
            completedAt,
            endLocation: location,
            notes,
            photos,
            synced: true,
            syncedAt: new Date().toISOString(),
          });
        }

        return { success: true, offline: false };
      } catch (error) {
        console.error('Online complete failed, saving offline:', error);
      }
    }

    try {
      const offlineVisit = await getOfflineSiteVisit(siteEntryId);
      if (offlineVisit) {
        await updateSiteVisitOffline(offlineVisit.id, {
          status: 'completed',
          completedAt,
          endLocation: location,
          notes,
          photos,
          synced: false,
        });
      } else {
        await saveSiteVisitOffline({
          siteEntryId,
          siteName: 'Unknown',
          siteCode: 'Unknown',
          state: '',
          locality: '',
          status: 'completed',
          startedAt: new Date().toISOString(),
          completedAt,
          endLocation: location,
          notes,
          photos,
        });
      }

      await addPendingSync({
        type: 'site_visit_complete',
        payload: {
          siteEntryId,
          userId,
          completedAt,
          location,
          notes,
          photos,
        },
      });

      return { success: true, offline: true };
    } catch (error) {
      console.error('Offline complete save failed:', error);
      return { success: false, offline: true, error: 'Failed to save offline' };
    }
  }, []);

  const getActiveVisit = useCallback(async (siteEntryId: string): Promise<OfflineSiteVisit | null> => {
    try {
      const visit = await getOfflineSiteVisit(siteEntryId);
      return visit || null;
    } catch (error) {
      console.error('Failed to get active visit:', error);
      return null;
    }
  }, []);

  const getAllPendingVisits = useCallback(async (): Promise<OfflineSiteVisit[]> => {
    try {
      return await getUnsyncedSiteVisits();
    } catch (error) {
      console.error('Failed to get pending visits:', error);
      return [];
    }
  }, []);

  const cacheSiteForOffline = useCallback(async (siteId: string, data: any, ttlMinutes = 60) => {
    try {
      await cacheSiteData(`site_${siteId}`, data, ttlMinutes);
    } catch (error) {
      console.error('Failed to cache site data:', error);
    }
  }, []);

  const getCachedSite = useCallback(async (siteId: string) => {
    try {
      return await getCachedSiteData(`site_${siteId}`);
    } catch (error) {
      console.error('Failed to get cached site:', error);
      return null;
    }
  }, []);

  const triggerSync = useCallback(async () => {
    if (!navigator.onLine) return { success: false, error: 'Offline' };
    
    try {
      const result = await syncManager.forceSync();
      return { success: result.success, synced: result.synced, failed: result.failed };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Sync failed' };
    }
  }, []);

  return {
    ...state,
    claimSiteVisit,
    startSiteVisit,
    completeSiteVisit,
    getActiveVisit,
    getAllPendingVisits,
    cacheSiteForOffline,
    getCachedSite,
    triggerSync,
  };
}

export function useOfflineAwareFetch<T>(
  fetcher: () => Promise<T>,
  cacheKey: string,
  options?: { ttlMinutes?: number; enabled?: boolean }
) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (options?.enabled === false) {
      setIsLoading(false);
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      if (!navigator.onLine) {
        try {
          const cached = await getCachedSiteData<T>(cacheKey);
          if (cached) {
            setData(cached);
          }
        } catch (e) {
          setError(e instanceof Error ? e : new Error('Failed to load cached data'));
        }
        setIsLoading(false);
        return;
      }

      try {
        const result = await fetcher();
        setData(result);
        await cacheSiteData(cacheKey, result, options?.ttlMinutes || 60);
      } catch (e) {
        const cached = await getCachedSiteData<T>(cacheKey);
        if (cached) {
          setData(cached);
        } else {
          setError(e instanceof Error ? e : new Error('Fetch failed'));
        }
      }

      setIsLoading(false);
    };

    fetchData();
  }, [fetcher, cacheKey, options?.enabled, options?.ttlMinutes]);

  const refetch = useCallback(async () => {
    if (!navigator.onLine) return;

    setIsLoading(true);
    try {
      const result = await fetcher();
      setData(result);
      await cacheSiteData(cacheKey, result, options?.ttlMinutes || 60);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Fetch failed'));
    }
    setIsLoading(false);
  }, [fetcher, cacheKey, options?.ttlMinutes]);

  return { data, isLoading, isOffline, error, refetch };
}
