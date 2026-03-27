import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';
import { useAuthorization } from '@/hooks/use-authorization';

const DIGEST_KEY = (userId: string) => `pact_digest_sent_${userId}`;
const today = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD

// Days without a verification action before we flag a coordinator as "delayed"
const DELAY_THRESHOLD_DAYS = 3;

interface CoordinatorSummary {
  coordinatorId: string;
  coordinatorName: string;
  mmpName: string;
  mmpId: string;
  totalAssigned: number;
  totalVerified: number;
  totalReturned: number;
  pendingVerification: number;
  // Newest verified_at across all this coordinator's entries (null = never verified)
  lastVerifiedAt: string | null;
  // Oldest dispatched_at across pending entries (null = no dispatch timestamp)
  oldestPendingDispatchedAt: string | null;
  // Computed
  daysSinceLastVerification: number | null;
  daysOldestPendingWaiting: number | null;
  isDelayed: boolean;
}

function daysBetween(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const diffMs = Date.now() - d.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

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

async function fetchCoordinatorDigest(): Promise<CoordinatorSummary[]> {
  const { data, error } = await supabase
    .from('mmp_site_entries')
    .select(`
      id,
      accepted_by,
      status,
      mmp_file_id,
      verified_at,
      dispatched_at,
      mmp_files:mmp_file_id (
        id,
        name,
        mmp_id
      )
    `)
    .not('accepted_by', 'is', null)
    .limit(5000);

  if (error || !data) return [];

  // Group by coordinator
  const map = new Map<string, CoordinatorSummary>();

  for (const entry of data) {
    const mmpInfo = Array.isArray(entry.mmp_files) ? entry.mmp_files[0] : entry.mmp_files;
    if (!mmpInfo) continue;

    // Key by coordinator only (aggregate across all MMPs)
    const key = entry.accepted_by as string;
    if (!map.has(key)) {
      map.set(key, {
        coordinatorId: key,
        coordinatorName: '',
        mmpName: (mmpInfo as any)?.name || 'Unknown MMP',
        mmpId: (mmpInfo as any)?.mmp_id || '',
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
    row.totalAssigned++;

    const st = (entry.status || '').toLowerCase();
    const isVerified = ['verified', 'completed', 'accepted'].includes(st);
    const isPending = !['verified', 'completed', 'accepted', 'returned'].includes(st);

    if (isVerified) {
      row.totalVerified++;
      // Track the most recent verified_at
      if (entry.verified_at) {
        if (!row.lastVerifiedAt || entry.verified_at > row.lastVerifiedAt) {
          row.lastVerifiedAt = entry.verified_at;
        }
      }
    }

    if ((entry.status || '').toLowerCase() === 'returned') {
      row.totalReturned++;
    }

    if (isPending) {
      row.pendingVerification++;
      // Track the oldest pending dispatched_at (longest waiting)
      if (entry.dispatched_at) {
        if (!row.oldestPendingDispatchedAt || entry.dispatched_at < row.oldestPendingDispatchedAt) {
          row.oldestPendingDispatchedAt = entry.dispatched_at;
        }
      }
    }
  }

  // Compute derived fields
  for (const row of map.values()) {
    row.daysSinceLastVerification = daysBetween(row.lastVerifiedAt);
    row.daysOldestPendingWaiting = daysBetween(row.oldestPendingDispatchedAt);

    // "Delayed" = has pending sites AND either:
    //   a) has never verified anything, or
    //   b) last verification was >= DELAY_THRESHOLD_DAYS ago
    if (row.pendingVerification > 0) {
      const daysSince = row.daysSinceLastVerification;
      row.isDelayed = daysSince === null || daysSince >= DELAY_THRESHOLD_DAYS;
    }
  }

  // Fetch coordinator names from user_profiles
  const coordinatorIds = [...map.keys()];
  if (coordinatorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, full_name, email')
      .in('id', coordinatorIds);

    if (profiles) {
      for (const p of profiles) {
        const row = map.get(p.id);
        if (row) row.coordinatorName = p.full_name || p.email || p.id;
      }
    }
  }

  // Sort: delayed first (longest delay first), then most pending
  return [...map.values()].sort((a, b) => {
    if (a.isDelayed !== b.isDelayed) return a.isDelayed ? -1 : 1;
    const da = a.daysSinceLastVerification ?? 9999;
    const db = b.daysSinceLastVerification ?? 9999;
    if (da !== db) return db - da;
    return b.pendingVerification - a.pendingVerification;
  });
}

async function fetchAdminAndSupervisorIds(): Promise<string[]> {
  const { data } = await supabase
    .from('user_roles')
    .select('user_id, role')
    .in('role', ['admin', 'super_admin', 'superAdmin', 'fom', 'supervisor', 'hubSupervisor']);
  return (data || []).map(r => r.user_id);
}

function buildEnglishMessage(summaries: CoordinatorSummary[]): string {
  const totalAssigned = summaries.reduce((s, r) => s + r.totalAssigned, 0);
  const totalVerified = summaries.reduce((s, r) => s + r.totalVerified, 0);
  const totalPending = summaries.reduce((s, r) => s + r.pendingVerification, 0);
  const totalReturned = summaries.reduce((s, r) => s + r.totalReturned, 0);
  const uniqueCoordinators = summaries.length;
  const delayedCount = summaries.filter(s => s.isDelayed).length;

  const lines: string[] = [
    `📊 Overall: ${totalVerified}/${totalAssigned} verified | ${totalPending} pending | ${totalReturned} returned | ${uniqueCoordinators} coordinators`,
    delayedCount > 0
      ? `⚠️ ${delayedCount} coordinator${delayedCount > 1 ? 's' : ''} delayed (no action ≥${DELAY_THRESHOLD_DAYS} days)`
      : '✅ No coordinators delayed',
    '',
    '── Coordinator Status ──',
  ];

  const top = summaries.slice(0, 8);
  for (const s of top) {
    const nameLabel = s.coordinatorName || s.coordinatorId.slice(0, 8);
    const verifiedLabel = `${s.totalVerified}/${s.totalAssigned} verified`;
    const pendingLabel = s.pendingVerification > 0 ? `, ${s.pendingVerification} pending` : '';
    const returnedLabel = s.totalReturned > 0 ? `, ${s.totalReturned} returned` : '';

    let activityLabel = '';
    if (s.isDelayed) {
      const days = s.daysSinceLastVerification;
      activityLabel = days === null
        ? ' 🔴 Never verified — inactive!'
        : ` 🔴 No action for ${days} day${days !== 1 ? 's' : ''}`;
    } else if (s.daysSinceLastVerification !== null) {
      activityLabel = ` ✅ Last verified ${englishDays(s.daysSinceLastVerification)}`;
    }

    let waitLabel = '';
    if (s.pendingVerification > 0 && s.daysOldestPendingWaiting !== null) {
      waitLabel = ` | Oldest pending: ${s.daysOldestPendingWaiting}d waiting`;
    }

    lines.push(`• ${nameLabel}: ${verifiedLabel}${pendingLabel}${returnedLabel}${activityLabel}${waitLabel}`);
  }

  if (summaries.length > 8) {
    lines.push(`  … and ${summaries.length - 8} more coordinators`);
  }

  return lines.join('\n');
}

function buildArabicMessage(summaries: CoordinatorSummary[]): string {
  const totalAssigned = summaries.reduce((s, r) => s + r.totalAssigned, 0);
  const totalVerified = summaries.reduce((s, r) => s + r.totalVerified, 0);
  const totalPending = summaries.reduce((s, r) => s + r.pendingVerification, 0);
  const totalReturned = summaries.reduce((s, r) => s + r.totalReturned, 0);
  const uniqueCoordinators = summaries.length;
  const delayedCount = summaries.filter(s => s.isDelayed).length;

  const lines: string[] = [
    `📊 الإجمالي: ${totalVerified}/${totalAssigned} تم التحقق | ${totalPending} معلّق | ${totalReturned} مُعاد | ${uniqueCoordinators} منسق`,
    delayedCount > 0
      ? `⚠️ ${delayedCount} منسق${delayedCount > 1 ? 'ون' : ''} متأخر${delayedCount > 1 ? 'ون' : ''} (بدون إجراء منذ ${DELAY_THRESHOLD_DAYS} أيام أو أكثر)`
      : '✅ لا يوجد منسقون متأخرون',
    '',
    '── حالة المنسقين ──',
  ];

  const top = summaries.slice(0, 8);
  for (const s of top) {
    const nameLabel = s.coordinatorName || s.coordinatorId.slice(0, 8);
    const verifiedLabel = `${s.totalVerified}/${s.totalAssigned} محقَّق`;
    const pendingLabel = s.pendingVerification > 0 ? `، ${s.pendingVerification} معلّق` : '';
    const returnedLabel = s.totalReturned > 0 ? `، ${s.totalReturned} مُعاد` : '';

    let activityLabel = '';
    if (s.isDelayed) {
      const days = s.daysSinceLastVerification;
      activityLabel = days === null
        ? ' 🔴 لم يتحقق أبداً — غير نشط!'
        : ` 🔴 لا يوجد إجراء ${arabicDays(days)}`;
    } else if (s.daysSinceLastVerification !== null) {
      activityLabel = ` ✅ آخر تحقق ${arabicDays(s.daysSinceLastVerification)}`;
    }

    let waitLabel = '';
    if (s.pendingVerification > 0 && s.daysOldestPendingWaiting !== null) {
      waitLabel = ` | أقدم معلّق: ${arabicDays(s.daysOldestPendingWaiting)}`;
    }

    lines.push(`• ${nameLabel}: ${verifiedLabel}${pendingLabel}${returnedLabel}${activityLabel}${waitLabel}`);
  }

  if (summaries.length > 8) {
    lines.push(`  … و${summaries.length - 8} منسقين آخرين`);
  }

  return lines.join('\n');
}

async function sendDigestNotification(
  recipientId: string,
  summaries: CoordinatorSummary[]
) {
  const dateStrEn = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const dateStrAr = new Date().toLocaleDateString('ar-SA', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const delayedCount = summaries.filter(s => s.isDelayed).length;
  const urgencyPrefix = delayedCount > 0 ? '⚠️ ' : '📋 ';

  const titleEn = `${urgencyPrefix}Daily MMP Verification Digest — ${dateStrEn}`;
  const titleAr = `${urgencyPrefix}ملخص التحقق اليومي من خطة الرصد الشهري — ${dateStrAr}`;

  const messageEn = buildEnglishMessage(summaries);
  const messageAr = buildArabicMessage(summaries);

  // De-duplicate: skip if a digest was already inserted today
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data: existing } = await supabase
    .from('notifications')
    .select('id')
    .eq('recipient_id', recipientId)
    .ilike('title_en', '%Daily MMP Verification Digest%')
    .gte('created_at', startOfDay.toISOString())
    .limit(1);

  if (existing && existing.length > 0) return;

  await supabase.from('notifications').insert({
    recipient_id: recipientId,
    user_id: recipientId,
    title_en: titleEn,
    title_ar: titleAr,
    message_en: messageEn,
    message_ar: messageAr,
    type: 'daily_digest',
    entity_type: 'mmp',
    is_read: false,
    created_at: new Date().toISOString(),
  });
}

export function useDailyCoordinatorDigest() {
  const { currentUser } = useUser();
  const { hasAnyRole, isSuperAdmin } = useAuthorization();
  const ranRef = useRef(false);

  const isEligible =
    !!currentUser?.id &&
    (
      isSuperAdmin() ||
      hasAnyRole(['admin', 'fom', 'supervisor', 'hubSupervisor', 'hubsupervisor',
        'Field Operation Manager (FOM)'])
    );

  useEffect(() => {
    if (!isEligible || !currentUser?.id || ranRef.current) return;

    const userId = currentUser.id;
    const key = DIGEST_KEY(userId);
    const lastSent = localStorage.getItem(key);

    if (lastSent === today()) return; // already ran today

    ranRef.current = true;

    (async () => {
      try {
        const summaries = await fetchCoordinatorDigest();
        if (summaries.length === 0) return;

        // Send to this user first
        await sendDigestNotification(userId, summaries);

        // Admins / super admins fan out to all other eligible recipients
        if (isSuperAdmin() || hasAnyRole(['admin'])) {
          const allRecipients = await fetchAdminAndSupervisorIds();
          for (const rid of allRecipients) {
            if (rid === userId) continue;
            await sendDigestNotification(rid, summaries);
          }
        }

        localStorage.setItem(key, today());
      } catch (e) {
        console.warn('[DailyDigest] Failed to send digest:', e);
        ranRef.current = false; // allow retry on next render
      }
    })();
  }, [isEligible, currentUser?.id]);
}
