/**
 * usePersonalTaskReminder
 * Runs once per session. Checks for the current user's personal tasks that
 * are overdue (past due_date, not completed/cancelled) and sends a single
 * summary notification so they stay on top of their workload.
 */
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';
import { startOfDay, differenceInDays, parseISO, isValid } from 'date-fns';

const SESSION_KEY = 'pact_personal_task_reminder';

export function usePersonalTaskReminder() {
  const { currentUser } = useUser();
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    if (!currentUser?.id) return;

    const todayKey = startOfDay(new Date()).toISOString().split('T')[0];
    try {
      const last = sessionStorage.getItem(SESSION_KEY);
      if (last === todayKey) return;
      sessionStorage.setItem(SESSION_KEY, todayKey);
    } catch { /* ignore */ }

    ranRef.current = true;
    checkOverdueTasks(currentUser.id).catch(() => {});
  }, [currentUser?.id]);
}

async function checkOverdueTasks(userId: string) {
  const today = startOfDay(new Date());
  const todayStr = today.toISOString().split('T')[0];

  const { data: tasks } = await supabase
    .from('personal_tasks')
    .select('id, title, due_date, priority')
    .eq('user_id', userId)
    .not('status', 'in', '("done","cancelled")')
    .lt('due_date', todayStr)
    .not('due_date', 'is', null)
    .order('due_date', { ascending: true });

  if (!tasks?.length) return;

  // Check if we already sent a reminder today
  const { data: existing } = await supabase
    .from('notifications')
    .select('id')
    .eq('event_type', 'task_overdue_summary')
    .eq('recipient_id', userId)
    .gte('created_at', todayStr)
    .limit(1);

  if (existing?.length) return;

  const count = tasks.length;
  const critical = tasks.filter(t => t.priority === 'critical').length;
  const oldest = tasks[0];
  const oldestDaysAgo = oldest.due_date
    ? differenceInDays(today, parseISO(oldest.due_date))
    : 0;

  await supabase.from('notifications').insert({
    recipient_id: userId,
    event_type: 'task_overdue_summary',
    entity_type: 'personal_task',
    title_en: `${count} Overdue Task${count !== 1 ? 's' : ''}`,
    message_en: `You have ${count} overdue task${count !== 1 ? 's' : ''}${critical > 0 ? ` including ${critical} critical` : ''}. The oldest, "${oldest.title}", is ${oldestDaysAgo} day${oldestDaysAgo !== 1 ? 's' : ''} past due.`,
    priority: critical > 0 ? 'high' : 'medium',
    status: 'pending',
    action_url: '/tasks',
    email_sent: false,
  });
}
