/**
 * useTaskNotifications
 * Fires in-app + email notifications on all personal_task lifecycle events.
 * Plug this into any mutation that creates or updates personal_tasks.
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
  /** Extra data to include in email/WhatsApp template */
  extra?: Record<string, string>;
}

const EVENT_LABELS: Record<TaskEvent, string> = {
  task_created: 'New Task Created',
  task_started: 'Task Started',
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

function buildMessage(event: TaskEvent, taskTitle: string, actorName: string, dueDate?: string | null): string {
  const due = dueDate ? ` (due ${dueDate})` : '';
  switch (event) {
    case 'task_created': return `Task "${taskTitle}" was created by ${actorName}${due}`;
    case 'task_assigned': return `${actorName} assigned you: "${taskTitle}"${due}`;
    case 'task_started': return `"${taskTitle}" has been started`;
    case 'task_acknowledged': return `"${taskTitle}" was acknowledged by the assignee`;
    case 'task_completed': return `"${taskTitle}" has been marked as completed 🎉`;
    case 'task_delayed': return `"${taskTitle}" has been marked as delayed${due}`;
    case 'task_rejected': return `"${taskTitle}" was rejected by ${actorName}`;
    case 'task_cancelled': return `"${taskTitle}" was cancelled`;
    case 'task_overdue': return `"${taskTitle}" is now overdue${due} — please take action`;
    case 'task_reminder_1day': return `"${taskTitle}" is due tomorrow${due}`;
    case 'task_reminder_3day': return `"${taskTitle}" is due in 3 days${due}`;
    case 'task_status_changed': return `"${taskTitle}" status updated by ${actorName}`;
    default: return `Task "${taskTitle}" updated`;
  }
}

/** Map a status value to the appropriate TaskEvent */
export function statusToEvent(status: string): TaskEvent {
  switch (status.toLowerCase()) {
    case 'in_progress': case 'in-progress': return 'task_started';
    case 'acknowledged': return 'task_acknowledged';
    case 'done': case 'completed': case 'complete': return 'task_completed';
    case 'delayed': return 'task_delayed';
    case 'rejected': return 'task_rejected';
    case 'cancelled': return 'task_cancelled';
    default: return 'task_status_changed';
  }
}

export function useTaskNotifications() {
  const { addNotification } = useNotifications();
  const { currentUser } = useUser();

  const notify = useCallback(async (payload: TaskNotificationPayload) => {
    const {
      event,
      taskTitle,
      recipientUserId,
      recipientName,
      dueDate,
      extra = {},
    } = payload;

    const actorName = currentUser?.fullName ?? 'A manager';
    const title = EVENT_LABELS[event];
    const message = buildMessage(event, taskTitle, actorName, dueDate);
    const type = EVENT_TYPES[event];

    // 1. In-app notification
    addNotification({
      userId: recipientUserId,
      title,
      message,
      type,
      link: '/my-tasks',
    });

    // 2. Email via dispatch-notification edge function (fire-and-forget)
    supabase.functions.invoke('dispatch-notification', {
      body: {
        event,
        recipient_user_id: recipientUserId,
        data: {
          task_title: taskTitle,
          recipient_name: recipientName ?? '',
          assigned_by: actorName,
          due_date: dueDate ?? 'No due date set',
          message,
          ...extra,
        },
      },
    }).catch(() => { /* Non-blocking */ });

    // 3. WhatsApp — infrastructure ready; requires API key
    // Once a Twilio/Meta WhatsApp Business API key is configured,
    // the send-whatsapp edge function below will deliver the message
    // to the employee's registered phone number automatically.
    // supabase.functions.invoke('send-whatsapp', {
    //   body: { recipient_user_id: recipientUserId, message },
    // }).catch(() => {});

  }, [addNotification, currentUser]);

  /** Convenience: notify the current user themselves */
  const notifySelf = useCallback((event: TaskEvent, taskTitle: string, dueDate?: string | null) => {
    if (!currentUser?.id) return;
    notify({
      event,
      taskId: '',
      taskTitle,
      recipientUserId: currentUser.id,
      recipientName: currentUser.fullName ?? undefined,
      dueDate,
    });
  }, [currentUser, notify]);

  return { notify, notifySelf };
}
