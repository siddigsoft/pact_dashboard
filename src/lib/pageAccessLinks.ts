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

export function relatedPageLabels(slugs: string[], labelFor: (slug: string) => string): string {
  return slugs.map(labelFor).join(', ');
}

/** Slugs that have at least one related sibling (for UI Linked badges). */
export function hasRelatedPages(slug: string): boolean {
  return getRelatedPageSlugs(slug).length > 0;
}
