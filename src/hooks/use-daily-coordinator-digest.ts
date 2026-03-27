import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { hubs } from '@/data/sudanStates';

const DIGEST_KEY = (userId: string) => `pact_digest_sent_${userId}`;
const today = () => new Date().toISOString().slice(0, 10);

// Days without a verification action before we flag a coordinator as "delayed"
const DELAY_THRESHOLD_DAYS = 3;

// ─── Types ──────────────────────────────────────────────────────────────────

interface CoordinatorSummary {
  coordinatorId: string;
  coordinatorName: string;
  hubOffice: string;
  totalAssigned: number;
  totalVerified: number;
  totalReturned: number;
  pendingVerification: number;
  lastVerifiedAt: string | null;
  oldestPendingDispatchedAt: string | null;
  daysSinceLastVerification: number | null;
  daysOldestPendingWaiting: number | null;
  isDelayed: boolean;
}

interface RecipientProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  hub_id: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysBetween(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)));
}

/** Resolve a hub UUID to a display name using the static hubs data file */
function resolveHubName(hubId: string | null): string | null {
  if (!hubId) return null;
  const found = hubs.find(h => h.id === hubId || h.name === hubId);
  return found ? found.name : null;
}

/** True if the site's hub_office string belongs to the given hub name */
function hubMatches(siteHubOffice: string, hubName: string): boolean {
  const a = siteHubOffice.trim().toLowerCase();
  const b = hubName.trim().toLowerCase();
  return a === b || a.includes(b) || b.includes(a);
}

function normalizeRole(role: string | null): string {
  return (role || '').toLowerCase().replace(/[\s_-]/g, '');
}

function isCoordinatorRole(role: string | null): boolean {
  return normalizeRole(role) === 'coordinator';
}

function isSupervisorRole(role: string | null): boolean {
  return ['supervisor', 'hubsupervisor'].includes(normalizeRole(role));
}

function isFomOrAbove(role: string | null): boolean {
  return ['fom', 'fieldoperationmanagerfom', 'admin', 'superadmin'].includes(normalizeRole(role));
}

// ─── Arabic helpers ───────────────────────────────────────────────────────────

function arabicDays(n: number): string {
  if (n === 0) return 'اليوم';
  if (n === 1) return 'منذ يوم واحد';
  if (n === 2) return 'منذ يومين';
  if (n >= 3 && n <= 10) return `منذ ${n} أيام`;
  return `منذ ${n} يوماً`;
}

function englishDays(n: number): string {
  if (n === 0) return 'today';
  if (n === 1) return '1 day ago';
  return `${n} days ago`;
}

// ─── Data fetch ───────────────────────────────────────────────────────────────

async function fetchAllCoordinatorSummaries(): Promise<CoordinatorSummary[]> {
  const { data, error } = await supabase
    .from('mmp_site_entries')
    .select('id, accepted_by, status, hub_office, verified_at, dispatched_at')
    .not('accepted_by', 'is', null)
    .limit(8000);

  if (error || !data) return [];

  const map = new Map<string, CoordinatorSummary>();

  for (const entry of data) {
    const key = entry.accepted_by as string;
    if (!map.has(key)) {
      map.set(key, {
        coordinatorId: key,
        coordinatorName: '',
        hubOffice: entry.hub_office || '',
        totalAssigned: 0,
        totalVerified: 0,
        totalReturned: 0,
        pendingVerification: 0,
        lastVerifiedAt: null,
        oldestPendingDispatchedAt: null,
        daysSinceLastVerification: null,
        daysOldestPendingWaiting: null,
        isDelayed: false,
      });
    }

    const row = map.get(key)!;
    // Use the most common hub_office value as the coordinator's hub
    if (entry.hub_office && !row.hubOffice) row.hubOffice = entry.hub_office;
    row.totalAssigned++;

    const st = (entry.status || '').toLowerCase();
    const isVerified = ['verified', 'completed', 'accepted'].includes(st);
    const isReturned = st === 'returned';
    const isPending = !isVerified && !isReturned;

    if (isVerified) {
      row.totalVerified++;
      if (entry.verified_at && (!row.lastVerifiedAt || entry.verified_at > row.lastVerifiedAt)) {
        row.lastVerifiedAt = entry.verified_at;
      }
    }
    if (isReturned) row.totalReturned++;
    if (isPending) {
      row.pendingVerification++;
      if (entry.dispatched_at && (!row.oldestPendingDispatchedAt || entry.dispatched_at < row.oldestPendingDispatchedAt)) {
        row.oldestPendingDispatchedAt = entry.dispatched_at;
      }
    }
  }

  // Resolve coordinator names
  const coordinatorIds = [...map.keys()];
  if (coordinatorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, full_name, email')
      .in('id', coordinatorIds);

    if (profiles) {
      for (const p of profiles) {
        const row = map.get(p.id);
        if (row) row.coordinatorName = p.full_name || p.email || p.id.slice(0, 8);
      }
    }
  }

  // Compute derived fields
  for (const row of map.values()) {
    row.daysSinceLastVerification = daysBetween(row.lastVerifiedAt);
    row.daysOldestPendingWaiting = daysBetween(row.oldestPendingDispatchedAt);
    if (row.pendingVerification > 0) {
      const d = row.daysSinceLastVerification;
      row.isDelayed = d === null || d >= DELAY_THRESHOLD_DAYS;
    }
  }

  return [...map.values()].sort((a, b) => {
    if (a.isDelayed !== b.isDelayed) return a.isDelayed ? -1 : 1;
    const da = a.daysSinceLastVerification ?? 9999;
    const db = b.daysSinceLastVerification ?? 9999;
    if (da !== db) return db - da;
    return b.pendingVerification - a.pendingVerification;
  });
}

// ─── Message builders ────────────────────────────────────────────────────────

function buildCoordinatorSelfMessage(s: CoordinatorSummary): { en: string; ar: string; title_en: string; title_ar: string } {
  const progress = `${s.totalVerified}/${s.totalAssigned}`;
  const delayEn = s.isDelayed
    ? s.daysSinceLastVerification === null
      ? '🔴 You have not verified any sites yet.'
      : `🔴 No verification action for ${s.daysSinceLastVerification} day${s.daysSinceLastVerification !== 1 ? 's' : ''}.`
    : s.daysSinceLastVerification !== null
      ? `✅ Last verified ${englishDays(s.daysSinceLastVerification)}.`
      : '✅ All sites up to date.';

  const delayAr = s.isDelayed
    ? s.daysSinceLastVerification === null
      ? '🔴 لم تقم بالتحقق من أي موقع بعد.'
      : `🔴 لا يوجد إجراء تحقق ${arabicDays(s.daysSinceLastVerification)}.`
    : s.daysSinceLastVerification !== null
      ? `✅ آخر تحقق ${arabicDays(s.daysSinceLastVerification)}.`
      : '✅ جميع المواقع محدّثة.';

  const waitEn = s.pendingVerification > 0 && s.daysOldestPendingWaiting !== null
    ? `Longest waiting site: ${s.daysOldestPendingWaiting} day${s.daysOldestPendingWaiting !== 1 ? 's' : ''}.`
    : '';
  const waitAr = s.pendingVerification > 0 && s.daysOldestPendingWaiting !== null
    ? `أقدم موقع معلّق: ${arabicDays(s.daysOldestPendingWaiting)}.`
    : '';

  const urgency = s.isDelayed ? '⚠️' : '📋';

  return {
    title_en: `${urgency} Your Daily Verification Summary`,
    title_ar: `${urgency} ملخص التحقق اليومي الخاص بك`,
    en: [
      `📊 Progress: ${progress} verified | ${s.pendingVerification} pending | ${s.totalReturned} returned`,
      delayEn,
      waitEn,
    ].filter(Boolean).join('\n'),
    ar: [
      `📊 التقدم: ${progress} محقَّق | ${s.pendingVerification} معلّق | ${s.totalReturned} مُعاد`,
      delayAr,
      waitAr,
    ].filter(Boolean).join('\n'),
  };
}

function buildGroupMessage(
  summaries: CoordinatorSummary[],
  scopeLabel: string,
  scopeLabelAr: string,
): { en: string; ar: string; title_en: string; title_ar: string } {
  const totalAssigned = summaries.reduce((s, r) => s + r.totalAssigned, 0);
  const totalVerified = summaries.reduce((s, r) => s + r.totalVerified, 0);
  const totalPending = summaries.reduce((s, r) => s + r.pendingVerification, 0);
  const totalReturned = summaries.reduce((s, r) => s + r.totalReturned, 0);
  const delayedCount = summaries.filter(s => s.isDelayed).length;
  const urgency = delayedCount > 0 ? '⚠️' : '📋';

  const dateStrEn = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const dateStrAr = new Date().toLocaleDateString('ar-SA', { weekday: 'short', day: 'numeric', month: 'short' });

  const title_en = `${urgency} Daily Verification Report — ${scopeLabel} (${dateStrEn})`;
  const title_ar = `${urgency} تقرير التحقق اليومي — ${scopeLabelAr} (${dateStrAr})`;

  // English body
  const linesEn: string[] = [
    `📊 ${totalVerified}/${totalAssigned} verified | ${totalPending} pending | ${totalReturned} returned | ${summaries.length} coordinator${summaries.length !== 1 ? 's' : ''}`,
    delayedCount > 0
      ? `⚠️ ${delayedCount} coordinator${delayedCount > 1 ? 's' : ''} delayed (≥${DELAY_THRESHOLD_DAYS} days inactive)`
      : '✅ No coordinators delayed',
    '',
    '── Coordinator Breakdown ──',
  ];

  for (const s of summaries.slice(0, 10)) {
    const name = s.coordinatorName || s.coordinatorId.slice(0, 8);
    let line = `• ${name}: ${s.totalVerified}/${s.totalAssigned} verified`;
    if (s.pendingVerification > 0) line += `, ${s.pendingVerification} pending`;
    if (s.totalReturned > 0) line += `, ${s.totalReturned} returned`;
    if (s.isDelayed) {
      line += s.daysSinceLastVerification === null
        ? ' 🔴 Never verified'
        : ` 🔴 ${s.daysSinceLastVerification}d inactive`;
    } else if (s.daysSinceLastVerification !== null) {
      line += ` ✅ last ${englishDays(s.daysSinceLastVerification)}`;
    }
    if (s.pendingVerification > 0 && s.daysOldestPendingWaiting !== null) {
      line += ` | oldest pending: ${s.daysOldestPendingWaiting}d`;
    }
    linesEn.push(line);
  }
  if (summaries.length > 10) linesEn.push(`  … and ${summaries.length - 10} more`);

  // Arabic body
  const linesAr: string[] = [
    `📊 ${totalVerified}/${totalAssigned} محقَّق | ${totalPending} معلّق | ${totalReturned} مُعاد | ${summaries.length} منسق`,
    delayedCount > 0
      ? `⚠️ ${delayedCount} منسق${delayedCount > 1 ? 'ون' : ''} متأخر${delayedCount > 1 ? 'ون' : ''} (${DELAY_THRESHOLD_DAYS} أيام أو أكثر بدون إجراء)`
      : '✅ لا يوجد منسقون متأخرون',
    '',
    '── تفاصيل المنسقين ──',
  ];

  for (const s of summaries.slice(0, 10)) {
    const name = s.coordinatorName || s.coordinatorId.slice(0, 8);
    let line = `• ${name}: ${s.totalVerified}/${s.totalAssigned} محقَّق`;
    if (s.pendingVerification > 0) line += `، ${s.pendingVerification} معلّق`;
    if (s.totalReturned > 0) line += `، ${s.totalReturned} مُعاد`;
    if (s.isDelayed) {
      line += s.daysSinceLastVerification === null
        ? ' 🔴 لم يتحقق أبداً'
        : ` 🔴 ${arabicDays(s.daysSinceLastVerification)} بدون نشاط`;
    } else if (s.daysSinceLastVerification !== null) {
      line += ` ✅ ${arabicDays(s.daysSinceLastVerification)}`;
    }
    if (s.pendingVerification > 0 && s.daysOldestPendingWaiting !== null) {
      line += ` | أقدم معلّق: ${arabicDays(s.daysOldestPendingWaiting)}`;
    }
    linesAr.push(line);
  }
  if (summaries.length > 10) linesAr.push(`  … و${summaries.length - 10} آخرين`);

  return { title_en, title_ar, en: linesEn.join('\n'), ar: linesAr.join('\n') };
}

// ─── Send (de-duplicated) ─────────────────────────────────────────────────────

async function upsertDigestNotification(
  recipientId: string,
  title_en: string,
  title_ar: string,
  message_en: string,
  message_ar: string,
) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data: existing } = await supabase
    .from('notifications')
    .select('id')
    .eq('recipient_id', recipientId)
    .ilike('title_en', '%Verification%Digest%')
    .gte('created_at', startOfDay.toISOString())
    .limit(1);

  if (existing && existing.length > 0) return; // already sent today

  await supabase.from('notifications').insert({
    recipient_id: recipientId,
    user_id: recipientId,
    title_en,
    title_ar,
    message_en,
    message_ar,
    type: 'daily_digest',
    entity_type: 'mmp',
    is_read: false,
    created_at: new Date().toISOString(),
  });
}

// ─── Fan-out ──────────────────────────────────────────────────────────────────

async function dispatchDigests(
  currentUserId: string,
  allSummaries: CoordinatorSummary[],
) {
  // Fetch all eligible recipients: coordinators, supervisors, fom, admins
  const { data: allProfiles } = await supabase
    .from('user_profiles')
    .select('id, full_name, email, role, hub_id')
    .not('role', 'is', null)
    .in('role', [
      'coordinator', 'Coordinator',
      'supervisor', 'Supervisor', 'hubSupervisor', 'hubsupervisor',
      'fom', 'FOM', 'Field Operation Manager (FOM)',
      'admin', 'Admin', 'super_admin', 'superAdmin', 'SuperAdmin',
    ]);

  if (!allProfiles) return;

  for (const profile of allProfiles) {
    const role = profile.role;

    // ── Coordinator: sees only their own row ─────────────────────────────
    if (isCoordinatorRole(role)) {
      const selfRow = allSummaries.find(s => s.coordinatorId === profile.id);
      if (!selfRow || selfRow.totalAssigned === 0) continue;
      const msg = buildCoordinatorSelfMessage(selfRow);
      await upsertDigestNotification(profile.id, msg.title_en, msg.title_ar, msg.en, msg.ar);
      continue;
    }

    // ── Supervisor: sees only coordinators in their hub ──────────────────
    if (isSupervisorRole(role)) {
      const hubName = resolveHubName(profile.hub_id);
      if (!hubName) {
        // No hub assigned — skip
        continue;
      }
      const hubSummaries = allSummaries.filter(s =>
        s.hubOffice && hubMatches(s.hubOffice, hubName)
      );
      if (hubSummaries.length === 0) continue;
      const msg = buildGroupMessage(hubSummaries, hubName, hubName);
      await upsertDigestNotification(profile.id, msg.title_en, msg.title_ar, msg.en, msg.ar);
      continue;
    }

    // ── FOM / Admin / Super Admin: sees everything ───────────────────────
    if (isFomOrAbove(role)) {
      if (allSummaries.length === 0) continue;
      const msg = buildGroupMessage(allSummaries, 'All Hubs', 'جميع المراكز');
      await upsertDigestNotification(profile.id, msg.title_en, msg.title_ar, msg.en, msg.ar);
    }
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDailyCoordinatorDigest() {
  const { currentUser } = useUser();
  const { hasAnyRole, isSuperAdmin } = useAuthorization();
  const ranRef = useRef(false);

  // Only privileged roles trigger the fan-out (coordinators get their own
  // notification when an admin/supervisor logs in and runs the fan-out)
  const canTrigger =
    !!currentUser?.id &&
    (
      isSuperAdmin() ||
      hasAnyRole([
        'admin', 'fom', 'supervisor', 'hubSupervisor', 'hubsupervisor',
        'Field Operation Manager (FOM)', 'coordinator',
      ])
    );

  useEffect(() => {
    if (!canTrigger || !currentUser?.id || ranRef.current) return;

    const userId = currentUser.id;
    const key = DIGEST_KEY(userId);
    const lastSent = localStorage.getItem(key);
    if (lastSent === today()) return;

    ranRef.current = true;

    (async () => {
      try {
        const summaries = await fetchAllCoordinatorSummaries();
        if (summaries.length === 0) return;

        // If coordinator — only send to themselves
        if (isCoordinatorRole(currentUser.role)) {
          const selfRow = summaries.find(s => s.coordinatorId === userId);
          if (selfRow && selfRow.totalAssigned > 0) {
            const msg = buildCoordinatorSelfMessage(selfRow);
            await upsertDigestNotification(userId, msg.title_en, msg.title_ar, msg.en, msg.ar);
          }
        } else {
          // Admins / FOM / Supervisors trigger the full fan-out for everyone
          await dispatchDigests(userId, summaries);
        }

        localStorage.setItem(key, today());
      } catch (e) {
        console.warn('[DailyDigest] Failed to send digest:', e);
        ranRef.current = false;
      }
    })();
  }, [canTrigger, currentUser?.id]);
}
