/**
 * useDailyCoordinatorDigest
 *
 * Fires once per calendar day per authenticated user (DB de-duplication only —
 * no localStorage). Builds a role-scoped notification that lists EVERY pending
 * action in the system and names the person responsible for each one.
 *
 * Scope rules:
 *   coordinator  → own verification backlog + their own submitted DP status
 *   supervisor   → their hub's coordinators + DPs awaiting their approval
 *   fom / admin  → everything across all hubs + escalation alerts + weekly summary (Sundays)
 *
 * New in this version:
 *   • Stale MMP forwarded to coordinator but not accepted yet
 *   • Returned site entries > 3 days waiting for coordinator to fix
 *   • Fund receipt confirmations pending (payment released but not confirmed)
 *   • Coordinator's own down payment status (how long their request has waited)
 *   • Escalation tier: 7+ day inactive coordinators → FCM push to FOM/admin
 *   • action_url on every notification for direct deep-link navigation
 *   • FCM push notification for critical/escalated items
 *   • Hub names resolved from database, not static file
 *   • Weekly summary every Sunday for FOM/Admin
 */
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { isTerminalCompletionRawStatus } from '@/utils/siteCompletionStatus';

/**
 * Resolve the effective completion timestamp for an mmp_site_entries row using
 * the same fallback chain as the in-app analytics: completed_at → verified_at →
 * updated_at (the last only counts for rows whose raw status is terminal
 * completion). Without this chain, rows that were completed but never
 * explicitly verified — or whose verified_at was wiped during older edits —
 * silently disappear from digest tallies.
 */
function effectiveCompletionTs(e: {
  status?: string | null;
  completed_at?: string | null;
  verified_at?: string | null;
  updated_at?: string | null;
}): string | null {
  return (
    e.completed_at ??
    e.verified_at ??
    (isTerminalCompletionRawStatus(e.status) ? e.updated_at ?? null : null)
  );
}

// ─── constants ────────────────────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().slice(0, 10);
const DELAY_DAYS = 3;           // flag as delayed after N inactive days
const ESCALATION_DAYS = 7;     // escalate to FOM/admin + FCM push after N days
const STALE_MMP_DAYS = 2;      // MMP forwarded but not accepted after N days
const RETURNED_SITE_DAYS = 3;  // returned site entry not fixed after N days
const APP_URL = 'https://app.pactorg.com';

const isWeekly = () => new Date().getDay() === 0; // Sunday

// ─── role helpers ─────────────────────────────────────────────────────────────
const normalRole = (r: string | null) => (r || '').toLowerCase().replace(/[\s_()\-]/g, '');
const isCoordinator  = (r: string | null) => normalRole(r) === 'coordinator';
const isSupervisorR  = (r: string | null) => ['supervisor','hubsupervisor'].includes(normalRole(r));
const isFomOrAbove   = (r: string | null) => ['fom','fieldoperationmanagerfom','admin','superadmin'].includes(normalRole(r));

// ─── date helpers ─────────────────────────────────────────────────────────────
function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
}

function startOfWeekIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 6); // last 7 days
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function arDays(n: number): string {
  if (n === 0) return 'اليوم';
  if (n === 1) return 'منذ يوم';
  if (n === 2) return 'منذ يومين';
  if (n <= 10) return `منذ ${n} أيام`;
  return `منذ ${n} يوماً`;
}
function enDays(n: number): string {
  if (n === 0) return 'today';
  if (n === 1) return '1 day ago';
  return `${n} days ago`;
}
function enWaiting(n: number): string {
  if (n === 0) return 'just submitted';
  if (n === 1) return '1 day waiting';
  return `${n} days waiting`;
}
function arWaiting(n: number): string {
  if (n === 0) return 'للتو';
  if (n === 1) return 'منذ يوم';
  if (n === 2) return 'منذ يومين';
  if (n <= 10) return `منذ ${n} أيام`;
  return `منذ ${n} يوماً`;
}

function hubMatches(office: string, hubName: string): boolean {
  const a = office.trim().toLowerCase();
  const b = hubName.trim().toLowerCase();
  return a === b || a.includes(b) || b.includes(a);
}

/** Display name for DP rows: stored in metadata.requested_by_name (no top-level column in DB). */
function dpRequesterDisplayName(d: { metadata?: unknown; requested_by?: string | null }): string {
  let meta: Record<string, unknown> = {};
  if (d.metadata != null && typeof d.metadata === 'object' && !Array.isArray(d.metadata)) {
    meta = d.metadata as Record<string, unknown>;
  } else if (typeof d.metadata === 'string') {
    try {
      meta = JSON.parse(d.metadata) as Record<string, unknown>;
    } catch {
      meta = {};
    }
  }
  const n = meta.requested_by_name;
  if (typeof n === 'string' && n.trim()) return n.trim();
  return d.requested_by?.slice(0, 8) || 'Unknown';
}

// ─── data types ───────────────────────────────────────────────────────────────

interface CoordRow {
  coordinatorId: string;
  coordinatorName: string;
  hubOffice: string;
  totalAssigned: number;
  totalVerified: number;
  totalReturned: number;
  pendingVerification: number;
  lastVerifiedAt: string | null;
  oldestPendingAt: string | null;
  daysSinceVerified: number | null;
  daysOldestPending: number | null;
  isDelayed: boolean;
  isEscalated: boolean; // 7+ days inactive
}

interface DPRow {
  id: string;
  status: 'pending_supervisor' | 'pending_admin';
  hubName: string;
  requesterName: string;
  requesterId: string;
  requesterRole: string;
  createdAt: string | null;
}

interface OpCostRow {
  id: string;
  submittedByName: string;
  submittedById: string;
  hubName: string;
  submittedAt: string | null;
  totalAmount: number;
}

interface StaleMmpRow {
  id: string;
  title: string;
  coordinatorId: string | null;
  coordinatorName: string;
  hubOffice: string;
  forwardedAt: string | null;
  daysStale: number | null;
}

interface ReturnedSiteRow {
  id: string;
  siteName: string;
  coordinatorId: string;
  coordinatorName: string;
  hubOffice: string;
  returnedAt: string | null;
  daysWaiting: number | null;
}

interface FundReceiptRow {
  id: string;
  recipientName: string;
  recipientId: string;
  hubName: string;
  approvedAt: string | null;
  amount: number;
  currency: string;
  daysWaiting: number | null;
}

interface OwnDPRow {
  id: string;
  status: string;
  hubName: string;
  createdAt: string | null;
  daysWaiting: number | null;
}

interface WeeklyStats {
  verifiedThisWeek: number;
  totalPendingVerif: number;
  dpApprovedThisWeek: number;
  dpPendingTotal: number;
}

interface DigestData {
  coordinators: CoordRow[];
  dpPendingSupervisor: DPRow[];
  dpPendingAdmin: DPRow[];
  opCostsPending: OpCostRow[];
  staleMmps: StaleMmpRow[];
  returnedSites: ReturnedSiteRow[];
  fundReceipts: FundReceiptRow[];
  weeklyStats: WeeklyStats | null;
  hubNameCache: Map<string, string>; // hubId → hubName
}

// ─── fetchers ─────────────────────────────────────────────────────────────────

async function fetchHubNames(): Promise<Map<string, string>> {
  const cache = new Map<string, string>();
  try {
    const { data } = await supabase.from('hubs').select('id, name').limit(200);
    (data || []).forEach((h: any) => { if (h.id && h.name) cache.set(h.id, h.name); });
  } catch {
    // fall back gracefully
  }
  return cache;
}

async function fetchCoordinators(): Promise<CoordRow[]> {
  let data: any[] = [];
  for (let _cf = 0; ; _cf += 1000) {
    const { data: _cp, error: _ce } = await supabase.from('mmp_site_entries').select('id, accepted_by, status, hub_office, verified_at, completed_at, updated_at, dispatched_at').not('accepted_by', 'is', null).range(_cf, _cf + 999);
    if (_ce || !_cp) break;
    data = [...data, ..._cp];
    if (_cp.length < 1000) break;
  }
  if (!data.length) return [];

  const map = new Map<string, CoordRow>();
  for (const e of data) {
    const key = e.accepted_by as string;
    if (!map.has(key)) {
      map.set(key, {
        coordinatorId: key, coordinatorName: '', hubOffice: e.hub_office || '',
        totalAssigned: 0, totalVerified: 0, totalReturned: 0, pendingVerification: 0,
        lastVerifiedAt: null, oldestPendingAt: null,
        daysSinceVerified: null, daysOldestPending: null,
        isDelayed: false, isEscalated: false,
      });
    }
    const r = map.get(key)!;
    if (e.hub_office && !r.hubOffice) r.hubOffice = e.hub_office;
    r.totalAssigned++;
    const st = (e.status || '').toLowerCase();
    const verified = ['verified','completed','accepted'].includes(st);
    const returned = st === 'returned';
    const pending = !verified && !returned;
    if (verified) {
      r.totalVerified++;
      // Use the same completed_at → verified_at → updated_at fallback chain as
      // the in-app analytics so the "last verified" stamp doesn't disappear for
      // rows that completed without an explicit verified_at write.
      const completionTs = effectiveCompletionTs(e);
      if (completionTs && (!r.lastVerifiedAt || completionTs > r.lastVerifiedAt))
        r.lastVerifiedAt = completionTs;
    }
    if (returned) r.totalReturned++;
    if (pending) {
      r.pendingVerification++;
      if (e.dispatched_at && (!r.oldestPendingAt || e.dispatched_at < r.oldestPendingAt))
        r.oldestPendingAt = e.dispatched_at;
    }
  }

  const ids = [...map.keys()];
  if (ids.length) {
    const { data: profs } = await supabase
      .from('user_profiles').select('id, full_name, email').in('id', ids);
    profs?.forEach((p: any) => {
      const r = map.get(p.id);
      if (r) r.coordinatorName = p.full_name || p.email || p.id.slice(0, 8);
    });
  }

  for (const r of map.values()) {
    r.daysSinceVerified = daysSince(r.lastVerifiedAt);
    r.daysOldestPending = daysSince(r.oldestPendingAt);
    if (r.pendingVerification > 0) {
      const d = r.daysSinceVerified;
      r.isDelayed = d === null || d >= DELAY_DAYS;
      r.isEscalated = d === null || d >= ESCALATION_DAYS;
    }
  }

  return [...map.values()].sort((a, b) => {
    if (a.isEscalated !== b.isEscalated) return a.isEscalated ? -1 : 1;
    if (a.isDelayed !== b.isDelayed) return a.isDelayed ? -1 : 1;
    return (b.daysSinceVerified ?? 9999) - (a.daysSinceVerified ?? 9999);
  });
}

async function fetchDownPayments(): Promise<DPRow[]> {
  let data: any[] = [];
  for (let _dpaf = 0; ; _dpaf += 1000) {
    const { data: _dpap } = await supabase.from('down_payment_requests').select('id, status, hub_name, requested_by, metadata, requester_role, created_at').in('status', ['pending_supervisor', 'pending_admin']).order('created_at', { ascending: true }).range(_dpaf, _dpaf + 999);
    if (!_dpap) break;
    data = [...data, ..._dpap];
    if (_dpap.length < 1000) break;
  }

  return (data || []).map((d: any) => ({
    id: d.id,
    status: d.status as 'pending_supervisor' | 'pending_admin',
    hubName: d.hub_name || '',
    requesterName: dpRequesterDisplayName(d),
    requesterId: d.requested_by || '',
    requesterRole: d.requester_role || '',
    createdAt: d.created_at,
  }));
}

async function fetchOpCosts(): Promise<OpCostRow[]> {
  try {
    const { data } = await supabase
      .from('pending_cost_approvals')
      .select('*')
      .order('submitted_at', { ascending: true })
      .limit(200);

    return (data || []).map((d: any) => ({
      id: d.id,
      submittedByName: d.submitted_by_name || d.submitter_name || 'Unknown',
      submittedById: d.submitted_by || d.submitter_id || '',
      hubName: d.hub_name || d.hub || '',
      submittedAt: d.submitted_at,
      totalAmount: d.total_amount || d.amount || 0,
    }));
  } catch {
    return [];
  }
}

async function fetchStaleMmps(): Promise<StaleMmpRow[]> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - STALE_MMP_DAYS);
    const { data } = await supabase
      .from('mmp_files')
      .select('id, name, coordinator_id, hub, updated_at, status')
      .in('status', ['forwarded_to_coordinator', 'pending_acceptance'])
      .lt('updated_at', cutoff.toISOString())
      .order('updated_at', { ascending: true })
      .limit(100);

    if (!data || data.length === 0) return [];

    const coordIds = [...new Set((data as any[]).map(d => d.coordinator_id).filter(Boolean))];
    const nameMap = new Map<string, string>();
    if (coordIds.length) {
      const { data: profs } = await supabase
        .from('user_profiles').select('id, full_name, email').in('id', coordIds);
      profs?.forEach((p: any) => nameMap.set(p.id, p.full_name || p.email || p.id.slice(0, 8)));
    }

    return (data as any[]).map(d => ({
      id: d.id,
      title: d.name || d.id.slice(0, 8),
      coordinatorId: d.coordinator_id,
      coordinatorName: d.coordinator_id ? (nameMap.get(d.coordinator_id) || d.coordinator_id.slice(0, 8)) : 'Unassigned',
      hubOffice: d.hub || '',
      forwardedAt: d.updated_at,
      daysStale: daysSince(d.updated_at),
    }));
  } catch {
    return [];
  }
}

async function fetchReturnedSites(): Promise<ReturnedSiteRow[]> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETURNED_SITE_DAYS);
    const { data } = await supabase
      .from('mmp_site_entries')
      .select('id, site_name, accepted_by, hub_office, updated_at')
      .eq('status', 'returned')
      .lt('updated_at', cutoff.toISOString())
      .order('updated_at', { ascending: true })
      .limit(200);

    if (!data || data.length === 0) return [];

    const coordIds = [...new Set((data as any[]).map(d => d.accepted_by).filter(Boolean))];
    const nameMap = new Map<string, string>();
    if (coordIds.length) {
      const { data: profs } = await supabase
        .from('user_profiles').select('id, full_name, email').in('id', coordIds);
      profs?.forEach((p: any) => nameMap.set(p.id, p.full_name || p.email || p.id.slice(0, 8)));
    }

    return (data as any[]).map(d => ({
      id: d.id,
      siteName: d.site_name || 'Unknown Site',
      coordinatorId: d.accepted_by || '',
      coordinatorName: d.accepted_by ? (nameMap.get(d.accepted_by) || d.accepted_by.slice(0, 8)) : 'Unknown',
      hubOffice: d.hub_office || '',
      returnedAt: d.updated_at,
      daysWaiting: daysSince(d.updated_at),
    }));
  } catch {
    return [];
  }
}

async function fetchFundReceipts(hubNameCache: Map<string, string>): Promise<FundReceiptRow[]> {
  try {
    const { data } = await supabase
      .from('withdrawal_requests')
      .select('id, user_id, approved_at, amount, currency, updated_at')
      .eq('status', 'approved')
      .or('fund_receipt_confirmed.is.null,fund_receipt_confirmed.eq.false')
      .order('approved_at', { ascending: true })
      .limit(100);

    if (!data || data.length === 0) return [];

    const userIds = [...new Set((data as any[]).map(d => d.user_id).filter(Boolean))];
    const nameMap = new Map<string, string>();
    const hubIdByUser = new Map<string, string | null>();
    if (userIds.length) {
      const { data: profs } = await supabase
        .from('user_profiles').select('id, full_name, email, hub_id').in('id', userIds);
      profs?.forEach((p: any) => {
        nameMap.set(p.id, p.full_name || p.email || p.id.slice(0, 8));
        hubIdByUser.set(p.id, p.hub_id ?? null);
      });
    }

    return (data as any[]).map(d => {
      const hid = d.user_id ? hubIdByUser.get(d.user_id) : null;
      const hubLabel = hid ? (hubNameCache.get(hid) || hid) : '';
      return {
        id: d.id,
        recipientName: d.user_id ? (nameMap.get(d.user_id) || d.user_id.slice(0, 8)) : 'Unknown',
        recipientId: d.user_id || '',
        hubName: hubLabel,
        approvedAt: d.approved_at || d.updated_at,
        amount: d.amount || 0,
        currency: d.currency || 'SDG',
        daysWaiting: daysSince(d.approved_at || d.updated_at),
      };
    });
  } catch {
    return [];
  }
}

async function fetchWeeklyStats(): Promise<WeeklyStats | null> {
  if (!isWeekly()) return null;
  try {
    const weekStart = startOfWeekIso();
    // Pull the candidate completion rows for the week and bucket them in JS
    // using the completed_at → verified_at → updated_at fallback chain. This
    // matches the in-app analytics and recovers rows that completed without a
    // verified_at write — which the old `gte('verified_at', weekStart)` filter
    // silently dropped from the weekly tally.
    const [verifData, dpRes] = await Promise.all([
      supabase.from('mmp_site_entries')
        .select('id, status, completed_at, verified_at, updated_at')
        .in('status', ['verified', 'completed'])
        .or(
          `completed_at.gte.${weekStart},verified_at.gte.${weekStart},updated_at.gte.${weekStart}`,
        ),
      supabase.from('down_payment_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved')
        .gte('updated_at', weekStart),
    ]);
    const [pendVerif, pendDp] = await Promise.all([
      supabase.from('mmp_site_entries')
        .select('id', { count: 'exact', head: true })
        .not('status', 'in', '("verified","completed","returned","accepted")'),
      supabase.from('down_payment_requests')
        .select('id', { count: 'exact', head: true })
        .in('status', ['pending_supervisor', 'pending_admin']),
    ]);
    const verifiedThisWeek = (verifData.data || []).reduce((acc: number, e: any) => {
      const ts = effectiveCompletionTs(e);
      return ts && ts >= weekStart ? acc + 1 : acc;
    }, 0);
    return {
      verifiedThisWeek,
      totalPendingVerif: pendVerif.count ?? 0,
      dpApprovedThisWeek: dpRes.count ?? 0,
      dpPendingTotal: pendDp.count ?? 0,
    };
  } catch {
    return null;
  }
}

async function fetchOwnDPs(userId: string): Promise<OwnDPRow[]> {
  try {
    const { data } = await supabase
      .from('down_payment_requests')
      .select('id, status, hub_name, created_at')
      .eq('requested_by', userId)
      .in('status', ['pending_supervisor', 'pending_admin'])
      .order('created_at', { ascending: true })
      .limit(20);

    return (data || []).map((d: any) => ({
      id: d.id,
      status: d.status,
      hubName: d.hub_name || '',
      createdAt: d.created_at,
      daysWaiting: daysSince(d.created_at),
    }));
  } catch {
    return [];
  }
}

async function fetchAll(): Promise<DigestData> {
  const hubNameCache = await fetchHubNames();
  const [coordinators, allDPs, opCostsPending, staleMmps, returnedSites, fundReceipts, weeklyStats] =
    await Promise.all([
      fetchCoordinators(),
      fetchDownPayments(),
      fetchOpCosts(),
      fetchStaleMmps(),
      fetchReturnedSites(),
      fetchFundReceipts(hubNameCache),
      fetchWeeklyStats(),
    ]);
  return {
    coordinators,
    dpPendingSupervisor: allDPs.filter(d => d.status === 'pending_supervisor'),
    dpPendingAdmin: allDPs.filter(d => d.status === 'pending_admin'),
    opCostsPending,
    staleMmps,
    returnedSites,
    fundReceipts,
    weeklyStats,
    hubNameCache,
  };
}

// ─── message builders ─────────────────────────────────────────────────────────

interface Msg { title_en: string; title_ar: string; en: string; ar: string; action_url: string; isCritical: boolean }

// ── Coordinator self-summary (includes their own DP status + returned sites) ──
function buildCoordinatorSelf(s: CoordRow, ownDPs: OwnDPRow[], ownReturnedSites: ReturnedSiteRow[]): Msg {
  const urgency = s.isEscalated ? '🔴' : s.isDelayed ? '⚠️' : '📋';

  const actEn = s.isEscalated
    ? s.daysSinceVerified === null
      ? '🔴 CRITICAL: You have NEVER verified any site!'
      : `🔴 CRITICAL: No verification action for ${s.daysSinceVerified} days — escalated to management!`
    : s.isDelayed
      ? s.daysSinceVerified === null ? '🔴 You have never verified any site yet!'
        : `🔴 No verification action for ${s.daysSinceVerified} day${s.daysSinceVerified > 1 ? 's' : ''}!`
      : s.daysSinceVerified !== null ? `✅ Last verified ${enDays(s.daysSinceVerified)}`
        : '✅ All sites are up to date';

  const actAr = s.isEscalated
    ? s.daysSinceVerified === null
      ? '🔴 حرج: لم تقم بالتحقق من أي موقع على الإطلاق!'
      : `🔴 حرج: لا يوجد إجراء تحقق ${arDays(s.daysSinceVerified)} — تم إبلاغ الإدارة!`
    : s.isDelayed
      ? s.daysSinceVerified === null ? '🔴 لم تقم بالتحقق من أي موقع حتى الآن!'
        : `🔴 لا يوجد إجراء تحقق ${arDays(s.daysSinceVerified)}!`
      : s.daysSinceVerified !== null ? `✅ آخر تحقق ${arDays(s.daysSinceVerified)}`
        : '✅ جميع المواقع محدّثة';

  const linesEn: string[] = [
    `📊 Sites: ${s.totalVerified}/${s.totalAssigned} verified | ${s.pendingVerification} pending | ${s.totalReturned} returned`,
    actEn,
  ];
  const linesAr: string[] = [
    `📊 المواقع: ${s.totalVerified}/${s.totalAssigned} محقَّق | ${s.pendingVerification} معلّق | ${s.totalReturned} مُعاد`,
    actAr,
  ];

  if (s.daysOldestPending != null && s.pendingVerification > 0) {
    linesEn.push(`⏳ Oldest pending site: ${enWaiting(s.daysOldestPending)}`);
    linesAr.push(`⏳ أقدم موقع معلّق: ${arWaiting(s.daysOldestPending)}`);
  }
  if (s.pendingVerification > 0) {
    linesEn.push(`\n👉 ACTION REQUIRED: Verify your ${s.pendingVerification} pending site${s.pendingVerification > 1 ? 's' : ''}.`);
    linesAr.push(`\n👉 إجراء مطلوب: قم بالتحقق من ${s.pendingVerification} موقع معلّق.`);
  }

  // Returned sites section
  if (ownReturnedSites.length > 0) {
    linesEn.push(`\n🔁 RETURNED SITES (${ownReturnedSites.length}) — Need your attention:`);
    linesAr.push(`\n🔁 مواقع مُعادة (${ownReturnedSites.length}) — تحتاج إلى مراجعتك:`);
    ownReturnedSites.slice(0, 5).forEach(rs => {
      const w = rs.daysWaiting;
      linesEn.push(`  • ${rs.siteName}${w != null ? ` — returned ${enWaiting(w)}` : ''}`);
      linesAr.push(`  • ${rs.siteName}${w != null ? ` — مُعاد ${arWaiting(w)}` : ''}`);
    });
    if (ownReturnedSites.length > 5) {
      linesEn.push(`  … and ${ownReturnedSites.length - 5} more returned sites`);
      linesAr.push(`  … و${ownReturnedSites.length - 5} مواقع أخرى مُعادة`);
    }
  }

  // Own down payment status
  if (ownDPs.length > 0) {
    linesEn.push(`\n💳 YOUR DOWN PAYMENT REQUESTS (${ownDPs.length} waiting):`);
    linesAr.push(`\n💳 طلبات الدفعة المقدمة (${ownDPs.length} في الانتظار):`);
    ownDPs.slice(0, 3).forEach(dp => {
      const statusLabel = dp.status === 'pending_supervisor' ? 'Awaiting supervisor approval' : 'Awaiting admin approval';
      const statusLabelAr = dp.status === 'pending_supervisor' ? 'بانتظار موافقة المشرف' : 'بانتظار موافقة الإدارة';
      const w = dp.daysWaiting;
      linesEn.push(`  • ${statusLabel}${w != null ? ` — ${enWaiting(w)}` : ''}`);
      linesAr.push(`  • ${statusLabelAr}${w != null ? ` — ${arWaiting(w)}` : ''}`);
    });
  }

  return {
    title_en: `${urgency} Your Daily Action Summary`,
    title_ar: `${urgency} ملخص إجراءاتك اليومية`,
    en: linesEn.join('\n'),
    ar: linesAr.join('\n'),
    action_url: '/mmp',
    isCritical: s.isEscalated,
  };
}

// ── Group summary (supervisor / fom / admin) ──────────────────────────────────
function buildGroupMsg(
  data: DigestData,
  scopeLabel: string,
  scopeLabelAr: string,
  recipientRole: string,
  hubName: string | null,
): Msg {
  const coords = hubName
    ? data.coordinators.filter(c => c.hubOffice && hubMatches(c.hubOffice, hubName))
    : data.coordinators;

  const dpSupervisor = hubName
    ? data.dpPendingSupervisor.filter(d => d.hubName && hubMatches(d.hubName, hubName))
    : data.dpPendingSupervisor;

  const dpAdmin = isFomOrAbove(recipientRole) ? data.dpPendingAdmin : [];
  const opCosts = isFomOrAbove(recipientRole) ? data.opCostsPending : [];
  const fundReceipts = isFomOrAbove(recipientRole) ? data.fundReceipts : [];
  const staleMmps = hubName
    ? data.staleMmps.filter(m => !m.hubOffice || hubMatches(m.hubOffice, hubName))
    : data.staleMmps;
  const returnedSites = hubName
    ? data.returnedSites.filter(rs => rs.hubOffice && hubMatches(rs.hubOffice, hubName))
    : data.returnedSites;

  const delayedCoords = coords.filter(c => c.isDelayed);
  const escalatedCoords = coords.filter(c => c.isEscalated);
  const totalPendingVerif = coords.reduce((s, c) => s + c.pendingVerification, 0);
  const totalActions = dpSupervisor.length + dpAdmin.length + opCosts.length + fundReceipts.length;
  const hasUrgent = escalatedCoords.length > 0 || totalActions > 0;
  const urgency = escalatedCoords.length > 0 ? '🔴' : hasUrgent ? '⚠️' : '📋';

  const dateEn = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const dateAr = new Date().toLocaleDateString('ar-SA', { weekday: 'short', day: 'numeric', month: 'short' });

  const linesEn: string[] = [`${urgency} Daily Action Summary — ${scopeLabel} (${dateEn})`, ''];
  const linesAr: string[] = [`${urgency} ملخص الإجراءات اليومية — ${scopeLabelAr} (${dateAr})`, ''];

  // ── Weekly stats block (Sundays only) ─────────────────────────────────────
  if (data.weeklyStats && isWeekly()) {
    const ws = data.weeklyStats;
    linesEn.push(
      '📅 WEEKLY SUMMARY (last 7 days):',
      `  • ✅ Sites verified this week: ${ws.verifiedThisWeek.toLocaleString()}`,
      `  • ⏳ Total sites still pending: ${ws.totalPendingVerif.toLocaleString()}`,
      `  • 💳 Down payments approved this week: ${ws.dpApprovedThisWeek}`,
      `  • ⏳ Down payments still pending: ${ws.dpPendingTotal}`,
      '',
    );
    linesAr.push(
      '📅 الملخص الأسبوعي (آخر 7 أيام):',
      `  • ✅ مواقع تم التحقق منها هذا الأسبوع: ${ws.verifiedThisWeek.toLocaleString()}`,
      `  • ⏳ إجمالي المواقع المعلّقة: ${ws.totalPendingVerif.toLocaleString()}`,
      `  • 💳 دفعات مقدمة مُعتمدة هذا الأسبوع: ${ws.dpApprovedThisWeek}`,
      `  • ⏳ دفعات مقدمة لا تزال معلّقة: ${ws.dpPendingTotal}`,
      '',
    );
  }

  // ── Escalation alert ────────────────────────────────────────────────────────
  if (escalatedCoords.length > 0) {
    linesEn.push(`🚨 ESCALATION ALERT: ${escalatedCoords.length} coordinator${escalatedCoords.length > 1 ? 's have' : ' has'} been INACTIVE for ${ESCALATION_DAYS}+ days:`);
    linesAr.push(`🚨 تنبيه تصعيد: ${escalatedCoords.length} منسق${escalatedCoords.length > 1 ? 'ون' : ''} غير نشط${escalatedCoords.length > 1 ? 'ون' : ''} لأكثر من ${ESCALATION_DAYS} أيام:`);
    escalatedCoords.slice(0, 5).forEach(c => {
      const days = c.daysSinceVerified === null ? 'Never verified' : `${c.daysSinceVerified}d inactive`;
      const daysAr = c.daysSinceVerified === null ? 'لم يتحقق أبداً' : arDays(c.daysSinceVerified);
      linesEn.push(`  🔴 ${c.coordinatorName || c.coordinatorId.slice(0, 8)} (${c.hubOffice}) — ${days} | ${c.pendingVerification} sites pending`);
      linesAr.push(`  🔴 ${c.coordinatorName || c.coordinatorId.slice(0, 8)} (${c.hubOffice}) — ${daysAr} | ${c.pendingVerification} موقع معلّق`);
    });
    if (escalatedCoords.length > 5) {
      linesEn.push(`  … and ${escalatedCoords.length - 5} more`);
      linesAr.push(`  … و${escalatedCoords.length - 5} آخرين`);
    }
    linesEn.push('');
    linesAr.push('');
  }

  // ── Section A: Actions required FROM the recipient ─────────────────────────
  const recipientActionsEn: string[] = [];
  const recipientActionsAr: string[] = [];

  if (dpSupervisor.length > 0) {
    const oldest = dpSupervisor[0].createdAt ? daysSince(dpSupervisor[0].createdAt) : null;
    recipientActionsEn.push(`  • 💳 Down Payment Approvals: ${dpSupervisor.length} request${dpSupervisor.length > 1 ? 's' : ''} awaiting YOUR approval${oldest != null ? ` (oldest: ${enWaiting(oldest)})` : ''}`);
    recipientActionsAr.push(`  • 💳 طلبات الدفعة المقدمة: ${dpSupervisor.length} طلب${dpSupervisor.length > 1 ? 'ات' : ''} بانتظار موافقتك${oldest != null ? ` (الأقدم: ${arWaiting(oldest)})` : ''}`);
    dpSupervisor.slice(0, 3).forEach(dp => {
      const w = dp.createdAt ? daysSince(dp.createdAt) : null;
      recipientActionsEn.push(`    ↳ ${dp.requesterName} (${dp.hubName})${w != null ? ` — ${enWaiting(w)}` : ''}`);
      recipientActionsAr.push(`    ↳ ${dp.requesterName} (${dp.hubName})${w != null ? ` — ${arWaiting(w)}` : ''}`);
    });
    if (dpSupervisor.length > 3) {
      recipientActionsEn.push(`    ↳ … and ${dpSupervisor.length - 3} more`);
      recipientActionsAr.push(`    ↳ … و${dpSupervisor.length - 3} طلبات أخرى`);
    }
  }

  if (dpAdmin.length > 0) {
    const oldest = dpAdmin[0].createdAt ? daysSince(dpAdmin[0].createdAt) : null;
    recipientActionsEn.push(`  • 💳 Down Payment (Admin): ${dpAdmin.length} request${dpAdmin.length > 1 ? 's' : ''} awaiting YOUR approval${oldest != null ? ` (oldest: ${enWaiting(oldest)})` : ''}`);
    recipientActionsAr.push(`  • 💳 دفعات مقدمة (إدارية): ${dpAdmin.length} طلب${dpAdmin.length > 1 ? 'ات' : ''} بانتظار موافقتك${oldest != null ? ` (الأقدم: ${arWaiting(oldest)})` : ''}`);
    dpAdmin.slice(0, 3).forEach(dp => {
      const w = dp.createdAt ? daysSince(dp.createdAt) : null;
      recipientActionsEn.push(`    ↳ ${dp.requesterName} (${dp.hubName})${w != null ? ` — ${enWaiting(w)}` : ''}`);
      recipientActionsAr.push(`    ↳ ${dp.requesterName} (${dp.hubName})${w != null ? ` — ${arWaiting(w)}` : ''}`);
    });
    if (dpAdmin.length > 3) {
      recipientActionsEn.push(`    ↳ … and ${dpAdmin.length - 3} more`);
      recipientActionsAr.push(`    ↳ … و${dpAdmin.length - 3} أخرى`);
    }
  }

  if (opCosts.length > 0) {
    const oldest = opCosts[0].submittedAt ? daysSince(opCosts[0].submittedAt) : null;
    recipientActionsEn.push(`  • 🧾 Operational Cost Submissions: ${opCosts.length} pending YOUR approval${oldest != null ? ` (oldest: ${enWaiting(oldest)})` : ''}`);
    recipientActionsAr.push(`  • 🧾 تقارير التكاليف التشغيلية: ${opCosts.length} تقرير${opCosts.length > 1 ? 'ات' : ''} بانتظار موافقتك${oldest != null ? ` (الأقدم: ${arWaiting(oldest)})` : ''}`);
    opCosts.slice(0, 3).forEach(oc => {
      const w = oc.submittedAt ? daysSince(oc.submittedAt) : null;
      recipientActionsEn.push(`    ↳ ${oc.submittedByName} (${oc.hubName})${w != null ? ` — ${enWaiting(w)}` : ''}`);
      recipientActionsAr.push(`    ↳ ${oc.submittedByName} (${oc.hubName})${w != null ? ` — ${arWaiting(w)}` : ''}`);
    });
    if (opCosts.length > 3) {
      recipientActionsEn.push(`    ↳ … and ${opCosts.length - 3} more`);
      recipientActionsAr.push(`    ↳ … و${opCosts.length - 3} أخرى`);
    }
  }

  if (fundReceipts.length > 0) {
    const oldest = fundReceipts[0].daysWaiting;
    recipientActionsEn.push(`  • 💰 Fund Receipt Confirmations: ${fundReceipts.length} payment${fundReceipts.length > 1 ? 's' : ''} released but NOT yet confirmed by recipient${oldest != null ? ` (oldest: ${enWaiting(oldest)})` : ''}`);
    recipientActionsAr.push(`  • 💰 تأكيدات استلام الأموال: ${fundReceipts.length} دفعة${fundReceipts.length > 1 ? ' ' : ''} مُصدَرة لكن لم يُؤكد الاستلام${oldest != null ? ` (الأقدم: ${arWaiting(oldest)})` : ''}`);
    fundReceipts.slice(0, 3).forEach(fr => {
      recipientActionsEn.push(`    ↳ ${fr.recipientName} (${fr.hubName}) — ${fr.amount.toLocaleString()} ${fr.currency}${fr.daysWaiting != null ? ` — ${enWaiting(fr.daysWaiting)}` : ''}`);
      recipientActionsAr.push(`    ↳ ${fr.recipientName} (${fr.hubName}) — ${fr.amount.toLocaleString()} ${fr.currency}${fr.daysWaiting != null ? ` — ${arWaiting(fr.daysWaiting)}` : ''}`);
    });
    if (fundReceipts.length > 3) {
      recipientActionsEn.push(`    ↳ … and ${fundReceipts.length - 3} more`);
      recipientActionsAr.push(`    ↳ … و${fundReceipts.length - 3} أخرى`);
    }
  }

  if (recipientActionsEn.length > 0) {
    linesEn.push(`🔵 ACTIONS REQUIRED FROM YOU (${totalActions} items):`);
    linesEn.push(...recipientActionsEn, '');
    linesAr.push(`🔵 إجراءات مطلوبة منك (${totalActions} بنود):`);
    linesAr.push(...recipientActionsAr, '');
  }

  // ── Section B: Stale MMPs ──────────────────────────────────────────────────
  if (staleMmps.length > 0) {
    linesEn.push(`📂 STALE MMPs (${staleMmps.length}) — Forwarded but coordinator has not accepted:`);
    linesAr.push(`📂 خطط مراقبة معلّقة (${staleMmps.length}) — مُحالة لكن المنسق لم يقبلها:`);
    staleMmps.slice(0, 5).forEach(m => {
      linesEn.push(`  • ${m.title} → ${m.coordinatorName}${m.daysStale != null ? ` — ${enWaiting(m.daysStale)}` : ''}`);
      linesAr.push(`  • ${m.title} → ${m.coordinatorName}${m.daysStale != null ? ` — ${arWaiting(m.daysStale)}` : ''}`);
    });
    if (staleMmps.length > 5) {
      linesEn.push(`  … and ${staleMmps.length - 5} more`);
      linesAr.push(`  … و${staleMmps.length - 5} أخرى`);
    }
    linesEn.push('');
    linesAr.push('');
  }

  // ── Section C: Returned sites > threshold ─────────────────────────────────
  if (returnedSites.length > 0) {
    // Group by coordinator
    const byCoord = new Map<string, { name: string; count: number; oldest: number | null }>();
    returnedSites.forEach(rs => {
      if (!byCoord.has(rs.coordinatorId)) byCoord.set(rs.coordinatorId, { name: rs.coordinatorName, count: 0, oldest: null });
      const g = byCoord.get(rs.coordinatorId)!;
      g.count++;
      if (rs.daysWaiting != null && (g.oldest === null || rs.daysWaiting > g.oldest)) g.oldest = rs.daysWaiting;
    });
    linesEn.push(`🔁 RETURNED SITES AWAITING COORDINATOR ACTION (${returnedSites.length} sites):`);
    linesAr.push(`🔁 مواقع مُعادة تنتظر إجراء المنسق (${returnedSites.length} موقع):`);
    [...byCoord.entries()].slice(0, 6).forEach(([, g]) => {
      linesEn.push(`  • ${g.name}: ${g.count} returned site${g.count > 1 ? 's' : ''}${g.oldest != null ? ` (oldest: ${enWaiting(g.oldest)})` : ''}`);
      linesAr.push(`  • ${g.name}: ${g.count} موقع مُعاد${g.oldest != null ? ` (الأقدم: ${arWaiting(g.oldest)})` : ''}`);
    });
    linesEn.push('');
    linesAr.push('');
  }

  // ── Section D: Coordinator verification status ─────────────────────────────
  if (coords.length > 0) {
    linesEn.push(`📋 COORDINATOR VERIFICATION STATUS (${coords.length} coordinator${coords.length !== 1 ? 's' : ''} | ${totalPendingVerif} sites pending):`);
    linesAr.push(`📋 حالة تحقق المنسقين (${coords.length} منسق | ${totalPendingVerif} موقع معلّق):`);
    if (delayedCoords.length > 0) {
      linesEn.push(`  ⚠️ ${delayedCoords.length} coordinator${delayedCoords.length > 1 ? 's' : ''} DELAYED (≥${DELAY_DAYS} days without action):`);
      linesAr.push(`  ⚠️ ${delayedCoords.length} منسق${delayedCoords.length > 1 ? 'ون' : ''} متأخر${delayedCoords.length > 1 ? 'ون' : ''} (${DELAY_DAYS} أيام أو أكثر بدون إجراء):`);
    }
    coords.slice(0, 10).forEach(c => {
      let lineEn = `  • ${c.coordinatorName || c.coordinatorId.slice(0, 8)}: ${c.totalVerified}/${c.totalAssigned} verified`;
      let lineAr = `  • ${c.coordinatorName || c.coordinatorId.slice(0, 8)}: ${c.totalVerified}/${c.totalAssigned} محقَّق`;
      if (c.pendingVerification > 0) { lineEn += `, ${c.pendingVerification} pending`; lineAr += `، ${c.pendingVerification} معلّق`; }
      if (c.totalReturned > 0) { lineEn += `, ${c.totalReturned} returned`; lineAr += `، ${c.totalReturned} مُعاد`; }
      if (c.isEscalated) {
        const tag = c.daysSinceVerified === null ? '  🔴 NEVER VERIFIED — ESCALATED!' : `  🔴 ${c.daysSinceVerified}d inactive — ESCALATED!`;
        const tagAr = c.daysSinceVerified === null ? '  🔴 لم يتحقق أبداً — مُصعَّد!' : `  🔴 ${arDays(c.daysSinceVerified)} بدون نشاط — مُصعَّد!`;
        lineEn += tag; lineAr += tagAr;
      } else if (c.isDelayed) {
        const tag = c.daysSinceVerified === null ? '  🔴 NEVER VERIFIED' : `  🔴 ${c.daysSinceVerified}d inactive — action required!`;
        const tagAr = c.daysSinceVerified === null ? '  🔴 لم يتحقق أبداً' : `  🔴 ${arDays(c.daysSinceVerified)} بدون نشاط — إجراء مطلوب!`;
        lineEn += tag; lineAr += tagAr;
      } else if (c.daysSinceVerified !== null) {
        lineEn += `  ✅ last verified ${enDays(c.daysSinceVerified)}`;
        lineAr += `  ✅ ${arDays(c.daysSinceVerified)}`;
      }
      if (c.daysOldestPending != null && c.pendingVerification > 0) {
        lineEn += ` | oldest pending: ${enWaiting(c.daysOldestPending)}`;
        lineAr += ` | أقدم معلّق: ${arWaiting(c.daysOldestPending)}`;
      }
      linesEn.push(lineEn);
      linesAr.push(lineAr);
    });
    if (coords.length > 10) {
      linesEn.push(`  … and ${coords.length - 10} more coordinators`);
      linesAr.push(`  … و${coords.length - 10} منسقين آخرين`);
    }
  } else {
    linesEn.push('✅ No coordinators assigned in this scope.');
    linesAr.push('✅ لا يوجد منسقون في هذا النطاق.');
  }

  const primaryActionUrl = totalActions > 0
    ? (dpSupervisor.length > 0 ? '/supervisor-approvals' : dpAdmin.length > 0 ? '/down-payment-approval' : opCosts.length > 0 ? '/cost-approval' : '/finance')
    : '/mmp';

  return {
    title_en: `${urgency} Daily Action Summary — ${scopeLabel}`,
    title_ar: `${urgency} ملخص الإجراءات اليومية — ${scopeLabelAr}`,
    en: linesEn.join('\n'),
    ar: linesAr.join('\n'),
    action_url: primaryActionUrl,
    isCritical: escalatedCoords.length > 0 || (fundReceipts.length > 0 && fundReceipts.some(fr => (fr.daysWaiting ?? 0) >= 5)),
  };
}

// ─── send (DB de-duplicated, with action_url + FCM push) ─────────────────────
async function sendDigest(recipientId: string, msg: Msg) {
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const { data: existing } = await supabase
    .from('notifications').select('id')
    .eq('recipient_id', recipientId)
    .ilike('title_en', '%Daily Action Summary%')
    .gte('created_at', startOfDay.toISOString())
    .limit(1);
  if (existing && existing.length > 0) return;

  const { data: inserted } = await supabase.from('notifications').insert({
    recipient_id: recipientId, user_id: recipientId,
    title_en: msg.title_en, title_ar: msg.title_ar,
    message_en: msg.en, message_ar: msg.ar,
    type: 'daily_digest', entity_type: 'mmp',
    action_url: msg.action_url,
    is_read: false, created_at: new Date().toISOString(),
  }).select('id').single();

  // FCM push for critical items (escalated coordinators or urgent approvals)
  if (msg.isCritical) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    if (supabaseUrl) {
      supabase.functions.invoke('send-fcm-push', {
        body: {
          user_ids: [recipientId],
          title: msg.title_en,
          body: msg.en.split('\n').slice(0, 3).join(' ').slice(0, 200),
          priority: 'high',
          notification_type: 'daily_digest',
          action_url: `${APP_URL}${msg.action_url}`,
          data: { type: 'daily_digest', action_url: msg.action_url },
          ...(inserted?.id ? { notification_id: inserted.id } : {}),
        },
      }).catch((err: unknown) => console.warn('[DailyDigest] FCM push failed:', err));
    }
  }
}

// ─── send weekly summary (separate notification, Sundays only) ───────────────
async function sendWeeklySummary(recipientId: string, data: DigestData, scopeLabel: string, scopeLabelAr: string) {
  if (!data.weeklyStats || !isWeekly()) return;
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const { data: existing } = await supabase
    .from('notifications').select('id')
    .eq('recipient_id', recipientId)
    .ilike('title_en', '%Weekly Summary%')
    .gte('created_at', startOfDay.toISOString())
    .limit(1);
  if (existing && existing.length > 0) return;

  const ws = data.weeklyStats;
  const coverageRate = ws.verifiedThisWeek > 0
    ? ((ws.verifiedThisWeek / (ws.verifiedThisWeek + ws.totalPendingVerif)) * 100).toFixed(1)
    : '0';

  const msgEn = [
    `📅 WEEKLY SUMMARY — ${scopeLabel}`,
    `Week ending: ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}`,
    '',
    `✅ Sites verified this week: ${ws.verifiedThisWeek.toLocaleString()}`,
    `⏳ Sites still pending: ${ws.totalPendingVerif.toLocaleString()}`,
    `📊 Coverage rate: ${coverageRate}%`,
    '',
    `💳 Down payments approved this week: ${ws.dpApprovedThisWeek}`,
    `⏳ Down payments still pending: ${ws.dpPendingTotal}`,
    '',
    data.escalatedCoords ? `🚨 Escalated coordinators (7+ days inactive): ${data.escalatedCoords}` : '',
  ].filter(Boolean).join('\n');

  const msgAr = [
    `📅 الملخص الأسبوعي — ${scopeLabelAr}`,
    `نهاية الأسبوع: ${new Date().toLocaleDateString('ar-SA', { weekday: 'long', day: 'numeric', month: 'long' })}`,
    '',
    `✅ مواقع تم التحقق منها هذا الأسبوع: ${ws.verifiedThisWeek.toLocaleString()}`,
    `⏳ مواقع لا تزال معلّقة: ${ws.totalPendingVerif.toLocaleString()}`,
    `📊 نسبة التغطية: ${coverageRate}%`,
    '',
    `💳 دفعات مقدمة مُعتمدة هذا الأسبوع: ${ws.dpApprovedThisWeek}`,
    `⏳ دفعات مقدمة لا تزال معلّقة: ${ws.dpPendingTotal}`,
  ].filter(Boolean).join('\n');

  await supabase.from('notifications').insert({
    recipient_id: recipientId, user_id: recipientId,
    title_en: `📅 Weekly Summary — ${scopeLabel}`,
    title_ar: `📅 الملخص الأسبوعي — ${scopeLabelAr}`,
    message_en: msgEn, message_ar: msgAr,
    type: 'weekly_digest', entity_type: 'mmp',
    action_url: '/mmp',
    is_read: false, created_at: new Date().toISOString(),
  });
}

// Attach escalated count to DigestData for weekly summary use
declare module './use-daily-coordinator-digest' {}
type DigestDataExt = DigestData & { escalatedCoords?: number };

// ─── fan-out ──────────────────────────────────────────────────────────────────
async function dispatchAll(data: DigestData) {
  const { data: allProfiles } = await supabase
    .from('user_profiles')
    .select('id, full_name, email, role, hub_id')
    .not('role', 'is', null)
    .limit(500);

  if (!allProfiles) return;

  const escalatedCount = data.coordinators.filter(c => c.isEscalated).length;
  const extData: DigestDataExt = { ...data, escalatedCoords: escalatedCount };

  for (const p of allProfiles) {
    const role = p.role;

    if (isCoordinator(role)) {
      const selfRow = data.coordinators.find(c => c.coordinatorId === p.id);
      if (!selfRow || selfRow.totalAssigned === 0) continue;
      const ownDPs = await fetchOwnDPs(p.id);
      const ownReturnedSites = data.returnedSites.filter(rs => rs.coordinatorId === p.id);
      await sendDigest(p.id, buildCoordinatorSelf(selfRow, ownDPs, ownReturnedSites));
      continue;
    }

    if (isSupervisorR(role)) {
      const hubName = extData.hubNameCache.get(p.hub_id || '') || null;
      if (!hubName) continue;
      const msg = buildGroupMsg(extData, hubName, hubName, role, hubName);
      await sendDigest(p.id, msg);
      continue;
    }

    if (isFomOrAbove(role)) {
      const msg = buildGroupMsg(extData, 'All Hubs', 'جميع المراكز', role, null);
      await sendDigest(p.id, msg);
      await sendWeeklySummary(p.id, extData, 'All Hubs', 'جميع المراكز');
    }
  }
}

// ─── hook ─────────────────────────────────────────────────────────────────────
export function useDailyCoordinatorDigest() {
  const { currentUser } = useUser();
  const { hasAnyRole, isSuperAdmin } = useAuthorization();
  const ranRef = useRef(false);

  const canTrigger = !!currentUser?.id && (
    isSuperAdmin() ||
    hasAnyRole(['admin', 'fom', 'supervisor', 'hubSupervisor', 'hubsupervisor',
      'coordinator', 'Field Operation Manager (FOM)'])
  );

  useEffect(() => {
    if (!canTrigger || !currentUser?.id || ranRef.current) return;
    ranRef.current = true;

    (async () => {
      try {
        const data = await fetchAll();
        const hasData = data.coordinators.length > 0 ||
          data.dpPendingSupervisor.length > 0 || data.dpPendingAdmin.length > 0 ||
          data.opCostsPending.length > 0 || data.staleMmps.length > 0 ||
          data.returnedSites.length > 0 || data.fundReceipts.length > 0;
        if (!hasData) return;

        if (isCoordinator(currentUser.role)) {
          const selfRow = data.coordinators.find(c => c.coordinatorId === currentUser.id);
          if (selfRow && selfRow.totalAssigned > 0) {
            const ownDPs = await fetchOwnDPs(currentUser.id);
            const ownReturnedSites = data.returnedSites.filter(rs => rs.coordinatorId === currentUser.id);
            await sendDigest(currentUser.id, buildCoordinatorSelf(selfRow, ownDPs, ownReturnedSites));
          }
        } else {
          await dispatchAll(data);
        }
      } catch (e) {
        console.warn('[DailyDigest] error:', e);
        ranRef.current = false;
      }
    })();
  }, [canTrigger, currentUser?.id]);
}
