
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProjectContext } from '@/context/project/ProjectContext';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { TeamCompositionManager } from '@/components/project/team/TeamCompositionManager';
import { ProjectTeamMember, Project } from '@/types/project';
import { useToast } from '@/hooks/toast';

const ProjectTeamManagement = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getProjectById, updateProjectTeam, fetchProjects, loading, projects } = useProjectContext();
  const { toast } = useToast();
  const [project, setProject] = useState<Project | undefined>(undefined);
  const [isLoadingProject, setIsLoadingProject] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Fetch on mount if needed
  useEffect(() => {
    if (projects.length === 0 && !loading) {
      fetchProjects();
    }
  }, []);

  // Resolve project when deps change
  useEffect(() => {
    if (!id) {
      setProject(undefined);
      setIsLoadingProject(false);
      return;
    }
    const foundProject = getProjectById(id);
    setProject(foundProject);
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
  
  if (!project && !loading) {
    return (
      <Alert>
        <AlertTitle>Project Not Found</AlertTitle>
        <AlertDescription>
          The project you are trying to manage team members for does not exist or has been removed.
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate('/projects')}>
              Back to Projects
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  const handleTeamChange = async (teamMembers: ProjectTeamMember[]) => {
    if (!project || !id) return;
    
    try {
      setIsSaving(true);
      const newTeam = {
        ...project.team,
        teamComposition: teamMembers
      };
      
      await updateProjectTeam(id, newTeam);
      
      setProject(prev => prev ? { ...prev, team: newTeam } : prev);
      
      toast({
        title: "Team Updated",
        description: "The project team has been updated successfully.",
        variant: "success",
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to update team. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
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
          <h1 className="text-2xl font-bold">Manage Team</h1>
          <p className="text-muted-foreground">
            Add or remove team members for project: {project?.name}
          </p>
        </div>
      </div>

      {project && (
        <TeamCompositionManager 
          project={project}
          onTeamChange={handleTeamChange}
        />
      )}
    </div>
  );
};

export default ProjectTeamManagement;
