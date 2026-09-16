import { PAGE_DEFS, type PageDef } from '@/lib/access-registry';
import { HUB_TAB_REGISTRY, hubTabSlug } from '@/lib/hub-tab-defs';
import { MODULE_REGISTRY, type ModuleAction } from '@/types/moduleRegistry';
import { PAGE_ACCESS_REDIRECTS } from '@/lib/pageAccessRedirects';

export interface AccessTargetDefinition {
  page: PageDef;
  tabs: Array<{ slug: string; tabId: string; label: string }>;
  actions: ModuleAction[];
  dependencies: string[];
  enforcement: {
    owner: string;
    client: 'registered';
    server: 'partial' | 'requires_verification';
  };
}

/** Exact routes and declared redirects only: a parent hub's write actions
 * must never silently become the permissions of every child tab. */
export function getRegisteredPageActions(slug: string): ModuleAction[] {
  const page = PAGE_DEFS.find(candidate => candidate.slug === slug);
  if (!page) return [];
  const destination = PAGE_ACCESS_REDIRECTS.find(redirect => redirect.fromPath === page.path)?.toPath;
  const routes = new Set([page.path, destination].filter(Boolean));
  const actions = MODULE_REGISTRY.flatMap(module => module.pages)
    .filter(candidate => routes.has(candidate.route))
    .flatMap(candidate => candidate.actions);
  return [...new Map(actions.map(action => [action.key, action])).values()];
}

/** Shared, typed projection of existing page, tab and action definitions.
 * Server status is deliberately conservative until individual RLS/RPC paths
 * have been verified; presence in a button registry is not enforcement. */
export const ACCESS_TARGET_REGISTRY: AccessTargetDefinition[] = PAGE_DEFS.map(page => {
  const hub = HUB_TAB_REGISTRY.find(candidate => candidate.hubSlug === page.slug ||
    (candidate.hubSlug === 'accounting' && page.slug === 'accounting-hub'));
  const parentPath = page.path.split(/[?#]/, 1)[0];
  const parent = page.path !== parentPath
    ? PAGE_DEFS.find(candidate => candidate.path === parentPath)
    : undefined;
  return {
    page,
    tabs: hub?.sections.flatMap(section => section.tabs.map(tab => ({
      slug: hubTabSlug(hub.hubSlug, tab.tabId), tabId: tab.tabId, label: tab.label,
    }))) ?? [],
    actions: getRegisteredPageActions(page.slug),
    dependencies: parent ? [parent.slug] : [],
    enforcement: {
      owner: page.group, client: 'registered',
      server: getRegisteredPageActions(page.slug).some(action =>
        ['pre_funding', 'cost_submissions', 'down_payments'].includes(action.resource) || action.action === 'export')
        ? 'partial' : 'requires_verification',
    },
  };
});

export function getAccessTargetRegistryIssues(): string[] {
  const issues: string[] = [];
  const pageSlugs = new Set(PAGE_DEFS.map(page => page.slug));
  for (const hub of HUB_TAB_REGISTRY) {
    if (!pageSlugs.has(hub.hubSlug) && !(hub.hubSlug === 'accounting' && pageSlugs.has('accounting-hub'))) {
      issues.push(`Unknown hub: ${hub.hubSlug}`);
    }
    const tabs = hub.sections.flatMap(section => section.tabs.map(tab => tab.tabId));
    if (new Set(tabs).size !== tabs.length) issues.push(`Duplicate tabs: ${hub.hubSlug}`);
  }
  for (const target of ACCESS_TARGET_REGISTRY) {
    for (const dependency of target.dependencies) {
      if (!pageSlugs.has(dependency)) issues.push(`Unknown dependency: ${dependency}`);
    }
  }
  return issues;
}
