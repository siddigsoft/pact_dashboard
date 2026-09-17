/**
 * Read-only, canonical projection of the application's access surface.
 *
 * This module intentionally does not create a second permission system. It
 * composes the existing page, hub-tab, action, filter, and column registries
 * so Access Management and drift checks can enumerate the same targets that
 * the application already uses.
 *
 * Registry presence is metadata only. Authorization remains enforced by route
 * guards, RLS, RPCs, and server-side permission checks.
 */
import { PAGE_DEFS } from '@/lib/access-registry';
import { HUB_TAB_REGISTRY, hubTabSlug } from '@/lib/hub-tab-defs';
import { MODULE_REGISTRY, type ModuleAction } from '@/types/moduleRegistry';
import { FILTER_REGISTRY, type FilterDefinition } from '@/lib/filter-registry';
import { COLUMN_REGISTRY, type PageColumnDef } from '@/lib/column-registry';
import { ACCESS_TARGET_REGISTRY, getRegisteredPageActions } from '@/lib/access-target-registry';
import { PAGE_ACCESS_REDIRECTS } from '@/lib/pageAccessRedirects';

export const ACCESS_SCOPE_DIMENSIONS = [
  'hub',
  'project',
  'state',
  'country',
  'cost_center',
  'organization',
  'policy',
] as const;

export type AccessScopeDimension = typeof ACCESS_SCOPE_DIMENSIONS[number];

export interface AccessInventoryItem {
  key: string;
  label: string;
  pageSlug?: string;
  kind: 'page' | 'route' | 'tab' | 'action' | 'report' | 'filter' | 'column' | 'scope';
  description?: string;
  sensitive?: boolean;
  destructive?: boolean;
  registryKey?: string;
  route?: string;
  enforcementOwner: string;
  enforcementBoundary: 'registry' | 'route' | 'rpc' | 'rls' | 'server_check';
  enforcementEvidence?: string;
  serverEnforcement: 'metadata' | 'requires_verification' | 'verified';
}

export interface AccessInventory {
  pages: AccessInventoryItem[];
  routes: AccessInventoryItem[];
  tabs: AccessInventoryItem[];
  actions: AccessInventoryItem[];
  reports: AccessInventoryItem[];
  filters: AccessInventoryItem[];
  columns: AccessInventoryItem[];
  scopes: AccessInventoryItem[];
}

export interface AccessInventoryIssue {
  kind: 'duplicate' | 'unknown-page' | 'unknown-tab' | 'unknown-action-page';
  key: string;
  message: string;
}

const pageSlugs = new Set(PAGE_DEFS.map(page => page.slug));
const tabSlugs = new Set(
  HUB_TAB_REGISTRY.flatMap(hub =>
    hub.sections.flatMap(section =>
      section.tabs.map(tab => hubTabSlug(hub.hubSlug, tab.tabId)),
    ),
  ),
);

function actionKey(action: ModuleAction): string {
  return action.key || `${action.resource}:${action.action}`;
}

function pageSlugForRoute(route: string): string | undefined {
  const exactTarget = route.split('#', 1)[0];
  const exact = PAGE_DEFS.find(page => page.path.split('#', 1)[0] === exactTarget);
  if (exact) return exact.slug;

  const pathname = route.split(/[?#]/, 1)[0];
  return PAGE_DEFS.find(page => page.path.split(/[?#]/, 1)[0] === pathname)?.slug;
}

function uniqueByKey(items: AccessInventoryItem[]): AccessInventoryItem[] {
  return [...new Map(items.map(item => [item.key, item])).values()];
}

const VERIFIED_ACTION_BOUNDARIES: Record<string, {
  owner: string;
  boundary: 'rpc' | 'rls' | 'server_check';
  evidence: string;
}> = {
  '/mmp:mmp:full_report': {
    owner: 'public.get_mmp_report_payload(uuid, text)',
    boundary: 'rpc',
    evidence: 'supabase/migrations/20260914b_mmp_report_kind_permissions.sql',
  },
  '/mmp:mmp:state_report': {
    owner: 'public.get_mmp_report_payload(uuid, text)',
    boundary: 'rpc',
    evidence: 'supabase/migrations/20260914b_mmp_report_kind_permissions.sql',
  },
  '/mmp:mmp:hub_report': {
    owner: 'public.get_mmp_report_payload(uuid, text)',
    boundary: 'rpc',
    evidence: 'supabase/migrations/20260914b_mmp_report_kind_permissions.sql',
  },
};

function actionEnforcement(route: string, action: ModuleAction) {
  const evidence = VERIFIED_ACTION_BOUNDARIES[`${route}:${actionKey(action)}`];
  if (evidence) {
    return {
      serverEnforcement: 'verified' as const,
      enforcementOwner: evidence.owner,
      enforcementBoundary: evidence.boundary,
      enforcementEvidence: evidence.evidence,
    };
  }
  return {
    serverEnforcement: 'requires_verification' as const,
    enforcementOwner: route,
    enforcementBoundary: 'route' as const,
  };
}

/** Enumerates the current access surface without adding permission truth. */
export function getAccessInventory(): AccessInventory {
  const pages = PAGE_DEFS.map(page => ({
    key: page.slug,
    label: page.label,
    kind: 'page' as const,
    description: page.note,
    serverEnforcement: 'requires_verification' as const,
    enforcementOwner: page.group,
    enforcementBoundary: 'route' as const,
  }));

  const routes = PAGE_DEFS.map(page => ({
    key: page.path,
    label: page.label,
    pageSlug: page.slug,
    kind: 'route' as const,
    description: page.note,
    serverEnforcement: 'requires_verification' as const,
    enforcementOwner: page.path,
    enforcementBoundary: 'route' as const,
  }));

  const tabs = HUB_TAB_REGISTRY.flatMap(hub =>
    hub.sections.flatMap(section =>
      section.tabs.map(tab => ({
        key: hubTabSlug(hub.hubSlug, tab.tabId),
        label: `${hub.hubLabel} · ${tab.label}`,
        pageSlug: hub.hubSlug,
        kind: 'tab' as const,
        description: tab.description,
        serverEnforcement: 'requires_verification' as const,
        enforcementOwner: hub.hubSlug,
        enforcementBoundary: 'route' as const,
      })),
    ),
  );

  const actions = MODULE_REGISTRY.flatMap(module =>
    module.pages.flatMap(modulePage =>
      modulePage.actions.map(action => {
        const pageSlug = pageSlugForRoute(modulePage.route);
        const registryKey = actionKey(action);
        return {
        key: `${modulePage.route}:${registryKey}`,
        registryKey,
        label: action.label,
        pageSlug,
        route: modulePage.route,
        kind: (action.action === 'export' ? 'report' : 'action') as 'report' | 'action',
        description: action.description,
        destructive: action.isDestructive,
        ...actionEnforcement(modulePage.route, action),
      }}),
    ),
  );

  const filters = FILTER_REGISTRY.map(filter => ({
    key: filter.key,
    label: filter.label,
    pageSlug: filter.page,
    kind: 'filter' as const,
    description: filter.description,
    serverEnforcement: 'metadata' as const,
    enforcementOwner: filter.page,
    enforcementBoundary: 'registry' as const,
  }));

  const columns = COLUMN_REGISTRY.flatMap(page =>
    page.columns.map(column => ({
      key: `${page.pageSlug}.${column.key}`,
      label: `${page.pageLabel} · ${column.label}`,
      pageSlug: page.pageSlug,
      kind: 'column' as const,
      description: column.description,
      sensitive: column.sensitive,
      serverEnforcement: column.sensitive ? 'requires_verification' as const : 'metadata' as const,
      enforcementOwner: page.pageSlug,
      enforcementBoundary: 'registry' as const,
    })),
  );

  const scopes = ACCESS_SCOPE_DIMENSIONS.map(scope => ({
    key: scope,
    label: scope.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase()),
    kind: 'scope' as const,
    serverEnforcement: 'requires_verification' as const,
    enforcementOwner: `scope:${scope}`,
    enforcementBoundary: 'registry' as const,
  }));

  return {
    pages: uniqueByKey(pages),
    routes: uniqueByKey(routes),
    tabs: uniqueByKey(tabs),
    actions: uniqueByKey(actions),
    reports: uniqueByKey(actions.filter(item => item.kind === 'report')),
    filters: uniqueByKey(filters),
    columns: uniqueByKey(columns),
    scopes: uniqueByKey(scopes),
  };
}

/**
 * Finds configuration drift without treating a registry entry as proof of
 * authorization. Persisted filter and column keys may retain legacy prefixes,
 * but every entry must name one canonical page or hub-tab owner.
 */
export function getAccessInventoryIssues(): AccessInventoryIssue[] {
  const issues: AccessInventoryIssue[] = [];
  const inventory = getAccessInventory();

  const rawFamilies: Array<[string, string[]]> = [
    ['pages', PAGE_DEFS.map(page => page.slug)],
    ['routes', PAGE_DEFS.map(page => page.path)],
    ['tabs', HUB_TAB_REGISTRY.flatMap(hub => hub.sections.flatMap(section => section.tabs.map(tab => hubTabSlug(hub.hubSlug, tab.tabId))))],
    ['actions', MODULE_REGISTRY.flatMap(module => module.pages.flatMap(page => page.actions.map(action => `${page.route}:${actionKey(action)}`)))],
    ['filters', FILTER_REGISTRY.map(filter => filter.key)],
    ['columns', COLUMN_REGISTRY.flatMap(page => page.columns.map(column => `${page.pageSlug}.${column.key}`))],
  ];
  for (const [kind, keys] of rawFamilies) {
    const seen = new Set<string>();
    for (const key of keys) {
      if (seen.has(key)) {
        issues.push({ kind: 'duplicate', key, message: `Duplicate ${kind} target: ${key}` });
      }
      seen.add(key);
    }
  }

  for (const filter of inventory.filters) {
    if (!pageSlugs.has(filter.pageSlug ?? '') && !tabSlugs.has(filter.pageSlug ?? '')) {
      issues.push({ kind: 'unknown-page', key: filter.key, message: `Filter ${filter.key} references unknown page or tab ${filter.pageSlug}` });
    }
  }
  for (const column of inventory.columns) {
    if (!pageSlugs.has(column.pageSlug ?? '') && !tabSlugs.has(column.pageSlug ?? '')) {
      issues.push({ kind: 'unknown-page', key: column.key, message: `Column ${column.key} references unknown page or tab ${column.pageSlug}` });
    }
  }

  for (const target of ACCESS_TARGET_REGISTRY) {
    const registeredActions = getRegisteredPageActions(target.page.slug);
    for (const action of registeredActions) {
      const directMatch = inventory.actions.some(item =>
        item.registryKey === actionKey(action) && item.pageSlug === target.page.slug
      );
      // Redirect declarations are the supported alias list. A legacy page may
      // expose its destination's actions, but only when that exact destination
      // route owns the same registered action.
      const destination = PAGE_ACCESS_REDIRECTS.find(redirect => redirect.fromPath === target.page.path)?.toPath;
      const aliasMatch = destination && inventory.actions.some(item =>
        item.registryKey === actionKey(action) && item.route === destination
      );
      if (!directMatch && !aliasMatch) {
        issues.push({
          kind: 'unknown-action-page',
          key: `${target.page.slug}:${actionKey(action)}`,
          message: `Action ${actionKey(action)} could not be enumerated for ${target.page.slug}`,
        });
      }
    }
  }

  return issues;
}