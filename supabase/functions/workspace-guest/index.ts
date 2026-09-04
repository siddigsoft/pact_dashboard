/**
 * Token-validated Workspace guest access.
 *
 * Actions:
 *  - resolve         { token, folderId? }
 *  - sign-download   { token, fileId }
 *  - sign-upload     { token, folderId, fileName }
 *  - finalize-upload { token, folderId, key, fileName, fileSize, mimeType?, description? }
 *
 * Guest tokens are checked for hash match, revocation, and expiry on every call.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20'
import { snapshotKey, validR2Key, r2ObjectUrl } from '../_shared/r2SnapshotKey.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_GUEST_UPLOAD_BYTES = 500 * 1024 * 1024

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID') ?? ''
  const ACCESS_KEY = Deno.env.get('R2_ACCESS_KEY_ID') ?? ''
  const SECRET_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY') ?? ''
  const BUCKET = Deno.env.get('R2_BUCKET') ?? ''
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: 'Workspace guest access is not configured' }, 500)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const action = typeof body.action === 'string' ? body.action : ''
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  if (!/^[0-9a-f]{48}$/i.test(token)) return json({ error: 'Invalid guest link' }, 401)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const tokenHash = await sha256Hex(token)
  const { data: access, error: accessError } = await admin
    .from('workspace_guest_access')
    .select('id, folder_id, guest_name, guest_email, access_level, token_hash, expires_at, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (accessError) return json({ error: 'Guest access is unavailable' }, 500)
  if (!access || access.revoked_at || new Date(access.expires_at).getTime() <= Date.now()) {
    return json({ error: 'This guest link has expired or been revoked' }, 401)
  }

  async function getFolder(folderId: string) {
    if (!UUID_RE.test(folderId)) return null
    const { data } = await admin
      .from('workspace_folders')
      .select('id, name, description, parent_folder_id, security_level, color, icon, short_code, password_hash, archived')
      .eq('id', folderId)
      .maybeSingle()
    return data && !data.archived ? data : null
  }

  async function isInsideSharedFolder(folderId: string): Promise<boolean> {
    let cursor: string | null = folderId
    const visited = new Set<string>()
    for (let depth = 0; cursor && depth < 100; depth++) {
      if (cursor === access.folder_id) return true
      if (visited.has(cursor)) return false
      visited.add(cursor)
      const folder = await getFolder(cursor)
      if (!folder) return false
      cursor = folder.parent_folder_id
    }
    return false
  }

  await admin
    .from('workspace_guest_access')
    .update({ last_accessed_at: new Date().toISOString() })
    .eq('id', access.id)

  if (action === 'resolve') {
    const requestedId =
      typeof body.folderId === 'string' && UUID_RE.test(body.folderId)
        ? body.folderId
        : access.folder_id
    if (!(await isInsideSharedFolder(requestedId))) {
      return json({ error: 'Folder is outside this guest share' }, 403)
    }

    const folder = await getFolder(requestedId)
    if (!folder) return json({ error: 'Folder not found' }, 404)

    const [{ data: subfolders, error: foldersError }, { data: files, error: filesError }] =
      await Promise.all([
        admin
          .from('workspace_folders')
          .select('id, name, description, parent_folder_id, security_level, color, icon, short_code, password_hash')
          .eq('parent_folder_id', requestedId)
          .eq('archived', false)
          .order('name'),
        admin
          .from('workspace_files')
          .select('id, folder_id, name, description, file_size, mime_type, extension, security_level, storage_provider, short_code, allow_download, is_pinned, tags, created_at')
          .eq('folder_id', requestedId)
          .eq('archived', false)
          .order('name'),
      ])
    if (foldersError || filesError) return json({ error: 'Failed to load folder contents' }, 500)

    return json({
      access: {
        id: access.id,
        guestName: access.guest_name,
        accessLevel: access.access_level,
        expiresAt: access.expires_at,
      },
      folder: {
        ...folder,
        password_protected: !!folder.password_hash,
        password_hash: undefined,
        archived: undefined,
      },
      subfolders: (subfolders ?? []).map((item) => ({
        ...item,
        password_protected: !!item.password_hash,
        password_hash: undefined,
      })),
      files: files ?? [],
    })
  }

  if (!ACCOUNT_ID || !ACCESS_KEY || !SECRET_KEY || !BUCKET) {
    return json({ error: 'R2 storage is not configured on the server' }, 500)
  }
  const r2 = new AwsClient({
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
    service: 's3',
    region: 'auto',
  })
  const endpoint = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}`

  async function presign(
    key: string,
    method: 'PUT' | 'GET',
    expires: number,
    extraParams?: Record<string, string>,
    signedHeaders?: Record<string, string>,
  ) {
    const url = new URL(r2ObjectUrl(endpoint, key))
    url.searchParams.set('X-Amz-Expires', String(expires))
    for (const [name, value] of Object.entries(extraParams ?? {})) {
      url.searchParams.set(name, value)
    }
    const signed = await r2.sign(
      new Request(url, { method, headers: signedHeaders }),
      { aws: { signQuery: true } },
    )
    return signed.url
  }

  if (action === 'sign-download') {
    const fileId = typeof body.fileId === 'string' ? body.fileId : ''
    if (!UUID_RE.test(fileId)) return json({ error: 'Invalid file' }, 400)
    const { data: file } = await admin
      .from('workspace_files')
      .select('id, folder_id, name, storage_path, storage_provider, public_url, allow_download, archived')
      .eq('id', fileId)
      .maybeSingle()
    if (
      !file ||
      file.archived ||
      !file.allow_download ||
      !file.folder_id ||
      !(await isInsideSharedFolder(file.folder_id))
    ) {
      return json({ error: 'Download is not allowed' }, 403)
    }
    if (file.storage_provider !== 'r2') {
      if (!file.public_url) return json({ error: 'Download is unavailable' }, 404)
      return json({ url: file.public_url })
    }
    if (!validR2Key(file.storage_path)) return json({ error: 'Download is unavailable' }, 404)
    const safeName = file.name.replace(/["\\\r\n]/g, '_')
    // Keep the direct-R2 handoff extremely short. Revocation blocks every new
    // request immediately; a URL already issued can only start for 30 seconds.
    const url = await presign(
      file.storage_path,
      'GET',
      30,
      body.inline === true
        ? undefined
        : { 'response-content-disposition': `attachment; filename="${safeName}"` },
    )
    return json({ url })
  }

  if (action === 'sign-upload') {
    if (access.access_level !== 'editor') return json({ error: 'Editor access is required' }, 403)
    const folderId = typeof body.folderId === 'string' ? body.folderId : ''
    const fileName = typeof body.fileName === 'string' ? body.fileName.trim() : ''
    const fileSize = Number(body.fileSize)
    if (
      !UUID_RE.test(folderId) ||
      !fileName ||
      !Number.isSafeInteger(fileSize) ||
      fileSize < 0 ||
      fileSize > MAX_GUEST_UPLOAD_BYTES
    ) {
      return json({ error: 'Folder, filename, and a file size up to 500 MB are required' }, 400)
    }
    if (!(await isInsideSharedFolder(folderId))) return json({ error: 'Folder is outside this guest share' }, 403)
    const folder = await getFolder(folderId)
    if (!folder) return json({ error: 'Folder not found' }, 404)

    const { data: expiredIntents } = await admin
      .from('workspace_guest_upload_intents')
      .select('id, upload_key')
      .eq('access_id', access.id)
      .is('consumed_at', null)
      .lte('expires_at', new Date().toISOString())
    for (const expired of expiredIntents ?? []) {
      if (validR2Key(expired.upload_key)) {
        const deleteRequest = await r2.sign(
          new Request(r2ObjectUrl(endpoint, expired.upload_key), { method: 'DELETE' }),
        )
        await fetch(deleteRequest).catch(() => {})
      }
    }
    if (expiredIntents?.length) {
      await admin
        .from('workspace_guest_upload_intents')
        .delete()
        .in('id', expiredIntents.map((intent) => intent.id))
    }

    const uploadKey = snapshotKey('Guest Uploads/Pending', fileName, access.id)
    const finalKey = snapshotKey(`Guest Uploads/${folder.name}`, fileName, access.id)
    const { data: uploadId, error: intentError } = await admin.rpc(
      'create_workspace_guest_upload_intent',
      {
        p_access_id: access.id,
        p_token_hash: tokenHash,
        p_folder_id: folderId,
        p_upload_key: uploadKey,
        p_final_key: finalKey,
        p_expected_size: fileSize,
      },
    )
    if (intentError || !uploadId) {
      return json({ error: intentError?.message ?? 'Could not authorize upload' }, 429)
    }

    const url = await presign(uploadKey, 'PUT', 900, undefined, {
      'content-length': String(fileSize),
    })
    return json({ uploadId, key: uploadKey, url })
  }

  if (action === 'finalize-upload') {
    if (access.access_level !== 'editor') return json({ error: 'Editor access is required' }, 403)
    const folderId = typeof body.folderId === 'string' ? body.folderId : ''
    const uploadId = typeof body.uploadId === 'string' ? body.uploadId : ''
    const key = typeof body.key === 'string' ? body.key : ''
    const fileName = typeof body.fileName === 'string' ? body.fileName.trim() : ''
    if (
      !UUID_RE.test(folderId) ||
      !UUID_RE.test(uploadId) ||
      !validR2Key(key) ||
      !fileName
    ) {
      return json({ error: 'Invalid upload metadata' }, 400)
    }
    if (!(await isInsideSharedFolder(folderId))) return json({ error: 'Folder is outside this guest share' }, 403)
    const { data: intent } = await admin
      .from('workspace_guest_upload_intents')
      .select('id, folder_id, upload_key, final_key, expected_size, expires_at, consumed_at')
      .eq('id', uploadId)
      .eq('access_id', access.id)
      .maybeSingle()
    if (
      !intent ||
      intent.folder_id !== folderId ||
      intent.upload_key !== key ||
      intent.consumed_at ||
      new Date(intent.expires_at).getTime() <= Date.now()
    ) {
      return json({ error: 'Upload authorization is invalid, expired, or already used' }, 403)
    }

    const headRequest = await r2.sign(new Request(r2ObjectUrl(endpoint, key), { method: 'HEAD' }))
    const headResponse = await fetch(headRequest)
    if (!headResponse.ok) return json({ error: 'Uploaded object was not found' }, 400)
    const actualSize = Number(headResponse.headers.get('content-length') ?? -1)
    if (!Number.isSafeInteger(actualSize) || actualSize !== Number(intent.expected_size)) {
      return json({ error: 'Uploaded file size does not match the authorized size' }, 400)
    }

    const copySource = `/${BUCKET}/${key.split('/').map(encodeURIComponent).join('/')}`
    const copySigned = await r2.sign(new Request(r2ObjectUrl(endpoint, intent.final_key), {
      method: 'PUT',
      headers: { 'x-amz-copy-source': copySource },
    }))
    const copyResponse = await fetch(copySigned)
    if (!copyResponse.ok) return json({ error: 'Could not finalize uploaded object' }, 502)

    const { data: inserted, error: insertError } = await admin.rpc('finalize_workspace_guest_upload', {
      p_access_id: access.id,
      p_upload_id: uploadId,
      p_final_key: intent.final_key,
      p_file_name: fileName,
      p_actual_size: actualSize,
      p_mime_type: typeof body.mimeType === 'string' ? body.mimeType : '',
      p_description: typeof body.description === 'string' ? body.description : '',
    })
    if (insertError) {
      const { data: committedFile } = await admin
        .from('workspace_files')
        .select('id')
        .eq('storage_provider', 'r2')
        .eq('storage_path', intent.final_key)
        .maybeSingle()
      if (!committedFile) {
        const cleanup = await r2.sign(new Request(r2ObjectUrl(endpoint, intent.final_key), { method: 'DELETE' }))
        await fetch(cleanup).catch(() => {})
      }
      return json({ error: insertError.message }, 500)
    }

    const deletePending = await r2.sign(new Request(r2ObjectUrl(endpoint, key), { method: 'DELETE' }))
    await fetch(deletePending).catch(() => {})
    return json({ ok: true, file: inserted })
  }

  return json({ error: 'Unsupported action' }, 400)
})