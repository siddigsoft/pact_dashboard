/**
 * useOverdueMilestoneAlert
 * Runs once per session for admin/PM/FOM users. Finds project milestones
 * that are overdue (due_date past, status not completed/cancelled) and
 * sends in-app notifications to assigned users and admins.
 */
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useUser } from '@/context/user/UserContext';
import { startOfDay, isBefore, parseISO, isValid } from 'date-fns';

const SESSION_KEY = 'pact_overdue_milestone_check';

export function useOverdueMilestoneAlert() {
  const { hasAnyRole } = useAuthorization();
  const { currentUser } = useUser();
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    if (!currentUser?.id) return;
    if (!hasAnyRole(['super_admin', 'admin', 'fom', 'programme_manager'])) return;

    // Only run once per calendar day
    const todayKey = startOfDay(new Date()).toISOString().split('T')[0];
    try {
      const last = sessionStorage.getItem(SESSION_KEY);
      if (last === todayKey) return;
      sessionStorage.setItem(SESSION_KEY, todayKey);
    } catch { /* ignore storage errors */ }

    ranRef.current = true;
    checkOverdueMilestones(currentUser.id).catch(() => {});
  }, [currentUser?.id]);
}

async function checkOverdueMilestones(userId: string) {
  const today = startOfDay(new Date());

  // Query overdue milestones with project name
  const { data: milestones } = await supabase
    .from('project_milestones')
    .select('id, title, due_date, project_id, assigned_to, created_by')
    .not('status', 'in', '("completed","cancelled")')
    .lt('due_date', today.toISOString())
    .order('due_date', { ascending: true });

  if (!milestones?.length) return;

  // Get project names
  const projectIds = [...new Set(milestones.map(m => m.project_id))];
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .in('id', projectIds);
  const projMap: Record<string, string> = {};
  (projects ?? []).forEach((p: any) => { projMap[p.id] = p.name; });

  // Get admin/FOM list for broadcast
  const { data: admins } = await supabase
    .from('profiles')
    .select('id')
    .in('role', ['super_admin', 'admin', 'fom']);
  const adminIds = new Set((admins ?? []).map((a: any) => a.id));

  // Check which milestone notifications already exist today to avoid duplicates
  const todayStr = today.toISOString().split('T')[0];
  const { data: existingToday } = await supabase
    .from('notifications')
    .select('entity_id')
    .eq('event_type', 'milestone_overdue')
    .gte('created_at', todayStr);
  const alreadyNotified = new Set((existingToday ?? []).map((n: any) => n.entity_id));

  const notifications: object[] = [];

  for (const milestone of milestones) {
    if (alreadyNotified.has(milestone.id)) continue;

    const dueDate = milestone.due_date ? parseISO(milestone.due_date) : null;
    if (!dueDate || !isValid(dueDate)) continue;

    const projectName = projMap[milestone.project_id] ?? 'Unknown Project';
    const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    const title = `Overdue Milestone: ${milestone.title}`;
    const message = `Milestone "${milestone.title}" in "${projectName}" was due ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} ago and is not yet completed.`;

    // Collect recipient IDs (assigned_to + created_by + admins)
    const recipients = new Set<string>(adminIds);
    if (milestone.assigned_to) recipients.add(milestone.assigned_to);
    if (milestone.created_by) recipients.add(milestone.created_by);

    for (const recipientId of recipients) {
      notifications.push({
        recipient_id: recipientId,
        event_type: 'milestone_overdue',
        entity_type: 'project_milestone',
        entity_id: milestone.id,
        title_en: title,
        message_en: message,
        priority: 'high',
        status: 'pending',
        triggered_by: userId,
        action_url: `/projects/${milestone.project_id}`,
        email_sent: false,
      });
    }
  }

  if (notifications.length > 0) {
    // Batch insert in chunks to avoid request size limits
    const CHUNK = 50;
    for (let i = 0; i < notifications.length; i += CHUNK) {
      await supabase.from('notifications').insert(notifications.slice(i, i + CHUNK));
    }
  }
}
