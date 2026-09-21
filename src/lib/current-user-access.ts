import { canSeePage, isOwnUserProfilePath, isProjectMembershipDetailPath, resolveRouteAccessTarget, type RoutePermission } from '@/lib/page-roles';
import { isSuperAdminRole } from '@/lib/effectiveAccess';
import { ACCESS_TARGET_REGISTRY, getAccessTargetDependencies } from '@/lib/access-target-registry';
import { PAGE_DEFS, type PageDef } from '@/lib/access-registry';
import { PAGE_ACCESS_REDIRECTS } from '@/lib/pageAccessRedirects';

export interface CurrentUserAccessManifest {
  user_id: string;
  roles: string[];
  page_role_configs: Record<string, string[]>;
  /** A tab is blocked by the baseline only when every assigned role blocks it. */
  role_tab_blocks?: Record<string, boolean>;
  page_overrides: Record<string, { is_blocked: boolean; notes?: string | null; expires_at?: string | null; reason?: string | null }>;
  action_overrides: Record<string, { is_granted: boolean; expires_at?: string | null; reason?: string | null }>;
  role_permissions: Array<{ resource: string; action: string }>;
  generated_at: string;
}

export interface ManifestAccessDecision {
  allowed: boolean;
  source: 'action_override' | 'page_override' | 'role_permission' | 'role_baseline';
}

export function overrideIsActive(override: { expires_at?: string | null }, now = Date.now()): boolean {
  return !override.expires_at || new Date(override.expires_at).getTime() > now;
}

/** Read restrictions in typed page notes are a page denial, not merely a
 * hidden editor button. Invalid notes cannot manufacture a read denial. */
export function manifestPageHasExplicitDenial(manifest: CurrentUserAccessManifest, slug: string): boolean {
  const override = manifest.page_overrides[slug];
  if (!override || !overrideIsActive(override)) return false;
  if (override.is_blocked) return true;
  try {
    return !!override.notes && JSON.parse(override.notes)?.r === false;
  } catch {
    return false;
  }
}

export function manifestIsTabBlocked(manifest: CurrentUserAccessManifest | undefined, slug: string): boolean {
  if (!manifest) return true;
  if (manifest.roles.some(isSuperAdminRole)) return false;
  if (getAccessTargetDependencies(slug).some(parent => !evaluateManifestPageAccess(manifest, parent).allowed)) return true;
  const override = manifest.page_overrides[slug];
  if (override && overrideIsActive(override)) return manifestPageHasExplicitDenial(manifest, slug);
  return !manifest.roles.length || manifest.role_tab_blocks?.[slug] === true;
}

/**
 * Evaluates a registered page from the one server-derived access manifest.
 *
 * An explicit page block closes the destination even when its action is granted.
 * A page grant alone cannot manufacture a resource action permission.
 */
export function evaluateManifestPageAccess(
  manifest: CurrentUserAccessManifest,
  slug: string,
  routePermission?: RoutePermission | null,
): ManifestAccessDecision {
  const configuredRoles = manifest.page_role_configs[slug];
  const roleBaseline = routePermission
    ? false
    : manifest.roles.some(role => canSeePage(slug, role, configuredRoles));

  const pageOverride = manifest.page_overrides[slug];
  if (manifestPageHasExplicitDenial(manifest, slug) ||
    getAccessTargetDependencies(slug).some(parent => manifestPageHasExplicitDenial(manifest, parent))) {
    return { allowed: false, source: 'page_override' };
  }

  if (routePermission) {
    const override = manifest.action_overrides[`${routePermission.resource}:${routePermission.action}`];
    if (override && overrideIsActive(override)) {
      return { allowed: override.is_granted, source: 'action_override' };
    }

    if (manifest.role_permissions.some(permission =>
      permission.resource === routePermission.resource &&
      permission.action === routePermission.action,
    )) {
      return { allowed: true, source: 'role_permission' };
    }
  }

  if (pageOverride && overrideIsActive(pageOverride)) {
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
  if (override && overrideIsActive(override)) return override.is_granted;
  return manifest.role_permissions.some(permission =>
    permission.resource === resource && permission.action === action,
  );
}

/** Compatibility permission for legacy survey-management role codes. */
export function legacySurveyActionAllowed(
  manifest: Pick<CurrentUserAccessManifest, 'roles' | 'action_overrides'>,
  action: string,
): boolean {
  if (!['create', 'update', 'delete', 'status'].includes(action)) return false;
  const legacyRole = (role: string) => role.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!manifest.roles.some(role => ['hubmanager', 'srprogramofficer', 'seniorprogramofficer', 'seniorprogrammeofficer'].includes(legacyRole(role)))) return false;
  const override = manifest.action_overrides[`surveys:${action}`];
  return !(override && overrideIsActive(override) && override.is_granted === false);
}

/** True only for an active user_permission_overrides grant — not role defaults.
 * Used when Access Control intentionally widens scope (e.g. Field Assistant
 * viewing org-wide Cost Submissions like Down Payment Approval). */
export function manifestHasExplicitActionGrant(
  manifest: CurrentUserAccessManifest,
  resource: string,
  action: string,
): boolean {
  const override = manifest.action_overrides[`${resource}:${action}`];
  return !!override && overrideIsActive(override) && override.is_granted === true;
}

/** The shared direct-URL and sidebar decision includes registered query tabs.
 * Unknown protected destinations are denied rather than admitted by a menu.
 *
 * Project membership detail (/projects/:id) is reachable with either org-wide
 * Projects or My Projects — so members can open their own project without the
 * org catalogue grant. Edit/create/team routes still require Projects.
 *
 * Own user profile (/users/:id matching manifest.user_id) is always reachable
 * without User Management — even when the users page is explicitly blocked. */
export function evaluateManifestRouteAccess(manifest: CurrentUserAccessManifest, pathname: string, search = '', hash = ''): boolean {
  const target = resolveRouteAccessTarget(pathname, search, hash);
  if (!target) return false;

  let allowed = evaluateManifestPageAccess(manifest, target.slug, target.routePermission).allowed;
  if (
    !allowed &&
    target.slug === 'projects' &&
    isProjectMembershipDetailPath(pathname) &&
    evaluateManifestPageAccess(manifest, 'my-projects').allowed
  ) {
    allowed = true;
  }
  if (
    !allowed &&
    target.slug === 'users' &&
    isOwnUserProfilePath(pathname, manifest.user_id)
  ) {
    allowed = true;
  }
  if (!allowed) return false;

  const tabId = new URLSearchParams(search).get('tab');
  if (!tabId) return true;
  const hub = ACCESS_TARGET_REGISTRY.find(candidate => candidate.page.path === pathname);
  const tab = hub?.tabs.find(candidate => candidate.tabId === tabId);
  return !tab || !manifestIsTabBlocked(manifest, tab.slug);
}

/** Registry-driven navigation for a signed-in user. Personal preferences can
 * only remove or reorder these pages; they cannot create an access grant. */
export function getManifestNavigationPages(manifest: CurrentUserAccessManifest): PageDef[] {
  const destinations = new Set<string>();
  return PAGE_DEFS.flatMap(page => {
    // Evaluate the registry slug first so a redirected destination cannot
    // re-admit a page that is explicitly blocked on its canonical identity.
    if (!evaluateManifestPageAccess(manifest, page.slug).allowed) return [];
    const path = PAGE_ACCESS_REDIRECTS.find(redirect => redirect.fromPath === page.path)?.toPath ?? page.path;
    const url = new URL(path, 'https://access.invalid');
    if (destinations.has(path) || !evaluateManifestRouteAccess(manifest, url.pathname, url.search, url.hash)) return [];
    destinations.add(path);
    return [{ ...page, path }];
  });
}
