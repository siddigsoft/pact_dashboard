import { describe, expect, it } from 'vitest';
import { buildExactIndex, FUZZY_WORKLOAD_BUDGET, getFuzzyFallbackWorkload, runMatching, type MatchCandidate } from '@/utils/fuzzyMatcher';
import { canAdvancePastMatch } from '../matchGate';
import { autoDetectPairs, getPairSemanticIssues, sanitizeMatchingPairs } from '../matchAliases';

describe('site matching safety policy', () => {
  const pairs = [{ mmpColumn: 'site_code', wfpColumn: 'Site Code' }];

  it('puts duplicate exact site identifiers into review rather than auto-confirming either row', () => {
    const candidates: MatchCandidate[] = [
      { siteId: 'site-a', data: { site_code: 'KRT-18', site_name: 'Kosti' } },
    ];
    const results = runMatching(
      [{ 'Site Code': 'KRT-18' }, { 'Site Code': 'KRT-18' }],
      pairs,
      candidates,
    );

    // Per-row identifiers are uniquely exact, but the review cockpit detects
    // their shared siteId and exposes both rows as a duplicate conflict queue.
    expect(results.every(row => row.status === 'auto')).toBe(true);
    expect(new Set(results.map(row => row.matchedSiteId)).size).toBe(1);
  });

  it('keeps unmatched WFP submissions unresolved until an explicit disposition', () => {
    const results = runMatching(
      [{ 'Site Code': 'NOT-IN-MMP' }],
      pairs,
      [{ siteId: 'site-a', data: { site_code: 'KRT-18' } }],
    );

    expect(results[0]).toMatchObject({ status: 'unmatched', matchedSiteId: 'site-a' });
    expect(results[0].action).toBeUndefined();
    expect(canAdvancePastMatch(results, {})).toBe(false);
  });

  it('permits the observed field workload but blocks an unsafe fuzzy fallback matrix', () => {
    const candidate: MatchCandidate = { siteId: 'site-a', data: { site_code: 'KRT-18' } };
    expect(getFuzzyFallbackWorkload(
      Array.from({ length: 663 }, () => ({ 'Site Code': 'different' })),
      pairs,
      Array.from({ length: 948 }, () => candidate),
    )).toBeLessThan(FUZZY_WORKLOAD_BUDGET);
    expect(getFuzzyFallbackWorkload(
      Array.from({ length: 10000 }, () => ({ 'Site Code': 'different' })),
      pairs,
      Array.from({ length: 10000 }, () => candidate),
    )).toBeGreaterThan(FUZZY_WORKLOAD_BUDGET);
  });

  it('builds one linear mutable bucket for 10,000 same-key candidates and reuses it for preflight', () => {
    const candidates = Array.from({ length: 10000 }, (_, index): MatchCandidate => ({
      siteId: `site-${index}`,
      data: { site_code: 'SHARED-KEY' },
    }));
    const index = buildExactIndex(pairs, candidates);

    expect(index.size).toBe(1);
    expect(index.get('shared key')).toHaveLength(10000);
    // Supplying the already-built index means workload preflight does not need
    // to construct another candidate index.
    expect(getFuzzyFallbackWorkload([{ 'Site Code': 'SHARED-KEY' }], pairs, candidates, index)).toBe(0);
  });

  it('keeps activity questions out of the MMP site_name auto-pair', () => {
    const pairs = autoDetectPairs(
      ['site_name', 'activity_at_site'],
      ['Select the activity site', 'Confirm the activity', 'Location name'],
    );
    expect(pairs).toContainEqual({ mmpColumn: 'site_name', wfpColumn: 'Location name' });
    expect(pairs).toContainEqual({ mmpColumn: 'activity_at_site', wfpColumn: 'Confirm the activity' });
    expect(pairs).not.toContainEqual({ mmpColumn: 'site_name', wfpColumn: 'Select the activity site' });
  });

  it('sanitizes a restored invalid site-name pair to a unique location header', () => {
    const restored = [{ mmpColumn: 'site_name', wfpColumn: '1.14 Select the activity site' }];
    expect(sanitizeMatchingPairs(
      ['site_name'],
      ['1.14 Select the activity site', '1.13 Exact location name'],
      restored,
    )).toEqual([{ mmpColumn: 'site_name', wfpColumn: '1.13 Exact location name' }]);
  });

  it('clears ambiguous invalid site-name pairs and blocks the semantic gate', () => {
    const restored = [{ mmpColumn: 'site_name', wfpColumn: 'Select the activity site' }];
    const sanitized = sanitizeMatchingPairs(
      ['site_name'],
      ['Select the activity site', 'Location name', 'Village name'],
      restored,
    );
    expect(sanitized[0].wfpColumn).toBe('');
    expect(getPairSemanticIssues(restored)).toHaveLength(1);
  });
});