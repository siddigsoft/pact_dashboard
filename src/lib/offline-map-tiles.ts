import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'pact-map-tiles';
const DB_VERSION = 1;
const TILES_STORE = 'tiles';
const METADATA_STORE = 'metadata';

const MAX_CACHE_SIZE_MB = 500;
const MAX_CACHE_SIZE_BYTES = MAX_CACHE_SIZE_MB * 1024 * 1024;
const TILE_EXPIRY_DAYS = 30;

interface TileMetadata {
  url: string;
  timestamp: number;
  size: number;
  z: number;
  x: number;
  y: number;
  layer: string;
}

interface CacheMetadata {
  totalSize: number;
  tileCount: number;
  lastCleanup: number;
  downloadedRegions: DownloadedRegion[];
}

interface DownloadedRegion {
  id: string;
  name: string;
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  minZoom: number;
  maxZoom: number;
  tileCount: number;
  size: number;
  downloadedAt: number;
}

interface DownloadProgress {
  total: number;
  completed: number;
  failed: number;
  currentTile: string;
  estimatedSize: number;
  downloadedSize: number;
}

type ProgressCallback = (progress: DownloadProgress) => void;

let db: IDBPDatabase | null = null;

async function getDB(): Promise<IDBPDatabase> {
  if (db) return db;

  db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(TILES_STORE)) {
        const tileStore = database.createObjectStore(TILES_STORE, { keyPath: 'url' });
        tileStore.createIndex('timestamp', 'timestamp');
        tileStore.createIndex('layer', 'layer');
        tileStore.createIndex('z', 'z');
      }

      if (!database.objectStoreNames.contains(METADATA_STORE)) {
        database.createObjectStore(METADATA_STORE, { keyPath: 'key' });
      }
    },
  });

  return db;
}

function getTileKey(layer: string, z: number, x: number, y: number): string {
  return `${layer}/${z}/${x}/${y}`;
}

function getTileUrl(layer: string, z: number, x: number, y: number): string {
  const tileServers: Record<string, string> = {
    standard: `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
    satellite: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
    terrain: `https://stamen-tiles.a.ssl.fastly.net/terrain/${z}/${x}/${y}.png`,
  };
  return tileServers[layer] || tileServers.standard;
}

export async function getCachedTile(layer: string, z: number, x: number, y: number): Promise<Blob | null> {
  try {
    const database = await getDB();
    const key = getTileKey(layer, z, x, y);
    const tile = await database.get(TILES_STORE, key);

    if (!tile) return null;

    const ageMs = Date.now() - tile.timestamp;
    const expiryMs = TILE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

    if (ageMs > expiryMs) {
      await database.delete(TILES_STORE, key);
      return null;
    }

    return tile.blob;
  } catch (error) {
    console.error('[MapTiles] Error getting cached tile:', error);
    return null;
  }
}

export async function cacheTile(
  layer: string,
  z: number,
  x: number,
  y: number,
  blob: Blob
): Promise<boolean> {
  try {
    const database = await getDB();
    const key = getTileKey(layer, z, x, y);
    const url = getTileUrl(layer, z, x, y);

    await database.put(TILES_STORE, {
      url: key,
      blob,
      timestamp: Date.now(),
      size: blob.size,
      z,
      x,
      y,
      layer,
    });

    await updateCacheMetadata(blob.size, 1);
    return true;
  } catch (error) {
    console.error('[MapTiles] Error caching tile:', error);
    return false;
  }
}

export async function fetchAndCacheTile(
  layer: string,
  z: number,
  x: number,
  y: number
): Promise<Blob | null> {
  const cached = await getCachedTile(layer, z, x, y);
  if (cached) return cached;

  try {
    const url = getTileUrl(layer, z, x, y);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch tile: ${response.status}`);
    }

    const blob = await response.blob();
    await cacheTile(layer, z, x, y, blob);
    return blob;
  } catch (error) {
    console.error('[MapTiles] Error fetching tile:', error);
    return null;
  }
}

function getTilesInBounds(
  bounds: { north: number; south: number; east: number; west: number },
  zoom: number
): Array<{ x: number; y: number; z: number }> {
  const tiles: Array<{ x: number; y: number; z: number }> = [];

  const n = Math.pow(2, zoom);

  const xMin = Math.floor(((bounds.west + 180) / 360) * n);
  const xMax = Math.floor(((bounds.east + 180) / 360) * n);

  const latRadN = (bounds.north * Math.PI) / 180;
  const latRadS = (bounds.south * Math.PI) / 180;

  const yMin = Math.floor((1 - Math.log(Math.tan(latRadN) + 1 / Math.cos(latRadN)) / Math.PI) / 2 * n);
  const yMax = Math.floor((1 - Math.log(Math.tan(latRadS) + 1 / Math.cos(latRadS)) / Math.PI) / 2 * n);

  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      tiles.push({ x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)), z: zoom });
    }
  }

  return tiles;
}

export function estimateDownloadSize(
  bounds: { north: number; south: number; east: number; west: number },
  minZoom: number,
  maxZoom: number
): { tileCount: number; estimatedSizeMB: number } {
  let tileCount = 0;

  for (let z = minZoom; z <= maxZoom; z++) {
    const tiles = getTilesInBounds(bounds, z);
    tileCount += tiles.length;
  }

  const avgTileSizeKB = 15;
  const estimatedSizeMB = (tileCount * avgTileSizeKB) / 1024;

  return { tileCount, estimatedSizeMB };
}

export async function downloadRegion(
  regionId: string,
  regionName: string,
  bounds: { north: number; south: number; east: number; west: number },
  minZoom: number,
  maxZoom: number,
  layer: string = 'standard',
  onProgress?: ProgressCallback,
  signal?: AbortSignal
): Promise<{ success: boolean; error?: string; region?: DownloadedRegion }> {
  const allTiles: Array<{ x: number; y: number; z: number }> = [];

  for (let z = minZoom; z <= maxZoom; z++) {
    const tiles = getTilesInBounds(bounds, z);
    allTiles.push(...tiles);
  }

  const progress: DownloadProgress = {
    total: allTiles.length,
    completed: 0,
    failed: 0,
    currentTile: '',
    estimatedSize: allTiles.length * 15 * 1024,
    downloadedSize: 0,
  };

  let totalSize = 0;
  const concurrency = 4;
  const queue = [...allTiles];

  const downloadTile = async (tile: { x: number; y: number; z: number }): Promise<void> => {
    if (signal?.aborted) return;

    try {
      progress.currentTile = `${layer}/${tile.z}/${tile.x}/${tile.y}`;
      onProgress?.(progress);

      const blob = await fetchAndCacheTile(layer, tile.z, tile.x, tile.y);

      if (blob) {
        progress.completed++;
        progress.downloadedSize += blob.size;
        totalSize += blob.size;
      } else {
        progress.failed++;
      }
    } catch (error) {
      progress.failed++;
    }

    onProgress?.(progress);
  };

  const workers: Promise<void>[] = [];

  for (let i = 0; i < concurrency; i++) {
    workers.push(
      (async () => {
        while (queue.length > 0 && !signal?.aborted) {
          const tile = queue.shift();
          if (tile) {
            await downloadTile(tile);
          }
        }
      })()
    );
  }

  await Promise.all(workers);

  if (signal?.aborted) {
    return { success: false, error: 'Download cancelled' };
  }

  const region: DownloadedRegion = {
    id: regionId,
    name: regionName,
    bounds,
    minZoom,
    maxZoom,
    tileCount: progress.completed,
    size: totalSize,
    downloadedAt: Date.now(),
  };

  await saveDownloadedRegion(region);

  return { success: true, region };
}

async function saveDownloadedRegion(region: DownloadedRegion): Promise<void> {
  const database = await getDB();
  const metadata = await getCacheMetadata();

  const existingIndex = metadata.downloadedRegions.findIndex((r) => r.id === region.id);
  if (existingIndex >= 0) {
    metadata.downloadedRegions[existingIndex] = region;
  } else {
    metadata.downloadedRegions.push(region);
  }

  await database.put(METADATA_STORE, { key: 'cache-metadata', ...metadata });
}

export async function deleteRegion(regionId: string): Promise<boolean> {
  try {
    const database = await getDB();
    const metadata = await getCacheMetadata();

    const region = metadata.downloadedRegions.find((r) => r.id === regionId);
    if (!region) return false;

    for (let z = region.minZoom; z <= region.maxZoom; z++) {
      const tiles = getTilesInBounds(region.bounds, z);
      for (const tile of tiles) {
        const key = getTileKey('standard', tile.z, tile.x, tile.y);
        await database.delete(TILES_STORE, key);
      }
    }

    metadata.downloadedRegions = metadata.downloadedRegions.filter((r) => r.id !== regionId);
    metadata.totalSize -= region.size;
    metadata.tileCount -= region.tileCount;

    await database.put(METADATA_STORE, { key: 'cache-metadata', ...metadata });

    return true;
  } catch (error) {
    console.error('[MapTiles] Error deleting region:', error);
    return false;
  }
}

export async function getDownloadedRegions(): Promise<DownloadedRegion[]> {
  const metadata = await getCacheMetadata();
  return metadata.downloadedRegions;
}

async function getCacheMetadata(): Promise<CacheMetadata> {
  try {
    const database = await getDB();
    const metadata = await database.get(METADATA_STORE, 'cache-metadata');

    return metadata || {
      totalSize: 0,
      tileCount: 0,
      lastCleanup: 0,
      downloadedRegions: [],
    };
  } catch {
    return {
      totalSize: 0,
      tileCount: 0,
      lastCleanup: 0,
      downloadedRegions: [],
    };
  }
}

async function updateCacheMetadata(sizeChange: number, countChange: number): Promise<void> {
  try {
    const database = await getDB();
    const metadata = await getCacheMetadata();

    metadata.totalSize += sizeChange;
    metadata.tileCount += countChange;

    await database.put(METADATA_STORE, { key: 'cache-metadata', ...metadata });

    if (metadata.totalSize > MAX_CACHE_SIZE_BYTES) {
      await cleanupOldTiles();
    }
  } catch (error) {
    console.error('[MapTiles] Error updating metadata:', error);
  }
}

async function cleanupOldTiles(): Promise<void> {
  try {
    const database = await getDB();
    const metadata = await getCacheMetadata();

    if (Date.now() - metadata.lastCleanup < 60 * 60 * 1000) {
      return;
    }

    const tx = database.transaction(TILES_STORE, 'readwrite');
    const store = tx.objectStore(TILES_STORE);
    const index = store.index('timestamp');

    let cursor = await index.openCursor();
    let deletedSize = 0;
    let deletedCount = 0;
    const targetSize = MAX_CACHE_SIZE_BYTES * 0.8;

    while (cursor && metadata.totalSize - deletedSize > targetSize) {
      const tile = cursor.value;

      const isInRegion = metadata.downloadedRegions.some((region) => {
        return (
          tile.z >= region.minZoom &&
          tile.z <= region.maxZoom
        );
      });

      if (!isInRegion) {
        deletedSize += tile.size;
        deletedCount++;
        await cursor.delete();
      }

      cursor = await cursor.continue();
    }

    await tx.done;

    metadata.totalSize -= deletedSize;
    metadata.tileCount -= deletedCount;
    metadata.lastCleanup = Date.now();

    await database.put(METADATA_STORE, { key: 'cache-metadata', ...metadata });

    console.log(`[MapTiles] Cleaned up ${deletedCount} tiles (${(deletedSize / 1024 / 1024).toFixed(2)} MB)`);
  } catch (error) {
    console.error('[MapTiles] Error cleaning up tiles:', error);
  }
}

export async function getCacheStats(): Promise<{
  totalSizeMB: number;
  tileCount: number;
  maxSizeMB: number;
  usagePercent: number;
  regionsCount: number;
}> {
  const metadata = await getCacheMetadata();

  return {
    totalSizeMB: metadata.totalSize / 1024 / 1024,
    tileCount: metadata.tileCount,
    maxSizeMB: MAX_CACHE_SIZE_MB,
    usagePercent: (metadata.totalSize / MAX_CACHE_SIZE_BYTES) * 100,
    regionsCount: metadata.downloadedRegions.length,
  };
}

export async function clearAllTiles(): Promise<void> {
  try {
    const database = await getDB();
    await database.clear(TILES_STORE);
    await database.put(METADATA_STORE, {
      key: 'cache-metadata',
      totalSize: 0,
      tileCount: 0,
      lastCleanup: Date.now(),
      downloadedRegions: [],
    });
    console.log('[MapTiles] All tiles cleared');
  } catch (error) {
    console.error('[MapTiles] Error clearing tiles:', error);
  }
}
