import type { MatchResult } from '@/utils/fuzzyMatcher';

export function getDuplicateSiteIds(results: MatchResult[]): Set<string> {
  const confirmed = results
    .filter(row => row.status === 'auto' || row.action === 'confirm')
    .map(row => row.matchedSiteId)
    .filter((id): id is string => !!id);
  return new Set(confirmed.filter((id, index) => confirmed.indexOf(id) !== index));
}

export function classifyMatchResults(results: MatchResult[]) {
  const duplicateSiteIds = getDuplicateSiteIds(results);
  const confirmed = results.filter(row =>
    (row.status === 'auto' || row.action === 'confirm') &&
    !!row.matchedSiteId &&
    !duplicateSiteIds.has(row.matchedSiteId),
  );
  const exceptions = results.filter(row =>
    row.status === 'review' ||
    row.status === 'unmatched' ||
    row.action === 'extra' ||
    row.action === 'reject' ||
    (!!row.matchedSiteId && duplicateSiteIds.has(row.matchedSiteId)),
  );
  return { confirmed, exceptions, duplicateSiteIds };
}
