import { describe, expect, it } from 'vitest';
import {
  buildCapabilityInventory,
  capabilityKey,
  getModuleRegistryCapabilityPairs,
  inventoryKeys,
  inventoryPairCount,
} from '@/lib/capability-inventory';

describe('capability-inventory', () => {
  it('dedupes MODULE_REGISTRY pairs', () => {
    const pairs = getModuleRegistryCapabilityPairs();
    const keys = pairs.map(p => capabilityKey(p.resource, p.action));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeGreaterThan(50);
  });

  it('merges live and orphan pairs into the inventory', () => {
    const inventory = buildCapabilityInventory(
      [{ resource: 'chat', action: 'read' }],
      [{ resource: 'users', action: 'approve' }],
    );
    const keys = inventoryKeys(inventory);
    expect(keys.has('chat:read')).toBe(true);
    expect(keys.has('users:approve')).toBe(true);
    expect(inventoryPairCount(inventory)).toBe(keys.size);
  });
});
