/**
 * Guards ConnectedPagesBar quick-link URLs against the known App.tsx route table.
 * Prevents regressions like /accounting-hub or /hr-hub?tab=payslips.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CONNECTED_QUICK_LINKS } from '@/components/ui/connected-pages-bar';

/** Pathname prefixes that must exist as Route path= entries (or known redirects) in App.tsx */
const CANONICAL_ROUTE_PATHS = new Set([
  '/projects',
  '/programme-hub',
  '/my-tasks',
  '/admin-hub',
  '/hr',
  '/dashboard',
  '/mmp',
  '/field-ops',
  '/analytics',
  '/finance-hub',
  '/accounting',
  '/communication-hub',
]);

/** Explicit id → url contract from the IA P0 fix */
const EXPECTED_URLS: Record<string, string> = {
  projects: '/projects',
  analytics: '/programme-hub?tab=analytics',
  portfolio: '/programme-hub?tab=portfolio',
  'my-tasks': '/my-tasks',
  departments: '/admin-hub?tab=departments',
  hr: '/hr?tab=payroll',
  users: '/admin-hub?tab=users',
  'role-management': '/admin-hub?tab=role-management',
  settings: '/admin-hub?tab=settings',
  dashboard: '/dashboard',
  mmp: '/mmp',
  'field-ops': '/field-ops',
  reports: '/analytics?tab=reports',
  finance: '/finance-hub',
  accounting: '/accounting',
  communication: '/communication-hub',
  'analytics-hub': '/analytics',
  admin: '/admin-hub',
};

function extractAppRoutePaths(): Set<string> {
  const appSrc = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
  const paths = new Set<string>();
  for (const match of appSrc.matchAll(/path=["']([^"']+)["']/g)) {
    paths.add(match[1]);
  }
  return paths;
}

describe('ConnectedPagesBar quick links', () => {
  it('uses the canonical hub URLs from the IA P0 contract', () => {
    const byId = Object.fromEntries(CONNECTED_QUICK_LINKS.map((p) => [p.id, p.url]));
    for (const [id, url] of Object.entries(EXPECTED_URLS)) {
      expect(byId[id], `quick link "${id}"`).toBe(url);
    }
  });

  it('does not use known-broken hub aliases', () => {
    const banned = ['/accounting-hub', '/field-ops-hub', '/analytics-hub', '/hr-hub'];
    for (const link of CONNECTED_QUICK_LINKS) {
      for (const bad of banned) {
        expect(link.url.startsWith(bad), `${link.id} → ${link.url}`).toBe(false);
      }
    }
  });

  it('every quick-link pathname exists in App.tsx routes', () => {
    const appPaths = extractAppRoutePaths();
    for (const link of CONNECTED_QUICK_LINKS) {
      const pathname = link.url.split('?')[0];
      expect(
        appPaths.has(pathname) || CANONICAL_ROUTE_PATHS.has(pathname),
        `${link.id} path "${pathname}" missing from App.tsx`,
      ).toBe(true);
    }
  });

  it('legacy misnamed hubs redirect in App.tsx', () => {
    const appPaths = extractAppRoutePaths();
    for (const legacy of ['/accounting-hub', '/field-ops-hub', '/analytics-hub', '/hr-hub']) {
      expect(appPaths.has(legacy), `missing redirect route ${legacy}`).toBe(true);
    }
  });
});
