import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ── Types ──────────────────────────────────────────────────────────────────

export type FieldTaskStatus   = 'todo' | 'inprogress' | 'done' | 'cancelled';
export type FieldTaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface FieldTask {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  priority: FieldTaskPriority;
  status: FieldTaskStatus;
  assignedTo: string | null;
  assignedToName: string | null;
  assignedToRole: string | null;
  dueDate: string | null;
  startDate: string | null;
  stateName: string | null;
  localityName: string | null;
  stageId: string | null;
  notes: string | null;
  estimatedHours: number | null;
  actualHours: number | null;
  estimatedCost: number | null;
  actualCost: number | null;
  dependencies: string[];
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFieldTask {
  title: string;
  description?: string;
  priority: FieldTaskPriority;
  status?: FieldTaskStatus;
  assignedTo?: string | null;
  dueDate?: string | null;
  startDate?: string | null;
  stateName?: string | null;
  localityName?: string | null;
  stageId?: string | null;
  notes?: string;
  estimatedHours?: number | null;
  actualHours?: number | null;
  estimatedCost?: number | null;
  actualCost?: number | null;
  dependencies?: string[];
}

// ── Notification helper ────────────────────────────────────────────────────

async function notifyAssignee(
  assigneeId: string,
  taskTitle: string,
  projectName: string,
  projectId: string,
  assignedByName: string,
) {
  await supabase.from('notifications').insert({
    recipient_id: assigneeId,
    user_id: assigneeId,
    title_en: 'Field task assigned to you',
    title_ar: 'تم تعيين مهمة ميدانية لك',
    message_en: `${assignedByName} assigned you to field task "${taskTitle}" in "${projectName}"`,
    message_ar: `قام ${assignedByName} بتعيينك في المهمة الميدانية "${taskTitle}" في "${projectName}"`,
    priority: 'normal',
    action_url: `/projects/${projectId}`,
    entity_id: projectId,
    entity_type: 'project',
    event_type: 'project_field_task_assigned',
    status: 'pending',
    email_sent: false,
  });
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useProjectTasks(projectId: string) {
  const qc = useQueryClient();
  const key = ['project_field_tasks', projectId];

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<FieldTask[]> => {
      const { data, error } = await supabase
        .from('project_field_tasks')
        .select(`
          id, project_id, title, description, priority, status,
          assigned_to, due_date, start_date, state_name, locality_name,
          stage_id, notes, created_by, created_at, updated_at,
          estimated_hours, actual_hours, estimated_cost, actual_cost, dependencies,
          assignee:profiles!assigned_to(full_name, role),
          creator:profiles!created_by(full_name)
        `)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        projectId: r.project_id,
        title: r.title,
        description: r.description,
        priority: r.priority,
        status: r.status,
        assignedTo: r.assigned_to,
        assignedToName: r.assignee?.full_name ?? null,
        assignedToRole: r.assignee?.role ?? null,
        dueDate: r.due_date,
        startDate: r.start_date,
        stateName: r.state_name,
        localityName: r.locality_name,
        stageId: r.stage_id,
        notes: r.notes,
        estimatedHours: r.estimated_hours ?? null,
        actualHours: r.actual_hours ?? null,
        estimatedCost: r.estimated_cost ?? null,
        actualCost: r.actual_cost ?? null,
        dependencies: r.dependencies ?? [],
        createdBy: r.created_by,
        createdByName: r.creator?.full_name ?? null,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    },
    staleTime: 30_000,
    enabled: !!projectId,
  });

  const createMutation = useMutation({
    mutationFn: async ({
      task,
      currentUserId,
      projectName,
      currentUserName,
    }: {
      task: CreateFieldTask;
      currentUserId: string;
      projectName: string;
      currentUserName: string;
    }) => {
      const { data, error } = await supabase
        .from('project_field_tasks')
        .insert({
          project_id: projectId,
          title: task.title,
          description: task.description ?? null,
          priority: task.priority,
          status: task.status ?? 'todo',
          assigned_to: task.assignedTo ?? null,
          due_date: task.dueDate ?? null,
          start_date: task.startDate ?? null,
          state_name: task.stateName ?? null,
          locality_name: task.localityName ?? null,
          stage_id: task.stageId ?? null,
          notes: task.notes ?? null,
          estimated_hours: task.estimatedHours ?? null,
          actual_hours: task.actualHours ?? null,
          estimated_cost: task.estimatedCost ?? null,
          actual_cost: task.actualCost ?? null,
          dependencies: task.dependencies ?? [],
          created_by: currentUserId,
        })
        .select()
        .single();
      if (error) throw error;

      if (task.assignedTo && task.assignedTo !== currentUserId) {
        notifyAssignee(task.assignedTo, task.title, projectName, projectId, currentUserName).catch(() => {});
      }
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      patch,
      currentUserId,
      projectName,
      currentUserName,
      prevAssignee,
    }: {
      id: string;
      patch: Partial<CreateFieldTask & { status: FieldTaskStatus }>;
      currentUserId?: string;
      projectName?: string;
      currentUserName?: string;
      prevAssignee?: string | null;
    }) => {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (patch.title          !== undefined) updates.title           = patch.title;
      if (patch.description    !== undefined) updates.description     = patch.description;
      if (patch.priority       !== undefined) updates.priority        = patch.priority;
      if (patch.status         !== undefined) updates.status          = patch.status;
      if (patch.assignedTo     !== undefined) updates.assigned_to     = patch.assignedTo;
      if (patch.dueDate        !== undefined) updates.due_date        = patch.dueDate;
      if (patch.startDate      !== undefined) updates.start_date      = patch.startDate;
      if (patch.stateName      !== undefined) updates.state_name      = patch.stateName;
      if (patch.localityName   !== undefined) updates.locality_name   = patch.localityName;
      if (patch.notes          !== undefined) updates.notes           = patch.notes;
      if (patch.stageId        !== undefined) updates.stage_id        = patch.stageId;
      if (patch.estimatedHours !== undefined) updates.estimated_hours = patch.estimatedHours;
      if (patch.actualHours    !== undefined) updates.actual_hours    = patch.actualHours;
      if (patch.estimatedCost  !== undefined) updates.estimated_cost  = patch.estimatedCost;
      if (patch.actualCost     !== undefined) updates.actual_cost     = patch.actualCost;
      if (patch.dependencies   !== undefined) updates.dependencies    = patch.dependencies;

      const { error } = await supabase
        .from('project_field_tasks')
        .update(updates)
        .eq('id', id);
      if (error) throw error;

      const newAssignee = patch.assignedTo;
      if (newAssignee && newAssignee !== prevAssignee && newAssignee !== currentUserId && currentUserName && projectName) {
        const cached = qc.getQueryData<FieldTask[]>(key);
        const task = cached?.find(t => t.id === id);
        if (task) {
          notifyAssignee(newAssignee, task.title, projectName, projectId, currentUserName).catch(() => {});
        }
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('project_field_tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return {
    tasks: query.data ?? [],
    isLoading: query.isLoading,
    createTask: (task: CreateFieldTask, currentUserId: string, projectName: string, currentUserName: string) =>
      createMutation.mutateAsync({ task, currentUserId, projectName, currentUserName }),
    updateTask: (
      id: string,
      patch: Partial<CreateFieldTask & { status: FieldTaskStatus }>,
      meta?: { currentUserId?: string; projectName?: string; currentUserName?: string; prevAssignee?: string | null },
    ) => updateMutation.mutateAsync({ id, patch, ...meta }),
    deleteTask: (id: string) => deleteMutation.mutateAsync(id),
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
