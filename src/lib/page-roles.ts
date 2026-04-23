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
  financial_admin: 'financialAdmin',
  financialadmin: 'financialAdmin',
  auditor: 'auditor',
  supervisor: 'supervisor',
  coordinator: 'coordinator',
  data_collector: 'dataCollector',
  datacollector: 'dataCollector',
  data_team: 'dataTeam',
  reviewer: 'reviewer',
  project_manager: 'projectManager',
  pm: 'projectManager',
  country_director: 'countryDirector',
};

export function normalizeRoleCode(role: string | null | undefined): string {
  if (!role) return '';
  const k = role.toLowerCase().replace(/[\s-]/g, '_');
  return ROLE_ALIASES[k] ?? role;
}

/** Path → slug lookup so callers that key off URL (sidebar) can use the same gate. */
const PATH_TO_SLUG: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const p of PAGE_DEFS) m[p.path] = p.slug;
  return m;
})();

/** URL-based variant of canSeePage. Fail-closed: an unknown path returns
 *  `false` so an undeclared route never silently leaks to the sidebar. If a
 *  caller wants to OR with custom logic (e.g. `perms.X`), it must do so
 *  explicitly. */
export function canSeePath(path: string, role: string | null | undefined): boolean {
  const slug = PATH_TO_SLUG[path];
  if (!slug) return false;
  return canSeePage(slug, role);
}

/** Pure check against PAGE_DEFS; does not consult overrides table. */
export function canSeePage(slug: string, role: string | null | undefined): boolean {
  const def = PAGE_DEFS.find(p => p.slug === slug);
  if (!def) return true; // Unknown page → don't hide (sidebar may still gate it)
  const r = normalizeRoleCode(role);
  if (def.roles.includes('all')) return true;
  // Negation rule: '!dataCollector' = visible to every role except dataCollector
  for (const rule of def.roles) {
    if (rule.startsWith('!')) {
      const banned = rule.slice(1);
      if (r === banned) return false;
    }
  }
  if (def.roles.some(x => !x.startsWith('!') && x === r)) return true;
  // If only negation rules exist and the role didn't match any, allow.
  return def.roles.every(x => x.startsWith('!'));
}

/** Async variant that layers per-user page_access_overrides on top. */
export async function canSeePageWithOverrides(
  slug: string,
  role: string | null | undefined,
  userId: string | null | undefined,
): Promise<boolean> {
  const baseline = canSeePage(slug, role);
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
