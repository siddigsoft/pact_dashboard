import { supabase } from '@/integrations/supabase/client';
import { safeUploadFile } from '@/lib/safeUpload';

export interface ChatAttachment {
  url: string;
  name: string;
  type: string;
  size: number;
}

/**
 * Upload a file or image to Supabase storage for chat attachments
 * @param file - The file to upload
 * @param chatId - The chat ID this attachment belongs to
 * @param userId - The user ID uploading the file
 * @returns The attachment object with URL and metadata
 */
export async function uploadChatAttachment(
  file: File,
  chatId: string,
  userId: string
): Promise<ChatAttachment> {
  // Validate file size (10MB limit for images, 25MB for documents)
  const maxImageSize = 10 * 1024 * 1024; // 10MB
  const maxFileSize = 25 * 1024 * 1024; // 25MB
  const isImage = file.type.startsWith('image/');
  const maxSize = isImage ? maxImageSize : maxFileSize;

  if (file.size > maxSize) {
    throw new Error(
      `File size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds the ${isImage ? '10MB' : '25MB'} limit`
    );
  }

  // Generate unique file path: chat_id/user_id/timestamp_filename
  const fileExt = file.name.split('.').pop();
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 9);
  const fileName = `${timestamp}_${randomId}.${fileExt}`;
  const filePath = `${chatId}/${userId}/${fileName}`;

  // Upload using safeUploadFile
  const uploadResult = await safeUploadFile(file, {
    bucket: 'chat-attachments',
    path: `${chatId}/${userId}`,
    allowedTypes: undefined, // allow all types for chat attachments
    maxSizeBytes: maxSize
  });
  if (!uploadResult.success || !uploadResult.url) {
    console.error('Error uploading chat attachment:', uploadResult.error);
    throw new Error(`Failed to upload file: ${uploadResult.error || 'Unknown error'}`);
  }
  return {
    url: uploadResult.url,
    name: file.name,
    type: file.type,
    size: file.size,
  };
}

/**
 * Determine content type based on file type
 */
export function getContentTypeFromFile(file: File): 'image' | 'file' | 'audio' {
  if (file.type.startsWith('image/')) {
    return 'image';
  }
  if (file.type.startsWith('audio/')) {
    return 'audio';
  }
  return 'file';
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

