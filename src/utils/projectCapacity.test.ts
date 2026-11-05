import { describe, expect, it } from 'vitest';
import { calculateProjectCapacity, workingDates, type CapacityData } from './projectCapacity';
const base: CapacityData = { members: [{ id: 'a', name: 'A', dailyHours: 8 }], tasks: [],
  leave: [], leaveAvailable: true, workingDays: [1,2,3,4,5], holidays: [], basis: 'Planning' };
describe('project capacity', () => {
  it('uses calendar working days and holidays', () => {
    expect(workingDates('2026-11-02', '2026-11-08', [1,2,3,4,5], ['2026-11-04'])).toHaveLength(4);
  });
  it('subtracts approved unavailability without double counting overlaps', () => {
    const [row] = calculateProjectCapacity({ ...base, leave: [
      { userId: 'a', startDate: '2026-11-03', endDate: '2026-11-04' },
      { userId: 'a', startDate: '2026-11-04', endDate: '2026-11-04' }] }, '2026-11-02', '2026-11-08');
    expect(row.available).toBe(24);
  });
  it('prorates hours using the whole task schedule, not only the selected window', () => {
    const [row] = calculateProjectCapacity({ ...base, tasks: [{ id: 't', assignedTo: 'a', startDate: '2026-11-02', dueDate: '2026-11-13',
      estimatedHours: 80, workingDays: base.workingDays, holidays: [] }] }, '2026-11-02', '2026-11-08');
    expect(row.allocated).toBe(40);
  });
  it('does not assume equal shares for multi-assignee tasks', () => {
    const [row] = calculateProjectCapacity({ ...base, tasks: [{ id: 't', assignedTo: 'a', coAssigneeIds: ['b'], estimatedHours: 20,
      workingDays: base.workingDays, holidays: [] }] }, '2026-11-02', '2026-11-08');
    expect(row.unallocatedTasks).toBe(1); expect(row.allocated).toBe(0);
  });
  it('keeps missing leave data unknown, not spare capacity', () => {
    expect(calculateProjectCapacity({ ...base, leaveAvailable: false }, '2026-11-02', '2026-11-08')[0].available).toBeNull();
  });
  it('preserves overload rather than capping it', () => {
    const [row] = calculateProjectCapacity({ ...base, tasks: [{ id: 't', assignedTo: 'a', startDate: '2026-11-02', dueDate: '2026-11-06',
      estimatedHours: 60, workingDays: base.workingDays, holidays: [] }] }, '2026-11-02', '2026-11-08');
    expect(row.utilization).toBe(150); expect(row.overloaded).toBe(true);
  });
  it('flags undated and overdue work instead of quietly dropping it', () => {
    const [row] = calculateProjectCapacity({ ...base, tasks: [{ id: 't', assignedTo: 'a', estimatedHours: 16,
      dueDate: '2026-10-30', workingDays: base.workingDays, holidays: [] }] }, '2026-11-02', '2026-11-08');
    expect(row.unscheduled).toBe(16);
  });
});
