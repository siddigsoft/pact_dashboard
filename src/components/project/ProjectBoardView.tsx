import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { differenceInDays, parseISO, isValid } from 'date-fns';
import { AlertTriangle, GitBranch, User, Calendar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Project } from '@/types/project';
import { getProjectFlow, PROJECT_TYPE_OPTIONS } from '@/config/projectFlows';

interface BoardFilters {
  type: string;
  status: string;
  pm: string;
  search: string;
}

interface ProjectBoardViewProps {
  projects: Project[];
  filters: BoardFilters;
}

const TYPE_COLORS: Record<string, string> = {
  tpm: 'bg-blue-100 text-blue-800 border-blue-200',
  baseline_survey: 'bg-green-100 text-green-800 border-green-200',
  endline_survey: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  assessment: 'bg-amber-100 text-amber-800 border-amber-200',
  evaluation: 'bg-purple-100 text-purple-800 border-purple-200',
  research: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  capacity_building: 'bg-rose-100 text-rose-800 border-rose-200',
  compliance: 'bg-orange-100 text-orange-800 border-orange-200',
  infrastructure: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  other: 'bg-gray-100 text-gray-800 border-gray-200',
};

function getTypeLabel(type: string): string {
  return PROJECT_TYPE_OPTIONS.find(o => o.value === type)?.label ?? type;
}

function getDaysRemaining(endDate: string): number | null {
  if (!endDate) return null;
  try {
    const d = parseISO(endDate);
    if (!isValid(d)) return null;
    return differenceInDays(d, new Date());
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

function getStageProgress(project: Project): { stageName: string; pct: number; stageIdx: number; totalStages: number } | null {
  const flowDef = getProjectFlow(project.projectType);
  const stages = flowDef.stages;
  const currentStageId = project.currentFlowStage ?? stages[0]?.id;
  const idx = stages.findIndex(s => s.id === currentStageId);
  if (idx === -1 || !stages[idx]) return null;
  return {
    stageName: stages[idx].label,
    pct: Math.round(((idx + 1) / stages.length) * 100),
    stageIdx: idx + 1,
    totalStages: stages.length,
  };
}

interface ProjectCardProps {
  project: Project;
  onClick: () => void;
}

const ProjectCard: React.FC<ProjectCardProps> = ({ project, onClick }) => {
  const stalled = isStalled(project);
  const stageInfo = getStageProgress(project);
  const daysRemaining = getDaysRemaining(project.endDate);
  const typeLabel = getTypeLabel(project.projectType);
  const typeColorClass = TYPE_COLORS[project.projectType] ?? TYPE_COLORS.other;

  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-all duration-200 border text-sm ${stalled ? 'border-amber-400 bg-amber-50/30 dark:bg-amber-950/10' : 'border-border/60'}`}
      onClick={onClick}
      data-testid={`board-card-project-${project.id}`}
    >
      <CardHeader className="p-3 pb-1.5 space-y-0">
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-semibold text-sm leading-tight line-clamp-2 flex-1" title={project.name}>
            {project.name}
          </h4>
          {stalled && (
            <AlertTriangle
              className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5"
              title="No activity in 14+ days"
              data-testid={`icon-stalled-${project.id}`}
            />
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
          <Badge variant="outline" className={`text-xs px-1.5 py-0 h-5 ${typeColorClass}`}>
            {typeLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-1.5 space-y-2">
        {project.team?.projectManager && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <User className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{project.team.projectManager}</span>
          </div>
        )}
        {(project.clientName || project.clientType) && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate">{project.clientName ?? project.clientType}</span>
          </div>
        )}
        {daysRemaining !== null && (
          <div className="flex items-center gap-1.5 text-xs">
            <Calendar className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
            <span className={daysRemaining < 0 ? 'text-red-600 font-medium' : daysRemaining <= 14 ? 'text-amber-600 font-medium' : 'text-muted-foreground'}>
              {daysRemaining < 0
                ? `${Math.abs(daysRemaining)}d overdue`
                : daysRemaining === 0
                ? 'Due today'
                : `${daysRemaining}d remaining`}
            </span>
          </div>
        )}
        {stageInfo && (
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <GitBranch className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{stageInfo.stageName}</span>
              <span className="ml-auto flex-shrink-0 font-mono">{stageInfo.pct}%</span>
            </div>
            <div className="w-full h-1 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-[#1D3461] transition-all duration-300"
                style={{ width: `${stageInfo.pct}%` }}
              />
            </div>
          </div>
        )}
        {stalled && (
          <div className="flex items-center gap-1 rounded-sm bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3 flex-shrink-0" />
            <span>Stalled — 14+ days inactive</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const ProjectBoardView: React.FC<ProjectBoardViewProps> = ({ projects, filters }) => {
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
    });
  }, [projects, filters]);

  const columns = useMemo(() => {
    const stageMap: Record<string, Project[]> = {};
    const stageOrder: string[] = [];
    const stageLabels: Record<string, string> = {};

    for (const project of filtered) {
      const flowDef = getProjectFlow(project.projectType);
      const stages = flowDef.stages;
      const currentStageId = project.currentFlowStage ?? stages[0]?.id;
      const stage = stages.find(s => s.id === currentStageId);
      const stageLabel = stage?.label ?? 'Unknown';
      const key = `${currentStageId}__${stageLabel}`;

      if (!stageMap[key]) {
        stageMap[key] = [];
        stageOrder.push(key);
        stageLabels[key] = stageLabel;
      }
      stageMap[key].push(project);
    }

    return stageOrder.map(key => ({
      key,
      label: stageLabels[key],
      projects: stageMap[key],
    }));
  }, [filtered]);

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <GitBranch className="h-12 w-12 text-muted-foreground/40 mb-3" />
        <p className="text-muted-foreground">No projects match the current filters.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-4 min-w-max">
        {columns.map(col => (
          <div
            key={col.key}
            className="flex flex-col gap-2 w-72 flex-shrink-0"
            data-testid={`board-column-${col.key}`}
          >
            <div className="flex items-center justify-between px-1 py-1.5">
              <h3 className="text-sm font-semibold text-foreground truncate">{col.label}</h3>
              <Badge variant="secondary" className="ml-2 flex-shrink-0 text-xs h-5 min-w-[1.25rem] flex items-center justify-center">
                {col.projects.length}
              </Badge>
            </div>
            <div className="space-y-2">
              {col.projects.map(project => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onClick={() => navigate(`/projects/${project.id}`)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProjectBoardView;
