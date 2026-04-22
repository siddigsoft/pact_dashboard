import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isToday, isBefore, parseISO, isValid, startOfDay, format } from 'date-fns';

/** Detect Postgres "undefined_column" / PostgREST schema-cache misses so we can
 *  retry inserts/updates without optional columns when migrations are pending. */
const isMissingCol = (e: any) =>
  !!e && (
    e.code === '42703' ||
    e.code === 'PGRST204' ||
    /column .* does not exist/i.test(e.message ?? '') ||
    /Could not find the .* column/i.test(e.message ?? '') ||
    /schema cache/i.test(e.message ?? '')
  );

export type PersonalTaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type PersonalTaskStatus = 'todo' | 'inprogress' | 'on_hold' | 'rescheduled' | 'done' | 'cancelled';

export const STATUS_LABELS: Record<PersonalTaskStatus, string> = {
  todo: 'To Do',
  inprogress: 'In Progress',
  on_hold: 'On Hold',
  rescheduled: 'Rescheduled',
  done: 'Finished',
  cancelled: 'Cancelled',
};

export const STATUS_COLORS: Record<PersonalTaskStatus, string> = {
  todo: 'bg-slate-100 text-slate-700 border-slate-200',
  inprogress: 'bg-blue-50 text-blue-700 border-blue-200',
  on_hold: 'bg-amber-50 text-amber-700 border-amber-200',
  rescheduled: 'bg-purple-50 text-purple-700 border-purple-200',
  done: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
};
export type DependencyType = 'custom' | 'date' | 'user' | 'department';

export interface Dependency {
  type: DependencyType;
  label: string;
  value?: string;
  userId?: string;
  userName?: string;
  deptId?: string;
  deptName?: string;
}

export interface TaskAssignee {
  id: string;
  name: string;
  email?: string | null;
}

export type TaskType = 'project-task' | 'day-to-day';

export interface TaskAttachment {
  name: string;
  url: string;
  uploadedAt: string;
}

export interface PersonalTask {
  id: string;
  userId: string;
  assignedTo: string | null;
  assignedToName: string | null;
  coAssignees: TaskAssignee[];
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
  rewardSetBy: string | null;
  recurrence: string;
  templateId: string | null;
  dailyTaskDate: string | null;
  // Extra fields
  dependencies: Dependency[];
  tools: string | null;
  // Proof & recurrence fields
  proofRequired: boolean;
  proofNote: string | null;
  proofFileUrl: string | null;
  proofSubmittedAt: string | null;
  recurrenceDays: number[];
  recurrenceMonthlyDay: number | null;
  // Task #30 additions
  taskType: TaskType | null;
  attachments: TaskAttachment[];
  // Planning quadrant (manual override)
  planningQuadrant: 'do' | 'schedule' | 'delegate' | 'drop' | null;
  // Recurrence end date
  recurrenceEndDate: string | null;
  // Time tracking
  estimatedHours: number | null;
  actualHours: number | null;
  startedAt: string | null;
  completedAt: string | null;
  // Lifecycle v2: acknowledge → start → lock → output
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  startEstimatedDays: number | null;
  startRequirements: string | null;
  startDependencies: StartDependencyRecord[];
  outputText: string | null;
  // Date-range (Outlook-style multi-day span) + per-day hours
  startDate: string | null;
  hoursPerDay: number | null;
}

export interface StartDependencyRecord {
  label: string;
  kind: 'person' | 'department' | 'item';
  userId?: string;
  userName?: string;
  deptId?: string;
  deptName?: string;
  confirmed?: boolean;
  confirmed_at?: string;
  confirmed_by?: string;
  confirmed_by_name?: string;
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
  coAssignees?: TaskAssignee[];
  // Task #10 additions
  parentTaskId?: string | null;
  targetDepartmentId?: string | null;
  completionRewardAmount?: number | null;
  completionRewardCurrency?: string | null;
  recurrence?: string;
  templateId?: string | null;
  dailyTaskDate?: string | null;
  // Extra fields
  dependencies?: Dependency[];
  tools?: string | null;
  // Proof & recurrence fields
  proofRequired?: boolean;
  proofNote?: string | null;
  proofFileUrl?: string | null;
  proofSubmittedAt?: string | null;
  recurrenceDays?: number[];
  recurrenceMonthlyDay?: number | null;
  // Task #30 additions
  taskType?: TaskType | null;
  attachments?: TaskAttachment[] | null;
  // Planning quadrant override
  planningQuadrant?: 'do' | 'schedule' | 'delegate' | 'drop' | null;
  // Recurrence end date
  recurrenceEndDate?: string | null;
  // Time tracking
  estimatedHours?: number | null;
  actualHours?: number | null;
  // Optional project linkage when taskType === 'project-task'
  projectId?: string | null;
  // Date-range (Outlook-style multi-day span) + per-day hours
  startDate?: string | null;
  hoursPerDay?: number | null;
}

export interface DailyTaskDefinition {
  id: string;
  title: string;
  description: string | null;
  priority: PersonalTaskPriority;
  roleTargets: string[];
  departmentId: string | null;
  recurrence: string;
  recurrenceDays: number[];
  recurrenceMonthlyDay: number | null;
  rewardAmount: number | null;
  rewardCurrency: string;
  active: boolean;
  proofRequired: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  // Task #30 additions
  taskType: 'project' | 'day_to_day' | 'general' | null;
  // Recurrence end date
  recurrenceEndDate: string | null;
}

// ── Task metadata helpers (stored in tools field as JSON prefix) ──────────────

interface ToolsMeta { taskType?: TaskType | null; attachments?: TaskAttachment[]; text?: string }

function parseToolsMeta(raw: string | null): ToolsMeta {
  if (!raw) return {};
  if (raw.startsWith('__meta:')) {
    try {
      return JSON.parse(raw.slice(7)) as ToolsMeta;
    } catch { /* fall through */ }
  }
  return { text: raw };
}

function parseToolsText(raw: string | null): string | null {
  const meta = parseToolsMeta(raw);
  return meta.text ?? null;
}

function parseTaskType(raw: string | null): TaskType | null {
  const meta = parseToolsMeta(raw);
  return meta.taskType ?? null;
}

export function parseAttachments(raw: string | null): TaskAttachment[] {
  const meta = parseToolsMeta(raw);
  return meta.attachments ?? [];
}

function encodeToolsMeta(tools: string | null | undefined, taskType: TaskType | null | undefined, attachments: TaskAttachment[] | null | undefined): string | null {
  const hasType = taskType !== undefined && taskType !== null;
  const hasAttachments = attachments != null && attachments.length > 0;
  const hasTools = tools !== undefined && tools !== null && tools.trim() !== '';
  if (!hasType && !hasAttachments && !hasTools) return null;
  if (!hasType && !hasAttachments && hasTools) return tools!;
  const meta: ToolsMeta = {};
  if (hasTools) meta.text = tools!;
  if (hasType) meta.taskType = taskType;
  if (hasAttachments) meta.attachments = attachments;
  return `__meta:${JSON.stringify(meta)}`;
}

function mapRow(r: Record<string, unknown>): PersonalTask {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    assignedTo: (r.assigned_to as string) ?? null,
    assignedToName: (r.assigned_to_name as string) ?? null,
    coAssignees: Array.isArray(r.co_assignees) ? (r.co_assignees as TaskAssignee[]) : [],
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
    rewardSetBy: (r.reward_set_by as string) ?? null,
    recurrence: (r.recurrence as string) ?? 'none',
    templateId: (r.template_id as string) ?? null,
    dailyTaskDate: (r.daily_task_date as string) ?? null,
    dependencies: Array.isArray(r.dependencies)
      ? (r.dependencies as unknown[]).map(d =>
          typeof d === 'string'
            ? { type: 'custom' as DependencyType, label: d, value: d }
            : (d as Dependency)
        )
      : [],
    tools: parseToolsText(r.tools as string | null),
    proofRequired: (r.proof_required as boolean) ?? false,
    proofNote: (r.proof_note as string) ?? null,
    proofFileUrl: (r.proof_file_url as string) ?? null,
    proofSubmittedAt: (r.proof_submitted_at as string) ?? null,
    recurrenceDays: Array.isArray(r.recurrence_days) ? (r.recurrence_days as number[]) : [],
    taskType: parseTaskType(r.tools as string | null),
    attachments: parseAttachments(r.tools as string | null),
    recurrenceMonthlyDay: (r.recurrence_monthly_day as number) ?? null,
    planningQuadrant: (r.planning_quadrant as 'do' | 'schedule' | 'delegate' | 'drop' | null) ?? null,
    recurrenceEndDate: (r.recurrence_end_date as string) ?? null,
    estimatedHours: (r.estimated_hours as number) ?? null,
    actualHours: (r.actual_hours as number) ?? null,
    startedAt: (r.started_at as string) ?? null,
    completedAt: (r.completed_at as string) ?? null,
    acknowledgedAt: (r.acknowledged_at as string) ?? null,
    acknowledgedBy: (r.acknowledged_by as string) ?? null,
    startEstimatedDays: (r.start_estimated_days as number) ?? null,
    startRequirements: (r.start_requirements as string) ?? null,
    startDependencies: Array.isArray(r.start_dependencies) ? (r.start_dependencies as StartDependencyRecord[]) : [],
    outputText: (r.output_text as string) ?? null,
    startDate: (r.start_date as string) ?? null,
    hoursPerDay: (r.hours_per_day as number) ?? null,
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
    recurrenceDays: Array.isArray(r.recurrence_days) ? (r.recurrence_days as number[]) : [],
    recurrenceMonthlyDay: (r.recurrence_monthly_day as number) ?? null,
    rewardAmount: (r.reward_amount as number) ?? null,
    rewardCurrency: (r.reward_currency as string) ?? 'USD',
    active: Boolean(r.active),
    proofRequired: Boolean(r.proof_required),
    createdBy: (r.created_by as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    taskType: (r.task_type as 'project' | 'day_to_day' | 'general' | null) ?? null,
    recurrenceEndDate: (r.recurrence_end_date as string) ?? null,
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
  event: 'created_due_today' | 'created_overdue' | 'completed' | 'assigned' | 'reward_credited' | 'subtasks_done' | 'dependency_added' | 'dependency_resolved';
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
    dependency_added: {
      titleEn: `Task Dependency Added`,
      titleAr: `تمت إضافة اعتماد للمهمة`,
      msgEn: `A new dependency was added to your task "${opts.title}"${opts.extra ? `: ${opts.extra}` : ''}.`,
      msgAr: `تمت إضافة اعتماد جديد لمهمتك "${opts.title}"${opts.extra ? `: ${opts.extra}` : ''}.`,
    },
    dependency_resolved: {
      titleEn: `Task Dependency Resolved`,
      titleAr: `تم حل اعتماد المهمة`,
      msgEn: `A dependency on your task "${opts.title}" has been resolved${opts.extra ? `: ${opts.extra}` : ''}.`,
      msgAr: `تم حل اعتماد مهمتك "${opts.title}"${opts.extra ? `: ${opts.extra}` : ''}.`,
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
      action_url: opts.taskId ? `/tasks/${opts.taskId}` : '/my-tasks',
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

// Dispatch a task event through the central multi-channel router
// (in-app + email + WhatsApp + push, bilingual). Fire-and-forget.
async function dispatchTaskMultiChannel(opts: {
  recipientId: string;
  taskId: string;
  taskTitle: string;
  actorId?: string | null;
  event: string;
  titleEn: string;
  titleAr: string;
  messageEn: string;
  messageAr: string;
}) {
  // 1. Central dispatcher (handles in-app + email + push + WhatsApp routing per user prefs)
  try {
    await supabase.functions.invoke('dispatch-notification', {
      body: {
        event_type: opts.event,
        entity_type: 'task',
        entity_id: opts.taskId,
        priority: 'normal',
        recipient_ids: [opts.recipientId],
        title_en: opts.titleEn,
        title_ar: opts.titleAr,
        message_en: opts.messageEn,
        message_ar: opts.messageAr,
        triggered_by: opts.actorId ?? undefined,
        action_url: opts.taskId
          ? `https://app.pactorg.com/tasks/${opts.taskId}`
          : 'https://app.pactorg.com/my-tasks',
        metadata: { task_name: opts.taskTitle },
      },
    });
  } catch { /* non-critical */ }

  // 2. WhatsApp via send-whatsapp (auto-skips users without phone or opt-in)
  try {
    await supabase.functions.invoke('send-whatsapp', {
      body: {
        user_ids: [opts.recipientId],
        event_type: opts.event,
        data: {
          task_title: opts.taskTitle,
          message: opts.messageEn,
          message_ar: opts.messageAr,
          url: opts.taskId
            ? `https://app.pactorg.com/tasks/${opts.taskId}`
            : 'https://app.pactorg.com/my-tasks',
        },
      },
    });
  } catch { /* non-critical — needs WASENDER_API_KEY or Meta */ }
}

const KEY = ['personal_tasks'];

// ── Credit wallet on task completion ─────────────────────────────────────────
// Server-side trusted reward credit via Edge Function.
// Returns true if credit was successfully posted (or already credited),
// false if it failed. Callers should use the return value for UI feedback.
export async function creditWalletForTask(opts: {
  taskId: string;
  userId: string;
  userEmail: string | null | undefined;
  taskPriority: PersonalTaskPriority;
}): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('credit-task-reward', {
      body: { taskId: opts.taskId },
    });
    if (error) {
      console.error('[creditWalletForTask] edge function error:', error.message ?? error);
      return false;
    }
    const resp = data as { ok?: boolean; skipped?: string } | null;
    // ok: true means credited or already_credited/no_reward — treat as success
    return resp?.ok === true;
  } catch (err: unknown) {
    console.error('[creditWalletForTask] invoke failed:', err instanceof Error ? err.message : err);
    return false;
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

    // Call SECURITY DEFINER RPC — no caller-supplied parameters.
    // The DB function reads caller identity (auth.uid()), role, and department
    // from the profile row. Reward amounts are read from template rows.
    // This is the only secure path that can materialise rewarded tasks for
    // non-admin users; direct INSERT is stripped by the reward guard trigger.
    const { data: created, error: rpcErr } = await supabase.rpc(
      'materialise_daily_tasks_for_user',
    );

    if (rpcErr) {
      console.error('[materialiseDailyTasks] RPC error:', rpcErr.message);
      return;
    }

    const rows = (created ?? []) as Array<{ task_id: string; task_title: string; reward_amount: number | null }>;

    if (!rows.length) return;

    // Send per-task in-app notifications
    await Promise.all(rows.map(r =>
      sendTaskNotification({
        userId: opts.userId,
        taskId: r.task_id,
        title: r.task_title,
        priority: 'medium',
        event: 'assigned',
      })
    ));

    // Send a single email digest listing all new tasks
    if (opts.userEmail) {
      const taskList = rows.map((r, i) => `<li>${i + 1}. ${r.task_title}</li>`).join('');
      const html = `
        <p>Hello${opts.userName ? ` ${opts.userName}` : ''},</p>
        <p>You have <strong>${rows.length} new recurring task${rows.length > 1 ? 's' : ''}</strong> assigned to you for today (${today}):</p>
        <ul>${taskList}</ul>
        <p>Log in to <a href="https://app.pactorg.com/my-tasks">PACT Command Center</a> to view and complete your tasks.</p>
        <p>– PACT Task System</p>
      `;
      await supabase.functions.invoke('send-email', {
        body: {
          to: opts.userEmail,
          subject: `Your Daily Tasks – ${today}`,
          html,
        },
      });
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
      // Primary query: tasks owned by or assigned to the user
      const { data: primary, error } = await supabase
        .from('personal_tasks')
        .select('*')
        .or(`assigned_to.eq.${userId},and(user_id.eq.${userId},assigned_to.is.null)`)
        .order('created_at', { ascending: false });
      if (error) throw error;

      // Secondary query: tasks where user is a co-assignee
      const { data: coData } = await supabase
        .from('personal_tasks')
        .select('*')
        .filter('co_assignees', 'cs', JSON.stringify([{ id: userId }]))
        .order('created_at', { ascending: false });

      // Merge and deduplicate
      const primaryMapped = (primary ?? []).map(r => mapRow(r as Record<string, unknown>));
      const coMapped = (coData ?? []).map(r => mapRow(r as Record<string, unknown>));
      const seen = new Set(primaryMapped.map(t => t.id));
      const merged = [...primaryMapped, ...coMapped.filter(t => !seen.has(t.id))];
      merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return merged;
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: async (task: CreatePersonalTask & { userId: string; userEmail?: string | null }) => {
      const assignedTo = task.assignedTo ?? task.userId;
      const assignedToName = task.assignedToName ?? null;
      const insertPayload: Record<string, unknown> = {
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
        recurrence_days: task.recurrenceDays ?? [],
        recurrence_monthly_day: task.recurrenceMonthlyDay ?? null,
        template_id: task.templateId ?? null,
        daily_task_date: task.dailyTaskDate ?? null,
        recurrence_end_date: task.recurrenceEndDate ?? null,
        co_assignees: task.coAssignees ?? [],
        dependencies: task.dependencies ?? [],
        tools: encodeToolsMeta(task.tools, task.taskType, task.attachments),
        planning_quadrant: task.planningQuadrant ?? null,
        estimated_hours: task.estimatedHours ?? null,
        actual_hours: task.actualHours ?? null,
        project_id: task.projectId ?? null,
        start_date: task.startDate ?? null,
        hours_per_day: task.hoursPerDay ?? null,
      };

      let { data, error } = await supabase
        .from('personal_tasks')
        .insert(insertPayload)
        .select('id')
        .single();

      // Fallback: if the new columns aren't present in this Supabase yet
      // (migration 20260424_personal_tasks_date_range.sql not applied),
      // strip them and retry so creating a task still succeeds.
      // Detect either Postgres "undefined_column" (42703) OR PostgREST schema-cache
      // misses (PGRST204 / "Could not find the 'X' column ... in the schema cache")
      // which is what Supabase REST returns when a migration hasn't been applied yet.
      const isMissingCol = (e: any) =>
        !!e && (
          e.code === '42703' ||
          e.code === 'PGRST204' ||
          /column .* does not exist/i.test(e.message ?? '') ||
          /Could not find the .* column/i.test(e.message ?? '') ||
          /schema cache/i.test(e.message ?? '')
        );

      if (isMissingCol(error)) {
        const fallback = { ...insertPayload };
        for (const k of ['start_date', 'hours_per_day']) delete fallback[k];
        const retry = await supabase.from('personal_tasks').insert(fallback).select('id').single();
        data = retry.data;
        error = retry.error;
      }
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
          // ── Multi-channel (in-app + email + WhatsApp + push) for primary assignee ─
          await dispatchTaskMultiChannel({
            recipientId: assignedTo,
            taskId: data.id,
            taskTitle: task.title,
            actorId: task.userId,
            event: 'task_assigned',
            titleEn: 'New Task Assigned',
            titleAr: 'تم تعيين مهمة جديدة',
            messageEn: `You have been assigned a new task: "${task.title}".`,
            messageAr: `تم تعيين مهمة جديدة لك: "${task.title}".`,
          });
        } catch { /* non-critical */ }
      }

      // ── Notify co-assignees (people added alongside the primary assignee) ─────
      if (data?.id && Array.isArray(task.coAssignees) && task.coAssignees.length > 0) {
        for (const co of task.coAssignees) {
          const coId = (co as { id?: string })?.id;
          if (!coId || coId === task.userId || coId === assignedTo) continue;
          try {
            await sendTaskNotification({ userId: coId, taskId: data.id, title: task.title, priority: p, event: 'assigned' });
            const { data: prof } = await supabase.from('profiles').select('email').eq('id', coId).maybeSingle();
            if (prof?.email) {
              await sendTaskEmail({
                email: prof.email as string,
                titleEn: 'You were added to a task',
                body: `You have been added as a collaborator on the task: "${task.title}".\n\nView the task: https://app.pactorg.com/my-tasks`,
              });
            }
            await dispatchTaskMultiChannel({
              recipientId: coId,
              taskId: data.id,
              taskTitle: task.title,
              actorId: task.userId,
              event: 'task_assigned',
              titleEn: 'Added to a Task',
              titleAr: 'تمت إضافتك إلى مهمة',
              messageEn: `You were added as a collaborator on "${task.title}".`,
              messageAr: `تمت إضافتك كمتعاون في "${task.title}".`,
            });
          } catch { /* non-critical */ }
        }
      }

      // ── Notify owners of tasks linked as dependencies (their task now blocks this one) ─
      if (data?.id && Array.isArray(task.dependencies) && task.dependencies.length > 0) {
        const depTaskIds = task.dependencies
          .filter(d => (d as { type?: string }).type === 'task' && (d as { taskId?: string }).taskId)
          .map(d => (d as { taskId: string }).taskId);
        if (depTaskIds.length > 0) {
          try {
            const { data: depTasks } = await supabase
              .from('personal_tasks')
              .select('id, title, assigned_to, user_id')
              .in('id', depTaskIds);
            for (const dt of (depTasks ?? []) as Record<string, unknown>[]) {
              const ownerId = (dt.assigned_to as string | null) ?? (dt.user_id as string | null);
              if (!ownerId || ownerId === task.userId) continue;
              const dtTitle = (dt.title as string) ?? 'your task';
              try {
                await sendTaskNotification({ userId: ownerId, taskId: dt.id as string, title: dtTitle, priority: p, event: 'dependency_added', extra: task.title });
                const { data: ownerProf } = await supabase.from('profiles').select('email').eq('id', ownerId).maybeSingle();
                if (ownerProf?.email) {
                  await sendTaskEmail({
                    email: ownerProf.email as string,
                    titleEn: 'Your task is now blocking another task',
                    body: `Your task "${dtTitle}" was linked as a dependency of a new task: "${task.title}".\n\nThe new task can't proceed until your task is complete.\n\nView your tasks: https://app.pactorg.com/my-tasks`,
                  });
                }
                await dispatchTaskMultiChannel({
                  recipientId: ownerId,
                  taskId: dt.id as string,
                  taskTitle: dtTitle,
                  actorId: task.userId,
                  event: 'task_updated',
                  titleEn: 'Your task is now a dependency',
                  titleAr: 'مهمتك أصبحت اعتماداً لمهمة أخرى',
                  messageEn: `Your task "${dtTitle}" is now blocking a new task: "${task.title}". Please complete it to unblock the team.`,
                  messageAr: `مهمتك "${dtTitle}" أصبحت تعيق مهمة جديدة: "${task.title}". يرجى إكمالها لرفع الحجب.`,
                });
              } catch { /* per-recipient non-critical */ }
            }
          } catch { /* non-critical */ }
        }
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
    }): Promise<{ creditOk: boolean }> => {
      const { id, _prevStatus, _userId, _userEmail, _taskPriority, ...rawUpdates } = opts;
      let updates: typeof rawUpdates = rawUpdates;
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
      if (updates.coAssignees !== undefined)     patch.co_assignees = updates.coAssignees;
      if (updates.dependencies !== undefined)    patch.dependencies = updates.dependencies;
      if (updates.tools !== undefined || updates.taskType !== undefined || updates.attachments !== undefined) {
        // Fetch current tools field to preserve existing metadata when only partial fields are updated
        let existingRaw: string | null = null;
        if (updates.tools === undefined || updates.taskType === undefined || updates.attachments === undefined) {
          const { data: currentRow } = await supabase
            .from('personal_tasks')
            .select('tools')
            .eq('id', id)
            .maybeSingle();
          existingRaw = (currentRow as { tools?: string | null } | null)?.tools ?? null;
          const existingMeta = parseToolsMeta(existingRaw);
          // Use existing values for fields not being updated
          if (updates.tools === undefined && existingMeta.text) updates = { ...updates, tools: existingMeta.text };
          if (updates.taskType === undefined && existingMeta.taskType) updates = { ...updates, taskType: existingMeta.taskType };
          if (updates.attachments === undefined && existingMeta.attachments) updates = { ...updates, attachments: existingMeta.attachments };
        }
        patch.tools = encodeToolsMeta(
          updates.tools,
          updates.taskType,
          updates.attachments,
        );
      }
      if (updates.proofRequired !== undefined)   patch.proof_required = updates.proofRequired;
      if (updates.proofNote !== undefined)       patch.proof_note = updates.proofNote;
      if (updates.proofFileUrl !== undefined)    patch.proof_file_url = updates.proofFileUrl;
      if (updates.proofSubmittedAt !== undefined) patch.proof_submitted_at = updates.proofSubmittedAt;
      if (updates.recurrenceDays !== undefined)  patch.recurrence_days = updates.recurrenceDays;
      if (updates.recurrenceMonthlyDay !== undefined) patch.recurrence_monthly_day = updates.recurrenceMonthlyDay;
      if (updates.planningQuadrant !== undefined) patch.planning_quadrant = updates.planningQuadrant ?? null;
      if (updates.recurrenceEndDate !== undefined) patch.recurrence_end_date = updates.recurrenceEndDate ?? null;
      if ('recurrence' in updates && updates.recurrence !== undefined) patch.recurrence = updates.recurrence;
      if (updates.estimatedHours !== undefined) patch.estimated_hours = updates.estimatedHours ?? null;
      if (updates.actualHours !== undefined) patch.actual_hours = updates.actualHours ?? null;
      if ((updates as { startDate?: string | null }).startDate !== undefined) {
        patch.start_date = (updates as { startDate?: string | null }).startDate ?? null;
      }
      if ((updates as { hoursPerDay?: number | null }).hoursPerDay !== undefined) {
        patch.hours_per_day = (updates as { hoursPerDay?: number | null }).hoursPerDay ?? null;
      }
      // Assignment / department fields (so Edit dialog reassignments actually persist)
      if ((updates as { assignedTo?: string | null }).assignedTo !== undefined) {
        patch.assigned_to = (updates as { assignedTo?: string | null }).assignedTo;
      }
      if ((updates as { assignedToName?: string | null }).assignedToName !== undefined) {
        patch.assigned_to_name = (updates as { assignedToName?: string | null }).assignedToName;
      }
      if ((updates as { targetDepartmentId?: string | null }).targetDepartmentId !== undefined) {
        patch.target_department_id = (updates as { targetDepartmentId?: string | null }).targetDepartmentId;
      }

      // ── Auto-track timestamps for status transitions ──────
      if (updates.status !== undefined) {
        const { data: cur } = await supabase
          .from('personal_tasks')
          .select('started_at, completed_at, actual_hours, on_hold_at, cancelled_at, rescheduled_at')
          .eq('id', id)
          .maybeSingle();
        const curStarted   = (cur as { started_at?: string | null } | null)?.started_at   ?? null;
        const curCompleted = (cur as { completed_at?: string | null } | null)?.completed_at ?? null;
        const now = new Date();

        if (updates.status === 'inprogress' && !curStarted) {
          patch.started_at = now.toISOString();
        }
        if (updates.status === 'on_hold') {
          patch.on_hold_at = now.toISOString();
        }
        if (updates.status === 'rescheduled') {
          patch.rescheduled_at = now.toISOString();
        }
        if (updates.status === 'cancelled') {
          patch.cancelled_at = now.toISOString();
        }
        if (updates.status === 'done') {
          if (!curCompleted) patch.completed_at = now.toISOString();
          if (updates.actualHours === undefined) {
            const startRef = curStarted ?? (patch.started_at as string | undefined) ?? null;
            if (startRef) {
              const elapsed = (now.getTime() - new Date(startRef).getTime()) / 3_600_000;
              patch.actual_hours = Math.round(elapsed * 4) / 4;
            }
          }
        }
      }

      let { error } = await supabase.from('personal_tasks').update(patch).eq('id', id);
      // Some Supabase environments may not yet have the on_hold_at / rescheduled_at /
      // cancelled_at columns from migration 20260422. Detect undefined_column (42703)
      // and retry once without those optional timestamp columns so the status update
      // still succeeds. The status itself + status_history trigger remain unaffected.
      if (isMissingCol(error)) {
        const fallback = { ...patch };
        // Strip every column that comes from a deferred migration so the core
        // status/title/description update still goes through.
        for (const k of [
          'on_hold_at', 'rescheduled_at', 'cancelled_at',
          'acknowledged_at', 'acknowledged_by',
          'start_estimated_days', 'start_requirements', 'start_dependencies',
          'output_text',
          'start_date', 'hours_per_day',
        ]) {
          delete (fallback as Record<string, unknown>)[k];
        }
        const retry = await supabase.from('personal_tasks').update(fallback).eq('id', id);
        error = retry.error;
      }
      if (error) throw error;

      // Dependency-added notification: only fires when new dependencies are actually added (diff old vs new)
      if (updates.dependencies !== undefined && updates.dependencies.length > 0) {
        try {
          const { data: taskRow } = await supabase
            .from('personal_tasks')
            .select('title, priority, assigned_to, user_id, dependencies')
            .eq('id', id)
            .maybeSingle();
          if (taskRow) {
            // Compare old vs new to find actually-new dependency entries
            const oldDeps = Array.isArray(taskRow.dependencies) ? (taskRow.dependencies as { type?: string; taskId?: string; text?: string }[]) : [];
            const newDeps = updates.dependencies;
            const hasActuallyNew = newDeps.some(nd => {
              // A dep is new if it doesn't appear in oldDeps (match by taskId for task type, or text for custom)
              return !oldDeps.some(od =>
                nd.type === 'task' ? od.type === 'task' && od.taskId === nd.taskId : od.text === nd.text
              );
            });
            if (hasActuallyNew) {
              const depTitle = updates.title ?? (taskRow.title as string) ?? 'Task';
              const depPriority = (_taskPriority ?? updates.priority ?? taskRow.priority ?? 'medium') as PersonalTaskPriority;
              const recipientId = (taskRow.assigned_to as string | null) ?? (taskRow.user_id as string | null);
              if (recipientId) {
                await sendTaskNotification({ userId: recipientId, taskId: id, title: depTitle, priority: depPriority, event: 'dependency_added' });
                const { data: prof } = await supabase.from('profiles').select('email').eq('id', recipientId).maybeSingle();
                if (prof?.email) {
                  await sendTaskEmail({ email: prof.email as string, titleEn: 'Task Dependency Added', body: `A dependency was added to your task "${depTitle}". View your tasks: https://app.pactorg.com/my-tasks` });
                }
              }
            }
          }
        } catch { /* non-critical */ }
      }

      // Dependency-resolved notification: when a task is marked done, notify owners of tasks that depended on it
      if (updates.status === 'done' && _prevStatus && _prevStatus !== 'done') {
        try {
          // Find tasks that have this task as a dependency
          const { data: dependentTasks } = await supabase
            .from('personal_tasks')
            .select('id, title, priority, assigned_to, user_id, dependencies')
            .neq('status', 'done');
          const nowDoneTitle = updates.title;
          for (const dt of (dependentTasks ?? []) as Record<string, unknown>[]) {
            const deps = Array.isArray(dt.dependencies) ? dt.dependencies as { type?: string; taskId?: string; text?: string }[] : [];
            const hasDep = deps.some(d => d.type === 'task' && d.taskId === id);
            if (!hasDep) continue;
            const ownerIdResolved = (dt.assigned_to as string | null) ?? (dt.user_id as string | null);
            if (!ownerIdResolved) continue;
            const dtTitle = (dt.title as string) ?? 'your task';
            const dtPriority = (dt.priority as PersonalTaskPriority) ?? 'medium';
            await sendTaskNotification({ userId: ownerIdResolved, taskId: dt.id as string, title: dtTitle, priority: dtPriority, event: 'dependency_resolved', extra: nowDoneTitle ?? undefined });
            const { data: ownerProf } = await supabase.from('profiles').select('email').eq('id', ownerIdResolved).maybeSingle();
            if (ownerProf?.email) {
              await sendTaskEmail({ email: ownerProf.email as string, titleEn: 'Task Dependency Resolved', body: `A dependency on your task "${dtTitle}" has been resolved${nowDoneTitle ? ` (${nowDoneTitle} is now done)` : ''}. View your tasks: https://app.pactorg.com/my-tasks` });
            }
          }
        } catch { /* non-critical */ }
      }

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
        const creditOk = await creditWalletForTask({
          taskId: id,
          userId: _userId,
          userEmail: _userEmail,
          taskPriority: priority,
        });
        if (!creditOk) {
          console.warn('[updateTask] creditWalletForTask returned false for task', id);
        }

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

        return { creditOk };
      }

      return { creditOk: false };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Best-effort: clean up attached files from storage if not referenced elsewhere
      try {
        const { data: row } = await supabase.from('personal_tasks').select('tools').eq('id', id).maybeSingle();
        const atts = parseAttachments((row?.tools as string | null) ?? null);
        const paths = atts
          .map(a => {
            const m = a.url.match(/\/workspace-files\/(.+)$/);
            return m ? decodeURIComponent(m[1].split('?')[0]) : null;
          })
          .filter((p): p is string => !!p);
        if (paths.length > 0) {
          // Don't delete a storage object that's also referenced by workspace_files
          const { data: wfRefs } = await supabase
            .from('workspace_files')
            .select('storage_path')
            .in('storage_path', paths);
          const wfReferenced = new Set((wfRefs ?? []).map(r => r.storage_path as string));

          // Or by another personal_task's attachments (URL contains the storage path)
          const { data: otherTasks } = await supabase
            .from('personal_tasks')
            .select('id, tools')
            .neq('id', id)
            .not('tools', 'is', null);
          const otherTaskReferenced = new Set<string>();
          for (const t of otherTasks ?? []) {
            const otherAtts = parseAttachments((t.tools as string | null) ?? null);
            for (const a of otherAtts) {
              const m = a.url.match(/\/workspace-files\/(.+)$/);
              if (m) otherTaskReferenced.add(decodeURIComponent(m[1].split('?')[0]));
            }
          }

          const toRemove = paths.filter(p => !wfReferenced.has(p) && !otherTaskReferenced.has(p));
          if (toRemove.length > 0) {
            await supabase.storage.from('workspace-files').remove(toRemove);
          }
        }
      } catch { /* best-effort cleanup; never block delete */ }

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
