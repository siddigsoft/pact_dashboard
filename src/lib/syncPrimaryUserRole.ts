export interface AdditionalRoleEntry {
  role?: string | null;
}

const PRIVILEGED_ROLES = new Set([
  'admin',
  'superadmin',
  'ict',
  'fom',
  'fieldoperationmanager',
  'supervisor',
  'hubsupervisor',
  'datateam',
  'financialadmin',
  'countrydirector',
  'coordinator',
]);

export function normalizeRoleKey(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[\s_-]+/g, '');
}

/**
 * When profiles.role changes, drop the previous primary from user_roles
 * unless it is still present as an additional role. Privileged primaries
 * also drop a leftover dataCollector row, matching the existing save path.
 */
export function rolesToRemoveOnPrimaryChange(opts: {
  previousPrimary?: string | null;
  nextPrimary?: string | null;
  additionalRoles?: AdditionalRoleEntry[];
}): string[] {
  const extra = new Set(
    (opts.additionalRoles ?? [])
      .map(entry => normalizeRoleKey(entry.role))
      .filter(Boolean)
  );
  const toRemove: string[] = [];
  const previous = (opts.previousPrimary ?? '').trim();
  const next = (opts.nextPrimary ?? '').trim();

  if (previous && next && normalizeRoleKey(previous) !== normalizeRoleKey(next) && !extra.has(normalizeRoleKey(previous))) {
    toRemove.push(previous);
  }

  if (next && PRIVILEGED_ROLES.has(normalizeRoleKey(next)) && !extra.has('datacollector')) {
    toRemove.push('dataCollector');
  }

  return [...new Set(toRemove)];
}
