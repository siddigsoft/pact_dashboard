import { useMemo, useState } from 'react';
import { CheckCircle, Circle, ChevronDown, ChevronUp, ClipboardList, Loader2 } from 'lucide-react';
import { getProjectTypeConfig } from '@/config/projectTypeConfig';
import { getProjectFlow } from '@/config/projectFlows';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useProjectDeliverablesChecklist } from '@/hooks/useStageData';

interface ProjectDeliverablesChecklistProps {
  projectId: string;
  projectType: string;
  currentUserId?: string;
  canEdit?: boolean;
}

export function ProjectDeliverablesChecklist({
  projectId,
  projectType,
  currentUserId,
  canEdit = true,
}: ProjectDeliverablesChecklistProps) {
  const { toast } = useToast();
  const config = getProjectTypeConfig(projectType);
  const flow = getProjectFlow(projectType);

  const deliverableDefs = useMemo(() => {
    const stageByLabel = new Map(flow.stages.map(s => [s.label, s]));
    const firstStage = flow.stages[0];
    return config.deliverables.map(d => {
      const phase = d.phase ?? 'General';
      const stage = stageByLabel.get(phase) ?? firstStage;
      return {
        id: d.id,
        label: d.label,
        phase,
        stageId: stage?.id ?? 'planning',
        stageLabel: stage?.label ?? phase,
      };
    });
  }, [config.deliverables, flow.stages]);

  const { items, isLoading, toggleItem } = useProjectDeliverablesChecklist(projectId, deliverableDefs);

  const [collapsed, setCollapsed] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const toggle = async (id: string, completed: boolean) => {
    if (!canEdit || pendingId) return;
    setPendingId(id);
    try {
      await toggleItem(id, !completed, currentUserId);
    } catch {
      toast({ title: 'Failed to update deliverable', variant: 'destructive' });
    } finally {
      setPendingId(null);
    }
  };

  const completedCount = items.filter(i => i.completed).length;
  const totalCount = items.length;
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const phases = Array.from(new Set(items.map(d => d.phase))).filter(Boolean);

  if (deliverableDefs.length === 0) return null;

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
          {(isLoading || pendingId) && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
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
          <p className="text-xs text-muted-foreground -mt-1">
            Ticking a deliverable here also ticks it in that deliverable's stage checklist on the Stages tab, and vice versa.
          </p>
          {phases.map(phase => {
            const phaseDeliverables = items.filter(d => d.phase === phase);
            const phaseCompleted = phaseDeliverables.filter(d => d.completed).length;
            return (
              <div key={phase}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{phase}</span>
                  <span className="text-xs text-muted-foreground">({phaseCompleted}/{phaseDeliverables.length})</span>
                </div>
                <div className="space-y-1">
                  {phaseDeliverables.map(d => (
                    <button
                      key={d.deliverableId}
                      type="button"
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-colors text-sm ${
                        canEdit ? 'cursor-pointer hover:bg-muted/60' : 'cursor-default'
                      } ${d.completed ? 'text-muted-foreground' : 'text-foreground'}`}
                      onClick={() => toggle(d.id, d.completed)}
                      disabled={!canEdit || !!pendingId}
                      data-testid={`deliverable-${d.deliverableId}`}
                    >
                      {d.completed ? (
                        <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />
                      )}
                      <span className={d.completed ? 'line-through' : ''}>{d.label}</span>
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
