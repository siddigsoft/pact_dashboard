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
  if (error) throw new Error(error.message || 'R2 signing failed');
  if (data?.error) throw new Error(data.error);
  return data;
}

/** Uploads a file to R2. Returns the object key to store as storage_path. */
export async function r2Upload(file: File): Promise<{ key: string }> {
  const { key, url } = await sign('sign-upload', { fileName: file.name });
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
