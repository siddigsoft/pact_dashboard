import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isToday, isBefore, parseISO, isValid, startOfDay, format } from 'date-fns';

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
  // Task #10 additions
  parentTaskId: string | null;
  targetDepartmentId: string | null;
  completionRewardAmount: number | null;
  completionRewardCurrency: string;
  recurrence: string;
  templateId: string | null;
  dailyTaskDate: string | null;
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
  assignedToEmail?: string | null;
  // Task #10 additions
  parentTaskId?: string | null;
  targetDepartmentId?: string | null;
  completionRewardAmount?: number | null;
  completionRewardCurrency?: string | null;
  recurrence?: string;
  templateId?: string | null;
  dailyTaskDate?: string | null;
}

export interface DailyTaskDefinition {
  id: string;
  title: string;
  description: string | null;
  priority: PersonalTaskPriority;
  roleTargets: string[];
  departmentId: string | null;
  recurrence: string;
  rewardAmount: number | null;
  rewardCurrency: string;
  active: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapRow(r: Record<string, unknown>): PersonalTask {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    assignedTo: (r.assigned_to as string) ?? null,
    assignedToName: (r.assigned_to_name as string) ?? null,
    title: r.title as string,
    description: (r.description as string) ?? null,
    priority: r.priority as PersonalTaskPriority,
    status: r.status as PersonalTaskStatus,
    dueDate: (r.due_date as string) ?? null,
    category: (r.category as string) ?? null,
    tags: (r.tags as string[]) ?? null,
    notes: (r.notes as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    parentTaskId: (r.parent_task_id as string) ?? null,
    targetDepartmentId: (r.target_department_id as string) ?? null,
    completionRewardAmount: (r.completion_reward_amount as number) ?? null,
    completionRewardCurrency: (r.completion_reward_currency as string) ?? 'USD',
    recurrence: (r.recurrence as string) ?? 'none',
    templateId: (r.template_id as string) ?? null,
    dailyTaskDate: (r.daily_task_date as string) ?? null,
  };
}

function mapDefRow(r: Record<string, unknown>): DailyTaskDefinition {
  return {
    id: r.id as string,
    title: r.title as string,
    description: (r.description as string) ?? null,
    priority: (r.priority as PersonalTaskPriority) ?? 'medium',
    roleTargets: (r.role_targets as string[]) ?? [],
    departmentId: (r.department_id as string) ?? null,
    recurrence: (r.recurrence as string) ?? 'daily',
    rewardAmount: (r.reward_amount as number) ?? null,
    rewardCurrency: (r.reward_currency as string) ?? 'USD',
    active: Boolean(r.active),
    createdBy: (r.created_by as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function notifPriority(p: PersonalTaskPriority): string {
  return p === 'critical' || p === 'high' ? 'high' : 'medium';
}

async function sendTaskNotification(opts: {
  userId: string;
  taskId: string;
  title: string;
  priority: PersonalTaskPriority;
  event: 'created_due_today' | 'created_overdue' | 'completed' | 'assigned' | 'reward_credited' | 'subtasks_done';
  extra?: string;
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
    reward_credited: {
      titleEn: `Reward Credited to Wallet`,
      titleAr: `تم إضافة المكافأة للمحفظة`,
      msgEn: `Your wallet has been credited ${opts.extra ?? ''} for completing "${opts.title}".`,
      msgAr: `تمت إضافة ${opts.extra ?? ''} إلى محفظتك لإتمام "${opts.title}".`,
    },
    subtasks_done: {
      titleEn: `All Subtasks Complete`,
      titleAr: `تم إكمال جميع المهام الفرعية`,
      msgEn: `All subtasks for "${opts.title}" are done — consider marking the parent task as done.`,
      msgAr: `تم إكمال جميع المهام الفرعية لـ "${opts.title}" — ضع في اعتبارك إنهاء المهمة الأصلية.`,
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

async function sendTaskEmail(opts: {
  email: string | null | undefined;
  titleEn: string;
  body: string;
}) {
  if (!opts.email) return;
  try {
    await supabase.functions.invoke('send-email', {
      body: {
        to: opts.email,
        subject: opts.titleEn,
        html: `<p style="font-family:sans-serif;white-space:pre-line">${opts.body}</p>`,
      },
    });
  } catch {
    // Non-critical
  }
}

const KEY = ['personal_tasks'];

// ── Credit wallet on task completion ─────────────────────────────────────────
// Server-side trusted reward credit via Edge Function.
// The credit-task-reward function validates the caller's JWT,
// reads reward amount from DB (never trusts caller input),
// enforces idempotency, and sends notifications.
async function creditWalletForTask(opts: {
  taskId: string;
  userId: string;
  userEmail: string | null | undefined;
  taskPriority: PersonalTaskPriority;
}) {
  try {
    const { error } = await supabase.functions.invoke('credit-task-reward', {
      body: { taskId: opts.taskId },
    });
    if (error) {
      console.error('[creditWalletForTask] edge function error:', error.message ?? error);
    }
  } catch (err: unknown) {
    console.error('[creditWalletForTask] invoke failed:', err instanceof Error ? err.message : err);
  }
}

// ── Materialise daily recurring tasks for the logged-in user ─────────────────

export async function materialiseDailyTasks(opts: {
  userId: string;
  userRole: string | null;
  userDepartmentId: string | null;
  userEmail: string | null | undefined;
  userName: string | null;
}) {
  try {
    const today = format(new Date(), 'yyyy-MM-dd');

    // Fetch active definitions
    const { data: defs } = await supabase
      .from('daily_task_definitions')
      .select('*')
      .eq('active', true);

    if (!defs?.length) return;

    const roleNorm = (opts.userRole ?? '').toLowerCase().replace(/[_\s]/g, '');

    for (const def of defs) {
      const d = mapDefRow(def as Record<string, unknown>);

      // Check recurrence day match
      if (d.recurrence === 'weekly' && new Date().getDay() !== 1) continue; // Monday only

      // Check role match
      const roleMatch = !d.roleTargets.length ||
        d.roleTargets.some(r => r.toLowerCase().replace(/[_\s]/g, '') === roleNorm);
      // Check department match
      const deptMatch = !d.departmentId || d.departmentId === opts.userDepartmentId;

      if (!roleMatch || !deptMatch) continue;

      // Deduplicate: skip if already materialised today for this user+template
      const { count } = await supabase
        .from('personal_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('template_id', d.id)
        .eq('assigned_to', opts.userId)
        .eq('daily_task_date', today);

      if ((count ?? 0) > 0) continue;

      // Materialise
      const { data: created } = await supabase
        .from('personal_tasks')
        .insert({
          user_id: opts.userId,
          assigned_to: opts.userId,
          assigned_to_name: opts.userName,
          title: d.title,
          description: d.description,
          priority: d.priority,
          status: 'todo',
          category: 'recurring',
          completion_reward_amount: d.rewardAmount,
          completion_reward_currency: d.rewardCurrency,
          recurrence: d.recurrence,
          template_id: d.id,
          daily_task_date: today,
        })
        .select('id')
        .single();

      if (created?.id) {
        await sendTaskNotification({
          userId: opts.userId,
          taskId: created.id,
          title: d.title,
          priority: d.priority as PersonalTaskPriority,
          event: 'assigned',
        });
      }
    }
  } catch (err: unknown) {
    console.error('[materialiseDailyTasks] error:', err instanceof Error ? err.message : err);
  }
}

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
      return (data ?? []).map(r => mapRow(r as Record<string, unknown>));
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: async (task: CreatePersonalTask & { userId: string; userEmail?: string | null }) => {
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
          parent_task_id: task.parentTaskId ?? null,
          target_department_id: task.targetDepartmentId ?? null,
          completion_reward_amount: task.completionRewardAmount ?? null,
          completion_reward_currency: task.completionRewardCurrency ?? 'USD',
          recurrence: task.recurrence ?? 'none',
          template_id: task.templateId ?? null,
          daily_task_date: task.dailyTaskDate ?? null,
        })
        .select('id')
        .single();
      if (error) throw error;

      const p = (task.priority ?? 'medium') as PersonalTaskPriority;

      if (assignedTo !== task.userId && data?.id) {
        try {
          await sendTaskNotification({ userId: assignedTo, taskId: data.id, title: task.title, priority: p, event: 'assigned' });
          // Resolve assignee email: use explicitly supplied email, or look up from profiles
          let emailToNotify = task.assignedToEmail ?? null;
          if (!emailToNotify) {
            const { data: prof } = await supabase
              .from('profiles')
              .select('email')
              .eq('id', assignedTo)
              .maybeSingle();
            emailToNotify = (prof?.email as string) ?? null;
          }
          if (emailToNotify) {
            await sendTaskEmail({
              email: emailToNotify,
              titleEn: 'New Task Assigned',
              body: `You have been assigned a new task: "${task.title}".\n\nView your tasks: https://app.pactorg.com/my-tasks`,
            });
          }
        } catch { /* non-critical */ }
      }

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
    mutationFn: async (opts: Partial<CreatePersonalTask> & {
      id: string;
      _prevStatus?: PersonalTaskStatus;
      _userId?: string;
      _userEmail?: string | null;
      _taskPriority?: PersonalTaskPriority;
    }) => {
      const { id, _prevStatus, _userId, _userEmail, _taskPriority, ...updates } = opts;
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (updates.title !== undefined)       patch.title = updates.title;
      if (updates.description !== undefined) patch.description = updates.description;
      if (updates.priority !== undefined)    patch.priority = updates.priority;
      if (updates.status !== undefined)      patch.status = updates.status;
      if (updates.dueDate !== undefined)     patch.due_date = updates.dueDate;
      if (updates.category !== undefined)    patch.category = updates.category;
      if (updates.tags !== undefined)        patch.tags = updates.tags;
      if (updates.notes !== undefined)       patch.notes = updates.notes;
      if (updates.completionRewardAmount !== undefined) patch.completion_reward_amount = updates.completionRewardAmount;
      if (updates.completionRewardCurrency !== undefined) patch.completion_reward_currency = updates.completionRewardCurrency;

      const { error } = await supabase.from('personal_tasks').update(patch).eq('id', id);
      if (error) throw error;

      if (updates.status === 'done' && _prevStatus && _prevStatus !== 'done' && _userId) {
        // Fetch the task row to get title/priority when not supplied by caller (e.g. subtask toggle)
        let effectiveTitle = updates.title;
        let effectivePriority = _taskPriority ?? updates.priority ?? 'medium';
        if (!effectiveTitle) {
          const { data: row } = await supabase
            .from('personal_tasks')
            .select('title, priority')
            .eq('id', id)
            .maybeSingle();
          if (row) {
            effectiveTitle = row.title as string;
            if (!_taskPriority) effectivePriority = (row.priority as PersonalTaskPriority) ?? 'medium';
          }
        }
        if (!effectiveTitle) effectiveTitle = 'Task';
        const priority = effectivePriority as PersonalTaskPriority;
        await sendTaskNotification({ userId: _userId, taskId: id, title: effectiveTitle, priority, event: 'completed' });

        // Credit wallet server-side (reads reward from DB row, idempotent)
        await creditWalletForTask({
          taskId: id,
          userId: _userId,
          userEmail: _userEmail,
          taskPriority: priority,
        });

        // Check if this was a subtask and if all siblings are now done
        const { data: taskData } = await supabase
          .from('personal_tasks')
          .select('parent_task_id, user_id, title')
          .eq('id', id)
          .maybeSingle();

        if (taskData?.parent_task_id) {
          const { data: siblings } = await supabase
            .from('personal_tasks')
            .select('id, status')
            .eq('parent_task_id', taskData.parent_task_id);

          if (siblings && siblings.every((s: Record<string, unknown>) => s.status === 'done')) {
            const { data: parent } = await supabase
              .from('personal_tasks')
              .select('assigned_to, title')
              .eq('id', taskData.parent_task_id)
              .maybeSingle();

            if (parent?.assigned_to && parent.title) {
              await sendTaskNotification({
                userId: parent.assigned_to as string,
                taskId: taskData.parent_task_id,
                title: parent.title as string,
                priority: 'medium',
                event: 'subtasks_done',
              });
            }
          }
        }
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
    createTask: (task: CreatePersonalTask & { userEmail?: string | null }) =>
      createMutation.mutateAsync({ ...task, userId: userId! }),
    updateTask: (
      id: string,
      updates: Partial<CreatePersonalTask>,
      prevStatus?: PersonalTaskStatus,
      meta?: { userId?: string; userEmail?: string | null; taskPriority?: PersonalTaskPriority }
    ) =>
      updateMutation.mutateAsync({
        id,
        _prevStatus: prevStatus,
        _userId: meta?.userId ?? userId,
        _userEmail: meta?.userEmail,
        _taskPriority: meta?.taskPriority,
        ...updates,
      }),
    deleteTask: (id: string) => deleteMutation.mutateAsync(id),
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

// ── Assigned project task shape ────────────────────────────────────────────
export interface AssignedProjectTask {
  id: string;
  title: unknown;
  description: unknown;
  priority: unknown;
  status: unknown;
  dueDate: unknown;
  startDate: unknown;
  projectId: unknown;
  projectName: string;
  stageId: unknown;
  stateName: unknown;
  localityName: unknown;
  notes: unknown;
  assignedToName: unknown;
  createdAt: unknown;
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
  return useQuery<AssignedProjectTask[]>({
    queryKey: ['assigned_project_tasks', userId],
    queryFn: async (): Promise<AssignedProjectTask[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('project_field_tasks')
        .select('id, title, description, priority, status, due_date, start_date, project_id, stage_id, state_name, locality_name, notes, assigned_to_name, created_at')
        .eq('assigned_to', userId)
        .neq('status', 'cancelled')
        .order('due_date', { ascending: true, nullsFirst: false });
      if (error) throw error;

      const rows = (data ?? []) as Record<string, unknown>[];
      const projectIds = [...new Set(rows.map(t => t.project_id as string).filter(Boolean))];
      const projectNames: Record<string, string> = {};
      if (projectIds.length > 0) {
        const { data: projects } = await supabase
          .from('projects')
          .select('id, name')
          .in('id', projectIds);
        (projects ?? []).forEach((p: Record<string, unknown>) => { projectNames[p.id as string] = p.name as string; });
      }

      return rows.map((t): AssignedProjectTask => ({
        id: t.id as string,
        title: t.title,
        description: t.description,
        priority: t.priority,
        status: t.status,
        dueDate: t.due_date,
        startDate: t.start_date,
        projectId: t.project_id,
        projectName: projectNames[t.project_id as string] ?? 'Unknown Project',
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
        .is('parent_task_id', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(r => mapRow(r as Record<string, unknown>));
    },
    enabled: !!userId,
    staleTime: 30_000,
    meta: { qc },
  });
}

export function useDailyTaskDefinitions() {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['daily_task_definitions'],
    queryFn: async (): Promise<DailyTaskDefinition[]> => {
      const { data, error } = await supabase
        .from('daily_task_definitions')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(r => mapDefRow(r as Record<string, unknown>));
    },
    staleTime: 60_000,
    meta: { qc },
  });
}
