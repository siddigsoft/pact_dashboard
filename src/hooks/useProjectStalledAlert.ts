/**
 * useProjectStalledAlert
 * Runs once per session for admin/FOM users. Queries all active projects
 * whose last flow-log entry is older than STALL_DAYS (14 days) and creates
 * an in-app notification for each one not already notified today.
 */
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useUser } from '@/context/user/UserContext';
import { differenceInDays, parseISO, startOfDay } from 'date-fns';

const STALL_DAYS = 14;

export function useProjectStalledAlert() {
  const { hasAnyRole } = useAuthorization();
  const { currentUser } = useUser();
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    if (!currentUser?.id) return;
    if (!hasAnyRole(['super_admin', 'admin', 'fom'])) return;

    ranRef.current = true;
    checkStalledProjects(currentUser.id).catch(() => {});
  }, [currentUser?.id]);
}

async function checkStalledProjects(userId: string) {
  const todayKey = startOfDay(new Date()).toISOString();

  // Fetch active, non-archived projects with their most recent flow log entry
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, current_flow_stage')
    .in('status', ['active', 'draft'])
    .eq('archived', false);

  if (!projects?.length) return;

  const projectIds = projects.map(p => p.id);

  // Get the latest flow log entry per project
  const { data: logs } = await supabase
    .from('project_flow_log')
    .select('project_id, advanced_at')
    .in('project_id', projectIds)
    .order('advanced_at', { ascending: false });

  const latestByProject: Record<string, string> = {};
  for (const log of logs ?? []) {
    if (!latestByProject[log.project_id]) {
      latestByProject[log.project_id] = log.advanced_at;
    }
  }

  const now = new Date();
  const stalled = projects.filter(p => {
    const last = latestByProject[p.id];
    if (!last) return true; // Never advanced = stalled from creation
    return differenceInDays(now, parseISO(last)) >= STALL_DAYS;
  });

  if (!stalled.length) return;

  // Check which ones we already notified today
  const stalledIds = stalled.map(p => p.id);
  const { data: existing } = await supabase
    .from('notifications')
    .select('entity_id')
    .eq('user_id', userId)
    .eq('event_type', 'project_stalled')
    .in('entity_id', stalledIds)
    .gte('created_at', todayKey);

  const alreadyNotified = new Set((existing ?? []).map(n => n.entity_id));

  const toNotify = stalled.filter(p => !alreadyNotified.has(p.id));
  if (!toNotify.length) return;

  const notifications = toNotify.map(p => {
    const last = latestByProject[p.id];
    const daysStalled = last ? differenceInDays(now, parseISO(last)) : 'unknown';
    return {
      recipient_id: userId,
      user_id: userId,
      title_en: `Stalled Project: ${p.name}`,
      title_ar: `مشروع متوقف: ${p.name}`,
      message_en: `"${p.name}" has not advanced its flow stage in ${daysStalled} days. Review and take action.`,
      message_ar: `لم يتقدم "${p.name}" في مراحل سير العمل منذ ${daysStalled} يوماً. يُرجى المراجعة واتخاذ الإجراء اللازم.`,
      priority: 'high',
      action_url: `/projects/${p.id}`,
      entity_id: p.id,
      entity_type: 'project',
      event_type: 'project_stalled',
      status: 'pending',
      email_sent: false,
    };
  });

  await supabase.from('notifications').insert(notifications);
}
