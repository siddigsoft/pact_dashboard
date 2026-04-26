import type { SiteVisit } from '@/types';

// SiteVisit (app-layer) statuses that count as terminal completion
// for analytics. Cancelled is intentionally excluded.
export const TERMINAL_COMPLETION_APP_STATUSES: ReadonlySet<SiteVisit['status']> = new Set<SiteVisit['status']>([
  'completed',
  'permitVerified',
]);

export const isTerminalCompletionAppStatus = (
  status: SiteVisit['status'] | string | null | undefined,
): boolean => TERMINAL_COMPLETION_APP_STATUSES.has(status as SiteVisit['status']);

// Raw mmp_site_entries.status values (lowercase, trimmed) that count as
// terminal completion for analytics. Mirrors the app-layer set above and
// keeps the two predicates in sync as the status taxonomy evolves.
export const TERMINAL_COMPLETION_RAW_STATUSES: ReadonlySet<string> = new Set([
  'completed',
  'verified',
]);

export const isTerminalCompletionRawStatus = (
  rawStatus: string | null | undefined,
): boolean => {
  const s = (rawStatus ?? '').toString().toLowerCase().trim();
  return TERMINAL_COMPLETION_RAW_STATUSES.has(s);
};
