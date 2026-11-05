import { describe, expect, it } from 'vitest';
import { activeTaskParticipantCounts, assigneeBreakdownRows, assigneeSummaryRows, formatTaskCost, taskAssigneeIds } from './projectTaskReporting';
import { projectTaskFromRow } from './projectTaskData';

const task = (overrides = {}) => projectTaskFromRow({
  id: 'task-1', project_id: 'project-1', title: 'Shared work', status: 'inprogress', priority: 'medium',
  assigned_to: 'main', assigned_to_name: 'Main', co_assignee_ids: ['co', 'main', 'co'],
  start_date: '2026-11-01', due_date: '2026-11-05', estimated_hours: 40, actual_hours: 20,
  assignee_hours: { main: { allocated: 24, actual: 12, ratePerHour: 50 }, co: { allocated: 16, actual: 8, ratePerHour: 25 } },
  ...overrides,
});

describe('existing field-task reporting', () => {
  it('uses the actual terminal statuses and counts co-assignees once', () => {
    expect(activeTaskParticipantCounts([
      { status: 'todo', assigned_to: 'main', co_assignee_ids: ['co', 'main', 'co'] },
      { status: 'inprogress', assigned_to: 'co' },
      { status: 'done', assigned_to: 'main' },
      { status: 'cancelled', assigned_to: 'main' },
    ], ['main', 'co'])).toEqual({ main: 1, co: 2 });
  });
  it('shows recorded project currency without conversion or assuming USD', () => {
    expect(formatTaskCost(1234, 'UGX')).toContain('UGX');
    expect(formatTaskCost(1234, 'SDG')).toContain('SDG');
    expect(formatTaskCost(0, 'UGX')).toBe('UGX 0');
    expect(formatTaskCost(null, 'UGX')).toBe('—');
    expect(formatTaskCost(100, null)).toContain('Project currency not set');
    expect(formatTaskCost(100, null)).not.toContain('USD');
  });
  it('exports main/co assignments and unequal hours/rates, without assigning the whole task effort twice', () => {
    const rows = assigneeBreakdownRows([task()], new Map([['co', 'Contributor']]), 'UGX');
    expect(rows).toHaveLength(2);
    expect(rows[0].slice(8)).toEqual([24, 12, 50, 1200, 'UGX']);
    expect(rows[1].slice(4)).toEqual(['Contributor', 'Co-assignee', '2026-11-01', '2026-11-05', 16, 8, 25, 400, 'UGX']);
    expect(rows.map(row => row[8]).reduce<number>((sum, n) => sum + Number(n), 0)).toBe(40);
  });
  it('leaves missing allocations blank instead of inventing an equal split', () => {
    const rows = assigneeBreakdownRows([task({ assignee_hours: {} })], new Map(), 'UGX');
    expect(rows[0].slice(8, 12)).toEqual([null, null, null, null]);
    expect(rows[1][4]).toContain('Unresolved assignee');
  });
  it('summarizes effort, overdue work and participation rather than giving individual output credit', () => {
    const rows = assigneeSummaryRows([
      task(), task({ id: 'task-2', status: 'done' }), task({ id: 'task-3', status: 'cancelled' }),
    ], new Map(), new Date(2026, 10, 6));
    const main = rows.find(row => row[0] === 'main')!;
    expect(main.slice(2)).toEqual([3, 0, 1, 1, 1, 48, 36, -24]);
    const co = rows.find(row => row[0] === 'co')!;
    expect(co.slice(2)).toEqual([0, 3, 1, 1, 1, 32, 24, -16]);
  });
  it('does not include an unassigned task in someone else’s effort', () => {
    expect(taskAssigneeIds({ assignedTo: null, coAssigneeIds: [] })).toEqual([]);
    expect(assigneeSummaryRows([task({ assigned_to: null, co_assignee_ids: [] })], new Map())).toEqual([]);
  });
  it('does not treat missing actual hours as zero when comparing effort', () => {
    const rows = assigneeSummaryRows([task({ assignee_hours: { main: { allocated: 24, actual: null } } })], new Map());
    expect(rows.find(row => row[0] === 'main')![9]).toBeNull();
  });
});
