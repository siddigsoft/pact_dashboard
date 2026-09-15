/**
 * Authoritative access precedence for PACT (Phase 2).
 *
 * 1. Super Admin bypass — explicit, always allow.
 * 2. Explicit user block — overrides any role grant.
 * 3. Explicit user grant — overrides role denial.
 * 4. Union of assigned roles — every row in user_roles (+ custom role names).
 * 5. profiles.role — primary/default role pointer (display + primary navigation).
 *
 * UI and evaluators must follow this order. Legacy user_screen_permissions
 * must not participate in runtime authorization.
 */

/** Matches Unified Access Manager UI (`unified/types.AccessEffect`). */
export type AccessEffect =
  | 'superadmin'
  | 'granted'
  | 'blocked'
  | 'role-yes'
  | 'role-no';

export interface PageOverrideLike {
  is_blocked: boolean;
}

export function isSuperAdminRole(role: string | null | undefined): boolean {
  if (!role) return false;
  const n = role.toLowerCase().replace(/[\s_]/g, '');
  return n === 'superadmin';
}

/** Combine primary + assignment role names into a unique union list. */
export function unionRoleNames(primaryRole: string | null | undefined, assignedRoleNames: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (value: string | null | undefined) => {
    const trimmed = (value ?? '').trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(trimmed);
  };
  push(primaryRole);
  for (const name of assignedRoleNames) push(name);
  return out;
}

/**
 * Resolve page access for one target.
 * `roleAllows` should already encode the union of assigned roles + page_role_configs.
 */
export function resolvePageEffect(args: {
  isSuperAdmin: boolean;
  override?: PageOverrideLike | null;
  roleAllows: boolean;
}): AccessEffect {
  if (args.isSuperAdmin) return 'superadmin';
  if (args.override) return args.override.is_blocked ? 'blocked' : 'granted';
  return args.roleAllows ? 'role-yes' : 'role-no';
}

/**
 * Resolve action permission for one resource/action pair.
 * Explicit user permission overrides win over the role union.
 */
export function resolveActionEffect(args: {
  isSuperAdmin: boolean;
  explicitGrant?: boolean | null;
  roleAllows: boolean;
}): AccessEffect {
  if (args.isSuperAdmin) return 'superadmin';
  if (args.explicitGrant === true) return 'granted';
  if (args.explicitGrant === false) return 'blocked';
  return args.roleAllows ? 'role-yes' : 'role-no';
}

export function effectAllowsAccess(effect: AccessEffect): boolean {
  return effect === 'superadmin' || effect === 'granted' || effect === 'role-yes';
}
