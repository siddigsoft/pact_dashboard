import { supabase } from '@/integrations/supabase/client';

export type WorkspaceGuestLevel = 'viewer' | 'editor';

async function invokeGuest<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('workspace-guest', { body });
  if (data?.error) throw new Error(data.error);
  if (error) {
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === 'function') {
      try {
        const responseBody = await context.json();
        if (responseBody?.error) throw new Error(responseBody.error);
      } catch (caught) {
        if (caught instanceof Error && caught.message !== error.message) throw caught;
      }
    }
    throw new Error(error.message || 'Guest access request failed');
  }
  return data as T;
}

export interface WorkspaceGuestIdentity {
  id: string;
  guestName: string;
  accessLevel: WorkspaceGuestLevel;
  expiresAt: string;
}

export async function fetchManagedGuestFolder(
  token: string,
  folderId?: string | null,
): Promise<any> {
  return invokeGuest({
    action: 'resolve',
    token,
    ...(folderId ? { folderId } : {}),
  });
}

export async function managedGuestDownload(
  token: string,
  fileId: string,
  inline = false,
): Promise<string> {
  const data = await invokeGuest<{ url: string }>({
    action: 'sign-download',
    token,
    fileId,
    inline,
  });
  return data.url;
}

export async function managedGuestUpload(
  token: string,
  folderId: string,
  file: File,
  description?: string,
): Promise<void> {
  if (file.size > 500 * 1024 * 1024) {
    throw new Error('Guest uploads are limited to 500 MB per file');
  }
  const signed = await invokeGuest<{ uploadId: string; key: string; url: string }>({
    action: 'sign-upload',
    token,
    folderId,
    fileName: file.name,
    fileSize: file.size,
  });

  const uploadResponse = await fetch(signed.url, { method: 'PUT', body: file });
  if (!uploadResponse.ok) {
    const detail = await uploadResponse.text().catch(() => '');
    throw new Error(`Upload failed (HTTP ${uploadResponse.status})${detail ? `: ${detail.slice(0, 160)}` : ''}`);
  }

  await invokeGuest({
    action: 'finalize-upload',
    token,
    folderId,
    uploadId: signed.uploadId,
    key: signed.key,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type,
    description: description?.trim() || null,
  });
}