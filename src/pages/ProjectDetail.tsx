
import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertTriangle, LayoutDashboard, FolderKanban } from 'lucide-react';

import { useProjectContext } from '@/context/project/ProjectContext';
import {
  useProjectActivitiesQuery,
  useUpdateProjectInCache,
} from '@/context/project/projectQueries';
import ProjectDetailComponent from '@/components/project/ProjectDetail';
import { Project } from '@/types/project';
import { useToast } from '@/hooks/toast';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuthorization } from '@/hooks/use-authorization';
import { useUser } from '@/context/user/UserContext';
import { PageLoader } from '@/components/ui/page-loader';

const ProjectDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getProjectById, loading, error, fetchProjects, projects, deleteProject } = useProjectContext();
  const [project, setProject] = useState<Project | undefined>(undefined);
  const { toast } = useToast();
  const [deleting, setDeleting] = useState(false);
  const { isSuperAdmin, hasAnyRole } = useAuthorization();
  const { currentUser, authReady } = useUser();
  const { data: activities } = useProjectActivitiesQuery(id);
  const updateProjectCache = useUpdateProjectInCache();

  // Effect to fetch projects once auth + context are ready
  useEffect(() => {
    if (authReady && projects.length === 0 && !loading) {
      fetchProjects();
    }
  }, [authReady, loading, projects.length]);

  // Effect to find the project when projects or id changes
  useEffect(() => {
    if (!id) {
      setProject(undefined);
      return;
    }
    const foundProject = getProjectById(id);
    if (foundProject && activities) {
      const withActivities = { ...foundProject, activities };
      setProject(withActivities);
      updateProjectCache(withActivities);
    } else {
      setProject(foundProject);
    }
    // Only toast "not found" when we are certain the data is loaded
    if (!foundProject && authReady && !loading && projects.length > 0) {
      toast({
        title: "Project Not Found",
        description: "The requested project could not be found.",
        variant: "destructive",
      });
    }
  }, [id, projects, loading, authReady, activities]);

  const handleEdit = () => {
    navigate(`/projects/${id}/edit`);
  };

  const handleDelete = async () => {
    if (!id) {
      toast({
        title: "Invalid Project",
        description: "Missing project ID. Please try again.",
        variant: "destructive",
      });
      return;
    }
    // Only Super Admin / Admin / FOM, OR the project's own Project Manager may delete.
    const isPrivileged = isSuperAdmin() || hasAnyRole(['admin', 'Admin', 'fom', 'FOM']);
    const isPM = !!project?.team?.projectManager &&
      ((!!currentUser?.id && project.team.projectManager === currentUser.id) ||
        (!!currentUser?.fullName && project.team.projectManager === currentUser.fullName));
    if (!isPrivileged && !isPM) {
      toast({
        title: 'Permission denied',
        description: 'Only Super Admins, Admins, FOM, or the project\'s Project Manager can delete this project.',
        variant: 'destructive',
      });
      return;
    }
    try {
      setDeleting(true);
      await deleteProject(id);
      navigate('/projects');
    } finally {
      setDeleting(false);
    }
  };

  if ((!authReady || loading) && !project) {
    return <PageLoader className="min-h-[60vh]" label="Loading project details…" />;
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto my-12">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {error}
            <div className="mt-4">
              <Button variant="outline" onClick={() => navigate('/projects')}>
                Back to Projects
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Auto-redirect countdown when project is not found
  const [countdown, setCountdown] = useState(5);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!project && authReady && !loading && projects.length > 0) {
      countdownRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownRef.current!);
            navigate('/projects');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [project, authReady, loading, projects.length]);

  if (!project && authReady && !loading) {
    return (
      <div className="max-w-xl mx-auto my-16 px-4">
        <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <AlertTitle className="text-amber-800 dark:text-amber-300">Project Not Found</AlertTitle>
          <AlertDescription className="text-amber-700 dark:text-amber-400">
            This project does not exist or has been removed.
            {projects.length > 0 && (
              <span className="block mt-1 text-xs text-amber-600 dark:text-amber-500">
                Redirecting to Projects in {countdown}s…
              </span>
            )}
            <div className="flex flex-wrap gap-2 mt-4">
              <Button size="sm" variant="outline" onClick={() => navigate('/dashboard')} className="gap-1.5">
                <LayoutDashboard className="h-3.5 w-3.5" />
                Dashboard
              </Button>
              <Button size="sm" variant="outline" onClick={() => navigate('/projects')} className="gap-1.5">
                <FolderKanban className="h-3.5 w-3.5" />
                All Projects
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Ensure project has all required properties before rendering
  const isProjectComplete = project && 
    project.startDate && 
    project.endDate && 
    project.projectType && 
    project.status;

  return (
    <div className="space-y-6 animate-fade-in">
      {isProjectComplete ? (
        <ProjectDetailComponent 
          project={project}
          onEdit={handleEdit}
          onDelete={handleDelete}
          deleting={deleting}
        />
      ) : project ? (
        <div className="max-w-2xl mx-auto my-12">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Incomplete Project Data</AlertTitle>
            <AlertDescription>
              Some required project information is missing. Please update the project details.
              <div className="mt-4">
                <Button variant="outline" onClick={() => navigate(`/projects/${id}/edit`)}>
                  Edit Project
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      ) : null}
    </div>
  );
};

export default ProjectDetailPage;
