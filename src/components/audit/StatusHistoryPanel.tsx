import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import {
  History,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  MessageSquare,
  AlertTriangle,
} from 'lucide-react';
import { getRejectionReasonLabel } from '@/config/rejectionReasons';
import type { WorkflowType } from '@/config/rejectionReasons';

interface StatusHistoryEntry {
  id: string;
  actorName: string;
  actorRole: string;
  timestamp: string;
  action: string;
  previousState?: string;
  newState?: string;
  reason?: string;
  comment?: string;
  description: string;
}

interface StatusHistoryPanelProps {
  entityType: string;
  entityId: string;
  workflowType?: WorkflowType;
  defaultOpen?: boolean;
  className?: string;
}

function getActionIcon(action: string) {
  const a = action.toLowerCase();
  if (a === 'approve' || a === 'approved') return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  if (a === 'reject' || a === 'rejected') return <XCircle className="h-4 w-4 text-red-600" />;
  if (a === 'submit' || a === 'submitted') return <Clock className="h-4 w-4 text-blue-600" />;
  return <History className="h-4 w-4 text-muted-foreground" />;
}

function getActionBadge(action: string, newState?: string) {
  const a = (action || '').toLowerCase();
  const s = (newState || '').toLowerCase();
  if (a === 'approve' || s === 'approved' || s === 'supervisor_approved') {
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-xs">Approved</Badge>;
  }
  if (a === 'reject' || s === 'rejected') {
    return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 text-xs">Rejected</Badge>;
  }
  if (s === 'pending') {
    return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-xs">Pending</Badge>;
  }
  if (s === 'completed' || s === 'complete') {
    return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 text-xs">Completed</Badge>;
  }
  const label = newState
    ? newState.charAt(0).toUpperCase() + newState.slice(1).replace(/_/g, ' ')
    : action.charAt(0).toUpperCase() + action.slice(1);
  return <Badge variant="outline" className="text-xs">{label}</Badge>;
}

export function StatusHistoryPanel({
  entityType,
  entityId,
  workflowType = 'general',
  defaultOpen = false,
  className = '',
}: StatusHistoryPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [entries, setEntries] = useState<StatusHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (open && !loaded) {
      loadHistory();
    }
  }, [open]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      // Build flexible entity type variants to handle mixed naming patterns (e.g., "mmp" vs "mmp_file")
      const entityTypeVariants = [entityType];
      if (entityType === 'mmp') entityTypeVariants.push('mmp_file', 'mmp_files');
      if (entityType === 'site_visit') entityTypeVariants.push('siteVisit', 'site_visits');
      if (entityType === 'cost_submission') entityTypeVariants.push('operationalCost', 'operational_cost');
      if (entityType === 'withdrawal') entityTypeVariants.push('withdrawal_request', 'withdrawal_requests');
      if (entityType === 'wallet') entityTypeVariants.push('payment', 'payments');

      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, actor_name, actor_role, timestamp, action, previous_state, new_state, metadata, description, details')
        .in('entity_type', entityTypeVariants)
        .eq('entity_id', entityId)
        .order('timestamp', { ascending: false })
        .limit(50);

      if (error) throw error;

      interface AuditLogRow {
        id: string;
        actor_name: string | null;
        actor_role: string | null;
        timestamp: string;
        action: string;
        previous_state: string | Record<string, unknown> | null;
        new_state: string | Record<string, unknown> | null;
        metadata: Record<string, unknown> | null;
        description: string | null;
        details: string | null;
      }

      const extractState = (state: string | Record<string, unknown> | null): string | undefined => {
        if (!state) return undefined;
        if (typeof state === 'string') return state;
        if (typeof state === 'object' && 'status' in state && typeof state.status === 'string') return state.status;
        return undefined;
      };

      const mapped: StatusHistoryEntry[] = ((data || []) as AuditLogRow[]).map((row) => {
        const meta = (row.metadata || {}) as Record<string, unknown>;
        const getString = (key: string): string | undefined => {
          const val = meta[key];
          return typeof val === 'string' ? val : undefined;
        };
        const prevState = extractState(row.previous_state) ?? getString('previousStatus') ?? getString('from_status');
        const newState = extractState(row.new_state) ?? getString('newStatus') ?? getString('to_status') ?? getString('status');
        return {
          id: row.id,
          actorName: row.actor_name || 'Unknown',
          actorRole: row.actor_role || '',
          timestamp: row.timestamp,
          action: row.action,
          previousState: prevState,
          newState: newState,
          reason: getString('reason') ?? getString('rejectionReason') ?? getString('rejection_reason'),
          comment: getString('comment') ?? getString('notes') ?? (row.details ?? undefined),
          description: row.description || '',
        };
      });

      setEntries(mapped);
    } catch (err) {
      console.error('[StatusHistoryPanel] Failed to load history:', err);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={className}>
      <Card className="border-border/60">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors rounded-t-lg pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                <span>Status History</span>
                {loaded && entries.length > 0 && (
                  <Badge variant="outline" className="text-xs ml-1">{entries.length}</Badge>
                )}
              </div>
              {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 pb-4">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : entries.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <History className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No status history recorded yet.</p>
              </div>
            ) : (
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
                <div className="space-y-4 pl-10">
                  {entries.map((entry, idx) => (
                    <div key={entry.id} className="relative">
                      <div className="absolute -left-[34px] p-1.5 rounded-full bg-background border border-border">
                        {getActionIcon(entry.action)}
                      </div>
                      <div className="bg-muted/30 rounded-lg p-3 space-y-1.5 border border-border/40">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            {getActionBadge(entry.action, entry.newState)}
                            {entry.previousState && entry.newState && entry.previousState !== entry.newState && (
                              <span className="text-xs text-muted-foreground">
                                {entry.previousState.replace(/_/g, ' ')} → {entry.newState.replace(/_/g, ' ')}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {format(new Date(entry.timestamp), 'MMM d, yyyy HH:mm')}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <User className="h-3 w-3" />
                          <span className="font-medium text-foreground">{entry.actorName}</span>
                          {entry.actorRole && (
                            <Badge variant="outline" className="text-xs px-1 py-0">{entry.actorRole}</Badge>
                          )}
                        </div>

                        {entry.reason && (
                          <div className="flex items-start gap-1.5 text-xs">
                            <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 flex-shrink-0" />
                            <span className="font-medium">Reason:</span>
                            <span className="text-muted-foreground">{getRejectionReasonLabel(entry.reason, workflowType)}</span>
                          </div>
                        )}

                        {entry.comment && (
                          <div className="flex items-start gap-1.5 text-xs">
                            <MessageSquare className="h-3 w-3 text-blue-500 mt-0.5 flex-shrink-0" />
                            <span className="italic text-muted-foreground">"{entry.comment}"</span>
                          </div>
                        )}

                        {!entry.reason && !entry.comment && entry.description && (
                          <p className="text-xs text-muted-foreground">{entry.description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
