import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isToday, isBefore, parseISO, isValid, startOfDay } from 'date-fns';

export type PersonalTaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type PersonalTaskStatus = 'todo' | 'inprogress' | 'done' | 'cancelled';

export interface PersonalTask {
  id: string;
  userId: string;
  assignedTo: string | null;
  assignedToName: string | null;
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
  assignedTo?: string | null;
  assignedToName?: string | null;
}

function mapRow(r: any): PersonalTask {
  return {
    id: r.id,
    userId: r.user_id,
    assignedTo: r.assigned_to ?? null,
    assignedToName: r.assigned_to_name ?? null,
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

function notifPriority(p: PersonalTaskPriority): string {
  return p === 'critical' ? 'high' : p === 'high' ? 'high' : 'medium';
}

async function sendTaskNotification(opts: {
  userId: string;
  taskId: string;
  title: string;
  priority: PersonalTaskPriority;
  event: 'created_due_today' | 'created_overdue' | 'completed' | 'assigned';
}) {
  const msgs: Record<typeof opts.event, { titleEn: string; titleAr: string; msgEn: string; msgAr: string }> = {
    created_due_today: {
      titleEn: `Task Due Today`,
      titleAr: `مهمة مستحقة اليوم`,
      msgEn: `Your task "${opts.title}" is due today. Complete it on My Tasks.`,
      msgAr: `مهمتك "${opts.title}" مستحقة اليوم. أكملها من صفحة مهامي.`,
    },
    created_overdue: {
      titleEn: `Overdue Task Created`,
      titleAr: `تم إنشاء مهمة متأخرة`,
      msgEn: `Task "${opts.title}" was added with a past due date — mark it done or update the date.`,
      msgAr: `تمت إضافة مهمة "${opts.title}" بتاريخ استحقاق منتهٍ — أكملها أو عدّل التاريخ.`,
    },
    completed: {
      titleEn: `Task Completed`,
      titleAr: `تم إتمام المهمة`,
      msgEn: `You completed "${opts.title}". Great work!`,
      msgAr: `أتممت مهمة "${opts.title}". عمل رائع!`,
    },
    assigned: {
      titleEn: `New Task Assigned`,
      titleAr: `تم تعيين مهمة جديدة`,
      msgEn: `You have been assigned a new task: "${opts.title}".`,
      msgAr: `تم تعيين مهمة جديدة لك: "${opts.title}".`,
    },
  };

  const m = msgs[opts.event];
  try {
    await supabase.from('notifications').insert({
      event_type: 'personal_task',
      entity_type: 'personal_task',
      entity_id: opts.taskId,
      recipient_id: opts.userId,
      triggered_by: opts.userId,
      title_en: m.titleEn,
      title_ar: m.titleAr,
      message_en: m.msgEn,
      message_ar: m.msgAr,
      priority: notifPriority(opts.priority),
      status: 'unread',
      action_url: '/my-tasks',
    });
  } catch {
    // Non-critical — don't throw
  }
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
        .or(`assigned_to.eq.${userId},and(user_id.eq.${userId},assigned_to.is.null)`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(mapRow);
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: async (task: CreatePersonalTask & { userId: string }) => {
      const assignedTo = task.assignedTo ?? task.userId;
      const assignedToName = task.assignedToName ?? null;
      const { data, error } = await supabase
        .from('personal_tasks')
        .insert({
          user_id: task.userId,
          assigned_to: assignedTo,
          assigned_to_name: assignedToName,
          title: task.title,
          description: task.description ?? null,
          priority: task.priority ?? 'medium',
          status: task.status ?? 'todo',
          due_date: task.dueDate ?? null,
          category: task.category ?? 'personal',
          tags: task.tags ?? null,
          notes: task.notes ?? null,
        })
        .select('id')
        .single();
      if (error) throw error;

      const p = (task.priority ?? 'medium') as PersonalTaskPriority;

      // If assigned to someone else, send them an "assigned" notification
      if (assignedTo !== task.userId && data?.id) {
        try {
          await sendTaskNotification({ userId: assignedTo, taskId: data.id, title: task.title, priority: p, event: 'assigned' });
        } catch { /* non-critical */ }
      }

      // Fire notification to creator if due today or overdue
      if (task.dueDate && data?.id) {
        try {
          const d = parseISO(task.dueDate);
          if (isValid(d)) {
            if (isToday(d)) {
              await sendTaskNotification({ userId: assignedTo, taskId: data.id, title: task.title, priority: p, event: 'created_due_today' });
            } else if (isBefore(startOfDay(d), startOfDay(new Date()))) {
              await sendTaskNotification({ userId: assignedTo, taskId: data.id, title: task.title, priority: p, event: 'created_overdue' });
            }
          }
        } catch { /* non-critical */ }
      }

      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, _prevStatus, ...updates }: Partial<CreatePersonalTask> & { id: string; _prevStatus?: PersonalTaskStatus }) => {
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

      // Notify when marked done
      if (updates.status === 'done' && _prevStatus && _prevStatus !== 'done' && userId && updates.title) {
        await sendTaskNotification({
          userId,
          taskId: id,
          title: updates.title,
          priority: (updates.priority ?? 'medium') as PersonalTaskPriority,
          event: 'completed',
        });
      }
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
    updateTask: (id: string, updates: Partial<CreatePersonalTask>, prevStatus?: PersonalTaskStatus) =>
      updateMutation.mutateAsync({ id, _prevStatus: prevStatus, ...updates }),
    deleteTask: (id: string) => deleteMutation.mutateAsync(id),
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

export function useUpdateProjectTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('project_field_tasks')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assigned_project_tasks'] }),
  });
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

export function useCreatedByMeTasks(userId: string | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['created_by_me_tasks', userId],
    queryFn: async (): Promise<PersonalTask[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('personal_tasks')
        .select('*')
        .eq('user_id', userId)
        .neq('assigned_to', userId)
        .not('assigned_to', 'is', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(mapRow);
    },
    enabled: !!userId,
    staleTime: 30_000,
    meta: { qc },
  });
}
