/**
 * useContractExpiryAlert
 * Runs once per session for admin/HR users. Finds staff whose contracts
 * expire within 30 days (or are already expired within 7 days) and sends
 * notifications to HR admins so they can act on renewals.
 */
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useUser } from '@/context/user/UserContext';
import { addDays, startOfDay, differenceInDays, parseISO, isValid } from 'date-fns';

const SESSION_KEY = 'pact_contract_expiry_check';
const WARN_DAYS_AHEAD = 30;  // notify when < 30 days remain
const EXPIRED_GRACE_DAYS = 7; // also notify for contracts expired within last 7 days

export function useContractExpiryAlert() {
  const { hasAnyRole } = useAuthorization();
  const { currentUser } = useUser();
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    if (!currentUser?.id) return;
    if (!hasAnyRole(['super_admin', 'admin', 'hr'])) return;

    const todayKey = startOfDay(new Date()).toISOString().split('T')[0];
    try {
      const last = sessionStorage.getItem(SESSION_KEY);
      if (last === todayKey) return;
      sessionStorage.setItem(SESSION_KEY, todayKey);
    } catch { /* ignore */ }

    ranRef.current = true;
    checkContractExpiry(currentUser.id).catch(() => {});
  }, [currentUser?.id]);
}

async function checkContractExpiry(triggerUserId: string) {
  const today = startOfDay(new Date());
  const warnDate = addDays(today, WARN_DAYS_AHEAD);
  const graceCutoff = addDays(today, -EXPIRED_GRACE_DAYS);

  // Get profiles with contracts expiring soon or already expired within grace period
  const { data: expiring } = await supabase
    .from('profiles')
    .select('id, full_name, contract_end_date, contract_type, role')
    .not('contract_end_date', 'is', null)
    .gte('contract_end_date', graceCutoff.toISOString().split('T')[0])
    .lte('contract_end_date', warnDate.toISOString().split('T')[0])
    .order('contract_end_date', { ascending: true });

  if (!expiring?.length) return;

  // Get HR/admin recipients
  const { data: admins } = await supabase
    .from('profiles')
    .select('id')
    .in('role', ['super_admin', 'admin', 'hr']);
  if (!admins?.length) return;
  const adminIds = (admins ?? []).map((a: any) => a.id);

  // Check which already have contract notifications today
  const todayStr = today.toISOString().split('T')[0];
  const staffIds = expiring.map(p => p.id);
  const { data: existingToday } = await supabase
    .from('notifications')
    .select('entity_id')
    .eq('event_type', 'contract_expiry')
    .gte('created_at', todayStr)
    .in('entity_id', staffIds);
  const alreadyNotified = new Set((existingToday ?? []).map((n: any) => n.entity_id));

  const notifications: object[] = [];

  for (const staff of expiring) {
    if (alreadyNotified.has(staff.id)) continue;

    const expDate = parseISO(staff.contract_end_date);
    if (!isValid(expDate)) continue;

    const daysLeft = differenceInDays(expDate, today);
    const isExpired = daysLeft < 0;
    const contractTypeLabel = (staff.contract_type ?? 'Contract').replace(/_/g, ' ');
    const staffName = staff.full_name ?? 'Staff member';

    const title = isExpired
      ? `Contract Expired: ${staffName}`
      : `Contract Expiring Soon: ${staffName}`;
    const message = isExpired
      ? `${staffName}'s ${contractTypeLabel} expired ${Math.abs(daysLeft)} day${Math.abs(daysLeft) !== 1 ? 's' : ''} ago (${staff.contract_end_date}). Immediate renewal action required.`
      : `${staffName}'s ${contractTypeLabel} expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} on ${staff.contract_end_date}. Please initiate renewal.`;

    for (const adminId of adminIds) {
      notifications.push({
        recipient_id: adminId,
        event_type: 'contract_expiry',
        entity_type: 'staff_contract',
        entity_id: staff.id,
        title_en: title,
        message_en: message,
        priority: isExpired ? 'urgent' : (daysLeft <= 7 ? 'high' : 'medium'),
        status: 'pending',
        triggered_by: triggerUserId,
        action_url: `/users/${staff.id}`,
        metadata: { days_left: daysLeft, contract_end_date: staff.contract_end_date, contract_type: staff.contract_type },
        email_sent: false,
      });
    }
  }

  if (notifications.length > 0) {
    const CHUNK = 50;
    for (let i = 0; i < notifications.length; i += CHUNK) {
      await supabase.from('notifications').insert(notifications.slice(i, i + CHUNK));
    }
  }
}
