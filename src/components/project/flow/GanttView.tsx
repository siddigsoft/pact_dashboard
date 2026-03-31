/**
 * GanttView — MS Project-style horizontal timeline for project flow stages.
 * Uses pure CSS/div layout, no extra libraries required.
 */
import { useMemo } from 'react';
import {
  addDays,
  differenceInDays,
  format,
  startOfWeek,
  endOfWeek,
  eachMonthOfInterval,
  startOfMonth,
  endOfMonth,
  isBefore,
  isAfter,
  isToday,
  parseISO,
} from 'date-fns';
import { CheckCircle2, Circle, SkipForward, Clock, CalendarDays, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { FlowStage } from '@/config/projectFlows';
import type { CustomStageEntry, FlowLogEntry } from '@/hooks/useProjectFlow';

interface GanttStage {
  stage: FlowStage;
  entry: CustomStageEntry | undefined;
  status: 'completed' | 'current' | 'upcoming' | 'skipped';
  groupIdx: number;
  parallelWithPrev: boolean;
}

interface Props {
  allDefaultStages: FlowStage[];
  groups: FlowStage[][];
  stageHistory: FlowLogEntry[];
  customEntries: CustomStageEntry[];
  getStageStatus: (id: string) => 'completed' | 'current' | 'upcoming' | 'skipped';
  projectStart?: string;
  projectEnd?: string;
  onEditFlow?: () => void;
}

const STATUS_COLORS = {
  completed: { bar: 'bg-emerald-500', text: 'text-emerald-700', border: 'border-emerald-400', label: 'bg-emerald-100 text-emerald-800' },
  current: { bar: 'bg-[#1D3461]', text: 'text-[#1D3461]', border: 'border-[#1D3461]', label: 'bg-[#1D3461]/10 text-[#1D3461]' },
  upcoming: { bar: 'bg-slate-300', text: 'text-slate-500', border: 'border-slate-300', label: 'bg-slate-100 text-slate-600' },
  skipped: { bar: 'bg-slate-200', text: 'text-slate-400', border: 'border-slate-200', label: 'bg-slate-100 text-slate-400' },
};

function getDateRange(
  stages: GanttStage[],
  projectStart?: string,
  projectEnd?: string,
): { min: Date; max: Date } {
  const dates: Date[] = [];
  if (projectStart) dates.push(new Date(projectStart));
  if (projectEnd) dates.push(new Date(projectEnd));

  stages.forEach(gs => {
    if (gs.entry?.plannedStart) dates.push(parseISO(gs.entry.plannedStart));
    if (gs.entry?.plannedEnd) dates.push(parseISO(gs.entry.plannedEnd));
    if (gs.entry?.dueDate) dates.push(parseISO(gs.entry.dueDate));
    // Use flow log completion date
  });

  if (dates.length < 2) {
    const today = new Date();
    return {
      min: addDays(today, -7),
      max: addDays(today, stages.length * 14 + 7),
    };
  }

  const sorted = dates.sort((a, b) => a.getTime() - b.getTime());
  return {
    min: addDays(sorted[0], -3),
    max: addDays(sorted[sorted.length - 1], 3),
  };
}

function assignDefaultDates(
  stages: GanttStage[],
  min: Date,
  max: Date,
): GanttStage[] {
  const totalDays = differenceInDays(max, min);
  const activeStages = stages.filter(s => s.status !== 'skipped');
  if (activeStages.length === 0) return stages;

  const durationPerStage = Math.max(7, Math.floor(totalDays / activeStages.length));

  let pointer = min;
  return stages.map(gs => {
    if (gs.status === 'skipped') return gs;
    if (gs.entry?.plannedStart && gs.entry?.plannedEnd) return gs;
    const start = pointer;
    const end = addDays(pointer, durationPerStage - 1);
    pointer = addDays(end, 1);
    return {
      ...gs,
      entry: {
        ...(gs.entry ?? { id: gs.stage.id }),
        plannedStart: format(start, 'yyyy-MM-dd'),
        plannedEnd: format(end, 'yyyy-MM-dd'),
      },
    };
  });
}

export function GanttView({
  allDefaultStages, groups, stageHistory, customEntries, getStageStatus, projectStart, projectEnd, onEditFlow,
}: Props) {
  const today = new Date();

  const ganttStages: GanttStage[] = useMemo(() => {
    return allDefaultStages.map(stage => {
      const entry = customEntries.find(e => e.id === stage.id);
      const status = getStageStatus(stage.id);

      // Find which group this stage is in
      const groupIdx = groups.findIndex(g => g.some(s => s.id === stage.id));

      // Determine if it runs in parallel with the previous stage in the same group
      const group = groups[groupIdx] ?? [];
      const posInGroup = group.findIndex(s => s.id === stage.id);
      const parallelWithPrev = posInGroup > 0;

      return { stage, entry, status, groupIdx, parallelWithPrev };
    });
  }, [allDefaultStages, customEntries, getStageStatus, groups]);

  const { min, max } = useMemo(
    () => getDateRange(ganttStages, projectStart, projectEnd),
    [ganttStages, projectStart, projectEnd],
  );

  const resolvedStages = useMemo(
    () => assignDefaultDates(ganttStages, min, max),
    [ganttStages, min, max],
  );

  const totalDays = differenceInDays(max, min) || 1;
  const hasDates = ganttStages.some(gs => gs.entry?.plannedStart);

  // Build month header columns
  const months = eachMonthOfInterval({ start: min, end: max });

  const todayOffset = Math.max(0, Math.min(100, (differenceInDays(today, min) / totalDays) * 100));
  const isTodayVisible = today >= min && today <= max;

  const getBarStyle = (gs: GanttStage): { left: string; width: string } | null => {
    const start = gs.entry?.plannedStart ? parseISO(gs.entry.plannedStart) : null;
    const end = gs.entry?.plannedEnd ? parseISO(gs.entry.plannedEnd) : null;
    if (!start || !end) return null;

    const leftPct = (differenceInDays(start, min) / totalDays) * 100;
    const widthPct = Math.max(0.5, (differenceInDays(end, start) / totalDays) * 100);
    return {
      left: `${Math.max(0, leftPct).toFixed(2)}%`,
      width: `${widthPct.toFixed(2)}%`,
    };
  };

  const isOverdue = (gs: GanttStage) => {
    const end = gs.entry?.plannedEnd ? parseISO(gs.entry.plannedEnd) : null;
    const due = gs.entry?.dueDate ? parseISO(gs.entry.dueDate) : null;
    const d = due ?? end;
    return d && isBefore(d, today) && gs.status !== 'completed' && gs.status !== 'skipped';
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      {!hasDates && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-3">
          <CalendarDays className="h-4 w-4 text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            No stage dates set — showing an estimated timeline. 
            {onEditFlow && (
              <button type="button" onClick={onEditFlow} className="ml-1 underline font-medium">
                Add dates in Edit Flow
              </button>
            )}
          </p>
        </div>
      )}

      {/* Gantt chart */}
      <div className="rounded-xl border overflow-hidden">
        {/* Month header */}
        <div className="flex bg-muted/50 border-b">
          {/* Stage label column */}
          <div className="w-48 flex-shrink-0 px-3 py-2 border-r">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Stage</span>
          </div>
          {/* Timeline header */}
          <div className="flex-1 relative overflow-hidden">
            <div className="flex" style={{ minWidth: 0 }}>
              {months.map((month, i) => {
                const monthStart = startOfMonth(month);
                const monthEnd = endOfMonth(month);
                const leftPct = (Math.max(0, differenceInDays(monthStart, min)) / totalDays) * 100;
                const widthPct = (Math.min(differenceInDays(monthEnd, min) + 1, totalDays) - Math.max(0, differenceInDays(monthStart, min))) / totalDays * 100;
                return (
                  <div
                    key={i}
                    className="absolute border-r border-border/40 px-2 py-1.5"
                    style={{ left: `${leftPct.toFixed(2)}%`, width: `${widthPct.toFixed(2)}%` }}
                  >
                    <span className="text-[10px] font-semibold text-muted-foreground whitespace-nowrap">
                      {format(month, 'MMM yyyy')}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="h-8" />
          </div>
        </div>

        {/* Stage rows */}
        <div className="divide-y divide-border/40">
          {resolvedStages.map((gs, idx) => {
            const colors = STATUS_COLORS[gs.status];
            const barStyle = getBarStyle(gs);
            const entry = gs.entry;
            const displayLabel = entry?.customLabel || gs.stage.label;
            const overdue = isOverdue(gs);
            const history = stageHistory.filter(h => h.stageId === gs.stage.id).at(-1);
            const isParallel = groups[gs.groupIdx]?.length > 1;

            return (
              <div
                key={gs.stage.id}
                className={cn(
                  'flex min-h-[52px] group',
                  gs.status === 'current' && 'bg-[#0F2041]/3 dark:bg-[#1D3461]/5',
                  gs.status === 'completed' && 'bg-emerald-50/30 dark:bg-emerald-900/5',
                  gs.status === 'skipped' && 'opacity-50',
                )}
              >
                {/* Stage label column */}
                <div className="w-48 flex-shrink-0 flex items-center gap-2 px-3 py-2 border-r">
                  {/* Status icon */}
                  <div className={cn('flex-shrink-0', colors.text)}>
                    {gs.status === 'completed' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : gs.status === 'skipped' ? (
                      <SkipForward className="h-3.5 w-3.5" />
                    ) : gs.status === 'current' ? (
                      <div className="h-4 w-4 rounded-full bg-[#1D3461] flex items-center justify-center">
                        <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                      </div>
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground/40" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className={cn(
                      'text-xs font-medium leading-tight truncate',
                      gs.status === 'skipped' && 'line-through text-muted-foreground',
                      gs.status === 'current' && 'text-[#1D3461] dark:text-blue-200 font-semibold',
                    )}>
                      {displayLabel}
                    </p>
                    <div className="flex items-center gap-1 flex-wrap mt-0.5">
                      {isParallel && (
                        <span className="text-[9px] bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 rounded px-1 font-medium">
                          ∥ Parallel
                        </span>
                      )}
                      {overdue && (
                        <span className="text-[9px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 rounded px-1 font-medium">
                          Overdue
                        </span>
                      )}
                      {entry?.dueDate && gs.status !== 'completed' && (
                        <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5" />
                          {format(parseISO(entry.dueDate), 'dd MMM')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Timeline bar column */}
                <div className="flex-1 relative flex items-center py-2 px-1 overflow-hidden">
                  {/* Month grid lines */}
                  {months.map((month, mi) => {
                    const leftPct = (Math.max(0, differenceInDays(startOfMonth(month), min)) / totalDays) * 100;
                    return (
                      <div
                        key={mi}
                        className="absolute top-0 bottom-0 w-px bg-border/30"
                        style={{ left: `${leftPct.toFixed(2)}%` }}
                      />
                    );
                  })}

                  {/* Today line */}
                  {isTodayVisible && (
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-red-500/70 z-10"
                      style={{ left: `${todayOffset.toFixed(2)}%` }}
                    />
                  )}

                  {/* Stage bar */}
                  {barStyle && (
                    <div
                      className="absolute h-7 rounded-md flex items-center px-2 overflow-hidden group/bar cursor-default"
                      style={{ left: barStyle.left, width: barStyle.width, minWidth: '6px' }}
                    >
                      <div className={cn('absolute inset-0 rounded-md opacity-80', colors.bar)} />
                      {/* Completion stripe for completed stages */}
                      {gs.status === 'completed' && (
                        <div className="absolute inset-0 rounded-md opacity-20 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(255,255,255,0.5)_4px,rgba(255,255,255,0.5)_8px)]" />
                      )}
                      {/* Pulsing for current */}
                      {gs.status === 'current' && (
                        <div className="absolute right-1 top-1/2 -translate-y-1/2">
                          <span className="flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                          </span>
                        </div>
                      )}
                      <span className="relative text-[10px] font-semibold text-white truncate z-10 drop-shadow-sm">
                        {displayLabel}
                      </span>
                    </div>
                  )}

                  {/* Dates labels shown on hover */}
                  {barStyle && entry?.plannedStart && entry?.plannedEnd && (
                    <div
                      className="absolute bottom-1 opacity-0 group-hover:opacity-100 transition-opacity text-[9px] text-muted-foreground whitespace-nowrap z-20 pointer-events-none"
                      style={{ left: barStyle.left }}
                    >
                      {format(parseISO(entry.plannedStart), 'dd MMM')} — {format(parseISO(entry.plannedEnd), 'dd MMM')}
                    </div>
                  )}

                  {/* Completed at marker */}
                  {history && (
                    <div
                      className="absolute flex items-center"
                      style={{
                        left: `${Math.min(99, (differenceInDays(new Date(history.advancedAt), min) / totalDays) * 100).toFixed(2)}%`,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        zIndex: 20,
                      }}
                    >
                      <div className="w-3 h-3 rounded-full bg-emerald-500 border-2 border-white shadow-sm" title={`Completed ${format(new Date(history.advancedAt), 'dd MMM yyyy')}`} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Today legend */}
        <div className="flex items-center gap-4 px-4 py-2 bg-muted/30 border-t text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-4 rounded-sm bg-emerald-500" /> Completed
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-4 rounded-sm bg-[#1D3461]" /> In Progress
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-4 rounded-sm bg-slate-300" /> Upcoming
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-0.5 h-4 bg-red-500" /> Today
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" /> Completion Point
          </div>
        </div>
      </div>
    </div>
  );
}
