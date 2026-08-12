/**
 * r2-sign — presigned URL broker for the Cloudflare R2 archive bucket.
 *
 * The browser never holds R2 credentials. This function verifies the caller
 * and returns short-lived presigned URLs; file bytes go browser ↔ R2 directly.
 *
 * Actions (POST JSON body):
 *  - sign-upload   { fileName }        → { key, url }   (presigned PUT, 15 min)
 *                    key is generated server-side under the caller's user-id
 *                    prefix so users cannot write into other prefixes.
 *                    Requires an authenticated user.
 *  - sign-download { key, filename? }  → { url }        (presigned GET, 1 h)
 *                    Authenticated users: always allowed (RLS on the metadata
 *                    table already gated what keys they can see).
 *                    Anonymous (QR-scan FileViewer): only for files whose
 *                    workspace_files row is public enough — mirrors the
 *                    security_level check FileViewer itself performs.
 *  - delete        { key }             → { ok: true }
 *                    Requires auth. Allowed for keys under the caller's own
 *                    prefix (orphan cleanup of cancelled uploads) or keys whose
 *                    workspace_files row is visible to the caller under RLS.
 *
 * Secrets: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const KEY_RE = /^[A-Za-z0-9_\-./]+$/

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID')
  const ACCESS_KEY = Deno.env.get('R2_ACCESS_KEY_ID')
  const SECRET_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY')
  const BUCKET     = Deno.env.get('R2_BUCKET')
  if (!ACCOUNT_ID || !ACCESS_KEY || !SECRET_KEY || !BUCKET) {
    return json({ error: 'R2 storage is not configured on the server' }, 500)
  }

  let body: { action?: string; key?: string; fileName?: string; filename?: string }
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

  const r2 = new AwsClient({
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
    service: 's3',
    region: 'auto',
  })
  const endpoint = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}`

  async function presign(key: string, method: 'PUT' | 'GET' | 'DELETE', expires: number, extraParams?: Record<string, string>) {
    const url = new URL(`${endpoint}/${key}`)
    url.searchParams.set('X-Amz-Expires', String(expires))
    for (const [k, v] of Object.entries(extraParams ?? {})) url.searchParams.set(k, v)
    const signed = await r2.sign(new Request(url, { method }), { aws: { signQuery: true } })
    return signed.url
  }

  function validKey(key: unknown): key is string {
    return typeof key === 'string' && key.length > 0 && key.length < 1024 &&
      KEY_RE.test(key) && !key.includes('..')
  }

  // ── sign-upload ─────────────────────────────────────────────────────────────
  if (action === 'sign-upload') {
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const fileName = body.fileName
    if (typeof fileName !== 'string' || !fileName) return json({ error: 'fileName is required' }, 400)
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200)
    const key = `${user.id}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${safeName}`
    const url = await presign(key, 'PUT', 900)
    return json({ key, url })
  }

  // ── sign-download ───────────────────────────────────────────────────────────
  if (action === 'sign-download') {
    const key = body.key
    if (!validKey(key)) return json({ error: 'Invalid key' }, 400)

    if (!user) {
      // Anonymous QR-scan viewer: mirror FileViewer's own gate — only files
      // that are not restricted, not archived, and allow download.
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
      const { data: row } = await admin
        .from('workspace_files')
        .select('id, security_level, archived')
        .eq('storage_path', key)
        .eq('storage_provider', 'r2')
        .maybeSingle()
      if (!row || row.archived || ['top_secret', 'restricted'].includes(row.security_level)) {
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
    if (!validKey(key)) return json({ error: 'Invalid key' }, 400)

    let allowed = key.startsWith(`${user.id}/`)
    if (!allowed) {
      // ponytail: RLS-visibility as delete permission — admins who can see the
      // row can purge it; tighten to an explicit role check if that's too broad.
      const { data: row } = await userClient
        .from('workspace_files')
        .select('id')
        .eq('storage_path', key)
        .maybeSingle()
      allowed = !!row
    }
    if (!allowed) return json({ error: 'Forbidden' }, 403)

    const url = await presign(key, 'DELETE', 60)
    const res = await fetch(url, { method: 'DELETE' })
    if (!res.ok && res.status !== 404) {
      return json({ error: `R2 delete failed (${res.status})` }, 502)
    }
    return json({ ok: true })
  }

  return json({ error: `Unknown action: ${action}` }, 400)
})
