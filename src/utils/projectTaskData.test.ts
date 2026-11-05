import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadActiveTaskCounts, loadProjectTasks, loadTaskProfiles, projectTaskFromRow, withTaskRequestDeadline } from './projectTaskData';

afterEach(() => vi.useRealTimers());

describe('project task loading', () => {
  it('does not wait for profile lookups to return tasks', async () => {
    const chain: any = { select: vi.fn(() => chain), eq: vi.fn(() => chain), order: vi.fn(() => chain),
      abortSignal: vi.fn().mockResolvedValue({ data: [{ id: 'task', assigned_to_name: 'Saved name' }], error: null }) };
    const client = { from: vi.fn(() => chain) };
    expect((await loadProjectTasks(client, 'project'))[0].assignedToName).toBe('Saved name');
    expect(client.from).toHaveBeenCalledTimes(1);
    expect(client.from).toHaveBeenCalledWith('project_field_tasks');
  });
  it('surfaces failed queries instead of returning an empty project', async () => {
    const chain: any = { select: () => chain, eq: () => chain, order: () => chain,
      abortSignal: async () => ({ error: { message: 'Permission denied' } }) };
    await expect(loadProjectTasks({ from: () => chain }, 'project')).rejects.toThrow('Permission denied');
  });
  it('times out even if a transport does not settle after abort', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal;
    const result = withTaskRequestDeadline(s => { signal = s; return new Promise(() => {}); }, undefined, 100);
    const assertion = expect(result).rejects.toThrow('too long');
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(signal!.aborted).toBe(true);
  });
  it('cancels a stale project request on navigation', async () => {
    const controller = new AbortController();
    const result = withTaskRequestDeadline(() => new Promise(() => {}), controller.signal);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('batches profile resolution rather than constructing a very large URL', async () => {
    const groups: string[][] = [];
    const chain: any = { select: () => chain, in: (_key: string, ids: string[]) => { groups.push(ids); return chain; },
      abortSignal: async () => ({ data: [], error: null }) };
    await loadTaskProfiles({ from: () => chain }, Array.from({ length: 205 }, (_, i) => `id-${i}`));
    expect(groups.map(group => group.length)).toEqual([100, 100, 5]);
  });
  it('preserves all assignment/allocation fields including rates, zeros and baselines', () => {
    const hours = { main: { allocated: 24, actual: 0, ratePerHour: 50 }, co: { allocated: 16, actual: 8, ratePerHour: 25 } };
    expect(projectTaskFromRow({
      id: 'task', project_id: 'project', assigned_to: 'main', co_assignee_ids: ['co'],
      assignee_hours: hours, percent_complete: 50, weight: '2', resources: [{ id: 'vehicle' }],
      baseline_hours: 40, estimated_cost: 100, actual_cost: 0, notes: 'Keep this',
    })).toMatchObject({
      assignedTo: 'main', coAssigneeIds: ['co'], assigneeHours: hours, percentComplete: 50,
      weight: 2, baselineHours: 40, estimatedCost: 100, actualCost: 0, notes: 'Keep this',
      resources: [{ id: 'vehicle' }],
    });
  });
  it('pages and deduplicates active counts across assignee batches', async () => {
    let start = 0;
    const chain: any = {
      select: () => chain, in: vi.fn(() => chain), or: vi.fn(() => chain), eq: () => chain,
      order: () => chain, range: (offset: number) => { start = offset; return chain; },
      abortSignal: async () => ({ data: start === 0 ? Array.from({ length: 500 }, (_, i) =>
        ({ id: `task-${i}`, status: 'todo', assigned_to: 'id-0', co_assignee_ids: ['id-75'] })) : [], error: null }),
    };
    const result = await loadActiveTaskCounts({ from: () => chain }, Array.from({ length: 80 }, (_, i) => `id-${i}`), 'project');
    expect(result['id-0']).toBe(500);
    expect(result['id-75']).toBe(500);
    expect(chain.in).toHaveBeenCalledWith('status', ['todo', 'inprogress']);
    expect(chain.or.mock.calls[0][0]).toContain('co_assignee_ids.ov.');
  });
});
