import { useMemo, useState } from 'react';
import { format, parseISO, differenceInCalendarDays, isBefore } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  CheckCircle2, Circle, SkipForward, Clock, Diamond, Ban,
  ChevronRight, ChevronDown, AlertTriangle,
} from 'lucide-react';
import type { FlowStage } from '@/config/projectFlows';
import type { FlowLogEntry, CustomStageEntry } from '@/hooks/useProjectFlow';
import type { StageChecklistItem } from '@/hooks/useStageData';

// ── Types ────────────────────────────────────────────────────────────────────

interface Props {
  allDefaultStages: FlowStage[];
  groups: FlowStage[][];
  stageHistory: FlowLogEntry[];
  customEntries: CustomStageEntry[];
  getStageStatus: (id: string) => 'completed' | 'current' | 'upcoming' | 'skipped';
  projectStart?: string | null;
  projectEnd?: string | null;
  checklistByStage?: Record<string, StageChecklistItem[]>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  completed: { label: 'Done',       cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  current:   { label: 'Active',     cls: 'bg-[#1D3461]/10 text-[#1D3461] dark:bg-blue-900/30 dark:text-blue-300' },
  upcoming:  { label: 'Not Started',cls: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' },
  skipped:   { label: 'Skipped',    cls: 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500' },
  blocked:   { label: 'Blocked',    cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
};

const ROW_BG: Record<string, string> = {
  completed: 'bg-emerald-50/40 dark:bg-emerald-900/5',
  current:   'bg-blue-50/40 dark:bg-blue-900/5',
  upcoming:  '',
  skipped:   'opacity-50',
  blocked:   'bg-orange-50/30 dark:bg-orange-900/5',
};

function fmt(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try { return format(parseISO(dateStr), 'dd MMM yyyy'); } catch { return dateStr; }
}

function duration(start?: string | null, end?: string | null): string {
  if (!start || !end) return '—';
  try {
    const d = differenceInCalendarDays(parseISO(end), parseISO(start)) + 1;
    return `${d}d`;
  } catch { return '—'; }
}

function PercentBar({ pct }: { pct: number | null | undefined }) {
  const v = pct ?? 0;
  return (
    <div className="flex items-center gap-1.5 w-full">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', v >= 100 ? 'bg-emerald-500' : 'bg-[#1D3461]')}
          style={{ width: `${v}%` }}
        />
      </div>
      <span className="text-[10px] font-mono text-muted-foreground w-7 text-right flex-shrink-0">{v}%</span>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ScheduleView({
  allDefaultStages,
  groups,
  stageHistory,
  customEntries,
  getStageStatus,
  projectStart,
  projectEnd,
  checklistByStage = {},
}: Props) {
  const today = new Date();

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setExpanded(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  // Build completed set for predecessor resolution
  const completedIds = useMemo(
    () => new Set(allDefaultStages.filter(s => getStageStatus(s.id) === 'completed').map(s => s.id)),
    [allDefaultStages, getStageStatus],
  );

  // Group labels: find first stage of each group and use its group index
  const groupLabels = useMemo(() => {
    const labels: Record<number, string> = {};
    groups.forEach((grp, idx) => {
      const first = grp[0];
      if (!first) return;
      const entry = customEntries.find(e => e.id === first.id);
      labels[idx] = entry?.customLabel || first.label;
    });
    return labels;
  }, [groups, customEntries]);

  // Build flat rows list — one per stage (with WBS numbers)
  const rows = useMemo(() => {
    let wbs = 0;
    return allDefaultStages.map(stage => {
      const entry = customEntries.find(e => e.id === stage.id);
      const status = getStageStatus(stage.id);
      if (status !== 'skipped') wbs++;

      const groupIdx = groups.findIndex(g => g.some(s => s.id === stage.id));
      const isBlocked = (() => {
        if (status === 'completed' || status === 'skipped') return false;
        return (entry?.dependencies ?? []).some(d => !completedIds.has(d));
      })();

      const effectiveStatus = isBlocked ? 'blocked' : status;

      const preds = (entry?.dependencies ?? []).map(depId => {
        const depEntry = customEntries.find(e => e.id === depId);
        const depStage = allDefaultStages.find(s => s.id === depId);
        return depEntry?.customLabel || depStage?.label || depId;
      });

      const completedAt = stageHistory.filter(h => h.stageId === stage.id).at(-1)?.advancedAt ?? null;

      const plannedStart = entry?.plannedStart ?? null;
      const plannedEnd   = entry?.plannedEnd   ?? null;
      const dueDate      = entry?.dueDate       ?? null;
      const displayEnd   = dueDate ?? plannedEnd;

      const overdue = !entry?.isMilestone
        && displayEnd && isBefore(parseISO(displayEnd), today)
        && status !== 'completed' && status !== 'skipped';

      const items = checklistByStage[stage.id] ?? [];

      return {
        stage,
        entry,
        status: effectiveStatus,
        wbs: status !== 'skipped' ? wbs : null,
        groupIdx,
        isBlocked,
        preds,
        plannedStart,
        plannedEnd,
        dueDate,
        displayEnd,
        overdue,
        completedAt,
        items,
        isMilestone: entry?.isMilestone ?? false,
        percentComplete: entry?.percentComplete ?? (status === 'completed' ? 100 : 0),
        displayLabel: entry?.customLabel || stage.label,
        sectionLabel: entry?.sectionLabel ?? null,
      };
    });
  }, [allDefaultStages, customEntries, getStageStatus, groups, completedIds, stageHistory, checklistByStage, today]);

  // Track which group/section we rendered last to show phase and section headers
  let lastGroupIdx = -1;
  let lastSectionKey = '';

  return (
    <div className="rounded-xl border overflow-hidden text-sm">
      {/* Project-level summary bar */}
      {(projectStart || projectEnd) && (
        <div className="flex items-center gap-4 px-4 py-2 bg-[#1D3461] text-white text-xs">
          <span className="font-semibold uppercase tracking-wide">Project</span>
          {projectStart && <span>Start: <b>{fmt(projectStart)}</b></span>}
          {projectEnd   && <span>Finish: <b>{fmt(projectEnd)}</b></span>}
          {projectStart && projectEnd && (
            <span>Duration: <b>{duration(projectStart, projectEnd)}</b></span>
          )}
        </div>
      )}

      {/* Table header */}
      <div className="grid bg-muted/60 border-b text-[11px] font-semibold text-muted-foreground uppercase tracking-wide select-none"
        style={{ gridTemplateColumns: '2.5rem 1fr 5rem 7rem 7rem 6.5rem 7rem 5.5rem' }}>
        <div className="px-2 py-2.5 text-center border-r">ID</div>
        <div className="px-3 py-2.5 border-r">Task Name</div>
        <div className="px-2 py-2.5 text-center border-r">% Done</div>
        <div className="px-3 py-2.5 border-r">Duration</div>
        <div className="px-3 py-2.5 border-r">Start</div>
        <div className="px-3 py-2.5 border-r">Finish</div>
        <div className="px-3 py-2.5 border-r">Predecessors</div>
        <div className="px-3 py-2.5">Status</div>
      </div>

      <div className="divide-y divide-border/40">
        {rows.map((row, rowIdx) => {
          const showGroupHeader = row.groupIdx !== lastGroupIdx;
          if (showGroupHeader) {
            lastGroupIdx = row.groupIdx;
            lastSectionKey = '';
          }
          const currSectionKey = `${row.groupIdx}::${row.sectionLabel ?? ''}`;
          const showSectionHeader = !!row.sectionLabel && currSectionKey !== lastSectionKey;
          if (showSectionHeader) lastSectionKey = currSectionKey;
          const indented = !!row.sectionLabel;

          const hasItems = row.items.length > 0;
          const isExpanded = expanded.has(row.stage.id);

          return (
            <div key={row.stage.id}>
              {/* ── Phase / Group header ── */}
              {showGroupHeader && (
                <div
                  className="grid bg-muted/80 dark:bg-muted/40 border-b border-border/60"
                  style={{ gridTemplateColumns: '2.5rem 1fr 5rem 7rem 7rem 6.5rem 7rem 5.5rem' }}
                >
                  <div className="px-2 py-1.5 text-center border-r">
                    <span className="text-[10px] font-mono text-muted-foreground">G{row.groupIdx + 1}</span>
                  </div>
                  <div className="col-span-7 px-3 py-1.5">
                    <span className="text-[11px] font-bold text-foreground/80 uppercase tracking-wider">
                      Phase {row.groupIdx + 1}
                    </span>
                    {groups[row.groupIdx]?.length > 1 && (
                      <span className="ml-2 text-[10px] text-violet-600 font-medium">
                        ({groups[row.groupIdx].length} parallel stages)
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* ── Section / Sub-group header ── */}
              {showSectionHeader && (
                <div
                  className="grid bg-violet-50/60 dark:bg-violet-900/10 border-b border-violet-200/40 dark:border-violet-800/30"
                  style={{ gridTemplateColumns: '2.5rem 1fr 5rem 7rem 7rem 6.5rem 7rem 5.5rem' }}
                >
                  <div className="px-2 py-1 text-center border-r">
                    <span className="text-[9px] font-mono text-violet-400">§</span>
                  </div>
                  <div className="col-span-7 px-3 py-1 flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-violet-700 dark:text-violet-300">
                      {row.sectionLabel}
                    </span>
                    <span className="text-[9px] text-violet-400 font-medium uppercase tracking-wide">Section</span>
                  </div>
                </div>
              )}

              {/* ── Stage row ── */}
              <div
                className={cn(
                  'grid group hover:bg-muted/20 transition-colors',
                  ROW_BG[row.status],
                )}
                style={{ gridTemplateColumns: '2.5rem 1fr 5rem 7rem 7rem 6.5rem 7rem 5.5rem' }}
              >
                {/* ID */}
                <div className="px-2 py-2.5 flex items-center justify-center border-r text-[11px] font-mono text-muted-foreground">
                  {row.wbs ?? '—'}
                </div>

                {/* Task Name */}
                <div className={cn('py-2.5 flex items-start gap-1.5 border-r min-w-0', indented ? 'pl-6 pr-3' : 'px-3')}>
                  {/* Status icon */}
                  <div className="mt-0.5 flex-shrink-0">
                    {row.status === 'completed' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                    {row.status === 'current'   && <Clock        className="h-3.5 w-3.5 text-[#1D3461]" />}
                    {row.status === 'upcoming'  && <Circle       className="h-3.5 w-3.5 text-muted-foreground/40" />}
                    {row.status === 'skipped'   && <SkipForward  className="h-3.5 w-3.5 text-slate-400" />}
                    {row.status === 'blocked'   && <Ban          className="h-3.5 w-3.5 text-orange-500" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      {row.isMilestone && (
                        <Diamond className="h-3 w-3 text-amber-500 flex-shrink-0" />
                      )}
                      <button
                        type="button"
                        className={cn(
                          'text-left text-[12px] leading-snug font-medium break-words',
                          row.status === 'skipped' ? 'line-through text-muted-foreground' : 'text-foreground',
                        )}
                        onClick={hasItems ? () => toggle(row.stage.id) : undefined}
                      >
                        {row.displayLabel}
                      </button>
                      {hasItems && (
                        <button type="button" onClick={() => toggle(row.stage.id)} className="ml-0.5 flex-shrink-0">
                          {isExpanded
                            ? <ChevronDown  className="h-3 w-3 text-muted-foreground" />
                            : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                        </button>
                      )}
                    </div>
                    {row.overdue && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] text-red-600 dark:text-red-400 font-medium mt-0.5">
                        <AlertTriangle className="h-2.5 w-2.5" /> Overdue
                      </span>
                    )}
                    {hasItems && (
                      <span className="text-[9px] text-muted-foreground/60 mt-0.5 block">
                        {row.items.filter(i => i.completed).length}/{row.items.length} tasks
                      </span>
                    )}
                  </div>
                </div>

                {/* % Done */}
                <div className="px-2 py-2.5 border-r flex items-center">
                  <PercentBar pct={row.percentComplete} />
                </div>

                {/* Duration */}
                <div className="px-3 py-2.5 border-r flex items-center text-[12px] text-muted-foreground">
                  {row.isMilestone ? (
                    <span className="text-amber-600 font-medium text-[11px]">Milestone</span>
                  ) : (
                    duration(row.plannedStart, row.plannedEnd)
                  )}
                </div>

                {/* Start */}
                <div className="px-3 py-2.5 border-r flex items-center text-[12px] text-muted-foreground whitespace-nowrap">
                  {fmt(row.plannedStart)}
                </div>

                {/* Finish */}
                <div className={cn(
                  'px-3 py-2.5 border-r flex items-center text-[12px] whitespace-nowrap',
                  row.overdue ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-muted-foreground',
                )}>
                  {fmt(row.displayEnd)}
                  {row.dueDate && row.plannedEnd && row.dueDate !== row.plannedEnd && (
                    <span className="ml-1 text-[9px] text-amber-500 font-medium">(due)</span>
                  )}
                </div>

                {/* Predecessors */}
                <div className="px-3 py-2.5 border-r flex items-start flex-col gap-0.5 justify-center">
                  {row.preds.length === 0 ? (
                    <span className="text-[11px] text-muted-foreground/40">—</span>
                  ) : (
                    row.preds.map((p, pi) => (
                      <span key={pi} className="inline-flex items-center gap-0.5 text-[10px] bg-muted text-muted-foreground rounded px-1 py-0.5 leading-none">
                        {p}
                      </span>
                    ))
                  )}
                </div>

                {/* Status */}
                <div className="px-3 py-2.5 flex items-center">
                  {(() => {
                    const b = STATUS_BADGE[row.status] ?? STATUS_BADGE['upcoming'];
                    return (
                      <span className={cn('text-[10px] font-medium rounded px-1.5 py-0.5 whitespace-nowrap', b.cls)}>
                        {b.label}
                      </span>
                    );
                  })()}
                </div>
              </div>

              {/* ── Checklist sub-rows ── */}
              {isExpanded && hasItems && (
                <div className="bg-muted/10 dark:bg-muted/5 divide-y divide-border/20">
                  {row.items.map((item, itemIdx) => {
                    const itemOverdue = item.plannedEnd && isBefore(parseISO(item.plannedEnd), today) && !item.completed;
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          'grid items-center text-[11px]',
                          item.completed ? 'opacity-60' : '',
                        )}
                        style={{ gridTemplateColumns: '2.5rem 1fr 5rem 7rem 7rem 6.5rem 7rem 5.5rem' }}
                      >
                        {/* ID */}
                        <div className="px-2 py-2 text-center border-r text-[10px] font-mono text-muted-foreground/50">
                          {row.wbs}.{itemIdx + 1}
                        </div>

                        {/* Task name */}
                        <div className="px-3 py-2 border-r flex items-center gap-2 pl-7">
                          {item.completed
                            ? <CheckCircle2 className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                            : <Circle className="h-3 w-3 text-muted-foreground/30 flex-shrink-0" />}
                          <span className={cn('leading-snug', item.completed && 'line-through text-muted-foreground')}>
                            {item.itemText}
                          </span>
                          {itemOverdue && (
                            <span className="ml-auto text-[9px] text-red-500 font-medium flex-shrink-0">Overdue</span>
                          )}
                        </div>

                        {/* % done */}
                        <div className="px-2 py-2 border-r">
                          <PercentBar pct={item.completed ? 100 : 0} />
                        </div>

                        {/* Duration */}
                        <div className="px-3 py-2 border-r text-muted-foreground">
                          {duration(item.plannedStart, item.plannedEnd)}
                        </div>

                        {/* Start */}
                        <div className="px-3 py-2 border-r text-muted-foreground whitespace-nowrap">
                          {fmt(item.plannedStart)}
                        </div>

                        {/* Finish */}
                        <div className={cn('px-3 py-2 border-r whitespace-nowrap', itemOverdue ? 'text-red-500 font-semibold' : 'text-muted-foreground')}>
                          {fmt(item.plannedEnd)}
                        </div>

                        {/* Predecessors — checklist items don't have these */}
                        <div className="px-3 py-2 border-r text-muted-foreground/40">—</div>

                        {/* Status */}
                        <div className="px-3 py-2">
                          <span className={cn(
                            'text-[10px] font-medium rounded px-1.5 py-0.5',
                            item.completed
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                              : 'bg-slate-100 text-slate-500 dark:bg-slate-800',
                          )}>
                            {item.completed ? 'Done' : 'Open'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer legend */}
      <div className="flex items-center gap-4 px-4 py-2 bg-muted/30 border-t text-[10px] text-muted-foreground flex-wrap">
        <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Completed</div>
        <div className="flex items-center gap-1.5"><Clock className="h-3 w-3 text-[#1D3461]" /> Active</div>
        <div className="flex items-center gap-1.5"><Ban className="h-3 w-3 text-orange-500" /> Blocked</div>
        <div className="flex items-center gap-1.5"><SkipForward className="h-3 w-3 text-slate-400" /> Skipped</div>
        <div className="flex items-center gap-1.5"><Diamond className="h-3 w-3 text-amber-500" /> Milestone</div>
        <div className="flex items-center gap-1.5 text-red-500 font-medium"><AlertTriangle className="h-3 w-3" /> Overdue</div>
        <div className="ml-auto text-muted-foreground/50">Click a stage row to expand checklist tasks</div>
      </div>
    </div>
  );
}
