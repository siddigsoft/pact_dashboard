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

  if (!isSupervisor || !user.hubId) return empty;

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

export function filterByHubAccess<T extends { state?: string; stateName?: string; state_name?: string; stateId?: string; state_id?: string; hub_id?: string }>(
  items: T[],
  hubAccessInfo: HubAccessInfo
): T[] {
  if (!hubAccessInfo.isHubSupervisor || hubAccessInfo.hubStates.length === 0) {
    return items;
  }

  const normalizedHubStates = hubAccessInfo.hubStates.map(s => normalizeStateId(s));
  const normalizedHubStateNames = hubAccessInfo.hubStateNames.map(s => normalizeStateName(s));

  return items.filter(item => {
    if ((item as any).hub_id) {
      const itemHubNormalized = normalizeHubId((item as any).hub_id);
      if (itemHubNormalized && hubAccessInfo.hubIds.includes(itemHubNormalized)) {
        return true;
      }
    }
    
    const stateId = item.state_id || item.stateId || item.state;
    const stateName = item.state_name || item.stateName;
    
    if (stateId) {
      const normalizedId = normalizeStateId(stateId);
      if (normalizedHubStates.includes(normalizedId)) {
        return true;
      }
    }
    
    if (stateName) {
      const normalizedName = normalizeStateName(stateName);
      if (normalizedHubStateNames.includes(normalizedName)) {
        return true;
      }
      const stateIdFromName = normalizeStateId(stateName);
      if (normalizedHubStates.includes(stateIdFromName)) {
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
  
  const isAdmin = userRole === 'admin' || userRole === 'superadmin' || userRole === 'super_admin';
  const isFOM = userRole === 'fom' || userRole === 'field operation manager (fom)' || userRole === 'field operation manager';
  const isICT = userRole === 'ict' || userRole === 'ict admin';
  const isCountryDirector = userRole === 'countrydirector' || userRole === 'country_director' || userRole === 'country director';
  
  if (isAdmin || isFOM || isICT || isCountryDirector) {
    return false;
  }
  
  return isSupervisor && !!user.hubId;
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
