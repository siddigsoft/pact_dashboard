/**
 * useDailyCoordinatorDigest
 *
 * Fires once per calendar day per authenticated user.
 * Builds a role-scoped notification that lists EVERY pending action
 * in the system and names the person responsible for each one.
 *
 * Scope rules:
 *   coordinator   → own verification backlog only
 *   supervisor    → their hub's coordinators + down-payments awaiting their approval
 *   fom / admin   → everything across all hubs
 */
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { hubs } from '@/data/sudanStates';

// ─── constants ────────────────────────────────────────────────────────────────
const DIGEST_KEY = (uid: string) => `pact_digest_v2_${uid}`;
const todayStr = () => new Date().toISOString().slice(0, 10);
const DELAY_DAYS = 3; // flag as delayed after this many inactive days

// ─── small helpers ─────────────────────────────────────────────────────────────
function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
}

function resolveHubName(hubId: string | null | undefined): string | null {
  if (!hubId) return null;
  const h = hubs.find(h => h.id === hubId || h.name === hubId);
  return h ? h.name : null;
}

function hubMatches(office: string, hubName: string): boolean {
  const a = office.trim().toLowerCase();
  const b = hubName.trim().toLowerCase();
  return a === b || a.includes(b) || b.includes(a);
}

const normalRole = (r: string | null) => (r || '').toLowerCase().replace(/[\s_()\-]/g, '');
const isCoordinator  = (r: string | null) => normalRole(r) === 'coordinator';
const isSupervisorR  = (r: string | null) => ['supervisor','hubsupervisor'].includes(normalRole(r));
const isFomOrAbove   = (r: string | null) => ['fom','fieldoperationmanagerfom','admin','superadmin'].includes(normalRole(r));

// Arabic number helpers
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

interface DigestData {
  coordinators: CoordRow[];
  dpPendingSupervisor: DPRow[];
  dpPendingAdmin: DPRow[];
  opCostsPending: OpCostRow[];
}

// ─── fetchers ─────────────────────────────────────────────────────────────────

async function fetchCoordinators(): Promise<CoordRow[]> {
  const { data, error } = await supabase
    .from('mmp_site_entries')
    .select('id, accepted_by, status, hub_office, verified_at, dispatched_at')
    .not('accepted_by', 'is', null)
    .limit(8000);
  if (error || !data) return [];

  const map = new Map<string, CoordRow>();
  for (const e of data) {
    const key = e.accepted_by as string;
    if (!map.has(key)) {
      map.set(key, {
        coordinatorId: key, coordinatorName: '', hubOffice: e.hub_office || '',
        totalAssigned: 0, totalVerified: 0, totalReturned: 0, pendingVerification: 0,
        lastVerifiedAt: null, oldestPendingAt: null,
        daysSinceVerified: null, daysOldestPending: null, isDelayed: false,
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
      if (e.verified_at && (!r.lastVerifiedAt || e.verified_at > r.lastVerifiedAt))
        r.lastVerifiedAt = e.verified_at;
    }
    if (returned) r.totalReturned++;
    if (pending) {
      r.pendingVerification++;
      if (e.dispatched_at && (!r.oldestPendingAt || e.dispatched_at < r.oldestPendingAt))
        r.oldestPendingAt = e.dispatched_at;
    }
  }

  // Resolve names
  const ids = [...map.keys()];
  if (ids.length) {
    const { data: profs } = await supabase
      .from('user_profiles').select('id, full_name, email').in('id', ids);
    profs?.forEach(p => {
      const r = map.get(p.id);
      if (r) r.coordinatorName = p.full_name || p.email || p.id.slice(0,8);
    });
  }

  for (const r of map.values()) {
    r.daysSinceVerified = daysSince(r.lastVerifiedAt);
    r.daysOldestPending = daysSince(r.oldestPendingAt);
    if (r.pendingVerification > 0) {
      const d = r.daysSinceVerified;
      r.isDelayed = d === null || d >= DELAY_DAYS;
    }
  }

  return [...map.values()].sort((a, b) => {
    if (a.isDelayed !== b.isDelayed) return a.isDelayed ? -1 : 1;
    return (b.daysSinceVerified ?? 9999) - (a.daysSinceVerified ?? 9999);
  });
}

async function fetchDownPayments(): Promise<DPRow[]> {
  const { data } = await supabase
    .from('down_payment_requests')
    .select('id, status, hub_name, requested_by, requested_by_name, requester_role, created_at')
    .in('status', ['pending_supervisor', 'pending_admin'])
    .order('created_at', { ascending: true })
    .limit(500);

  return (data || []).map(d => ({
    id: d.id,
    status: d.status as 'pending_supervisor' | 'pending_admin',
    hubName: d.hub_name || '',
    requesterName: d.requested_by_name || d.requested_by?.slice(0,8) || 'Unknown',
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

async function fetchAll(): Promise<DigestData> {
  const [coordinators, allDPs, opCostsPending] = await Promise.all([
    fetchCoordinators(),
    fetchDownPayments(),
    fetchOpCosts(),
  ]);
  return {
    coordinators,
    dpPendingSupervisor: allDPs.filter(d => d.status === 'pending_supervisor'),
    dpPendingAdmin: allDPs.filter(d => d.status === 'pending_admin'),
    opCostsPending,
  };
}

// ─── message builders ─────────────────────────────────────────────────────────

interface Msg { title_en: string; title_ar: string; en: string; ar: string }

// ── Coordinator self-summary ──────────────────────────────────────────────────
function buildCoordinatorSelf(s: CoordRow): Msg {
  const urgency = s.isDelayed ? '⚠️' : '📋';

  const actEn = s.isDelayed
    ? s.daysSinceVerified === null ? '🔴 You have never verified any site yet!'
      : `🔴 No verification action for ${s.daysSinceVerified} day${s.daysSinceVerified > 1 ? 's' : ''}!`
    : s.daysSinceVerified !== null ? `✅ Last verified ${enDays(s.daysSinceVerified)}`
      : '✅ All sites are up to date';

  const actAr = s.isDelayed
    ? s.daysSinceVerified === null ? '🔴 لم تقم بالتحقق من أي موقع حتى الآن!'
      : `🔴 لا يوجد إجراء تحقق ${arDays(s.daysSinceVerified)}!`
    : s.daysSinceVerified !== null ? `✅ آخر تحقق ${arDays(s.daysSinceVerified)}`
      : '✅ جميع المواقع محدّثة';

  const waitEn = s.daysOldestPending != null && s.pendingVerification > 0
    ? `⏳ Oldest pending site: ${enWaiting(s.daysOldestPending)}` : '';
  const waitAr = s.daysOldestPending != null && s.pendingVerification > 0
    ? `⏳ أقدم موقع معلّق: ${arWaiting(s.daysOldestPending)}` : '';

  return {
    title_en: `${urgency} Your Daily Action Summary`,
    title_ar: `${urgency} ملخص إجراءاتك اليومية`,
    en: [
      `📊 Sites: ${s.totalVerified}/${s.totalAssigned} verified | ${s.pendingVerification} pending | ${s.totalReturned} returned`,
      actEn, waitEn,
      s.pendingVerification > 0 ? `\n👉 ACTION REQUIRED: Verify your ${s.pendingVerification} pending site${s.pendingVerification > 1 ? 's' : ''}.` : '',
    ].filter(Boolean).join('\n'),
    ar: [
      `📊 المواقع: ${s.totalVerified}/${s.totalAssigned} محقَّق | ${s.pendingVerification} معلّق | ${s.totalReturned} مُعاد`,
      actAr, waitAr,
      s.pendingVerification > 0 ? `\n👉 إجراء مطلوب: قم بالتحقق من ${s.pendingVerification} موقع معلّق.` : '',
    ].filter(Boolean).join('\n'),
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
  // Filter data to scope
  const coords = hubName
    ? data.coordinators.filter(c => c.hubOffice && hubMatches(c.hubOffice, hubName))
    : data.coordinators;

  const dpSupervisor = hubName
    ? data.dpPendingSupervisor.filter(d => d.hubName && hubMatches(d.hubName, hubName))
    : data.dpPendingSupervisor;

  const dpAdmin = isFomOrAbove(recipientRole) ? data.dpPendingAdmin : [];
  const opCosts = isFomOrAbove(recipientRole) ? data.opCostsPending : [];

  const delayedCoords = coords.filter(c => c.isDelayed);
  const totalPendingVerif = coords.reduce((s, c) => s + c.pendingVerification, 0);
  const totalPendingActions = dpSupervisor.length + dpAdmin.length + opCosts.length;
  const hasUrgent = delayedCoords.length > 0 || totalPendingActions > 0;
  const urgency = hasUrgent ? '⚠️' : '📋';

  const dateEn = new Date().toLocaleDateString('en-GB', { weekday: 'short', day:'numeric', month:'short' });
  const dateAr = new Date().toLocaleDateString('ar-SA', { weekday: 'short', day:'numeric', month:'short' });

  // ── English ──────────────────────────────────────────────────────────────────
  const linesEn: string[] = [
    `${urgency} Daily Action Summary — ${scopeLabel} (${dateEn})`,
    '',
  ];

  // Section A: Actions required FROM the recipient
  const recipientActions: string[] = [];
  if (dpSupervisor.length > 0) {
    const oldest = dpSupervisor[0].createdAt ? daysSince(dpSupervisor[0].createdAt) : null;
    recipientActions.push(
      `  • 💳 Down Payment Approvals: ${dpSupervisor.length} request${dpSupervisor.length > 1 ? 's' : ''} awaiting YOUR approval` +
      (oldest != null ? ` (oldest: ${enWaiting(oldest)})` : ''),
    );
    // List top 3 requesters
    dpSupervisor.slice(0, 3).forEach(dp => {
      const w = dp.createdAt ? daysSince(dp.createdAt) : null;
      recipientActions.push(`    ↳ ${dp.requesterName} (${dp.hubName})${w != null ? ` — ${enWaiting(w)}` : ''}`);
    });
    if (dpSupervisor.length > 3) recipientActions.push(`    ↳ … and ${dpSupervisor.length - 3} more`);
  }
  if (dpAdmin.length > 0) {
    const oldest = dpAdmin[0].createdAt ? daysSince(dpAdmin[0].createdAt) : null;
    recipientActions.push(
      `  • 💳 Down Payment (Admin Approval): ${dpAdmin.length} request${dpAdmin.length > 1 ? 's' : ''} awaiting YOUR approval` +
      (oldest != null ? ` (oldest: ${enWaiting(oldest)})` : ''),
    );
    dpAdmin.slice(0, 3).forEach(dp => {
      const w = dp.createdAt ? daysSince(dp.createdAt) : null;
      recipientActions.push(`    ↳ ${dp.requesterName} (${dp.hubName})${w != null ? ` — ${enWaiting(w)}` : ''}`);
    });
    if (dpAdmin.length > 3) recipientActions.push(`    ↳ … and ${dpAdmin.length - 3} more`);
  }
  if (opCosts.length > 0) {
    const oldest = opCosts[0].submittedAt ? daysSince(opCosts[0].submittedAt) : null;
    recipientActions.push(
      `  • 🧾 Operational Cost Submissions: ${opCosts.length} pending YOUR approval` +
      (oldest != null ? ` (oldest: ${enWaiting(oldest)})` : ''),
    );
    opCosts.slice(0, 3).forEach(oc => {
      const w = oc.submittedAt ? daysSince(oc.submittedAt) : null;
      recipientActions.push(`    ↳ ${oc.submittedByName} (${oc.hubName})${w != null ? ` — ${enWaiting(w)}` : ''}`);
    });
    if (opCosts.length > 3) recipientActions.push(`    ↳ … and ${opCosts.length - 3} more`);
  }

  if (recipientActions.length > 0) {
    linesEn.push(`🔵 ACTIONS REQUIRED FROM YOU (${dpSupervisor.length + dpAdmin.length + opCosts.length} items):`);
    linesEn.push(...recipientActions);
    linesEn.push('');
  }

  // Section B: Coordinator verification status
  if (coords.length > 0) {
    linesEn.push(`📋 COORDINATOR VERIFICATION STATUS (${coords.length} coordinator${coords.length !== 1 ? 's' : ''} | ${totalPendingVerif} sites pending):`);
    if (delayedCoords.length > 0) {
      linesEn.push(`  ⚠️ ${delayedCoords.length} coordinator${delayedCoords.length > 1 ? 's' : ''} DELAYED (≥${DELAY_DAYS} days without action):`);
    }
    coords.slice(0, 10).forEach(c => {
      let line = `  • ${c.coordinatorName || c.coordinatorId.slice(0,8)}: ${c.totalVerified}/${c.totalAssigned} verified`;
      if (c.pendingVerification > 0) line += `, ${c.pendingVerification} pending`;
      if (c.totalReturned > 0) line += `, ${c.totalReturned} returned`;
      if (c.isDelayed) {
        line += c.daysSinceVerified === null
          ? '  🔴 NEVER VERIFIED — action required!'
          : `  🔴 ${c.daysSinceVerified}d inactive — action required!`;
      } else if (c.daysSinceVerified !== null) {
        line += `  ✅ last verified ${enDays(c.daysSinceVerified)}`;
      }
      if (c.daysOldestPending != null && c.pendingVerification > 0) {
        line += ` | oldest pending: ${enWaiting(c.daysOldestPending)}`;
      }
      linesEn.push(line);
    });
    if (coords.length > 10) linesEn.push(`  … and ${coords.length - 10} more coordinators`);
  } else {
    linesEn.push('✅ No coordinators assigned in this scope.');
  }

  // ── Arabic ───────────────────────────────────────────────────────────────────
  const linesAr: string[] = [
    `${urgency} ملخص الإجراءات اليومية — ${scopeLabelAr} (${dateAr})`,
    '',
  ];

  const recipientActionsAr: string[] = [];
  if (dpSupervisor.length > 0) {
    const oldest = dpSupervisor[0].createdAt ? daysSince(dpSupervisor[0].createdAt) : null;
    recipientActionsAr.push(
      `  • 💳 طلبات الدفعة المقدمة: ${dpSupervisor.length} طلب${dpSupervisor.length > 1 ? 'ات' : ''} بانتظار موافقتك` +
      (oldest != null ? ` (الأقدم: ${arWaiting(oldest)})` : ''),
    );
    dpSupervisor.slice(0, 3).forEach(dp => {
      const w = dp.createdAt ? daysSince(dp.createdAt) : null;
      recipientActionsAr.push(`    ↳ ${dp.requesterName} (${dp.hubName})${w != null ? ` — ${arWaiting(w)}` : ''}`);
    });
    if (dpSupervisor.length > 3) recipientActionsAr.push(`    ↳ … و${dpSupervisor.length - 3} طلبات أخرى`);
  }
  if (dpAdmin.length > 0) {
    const oldest = dpAdmin[0].createdAt ? daysSince(dpAdmin[0].createdAt) : null;
    recipientActionsAr.push(
      `  • 💳 دفعات مقدمة (موافقة إدارية): ${dpAdmin.length} طلب${dpAdmin.length > 1 ? 'ات' : ''} بانتظار موافقتك` +
      (oldest != null ? ` (الأقدم: ${arWaiting(oldest)})` : ''),
    );
    dpAdmin.slice(0, 3).forEach(dp => {
      const w = dp.createdAt ? daysSince(dp.createdAt) : null;
      recipientActionsAr.push(`    ↳ ${dp.requesterName} (${dp.hubName})${w != null ? ` — ${arWaiting(w)}` : ''}`);
    });
    if (dpAdmin.length > 3) recipientActionsAr.push(`    ↳ … و${dpAdmin.length - 3} أخرى`);
  }
  if (opCosts.length > 0) {
    const oldest = opCosts[0].submittedAt ? daysSince(opCosts[0].submittedAt) : null;
    recipientActionsAr.push(
      `  • 🧾 تقارير التكاليف التشغيلية: ${opCosts.length} تقرير${opCosts.length > 1 ? 'ات' : ''} بانتظار موافقتك` +
      (oldest != null ? ` (الأقدم: ${arWaiting(oldest)})` : ''),
    );
    opCosts.slice(0, 3).forEach(oc => {
      const w = oc.submittedAt ? daysSince(oc.submittedAt) : null;
      recipientActionsAr.push(`    ↳ ${oc.submittedByName} (${oc.hubName})${w != null ? ` — ${arWaiting(w)}` : ''}`);
    });
    if (opCosts.length > 3) recipientActionsAr.push(`    ↳ … و${opCosts.length - 3} أخرى`);
  }

  if (recipientActionsAr.length > 0) {
    linesAr.push(`🔵 إجراءات مطلوبة منك (${dpSupervisor.length + dpAdmin.length + opCosts.length} بنود):`);
    linesAr.push(...recipientActionsAr);
    linesAr.push('');
  }

  if (coords.length > 0) {
    linesAr.push(`📋 حالة تحقق المنسقين (${coords.length} منسق | ${totalPendingVerif} موقع معلّق):`);
    if (delayedCoords.length > 0) {
      linesAr.push(`  ⚠️ ${delayedCoords.length} منسق${delayedCoords.length > 1 ? 'ون' : ''} متأخر${delayedCoords.length > 1 ? 'ون' : ''} (${DELAY_DAYS} أيام أو أكثر بدون إجراء):`);
    }
    coords.slice(0, 10).forEach(c => {
      let line = `  • ${c.coordinatorName || c.coordinatorId.slice(0,8)}: ${c.totalVerified}/${c.totalAssigned} محقَّق`;
      if (c.pendingVerification > 0) line += `، ${c.pendingVerification} معلّق`;
      if (c.totalReturned > 0) line += `، ${c.totalReturned} مُعاد`;
      if (c.isDelayed) {
        line += c.daysSinceVerified === null
          ? '  🔴 لم يتحقق أبداً — إجراء مطلوب!'
          : `  🔴 ${arDays(c.daysSinceVerified)} بدون نشاط — إجراء مطلوب!`;
      } else if (c.daysSinceVerified !== null) {
        line += `  ✅ ${arDays(c.daysSinceVerified)}`;
      }
      if (c.daysOldestPending != null && c.pendingVerification > 0) {
        line += ` | أقدم معلّق: ${arWaiting(c.daysOldestPending)}`;
      }
      linesAr.push(line);
    });
    if (coords.length > 10) linesAr.push(`  … و${coords.length - 10} منسقين آخرين`);
  } else {
    linesAr.push('✅ لا يوجد منسقون في هذا النطاق.');
  }

  return {
    title_en: `${urgency} Daily Action Summary — ${scopeLabel}`,
    title_ar: `${urgency} ملخص الإجراءات اليومية — ${scopeLabelAr}`,
    en: linesEn.join('\n'),
    ar: linesAr.join('\n'),
  };
}

// ─── send (de-duplicated) ─────────────────────────────────────────────────────
async function sendDigest(recipientId: string, msg: Msg) {
  const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
  const { data: existing } = await supabase
    .from('notifications').select('id')
    .eq('recipient_id', recipientId)
    .ilike('title_en', '%Daily Action Summary%')
    .gte('created_at', startOfDay.toISOString())
    .limit(1);
  if (existing && existing.length > 0) return;

  await supabase.from('notifications').insert({
    recipient_id: recipientId, user_id: recipientId,
    title_en: msg.title_en, title_ar: msg.title_ar,
    message_en: msg.en, message_ar: msg.ar,
    type: 'daily_digest', entity_type: 'mmp',
    is_read: false, created_at: new Date().toISOString(),
  });
}

// ─── fan-out ──────────────────────────────────────────────────────────────────
async function dispatchAll(data: DigestData) {
  const { data: allProfiles } = await supabase
    .from('user_profiles')
    .select('id, full_name, email, role, hub_id')
    .not('role', 'is', null);

  if (!allProfiles) return;

  for (const p of allProfiles) {
    const role = p.role;

    if (isCoordinator(role)) {
      const selfRow = data.coordinators.find(c => c.coordinatorId === p.id);
      if (!selfRow || selfRow.totalAssigned === 0) continue;
      await sendDigest(p.id, buildCoordinatorSelf(selfRow));
      continue;
    }

    if (isSupervisorR(role)) {
      const hubName = resolveHubName(p.hub_id);
      if (!hubName) continue;
      const msg = buildGroupMsg(data, hubName, hubName, role, hubName);
      await sendDigest(p.id, msg);
      continue;
    }

    if (isFomOrAbove(role)) {
      const msg = buildGroupMsg(data, 'All Hubs', 'جميع المراكز', role, null);
      await sendDigest(p.id, msg);
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
    hasAnyRole(['admin','fom','supervisor','hubSupervisor','hubsupervisor',
      'coordinator','Field Operation Manager (FOM)'])
  );

  useEffect(() => {
    if (!canTrigger || !currentUser?.id || ranRef.current) return;
    const userId = currentUser.id;
    const key = DIGEST_KEY(userId);
    if (localStorage.getItem(key) === todayStr()) return;
    ranRef.current = true;

    (async () => {
      try {
        const data = await fetchAll();
        const hasData = data.coordinators.length > 0 ||
          data.dpPendingSupervisor.length > 0 ||
          data.dpPendingAdmin.length > 0 ||
          data.opCostsPending.length > 0;
        if (!hasData) return;

        // Coordinators only trigger their own notification
        if (isCoordinator(currentUser.role)) {
          const selfRow = data.coordinators.find(c => c.coordinatorId === userId);
          if (selfRow && selfRow.totalAssigned > 0)
            await sendDigest(userId, buildCoordinatorSelf(selfRow));
        } else {
          // Supervisors / FOM / Admin fan-out to everyone
          await dispatchAll(data);
        }
        localStorage.setItem(key, todayStr());
      } catch (e) {
        console.warn('[DailyDigest] error:', e);
        ranRef.current = false;
      }
    })();
  }, [canTrigger, currentUser?.id]);
}
