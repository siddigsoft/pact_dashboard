import type { FieldTask } from '@/hooks/useProjectTasks';
import { ACTIVE_FIELD_TASK_STATUSES, activeTaskParticipantCounts } from './projectTaskReporting';

export const FIELD_TASK_COLUMNS = `
  id, project_id, title, description, priority, status,
  assigned_to, assigned_to_name, co_assignee_ids, due_date, start_date, state_name, locality_name,
  stage_id, notes, created_by, created_at, updated_at,
  estimated_hours, actual_hours, weight, estimated_cost, actual_cost, percent_complete,
  dependencies, resources, assignee_hours, review_required, reviewer_id, acceptance_criteria,
  baseline_start, baseline_due, baseline_hours, baseline_cost, baseline_set_at,
  creator:profiles!project_field_tasks_created_by_fkey(full_name)
`;

export async function withTaskRequestDeadline<T>(
  run: (signal: AbortSignal) => PromiseLike<T>,
  signal?: AbortSignal,
  timeoutMs = 25_000,
): Promise<T> {
  if (signal?.aborted) throw new DOMException('Task request cancelled', 'AbortError');
  const controller = new AbortController();
  let cancel: () => void = () => {};
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    cancel = () => {
      controller.abort();
      reject(new DOMException('Task request cancelled', 'AbortError'));
    };
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('Loading tasks took too long. Check your connection and retry.'));
    }, timeoutMs);
    signal?.addEventListener('abort', cancel, { once: true });
  });
  try {
    return await Promise.race([Promise.resolve(run(controller.signal)), deadline]);
  } finally {
    clearTimeout(timer!);
    signal?.removeEventListener('abort', cancel);
  }
}

export function projectTaskFromRow(r: any): FieldTask {
  return {
    reviewRequired: r.review_required ?? false, reviewerId: r.reviewer_id ?? null, acceptanceCriteria: r.acceptance_criteria ?? null,
    id: r.id, projectId: r.project_id, title: r.title,
    description: r.description, priority: r.priority, status: r.status,
    assignedTo: r.assigned_to, assignedToName: r.assigned_to_name || null,
    assignedToRole: null, coAssigneeIds: r.co_assignee_ids ?? [],
    dueDate: r.due_date, startDate: r.start_date,
    stateName: r.state_name, localityName: r.locality_name, stageId: r.stage_id,
    notes: r.notes, estimatedHours: r.estimated_hours ?? null, actualHours: r.actual_hours ?? null,
    weight: r.weight != null ? Number(r.weight) : null,
    estimatedCost: r.estimated_cost ?? null, actualCost: r.actual_cost ?? null,
    percentComplete: r.percent_complete ?? 0, dependencies: r.dependencies ?? [],
    resources: r.resources ?? [], assigneeHours: r.assignee_hours ?? {},
    createdBy: r.created_by, createdByName: r.creator?.full_name ?? null,
    createdAt: r.created_at, updatedAt: r.updated_at,
    baselineStart: r.baseline_start ?? null, baselineDue: r.baseline_due ?? null,
    baselineHours: r.baseline_hours ?? null, baselineCost: r.baseline_cost ?? null,
    baselineSetAt: r.baseline_set_at ?? null,
  };
}

export async function loadProjectTasks(client: any, projectId: string, signal?: AbortSignal) {
  const { data, error } = await withTaskRequestDeadline<any>(
    requestSignal => client.from('project_field_tasks').select(FIELD_TASK_COLUMNS)
      .eq('project_id', projectId).order('created_at', { ascending: false }).abortSignal(requestSignal),
    signal,
  );
  if (error) throw new Error(error.message || 'Could not load project tasks.');
  return (data ?? []).map(projectTaskFromRow) as FieldTask[];
}

/** Resolve names separately so slow profile lookups never hold the task list. */
export async function loadTaskProfiles(client: any, ids: string[], signal?: AbortSignal) {
  return withTaskRequestDeadline(async requestSignal => {
    const profiles: { id: string; full_name: string; role: string | null }[] = [];
    for (let start = 0; start < ids.length; start += 100) {
      const { data, error } = await client.from('profiles').select('id, full_name, role')
        .in('id', ids.slice(start, start + 100)).abortSignal(requestSignal);
      if (error) throw new Error('Some assignee names could not be loaded.');
      profiles.push(...(data ?? []));
    }
    return profiles;
  }, signal, 10_000);
}

export async function loadActiveTaskCounts(client: any, ids: string[], projectId?: string, signal?: AbortSignal) {
  return withTaskRequestDeadline(async requestSignal => {
    const found = new Map<string, any>();
    for (let start = 0; start < ids.length; start += 75) {
      const group = ids.slice(start, start + 75).map(id => JSON.stringify(id)).join(',');
      for (let offset = 0; ; offset += 500) {
        let request = client.from('project_field_tasks')
          .select('id, status, assigned_to, co_assignee_ids')
          .in('status', ACTIVE_FIELD_TASK_STATUSES)
          .or(`assigned_to.in.(${group}),co_assignee_ids.ov.{${group}}`);
        if (projectId) request = request.eq('project_id', projectId);
        const { data, error } = await request.order('id').range(offset, offset + 499).abortSignal(requestSignal);
        if (error) throw new Error('Could not load active task counts.');
        for (const row of data ?? []) found.set(row.id, row);
        if ((data ?? []).length < 500) break;
      }
    }
    return activeTaskParticipantCounts([...found.values()], ids);
  }, signal);
}

export async function loadActivePersonalTaskCounts(client: any, ids: string[], signal?: AbortSignal) {
  return withTaskRequestDeadline(async requestSignal => {
    const found = new Map<string, string>();
    for (let start = 0; start < ids.length; start += 75) {
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await client.from('personal_tasks')
          .select('id, assigned_to').neq('status', 'completed').neq('status', 'cancelled')
          .in('assigned_to', ids.slice(start, start + 75)).order('id')
          .range(offset, offset + 499).abortSignal(requestSignal);
        if (error) throw new Error('Could not load personal task counts.');
        for (const row of data ?? []) if (row.assigned_to) found.set(row.id, row.assigned_to);
        if ((data ?? []).length < 500) break;
      }
    }
    const counts = Object.fromEntries(ids.map(id => [id, 0]));
    for (const id of found.values()) if (id in counts) counts[id]++;
    return counts;
  }, signal);
}
