import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FolderKanban, CheckCircle2, Clock, BarChart3 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { GradientStatCard } from '@/components/ui/gradient-stat-card';
import ProjectList from '@/components/project/ProjectList';
import { useProjectContext } from '@/context/project/ProjectContext';

const ProjectsPage = () => {
  const navigate = useNavigate();
  const { projects, loading } = useProjectContext();

  const handleViewProject = (projectId: string) => {
    navigate(`/projects/${projectId}`);
  };

  const projectStats = useMemo(() => {
    const total = projects.length;
    const completed = projects.filter(p => p.status === 'completed').length;
    const active = projects.filter(p => p.status === 'active' || p.status === 'onHold').length;
    const pending = projects.filter(p => p.status === 'draft').length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, completed, active, pending, completionRate };
  }, [projects]);

  return (
    <div className="min-h-screen bg-background p-3 md:p-4 space-y-3">
      {/* Compact Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-md bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center flex-shrink-0">
            <FolderKanban className="h-4.5 w-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Projects</h1>
            <p className="text-xs text-muted-foreground">
              Manage project planning and activities
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => navigate('/projects/create')} data-testid="button-create-project">
          <Plus className="h-4 w-4 mr-1.5" />
          Create Project
        </Button>
      </div>

      {/* Condensed Statistics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <GradientStatCard
          title="Total"
          value={projectStats.total}
          subtitle="All projects"
          icon={FolderKanban}
          color="blue"
          size="sm"
          data-testid="card-stat-total-projects"
        />

        <GradientStatCard
          title="Completed"
          value={projectStats.completed}
          subtitle={`${projectStats.completionRate}% rate`}
          icon={CheckCircle2}
          color="green"
          size="sm"
          data-testid="card-stat-completed-projects"
        />

        <GradientStatCard
          title="Active"
          value={projectStats.active}
          subtitle="In progress"
          icon={BarChart3}
          color="cyan"
          size="sm"
          data-testid="card-stat-active-projects"
        />

        <GradientStatCard
          title="Pending"
          value={projectStats.pending}
          subtitle="Awaiting start"
          icon={Clock}
          color="orange"
          size="sm"
          data-testid="card-stat-pending-projects"
        />
      </div>
      
      {/* Project List - no extra card wrapper for cleaner look */}
      <div className="bg-card rounded-md border p-3">
        <ProjectList 
          projects={projects} 
          onViewProject={handleViewProject}
          loading={loading}
        />
      </div>
    </div>
  );
};

export default ProjectsPage;
