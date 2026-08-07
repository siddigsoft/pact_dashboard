/**
 * React Query keys and hooks for Project data.
 * List fetch is metadata-only; activities load on demand per project.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Project, ProjectActivity, SubActivity } from '@/types/project';
import { normaliseProjectType } from '@/types/project';
import { getFirstStageId } from '@/config/projectFlows';

export const projectQueryKeys = {
  all: ['projects'] as const,
  activities: (projectId: string) => [...projectQueryKeys.all, 'activities', projectId] as const,
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
    createdAt: dbProject.created_at,
    updatedAt: dbProject.updated_at,
  };
}

/** List fetch — no nested activities/sub-activities (those load per project). */
async function fetchProjects(): Promise<Project[]> {
  const { data: projectsData, error: projectsError } = await supabase
    .rpc('get_all_projects');

  if (projectsError) throw new Error(projectsError.message);
  if (!projectsData || projectsData.length === 0) return [];

  return projectsData.map((dbProject: any) => ({
    ...mapDbProjectToProject(dbProject),
    activities: [],
  })) as Project[];
}

function mapActivitiesFromRows(
  activitiesData: any[],
  subActivitiesData: any[],
  assignmentsData: any[]
): ProjectActivity[] {
  const subByActivity: Record<string, SubActivity[]> = {};
  for (const dbSub of subActivitiesData) {
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

  const assigneesByActivity: Record<string, string[]> = {};
  for (const a of assignmentsData) {
    if (!assigneesByActivity[a.activity_id]) assigneesByActivity[a.activity_id] = [];
    const name = (a as any).profiles?.full_name ?? a.user_id;
    assigneesByActivity[a.activity_id].push(name);
  }

  return activitiesData.map((dbActivity) => ({
    id: dbActivity.id,
    name: dbActivity.title ?? '',
    description: dbActivity.description,
    startDate: dbActivity.start_date,
    endDate: dbActivity.end_date,
    dueDate: undefined,
    status: dbActivity.status,
    priority: 'medium' as const,
    progress: 0,
    isActive: true,
    assignedTo: undefined,
    assignees: assigneesByActivity[dbActivity.id] ?? [],
    activityTypeId: undefined,
    subActivities: subByActivity[dbActivity.id] ?? [],
  }));
}

/** On-demand activities (+ subs + assignees) for one project. */
export async function fetchProjectActivities(projectId: string): Promise<ProjectActivity[]> {
  const { data: activitiesData, error } = await supabase
    .from('project_activities')
    .select('id, project_id, title, description, start_date, end_date, status, created_by')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('[fetchProjectActivities]', error.message);
    return [];
  }

  const rows = activitiesData || [];
  const activityIds = rows.map((a: any) => a.id);
  if (!activityIds.length) return [];

  const [{ data: subActivitiesData }, { data: assignmentsData }] = await Promise.all([
    supabase
      .from('sub_activities')
      .select('id, activity_id, name, description, status, is_active, due_date, assigned_to')
      .in('activity_id', activityIds),
    supabase
      .from('project_activity_assignments')
      .select('activity_id, user_id, profiles!user_id(full_name)')
      .in('activity_id', activityIds),
  ]);

  return mapActivitiesFromRows(rows, subActivitiesData || [], assignmentsData || []);
}

/**
 * Keep lazily loaded activities when the list refetch returns empty arrays —
 * UNLESS the per-project activities cache was already set (which means the
 * activities were explicitly loaded, and the current value in cache is authoritative).
 */
export function mergeProjectsPreserveActivities(
  fresh: Project[],
  prev: Project[] | undefined,
  getActivitiesCache?: (id: string) => ProjectActivity[] | undefined
): Project[] {
  if (!prev?.length) return fresh;
  const prevById = new Map(prev.map((p) => [p.id, p]));
  return fresh.map((p) => {
    const prior = prevById.get(p.id);
    const priorLen = prior?.activities?.length ?? 0;
    const freshLen = p.activities?.length ?? 0;
    if (priorLen > 0 && freshLen === 0) {
      // If the per-project activities cache was ever set, use it — it reflects the
      // real current DB state (even if that state is now empty after a delete).
      if (getActivitiesCache) {
        const cached = getActivitiesCache(p.id);
        if (cached !== undefined) {
          return { ...p, activities: cached };
        }
      }
      // Cache was never set → activities haven't been loaded for this project yet;
      // preserve the previously merged activities so they don't flicker away.
      return { ...p, activities: prior!.activities };
    }
    return p;
  });
}

const STALE_MS = 60 * 1000;

export function useProjectsQuery(enabled = true) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: projectQueryKeys.all,
    queryFn: async () => {
      const fresh = await fetchProjects();
      const prev = queryClient.getQueryData<Project[]>(projectQueryKeys.all);
      return mergeProjectsPreserveActivities(fresh, prev, (id) =>
        queryClient.getQueryData<ProjectActivity[]>(projectQueryKeys.activities(id))
      );
    },
    staleTime: STALE_MS,
    placeholderData: (prev) => prev,
    enabled,
  });
}

export function useProjectActivitiesQuery(projectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: projectQueryKeys.activities(projectId ?? ''),
    queryFn: () => fetchProjectActivities(projectId!),
    enabled: !!projectId && enabled,
    staleTime: STALE_MS,
    placeholderData: (prev) => prev,
  });
}

export function useInvalidateProjectsQueries() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: projectQueryKeys.all });
}

/** Immediately patches one project in the TanStack Query cache so consumers
 *  (e.g. getProjectById) see the new data without waiting for a background refetch.
 *  Inserts at the front when the project is not already in the list (create path). */
export function useUpdateProjectInCache() {
  const queryClient = useQueryClient();
  return (updatedProject: Project) => {
    queryClient.setQueryData<Project[]>(projectQueryKeys.all, (old) => {
      if (!old) return [updatedProject];
      const idx = old.findIndex((p) => p.id === updatedProject.id);
      if (idx === -1) return [updatedProject, ...old];
      return old.map((p) => (p.id === updatedProject.id ? { ...p, ...updatedProject } : p));
    });
    // Always update the per-project activities cache — even when the list is now
    // empty (e.g. after a delete), so mergeProjectsPreserveActivities can trust it.
    if (updatedProject.activities !== undefined) {
      queryClient.setQueryData(
        projectQueryKeys.activities(updatedProject.id),
        updatedProject.activities
      );
    }
  };
}

export function useRemoveProjectFromCache() {
  const queryClient = useQueryClient();
  return (projectId: string) => {
    queryClient.setQueryData<Project[]>(projectQueryKeys.all, (old) =>
      old ? old.filter((p) => p.id !== projectId) : old
    );
    queryClient.removeQueries({ queryKey: projectQueryKeys.activities(projectId) });
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
