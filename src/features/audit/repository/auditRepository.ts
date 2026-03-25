/**
 * Audit trail — Supabase access for audit_logs.
 */
import { supabase } from '@/integrations/supabase/client';
import type { AuditLogEntry } from '@/types/audit-trail';

const DEFAULT_LIMIT = 10000;

export async function fetchAuditLogs(limit: number = DEFAULT_LIMIT) {
  return supabase
    .from('audit_logs')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(limit);
}

export function fetchUserActivityLogs(limit = 500) {
  return supabase
    .from('user_activity_logs')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(limit);
}

/** Subscribe to new rows; returns unsubscribe. */
export function subscribeUserActivityLogsInsert(onInsert: (row: Record<string, unknown>) => void) {
  const channel = supabase
    .channel('live-activity-feed')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'user_activity_logs' },
      (payload) => {
        onInsert(payload.new as Record<string, unknown>);
      },
    )
    .subscribe();
  return () => {
    try {
      supabase.removeChannel(channel);
    } catch {
      /* ignore */
    }
  };
}

export async function insertAuditLogRow(log: AuditLogEntry) {
  return supabase.from('audit_logs').insert({
    id: log.id,
    module: log.module,
    action: log.action,
    entity_type: log.entityType,
    entity_id: log.entityId,
    entity_name: log.entityName,
    actor_id: log.actorId,
    actor_name: log.actorName,
    actor_role: log.actorRole,
    actor_email: log.actorEmail,
    timestamp: log.timestamp,
    severity: log.severity,
    workflow_step: log.workflowStep,
    previous_state: log.previousState,
    new_state: log.newState,
    changes: log.changes,
    metadata: log.metadata,
    description: log.description,
    details: log.details,
    tags: log.tags,
    related_entity_ids: log.relatedEntityIds,
    success: log.success,
    error_message: log.errorMessage,
    session_id: log.sessionId,
  });
}
