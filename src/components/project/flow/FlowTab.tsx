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
  ChevronDown as ExpandIcon,
  ChevronUp as CollapseIcon,
  Flag,
  TrendingUp,
  Layers,
  CheckSquare,
  GripVertical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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
import { format, formatDistanceToNow } from 'date-fns';
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

function timeAgo(iso: string) {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return '';
  }
}

const STATUS_CFG = {
  completed: {
    border: 'border-l-emerald-500',
    bg: 'bg-emerald-50/60 dark:bg-emerald-900/10',
    ring: 'border-emerald-200 dark:border-emerald-800',
    icon: 'bg-emerald-500 text-white border-emerald-500',
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    dot: 'bg-emerald-500',
    label: 'Completed',
  },
  current: {
    border: 'border-l-[#1D3461]',
    bg: 'bg-[#0F2041]/5 dark:bg-[#1D3461]/10',
    ring: 'border-[#1D3461]/40 dark:border-[#1D3461]/60',
    icon: 'bg-[#1D3461] text-white border-[#1D3461]',
    badge: 'bg-[#1D3461]/10 text-[#1D3461] dark:bg-[#1D3461]/30 dark:text-blue-300',
    dot: 'bg-[#1D3461]',
    label: 'In Progress',
  },
  skipped: {
    border: 'border-l-slate-300',
    bg: 'bg-slate-50/40 dark:bg-slate-800/10',
    ring: 'border-dashed border-slate-200 dark:border-slate-700',
    icon: 'bg-slate-100 text-slate-400 border-slate-300 dark:bg-slate-800',
    badge: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
    dot: 'bg-slate-300',
    label: 'Skipped',
  },
  upcoming: {
    border: 'border-l-slate-200',
    bg: 'bg-background',
    ring: 'border-border',
    icon: 'bg-background text-muted-foreground border-border',
    badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    dot: 'bg-slate-200',
    label: 'Upcoming',
  },
};

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

  const [editOpen, setEditOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [customEntries, setCustomEntries] = useState<CustomStageEntry[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (editOpen) {
      const initial = allDefaultStages.map(s => ({
        id: s.id,
        skipped: getStageStatus(s.id) === 'skipped',
      }));
      setCustomEntries(initial);
    }
  }, [editOpen]);

  // Auto-expand current stage
  useEffect(() => {
    if (currentStage) {
      setExpandedIds(prev => new Set([...prev, currentStage.id]));
    }
  }, [currentStage?.id]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleAdvance = async () => {
    try {
      await advanceStage(notes);
      toast({ title: 'Stage advanced', description: 'Team has been notified.' });
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
  const pct = Math.round(((currentStageIndex + 1) / activeStages.length) * 100);
  const completedCount = allDefaultStages.filter(s => getStageStatus(s.id) === 'completed').length;
  const skippedCount = allDefaultStages.filter(s => getStageStatus(s.id) === 'skipped').length;
  const remainingCount = allDefaultStages.length - completedCount - skippedCount - 1;

  return (
    <div className="space-y-5">

      {/* ── KPI stat cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-0 shadow-sm bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Layers className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-xs text-muted-foreground font-medium">Total Stages</span>
            </div>
            <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{allDefaultStages.length}</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-900/20 dark:to-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckSquare className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-xs text-muted-foreground font-medium">Completed</span>
            </div>
            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{completedCount}</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-50 to-white dark:from-blue-900/20 dark:to-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Flag className="h-3.5 w-3.5 text-[#1D3461]" />
              <span className="text-xs text-muted-foreground font-medium">Active Stage</span>
            </div>
            <p className="text-sm font-bold text-[#1D3461] dark:text-blue-300 leading-tight line-clamp-2">
              {currentStage?.label ?? '—'}
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-gradient-to-br from-amber-50 to-white dark:from-amber-900/20 dark:to-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-3.5 w-3.5 text-amber-600" />
              <span className="text-xs text-muted-foreground font-medium">Progress</span>
            </div>
            <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{pct}%</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Progress bar + header actions ──────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">
              Stage <span className="font-semibold text-foreground">{currentStageIndex + 1}</span> of {activeStages.length}
            </span>
            {isLastStage && (
              <Badge className="bg-emerald-500 text-white hover:bg-emerald-600 text-[10px] px-2 py-0.5">
                <CheckCircle2 className="h-2.5 w-2.5 mr-1" /> All Stages Complete
              </Badge>
            )}
            {skippedCount > 0 && (
              <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
                {skippedCount} skipped
              </Badge>
            )}
          </div>
          {canEditFlow && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditOpen(true)}
              className="h-7 text-xs px-3 shrink-0"
              data-testid="button-edit-flow"
            >
              <Settings2 className="h-3 w-3 mr-1.5" /> Edit Flow
            </Button>
          )}
        </div>

        <div className="w-full rounded-full bg-muted h-2.5 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#0F2041] to-[#1D3461] transition-all duration-700 ease-in-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground px-0.5">
          <span>{completedCount} done</span>
          <span>{Math.max(0, remainingCount)} remaining</span>
        </div>
      </div>

      {/* ── Stage cards ────────────────────────────────────────── */}
      <div className="space-y-2.5">
        {allDefaultStages.map((stage, idx) => {
          const status = getStageStatus(stage.id);
          const cfg = STATUS_CFG[status];
          const historyEntry = stageHistory.filter(h => h.stageId === stage.id).at(-1);
          const isCurrent = status === 'current';
          const isExpanded = expandedIds.has(stage.id);
          const hasDetails = (stage.keyOutputs?.length ?? 0) > 0 || !!stage.linkedModule || !!stage.description;

          return (
            <div
              key={stage.id}
              className={cn(
                'rounded-xl border border-l-4 transition-all duration-200',
                cfg.border,
                cfg.ring,
                cfg.bg,
                isCurrent && 'shadow-sm',
                status === 'skipped' && 'opacity-60',
              )}
              data-testid={`flow-stage-${stage.id}`}
            >
              {/* Card header row — always visible */}
              <button
                type="button"
                className="w-full text-left"
                onClick={() => hasDetails || isCurrent ? toggleExpand(stage.id) : undefined}
              >
                <div className="flex items-center gap-3 px-4 py-3.5">
                  {/* Status icon */}
                  <div
                    className={cn(
                      'h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all',
                      cfg.icon,
                      isCurrent && 'ring-2 ring-[#1D3461]/20 ring-offset-1',
                    )}
                  >
                    {status === 'completed' ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : status === 'skipped' ? (
                      <SkipForward className="h-3.5 w-3.5" />
                    ) : isCurrent ? (
                      <span className="h-2.5 w-2.5 rounded-full bg-white animate-pulse" />
                    ) : (
                      <span className="text-[11px] font-bold">{idx + 1}</span>
                    )}
                  </div>

                  {/* Stage name + meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={cn(
                          'font-semibold text-sm leading-snug',
                          status === 'skipped' && 'line-through text-muted-foreground',
                          isCurrent && 'text-[#1D3461] dark:text-blue-200',
                        )}
                      >
                        {stage.label}
                      </span>
                      <span
                        className={cn(
                          'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                          cfg.badge,
                        )}
                      >
                        {cfg.label}
                      </span>
                    </div>

                    {historyEntry && (
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                        <Clock className="h-3 w-3 flex-shrink-0" />
                        <span>{timeAgo(historyEntry.advancedAt)}</span>
                        {historyEntry.advancedByName && (
                          <>
                            <span className="text-muted-foreground/40">·</span>
                            <User className="h-3 w-3 flex-shrink-0" />
                            <span>{historyEntry.advancedByName}</span>
                          </>
                        )}
                      </div>
                    )}

                    {!historyEntry && stage.description && !isExpanded && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        {stage.description}
                      </p>
                    )}
                  </div>

                  {/* Expand chevron */}
                  {(hasDetails || isCurrent) && (
                    <div className="flex-shrink-0 text-muted-foreground/60">
                      {isExpanded
                        ? <CollapseIcon className="h-4 w-4" />
                        : <ExpandIcon className="h-4 w-4" />}
                    </div>
                  )}
                </div>
              </button>

              {/* Expanded detail panel */}
              {isExpanded && (
                <div className="px-4 pb-4 space-y-4 border-t border-border/50">
                  {/* Full description */}
                  {stage.description && (
                    <p className="text-sm text-muted-foreground pt-3 leading-relaxed">
                      {stage.description}
                    </p>
                  )}

                  {/* Full history record */}
                  {historyEntry && (
                    <div className="rounded-lg bg-muted/40 px-3 py-2.5 space-y-1.5">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                        Completion Record
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
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
                          <span className="flex items-start gap-1">
                            <FileText className="h-3 w-3 mt-0.5 flex-shrink-0" />
                            {historyEntry.notes}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Key outputs */}
                  {stage.keyOutputs && stage.keyOutputs.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        <ListChecks className="h-3.5 w-3.5" />
                        Key Outputs
                      </div>
                      <ul className="space-y-1.5">
                        {stage.keyOutputs.map((output, oIdx) => (
                          <li key={oIdx} className="flex items-start gap-2 text-sm text-muted-foreground">
                            <CheckCircle2
                              className={cn(
                                'h-3.5 w-3.5 flex-shrink-0 mt-0.5',
                                status === 'completed' ? 'text-emerald-500' : 'text-muted-foreground/30',
                              )}
                            />
                            <span>{output}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Linked module button */}
                  {stage.linkedModule && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => navigate(stage.linkedModule!)}
                      data-testid={`button-goto-module-${stage.id}`}
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                      Go to {stage.linkedModule.replace('/', '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </Button>
                  )}

                  {/* ── Advance controls (current stage only) ── */}
                  {isCurrent && canAdvance && nextStage && (
                    <div className="rounded-xl border border-[#1D3461]/20 bg-[#0F2041]/5 dark:bg-[#1D3461]/10 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <ArrowRight className="h-4 w-4 text-[#1D3461]" />
                        <p className="text-sm font-semibold text-[#1D3461] dark:text-blue-200">
                          Advance to: <span className="font-bold">{nextStage.label}</span>
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor={`advance-notes-${stage.id}`} className="text-xs font-medium text-muted-foreground">
                          Transition notes (optional)
                        </Label>
                        <Textarea
                          id={`advance-notes-${stage.id}`}
                          placeholder="What was achieved in this stage? Any handoff notes..."
                          value={notes}
                          onChange={e => setNotes(e.target.value)}
                          rows={2}
                          className="text-sm resize-none"
                          data-testid="input-advance-notes"
                        />
                      </div>

                      <div className="flex items-center gap-3">
                        <Button
                          size="sm"
                          onClick={handleAdvance}
                          disabled={isAdvancing}
                          className="bg-[#1D3461] hover:bg-[#0F2041] text-white"
                          data-testid="button-confirm-advance"
                        >
                          {isAdvancing ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Advancing…
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Mark Complete & Advance
                            </>
                          )}
                        </Button>
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <AlertCircle className="h-3 w-3 flex-shrink-0" />
                          Team will be notified
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Final stage message */}
                  {isCurrent && isLastStage && (
                    <div className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-4 py-3">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                      <p className="text-sm text-emerald-800 dark:text-emerald-300 font-medium">
                        This is the final stage — all stages are complete!
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Edit Flow Dialog ────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-[#1D3461]" />
              Edit Project Flow
            </DialogTitle>
            <DialogDescription>
              Reorder or skip stages for <strong>{projectName}</strong>. Changes only affect this project.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-2 py-2 pr-1">
            {customEntries.map((entry, idx) => {
              const stageDef = allDefaultStages.find(s => s.id === entry.id);
              if (!stageDef) return null;
              return (
                <div
                  key={entry.id}
                  className={cn(
                    'flex items-center gap-2 rounded-xl border p-3 transition-colors',
                    entry.skipped
                      ? 'bg-slate-50 dark:bg-slate-800/30 border-dashed border-slate-200 dark:border-slate-700 opacity-60'
                      : 'bg-white dark:bg-slate-900 border-border hover:border-[#1D3461]/30',
                  )}
                >
                  {/* Stage number */}
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-muted-foreground">{idx + 1}</span>
                  </div>

                  {/* Reorder buttons */}
                  <div className="flex flex-col gap-0.5 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-muted-foreground hover:text-foreground"
                      disabled={idx === 0}
                      onClick={() => moveEntry(idx, 'up')}
                      data-testid={`button-move-up-${entry.id}`}
                    >
                      <ChevronUp className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-muted-foreground hover:text-foreground"
                      disabled={idx === customEntries.length - 1}
                      onClick={() => moveEntry(idx, 'down')}
                      data-testid={`button-move-down-${entry.id}`}
                    >
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </div>

                  {/* Stage info */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        'text-sm font-medium',
                        entry.skipped && 'line-through text-muted-foreground',
                      )}
                    >
                      {stageDef.label}
                    </p>
                    {stageDef.description && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {stageDef.description}
                      </p>
                    )}
                  </div>

                  {/* Skip toggle */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Label htmlFor={`skip-${entry.id}`} className="text-xs text-muted-foreground cursor-pointer">
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

          <DialogFooter className="flex-shrink-0 pt-3 gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground mr-auto text-xs"
              onClick={handleResetCustom}
              disabled={isSavingCustom}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset to Default
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(false)} disabled={isSavingCustom}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveCustom}
              disabled={isSavingCustom}
              className="bg-[#1D3461] hover:bg-[#0F2041] text-white"
              data-testid="button-save-flow"
            >
              {isSavingCustom ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Saving…</>
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
