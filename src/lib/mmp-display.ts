import { normalizeRole } from '@/utils/roleMapping';

const FIELD_ROLES = new Set(['dataCollector', 'coordinator', 'supervisor']);

/**
 * The MMP label is based on effective access, rather than whichever role
 * happens to be checked first. Any non-field role has management precedence.
 */
export function isFieldRoleOnly(
  defaultRole?: string | null,
  additionalRoles: readonly (string | null | undefined)[] = [],
  isSuperAdmin = false,
): boolean {
  if (isSuperAdmin) return false;

  const roles = [defaultRole, ...additionalRoles]
    .filter((role): role is string => Boolean(role))
    .map(role => normalizeRole(role));

  return roles.length > 0 && roles.every(role => role !== null && FIELD_ROLES.has(role));
}

export function getMmpDisplayLabel(
  defaultRole?: string | null,
  additionalRoles: readonly (string | null | undefined)[] = [],
  isSuperAdmin = false,
): 'MMP Management' | 'My Sites Management' {
  return isFieldRoleOnly(defaultRole, additionalRoles, isSuperAdmin)
    ? 'My Sites Management'
    : 'MMP Management';
}