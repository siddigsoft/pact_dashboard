import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, GitBranch, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLinkedProjects } from '@/hooks/useLinkedProjects';
import { getProjectFlow } from '@/config/projectFlows';
import { normaliseProjectType } from '@/types/project';

interface Props {
  entityId: string | undefined | null;
  type: 'mmp' | 'site_visit';
  className?: string;
}

export function LinkedProjectsBadge({ entityId, type, className }: Props) {
  const navigate = useNavigate();
  const { data: projects, isLoading } = useLinkedProjects(entityId, type);
  const [dismissed, setDismissed] = useState(false);

  if (isLoading || dismissed || !projects || projects.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-md border border-[#1D3461]/20 bg-[#0F2041]/5 dark:bg-[#1D3461]/10 px-3 py-2',
        className,
      )}
      data-testid="linked-projects-badge-strip"
    >
      <GitBranch className="h-3.5 w-3.5 text-[#1D3461] dark:text-blue-300 flex-shrink-0" />
      <span className="text-xs font-medium text-[#1D3461] dark:text-blue-300 flex-shrink-0">
        Linked Project{projects.length > 1 ? 's' : ''}:
      </span>

      <div className="flex flex-wrap gap-1.5 flex-1">
        {projects.map(project => {
          const flow = getProjectFlow(normaliseProjectType(project.projectType));
          const stageIdx = flow.stages.findIndex(s => s.id === project.currentFlowStage);
          const stageName = flow.stages[stageIdx]?.label ?? project.currentFlowStage;

          return (
            <button
              key={project.id}
              onClick={() => navigate(`/projects/${project.id}`)}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#1D3461]/30 bg-white dark:bg-slate-800 px-2.5 py-0.5 text-xs text-[#1D3461] dark:text-blue-200 hover:bg-[#1D3461]/10 transition-colors"
              data-testid={`linked-project-badge-${project.id}`}
            >
              <span className="font-medium truncate max-w-[120px]">{project.name}</span>
              {project.projectCode && (
                <span className="text-muted-foreground">({project.projectCode})</span>
              )}
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{stageName}</span>
              <ExternalLink className="h-2.5 w-2.5 flex-shrink-0 opacity-60" />
            </button>
          );
        })}
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5 flex-shrink-0 text-muted-foreground hover:text-foreground"
        onClick={() => setDismissed(true)}
        data-testid="button-dismiss-linked-projects"
        aria-label="Dismiss linked projects"
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
