import { describe, it, expect } from 'vitest';
import { PAGE_DEFS, getPageRegistryIssues } from '@/lib/access-registry';
import { ACCESS_TARGET_REGISTRY, getAccessTargetRegistryIssues, getRegisteredPageActions } from '@/lib/access-target-registry';

describe('canonical access target registry', () => {
  it('defines each page once and every declared tab belongs to a known hub', () => {
    expect(getPageRegistryIssues()).toEqual([]);
    expect(getAccessTargetRegistryIssues()).toEqual([]);
    expect(ACCESS_TARGET_REGISTRY.map(target => target.page.slug)).toEqual(PAGE_DEFS.map(page => page.slug));
  });

  it('does not inherit unrelated write permissions from a hub pathname', () => {
    expect(getRegisteredPageActions('not-a-page')).toEqual([]);
    const tabs = ACCESS_TARGET_REGISTRY.filter(target => target.page.path.includes('?'));
    expect(tabs.length).toBeGreaterThan(10);
    for (const target of tabs) expect(target.dependencies.length).toBe(1);
  });

  it('does not mistake action inventory coverage for verified server enforcement', () => {
    for (const target of ACCESS_TARGET_REGISTRY) {
      expect(target.enforcement.owner).toBeTruthy();
      expect(target.enforcement.server).toBe('metadata');
      expect(target.enforcement.boundary).toBe('registry');
      expect(target.enforcement.evidence).toBeUndefined();
    }
  });
});
