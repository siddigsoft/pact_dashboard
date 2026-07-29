/**
 * WFP Excel parsing + three-tier site matching engine (Phase C)
 *
 * Tier thresholds:
 *   strong  ≥ 0.90 — auto-confirmed
 *   weak    ≥ 0.70 — manual review
 *   fuzzy   ≥ 0.45 — manual review
 *   none    < 0.45 — auto-rejected
 */

export interface WFPRawRow {
  wfp_site_name: string;
  wfp_state: string;
  wfp_locality: string;
  wfp_partner: string;
  wfp_activity: string;
  wfp_row_number: number;
}

export interface SiteEntry {
  id: string;
  site_name: string;
  site_code: string | null;
  state: string | null;
  locality: string | null;
  status?: string;
}

export type MatchTier = 'strong' | 'weak' | 'fuzzy' | 'none';
export type MatchOutcome = 'confirmed' | 'rejected' | 'pending';

export interface MatchResult extends WFPRawRow {
  site_entry_id: string | null;
  match_tier: MatchTier;
  match_score: number;
  match_notes: string;
  outcome: MatchOutcome;
  matched_site?: SiteEntry;
  review_note?: string;
  site_status?: string;
  visit_complete?: boolean;
}

/**
 * Site statuses that qualify for WFP Confirmation.
 * A site must be in one of these states before the WFP match can promote it.
 */
export const COMPLETE_STATUSES = new Set([
  'completed',
  'submitted',
  'verified',
  'approved',
  'wfp_confirmed',
]);

// ---------------------------------------------------------------------------
// Column synonym map — normalise any WFP header variant to a known key
// ---------------------------------------------------------------------------
const HEADER_SYNONYMS: Record<string, string> = {
  // site name
  'sitename': 'site_name',
  'site name': 'site_name',
  'site_name': 'site_name',
  'section_1/sitename': 'site_name',
  'name of site': 'site_name',
  'site': 'site_name',
  'village': 'site_name',
  'location': 'site_name',
  'location name': 'site_name',
  'اسم الموقع': 'site_name',

  // state
  'state': 'state',
  '1.9. state': 'state',
  '1.9 state': 'state',
  'governorate': 'state',
  'state/governorate': 'state',
  'ولاية': 'state',

  // locality
  'locality': 'locality',
  '1.10. locality': 'locality',
  '1.10 locality': 'locality',
  'district': 'locality',
  'محلية': 'locality',

  // partner
  'partner': 'partner',
  '1.15 name': 'partner',
  '1.15. name': 'partner',
  'partner name': 'partner',
  'implementing partner': 'partner',
  'organization': 'partner',
  'organisation': 'partner',

  // activity
  'activity': 'activity',
  '1.16 what kind': 'activity',
  '1.16. what kind': 'activity',
  'activity type': 'activity',
  'type of activity': 'activity',
  'programme': 'activity',
  'program': 'activity',
  'النشاط': 'activity',

  // enumerator
  'enumerator': 'enumerator',
  'enumerator name': 'enumerator',
  'data collector': 'enumerator',
  'المعدد': 'enumerator',
  'name of enumerator': 'enumerator',
};

export function normHeader(raw: string): string {
  const lower = raw.toLowerCase().trim();
  if (HEADER_SYNONYMS[lower]) return HEADER_SYNONYMS[lower];
  for (const [key, mapped] of Object.entries(HEADER_SYNONYMS)) {
    if (lower.startsWith(key)) return mapped;
  }
  return lower;
}

// ---------------------------------------------------------------------------
// Column detection — returns which required columns were found + missing ones
// ---------------------------------------------------------------------------
export interface ColumnDetectionResult {
  found: Record<string, string>;   // systemField -> original file header
  missing: string[];               // required system fields not found
  allHeaders: string[];
  allHeadersNormed: Record<string, string>; // original header -> normed field
}

export function detectColumns(rawRows: Record<string, unknown>[]): ColumnDetectionResult {
  if (rawRows.length === 0) {
    return { found: {}, missing: ['site_name'], allHeaders: [], allHeadersNormed: {} };
  }
  const allHeaders = Object.keys(rawRows[0]);
  const found: Record<string, string> = {};
  const allHeadersNormed: Record<string, string> = {};

  for (const header of allHeaders) {
    const norm = normHeader(header);
    allHeadersNormed[header] = norm;
    if (['site_name', 'state', 'locality', 'partner', 'activity', 'enumerator'].includes(norm)) {
      if (!found[norm]) found[norm] = header; // first match wins
    }
  }

  const requiredFields = ['site_name'];
  const missing = requiredFields.filter(f => !found[f]);

  return { found, missing, allHeaders, allHeadersNormed };
}

// ---------------------------------------------------------------------------
// Parse a raw xlsx SheetJS JSON row using auto-detection
// ---------------------------------------------------------------------------
export function parseWFPRow(rawRow: Record<string, unknown>, rowNumber: number): WFPRawRow | null {
  const mapped: Record<string, string> = {};
  for (const [key, val] of Object.entries(rawRow)) {
    const norm = normHeader(key);
    if (val !== undefined && val !== null && val !== '') {
      mapped[norm] = String(val).trim();
    }
  }

  const site_name = mapped['site_name'] || '';
  if (!site_name) return null;

  return {
    wfp_site_name: site_name,
    wfp_state:     mapped['state']    || '',
    wfp_locality:  mapped['locality'] || '',
    wfp_partner:   mapped['partner']  || '',
    wfp_activity:  mapped['activity'] || '',
    wfp_row_number: rowNumber,
  };
}

// ---------------------------------------------------------------------------
// Parse a raw row using a custom column mapping (when auto-detection fails)
// columnMapping: systemField -> original file header
// ---------------------------------------------------------------------------
export function parseWFPRowWithMapping(
  rawRow: Record<string, unknown>,
  rowNumber: number,
  columnMapping: Record<string, string>,
): WFPRawRow | null {
  const get = (field: string): string => {
    const header = columnMapping[field];
    if (header && rawRow[header] !== undefined) return String(rawRow[header] || '').trim();
    // fallback: auto-detect
    for (const [key, val] of Object.entries(rawRow)) {
      if (normHeader(key) === field && val !== undefined && val !== '') return String(val).trim();
    }
    return '';
  };

  const site_name = get('site_name');
  if (!site_name) return null;

  return {
    wfp_site_name: site_name,
    wfp_state:     get('state'),
    wfp_locality:  get('locality'),
    wfp_partner:   get('partner'),
    wfp_activity:  get('activity'),
    wfp_row_number: rowNumber,
  };
}

// ---------------------------------------------------------------------------
// Fuzzy string similarity — Dice coefficient on bigrams
// ---------------------------------------------------------------------------
function bigrams(str: string): Set<string> {
  const s = str.toLowerCase().replace(/\s+/g, ' ').trim();
  const bg = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) bg.add(s.slice(i, i + 2));
  return bg;
}

export function diceSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a.toLowerCase() === b.toLowerCase()) return 1;
  const ba = bigrams(a);
  const bb = bigrams(b);
  if (ba.size === 0 || bb.size === 0) return 0;
  let inter = 0;
  for (const bg of ba) { if (bb.has(bg)) inter++; }
  return (2 * inter) / (ba.size + bb.size);
}

function norm(s: string | null | undefined): string {
  return (s || '').toLowerCase().trim();
}

// ---------------------------------------------------------------------------
// Score one WFP row against one site entry
// ---------------------------------------------------------------------------
function scorePair(wfp: WFPRawRow, site: SiteEntry): { score: number; notes: string[] } {
  const notes: string[] = [];
  let score = 0;

  if (site.site_code && norm(wfp.wfp_site_name) === norm(site.site_code)) {
    return { score: 1.0, notes: ['Site code exact match'] };
  }

  const nameSim = diceSimilarity(wfp.wfp_site_name, site.site_name);
  score += nameSim * 0.60;
  notes.push(`name_sim=${nameSim.toFixed(2)}`);

  if (wfp.wfp_state && site.state) {
    const stateSim = diceSimilarity(wfp.wfp_state, site.state);
    score += stateSim * 0.25;
    notes.push(`state_sim=${stateSim.toFixed(2)}`);
  }

  if (wfp.wfp_locality && site.locality) {
    const locSim = diceSimilarity(wfp.wfp_locality, site.locality);
    score += locSim * 0.15;
    notes.push(`loc_sim=${locSim.toFixed(2)}`);
  }

  return { score, notes };
}

// ---------------------------------------------------------------------------
// Match a single WFP row against the full list of site entries
// ---------------------------------------------------------------------------
export function matchRow(wfp: WFPRawRow, sites: SiteEntry[]): MatchResult {
  if (sites.length === 0) {
    return { ...wfp, site_entry_id: null, match_tier: 'none', match_score: 0, match_notes: 'No sites in MMP', outcome: 'rejected' };
  }

  let best: { score: number; site: SiteEntry; notes: string[] } | null = null;
  for (const site of sites) {
    const { score, notes } = scorePair(wfp, site);
    if (!best || score > best.score) best = { score, site, notes };
  }

  if (!best) {
    return { ...wfp, site_entry_id: null, match_tier: 'none', match_score: 0, match_notes: 'No match', outcome: 'rejected' };
  }

  const { score, site, notes } = best;
  const match_notes = notes.join(' | ');
  const siteStatus = site.status || '';
  const visitComplete = COMPLETE_STATUSES.has(siteStatus.toLowerCase());

  if (score >= 0.90) {
    return { ...wfp, site_entry_id: site.id, match_tier: 'strong', match_score: score, match_notes, outcome: 'confirmed', matched_site: site, site_status: siteStatus, visit_complete: visitComplete };
  }
  if (score >= 0.70) {
    return { ...wfp, site_entry_id: site.id, match_tier: 'weak', match_score: score, match_notes, outcome: 'pending', matched_site: site, site_status: siteStatus, visit_complete: visitComplete };
  }
  if (score >= 0.45) {
    return { ...wfp, site_entry_id: site.id, match_tier: 'fuzzy', match_score: score, match_notes, outcome: 'pending', matched_site: site, site_status: siteStatus, visit_complete: visitComplete };
  }

  return { ...wfp, site_entry_id: null, match_tier: 'none', match_score: score, match_notes, outcome: 'rejected' };
}

// ---------------------------------------------------------------------------
// Match all WFP rows — de-duplicate strong matches (first-come-first-served)
// ---------------------------------------------------------------------------
export interface MatchAllResult {
  results: MatchResult[];
  claimedSiteIds: Set<string>;
}

export function matchAll(wfpRows: WFPRawRow[], sites: SiteEntry[]): MatchResult[] {
  const claimedSiteIds = new Set<string>();
  const results: MatchResult[] = [];

  for (const wfp of wfpRows) {
    const result = matchRow(wfp, sites);

    if (result.match_tier === 'strong' && result.site_entry_id) {
      if (claimedSiteIds.has(result.site_entry_id)) {
        results.push({ ...result, match_tier: 'weak', outcome: 'pending', match_notes: result.match_notes + ' | duplicate_claim' });
        continue;
      }
      claimedSiteIds.add(result.site_entry_id);
    }

    results.push(result);
  }

  return results;
}

/**
 * Find MMP sites that were not matched by any WFP row.
 * These sites are "not in WFP file" and must go through Step 4 (Mark Uncovered).
 */
export function findSitesNotInWfp(allResults: MatchResult[], allSites: SiteEntry[]): SiteEntry[] {
  const claimedIds = new Set(
    allResults
      .filter(r => r.site_entry_id && r.match_tier !== 'none')
      .map(r => r.site_entry_id!),
  );
  return allSites.filter(s => !claimedIds.has(s.id));
}

// ---------------------------------------------------------------------------
// Summary counts
// ---------------------------------------------------------------------------
export interface MatchSummary {
  total: number;
  strong: number;
  weak: number;
  fuzzy: number;
  none: number;
  pendingReview: number;
  confirmed: number;
  rejected: number;
  matchedButIncomplete: number;
}

export function summarise(results: MatchResult[]): MatchSummary {
  const summary: MatchSummary = {
    total: results.length,
    strong: 0, weak: 0, fuzzy: 0, none: 0,
    pendingReview: 0, confirmed: 0, rejected: 0,
    matchedButIncomplete: 0,
  };
  for (const r of results) {
    summary[r.match_tier]++;
    if (r.outcome === 'pending') summary.pendingReview++;
    if (r.outcome === 'confirmed') summary.confirmed++;
    if (r.outcome === 'rejected') summary.rejected++;
    if (r.outcome === 'confirmed' && r.site_entry_id && !r.visit_complete) summary.matchedButIncomplete++;
  }
  return summary;
}
