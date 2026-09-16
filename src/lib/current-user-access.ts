import { canSeePage, canSeeRoutePermission, type RoutePermission } from '@/lib/page-roles';

export interface CurrentUserAccessManifest {
  user_id: string;
  roles: string[];
  page_role_configs: Record<string, string[]>;
  page_overrides: Record<string, { is_blocked: boolean; notes?: string | null }>;
  action_overrides: Record<string, { is_granted: boolean; expires_at?: string | null; reason?: string | null }>;
  role_permissions: Array<{ resource: string; action: string }>;
  generated_at: string;
}

export interface ManifestAccessDecision {
  allowed: boolean;
  source: 'action_override' | 'page_override' | 'role_permission' | 'role_baseline';
}

function actionOverrideIsActive(override: { expires_at?: string | null }): boolean {
  return !override.expires_at || new Date(override.expires_at).getTime() > Date.now();
}

/**
 * Evaluates a registered page from the one server-derived access manifest.
 *
 * Action overrides intentionally take precedence over page overrides. This
 * preserves the existing direct-report behaviour: an explicit action grant
 * can open its mapped destination even when the wider hub page is hidden.
 */
export function evaluateManifestPageAccess(
  manifest: CurrentUserAccessManifest,
  slug: string,
  routePermission?: RoutePermission | null,
): ManifestAccessDecision {
  const configuredRoles = manifest.page_role_configs[slug];
  const roleBaseline = routePermission
    ? manifest.roles.some(role => canSeeRoutePermission(routePermission, role))
    : manifest.roles.some(role => canSeePage(slug, role, configuredRoles));

  if (routePermission) {
    const override = manifest.action_overrides[`${routePermission.resource}:${routePermission.action}`];
    if (override && actionOverrideIsActive(override)) {
      return { allowed: override.is_granted, source: 'action_override' };
    }

    if (manifest.role_permissions.some(permission =>
      permission.resource === routePermission.resource &&
      permission.action === routePermission.action,
    )) {
      return { allowed: true, source: 'role_permission' };
    }
  }

  const pageOverride = manifest.page_overrides[slug];
  if (pageOverride) {
    // A page grant makes the page visible; it must not manufacture a resource
    // action for a route that is explicitly action-protected. An explicit page
    // block still wins when no action grant/permission above has granted the
    // direct route.
    if (routePermission && !pageOverride.is_blocked) {
      return { allowed: roleBaseline, source: 'role_baseline' };
    }
    return { allowed: !pageOverride.is_blocked, source: 'page_override' };
  }

  return { allowed: roleBaseline, source: 'role_baseline' };
}

/** Resolves non-route UI permission checks from the same manifest. */
export function manifestHasPermission(
  manifest: CurrentUserAccessManifest,
  resource: string,
  action: string,
): boolean {
  const override = manifest.action_overrides[`${resource}:${action}`];
  if (override && actionOverrideIsActive(override)) return override.is_granted;
  return manifest.role_permissions.some(permission =>
    permission.resource === resource && permission.action === action,
  );
}
