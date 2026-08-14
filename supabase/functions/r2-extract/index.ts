/**
 * r2-extract — unpack a .zip already stored in R2 into workspace folders/files.
 *
 * Body (POST JSON):
 *   zipKey         string   R2 object key of the uploaded zip
 *   zipFileId      string   workspace_files.id of the zip row
 *   folderId       string|null  target parent folder
 *   securityLevel  string   security_level for created folders/files
 *
 * Limits: zip ≤ 100MB, ≤ 500 file entries. Skips __MACOSX / .DS_Store / path traversal.
 *
 * Secrets: same as r2-sign (R2_*)
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20'
import { unzipSync } from 'https://esm.sh/fflate@0.8.2'
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

const MAX_ZIP_BYTES = 100 * 1024 * 1024
const MAX_ENTRIES = 500
const SEC_LEVELS = new Set(['public', 'internal', 'confidential', 'restricted', 'top_secret'])

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv', txt: 'text/plain', md: 'text/markdown', json: 'application/json',
  zip: 'application/zip', mp4: 'video/mp4', mp3: 'audio/mpeg',
}

function guessMime(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return MIME[ext] || 'application/octet-stream'
}

function shouldSkip(path: string): boolean {
  const n = path.replace(/\\/g, '/')
  if (!n || n.endsWith('/')) return true
  if (n.includes('..')) return true
  if (n.startsWith('/') || /^[A-Za-z]:/.test(n)) return true
  if (n.startsWith('__MACOSX/') || n.includes('/__MACOSX/')) return true
  const base = n.split('/').pop() ?? ''
  if (base === '.DS_Store' || base === 'Thumbs.db') return true
  return false
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID')
  const ACCESS_KEY = Deno.env.get('R2_ACCESS_KEY_ID')
  const SECRET_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY')
  const BUCKET = Deno.env.get('R2_BUCKET')
  if (!ACCOUNT_ID || !ACCESS_KEY || !SECRET_KEY || !BUCKET) {
    return json({ error: 'R2 storage is not configured on the server' }, 500)
  }

  let body: {
    zipKey?: string
    zipFileId?: string
    folderId?: string | null
    securityLevel?: string
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const zipKey = body.zipKey
  const zipFileId = body.zipFileId
  const folderId = body.folderId ?? null
  const securityLevel = SEC_LEVELS.has(body.securityLevel ?? '') ? body.securityLevel! : 'internal'

  if (!validR2Key(zipKey)) {
    return json({ error: 'Invalid zipKey' }, 400)
  }
  if (typeof zipFileId !== 'string' || !zipFileId) {
    return json({ error: 'zipFileId is required' }, 400)
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const authHeader = req.headers.get('authorization') ?? ''

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: 'Unauthorized' }, 401)

  const { data: zipRow, error: zipErr } = await userClient
    .from('workspace_files')
    .select('id, storage_path, created_by, folder_id')
    .eq('id', zipFileId)
    .maybeSingle()
  if (zipErr || !zipRow) return json({ error: 'Zip file row not found' }, 404)
  if (zipRow.storage_path !== zipKey) return json({ error: 'zipKey mismatch' }, 400)

  await userClient
    .from('workspace_files')
    .update({ extract_status: 'extracting', updated_at: new Date().toISOString() })
    .eq('id', zipFileId)

  const r2 = new AwsClient({
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
    service: 's3',
    region: 'auto',
  })
  const endpoint = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}`

  async function r2Get(key: string): Promise<Uint8Array> {
    const signed = await r2.sign(new Request(r2ObjectUrl(endpoint, key), { method: 'GET' }))
    const res = await fetch(signed)
    if (!res.ok) throw new Error(`R2 GET failed (${res.status})`)
    const buf = new Uint8Array(await res.arrayBuffer())
    if (buf.byteLength > MAX_ZIP_BYTES) throw new Error(`Zip exceeds ${MAX_ZIP_BYTES / (1024 * 1024)}MB limit`)
    return buf
  }

  async function r2Put(key: string, data: Uint8Array, contentType: string) {
    const signed = await r2.sign(
      new Request(r2ObjectUrl(endpoint, key), {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: data,
      }),
    )
    const res = await fetch(signed)
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      throw new Error(`R2 PUT failed (${res.status}): ${t.slice(0, 120)}`)
    }
  }

  try {
    const zipBytes = await r2Get(zipKey)
    let files: Record<string, Uint8Array>
    try {
      files = unzipSync(zipBytes) as Record<string, Uint8Array>
    } catch {
      throw new Error('Invalid or corrupt ZIP archive')
    }

    const entries = Object.entries(files)
      .map(([path, data]) => ({ path: normalizePath(path), data }))
      .filter((e) => !shouldSkip(e.path))

    if (entries.length === 0) throw new Error('ZIP contains no extractable files')
    if (entries.length > MAX_ENTRIES) {
      throw new Error(`ZIP has ${entries.length} files; max is ${MAX_ENTRIES}`)
    }

    // Build folder tree under target folderId
    const folderIdMap: Record<string, string> = {}
    const folderPaths = new Set<string>()
    for (const e of entries) {
      const parts = e.path.split('/')
      for (let d = 1; d < parts.length; d++) {
        folderPaths.add(parts.slice(0, d).join('/'))
      }
    }
    const sortedFolders = Array.from(folderPaths).sort(
      (a, b) => a.split('/').length - b.split('/').length,
    )

    for (const folderPath of sortedFolders) {
      const parts = folderPath.split('/')
      const name = parts[parts.length - 1]
      const parentPath = parts.slice(0, -1).join('/')
      const parentId = parentPath ? (folderIdMap[parentPath] ?? null) : folderId
      const { data: created, error: folderErr } = await userClient
        .from('workspace_folders')
        .insert({
          name,
          parent_folder_id: parentId,
          security_level: securityLevel,
          created_by: user.id,
          is_system_folder: false,
          archived: false,
        })
        .select('id')
        .single()
      if (folderErr || !created?.id) {
        throw new Error(`Failed to create folder "${folderPath}": ${folderErr?.message ?? 'unknown'}`)
      }
      folderIdMap[folderPath] = created.id
    }

    async function folderBreadcrumb(id: string | null): Promise<string> {
      if (!id) return 'Hub'
      const names: string[] = []
      let current: string | null = id
      for (let i = 0; i < 8 && current; i++) {
        const { data } = await userClient
          .from('workspace_folders')
          .select('name, parent_folder_id')
          .eq('id', current)
          .maybeSingle()
        if (!data?.name) break
        names.unshift(data.name)
        current = data.parent_folder_id ?? null
      }
      return names.join('/') || 'Hub'
    }
    const basePath = await folderBreadcrumb(folderId)

    let uploaded = 0
    for (const e of entries) {
      const parts = e.path.split('/')
      const fileName = parts[parts.length - 1]
      const parentPath = parts.slice(0, -1).join('/')
      const targetFolder = parentPath ? (folderIdMap[parentPath] ?? folderId) : folderId
      const folderPath = [basePath, parentPath].filter(Boolean).join('/')
      const key = snapshotKey(folderPath, fileName, user.id)
      const mime = guessMime(fileName)
      const ext = fileName.split('.').pop()?.toLowerCase() ?? null

      await r2Put(key, e.data, mime)

      const { error: insertErr } = await userClient.from('workspace_files').insert({
        folder_id: targetFolder,
        name: fileName,
        description: null,
        storage_path: key,
        public_url: null,
        storage_provider: 'r2',
        file_size: e.data.byteLength,
        mime_type: mime,
        extension: ext,
        security_level: securityLevel,
        created_by: user.id,
        last_modified_by: user.id,
        tags: [],
        extract_status: null,
      })
      if (insertErr) {
        throw new Error(`Failed to register "${fileName}": ${insertErr.message}`)
      }
      uploaded++
    }

    await userClient
      .from('workspace_files')
      .update({ extract_status: 'done', updated_at: new Date().toISOString() })
      .eq('id', zipFileId)

    return json({ ok: true, extracted: uploaded, folders: sortedFolders.length })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Extract failed'
    await userClient
      .from('workspace_files')
      .update({ extract_status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', zipFileId)
    return json({ error: message }, 500)
  }
})
