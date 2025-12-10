import { supabase } from '@/integrations/supabase/client';
import { v4 as uuidv4 } from 'uuid';
import type { AuditModule, AuditAction, AuditSeverity, AuditLogEntry, WorkflowStep } from '@/types/audit-trail';

const STORAGE_KEY = 'pact_audit_logs';
const PENDING_SYNC_KEY = 'pact_audit_pending_sync';

interface ServiceAuditLogInput {
  module: AuditModule;
  action: AuditAction;
  entityType: string;
  entityId: string;
  entityName?: string;
  description: string;
  severity?: AuditSeverity;
  workflowStep?: WorkflowStep;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  changes?: Record<string, { from: unknown; to: unknown }>;
  metadata?: Record<string, unknown>;
  details?: string;
  tags?: string[];
  relatedEntityIds?: string[];
  success?: boolean;
  errorMessage?: string;
}

export async function logAuditEvent(data: ServiceAuditLogInput): Promise<string | null> {
  try {
    const { data: session } = await supabase.auth.getSession();
    const user = session?.session?.user;
    const sessionId = session?.session?.access_token?.substring(0, 16) || 'system-session';
    
    const timestamp = new Date().toISOString();
    const id = uuidv4();
    
    const dbRecord = {
      id,
      module: data.module,
      action: data.action,
      entity_type: data.entityType,
      entity_id: data.entityId,
      entity_name: data.entityName || null,
      actor_id: user?.id || 'system',
      actor_name: user?.user_metadata?.full_name || user?.email || 'System Service',
      actor_role: user?.user_metadata?.role || 'system',
      actor_email: user?.email || null,
      timestamp,
      severity: data.severity || 'info',
      workflow_step: data.workflowStep || null,
      previous_state: data.previousState || null,
      new_state: data.newState || null,
      changes: data.changes || null,
      metadata: data.metadata || null,
      description: data.description,
      details: data.details || null,
      tags: data.tags || [data.module, data.action],
      related_entity_ids: data.relatedEntityIds || null,
      success: data.success !== false,
      error_message: data.errorMessage || null,
      session_id: sessionId,
    };

    const { error } = await supabase
      .from('audit_logs')
      .insert(dbRecord);

    if (error) {
      console.warn('[AuditLogger] Failed to save to database, caching locally:', error);
      const camelCaseLog = dbLogToCamelCase(dbRecord);
      cacheLocalLog(camelCaseLog);
      addToPendingSync(camelCaseLog);
    }

    return id;
  } catch (error) {
    console.warn('[AuditLogger] Error logging audit event:', error);
    return null;
  }
}

function dbLogToCamelCase(dbLog: Record<string, unknown>): AuditLogEntry {
  return {
    id: dbLog.id as string,
    module: dbLog.module as AuditModule,
    action: dbLog.action as AuditAction,
    entityType: dbLog.entity_type as string,
    entityId: dbLog.entity_id as string,
    entityName: dbLog.entity_name as string | undefined,
    actorId: dbLog.actor_id as string,
    actorName: dbLog.actor_name as string,
    actorRole: dbLog.actor_role as string,
    actorEmail: dbLog.actor_email as string | undefined,
    timestamp: dbLog.timestamp as string,
    severity: dbLog.severity as AuditSeverity,
    workflowStep: dbLog.workflow_step as WorkflowStep | undefined,
    previousState: dbLog.previous_state as Record<string, unknown> | undefined,
    newState: dbLog.new_state as Record<string, unknown> | undefined,
    changes: dbLog.changes as Record<string, { from: unknown; to: unknown }> | undefined,
    metadata: dbLog.metadata as Record<string, unknown> | undefined,
    description: dbLog.description as string,
    details: dbLog.details as string | undefined,
    tags: dbLog.tags as string[] | undefined,
    relatedEntityIds: dbLog.related_entity_ids as string[] | undefined,
    success: dbLog.success as boolean,
    errorMessage: dbLog.error_message as string | undefined,
    sessionId: dbLog.session_id as string | undefined,
  };
}

function cacheLocalLog(log: AuditLogEntry): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const logs: AuditLogEntry[] = stored ? JSON.parse(stored) : [];
    logs.unshift(log);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(0, 1000)));
  } catch (e) {
    console.warn('[AuditLogger] Failed to cache log locally:', e);
  }
}

function addToPendingSync(log: AuditLogEntry): void {
  try {
    const pending = localStorage.getItem(PENDING_SYNC_KEY);
    const pendingLogs: AuditLogEntry[] = pending ? JSON.parse(pending) : [];
    pendingLogs.push(log);
    localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(pendingLogs.slice(-500)));
  } catch (e) {
    console.warn('[AuditLogger] Failed to add to pending sync:', e);
  }
}

export async function logEmailSend(
  recipient: string,
  subject: string,
  emailType: string,
  success: boolean,
  messageId?: string,
  errorMessage?: string
): Promise<string | null> {
  return logAuditEvent({
    module: 'notification',
    action: 'send',
    entityType: 'email',
    entityId: messageId || `email-${Date.now()}`,
    entityName: subject,
    description: success
      ? `Email sent to ${recipient}: ${subject}`
      : `Failed to send email to ${recipient}: ${subject}`,
    severity: success ? 'info' : 'warning',
    metadata: {
      recipient,
      subject,
      emailType,
      messageId,
      deliveredAt: success ? new Date().toISOString() : undefined,
    },
    success,
    errorMessage,
    tags: ['notification', 'email', emailType],
  });
}

export async function logOtpSend(
  method: 'email' | 'phone',
  destination: string,
  purpose: string,
  success: boolean,
  provider: 'smtp' | 'mock',
  errorMessage?: string
): Promise<string | null> {
  return logAuditEvent({
    module: 'notification',
    action: 'send',
    entityType: 'otp',
    entityId: `otp-${Date.now()}`,
    entityName: `OTP for ${purpose}`,
    description: success
      ? `OTP sent via ${method} to ${destination} for ${purpose}`
      : `Failed to send OTP via ${method} to ${destination} for ${purpose}`,
    severity: success ? 'info' : 'warning',
    metadata: {
      method,
      destination: method === 'email' ? destination : destination.replace(/\d(?=\d{4})/g, '*'),
      purpose,
      provider,
      sentAt: success ? new Date().toISOString() : undefined,
    },
    success,
    errorMessage,
    tags: ['notification', 'otp', method, purpose],
  });
}

export async function logOtpVerification(
  method: 'email' | 'phone',
  destination: string,
  purpose: string,
  success: boolean,
  errorMessage?: string
): Promise<string | null> {
  return logAuditEvent({
    module: 'notification',
    action: 'verify',
    entityType: 'otp',
    entityId: `otp-verify-${Date.now()}`,
    entityName: `OTP verification for ${purpose}`,
    description: success
      ? `OTP verified successfully for ${destination} (${purpose})`
      : `OTP verification failed for ${destination} (${purpose})`,
    severity: success ? 'info' : 'warning',
    metadata: {
      method,
      destination: method === 'email' ? destination : destination.replace(/\d(?=\d{4})/g, '*'),
      purpose,
      verifiedAt: success ? new Date().toISOString() : undefined,
    },
    success,
    errorMessage,
    tags: ['notification', 'otp', 'verification', purpose],
  });
}
