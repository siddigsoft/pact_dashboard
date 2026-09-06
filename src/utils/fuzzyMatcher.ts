
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

const exactKey = (values: string[]) => values.map(normalize).join('\u241f');
export const FUZZY_WORKLOAD_BUDGET = 2_000_000;

export function buildExactIndex(validPairs: MatchPair[], candidates: MatchCandidate[]) {
  const exactIndex = new Map<string, MatchCandidate[]>();
  candidates.forEach(candidate => {
    const values = validPairs.map(pair => candidate.data[pair.mmpColumn] ?? '');
    if (values.some(value => !normalize(value))) return;
    const key = exactKey(values);
    const bucket = exactIndex.get(key);
    if (bucket) bucket.push(candidate);
    else exactIndex.set(key, [candidate]);
  });
  return exactIndex;
}

async function buildExactIndexYielding(
  validPairs: MatchPair[],
  candidates: MatchCandidate[],
  isCancelled?: () => boolean,
) {
  const exactIndex = new Map<string, MatchCandidate[]>();
  for (let index = 0; index < candidates.length; index++) {
    if (isCancelled?.()) throw new Error('Matching cancelled');
    const candidate = candidates[index];
    const values = validPairs.map(pair => candidate.data[pair.mmpColumn] ?? '');
    if (!values.some(value => !normalize(value))) {
      const key = exactKey(values);
      const bucket = exactIndex.get(key);
      if (bucket) bucket.push(candidate);
      else exactIndex.set(key, [candidate]);
    }
    if (index > 0 && index % 500 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  return exactIndex;
}

export function getFuzzyFallbackWorkload(
  fileRows: Record<string, string>[],
  matchingPairs: MatchPair[],
  candidates: MatchCandidate[],
  exactIndex = buildExactIndex(matchingPairs.filter(pair => pair.mmpColumn && pair.wfpColumn), candidates),
): number {
  const validPairs = matchingPairs.filter(pair => pair.mmpColumn && pair.wfpColumn);
  if (!validPairs.length || !candidates.length) return 0;
  const fallbackRows = fileRows.filter(row => {
    const values = validPairs.map(pair => row[pair.wfpColumn] ?? '');
    return values.some(value => !normalize(value)) || !exactIndex.has(exactKey(values));
  }).length;
  return fallbackRows * candidates.length;
}

/**
 * Executes the same policy as runMatching without monopolising the UI on large
 * uploads. Exact composite keys are indexed first; only the remaining rows
 * enter the more expensive fuzzy fallback.
 */
export async function runMatchingChunked(
  fileRows: Record<string, string>[],
  matchingPairs: MatchPair[],
  candidates: MatchCandidate[],
  options: { chunkSize?: number; onProgress?: (done: number, total: number) => void; isCancelled?: () => boolean } = {},
): Promise<MatchResult[]> {
  const validPairs = matchingPairs.filter(pair => pair.mmpColumn && pair.wfpColumn);
  if (!validPairs.length || !candidates.length) return runMatching(fileRows, matchingPairs, candidates);
  const exactIndex = await buildExactIndexYielding(validPairs, candidates, options.isCancelled);
  if (getFuzzyFallbackWorkload(fileRows, validPairs, candidates, exactIndex) > FUZZY_WORKLOAD_BUDGET) {
    throw new Error('Fuzzy workload exceeds the safe processing budget');
  }

  const results: MatchResult[] = [];
  const chunkSize = options.chunkSize ?? 8;
  for (let start = 0; start < fileRows.length; start += chunkSize) {
    if (options.isCancelled?.()) throw new Error('Matching cancelled');
    const chunk = fileRows.slice(start, start + chunkSize);
    for (let offset = 0; offset < chunk.length; offset++) {
      if (options.isCancelled?.()) throw new Error('Matching cancelled');
      const row = chunk[offset];
      const rowIndex = start + offset;
      const values = validPairs.map(pair => row[pair.wfpColumn] ?? '');
      const exact = values.some(value => !normalize(value)) ? undefined : exactIndex.get(exactKey(values));
      if (exact?.length) {
        const candidate = exact[0];
        results.push({
          rowIndex, wfpRow: row, matchedSiteId: candidate.siteId,
          matchedSiteName: candidate.data[validPairs[0].mmpColumn] ?? candidate.data.site_name ?? null,
          matchScore: 100, matchLevel: 'exact', status: exact.length === 1 ? 'auto' : 'review',
        });
      } else {
        results.push(...runMatching([row], validPairs, candidates).map(result => ({ ...result, rowIndex })));
      }
    }
    options.onProgress?.(Math.min(start + chunk.length, fileRows.length), fileRows.length);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  return results;
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
 *      weighted avg ≥ 0.78 → fuzzy  → review
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
    const exactCandidates: MatchCandidate[] = [];

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
        exactCandidates.push(c);
        if (weightedScore > bestScore) {
          best = c; bestScore = weightedScore; bestLevel = level;
        }
        continue;
      }
      if (weightedScore > bestScore) {
        best = c; bestScore = weightedScore; bestLevel = level;
      }
    }

    // Only one exact candidate is safe to auto-confirm. Fuzzy matches are
    // suggestions, never decisions; tied exact identifiers also require review.
    const status: MatchResult['status'] =
      best && exactCandidates.length === 1 ? 'auto'
        : best && (bestLevel === 'exact' || bestLevel === 'fuzzy' || bestLevel === 'partial') ? 'review'
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
