import { PAGE_DEFS } from '@/lib/access-registry';
import { resolveRoutePermission } from '@/lib/page-roles';
import { capabilityKey, type CapabilityPair } from '@/lib/capability-inventory';
import { MODULE_REGISTRY } from '@/types/moduleRegistry';

/** Mirrors the public.permissions resource CHECK constraint; other resources cannot be stored. */
const STORABLE_RESOURCES = new Set([
  'users', 'roles', 'permissions', 'settings', 'system', 'super_admins', 'audit_logs',
  'projects', 'portfolio', 'analytics', 'mmp', 'site_visits', 'hub_operations', 'coverage_map',
  'finances', 'cost_submissions', 'wallets', 'down_payments', 'pre_funding', 'accounting',
  'fixed_assets', 'procurement', 'transactions',
  'signatures', 'reports', 'crm', 'surveys', 'tasks', 'notifications', 'calendar',
  'hr', 'hr_analytics', 'payroll', 'benefits', 'leave', 'pulse_surveys', 'succession',
  'integrations', 'broadcast', 'whatsapp', 'incentives',
]);

function splitPath(path: string): [string, string, string] {
  const hashIndex = path.indexOf('#');
  const hash = hashIndex >= 0 ? path.slice(hashIndex) : '';
  const beforeHash = hashIndex >= 0 ? path.slice(0, hashIndex) : path;
  const queryIndex = beforeHash.indexOf('?');
  return queryIndex >= 0
    ? [beforeHash.slice(0, queryIndex), beforeHash.slice(queryIndex), hash]
    : [beforeHash, '', hash];
}

/**
 * Read permissions a role needs so a granted page opens instead of showing
 * "Access Denied": the route's own permission plus the non-privileged read
 * actions registered for that exact route.
 *
 * Pages open to every role ('all') are self-service and scoped to the caller's
 * own data; their registry reads are org-wide, so they are never auto-granted.
 */
export function getPageDefaultPermissions(slug: string): CapabilityPair[] {
  const def = PAGE_DEFS.find(page => page.slug === slug);
  if (!def || def.roles.includes('all')) return [];
  const pairs = new Map<string, CapabilityPair>();
  const add = (pair: CapabilityPair) => {
    if (STORABLE_RESOURCES.has(pair.resource)) pairs.set(capabilityKey(pair.resource, pair.action), pair);
  };

  const routePermission = resolveRoutePermission(...splitPath(def.path));
  if (routePermission) add(routePermission);

  for (const mod of MODULE_REGISTRY) {
    for (const page of mod.pages) {
      if (page.route !== def.path) continue;
      for (const act of page.actions) {
        if (act.action === 'read' && !act.isAdminOnly && !act.isSuperAdminOnly) {
          add({ resource: act.resource, action: act.action });
        }
      }
    }
  }
  return [...pairs.values()];
}

/** Union of explicit permissions and the read defaults for every granted page. */
export function withPageDefaultPermissions<T extends CapabilityPair>(
  permissions: T[],
  pageSlugs: readonly string[],
): CapabilityPair[] {
  const merged = new Map<string, CapabilityPair>();
  for (const p of permissions) merged.set(capabilityKey(p.resource, p.action), { resource: p.resource, action: p.action });
  for (const slug of pageSlugs) {
    for (const p of getPageDefaultPermissions(slug)) merged.set(capabilityKey(p.resource, p.action), p);
  }
  return [...merged.values()];
}
