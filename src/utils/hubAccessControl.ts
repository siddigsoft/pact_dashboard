import { hubs, normalizeHubId, getStatesInHub } from '@/data/sudanStates';
import type { User } from '@/types/user';
import type { AppRole } from '@/types/roles';

export interface HubAccessInfo {
  isHubSupervisor: boolean;
  hubId: string | null;
  secondaryHubId: string | null;
  hubIds: string[];
  rawHubIds: string[];
  hubStates: string[];
  hubStateNames: string[];
  isCountryOffice: boolean;
}

function collectHubStates(hubIds: string[]): { states: string[], stateNames: string[] } {
  const stateSet = new Set<string>();
  const stateNameSet = new Set<string>();

  for (const hubId of hubIds) {
    const normalized = normalizeHubId(hubId);
    if (!normalized) continue;
    const hubStatesData = getStatesInHub(normalized);
    for (const s of hubStatesData) {
      stateSet.add(s.id);
      stateNameSet.add(s.name);
    }
  }

  return { states: Array.from(stateSet), stateNames: Array.from(stateNameSet) };
}

function isCountryOfficeHub(hubId: string | null | undefined): boolean {
  if (!hubId) return false;
  const normalized = normalizeHubId(hubId);
  return normalized === 'country-office';
}

export function getHubAccessInfo(user: User | null): HubAccessInfo {
  const empty: HubAccessInfo = {
    isHubSupervisor: false,
    hubId: null,
    secondaryHubId: null,
    hubIds: [],
    rawHubIds: [],
    hubStates: [],
    hubStateNames: [],
    isCountryOffice: false,
  };

  if (!user) return empty;

  const userRole = (user.role || '').toLowerCase();
  const isSupervisor = userRole === 'supervisor' || userRole === 'hubsupervisor' || userRole === 'hub_supervisor';
  const isCoordinator = userRole === 'coordinator';

  // Both supervisors and coordinators are scoped to their assigned hub(s).
  if (!(isSupervisor || isCoordinator) || !user.hubId) return empty;

  const primaryHubId = user.hubId;
  const secondaryHubId = (user as any).secondaryHubId || null;

  const rawIds = [primaryHubId, secondaryHubId].filter(Boolean) as string[];
  const normalizedHubIds = rawIds
    .map(h => normalizeHubId(h))
    .filter(Boolean) as string[];

  if (normalizedHubIds.length === 0) return empty;

  const hasCountryOffice = rawIds.some(h => isCountryOfficeHub(h));

  const { states, stateNames } = collectHubStates(normalizedHubIds);

  return {
    isHubSupervisor: true,
    hubId: normalizedHubIds[0],
    secondaryHubId: normalizedHubIds.length > 1 ? normalizedHubIds[1] : null,
    hubIds: normalizedHubIds,
    rawHubIds: rawIds,
    hubStates: states,
    hubStateNames: stateNames,
    isCountryOffice: hasCountryOffice,
  };
}

export function normalizeStateId(stateId: string): string {
  return stateId.toLowerCase().trim().replace(/\s+/g, '-').replace(/_/g, '-');
}

export function isStateInHub(stateId: string | null | undefined, hubId: string | null): boolean {
  if (!stateId || !hubId) return false;
  
  const normalizedHubId = normalizeHubId(hubId);
  if (!normalizedHubId) return false;

  const hub = hubs.find(h => h.id === normalizedHubId);
  if (!hub) return false;

  const normalizedSId = normalizeStateId(stateId);
  return hub.states.some(s => normalizeStateId(s) === normalizedSId);
}

export function normalizeStateName(stateName: string): string {
  return stateName.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function isStateNameInHub(stateName: string | null | undefined, hubId: string | null): boolean {
  if (!stateName || !hubId) return false;
  
  const normalizedHubId = normalizeHubId(hubId);
  if (!normalizedHubId) return false;

  const hubStatesData = getStatesInHub(normalizedHubId);
  const normalizedSN = normalizeStateName(stateName);
  const stateIdFromName = normalizeStateId(stateName);
  
  return hubStatesData.some(s => 
    normalizeStateName(s.name) === normalizedSN ||
    normalizeStateId(s.id) === stateIdFromName
  );
}

export function isStateInAnyHub(stateName: string | null | undefined, hubIds: string[]): boolean {
  if (!stateName || hubIds.length === 0) return false;
  return hubIds.some(hubId => isStateNameInHub(stateName, hubId));
}

/**
 * Derive a "base" name by stripping the common " State" / "-state" suffix.
 * Allows matching "Khartoum" ↔ "Khartoum State" ↔ "khartoum-state".
 */
function toBaseName(s: string): string {
  return s.toLowerCase().trim()
    .replace(/\s+state$/i, '')
    .replace(/-state$/, '')
    .replace(/-/g, ' ')
    .trim();
}

export function filterByHubAccess<T extends {
  state?: string; stateName?: string; state_name?: string;
  stateId?: string; state_id?: string;
  hub_id?: string;
  // camelCase variants used by MMP context site entries
  hubOffice?: string;
}>(
  items: T[],
  hubAccessInfo: HubAccessInfo
): T[] {
  if (!hubAccessInfo.isHubSupervisor || hubAccessInfo.hubStates.length === 0) {
    return items;
  }

  const normalizedHubStates = hubAccessInfo.hubStates.map(s => normalizeStateId(s));
  const normalizedHubStateNames = hubAccessInfo.hubStateNames.map(s => normalizeStateName(s));
  // Base names for fuzzy matching: "Khartoum State" → "khartoum", "khartoum-state" → "khartoum"
  const hubBaseNames = [
    ...hubAccessInfo.hubStates.map(toBaseName),
    ...hubAccessInfo.hubStateNames.map(toBaseName),
  ];
  const uniqueHubBases = Array.from(new Set(hubBaseNames.filter(Boolean)));

  return items.filter(item => {
    // 1. Direct hub_id match (snake_case)
    const hubId = (item as any).hub_id || (item as any).hubOffice || '';
    if (hubId) {
      const itemHubNormalized = normalizeHubId(hubId);
      if (itemHubNormalized && hubAccessInfo.hubIds.includes(itemHubNormalized)) {
        return true;
      }
      // Partial hub office name match
      const hubLower = hubId.toLowerCase();
      if (hubAccessInfo.hubIds.some(h =>
        hubLower.includes(h.toLowerCase()) || h.toLowerCase().includes(hubLower)
      )) return true;
    }

    // 2. State field matching (handles both snake_case and camelCase property names)
    const stateValue = item.state_id || item.stateId || item.state || item.state_name || item.stateName || '';

    if (stateValue) {
      // Exact normalised ID match
      const normId = normalizeStateId(stateValue);
      if (normalizedHubStates.includes(normId)) return true;

      // Exact normalised name match
      const normName = normalizeStateName(stateValue);
      if (normalizedHubStateNames.includes(normName)) return true;

      // ID-derived name match
      if (normalizedHubStates.includes(normId.replace(/\s+/g, '-'))) return true;

      // Fuzzy base-name match — handles "Khartoum" ↔ "Khartoum State"
      const base = toBaseName(stateValue);
      if (uniqueHubBases.some(h => h === base || h.includes(base) || base.includes(h))) {
        return true;
      }
    }

    return false;
  });
}

export function shouldApplyHubFilter(user: User | null, roles?: AppRole[]): boolean {
  if (!user) return false;
  
  const userRole = (user.role || '').toLowerCase();
  const isSupervisor = userRole === 'supervisor' || userRole === 'hubsupervisor' || userRole === 'hub_supervisor';
  const isCoordinator = userRole === 'coordinator';
  
  const isAdmin = userRole === 'admin' || userRole === 'superadmin' || userRole === 'super_admin';
  const isFOM = userRole === 'fom' || userRole === 'field operation manager (fom)' || userRole === 'field operation manager';
  const isICT = userRole === 'ict' || userRole === 'ict admin';
  const isCountryDirector = userRole === 'countrydirector' || userRole === 'country_director' || userRole === 'country director';
  
  if (isAdmin || isFOM || isICT || isCountryDirector) {
    return false;
  }
  
  // Both supervisors and coordinators are scoped to their assigned hub(s).
  return (isSupervisor || isCoordinator) && !!user.hubId;
}

export function getHubFilterQuery(hubId: string | null): { states: string[] } | null {
  if (!hubId) return null;
  
  const normalizedHubId = normalizeHubId(hubId);
  if (!normalizedHubId) return null;

  const hubStatesData = getStatesInHub(normalizedHubId);
  return { states: hubStatesData.map(s => s.id) };
}

export function getMultiHubFilterQuery(user: User | null): { states: string[] } | null {
  if (!user?.hubId) return null;

  const hubIds = [user.hubId, (user as any).secondaryHubId].filter(Boolean) as string[];
  const allStates = new Set<string>();

  for (const hubId of hubIds) {
    const result = getHubFilterQuery(hubId);
    if (result) {
      result.states.forEach(s => allStates.add(s));
    }
  }

  return allStates.size > 0 ? { states: Array.from(allStates) } : null;
}
