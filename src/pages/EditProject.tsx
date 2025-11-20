
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import ProjectForm from '@/components/project/ProjectForm';
import { useProjectContext } from '@/context/project/ProjectContext';
import { Project } from '@/types/project';
import { useToast } from '@/hooks/toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const EditProject = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getProjectById, updateProject, fetchProjects, loading, projects } = useProjectContext();
  const [project, setProject] = useState<Project | undefined>(undefined);
  const { toast } = useToast();

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
    
    // Show toast and redirect if project not found after loading is complete
    if (!foundProject && !loading && projects.length > 0) {
      toast({
        title: "Project Not Found",
        description: "The project could not be found. You will be redirected to the projects page.",
        variant: "destructive",
      });
      
      // Delay navigation slightly to give the user time to read the toast
      setTimeout(() => {
        navigate('/projects');
      }, 2000);
    }
  }, [id, projects, loading]);

  const handleSubmit = async (updatedProject: Project) => {
    try {
      await updateProject(updatedProject);
      navigate(`/projects/${updatedProject.id}`);
      toast({
        title: "Project Updated",
        description: "The project has been updated successfully.",
        variant: "success",
      });
    } catch (error) {
      console.error('Error updating project:', error);
      toast({
        title: "Update Failed",
        description: "There was an error updating the project. Please try again.",
        variant: "destructive",
      });
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

  if (!project && !loading) {
    return (
      <Alert>
        <AlertTitle>Project Not Found</AlertTitle>
        <AlertDescription>
          The project you are trying to edit does not exist or has been removed.
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate('/projects')}>
              Back to Projects
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(`/projects/${id}`)}
          className="hover:bg-muted"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Edit Project</h1>
          <p className="text-muted-foreground">
            Update project details and information
          </p>
        </div>
      </div>

      {project && (
        <ProjectForm 
          onSubmit={handleSubmit} 
          initialData={project} 
          isEditing={true} 
        />
      )}
    </div>
  );
};

export default EditProject;
