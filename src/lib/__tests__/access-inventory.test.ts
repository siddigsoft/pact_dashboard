import { describe, expect, it } from 'vitest';
import { PAGE_DEFS } from '@/lib/access-registry';
import { HUB_TAB_REGISTRY } from '@/lib/hub-tab-defs';
import { getAccessInventory, getAccessInventoryIssues, ACCESS_SCOPE_DIMENSIONS } from '@/lib/access-inventory';

describe('canonical access inventory', () => {
  it('enumerates every existing registry family without duplicating permission truth', () => {
    const inventory = getAccessInventory();
    expect(inventory.pages.length).toBe(PAGE_DEFS.length);
    expect(inventory.routes.length).toBe(PAGE_DEFS.length);
    expect(inventory.tabs.length).toBeGreaterThan(0);
    expect(inventory.actions.length).toBeGreaterThan(0);
    expect(inventory.reports.every(item => item.kind === 'report')).toBe(true);
    expect(inventory.filters.length).toBeGreaterThan(0);
    expect(inventory.columns.length).toBeGreaterThan(0);
    expect(inventory.scopes.map(item => item.key)).toEqual([...ACCESS_SCOPE_DIMENSIONS]);
  });

  it('does not emit duplicate target keys', () => {
    const inventory = getAccessInventory();
    for (const items of Object.values(inventory)) {
      expect(new Set(items.map(item => item.key)).size).toBe(items.length);
    }
  });

  it('surfaces cross-registry mappings as reviewable drift instead of silently accepting them', () => {
    const issues = getAccessInventoryIssues();
    expect(issues.some(issue => issue.kind === 'unknown-page')).toBe(true);
    expect(issues.every(issue => issue.key && issue.message)).toBe(true);
  });
});