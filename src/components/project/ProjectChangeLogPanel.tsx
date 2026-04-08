
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, isValid } from 'date-fns';
import { History, RefreshCw, Loader2, GitBranch, Edit, Plus, Trash2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ChangeEntry {
  id: string;
  project_id: string;
  changed_by: string | null;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  change_type: string;
  notes: string | null;
  created_at: string;
  changer_name?: string;
}

interface Props { projectId: string; }

const CHANGE_TYPE_CFG: Record<string, { label: string; icon: typeof Edit; color: string }> = {
  create:       { label: 'Created',      icon: Plus,      color: 'text-emerald-600' },
  update:       { label: 'Updated',      icon: Edit,      color: 'text-blue-600' },
  delete:       { label: 'Deleted',      icon: Trash2,    color: 'text-red-600' },
  stage_advance:{ label: 'Stage Advance',icon: GitBranch, color: 'text-purple-600' },
  status_change:{ label: 'Status Change',icon: ArrowRight,color: 'text-amber-600' },
};

function formatFieldName(field: string) {
  return field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

export default function ProjectChangeLogPanel({ projectId }: Props) {
  const [entries, setEntries] = useState<ChangeEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('project_change_log')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(200);

    const changerIds = [...new Set((data || []).map((e: any) => e.changed_by).filter(Boolean))];
    let profileMap: Record<string, string> = {};
    if (changerIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', changerIds);
      (profiles || []).forEach((p: any) => { profileMap[p.id] = p.full_name; });
    }
    setEntries((data || []).map((e: any) => ({ ...e, changer_name: e.changed_by ? profileMap[e.changed_by] : null })));
    setLoading(false);
  };

  useEffect(() => { load(); }, [projectId]);

  // Group by date
  const grouped: Record<string, ChangeEntry[]> = {};
  entries.forEach(e => {
    const date = isValid(parseISO(e.created_at)) ? format(parseISO(e.created_at), 'dd MMM yyyy') : 'Unknown Date';
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(e);
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <History className="h-4 w-4 text-gray-600 dark:text-gray-400" />
          </div>
          <div>
            <h2 className="text-base font-bold">Change Log</h2>
            <p className="text-xs text-muted-foreground">{entries.length} change{entries.length !== 1 ? 's' : ''} recorded</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-muted-foreground">
          <History className="h-12 w-12 mb-3 opacity-30" />
          <p className="font-medium">No changes recorded yet</p>
          <p className="text-sm mt-1">Project edits will appear here automatically</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([date, dayEntries]) => (
            <div key={date}>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-semibold text-muted-foreground px-2">{date}</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="space-y-2">
                {dayEntries.map(entry => {
                  const typeCfg = CHANGE_TYPE_CFG[entry.change_type] ?? CHANGE_TYPE_CFG.update;
                  const TypeIcon = typeCfg.icon;
                  return (
                    <div key={entry.id} className="flex items-start gap-3 p-3 bg-card border rounded-xl hover:shadow-sm transition-all">
                      <div className={cn('w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0', typeCfg.color)}>
                        <TypeIcon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">
                            {formatFieldName(entry.field_name)}
                          </span>
                          <Badge variant="outline" className="text-[10px] px-2">{typeCfg.label}</Badge>
                        </div>
                        {(entry.old_value || entry.new_value) && (
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                            {entry.old_value && (
                              <span className="line-through opacity-60 max-w-[200px] truncate">{entry.old_value}</span>
                            )}
                            {entry.old_value && entry.new_value && <ArrowRight className="h-3 w-3 shrink-0" />}
                            {entry.new_value && (
                              <span className="font-medium text-foreground max-w-[200px] truncate">{entry.new_value}</span>
                            )}
                          </div>
                        )}
                        {entry.notes && (
                          <p className="text-xs text-muted-foreground/70 mt-0.5">{entry.notes}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                          {entry.changer_name && (
                            <span className="text-[11px] text-muted-foreground font-medium">{entry.changer_name}</span>
                          )}
                          <span className="text-[11px] text-muted-foreground/60">
                            {isValid(parseISO(entry.created_at)) ? format(parseISO(entry.created_at), 'HH:mm') : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
