import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Clock3, FileText, RefreshCw, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import type { TabProps } from './types';

type AuditEvent = {
  id: string;
  table_name: string;
  event_type: 'insert' | 'update' | 'delete';
  entity_id: string;
  target: string;
  actor_name: string;
  actor_role: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  created_at: string;
};

const TABLE_LABELS: Record<string, string> = {
  page_access_overrides: 'Page access',
  user_permission_overrides: 'Action access',
  canonical_user_role_assignments: 'Role assignment',
  page_role_configs: 'Role page default',
  column_visibility_config: 'Column visibility',
  data_scope_config: 'Data scope',
};

const EVENT_STYLE: Record<AuditEvent['event_type'], string> = {
  insert: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300',
  update: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300',
  delete: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300',
};

function formatEventTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(value));
}

function describeEvent(event: AuditEvent) {
  const state = event.after_state ?? event.before_state ?? {};
  const page = typeof state.page_slug === 'string' ? state.page_slug : null;
  const resource = typeof state.resource === 'string' ? state.resource : null;
  const action = typeof state.action === 'string' ? state.action : null;
  const role = typeof state.role === 'string' ? state.role : null;
  const column = typeof state.column_key === 'string' ? state.column_key : null;

  if (page) return page;
  if (resource && action) return `${action} on ${resource}`;
  if (column) return column;
  if (role) return role;
  return event.entity_id;
}

/** Read-only history for changes that affect the selected user's access. */
export function AccessAuditTab({ userId, userName }: TabProps) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await (supabase as any)
      .from('access_control_audit_events')
      .select('id, table_name, event_type, entity_id, target, actor_name, actor_role, before_state, after_state, created_at')
      .eq('target', userId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('[AccessAuditTab] audit event load failed:', error);
      setError('Audit history could not be loaded. Confirm your role can manage access and that the audit migration is deployed.');
      setEvents([]);
    } else {
      setEvents((data ?? []) as AuditEvent[]);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-5">
      <div className="mb-4 flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Access Audit</h2>
            <Badge variant="outline" className="text-[10px] font-medium">Read only</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Changes made to {userName}'s individual access, newest first. Role-wide policy changes are recorded separately and are not attributed to each user.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map(item => <div key={item} className="h-16 animate-pulse rounded-lg bg-muted" />)}
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center text-muted-foreground">
          <Clock3 className="mb-3 h-8 w-8 opacity-40" />
          <p className="text-sm font-medium">No individual access changes yet</p>
          <p className="mt-1 max-w-sm text-xs">New page, action, scope, column, and role-assignment changes will appear here.</p>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1 pr-3">
          <ol className="space-y-2">
            {events.map(event => (
              <li key={event.id} className="rounded-lg border border-border/60 bg-card px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={cn('border text-[10px] capitalize', EVENT_STYLE[event.event_type])}>
                    {event.event_type}
                  </Badge>
                  <span className="text-xs font-medium">{TABLE_LABELS[event.table_name] ?? event.table_name}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground" title={describeEvent(event)}>
                    {describeEvent(event)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><UserRound className="h-3 w-3" />{event.actor_name}{event.actor_role ? ` · ${event.actor_role}` : ''}</span>
                  <time dateTime={event.created_at}>{formatEventTime(event.created_at)}</time>
                </div>
              </li>
            ))}
          </ol>
        </ScrollArea>
      )}
    </div>
  );
}
