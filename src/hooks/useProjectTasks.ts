import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { dispatchNotification } from '@/lib/notify';

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
  coAssigneeIds: string[];
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
  coAssigneeIds?: string[];
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

// Simplified type for the My Tasks page
export interface MyFieldTask {
  id: string;
  projectId: string;
  projectName: string | null;
  title: string;
  description: string | null;
  priority: FieldTaskPriority;
  status: FieldTaskStatus;
  assignedTo: string | null;
  assignedToName: string | null;
  coAssigneeIds: string[];
  dueDate: string | null;
  createdAt: string;
}

// ── Notification helpers ────────────────────────────────────────────────────

async function notifyAssignee(
  assigneeId: string,
  taskTitle: string,
  projectName: string,
  projectId: string,
  assignedByName: string,
) {
  await dispatchNotification({
    event: 'project_task_assigned',
    recipientIds: [assigneeId],
    titleEn: 'Field task assigned to you',
    titleAr: 'تم تعيين مهمة ميدانية لك',
    messageEn: `${assignedByName} assigned you to field task "${taskTitle}" in "${projectName}"`,
    messageAr: `قام ${assignedByName} بتعيينك في المهمة الميدانية "${taskTitle}" في "${projectName}"`,
    priority: 'normal',
    entityType: 'project',
    entityId: projectId,
    actionUrl: `/projects/${projectId}?tab=field_tasks`,
    sendEmail: true,
    triggeredByName: assignedByName,
    metadata: {
      task_name: taskTitle,
      project_name: projectName,
      actor: assignedByName,
    },
  });
}

// Notify all co-assignees that were newly added
async function notifyCoAssignees(
  newIds: string[],
  prevIds: string[],
  currentUserId: string,
  taskTitle: string,
  projectName: string,
  projectId: string,
  assignedByName: string,
) {
  const added = newIds.filter(id => !prevIds.includes(id) && id !== currentUserId);
  if (added.length === 0) return;
  await dispatchNotification({
    event: 'project_task_assigned',
    recipientIds: added,
    titleEn: 'Field task assigned to you',
    titleAr: 'تم تعيين مهمة ميدانية لك',
    messageEn: `${assignedByName} also assigned you to field task "${taskTitle}" in "${projectName}"`,
    messageAr: `قام ${assignedByName} أيضاً بتعيينك في المهمة الميدانية "${taskTitle}" في "${projectName}"`,
    priority: 'normal',
    entityType: 'project',
    entityId: projectId,
    actionUrl: `/projects/${projectId}?tab=field_tasks`,
    sendEmail: true,
    triggeredByName: assignedByName,
    metadata: {
      task_name: taskTitle,
      project_name: projectName,
      actor: assignedByName,
    },
  });
}

// ── Main hook ───────────────────────────────────────────────────────────────

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
          assigned_to, co_assignee_ids, due_date, start_date, state_name, locality_name,
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
        coAssigneeIds: r.co_assignee_ids ?? [],
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
      const coIds = (task.coAssigneeIds ?? []).filter(id => id !== task.assignedTo);
      const { data, error } = await supabase
        .from('project_field_tasks')
        .insert({
          project_id: projectId,
          title: task.title,
          description: task.description ?? null,
          priority: task.priority,
          status: task.status ?? 'todo',
          assigned_to: task.assignedTo ?? null,
          co_assignee_ids: coIds,
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
      if (coIds.length > 0) {
        notifyCoAssignees(coIds, [], currentUserId, task.title, projectName, projectId, currentUserName).catch(() => {});
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
      prevCoAssigneeIds,
    }: {
      id: string;
      patch: Partial<CreateFieldTask & { status: FieldTaskStatus }>;
      currentUserId?: string;
      projectName?: string;
      currentUserName?: string;
      prevAssignee?: string | null;
      prevCoAssigneeIds?: string[];
    }) => {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (patch.title          !== undefined) updates.title           = patch.title;
      if (patch.description    !== undefined) updates.description     = patch.description;
      if (patch.priority       !== undefined) updates.priority        = patch.priority;
      if (patch.status         !== undefined) updates.status          = patch.status;
      if (patch.assignedTo     !== undefined) updates.assigned_to     = patch.assignedTo;
      if (patch.coAssigneeIds  !== undefined) updates.co_assignee_ids = (patch.coAssigneeIds ?? []).filter(id => id !== patch.assignedTo);
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

      const cached = qc.getQueryData<FieldTask[]>(key);
      const task = cached?.find(t => t.id === id);

      // Notify new primary assignee when reassigned
      const newAssignee = patch.assignedTo;
      if (newAssignee && newAssignee !== prevAssignee && newAssignee !== currentUserId && currentUserName && projectName && task) {
        notifyAssignee(newAssignee, task.title, projectName, projectId, currentUserName).catch(() => {});
      }

      // Notify newly added co-assignees
      if (patch.coAssigneeIds !== undefined && currentUserId && currentUserName && projectName && task) {
        notifyCoAssignees(
          patch.coAssigneeIds,
          prevCoAssigneeIds ?? task.coAssigneeIds,
          currentUserId,
          task.title,
          projectName,
          projectId,
          currentUserName,
        ).catch(() => {});
      }

      // Notify assignee when task is marked done
      if (patch.status === 'done' && task?.assignedTo && projectName && currentUserName) {
        const assigneeId = task.assignedTo;
        dispatchNotification({
          event: 'project_task_completed',
          recipientIds: [assigneeId, ...task.coAssigneeIds].filter(id => id !== currentUserId),
          titleEn: 'Your field task was marked done',
          titleAr: 'تم تحديد مهمتك الميدانية كمنجزة',
          messageEn: `Field task "${task.title}" in "${projectName}" has been marked as completed.`,
          messageAr: `تم تحديد المهمة الميدانية "${task.title}" في "${projectName}" كمنجزة.`,
          priority: 'normal',
          entityType: 'project',
          entityId: projectId,
          actionUrl: `/projects/${projectId}?tab=field_tasks`,
          sendEmail: true,
          triggeredByName: currentUserName,
          metadata: { task_name: task.title, project_name: projectName, actor: currentUserName },
        }).catch(() => {});
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
      meta?: { currentUserId?: string; projectName?: string; currentUserName?: string; prevAssignee?: string | null; prevCoAssigneeIds?: string[] },
    ) => updateMutation.mutateAsync({ id, patch, ...meta }),
    deleteTask: (id: string) => deleteMutation.mutateAsync(id),
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

// ── My Tasks page hook — tasks assigned to me (primary or co-assignee) ──────

export function useMyProjectFieldTasks(userId: string | undefined) {
  return useQuery({
    queryKey: ['my_project_field_tasks', userId],
    queryFn: async (): Promise<MyFieldTask[]> => {
      if (!userId) return [];
      // Fetch tasks where user is primary assignee
      const { data: primary, error: e1 } = await supabase
        .from('project_field_tasks')
        .select(`
          id, project_id, title, description, priority, status,
          assigned_to, co_assignee_ids, due_date, created_at,
          project:projects!project_id(name),
          assignee:profiles!assigned_to(full_name)
        `)
        .eq('assigned_to', userId)
        .neq('status', 'cancelled')
        .order('due_date', { ascending: true, nullsFirst: false });
      if (e1) throw e1;

      // Fetch tasks where user is a co-assignee
      const { data: coAssigned, error: e2 } = await supabase
        .from('project_field_tasks')
        .select(`
          id, project_id, title, description, priority, status,
          assigned_to, co_assignee_ids, due_date, created_at,
          project:projects!project_id(name),
          assignee:profiles!assigned_to(full_name)
        `)
        .contains('co_assignee_ids', [userId])
        .neq('assigned_to', userId)
        .neq('status', 'cancelled')
        .order('due_date', { ascending: true, nullsFirst: false });
      if (e2) throw e2;

      const toRow = (r: any): MyFieldTask => ({
        id: r.id,
        projectId: r.project_id,
        projectName: (r.project as any)?.name ?? null,
        title: r.title,
        description: r.description,
        priority: r.priority as FieldTaskPriority,
        status: r.status as FieldTaskStatus,
        assignedTo: r.assigned_to,
        assignedToName: (r.assignee as any)?.full_name ?? null,
        coAssigneeIds: r.co_assignee_ids ?? [],
        dueDate: r.due_date,
        createdAt: r.created_at,
      });

      const seen = new Set<string>();
      const rows: MyFieldTask[] = [];
      for (const r of [...(primary ?? []), ...(coAssigned ?? [])]) {
        if (!seen.has(r.id)) { seen.add(r.id); rows.push(toRow(r)); }
      }
      return rows;
    },
    enabled: !!userId,
    staleTime: 30_000,
  });
}

// ── Admin hook — all project field tasks across all projects ─────────────────

export function useAllProjectFieldTasks() {
  return useQuery({
    queryKey: ['all_project_field_tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_field_tasks')
        .select(`
          id, project_id, title, priority, status,
          assigned_to, co_assignee_ids, due_date, created_at,
          project:projects!project_id(name),
          assignee:profiles!assigned_to(full_name, role)
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id as string,
        projectId: r.project_id as string,
        projectName: (r.project as any)?.name as string ?? 'Unknown Project',
        title: r.title as string,
        priority: r.priority as FieldTaskPriority,
        status: r.status as FieldTaskStatus,
        assignedTo: r.assigned_to as string | null,
        assignedToName: (r.assignee as any)?.full_name as string ?? null,
        assignedToRole: (r.assignee as any)?.role as string ?? null,
        coAssigneeIds: (r.co_assignee_ids ?? []) as string[],
        dueDate: r.due_date as string | null,
        createdAt: r.created_at as string,
      }));
    },
    staleTime: 30_000,
  });
}
