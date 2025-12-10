import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface MapTile {
  key: string;
  url: string;
  blob: Blob;
  timestamp: number;
  expiresAt: number;
}

interface CachedArea {
  id: string;
  name: string;
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  zoom: { min: number; max: number };
  tileCount: number;
  downloadedAt: number;
  sizeBytes: number;
}

interface MapCacheDBSchema extends DBSchema {
  tiles: {
    key: string;
    value: MapTile;
    indexes: { 'by-timestamp': number; 'by-expiresAt': number };
  };
  areas: {
    key: string;
    value: CachedArea;
    indexes: { 'by-downloadedAt': number };
  };
  metadata: {
    key: string;
    value: { key: string; value: any };
  };
}

const DB_NAME = 'pact-map-cache';
const DB_VERSION = 1;
const DEFAULT_TTL_DAYS = 30;
const MAX_CACHE_SIZE_MB = 100;

let dbInstance: IDBPDatabase<MapCacheDBSchema> | null = null;

async function getMapCacheDB(): Promise<IDBPDatabase<MapCacheDBSchema>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<MapCacheDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('tiles')) {
        const tileStore = db.createObjectStore('tiles', { keyPath: 'key' });
        tileStore.createIndex('by-timestamp', 'timestamp');
        tileStore.createIndex('by-expiresAt', 'expiresAt');
      }

      if (!db.objectStoreNames.contains('areas')) {
        const areaStore = db.createObjectStore('areas', { keyPath: 'id' });
        areaStore.createIndex('by-downloadedAt', 'downloadedAt');
      }

      if (!db.objectStoreNames.contains('metadata')) {
        db.createObjectStore('metadata', { keyPath: 'key' });
      }
    },
  });

  return dbInstance;
}

function getTileKey(url: string): string {
  return btoa(url).replace(/[+/=]/g, '_');
}

let lastEvictionCheck = 0;
const EVICTION_CHECK_INTERVAL = 60000;

export async function cacheTile(url: string, blob: Blob, ttlDays = DEFAULT_TTL_DAYS): Promise<void> {
  const db = await getMapCacheDB();
  const now = Date.now();
  const key = getTileKey(url);

  await db.put('tiles', {
    key,
    url,
    blob,
    timestamp: now,
    expiresAt: now + ttlDays * 24 * 60 * 60 * 1000,
  });

  if (now - lastEvictionCheck > EVICTION_CHECK_INTERVAL) {
    lastEvictionCheck = now;
    scheduleEvictionCheck();
  }
}

function scheduleEvictionCheck(): void {
  setTimeout(async () => {
    try {
      await cleanExpiredTiles();
      await evictOldTiles(MAX_CACHE_SIZE_MB);
    } catch (error) {
      console.error('Cache eviction failed:', error);
    }
  }, 0);
}

export async function getCachedTile(url: string): Promise<Blob | null> {
  try {
    const db = await getMapCacheDB();
    const key = getTileKey(url);
    const tile = await db.get('tiles', key);

    if (!tile) return null;

    if (tile.expiresAt < Date.now()) {
      await db.delete('tiles', key);
      return null;
    }

    return tile.blob;
  } catch (error) {
    console.error('Failed to get cached tile:', error);
    return null;
  }
}

export async function hasCachedTile(url: string): Promise<boolean> {
  try {
    const db = await getMapCacheDB();
    const key = getTileKey(url);
    const tile = await db.get('tiles', key);
    return tile !== undefined && tile.expiresAt > Date.now();
  } catch {
    return false;
  }
}

export interface DownloadProgress {
  total: number;
  completed: number;
  failed: number;
  currentTile: string;
  isComplete: boolean;
}

type ProgressCallback = (progress: DownloadProgress) => void;

export async function downloadAreaForOffline(
  bounds: { north: number; south: number; east: number; west: number },
  zoomLevels: { min: number; max: number },
  tileUrlTemplate: string,
  areaName: string,
  onProgress?: ProgressCallback
): Promise<{ success: boolean; tileCount: number; sizeBytes: number; errors: string[] }> {
  const tiles = generateTileList(bounds, zoomLevels);
  let completed = 0;
  let failed = 0;
  let totalSize = 0;
  const errors: string[] = [];

  onProgress?.({
    total: tiles.length,
    completed: 0,
    failed: 0,
    currentTile: 'Starting download...',
    isComplete: false,
  });

  const batchSize = 6;
  for (let i = 0; i < tiles.length; i += batchSize) {
    const batch = tiles.slice(i, i + batchSize);
    
    await Promise.all(
      batch.map(async (tile) => {
        const url = tileUrlTemplate
          .replace('{z}', tile.z.toString())
          .replace('{x}', tile.x.toString())
          .replace('{y}', tile.y.toString());

        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);

          const blob = await response.blob();
          await cacheTile(url, blob);
          totalSize += blob.size;
          completed++;
        } catch (error) {
          failed++;
          errors.push(`Failed to download z${tile.z}/x${tile.x}/y${tile.y}: ${error}`);
        }

        onProgress?.({
          total: tiles.length,
          completed,
          failed,
          currentTile: `Downloading tile ${completed + failed}/${tiles.length}`,
          isComplete: false,
        });
      })
    );

    await new Promise(resolve => setTimeout(resolve, 100));
  }

  const db = await getMapCacheDB();
  const areaId = crypto.randomUUID();
  await db.put('areas', {
    id: areaId,
    name: areaName,
    bounds,
    zoom: zoomLevels,
    tileCount: completed,
    downloadedAt: Date.now(),
    sizeBytes: totalSize,
  });

  onProgress?.({
    total: tiles.length,
    completed,
    failed,
    currentTile: 'Complete',
    isComplete: true,
  });

  return {
    success: failed === 0,
    tileCount: completed,
    sizeBytes: totalSize,
    errors,
  };
}

function generateTileList(
  bounds: { north: number; south: number; east: number; west: number },
  zoomLevels: { min: number; max: number }
): Array<{ x: number; y: number; z: number }> {
  const tiles: Array<{ x: number; y: number; z: number }> = [];

  for (let z = zoomLevels.min; z <= zoomLevels.max; z++) {
    const minTile = latLngToTile(bounds.north, bounds.west, z);
    const maxTile = latLngToTile(bounds.south, bounds.east, z);

    for (let x = minTile.x; x <= maxTile.x; x++) {
      for (let y = minTile.y; y <= maxTile.y; y++) {
        tiles.push({ x, y, z });
      }
    }
  }

  return tiles;
}

function latLngToTile(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = Math.floor((lng + 180) / 360 * n);
  const latRad = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * n);
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}

export async function getCachedAreas(): Promise<CachedArea[]> {
  const db = await getMapCacheDB();
  return db.getAll('areas');
}

export async function deleteCachedArea(areaId: string): Promise<void> {
  const db = await getMapCacheDB();
  await db.delete('areas', areaId);
}

export async function getCacheStats(): Promise<{
  totalTiles: number;
  totalSizeBytes: number;
  oldestTile: Date | null;
  newestTile: Date | null;
  areasCount: number;
}> {
  const db = await getMapCacheDB();
  
  const [tiles, areas] = await Promise.all([
    db.getAll('tiles'),
    db.count('areas'),
  ]);

  let totalSize = 0;
  let oldest = Infinity;
  let newest = 0;

  for (const tile of tiles) {
    totalSize += tile.blob.size;
    if (tile.timestamp < oldest) oldest = tile.timestamp;
    if (tile.timestamp > newest) newest = tile.timestamp;
  }

  return {
    totalTiles: tiles.length,
    totalSizeBytes: totalSize,
    oldestTile: oldest === Infinity ? null : new Date(oldest),
    newestTile: newest === 0 ? null : new Date(newest),
    areasCount: areas,
  };
}

export async function cleanExpiredTiles(): Promise<number> {
  const db = await getMapCacheDB();
  const now = Date.now();
  const all = await db.getAll('tiles');
  const expired = all.filter(t => t.expiresAt < now);

  const tx = db.transaction('tiles', 'readwrite');
  for (const tile of expired) {
    await tx.store.delete(tile.key);
  }
  await tx.done;

  return expired.length;
}

export async function evictOldTiles(targetSizeMB: number = MAX_CACHE_SIZE_MB): Promise<number> {
  const db = await getMapCacheDB();
  const tiles = await db.getAll('tiles');

  tiles.sort((a, b) => a.timestamp - b.timestamp);

  let currentSize = tiles.reduce((sum, t) => sum + t.blob.size, 0);
  const targetSizeBytes = targetSizeMB * 1024 * 1024;
  let evicted = 0;

  if (currentSize <= targetSizeBytes) return 0;

  const tx = db.transaction('tiles', 'readwrite');
  for (const tile of tiles) {
    if (currentSize <= targetSizeBytes) break;

    await tx.store.delete(tile.key);
    currentSize -= tile.blob.size;
    evicted++;
  }
  await tx.done;

  return evicted;
}

export async function clearAllTiles(): Promise<void> {
  const db = await getMapCacheDB();
  await Promise.all([
    db.clear('tiles'),
    db.clear('areas'),
  ]);
}

export function createCachedTileLayer(
  originalUrl: string,
  fallbackUrl?: string
): { getTileUrl: (coords: { x: number; y: number }, zoom: number) => Promise<string> } {
  return {
    getTileUrl: async (coords, zoom) => {
      const url = originalUrl
        .replace('{z}', zoom.toString())
        .replace('{x}', coords.x.toString())
        .replace('{y}', coords.y.toString());

      if (navigator.onLine) {
        try {
          const response = await fetch(url, { method: 'HEAD' });
          if (response.ok) {
            const fullResponse = await fetch(url);
            const blob = await fullResponse.blob();
            cacheTile(url, blob).catch(console.error);
            return url;
          }
        } catch {
        }
      }

      const cachedBlob = await getCachedTile(url);
      if (cachedBlob) {
        return URL.createObjectURL(cachedBlob);
      }

      if (fallbackUrl) {
        return fallbackUrl
          .replace('{z}', zoom.toString())
          .replace('{x}', coords.x.toString())
          .replace('{y}', coords.y.toString());
      }

      return url;
    },
  };
}

export async function prefetchTilesAroundLocation(
  lat: number,
  lng: number,
  radiusKm: number = 5,
  zoomLevels: { min: number; max: number } = { min: 10, max: 16 },
  tileUrlTemplate: string = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
): Promise<{ success: boolean; tilesDownloaded: number }> {
  const kmPerDegree = 111;
  const latOffset = radiusKm / kmPerDegree;
  const lngOffset = radiusKm / (kmPerDegree * Math.cos(lat * Math.PI / 180));

  const bounds = {
    north: lat + latOffset,
    south: lat - latOffset,
    east: lng + lngOffset,
    west: lng - lngOffset,
  };

  const result = await downloadAreaForOffline(
    bounds,
    zoomLevels,
    tileUrlTemplate.replace('{s}', 'a'),
    `Area around ${lat.toFixed(4)}, ${lng.toFixed(4)}`
  );

  return {
    success: result.success,
    tilesDownloaded: result.tileCount,
  };
}
