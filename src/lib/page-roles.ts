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
import { PAGE_DEFS } from '@/pages/PageAccessControl';
import { supabase } from '@/integrations/supabase/client';

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

/**
 * Resolves any URL pathname to a PAGE_DEFS slug, handling dynamic route
 * segments (e.g. "/mmp/abc123/edit" → slug of "/mmp") by walking
 * progressively shorter prefix paths until a match is found.
 * Returns null when no definition exists — callers decide whether to fail-open
 * or fail-closed (the route guard fails-open so new pages work automatically).
 */
export function resolveSlug(pathname: string): string | null {
  // Exact match first
  if (PATH_TO_SLUG[pathname]) return PATH_TO_SLUG[pathname];
  // The report has a dynamic MMP id between its parent path and fixed suffix.
  // It must use its own permission instead of inheriting the broader /mmp page.
  if (/^\/mmp\/[^/]+\/full-report\/?$/.test(pathname)) return 'mmp-full-report';
  // Walk up the path, stripping dynamic segments one at a time
  const segments = pathname.split('/').filter(Boolean);
  for (let len = segments.length - 1; len >= 1; len--) {
    const candidate = '/' + segments.slice(0, len).join('/');
    if (PATH_TO_SLUG[candidate]) return PATH_TO_SLUG[candidate];
  }
  return null;
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

/** Async variant that layers page_role_configs + per-user page_access_overrides. */
export async function canSeePageWithOverrides(
  slug: string,
  role: string | null | undefined,
  userId: string | null | undefined,
): Promise<boolean> {
  let effectiveRoles: string[] | undefined;
  try {
    const { data: cfg } = await supabase
      .from('page_role_configs')
      .select('roles')
      .eq('page_slug', slug)
      .maybeSingle();
    if (cfg?.roles && Array.isArray(cfg.roles) && cfg.roles.length > 0) {
      effectiveRoles = cfg.roles as string[];
    }
  } catch {
    // ignore — fall back to PAGE_DEFS
  }

  const baseline = canSeePage(slug, role, effectiveRoles);
  if (!userId) return baseline;
  try {
    const { data } = await supabase
      .from('page_access_overrides')
      .select('is_blocked')
      .eq('page_slug', slug)
      .eq('user_id', userId)
      .maybeSingle();
    if (data) return !data.is_blocked;
  } catch {
    // Network or schema-cache miss — fall back to baseline.
  }
  return baseline;
}
