/**
 * Task notification channel policy — single source of truth.
 *
 * Per user request 2026-04-26:
 *   "Notification in app and WhatsApp should be sent automatically per
 *    changes in the task, and final emails when the task is completed or
 *    cancelled, for all the users in the task."
 *
 * Channel rules:
 *   • In-app   → fires on every task change (handled per-call by callers)
 *   • WhatsApp → fires on every task change (handled per-call by callers)
 *   • Email    → ONLY for terminal lifecycle events listed in TASK_EMAIL_EVENTS
 *
 * To extend (e.g. add task_overdue email for SLA accountability), add the
 * event key to TASK_EMAIL_EVENTS below — every task-email call site reads
 * from this set, so a single edit propagates everywhere.
 *
 * Call sites that respect this policy:
 *   • src/hooks/useTaskNotifications.ts        (TaskDetail lifecycle hooks)
 *   • src/hooks/usePersonalTasks.ts            (dispatchTaskMultiChannel helper)
 *   • src/pages/TeamTaskMonitor.tsx            (manager-creates-task path)
 *   • src/services/task-dependencies.service.ts (dependency_added / dependency_blocked)
 */
export const TASK_EMAIL_EVENTS = new Set<string>([
  'task_completed',
  'task_cancelled',
]);

/**
 * Returns true when the given task event is allowed to send an email.
 * False (the default) means in-app + WhatsApp deliver the change while
 * the inbox stays clean.
 */
export function isTaskEmailEvent(event: string | null | undefined): boolean {
  if (!event) return false;
  return TASK_EMAIL_EVENTS.has(event);
}
