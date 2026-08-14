/** Snapshot R2 keys from Hub folder path at upload time. Not rewritten on rename/move. */

export function sanitizeSegment(s: string): string {
  const t = s
    .normalize('NFC')
    .replace(/[\\/]/g, '-')
    .replace(/[^\p{L}\p{N}._-]+/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^[._]+|[._]+$/g, '')
    .slice(0, 80)
  return t || 'folder'
}

export function snapshotKey(folderPath: string | undefined, fileName: string, userId?: string): string {
  const ym = new Date().toISOString().slice(0, 7)
  const segs = (folderPath?.trim() ? folderPath : 'Hub')
    .split(/[/\\]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(sanitizeSegment)
    .slice(0, 8)

  const dot = fileName.lastIndexOf('.')
  const rawExt = dot > 0 ? fileName.slice(dot + 1) : ''
  const ext = rawExt.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 12)
  const base = sanitizeSegment(dot > 0 ? fileName.slice(0, dot) : fileName).slice(0, 120)
  const id = userId
    ? `${userId.slice(0, 8)}-${crypto.randomUUID().slice(0, 8)}`
    : crypto.randomUUID().slice(0, 8)
  const name = ext ? `${base}__${id}.${ext}` : `${base}__${id}`

  let key = [...segs, ym, name].join('/')
  if (key.length > 900) {
    key = [segs[0], segs[segs.length - 1], ym, name].filter(Boolean).join('/')
  }
  return key
}

export function validR2Key(key: unknown): key is string {
  if (typeof key !== 'string' || key.length < 1 || key.length > 1024) return false
  if (key.includes('..') || key.startsWith('/') || key.endsWith('/') || key.includes('//')) return false
  if (/[\x00-\x1f]/.test(key)) return false
  return key.split('/').every((seg) => seg.length > 0)
}

export function r2ObjectUrl(endpoint: string, key: string): string {
  return `${endpoint}/${key.split('/').map(encodeURIComponent).join('/')}`
}

/** True if this snapshot key was minted for `userId` (orphan-delete gate). */
export function keyOwnedByUser(key: string, userId: string): boolean {
  if (key.startsWith(`${userId}/`)) return true
  const leaf = key.split('/').pop() ?? ''
  return leaf.includes(`__${userId.slice(0, 8)}-`)
}
