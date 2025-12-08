import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface PendingSyncAction {
  id: string;
  type: 'site_visit_claim' | 'site_visit_start' | 'site_visit_complete' | 'location_update' | 'cost_submission' | 'photo_upload';
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

export interface CachedRecord<T = any> {
  id: string;
  data: T;
  _version: number;
  _cachedAt: number;
  _expiresAt: number;
  _storeType: string;
}

export interface CachedMMP {
  id: string;
  data: any;
  _version: number;
  _cachedAt: number;
  _expiresAt: number;
}

export interface CachedBudget {
  id: string;
  data: any;
  _version: number;
  _cachedAt: number;
  _expiresAt: number;
}

export interface CachedWallet {
  id: string;
  data: any;
  _version: number;
  _cachedAt: number;
  _expiresAt: number;
}

export interface CachedNotification {
  id: string;
  data: any;
  _version: number;
  _cachedAt: number;
  _expiresAt: number;
  read: boolean;
}

export interface CachedChatMessage {
  id: string;
  data: any;
  _version: number;
  _cachedAt: number;
  _expiresAt: number;
  conversationId: string;
}

export interface CachedProject {
  id: string;
  data: any;
  _version: number;
  _cachedAt: number;
  _expiresAt: number;
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
  mmps: {
    key: string;
    value: CachedMMP;
    indexes: { 'by-expiresAt': number; 'by-cachedAt': number };
  };
  budgets: {
    key: string;
    value: CachedBudget;
    indexes: { 'by-expiresAt': number; 'by-cachedAt': number };
  };
  wallets: {
    key: string;
    value: CachedWallet;
    indexes: { 'by-expiresAt': number; 'by-cachedAt': number };
  };
  notifications: {
    key: string;
    value: CachedNotification;
    indexes: { 'by-expiresAt': number; 'by-cachedAt': number; 'by-read': boolean };
  };
  chatMessages: {
    key: string;
    value: CachedChatMessage;
    indexes: { 'by-expiresAt': number; 'by-cachedAt': number; 'by-conversationId': string };
  };
  projects: {
    key: string;
    value: CachedProject;
    indexes: { 'by-expiresAt': number; 'by-cachedAt': number };
  };
  genericCache: {
    key: string;
    value: CachedRecord;
    indexes: { 'by-expiresAt': number; 'by-storeType': string; 'by-cachedAt': number };
  };
}

const DB_NAME = 'pact-offline-db';
const DB_VERSION = 2;

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

      if (!db.objectStoreNames.contains('mmps')) {
        const mmpStore = db.createObjectStore('mmps', { keyPath: 'id' });
        mmpStore.createIndex('by-expiresAt', '_expiresAt');
        mmpStore.createIndex('by-cachedAt', '_cachedAt');
      }

      if (!db.objectStoreNames.contains('budgets')) {
        const budgetStore = db.createObjectStore('budgets', { keyPath: 'id' });
        budgetStore.createIndex('by-expiresAt', '_expiresAt');
        budgetStore.createIndex('by-cachedAt', '_cachedAt');
      }

      if (!db.objectStoreNames.contains('wallets')) {
        const walletStore = db.createObjectStore('wallets', { keyPath: 'id' });
        walletStore.createIndex('by-expiresAt', '_expiresAt');
        walletStore.createIndex('by-cachedAt', '_cachedAt');
      }

      if (!db.objectStoreNames.contains('notifications')) {
        const notifStore = db.createObjectStore('notifications', { keyPath: 'id' });
        notifStore.createIndex('by-expiresAt', '_expiresAt');
        notifStore.createIndex('by-cachedAt', '_cachedAt');
        notifStore.createIndex('by-read', 'read');
      }

      if (!db.objectStoreNames.contains('chatMessages')) {
        const chatStore = db.createObjectStore('chatMessages', { keyPath: 'id' });
        chatStore.createIndex('by-expiresAt', '_expiresAt');
        chatStore.createIndex('by-cachedAt', '_cachedAt');
        chatStore.createIndex('by-conversationId', 'conversationId');
      }

      if (!db.objectStoreNames.contains('projects')) {
        const projectStore = db.createObjectStore('projects', { keyPath: 'id' });
        projectStore.createIndex('by-expiresAt', '_expiresAt');
        projectStore.createIndex('by-cachedAt', '_cachedAt');
      }

      if (!db.objectStoreNames.contains('genericCache')) {
        const genericStore = db.createObjectStore('genericCache', { keyPath: 'id' });
        genericStore.createIndex('by-expiresAt', '_expiresAt');
        genericStore.createIndex('by-storeType', '_storeType');
        genericStore.createIndex('by-cachedAt', '_cachedAt');
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

export async function requeueFailedAction(id: string): Promise<void> {
  const db = await getOfflineDB();
  const action = await db.get('pendingSync', id);
  if (action && action.status === 'failed') {
    action.status = 'pending';
    await db.put('pendingSync', action);
  }
}

export async function getFailedSyncActions(): Promise<PendingSyncAction[]> {
  const db = await getOfflineDB();
  return db.getAllFromIndex('pendingSync', 'by-status', 'failed');
}

export async function requeueAllFailedActions(): Promise<number> {
  const db = await getOfflineDB();
  const failed = await db.getAllFromIndex('pendingSync', 'by-status', 'failed');
  let requeued = 0;
  
  const tx = db.transaction('pendingSync', 'readwrite');
  for (const action of failed) {
    action.status = 'pending';
    await tx.store.put(action);
    requeued++;
  }
  await tx.done;
  
  return requeued;
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
  let totalCleaned = 0;

  const stores = ['siteCache', 'mmps', 'budgets', 'wallets', 'notifications', 'chatMessages', 'projects', 'genericCache'] as const;
  
  for (const storeName of stores) {
    const all = await db.getAll(storeName);
    const expiryField = storeName === 'siteCache' ? 'expiresAt' : '_expiresAt';
    const expired = all.filter((c: any) => c[expiryField] < now);
    
    if (expired.length > 0) {
      const tx = db.transaction(storeName, 'readwrite');
      for (const item of expired) {
        await tx.store.delete(item.id);
      }
      await tx.done;
      totalCleaned += expired.length;
    }
  }
  
  return totalCleaned;
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
  cachedMMPs: number;
  cachedBudgets: number;
  cachedWallets: number;
  cachedNotifications: number;
  cachedChatMessages: number;
  cachedProjects: number;
}> {
  const db = await getOfflineDB();
  const [pending, visits, locations, cached, mmps, budgets, wallets, notifications, chatMessages, projects] = await Promise.all([
    db.countFromIndex('pendingSync', 'by-status', 'pending'),
    db.getAll('siteVisits').then(v => v.filter(x => !x.synced).length),
    db.getAll('locations').then(l => l.filter(x => !x.synced).length),
    db.count('siteCache'),
    db.count('mmps'),
    db.count('budgets'),
    db.count('wallets'),
    db.count('notifications'),
    db.count('chatMessages'),
    db.count('projects'),
  ]);
  return {
    pendingActions: pending,
    unsyncedVisits: visits,
    unsyncedLocations: locations,
    cachedItems: cached,
    cachedMMPs: mmps,
    cachedBudgets: budgets,
    cachedWallets: wallets,
    cachedNotifications: notifications,
    cachedChatMessages: chatMessages,
    cachedProjects: projects,
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
    db.clear('mmps'),
    db.clear('budgets'),
    db.clear('wallets'),
    db.clear('notifications'),
    db.clear('chatMessages'),
    db.clear('projects'),
    db.clear('genericCache'),
  ]);
}

export type CacheStoreName = 'mmps' | 'budgets' | 'wallets' | 'notifications' | 'chatMessages' | 'projects';

const DEFAULT_TTL_MINUTES: Record<CacheStoreName, number> = {
  mmps: 120,
  budgets: 60,
  wallets: 30,
  notifications: 1440,
  chatMessages: 2880,
  projects: 120,
};

class OfflineCacheService {
  private currentVersion = 1;

  async cache<T>(
    storeName: CacheStoreName,
    id: string,
    data: T,
    options?: { ttlMinutes?: number; version?: number; additionalFields?: Record<string, any> }
  ): Promise<void> {
    const db = await getOfflineDB();
    const now = Date.now();
    const ttl = options?.ttlMinutes ?? DEFAULT_TTL_MINUTES[storeName];
    
    const record = {
      id,
      data,
      _version: options?.version ?? this.currentVersion,
      _cachedAt: now,
      _expiresAt: now + ttl * 60 * 1000,
      ...options?.additionalFields,
    };

    await db.put(storeName, record as any);
  }

  async get<T>(storeName: CacheStoreName, id: string): Promise<T | null> {
    const db = await getOfflineDB();
    const cached = await db.get(storeName, id);
    
    if (!cached) return null;
    
    if (cached._expiresAt < Date.now()) {
      await db.delete(storeName, id);
      return null;
    }
    
    return cached.data as T;
  }

  async getWithMeta<T>(storeName: CacheStoreName, id: string): Promise<{ data: T; version: number; cachedAt: number } | null> {
    const db = await getOfflineDB();
    const cached = await db.get(storeName, id);
    
    if (!cached) return null;
    
    if (cached._expiresAt < Date.now()) {
      await db.delete(storeName, id);
      return null;
    }
    
    return {
      data: cached.data as T,
      version: cached._version,
      cachedAt: cached._cachedAt,
    };
  }

  async getAll<T>(storeName: CacheStoreName): Promise<T[]> {
    const db = await getOfflineDB();
    const all = await db.getAll(storeName);
    const now = Date.now();
    
    const valid = all.filter((item: any) => item._expiresAt >= now);
    return valid.map((item: any) => item.data as T);
  }

  async invalidate(storeName: CacheStoreName, id: string): Promise<void> {
    const db = await getOfflineDB();
    await db.delete(storeName, id);
  }

  async invalidateAll(storeName: CacheStoreName): Promise<void> {
    const db = await getOfflineDB();
    await db.clear(storeName);
  }

  async invalidateExpired(storeName: CacheStoreName): Promise<number> {
    const db = await getOfflineDB();
    const all = await db.getAll(storeName);
    const now = Date.now();
    
    const expired = all.filter((item: any) => item._expiresAt < now);
    
    if (expired.length > 0) {
      const tx = db.transaction(storeName, 'readwrite');
      for (const item of expired) {
        await tx.store.delete(item.id);
      }
      await tx.done;
    }
    
    return expired.length;
  }

  async batchCache<T>(
    storeName: CacheStoreName,
    items: Array<{ id: string; data: T; additionalFields?: Record<string, any> }>,
    options?: { ttlMinutes?: number; version?: number }
  ): Promise<void> {
    const db = await getOfflineDB();
    const now = Date.now();
    const ttl = options?.ttlMinutes ?? DEFAULT_TTL_MINUTES[storeName];
    
    const tx = db.transaction(storeName, 'readwrite');
    
    for (const item of items) {
      const record = {
        id: item.id,
        data: item.data,
        _version: options?.version ?? this.currentVersion,
        _cachedAt: now,
        _expiresAt: now + ttl * 60 * 1000,
        ...item.additionalFields,
      };
      await tx.store.put(record as any);
    }
    
    await tx.done;
  }

  async batchGet<T>(storeName: CacheStoreName, ids: string[]): Promise<Map<string, T>> {
    const db = await getOfflineDB();
    const result = new Map<string, T>();
    const now = Date.now();
    
    for (const id of ids) {
      const cached = await db.get(storeName, id);
      if (cached && cached._expiresAt >= now) {
        result.set(id, cached.data as T);
      }
    }
    
    return result;
  }

  async updateVersion(storeName: CacheStoreName, id: string, newVersion: number): Promise<void> {
    const db = await getOfflineDB();
    const cached = await db.get(storeName, id);
    
    if (cached) {
      cached._version = newVersion;
      await db.put(storeName, cached as any);
    }
  }

  async getByIndex<T>(
    storeName: CacheStoreName,
    indexName: string,
    value: any
  ): Promise<T[]> {
    const db = await getOfflineDB();
    const now = Date.now();
    
    let results: any[];
    
    if (storeName === 'notifications' && indexName === 'by-read') {
      results = await db.getAllFromIndex('notifications', 'by-read', value);
    } else if (storeName === 'chatMessages' && indexName === 'by-conversationId') {
      results = await db.getAllFromIndex('chatMessages', 'by-conversationId', value);
    } else {
      results = await db.getAll(storeName);
    }
    
    return results
      .filter((item: any) => item._expiresAt >= now)
      .map((item: any) => item.data as T);
  }

  async getCacheStats(): Promise<Record<CacheStoreName, { count: number; expiredCount: number }>> {
    const db = await getOfflineDB();
    const now = Date.now();
    const stores: CacheStoreName[] = ['mmps', 'budgets', 'wallets', 'notifications', 'chatMessages', 'projects'];
    
    const stats: Record<string, { count: number; expiredCount: number }> = {};
    
    for (const store of stores) {
      const all = await db.getAll(store);
      const expired = all.filter((item: any) => item._expiresAt < now);
      stats[store] = {
        count: all.length,
        expiredCount: expired.length,
      };
    }
    
    return stats as Record<CacheStoreName, { count: number; expiredCount: number }>;
  }
}

export const offlineCacheService = new OfflineCacheService();

export async function cacheMMP(id: string, data: any, ttlMinutes?: number): Promise<void> {
  return offlineCacheService.cache('mmps', id, data, { ttlMinutes });
}

export async function getCachedMMP<T = any>(id: string): Promise<T | null> {
  return offlineCacheService.get<T>('mmps', id);
}

export async function getAllCachedMMPs<T = any>(): Promise<T[]> {
  return offlineCacheService.getAll<T>('mmps');
}

export async function cacheBudget(id: string, data: any, ttlMinutes?: number): Promise<void> {
  return offlineCacheService.cache('budgets', id, data, { ttlMinutes });
}

export async function getCachedBudget<T = any>(id: string): Promise<T | null> {
  return offlineCacheService.get<T>('budgets', id);
}

export async function cacheWallet(id: string, data: any, ttlMinutes?: number): Promise<void> {
  return offlineCacheService.cache('wallets', id, data, { ttlMinutes });
}

export async function getCachedWallet<T = any>(id: string): Promise<T | null> {
  return offlineCacheService.get<T>('wallets', id);
}

export async function cacheNotification(id: string, data: any, read: boolean = false, ttlMinutes?: number): Promise<void> {
  return offlineCacheService.cache('notifications', id, data, { 
    ttlMinutes, 
    additionalFields: { read } 
  });
}

export async function getCachedNotifications<T = any>(unreadOnly: boolean = false): Promise<T[]> {
  if (unreadOnly) {
    return offlineCacheService.getByIndex<T>('notifications', 'by-read', false);
  }
  return offlineCacheService.getAll<T>('notifications');
}

export async function cacheChatMessage(id: string, conversationId: string, data: any, ttlMinutes?: number): Promise<void> {
  return offlineCacheService.cache('chatMessages', id, data, { 
    ttlMinutes, 
    additionalFields: { conversationId } 
  });
}

export async function getCachedChatMessages<T = any>(conversationId: string): Promise<T[]> {
  return offlineCacheService.getByIndex<T>('chatMessages', 'by-conversationId', conversationId);
}

export async function cacheProject(id: string, data: any, ttlMinutes?: number): Promise<void> {
  return offlineCacheService.cache('projects', id, data, { ttlMinutes });
}

export async function getCachedProject<T = any>(id: string): Promise<T | null> {
  return offlineCacheService.get<T>('projects', id);
}

export async function getAllCachedProjects<T = any>(): Promise<T[]> {
  return offlineCacheService.getAll<T>('projects');
}
