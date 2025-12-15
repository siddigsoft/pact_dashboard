import { supabase } from '@/integrations/supabase/client';
import { 
  getOfflineDB, 
  cacheSiteData, 
  offlineCacheService,
  type CacheStoreName 
} from './offline-db';

export interface PrefetchProgress {
  phase: 'idle' | 'profiles' | 'sites' | 'geographic' | 'mmps' | 'complete';
  current: string | null;
  total: number;
  completed: number;
  errors: string[];
}

export interface PrefetchResult {
  success: boolean;
  cached: {
    profiles: number;
    sites: number;
    hubs: number;
    states: number;
    localities: number;
    mmps: number;
  };
  errors: string[];
  duration: number;
}

type ProgressCallback = (progress: PrefetchProgress) => void;

const CACHE_TTL = {
  profiles: 1440,
  sites: 2880,
  geographic: 10080,
  mmps: 480,
};

class OfflinePrefetchService {
  private progressCallbacks: Set<ProgressCallback> = new Set();
  private isRunning = false;
  private progress: PrefetchProgress = {
    phase: 'idle',
    current: null,
    total: 0,
    completed: 0,
    errors: [],
  };

  onProgress(callback: ProgressCallback): () => void {
    this.progressCallbacks.add(callback);
    callback({ ...this.progress });
    return () => this.progressCallbacks.delete(callback);
  }

  private notifyProgress() {
    this.progressCallbacks.forEach(cb => cb({ ...this.progress }));
  }

  private updateProgress(updates: Partial<PrefetchProgress>) {
    this.progress = { ...this.progress, ...updates };
    this.notifyProgress();
  }

  async prefetchAll(userId?: string): Promise<PrefetchResult> {
    if (this.isRunning) {
      return {
        success: false,
        cached: { profiles: 0, sites: 0, hubs: 0, states: 0, localities: 0, mmps: 0 },
        errors: ['Prefetch already in progress'],
        duration: 0,
      };
    }

    const startTime = Date.now();
    this.isRunning = true;
    const errors: string[] = [];
    const cached = {
      profiles: 0,
      sites: 0,
      hubs: 0,
      states: 0,
      localities: 0,
      mmps: 0,
    };

    try {
      // Phase 1: Profiles
      this.updateProgress({ phase: 'profiles', current: 'Downloading team profiles...', total: 0, completed: 0 });
      const profileResult = await this.prefetchProfiles();
      cached.profiles = profileResult.count;
      if (profileResult.errors.length > 0) {
        errors.push(...profileResult.errors);
        return {
          success: false,
          cached,
          errors,
          duration: Date.now() - startTime,
        };
      }

      // Phase 2: Sites - abort if this fails
      this.updateProgress({ phase: 'sites', current: 'Downloading assigned sites...', completed: 0 });
      const siteResult = await this.prefetchSites(userId);
      cached.sites = siteResult.count;
      if (siteResult.errors.length > 0) {
        errors.push(...siteResult.errors);
        return {
          success: false,
          cached,
          errors,
          duration: Date.now() - startTime,
        };
      }

      // Phase 3: Geographic data - abort if this fails
      this.updateProgress({ phase: 'geographic', current: 'Downloading geographic data...' });
      const geoResult = await this.prefetchGeographicData();
      cached.hubs = geoResult.hubs;
      cached.states = geoResult.states;
      cached.localities = geoResult.localities;
      if (geoResult.errors.length > 0) {
        errors.push(...geoResult.errors);
        return {
          success: false,
          cached,
          errors,
          duration: Date.now() - startTime,
        };
      }

      // Phase 4: MMPs - abort if this fails
      this.updateProgress({ phase: 'mmps', current: 'Downloading MMPs...' });
      const mmpResult = await this.prefetchMMPs();
      cached.mmps = mmpResult.count;
      if (mmpResult.errors.length > 0) {
        errors.push(...mmpResult.errors);
        return {
          success: false,
          cached,
          errors,
          duration: Date.now() - startTime,
        };
      }

      this.updateProgress({ phase: 'complete', current: null });

      // Persist lastPrefetchAt timestamp only on complete success
      await this.saveLastPrefetchTimestamp();

      return {
        success: true,
        cached,
        errors: [],
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown prefetch error';
      errors.push(errorMsg);
      return {
        success: false,
        cached,
        errors,
        duration: Date.now() - startTime,
      };
    } finally {
      this.isRunning = false;
      this.updateProgress({ phase: 'idle', current: null });
    }
  }

  async prefetchProfiles(): Promise<{ count: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, phone_number, hub, assigned_states, location, avatar_url, status')
        .in('status', ['active', 'pending']);

      if (error) throw error;

      if (profiles && profiles.length > 0) {
        const db = await getOfflineDB();
        const now = Date.now();
        const expiresAt = now + CACHE_TTL.profiles * 60 * 1000;

        const tx = db.transaction('genericCache', 'readwrite');
        for (const profile of profiles) {
          await tx.store.put({
            id: `profile:${profile.id}`,
            data: profile,
            _version: 1,
            _cachedAt: now,
            _expiresAt: expiresAt,
            _storeType: 'profiles',
          });
          count++;
        }
        await tx.done;

        await cacheSiteData('all_profiles', profiles, CACHE_TTL.profiles);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`Profiles: ${msg}`);
    }

    return { count, errors };
  }

  async prefetchSites(userId?: string): Promise<{ count: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;
    const PAGE_SIZE = 500;
    let offset = 0;
    let hasMore = true;

    try {
      const db = await getOfflineDB();
      const now = Date.now();
      const expiresAt = now + CACHE_TTL.sites * 60 * 1000;

      // Get accurate total count upfront using Supabase head count query
      let countQuery = supabase
        .from('mmp_site_entries')
        .select('*', { count: 'exact', head: true })
        .in('status', ['Pending', 'In Progress', 'Dispatched']);

      if (userId) {
        countQuery = countQuery.or(`assigned_to.eq.${userId},claimed_by.eq.${userId}`);
      }

      const { count: totalCount, error: countError } = await countQuery;
      
      if (countError) throw countError;
      
      const total = totalCount || 0;
      this.updateProgress({ total });

      if (total === 0) {
        return { count: 0, errors: [] };
      }

      // Paginated fetch - process each page immediately to avoid memory issues
      while (hasMore) {
        let query = supabase
          .from('mmp_site_entries')
          .select(`
            id, site_name, site_code, state, locality, status, 
            planned_date, actual_date, notes, assigned_to,
            visit_started_at, visit_completed_at, gps_coordinates,
            additional_data
          `)
          .in('status', ['Pending', 'In Progress', 'Dispatched'])
          .range(offset, offset + PAGE_SIZE - 1);

        if (userId) {
          query = query.or(`assigned_to.eq.${userId},claimed_by.eq.${userId}`);
        }

        const { data: sites, error } = await query;

        // Stop on first error - don't continue with partial data
        if (error) throw error;

        if (sites && sites.length > 0) {
          // Write each page directly to IndexedDB
          const tx = db.transaction('genericCache', 'readwrite');
          for (const site of sites) {
            await tx.store.put({
              id: `site:${site.id}`,
              data: site,
              _version: 1,
              _cachedAt: now,
              _expiresAt: expiresAt,
              _storeType: 'sites',
            });
            count++;
          }
          await tx.done;

          this.updateProgress({ completed: count });
          offset += sites.length;
          hasMore = sites.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }

      // Cache summary for quick access
      if (count > 0) {
        await cacheSiteData('assigned_sites_count', count, CACHE_TTL.sites);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`Sites: ${msg}`);
    }

    return { count, errors };
  }

  async prefetchGeographicData(): Promise<{ hubs: number; states: number; localities: number; errors: string[] }> {
    const errors: string[] = [];
    let hubs = 0;
    let states = 0;
    let localities = 0;

    try {
      const { data: hubData, error: hubError } = await supabase
        .from('hubs')
        .select('*');

      if (hubError) throw hubError;

      if (hubData) {
        const db = await getOfflineDB();
        const now = Date.now();
        const expiresAt = now + CACHE_TTL.geographic * 60 * 1000;

        const tx = db.transaction('genericCache', 'readwrite');
        for (const hub of hubData) {
          await tx.store.put({
            id: `hub:${hub.id}`,
            data: hub,
            _version: 1,
            _cachedAt: now,
            _expiresAt: expiresAt,
            _storeType: 'hubs',
          });
          hubs++;
        }
        await tx.done;
        await cacheSiteData('all_hubs', hubData, CACHE_TTL.geographic);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`Hubs: ${msg}`);
    }

    try {
      const { data: stateData, error: stateError } = await supabase
        .from('states')
        .select('*');

      if (stateError) throw stateError;

      if (stateData) {
        const db = await getOfflineDB();
        const now = Date.now();
        const expiresAt = now + CACHE_TTL.geographic * 60 * 1000;

        const tx = db.transaction('genericCache', 'readwrite');
        for (const state of stateData) {
          await tx.store.put({
            id: `state:${state.id}`,
            data: state,
            _version: 1,
            _cachedAt: now,
            _expiresAt: expiresAt,
            _storeType: 'states',
          });
          states++;
        }
        await tx.done;
        await cacheSiteData('all_states', stateData, CACHE_TTL.geographic);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`States: ${msg}`);
    }

    try {
      const { data: localityData, error: localityError } = await supabase
        .from('localities')
        .select('*');

      if (localityError) throw localityError;

      if (localityData) {
        const db = await getOfflineDB();
        const now = Date.now();
        const expiresAt = now + CACHE_TTL.geographic * 60 * 1000;

        const tx = db.transaction('genericCache', 'readwrite');
        for (const locality of localityData) {
          await tx.store.put({
            id: `locality:${locality.id}`,
            data: locality,
            _version: 1,
            _cachedAt: now,
            _expiresAt: expiresAt,
            _storeType: 'localities',
          });
          localities++;
        }
        await tx.done;
        await cacheSiteData('all_localities', localityData, CACHE_TTL.geographic);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`Localities: ${msg}`);
    }

    return { hubs, states, localities, errors };
  }

  async prefetchMMPs(): Promise<{ count: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    try {
      const { data: mmps, error } = await supabase
        .from('mmp')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      if (mmps && mmps.length > 0) {
        for (const mmp of mmps) {
          await offlineCacheService.cache('mmps', mmp.id, mmp, { ttlMinutes: CACHE_TTL.mmps });
          count++;
        }
        await cacheSiteData('active_mmps', mmps, CACHE_TTL.mmps);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`MMPs: ${msg}`);
    }

    return { count, errors };
  }

  async getCachedByType<T>(storeType: string): Promise<T[]> {
    try {
      const db = await getOfflineDB();
      const all = await db.getAllFromIndex('genericCache', 'by-storeType', storeType);
      const now = Date.now();
      
      return all
        .filter(item => item._expiresAt >= now)
        .map(item => item.data as T);
    } catch (error) {
      console.error(`[OfflinePrefetch] Failed to get cached ${storeType}:`, error);
      return [];
    }
  }

  async getCachedProfiles<T = any>(): Promise<T[]> {
    return this.getCachedByType<T>('profiles');
  }

  async getCachedSites<T = any>(): Promise<T[]> {
    return this.getCachedByType<T>('sites');
  }

  async getCachedHubs<T = any>(): Promise<T[]> {
    return this.getCachedByType<T>('hubs');
  }

  async getCachedStates<T = any>(): Promise<T[]> {
    return this.getCachedByType<T>('states');
  }

  async getCachedLocalities<T = any>(): Promise<T[]> {
    return this.getCachedByType<T>('localities');
  }

  async getOfflineDataStats(): Promise<{
    profiles: number;
    sites: number;
    hubs: number;
    states: number;
    localities: number;
    mmps: number;
    lastPrefetchAt: Date | null;
  }> {
    try {
      const db = await getOfflineDB();
      const now = Date.now();
      
      const [profiles, sites, hubs, states, localities, mmps] = await Promise.all([
        db.getAllFromIndex('genericCache', 'by-storeType', 'profiles').then(r => r.filter(i => i._expiresAt >= now).length),
        db.getAllFromIndex('genericCache', 'by-storeType', 'sites').then(r => r.filter(i => i._expiresAt >= now).length),
        db.getAllFromIndex('genericCache', 'by-storeType', 'hubs').then(r => r.filter(i => i._expiresAt >= now).length),
        db.getAllFromIndex('genericCache', 'by-storeType', 'states').then(r => r.filter(i => i._expiresAt >= now).length),
        db.getAllFromIndex('genericCache', 'by-storeType', 'localities').then(r => r.filter(i => i._expiresAt >= now).length),
        db.count('mmps'),
      ]);

      const appState = await db.get('appState', 'lastPrefetchAt');
      
      return {
        profiles,
        sites,
        hubs,
        states,
        localities,
        mmps,
        lastPrefetchAt: appState?.value ? new Date(appState.value) : null,
      };
    } catch (error) {
      console.error('[OfflinePrefetch] Failed to get stats:', error);
      return {
        profiles: 0,
        sites: 0,
        hubs: 0,
        states: 0,
        localities: 0,
        mmps: 0,
        lastPrefetchAt: null,
      };
    }
  }

  async saveLastPrefetchTimestamp(): Promise<void> {
    try {
      const db = await getOfflineDB();
      await db.put('appState', {
        id: 'lastPrefetchAt',
        value: Date.now(),
      });
    } catch (error) {
      console.error('[OfflinePrefetch] Failed to save lastPrefetchAt:', error);
    }
  }

  isRunningPrefetch(): boolean {
    return this.isRunning;
  }

  getProgress(): PrefetchProgress {
    return { ...this.progress };
  }
}

export const offlinePrefetchService = new OfflinePrefetchService();

export async function prefetchForOffline(userId?: string): Promise<PrefetchResult> {
  return offlinePrefetchService.prefetchAll(userId);
}

export async function getCachedProfiles<T = any>(): Promise<T[]> {
  return offlinePrefetchService.getCachedProfiles<T>();
}

export async function getCachedSites<T = any>(): Promise<T[]> {
  return offlinePrefetchService.getCachedSites<T>();
}

export async function getCachedHubs<T = any>(): Promise<T[]> {
  return offlinePrefetchService.getCachedHubs<T>();
}

export async function getCachedStates<T = any>(): Promise<T[]> {
  return offlinePrefetchService.getCachedStates<T>();
}

export async function getCachedLocalities<T = any>(): Promise<T[]> {
  return offlinePrefetchService.getCachedLocalities<T>();
}

export async function getOfflineDataStats() {
  return offlinePrefetchService.getOfflineDataStats();
}
