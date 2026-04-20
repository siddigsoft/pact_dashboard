/**
 * TaskAuditTrail Component
 * Displays the change history of a task for compliance and debugging
 */

import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ChevronDown, ChevronUp, Calendar, User, FileText } from 'lucide-react';
import * as AuditService from '@/services/task-audit.service';
import type { TaskChangeRecord } from '@/services/task-audit.service';

interface TaskAuditTrailProps {
  taskId: string;
  className?: string;
  maxRecords?: number;
  showStats?: boolean;
}

export function TaskAuditTrail({
  taskId,
  className = '',
  maxRecords = 50,
  showStats = true,
}: TaskAuditTrailProps) {
  const [changes, setChanges] = useState<TaskChangeRecord[]>([]);
  const [stats, setStats] = useState({
    totalChanges: 0,
    uniqueUsers: 0,
    fieldsChanged: [] as string[],
    firstChange: null as string | null,
    lastChange: null as string | null,
  });
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadAuditTrail() {
      setLoading(true);
      setError(null);
      try {
        const [auditChanges, auditStats] = await Promise.all([
          AuditService.getTaskAuditTrail(taskId),
          AuditService.getAuditStats(taskId),
        ]);

        setChanges(auditChanges.slice(0, maxRecords));
        setStats(auditStats);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load audit trail');
      } finally {
        setLoading(false);
      }
    }

    loadAuditTrail();
  }, [taskId, maxRecords]);

  if (loading) {
    return (
      <div className={`p-4 bg-slate-50 dark:bg-slate-900 rounded-lg ${className}`}>
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg ${className}`}>
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  if (changes.length === 0) {
    return (
      <div className={`p-4 bg-slate-50 dark:bg-slate-900 rounded-lg text-center ${className}`}>
        <p className="text-sm text-muted-foreground">No changes recorded yet</p>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Stats Section */}
      {showStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-2">
            <div className="text-xs text-muted-foreground font-medium">Total Changes</div>
            <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{stats.totalChanges}</div>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-2">
            <div className="text-xs text-muted-foreground font-medium">Modified By</div>
            <div className="text-lg font-bold text-purple-600 dark:text-purple-400">{stats.uniqueUsers}</div>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-2">
            <div className="text-xs text-muted-foreground font-medium">Fields Changed</div>
            <div className="text-lg font-bold text-green-600 dark:text-green-400">{stats.fieldsChanged.length}</div>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-2">
            <div className="text-xs text-muted-foreground font-medium">Last Update</div>
            <div className="text-xs font-bold text-amber-600 dark:text-amber-400">
              {stats.lastChange ? format(new Date(stats.lastChange), 'MMM dd') : 'Never'}
            </div>
          </div>
        </div>
      )}

      {/* Expand/Collapse Button */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
      >
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4" />
          <span className="font-semibold">Change History ({changes.length})</span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {/* Changes List */}
      {expanded && (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {changes.map((change, idx) => (
            <div
              key={change.id}
              className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 space-y-1">
                  {/* Header: Field and Timestamp */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-xs font-medium">
                      {change.field_name}
                    </span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {format(new Date(change.created_at), 'MMM dd, yyyy HH:mm')}
                    </span>
                  </div>

                  {/* User */}
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {change.changed_by_name || 'Unknown'}
                    {change.change_reason && (
                      <span className="text-slate-500 dark:text-slate-400">
                        • {change.change_reason}
                      </span>
                    )}
                  </div>

                  {/* Values */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 text-xs">
                    {change.old_value !== null && (
                      <div>
                        <div className="font-medium text-slate-600 dark:text-slate-400">From:</div>
                        <div className="p-1.5 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-400 break-words">
                          {change.old_value.length > 100
                            ? `${change.old_value.substring(0, 100)}...`
                            : change.old_value}
                        </div>
                      </div>
                    )}
                    {change.new_value !== null && (
                      <div>
                        <div className="font-medium text-slate-600 dark:text-slate-400">To:</div>
                        <div className="p-1.5 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded text-green-700 dark:text-green-400 break-words">
                          {change.new_value.length > 100
                            ? `${change.new_value.substring(0, 100)}...`
                            : change.new_value}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Index */}
                <div className="text-xs text-muted-foreground font-bold">#{changes.length - idx}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Export Button */}
      {expanded && (
        <button
          onClick={async () => {
            const json = await AuditService.exportAuditTrail(taskId);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `audit-trail-${taskId}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          className="w-full py-2 px-4 bg-slate-600 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Export as JSON
        </button>
      )}
    </div>
  );
}

export default TaskAuditTrail;
