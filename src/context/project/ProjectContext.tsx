import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Project, ProjectActivity, SubActivity, ProjectTeamMember } from '@/types/project';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { validateProject } from '@/utils/projectValidation';
import { useRealtimeTables } from '@/hooks/useRealtimeResource';

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
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const { toast } = useToast();

  const mapDbProjectToProject = (dbProject: any): Project => {
    return {
      id: dbProject.id,
      name: dbProject.name,
      projectCode: dbProject.project_code,
      description: dbProject.description,
      projectType: dbProject.project_type,
      status: dbProject.status,
      startDate: dbProject.start_date,
      endDate: dbProject.end_date,
      budget: dbProject.budget,
      location: dbProject.location,
      team: dbProject.team,
      activities: [],
      createdAt: dbProject.created_at,
      updatedAt: dbProject.updated_at,
    };
  };

  const mapProjectToDbProject = (project: Project): any => {
    return {
      name: project.name,
      project_code: project.projectCode,
      description: project.description,
      project_type: project.projectType,
      status: project.status,
      start_date: project.startDate,
      end_date: project.endDate,
      budget: project.budget,
      location: project.location,
      team: project.team,
    };
  };

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select(`
          id,
          name,
          project_code,
          description,
          project_type,
          status,
          start_date,
          end_date,
          budget,
          location,
          team,
          created_at,
          updated_at,
          project_activities (
            id,
            name,
            description,
            start_date,
            end_date,
            status,
            is_active,
            assigned_to,
            sub_activities (
              id,
              name,
              description,
              status,
              is_active,
              due_date,
              assigned_to
            )
          )
        `);

      if (projectsError) {
        throw new Error(projectsError.message);
      }

      const formattedProjects: Project[] = (projectsData || []).map((dbProject: any) => {
        const project = mapDbProjectToProject(dbProject);

        const activities: ProjectActivity[] = (dbProject.project_activities || []).map((dbActivity: any) => {
          const subActivities: SubActivity[] = (dbActivity.sub_activities || []).map((dbSub: any) => ({
            id: dbSub.id,
            name: dbSub.name,
            description: dbSub.description,
            status: dbSub.status,
            isActive: dbSub.is_active,
            dueDate: dbSub.due_date,
            assignedTo: dbSub.assigned_to,
          }));

          return {
            id: dbActivity.id,
            name: dbActivity.name,
            description: dbActivity.description,
            startDate: dbActivity.start_date,
            endDate: dbActivity.end_date,
            status: dbActivity.status,
            isActive: dbActivity.is_active,
            assignedTo: dbActivity.assigned_to,
            subActivities,
          };
        });

        return { ...project, activities } as Project;
      });

      setProjects(formattedProjects);
    } catch (err) {
      console.error("Error fetching projects:", err);
      setError(err instanceof Error ? err.message : 'Failed to fetch projects');
      toast({
        title: "Error",
        description: "Failed to fetch projects. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useRealtimeTables(['projects', 'project_activities', 'sub_activities'], fetchProjects);

  const addProject = async (project: Project): Promise<Project | null> => {
    try {
      setLoading(true);
      setError(null);

      const validationResult = validateProject(project);
      if (!validationResult.success) {
        throw new Error(validationResult.errors?.join('\n'));
      }

      const dbProject = mapProjectToDbProject(project);
      const { data, error } = await supabase
        .from('projects')
        .insert(dbProject)
        .select()
        .single();
        
      if (error) {
        throw new Error(error.message);
      }
      
      if (!data) {
        throw new Error('No data returned from insert');
      }
      
      // Map the returned data to a Project object
      const createdProject = mapDbProjectToProject(data);
      
      await fetchProjects();
      
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
    } finally {
      setLoading(false);
    }
  };

  const updateProject = async (updatedProject: Project) => {
    try {
      setLoading(true);
      setError(null);

      const validationResult = validateProject(updatedProject);
      if (!validationResult.success) {
        throw new Error(validationResult.errors?.join('\n'));
      }

      const dbProject = {
        ...mapProjectToDbProject(updatedProject),
        updated_at: new Date().toISOString()
      };
      const { error } = await supabase
        .from('projects')
        .update(dbProject)
        .eq('id', updatedProject.id);
        
      if (error) {
        throw new Error(error.message);
      }

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

          // If it's a newly created activity, insert and get its real UUID
          if (activity.id.startsWith('new-')) {
            const { data: insertedActivity, error: insertActivityError } = await supabase
              .from('project_activities')
              .insert(dbActivity)
              .select()
              .single();

            if (insertActivityError) {
              throw new Error(insertActivityError.message);
            }

            const newActivityId = insertedActivity?.id;

            // Insert sub-activities if provided
            if (activity.subActivities && activity.subActivities.length > 0 && newActivityId) {
              for (const subActivity of activity.subActivities) {
                const dbSubActivity = {
                  name: subActivity.name,
                  description: subActivity.description,
                  status: subActivity.status,
                  is_active: subActivity.isActive,
                  due_date: subActivity.dueDate,
                  assigned_to: subActivity.assignedTo,
                  activity_id: newActivityId,
                };
                await supabase.from('sub_activities').insert(dbSubActivity);
              }
            }
          } else {
            // Existing activity: update record
            const { error: updateActivityError } = await supabase
              .from('project_activities')
              .update(dbActivity)
              .eq('id', activity.id);

            if (updateActivityError) {
              throw new Error(updateActivityError.message);
            }

            // Upsert sub-activities for existing activity
            if (activity.subActivities && activity.subActivities.length > 0) {
              for (const subActivity of activity.subActivities) {
                const dbSubActivity = {
                  name: subActivity.name,
                  description: subActivity.description,
                  status: subActivity.status,
                  is_active: subActivity.isActive,
                  due_date: subActivity.dueDate,
                  assigned_to: subActivity.assignedTo,
                  activity_id: activity.id,
                };
                
                if (subActivity.id.startsWith('new-')) {
                  await supabase.from('sub_activities').insert(dbSubActivity);
                } else {
                  const { error: updateSubError } = await supabase
                    .from('sub_activities')
                    .update(dbSubActivity)
                    .eq('id', subActivity.id);
                  if (updateSubError) {
                    throw new Error(updateSubError.message);
                  }
                }
              }
            }
          }
        }
      }
      
      await fetchProjects();
      
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
    } finally {
      setLoading(false);
    }
  };

  const updateProjectTeam = async (projectId: string, team: Project['team']) => {
    try {
      const { error } = await supabase
        .from('projects')
        .update({ 
          team,
          updated_at: new Date().toISOString() 
        })
        .eq('id', projectId);
        
      if (error) {
        throw new Error(error.message);
      }

      setProjects(prev => prev.map(p => 
        p.id === projectId ? { ...p, team } : p
      ));
      
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
    try {
      setLoading(true);
      
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', id);
        
      if (error) {
        throw new Error(error.message);
      }
      
      setProjects(projects.filter(p => p.id !== id));
      
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
    } finally {
      setLoading(false);
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
