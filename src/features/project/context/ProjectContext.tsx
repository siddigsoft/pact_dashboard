import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { Project, ProjectActivity, SubActivity } from '@/types/project';
import { useToast } from '@/shared/hooks/use-toast';
import { ensureValidSession } from '@/lib/session-health';
import { validateProject } from '@/utils/projectValidation';
import { useRealtimeTables } from '@/shared/hooks/useRealtimeResource';
import { useProjectsQuery, useInvalidateProjectsQueries, mapDbProjectToProject, mapProjectToDbProject } from './projectQueries';
import {
  insertProject as dbInsertProject,
  updateProjectRecord as dbUpdateProject,
  updateProjectTeam as dbUpdateProjectTeam,
  deleteProjectRecord as dbDeleteProject,
  insertActivity,
  updateActivity,
  insertSubActivity,
  updateSubActivity,
} from '@/features/project/repository/projectRepository';

interface ProjectContextProps {
  projects: Project[];
  loading: boolean;
  error: string | null;
  currentProject: Project | null;
  setCurrentProject: (project: Project | null) => void;
  addProject: (project: Project) => Promise<Project | null>;
  updateProject: (project: Project) => Promise<void>;
  updateProjectTeam: (projectId: string, team: Project['team']) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  getProjectById: (id: string) => Project | undefined;
  fetchProjects: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextProps>({
  projects: [],
  loading: false,
  error: null,
  currentProject: null,
  setCurrentProject: () => {},
  addProject: async () => null,
  updateProject: async () => {},
  updateProjectTeam: async () => {},
  deleteProject: async () => {},
  getProjectById: () => undefined,
  fetchProjects: async () => {},
});

export const useProjectContext = () => useContext(ProjectContext);

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [error, setError] = useState<string | null>(null);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const { toast } = useToast();
  const invalidateProjects = useInvalidateProjectsQueries();
  const invalidateRef = useRef(invalidateProjects);
  invalidateRef.current = invalidateProjects;

  const projectsQuery = useProjectsQuery(true);
  const projects = projectsQuery.data ?? [];
  const loading = projectsQuery.isLoading;

  useEffect(() => {
    if (projectsQuery.isError && projectsQuery.error) {
      setError(projectsQuery.error instanceof Error ? projectsQuery.error.message : 'Failed to fetch projects');
      toast({ title: 'Error', description: 'Failed to fetch projects. Please try again.', variant: 'destructive' });
    } else if (projectsQuery.data !== undefined && !projectsQuery.isError) {
      setError(null);
    }
  }, [projectsQuery.isError, projectsQuery.error, projectsQuery.data, toast]);

  const fetchProjects = useCallback(async () => {
    await invalidateProjects();
  }, [invalidateProjects]);

  useRealtimeTables(['projects', 'project_activities', 'sub_activities'], () => {
    invalidateRef.current();
  });

  const addProject = async (project: Project): Promise<Project | null> => {
    const session = await ensureValidSession();
    if (!session.success) return null;
    try {
      setError(null);

      const validationResult = validateProject(project);
      if (!validationResult.success) {
        throw new Error(validationResult.errors?.join('\n'));
      }

      const dbProject = mapProjectToDbProject(project) as Record<string, unknown>;
      const createdProject = await dbInsertProject(dbProject);
      
      await invalidateProjects();
      
      toast({
        title: "Success",
        description: "Project created successfully!",
        variant: "success",
      });
      
      return createdProject;
    } catch (err) {
      console.error("Error adding project:", err);
      setError(err instanceof Error ? err.message : 'Failed to add project');
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to create project",
        variant: "destructive",
      });
      return null;
    }
  };

  const updateProject = async (updatedProject: Project) => {
    const session = await ensureValidSession();
    if (!session.success) return;
    try {
      setError(null);

      const validationResult = validateProject(updatedProject);
      if (!validationResult.success) {
        throw new Error(validationResult.errors?.join('\n'));
      }

      const dbProject = { ...mapProjectToDbProject(updatedProject), updated_at: new Date().toISOString() };
      await dbUpdateProject(updatedProject.id, dbProject);

      if (updatedProject.activities && updatedProject.activities.length > 0) {
        for (const activity of updatedProject.activities) {
          const dbActivity = {
            name: activity.name,
            description: activity.description,
            start_date: activity.startDate,
            end_date: activity.endDate,
            status: activity.status,
            is_active: activity.isActive,
            assigned_to: activity.assignedTo,
            project_id: updatedProject.id,
          };

          if (activity.id.startsWith('new-')) {
            const { id: newActivityId } = await insertActivity(dbActivity);
            if (activity.subActivities && activity.subActivities.length > 0 && newActivityId) {
              for (const subActivity of activity.subActivities) {
                await insertSubActivity({
                  name: subActivity.name, description: subActivity.description,
                  status: subActivity.status, is_active: subActivity.isActive,
                  due_date: subActivity.dueDate, assigned_to: subActivity.assignedTo,
                  activity_id: newActivityId,
                });
              }
            }
          } else {
            await updateActivity(activity.id, dbActivity);
            if (activity.subActivities && activity.subActivities.length > 0) {
              for (const subActivity of activity.subActivities) {
                const dbSubActivity = {
                  name: subActivity.name, description: subActivity.description,
                  status: subActivity.status, is_active: subActivity.isActive,
                  due_date: subActivity.dueDate, assigned_to: subActivity.assignedTo,
                  activity_id: activity.id,
                };
                if (subActivity.id.startsWith('new-')) {
                  await insertSubActivity(dbSubActivity);
                } else {
                  await updateSubActivity(subActivity.id, dbSubActivity);
                }
              }
            }
          }
        }
      }
      
      await invalidateProjects();
      
      if (currentProject?.id === updatedProject.id) {
        setCurrentProject(updatedProject);
      }
      
      toast({
        title: "Success",
        description: "Project updated successfully!",
        variant: "success",
      });
    } catch (err) {
      console.error("Error updating project:", err);
      setError(err instanceof Error ? err.message : 'Failed to update project');
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to update project",
        variant: "destructive",
      });
    }
  };

  const updateProjectTeam = async (projectId: string, team: Project['team']) => {
    const session = await ensureValidSession();
    if (!session.success) return;
    try {
      await dbUpdateProjectTeam(projectId, team);

      await invalidateProjects();
      
      if (currentProject?.id === projectId) {
        setCurrentProject({ ...currentProject, team });
      }
    } catch (err) {
      console.error("Error updating project team:", err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to update team",
        variant: "destructive",
      });
      throw err;
    }
  };

  const deleteProject = async (id: string) => {
    const session = await ensureValidSession();
    if (!session.success) return;
    try {
      await dbDeleteProject(id);
      
      await invalidateProjects();
      
      if (currentProject?.id === id) {
        setCurrentProject(null);
      }
      
      toast({
        title: "Success",
        description: "Project deleted successfully!",
        variant: "success",
      });
    } catch (err) {
      console.error("Error deleting project:", err);
      setError(err instanceof Error ? err.message : 'Failed to delete project');
      toast({
        title: "Error",
        description: "Failed to delete project. Please try again.",
        variant: "destructive",
      });
    }
  };

  const getProjectById = (id: string): Project | undefined => {
    const projectInState = projects.find(p => p.id === id);
    if (projectInState) {
      return projectInState;
    }
    
    return undefined;
  };

  return (
    <ProjectContext.Provider 
      value={{
        projects,
        loading,
        error,
        currentProject,
        setCurrentProject,
        addProject,
        updateProject,
        updateProjectTeam,
        deleteProject,
        getProjectById,
        fetchProjects,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
};
