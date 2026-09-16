/**
 * Related page families for Access Control Workspace.
 *
 * Grant / block / clear cascades across:
 * 1. Explicit product families (My Projects ↔ Projects)
 * 2. Legacy standalone paths that App.tsx redirects into hub URLs
 * 3. Query-tab PAGE_DEFS entries and their hub parents
 */

import type { AccessEffect } from '@/lib/effectiveAccess';
import { PAGE_DEFS } from '@/lib/access-registry';
import { PAGE_ACCESS_REDIRECTS } from '@/lib/pageAccessRedirects';
import { resolveRoutePermission, type RoutePermission } from '@/lib/page-roles';

/** Manual product families that are not expressed as App redirects. */
const MANUAL_RELATED: Record<string, readonly string[]> = {
  'my-projects': ['projects'],
  projects: ['my-projects'],
};

function hubPathOf(path: string): string {
  return path.split('?')[0].split('#')[0];
}

function buildPathIndex(): Map<string, string> {
  const byPath = new Map<string, string>();
  for (const page of PAGE_DEFS) {
    byPath.set(page.path, page.slug);
  }
  return byPath;
}

function addEdge(graph: Map<string, Set<string>>, a: string, b: string) {
  if (!a || !b || a === b) return;
  if (!graph.has(a)) graph.set(a, new Set());
  if (!graph.has(b)) graph.set(b, new Set());
  graph.get(a)!.add(b);
  graph.get(b)!.add(a);
}

/**
 * Build the full bidirectional related-page graph once.
 * Exported for tests that assert completeness.
 */
export function buildPageRelatedGraph(): Record<string, string[]> {
  const byPath = buildPathIndex();
  const graph = new Map<string, Set<string>>();

  for (const [slug, related] of Object.entries(MANUAL_RELATED)) {
    for (const other of related) addEdge(graph, slug, other);
  }

  // Query-tab / hash PAGE_DEFS → hub parent
  for (const page of PAGE_DEFS) {
    if (!page.path.includes('?') && !page.path.includes('#')) continue;
    const hubSlug = byPath.get(hubPathOf(page.path));
    if (hubSlug) addEdge(graph, page.slug, hubSlug);
  }

  // App.tsx redirects: legacy path ↔ destination page and/or hub parent
  for (const { fromPath, toPath } of PAGE_ACCESS_REDIRECTS) {
    const fromSlug = byPath.get(fromPath);
    if (!fromSlug) continue;
    const toSlug = byPath.get(toPath);
    const toHubSlug = byPath.get(hubPathOf(toPath));
    if (toSlug) addEdge(graph, fromSlug, toSlug);
    if (toHubSlug) addEdge(graph, fromSlug, toHubSlug);
  }

  const out: Record<string, string[]> = {};
  for (const [slug, related] of graph.entries()) {
    out[slug] = Array.from(related).sort();
  }
  return out;
}

/** Cached graph for runtime grant cascade. */
export const PAGE_RELATED: Record<string, readonly string[]> = buildPageRelatedGraph();

export type PageToggleIntent = 'grant' | 'block' | 'clear' | 'noop';

export function getRelatedPageSlugs(slug: string): string[] {
  return [...(PAGE_RELATED[slug] ?? [])];
}

/** Primary slug first, then unique related siblings. */
export function expandRelatedPageSlugs(slug: string): string[] {
  const related = getRelatedPageSlugs(slug);
  return Array.from(new Set([slug, ...related]));
}

export function resolvePageToggleIntent(effect: AccessEffect): PageToggleIntent {
  if (effect === 'superadmin') return 'noop';
  if (effect === 'granted' || effect === 'blocked') return 'clear';
  if (effect === 'role-yes') return 'block';
  return 'grant';
}

/**
 * Action-protected pages (e.g. MMP) can appear "Granted" solely because of a
 * user_permission_overrides row. Page Remove Grant must clear those too, or
 * the UI looks like it refused the click.
 *
 * Finance pages are not all registered in ReportsDirectory; keep their org-wide
 * read gates here so Grant/Remove on Cost Submission / Down Payment stay in sync.
 */
const PAGE_ACTION_GATES: Record<string, RoutePermission> = {
  mmp: { resource: 'mmp', action: 'read' },
  'mmp-full-report': { resource: 'mmp', action: 'read' },
  'cost-submission': { resource: 'cost_submissions', action: 'read' },
  'cost-approval': { resource: 'cost_submissions', action: 'read' },
  'down-payment-approval': { resource: 'down_payments', action: 'read' },
};

export function getPageRoutePermissions(slugs: readonly string[]): RoutePermission[] {
  const seen = new Set<string>();
  const permissions: RoutePermission[] = [];
  for (const slug of slugs) {
    const page = PAGE_DEFS.find(candidate => candidate.slug === slug);
    if (!page) continue;
    const url = new URL(page.path, 'https://access.local');
    const permission =
      resolveRoutePermission(url.pathname, url.search, url.hash) ??
      PAGE_ACTION_GATES[slug] ??
      null;
    if (!permission) continue;
    const key = `${permission.resource}:${permission.action}`;
    if (seen.has(key)) continue;
    seen.add(key);
    permissions.push(permission);
  }
  return permissions;
}

export function relatedPageLabels(slugs: string[], labelFor: (slug: string) => string): string {
  return slugs.map(labelFor).join(', ');
}

/** Slugs that have at least one related sibling (for UI Linked badges). */
export function hasRelatedPages(slug: string): boolean {
  return getRelatedPageSlugs(slug).length > 0;
}
