import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FC,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Route-gated data scopes — cuts mount-time fan-out from always-on providers.
 * Once a scope activates in a session it stays warm (sticky) so navigating
 * between related pages does not thrash enable/disable.
 */
export type DataScopeId =
  | 'archive'
  | 'budget'
  | 'downPayment'
  | 'costs'
  | 'audit'
  | 'mmp'
  | 'siteVisit'
  | 'project'
  | 'wallet'
  | 'superAdmin';

type ScopeRule = {
  scope: DataScopeId;
  /** Pathname prefixes that activate this scope. */
  prefixes: string[];
  /** Paths that match a prefix but should not activate this scope. */
  exclude?: (pathname: string) => boolean;
};

const SCOPE_RULES: ScopeRule[] = [
  {
    scope: 'archive',
    prefixes: ['/archive', '/analytics'],
  },
  {
    scope: 'budget',
    prefixes: [
      '/budget',
      '/finance-hub',
      '/projects',
      '/mmp',
      '/dashboard',
      '/accounting',
      '/accounting-finance',
    ],
  },
  {
    scope: 'downPayment',
    prefixes: [
      '/wallet',
      '/down-payment',
      '/down-payment-approval',
      '/cycle-exceptions',
      '/pre-funding',
      '/finance-hub',
      '/cost-submission',
      '/cost-approval',
      '/mmp',
      '/site-visit',
      '/site-visits',
      '/coordinator',
      '/supervisor',
      '/field',
      '/field-ops',
      '/field-team',
    ],
  },
  {
    scope: 'costs',
    prefixes: [
      '/cost-submission',
      '/cost-approval',
      '/finance-hub',
      '/wallet',
      '/supervisor',
      '/accounting',
    ],
  },
  {
    scope: 'audit',
    prefixes: [
      '/audit',
      '/audit-compliance',
      '/audit-logs',
      '/admin-hub',
      '/super-admin-hub',
      '/compliance',
    ],
  },
  {
    scope: 'mmp',
    prefixes: [
      '/mmp',
      '/mmp-management',
      '/dashboard',
      '/projects',
      '/coordinator',
      '/coordinator-dashboard',
      '/supervisor',
      '/supervisor-approvals',
      '/field',
      '/field-ops',
      '/field-team',
      '/site-visits',
      '/site-visit',
      '/finance-hub',
      '/cost-submission',
      '/cost-approval',
      '/wallet',
      '/down-payment',
      '/archive',
    ],
    // Create/edit forms don't need the full MMP dump — skip until sticky from elsewhere
    exclude: (pathname) => {
      const path = pathname.toLowerCase();
      return (
        path === '/projects/create' ||
        path.startsWith('/projects/create/') ||
        /^\/projects\/[^/]+\/edit\/?$/.test(path)
      );
    },
  },
  {
    scope: 'siteVisit',
    prefixes: [
      '/site-visits',
      '/site-visit',
      '/dashboard',
      '/mmp',
      '/coordinator',
      '/coordinator-dashboard',
      '/supervisor',
      '/supervisor-approvals',
      '/field',
      '/field-ops',
      '/field-team',
      '/projects',
      '/wallet',
      '/cost-submission',
    ],
    exclude: (pathname) => {
      const path = pathname.toLowerCase();
      return (
        path === '/projects/create' ||
        path.startsWith('/projects/create/') ||
        /^\/projects\/[^/]+\/edit\/?$/.test(path)
      );
    },
  },
  {
    scope: 'project',
    prefixes: [
      '/projects',
      '/project-updates',
      '/portfolio',
      '/dashboard',
      '/mmp',
      '/tasks',
      '/my-projects',
    ],
  },
  {
    scope: 'wallet',
    prefixes: [
      '/wallet',
      '/wallet-reports',
      '/admin/wallets',
      '/finance-hub',
      '/finance',
      '/finance-approval',
      '/withdrawal',
      '/withdrawal-approval',
      '/payroll',
      '/field-payments',
      '/down-payment',
      '/pre-funding',
      '/site-visit',
      '/site-visits',
    ],
  },
  {
    scope: 'superAdmin',
    prefixes: [
      '/super-admin',
      '/super-admin-data',
      '/super-admin-hub',
      '/super-admin-management',
      '/admin-hub',
      '/admin',
      '/audit',
      '/data-management',
      '/role-management',
    ],
  },
];

function pathMatches(pathname: string, prefixes: string[]): boolean {
  const path = pathname.toLowerCase();
  return prefixes.some((prefix) => {
    const p = prefix.toLowerCase();
    return path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`);
  });
}

function scopesForPath(pathname: string): Set<DataScopeId> {
  const active = new Set<DataScopeId>();
  for (const rule of SCOPE_RULES) {
    if (rule.exclude?.(pathname)) continue;
    if (pathMatches(pathname, rule.prefixes)) active.add(rule.scope);
  }
  return active;
}

type DataScopeContextValue = {
  /** True if this scope is active for the current route or was visited this session. */
  isScopeActive: (scope: DataScopeId) => boolean;
  activeScopes: ReadonlySet<DataScopeId>;
};

const DataScopeContext = createContext<DataScopeContextValue | undefined>(undefined);

export const DataScopeProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  const [sticky, setSticky] = useState<Set<DataScopeId>>(() => new Set());

  useEffect(() => {
    const fromRoute = scopesForPath(pathname);
    if (fromRoute.size === 0) return;
    setSticky((prev) => {
      let changed = false;
      const next = new Set(prev);
      fromRoute.forEach((s) => {
        // Site visits is the app's largest payload. Keep it route-scoped so
        // its query and Realtime channel are released after leaving field UI.
        if (s === 'siteVisit' || s === 'project' || s === 'wallet' || s === 'superAdmin') return;
        if (!next.has(s)) {
          next.add(s);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [pathname]);

  const activeScopes = useMemo(() => {
    const merged = new Set(sticky);
    scopesForPath(pathname).forEach((s) => merged.add(s));
    return merged;
  }, [sticky, pathname]);

  const value = useMemo<DataScopeContextValue>(
    () => ({
      activeScopes,
      isScopeActive: (scope) => activeScopes.has(scope),
    }),
    [activeScopes]
  );

  return (
    <DataScopeContext.Provider value={value}>{children}</DataScopeContext.Provider>
  );
};

/** Safe outside provider: treats all scopes as active (dev/tests). */
export function useDataScope(): DataScopeContextValue {
  const ctx = useContext(DataScopeContext);
  if (!ctx) {
    return {
      activeScopes: new Set<DataScopeId>([
        'archive',
        'budget',
        'downPayment',
        'costs',
        'audit',
        'mmp',
        'siteVisit',
        'project',
        'wallet',
        'superAdmin',
      ]),
      isScopeActive: () => true,
    };
  }
  return ctx;
}

export function useIsDataScopeActive(scope: DataScopeId): boolean {
  return useDataScope().isScopeActive(scope);
}
