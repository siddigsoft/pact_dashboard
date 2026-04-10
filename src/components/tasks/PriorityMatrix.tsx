import { useState, useMemo, useCallback } from 'react';
import {
  AlertTriangle, Calendar, Users, Trash2,
  Plus, X, CheckCircle2, Clock, Loader2,
  GripVertical, FolderOpen, Star, Zap, ArrowRight,
} from 'lucide-react';
import { format, isToday, parseISO, isValid, isBefore, startOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  type PersonalTask,
  type PersonalTaskStatus,
  type AssignedProjectTask,
} from '@/hooks/usePersonalTasks';

// ── Types ─────────────────────────────────────────────────────────────────────
type Quadrant = 'do' | 'schedule' | 'delegate' | 'eliminate';

interface MatrixItem {
  id: string;
  title: string;
  project: string;
  dueLabel: string | null;
  isOverdue: boolean;
  isTodayDue: boolean;
  priority: string;
  type: 'personal' | 'project';
  quadrant: Quadrant;
  originalStatus: PersonalTaskStatus | string;
}

// ── Quadrant config ───────────────────────────────────────────────────────────
const Q_CONFIG: Record<Quadrant, {
  label: string;
  subtitle: string;
  Icon: typeof AlertTriangle;
  headerCls: string;
  bgCls: string;
  borderCls: string;
  dropBorderCls: string;
  chipCls: string;
  dotColor: string;
}> = {
  do: {
    label: 'Do First',
    subtitle: 'Urgent + Important',
    Icon: AlertTriangle,
    headerCls: 'bg-red-500 text-white',
    bgCls: 'bg-red-50 dark:bg-red-950/20',
    borderCls: 'border-red-200 dark:border-red-900/50',
    dropBorderCls: 'border-violet-400',
    chipCls: 'bg-red-100 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
    dotColor: 'bg-red-500',
  },
  schedule: {
    label: 'Schedule',
    subtitle: 'Important, Not Urgent',
    Icon: Calendar,
    headerCls: 'bg-blue-500 text-white',
    bgCls: 'bg-blue-50 dark:bg-blue-950/20',
    borderCls: 'border-blue-200 dark:border-blue-900/50',
    dropBorderCls: 'border-violet-400',
    chipCls: 'bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
    dotColor: 'bg-blue-500',
  },
  delegate: {
    label: 'Delegate',
    subtitle: 'Urgent, Not Important',
    Icon: Users,
    headerCls: 'bg-amber-500 text-white',
    bgCls: 'bg-amber-50 dark:bg-amber-950/20',
    borderCls: 'border-amber-200 dark:border-amber-900/50',
    dropBorderCls: 'border-violet-400',
    chipCls: 'bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
    dotColor: 'bg-amber-500',
  },
  eliminate: {
    label: 'Eliminate',
    subtitle: 'Not Urgent, Not Important',
    Icon: Trash2,
    headerCls: 'bg-slate-400 text-white',
    bgCls: 'bg-slate-50 dark:bg-slate-900/30',
    borderCls: 'border-slate-200 dark:border-slate-700',
    dropBorderCls: 'border-violet-400',
    chipCls: 'bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
    dotColor: 'bg-slate-400',
  },
};

const QUADRANT_ORDER: Quadrant[] = ['do', 'schedule', 'delegate', 'eliminate'];

// ── Helpers ───────────────────────────────────────────────────────────────────
function taskIsOverdue(dueDate?: string | null, status?: string): boolean {
  if (!dueDate || status === 'done' || status === 'cancelled') return false;
  try {
    const d = parseISO(dueDate);
    return isValid(d) && isBefore(startOfDay(d), startOfDay(new Date()));
  } catch { return false; }
}

function taskIsTodayDue(dueDate?: string | null, status?: string): boolean {
  if (!dueDate || status === 'done' || status === 'cancelled') return false;
  try {
    const d = parseISO(dueDate);
    return isValid(d) && isToday(d);
  } catch { return false; }
}

function fmtDue(iso?: string | null): string | null {
  if (!iso) return null;
  try {
    const d = parseISO(iso);
    if (!isValid(d)) return null;
    if (isToday(d)) return 'Today';
    return format(d, 'd MMM');
  } catch { return null; }
}

function autoQuadrant(priority: string, overdue: boolean, todayDue: boolean): Quadrant {
  const urgent = overdue || todayDue;
  if (priority === 'critical') return 'do';
  if (priority === 'high' && urgent) return 'do';
  if (priority === 'high') return 'schedule';
  if (priority === 'medium') return 'schedule';
  if (priority === 'low' && urgent) return 'delegate';
  return 'eliminate';
}

const STORAGE_KEY = 'pact_mytasks_matrix_overrides';
function loadOverrides(): Record<string, Quadrant> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'); } catch { return {}; }
}
function saveOverrides(o: Record<string, Quadrant>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(o)); } catch {}
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface PriorityMatrixProps {
  personalTasks: PersonalTask[];
  allPersonalTasks: PersonalTask[];
  projectTasks: AssignedProjectTask[];
  isLoading: boolean;
  onMarkPersonalDone: (id: string, prevStatus: PersonalTaskStatus) => Promise<void>;
  onMarkProjectDone: (id: string) => Promise<void>;
  onOpenNewTask: () => void;
  viewToggle?: React.ReactNode;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function PriorityMatrix({
  personalTasks,
  projectTasks,
  isLoading,
  onMarkPersonalDone,
  onMarkProjectDone,
  onOpenNewTask,
  viewToggle,
}: PriorityMatrixProps) {
  const { toast } = useToast();

  const [overrides, setOverrides] = useState<Record<string, Quadrant>>(loadOverrides);
  const [completing, setCompleting] = useState<Set<string>>(new Set());
  const [localDone, setLocalDone] = useState<Set<string>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<Quadrant | null>(null);

  const items: MatrixItem[] = useMemo(() => {
    const personal = personalTasks
      .filter(t => !t.parentTaskId && t.status !== 'done' && t.status !== 'cancelled')
      .map(t => {
        const overdue = taskIsOverdue(t.dueDate, t.status);
        const todayDue = taskIsTodayDue(t.dueDate, t.status);
        return {
          id: t.id,
          title: t.title,
          project: t.category ?? 'Personal',
          dueLabel: fmtDue(t.dueDate),
          isOverdue: overdue,
          isTodayDue: todayDue,
          priority: t.priority,
          type: 'personal' as const,
          quadrant: (overrides[t.id] ?? autoQuadrant(t.priority, overdue, todayDue)) as Quadrant,
          originalStatus: t.status,
        };
      });

    const project = projectTasks
      .filter(t => String(t.status) !== 'done' && String(t.status) !== 'cancelled')
      .map(t => {
        const due = typeof t.dueDate === 'string' ? t.dueDate : null;
        const status = String(t.status ?? '');
        const priority = String(t.priority ?? 'medium');
        const overdue = taskIsOverdue(due, status);
        const todayDue = taskIsTodayDue(due, status);
        return {
          id: String(t.id),
          title: String(t.title ?? 'Project task'),
          project: t.projectName,
          dueLabel: fmtDue(due),
          isOverdue: overdue,
          isTodayDue: todayDue,
          priority,
          type: 'project' as const,
          quadrant: (overrides[String(t.id)] ?? autoQuadrant(priority, overdue, todayDue)) as Quadrant,
          originalStatus: status,
        };
      });

    return [...personal, ...project].filter(i => !localDone.has(i.id));
  }, [personalTasks, projectTasks, overrides, localDone]);

  const activeCount = items.length;

  const moveToQuadrant = useCallback((id: string, q: Quadrant) => {
    setOverrides(prev => {
      const next = { ...prev, [id]: q };
      saveOverrides(next);
      return next;
    });
  }, []);

  const completeTask = useCallback(async (item: MatrixItem) => {
    if (completing.has(item.id)) return;
    setCompleting(prev => new Set(prev).add(item.id));
    setLocalDone(prev => new Set(prev).add(item.id));
    try {
      if (item.type === 'personal') {
        await onMarkPersonalDone(item.id, item.originalStatus as PersonalTaskStatus);
      } else {
        await onMarkProjectDone(item.id);
      }
      setOverrides(prev => {
        const next = { ...prev }; delete next[item.id]; saveOverrides(next); return next;
      });
    } catch {
      setLocalDone(prev => { const n = new Set(prev); n.delete(item.id); return n; });
      toast({ title: 'Failed to complete task', variant: 'destructive' });
    } finally {
      setCompleting(prev => { const n = new Set(prev); n.delete(item.id); return n; });
    }
  }, [completing, onMarkPersonalDone, onMarkProjectDone, toast]);

  const onDragStart = (id: string) => setDragId(id);
  const onDragEnd = () => { setDragId(null); setDragOver(null); };
  const onDragOver = (e: React.DragEvent, q: Quadrant) => { e.preventDefault(); setDragOver(q); };
  const onDragLeave = () => setDragOver(null);
  const onDrop = (e: React.DragEvent, q: Quadrant) => {
    e.preventDefault();
    if (dragId) moveToQuadrant(dragId, q);
    setDragId(null); setDragOver(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      className="flex flex-col w-full"
      style={{ fontFamily: "'Inter',system-ui,sans-serif" }}
    >
      {/* ── White header bar ── */}
      <div className="bg-white dark:bg-card border-b border-slate-200 dark:border-border px-6 sm:px-8 py-4 flex items-center justify-between gap-4 flex-wrap flex-shrink-0">
        <div>
          <h2 className="text-[18px] font-bold text-slate-900 dark:text-foreground flex items-center gap-2">
            <Zap className="h-5 w-5 text-violet-500" />
            Priority Matrix
          </h2>
          <p className="text-[12px] text-slate-500 dark:text-muted-foreground mt-0.5">
            Drag tasks between quadrants · <span className="font-semibold text-slate-700 dark:text-foreground">{activeCount}</span> tasks remaining
          </p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          {/* Legend */}
          <div className="hidden sm:flex items-center gap-3 text-[11.5px] text-slate-500 dark:text-muted-foreground">
            {QUADRANT_ORDER.map(q => (
              <span key={q} className="flex items-center gap-1.5">
                <span className={cn('h-2.5 w-2.5 rounded-full flex-shrink-0', Q_CONFIG[q].dotColor)} />
                {Q_CONFIG[q].label}
              </span>
            ))}
          </div>
          {viewToggle}
          <button
            onClick={onOpenNewTask}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg px-3.5 h-9 transition-colors"
            data-testid="matrix-button-add-task"
          >
            <Plus className="h-3.5 w-3.5" /> Add task
          </button>
        </div>
      </div>

      {/* ── Axis label ── */}
      <div className="flex items-center justify-center py-2 bg-slate-100/80 dark:bg-slate-900/40 border-b border-slate-200/60 dark:border-border/30 flex-shrink-0">
        <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-slate-400 dark:text-muted-foreground/60 uppercase tracking-widest">
          <ArrowRight className="h-3 w-3" /> Importance →
        </div>
      </div>

      {/* ── 2×2 Grid ── */}
      <div
        className="flex-1 grid grid-cols-2 gap-3 p-4 sm:p-5 bg-slate-100 dark:bg-slate-900/50"
        style={{ minHeight: 0 }}
      >
        {QUADRANT_ORDER.map(q => {
          const cfg = Q_CONFIG[q];
          const { Icon } = cfg;
          const qItems = items.filter(i => i.quadrant === q);
          const isOver = dragOver === q;

          return (
            <div
              key={q}
              onDragOver={e => onDragOver(e, q)}
              onDragLeave={onDragLeave}
              onDrop={e => onDrop(e, q)}
              className={cn(
                'rounded-2xl border-2 flex flex-col overflow-hidden transition-all',
                cfg.bgCls,
                isOver ? `${cfg.dropBorderCls} shadow-lg scale-[1.005]` : cfg.borderCls,
              )}
            >
              {/* Quadrant header */}
              <div className={cn('flex items-center justify-between px-4 py-2.5 flex-shrink-0', cfg.headerCls)}>
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  <div>
                    <p className="text-[13px] font-bold leading-none">{cfg.label}</p>
                    <p className="text-[10px] opacity-80 mt-0.5">{cfg.subtitle}</p>
                  </div>
                </div>
                <span className="text-[12px] font-bold bg-white/20 rounded-full px-2 py-0.5">
                  {qItems.length}
                </span>
              </div>

              {/* Task list */}
              <div className="flex-1 p-3 space-y-2 overflow-y-auto">
                {qItems.map(item => {
                  const isBeingDragged = dragId === item.id;
                  const isCompleting = completing.has(item.id);
                  return (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={() => onDragStart(item.id)}
                      onDragEnd={onDragEnd}
                      className={cn(
                        'bg-white dark:bg-card rounded-xl p-3 shadow-sm border border-white/80 dark:border-border/40',
                        'cursor-grab active:cursor-grabbing transition-all hover:shadow-md group',
                        isBeingDragged && 'opacity-40 scale-95',
                      )}
                      data-testid={`matrix-task-${item.id}`}
                    >
                      <div className="flex items-start gap-2">
                        {/* Complete button (hover reveal) */}
                        <button
                          onClick={() => completeTask(item)}
                          disabled={isCompleting}
                          className="opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 flex-shrink-0 disabled:cursor-not-allowed"
                          title="Mark done"
                          data-testid={`matrix-done-${item.id}`}
                        >
                          {isCompleting
                            ? <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                            : <CheckCircle2 className="h-4 w-4 text-emerald-400 hover:text-emerald-600" />
                          }
                        </button>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-1.5 mb-1.5">
                            <GripVertical className="h-3.5 w-3.5 text-muted-foreground/30 flex-shrink-0 mt-0.5" />
                            <p className="text-[12.5px] font-semibold text-slate-800 dark:text-foreground leading-snug">
                              {item.title}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-md flex items-center gap-1', cfg.chipCls)}>
                              {item.type === 'project'
                                ? <FolderOpen className="h-2.5 w-2.5" />
                                : <Star className="h-2.5 w-2.5" />
                              }
                              {item.project}
                            </span>
                            {item.dueLabel && (
                              <span className={cn(
                                'text-[10.5px] flex items-center gap-0.5 font-medium',
                                item.isOverdue ? 'text-red-600 dark:text-red-400' :
                                item.isTodayDue ? 'text-amber-600 dark:text-amber-400' :
                                'text-slate-400 dark:text-muted-foreground',
                              )}>
                                <Clock className="h-2.5 w-2.5" />
                                {item.dueLabel}{item.isOverdue ? ' · Overdue' : ''}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Dismiss to Eliminate */}
                        {q !== 'eliminate' && (
                          <button
                            onClick={() => moveToQuadrant(item.id, 'eliminate')}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 dark:text-muted-foreground/40 hover:text-slate-500 flex-shrink-0 mt-0.5"
                            title="Move to Eliminate"
                            data-testid={`matrix-dismiss-${item.id}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Quick move pills */}
                      <div className="flex items-center gap-1 mt-2 pl-5 opacity-0 group-hover:opacity-100 transition-opacity flex-wrap">
                        {QUADRANT_ORDER.filter(tq => tq !== q).map(tq => (
                          <button
                            key={tq}
                            onClick={() => moveToQuadrant(item.id, tq)}
                            className={cn(
                              'text-[9.5px] font-bold px-1.5 py-0.5 rounded-full transition-all hover:scale-105',
                              Q_CONFIG[tq].chipCls,
                            )}
                            title={`Move to ${Q_CONFIG[tq].label}`}
                            data-testid={`matrix-move-${item.id}-${tq}`}
                          >
                            → {Q_CONFIG[tq].label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Empty drop zone */}
                {qItems.length === 0 && (
                  <div className={cn(
                    'flex items-center justify-center h-14 rounded-xl border-2 border-dashed transition-colors text-[11.5px]',
                    isOver
                      ? 'border-violet-400 bg-violet-50 dark:bg-violet-950/20 text-violet-600'
                      : 'border-slate-200 dark:border-muted text-slate-400 dark:text-muted-foreground/50',
                  )}>
                    {isOver ? '✓ Drop here' : 'Drop tasks here'}
                  </div>
                )}

                {/* Add here */}
                <button
                  onClick={onOpenNewTask}
                  className="flex items-center gap-1.5 w-full text-[11.5px] text-slate-400 dark:text-muted-foreground/60 hover:text-slate-600 dark:hover:text-muted-foreground py-1.5 px-2 rounded-lg hover:bg-white/60 dark:hover:bg-white/5 transition-colors"
                  data-testid={`matrix-add-${q}`}
                >
                  <Plus className="h-3.5 w-3.5" /> Add here
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Reset overrides ── */}
      {Object.keys(overrides).length > 0 && (
        <div className="flex justify-end px-5 py-2 bg-slate-100 dark:bg-slate-900/50 border-t border-slate-200 dark:border-border/30">
          <button
            onClick={() => { setOverrides({}); saveOverrides({}); }}
            className="text-[11px] text-slate-400 dark:text-muted-foreground hover:text-slate-700 dark:hover:text-foreground underline transition-colors"
            data-testid="matrix-button-reset"
          >
            Reset to auto-placement
          </button>
        </div>
      )}
    </div>
  );
}
