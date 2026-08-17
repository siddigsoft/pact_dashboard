import { supabase } from '@/integrations/supabase/client';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Strip wrapping junk WhatsApp / iOS sometimes leaves on the path segment. */
export function sanitizeShareCode(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let value = raw;
  try {
    value = decodeURIComponent(value);
  } catch {
    // keep the raw value
  }
  value = value.trim().replace(/[\s\u0000-\u001f]+/g, '');
  value = value.replace(/\/+$/, '').replace(/[.,;:!?)]+$/g, '');
  if (!value || value.length > 36) return null;
  return value;
}

export interface SharedFileRow {
  id: string;
  name: string;
  mime_type: string | null;
  extension: string | null;
  public_url: string | null;
  storage_path: string;
  storage_provider: 'supabase' | 'r2';
  file_size: number;
  description: string | null;
  security_level: string;
  short_code: string | null;
  allow_download: boolean;
  is_pinned: boolean;
  tags: string[];
  created_at: string;
}

export interface SharedFolderRow {
  id: string;
  name: string;
  description: string | null;
  parent_folder_id: string | null;
  security_level: string;
  color: string;
  icon: string;
  short_code: string | null;
  password_protected: boolean;
}

export interface SharedFolderPayload {
  folder: SharedFolderRow;
  subfolders: SharedFolderRow[];
  files: SharedFileRow[];
}

export async function fetchSharedFile(code: string): Promise<SharedFileRow | null> {
  const { data, error } = await (supabase as any).rpc('get_shared_workspace_file', {
    p_code: code,
  });
  if (error || !data) return null;
  return data as SharedFileRow;
}

export async function fetchSharedFolder(
  shareCode: string,
  folderId?: string | null,
): Promise<SharedFolderPayload | null> {
  const args: { p_code: string; p_folder_id?: string } = { p_code: shareCode };
  if (folderId && UUID_RE.test(folderId)) args.p_folder_id = folderId;
  const { data, error } = await (supabase as any).rpc('get_shared_workspace_folder', args);
  if (error || !data?.folder) return null;
  return {
    folder: data.folder as SharedFolderRow,
    subfolders: (data.subfolders ?? []) as SharedFolderRow[],
    files: (data.files ?? []) as SharedFileRow[],
  };
}
