import { describe, expect, it } from 'vitest';
import { resolveSlug } from '@/lib/page-roles';
import { PAGE_DEFS } from '@/pages/PageAccessControl';
import { PAGE_ACCESS_REDIRECTS } from '@/lib/pageAccessRedirects';
import {
  buildPageRelatedGraph,
  expandRelatedPageSlugs,
  getRelatedPageSlugs,
  PAGE_RELATED,
  resolvePageToggleIntent,
} from '@/lib/pageAccessLinks';

const byPath = Object.fromEntries(PAGE_DEFS.map((p) => [p.path, p.slug]));
const bySlug = Object.fromEntries(PAGE_DEFS.map((p) => [p.slug, p]));

function hubPathOf(path: string): string {
  return path.split('?')[0].split('#')[0];
}

describe('project route slug wiring', () => {
  it('resolves project list and detail URLs to the projects page slug', () => {
    expect(resolveSlug('/projects')).toBe('projects');
    expect(resolveSlug('/projects/660399f4-80a2-4642-8f66-9f1f245775e6')).toBe('projects');
    expect(resolveSlug('/projects/660399f4-80a2-4642-8f66-9f1f245775e6/edit')).toBe('projects');
    expect(resolveSlug('/projects/660399f4-80a2-4642-8f66-9f1f245775e6/team')).toBe('projects');
  });

  it('keeps My Projects as its own list entry slug', () => {
    expect(resolveSlug('/my-projects')).toBe('my-projects');
  });
});

describe('related page access families', () => {
  it('links My Projects with Projects so grants stay in sync', () => {
    expect(getRelatedPageSlugs('my-projects')).toContain('projects');
    expect(getRelatedPageSlugs('projects')).toContain('my-projects');
    expect(expandRelatedPageSlugs('my-projects')).toEqual(
      expect.arrayContaining(['my-projects', 'projects']),
    );
  });

  it('links Approval Dashboard with the Super Admin hub tab it redirects to', () => {
    expect(resolveSlug('/approval-dashboard')).toBe('approval-dashboard');
    expect(resolveSlug('/super-admin-hub?tab=approval-dashboard')).toBe('sa-approval-dashboard');
    expect(expandRelatedPageSlugs('approval-dashboard')).toEqual(
      expect.arrayContaining(['approval-dashboard', 'sa-approval-dashboard', 'super-admin-hub']),
    );
  });

  it('returns only the primary slug when no family is configured', () => {
    // dashboard has no redirects / query-tab parent in PAGE_DEFS
    const related = getRelatedPageSlugs('dashboard');
    expect(Array.isArray(related)).toBe(true);
  });

  it('maps UI button effects to a cascade intent', () => {
    expect(resolvePageToggleIntent('role-no')).toBe('grant');
    expect(resolvePageToggleIntent('role-yes')).toBe('block');
    expect(resolvePageToggleIntent('granted')).toBe('clear');
    expect(resolvePageToggleIntent('blocked')).toBe('clear');
    expect(resolvePageToggleIntent('superadmin')).toBe('noop');
  });

  it('collects the action gate that keeps MMP looking permanently granted', async () => {
    const { getPageRoutePermissions, expandRelatedPageSlugs: expand } = await import('@/lib/pageAccessLinks');
    expect(getPageRoutePermissions(expand('mmp'))).toEqual(
      expect.arrayContaining([{ resource: 'mmp', action: 'read' }]),
    );
  });

  it('only links slugs that exist in PAGE_DEFS', () => {
    const registered = new Set(PAGE_DEFS.map((p) => p.slug));
    for (const [primary, related] of Object.entries(PAGE_RELATED)) {
      expect(registered.has(primary)).toBe(true);
      for (const slug of related) {
        expect(registered.has(slug)).toBe(true);
      }
    }
  });

  it('keeps PAGE_RELATED bidirectional', () => {
    for (const [primary, related] of Object.entries(PAGE_RELATED)) {
      for (const other of related) {
        expect(getRelatedPageSlugs(other)).toContain(primary);
      }
    }
  });
});

describe('exhaustive page access redirect coverage', () => {
  it('loads the extracted App.tsx redirect table', () => {
    expect(PAGE_ACCESS_REDIRECTS.length).toBeGreaterThan(50);
  });

  it('cascades every PAGE_DEFS source redirect to its destination hub and/or page', () => {
    const missing: string[] = [];

    for (const { fromPath, toPath } of PAGE_ACCESS_REDIRECTS) {
      const fromSlug = byPath[fromPath];
      if (!fromSlug) continue;

      const expanded = new Set(expandRelatedPageSlugs(fromSlug));
      const toSlug = byPath[toPath];
      const toHubSlug = byPath[hubPathOf(toPath)];

      if (toSlug && !expanded.has(toSlug)) {
        missing.push(`${fromSlug} missing link to destination page ${toSlug} (${toPath})`);
      }
      if (toHubSlug && !expanded.has(toHubSlug)) {
        missing.push(`${fromSlug} missing link to destination hub ${toHubSlug} (${hubPathOf(toPath)})`);
      }
      if (!toSlug && !toHubSlug) {
        // Destination is not a known page or hub — still require at least self
        expect(expanded.has(fromSlug)).toBe(true);
      }
    }

    expect(missing).toEqual([]);
  });

  it('links every query-tab PAGE_DEF to its hub parent', () => {
    const missing: string[] = [];
    for (const page of PAGE_DEFS) {
      if (!page.path.includes('?') && !page.path.includes('#')) continue;
      const hubSlug = byPath[hubPathOf(page.path)];
      if (!hubSlug) {
        missing.push(`${page.slug} hub path ${hubPathOf(page.path)} has no PAGE_DEF`);
        continue;
      }
      if (!expandRelatedPageSlugs(page.slug).includes(hubSlug)) {
        missing.push(`${page.slug} not linked to hub ${hubSlug}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('resolves destination URLs for linked redirect pairs that have PAGE_DEFS', () => {
    const checked: string[] = [];
    for (const { fromPath, toPath } of PAGE_ACCESS_REDIRECTS) {
      if (!byPath[fromPath] || !byPath[toPath]) continue;
      expect(resolveSlug(fromPath)).toBe(byPath[fromPath]);
      expect(resolveSlug(toPath)).toBe(byPath[toPath]);
      checked.push(`${fromPath}→${toPath}`);
    }
    // approval-dashboard, payroll, audit-logs, daily-work, etc.
    expect(checked.length).toBeGreaterThan(0);
  });

  it('rebuilds the same graph deterministically', () => {
    expect(buildPageRelatedGraph()).toEqual(PAGE_RELATED);
  });

  it('covers high-risk legacy pages that previously confused admins', () => {
    const expectations: Array<{ slug: string; mustInclude: string[] }> = [
      { slug: 'my-projects', mustInclude: ['projects'] },
      { slug: 'projects', mustInclude: ['my-projects'] },
      { slug: 'approval-dashboard', mustInclude: ['sa-approval-dashboard', 'super-admin-hub'] },
      { slug: 'chat', mustInclude: ['communication-hub'] },
      { slug: 'portfolio', mustInclude: ['programme-hub'] },
      { slug: 'users', mustInclude: ['admin-hub'] },
      { slug: 'role-management', mustInclude: ['admin-hub'] },
      { slug: 'safety-hub', mustInclude: ['field-ops'] },
      { slug: 'equipment', mustInclude: ['field-ops'] },
      { slug: 'wallet-reports', mustInclude: ['finance-hub'] },
      { slug: 'payroll', mustInclude: ['hr-hub'] },
      { slug: 'audit-logs', mustInclude: ['sa-audit-logs', 'super-admin-hub'] },
      { slug: 'sa-approval-dashboard', mustInclude: ['super-admin-hub'] },
      { slug: 'finance-subscriptions', mustInclude: ['finance-hub'] },
      { slug: 'accounting-coa', mustInclude: ['accounting-hub'] },
    ];

    for (const { slug, mustInclude } of expectations) {
      expect(bySlug[slug], `missing PAGE_DEF ${slug}`).toBeTruthy();
      const expanded = expandRelatedPageSlugs(slug);
      for (const required of mustInclude) {
        expect(expanded, `${slug} should link ${required}`).toContain(required);
      }
    }
  });
});
