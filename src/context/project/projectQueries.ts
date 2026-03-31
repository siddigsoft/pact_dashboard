/**
 * React Query keys and hooks for Project data.
 * Provides cached, deduplicated fetches for projects with nested activities.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Project, ProjectActivity, SubActivity } from '@/types/project';
import { normaliseProjectType } from '@/types/project';
import { getFirstStageId } from '@/config/projectFlows';

export const projectQueryKeys = {
  all: ['projects'] as const,
};

export function mapDbProjectToProject(dbProject: any): Omit<Project, 'activities'> {
  const projectType = normaliseProjectType(dbProject.project_type);
  return {
    id: dbProject.id,
    name: dbProject.name,
    projectCode: dbProject.project_code,
    description: dbProject.description,
    projectType,
    status: dbProject.status,
    startDate: dbProject.start_date,
    endDate: dbProject.end_date,
    currentFlowStage: dbProject.current_flow_stage ?? getFirstStageId(projectType),
    customFlowStages: dbProject.custom_flow_stages ?? null,
    relatedMMPs: dbProject.related_mmps ?? [],
    relatedSiteVisits: dbProject.related_site_visits ?? [],
    archived: dbProject.archived ?? false,
    budget: dbProject.budget,
    location: dbProject.location,
    team: dbProject.team,
    activities: [],
    createdAt: dbProject.created_at,
    updatedAt: dbProject.updated_at,
  };
}

async function fetchProjects(): Promise<Project[]> {
  // Use RPC function to bypass PostgREST schema cache for new columns
  const { data: projectsData, error: projectsError } = await supabase
    .rpc('get_all_projects');

  if (projectsError) throw new Error(projectsError.message);
  if (!projectsData || projectsData.length === 0) return [];

  const projectIds = projectsData.map((p: any) => p.id);

  // Fetch activities separately
  const { data: activitiesData } = await supabase
    .from('project_activities')
    .select('id, project_id, name, description, start_date, end_date, status, is_active, assigned_to')
    .in('project_id', projectIds);

  const activityIds = (activitiesData || []).map((a: any) => a.id);

  // Fetch sub-activities separately
  const { data: subActivitiesData } = activityIds.length > 0
    ? await supabase
        .from('sub_activities')
        .select('id, activity_id, name, description, status, is_active, due_date, assigned_to')
        .in('activity_id', activityIds)
    : { data: [] };

  // Group sub-activities by activity_id
  const subByActivity: Record<string, SubActivity[]> = {};
  for (const dbSub of (subActivitiesData || [])) {
    if (!subByActivity[dbSub.activity_id]) subByActivity[dbSub.activity_id] = [];
    subByActivity[dbSub.activity_id].push({
      id: dbSub.id,
      name: dbSub.name,
      description: dbSub.description,
      status: dbSub.status,
      isActive: dbSub.is_active,
      dueDate: dbSub.due_date,
      assignedTo: dbSub.assigned_to,
    });
  }

  // Group activities by project_id
  const activitiesByProject: Record<string, ProjectActivity[]> = {};
  for (const dbActivity of (activitiesData || [])) {
    if (!activitiesByProject[dbActivity.project_id]) activitiesByProject[dbActivity.project_id] = [];
    activitiesByProject[dbActivity.project_id].push({
      id: dbActivity.id,
      name: dbActivity.name,
      description: dbActivity.description,
      startDate: dbActivity.start_date,
      endDate: dbActivity.end_date,
      status: dbActivity.status,
      isActive: dbActivity.is_active,
      assignedTo: dbActivity.assigned_to,
      subActivities: subByActivity[dbActivity.id] ?? [],
    });
  }

  return projectsData.map((dbProject: any) => ({
    ...mapDbProjectToProject(dbProject),
    activities: activitiesByProject[dbProject.id] ?? [],
  })) as Project[];
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
    current_flow_stage: project.currentFlowStage,
    custom_flow_stages: project.customFlowStages ?? null,
    related_mmps: project.relatedMMPs ?? [],
    related_site_visits: project.relatedSiteVisits ?? [],
    budget: project.budget,
    location: project.location,
    team: project.team,
  };
}
