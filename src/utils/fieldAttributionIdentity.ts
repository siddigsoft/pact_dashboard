export interface CollectionIdentityRow {
  status?: string | null;
  attribution_collector_id?: string | null;
  accepted_by?: string | null;
  claimed_by?: string | null;
  visit_started_by?: string | null;
}

export function isWfpConfirmedCollection(
  row: CollectionIdentityRow,
  confirmedByCycleMatch = false,
): boolean {
  return confirmedByCycleMatch
    || String(row.status ?? '').toLowerCase() === 'wfp_confirmed';
}

/**
 * One identity rule shared by Cycle Close and Finance: confirmed WFP rows use
 * only the corrected device attribution. Legacy claimant fields remain
 * available solely for non-confirmed historical/exception rows.
 */
export function resolveOfficialCollectionProfileId(
  row: CollectionIdentityRow,
  confirmedByCycleMatch = false,
): string | null {
  return isWfpConfirmedCollection(row, confirmedByCycleMatch)
    ? (row.attribution_collector_id || null)
    : (row.accepted_by || row.claimed_by || row.visit_started_by || null);
}

export function resolveOfficialCollectionProfileName(
  profileId: string | null,
  officialProfileNames: Record<string, string>,
): string {
  return profileId ? (officialProfileNames[profileId] || 'Unknown') : 'Unknown';
}