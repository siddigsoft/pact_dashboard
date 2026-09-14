import type { ActionType, ResourceType } from '@/types/roles';

export interface ReportDestinationAction {
  resource: ResourceType;
  action: ActionType;
}

export interface ReportDestinationPermission {
  read: ReportDestinationAction;
  /**
   * Whether the destination has a report export action.  This is separate
   * from `read`: a user may be allowed to open a report without being allowed
   * to download it.
   */
  export?: ReportDestinationAction;
}

const read = (resource: ResourceType): ReportDestinationAction => ({
  resource,
  action: 'read',
});

const readableAndExportable = (resource: ResourceType): ReportDestinationPermission => ({
  read: read(resource),
  export: { resource, action: 'export' },
});

/**
 * Canonical destination → resource/action map for ReportsDirectory.
 *
 * Keep this module independent of React components.  ReportsDirectory uses it
 * to decide card visibility and export affordances, while page-roles uses it
 * to protect direct links.  Every destination in ReportsDirectory is listed
 * explicitly, including query-tab destinations and the internal HR summary
 * tab.
 */
export const REPORTS_DIRECTORY_PERMISSION_MAP: Readonly<
  Record<string, ReportDestinationPermission>
> = {
  '/accounting?tab=coa': readableAndExportable('accounting'),
  '/accounting?tab=journals': readableAndExportable('accounting'),
  '/accounting?tab=trial-balance': readableAndExportable('accounting'),
  '/accounting?tab=ledger': readableAndExportable('accounting'),
  '/accounting?tab=reports': readableAndExportable('accounting'),
  '/accounting?tab=cash-flow': readableAndExportable('accounting'),
  '/accounting?tab=cash-flow-forecast': readableAndExportable('finances'),
  '/accounting?tab=budget-variance': readableAndExportable('finances'),
  '/accounting?tab=budget-planning': readableAndExportable('finances'),
  '/accounting?tab=budget-encumbrance': readableAndExportable('finances'),
  '/accounting?tab=grants': readableAndExportable('accounting'),
  '/accounting?tab=donor-reports': readableAndExportable('accounting'),
  '/accounting?tab=cost-allocation': readableAndExportable('accounting'),
  '/accounting?tab=fixed-assets': readableAndExportable('fixed_assets'),
  '/accounting?tab=depreciation-run': readableAndExportable('fixed_assets'),
  '/accounting?tab=bank-recon': readableAndExportable('accounting'),
  '/accounting?tab=ap-aging': readableAndExportable('procurement'),
  '/accounting?tab=cheque-register': readableAndExportable('procurement'),
  '/accounting?tab=purchase-requisitions': readableAndExportable('procurement'),
  '/accounting?tab=vendors': readableAndExportable('procurement'),
  '/accounting?tab=tax': readableAndExportable('accounting'),
  '/accounting?tab=multi-currency': readableAndExportable('accounting'),
  '/accounting?tab=sod': readableAndExportable('accounting'),
  '/accounting?tab=aml': readableAndExportable('accounting'),
  '/accounting?tab=gl-audit': readableAndExportable('accounting'),
  '/accounting?tab=finance-audit-trail': readableAndExportable('accounting'),
  '/accounting?tab=consolidation': readableAndExportable('accounting'),
  '/accounting?tab=period-close': readableAndExportable('accounting'),

  '/finance-hub?tab=month-end': readableAndExportable('finances'),
  '/finance-hub?tab=wallet-reports': readableAndExportable('wallets'),
  '/finance-hub?tab=advance-report': readableAndExportable('down_payments'),
  '/finance-hub?tab=salary-retainer': readableAndExportable('payroll'),
  '/finance-hub?tab=enumerator-fees': readableAndExportable('finances'),
  '/finance-hub?tab=exchange-rates': readableAndExportable('accounting'),
  '/finance-hub?tab=cost-predictions': readableAndExportable('analytics'),

  '/mmp': readableAndExportable('mmp'),
  '/programme-hub?tab=hub-ops': readableAndExportable('hub_operations'),
  '/programme-hub?tab=analytics': readableAndExportable('analytics'),
  '/programme-hub?tab=portfolio': readableAndExportable('portfolio'),
  '/analytics?tab=questionnaire-analytics': readableAndExportable('surveys'),
  '/analytics?tab=dct-pdm': readableAndExportable('analytics'),
  '/communication-hub?tab=whatsapp': {
    read: read('whatsapp'),
  },
  '/notification-analytics': readableAndExportable('notifications'),
  '/analytics?tab=reports': readableAndExportable('reports'),
  '/login-analytics': readableAndExportable('audit_logs'),
  '/team-tasks': readableAndExportable('tasks'),
  '/analytics?tab=data-export-center': readableAndExportable('reports'),
  '/crm': {
    read: read('crm'),
  },

  '/hr?tab=payroll': readableAndExportable('payroll'),
  '/hr?tab=payroll-admin': readableAndExportable('payroll'),
  '/hr?tab=payroll-summary': readableAndExportable('payroll'),
  '/hr?tab=retainer': readableAndExportable('payroll'),
  '/hr?tab=eosb': readableAndExportable('hr'),
  '/hr?tab=salary-advances': readableAndExportable('hr'),
  '/hr?tab=salary-increments': {
    read: read('payroll'),
    export: { resource: 'payroll', action: 'export' },
  },
  '/hr?tab=attendance': {
    read: read('hr'),
    export: { resource: 'hr', action: 'export' },
  },
  '/hr?tab=leave-requests': readableAndExportable('leave'),
  '/hr?tab=leave-calendar': readableAndExportable('leave'),
  '/hr?tab=org-chart': readableAndExportable('hr'),
  '/hr?tab=headcount': readableAndExportable('hr'),
  '/hr?tab=positions': readableAndExportable('hr'),
  '/hr?tab=performance': readableAndExportable('hr_analytics'),
  '/hr?tab=training': readableAndExportable('hr'),
  '/hr?tab=benefits': readableAndExportable('benefits'),
  '/hr?tab=recruitment': readableAndExportable('hr'),
  '/hr?tab=disciplinary': readableAndExportable('hr'),
  '/hr?tab=onboarding': readableAndExportable('hr'),
  '/hr?tab=offboarding': readableAndExportable('hr'),
  '/hr?tab=hr-analytics': readableAndExportable('hr_analytics'),
  '/my-team': readableAndExportable('hr'),
  '#hr_summary': {
    read: read('hr'),
  },
};

export const REPORTS_DIRECTORY_DESTINATIONS = Object.keys(
  REPORTS_DIRECTORY_PERMISSION_MAP,
);

function normalizePathname(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

interface RouteParts {
  pathname: string;
  search: string;
  hash: string;
}

/**
 * Split a route without relying on the order of its query parameters.  The
 * directory map intentionally only registers `tab` for nested destinations;
 * all other query parameters are ignored when finding that exact tab row.
 */
function parseRouteParts(pathname: string, search = '', hash = ''): RouteParts {
  let routePath = pathname;
  let routeSearch = search;
  let routeHash = hash;

  const hashIndex = routePath.indexOf('#');
  if (hashIndex >= 0) {
    routeHash = routePath.slice(hashIndex);
    routePath = routePath.slice(0, hashIndex);
  }

  const queryIndex = routePath.indexOf('?');
  if (queryIndex >= 0) {
    routeSearch = routePath.slice(queryIndex + 1);
    routePath = routePath.slice(0, queryIndex);
  }

  return {
    pathname: normalizePathname(routePath),
    search: routeSearch.replace(/^\?/, ''),
    hash: routeHash ? (routeHash.startsWith('#') ? routeHash : `#${routeHash}`) : '',
  };
}

function canonicalDestinationForRoute(
  pathname: string,
  search = '',
  hash = '',
): string | null {
  const parts = parseRouteParts(pathname, search, hash);

  const params = new URLSearchParams(parts.search);
  const tab = params.get('tab');
  if (tab !== null) {
    // Having a tab means this must resolve to a registered tab destination.
    // In particular, an unknown tab must not fall back to a parent page.
    for (const destination of REPORTS_DIRECTORY_DESTINATIONS) {
      const separator = destination.indexOf('?');
      if (separator < 0) continue;
      const canonicalPath = destination.slice(0, separator);
      const canonicalTab = new URLSearchParams(destination.slice(separator + 1)).get('tab');
      if (canonicalPath === parts.pathname && canonicalTab === tab) {
        return destination;
      }
    }
    return null;
  }

  // Hash destinations are currently used for the internal HR summary card.
  // A registered hash wins only when there is no tab; this prevents an
  // unrelated hash from changing the permission for a selected tab.
  if (parts.hash && Object.prototype.hasOwnProperty.call(
    REPORTS_DIRECTORY_PERMISSION_MAP,
    parts.hash,
  )) {
    return parts.hash;
  }

  // Query parameters unrelated to directory tab selection do not change a
  // path-only destination (for example, /mmp?cycle=... remains /mmp).
  return REPORTS_DIRECTORY_DESTINATIONS.find(destination =>
    !destination.includes('?') && destination === parts.pathname
  ) ?? null;
}

/**
 * Resolve one of the canonical directory entries to the requested action.
 * Unknown destinations deliberately return null; callers must not silently
 * turn an unregistered directory card into generic Reports access.
 */
export function resolveReportsDirectoryAction(
  destination: string,
  action: 'read' | 'export' = 'read',
): ReportDestinationAction | null {
  const canonicalDestination = canonicalDestinationForRoute(destination);
  const permission = canonicalDestination
    ? REPORTS_DIRECTORY_PERMISSION_MAP[canonicalDestination]
    : undefined;
  if (!permission) return null;
  return action === 'export' ? permission.export ?? null : permission.read;
}

/**
 * Resolve a browser pathname/search/hash tuple to the exact registered
 * destination.  Query order and unrelated parameters are ignored, while an
 * unknown tab cannot inherit the parent hub's access.
 */
export function resolveReportsDirectoryRoutePermission(
  pathname: string,
  search = '',
  hash = '',
): ReportDestinationAction | null {
  const canonicalDestination = canonicalDestinationForRoute(pathname, search, hash);
  if (!canonicalDestination) return null;
  const permission = REPORTS_DIRECTORY_PERMISSION_MAP[canonicalDestination];
  return permission?.read ?? null;
}