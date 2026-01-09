import { supabase } from '@/integrations/supabase/client';
import { testConnection } from '@/lib/session-health';

/**
 * Safe file upload utility with validation, progress tracking, and error handling
 */

export interface UploadOptions {
  maxSizeBytes?: number;
  allowedTypes?: string[];
  bucket?: string;
  path?: string;
  onProgress?: (progress: number) => void;
}

export interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
  fileName?: string;
  fileSize?: number;
}

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates a file before upload
 */
export function validateFile(file: File, options: UploadOptions = {}): FileValidationResult {
  const {
    maxSizeBytes = 10 * 1024 * 1024, // 10MB default
    allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
  } = options;

  // Check file size
  if (file.size > maxSizeBytes) {
    return {
      isValid: false,
      error: `File size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size (${(maxSizeBytes / 1024 / 1024).toFixed(2)}MB)`
    };
  }

  // Check file type
  if (!allowedTypes.includes(file.type)) {
    return {
      isValid: false,
      error: `File type "${file.type}" is not allowed. Allowed types: ${allowedTypes.join(', ')}`
    };
  }

  // Additional security checks
  if (file.name.includes('..') || file.name.includes('/') || file.name.includes('\\')) {
    return {
      isValid: false,
      error: 'File name contains invalid characters'
    };
  }

  return { isValid: true };
}

/**
 * Generates a safe, unique filename
 */
export function generateSafeFileName(originalName: string, prefix = ''): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const extension = originalName.split('.').pop()?.toLowerCase() || 'file';
  const safeName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');

  return `${prefix}${timestamp}_${random}_${safeName}`;
}

/**
 * Safely uploads a file to Supabase Storage with validation and progress tracking
 * Uses connection test to prevent hanging on frozen Supabase client
 */
export async function safeUploadFile(
  file: File,
  options: UploadOptions = {}
): Promise<UploadResult> {
  try {
    const {
      bucket = 'uploads',
      path = '',
      onProgress
    } = options;

    // Validate file first
    const validation = validateFile(file, options);
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.error
      };
    }

    // 🔐 CRITICAL: Test connection first to detect frozen Supabase client
    // This prevents the upload from hanging forever
    console.log('[SafeUpload] Testing connection before upload...');
    const connectionOk = await testConnection(3000);
    if (!connectionOk) {
      return {
        success: false,
        error: 'Connection test failed. The Supabase client may be frozen. Please refresh the page and try again.'
      };
    }
    console.log('[SafeUpload] Connection test passed, proceeding with upload...');

    // Generate safe filename
    const safeFileName = generateSafeFileName(file.name);
    const filePath = path ? `${path}/${safeFileName}` : safeFileName;

    // Upload file with timeout protection
    // Wrap in Promise.race to add an extra safety layer
    const uploadPromise = supabase.storage
      .from(bucket)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    // Add timeout as backup (though testConnection should catch frozen client)
    const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Upload timed out after 60 seconds'));
      }, 60000); // 60 second timeout for large files
    });

    const { data, error } = await Promise.race([uploadPromise, timeoutPromise]);

    if (error) {
      console.error('Upload error:', error);
      return {
        success: false,
        error: error.message || 'Failed to upload file'
      };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return {
      success: true,
      url: urlData.publicUrl,
      fileName: safeFileName,
      fileSize: file.size
    };

  } catch (error) {
    console.error('Safe upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown upload error'
    };
  }
}

/**
 * Safely uploads multiple files with batch processing
 */
export async function safeUploadFiles(
  files: File[],
  options: UploadOptions & { concurrency?: number } = {}
): Promise<UploadResult[]> {
  const { concurrency = 3, ...uploadOptions } = options;
  const results: UploadResult[] = [];

  // Process files in batches to avoid overwhelming the server
  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency);
    const batchPromises = batch.map(file => safeUploadFile(file, uploadOptions));
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  return results;
}

/**
 * Deletes a file from Supabase Storage safely
 */
export async function safeDeleteFile(bucket: string, filePath: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.storage
      .from(bucket)
      .remove([filePath]);

    if (error) {
      console.error('Delete error:', error);
      return {
        success: false,
        error: error.message || 'Failed to delete file'
      };
    }

    return { success: true };
  } catch (error) {
    console.error('Safe delete error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown delete error'
    };
  }
}

/**
 * Gets file metadata from Supabase Storage
 */
export async function getFileMetadata(bucket: string, filePath: string) {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list('', {
        search: filePath
      });

    if (error) {
      console.error('Metadata error:', error);
      return null;
    }

    return data?.[0] || null;
  } catch (error) {
    console.error('Get metadata error:', error);
    return null;
  }
}

/**
 * Predefined upload configurations for common use cases
 */
export const UPLOAD_CONFIGS = {
  images: {
    maxSizeBytes: 5 * 1024 * 1024, // 5MB
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    bucket: 'images'
  },
  documents: {
    maxSizeBytes: 10 * 1024 * 1024, // 10MB
    allowedTypes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    bucket: 'documents'
  },
  avatars: {
    maxSizeBytes: 2 * 1024 * 1024, // 2MB
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    bucket: 'avatars'
  }
} as const;