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
}

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

  // state
  'state': 'state',
  '1.9. state': 'state',
  '1.9 state': 'state',
  'governorate': 'state',
  'state/governorate': 'state',

  // locality
  'locality': 'locality',
  '1.10. locality': 'locality',
  '1.10 locality': 'locality',
  'district': 'locality',

  // partner
  'partner': 'partner',
  '1.15 name': 'partner',
  '1.15. name': 'partner',
  'partner name': 'partner',
  'implementing partner': 'partner',
  'organization': 'partner',

  // activity
  'activity': 'activity',
  '1.16 what kind': 'activity',
  '1.16. what kind': 'activity',
  'activity type': 'activity',
  'type of activity': 'activity',
};

function normHeader(raw: string): string {
  const lower = raw.toLowerCase().trim();
  // exact match
  if (HEADER_SYNONYMS[lower]) return HEADER_SYNONYMS[lower];
  // prefix match (handles long WFP column headers like "1.9. State (First admin level)...")
  for (const [key, mapped] of Object.entries(HEADER_SYNONYMS)) {
    if (lower.startsWith(key)) return mapped;
  }
  return lower;
}

// ---------------------------------------------------------------------------
// Parse a raw xlsx SheetJS JSON row (key=header, value=cell value) into WFPRawRow
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
  if (!site_name) return null; // skip rows with no site name

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

  // Site code exact match → instant strong
  if (site.site_code && norm(wfp.wfp_site_name) === norm(site.site_code)) {
    return { score: 1.0, notes: ['Site code exact match'] };
  }

  // Site name similarity (weight 0.60)
  const nameSim = diceSimilarity(wfp.wfp_site_name, site.site_name);
  score += nameSim * 0.60;
  notes.push(`name_sim=${nameSim.toFixed(2)}`);

  // State match (weight 0.25)
  if (wfp.wfp_state && site.state) {
    const stateSim = diceSimilarity(wfp.wfp_state, site.state);
    score += stateSim * 0.25;
    notes.push(`state_sim=${stateSim.toFixed(2)}`);
  }

  // Locality match (weight 0.15)
  if (wfp.wfp_locality && site.locality) {
    const locSim = diceSimilarity(wfp.wfp_locality, site.locality);
    score += locSim * 0.15;
    notes.push(`loc_sim=${locSim.toFixed(2)}`);
  }

  return { score, notes };
}

// ---------------------------------------------------------------------------
// Match a single WFP row against the full list of site entries for the MMP
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

  if (score >= 0.90) {
    return { ...wfp, site_entry_id: site.id, match_tier: 'strong', match_score: score, match_notes, outcome: 'confirmed', matched_site: site };
  }
  if (score >= 0.70) {
    return { ...wfp, site_entry_id: site.id, match_tier: 'weak', match_score: score, match_notes, outcome: 'pending', matched_site: site };
  }
  if (score >= 0.45) {
    return { ...wfp, site_entry_id: site.id, match_tier: 'fuzzy', match_score: score, match_notes, outcome: 'pending', matched_site: site };
  }

  return { ...wfp, site_entry_id: null, match_tier: 'none', match_score: score, match_notes, outcome: 'rejected' };
}

// ---------------------------------------------------------------------------
// Match all WFP rows — de-duplicate strong matches (first-come-first-served)
// ---------------------------------------------------------------------------
export function matchAll(wfpRows: WFPRawRow[], sites: SiteEntry[]): MatchResult[] {
  const claimedSiteIds = new Set<string>();
  const results: MatchResult[] = [];

  for (const wfp of wfpRows) {
    const result = matchRow(wfp, sites);

    // Prevent two WFP rows from claiming the same site at strong tier
    if (result.match_tier === 'strong' && result.site_entry_id) {
      if (claimedSiteIds.has(result.site_entry_id)) {
        // Downgrade to weak for manual resolution
        results.push({ ...result, match_tier: 'weak', outcome: 'pending', match_notes: result.match_notes + ' | duplicate_claim' });
        continue;
      }
      claimedSiteIds.add(result.site_entry_id);
    }

    results.push(result);
  }

  return results;
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
}

export function summarise(results: MatchResult[]): MatchSummary {
  const summary: MatchSummary = { total: results.length, strong: 0, weak: 0, fuzzy: 0, none: 0, pendingReview: 0, confirmed: 0, rejected: 0 };
  for (const r of results) {
    summary[r.match_tier]++;
    if (r.outcome === 'pending') summary.pendingReview++;
    if (r.outcome === 'confirmed') summary.confirmed++;
    if (r.outcome === 'rejected') summary.rejected++;
  }
  return summary;
}
