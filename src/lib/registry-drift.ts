/**
 * registry-drift.ts
 *
 * Runtime utility that cross-references PAGE_DEFS (the canonical page/slug
 * list managed in PageAccessControl) against MODULE_REGISTRY (the static
 * button-level action map used by the Button Registry).
 *
 * Any page in PAGE_DEFS that has no corresponding entry in MODULE_REGISTRY
 * is considered "drifted" — the Button Registry silently omits its actions.
 *
 * Used by SuperAdminButtonRegistry to surface a visible warning so admins
 * know when the registry is stale.
 */

import { MODULE_REGISTRY } from '@/types/moduleRegistry';
import { PAGE_DEFS } from '@/pages/PageAccessControl';

// ── Exclusions ────────────────────────────────────────────────────────────────

/**
 * Slugs that are intentionally not tracked in the Button Registry because they
 * have no meaningful button-level actions (informational/utility pages).
 */
const EXCLUDED_SLUGS = new Set([
  // Pure informational / no user actions
  'documentation', 'mobile-documentation', 'public-documentation',
  'changelog', 'system-diagrams', 'helpline', 'support-contacts',
  'mobile-support-tickets', 'mobile-documentation',
  // Utility pages — actions are trivial (search, read-only calendar, etc.)
  'search', 'notification-preferences', 'notification-history', 'workspace',
  // Standalone auth / user-preference pages
  'mobile-cost-submission',  // covered by cost-submission in registry
  // Legacy pages already superseded by hub entries
  'finance', // legacy, covered by finance-hub
]);

/**
 * SA Hub *tab* page defs (path starts with /super-admin-hub?tab=) are
 * included in PAGE_DEFS purely for the Page Access Control panel to manage
 * per-user tab visibility.  They are NOT standalone pages and their button
 * actions are covered by the SA Hub module entry in MODULE_REGISTRY.
 */
function isSAHubTabDef(path: string): boolean {
  return path.startsWith('/super-admin-hub?tab=');
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DriftedPage {
  slug: string;
  label: string;
  path: string;
  group: string;
}

export interface RegistryDriftReport {
  /** Pages present in PAGE_DEFS but absent from MODULE_REGISTRY */
  driftedPages: DriftedPage[];
  /** Number of trackable pages that ARE represented in the registry */
  trackedCount: number;
  /** Total trackable pages (after exclusions) */
  totalTrackableCount: number;
  /** Coverage percentage 0–100 */
  coveragePercent: number;
  /** True when any drift exists */
  isDrifted: boolean;
}

// ── Core logic ────────────────────────────────────────────────────────────────

/**
 * Strips fragment anchors (#...) and normalises a path for comparison.
 */
function cleanPath(raw: string): string {
  return raw.split('#')[0];
}

/**
 * Returns the base path (everything before the first '?').
 */
function basePath(path: string): string {
  return cleanPath(path).split('?')[0];
}

/**
 * Computes the registry drift report.
 *
 * A PAGE_DEF path is considered "tracked" when the MODULE_REGISTRY contains
 * at least one page whose route shares the same base path.  This means a hub
 * entry like '/accounting' covers all '/accounting?tab=*' sub-pages — which
 * is the correct semantic (the hub module owns all tabs).
 */
export function getRegistryDriftReport(): RegistryDriftReport {
  // Build a set of base paths from MODULE_REGISTRY
  const registryBasePaths = new Set<string>();
  const registryFullRoutes = new Set<string>();

  for (const mod of MODULE_REGISTRY) {
    for (const page of mod.pages) {
      const route = cleanPath(page.route);
      registryFullRoutes.add(route);
      registryBasePaths.add(basePath(route));
    }
  }

  function isTracked(path: string): boolean {
    const full = cleanPath(path);
    const base = basePath(full);
    // Exact full-route match
    if (registryFullRoutes.has(full)) return true;
    // Base-path match — registry covers the whole section (e.g. /accounting covers all tabs)
    if (registryBasePaths.has(base)) return true;
    return false;
  }

  // Filter to trackable pages
  const trackable = PAGE_DEFS.filter(
    p => !EXCLUDED_SLUGS.has(p.slug) && !isSAHubTabDef(p.path),
  );

  const drifted: DriftedPage[] = trackable
    .filter(p => !isTracked(p.path))
    .map(p => ({ slug: p.slug, label: p.label, path: p.path, group: p.group }));

  const trackedCount = trackable.length - drifted.length;
  const coveragePercent = trackable.length === 0
    ? 100
    : Math.round((trackedCount / trackable.length) * 100);

  return {
    driftedPages: drifted,
    trackedCount,
    totalTrackableCount: trackable.length,
    coveragePercent,
    isDrifted: drifted.length > 0,
  };
}

/**
 * Groups a list of drifted pages by their PAGE_DEF group label.
 */
export function groupDriftedPages(
  pages: DriftedPage[],
): Record<string, DriftedPage[]> {
  return pages.reduce<Record<string, DriftedPage[]>>((acc, p) => {
    (acc[p.group] ??= []).push(p);
    return acc;
  }, {});
}
