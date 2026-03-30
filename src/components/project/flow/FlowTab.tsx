import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  Circle,
  SkipForward,
  ChevronUp,
  ChevronDown,
  Settings2,
  ArrowRight,
  Clock,
  User,
  FileText,
  Loader2,
  AlertCircle,
  RotateCcw,
  ExternalLink,
  ListChecks,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import type { UseProjectFlowReturn, CustomStageEntry } from '@/hooks/useProjectFlow';
import type { FlowStage } from '@/config/projectFlows';

interface Props {
  flow: UseProjectFlowReturn;
  projectName: string;
  projectType: string;
  allDefaultStages: FlowStage[];
}

function formatTimestamp(iso: string) {
  try {
    return format(new Date(iso), 'dd MMM yyyy, HH:mm');
  } catch {
    return iso;
  }
}

export function FlowTab({ flow, projectName, projectType, allDefaultStages }: Props) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const {
    activeStages,
    currentStage,
    currentStageIndex,
    stageHistory,
    isLastStage,
    canAdvance,
    canEditFlow,
    isAdvancing,
    isSavingCustom,
    advanceStage,
    updateCustomStages,
    getStageStatus,
  } = flow;

  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [customEntries, setCustomEntries] = useState<CustomStageEntry[]>([]);

  useEffect(() => {
    if (editOpen) {
      const existingIds = new Set(
        flow.activeStages.map(s => s.id).concat(
          allDefaultStages.filter(s => getStageStatus(s.id) === 'skipped').map(s => s.id)
        )
      );
      // Build initial custom list from allDefaultStages, preserving current order & skips
      const initial = allDefaultStages.map(s => ({
        id: s.id,
        skipped: getStageStatus(s.id) === 'skipped',
      }));
      setCustomEntries(initial);
    }
  }, [editOpen]);

  const handleAdvance = async () => {
    try {
      await advanceStage(notes);
      toast({ title: 'Stage advanced successfully' });
      setAdvanceOpen(false);
      setNotes('');
    } catch (err: any) {
      toast({ title: 'Failed to advance stage', description: err.message, variant: 'destructive' });
    }
  };

  const handleSaveCustom = async () => {
    try {
      await updateCustomStages(customEntries);
      toast({ title: 'Flow configuration saved' });
      setEditOpen(false);
    } catch (err: any) {
      toast({ title: 'Failed to save', description: err.message, variant: 'destructive' });
    }
  };

  const handleResetCustom = async () => {
    try {
      await updateCustomStages([]);
      toast({ title: 'Flow reset to default' });
      setEditOpen(false);
    } catch (err: any) {
      toast({ title: 'Failed to reset', description: err.message, variant: 'destructive' });
    }
  };

  const moveEntry = (idx: number, direction: 'up' | 'down') => {
    const next = [...customEntries];
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= next.length) return;
    [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
    setCustomEntries(next);
  };

  const toggleSkip = (id: string) => {
    setCustomEntries(prev =>
      prev.map(e => (e.id === id ? { ...e, skipped: !e.skipped } : e)),
    );
  };

  const nextStage = !isLastStage ? activeStages[currentStageIndex + 1] : null;
  const completedCount = activeStages.filter((_, i) => i < currentStageIndex).length;
  const pct = Math.round(((currentStageIndex + 1) / activeStages.length) * 100);

  return (
    <div className="space-y-6">
      {/* Header: progress + actions */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Project Flow</h2>
          <p className="text-sm text-muted-foreground">
            {projectType} · Stage {currentStageIndex + 1} of {activeStages.length} · {pct}% complete
          </p>
        </div>
        <div className="flex gap-2">
          {canEditFlow && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditOpen(true)}
              data-testid="button-edit-flow"
            >
              <Settings2 className="h-3.5 w-3.5 mr-1.5" /> Edit Flow
            </Button>
          )}
          {canAdvance && (
            <Button
              size="sm"
              onClick={() => setAdvanceOpen(true)}
              data-testid="button-advance-stage"
            >
              <ArrowRight className="h-3.5 w-3.5 mr-1.5" /> Advance Stage
            </Button>
          )}
          {isLastStage && (
            <Badge className="bg-emerald-500 text-white hover:bg-emerald-600 self-center">
              <CheckCircle2 className="h-3 w-3 mr-1" /> All Stages Complete
            </Badge>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full rounded-full bg-muted h-2 overflow-hidden">
        <div
          className="h-full rounded-full bg-[#1D3461] transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Stage cards list */}
      <div className="space-y-3">
        {allDefaultStages.map((stage, idx) => {
          const status = getStageStatus(stage.id);
          const historyEntry = stageHistory.filter(h => h.stageId === stage.id).at(-1);

          return (
            <div
              key={stage.id}
              className={cn(
                'rounded-lg border p-4 transition-all',
                status === 'current' && 'border-[#1D3461]/50 bg-[#0F2041]/5 dark:bg-[#1D3461]/10',
                status === 'completed' && 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10',
                status === 'skipped' && 'border-dashed border-muted-foreground/20 bg-muted/30 opacity-60',
                status === 'upcoming' && 'border-border bg-background',
              )}
              data-testid={`flow-stage-${stage.id}`}
            >
              <div className="flex items-start gap-3">
                {/* Status icon */}
                <div
                  className={cn(
                    'h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 border-2 mt-0.5',
                    status === 'completed' && 'border-emerald-500 bg-emerald-500 text-white',
                    status === 'current' && 'border-[#1D3461] bg-[#1D3461] text-white',
                    status === 'skipped' && 'border-muted-foreground/30 bg-muted text-muted-foreground/50',
                    status === 'upcoming' && 'border-border bg-background text-muted-foreground',
                  )}
                >
                  {status === 'completed' ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : status === 'skipped' ? (
                    <SkipForward className="h-4 w-4" />
                  ) : status === 'current' ? (
                    <Circle className="h-4 w-4" />
                  ) : (
                    <span className="text-xs font-bold">{idx + 1}</span>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={cn(
                        'font-medium text-sm',
                        status === 'skipped' && 'line-through text-muted-foreground',
                      )}
                    >
                      {stage.label}
                    </span>
                    {status === 'current' && (
                      <Badge className="bg-[#1D3461] text-white text-[10px] px-1.5 py-0">
                        Current
                      </Badge>
                    )}
                    {status === 'completed' && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 border-emerald-300 text-emerald-700 dark:text-emerald-400"
                      >
                        Completed
                      </Badge>
                    )}
                    {status === 'skipped' && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        Skipped
                      </Badge>
                    )}
                  </div>

                  {stage.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      {stage.description}
                    </p>
                  )}

                  {/* Key outputs checklist */}
                  {stage.keyOutputs && stage.keyOutputs.length > 0 && (
                    <div className="mt-2.5">
                      <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-1">
                        <ListChecks className="h-3 w-3" />
                        Key Outputs
                      </div>
                      <ul className="space-y-0.5">
                        {stage.keyOutputs.map((output, oIdx) => (
                          <li key={oIdx} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            <CheckCircle2
                              className={cn(
                                'h-3 w-3 flex-shrink-0 mt-0.5',
                                status === 'completed' ? 'text-emerald-500' : 'text-border',
                              )}
                            />
                            <span>{output}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Go to linked module */}
                  {stage.linkedModule && (status === 'current' || status === 'completed') && (
                    <div className="mt-2.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs px-2.5"
                        onClick={() => navigate(stage.linkedModule!)}
                        data-testid={`button-goto-module-${stage.id}`}
                      >
                        <ExternalLink className="h-3 w-3 mr-1.5" />
                        Go to {stage.linkedModule.replace('/', '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </Button>
                    </div>
                  )}

                  {/* History entry */}
                  {historyEntry && (
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTimestamp(historyEntry.advancedAt)}
                      </span>
                      {historyEntry.advancedByName && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {historyEntry.advancedByName}
                        </span>
                      )}
                      {historyEntry.notes && (
                        <span className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {historyEntry.notes}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Advance stage dialog */}
      <Dialog open={advanceOpen} onOpenChange={setAdvanceOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Advance to Next Stage</DialogTitle>
            <DialogDescription>
              You are advancing <strong>{projectName}</strong> from{' '}
              <strong>{currentStage?.label}</strong> to{' '}
              <strong>{nextStage?.label}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="advance-notes">Notes (optional)</Label>
            <Textarea
              id="advance-notes"
              placeholder="Add any notes about this stage transition..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              data-testid="input-advance-notes"
            />
            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              All team members will be notified of this stage advance.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdvanceOpen(false)} disabled={isAdvancing}>
              Cancel
            </Button>
            <Button onClick={handleAdvance} disabled={isAdvancing} data-testid="button-confirm-advance">
              {isAdvancing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Advancing...
                </>
              ) : (
                <>
                  <ArrowRight className="h-3.5 w-3.5 mr-1.5" /> Confirm Advance
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit flow dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit Project Flow</DialogTitle>
            <DialogDescription>
              Reorder stages or mark stages as skipped for <strong>{projectName}</strong>.
              This only affects this project.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-2 py-2">
            {customEntries.map((entry, idx) => {
              const stageDef = allDefaultStages.find(s => s.id === entry.id);
              if (!stageDef) return null;
              return (
                <div
                  key={entry.id}
                  className={cn(
                    'flex items-center gap-3 rounded-md border p-3',
                    entry.skipped && 'opacity-50',
                  )}
                >
                  {/* Reorder buttons */}
                  <div className="flex flex-col gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      disabled={idx === 0}
                      onClick={() => moveEntry(idx, 'up')}
                      data-testid={`button-move-up-${entry.id}`}
                    >
                      <ChevronUp className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      disabled={idx === customEntries.length - 1}
                      onClick={() => moveEntry(idx, 'down')}
                      data-testid={`button-move-down-${entry.id}`}
                    >
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </div>

                  {/* Stage info */}
                  <div className="flex-1 min-w-0">
                    <span
                      className={cn(
                        'text-sm font-medium',
                        entry.skipped && 'line-through text-muted-foreground',
                      )}
                    >
                      {stageDef.label}
                    </span>
                    {stageDef.description && (
                      <p className="text-xs text-muted-foreground truncate">
                        {stageDef.description}
                      </p>
                    )}
                  </div>

                  {/* Skip toggle */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Label htmlFor={`skip-${entry.id}`} className="text-xs text-muted-foreground">
                      Skip
                    </Label>
                    <Switch
                      id={`skip-${entry.id}`}
                      checked={entry.skipped ?? false}
                      onCheckedChange={() => toggleSkip(entry.id)}
                      data-testid={`switch-skip-${entry.id}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <Separator />

          <DialogFooter className="flex-shrink-0 gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground mr-auto"
              onClick={handleResetCustom}
              disabled={isSavingCustom}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset to Default
            </Button>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={isSavingCustom}>
              Cancel
            </Button>
            <Button onClick={handleSaveCustom} disabled={isSavingCustom} data-testid="button-save-flow">
              {isSavingCustom ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Saving...
                </>
              ) : (
                'Save Flow'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
