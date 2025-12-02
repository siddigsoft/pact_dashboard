import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface PendingSyncAction {
  id: string;
  type: 'site_visit_start' | 'site_visit_complete' | 'location_update' | 'cost_submission' | 'photo_upload';
  payload: any;
  timestamp: number;
  retries: number;
  status: 'pending' | 'syncing' | 'failed';
  errorMessage?: string;
}

export interface OfflineSiteVisit {
  id: string;
  siteEntryId: string;
  siteName: string;
  siteCode: string;
  state: string;
  locality: string;
  status: 'started' | 'completed';
  startedAt: string;
  completedAt?: string;
  startLocation?: { lat: number; lng: number; accuracy?: number };
  endLocation?: { lat: number; lng: number; accuracy?: number };
  notes?: string;
  photos?: string[];
  synced: boolean;
  syncedAt?: string;
}

export interface CachedLocation {
  id: string;
  userId: string;
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp: number;
  synced: boolean;
}

interface CachedSiteData {
  id: string;
  data: any;
  cachedAt: number;
  expiresAt: number;
}

interface OfflineDBSchema extends DBSchema {
  pendingSync: {
    key: string;
    value: PendingSyncAction;
    indexes: { 'by-type': string; 'by-status': string; 'by-timestamp': number };
  };
  siteVisits: {
    key: string;
    value: OfflineSiteVisit;
    indexes: { 'by-siteEntryId': string; 'by-synced': number; 'by-status': string };
  };
  locations: {
    key: string;
    value: CachedLocation;
    indexes: { 'by-userId': string; 'by-synced': number; 'by-timestamp': number };
  };
  siteCache: {
    key: string;
    value: CachedSiteData;
    indexes: { 'by-expiresAt': number };
  };
  appState: {
    key: string;
    value: { key: string; value: any; updatedAt: number };
  };
}

const DB_NAME = 'pact-offline-db';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<OfflineDBSchema> | null = null;

export async function getOfflineDB(): Promise<IDBPDatabase<OfflineDBSchema>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<OfflineDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      if (!db.objectStoreNames.contains('pendingSync')) {
        const syncStore = db.createObjectStore('pendingSync', { keyPath: 'id' });
        syncStore.createIndex('by-type', 'type');
        syncStore.createIndex('by-status', 'status');
        syncStore.createIndex('by-timestamp', 'timestamp');
      }

      if (!db.objectStoreNames.contains('siteVisits')) {
        const visitStore = db.createObjectStore('siteVisits', { keyPath: 'id' });
        visitStore.createIndex('by-siteEntryId', 'siteEntryId');
        visitStore.createIndex('by-synced', 'synced');
        visitStore.createIndex('by-status', 'status');
      }

      if (!db.objectStoreNames.contains('locations')) {
        const locStore = db.createObjectStore('locations', { keyPath: 'id' });
        locStore.createIndex('by-userId', 'userId');
        locStore.createIndex('by-synced', 'synced');
        locStore.createIndex('by-timestamp', 'timestamp');
      }

      if (!db.objectStoreNames.contains('siteCache')) {
        const cacheStore = db.createObjectStore('siteCache', { keyPath: 'id' });
        cacheStore.createIndex('by-expiresAt', 'expiresAt');
      }

      if (!db.objectStoreNames.contains('appState')) {
        db.createObjectStore('appState', { keyPath: 'key' });
      }
    },
  });

  return dbInstance;
}

export async function addPendingSync(action: Omit<PendingSyncAction, 'id' | 'timestamp' | 'retries' | 'status'>): Promise<string> {
  const db = await getOfflineDB();
  const id = crypto.randomUUID();
  const syncAction: PendingSyncAction = {
    id,
    ...action,
    timestamp: Date.now(),
    retries: 0,
    status: 'pending',
  };
  await db.put('pendingSync', syncAction);
  return id;
}

export async function getPendingSyncActions(): Promise<PendingSyncAction[]> {
  const db = await getOfflineDB();
  return db.getAllFromIndex('pendingSync', 'by-status', 'pending');
}

export async function updateSyncActionStatus(id: string, status: PendingSyncAction['status'], errorMessage?: string): Promise<void> {
  const db = await getOfflineDB();
  const action = await db.get('pendingSync', id);
  if (action) {
    action.status = status;
    action.retries = status === 'failed' ? action.retries + 1 : action.retries;
    if (errorMessage) action.errorMessage = errorMessage;
    await db.put('pendingSync', action);
  }
}

export async function removeSyncAction(id: string): Promise<void> {
  const db = await getOfflineDB();
  await db.delete('pendingSync', id);
}

export async function saveSiteVisitOffline(visit: Omit<OfflineSiteVisit, 'id' | 'synced'>): Promise<string> {
  const db = await getOfflineDB();
  const id = crypto.randomUUID();
  const offlineVisit: OfflineSiteVisit = {
    id,
    ...visit,
    synced: false,
  };
  await db.put('siteVisits', offlineVisit);
  return id;
}

export async function getOfflineSiteVisit(siteEntryId: string): Promise<OfflineSiteVisit | undefined> {
  const db = await getOfflineDB();
  const visits = await db.getAllFromIndex('siteVisits', 'by-siteEntryId', siteEntryId);
  return visits.find(v => !v.synced) || visits[visits.length - 1];
}

export async function getUnsyncedSiteVisits(): Promise<OfflineSiteVisit[]> {
  const db = await getOfflineDB();
  const all = await db.getAll('siteVisits');
  return all.filter(v => !v.synced);
}

export async function updateSiteVisitOffline(id: string, updates: Partial<OfflineSiteVisit>): Promise<void> {
  const db = await getOfflineDB();
  const visit = await db.get('siteVisits', id);
  if (visit) {
    await db.put('siteVisits', { ...visit, ...updates });
  }
}

export async function markSiteVisitSynced(id: string): Promise<void> {
  const db = await getOfflineDB();
  const visit = await db.get('siteVisits', id);
  if (visit) {
    visit.synced = true;
    visit.syncedAt = new Date().toISOString();
    await db.put('siteVisits', visit);
  }
}

export async function saveLocationOffline(location: Omit<CachedLocation, 'id' | 'synced'>): Promise<string> {
  const db = await getOfflineDB();
  const id = crypto.randomUUID();
  await db.put('locations', { id, ...location, synced: false });
  return id;
}

export async function getUnsyncedLocations(userId: string): Promise<CachedLocation[]> {
  const db = await getOfflineDB();
  const locations = await db.getAllFromIndex('locations', 'by-userId', userId);
  return locations.filter(l => !l.synced);
}

export async function markLocationsSynced(ids: string[]): Promise<void> {
  const db = await getOfflineDB();
  const tx = db.transaction('locations', 'readwrite');
  for (const id of ids) {
    const loc = await tx.store.get(id);
    if (loc) {
      loc.synced = true;
      await tx.store.put(loc);
    }
  }
  await tx.done;
}

export async function cacheSiteData(id: string, data: any, ttlMinutes: number = 60): Promise<void> {
  const db = await getOfflineDB();
  const now = Date.now();
  await db.put('siteCache', {
    id,
    data,
    cachedAt: now,
    expiresAt: now + ttlMinutes * 60 * 1000,
  });
}

export async function getCachedSiteData<T = any>(id: string): Promise<T | null> {
  const db = await getOfflineDB();
  const cached = await db.get('siteCache', id);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data as T;
  }
  if (cached) {
    await db.delete('siteCache', id);
  }
  return null;
}

export async function cleanExpiredCache(): Promise<number> {
  const db = await getOfflineDB();
  const now = Date.now();
  const all = await db.getAll('siteCache');
  const expired = all.filter(c => c.expiresAt < now);
  const tx = db.transaction('siteCache', 'readwrite');
  for (const item of expired) {
    await tx.store.delete(item.id);
  }
  await tx.done;
  return expired.length;
}

export async function saveAppState(key: string, value: any): Promise<void> {
  const db = await getOfflineDB();
  await db.put('appState', { key, value, updatedAt: Date.now() });
}

export async function getAppState<T = any>(key: string): Promise<T | null> {
  const db = await getOfflineDB();
  const state = await db.get('appState', key);
  return state?.value ?? null;
}

export async function getOfflineStats(): Promise<{
  pendingActions: number;
  unsyncedVisits: number;
  unsyncedLocations: number;
  cachedItems: number;
}> {
  const db = await getOfflineDB();
  const [pending, visits, locations, cached] = await Promise.all([
    db.countFromIndex('pendingSync', 'by-status', 'pending'),
    db.getAll('siteVisits').then(v => v.filter(x => !x.synced).length),
    db.getAll('locations').then(l => l.filter(x => !x.synced).length),
    db.count('siteCache'),
  ]);
  return {
    pendingActions: pending,
    unsyncedVisits: visits,
    unsyncedLocations: locations,
    cachedItems: cached,
  };
}

export async function clearAllOfflineData(): Promise<void> {
  const db = await getOfflineDB();
  await Promise.all([
    db.clear('pendingSync'),
    db.clear('siteVisits'),
    db.clear('locations'),
    db.clear('siteCache'),
    db.clear('appState'),
  ]);
}
