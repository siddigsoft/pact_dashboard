/**
 * React Query keys and hooks for Project data.
 * Provides cached, deduplicated fetches for projects with nested activities.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Project, ProjectActivity, SubActivity } from '@/types/project';

export const projectQueryKeys = {
  all: ['projects'] as const,
};

export function mapDbProjectToProject(dbProject: any): Omit<Project, 'activities'> {
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
}

async function fetchProjects(): Promise<Project[]> {
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

  if (projectsError) throw new Error(projectsError.message);

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

  return formattedProjects;
}

const STALE_MS = 60 * 1000;

export function useProjectsQuery(enabled = true) {
  return useQuery({
    queryKey: projectQueryKeys.all,
    queryFn: fetchProjects,
    staleTime: STALE_MS,
    placeholderData: (prev) => prev,
    enabled,
  });
}

export function useInvalidateProjectsQueries() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: projectQueryKeys.all });
}

export function mapProjectToDbProject(project: Project): Record<string, unknown> {
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
}
