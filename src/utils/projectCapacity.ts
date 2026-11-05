export interface CapacityData {
  members: { id: string; name: string; dailyHours: number }[];
  tasks: { id: string; startDate?: string; dueDate?: string; assignedTo?: string; coAssigneeIds?: string[];
    estimatedHours?: number; hours?: Record<string, { allocated?: number }>; workingDays: number[]; holidays: string[] }[];
  leave: { userId: string; startDate: string; endDate: string }[];
  leaveAvailable: boolean; workingDays: number[]; holidays: string[]; basis: string;
}
function day(value: string) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.slice(0, 10)) throw new Error('Invalid planning date');
  return date;
}
export function workingDates(start: string, end: string, days: number[], holidays: string[]) {
  const cursor = day(start), last = day(end);
  const result: string[] = [];
  if (last < cursor || last.getTime() - cursor.getTime() > 3660 * 86400000) throw new Error('Invalid or excessively long task schedule');
  while (cursor <= last) {
    const iso = cursor.toISOString().slice(0, 10);
    if (days.includes(cursor.getUTCDay()) && !holidays.includes(iso)) result.push(iso);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}
export function calculateProjectCapacity(data: CapacityData, start: string, end: string) {
  const period = workingDates(start, end, data.workingDays, data.holidays);
  return data.members.map(member => {
    const availableDays = period.filter(date => !data.leave.some(leave =>
      leave.userId === member.id && date >= leave.startDate.slice(0, 10) && date <= leave.endDate.slice(0, 10)));
    const available = data.leaveAvailable ? availableDays.length * Number(member.dailyHours) : null;
    let allocated = 0, unscheduled = 0, unallocatedTasks = 0;
    for (const task of data.tasks) {
      const ids = [...new Set([task.assignedTo, ...(task.coAssigneeIds ?? [])].filter(Boolean))];
      if (!ids.includes(member.id)) continue;
      const hours = task.hours?.[member.id]?.allocated ?? (ids.length === 1 ? task.estimatedHours : null);
      if (hours == null || !Number.isFinite(Number(hours))) { unallocatedTasks++; continue; }
      if (!task.startDate || !task.dueDate || task.dueDate.slice(0, 10) < start) { unscheduled += Number(hours); continue; }
      try {
        const dates = workingDates(task.startDate, task.dueDate, task.workingDays, task.holidays);
        if (!dates.length) { unscheduled += Number(hours); continue; }
        const overlap = dates.filter(date => date >= start && date <= end).length;
        allocated += Number(hours) * overlap / dates.length;
      } catch { unscheduled += Number(hours); }
    }
    return { ...member, available, allocated, unscheduled, unallocatedTasks,
      utilization: available != null && available > 0 ? allocated / available * 100 : null,
      overloaded: available != null && allocated > available };
  });
}
