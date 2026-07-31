
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

export type MatchLevel = 'exact' | 'fuzzy' | 'partial' | 'none';

/** A single column-pair used for matching: one column from the MMP DB, one from the WFP upload. */
export interface MatchPair {
  mmpColumn: string;
  wfpColumn: string;
}

/** One MMP site entry, now carrying all loaded DB columns as a flat map. */
export interface MatchCandidate {
  siteId: string;
  data: Record<string, string>;
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

/**
 * Match every WFP file row to the best MMP site-entry candidate.
 *
 * Scoring:
 *  - The first pair is the PRIMARY field (weight 2).  All other pairs have weight 1.
 *  - Per-pair score is levenshtein similarity on normalised values (0–1).
 *    If either side is blank we treat the pair as neutral (0.5) rather than penalising it.
 *  - Weighted average determines the match level:
 *      ≥ 0.92 on ALL pairs → exact  → auto
 *      weighted avg ≥ 0.78 → fuzzy  → auto
 *      weighted avg ≥ 0.50 → partial → review
 *      otherwise           → none   → unmatched
 */
export function runMatching(
  fileRows: Record<string, string>[],
  matchingPairs: MatchPair[],
  candidates: MatchCandidate[]
): MatchResult[] {
  const validPairs = matchingPairs.filter(p => p.mmpColumn && p.wfpColumn);

  if (!validPairs.length || !candidates.length) {
    return fileRows.map((row, rowIndex) => ({
      rowIndex, wfpRow: row,
      matchedSiteId: null, matchedSiteName: null,
      matchScore: 0, matchLevel: 'none', status: 'unmatched',
    }));
  }

  // First pair = primary (weight 2); the rest = weight 1
  const weights = validPairs.map((_, i) => (i === 0 ? 2 : 1));
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  return fileRows.map((row, rowIndex) => {
    const wfpVals = validPairs.map(p => normalize(row[p.wfpColumn] ?? ''));

    let best: MatchCandidate | null = null;
    let bestScore = 0;
    let bestLevel: MatchLevel = 'none';

    for (const c of candidates) {
      const mmpVals = validPairs.map(p => normalize(c.data[p.mmpColumn] ?? ''));

      const pairScores = validPairs.map((_, i) => {
        const wv = wfpVals[i], mv = mmpVals[i];
        if (!wv || !mv) return 0.5;   // unknown → neutral
        return similarity(wv, mv);
      });

      const weightedScore =
        pairScores.reduce((sum, s, i) => sum + s * weights[i], 0) / totalWeight;
      const allHigh = pairScores.every(s => s >= 0.92);

      const level: MatchLevel = allHigh ? 'exact'
        : weightedScore >= 0.78 ? 'fuzzy'
        : weightedScore >= 0.50 ? 'partial'
        : 'none';

      if (level === 'exact') {
        best = c; bestScore = weightedScore; bestLevel = 'exact'; break;
      }
      if (weightedScore > bestScore) {
        best = c; bestScore = weightedScore; bestLevel = level;
      }
    }

    const status: MatchResult['status'] =
      best && (bestLevel === 'exact' || bestLevel === 'fuzzy') ? 'auto'
        : best && bestLevel === 'partial' ? 'review'
          : 'unmatched';

    // Display name: prefer primary MMP column, fall back to site_name
    const primaryMmpCol = validPairs[0].mmpColumn;
    const matchedSiteName = best
      ? (best.data[primaryMmpCol] ?? best.data['site_name'] ?? null)
      : null;

    return {
      rowIndex,
      wfpRow: row,
      matchedSiteId: best?.siteId ?? null,
      matchedSiteName,
      matchScore: Math.round(bestScore * 100),
      matchLevel: bestLevel,
      status,
    };
  });
}
