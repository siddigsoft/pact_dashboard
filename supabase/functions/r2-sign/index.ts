/**
 * r2-sign — presigned URL broker for the Cloudflare R2 archive bucket.
 *
 * The browser never holds R2 credentials. This function verifies the caller
 * and returns short-lived presigned URLs; file bytes go browser ↔ R2 directly.
 *
 * Actions (POST JSON body):
 *  - sign-upload   { fileName, folderPath? } → { key, url }  (presigned PUT, 15 min)
 *                    Key is a snapshot of the Hub folder path + YYYY-MM +
 *                    unique filename. Client cannot pick the key.
 *                    Requires an authenticated user.
 *  - sign-download { key, filename? }  → { url }        (presigned GET, 1 h)
 *                    Authenticated users: always allowed (RLS on the metadata
 *                    table already gated what keys they can see).
 *                    Anonymous (share / QR FileViewer): any non-archived
 *                    workspace_files row — the share URL is the access grant.
 *  - delete        { key }             → { ok: true }
 *                    Requires auth. Allowed for legacy user-id prefixes,
 *                    unregistered snapshot keys (orphan cleanup), or keys
 *                    whose workspace_files row is visible under RLS.
 *  - move          { key, toKey }      → { ok: true, key }
 *                    Server-side CopyObject + delete. Used to park soft-deleted
 *                    files under trash/<original-key>. Same auth as delete.
 *
 * Secrets: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20'
import { snapshotKey, validR2Key, r2ObjectUrl, keyOwnedByUser } from '../_shared/r2SnapshotKey.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID')
  const ACCESS_KEY = Deno.env.get('R2_ACCESS_KEY_ID')
  const SECRET_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY')
  const BUCKET     = Deno.env.get('R2_BUCKET')
  if (!ACCOUNT_ID || !ACCESS_KEY || !SECRET_KEY || !BUCKET) {
    return json({ error: 'R2 storage is not configured on the server' }, 500)
  }

  let body: { action?: string; key?: string; toKey?: string; fileName?: string; filename?: string; folderPath?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const action = body.action

  const SUPABASE_URL     = Deno.env.get('SUPABASE_URL') ?? ''
  const ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const authHeader = req.headers.get('authorization') ?? ''

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  // Anon key passes the gateway but getUser() fails for it → user stays null.
  const { data: { user } } = await userClient.auth.getUser()

  async function callerMayTouchKey(key: string): Promise<boolean> {
    if (!user) return false
    if (keyOwnedByUser(key, user.id)) return true
    // Soft-delete parks objects under trash/<original-key>; allow either twin.
    const alt = key.startsWith('trash/') ? key.slice('trash/'.length) : `trash/${key}`
    const { data: row } = await userClient
      .from('workspace_files')
      .select('id')
      .eq('storage_provider', 'r2')
      .in('storage_path', [key, alt])
      .limit(1)
      .maybeSingle()
    return !!row
  }

  const r2 = new AwsClient({
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
    service: 's3',
    region: 'auto',
  })
  const endpoint = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}`

  async function presign(key: string, method: 'PUT' | 'GET' | 'DELETE', expires: number, extraParams?: Record<string, string>) {
    const url = new URL(r2ObjectUrl(endpoint, key))
    url.searchParams.set('X-Amz-Expires', String(expires))
    for (const [k, v] of Object.entries(extraParams ?? {})) url.searchParams.set(k, v)
    const signed = await r2.sign(new Request(url, { method }), { aws: { signQuery: true } })
    return signed.url
  }

  // ── sign-upload ─────────────────────────────────────────────────────────────
  if (action === 'sign-upload') {
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const fileName = body.fileName
    if (typeof fileName !== 'string' || !fileName) return json({ error: 'fileName is required' }, 400)
    const folderPath = typeof body.folderPath === 'string' ? body.folderPath : undefined
    const key = snapshotKey(folderPath, fileName, user.id)
    const url = await presign(key, 'PUT', 900)
    return json({ key, url })
  }

  // ── sign-download ───────────────────────────────────────────────────────────
  if (action === 'sign-download') {
    const key = body.key
    if (!validR2Key(key)) return json({ error: 'Invalid key' }, 400)

    if (!user) {
      // Anonymous share / QR viewer. The share URL is the access grant, including
      // Confidential and Top Secret files. Only require a live workspace_files row.
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
      const { data: row } = await admin
        .from('workspace_files')
        .select('id, archived')
        .eq('storage_path', key)
        .eq('storage_provider', 'r2')
        .maybeSingle()
      if (!row || row.archived) {
        return json({ error: 'Unauthorized' }, 401)
      }
    }

    const params: Record<string, string> = {}
    if (typeof body.filename === 'string' && body.filename) {
      const safe = body.filename.replace(/["\\\r\n]/g, '_')
      params['response-content-disposition'] = `attachment; filename="${safe}"`
    }
    const url = await presign(key, 'GET', 3600, params)
    return json({ url })
  }

  // ── delete ──────────────────────────────────────────────────────────────────
  if (action === 'delete') {
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const key = body.key
    if (!validR2Key(key)) return json({ error: 'Invalid key' }, 400)
    if (!(await callerMayTouchKey(key))) return json({ error: 'Forbidden' }, 403)

    const url = await presign(key, 'DELETE', 60)
    const res = await fetch(url, { method: 'DELETE' })
    if (!res.ok && res.status !== 404) {
      return json({ error: `R2 delete failed (${res.status})` }, 502)
    }
    return json({ ok: true })
  }

  // ── move (copy + delete) ────────────────────────────────────────────────────
  if (action === 'move') {
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const key = body.key
    const toKey = body.toKey
    if (!validR2Key(key) || !validR2Key(toKey)) return json({ error: 'Invalid key' }, 400)
    if (key === toKey) return json({ ok: true, key })
    if (!(await callerMayTouchKey(key))) return json({ error: 'Forbidden' }, 403)

    async function objectExists(objectKey: string): Promise<boolean> {
      const headSigned = await r2.sign(new Request(r2ObjectUrl(endpoint, objectKey), { method: 'HEAD' }))
      const headRes = await fetch(headSigned)
      return headRes.ok
    }

    // Idempotent: already parked at destination (double-click / retry).
    if (await objectExists(toKey)) {
      if (await objectExists(key)) {
        const delUrl = await presign(key, 'DELETE', 60)
        await fetch(delUrl, { method: 'DELETE' }).catch(() => {})
      }
      return json({ ok: true, key: toKey })
    }

    const copySource = `/${BUCKET}/${key.split('/').map(encodeURIComponent).join('/')}`
    const destUrl = r2ObjectUrl(endpoint, toKey)
    const copySigned = await r2.sign(new Request(destUrl, {
      method: 'PUT',
      headers: { 'x-amz-copy-source': copySource },
    }))
    const copyRes = await fetch(copySigned)
    if (!copyRes.ok) {
      const detail = await copyRes.text().catch(() => '')
      // Race: another request already moved the object.
      if (await objectExists(toKey)) return json({ ok: true, key: toKey })
      return json({
        error: `R2 copy failed (${copyRes.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`,
      }, 502)
    }

    const delUrl = await presign(key, 'DELETE', 60)
    const delRes = await fetch(delUrl, { method: 'DELETE' })
    if (!delRes.ok && delRes.status !== 404) {
      return json({ error: `R2 delete-after-copy failed (${delRes.status})` }, 502)
    }
    return json({ ok: true, key: toKey })
  }

  return json({ error: `Unknown action: ${action}` }, 400)
})
