/**
 * useTaskNotifications
 * Fires in-app + WhatsApp + email notifications on personal_task lifecycle
 * events, with channel-specific gating.
 *
 * Channel policy (per user request 2026-04-26):
 *  1. In-app   — fires on EVERY change (instant feedback for all participants)
 *  2. WhatsApp — fires on EVERY change (real-time push to all participants
 *                via WasenderAPI when WASENDER_API_KEY is set)
 *  3. Email    — fires on assignment (task_assigned) and terminal events
 *                (task_completed / task_cancelled). Mid-flow status changes
 *                (started, delayed, etc.) stay in-app + WhatsApp only.
 *
 * "All participants" = primary assignee + task creator + every co-assignee.
 * Each notify() call already excludes the actor themselves, so the actor
 * doesn't get notified about their own change.
 */
import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNotifications } from '@/context/notifications/NotificationContext';
import { useUser } from '@/context/user/UserContext';
import { isTaskEmailEvent } from '@/lib/taskNotificationPolicy';

export type TaskEvent =
  | 'task_created'
  | 'task_started'
  | 'task_acknowledged'
  | 'task_completed'
  | 'task_delayed'
  | 'task_rejected'
  | 'task_cancelled'
  | 'task_overdue'
  | 'task_reminder_1day'
  | 'task_reminder_3day'
  | 'task_assigned'
  | 'task_status_changed';

interface TaskNotificationPayload {
  event: TaskEvent;
  taskId: string;
  taskTitle: string;
  recipientUserId: string;
  recipientName?: string;
  dueDate?: string | null;
  priority?: string | null;
  notes?: string;
  /** Extra metadata forwarded to email template */
  extra?: Record<string, string>;
}

const EVENT_LABELS_EN: Record<TaskEvent, string> = {
  task_created: 'New Task Created',
  task_started: 'Task In Progress',
  task_acknowledged: 'Task Acknowledged',
  task_completed: 'Task Completed ✓',
  task_delayed: 'Task Delayed ⚠',
  task_rejected: 'Task Rejected',
  task_cancelled: 'Task Cancelled',
  task_overdue: 'Task Overdue 🔴',
  task_reminder_1day: 'Task Due Tomorrow',
  task_reminder_3day: 'Task Due in 3 Days',
  task_assigned: 'Task Assigned to You',
  task_status_changed: 'Task Status Updated',
};

const EVENT_LABELS_AR: Record<TaskEvent, string> = {
  task_created: 'تم إنشاء مهمة جديدة',
  task_started: 'المهمة قيد التنفيذ',
  task_acknowledged: 'تم إقرار استلام المهمة',
  task_completed: 'اكتملت المهمة ✓',
  task_delayed: 'المهمة متأخرة ⚠',
  task_rejected: 'تم رفض المهمة',
  task_cancelled: 'تم إلغاء المهمة',
  task_overdue: 'المهمة متأخرة 🔴',
  task_reminder_1day: 'موعد المهمة غداً',
  task_reminder_3day: 'موعد المهمة خلال 3 أيام',
  task_assigned: 'تم تعيين مهمة لك',
  task_status_changed: 'تم تحديث حالة المهمة',
};

const EVENT_TYPES: Record<TaskEvent, 'info' | 'success' | 'warning' | 'error'> = {
  task_created: 'info',
  task_started: 'info',
  task_acknowledged: 'info',
  task_completed: 'success',
  task_delayed: 'warning',
  task_rejected: 'error',
  task_cancelled: 'warning',
  task_overdue: 'error',
  task_reminder_1day: 'warning',
  task_reminder_3day: 'info',
  task_assigned: 'info',
  task_status_changed: 'info',
};

/** English notification message */
function buildMessageEn(event: TaskEvent, taskTitle: string, actorName: string, dueDate?: string | null, reason?: string): string {
  const due = dueDate ? ` (due ${dueDate})` : '';
  const why = reason ? ` — Reason: ${reason}` : '';
  switch (event) {
    case 'task_created':      return `Task "${taskTitle}" was created by ${actorName}${due}`;
    case 'task_assigned':     return `${actorName} assigned you: "${taskTitle}"${due}`;
    case 'task_started':      return `"${taskTitle}" has been started by ${actorName}`;
    case 'task_acknowledged': return `"${taskTitle}" was acknowledged by the assignee`;
    case 'task_completed':    return `"${taskTitle}" has been marked as completed by ${actorName} 🎉`;
    case 'task_delayed':      return `"${taskTitle}" has been marked as delayed${due}${why}`;
    case 'task_rejected':     return `"${taskTitle}" was rejected by ${actorName}${why}`;
    case 'task_cancelled':    return `"${taskTitle}" was cancelled by ${actorName}${why}`;
    case 'task_overdue':      return `"${taskTitle}" is now overdue${due} — please take action immediately`;
    case 'task_reminder_1day':return `"${taskTitle}" is due tomorrow${due}`;
    case 'task_reminder_3day':return `"${taskTitle}" is due in 3 days${due}`;
    case 'task_status_changed':return `"${taskTitle}" status updated by ${actorName}${why}`;
    default:                  return `Task "${taskTitle}" updated${why}`;
  }
}

/** Arabic notification message */
function buildMessageAr(event: TaskEvent, taskTitle: string, actorName: string, dueDate?: string | null, reason?: string): string {
  const due = dueDate ? ` (الموعد: ${dueDate})` : '';
  const why = reason ? ` — السبب: ${reason}` : '';
  switch (event) {
    case 'task_created':      return `أنشأ ${actorName} مهمة جديدة: "${taskTitle}"${due}`;
    case 'task_assigned':     return `عيّن لك ${actorName} المهمة: "${taskTitle}"${due}`;
    case 'task_started':      return `بدأ ${actorName} تنفيذ "${taskTitle}"`;
    case 'task_acknowledged': return `تم إقرار استلام "${taskTitle}"`;
    case 'task_completed':    return `أكمل ${actorName} المهمة "${taskTitle}" 🎉`;
    case 'task_delayed':      return `تم تأجيل "${taskTitle}"${due}${why}`;
    case 'task_rejected':     return `رُفضت "${taskTitle}" بواسطة ${actorName}${why}`;
    case 'task_cancelled':    return `ألغى ${actorName} المهمة "${taskTitle}"${why}`;
    case 'task_overdue':      return `"${taskTitle}" متأخرة${due} — يرجى اتخاذ إجراء فوري`;
    case 'task_reminder_1day':return `موعد "${taskTitle}" غداً${due}`;
    case 'task_reminder_3day':return `موعد "${taskTitle}" خلال 3 أيام${due}`;
    case 'task_status_changed':return `حدّث ${actorName} حالة "${taskTitle}"${why}`;
    default:                  return `تم تحديث "${taskTitle}"${why}`;
  }
}

/**
 * WhatsApp covers EVERY task change — same as in-app — so participants get
 * a real-time push on their phone for any movement on a task they're on.
 * Requires WASENDER_API_KEY on the send-whatsapp edge function.
 */
const WHATSAPP_EVENTS = new Set<TaskEvent>([
  'task_created',
  'task_assigned',
  'task_acknowledged',
  'task_started',
  'task_status_changed',
  'task_completed',
  'task_cancelled',
  'task_rejected',
  'task_delayed',
  'task_overdue',
  'task_reminder_1day',
  'task_reminder_3day',
]);

// Email gating now lives in src/lib/taskNotificationPolicy.ts so every
// task-email call site (useTaskNotifications, usePersonalTasks,
// TeamTaskMonitor, task-dependencies.service) reads from one source of
// truth. To allow a new task email, edit TASK_EMAIL_EVENTS in that file.

/** Map a status value to the appropriate TaskEvent */
export function statusToEvent(status: string): TaskEvent {
  switch (status.toLowerCase()) {
    case 'in_progress':
    case 'in-progress':     return 'task_started';
    case 'acknowledged':    return 'task_acknowledged';
    case 'done':
    case 'completed':
    case 'complete':        return 'task_completed';
    case 'delayed':         return 'task_delayed';
    case 'rejected':        return 'task_rejected';
    case 'cancelled':       return 'task_cancelled';
    default:                return 'task_status_changed';
  }
}

export function useTaskNotifications() {
  const { addNotification } = useNotifications();
  const { currentUser } = useUser();

  const notify = useCallback(async (payload: TaskNotificationPayload) => {
    const {
      event,
      taskTitle,
      taskId,
      recipientUserId,
      recipientName,
      dueDate,
      priority,
      extra = {},
    } = payload;

    const actorName   = currentUser?.fullName ?? 'A manager';
    const actorId     = currentUser?.id;
    const reason      = (extra as { reason?: string }).reason;
    const titleEn     = EVENT_LABELS_EN[event];
    const titleAr     = EVENT_LABELS_AR[event];
    const messageEn   = buildMessageEn(event, taskTitle, actorName, dueDate, reason);
    const messageAr   = buildMessageAr(event, taskTitle, actorName, dueDate, reason);
    const type        = EVENT_TYPES[event];

    // Don't notify the actor themselves about their own action
    if (actorId && actorId === recipientUserId) return;

    // Two delivery paths to avoid duplicates on terminal events:
    //
    // Terminal events (task_completed / task_cancelled, per
    //   src/lib/taskNotificationPolicy.ts) → route through ONLY the
    //   `dispatch-notification` edge function. The function:
    //     • inserts a row into `notifications` (in-app delivery via
    //       the recipient's realtime subscription)
    //     • sends an SMTP email (because send_email defaults to true
    //       inside the function and we don't suppress it here)
    //     • fires a WhatsApp message internally (lines 859-901 of the
    //       edge function — "fires for ALL notifications", auto-skipped
    //       per `user_integrations.whatsapp_enabled`)
    //   We deliberately skip the standalone `addNotification` and
    //   `send-whatsapp` invokes for terminal events to avoid duplicate
    //   in-app rows and duplicate WhatsApp messages.
    //
    // Non-terminal events → keep the lightweight client-side path:
    //     • `addNotification` (which itself persists to the DB at
    //       NotificationContext.tsx line 469) for in-app
    //     • standalone `send-whatsapp` invoke for WhatsApp
    //   The `dispatch-notification` edge function is NOT called, so
    //   no email is sent for these events.
    if (isTaskEmailEvent(event)) {
      supabase.functions.invoke('dispatch-notification', {
        body: {
          event_type:        event,
          entity_type:       'task',
          entity_id:         taskId || undefined,
          priority:          (event === 'task_overdue' || event === 'task_rejected') ? 'high' : 'normal',
          recipient_ids:     [recipientUserId],
          title_en:          titleEn,
          title_ar:          titleAr,
          message_en:        messageEn,
          message_ar:        messageAr,
          triggered_by:      actorId,
          triggered_by_name: actorName,
          action_url:        taskId
                                ? `https://app.pactorg.com/tasks/${taskId}`
                                : 'https://app.pactorg.com/my-tasks',
          metadata: {
            task_name:   taskTitle,
            due_date:    dueDate ?? '',
            priority:    priority ?? 'normal',
            assigned_to: recipientName ?? '',
            ...extra,
          },
          send_email: true,
        },
      }).catch(() => { /* non-blocking */ });
      return;
    }

    // Non-terminal: in-app + WhatsApp only, no email.
    addNotification({
      userId: recipientUserId,
      title: titleEn,
      message: messageEn,
      type,
      link: taskId ? `/tasks/${taskId}` : '/my-tasks',
    });

    if (WHATSAPP_EVENTS.has(event)) {
      supabase.functions.invoke('send-whatsapp', {
        body: {
          user_ids:   [recipientUserId],
          event_type: event,
          data: {
            task_title:       taskTitle,
            actor:            actorName,
            due_date:         dueDate ?? '',
            priority:         priority ?? 'normal',
            recipient_name:   recipientName ?? '',
            url:              taskId
                                 ? `https://app.pactorg.com/tasks/${taskId}`
                                 : 'https://app.pactorg.com/my-tasks',
            message:          messageEn,
            message_ar:       messageAr,
            ...extra,
          },
        },
      }).catch(() => { /* non-blocking — requires WASENDER_API_KEY */ });
    }

  }, [addNotification, currentUser]);

  /** Convenience: notify the current user themselves */
  const notifySelf = useCallback((event: TaskEvent, taskTitle: string, dueDate?: string | null, priority?: string | null) => {
    if (!currentUser?.id) return;
    notify({
      event,
      taskId: '',
      taskTitle,
      recipientUserId: currentUser.id,
      recipientName:   currentUser.fullName ?? undefined,
      dueDate,
      priority,
    });
  }, [currentUser, notify]);

  return { notify, notifySelf };
}
