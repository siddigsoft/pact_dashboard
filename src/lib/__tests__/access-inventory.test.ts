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

  it('only reports source enforcement when a concrete boundary is documented', () => {
    const inventory = getAccessInventory();
    const verified = Object.values(inventory).flat().filter(item => item.serverEnforcement === 'verified');

    expect(verified.length).toBeGreaterThan(0);
    for (const item of verified) {
      expect(item.enforcementOwner).toBeTruthy();
      expect(item.enforcementBoundary).not.toBe('registry');
      expect(item.enforcementEvidence).toBeTruthy();
    }

    expect(verified.map(item => item.registryKey)).toEqual(expect.arrayContaining([
      'mmp:full_report',
      'mmp:state_report',
      'mmp:hub_report',
    ]));
    expect(verified.every(item => item.route === '/mmp')).toBe(true);
    expect(inventory.actions.filter(item =>
      item.route === '/monitoring-plan'
      && ['mmp:full_report', 'mmp:state_report', 'mmp:hub_report'].includes(item.registryKey ?? '')
    ).every(item => item.serverEnforcement === 'requires_verification')).toBe(true);
  });

  it('keeps the same permission key distinct when it is registered on different routes', () => {
    const analyticsExports = getAccessInventory().actions.filter(item => item.registryKey === 'analytics:export');
    expect(analyticsExports.length).toBeGreaterThan(1);
    expect(new Set(analyticsExports.map(item => item.route)).size).toBe(analyticsExports.length);
    expect(new Set(analyticsExports.map(item => item.key)).size).toBe(analyticsExports.length);
  });

  it('does not treat sensitive column registration as source enforcement', () => {
    const sensitiveColumns = getAccessInventory().columns.filter(item => item.sensitive);
    expect(sensitiveColumns.length).toBeGreaterThan(0);
    expect(sensitiveColumns.every(item =>
      item.serverEnforcement === 'requires_verification'
      && item.enforcementBoundary === 'registry'
      && !item.enforcementEvidence
    )).toBe(true);
  });

  it('surfaces cross-registry mappings as reviewable drift instead of silently accepting them', () => {
    const issues = getAccessInventoryIssues();
    expect(issues.some(issue => issue.kind === 'unknown-page')).toBe(true);
    expect(issues.every(issue => issue.key && issue.message)).toBe(true);
  });
});