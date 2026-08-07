import { useMemo, useState } from 'react';
import {
  format, parseISO, differenceInDays, addDays, isBefore,
  eachMonthOfInterval, startOfMonth, endOfMonth,
} from 'date-fns';
import { cn } from '@/lib/utils';
import {
  CheckCircle2, SkipForward, Circle, CalendarDays, Clock, Diamond, Ban, GitMerge,
  ChevronRight, ChevronDown, Calendar,
} from 'lucide-react';
import type { FlowStage } from '@/config/projectFlows';
import type { FlowLogEntry, CustomStageEntry } from '@/hooks/useProjectFlow';
import type { StageChecklistItem } from '@/hooks/useStageData';

// ── Types ──────────────────────────────────────────────────────────────────

interface GanttStage {
  stage: FlowStage;
  entry?: CustomStageEntry;
  status: 'completed' | 'current' | 'upcoming' | 'skipped';
  groupIdx: number;
  parallelWithPrev: boolean;
  isMilestone: boolean;
  isBlocked: boolean;
  blockedByLabels: string[];
  /** Optional sub-group label within a phase (MS Project section concept) */
  sectionLabel?: string | null;
}

interface Props {
  allDefaultStages: FlowStage[];
  groups: FlowStage[][];
  stageHistory: FlowLogEntry[];
  customEntries: CustomStageEntry[];
  getStageStatus: (id: string) => 'completed' | 'current' | 'upcoming' | 'skipped';
  projectStart?: string | null;
  projectEnd?: string | null;
  onEditFlow?: () => void;
  /** All checklist items for the project, keyed by stageId */
  checklistByStage?: Record<string, StageChecklistItem[]>;
}

// ── Constants ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bar: string; text: string }> = {
  completed: { bar: 'bg-emerald-500', text: 'text-emerald-700' },
  current:   { bar: 'bg-[#1D3461]',   text: 'text-[#1D3461]' },
  upcoming:  { bar: 'bg-slate-300 dark:bg-slate-600', text: 'text-slate-500' },
  skipped:   { bar: 'bg-slate-200 dark:bg-slate-700', text: 'text-slate-400' },
  blocked:   { bar: 'bg-orange-400',  text: 'text-orange-600' },
  milestone: { bar: 'bg-amber-500',   text: 'text-amber-700' },
};

/** Color for a checklist sub-bar based on completion */
function getChecklistBarColor(item: StageChecklistItem): string {
  if (item.completed) return 'bg-emerald-400';
  return 'bg-slate-400 dark:bg-slate-500';
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getDateRange(
  stages: GanttStage[],
  projectStart?: string | null,
  projectEnd?: string | null,
  checklistByStage?: Record<string, StageChecklistItem[]>,
) {
  const today = new Date();
  const dates: Date[] = [];

  if (projectStart) dates.push(parseISO(projectStart));
  if (projectEnd)   dates.push(parseISO(projectEnd));

  stages.forEach(gs => {
    if (gs.entry?.plannedStart) dates.push(parseISO(gs.entry.plannedStart));
    if (gs.entry?.plannedEnd)   dates.push(parseISO(gs.entry.plannedEnd));
    if (gs.entry?.dueDate)      dates.push(parseISO(gs.entry.dueDate));
  });

  // Include checklist item dates
  if (checklistByStage) {
    Object.values(checklistByStage).forEach(items => {
      items.forEach(item => {
        if (item.plannedStart) dates.push(parseISO(item.plannedStart));
        if (item.plannedEnd)   dates.push(parseISO(item.plannedEnd));
      });
    });
  }

  const min = dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : addDays(today, -30);
  const max = dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : addDays(today, 90);

  // Pad by one month on each side
  return {
    min: startOfMonth(addDays(min, -15)),
    max: endOfMonth(addDays(max, 15)),
  };
}

function assignDefaultDates(stages: GanttStage[], min: Date, max: Date): GanttStage[] {
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

// ── Component ──────────────────────────────────────────────────────────────

export function GanttView({
  allDefaultStages, groups, stageHistory, customEntries, getStageStatus, projectStart, projectEnd, onEditFlow,
  checklistByStage = {},
}: Props) {
  const today = new Date();

  // Expand/collapse state for stage sub-rows
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());
  const toggleExpand = (stageId: string) => {
    setExpandedStages(prev => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return next;
    });
  };

  // Build a completed-set for dependency checks
  const completedIds = useMemo(
    () => new Set(allDefaultStages.filter(s => getStageStatus(s.id) === 'completed').map(s => s.id)),
    [allDefaultStages, getStageStatus],
  );

  // Helper: get blocked-by labels for a stage
  const getBlockedByLabels = (stageId: string): string[] => {
    const entry = customEntries.find(e => e.id === stageId);
    if (!entry?.dependencies?.length) return [];
    const status = getStageStatus(stageId);
    if (status === 'completed' || status === 'skipped') return [];
    return entry.dependencies
      .filter(depId => !completedIds.has(depId))
      .map(depId => {
        const depEntry = customEntries.find(e => e.id === depId);
        const depStage = allDefaultStages.find(s => s.id === depId);
        return depEntry?.customLabel || depStage?.label || depId;
      });
  };

  const ganttStages: GanttStage[] = useMemo(() => {
    return allDefaultStages.map(stage => {
      const entry = customEntries.find(e => e.id === stage.id);
      const status = getStageStatus(stage.id);

      const groupIdx = groups.findIndex(g => g.some(s => s.id === stage.id));
      const group = groups[groupIdx] ?? [];
      const posInGroup = group.findIndex(s => s.id === stage.id);
      const parallelWithPrev = posInGroup > 0;

      const blockedByLabels = getBlockedByLabels(stage.id);
      const isMilestone = entry?.isMilestone ?? false;

      return {
        stage,
        entry,
        status,
        groupIdx,
        parallelWithPrev,
        isMilestone,
        isBlocked: blockedByLabels.length > 0,
        blockedByLabels,
        sectionLabel: entry?.sectionLabel ?? null,
      };
    });
  }, [allDefaultStages, customEntries, getStageStatus, groups, completedIds]);

  const { min, max } = useMemo(
    () => getDateRange(ganttStages, projectStart, projectEnd, checklistByStage),
    [ganttStages, projectStart, projectEnd, checklistByStage],
  );

  const resolvedStages = useMemo(
    () => assignDefaultDates(ganttStages, min, max),
    [ganttStages, min, max],
  );

  const totalDays = differenceInDays(max, min) || 1;
  const hasDates = ganttStages.some(gs => gs.entry?.plannedStart);

  const months = eachMonthOfInterval({ start: min, end: max });

  const todayOffset = Math.max(0, Math.min(100, (differenceInDays(today, min) / totalDays) * 100));
  const isTodayVisible = today >= min && today <= max;

  const getBarStyle = (gs: GanttStage): { left: string; width: string } | null => {
    const start = gs.entry?.plannedStart ? parseISO(gs.entry.plannedStart) : null;
    const end   = gs.entry?.plannedEnd   ? parseISO(gs.entry.plannedEnd)   : null;
    if (!start || !end) return null;
    const leftPct  = (differenceInDays(start, min) / totalDays) * 100;
    const widthPct = Math.max(0.5, (differenceInDays(end, start) / totalDays) * 100);
    return {
      left:  `${Math.max(0, leftPct).toFixed(2)}%`,
      width: `${widthPct.toFixed(2)}%`,
    };
  };

  /** Returns bar style for a checklist item */
  const getChecklistBarStyle = (item: StageChecklistItem): { left: string; width: string } | null => {
    if (!item.plannedStart || !item.plannedEnd) return null;
    const start = parseISO(item.plannedStart);
    const end   = parseISO(item.plannedEnd);
    const leftPct  = (differenceInDays(start, min) / totalDays) * 100;
    const widthPct = Math.max(0.5, (differenceInDays(end, start) / totalDays) * 100);
    return {
      left:  `${Math.max(0, leftPct).toFixed(2)}%`,
      width: `${widthPct.toFixed(2)}%`,
    };
  };

  /** Returns the % left offset for a milestone point marker (dueDate ?? plannedEnd). */
  const getMilestonePointLeft = (gs: GanttStage): string | null => {
    const anchorStr = gs.entry?.dueDate ?? gs.entry?.plannedEnd ?? null;
    if (!anchorStr) return null;
    const anchor = parseISO(anchorStr);
    const pct = Math.max(0, Math.min(100, (differenceInDays(anchor, min) / totalDays) * 100));
    return `${pct.toFixed(2)}%`;
  };

  const isOverdue = (gs: GanttStage) => {
    const end = gs.entry?.plannedEnd ? parseISO(gs.entry.plannedEnd) : null;
    const due = gs.entry?.dueDate    ? parseISO(gs.entry.dueDate)    : null;
    const d = due ?? end;
    return d && isBefore(d, today) && gs.status !== 'completed' && gs.status !== 'skipped';
  };

  // Build a map from stageId → bar left% for dependency arrow drawing
  const barLeftMap = useMemo(() => {
    const m: Record<string, number> = {};
    resolvedStages.forEach(gs => {
      const start = gs.entry?.plannedStart ? parseISO(gs.entry.plannedStart) : null;
      const end   = gs.entry?.plannedEnd   ? parseISO(gs.entry.plannedEnd)   : null;
      if (start && end) {
        m[gs.stage.id] = (differenceInDays(start, min) / totalDays) * 100;
      }
    });
    return m;
  }, [resolvedStages, min, totalDays]);

  return (
    <div className="space-y-3">
      {/* No-dates notice */}
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
          <div className="w-52 flex-shrink-0 px-3 py-2 border-r">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Stage</span>
          </div>
          <div className="flex-1 relative overflow-hidden">
            <div className="flex" style={{ minWidth: 0 }}>
              {months.map((month, i) => {
                const monthStart = startOfMonth(month);
                const monthEnd   = endOfMonth(month);
                const leftPct  = (Math.max(0, differenceInDays(monthStart, min)) / totalDays) * 100;
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
          {(() => {
            let lastSectionKey = '';
            return resolvedStages.map((gs, idx) => {
            const currSectionKey = `${gs.groupIdx}::${gs.sectionLabel ?? ''}`;
            const showSectionHeader = !!gs.sectionLabel && currSectionKey !== lastSectionKey;
            if (showSectionHeader) lastSectionKey = currSectionKey;
            const indentedBar = !!gs.sectionLabel;

            const colorKey = gs.isBlocked ? 'blocked' : gs.isMilestone && gs.status !== 'completed' ? 'milestone' : gs.status;
            const colors = STATUS_COLORS[colorKey] ?? STATUS_COLORS['upcoming'];
            const barStyle = getBarStyle(gs);
            const entry = gs.entry;
            const displayLabel = entry?.customLabel || gs.stage.label;
            const overdue = isOverdue(gs);
            const history = stageHistory.filter(h => h.stageId === gs.stage.id).at(-1);
            const isParallel = groups[gs.groupIdx]?.length > 1;
            const percentComplete = entry?.percentComplete ?? null;

            // Checklist items for this stage
            const stageItems = checklistByStage[gs.stage.id] ?? [];
            const hasChecklist = stageItems.length > 0;
            const isExpanded = expandedStages.has(gs.stage.id);
            const itemsWithDates = stageItems.filter(i => i.plannedStart && i.plannedEnd);
            const itemsWithoutDates = stageItems.filter(i => !i.plannedStart || !i.plannedEnd);

            // Dependency lines: find predecessor bar positions that exist in this view
            const depIds = entry?.dependencies ?? [];
            const depConnectors = depIds
              .filter(depId => barLeftMap[depId] !== undefined && barStyle)
              .map(depId => {
                const depEntry = customEntries.find(e => e.id === depId);
                const depStage = allDefaultStages.find(s => s.id === depId);
                const label = depEntry?.customLabel || depStage?.label || depId;
                const depLeft = barLeftMap[depId];
                return { depId, label, depLeft };
              });

            // WBS number
            const wbsNum = allDefaultStages.filter(s => getStageStatus(s.id) !== 'skipped').findIndex(s => s.id === gs.stage.id) + 1;

            return (
              <div key={gs.stage.id}>
                {/* ── Section / Sub-group header row ── */}
                {showSectionHeader && (
                  <div className="flex border-b border-violet-200/50 dark:border-violet-800/30 bg-violet-50/50 dark:bg-violet-900/10">
                    <div className="w-52 flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 border-r border-violet-200/50">
                      <span className="text-violet-400 text-[10px] font-bold">§</span>
                      <span className="text-[11px] font-semibold text-violet-700 dark:text-violet-300 truncate">
                        {gs.sectionLabel}
                      </span>
                    </div>
                    <div className="flex-1 relative overflow-hidden py-1.5 px-2">
                      {months.map((month, mi) => {
                        const leftPct = (Math.max(0, differenceInDays(startOfMonth(month), min)) / totalDays) * 100;
                        return (
                          <div key={mi} className="absolute top-0 bottom-0 w-px bg-border/15" style={{ left: `${leftPct.toFixed(2)}%` }} />
                        );
                      })}
                    </div>
                  </div>
                )}
                {/* ── Stage row ── */}
                <div
                  className={cn(
                    'flex min-h-[52px] group',
                    gs.status === 'current' && !gs.isBlocked && 'bg-[#0F2041]/3 dark:bg-[#1D3461]/5',
                    gs.status === 'completed' && 'bg-emerald-50/30 dark:bg-emerald-900/5',
                    gs.status === 'skipped' && 'opacity-50',
                    gs.isBlocked && 'bg-orange-50/30 dark:bg-orange-900/5',
                  )}
                >
                  {/* Stage label column */}
                  <div className="w-52 flex-shrink-0 flex items-center gap-1 px-2 py-2 border-r">
                    {/* Expand/collapse toggle */}
                    {hasChecklist ? (
                      <button
                        type="button"
                        onClick={() => toggleExpand(gs.stage.id)}
                        className="h-5 w-5 flex-shrink-0 rounded flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                        title={isExpanded ? 'Collapse tasks' : `Show ${stageItems.length} task${stageItems.length !== 1 ? 's' : ''}`}
                      >
                        {isExpanded
                          ? <ChevronDown className="h-3.5 w-3.5" />
                          : <ChevronRight className="h-3.5 w-3.5" />
                        }
                      </button>
                    ) : (
                      <div className="h-5 w-5 flex-shrink-0" />
                    )}

                    {/* Status / milestone icon */}
                    {gs.isMilestone && gs.status !== 'completed' ? (
                      <div className={cn(
                        'h-5 w-5 flex-shrink-0 rotate-45 border-2 flex items-center justify-center rounded-sm',
                        gs.isBlocked ? 'border-orange-400 bg-orange-100' : 'border-amber-500 bg-amber-50',
                      )}>
                        <span className="-rotate-45">
                          <Diamond className="h-2.5 w-2.5 text-amber-600" />
                        </span>
                      </div>
                    ) : gs.isBlocked ? (
                      <Ban className="h-4 w-4 flex-shrink-0 text-orange-500" />
                    ) : gs.status === 'completed' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    ) : gs.status === 'skipped' ? (
                      <SkipForward className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                    ) : gs.status === 'current' ? (
                      <div className="h-4 w-4 rounded-full bg-[#1D3461] flex items-center justify-center flex-shrink-0">
                        <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                      </div>
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
                    )}

                    <div className="min-w-0">
                      {/* WBS + label */}
                      <div className="flex items-center gap-1 min-w-0">
                        {gs.status !== 'skipped' && wbsNum > 0 && (
                          <span className="text-[9px] font-mono text-muted-foreground/50 flex-shrink-0">{wbsNum}.0</span>
                        )}
                        <p className={cn(
                          'text-xs font-medium leading-tight truncate',
                          gs.status === 'skipped' && 'line-through text-muted-foreground',
                          gs.status === 'current' && !gs.isBlocked && 'text-[#1D3461] dark:text-blue-200 font-semibold',
                          gs.isBlocked && 'text-orange-700 dark:text-orange-300',
                        )}>
                          {displayLabel}
                        </p>
                      </div>

                      {/* Tags row */}
                      <div className="flex items-center gap-1 flex-wrap mt-0.5">
                        {gs.isMilestone && (
                          <span className="text-[8px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 rounded px-1 font-medium">
                            ◆ Milestone
                          </span>
                        )}
                        {gs.isBlocked && (
                          <span className="text-[8px] bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 rounded px-1 font-medium">
                            Blocked
                          </span>
                        )}
                        {isParallel && !gs.isBlocked && (
                          <span className="text-[8px] bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 rounded px-1 font-medium">
                            ∥ Parallel
                          </span>
                        )}
                        {overdue && !gs.isBlocked && (
                          <span className="text-[8px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 rounded px-1 font-medium">
                            Overdue
                          </span>
                        )}
                        {entry?.dueDate && gs.status !== 'completed' && !gs.isBlocked && (
                          <span className="text-[8px] text-muted-foreground flex items-center gap-0.5">
                            <Clock className="h-2 w-2" />
                            {format(parseISO(entry.dueDate), 'dd MMM')}
                          </span>
                        )}
                        {gs.isBlocked && (
                          <span className="text-[8px] text-orange-600 flex items-center gap-0.5 mt-0.5 col-span-full">
                            ← {gs.blockedByLabels.join(', ')}
                          </span>
                        )}
                        {hasChecklist && (
                          <span className="text-[8px] text-muted-foreground/70">
                            {stageItems.filter(i => i.completed).length}/{stageItems.length} tasks
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

                    {/* Dependency connectors — small arrows pointing to blocked bar start */}
                    {depConnectors.map(({ depId, label, depLeft }) => {
                      const myLeft = barStyle ? parseFloat(barStyle.left) : null;
                      if (myLeft === null) return null;
                      // Only draw if predecessor ends before this bar starts
                      const width = Math.max(0, myLeft - depLeft);
                      if (width < 0.5) return null;
                      return (
                        <div
                          key={depId}
                          title={`Depends on: ${label}`}
                          className="absolute top-1/2 -translate-y-1/2 flex items-center pointer-events-none"
                          style={{ left: `${depLeft.toFixed(2)}%`, width: `${width.toFixed(2)}%`, zIndex: 5 }}
                        >
                          <div className="h-px w-full border-t-2 border-dashed border-orange-400/60" />
                          <div className="w-0 h-0 flex-shrink-0 border-t-4 border-b-4 border-l-[6px] border-transparent border-l-orange-400/60" />
                        </div>
                      );
                    })}

                    {/* Stage bar — milestone shows as single-point diamond marker at due/planned-end date */}
                    {gs.isMilestone && gs.status !== 'completed' && gs.status !== 'skipped' ? (() => {
                      const milestoneLeft = getMilestonePointLeft(gs);
                      if (!milestoneLeft) return null;
                      const anchorDate = gs.entry?.dueDate ?? gs.entry?.plannedEnd;
                      const tooltipText = [
                        displayLabel,
                        anchorDate ? `Due: ${format(parseISO(anchorDate), 'dd MMM yyyy')}` : null,
                        `Status: ${gs.status.charAt(0).toUpperCase() + gs.status.slice(1)}`,
                      ].filter(Boolean).join(' · ');
                      return (
                        <div
                          className="absolute"
                          title={tooltipText}
                          style={{ left: milestoneLeft, top: '50%', transform: 'translateX(-50%) translateY(-50%)', zIndex: 8 }}
                        >
                          <div className={cn(
                            'w-5 h-5 rotate-45 border-2 shadow-sm flex-shrink-0',
                            gs.isBlocked ? 'border-orange-400 bg-orange-200' : 'border-amber-600 bg-amber-400',
                          )} />
                          {/* Hover tooltip */}
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap bg-popover border border-border rounded-md shadow-md px-2.5 py-1.5 z-30 text-left min-w-max">
                            <p className="text-xs font-semibold text-foreground flex items-center gap-1">
                              <Diamond className="h-3 w-3 text-amber-500 fill-amber-400" />
                              {displayLabel}
                            </p>
                            {anchorDate && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                Due: {format(parseISO(anchorDate), 'dd MMM yyyy')}
                              </p>
                            )}
                            <p className="text-[10px] text-muted-foreground">
                              Status: {gs.status.charAt(0).toUpperCase() + gs.status.slice(1)}
                            </p>
                          </div>
                        </div>
                      );
                    })() : barStyle ? (
                        <div
                          className="absolute h-7 rounded-md flex items-center px-2 overflow-hidden group/bar cursor-default"
                          style={{ left: barStyle.left, width: barStyle.width, minWidth: '6px' }}
                        >
                          <div className={cn(
                            'absolute inset-0 rounded-md opacity-80',
                            gs.isBlocked ? 'bg-orange-400' : colors.bar,
                          )} />
                          {/* Blocked stripe pattern */}
                          {gs.isBlocked && (
                            <div className="absolute inset-0 rounded-md opacity-30 bg-[repeating-linear-gradient(-45deg,transparent,transparent_4px,rgba(255,255,255,0.7)_4px,rgba(255,255,255,0.7)_8px)]" />
                          )}
                          {/* Completed stripe */}
                          {gs.status === 'completed' && (
                            <div className="absolute inset-0 rounded-md opacity-20 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(255,255,255,0.5)_4px,rgba(255,255,255,0.5)_8px)]" />
                          )}
                          {/* % complete fill overlay */}
                          {entry?.percentComplete !== null && entry?.percentComplete !== undefined && gs.status !== 'completed' && (
                            <div
                              className="absolute left-0 top-0 bottom-0 rounded-l-md bg-white/20"
                              style={{ width: `${entry.percentComplete}%` }}
                            />
                          )}
                          {/* Pulsing dot for current */}
                          {gs.status === 'current' && !gs.isBlocked && (
                            <div className="absolute right-1 top-1/2 -translate-y-1/2">
                              <span className="flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                              </span>
                            </div>
                          )}
                          <span className="relative text-[10px] font-semibold text-white truncate z-10 drop-shadow-sm">
                            {displayLabel}
                            {entry?.percentComplete !== null && entry?.percentComplete !== undefined && gs.status !== 'completed' && ` (${entry.percentComplete}%)`}
                          </span>
                        </div>
                      ) : null
                    }

                    {/* Hover: dates — only for regular bars; milestones use their own inline tooltip */}
                    {!gs.isMilestone && barStyle && entry?.plannedStart && entry?.plannedEnd && (
                      <div
                        className="absolute bottom-1 opacity-0 group-hover:opacity-100 transition-opacity text-[9px] text-muted-foreground whitespace-nowrap z-20 pointer-events-none"
                        style={{ left: barStyle.left }}
                      >
                        {format(parseISO(entry.plannedStart), 'dd MMM')} — {format(parseISO(entry.plannedEnd), 'dd MMM')}
                        {entry.percentComplete !== null && entry.percentComplete !== undefined && ` · ${entry.percentComplete}%`}
                      </div>
                    )}

                    {/* Completion point */}
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
                        <div
                          className={cn(
                            'w-3 h-3 border-2 border-white shadow-sm',
                            gs.isMilestone ? 'rotate-45 bg-amber-500 rounded-none' : 'rounded-full bg-emerald-500',
                          )}
                          title={`Completed ${format(new Date(history.advancedAt), 'dd MMM yyyy')}`}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Checklist sub-rows (expanded) ── */}
                {isExpanded && hasChecklist && (
                  <div className="bg-muted/20 dark:bg-muted/10 border-t border-border/30">
                    {/* Items with planned dates — shown as mini bars */}
                    {itemsWithDates.map((item, itemIdx) => {
                      const itemBarStyle = getChecklistBarStyle(item);
                      const barColor = getChecklistBarColor(item);
                      const isItemOverdue = item.plannedEnd && isBefore(parseISO(item.plannedEnd), today) && !item.completed;
                      const wbsChild = `${wbsNum}.${itemIdx + 1}`;
                      return (
                        <div
                          key={item.id}
                          className="flex min-h-[38px] group/child border-t border-border/20 first:border-t-0"
                        >
                          {/* Item label */}
                          <div className="w-52 flex-shrink-0 flex items-center gap-1 pl-8 pr-2 py-1.5 border-r border-border/30">
                            <div className="w-5 flex-shrink-0 flex justify-end pr-1">
                              {item.completed
                                ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                : <Circle className="h-3 w-3 text-muted-foreground/40" />
                              }
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1">
                                <span className="text-[9px] font-mono text-muted-foreground/40 flex-shrink-0">{wbsChild}</span>
                                <p className={cn(
                                  'text-[11px] leading-tight truncate',
                                  item.completed ? 'line-through text-muted-foreground' : 'text-foreground/80',
                                )}>
                                  {item.itemText}
                                </p>
                              </div>
                              {(item.plannedStart || item.plannedEnd || isItemOverdue) && (
                                <div className="flex items-center gap-1 mt-0.5">
                                  {item.plannedStart && item.plannedEnd && (
                                    <span className="text-[8px] text-muted-foreground flex items-center gap-0.5">
                                      <Calendar className="h-2 w-2" />
                                      {format(parseISO(item.plannedStart), 'dd MMM')} – {format(parseISO(item.plannedEnd), 'dd MMM')}
                                    </span>
                                  )}
                                  {isItemOverdue && (
                                    <span className="text-[8px] bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 rounded px-1 font-medium">
                                      Overdue
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Item timeline */}
                          <div className="flex-1 relative flex items-center py-1.5 px-1 overflow-hidden">
                            {/* Grid lines */}
                            {months.map((month, mi) => {
                              const leftPct = (Math.max(0, differenceInDays(startOfMonth(month), min)) / totalDays) * 100;
                              return (
                                <div
                                  key={mi}
                                  className="absolute top-0 bottom-0 w-px bg-border/20"
                                  style={{ left: `${leftPct.toFixed(2)}%` }}
                                />
                              );
                            })}
                            {/* Today line */}
                            {isTodayVisible && (
                              <div
                                className="absolute top-0 bottom-0 w-0.5 bg-red-500/50 z-10"
                                style={{ left: `${todayOffset.toFixed(2)}%` }}
                              />
                            )}
                            {/* Sub-bar */}
                            {itemBarStyle && (
                              <div
                                className={cn(
                                  'absolute h-5 rounded flex items-center px-1.5 overflow-hidden cursor-default group/itembar',
                                  barColor,
                                  item.completed ? 'opacity-70' : 'opacity-85',
                                )}
                                style={{ left: itemBarStyle.left, width: itemBarStyle.width, minWidth: '4px' }}
                                title={[
                                  item.itemText,
                                  item.plannedStart && item.plannedEnd
                                    ? `${format(parseISO(item.plannedStart), 'dd MMM')} – ${format(parseISO(item.plannedEnd), 'dd MMM yyyy')}`
                                    : null,
                                  item.completed ? 'Completed' : 'Pending',
                                ].filter(Boolean).join(' · ')}
                              >
                                {/* Strikethrough stripe for completed */}
                                {item.completed && (
                                  <div className="absolute inset-0 rounded opacity-20 bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(255,255,255,0.6)_3px,rgba(255,255,255,0.6)_6px)]" />
                                )}
                                <span className="relative text-[9px] font-medium text-white truncate z-10 drop-shadow-sm">
                                  {item.itemText}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Items without dates — text-only rows */}
                    {itemsWithoutDates.length > 0 && (
                      <div className="border-t border-border/20 px-3 py-2">
                        <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 pl-5">
                          No dates set
                        </p>
                        <div className="space-y-1 pl-5">
                          {itemsWithoutDates.map(item => (
                            <div key={item.id} className="flex items-center gap-2">
                              {item.completed
                                ? <CheckCircle2 className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                                : <Circle className="h-3 w-3 text-muted-foreground/30 flex-shrink-0" />
                              }
                              <span className={cn(
                                'text-[11px] leading-tight',
                                item.completed ? 'line-through text-muted-foreground' : 'text-foreground/70',
                              )}>
                                {item.itemText}
                              </span>
                              <span className="text-[8px] text-muted-foreground/50 border border-border/50 rounded px-1 ml-auto flex-shrink-0">
                                no dates
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          });
          })()}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 px-4 py-2 bg-muted/30 border-t text-[10px] text-muted-foreground flex-wrap">
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
            <div className="h-3 w-4 rounded-sm bg-orange-400 opacity-80" /> Blocked
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-4 w-4 rotate-45 bg-amber-400 border-2 border-amber-600" /> Milestone
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-0.5 h-4 bg-red-500" /> Today
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" /> Completion Point
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-px w-8 border-t-2 border-dashed border-orange-400" />
            <div className="w-0 h-0 border-t-4 border-b-4 border-l-[6px] border-transparent border-l-orange-400" /> Dependency
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-4 rounded-sm bg-slate-400 opacity-80" /> Task (pending)
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-4 rounded-sm bg-emerald-400 opacity-70" /> Task (done)
          </div>
        </div>
      </div>
    </div>
  );
}
