import { useState, useCallback } from 'react';
import { CheckCircle, Circle, ChevronDown, ChevronUp, ClipboardList, Loader2 } from 'lucide-react';
import { getProjectTypeConfig } from '@/config/projectTypeConfig';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

interface ProjectDeliverablesChecklistProps {
  projectId: string;
  projectType: string;
  initialState?: Record<string, boolean>;
  currentTeam?: Record<string, unknown>;
  canEdit?: boolean;
}

export function ProjectDeliverablesChecklist({
  projectId,
  projectType,
  initialState,
  currentTeam,
  canEdit = true,
}: ProjectDeliverablesChecklistProps) {
  const config = getProjectTypeConfig(projectType);
  const deliverables = config.deliverables;

  const [checked, setChecked] = useState<Record<string, boolean>>(initialState ?? {});
  const [collapsed, setCollapsed] = useState(false);
  const [saving, setSaving] = useState(false);

  const toggle = useCallback(async (id: string) => {
    if (!canEdit || saving) return;
    const prev = checked;
    const next = { ...checked, [id]: !checked[id] };
    setChecked(next);
    setSaving(true);
    try {
      const updatedTeam = { ...(currentTeam ?? {}), deliverablesState: next };
      const { error } = await supabase
        .from('projects')
        .update({ team: updatedTeam, updated_at: new Date().toISOString() })
        .eq('id', projectId);
      if (error) {
        setChecked(prev);
      }
    } catch {
      setChecked(prev);
    } finally {
      setSaving(false);
    }
  }, [canEdit, saving, checked, projectId, currentTeam]);

  const completedCount = deliverables.filter(d => checked[d.id]).length;
  const totalCount = deliverables.length;
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const phases = Array.from(new Set(deliverables.map(d => d.phase ?? 'General'))).filter(Boolean);

  if (deliverables.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        onClick={() => setCollapsed(v => !v)}
        data-testid="button-toggle-deliverables"
      >
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">Required Deliverables</span>
          <Badge variant={pct === 100 ? 'default' : 'secondary'} className="text-xs px-2 py-0">
            {completedCount}/{totalCount}
          </Badge>
          {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">{pct}%</span>
          </div>
          {collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-4">
          {phases.map(phase => {
            const phaseDeliverables = deliverables.filter(d => (d.phase ?? 'General') === phase);
            const phaseCompleted = phaseDeliverables.filter(d => checked[d.id]).length;
            return (
              <div key={phase}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{phase}</span>
                  <span className="text-xs text-muted-foreground">({phaseCompleted}/{phaseDeliverables.length})</span>
                </div>
                <div className="space-y-1">
                  {phaseDeliverables.map(d => (
                    <button
                      key={d.id}
                      type="button"
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-colors text-sm ${
                        canEdit ? 'cursor-pointer hover:bg-muted/60' : 'cursor-default'
                      } ${checked[d.id] ? 'text-muted-foreground' : 'text-foreground'}`}
                      onClick={() => toggle(d.id)}
                      disabled={!canEdit || saving}
                      data-testid={`deliverable-${d.id}`}
                    >
                      {checked[d.id] ? (
                        <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />
                      )}
                      <span className={checked[d.id] ? 'line-through' : ''}>{d.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
