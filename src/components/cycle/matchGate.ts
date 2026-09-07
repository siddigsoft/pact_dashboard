import type { MatchResult } from '@/utils/fuzzyMatcher';

/** The single authoritative row-level advance gate for Cycle Close Step 2. */
export function canAdvancePastMatch(
  results: MatchResult[],
  _resolvedSites: Record<string, 'not_covered' | 'override_confirmed' | 'resubmit'>,
): boolean {
  if (!results.length) return false;
  if (results.some(row => row.status === 'review' || row.status === 'unmatched' || (row.status !== 'auto' && !row.action))) return false;
  const confirmedSiteIds = results
    .filter(row => row.status === 'auto' || row.action === 'confirm')
    .map(row => row.matchedSiteId)
    .filter(Boolean) as string[];
  return new Set(confirmedSiteIds).size === confirmedSiteIds.length;
}