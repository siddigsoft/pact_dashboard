import { describe, expect, it } from 'vitest';
import { resolveSlug } from '@/lib/page-roles';
import {
  expandRelatedPageSlugs,
  getRelatedPageSlugs,
  resolvePageToggleIntent,
} from '@/lib/pageAccessLinks';

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
    expect(getRelatedPageSlugs('my-projects').sort()).toEqual(['projects']);
    expect(getRelatedPageSlugs('projects').sort()).toEqual(['my-projects']);
    expect(expandRelatedPageSlugs('my-projects').sort()).toEqual(['my-projects', 'projects']);
    expect(expandRelatedPageSlugs('projects').sort()).toEqual(['my-projects', 'projects']);
  });

  it('links Approval Dashboard with the Super Admin hub tab it redirects to', () => {
    expect(resolveSlug('/approval-dashboard')).toBe('approval-dashboard');
    expect(resolveSlug('/super-admin-hub?tab=approval-dashboard')).toBe('sa-approval-dashboard');
    expect(expandRelatedPageSlugs('approval-dashboard').sort()).toEqual([
      'approval-dashboard',
      'sa-approval-dashboard',
      'super-admin-hub',
    ]);
    expect(expandRelatedPageSlugs('sa-approval-dashboard').sort()).toEqual([
      'approval-dashboard',
      'sa-approval-dashboard',
      'super-admin-hub',
    ]);
  });

  it('maps UI button effects to a cascade intent', () => {
    expect(resolvePageToggleIntent('role-no')).toBe('grant');
    expect(resolvePageToggleIntent('role-yes')).toBe('block');
    expect(resolvePageToggleIntent('granted')).toBe('clear');
    expect(resolvePageToggleIntent('blocked')).toBe('clear');
    expect(resolvePageToggleIntent('superadmin')).toBe('noop');
  });

  it('only links slugs that exist in PAGE_DEFS', async () => {
    const { PAGE_DEFS } = await import('@/pages/PageAccessControl');
    const { PAGE_RELATED } = await import('@/lib/pageAccessLinks');
    const registered = new Set(PAGE_DEFS.map((p) => p.slug));
    for (const [primary, related] of Object.entries(PAGE_RELATED)) {
      expect(registered.has(primary)).toBe(true);
      for (const slug of related) {
        expect(registered.has(slug)).toBe(true);
      }
    }
  });
});
