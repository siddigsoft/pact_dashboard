import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { differenceInDays, parseISO, isValid, format, addDays, startOfMonth, endOfMonth, eachMonthOfInterval } from 'date-fns';
import { AlertTriangle, Calendar, GitBranch } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Project } from '@/types/project';
import { getProjectFlow, PROJECT_TYPE_OPTIONS } from '@/config/projectFlows';

interface BoardFilters {
  type: string;
  status: string;
  pm: string;
  search: string;
  dateFrom?: string;
  dateTo?: string;
}

interface ProjectTimelineViewProps {
  projects: Project[];
  filters: BoardFilters;
}

const TYPE_COLORS: Record<string, string> = {
  tpm: '#3b82f6',
  baseline_survey: '#22c55e',
  endline_survey: '#10b981',
  assessment: '#f59e0b',
  evaluation: '#a855f7',
  research: '#6366f1',
  capacity_building: '#f43f5e',
  compliance: '#f97316',
  infrastructure: '#06b6d4',
  other: '#6b7280',
};

function safeParseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  try {
    const d = parseISO(dateStr);
    return isValid(d) ? d : null;
  } catch {
    return null;
  }
}

function isStalled(project: Project): boolean {
  const updated = project.updatedAt;
  if (!updated) return false;
  try {
    const d = parseISO(updated);
    if (!isValid(d)) return false;
    return differenceInDays(new Date(), d) >= 14 && project.status === 'active';
  } catch {
    return false;
  }
}

function getTypeLabel(type: string): string {
  return PROJECT_TYPE_OPTIONS.find(o => o.value === type)?.label ?? type;
}

const ROW_H = 36;
const LABEL_W = 220;
const DAY_PX = 4;

const ProjectTimelineView: React.FC<ProjectTimelineViewProps> = ({ projects, filters }) => {
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    return projects.filter(p => {
      if (filters.type !== 'all' && p.projectType !== filters.type) return false;
      if (filters.status !== 'all' && p.status !== filters.status) return false;
      if (filters.pm !== 'all' && p.team?.projectManager !== filters.pm) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const matches = p.name.toLowerCase().includes(q) || p.projectCode.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    }).filter(p => safeParseDate(p.startDate) !== null || safeParseDate(p.endDate) !== null);
  }, [projects, filters]);

  const { timelineStart, timelineEnd, totalDays, monthMarkers } = useMemo(() => {
    if (filtered.length === 0) {
      const today = new Date();
      const start = startOfMonth(addDays(today, -30));
      const end = endOfMonth(addDays(today, 60));
      const total = differenceInDays(end, start) + 1;
      const months = eachMonthOfInterval({ start, end });
      return {
        timelineStart: start,
        timelineEnd: end,
        totalDays: total,
        monthMarkers: months,
      };
    }

    let minDate: Date | null = null;
    let maxDate: Date | null = null;

    for (const p of filtered) {
      const s = safeParseDate(p.startDate);
      const e = safeParseDate(p.endDate);
      if (s && (!minDate || s < minDate)) minDate = s;
      if (e && (!maxDate || e > maxDate)) maxDate = e;
    }

    const fallbackToday = new Date();
    const start = startOfMonth(minDate ? addDays(minDate, -14) : addDays(fallbackToday, -30));
    const end = endOfMonth(maxDate ? addDays(maxDate, 14) : addDays(fallbackToday, 60));
    const total = differenceInDays(end, start) + 1;
    const months = eachMonthOfInterval({ start, end });

    return { timelineStart: start, timelineEnd: end, totalDays: total, monthMarkers: months };
  }, [filtered]);

  const totalWidth = totalDays * DAY_PX;
  const today = new Date();
  const todayOffset = differenceInDays(today, timelineStart) * DAY_PX;

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Calendar className="h-12 w-12 text-muted-foreground/40 mb-3" />
        <p className="text-muted-foreground">No projects with valid dates match the current filters.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex min-w-max">
        {/* Fixed label column */}
        <div className="flex-shrink-0" style={{ width: LABEL_W }}>
          {/* Header spacer */}
          <div className="h-9 border-b border-border/60 bg-muted/30 flex items-center px-2">
            <span className="text-xs text-muted-foreground font-medium">Project</span>
          </div>
          {filtered.map((project) => {
            const stalled = isStalled(project);
            return (
              <div
                key={project.id}
                className="flex items-center gap-1.5 px-2 border-b border-border/40 cursor-pointer hover:bg-muted/30 transition-colors"
                style={{ height: ROW_H }}
                onClick={() => navigate(`/projects/${project.id}`)}
                data-testid={`timeline-row-${project.id}`}
              >
                {stalled && <AlertTriangle className="h-3 w-3 text-amber-500 flex-shrink-0" />}
                <span className="text-xs font-medium truncate" title={project.name}>
                  {project.name}
                </span>
              </div>
            );
          })}
        </div>

        {/* Scrollable timeline */}
        <div className="overflow-x-auto flex-1">
          <div style={{ width: totalWidth, minWidth: totalWidth }}>
            {/* Month header */}
            <div className="h-9 border-b border-border/60 bg-muted/30 flex relative">
              {monthMarkers.map((month) => {
                const offset = differenceInDays(month, timelineStart) * DAY_PX;
                const monthEnd = endOfMonth(month);
                const daysInRange = Math.min(
                  differenceInDays(monthEnd, month) + 1,
                  differenceInDays(timelineEnd, month) + 1,
                );
                const width = daysInRange * DAY_PX;
                return (
                  <div
                    key={month.toISOString()}
                    className="absolute top-0 bottom-0 flex items-center px-1 border-r border-border/30"
                    style={{ left: offset, width }}
                  >
                    <span className="text-xs text-muted-foreground font-medium truncate">
                      {format(month, 'MMM yyyy')}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Rows */}
            {filtered.map((project) => {
              const startDate = safeParseDate(project.startDate);
              const endDate = safeParseDate(project.endDate);
              const stalled = isStalled(project);
              const color = TYPE_COLORS[project.projectType] ?? TYPE_COLORS.other;

              const barLeft = startDate ? differenceInDays(startDate, timelineStart) * DAY_PX : 0;
              const barWidth = startDate && endDate
                ? Math.max(2, differenceInDays(endDate, startDate) * DAY_PX)
                : startDate
                ? 60
                : 60;

              const flowDef = getProjectFlow(project.projectType);
              const stages = flowDef.stages;
              const currentStageId = project.currentFlowStage ?? stages[0]?.id;
              const stageIdx = stages.findIndex(s => s.id === currentStageId);
              const pct = stageIdx >= 0 ? ((stageIdx + 1) / stages.length) : 0;

              return (
                <div
                  key={project.id}
                  className="relative border-b border-border/40 cursor-pointer hover:bg-muted/10 transition-colors"
                  style={{ height: ROW_H, width: totalWidth }}
                  onClick={() => navigate(`/projects/${project.id}`)}
                >
                  {/* Today line */}
                  {todayOffset >= 0 && todayOffset <= totalWidth && (
                    <div
                      className="absolute top-0 bottom-0 w-px bg-red-400/60 z-10 pointer-events-none"
                      style={{ left: todayOffset }}
                    />
                  )}

                  {/* Project bar */}
                  {(startDate || endDate) && (
                    <div
                      className="absolute top-1/2 -translate-y-1/2 rounded-sm flex items-center overflow-hidden shadow-sm"
                      style={{
                        left: barLeft,
                        width: barWidth,
                        height: 22,
                        background: stalled
                          ? `repeating-linear-gradient(45deg, ${color}99, ${color}99 4px, ${color}33 4px, ${color}33 8px)`
                          : color,
                        opacity: project.status === 'completed' ? 0.6 : 1,
                        outline: stalled ? `2px solid #f59e0b` : undefined,
                      }}
                      title={`${project.name} | ${getTypeLabel(project.projectType)} | ${stalled ? 'STALLED' : ''}`}
                    >
                      {/* Progress overlay */}
                      <div
                        className="absolute inset-0 bg-black/20"
                        style={{ width: `${pct * 100}%` }}
                      />
                      <span className="relative z-10 px-1.5 text-white text-xs font-medium truncate drop-shadow">
                        {project.name}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-4 px-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="w-3 h-3 rounded-sm bg-red-400/60" />
          Today
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <AlertTriangle className="h-3 w-3 text-amber-500" />
          Stalled (14+ days inactive)
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="w-6 h-3 rounded-sm" style={{ background: 'repeating-linear-gradient(45deg, #6b728099, #6b728099 4px, #6b728033 4px, #6b728033 8px)', outline: '2px solid #f59e0b' }} />
          Stalled bar style
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <GitBranch className="h-3 w-3" />
          Dark overlay = stage progress
        </div>
      </div>
    </div>
  );
};

export default ProjectTimelineView;
