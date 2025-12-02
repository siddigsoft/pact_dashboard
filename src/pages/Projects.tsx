import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FolderKanban, CheckCircle2, Clock, BarChart3, AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { GradientStatCard } from '@/components/ui/gradient-stat-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import ProjectList from '@/components/project/ProjectList';
import { useProjectContext } from '@/context/project/ProjectContext';
import { useUserProjects } from '@/hooks/useUserProjects';

const ProjectsPage = () => {
  const navigate = useNavigate();
  const { loading } = useProjectContext();
  const { userProjects, isAdminOrSuperUser, hasProjectAccess } = useUserProjects();

  const handleViewProject = (projectId: string) => {
    navigate(`/projects/${projectId}`);
  };

  const projectStats = useMemo(() => {
    const total = userProjects.length;
    const completed = userProjects.filter(p => p.status === 'completed').length;
    const active = userProjects.filter(p => p.status === 'active').length;
    const pending = userProjects.filter(p => p.status === 'draft' || p.status === 'onHold').length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, completed, active, pending, completionRate };
  }, [userProjects]);

  if (!hasProjectAccess && !loading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <AlertCircle className="h-8 w-8 text-muted-foreground" />
            </div>
            <CardTitle>No Project Access</CardTitle>
            <CardDescription>
              You are not currently assigned to any projects. Please contact your administrator to be added to a project team.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button variant="outline" onClick={() => navigate('/dashboard')}>
              Return to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
            <FolderKanban className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Projects</h1>
            <p className="text-sm text-muted-foreground">
              {isAdminOrSuperUser 
                ? 'Manage all project planning and activity management'
                : 'View your assigned projects and activities'}
            </p>
          </div>
        </div>
        {isAdminOrSuperUser && (
          <Button onClick={() => navigate('/projects/create')} data-testid="button-create-project">
            <Plus className="h-4 w-4 mr-2" />
            Create Project
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <GradientStatCard
          title="Total Projects"
          value={projectStats.total}
          subtitle={isAdminOrSuperUser ? "All projects" : "Your projects"}
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
      
      <div className="bg-card rounded-lg border p-6">
        <ProjectList 
          projects={userProjects} 
          onViewProject={handleViewProject}
          loading={loading}
        />
      </div>
    </div>
  );
};

export default ProjectsPage;
