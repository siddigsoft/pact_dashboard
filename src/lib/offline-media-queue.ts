import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { compressImage, blobToBase64 } from './image-compression';

export interface QueuedMedia {
  id: string;
  type: 'photo' | 'voice_note' | 'signature';
  visitId: string;
  siteEntryId: string;
  data: string; // base64 encoded
  mimeType: string;
  originalSize: number;
  compressedSize: number;
  location?: { lat: number; lng: number; accuracy?: number };
  timestamp: number;
  retries: number;
  status: 'pending' | 'uploading' | 'failed' | 'uploaded';
  errorMessage?: string;
  chunkIndex?: number;
  totalChunks?: number;
  uploadProgress?: number;
}

export interface MediaUploadProgress {
  mediaId: string;
  progress: number;
  status: 'pending' | 'uploading' | 'failed' | 'uploaded';
}

interface MediaDBSchema extends DBSchema {
  mediaQueue: {
    key: string;
    value: QueuedMedia;
    indexes: { 
      'by-visitId': string; 
      'by-status': string; 
      'by-type': string;
      'by-timestamp': number;
    };
  };
  mediaChunks: {
    key: string;
    value: {
      id: string;
      mediaId: string;
      chunkIndex: number;
      data: string;
      uploaded: boolean;
    };
    indexes: { 'by-mediaId': string };
  };
}

const MEDIA_DB_NAME = 'pact-media-db';
const MEDIA_DB_VERSION = 1;
const MAX_CHUNK_SIZE = 512 * 1024; // 512KB chunks for reliable upload
const MAX_QUEUE_SIZE_MB = 100; // Max 100MB in queue
const MAX_RETRIES = 5;

let mediaDbInstance: IDBPDatabase<MediaDBSchema> | null = null;

export async function getMediaDB(): Promise<IDBPDatabase<MediaDBSchema>> {
  if (mediaDbInstance) return mediaDbInstance;

  mediaDbInstance = await openDB<MediaDBSchema>(MEDIA_DB_NAME, MEDIA_DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('mediaQueue')) {
        const store = db.createObjectStore('mediaQueue', { keyPath: 'id' });
        store.createIndex('by-visitId', 'visitId');
        store.createIndex('by-status', 'status');
        store.createIndex('by-type', 'type');
        store.createIndex('by-timestamp', 'timestamp');
      }

      if (!db.objectStoreNames.contains('mediaChunks')) {
        const chunkStore = db.createObjectStore('mediaChunks', { keyPath: 'id' });
        chunkStore.createIndex('by-mediaId', 'mediaId');
      }
    },
  });

  return mediaDbInstance;
}

export async function getQueueSize(): Promise<number> {
  const db = await getMediaDB();
  const all = await db.getAll('mediaQueue');
  return all.reduce((total, item) => total + item.compressedSize, 0);
}

export async function canAddToQueue(sizeBytes: number): Promise<boolean> {
  const currentSize = await getQueueSize();
  const maxSize = MAX_QUEUE_SIZE_MB * 1024 * 1024;
  return (currentSize + sizeBytes) <= maxSize;
}

export async function queuePhoto(
  visitId: string,
  siteEntryId: string,
  file: File | Blob,
  location?: { lat: number; lng: number; accuracy?: number },
  lowBandwidthMode = false
): Promise<QueuedMedia> {
  const compressionOptions = lowBandwidthMode
    ? { maxWidth: 800, maxHeight: 800, quality: 0.5, mimeType: 'image/jpeg' as const }
    : { maxWidth: 1280, maxHeight: 1280, quality: 0.75, mimeType: 'image/jpeg' as const };

  const compressed = await compressImage(file, compressionOptions);
  const base64 = await blobToBase64(compressed);

  const canAdd = await canAddToQueue(compressed.size);
  if (!canAdd) {
    await evictOldestMedia();
  }

  const media: QueuedMedia = {
    id: crypto.randomUUID(),
    type: 'photo',
    visitId,
    siteEntryId,
    data: base64,
    mimeType: 'image/jpeg',
    originalSize: file.size,
    compressedSize: compressed.size,
    location,
    timestamp: Date.now(),
    retries: 0,
    status: 'pending',
  };

  // Split into chunks if large
  if (compressed.size > MAX_CHUNK_SIZE) {
    media.totalChunks = await storeMediaChunks(media.id, base64);
  }

  const db = await getMediaDB();
  await db.put('mediaQueue', media);

  console.log(`[MediaQueue] Queued photo ${media.id} (${(compressed.size / 1024).toFixed(1)}KB)`);
  return media;
}

export async function queueVoiceNote(
  visitId: string,
  siteEntryId: string,
  audioBlob: Blob,
  location?: { lat: number; lng: number; accuracy?: number }
): Promise<QueuedMedia> {
  const base64 = await blobToBase64(audioBlob);

  const canAdd = await canAddToQueue(audioBlob.size);
  if (!canAdd) {
    await evictOldestMedia();
  }

  const media: QueuedMedia = {
    id: crypto.randomUUID(),
    type: 'voice_note',
    visitId,
    siteEntryId,
    data: base64,
    mimeType: audioBlob.type || 'audio/webm',
    originalSize: audioBlob.size,
    compressedSize: audioBlob.size,
    location,
    timestamp: Date.now(),
    retries: 0,
    status: 'pending',
  };

  if (audioBlob.size > MAX_CHUNK_SIZE) {
    media.totalChunks = await storeMediaChunks(media.id, base64);
  }

  const db = await getMediaDB();
  await db.put('mediaQueue', media);

  console.log(`[MediaQueue] Queued voice note ${media.id} (${(audioBlob.size / 1024).toFixed(1)}KB)`);
  return media;
}

export async function queueSignature(
  visitId: string,
  siteEntryId: string,
  signatureDataUrl: string,
  location?: { lat: number; lng: number; accuracy?: number }
): Promise<QueuedMedia> {
  const size = signatureDataUrl.length * 0.75; // Approximate base64 size

  const media: QueuedMedia = {
    id: crypto.randomUUID(),
    type: 'signature',
    visitId,
    siteEntryId,
    data: signatureDataUrl,
    mimeType: 'image/png',
    originalSize: size,
    compressedSize: size,
    location,
    timestamp: Date.now(),
    retries: 0,
    status: 'pending',
  };

  const db = await getMediaDB();
  await db.put('mediaQueue', media);

  console.log(`[MediaQueue] Queued signature ${media.id}`);
  return media;
}

async function storeMediaChunks(mediaId: string, base64Data: string): Promise<number> {
  const db = await getMediaDB();
  // Use Blob to get accurate byte size for chunking
  const blob = new Blob([base64Data]);
  const byteSize = blob.size;
  const totalChunks = Math.ceil(byteSize / MAX_CHUNK_SIZE);

  const encoder = new TextEncoder();
  const bytes = encoder.encode(base64Data);
  
  for (let i = 0; i < totalChunks; i++) {
    const start = i * MAX_CHUNK_SIZE;
    const end = Math.min(start + MAX_CHUNK_SIZE, bytes.length);
    const chunkBytes = bytes.slice(start, end);
    const decoder = new TextDecoder();
    const chunkData = decoder.decode(chunkBytes);
    
    await db.put('mediaChunks', {
      id: `${mediaId}_chunk_${i}`,
      mediaId,
      chunkIndex: i,
      data: chunkData,
      uploaded: false,
    });
  }
  
  return totalChunks;
}

export async function getMediaChunks(mediaId: string): Promise<string[]> {
  const db = await getMediaDB();
  const chunks = await db.getAllFromIndex('mediaChunks', 'by-mediaId', mediaId);
  return chunks.sort((a, b) => a.chunkIndex - b.chunkIndex).map(c => c.data);
}

async function evictOldestMedia(): Promise<void> {
  const db = await getMediaDB();
  const all = await db.getAllFromIndex('mediaQueue', 'by-timestamp');
  
  // Find uploaded or failed items to evict first
  const evictable = all.filter(m => m.status === 'uploaded' || (m.status === 'failed' && m.retries >= MAX_RETRIES));
  
  if (evictable.length > 0) {
    const oldest = evictable[0];
    await removeMedia(oldest.id);
    console.log(`[MediaQueue] Evicted ${oldest.type} ${oldest.id}`);
  }
}

export async function removeMedia(mediaId: string): Promise<void> {
  const db = await getMediaDB();
  await db.delete('mediaQueue', mediaId);
  
  // Remove chunks if any
  const chunks = await db.getAllFromIndex('mediaChunks', 'by-mediaId', mediaId);
  for (const chunk of chunks) {
    await db.delete('mediaChunks', chunk.id);
  }
}

export async function getPendingMedia(): Promise<QueuedMedia[]> {
  const db = await getMediaDB();
  return db.getAllFromIndex('mediaQueue', 'by-status', 'pending');
}

export async function getMediaByVisit(visitId: string): Promise<QueuedMedia[]> {
  const db = await getMediaDB();
  return db.getAllFromIndex('mediaQueue', 'by-visitId', visitId);
}

export async function updateMediaStatus(
  mediaId: string, 
  status: QueuedMedia['status'], 
  errorMessage?: string,
  uploadProgress?: number
): Promise<void> {
  const db = await getMediaDB();
  const media = await db.get('mediaQueue', mediaId);
  
  if (media) {
    media.status = status;
    if (errorMessage) media.errorMessage = errorMessage;
    if (uploadProgress !== undefined) media.uploadProgress = uploadProgress;
    if (status === 'failed') media.retries++;
    await db.put('mediaQueue', media);
  }
}

export async function getMediaStats(): Promise<{
  pending: number;
  uploading: number;
  failed: number;
  uploaded: number;
  totalSizeMB: number;
}> {
  const db = await getMediaDB();
  const all = await db.getAll('mediaQueue');
  
  const stats = {
    pending: 0,
    uploading: 0,
    failed: 0,
    uploaded: 0,
    totalSizeMB: 0,
  };

  for (const media of all) {
    stats[media.status]++;
    stats.totalSizeMB += media.compressedSize / (1024 * 1024);
  }

  stats.totalSizeMB = Math.round(stats.totalSizeMB * 100) / 100;
  return stats;
}

export async function clearUploadedMedia(): Promise<number> {
  const db = await getMediaDB();
  const uploaded = await db.getAllFromIndex('mediaQueue', 'by-status', 'uploaded');
  
  for (const media of uploaded) {
    await removeMedia(media.id);
  }
  
  return uploaded.length;
}
