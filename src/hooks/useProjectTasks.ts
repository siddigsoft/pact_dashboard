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

/** Everyone who should hear about activity on a field task (minus the actor). */
function stakeholderIds(
  task: { createdBy?: string | null; assignedTo?: string | null; coAssigneeIds?: string[] },
  actorId?: string | null,
): string[] {
  return Array.from(
    new Set(
      [task.createdBy, task.assignedTo, ...(task.coAssigneeIds ?? [])].filter(
        (id): id is string => !!id && id !== actorId,
      ),
    ),
  );
}

async function notifyFieldTaskActivity(opts: {
  event: string;
  recipientIds: string[];
  titleEn: string;
  titleAr: string;
  messageEn: string;
  messageAr: string;
  projectId: string;
  projectName: string;
  taskTitle: string;
  actorName: string;
  actorId?: string | null;
  priority?: 'urgent' | 'high' | 'normal';
  metadata?: Record<string, string | number | boolean | null | undefined>;
}) {
  const recipients = Array.from(new Set(opts.recipientIds.filter(id => id && id !== opts.actorId)));
  if (recipients.length === 0) return;

  await dispatchNotification({
    event: opts.event,
    recipientIds: recipients,
    titleEn: opts.titleEn,
    titleAr: opts.titleAr,
    messageEn: opts.messageEn,
    messageAr: opts.messageAr,
    priority: opts.priority ?? 'normal',
    entityType: 'project',
    entityId: opts.projectId,
    actionUrl: `/projects/${opts.projectId}?tab=field_tasks`,
    sendEmail: true,
    triggeredBy: opts.actorId ?? undefined,
    triggeredByName: opts.actorName,
    metadata: {
      task_name: opts.taskTitle,
      project_name: opts.projectName,
      actor: opts.actorName,
      ...(opts.metadata ?? {}),
    },
  });
}

async function notifyAssignee(
  assigneeId: string,
  taskTitle: string,
  projectName: string,
  projectId: string,
  assignedByName: string,
  actorId?: string | null,
  creatorId?: string | null,
) {
  // Assignee + creator (if different from actor / assignee)
  const recipients = stakeholderIds(
    { createdBy: creatorId, assignedTo: assigneeId, coAssigneeIds: [] },
    actorId,
  );
  await notifyFieldTaskActivity({
    event: 'project_task_assigned',
    recipientIds: recipients.length ? recipients : [assigneeId],
    titleEn: 'Field task assigned',
    titleAr: 'تم تعيين مهمة ميدانية',
    messageEn: `${assignedByName} assigned field task "${taskTitle}" in "${projectName}"`,
    messageAr: `قام ${assignedByName} بتعيين المهمة الميدانية "${taskTitle}" في "${projectName}"`,
    projectId,
    projectName,
    taskTitle,
    actorName: assignedByName,
    actorId,
  });
}

// Notify all co-assignees that were newly added (+ creator)
async function notifyCoAssignees(
  newIds: string[],
  prevIds: string[],
  currentUserId: string,
  taskTitle: string,
  projectName: string,
  projectId: string,
  assignedByName: string,
  creatorId?: string | null,
) {
  const added = newIds.filter(id => !prevIds.includes(id) && id !== currentUserId);
  const recipients = Array.from(
    new Set([
      ...added,
      ...(creatorId && creatorId !== currentUserId ? [creatorId] : []),
    ]),
  );
  if (recipients.length === 0) return;
  await notifyFieldTaskActivity({
    event: 'project_task_assigned',
    recipientIds: recipients,
    titleEn: 'Field task assigned',
    titleAr: 'تم تعيين مهمة ميدانية',
    messageEn: `${assignedByName} updated assignees on field task "${taskTitle}" in "${projectName}"`,
    messageAr: `قام ${assignedByName} بتحديث المعينين في المهمة الميدانية "${taskTitle}" في "${projectName}"`,
    projectId,
    projectName,
    taskTitle,
    actorName: assignedByName,
    actorId: currentUserId,
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
          assignee:profiles!project_field_tasks_assigned_to_fkey(full_name, role),
          creator:profiles!project_field_tasks_created_by_fkey(full_name)
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
        notifyAssignee(
          task.assignedTo,
          task.title,
          projectName,
          projectId,
          currentUserName,
          currentUserId,
          currentUserId, // creator is the person creating
        ).catch(() => {});
      }
      if (coIds.length > 0) {
        notifyCoAssignees(coIds, [], currentUserId, task.title, projectName, projectId, currentUserName, currentUserId).catch(() => {});
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

      // Notify new primary assignee when reassigned (+ creator)
      const newAssignee = patch.assignedTo;
      if (newAssignee && newAssignee !== prevAssignee && newAssignee !== currentUserId && currentUserName && projectName && task) {
        notifyAssignee(
          newAssignee,
          task.title,
          projectName,
          projectId,
          currentUserName,
          currentUserId,
          task.createdBy,
        ).catch(() => {});
      }

      // Notify newly added co-assignees (+ creator)
      if (patch.coAssigneeIds !== undefined && currentUserId && currentUserName && projectName && task) {
        notifyCoAssignees(
          patch.coAssigneeIds,
          prevCoAssigneeIds ?? task.coAssigneeIds,
          currentUserId,
          task.title,
          projectName,
          projectId,
          currentUserName,
          task.createdBy,
        ).catch(() => {});
      }

      // Status change → creator + assignees (email)
      if (patch.status !== undefined && task && currentUserName && projectName) {
        const recipients = stakeholderIds(task, currentUserId);
        if (patch.status === 'done') {
          notifyFieldTaskActivity({
            event: 'project_task_completed',
            recipientIds: recipients,
            titleEn: 'Field task completed',
            titleAr: 'اكتملت مهمة ميدانية',
            messageEn: `${currentUserName} marked field task "${task.title}" in "${projectName}" as completed.`,
            messageAr: `قام ${currentUserName} بتحديد المهمة الميدانية "${task.title}" في "${projectName}" كمنجزة.`,
            projectId,
            projectName,
            taskTitle: task.title,
            actorName: currentUserName,
            actorId: currentUserId,
          }).catch(() => {});
        } else if (patch.status === 'cancelled') {
          notifyFieldTaskActivity({
            event: 'project_task_status_changed',
            recipientIds: recipients,
            titleEn: 'Field task cancelled',
            titleAr: 'تم إلغاء مهمة ميدانية',
            messageEn: `${currentUserName} cancelled field task "${task.title}" in "${projectName}".`,
            messageAr: `قام ${currentUserName} بإلغاء المهمة الميدانية "${task.title}" في "${projectName}".`,
            projectId,
            projectName,
            taskTitle: task.title,
            actorName: currentUserName,
            actorId: currentUserId,
            metadata: { status: patch.status },
          }).catch(() => {});
        } else {
          notifyFieldTaskActivity({
            event: 'project_task_status_changed',
            recipientIds: recipients,
            titleEn: 'Field task status updated',
            titleAr: 'تم تحديث حالة مهمة ميدانية',
            messageEn: `${currentUserName} changed "${task.title}" in "${projectName}" to ${patch.status}.`,
            messageAr: `غيّر ${currentUserName} حالة "${task.title}" في "${projectName}" إلى ${patch.status}.`,
            projectId,
            projectName,
            taskTitle: task.title,
            actorName: currentUserName,
            actorId: currentUserId,
            metadata: { status: patch.status },
          }).catch(() => {});
        }
      } else if (
        // Non-status edits (notes, dates, costs, etc.) still email the creator + team
        task &&
        currentUserName &&
        projectName &&
        patch.status === undefined &&
        patch.assignedTo === undefined &&
        patch.coAssigneeIds === undefined
      ) {
        const recipients = stakeholderIds(task, currentUserId);
        if (recipients.length > 0) {
          notifyFieldTaskActivity({
            event: 'project_task_updated',
            recipientIds: recipients,
            titleEn: 'Field task updated',
            titleAr: 'تم تحديث مهمة ميدانية',
            messageEn: `${currentUserName} updated field task "${task.title}" in "${projectName}".`,
            messageAr: `حدّث ${currentUserName} المهمة الميدانية "${task.title}" في "${projectName}".`,
            projectId,
            projectName,
            taskTitle: task.title,
            actorName: currentUserName,
            actorId: currentUserId,
          }).catch(() => {});
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
          assignee:profiles!project_field_tasks_assigned_to_fkey(full_name)
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
          assignee:profiles!project_field_tasks_assigned_to_fkey(full_name)
        `)
        .contains('co_assignee_ids', [userId])
        .neq('assigned_to', userId)
        .neq('status', 'cancelled')
        .order('due_date', { ascending: true, nullsFirst: false });
      if (e2) throw e2;

      const projectIds = [...new Set(
        [...(primary ?? []), ...(coAssigned ?? [])]
          .map((r: any) => r.project_id)
          .filter(Boolean)
      )] as string[];
      const projectNameById = new Map<string, string>();
      if (projectIds.length > 0) {
        const { data: projects } = await supabase
          .from('projects')
          .select('id, name')
          .in('id', projectIds);
        for (const p of projects ?? []) {
          projectNameById.set(p.id, p.name);
        }
      }

      const toRow = (r: any): MyFieldTask => ({
        id: r.id,
        projectId: r.project_id,
        projectName: projectNameById.get(r.project_id) ?? null,
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
          assignee:profiles!project_field_tasks_assigned_to_fkey(full_name, role)
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const projectIds = [...new Set((data ?? []).map((r: any) => r.project_id).filter(Boolean))] as string[];
      const projectNameById = new Map<string, string>();
      if (projectIds.length > 0) {
        const { data: projects } = await supabase.from('projects').select('id, name').in('id', projectIds);
        for (const p of projects ?? []) projectNameById.set(p.id, p.name);
      }
      return (data ?? []).map((r: any) => ({
        id: r.id as string,
        projectId: r.project_id as string,
        projectName: projectNameById.get(r.project_id) ?? 'Unknown Project',
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
