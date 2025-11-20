
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';

import { useProjectContext } from '@/context/project/ProjectContext';
import ProjectDetailComponent from '@/components/project/ProjectDetail';
import { Project } from '@/types/project';
import { useToast } from '@/hooks/toast';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const ProjectDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getProjectById, loading, error, fetchProjects, projects, deleteProject } = useProjectContext();
  const [project, setProject] = useState<Project | undefined>(undefined);
  const { toast } = useToast();
  const [deleting, setDeleting] = useState(false);

  // Effect to fetch projects if not loaded
  useEffect(() => {
    if (projects.length === 0 && !loading) {
      fetchProjects();
    }
  }, []);

  // Effect to find the project when projects or id changes
  useEffect(() => {
    if (!id) {
      setProject(undefined);
      return;
    }
    
    const foundProject = getProjectById(id);
    setProject(foundProject);
    
    // Show toast if project not found after loading is complete
    if (!foundProject && !loading && projects.length > 0) {
      toast({
        title: "Project Not Found",
        description: "The requested project could not be found.",
        variant: "destructive",
      });
    }
  }, [id, projects, loading]);

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
    try {
      setDeleting(true);
      await deleteProject(id);
      navigate('/projects');
    } finally {
      setDeleting(false);
    }
  };

  if (loading && !project) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-4 border-primary/20 animate-[spin_3s_linear_infinite]"></div>
            <div className="absolute inset-[6px] rounded-full border-4 border-t-primary animate-[spin_2s_linear_infinite]"></div>
          </div>
          <p className="text-muted-foreground animate-pulse">Loading project details...</p>
        </div>
      </div>
    );
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

  if (!project && !loading) {
    return (
      <div className="max-w-2xl mx-auto my-12">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Project Not Found</AlertTitle>
          <AlertDescription>
            The project you are looking for does not exist or has been removed.
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
