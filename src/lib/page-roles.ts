/**
 * T34 — Centralized page-role lookup so the sidebar visibility check stays
 * aligned with the canonical PAGE_DEFS table used by /admin/page-access.
 *
 * The full sidebar still uses ad-hoc role checks for historical reasons. This
 * helper is the foundation: any new sidebar item or refactor should consume
 * `canSeePage(slug, role)` instead of writing another bespoke role test.
 *
 * Override layer: if `page_access_overrides` has an explicit grant or block
 * for the current user it wins. That table is consulted by the page-access
 * modal at runtime; we mirror its semantics here for the visibility gate.
 */
import { PAGE_DEFS } from '@/lib/access-registry';
import { supabase } from '@/integrations/supabase/client';
import { PAGE_ACCESS_REDIRECTS } from '@/lib/pageAccessRedirects';
import { MODULE_REGISTRY } from '@/types/moduleRegistry';
import { DEFAULT_ROLE_PERMISSIONS } from '@/types/roles';
import type { ActionType, ResourceType } from '@/types/roles';
import {
  resolveReportsDirectoryAction,
  resolveReportsDirectoryRoutePermission,
} from '@/lib/reports-directory-permissions';

export interface RoutePermission {
  resource: ResourceType;
  action: ActionType;
}

/**
 * A route can be opened from a page which has a different URL (for example,
 * the MMP full report is opened from /mmp).  Keep those aliases here rather
 * than adding a one-off check to each report component.  The values are
 * resolved from MODULE_REGISTRY below, so the route guard and the visible
 * entry point use the same resource/action pair.
 */
const REPORT_ROUTE_ALIASES: Array<{
  pattern: RegExp;
  registryRoute: string;
  action?: ActionType;
  query?: RegExp;
}> = [
  { pattern: /^\/mmp\/[^/]+\/full-report\/?$/, registryRoute: '/mmp', action: 'export' },
  { pattern: /^\/accounting\/reports\/?$/, registryRoute: '/accounting', action: 'read' },
  { pattern: /^\/accounting\/donor-reports\/?$/, registryRoute: '/accounting', action: 'read' },
  { pattern: /^\/pre-funding\/report\/?$/, registryRoute: '/pre-funding', action: 'read' },
  { pattern: /^\/incident-reports\/?$/, registryRoute: '/field-ops?tab=incidents', action: 'read' },
  { pattern: /^\/data-export-center\/?$/, registryRoute: '/data-export-center', action: 'read' },
  { pattern: /^\/field-data\/exports\/?$/, registryRoute: '/field-data', action: 'export' },
  { pattern: /^\/analytics\/?$/, query: /(?:^|&)tab=(?:reports|data-export-center)(?:&|$)/, registryRoute: '/reports', action: 'read' },
  { pattern: /^\/finance-hub\/?$/, query: /(?:^|&)tab=advance-report(?:&|$)/, registryRoute: '/advance-requests-report', action: 'read' },
  { pattern: /^\/finance-hub\/?$/, query: /(?:^|&)tab=month-end(?:&|$)/, registryRoute: '/month-end-summary', action: 'read' },
  { pattern: /^\/finance-hub\/?$/, query: /(?:^|&)tab=wallet-reports(?:&|$)/, registryRoute: '/wallet-reports', action: 'read' },
  { pattern: /^\/finance-hub\/?$/, query: /(?:^|&)tab=salary-retainer(?:&|$)/, registryRoute: '/salary-retainer-report', action: 'read' },
  { pattern: /^\/field-payments\/?$/, query: /(?:^|&)tab=fees(?:&|$)/, registryRoute: '/enumerator-fees-report', action: 'read' },
  { pattern: /^\/field-ops\/?$/, query: /(?:^|&)tab=incident-reports(?:&|$)/, registryRoute: '/field-ops?tab=incidents', action: 'read' },
  { pattern: /^\/field-data\/?$/, query: /(?:^|&)tab=exports(?:&|$)/, registryRoute: '/field-data', action: 'export' },
  { pattern: /^\/pre-funding\/?$/, query: /(?:^|&)tab=report(?:&|$)/, registryRoute: '/pre-funding', action: 'read' },
  { pattern: /^\/hr\/?$/, query: /(?:^|&)tab=salary-retainer(?:&|$)/, registryRoute: '/salary-retainer-report', action: 'read' },
  { pattern: /^\/accounting\/?$/, query: /(?:^|&)tab=(?:reports|donor-reports)(?:&|$)/, registryRoute: '/accounting', action: 'read' },
];

const REPORT_ROUTES = new Set([
  '/reports',
  '/cost-submission/reports',
  '/wallet-reports',
  '/advance-requests-report',
  '/down-payment-advance-report',
  '/enumerator-fees-report',
  '/month-end-summary',
  '/salary-retainer-report',
]);

function pathOnly(route: string): string {
  return route.split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/';
}

function registryPermission(route: string, action?: ActionType): RoutePermission | null {
  const normalizedRoute = route.replace(/\/+$/, '') || '/';
  const page = MODULE_REGISTRY
    .flatMap(module => module.pages)
    .find(candidate =>
      candidate.route.replace(/\/+$/, '') === normalizedRoute
    ) ?? MODULE_REGISTRY
      .flatMap(module => module.pages)
      .find(candidate => pathOnly(candidate.route) === pathOnly(route));
  if (!page) return null;

  // Opening a report is a read operation.  MMP deliberately uses export:
  // its registry action covers both opening and downloading its reports.
  const selected = action
    ? page.actions.find(candidate => candidate.action === action)
    : page.actions.find(candidate => candidate.action === 'read') ?? page.actions[0];
  return selected ? { resource: selected.resource, action: selected.action } : null;
}

/**
 * Resolves the resource/action which protects a direct URL.
 *
 * This is intentionally pure.  It is used by App's route guard and can be
 * tested without rendering the application or creating a Supabase client.
 * `null` means that the URL has no report/action-specific requirement and the
 * normal PAGE_DEFS guard should decide.
 */
export function resolveRoutePermission(
  pathname: string,
  search = '',
  hash = '',
): RoutePermission | null {
  if (pathname.startsWith('#')) {
    return resolveReportsDirectoryAction(pathname);
  }
  const cleanPath = pathOnly(pathname);
  const query = search.startsWith('?') ? search.slice(1) : search;
  // ReportsDirectory destinations are the canonical action map. Resolve them
  // before the broader registry aliases so query tabs do not inherit the
  // parent hub's permission (for example fixed-assets must not become
  // accounting access, and payroll-admin must not become HR overview access).
  const directoryPermission = resolveReportsDirectoryRoutePermission(pathname, query, hash);
  if (directoryPermission) return directoryPermission;
  const alias = REPORT_ROUTE_ALIASES.find(candidate =>
    candidate.pattern.test(cleanPath) && (!candidate.query || candidate.query.test(query))
  );
  if (alias) return registryPermission(alias.registryRoute, alias.action);
  if (!REPORT_ROUTES.has(cleanPath)) return null;
  return registryPermission(cleanPath);
}

export interface ResourcePermissionOverride {
  resource: string;
  action: string;
  is_granted: boolean;
  expires_at?: string | null;
}

function isActiveResourcePermissionOverride(override: ResourcePermissionOverride): boolean {
  return !override.expires_at || new Date(override.expires_at).getTime() > Date.now();
}

/**
 * Applies the explicit action override used by visible report entry points.
 * When there is no matching override, the caller's role/page baseline is
 * retained.
 */
export function resolveResourcePermissionOverride(
  baseline: boolean,
  requirement: RoutePermission,
  overrides: ResourcePermissionOverride[],
): boolean {
  const override = overrides.find(candidate =>
    candidate.resource === requirement.resource &&
    candidate.action === requirement.action &&
    isActiveResourcePermissionOverride(candidate)
  );
  return override ? override.is_granted : baseline;
}

/** Role baseline for a route whose visible entry point checks a registry action. */
export function canSeeRoutePermission(
  requirement: RoutePermission,
  role: string | null | undefined,
): boolean {
  const normalized = normalizeRoleCode(role);
  if (!normalized) return false;
  if (normalized.toLowerCase() === 'superadmin') return true;

  const key = Object.keys(DEFAULT_ROLE_PERMISSIONS).find(candidate =>
    candidate.toLowerCase().replace(/[\s_-]/g, '') ===
    normalized.toLowerCase().replace(/[\s_-]/g, '')
  );
  if (!key) return false;
  return DEFAULT_ROLE_PERMISSIONS[key as keyof typeof DEFAULT_ROLE_PERMISSIONS]
    .some(permission =>
      permission.resource === requirement.resource &&
      permission.action === requirement.action
    );
}

const ROLE_ALIASES: Record<string, string> = {
  super_admin: 'superAdmin',
  superadmin: 'superAdmin',
  admin: 'admin',
  ict: 'ict',
  fom: 'fom',
  field_operation_manager: 'fom',
  'field_operation_manager_(fom)': 'fom',
  field_ops_manager: 'fom',
  financial_admin: 'financialAdmin',
  financialadmin: 'financialAdmin',
  auditor: 'auditor',
  supervisor: 'supervisor',
  hubsupervisor: 'supervisor',
  hub_supervisor: 'supervisor',
  coordinator: 'coordinator',
  data_collector: 'dataCollector',
  datacollector: 'dataCollector',
  data_team: 'dataTeam',
  reviewer: 'reviewer',
  project_manager: 'projectManager',
  pm: 'projectManager',
  country_director: 'countryDirector',
  senior_operations_lead: 'seniorOperationsLead',
  smt: 'SMT',
};

/** Built-in role codes that receive blanket access to pages marked `roles: ['all']`. */
const SYSTEM_ROLE_CODES = new Set([
  'superAdmin', 'admin', 'ict', 'fom', 'financialAdmin', 'auditor',
  'supervisor', 'coordinator', 'dataCollector', 'dataTeam', 'reviewer',
  'projectManager', 'countryDirector', 'seniorOperationsLead', 'seniorManagement',
  'employee', 'hr', 'hrManager',
]);

export function normalizeRoleCode(role: string | null | undefined): string {
  if (!role) return '';
  const k = role.toLowerCase().replace(/[\s-]/g, '_');
  return ROLE_ALIASES[k] ?? role;
}

function isSystemRole(code: string): boolean {
  return SYSTEM_ROLE_CODES.has(code);
}

function roleMatches(pageRole: string, userRole: string): boolean {
  return pageRole.toLowerCase() === userRole.toLowerCase();
}

/** Path → slug lookup so callers that key off URL (sidebar) can use the same gate. */
const PATH_TO_SLUG: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const p of PAGE_DEFS) m[p.path] = p.slug;
  return m;
})();

function splitLocation(value: string): { pathname: string; query: URLSearchParams } {
  const withoutHash = value.split('#', 1)[0];
  const [pathname, query = ''] = withoutHash.split('?', 2);
  return { pathname: pathname || '/', query: new URLSearchParams(query) };
}

/**
 * Resolves a registered target from a URL without relying on query-string
 * order. This matters for hub pages: `/finance-hub?source=x&tab=budget`
 * must resolve to the same target as the sidebar's canonical destination.
 */
function resolveRegisteredLocation(value: string): string | null {
  const location = splitLocation(value);
  const matches = PAGE_DEFS
    .map(def => ({ def, location: splitLocation(def.path) }))
    .filter(candidate => candidate.location.pathname === location.pathname)
    .filter(candidate => [...candidate.location.query].every(([key, value]) =>
      location.query.get(key) === value,
    ));

  if (matches.length === 0) return null;
  // Prefer the most specific query-tab target; a plain parent page is the
  // fallback when no registered query target matches.
  matches.sort((a, b) => [...b.location.query].length - [...a.location.query].length);
  return matches[0].def.slug;
}

/**
 * Resolves any URL pathname to a PAGE_DEFS slug, handling dynamic route
 * segments (e.g. "/mmp/abc123/edit" → slug of "/mmp") by walking
 * progressively shorter prefix paths until a match is found.
 * Returns null when no definition exists — callers decide whether to fail-open
 * or fail-closed (the route guard fails-open so new pages work automatically).
 */
export function resolveSlug(pathname: string): string | null {
  const registered = resolveRegisteredLocation(pathname);
  if (registered) return registered;

  const cleanPath = splitLocation(pathname).pathname;
  const redirect = PAGE_ACCESS_REDIRECTS.find(candidate => candidate.fromPath === cleanPath);
  if (redirect) {
    const destination = resolveRegisteredLocation(redirect.toPath)
      ?? resolveRegisteredLocation(redirect.toPath.split(/[?#]/, 1)[0]);
    if (destination) return destination;
  }
  if (/^\/tasks\/[^/]+\/?$/.test(cleanPath)) return 'my-tasks';
  if (/^\/admin\/wallets\/[^/]+\/?$/.test(cleanPath)) return resolveRegisteredLocation('/finance-hub?tab=admin-wallets');
  // The report has a dynamic MMP id between its parent path and fixed suffix.
  // It must use its own permission instead of inheriting the broader /mmp page.
  if (/^\/mmp\/[^/]+\/full-report\/?$/.test(cleanPath)) return 'mmp-full-report';
  // Walk up the path, stripping dynamic segments one at a time
  const segments = cleanPath.split('/').filter(Boolean);
  for (let len = segments.length - 1; len >= 1; len--) {
    const candidate = '/' + segments.slice(0, len).join('/');
    if (PATH_TO_SLUG[candidate]) return PATH_TO_SLUG[candidate];
  }
  return null;
}

/**
 * The single registry-derived description of a protected navigation target.
 *
 * Consumers should use this rather than resolving the page slug and the
 * action-specific requirement separately.  Returning `null` is deliberate:
 * callers can keep explicitly public routes outside the protected route tree,
 * while a route inside that tree can choose a clear fail-closed response.
 */
export interface RouteAccessTarget {
  slug: string;
  routePermission: RoutePermission | null;
}

export function resolveRouteAccessTarget(
  pathname: string,
  search = '',
  hash = '',
): RouteAccessTarget | null {
  const slug = resolveSlug(`${pathname}${search}${hash}`) ?? resolveSlug(pathname);
  if (!slug) return null;

  return {
    slug,
    routePermission: resolveRoutePermission(pathname, search, hash),
  };
}

/** URL-based variant of canSeePage. Fail-closed: an unknown path returns
 *  `false` so an undeclared route never silently leaks to the sidebar. If a
 *  caller wants to OR with custom logic (e.g. `perms.X`), it must do so
 *  explicitly. */
export function canSeePath(path: string, role: string | null | undefined): boolean {
  const slug = PATH_TO_SLUG[path];
  if (!slug) return false;
  return canSeePage(slug, role);
}

/** Returns the human-readable label for a slug, or the slug itself if not found. */
export function getPageLabel(slug: string): string {
  return PAGE_DEFS.find(p => p.slug === slug)?.label ?? slug;
}

/**
 * Pure check against PAGE_DEFS (or an optional roles override from
 * page_role_configs). Custom / non-system roles (e.g. SMT) do NOT inherit
 * blanket `all` access — they must be listed explicitly on each page.
 */
export function canSeePage(
  slug: string,
  role: string | null | undefined,
  effectiveRoles?: string[],
): boolean {
  const def = PAGE_DEFS.find(p => p.slug === slug);
  if (!def) return true; // Unknown page → don't hide (sidebar may still gate it)
  const r = normalizeRoleCode(role);
  if (!r || r.toLowerCase() === 'custom') return false;
  if (r === 'superAdmin') return true;

  const roles = effectiveRoles ?? def.roles;
  const system = isSystemRole(r);

  // Negation rules first
  for (const rule of roles) {
    if (rule.startsWith('!')) {
      const banned = rule.slice(1);
      if (roleMatches(banned, r)) return false;
    }
  }

  // Explicit grant
  if (roles.some(x => !x.startsWith('!') && roleMatches(x, r))) return true;

  // Blanket "all" only for built-in system roles
  if (system && roles.includes('all')) return true;

  // If only negation rules exist and the (system) role didn't match any, allow.
  if (system && roles.length > 0 && roles.every(x => x.startsWith('!'))) return true;

  return false;
}

export type PageAccessLookupErrorSource = 'config' | 'action' | 'page';

/**
 * Result of resolving the asynchronous access layers.
 *
 * `allowed: false` is a normal denial when an override explicitly blocks a
 * route (or when the role baseline is denied).  `error` is set when an
 * override lookup could not be completed.  Keeping that state distinct from
 * "no override row" lets action-guarded routes fail closed without changing
 * the historical baseline fallback for ordinary page routes.
 */
export interface PageAccessResult {
  allowed: boolean;
  error?: {
    type: 'override_lookup_failed';
    source: PageAccessLookupErrorSource;
  };
}

/** Async variant that layers page_role_configs + per-user page_access_overrides. */
export async function canSeePageWithOverridesResult(
  slug: string,
  role: string | string[] | null | undefined,
  userId: string | null | undefined,
  routePermission?: RoutePermission,
  routeBaseline?: boolean,
): Promise<PageAccessResult> {
  let effectiveRoles: string[] | undefined;
  try {
    const { data: cfg, error } = await supabase
      .from('page_role_configs')
      .select('roles')
      .eq('page_slug', slug)
      .maybeSingle();
    if (error) {
      return {
        allowed: false,
        error: { type: 'override_lookup_failed', source: 'config' },
      };
    }
    if (cfg?.roles && Array.isArray(cfg.roles)) {
      effectiveRoles = cfg.roles as string[];
    }
  } catch {
    return {
      allowed: false,
      error: { type: 'override_lookup_failed', source: 'config' },
    };
  }

  const roleNames = Array.isArray(role) ? role : [role];
  const baseline = routeBaseline ?? roleNames.some(roleName => canSeePage(slug, roleName, effectiveRoles));
  if (!userId) return { allowed: baseline };

  // Action-level overrides are the same permission checked by report buttons.
  // Resolve these before the page-level override so a direct URL cannot drift
  // from its visible entry point (and an explicit grant can open a role-hidden
  // report, while an explicit block closes a role-allowed report).
  if (routePermission) {
    try {
      const { data: actionOverride, error } = await supabase
        .from('user_permission_overrides')
        .select('resource, action, is_granted, expires_at')
        .eq('user_id', userId)
        .eq('resource', routePermission.resource)
        .eq('action', routePermission.action)
        .maybeSingle();
      if (error) {
        return {
          allowed: false,
          error: { type: 'override_lookup_failed', source: 'action' },
        };
      }
      // An expired action override is not an override at all. Continue to the
      // page-level override lookup so expiry cannot accidentally bypass an
      // explicit page block/grant.
      if (actionOverride && isActiveResourcePermissionOverride(actionOverride as ResourcePermissionOverride)) {
        return {
          allowed: resolveResourcePermissionOverride(
            baseline,
            routePermission,
            [actionOverride as ResourcePermissionOverride],
          ),
        };
      }
    } catch {
      // Network or schema-cache miss — action routes fail closed.  A thrown
      // query is different from a successful no-row lookup and must not be
      // treated as an implicit absence of an override.
      return {
        allowed: false,
        error: { type: 'override_lookup_failed', source: 'action' },
      };
    }
  }

  try {
    const { data, error } = await supabase
      .from('page_access_overrides')
      .select('is_blocked')
      .eq('page_slug', slug)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      // Preserve the baseline fallback for ordinary page routes, but never
      // admit an action-guarded route when its page override lookup failed.
      return routePermission
        ? {
            allowed: false,
            error: { type: 'override_lookup_failed', source: 'page' },
          }
        : { allowed: baseline, error: { type: 'override_lookup_failed', source: 'page' } };
    }
    if (data) return { allowed: !data.is_blocked };
  } catch {
    // Same distinction as the response error above: ordinary pages retain
    // their baseline behavior, while action routes fail closed.
    return routePermission
      ? {
          allowed: false,
          error: { type: 'override_lookup_failed', source: 'page' },
        }
      : { allowed: baseline, error: { type: 'override_lookup_failed', source: 'page' } };
  }
  return { allowed: baseline };
}

/**
 * Backwards-compatible boolean helper for component-level visibility checks.
 * Route guards use canSeePageWithOverridesResult so they can distinguish an
 * override lookup error from a successful no-row result.
 */
export async function canSeePageWithOverrides(
  slug: string,
  role: string | string[] | null | undefined,
  userId: string | null | undefined,
  routePermission?: RoutePermission,
  routeBaseline?: boolean,
): Promise<boolean> {
  const result = await canSeePageWithOverridesResult(
    slug,
    role,
    userId,
    routePermission,
    routeBaseline,
  );
  return result.allowed;
}
