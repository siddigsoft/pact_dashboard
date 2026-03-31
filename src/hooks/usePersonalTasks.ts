import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type PersonalTaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type PersonalTaskStatus = 'todo' | 'inprogress' | 'done' | 'cancelled';

export interface PersonalTask {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  priority: PersonalTaskPriority;
  status: PersonalTaskStatus;
  dueDate: string | null;
  category: string | null;
  tags: string[] | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePersonalTask {
  title: string;
  description?: string | null;
  priority?: PersonalTaskPriority;
  status?: PersonalTaskStatus;
  dueDate?: string | null;
  category?: string | null;
  tags?: string[] | null;
  notes?: string | null;
}

function mapRow(r: any): PersonalTask {
  return {
    id: r.id,
    userId: r.user_id,
    title: r.title,
    description: r.description ?? null,
    priority: r.priority as PersonalTaskPriority,
    status: r.status as PersonalTaskStatus,
    dueDate: r.due_date ?? null,
    category: r.category ?? null,
    tags: r.tags ?? null,
    notes: r.notes ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const KEY = ['personal_tasks'];

export function usePersonalTasks(userId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<PersonalTask[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('personal_tasks')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(mapRow);
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: async (task: CreatePersonalTask & { userId: string }) => {
      const { error } = await supabase.from('personal_tasks').insert({
        user_id: task.userId,
        title: task.title,
        description: task.description ?? null,
        priority: task.priority ?? 'medium',
        status: task.status ?? 'todo',
        due_date: task.dueDate ?? null,
        category: task.category ?? 'personal',
        tags: task.tags ?? null,
        notes: task.notes ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<CreatePersonalTask> & { id: string }) => {
      const patch: any = { updated_at: new Date().toISOString() };
      if (updates.title !== undefined) patch.title = updates.title;
      if (updates.description !== undefined) patch.description = updates.description;
      if (updates.priority !== undefined) patch.priority = updates.priority;
      if (updates.status !== undefined) patch.status = updates.status;
      if (updates.dueDate !== undefined) patch.due_date = updates.dueDate;
      if (updates.category !== undefined) patch.category = updates.category;
      if (updates.tags !== undefined) patch.tags = updates.tags;
      if (updates.notes !== undefined) patch.notes = updates.notes;
      const { error } = await supabase.from('personal_tasks').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('personal_tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  return {
    tasks: query.data ?? [],
    isLoading: query.isLoading,
    createTask: (task: CreatePersonalTask) => createMutation.mutateAsync({ ...task, userId: userId! }),
    updateTask: (id: string, updates: Partial<CreatePersonalTask>) => updateMutation.mutateAsync({ id, ...updates }),
    deleteTask: (id: string) => deleteMutation.mutateAsync(id),
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

export function useAssignedProjectTasks(userId: string | undefined) {
  return useQuery({
    queryKey: ['assigned_project_tasks', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('project_field_tasks')
        .select('id, title, description, priority, status, due_date, start_date, project_id, stage_id, state_name, locality_name, notes, assigned_to_name, created_at')
        .eq('assigned_to', userId)
        .neq('status', 'cancelled')
        .order('due_date', { ascending: true, nullsFirst: false });
      if (error) throw error;

      const projectIds = [...new Set((data ?? []).map((t: any) => t.project_id).filter(Boolean))];
      let projectNames: Record<string, string> = {};
      if (projectIds.length > 0) {
        const { data: projects } = await supabase
          .from('projects')
          .select('id, name')
          .in('id', projectIds);
        (projects ?? []).forEach((p: any) => { projectNames[p.id] = p.name; });
      }

      return (data ?? []).map((t: any) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        priority: t.priority,
        status: t.status,
        dueDate: t.due_date,
        startDate: t.start_date,
        projectId: t.project_id,
        projectName: projectNames[t.project_id] ?? 'Unknown Project',
        stageId: t.stage_id,
        stateName: t.state_name,
        localityName: t.locality_name,
        notes: t.notes,
        assignedToName: t.assigned_to_name,
        createdAt: t.created_at,
      }));
    },
    enabled: !!userId,
    staleTime: 60_000,
  });
}
