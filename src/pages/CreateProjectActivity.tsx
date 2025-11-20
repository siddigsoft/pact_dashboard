
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ActivityForm from '@/components/project/activity/ActivityForm';
import { useProjectContext } from '@/context/project/ProjectContext';
import { ProjectActivity, Project } from '@/types/project';
import { useToast } from '@/hooks/toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const CreateProjectActivity = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getProjectById, updateProject, fetchProjects, projects, loading } = useProjectContext();
  const { toast } = useToast();
  const [project, setProject] = useState<Project | undefined>(undefined);
  const [isLoadingProject, setIsLoadingProject] = useState(true);
  
  // Effect to fetch projects if not loaded
  useEffect(() => {
    if (projects.length === 0 && !loading) {
      fetchProjects();
    }
  }, []);
  
  // Effect to find the project when projects or projectId changes
  useEffect(() => {
    if (!id) {
      setProject(undefined);
      setIsLoadingProject(false);
      return;
    }
    
    const foundProject = getProjectById(id);
    setProject(foundProject);
    
    // Only set loading to false if we have projects loaded or loading is done
    if (projects.length > 0 || !loading) {
      setIsLoadingProject(false);
    }
  }, [id, projects, loading]);
  
  if (isLoadingProject || (loading && !project)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-4 border-primary/20 animate-[spin_3s_linear_infinite]"></div>
            <div className="absolute inset-[6px] rounded-full border-4 border-t-primary animate-[spin_2s_linear_infinite]"></div>
          </div>
          <p className="text-muted-foreground animate-pulse">Loading project...</p>
        </div>
      </div>
    );
  }
  
  if (!project && !isLoadingProject) {
    return (
      <Alert>
        <AlertTitle>Project Not Found</AlertTitle>
        <AlertDescription>
          The project you are trying to add an activity to does not exist or has been removed.
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate('/projects')}>
              Back to Projects
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  const handleSubmit = async (activity: ProjectActivity) => {
    if (!project) return;
    
    // Update the project with the new activity
    const updatedProject = {
      ...project,
      activities: [...project.activities, activity]
    };
    
    await updateProject(updatedProject);
    toast({
      title: "Activity Created",
      description: "The activity has been added to the project successfully.",
      variant: "success",
    });
    navigate(`/projects/${id}`);
  };

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
          <h1 className="text-2xl font-bold">Create New Activity</h1>
          <p className="text-muted-foreground">
            Add a new activity to the project: {project?.name}
          </p>
        </div>
      </div>

      <ActivityForm 
        projectId={id} 
        onSubmit={handleSubmit} 
      />
    </div>
  );
};

export default CreateProjectActivity;
