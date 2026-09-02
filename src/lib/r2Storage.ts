import { supabase } from '@/integrations/supabase/client';

/**
 * Client for the r2-sign edge function. New Workspace Hub uploads live in
 * Cloudflare R2 (storage_provider === 'r2'); bytes go browser ↔ R2 directly
 * via presigned URLs — see supabase/functions/r2-sign/index.ts.
 */

async function sign(action: string, payload: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke('r2-sign', {
    body: { action, ...payload },
  });
  if (data?.error) throw new Error(data.error);
  if (error) {
    // supabase-js often masks the function body as a generic non-2xx message.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const body = await ctx.json();
        if (body?.error) throw new Error(body.error);
      } catch (e) {
        if (e instanceof Error && e.message !== error.message) throw e;
      }
    }
    throw new Error(error.message || 'R2 signing failed');
  }
  return data;
}

/** Uploads a file to R2. Returns the object key to store as storage_path.
 *  Pass folderPath (Hub breadcrumb) so the R2 key is a labeled snapshot. */
export async function r2Upload(file: File, opts?: { folderPath?: string }): Promise<{ key: string }> {
  const { key, url } = await sign('sign-upload', { fileName: file.name, folderPath: opts?.folderPath });
  // Presigned URL signs only `host` (see r2-sign). Do NOT send Content-Type —
  // an unsigned Content-Type header makes R2 return 401 SignatureDoesNotMatch,
  // which browsers then surface as a misleading CORS failure.
  let res: Response;
  try {
    res = await fetch(url, { method: 'PUT', body: file });
  } catch (e: any) {
    throw new Error(
      e?.message === 'Failed to fetch'
        ? 'R2 upload blocked (CORS or network). Confirm the pact-workspace-archive bucket CORS allows https://app.pactorg.com with PUT.'
        : (e?.message || 'R2 upload failed')
    );
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`R2 upload failed (HTTP ${res.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`);
  }
  return { key };
}

/** Presigned GET URL (1h). Pass filename to force a download disposition. */
export async function r2SignedUrl(key: string, filename?: string): Promise<string> {
  const { url } = await sign('sign-download', { key, filename });
  return url;
}

export async function r2Delete(keys: string | string[]): Promise<void> {
  const list = Array.isArray(keys) ? keys : [keys];
  await Promise.all(list.map(key => sign('delete', { key })));
}

/** Soft-deleted workspace objects live under this R2 prefix. */
export const R2_TRASH_PREFIX = 'trash/';

export function isR2TrashKey(key: string): boolean {
  return key.startsWith(R2_TRASH_PREFIX);
}

export function toR2TrashKey(key: string): string {
  return isR2TrashKey(key) ? key : `${R2_TRASH_PREFIX}${key}`;
}

export function fromR2TrashKey(key: string): string {
  return isR2TrashKey(key) ? key.slice(R2_TRASH_PREFIX.length) : key;
}

/** Server-side copy+delete in R2. Returns the destination key. */
export async function r2Move(fromKey: string, toKey: string): Promise<string> {
  if (fromKey === toKey) return toKey;
  const data = await sign('move', { key: fromKey, toKey });
  return (data.key as string) || toKey;
}

export async function r2MoveToTrash(key: string): Promise<string> {
  if (isR2TrashKey(key)) return key;
  return r2Move(key, toR2TrashKey(key));
}

export async function r2RestoreFromTrash(key: string): Promise<string> {
  return r2Move(key, fromR2TrashKey(key));
}

/** Stored on task JSON so we can tell R2 keys from old Supabase public URLs. */
export const R2_REF_PREFIX = 'r2:';

export function toR2Ref(key: string): string {
  return `${R2_REF_PREFIX}${key}`;
}

export function parseR2Ref(url: string): string | null {
  return url.startsWith(R2_REF_PREFIX) ? url.slice(R2_REF_PREFIX.length) : null;
}

/** Upload a completed-site photo. Returns the r2: ref to persist (photo_url). */
export async function uploadSiteVisitPhoto(file: File, siteId: string): Promise<{ key: string; ref: string }> {
  const { key } = await r2Upload(file, { folderPath: `SiteVisits/${siteId}` });
  return { key, ref: toR2Ref(key) };
}

/** Resolve an r2: ref to a short-lived GET URL; leave legacy public URLs unchanged. */
export async function resolveStoredFileUrl(url: string): Promise<string> {
  const key = parseR2Ref(url);
  return key ? r2SignedUrl(key) : url;
}

export function supabaseWorkspacePathFromUrl(url: string): string | null {
  const m = url.match(/\/workspace-files\/(.+)$/);
  return m ? decodeURIComponent(m[1].split('?')[0]) : null;
}

/** Open a stored file URL (R2 ref or legacy public URL) in a new tab. */
export async function openStoredFile(url: string): Promise<void> {
  const key = parseR2Ref(url);
  const href = key ? await r2SignedUrl(key) : url;
  window.open(href, '_blank', 'noopener,noreferrer');
}

/** Best-effort delete of a stored file URL. */
export async function deleteStoredFile(url: string): Promise<void> {
  const r2Key = parseR2Ref(url);
  if (r2Key) {
    await r2Delete(r2Key);
    return;
  }
  const path = supabaseWorkspacePathFromUrl(url);
  if (path) await supabase.storage.from('workspace-files').remove([path]);
}

const MAX_ZIP_BYTES = 100 * 1024 * 1024;

export function isZipFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';
}

/** Ask the edge function to unpack a zip already in R2 into workspace folders/files. */
export async function r2ExtractZip(opts: {
  zipKey: string;
  zipFileId: string;
  folderId: string | null;
  securityLevel: string;
}): Promise<{ extracted: number; folders: number }> {
  const { data, error } = await supabase.functions.invoke('r2-extract', {
    body: opts,
  });
  if (error) throw new Error(error.message || 'ZIP extract failed');
  if (data?.error) throw new Error(data.error);
  return { extracted: data.extracted ?? 0, folders: data.folders ?? 0 };
}

export { MAX_ZIP_BYTES };
