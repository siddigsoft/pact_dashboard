/**
 * useTaskNotifications
 * Fires in-app + email + WhatsApp (WasenderAPI) notifications on all
 * personal_task lifecycle events.
 *
 * Channels:
 *  1. In-app  — via NotificationContext (instant)
 *  2. Email   — dispatch-notification edge function (bilingual HTML)
 *  3. WhatsApp — send-whatsapp edge function via WasenderAPI (bilingual)
 *     WhatsApp fires for high-priority events when WASENDER_API_KEY is set.
 */
import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useNotifications } from '@/context/notifications/NotificationContext';
import { useUser } from '@/context/user/UserContext';

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
 * Events that also trigger WhatsApp.
 * Per user request: ALL status changes notify ALL channels (in-app + email + WhatsApp).
 */
const WHATSAPP_EVENTS = new Set<TaskEvent>([
  'task_assigned',
  'task_started',
  'task_completed',
  'task_cancelled',
  'task_rejected',
  'task_delayed',
  'task_overdue',
  'task_reminder_1day',
  'task_status_changed',
]);

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

    // ── 1. In-app notification ────────────────────────────────────────────────
    addNotification({
      userId: recipientUserId,
      title: titleEn,
      message: messageEn,
      type,
      link: taskId ? `/tasks/${taskId}` : '/my-tasks',
    });

    // ── 2. Email via dispatch-notification (bilingual, fire-and-forget) ───────
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
      },
    }).catch(() => { /* non-blocking */ });

    // ── 3. WhatsApp via WasenderAPI (fire-and-forget, high-urgency events) ───
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
