import type { SiteVisit } from '@/types';

/**
 * SiteVisit (app-layer) statuses that count as terminal completion for analytics.
 *
 * Phase A update:
 *   - Added 'submitted'     — enumerator self-reported; counts as resolved for cycle close gate
 *   - Added 'wfp_confirmed' — WFP confirmed; the definitive completion status
 *   - 'completed' retained for backwards compatibility (old records before Phase A migration)
 */
export const TERMINAL_COMPLETION_APP_STATUSES: ReadonlySet<SiteVisit['status']> = new Set<SiteVisit['status']>([
  'completed',      // legacy pre-Phase A value (keep for safety)
  'submitted',      // Phase A: enumerator self-reported to WFP ODK
  'wfp_confirmed',  // Phase C: WFP confirmed receipt
  'permitVerified', // permit workflow terminal
]);

export const isTerminalCompletionAppStatus = (
  status: SiteVisit['status'] | string | null | undefined,
): boolean => TERMINAL_COMPLETION_APP_STATUSES.has(status as SiteVisit['status']);

/**
 * Raw mmp_site_entries.status values (lowercase, trimmed) that count as
 * terminal completion for analytics and the cycle close Pre-Close Checklist.
 *
 * Phase A update:
 *   - Added 'submitted'     — counts as resolved (enumerator done; WFP proof pending)
 *   - Added 'wfp_confirmed' — WFP confirmed; the gold standard terminal status
 *   - Added 'not_covered'   — officially documented as not visited
 *   - 'completed' retained  — for any records not yet migrated
 *   - 'verified' retained   — legacy permit-verified value
 */
export const TERMINAL_COMPLETION_RAW_STATUSES: ReadonlySet<string> = new Set([
  'completed',      // legacy pre-Phase A (keeps old analytics correct)
  'submitted',      // Phase A replacement for 'completed'
  'wfp_confirmed',  // Phase C: confirmed by WFP file
  'verified',       // legacy permit-verified
  'not_covered',    // officially not visited
  'cancelled',      // cancelled at cycle close
]);

export const isTerminalCompletionRawStatus = (
  rawStatus: string | null | undefined,
): boolean => {
  const s = (rawStatus ?? '').toString().toLowerCase().trim();
  return TERMINAL_COMPLETION_RAW_STATUSES.has(s);
};

/**
 * Raw statuses that count as "paid" — the fee is now owed to the enumerator.
 * Only wfp_confirmed qualifies. submitted does NOT trigger payment.
 */
export const FEE_TRIGGER_RAW_STATUSES: ReadonlySet<string> = new Set([
  'wfp_confirmed',
]);

export const isFeeTriggeredStatus = (
  rawStatus: string | null | undefined,
): boolean => {
  const s = (rawStatus ?? '').toString().toLowerCase().trim();
  return FEE_TRIGGER_RAW_STATUSES.has(s);
};

/**
 * Statuses that are considered "in-progress" — not yet terminal, not yet started.
 */
export const IN_PROGRESS_RAW_STATUSES: ReadonlySet<string> = new Set([
  'assigned',
  'dispatched',
  'accepted',
]);

export const isInProgressRawStatus = (
  rawStatus: string | null | undefined,
): boolean => {
  const s = (rawStatus ?? '').toString().toLowerCase().trim();
  return IN_PROGRESS_RAW_STATUSES.has(s);
};
