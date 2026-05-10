/**
 * daily-digest-cron
 *
 * Server-side scheduled Edge Function that mirrors the client-side
 * useDailyCoordinatorDigest hook. Can be triggered:
 *   1. Via pg_cron / Supabase Scheduled Functions (set to run daily at 07:00 UTC)
 *   2. Manually via HTTP POST (admin use / testing)
 *
 * Environment variables required:
 *   SUPABASE_URL            — auto-injected by Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — auto-injected by Supabase (needed for cross-user writes)
 *   APP_URL                 — e.g. https://app.pactorg.com
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APP_URL = Deno.env.get('APP_URL') ?? 'https://app.pactorg.com'
const DELAY_DAYS = 3
const ESCALATION_DAYS = 7
const STALE_MMP_DAYS = 2
const RETURNED_SITE_DAYS = 3

// ─── role helpers ─────────────────────────────────────────────────────────────
const normalRole = (r: string | null) => (r ?? '').toLowerCase().replace(/[\s_()\-]/g, '')
const isCoordinator = (r: string | null) => normalRole(r) === 'coordinator'
const isSupervisorR = (r: string | null) => ['supervisor', 'hubsupervisor'].includes(normalRole(r))
const isFomOrAbove  = (r: string | null) => ['fom', 'fieldoperationmanagerfom', 'admin', 'superadmin'].includes(normalRole(r))

// ─── date helpers ─────────────────────────────────────────────────────────────
function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000))
}

function startOfWeekIso(): string {
  const d = new Date()
  d.setDate(d.getDate() - 6)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function isWeekly(): boolean { return new Date().getDay() === 0 }

function enWaiting(n: number): string {
  if (n === 0) return 'just submitted'
  if (n === 1) return '1 day waiting'
  return `${n} days waiting`
}
function arWaiting(n: number): string {
  if (n === 0) return 'للتو'
  if (n === 1) return 'منذ يوم'
  if (n === 2) return 'منذ يومين'
  if (n <= 10) return `منذ ${n} أيام`
  return `منذ ${n} يوماً`
}
function arDays(n: number): string {
  if (n === 0) return 'اليوم'
  if (n === 1) return 'منذ يوم'
  if (n === 2) return 'منذ يومين'
  if (n <= 10) return `منذ ${n} أيام`
  return `منذ ${n} يوماً`
}
function enDays(n: number): string {
  if (n === 0) return 'today'
  if (n === 1) return '1 day ago'
  return `${n} days ago`
}
function hubMatches(a: string, b: string): boolean {
  const la = a.trim().toLowerCase(), lb = b.trim().toLowerCase()
  return la === lb || la.includes(lb) || lb.includes(la)
}

function dpRequesterDisplayName(d: { metadata?: unknown; requested_by?: string | null }): string {
  let meta: Record<string, unknown> = {}
  if (d.metadata != null && typeof d.metadata === 'object' && !Array.isArray(d.metadata)) {
    meta = d.metadata as Record<string, unknown>
  } else if (typeof d.metadata === 'string') {
    try { meta = JSON.parse(d.metadata) as Record<string, unknown> } catch { meta = {} }
  }
  const n = meta.requested_by_name
  if (typeof n === 'string' && n.trim()) return n.trim()
  return d.requested_by?.slice(0, 8) ?? 'Unknown'
}

// ─── types ────────────────────────────────────────────────────────────────────
interface CoordRow {
  coordinatorId: string; coordinatorName: string; hubOffice: string
  totalAssigned: number; totalVerified: number; totalReturned: number; pendingVerification: number
  lastVerifiedAt: string | null; oldestPendingAt: string | null
  daysSinceVerified: number | null; daysOldestPending: number | null
  isDelayed: boolean; isEscalated: boolean
}
interface DPRow {
  id: string; status: string; hubName: string
  requesterName: string; requesterId: string; createdAt: string | null
}
interface OpCostRow { id: string; submittedByName: string; hubName: string; submittedAt: string | null }
interface StaleMmpRow { id: string; title: string; coordinatorName: string; hubOffice: string; forwardedAt: string | null; daysStale: number | null }
interface ReturnedSiteRow { id: string; siteName: string; coordinatorId: string; coordinatorName: string; hubOffice: string; returnedAt: string | null; daysWaiting: number | null }
interface FundReceiptRow { id: string; recipientName: string; recipientId: string; hubName: string; approvedAt: string | null; amount: number; currency: string; daysWaiting: number | null }
interface WeeklyStats { verifiedThisWeek: number; totalPendingVerif: number; dpApprovedThisWeek: number; dpPendingTotal: number }
interface OwnDPRow { id: string; status: string; daysWaiting: number | null }
interface DigestData {
  coordinators: CoordRow[]; dpPendingSupervisor: DPRow[]; dpPendingAdmin: DPRow[]
  opCostsPending: OpCostRow[]; staleMmps: StaleMmpRow[]; returnedSites: ReturnedSiteRow[]
  fundReceipts: FundReceiptRow[]; weeklyStats: WeeklyStats | null; hubNameCache: Map<string, string>
}
interface Msg { title_en: string; title_ar: string; en: string; ar: string; action_url: string; isCritical: boolean }

// ─── fetchers ─────────────────────────────────────────────────────────────────
async function fetchCoordinators(sb: ReturnType<typeof createClient>): Promise<CoordRow[]> {
  const { data } = await sb.from('mmp_site_entries')
    .select('id, accepted_by, status, hub_office, verified_at, completed_at, dispatched_at')
    .not('accepted_by', 'is', null).limit(8000)

  const map = new Map<string, CoordRow>()
  for (const e of (data ?? [])) {
    const key = e.accepted_by as string
    if (!map.has(key)) {
      map.set(key, { coordinatorId: key, coordinatorName: '', hubOffice: e.hub_office ?? '',
        totalAssigned: 0, totalVerified: 0, totalReturned: 0, pendingVerification: 0,
        lastVerifiedAt: null, oldestPendingAt: null, daysSinceVerified: null, daysOldestPending: null,
        isDelayed: false, isEscalated: false })
    }
    const r = map.get(key)!
    if (e.hub_office && !r.hubOffice) r.hubOffice = e.hub_office
    r.totalAssigned++
    const st = (e.status ?? '').toLowerCase()
    const verified = ['verified', 'completed', 'accepted'].includes(st)
    const returned = st === 'returned'
    const pending = !verified && !returned
    if (verified) { r.totalVerified++; const ts = (e.completed_at ?? e.verified_at) as string | null; if (ts && (!r.lastVerifiedAt || ts > r.lastVerifiedAt)) r.lastVerifiedAt = ts }
    if (returned) r.totalReturned++
    if (pending) { r.pendingVerification++; if (e.dispatched_at && (!r.oldestPendingAt || e.dispatched_at < r.oldestPendingAt)) r.oldestPendingAt = e.dispatched_at }
  }

  const ids = [...map.keys()]
  if (ids.length) {
    const { data: profs } = await sb.from('user_profiles').select('id, full_name, email').in('id', ids)
    ;(profs ?? []).forEach((p: any) => { const r = map.get(p.id); if (r) r.coordinatorName = p.full_name ?? p.email ?? p.id.slice(0, 8) })
  }

  for (const r of map.values()) {
    r.daysSinceVerified = daysSince(r.lastVerifiedAt)
    r.daysOldestPending = daysSince(r.oldestPendingAt)
    if (r.pendingVerification > 0) {
      const d = r.daysSinceVerified
      r.isDelayed = d === null || d >= DELAY_DAYS
      r.isEscalated = d === null || d >= ESCALATION_DAYS
    }
  }
  return [...map.values()].sort((a, b) => {
    if (a.isEscalated !== b.isEscalated) return a.isEscalated ? -1 : 1
    if (a.isDelayed !== b.isDelayed) return a.isDelayed ? -1 : 1
    return (b.daysSinceVerified ?? 9999) - (a.daysSinceVerified ?? 9999)
  })
}

async function fetchDownPayments(sb: ReturnType<typeof createClient>): Promise<DPRow[]> {
  const { data } = await sb.from('down_payment_requests')
    .select('id, status, hub_name, requested_by, metadata, created_at')
    .in('status', ['pending_supervisor', 'pending_admin']).order('created_at', { ascending: true }).limit(500)
  return (data ?? []).map((d: any) => ({
    id: d.id, status: d.status, hubName: d.hub_name ?? '',
    requesterName: dpRequesterDisplayName(d),
    requesterId: d.requested_by ?? '', createdAt: d.created_at,
  }))
}

async function fetchOpCosts(sb: ReturnType<typeof createClient>): Promise<OpCostRow[]> {
  try {
    const { data } = await sb.from('pending_cost_approvals').select('*').order('submitted_at', { ascending: true }).limit(200)
    return (data ?? []).map((d: any) => ({ id: d.id, submittedByName: d.submitted_by_name ?? d.submitter_name ?? 'Unknown', hubName: d.hub_name ?? d.hub ?? '', submittedAt: d.submitted_at }))
  } catch { return [] }
}

async function fetchStaleMmps(sb: ReturnType<typeof createClient>): Promise<StaleMmpRow[]> {
  try {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - STALE_MMP_DAYS)
    const { data } = await sb.from('mmp_files').select('id, name, coordinator_id, hub, updated_at')
      .in('status', ['forwarded_to_coordinator', 'pending_acceptance']).lt('updated_at', cutoff.toISOString()).order('updated_at', { ascending: true }).limit(100)
    if (!data?.length) return []
    const ids = [...new Set((data as any[]).map(d => d.coordinator_id).filter(Boolean))]
    const nameMap = new Map<string, string>()
    if (ids.length) {
      const { data: profs } = await sb.from('user_profiles').select('id, full_name, email').in('id', ids)
      ;(profs ?? []).forEach((p: any) => nameMap.set(p.id, p.full_name ?? p.email ?? p.id.slice(0, 8)))
    }
    return (data as any[]).map(d => ({ id: d.id, title: d.name ?? d.id.slice(0, 8), coordinatorName: d.coordinator_id ? (nameMap.get(d.coordinator_id) ?? d.coordinator_id.slice(0, 8)) : 'Unassigned', hubOffice: d.hub ?? '', forwardedAt: d.updated_at, daysStale: daysSince(d.updated_at) }))
  } catch { return [] }
}

async function fetchReturnedSites(sb: ReturnType<typeof createClient>): Promise<ReturnedSiteRow[]> {
  try {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - RETURNED_SITE_DAYS)
    const { data } = await sb.from('mmp_site_entries').select('id, site_name, accepted_by, hub_office, updated_at')
      .eq('status', 'returned').lt('updated_at', cutoff.toISOString()).order('updated_at', { ascending: true }).limit(200)
    if (!data?.length) return []
    const ids = [...new Set((data as any[]).map(d => d.accepted_by).filter(Boolean))]
    const nameMap = new Map<string, string>()
    if (ids.length) {
      const { data: profs } = await sb.from('user_profiles').select('id, full_name, email').in('id', ids)
      ;(profs ?? []).forEach((p: any) => nameMap.set(p.id, p.full_name ?? p.email ?? p.id.slice(0, 8)))
    }
    return (data as any[]).map(d => ({ id: d.id, siteName: d.site_name ?? 'Unknown Site', coordinatorId: d.accepted_by ?? '', coordinatorName: d.accepted_by ? (nameMap.get(d.accepted_by) ?? d.accepted_by.slice(0, 8)) : 'Unknown', hubOffice: d.hub_office ?? '', returnedAt: d.updated_at, daysWaiting: daysSince(d.updated_at) }))
  } catch { return [] }
}

async function fetchFundReceipts(sb: ReturnType<typeof createClient>, hubNameCache: Map<string, string>): Promise<FundReceiptRow[]> {
  try {
    const { data } = await sb.from('withdrawal_requests').select('id, user_id, approved_at, amount, currency, updated_at')
      .eq('status', 'approved').or('fund_receipt_confirmed.is.null,fund_receipt_confirmed.eq.false').order('approved_at', { ascending: true }).limit(100)
    if (!data?.length) return []
    const ids = [...new Set((data as any[]).map(d => d.user_id).filter(Boolean))]
    const nameMap = new Map<string, string>()
    const hubIdByUser = new Map<string, string | null>()
    if (ids.length) {
      const { data: profs } = await sb.from('user_profiles').select('id, full_name, email, hub_id').in('id', ids)
      ;(profs ?? []).forEach((p: any) => {
        nameMap.set(p.id, p.full_name ?? p.email ?? p.id.slice(0, 8))
        hubIdByUser.set(p.id, p.hub_id ?? null)
      })
    }
    return (data as any[]).map(d => {
      const hid = d.user_id ? hubIdByUser.get(d.user_id) : null
      const hubLabel = hid ? (hubNameCache.get(hid) ?? hid) : ''
      return { id: d.id, recipientName: d.user_id ? (nameMap.get(d.user_id) ?? d.user_id.slice(0, 8)) : 'Unknown', recipientId: d.user_id ?? '', hubName: hubLabel, approvedAt: d.approved_at ?? d.updated_at, amount: d.amount ?? 0, currency: d.currency ?? 'SDG', daysWaiting: daysSince(d.approved_at ?? d.updated_at) }
    })
  } catch { return [] }
}

async function fetchWeeklyStats(sb: ReturnType<typeof createClient>): Promise<WeeklyStats | null> {
  if (!isWeekly()) return null
  try {
    const weekStart = startOfWeekIso()
    const [a, b, c, d] = await Promise.all([
      sb.from('mmp_site_entries').select('id', { count: 'exact', head: true }).in('status', ['verified', 'completed']).or(`verified_at.gte.${weekStart},completed_at.gte.${weekStart}`),
      sb.from('down_payment_requests').select('id', { count: 'exact', head: true }).eq('status', 'approved').gte('updated_at', weekStart),
      sb.from('mmp_site_entries').select('id', { count: 'exact', head: true }).not('status', 'in', '("verified","completed","returned","accepted")'),
      sb.from('down_payment_requests').select('id', { count: 'exact', head: true }).in('status', ['pending_supervisor', 'pending_admin']),
    ])
    return { verifiedThisWeek: a.count ?? 0, dpApprovedThisWeek: b.count ?? 0, totalPendingVerif: c.count ?? 0, dpPendingTotal: d.count ?? 0 }
  } catch { return null }
}

async function fetchHubNames(sb: ReturnType<typeof createClient>): Promise<Map<string, string>> {
  const cache = new Map<string, string>()
  try {
    const { data } = await sb.from('hubs').select('id, name').limit(200)
    ;(data ?? []).forEach((h: any) => { if (h.id && h.name) cache.set(h.id, h.name) })
  } catch {}
  return cache
}

async function fetchOwnDPs(sb: ReturnType<typeof createClient>, userId: string): Promise<OwnDPRow[]> {
  try {
    const { data } = await sb.from('down_payment_requests').select('id, status, created_at')
      .eq('requested_by', userId).in('status', ['pending_supervisor', 'pending_admin']).order('created_at', { ascending: true }).limit(20)
    return (data ?? []).map((d: any) => ({ id: d.id, status: d.status, daysWaiting: daysSince(d.created_at) }))
  } catch { return [] }
}

// ─── message builders ─────────────────────────────────────────────────────────
function buildCoordinatorSelf(s: CoordRow, ownDPs: OwnDPRow[], ownReturnedSites: ReturnedSiteRow[]): Msg {
  const urgency = s.isEscalated ? '🔴' : s.isDelayed ? '⚠️' : '📋'
  const linesEn: string[] = [
    `📊 Sites: ${s.totalVerified}/${s.totalAssigned} verified | ${s.pendingVerification} pending | ${s.totalReturned} returned`,
    s.isEscalated
      ? (s.daysSinceVerified === null ? '🔴 CRITICAL: You have NEVER verified any site!' : `🔴 CRITICAL: No verification action for ${s.daysSinceVerified} days — escalated to management!`)
      : s.isDelayed
        ? (s.daysSinceVerified === null ? '🔴 You have never verified any site yet!' : `🔴 No verification action for ${s.daysSinceVerified} day${s.daysSinceVerified! > 1 ? 's' : ''}!`)
        : (s.daysSinceVerified !== null ? `✅ Last verified ${enDays(s.daysSinceVerified)}` : '✅ All sites are up to date'),
  ]
  const linesAr: string[] = [
    `📊 المواقع: ${s.totalVerified}/${s.totalAssigned} محقَّق | ${s.pendingVerification} معلّق | ${s.totalReturned} مُعاد`,
    s.isEscalated
      ? (s.daysSinceVerified === null ? '🔴 حرج: لم تقم بالتحقق من أي موقع على الإطلاق!' : `🔴 حرج: لا يوجد إجراء تحقق ${arDays(s.daysSinceVerified!)} — تم إبلاغ الإدارة!`)
      : s.isDelayed
        ? (s.daysSinceVerified === null ? '🔴 لم تقم بالتحقق من أي موقع حتى الآن!' : `🔴 لا يوجد إجراء تحقق ${arDays(s.daysSinceVerified!)}!`)
        : (s.daysSinceVerified !== null ? `✅ آخر تحقق ${arDays(s.daysSinceVerified)}` : '✅ جميع المواقع محدّثة'),
  ]
  if (s.daysOldestPending != null && s.pendingVerification > 0) {
    linesEn.push(`⏳ Oldest pending site: ${enWaiting(s.daysOldestPending)}`)
    linesAr.push(`⏳ أقدم موقع معلّق: ${arWaiting(s.daysOldestPending)}`)
  }
  if (s.pendingVerification > 0) {
    linesEn.push(`\n👉 ACTION REQUIRED: Verify your ${s.pendingVerification} pending site${s.pendingVerification > 1 ? 's' : ''}.`)
    linesAr.push(`\n👉 إجراء مطلوب: قم بالتحقق من ${s.pendingVerification} موقع معلّق.`)
  }
  if (ownReturnedSites.length > 0) {
    linesEn.push(`\n🔁 RETURNED SITES (${ownReturnedSites.length}) — Need your attention:`)
    linesAr.push(`\n🔁 مواقع مُعادة (${ownReturnedSites.length}) — تحتاج إلى مراجعتك:`)
    ownReturnedSites.slice(0, 5).forEach(rs => {
      linesEn.push(`  • ${rs.siteName}${rs.daysWaiting != null ? ` — returned ${enWaiting(rs.daysWaiting)}` : ''}`)
      linesAr.push(`  • ${rs.siteName}${rs.daysWaiting != null ? ` — مُعاد ${arWaiting(rs.daysWaiting)}` : ''}`)
    })
    if (ownReturnedSites.length > 5) { linesEn.push(`  … and ${ownReturnedSites.length - 5} more`); linesAr.push(`  … و${ownReturnedSites.length - 5} مواقع أخرى`) }
  }
  if (ownDPs.length > 0) {
    linesEn.push(`\n💳 YOUR DOWN PAYMENT REQUESTS (${ownDPs.length} waiting):`)
    linesAr.push(`\n💳 طلبات الدفعة المقدمة (${ownDPs.length} في الانتظار):`)
    ownDPs.slice(0, 3).forEach(dp => {
      const label = dp.status === 'pending_supervisor' ? 'Awaiting supervisor' : 'Awaiting admin'
      const labelAr = dp.status === 'pending_supervisor' ? 'بانتظار المشرف' : 'بانتظار الإدارة'
      linesEn.push(`  • ${label}${dp.daysWaiting != null ? ` — ${enWaiting(dp.daysWaiting)}` : ''}`)
      linesAr.push(`  • ${labelAr}${dp.daysWaiting != null ? ` — ${arWaiting(dp.daysWaiting)}` : ''}`)
    })
  }
  return { title_en: `${urgency} Your Daily Action Summary`, title_ar: `${urgency} ملخص إجراءاتك اليومية`, en: linesEn.join('\n'), ar: linesAr.join('\n'), action_url: '/mmp', isCritical: s.isEscalated }
}

function buildGroupMsg(data: DigestData, scopeLabel: string, scopeLabelAr: string, recipientRole: string, hubName: string | null): Msg {
  const coords = hubName ? data.coordinators.filter(c => c.hubOffice && hubMatches(c.hubOffice, hubName)) : data.coordinators
  const dpSup  = hubName ? data.dpPendingSupervisor.filter(d => d.hubName && hubMatches(d.hubName, hubName)) : data.dpPendingSupervisor
  const dpAdm  = isFomOrAbove(recipientRole) ? data.dpPendingAdmin : []
  const opCosts = isFomOrAbove(recipientRole) ? data.opCostsPending : []
  const frs    = isFomOrAbove(recipientRole) ? data.fundReceipts : []
  const stale  = hubName ? data.staleMmps.filter(m => !m.hubOffice || hubMatches(m.hubOffice, hubName)) : data.staleMmps
  const ret    = hubName ? data.returnedSites.filter(rs => rs.hubOffice && hubMatches(rs.hubOffice, hubName)) : data.returnedSites

  const escalated = coords.filter(c => c.isEscalated)
  const delayed   = coords.filter(c => c.isDelayed)
  const totalPending = coords.reduce((s, c) => s + c.pendingVerification, 0)
  const totalActions = dpSup.length + dpAdm.length + opCosts.length + frs.length
  const urgency = escalated.length > 0 ? '🔴' : totalActions > 0 || delayed.length > 0 ? '⚠️' : '📋'

  const dateEn = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  const dateAr = new Date().toLocaleDateString('ar-SA', { weekday: 'short', day: 'numeric', month: 'short' })
  const linesEn: string[] = [`${urgency} Daily Action Summary — ${scopeLabel} (${dateEn})`, '']
  const linesAr: string[] = [`${urgency} ملخص الإجراءات اليومية — ${scopeLabelAr} (${dateAr})`, '']

  // Weekly stats
  if (data.weeklyStats && isWeekly()) {
    const ws = data.weeklyStats
    const cr = ws.verifiedThisWeek > 0 ? ((ws.verifiedThisWeek / (ws.verifiedThisWeek + ws.totalPendingVerif)) * 100).toFixed(1) : '0'
    linesEn.push('📅 WEEKLY SUMMARY (last 7 days):', `  • ✅ Verified: ${ws.verifiedThisWeek.toLocaleString()}`, `  • ⏳ Pending: ${ws.totalPendingVerif.toLocaleString()}`, `  • 📊 Coverage: ${cr}%`, `  • 💳 DPs approved: ${ws.dpApprovedThisWeek} | pending: ${ws.dpPendingTotal}`, '')
    linesAr.push('📅 الملخص الأسبوعي:', `  • ✅ محقَّق: ${ws.verifiedThisWeek.toLocaleString()}`, `  • ⏳ معلّق: ${ws.totalPendingVerif.toLocaleString()}`, `  • 📊 التغطية: ${cr}%`, `  • 💳 دفعات معتمدة: ${ws.dpApprovedThisWeek} | معلّقة: ${ws.dpPendingTotal}`, '')
  }

  // Escalation
  if (escalated.length > 0) {
    linesEn.push(`🚨 ESCALATION: ${escalated.length} coordinator${escalated.length > 1 ? 's' : ''} inactive for ${ESCALATION_DAYS}+ days:`)
    linesAr.push(`🚨 تصعيد: ${escalated.length} منسق${escalated.length > 1 ? 'ون' : ''} غير نشط${escalated.length > 1 ? 'ون' : ''} منذ أكثر من ${ESCALATION_DAYS} أيام:`)
    escalated.slice(0, 5).forEach(c => {
      linesEn.push(`  🔴 ${c.coordinatorName} (${c.hubOffice}) — ${c.daysSinceVerified === null ? 'Never verified' : `${c.daysSinceVerified}d inactive`} | ${c.pendingVerification} pending`)
      linesAr.push(`  🔴 ${c.coordinatorName} (${c.hubOffice}) — ${c.daysSinceVerified === null ? 'لم يتحقق أبداً' : arDays(c.daysSinceVerified)} | ${c.pendingVerification} معلّق`)
    })
    linesEn.push(''); linesAr.push('')
  }

  // Actions section
  const actEn: string[] = []; const actAr: string[] = []
  if (dpSup.length > 0) {
    const o = dpSup[0].createdAt ? daysSince(dpSup[0].createdAt) : null
    actEn.push(`  • 💳 Down Payment (Supervisor): ${dpSup.length} pending${o != null ? ` (oldest: ${enWaiting(o)})` : ''}`)
    actAr.push(`  • 💳 دفعات مقدمة (مشرف): ${dpSup.length} معلّق${o != null ? ` (الأقدم: ${arWaiting(o)})` : ''}`)
    dpSup.slice(0, 3).forEach(d => { const w = d.createdAt ? daysSince(d.createdAt) : null; actEn.push(`    ↳ ${d.requesterName} (${d.hubName})${w != null ? ` — ${enWaiting(w)}` : ''}`); actAr.push(`    ↳ ${d.requesterName} (${d.hubName})${w != null ? ` — ${arWaiting(w)}` : ''}`) })
    if (dpSup.length > 3) { actEn.push(`    ↳ … and ${dpSup.length - 3} more`); actAr.push(`    ↳ … و${dpSup.length - 3} أخرى`) }
  }
  if (dpAdm.length > 0) {
    const o = dpAdm[0].createdAt ? daysSince(dpAdm[0].createdAt) : null
    actEn.push(`  • 💳 Down Payment (Admin): ${dpAdm.length} pending${o != null ? ` (oldest: ${enWaiting(o)})` : ''}`)
    actAr.push(`  • 💳 دفعات مقدمة (إدارة): ${dpAdm.length} معلّق${o != null ? ` (الأقدم: ${arWaiting(o)})` : ''}`)
    dpAdm.slice(0, 3).forEach(d => { const w = d.createdAt ? daysSince(d.createdAt) : null; actEn.push(`    ↳ ${d.requesterName} (${d.hubName})${w != null ? ` — ${enWaiting(w)}` : ''}`); actAr.push(`    ↳ ${d.requesterName} (${d.hubName})${w != null ? ` — ${arWaiting(w)}` : ''}`) })
    if (dpAdm.length > 3) { actEn.push(`    ↳ … and ${dpAdm.length - 3} more`); actAr.push(`    ↳ … و${dpAdm.length - 3} أخرى`) }
  }
  if (opCosts.length > 0) {
    const o = opCosts[0].submittedAt ? daysSince(opCosts[0].submittedAt) : null
    actEn.push(`  • 🧾 Operational Costs: ${opCosts.length} pending${o != null ? ` (oldest: ${enWaiting(o)})` : ''}`)
    actAr.push(`  • 🧾 تكاليف تشغيلية: ${opCosts.length} معلّق${o != null ? ` (الأقدم: ${arWaiting(o)})` : ''}`)
    opCosts.slice(0, 3).forEach(oc => { const w = oc.submittedAt ? daysSince(oc.submittedAt) : null; actEn.push(`    ↳ ${oc.submittedByName} (${oc.hubName})${w != null ? ` — ${enWaiting(w)}` : ''}`); actAr.push(`    ↳ ${oc.submittedByName} (${oc.hubName})${w != null ? ` — ${arWaiting(w)}` : ''}`) })
    if (opCosts.length > 3) { actEn.push(`    ↳ … and ${opCosts.length - 3} more`); actAr.push(`    ↳ … و${opCosts.length - 3} أخرى`) }
  }
  if (frs.length > 0) {
    const o = frs[0].daysWaiting
    actEn.push(`  • 💰 Fund Receipt Confirmations: ${frs.length} payment${frs.length > 1 ? 's' : ''} not yet confirmed by recipient${o != null ? ` (oldest: ${enWaiting(o)})` : ''}`)
    actAr.push(`  • 💰 تأكيدات استلام: ${frs.length} دفعة لم يؤكد استلامها${o != null ? ` (الأقدم: ${arWaiting(o)})` : ''}`)
    frs.slice(0, 3).forEach(fr => { actEn.push(`    ↳ ${fr.recipientName} (${fr.hubName}) — ${fr.amount.toLocaleString()} ${fr.currency}${fr.daysWaiting != null ? ` — ${enWaiting(fr.daysWaiting)}` : ''}`); actAr.push(`    ↳ ${fr.recipientName} (${fr.hubName}) — ${fr.amount.toLocaleString()} ${fr.currency}${fr.daysWaiting != null ? ` — ${arWaiting(fr.daysWaiting)}` : ''}`) })
    if (frs.length > 3) { actEn.push(`    ↳ … and ${frs.length - 3} more`); actAr.push(`    ↳ … و${frs.length - 3} أخرى`) }
  }
  if (actEn.length > 0) {
    linesEn.push(`🔵 ACTIONS REQUIRED FROM YOU (${totalActions} items):`); linesEn.push(...actEn, '')
    linesAr.push(`🔵 إجراءات مطلوبة منك (${totalActions} بنود):`); linesAr.push(...actAr, '')
  }

  // Stale MMPs
  if (stale.length > 0) {
    linesEn.push(`📂 STALE MMPs (${stale.length}) — Not accepted by coordinator:`)
    linesAr.push(`📂 خطط مراقبة معلّقة (${stale.length}) — لم يقبلها المنسق:`)
    stale.slice(0, 5).forEach(m => { linesEn.push(`  • ${m.title} → ${m.coordinatorName}${m.daysStale != null ? ` — ${enWaiting(m.daysStale)}` : ''}`); linesAr.push(`  • ${m.title} → ${m.coordinatorName}${m.daysStale != null ? ` — ${arWaiting(m.daysStale)}` : ''}`) })
    if (stale.length > 5) { linesEn.push(`  … and ${stale.length - 5} more`); linesAr.push(`  … و${stale.length - 5} أخرى`) }
    linesEn.push(''); linesAr.push('')
  }

  // Returned sites
  if (ret.length > 0) {
    const byCoord = new Map<string, { name: string; count: number; oldest: number | null }>()
    ret.forEach(rs => { if (!byCoord.has(rs.coordinatorId)) byCoord.set(rs.coordinatorId, { name: rs.coordinatorName, count: 0, oldest: null }); const g = byCoord.get(rs.coordinatorId)!; g.count++; if (rs.daysWaiting != null && (g.oldest === null || rs.daysWaiting > g.oldest)) g.oldest = rs.daysWaiting })
    linesEn.push(`🔁 RETURNED SITES (${ret.length}) — Awaiting coordinator fixes:`)
    linesAr.push(`🔁 مواقع مُعادة (${ret.length}) — تنتظر إصلاح المنسق:`)
    ;[...byCoord.entries()].slice(0, 6).forEach(([, g]) => { linesEn.push(`  • ${g.name}: ${g.count} returned${g.oldest != null ? ` (oldest: ${enWaiting(g.oldest)})` : ''}`); linesAr.push(`  • ${g.name}: ${g.count} مُعاد${g.oldest != null ? ` (الأقدم: ${arWaiting(g.oldest)})` : ''}`) })
    linesEn.push(''); linesAr.push('')
  }

  // Coordinator status
  if (coords.length > 0) {
    linesEn.push(`📋 COORDINATOR STATUS (${coords.length} | ${totalPending} sites pending):`)
    linesAr.push(`📋 حالة المنسقين (${coords.length} | ${totalPending} موقع معلّق):`)
    if (delayed.length > 0) { linesEn.push(`  ⚠️ ${delayed.length} delayed (≥${DELAY_DAYS} days)`); linesAr.push(`  ⚠️ ${delayed.length} متأخر`) }
    coords.slice(0, 10).forEach(c => {
      let le = `  • ${c.coordinatorName}: ${c.totalVerified}/${c.totalAssigned} verified`
      let la = `  • ${c.coordinatorName}: ${c.totalVerified}/${c.totalAssigned} محقَّق`
      if (c.pendingVerification > 0) { le += `, ${c.pendingVerification} pending`; la += `، ${c.pendingVerification} معلّق` }
      if (c.isEscalated) { le += ` 🔴 ESCALATED`; la += ` 🔴 مُصعَّد` }
      else if (c.isDelayed) { le += ` 🔴 ${c.daysSinceVerified ?? 'never'}d inactive`; la += ` 🔴 ${c.daysSinceVerified != null ? arDays(c.daysSinceVerified) : 'لم يتحقق أبداً'}` }
      else if (c.daysSinceVerified !== null) { le += `  ✅ ${enDays(c.daysSinceVerified)}`; la += `  ✅ ${arDays(c.daysSinceVerified)}` }
      linesEn.push(le); linesAr.push(la)
    })
    if (coords.length > 10) { linesEn.push(`  … and ${coords.length - 10} more`); linesAr.push(`  … و${coords.length - 10} آخرين`) }
  }

  const actionUrl = dpSup.length > 0 ? '/supervisor-approvals' : dpAdm.length > 0 ? '/down-payment-approval' : opCosts.length > 0 ? '/cost-approval' : '/mmp'
  return { title_en: `${urgency} Daily Action Summary — ${scopeLabel}`, title_ar: `${urgency} ملخص الإجراءات اليومية — ${scopeLabelAr}`, en: linesEn.join('\n'), ar: linesAr.join('\n'), action_url: actionUrl, isCritical: escalated.length > 0 }
}

// ─── send one notification (de-duped) + FCM push if critical ─────────────────
async function sendDigest(sb: ReturnType<typeof createClient>, recipientId: string, msg: Msg): Promise<void> {
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)
  const { data: existing } = await sb.from('notifications').select('id')
    .eq('recipient_id', recipientId).ilike('title_en', '%Daily Action Summary%').gte('created_at', startOfDay.toISOString()).limit(1)
  if (existing && existing.length > 0) return

  const { data: inserted } = await sb.from('notifications').insert({
    recipient_id: recipientId, user_id: recipientId,
    title_en: msg.title_en, title_ar: msg.title_ar,
    message_en: msg.en, message_ar: msg.ar,
    type: 'daily_digest', entity_type: 'mmp',
    action_url: msg.action_url,
    is_read: false, created_at: new Date().toISOString(),
  }).select('id').single()

  if (msg.isCritical) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    if (supabaseUrl && anonKey) {
      fetch(`${supabaseUrl}/functions/v1/send-fcm-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
        body: JSON.stringify({
          user_ids: [recipientId],
          title: msg.title_en,
          body: msg.en.split('\n').slice(0, 3).join(' ').slice(0, 200),
          priority: 'high',
          notification_type: 'daily_digest',
          action_url: `${APP_URL}${msg.action_url}`,
          data: { type: 'daily_digest', action_url: msg.action_url },
          ...(inserted?.id ? { notification_id: inserted.id } : {}),
        }),
      }).catch(() => {})
    }
  }
}

async function sendWeeklySummary(sb: ReturnType<typeof createClient>, recipientId: string, data: DigestData, scopeLabel: string, scopeLabelAr: string): Promise<void> {
  if (!data.weeklyStats || !isWeekly()) return
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)
  const { data: existing } = await sb.from('notifications').select('id').eq('recipient_id', recipientId).ilike('title_en', '%Weekly Summary%').gte('created_at', startOfDay.toISOString()).limit(1)
  if (existing && existing.length > 0) return
  const ws = data.weeklyStats
  const cr = ws.verifiedThisWeek > 0 ? ((ws.verifiedThisWeek / (ws.verifiedThisWeek + ws.totalPendingVerif)) * 100).toFixed(1) : '0'
  await sb.from('notifications').insert({
    recipient_id: recipientId, user_id: recipientId,
    title_en: `📅 Weekly Summary — ${scopeLabel}`, title_ar: `📅 الملخص الأسبوعي — ${scopeLabelAr}`,
    message_en: `📅 Weekly Summary — ${scopeLabel}\n\n✅ Verified this week: ${ws.verifiedThisWeek.toLocaleString()}\n⏳ Still pending: ${ws.totalPendingVerif.toLocaleString()}\n📊 Coverage: ${cr}%\n💳 DPs approved: ${ws.dpApprovedThisWeek} | pending: ${ws.dpPendingTotal}`,
    message_ar: `📅 الملخص الأسبوعي — ${scopeLabelAr}\n\n✅ محقَّق هذا الأسبوع: ${ws.verifiedThisWeek.toLocaleString()}\n⏳ معلّق: ${ws.totalPendingVerif.toLocaleString()}\n📊 التغطية: ${cr}%\n💳 دفعات معتمدة: ${ws.dpApprovedThisWeek} | معلّقة: ${ws.dpPendingTotal}`,
    type: 'weekly_digest', entity_type: 'mmp', action_url: '/mmp',
    is_read: false, created_at: new Date().toISOString(),
  })
}

// ─── visit reminders ──────────────────────────────────────────────────────────
async function sendVisitReminders(sb: ReturnType<typeof createClient>): Promise<number> {
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const in3Days = new Date(today); in3Days.setDate(in3Days.getDate() + 3); in3Days.setHours(23, 59, 59, 999)

    const { data: sites } = await sb.from('mmp_site_entries')
      .select('id, site_name, site_code, visit_date, visit_date_from, accepted_by, hub_office')
      .in('status', ['dispatched', 'accepted', 'assigned'])
      .not('accepted_by', 'is', null)
      .gte('visit_date', today.toISOString())
      .lte('visit_date', in3Days.toISOString())
      .order('visit_date', { ascending: true })
      .limit(500)

    if (!sites?.length) return 0

    let sent = 0
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)

    for (const site of (sites as any[])) {
      if (!site.accepted_by) continue
      const visitDate = site.visit_date || site.visit_date_from
      if (!visitDate) continue

      const daysUntil = Math.floor((new Date(visitDate).getTime() - today.getTime()) / 86_400_000)
      if (daysUntil < 0 || daysUntil > 3) continue

      const siteName: string = site.site_name || site.site_code || 'Unknown Site'
      const dateFormatted = new Date(visitDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })

      const urgencyEn = daysUntil === 0 ? '🚨 Today' : daysUntil === 1 ? '⚠️ Tomorrow' : `📅 In ${daysUntil} days`
      const urgencyAr = daysUntil === 0 ? '🚨 اليوم' : daysUntil === 1 ? '⚠️ غداً' : `📅 خلال ${daysUntil} أيام`

      // De-dup: skip if a reminder was already sent today for this site+recipient
      const { data: existing } = await sb.from('notifications').select('id')
        .eq('recipient_id', site.accepted_by)
        .eq('entity_id', site.id)
        .ilike('title_en', '%Visit Reminder%')
        .gte('created_at', startOfDay.toISOString()).limit(1)
      if (existing && existing.length > 0) continue

      await sb.from('notifications').insert({
        recipient_id: site.accepted_by,
        user_id: site.accepted_by,
        title_en: `${urgencyEn} — Visit Reminder`,
        title_ar: `${urgencyAr} — تذكير بزيارة`,
        message_en: `${urgencyEn}: Your site visit to "${siteName}" is scheduled for ${dateFormatted}. Please confirm you are prepared.`,
        message_ar: `${urgencyAr}: زيارتك لموقع "${siteName}" مقررة في ${dateFormatted}. يرجى التأكد من جاهزيتك.`,
        type: 'reminder',
        entity_id: site.id,
        entity_type: 'siteVisit',
        action_url: '/mmp',
        priority: daysUntil === 0 ? 'urgent' : daysUntil === 1 ? 'high' : 'normal',
        is_read: false,
        created_at: new Date().toISOString(),
      })
      sent++
    }
    return sent
  } catch (err) {
    console.error('[daily-digest-cron] Visit reminders error:', err)
    return 0
  }
}

// ─── main ─────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const sb = createClient(supabaseUrl, serviceKey)

    const hubNameCache = await fetchHubNames(sb)
    const [
      coordinators, allDPs, opCostsPending, staleMmps, returnedSites, fundReceipts, weeklyStats, visitRemindersSent,
    ] =
      await Promise.all([
        fetchCoordinators(sb), fetchDownPayments(sb), fetchOpCosts(sb),
        fetchStaleMmps(sb), fetchReturnedSites(sb), fetchFundReceipts(sb, hubNameCache),
        fetchWeeklyStats(sb),
        sendVisitReminders(sb),
      ])

    const data: DigestData = {
      coordinators, dpPendingSupervisor: allDPs.filter(d => d.status === 'pending_supervisor'),
      dpPendingAdmin: allDPs.filter(d => d.status === 'pending_admin'),
      opCostsPending, staleMmps, returnedSites, fundReceipts, weeklyStats, hubNameCache,
    }

    // Fan-out to all users
    const { data: allProfiles } = await sb.from('user_profiles').select('id, role, hub_id').not('role', 'is', null).limit(500)
    if (!allProfiles) throw new Error('No profiles found')

    let sent = 0
    for (const p of allProfiles) {
      const role = p.role
      if (isCoordinator(role)) {
        const selfRow = data.coordinators.find(c => c.coordinatorId === p.id)
        if (!selfRow || selfRow.totalAssigned === 0) continue
        const ownDPs = await fetchOwnDPs(sb, p.id)
        const ownRet = data.returnedSites.filter(rs => rs.coordinatorId === p.id)
        await sendDigest(sb, p.id, buildCoordinatorSelf(selfRow, ownDPs, ownRet))
        sent++
      } else if (isSupervisorR(role)) {
        const hubName = data.hubNameCache.get(p.hub_id ?? '') ?? null
        if (!hubName) continue
        const msg = buildGroupMsg(data, hubName, hubName, role, hubName)
        await sendDigest(sb, p.id, msg)
        sent++
      } else if (isFomOrAbove(role)) {
        const msg = buildGroupMsg(data, 'All Hubs', 'جميع المراكز', role, null)
        await sendDigest(sb, p.id, msg)
        await sendWeeklySummary(sb, p.id, data, 'All Hubs', 'جميع المراكز')
        sent++
      }
    }

    const result = {
      success: true,
      sent,
      date: new Date().toISOString(),
      summary: {
        coordinators: data.coordinators.length,
        escalated: data.coordinators.filter(c => c.isEscalated).length,
        dpPendingSupervisor: data.dpPendingSupervisor.length,
        dpPendingAdmin: data.dpPendingAdmin.length,
        opCosts: data.opCostsPending.length,
        staleMmps: data.staleMmps.length,
        returnedSites: data.returnedSites.length,
        fundReceipts: data.fundReceipts.length,
        visitReminders: visitRemindersSent,
        isWeekly: isWeekly(),
      },
    }

    console.log('[daily-digest-cron] Completed:', JSON.stringify(result.summary))
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('[daily-digest-cron] Error:', err)
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
