import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';
import { useAuthorization } from '@/hooks/use-authorization';

const DIGEST_KEY = (userId: string) => `pact_digest_sent_${userId}`;
const today = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD

interface CoordinatorSummary {
  coordinatorId: string;
  coordinatorName: string;
  mmpName: string;
  mmpId: string;
  totalAssigned: number;
  totalVerified: number;
  totalReturned: number;
  pendingVerification: number;
}

async function fetchCoordinatorDigest(): Promise<CoordinatorSummary[]> {
  // Fetch all site entries that are assigned to coordinators (accepted_by is set)
  // and join with mmp_files to get MMP name
  const { data, error } = await supabase
    .from('mmp_site_entries')
    .select(`
      id,
      accepted_by,
      status,
      mmp_file_id,
      mmp_files:mmp_file_id (
        id,
        name,
        mmp_id
      )
    `)
    .not('accepted_by', 'is', null)
    .limit(5000);

  if (error || !data) return [];

  // Group by coordinator + MMP
  const map = new Map<string, CoordinatorSummary>();

  for (const entry of data) {
    const mmpInfo = Array.isArray(entry.mmp_files) ? entry.mmp_files[0] : entry.mmp_files;
    if (!mmpInfo) continue;
    const key = `${entry.accepted_by}::${entry.mmp_file_id}`;
    if (!map.has(key)) {
      map.set(key, {
        coordinatorId: entry.accepted_by as string,
        coordinatorName: '', // will fill from profiles
        mmpName: (mmpInfo as any)?.name || 'Unknown MMP',
        mmpId: (mmpInfo as any)?.mmp_id || '',
        totalAssigned: 0,
        totalVerified: 0,
        totalReturned: 0,
        pendingVerification: 0,
      });
    }
    const row = map.get(key)!;
    row.totalAssigned++;
    const st = (entry.status || '').toLowerCase();
    if (st === 'verified' || st === 'completed' || st === 'accepted') row.totalVerified++;
    if (st === 'returned') row.totalReturned++;
    if (!['verified', 'completed', 'accepted', 'returned'].includes(st)) row.pendingVerification++;
  }

  // Fetch coordinator names from user_profiles
  const coordinatorIds = [...new Set([...map.values()].map(s => s.coordinatorId))];
  if (coordinatorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, full_name, email')
      .in('id', coordinatorIds);

    if (profiles) {
      for (const p of profiles) {
        for (const [, row] of map) {
          if (row.coordinatorId === p.id) {
            row.coordinatorName = p.full_name || p.email || p.id;
          }
        }
      }
    }
  }

  return [...map.values()].sort((a, b) => b.pendingVerification - a.pendingVerification);
}

async function fetchAdminAndSupervisorIds(): Promise<string[]> {
  const { data } = await supabase
    .from('user_roles')
    .select('user_id, role')
    .in('role', ['admin', 'super_admin', 'superAdmin', 'fom', 'supervisor', 'hubSupervisor']);
  return (data || []).map(r => r.user_id);
}

async function sendDigestNotification(
  recipientId: string,
  summaries: CoordinatorSummary[]
) {
  const totalAssigned = summaries.reduce((s, r) => s + r.totalAssigned, 0);
  const totalVerified = summaries.reduce((s, r) => s + r.totalVerified, 0);
  const totalPending = summaries.reduce((s, r) => s + r.pendingVerification, 0);
  const totalReturned = summaries.reduce((s, r) => s + r.totalReturned, 0);
  const uniqueCoordinators = new Set(summaries.map(s => s.coordinatorId)).size;

  const dateStr = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  // Build concise coordinator breakdown (top 5 with most pending)
  const topPending = summaries.slice(0, 5);
  const breakdownLines = topPending.map(s =>
    `• ${s.coordinatorName} — ${s.totalVerified}/${s.totalAssigned} verified, ${s.pendingVerification} pending`
  ).join('\n');

  const title = `📋 Daily MMP Verification Digest — ${dateStr}`;
  const message =
    `Overall: ${totalVerified}/${totalAssigned} sites verified across ${uniqueCoordinators} coordinators.\n` +
    `Pending: ${totalPending} | Returned: ${totalReturned}\n\n` +
    (breakdownLines ? `Top coordinators with pending items:\n${breakdownLines}` : '');

  // Check for existing digest today to avoid duplicates
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data: existing } = await supabase
    .from('notifications')
    .select('id')
    .eq('recipient_id', recipientId)
    .ilike('title_en', '%Daily MMP Verification Digest%')
    .gte('created_at', startOfDay.toISOString())
    .limit(1);

  if (existing && existing.length > 0) return; // already sent today

  await supabase.from('notifications').insert({
    recipient_id: recipientId,
    user_id: recipientId,
    title_en: title,
    title_ar: title,
    message_en: message,
    message_ar: message,
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

    if (lastSent === today()) return; // already ran today for this user

    ranRef.current = true;

    (async () => {
      try {
        const summaries = await fetchCoordinatorDigest();
        if (summaries.length === 0) return;

        // Send to this user
        await sendDigestNotification(userId, summaries);

        // If this user is super_admin or admin, also fan out to all eligible recipients
        if (isSuperAdmin() || hasAnyRole(['admin'])) {
          const allRecipients = await fetchAdminAndSupervisorIds();
          for (const rid of allRecipients) {
            if (rid === userId) continue; // already sent above
            await sendDigestNotification(rid, summaries);
          }
        }

        localStorage.setItem(key, today());
      } catch (e) {
        console.warn('[DailyDigest] Failed to send digest:', e);
        ranRef.current = false; // allow retry
      }
    })();
  }, [isEligible, currentUser?.id]);
}
