import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FolderKanban, CheckCircle2, Clock, BarChart3 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { GradientStatCard } from '@/components/ui/gradient-stat-card';
import ProjectList from '@/components/project/ProjectList';
import { useProjectContext } from '@/context/project/ProjectContext';
import { useAppContext } from '@/context/AppContext';

const ProjectsPage = () => {
  const navigate = useNavigate();
  const { projects, loading } = useProjectContext();
  const { roles } = useAppContext();

  const normalizedRoles = (roles || []).map(r => String(r).toLowerCase());
  const canAccessFieldOpManager =
    normalizedRoles.includes('admin') || normalizedRoles.includes('fieldopmanager');

  const handleViewProject = (projectId: string) => {
    navigate(`/projects/${projectId}`);
  };

  const projectStats = useMemo(() => {
    const total = projects.length;
    const completed = projects.filter(p => p.workflowStatus === 'completed').length;
    const active = projects.filter(p => p.workflowStatus === 'active' || p.workflowStatus === 'in_progress').length;
    const pending = projects.filter(p => p.workflowStatus === 'pending').length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, completed, active, pending, completionRate };
  }, [projects]);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
            <FolderKanban className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Projects</h1>
            <p className="text-sm text-muted-foreground">
              Manage project planning and activity management
            </p>
          </div>
        </div>
        <Button onClick={() => navigate('/projects/create')} data-testid="button-create-project">
          <Plus className="h-4 w-4 mr-2" />
          Create Project
        </Button>
      </div>

      {/* Statistics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <GradientStatCard
          title="Total Projects"
          value={projectStats.total}
          subtitle="All projects"
          icon={FolderKanban}
          color="blue"
          data-testid="card-stat-total-projects"
        />

        <GradientStatCard
          title="Completed"
          value={projectStats.completed}
          subtitle={`${projectStats.completionRate}% completion`}
          icon={CheckCircle2}
          color="green"
          data-testid="card-stat-completed-projects"
        />

        <GradientStatCard
          title="Active Projects"
          value={projectStats.active}
          subtitle="Currently in progress"
          icon={BarChart3}
          color="cyan"
          data-testid="card-stat-active-projects"
        />

        <GradientStatCard
          title="Pending"
          value={projectStats.pending}
          subtitle="Awaiting start"
          icon={Clock}
          color="orange"
          data-testid="card-stat-pending-projects"
        />
      </div>
      
      {/* Project List */}
      <div className="bg-card rounded-lg border p-6">
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
