/**
 * Project repository — all Supabase DB access for the project domain.
 * Pure async functions: no React, no hooks, no toasts.
 */
import { supabase } from '@/integrations/supabase/client';
import type { Project, ProjectActivity, SubActivity } from '@/types/project';

// ─── Transforms ───────────────────────────────────────────────────────────────

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

// ─── Fetchers ─────────────────────────────────────────────────────────────────

export async function fetchProjects(): Promise<Project[]> {
  const { data: projectsData, error: projectsError } = await supabase
    .from('projects')
    .select(`
      id, name, project_code, description, project_type, status,
      start_date, end_date, budget, location, team, created_at, updated_at,
      project_activities (
        id, name, description, start_date, end_date, status, is_active, assigned_to,
        sub_activities (
          id, name, description, status, is_active, due_date, assigned_to
        )
      )
    `);

  if (projectsError) throw new Error(projectsError.message);

  return (projectsData || []).map((dbProject: any) => {
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
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function insertProject(payload: Record<string, unknown>): Promise<Project> {
  const { data, error } = await supabase
    .from('projects')
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('No data returned from insert');
  return { ...mapDbProjectToProject(data), activities: [] } as Project;
}

export async function updateProjectRecord(id: string, payload: Record<string, unknown>): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .update(payload)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function updateProjectTeam(projectId: string, team: Project['team']): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .update({ team, updated_at: new Date().toISOString() })
    .eq('id', projectId);
  if (error) throw new Error(error.message);
}

export async function deleteProjectRecord(id: string): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function insertActivity(payload: Record<string, unknown>): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('project_activities')
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id };
}

export async function updateActivity(id: string, payload: Record<string, unknown>): Promise<void> {
  const { error } = await supabase
    .from('project_activities')
    .update(payload)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function insertSubActivity(payload: Record<string, unknown>): Promise<void> {
  const { error } = await supabase
    .from('sub_activities')
    .insert(payload);
  if (error) throw new Error(error.message);
}

export async function updateSubActivity(id: string, payload: Record<string, unknown>): Promise<void> {
  const { error } = await supabase
    .from('sub_activities')
    .update(payload)
    .eq('id', id);
  if (error) throw new Error(error.message);
}
