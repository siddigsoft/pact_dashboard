import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { useUser } from '@/context/user/UserContext';
import { 
  AuditLogEntry, 
  CreateAuditLogInput, 
  AuditLogFilter, 
  AuditStats,
  AuditModule,
  AuditAction,
  AuditSeverity
} from '@/types/audit-trail';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/integrations/supabase/client';

interface AuditContextType {
  logs: AuditLogEntry[];
  loading: boolean;
  logAuditEvent: (input: CreateAuditLogInput) => Promise<string>;
  getAuditLogs: (filter?: AuditLogFilter) => AuditLogEntry[];
  getAuditStats: () => AuditStats;
  getLogsForEntity: (entityType: string, entityId: string) => AuditLogEntry[];
  getLogsByModule: (module: AuditModule) => AuditLogEntry[];
  getLogsByActor: (actorId: string) => AuditLogEntry[];
  getRecentLogs: (limit?: number) => AuditLogEntry[];
  clearOldLogs: (daysToKeep?: number) => void;
  exportLogs: (filter?: AuditLogFilter) => string;
  refreshLogs: () => Promise<void>;
  syncToDatabase: () => Promise<void>;
}

const AuditContext = createContext<AuditContextType | undefined>(undefined);

const STORAGE_KEY = 'pact_audit_logs';
const PENDING_SYNC_KEY = 'pact_audit_pending_sync';
const MAX_LOGS = 10000;
const DEFAULT_DAYS_TO_KEEP = 90;

export function AuditProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useUser();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Load logs from Supabase with localStorage fallback
  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      // Try to load from Supabase first
      const { data: dbLogs, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(MAX_LOGS);

      if (!error && dbLogs && dbLogs.length > 0) {
        // Transform database records to AuditLogEntry format
        const transformedLogs: AuditLogEntry[] = dbLogs.map((log: any) => ({
          id: log.id,
          module: log.module as AuditModule,
          action: log.action as AuditAction,
          entityType: log.entity_type,
          entityId: log.entity_id,
          entityName: log.entity_name,
          actorId: log.actor_id,
          actorName: log.actor_name,
          actorRole: log.actor_role,
          actorEmail: log.actor_email,
          timestamp: log.timestamp,
          severity: log.severity as AuditSeverity,
          workflowStep: log.workflow_step,
          previousState: log.previous_state,
          newState: log.new_state,
          changes: log.changes,
          metadata: log.metadata,
          description: log.description,
          details: log.details,
          tags: log.tags,
          relatedEntityIds: log.related_entity_ids,
          success: log.success,
          errorMessage: log.error_message,
          sessionId: log.session_id,
        }));
        setLogs(transformedLogs);
        // Cache in localStorage for offline access
        localStorage.setItem(STORAGE_KEY, JSON.stringify(transformedLogs.slice(0, 1000)));
      } else {
        // Fallback to localStorage if Supabase fails or no data
        const stored = localStorage.getItem(STORAGE_KEY);
        const parsed = stored ? JSON.parse(stored) as AuditLogEntry[] : [];
        setLogs(parsed.sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        ));
      }
    } catch (error) {
      console.error('[Audit] Error loading logs from Supabase:', error);
      // Fallback to localStorage
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        const parsed = stored ? JSON.parse(stored) as AuditLogEntry[] : [];
        setLogs(parsed.sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        ));
      } catch (localError) {
        console.error('[Audit] Error loading logs from localStorage:', localError);
        setLogs([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Save log to Supabase with localStorage fallback
  const saveLogToDatabase = useCallback(async (log: AuditLogEntry): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('audit_logs')
        .insert({
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

      if (error) {
        console.error('[Audit] Error saving to Supabase:', error);
        return false;
      }
      return true;
    } catch (error) {
      console.error('[Audit] Error saving to Supabase:', error);
      return false;
    }
  }, []);

  // Save pending logs to localStorage for later sync
  const addToPendingSync = useCallback((log: AuditLogEntry) => {
    try {
      const pending = localStorage.getItem(PENDING_SYNC_KEY);
      const pendingLogs = pending ? JSON.parse(pending) : [];
      pendingLogs.push(log);
      localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(pendingLogs.slice(-500)));
    } catch (error) {
      console.error('[Audit] Error adding to pending sync:', error);
    }
  }, []);

  // Sync pending logs to database
  const syncToDatabase = useCallback(async () => {
    try {
      const pending = localStorage.getItem(PENDING_SYNC_KEY);
      if (!pending) return;

      const pendingLogs: AuditLogEntry[] = JSON.parse(pending);
      if (pendingLogs.length === 0) return;

      console.log(`[Audit] Syncing ${pendingLogs.length} pending logs to database`);

      const successfullyInserted: string[] = [];
      for (const log of pendingLogs) {
        const success = await saveLogToDatabase(log);
        if (success) {
          successfullyInserted.push(log.id);
        }
      }

      // Remove successfully synced logs from pending
      const remaining = pendingLogs.filter(log => !successfullyInserted.includes(log.id));
      localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(remaining));

      console.log(`[Audit] Synced ${successfullyInserted.length} logs, ${remaining.length} remaining`);
    } catch (error) {
      console.error('[Audit] Error syncing to database:', error);
    }
  }, [saveLogToDatabase]);

  const saveLogs = useCallback((newLogs: AuditLogEntry[]) => {
    try {
      const trimmedLogs = newLogs.slice(0, MAX_LOGS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmedLogs.slice(0, 1000)));
      setLogs(trimmedLogs);
    } catch (error) {
      console.error('[Audit] Error saving logs:', error);
    }
  }, []);

  useEffect(() => {
    loadLogs();
    // Sync pending logs on mount
    syncToDatabase();
  }, [loadLogs, syncToDatabase]);

  // Periodic sync of pending logs (every 5 minutes)
  useEffect(() => {
    const interval = setInterval(() => {
      syncToDatabase();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [syncToDatabase]);

  const logAuditEvent = useCallback(async (input: CreateAuditLogInput): Promise<string> => {
    const logId = uuidv4();
    
    const newLog: AuditLogEntry = {
      id: logId,
      module: input.module,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      entityName: input.entityName,
      actorId: currentUser?.id || 'system',
      actorName: currentUser?.name || 'System',
      actorRole: currentUser?.role || 'system',
      actorEmail: currentUser?.email,
      timestamp: new Date().toISOString(),
      severity: input.severity || 'info',
      workflowStep: input.workflowStep,
      previousState: input.previousState,
      newState: input.newState,
      changes: input.changes,
      metadata: input.metadata,
      description: input.description,
      details: input.details,
      tags: input.tags,
      relatedEntityIds: input.relatedEntityIds,
      success: input.success !== false,
      errorMessage: input.errorMessage,
      sessionId: sessionStorage.getItem('sessionId') || undefined,
    };

    // Update local state immediately
    const updatedLogs = [newLog, ...logs];
    saveLogs(updatedLogs);

    // Try to save to Supabase
    const success = await saveLogToDatabase(newLog);
    if (!success) {
      // Add to pending sync queue if Supabase save fails
      addToPendingSync(newLog);
    }

    console.log(`[Audit] ${input.module}:${input.action} - ${input.description}`);

    return logId;
  }, [currentUser, logs, saveLogs, saveLogToDatabase, addToPendingSync]);

  const getAuditLogs = useCallback((filter?: AuditLogFilter): AuditLogEntry[] => {
    if (!filter) return logs;

    let filtered = [...logs];

    if (filter.module) {
      const modules = Array.isArray(filter.module) ? filter.module : [filter.module];
      filtered = filtered.filter(log => modules.includes(log.module));
    }

    if (filter.action) {
      const actions = Array.isArray(filter.action) ? filter.action : [filter.action];
      filtered = filtered.filter(log => actions.includes(log.action));
    }

    if (filter.actorId) {
      filtered = filtered.filter(log => log.actorId === filter.actorId);
    }

    if (filter.entityType) {
      filtered = filtered.filter(log => log.entityType === filter.entityType);
    }

    if (filter.entityId) {
      filtered = filtered.filter(log => log.entityId === filter.entityId);
    }

    if (filter.severity) {
      const severities = Array.isArray(filter.severity) ? filter.severity : [filter.severity];
      filtered = filtered.filter(log => severities.includes(log.severity));
    }

    if (filter.workflowStep) {
      const steps = Array.isArray(filter.workflowStep) ? filter.workflowStep : [filter.workflowStep];
      filtered = filtered.filter(log => log.workflowStep && steps.includes(log.workflowStep));
    }

    if (filter.startDate) {
      const start = new Date(filter.startDate);
      filtered = filtered.filter(log => new Date(log.timestamp) >= start);
    }

    if (filter.endDate) {
      const end = new Date(filter.endDate);
      filtered = filtered.filter(log => new Date(log.timestamp) <= end);
    }

    if (filter.searchQuery) {
      const query = filter.searchQuery.toLowerCase();
      filtered = filtered.filter(log => 
        log.description.toLowerCase().includes(query) ||
        log.entityName?.toLowerCase().includes(query) ||
        log.actorName.toLowerCase().includes(query) ||
        log.details?.toLowerCase().includes(query)
      );
    }

    if (filter.tags && filter.tags.length > 0) {
      filtered = filtered.filter(log => 
        log.tags && filter.tags!.some(tag => log.tags!.includes(tag))
      );
    }

    if (filter.success !== undefined) {
      filtered = filtered.filter(log => log.success === filter.success);
    }

    if (filter.offset) {
      filtered = filtered.slice(filter.offset);
    }

    if (filter.limit) {
      filtered = filtered.slice(0, filter.limit);
    }

    return filtered;
  }, [logs]);

  const getAuditStats = useCallback((): AuditStats => {
    const byModule: Record<AuditModule, number> = {} as Record<AuditModule, number>;
    const byAction: Record<AuditAction, number> = {} as Record<AuditAction, number>;
    const bySeverity: Record<AuditSeverity, number> = {
      info: 0,
      warning: 0,
      error: 0,
      critical: 0,
    };
    const actorCounts: Record<string, { name: string; count: number }> = {};

    for (const log of logs) {
      byModule[log.module] = (byModule[log.module] || 0) + 1;
      byAction[log.action] = (byAction[log.action] || 0) + 1;
      bySeverity[log.severity] = (bySeverity[log.severity] || 0) + 1;

      if (!actorCounts[log.actorId]) {
        actorCounts[log.actorId] = { name: log.actorName, count: 0 };
      }
      actorCounts[log.actorId].count++;
    }

    const topActors = Object.entries(actorCounts)
      .map(([actorId, data]) => ({ actorId, actorName: data.name, count: data.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalLogs: logs.length,
      byModule,
      byAction,
      bySeverity,
      recentActivity: logs.slice(0, 20),
      topActors,
    };
  }, [logs]);

  const getLogsForEntity = useCallback((entityType: string, entityId: string): AuditLogEntry[] => {
    return logs.filter(log => log.entityType === entityType && log.entityId === entityId);
  }, [logs]);

  const getLogsByModule = useCallback((module: AuditModule): AuditLogEntry[] => {
    return logs.filter(log => log.module === module);
  }, [logs]);

  const getLogsByActor = useCallback((actorId: string): AuditLogEntry[] => {
    return logs.filter(log => log.actorId === actorId);
  }, [logs]);

  const getRecentLogs = useCallback((limit: number = 50): AuditLogEntry[] => {
    return logs.slice(0, limit);
  }, [logs]);

  const clearOldLogs = useCallback((daysToKeep: number = DEFAULT_DAYS_TO_KEEP) => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    const filteredLogs = logs.filter(log => new Date(log.timestamp) >= cutoffDate);
    saveLogs(filteredLogs);
    
    console.log(`[Audit] Cleared ${logs.length - filteredLogs.length} logs older than ${daysToKeep} days`);
  }, [logs, saveLogs]);

  const exportLogs = useCallback((filter?: AuditLogFilter): string => {
    const logsToExport = filter ? getAuditLogs(filter) : logs;
    return JSON.stringify(logsToExport, null, 2);
  }, [logs, getAuditLogs]);

  const refreshLogs = useCallback(async () => {
    await loadLogs();
  }, [loadLogs]);

  const value: AuditContextType = {
    logs,
    loading,
    logAuditEvent,
    getAuditLogs,
    getAuditStats,
    getLogsForEntity,
    getLogsByModule,
    getLogsByActor,
    getRecentLogs,
    clearOldLogs,
    exportLogs,
    refreshLogs,
    syncToDatabase,
  };

  return (
    <AuditContext.Provider value={value}>
      {children}
    </AuditContext.Provider>
  );
}

export function useAudit() {
  const context = useContext(AuditContext);
  if (context === undefined) {
    throw new Error('useAudit must be used within an AuditProvider');
  }
  return context;
}

export function useAuditOptional() {
  return useContext(AuditContext);
}
