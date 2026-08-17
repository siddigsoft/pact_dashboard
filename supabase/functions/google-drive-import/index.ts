import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20'
import { snapshotKey, r2ObjectUrl } from '../_shared/r2SnapshotKey.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? ''
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''

const ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID') ?? ''
const ACCESS_KEY = Deno.env.get('R2_ACCESS_KEY_ID') ?? ''
const SECRET_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY') ?? ''
const BUCKET = Deno.env.get('R2_BUCKET') ?? ''

type ImportBody = {
  driveFileId: string
  folderId: string | null
  folderPath?: string
  securityLevel: string
  description?: string | null
  tags?: string[]
}

const isGoogleNativeDoc = (mimeType: string) => mimeType.startsWith('application/vnd.google-apps.')

async function refreshGoogleAccessToken(refreshToken: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!response.ok) throw new Error('Failed to refresh Google Drive token')
  return await response.json() as { access_token: string; expires_in?: number }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  if (!ACCOUNT_ID || !ACCESS_KEY || !SECRET_KEY || !BUCKET) {
    return new Response(JSON.stringify({ error: 'R2 is not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  try {
    const authHeader = req.headers.get('authorization') ?? ''
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const body = await req.json() as ImportBody
    if (!body.driveFileId) {
      return new Response(JSON.stringify({ error: 'driveFileId is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { data: tokenRow } = await admin
      .from('user_integration_tokens')
      .select('access_token, refresh_token, token_expiry')
      .eq('user_id', user.id)
      .eq('provider', 'google_drive')
      .maybeSingle()

    if (!tokenRow?.access_token) {
      return new Response(JSON.stringify({ error: 'Google Drive is not connected. Connect it in Integrations first.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    let accessToken = tokenRow.access_token as string
    const expiresAt = tokenRow.token_expiry ? new Date(tokenRow.token_expiry as string).getTime() : null
    if (expiresAt && Date.now() > expiresAt - 60_000 && tokenRow.refresh_token && GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
      const refreshed = await refreshGoogleAccessToken(tokenRow.refresh_token as string)
      accessToken = refreshed.access_token
      await admin
        .from('user_integration_tokens')
        .update({
          access_token: accessToken,
          token_expiry: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString() : null,
        })
        .eq('user_id', user.id)
        .eq('provider', 'google_drive')
    }

    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(body.driveFileId)}?fields=id,name,mimeType,size`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    if (!metaRes.ok) {
      return new Response(JSON.stringify({ error: 'Failed to read Google Drive file metadata' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const meta = await metaRes.json() as { id: string; name: string; mimeType: string; size?: string }
    if (isGoogleNativeDoc(meta.mimeType)) {
      return new Response(JSON.stringify({ error: 'Google Docs/Sheets/Slides export is not supported yet. Import binary files first.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const downloadRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(body.driveFileId)}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    if (!downloadRes.ok || !downloadRes.body) {
      return new Response(JSON.stringify({ error: 'Failed to download file from Google Drive' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const key = snapshotKey(body.folderPath, meta.name, user.id)
    const endpoint = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}`
    const signer = new AwsClient({
      accessKeyId: ACCESS_KEY,
      secretAccessKey: SECRET_KEY,
      service: 's3',
      region: 'auto',
    })
    const signedReq = await signer.sign(new Request(r2ObjectUrl(endpoint, key), { method: 'PUT' }), {
      aws: { signQuery: true },
    })
    const putRes = await fetch(signedReq.url, { method: 'PUT', body: downloadRes.body })
    if (!putRes.ok) {
      return new Response(JSON.stringify({ error: `Failed to upload file to R2 (${putRes.status})` }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const ext = meta.name.includes('.') ? meta.name.split('.').pop()?.toLowerCase() ?? null : null
    const { data: inserted, error: insertErr } = await userClient
      .from('workspace_files')
      .insert({
        folder_id: body.folderId ?? null,
        name: meta.name,
        description: body.description ?? null,
        storage_path: key,
        public_url: null,
        storage_provider: 'r2',
        file_size: Number(meta.size ?? 0),
        mime_type: meta.mimeType ?? null,
        extension: ext,
        security_level: body.securityLevel,
        created_by: user.id,
        last_modified_by: user.id,
        tags: Array.isArray(body.tags) ? body.tags : [],
      } as any)
      .select('id,name,storage_path')
      .single()
    if (insertErr || !inserted) {
      return new Response(JSON.stringify({ error: insertErr?.message ?? 'Failed to register imported file' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ success: true, file: inserted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error('google-drive-import error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

