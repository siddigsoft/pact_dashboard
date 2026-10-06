/**
 * Canonical grantable permission pairs for the Role Management matrix.
 *
 * Primary inventory = MODULE_REGISTRY pairs (meaningful capabilities).
 * Optional merges:
 *   - livePairs: distinct (resource, action) from public.permissions
 *   - orphanPairs: grants already on a role that are outside MODULE_REGISTRY
 *
 * The matrix must never advertise the full RESOURCES × ACTIONS cartesian product.
 * PermissionManager uses MODULE_REGISTRY ∪ role orphans so seeded DB noise
 * (e.g. users:archive) does not re-expand the grid; livePairs remain available
 * for audits/migrations.
 */

import { MODULE_REGISTRY } from '@/types/moduleRegistry';
import type { ActionType, ResourceType } from '@/types/roles';

export interface CapabilityPair {
  resource: ResourceType;
  action: ActionType;
}

export function capabilityKey(resource: string, action: string): string {
  return `${resource}:${action}`;
}

/** Meaningful pairs declared in MODULE_REGISTRY (deduped). */
export function getModuleRegistryCapabilityPairs(): CapabilityPair[] {
  const seen = new Set<string>();
  const pairs: CapabilityPair[] = [];
  for (const mod of MODULE_REGISTRY) {
    for (const page of mod.pages) {
      for (const act of page.actions) {
        const key = capabilityKey(act.resource, act.action);
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push({ resource: act.resource, action: act.action });
      }
    }
  }
  return pairs;
}

export function getModuleRegistryCapabilityKeys(): Set<string> {
  return new Set(
    getModuleRegistryCapabilityPairs().map(p => capabilityKey(p.resource, p.action)),
  );
}

/**
 * Merge MODULE_REGISTRY with live DB distinct pairs (and optional orphan
 * grants already on the role) into a resource → actions map for the matrix.
 */
export function buildCapabilityInventory(
  livePairs: CapabilityPair[] = [],
  orphanPairs: CapabilityPair[] = [],
): Map<ResourceType, ActionType[]> {
  const byResource = new Map<ResourceType, Set<ActionType>>();

  const add = (resource: ResourceType, action: ActionType) => {
    let set = byResource.get(resource);
    if (!set) {
      set = new Set();
      byResource.set(resource, set);
    }
    set.add(action);
  };

  for (const p of getModuleRegistryCapabilityPairs()) add(p.resource, p.action);
  for (const p of livePairs) add(p.resource, p.action);
  for (const p of orphanPairs) add(p.resource, p.action);

  const result = new Map<ResourceType, ActionType[]>();
  for (const [resource, actions] of byResource) {
    result.set(resource, [...actions].sort());
  }
  return result;
}

export function inventoryPairCount(inventory: Map<ResourceType, ActionType[]>): number {
  let n = 0;
  for (const actions of inventory.values()) n += actions.length;
  return n;
}

export function inventoryHasPair(
  inventory: Map<ResourceType, ActionType[]>,
  resource: ResourceType,
  action: ActionType,
): boolean {
  return inventory.get(resource)?.includes(action) ?? false;
}

/** Flatten inventory to key set (for drift tests / assertions). */
export function inventoryKeys(inventory: Map<ResourceType, ActionType[]>): Set<string> {
  const keys = new Set<string>();
  for (const [resource, actions] of inventory) {
    for (const action of actions) keys.add(capabilityKey(resource, action));
  }
  return keys;
}
