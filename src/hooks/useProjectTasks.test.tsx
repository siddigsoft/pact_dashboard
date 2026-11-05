import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMyProjectFieldTasks, useProjectTasks } from './useProjectTasks';

const memory = vi.hoisted(() => ({
  rows: [] as any[],
  writes: [] as any[],
  notifications: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/notify', () => ({ dispatchNotification: memory.notifications }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      let mode = 'read';
      let payload: any;
      const matches: ((row: any) => boolean)[] = [];
      const result = () => {
        if (mode === 'insert') {
          const row = { ...payload, id: 'created-task', created_at: '2026-11-06', updated_at: '2026-11-06' };
          memory.rows.push(row);
          memory.writes.push(JSON.parse(JSON.stringify(row)));
          mode = 'read';
          return { data: row, error: null };
        }
        if (mode === 'update') {
          for (const row of memory.rows.filter(row => matches.every(fn => fn(row)))) Object.assign(row, payload);
          memory.writes.push(JSON.parse(JSON.stringify(payload)));
          return { data: null, error: null };
        }
        const source = table === 'project_field_tasks' ? memory.rows : table === 'projects'
          ? [{ id: 'project', name: 'Test project' }]
          : [{ id: 'main', full_name: 'Main Person', role: 'staff' }, { id: 'co', full_name: 'Contributor', role: 'staff' }];
        return { data: JSON.parse(JSON.stringify(source.filter(row => matches.every(fn => fn(row))))), error: null };
      };
      const chain: any = {
        select: () => chain, order: () => chain,
        eq: (key: string, value: any) => { matches.push(row => row[key] === value); return chain; },
        neq: (key: string, value: any) => { matches.push(row => row[key] !== value); return chain; },
        in: (key: string, values: any[]) => { matches.push(row => values.includes(row[key])); return chain; },
        contains: (key: string, values: any[]) => { matches.push(row => values.every(value => row[key]?.includes(value))); return chain; },
        insert: (value: any) => { mode = 'insert'; payload = value; return chain; },
        update: (value: any) => { mode = 'update'; payload = value; return chain; },
        single: async () => result(),
        maybeSingle: async () => ({ data: null, error: null }),
        abortSignal: async () => result(),
        then: (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject),
      };
      return chain;
    },
  },
}));

const clients: QueryClient[] = [];
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}

beforeEach(() => { memory.rows = []; memory.writes = []; memory.notifications.mockClear(); });
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); });

describe('existing project-task save/reopen and assignment flows', () => {
  it('includes co-only tasks and avoids duplicate rows for legacy dual assignments', async () => {
    memory.rows = [
      { id: 'co-only', project_id: 'project', title: 'Co only', status: 'todo', priority: 'medium', assigned_to: null, co_assignee_ids: ['co'] },
      { id: 'legacy-dual', project_id: 'project', title: 'Legacy', status: 'todo', priority: 'medium', assigned_to: 'co', co_assignee_ids: ['co'] },
    ];
    const { wrapper } = setup();
    const member = renderHook(() => useMyProjectFieldTasks('co'), { wrapper });
    await waitFor(() => expect(member.result.current.data).toHaveLength(2));
    expect(new Set(member.result.current.data!.map(row => row.id))).toEqual(new Set(['co-only', 'legacy-dual']));
  });
  it('creates and reopens unequal allocations, then refreshes the co-assignee My Tasks list', async () => {
    const { wrapper, client } = setup();
    const owner = renderHook(() => useProjectTasks('project'), { wrapper });
    const member = renderHook(() => useMyProjectFieldTasks('co'), { wrapper });
    await waitFor(() => expect(owner.result.current.isLoading).toBe(false));
    const hours = { main: { allocated: 24, actual: 0, ratePerHour: 50 }, co: { allocated: 16, actual: 8, ratePerHour: 25 } };
    await act(async () => {
      await owner.result.current.createTask({
        title: 'Unequal work', priority: 'high', status: 'inprogress',
        assignedTo: 'main', assignedToName: 'Main Person', coAssigneeIds: ['co', 'main'],
        estimatedHours: 40, actualHours: 8, assigneeHours: hours,
        notes: 'Deliverable evidence', percentComplete: 25, weight: 2,
      }, 'actor', 'Test project', 'Manager');
    });
    await waitFor(() => expect(owner.result.current.tasks).toHaveLength(1));
    expect(owner.result.current.tasks[0]).toMatchObject({
      assignedTo: 'main', coAssigneeIds: ['co'], assigneeHours: hours, notes: 'Deliverable evidence', weight: 2,
    });
    await waitFor(() => expect(member.result.current.data).toHaveLength(1));
    expect(member.result.current.data![0].id).toBe('created-task');
    // Removing cached data forces the existing read path to reopen the saved row.
    owner.unmount();
    client.removeQueries({ queryKey: ['project_field_tasks', 'project'] });
    const reopened = renderHook(() => useProjectTasks('project'), { wrapper });
    await waitFor(() => expect(reopened.result.current.tasks).toHaveLength(1));
    expect(reopened.result.current.tasks[0].assigneeHours).toEqual(hours);
    expect(memory.writes[0].assignee_hours.main.actual).toBe(0);
  });

  it('saves allocation edits without dropping rates and removes a former co-assignee from My Tasks', async () => {
    memory.rows = [{
      id: 'existing', project_id: 'project', title: 'Shared', status: 'todo', priority: 'medium',
      assigned_to: 'main', co_assignee_ids: ['co'], assignee_hours: { co: { allocated: 10, actual: 0, ratePerHour: 5 } },
    }];
    const { wrapper } = setup();
    const owner = renderHook(() => useProjectTasks('project'), { wrapper });
    const member = renderHook(() => useMyProjectFieldTasks('co'), { wrapper });
    await waitFor(() => expect(member.result.current.data).toHaveLength(1));
    await act(async () => {
      await owner.result.current.updateTask('existing', {
        coAssigneeIds: [], assigneeHours: { main: { allocated: 12, actual: 2, ratePerHour: 15 } },
      });
    });
    await waitFor(() => expect(owner.result.current.tasks[0].assigneeHours.main.ratePerHour).toBe(15));
    await waitFor(() => expect(member.result.current.data).toHaveLength(0));
    expect(owner.result.current.tasks[0].coAssigneeIds).toEqual([]);
  });
});
