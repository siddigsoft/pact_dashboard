import { afterEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import {
  canSeePage,
  canSeeRoutePermission,
  canSeePageWithOverrides,
  canSeePageWithOverridesResult,
  resolveResourcePermissionOverride,
  resolveRouteAccessTarget,
  resolveRoutePermission,
  resolveSlug,
} from '@/lib/page-roles';
import { getPageRegistryIssues, PAGE_DEFS } from '@/pages/PageAccessControl';
import {
  getReportPermission,
  REPORTS_DIRECTORY_PATHS,
} from '@/components/reports/ReportsDirectory';
import {
  REPORTS_DIRECTORY_PERMISSION_MAP,
  REPORTS_DIRECTORY_DESTINATIONS,
  resolveReportsDirectoryAction,
  resolveReportsDirectoryRoutePermission,
} from '@/lib/reports-directory-permissions';
import { supabase } from '@/integrations/supabase/client';

const mockedFrom = vi.mocked(supabase.from);
const QUERY_TAB_DESTINATIONS = REPORTS_DIRECTORY_PATHS.filter(destination =>
  destination.includes('?tab='),
);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('page access registry integrity', () => {
  it('keeps page slugs unique', () => {
    const slugs = PAGE_DEFS.map(page => page.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('keeps every access target and navigation group unambiguous', () => {
    expect(getPageRegistryIssues()).toEqual([]);
  });

  it('resolves query-tab page definitions without falling back to the hub', () => {
    expect(resolveSlug('/finance-hub?tab=subscriptions')).toBe('finance-subscriptions');
    expect(resolveSlug('/accounting?tab=bank-recon')).toBe('accounting-bank-recon');
  });

  it('resolves query-tab definitions when query parameters are reordered', () => {
    expect(resolveSlug('/finance-hub?source=sidebar&tab=subscriptions')).toBe('finance-subscriptions');
    expect(resolveSlug('/accounting?view=summary&tab=bank-recon')).toBe('accounting-bank-recon');
  });

  it('uses one registry target for page and action-protected routes', () => {
    expect(resolveRouteAccessTarget('/finance-hub', '?tab=wallet-reports')).toEqual({
      slug: 'finance-hub',
      routePermission: { resource: 'wallets', action: 'read' },
    });
    expect(resolveRouteAccessTarget('/mmp/abc123/full-report')).toEqual({
      slug: 'mmp-full-report',
      routePermission: { resource: 'mmp', action: 'export' },
    });
  });

  it('does not create a protected access target for an unregistered path', () => {
    expect(resolveRouteAccessTarget('/not-a-registered-page')).toBeNull();
  });

  it('grants a custom role only when that role is explicitly configured', () => {
    expect(canSeePage('finance-subscriptions', 'Procurement Lead')).toBe(false);
    expect(canSeePage('finance-subscriptions', 'Procurement Lead', ['Procurement Lead'])).toBe(true);
  });

  it('uses registered page slugs in every page-management override hook', () => {
    const registered = new Set(PAGE_DEFS.map(page => page.slug));
    const unknown = sourceFiles(join(process.cwd(), 'src')).flatMap(file => {
      const source = readFileSync(file, 'utf8');
      return Array.from(source.matchAll(/usePageManageOverride\(\s*['"]([^'"]+)['"]/g))
        .map(match => match[1])
        .filter(slug => !registered.has(slug))
        .map(slug => `${slug} (${file})`);
    });
    expect(unknown).toEqual([]);
  });
});

function mockOverrideQueries({
  actionOverride = null,
  pageOverride = null,
  actionError = null,
  pageError = null,
  actionThrows = false,
  pageThrows = false,
}: {
  actionOverride?: Record<string, unknown> | null;
  pageOverride?: Record<string, unknown> | null;
  actionError?: Record<string, unknown> | null;
  pageError?: Record<string, unknown> | null;
  actionThrows?: boolean;
  pageThrows?: boolean;
} = {}) {
  mockedFrom.mockImplementation(((table: string) => {
    const isActionOverride = table === 'user_permission_overrides';
    const isPageOverride = table === 'page_access_overrides';
    const response = isActionOverride
      ? { data: actionOverride, error: actionError }
      : isPageOverride
        ? { data: pageOverride, error: pageError }
        : { data: null, error: null };
    const query: Record<string, unknown> = {
      select: () => query,
      eq: () => query,
      maybeSingle: vi.fn(
        isActionOverride && actionThrows || isPageOverride && pageThrows
          ? () => Promise.reject(new Error('override lookup failed'))
          : () => Promise.resolve(response),
      ),
    };
    return query;
  }) as unknown as typeof supabase.from);
}

describe('direct report route permissions', () => {
  afterEach(() => {
    mockedFrom.mockReset();
  });

  it('resolves the MMP full report to the registry export permission', () => {
    expect(resolveRoutePermission('/mmp/abc123/full-report')).toEqual({
      resource: 'mmp',
      action: 'export',
    });
  });

  it('uses the report page read permission for direct report routes', () => {
    expect(resolveRoutePermission('/cost-submission/reports')).toEqual({
      resource: 'cost_submissions',
      action: 'read',
    });
    expect(resolveRoutePermission('/advance-requests-report')).toEqual({
      resource: 'down_payments',
      action: 'read',
    });
    expect(resolveRoutePermission('/finance-hub', '?tab=wallet-reports')).toEqual({
      resource: 'wallets',
      action: 'read',
    });
    expect(resolveRoutePermission('/analytics', '?tab=reports')).toEqual({
      resource: 'reports',
      action: 'read',
    });
    expect(resolveRoutePermission('/field-ops', '?tab=incident-reports')).toEqual({
      resource: 'incidents',
      action: 'read',
    });
    expect(resolveRoutePermission('/field-data/exports')).toEqual({
      resource: 'analytics',
      action: 'export',
    });
    expect(resolveRoutePermission('/field-data', '?tab=exports')).toEqual({
      resource: 'analytics',
      action: 'export',
    });
  });

  it('maps the Analytics reports directory card to the Reports registry resource', () => {
    expect(getReportPermission('/analytics?tab=reports')).toEqual({
      resource: 'reports',
      canExport: true,
    });
  });

  it('keeps every ReportsDirectory card in the canonical destination map', () => {
    expect([...REPORTS_DIRECTORY_DESTINATIONS].sort()).toEqual(
      [...REPORTS_DIRECTORY_PATHS].sort(),
    );
  });

  it.each(REPORTS_DIRECTORY_PATHS)(
    'uses the canonical read action for directory destination %s',
    (destination) => {
      const expected = REPORTS_DIRECTORY_PERMISSION_MAP[destination].read;
      expect(resolveReportsDirectoryAction(destination, 'read')).toEqual(expected);

      if (destination.startsWith('#')) return;
      const [pathname, query] = destination.split('?', 2);
      expect(resolveRoutePermission(pathname, query ? `?${query}` : '')).toEqual(expected);
    },
  );

  it.each(REPORTS_DIRECTORY_PATHS)(
    'honours explicit grant and block for directory destination %s',
    (destination) => {
      const requirement = resolveReportsDirectoryAction(destination, 'read');
      expect(requirement).not.toBeNull();
      expect(resolveResourcePermissionOverride(false, requirement!, [{
        ...requirement!,
        is_granted: true,
      }])).toBe(true);
      expect(resolveResourcePermissionOverride(true, requirement!, [{
        ...requirement!,
        is_granted: false,
      }])).toBe(false);
    },
  );

  it('keeps accounting and HR nested-wrapper destinations resource-specific', () => {
    expect(resolveRoutePermission('/accounting', '?tab=fixed-assets')).toEqual({
      resource: 'fixed_assets',
      action: 'read',
    });
    expect(resolveRoutePermission('/accounting', '?tab=purchase-requisitions')).toEqual({
      resource: 'procurement',
      action: 'read',
    });
    expect(resolveRoutePermission('/hr', '?tab=payroll-admin')).toEqual({
      resource: 'payroll',
      action: 'read',
    });
    expect(resolveRoutePermission('/hr', '?tab=performance')).toEqual({
      resource: 'hr_analytics',
      action: 'read',
    });
  });

  it('aligns representative procurement and finance export controls with directory routes', () => {
    const procurementExport = resolveReportsDirectoryAction('/accounting?tab=ap-aging', 'export');
    const financeDestinations = [
      '/accounting?tab=budget-variance',
      '/accounting?tab=budget-planning',
      '/accounting?tab=budget-encumbrance',
      '/accounting?tab=cash-flow-forecast',
    ] as const;
    const financeExports = financeDestinations.map(destination =>
      resolveReportsDirectoryAction(destination, 'export'),
    );
    const financeExport = financeExports[0];

    expect(procurementExport).toEqual({ resource: 'procurement', action: 'export' });
    expect(financeExports).toEqual(financeDestinations.map(() => ({
      resource: 'finances',
      action: 'export',
    })));

    // A user granted only the page's authoritative export permission is allowed.
    expect(resolveResourcePermissionOverride(false, procurementExport!, [{
      ...procurementExport!,
      is_granted: true,
    }])).toBe(true);
    expect(resolveResourcePermissionOverride(false, financeExport!, [{
      ...financeExport!,
      is_granted: true,
    }])).toBe(true);

    // A grant for the neighboring resource must not satisfy the report control.
    expect(resolveResourcePermissionOverride(false, procurementExport!, [{
      resource: 'accounting',
      action: 'export',
      is_granted: true,
    }])).toBe(false);
    expect(resolveResourcePermissionOverride(false, financeExport!, [{
      resource: 'accounting',
      action: 'export',
      is_granted: true,
    }])).toBe(false);
  });

  it.each(QUERY_TAB_DESTINATIONS)(
    'normalizes reordered and extra query parameters to every canonical tab destination %s',
    (canonical) => {
      const [pathname, canonicalQuery] = canonical.split('?', 2);
      const tab = new URLSearchParams(canonicalQuery).get('tab');
      const search = `?source=directory&tab=${encodeURIComponent(tab ?? '')}&view=summary`;
      const expected = REPORTS_DIRECTORY_PERMISSION_MAP[canonical];
      expect(resolveReportsDirectoryRoutePermission(pathname, search)).toEqual(expected.read);
      expect(resolveRoutePermission(pathname, search)).toEqual(expected.read);
      expect(resolveReportsDirectoryAction(`${pathname}${search}`, 'read')).toEqual(expected.read);
      expect(resolveReportsDirectoryAction(`${pathname}${search}`, 'export')).toEqual(
        expected.export ?? null,
      );
    },
  );

  it('resolves the canonical internal HR hash destination', () => {
    expect(resolveReportsDirectoryRoutePermission('/hr', '', '#hr_summary')).toEqual({
      resource: 'hr',
      action: 'read',
    });
    expect(resolveRoutePermission('/hr', '', '#hr_summary')).toEqual({
      resource: 'hr',
      action: 'read',
    });
    expect(resolveRoutePermission('/hr', '?tab=performance', '#hr_summary')).toEqual({
      resource: 'hr_analytics',
      action: 'read',
    });
  });

  it('allows a granted resource/action override on a role-blocked route', () => {
    const requirement = resolveRoutePermission('/mmp/abc123/full-report');
    expect(requirement).not.toBeNull();
    expect(canSeeRoutePermission(requirement!, 'dataCollector')).toBe(false);
    expect(resolveResourcePermissionOverride(false, requirement!, [{
      resource: 'mmp',
      action: 'export',
      is_granted: true,
    }])).toBe(true);
  });

  it('blocks a role-allowed route when its resource/action is blocked', () => {
    const requirement = resolveRoutePermission('/mmp/abc123/full-report');
    expect(requirement).not.toBeNull();
    expect(canSeeRoutePermission(requirement!, 'supervisor')).toBe(true);
    expect(resolveResourcePermissionOverride(true, requirement!, [{
      resource: 'mmp',
      action: 'export',
      is_granted: false,
    }])).toBe(false);
  });

  it('does not let a role default override an explicit action block', async () => {
    mockOverrideQueries({
      actionOverride: {
        resource: 'mmp',
        action: 'export',
        is_granted: false,
        expires_at: null,
      },
    });
    const requirement = resolveRoutePermission('/mmp/abc123/full-report');

    await expect(canSeePageWithOverrides(
      'mmp-full-report',
      'supervisor',
      'user-1',
      requirement!,
      true,
    )).resolves.toBe(false);
  });

  it('denies a role-allowed action route when the action override lookup returns an error', async () => {
    mockOverrideQueries({ actionError: { message: 'permission lookup failed' } });
    const requirement = resolveRoutePermission('/mmp/abc123/full-report');

    await expect(canSeePageWithOverridesResult(
      'mmp-full-report',
      'supervisor',
      'user-1',
      requirement!,
      true,
    )).resolves.toEqual({
      allowed: false,
      error: { type: 'override_lookup_failed', source: 'action' },
    });
  });

  it('denies a role-allowed action route when the action lookup throws', async () => {
    mockOverrideQueries({ actionThrows: true });
    const requirement = resolveRoutePermission('/mmp/abc123/full-report');

    await expect(canSeePageWithOverrides(
      'mmp-full-report',
      'supervisor',
      'user-1',
      requirement!,
      true,
    )).resolves.toBe(false);
  });

  it('denies a role-allowed action route when the page override lookup returns an error', async () => {
    mockOverrideQueries({ pageError: { message: 'page lookup failed' } });
    const requirement = resolveRoutePermission('/mmp/abc123/full-report');

    await expect(canSeePageWithOverridesResult(
      'mmp-full-report',
      'supervisor',
      'user-1',
      requirement!,
      true,
    )).resolves.toEqual({
      allowed: false,
      error: { type: 'override_lookup_failed', source: 'page' },
    });
  });

  it('continues the role baseline when both override lookups successfully return no rows', async () => {
    mockOverrideQueries();
    const requirement = resolveRoutePermission('/mmp/abc123/full-report');

    await expect(canSeePageWithOverridesResult(
      'mmp-full-report',
      'supervisor',
      'user-1',
      requirement!,
      true,
    )).resolves.toEqual({ allowed: true });
  });

  it('preserves an explicit action grant for a role-blocked report route', async () => {
    mockOverrideQueries({
      actionOverride: {
        resource: 'mmp',
        action: 'export',
        is_granted: true,
        expires_at: null,
      },
    });
    const requirement = resolveRoutePermission('/mmp/abc123/full-report');

    await expect(canSeePageWithOverrides(
      'mmp-full-report',
      'dataCollector',
      'user-1',
      requirement!,
      false,
    )).resolves.toBe(true);
  });

  it('preserves an explicit pre-funding read grant for the report tab', async () => {
    mockOverrideQueries({
      actionOverride: {
        resource: 'pre_funding',
        action: 'read',
        is_granted: true,
        expires_at: null,
      },
    });
    const requirement = resolveRoutePermission('/pre-funding', '?tab=report');

    expect(requirement).toEqual({
      resource: 'pre_funding',
      action: 'read',
    });
    await expect(canSeePageWithOverrides(
      'pre-funding',
      'dataCollector',
      'user-1',
      requirement!,
      false,
    )).resolves.toBe(true);
  });

  it('keeps an explicit pre-funding read block authoritative over the role baseline', async () => {
    mockOverrideQueries({
      actionOverride: {
        resource: 'pre_funding',
        action: 'read',
        is_granted: false,
        expires_at: null,
      },
    });
    const requirement = resolveRoutePermission('/pre-funding', '?tab=report');

    await expect(canSeePageWithOverrides(
      'pre-funding',
      'countryDirector',
      'user-1',
      requirement!,
      true,
    )).resolves.toBe(false);
  });

  it('ignores expired action overrides and retains page override semantics', async () => {
    mockOverrideQueries({
      actionOverride: {
        resource: 'mmp',
        action: 'export',
        is_granted: false,
        expires_at: '2000-01-01T00:00:00.000Z',
      },
      pageOverride: { is_blocked: true },
    });
    const requirement = resolveRoutePermission('/mmp/abc123/full-report');

    // The expired action block is ignored, then the explicit page block still
    // applies.  This protects both override layers from accidental fallback.
    await expect(canSeePageWithOverrides(
      'mmp-full-report',
      'supervisor',
      'user-1',
      requirement!,
      true,
    )).resolves.toBe(false);
  });
});
