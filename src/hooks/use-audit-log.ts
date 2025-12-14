import { useCallback } from 'react';
import { useAuditOptional } from '@/context/audit/AuditContext';
import { CreateAuditLogInput, AuditModule, AuditAction, AuditSeverity, WorkflowStep } from '@/types/audit-trail';

export function useAuditLog() {
  const auditContext = useAuditOptional();

  const logEvent = useCallback(async (input: CreateAuditLogInput): Promise<string | null> => {
    if (!auditContext) {
      console.warn('[Audit] AuditContext not available');
      return null;
    }
    return auditContext.logAuditEvent(input);
  }, [auditContext]);

  const logSiteVisitEvent = useCallback(async (
    action: AuditAction,
    siteId: string,
    siteName: string,
    description: string,
    options?: {
      severity?: AuditSeverity;
      metadata?: Record<string, unknown>;
      success?: boolean;
      errorMessage?: string;
      workflowStep?: WorkflowStep;
      previousState?: Record<string, unknown>;
      newState?: Record<string, unknown>;
    }
  ) => {
    return logEvent({
      module: 'site_visit',
      action,
      entityType: 'site_visit',
      entityId: siteId,
      entityName: siteName,
      description,
      severity: options?.severity || 'info',
      metadata: options?.metadata,
      success: options?.success !== false,
      errorMessage: options?.errorMessage,
      workflowStep: options?.workflowStep,
      previousState: options?.previousState,
      newState: options?.newState,
      tags: ['site_visit', action],
    });
  }, [logEvent]);

  const logMMPEvent = useCallback(async (
    action: AuditAction,
    mmpId: string,
    mmpName: string,
    description: string,
    options?: {
      severity?: AuditSeverity;
      metadata?: Record<string, unknown>;
      success?: boolean;
      errorMessage?: string;
    }
  ) => {
    return logEvent({
      module: 'mmp',
      action,
      entityType: 'mmp',
      entityId: mmpId,
      entityName: mmpName,
      description,
      severity: options?.severity || 'info',
      metadata: options?.metadata,
      success: options?.success !== false,
      errorMessage: options?.errorMessage,
      tags: ['mmp', action],
    });
  }, [logEvent]);

  const logFinancialEvent = useCallback(async (
    action: AuditAction,
    entityId: string,
    entityName: string,
    description: string,
    options?: {
      entityType?: string;
      severity?: AuditSeverity;
      metadata?: Record<string, unknown>;
      success?: boolean;
      errorMessage?: string;
      previousState?: Record<string, unknown>;
      newState?: Record<string, unknown>;
    }
  ) => {
    return logEvent({
      module: 'financial',
      action,
      entityType: options?.entityType || 'transaction',
      entityId,
      entityName,
      description,
      severity: options?.severity || 'info',
      metadata: options?.metadata,
      success: options?.success !== false,
      errorMessage: options?.errorMessage,
      previousState: options?.previousState,
      newState: options?.newState,
      tags: ['financial', action],
    });
  }, [logEvent]);

  const logUserEvent = useCallback(async (
    action: AuditAction,
    userId: string,
    userName: string,
    description: string,
    options?: {
      severity?: AuditSeverity;
      metadata?: Record<string, unknown>;
      success?: boolean;
      errorMessage?: string;
      changes?: Record<string, { from: unknown; to: unknown }>;
    }
  ) => {
    return logEvent({
      module: 'user',
      action,
      entityType: 'user',
      entityId: userId,
      entityName: userName,
      description,
      severity: options?.severity || 'info',
      metadata: options?.metadata,
      success: options?.success !== false,
      errorMessage: options?.errorMessage,
      changes: options?.changes,
      tags: ['user', action],
    });
  }, [logEvent]);

  const logApprovalEvent = useCallback(async (
    action: AuditAction,
    entityId: string,
    entityName: string,
    description: string,
    options?: {
      entityType?: string;
      severity?: AuditSeverity;
      metadata?: Record<string, unknown>;
      success?: boolean;
      errorMessage?: string;
      workflowStep?: WorkflowStep;
    }
  ) => {
    return logEvent({
      module: 'approval',
      action,
      entityType: options?.entityType || 'approval',
      entityId,
      entityName,
      description,
      severity: options?.severity || 'info',
      metadata: options?.metadata,
      success: options?.success !== false,
      errorMessage: options?.errorMessage,
      workflowStep: options?.workflowStep,
      tags: ['approval', action],
    });
  }, [logEvent]);

  const logSystemEvent = useCallback(async (
    action: AuditAction,
    description: string,
    options?: {
      entityType?: string;
      entityId?: string;
      entityName?: string;
      severity?: AuditSeverity;
      metadata?: Record<string, unknown>;
      success?: boolean;
      errorMessage?: string;
    }
  ) => {
    return logEvent({
      module: 'system',
      action,
      entityType: options?.entityType || 'system',
      entityId: options?.entityId || 'system',
      entityName: options?.entityName,
      description,
      severity: options?.severity || 'info',
      metadata: options?.metadata,
      success: options?.success !== false,
      errorMessage: options?.errorMessage,
      tags: ['system', action],
    });
  }, [logEvent]);

  const logNotificationEvent = useCallback(async (
    action: AuditAction,
    entityId: string,
    description: string,
    options?: {
      entityType?: string;
      entityName?: string;
      severity?: AuditSeverity;
      metadata?: Record<string, unknown>;
      success?: boolean;
      errorMessage?: string;
    }
  ) => {
    return logEvent({
      module: 'notification',
      action,
      entityType: options?.entityType || 'email',
      entityId,
      entityName: options?.entityName,
      description,
      severity: options?.severity || 'info',
      metadata: options?.metadata,
      success: options?.success !== false,
      errorMessage: options?.errorMessage,
      tags: ['notification', action, options?.entityType || 'email'],
    });
  }, [logEvent]);

  return {
    logEvent,
    logSiteVisitEvent,
    logMMPEvent,
    logFinancialEvent,
    logUserEvent,
    logApprovalEvent,
    logSystemEvent,
    logNotificationEvent,
    isAvailable: !!auditContext,
  };
}
