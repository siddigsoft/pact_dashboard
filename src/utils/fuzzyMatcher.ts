
export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

export function similarity(a: string, b: string): number {
  const na = normalize(a), nb = normalize(b);
  if (na === nb) return 1;
  if (!na || !nb) return 0;
  const maxLen = Math.max(na.length, nb.length);
  return 1 - levenshtein(na, nb) / maxLen;
}

export function normalize(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[_\-.,;:!?'"()\[\]{}/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type MatchLevel = 'exact' | 'fuzzy' | 'partial' | 'enumerator' | 'none';

export interface MatchCandidate {
  siteId: string;
  siteName: string;
  state: string;
  locality: string;
  activity: string;
  enumeratorName: string;
}

export interface MatchResult {
  rowIndex: number;
  wfpRow: Record<string, string>;
  matchedSiteId: string | null;
  matchedSiteName: string | null;
  matchScore: number;
  matchLevel: MatchLevel;
  status: 'auto' | 'review' | 'unmatched' | 'actioned';
  action?: 'confirm' | 'link' | 'extra' | 'reject';
  manualMatchSiteId?: string;
  manualMatchBy?: string;
  manualMatchAt?: string;
}

export function runMatching(
  fileRows: Record<string, string>[],
  columnMapping: Record<string, string>,
  candidates: MatchCandidate[]
): MatchResult[] {
  const get = (row: Record<string, string>, field: string) =>
    normalize(row[columnMapping[field]] ?? '');

  return fileRows.map((row, rowIndex) => {
    const wfpSite = get(row, 'siteName');
    const wfpState = get(row, 'state');
    const wfpLocality = get(row, 'locality');
    const wfpActivity = get(row, 'activity');
    const wfpEnum = get(row, 'enumeratorName');

    let best: MatchCandidate | null = null;
    let bestScore = 0;
    let bestLevel: MatchLevel = 'none';

    for (const c of candidates) {
      const cSite = normalize(c.siteName);
      const cState = normalize(c.state);
      const cLocality = normalize(c.locality);
      const cActivity = normalize(c.activity);

      const siteScore = similarity(wfpSite, cSite);
      const stateExact = wfpState && cState ? wfpState === cState || similarity(wfpState, cState) >= 0.8 : true;
      const localityExact = wfpLocality && cLocality ? wfpLocality === cLocality || similarity(wfpLocality, cLocality) >= 0.8 : true;
      const activityExact = wfpActivity && cActivity ? wfpActivity === cActivity || similarity(wfpActivity, cActivity) >= 0.8 : true;

      if (siteScore === 1 && stateExact && localityExact && activityExact) {
        best = c; bestScore = 1; bestLevel = 'exact'; break;
      }
      if (siteScore >= 0.85 && stateExact && localityExact && activityExact) {
        if (siteScore > bestScore) { best = c; bestScore = siteScore; bestLevel = 'fuzzy'; }
      } else if (siteScore >= 0.75) {
        if (siteScore > bestScore && bestLevel !== 'exact' && bestLevel !== 'fuzzy') {
          best = c; bestScore = siteScore; bestLevel = 'partial';
        }
      } else if (wfpEnum && normalize(c.enumeratorName) === wfpEnum && stateExact) {
        if (bestLevel === 'none') { best = c; bestScore = 0.5; bestLevel = 'enumerator'; }
      }
    }

    const status: MatchResult['status'] =
      best && (bestLevel === 'exact' || bestLevel === 'fuzzy') ? 'auto'
      : best ? 'review'
      : 'unmatched';

    return {
      rowIndex,
      wfpRow: row,
      matchedSiteId: best?.siteId ?? null,
      matchedSiteName: best?.siteName ?? null,
      matchScore: Math.round(bestScore * 100),
      matchLevel: bestLevel,
      status,
    };
  });
}
