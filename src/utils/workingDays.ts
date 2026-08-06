/**
 * Working-days utilities for project scheduling.
 *
 * Day-of-week integers follow JS Date.getDay():
 *   0 = Sunday, 1 = Monday, … 6 = Saturday
 *
 * Default calendar = Mon–Fri (no public-holiday exclusions).
 */

export const DEFAULT_WORKING_DAYS: number[] = [1, 2, 3, 4, 5];

/**
 * Count working days between two ISO date strings (inclusive of both endpoints).
 * Excludes days whose day-of-week is not in `workingDays` and any dates listed
 * in `exceptions`.
 *
 * Returns null if either date is missing or unparseable.
 */
export function workingDaysBetween(
  start: string | null | undefined,
  end:   string | null | undefined,
  workingDays: number[] = DEFAULT_WORKING_DAYS,
  exceptions: string[]  = [],
): number | null {
  if (!start || !end) return null;
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;
  if (s > e) return 0;

  const excSet = new Set(exceptions);
  let count = 0;
  const cur = new Date(s);
  while (cur <= e) {
    const iso = cur.toISOString().split('T')[0];
    if (workingDays.includes(cur.getDay()) && !excSet.has(iso)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

/**
 * Calendar days between two ISO date strings (inclusive), regardless of working-day
 * config. Useful for quick display next to the working-day count.
 */
export function calendarDaysBetween(
  start: string | null | undefined,
  end:   string | null | undefined,
): number | null {
  if (!start || !end) return null;
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;
  const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff + 1);
}

/**
 * Format a working-day count as a compact string, e.g. "5 wd", "1 wd".
 * Returns "—" when count is null.
 */
export function formatWorkingDays(count: number | null): string {
  if (count === null) return '—';
  return `${count} wd`;
}

/**
 * Advance `start` by `days` working days, skipping non-working days and exceptions.
 */
export function addWorkingDays(
  start: string,
  days: number,
  workingDays: number[] = DEFAULT_WORKING_DAYS,
  exceptions: string[]  = [],
): string {
  const excSet = new Set(exceptions);
  const d = new Date(start);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const iso = d.toISOString().split('T')[0];
    if (workingDays.includes(d.getDay()) && !excSet.has(iso)) added++;
  }
  return d.toISOString().split('T')[0];
}

export const DAY_NAMES: { value: number; short: string; label: string }[] = [
  { value: 1, short: 'Mon', label: 'Monday' },
  { value: 2, short: 'Tue', label: 'Tuesday' },
  { value: 3, short: 'Wed', label: 'Wednesday' },
  { value: 4, short: 'Thu', label: 'Thursday' },
  { value: 5, short: 'Fri', label: 'Friday' },
  { value: 6, short: 'Sat', label: 'Saturday' },
  { value: 0, short: 'Sun', label: 'Sunday' },
];
