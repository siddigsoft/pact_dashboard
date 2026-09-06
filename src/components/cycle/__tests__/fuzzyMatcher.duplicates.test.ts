import { describe, expect, it } from 'vitest';
import { buildExactIndex, FUZZY_WORKLOAD_BUDGET, getFuzzyFallbackWorkload, runMatching, type MatchCandidate } from '@/utils/fuzzyMatcher';
import { canAdvancePastMatch } from '../matchGate';
import { autoDetectPairs, getPairSemanticIssues, sanitizeMatchingPairs } from '../matchAliases';
import { normalizeOdkSourceKey, resolveRegistryDevice } from '../deviceRegistry';
import { classifyMatchResults } from '../resultClassification';

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
    expect(pairs).not.toContainEqual({ mmpColumn: 'activity_at_site', wfpColumn: 'Confirm the activity' });
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

  it('auto-detection excludes activity and partner context fields', () => {
    expect(autoDetectPairs(
      ['site_code', 'site_name', 'state', 'locality', 'activity_at_site', 'cp_name'],
      ['Site Code', 'Site Name', 'State', 'Locality', 'Confirm activity', 'Partner name'],
    )).toEqual([{ mmpColumn: 'site_code', wfpColumn: 'Site Code' }]);
    expect(sanitizeMatchingPairs(
      ['site_name', 'state', 'activity_at_site', 'cp_name'],
      ['Site Name', 'State', 'Activity', 'Partner'],
      [
        { mmpColumn: 'site_name', wfpColumn: 'Site Name' },
        { mmpColumn: 'state', wfpColumn: 'State' },
        { mmpColumn: 'activity_at_site', wfpColumn: 'Activity' },
        { mmpColumn: 'cp_name', wfpColumn: 'Partner' },
      ],
    )).toEqual([
      { mmpColumn: 'site_name', wfpColumn: 'Site Name' },
      { mmpColumn: 'state', wfpColumn: 'State' },
    ]);

    expect(sanitizeMatchingPairs(
      ['activity_at_site', 'cp_name'],
      ['Activity', 'Partner'],
      [
        { mmpColumn: 'activity_at_site', wfpColumn: 'Activity' },
        { mmpColumn: 'cp_name', wfpColumn: 'Partner' },
      ],
    )).toEqual([]);
  });

  it('auto-confirms unique exact site identity despite unrelated context differences', () => {
    const results = runMatching(
      [{ Name: 'Kosti', State: 'White Nile', Locality: 'Kosti', Activity: 'different', Partner: 'other' }],
      [
        { mmpColumn: 'site_name', wfpColumn: 'Name' },
        { mmpColumn: 'state', wfpColumn: 'State' },
        { mmpColumn: 'locality', wfpColumn: 'Locality' },
      ],
      [{ siteId: 'site-a', data: { site_name: 'Kosti', state: 'White Nile', locality: 'Kosti', activity_at_site: 'stored', cp_name: 'stored' } }],
    );
    expect(results[0]).toMatchObject({ status: 'auto', matchedSiteId: 'site-a', matchScore: 100 });
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

  it('normalizes device keys and resolves the assignment active on the submission date', () => {
    const devices = [{ id: 'device-1', odk_source_key: 'ODK Device 01', odk_source_key_normalized: 'odkdevice01' }];
    const assignments = [{ field_device_id: 'device-1', profile_id: 'collector-1', valid_from: '2025-01-01', valid_to: '2025-06-30' }];
    expect(normalizeOdkSourceKey(' ODK-device_01 ')).toBe('odkdevice01');
    expect(resolveRegistryDevice('ODK-device_01', '2025-01-01', devices, assignments, { 'collector-1': 'Amina Idris' }, 'collector-1')).toMatchObject({ status: 'matched', collectorName: 'Amina Idris' });
    expect(resolveRegistryDevice('ODK-device_01', '2025-05-18', devices, assignments, { 'collector-1': 'Amina Idris' }, 'collector-1')).toMatchObject({ status: 'matched', collectorName: 'Amina Idris' });
    expect(resolveRegistryDevice('ODK-device_01', '2025-06-30', devices, assignments, { 'collector-1': 'Amina Idris' })).toMatchObject({ status: 'no active assignment for date' });
    expect(resolveRegistryDevice('ODK-device_01', '2025-08-18', devices, assignments, { 'collector-1': 'Amina Idris' })).toMatchObject({ status: 'no active assignment for date' });
  });

  it('classifies unique confirmations separately from duplicate and unresolved exceptions', () => {
    const base = (rowIndex: number, siteId: string | null, status: 'auto' | 'review' | 'unmatched'): any => ({
      rowIndex, wfpRow: {}, matchedSiteId: siteId, matchedSiteName: siteId, matchScore: 100, matchLevel: 'exact', status,
    });
    const classified = classifyMatchResults([
      base(0, 'site-a', 'auto'),
      base(1, 'site-b', 'auto'),
      base(2, 'site-a', 'auto'),
      base(3, null, 'unmatched'),
      base(4, 'site-c', 'review'),
    ]);
    expect(classified.confirmed.map(row => row.rowIndex)).toEqual([1]);
    expect(classified.exceptions.map(row => row.rowIndex)).toEqual([0, 2, 3, 4]);
  });
});