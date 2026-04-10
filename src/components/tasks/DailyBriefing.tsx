import { useState, useMemo } from 'react';
import {
  CheckCircle2, Clock, Zap, Coffee, Sun, Moon, Sparkles,
  MoreHorizontal, Plus, Loader2, Circle,
  AlertTriangle,
} from 'lucide-react';
import { format, isToday, parseISO, isValid, isBefore, startOfDay } from 'date-fns';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  type PersonalTask,
  type PersonalTaskPriority,
  type PersonalTaskStatus,
  type AssignedProjectTask,
} from '@/hooks/usePersonalTasks';

// ── Priority weight ───────────────────────────────────────────────────────────
const PRIORITY_WEIGHT: Record<PersonalTaskPriority, number> = {
  critical: 0, high: 1, medium: 2, low: 3,
};

function isOverdue(dueDate?: string | null, status?: string): boolean {
  if (!dueDate || status === 'done' || status === 'cancelled') return false;
  try {
    const d = parseISO(dueDate);
    return isValid(d) && isBefore(startOfDay(d), startOfDay(new Date()));
  } catch { return false; }
}

function fmtDue(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = parseISO(iso);
    if (!isValid(d)) return '';
    if (isToday(d)) return 'Today';
    return format(d, 'd MMM');
  } catch { return ''; }
}

function getFirstName(fullName?: string | null): string {
  if (!fullName) return '';
  return fullName.split(' ')[0];
}

const PRIORITY_BADGE: Record<PersonalTaskPriority, { label: string; cls: string }> = {
  critical: { label: 'Critical', cls: 'text-red-600 bg-red-50 border border-red-100' },
  high:     { label: 'High',     cls: 'text-orange-600 bg-orange-50 border border-orange-100' },
  medium:   { label: 'Medium',   cls: 'text-amber-600 bg-amber-50 border border-amber-100' },
  low:      { label: 'Low',      cls: 'text-blue-600 bg-blue-50 border border-blue-100' },
};

// ── Props ─────────────────────────────────────────────────────────────────────
interface DailyBriefingProps {
  personalTasks: PersonalTask[];
  allPersonalTasks: PersonalTask[];
  projectTasks: AssignedProjectTask[];
  currentUserFullName?: string | null;
  currentUserId?: string;
  currentUserEmail?: string | null;
  isLoading: boolean;
  onMarkPersonalDone: (id: string, prevStatus: PersonalTaskStatus) => Promise<void>;
  onMarkProjectDone: (id: string) => Promise<void>;
  onOpenNewTask: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function DailyBriefing({
  personalTasks,
  allPersonalTasks,
  projectTasks,
  currentUserFullName,
  isLoading,
  onMarkPersonalDone,
  onMarkProjectDone,
  onOpenNewTask,
}: DailyBriefingProps) {
  const { toast } = useToast();
  const now = new Date();
  const hour = now.getHours();
  const dateLabel = format(now, 'EEEE, d MMM yyyy');
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const GreetIcon = hour < 12 ? Coffee : hour < 17 ? Sun : Moon;
  const greetColor = hour < 12 ? 'text-amber-400' : hour < 17 ? 'text-yellow-400' : 'text-indigo-300';

  // ── Active tasks ───────────────────────────────────────────────────────────
  const activeTasks = useMemo(() =>
    personalTasks.filter(t => t.status !== 'done' && t.status !== 'cancelled' && !t.parentTaskId),
    [personalTasks],
  );
  const activeProjectTasks = useMemo(() =>
    projectTasks.filter(t => String(t.status) !== 'done' && String(t.status) !== 'cancelled'),
    [projectTasks],
  );
  const totalActive = activeTasks.length + activeProjectTasks.length;
  const urgentCount = useMemo(() =>
    activeTasks.filter(t => t.priority === 'critical' || t.priority === 'high').length
    + activeProjectTasks.filter(t => t.priority === 'critical' || t.priority === 'high').length,
    [activeTasks, activeProjectTasks],
  );
  const doneToday = useMemo(() =>
    personalTasks.filter(t => t.status === 'done').length
    + projectTasks.filter(t => String(t.status) === 'done').length,
    [personalTasks, projectTasks],
  );
  const totalToday = totalActive + doneToday;
  const progressPct = totalToday > 0 ? Math.round((doneToday / totalToday) * 100) : 0;

  // ── Focus task ─────────────────────────────────────────────────────────────
  const focusTask = useMemo((): PersonalTask | null => {
    if (!activeTasks.length) return null;
    return [...activeTasks].sort((a, b) => {
      const aOv = isOverdue(a.dueDate, a.status) ? 0 : 1;
      const bOv = isOverdue(b.dueDate, b.status) ? 0 : 1;
      if (aOv !== bOv) return aOv - bOv;
      const aTd = a.dueDate && isValid(parseISO(a.dueDate)) && isToday(parseISO(a.dueDate)) ? 0 : 1;
      const bTd = b.dueDate && isValid(parseISO(b.dueDate)) && isToday(parseISO(b.dueDate)) ? 0 : 1;
      if (aTd !== bTd) return aTd - bTd;
      return PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
    })[0] ?? null;
  }, [activeTasks]);

  const subtasks = useMemo(() =>
    focusTask ? allPersonalTasks.filter(t => t.parentTaskId === focusTask.id) : [],
    [allPersonalTasks, focusTask],
  );
  const doneSubs = subtasks.filter(t => t.status === 'done').length;
  const subPct = subtasks.length ? Math.round((doneSubs / subtasks.length) * 100) : 0;

  // ── Quick wins ─────────────────────────────────────────────────────────────
  const quickWins = useMemo(() =>
    activeTasks
      .filter(t => t.id !== focusTask?.id && (t.priority === 'low' || t.priority === 'medium'))
      .filter(t => !allPersonalTasks.some(st => st.parentTaskId === t.id))
      .slice(0, 5),
    [activeTasks, focusTask, allPersonalTasks],
  );

  // ── Up Next ────────────────────────────────────────────────────────────────
  const upNext = useMemo(() => {
    const personal = activeTasks
      .filter(t => t.id !== focusTask?.id)
      .filter(t => t.dueDate && isValid(parseISO(t.dueDate)) && isToday(parseISO(t.dueDate)))
      .map(t => ({
        id: t.id,
        title: String(t.title),
        project: t.category ?? 'Personal',
        dueLabel: 'Today',
        urgent: t.priority === 'critical' || t.priority === 'high',
        type: 'personal' as const,
        prevStatus: t.status,
      }));
    const proj = activeProjectTasks
      .filter(t => t.dueDate && isValid(parseISO(String(t.dueDate))) && isToday(parseISO(String(t.dueDate))))
      .map(t => ({
        id: String(t.id),
        title: String(t.title ?? 'Project task'),
        project: t.projectName,
        dueLabel: 'Today',
        urgent: t.priority === 'critical' || t.priority === 'high',
        type: 'project' as const,
        prevStatus: null,
      }));
    const projHigh = activeProjectTasks
      .filter(t => !proj.find(p => p.id === String(t.id)))
      .filter(t => t.priority === 'critical' || t.priority === 'high')
      .slice(0, 3)
      .map(t => ({
        id: String(t.id),
        title: String(t.title ?? 'Project task'),
        project: t.projectName,
        dueLabel: fmtDue(String(t.dueDate ?? '')),
        urgent: true,
        type: 'project' as const,
        prevStatus: null,
      }));
    return [...personal, ...proj, ...projHigh].slice(0, 6);
  }, [activeTasks, activeProjectTasks, focusTask]);

  // ── Local state ────────────────────────────────────────────────────────────
  const [pendingDone, setPendingDone] = useState<Set<string>>(new Set());
  const [focusDismissed, setFocusDismissed] = useState(false);
  const [completingFocus, setCompletingFocus] = useState(false);
  const [localSubDone, setLocalSubDone] = useState<Set<string>>(new Set(
    subtasks.filter(s => s.status === 'done').map(s => s.id),
  ));

  async function handleMarkFocusDone() {
    if (!focusTask) return;
    setCompletingFocus(true);
    try {
      await onMarkPersonalDone(focusTask.id, focusTask.status);
      setFocusDismissed(true);
    } catch {
      toast({ title: 'Failed to complete task', variant: 'destructive' });
    } finally {
      setCompletingFocus(false);
    }
  }

  async function handleQuickWinDone(task: PersonalTask) {
    setPendingDone(prev => new Set(prev).add(task.id));
    try {
      await onMarkPersonalDone(task.id, task.status);
    } catch {
      toast({ title: 'Failed to complete task', variant: 'destructive' });
      setPendingDone(prev => { const n = new Set(prev); n.delete(task.id); return n; });
    }
  }

  async function handleUpNextDone(item: typeof upNext[number]) {
    setPendingDone(prev => new Set(prev).add(item.id));
    try {
      if (item.type === 'personal') {
        await onMarkPersonalDone(item.id, item.prevStatus as PersonalTaskStatus);
      } else {
        await onMarkProjectDone(item.id);
      }
    } catch {
      toast({ title: 'Failed to complete task', variant: 'destructive' });
      setPendingDone(prev => { const n = new Set(prev); n.delete(item.id); return n; });
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col -mx-4 sm:-mx-6 -mt-2"
      style={{ fontFamily: "'Inter',system-ui,sans-serif", minHeight: 'calc(100vh - 120px)' }}
    >
      {/* ── Full-width dark banner ── */}
      <div className="bg-gradient-to-r from-[#0F2041] to-[#1D3461] text-white px-6 sm:px-8 py-5 sm:py-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <GreetIcon className={`h-5 w-5 ${greetColor}`} />
              <span className="text-[13px] text-white/60 font-medium">{dateLabel}</span>
            </div>
            <h1 className="text-[22px] font-bold leading-tight">
              {greeting}{currentUserFullName ? `, ${getFirstName(currentUserFullName)}` : ''}.
            </h1>
            <p className="text-[13.5px] text-white/70 mt-1">
              {totalActive > 0 ? (
                <>
                  You have{' '}
                  <span className="text-white font-semibold">{totalActive} task{totalActive !== 1 ? 's' : ''}</span>
                  {urgentCount > 0 && (
                    <> · <span className="text-amber-300 font-semibold">{urgentCount} urgent</span></>
                  )}
                  {doneToday > 0 && (
                    <> · <span className="text-emerald-300 font-semibold">{doneToday} done</span></>
                  )}
                </>
              ) : doneToday > 0 ? (
                <span className="text-emerald-300 font-semibold">All {doneToday} tasks done — great work!</span>
              ) : (
                'No tasks yet today — add one to get started.'
              )}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Sparkles className="h-4 w-4 text-amber-300" />
            <span className="text-[11.5px] text-white/50 hidden sm:inline">Daily Briefing</span>
          </div>
        </div>

        {/* Day progress bar */}
        {totalToday > 0 && (
          <div className="mt-4 flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-400 to-emerald-400 rounded-full transition-all duration-700"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-[11px] text-white/50 flex-shrink-0">
              {doneToday} of {totalToday} done today
            </span>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div className="flex-1 flex gap-4 sm:gap-5 p-4 sm:p-6 bg-gradient-to-br from-slate-50 to-blue-50/30 dark:from-background dark:to-background min-h-0">

        {/* ── Left: Focus + Quick Wins ── */}
        <div className="flex-1 min-w-0 flex flex-col gap-5">

          {/* Focus right now label */}
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            <h2 className="text-[11.5px] font-bold text-slate-500 dark:text-muted-foreground uppercase tracking-widest">
              Focus Right Now
            </h2>
          </div>

          {/* Focus card */}
          {!focusTask ? (
            <div className="bg-white dark:bg-card border border-emerald-200 dark:border-emerald-800 rounded-2xl p-7 flex flex-col items-center gap-3 text-center shadow-sm">
              <CheckCircle2 className="h-9 w-9 text-emerald-500" />
              <p className="text-[14px] font-semibold text-emerald-800 dark:text-emerald-300">
                All caught up — no active tasks!
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-1 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-700"
                onClick={onOpenNewTask}
                data-testid="briefing-button-add-task-empty"
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add a task
              </Button>
            </div>
          ) : focusDismissed ? (
            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-6 flex flex-col items-center gap-2">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              <p className="text-[13.5px] font-semibold text-emerald-800 dark:text-emerald-300">
                Task completed — great work!
              </p>
              <button
                onClick={() => setFocusDismissed(false)}
                className="text-[11.5px] text-emerald-600 underline hover:text-emerald-700"
              >
                Undo
              </button>
            </div>
          ) : (
            <div className="bg-white dark:bg-card rounded-2xl border border-amber-200 dark:border-amber-900/50 shadow-md shadow-amber-50/80 dark:shadow-none p-5 flex flex-col gap-4">
              {/* Task header */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${PRIORITY_BADGE[focusTask.priority].cls}`}>
                      {PRIORITY_BADGE[focusTask.priority].label}
                    </span>
                    {focusTask.category && (
                      <span className="text-[11px] text-slate-400 dark:text-muted-foreground">{focusTask.category}</span>
                    )}
                    {isOverdue(focusTask.dueDate, focusTask.status) && (
                      <span className="text-[10.5px] font-bold text-red-500 flex items-center gap-0.5">
                        <AlertTriangle className="h-3 w-3" /> Overdue
                      </span>
                    )}
                  </div>
                  <h3 className="text-[17px] font-bold text-slate-900 dark:text-foreground leading-snug">
                    {focusTask.title}
                  </h3>
                </div>
                <button
                  onClick={() => setFocusDismissed(true)}
                  className="text-slate-300 dark:text-muted-foreground/40 hover:text-slate-500 dark:hover:text-muted-foreground transition-colors flex-shrink-0 mt-1"
                  title="Skip for now"
                  data-testid="briefing-button-skip-focus"
                >
                  <MoreHorizontal className="h-5 w-5" />
                </button>
              </div>

              {/* Why this matters */}
              {focusTask.description && (
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-xl px-4 py-3">
                  <p className="text-[10.5px] font-bold text-amber-700 dark:text-amber-500 uppercase tracking-wider mb-1">
                    Why this matters
                  </p>
                  <p className="text-[13px] text-amber-900 dark:text-amber-300 leading-relaxed">
                    {focusTask.description}
                  </p>
                </div>
              )}

              {/* Subtasks */}
              {subtasks.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[12px] font-semibold text-slate-700 dark:text-foreground">Subtasks</span>
                    <span className="text-[11.5px] text-slate-400 dark:text-muted-foreground">
                      {doneSubs}/{subtasks.length} · {subPct}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-100 dark:bg-muted rounded-full overflow-hidden mb-3">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                      style={{ width: `${subPct}%` }}
                    />
                  </div>
                  <div className="space-y-2">
                    {subtasks.map(st => {
                      const isDone = localSubDone.has(st.id);
                      return (
                        <button
                          key={st.id}
                          onClick={() => setLocalSubDone(prev => {
                            const n = new Set(prev);
                            n.has(st.id) ? n.delete(st.id) : n.add(st.id);
                            return n;
                          })}
                          className="flex items-center gap-2.5 w-full text-left group"
                          data-testid={`briefing-subtask-${st.id}`}
                        >
                          {isDone
                            ? <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                            : <div className="h-4 w-4 rounded-full border-2 border-slate-300 dark:border-muted-foreground/30 group-hover:border-emerald-400 transition-colors flex-shrink-0" />
                          }
                          <span className={`text-[13px] transition-colors ${isDone ? 'line-through text-slate-400 dark:text-muted-foreground' : 'text-slate-700 dark:text-foreground'}`}>
                            {st.title}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-border/50">
                <div className="flex items-center gap-1.5 text-[12px] text-slate-400 dark:text-muted-foreground">
                  <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                  {focusTask.dueDate && isValid(parseISO(focusTask.dueDate)) ? (
                    <span className={isOverdue(focusTask.dueDate, focusTask.status) ? 'text-red-500 font-semibold' : ''}>
                      {isOverdue(focusTask.dueDate, focusTask.status) ? 'Overdue · ' : ''}Due {fmtDue(focusTask.dueDate)}
                    </span>
                  ) : (
                    <span>No due date</span>
                  )}
                </div>
                <button
                  onClick={handleMarkFocusDone}
                  disabled={completingFocus}
                  className="flex items-center gap-1.5 text-[12.5px] font-semibold text-white bg-[#1D3461] hover:bg-[#0F2041] disabled:opacity-60 rounded-xl px-4 py-2 transition-colors"
                  data-testid="briefing-button-mark-done"
                >
                  {completingFocus
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <CheckCircle2 className="h-3.5 w-3.5" />
                  }
                  Mark done
                </button>
              </div>
            </div>
          )}

          {/* ── Quick Wins ── */}
          {quickWins.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <Zap className="h-3.5 w-3.5 text-violet-500" />
                <h2 className="text-[11.5px] font-bold text-slate-500 dark:text-muted-foreground uppercase tracking-widest">
                  Quick Wins (&lt;5 min)
                </h2>
              </div>
              <div className="space-y-2">
                {quickWins.map(task => {
                  const isDone = pendingDone.has(task.id);
                  return (
                    <div
                      key={task.id}
                      className={`flex items-center gap-3 bg-white dark:bg-card border rounded-xl px-4 py-2.5 transition-all ${isDone
                        ? 'border-emerald-100 dark:border-emerald-900/30 opacity-50'
                        : 'border-slate-200 dark:border-border hover:border-violet-200 dark:hover:border-violet-800 hover:shadow-sm'
                      }`}
                      data-testid={`briefing-quickwin-${task.id}`}
                    >
                      <button
                        onClick={() => !isDone && handleQuickWinDone(task)}
                        className="flex-shrink-0"
                      >
                        {isDone
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          : <Circle className="h-4 w-4 text-slate-300 dark:text-muted-foreground/30 hover:text-violet-400 transition-colors" />
                        }
                      </button>
                      <span className={`flex-1 text-[13px] ${isDone ? 'line-through text-slate-400 dark:text-muted-foreground' : 'text-slate-700 dark:text-foreground'}`}>
                        {task.title}
                      </span>
                      <div className="flex items-center gap-2">
                        {task.category && (
                          <span className="text-[10.5px] text-slate-400 dark:text-muted-foreground">{task.category}</span>
                        )}
                        {task.dueDate && isValid(parseISO(task.dueDate)) && (
                          <span className={`text-[10.5px] font-medium ${isOverdue(task.dueDate, task.status) ? 'text-red-500' : isToday(parseISO(task.dueDate)) ? 'text-amber-600' : 'text-slate-400 dark:text-muted-foreground'}`}>
                            {fmtDue(task.dueDate)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* All done empty state */}
          {activeTasks.length === 0 && activeProjectTasks.length === 0 && (
            <div className="flex flex-col items-center py-6 gap-3">
              <p className="text-sm text-muted-foreground">No more tasks — take a breather!</p>
              <Button
                size="sm"
                variant="outline"
                onClick={onOpenNewTask}
                className="gap-1.5"
                data-testid="briefing-button-add-task"
              >
                <Plus className="h-3.5 w-3.5" /> Add task
              </Button>
            </div>
          )}
        </div>

        {/* ── Right: Up Next Today ── */}
        <div className="w-64 flex-shrink-0 hidden md:flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-500" />
            <h2 className="text-[11.5px] font-bold text-slate-500 dark:text-muted-foreground uppercase tracking-widest">
              Up Next Today
            </h2>
          </div>

          {upNext.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-5 text-center border-2 border-dashed border-slate-200 dark:border-border/50 rounded-xl">
              <span className="text-[12px] text-slate-400 dark:text-muted-foreground">
                Nothing else scheduled for today
              </span>
              <button
                onClick={onOpenNewTask}
                className="flex items-center gap-1 text-[11.5px] text-[#1D3461] dark:text-blue-400 hover:underline"
                data-testid="briefing-button-add-today"
              >
                <Plus className="h-3 w-3" /> Add to today
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {upNext.map((item, i) => {
                const isDone = pendingDone.has(item.id);
                return (
                  <div
                    key={item.id}
                    className={`flex gap-3 bg-white dark:bg-card rounded-xl border p-3 shadow-sm transition-all ${isDone ? 'opacity-40' : item.urgent ? 'border-red-100 dark:border-red-900/30' : 'border-slate-100 dark:border-border'}`}
                    data-testid={`briefing-upnext-${item.id}`}
                  >
                    <div className="flex flex-col items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => !isDone && handleUpNextDone(item)}
                        title="Mark done"
                      >
                        {isDone
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          : <Circle className={`h-4 w-4 ${item.urgent ? 'text-red-400' : 'text-slate-300 dark:text-muted-foreground/30'} hover:text-emerald-400 transition-colors`} />
                        }
                      </button>
                      {i < upNext.length - 1 && (
                        <div className="w-px flex-1 bg-slate-100 dark:bg-border my-0.5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[12.5px] font-medium leading-snug ${isDone ? 'line-through text-slate-400 dark:text-muted-foreground' : 'text-slate-800 dark:text-foreground'}`}>
                        {item.title}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="text-[10.5px] text-slate-400 dark:text-muted-foreground truncate max-w-[90px]">
                          {item.project}
                        </span>
                        {item.dueLabel && (
                          <>
                            <span className="text-[10.5px] text-slate-300 dark:text-muted-foreground/40">·</span>
                            <span className={`text-[10.5px] font-medium ${item.urgent ? 'text-red-500' : 'text-slate-400 dark:text-muted-foreground'}`}>
                              {item.dueLabel}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              <button
                onClick={onOpenNewTask}
                className="flex items-center justify-center gap-1.5 text-[12px] text-slate-400 dark:text-muted-foreground hover:text-[#1D3461] dark:hover:text-blue-400 border border-dashed border-slate-200 dark:border-border/50 hover:border-[#1D3461]/30 rounded-xl py-2.5 transition-colors"
                data-testid="briefing-button-add-to-today"
              >
                <Plus className="h-3.5 w-3.5" /> Add to today
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
