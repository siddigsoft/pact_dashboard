import type { FieldTask } from '@/hooks/useProjectTasks';

export const ACTIVE_FIELD_TASK_STATUSES = ['todo', 'inprogress'];

export function taskAssigneeIds(task: { assignedTo?: string | null; coAssigneeIds?: string[] }) {
  return [...new Set([task.assignedTo, ...(task.coAssigneeIds ?? [])].filter(Boolean))] as string[];
}

export function taskCurrencyLabel(currency?: string | null) {
  return currency?.trim() || 'Project currency not set';
}

export function formatTaskCost(value: number | null | undefined, currency?: string | null) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return `${taskCurrencyLabel(currency)} ${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function assigneeBreakdownRows(
  tasks: FieldTask[], names: Map<string, string>, currency?: string | null,
) {
  return tasks.flatMap(task => taskAssigneeIds(task).map(id => {
    const allocation = task.assigneeHours[id];
    const allocated = allocation?.allocated ?? null;
    const rate = allocation?.ratePerHour ?? null;
    return [
      task.id, task.title, task.status, id,
      names.get(id) || (id === task.assignedTo ? task.assignedToName : null) || `Unresolved assignee (${id})`,
      id === task.assignedTo ? 'Main assignee' : 'Co-assignee',
      task.startDate ?? '', task.dueDate ?? '', allocated, allocation?.actual ?? null,
      rate, allocated != null && rate != null ? allocated * rate : null,
      taskCurrencyLabel(currency),
    ];
  }));
}

/** Counts participation, never attributes the whole task's output to each person. */
export function assigneeSummaryRows(tasks: FieldTask[], names: Map<string, string>, now = new Date()) {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const people = new Map<string, {
    name: string; main: number; shared: number; active: number; done: number; overdue: number;
    allocated: number; actual: number; comparableActual: number; hasAllocated: boolean; hasActual: boolean; varianceComplete: boolean;
  }>();
  for (const task of tasks) for (const id of taskAssigneeIds(task)) {
    const person = people.get(id) ?? {
      name: names.get(id) || (id === task.assignedTo ? task.assignedToName : null) || `Unresolved assignee (${id})`,
      main: 0, shared: 0, active: 0, done: 0, overdue: 0,
      allocated: 0, actual: 0, comparableActual: 0, hasAllocated: false, hasActual: false, varianceComplete: true,
    };
    if (task.assignedTo === id) person.main++;
    else person.shared++;
    if (ACTIVE_FIELD_TASK_STATUSES.includes(task.status)) {
      person.active++;
      if (task.dueDate && task.dueDate.slice(0, 10) < today) person.overdue++;
    }
    if (task.status === 'done') person.done++;
    const hours = task.assigneeHours[id];
    if (task.status !== 'cancelled' && (hours?.allocated == null || hours?.actual == null)) {
      person.varianceComplete = false;
    }
    if (task.status !== 'cancelled' && hours?.allocated != null) {
      person.allocated += hours.allocated;
      person.hasAllocated = true;
    }
    if (hours?.actual != null) {
      person.actual += hours.actual;
      if (task.status !== 'cancelled') person.comparableActual += hours.actual;
      person.hasActual = true;
    }
    people.set(id, person);
  }
  return [...people].map(([id, p]) => [
    id, p.name, p.main, p.shared, p.active, p.done, p.overdue,
    p.hasAllocated ? p.allocated : null, p.hasActual ? p.actual : null,
    p.hasAllocated && p.hasActual && p.varianceComplete ? p.comparableActual - p.allocated : null,
  ]);
}

export function activeTaskParticipantCounts(
  rows: { status: string; assigned_to?: string | null; co_assignee_ids?: string[] }[], ids: string[],
) {
  const counts = Object.fromEntries(ids.map(id => [id, 0]));
  for (const row of rows) {
    if (!ACTIVE_FIELD_TASK_STATUSES.includes(row.status)) continue;
    for (const id of taskAssigneeIds({ assignedTo: row.assigned_to, coAssigneeIds: row.co_assignee_ids })) {
      if (id in counts) counts[id]++;
    }
  }
  return counts;
}
