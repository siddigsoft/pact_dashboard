/**
 * Related page families for Access Control Workspace.
 * Grant / block / clear on one member cascades to the family so list entry
 * pages stay aligned with the detail routes they navigate into.
 */

import type { AccessEffect } from '@/lib/effectiveAccess';

/** Bidirectional related-page map (primary → siblings). */
export const PAGE_RELATED: Record<string, readonly string[]> = {
  'my-projects': ['projects'],
  projects: ['my-projects'],
};

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
