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
    clientType: (dbProject.client_type ?? 'internal') as 'internal' | 'customer',
    clientName: dbProject.client_name ?? undefined,
    partnerId: dbProject.partner_id ?? undefined,
    crmOpportunityId: dbProject.crm_opportunity_id ?? undefined,
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
    .select('id, project_id, name, description, start_date, end_date, due_date, status, is_active, assigned_to, priority, progress, activity_type_id')
    .in('project_id', projectIds);

  const activityIds = (activitiesData || []).map((a: any) => a.id);

  // Fetch sub-activities separately
  const { data: subActivitiesData } = activityIds.length > 0
    ? await supabase
        .from('sub_activities')
        .select('id, activity_id, name, description, status, is_active, due_date, assigned_to')
        .in('activity_id', activityIds)
    : { data: [] };

  // Fetch multi-assignees from project_activity_assignments
  const { data: assignmentsData } = activityIds.length > 0
    ? await supabase
        .from('project_activity_assignments')
        .select('activity_id, user_id, profiles!user_id(full_name)')
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

  // Group assignees by activity_id
  const assigneesByActivity: Record<string, string[]> = {};
  for (const a of (assignmentsData || [])) {
    if (!assigneesByActivity[a.activity_id]) assigneesByActivity[a.activity_id] = [];
    const name = (a as any).profiles?.full_name ?? a.user_id;
    assigneesByActivity[a.activity_id].push(name);
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
      dueDate: dbActivity.due_date ?? undefined,
      status: dbActivity.status,
      priority: dbActivity.priority ?? 'medium',
      progress: dbActivity.progress ?? 0,
      isActive: dbActivity.is_active,
      assignedTo: dbActivity.assigned_to,
      assignees: assigneesByActivity[dbActivity.id] ?? [],
      activityTypeId: dbActivity.activity_type_id ?? undefined,
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

/** Immediately patches one project in the TanStack Query cache so consumers
 *  (e.g. getProjectById) see the new data without waiting for a background refetch. */
export function useUpdateProjectInCache() {
  const queryClient = useQueryClient();
  return (updatedProject: Project) => {
    queryClient.setQueryData<Project[]>(projectQueryKeys.all, (old) => {
      if (!old) return old;
      return old.map(p => p.id === updatedProject.id ? { ...p, ...updatedProject } : p);
    });
  };
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
    client_type: project.clientType,
    client_name: project.clientName,
    partner_id: project.partnerId || null,
    ...(project.crmOpportunityId ? { crm_opportunity_id: project.crmOpportunityId } : {}),
    related_mmps: project.relatedMMPs ?? [],
    related_site_visits: project.relatedSiteVisits ?? [],
  };
}
