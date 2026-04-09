import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Project, ProjectActivity, SubActivity } from '@/types/project';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ensureValidSession } from '@/lib/session-health';
import { validateProject } from '@/utils/projectValidation';
import { useRealtimeTables } from '@/hooks/useRealtimeResource';
import { useProjectsQuery, useInvalidateProjectsQueries, mapDbProjectToProject, mapProjectToDbProject } from './projectQueries';
import { getFirstStageId } from '@/config/projectFlows';
import { useUser } from '@/context/user/UserContext';
import { normalizeRole } from '@/utils/roleMapping';

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

  const { currentUser, roles: userRoles } = useUser();

  const projectsQuery = useProjectsQuery(true);
  const allProjects = projectsQuery.data ?? [];
  const loading = projectsQuery.isLoading;

  /** Admins and super admins see every project; everyone else only sees projects they are part of. */
  const projects = useMemo(() => {
    if (!currentUser) return allProjects;

    // Collect all role strings for this user
    const allRoleStrings: string[] = [
      currentUser.role ?? '',
      ...(Array.isArray((currentUser as any).roles) ? (currentUser as any).roles : []),
      ...(Array.isArray(userRoles) ? userRoles : []),
    ].filter(Boolean);

    const normalised = allRoleStrings.map(r => normalizeRole(r)).filter(Boolean);
    const canSeeAll =
      normalised.includes('superAdmin') ||
      normalised.includes('admin') ||
      allRoleStrings.some(r =>
        ['super_admin', 'superAdmin', 'SuperAdmin', 'admin', 'Admin'].includes(r)
      );

    if (canSeeAll) return allProjects;

    const uid = currentUser.id;
    return allProjects.filter((p: any) =>
      p?.team?.projectManager === uid ||
      p?.team?.projectManagerId === uid ||
      (Array.isArray(p?.team?.members) && p.team.members.includes(uid)) ||
      (Array.isArray(p?.team?.teamComposition) &&
        p.team.teamComposition.some((m: any) => m?.userId === uid))
    );
  }, [allProjects, currentUser, userRoles]);

  useEffect(() => {
    if (projectsQuery.isError && projectsQuery.error) {
      const errMsg = projectsQuery.error instanceof Error ? projectsQuery.error.message : 'Failed to fetch projects';
      setError(errMsg);
      console.error('[ProjectContext] Failed to fetch projects:', projectsQuery.error);
      toast({ title: 'Error', description: errMsg, variant: 'destructive' });
    } else if (projectsQuery.data !== undefined && !projectsQuery.isError) {
      setError(null);
    }
  }, [projectsQuery.isError, projectsQuery.error, projectsQuery.data]);

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

      const firstStage = getFirstStageId(project.projectType);
      const dbProject = mapProjectToDbProject(project) as Record<string, unknown>;
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

      // Set the initial flow stage via RPC (bypasses PostgREST schema cache)
      const initialStage = project.currentFlowStage ?? firstStage;
      await supabase.rpc('update_project_flow_stage', {
        p_id: data.id,
        p_stage: initialStage,
        p_custom_stages: null,
      });
      
      const createdProject = {
        ...mapDbProjectToProject(data),
        currentFlowStage: initialStage,
        activities: [],
      } as Project;

      // If converting from a CRM opportunity, update the opportunity stage to reflect the project
      if (project.crmOpportunityId) {
        const newStage = project.projectType === 'proposal' ? 'proposal' : 'negotiating';
        await supabase
          .from('crm_opportunities')
          .update({ stage: newStage, updated_at: new Date().toISOString() })
          .eq('id', project.crmOpportunityId);
      }
      
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
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', id);
        
      if (error) {
        throw new Error(error.message);
      }
      
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
