import type { MatchPair } from '@/utils/fuzzyMatcher';

const ACTIVITY_LIKE_HEADER = /\b(activity|monitoring|monitor|sub[\s_-]*activity|programme|program)\b/i;
const LOCATION_LIKE_HEADER = /\b(site|location|village|locality|district|community|code|address)\b/i;
export const SITE_IDENTITY_MMP_COLUMNS = ['site_code', 'site_name', 'state', 'locality'] as const;

export type PairSemanticIssue = {
  index: number;
  message: string;
  suggestion: string;
};

/** A site identity pair must point at a location/name column, never a form question. */
export function getPairSemanticIssues(pairs: MatchPair[]): PairSemanticIssue[] {
  return pairs.flatMap((pair, index) => {
    if (pair.mmpColumn !== 'site_name' || !pair.wfpColumn) return [];
    if (!ACTIVITY_LIKE_HEADER.test(pair.wfpColumn)) return [];
    return [{
      index,
      message: `Site Name is paired with “${pair.wfpColumn}”, which looks like an activity or monitoring question.`,
      suggestion: 'Choose the exact location/site name column instead.',
    }];
  });
}

/** Repairs stale resume state without guessing when there is more than one location candidate. */
export function sanitizeMatchingPairs(
  mmpCols: string[],
  wfpCols: string[],
  pairs: MatchPair[],
): MatchPair[] {
  const locationCandidates = wfpCols.filter(column =>
    LOCATION_LIKE_HEADER.test(column) && !ACTIVITY_LIKE_HEADER.test(column)
  );
  return pairs.filter(pair => SITE_IDENTITY_MMP_COLUMNS.includes(pair.mmpColumn as typeof SITE_IDENTITY_MMP_COLUMNS[number])).map(pair => {
    if (pair.mmpColumn !== 'site_name' || !ACTIVITY_LIKE_HEADER.test(pair.wfpColumn ?? '')) return pair;
    const available = locationCandidates.filter(column =>
      column !== pair.wfpColumn && !pairs.some(other => other !== pair && other.wfpColumn === column)
    );
    return available.length === 1 ? { ...pair, wfpColumn: available[0] } : { ...pair, wfpColumn: '' };
  });
}

const MMP_MATCH_ALIASES: Array<{ mmpCol: string; keywords: string[] }> = [
  { mmpCol: 'site_code', keywords: ['site code', 'site id', 'site_code', 'location code', 'location id'] },
  // Site identity must never consume an activity question. Keep aliases
  // location-specific and deliberately exclude the broad word "site".
  { mmpCol: 'site_name', keywords: ['exact location name', 'exact site name', 'site name', 'location name', 'village name', 'موقع'] },
  { mmpCol: 'state', keywords: ['state of the site', 'state', 'governorate', 'ولاية'] },
  { mmpCol: 'locality', keywords: ['locality of the site', 'locality', 'district', 'محلية'] },
];

export function autoDetectPairs(mmpCols: string[], wfpCols: string[]): MatchPair[] {
  const pairs: MatchPair[] = [];
  const usedWfp = new Set<string>();
  const wfpLower = wfpCols.map(column => column.toLowerCase());

  // A shared site code is the strongest identity key. Do not add context
  // fields: doing so turns valid site identities into partial matches.
  if (mmpCols.includes('site_code')) {
    const index = wfpLower.findIndex(column => ['site code', 'site id', 'site_code', 'location code', 'location id'].some(keyword => column.includes(keyword)));
    if (index >= 0) return [{ mmpColumn: 'site_code', wfpColumn: wfpCols[index] }];
  }

  for (const { mmpCol, keywords } of MMP_MATCH_ALIASES) {
    if (!mmpCols.includes(mmpCol)) continue;
    let matched: string | null = null;
    outer:
    for (const keyword of keywords) {
      for (let index = 0; index < wfpCols.length; index++) {
        if (!usedWfp.has(wfpCols[index]) && wfpLower[index].includes(keyword)) {
          matched = wfpCols[index];
          break outer;
        }
      }
    }
    if (matched) {
      pairs.push({ mmpColumn: mmpCol, wfpColumn: matched });
      usedWfp.add(matched);
    }
  }
  return pairs;
}