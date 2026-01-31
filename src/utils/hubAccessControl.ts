import { hubs, normalizeHubId, getStatesInHub } from '@/data/sudanStates';
import type { User } from '@/types/user';
import type { AppRole } from '@/types/roles';

export interface HubAccessInfo {
  isHubSupervisor: boolean;
  hubId: string | null;
  hubStates: string[];
  hubStateNames: string[];
}

export function getHubAccessInfo(user: User | null): HubAccessInfo {
  if (!user) {
    return { isHubSupervisor: false, hubId: null, hubStates: [], hubStateNames: [] };
  }

  const userRole = (user.role || '').toLowerCase();
  const isSupervisor = userRole === 'supervisor' || userRole === 'hubsupervisor' || userRole === 'hub_supervisor';
  
  if (!isSupervisor || !user.hubId) {
    return { isHubSupervisor: false, hubId: null, hubStates: [], hubStateNames: [] };
  }

  const normalizedHubId = normalizeHubId(user.hubId);
  if (!normalizedHubId) {
    return { isHubSupervisor: false, hubId: null, hubStates: [], hubStateNames: [] };
  }

  const hubStatesData = getStatesInHub(normalizedHubId);
  const hubStates = hubStatesData.map(s => s.id);
  const hubStateNames = hubStatesData.map(s => s.name);

  return {
    isHubSupervisor: true,
    hubId: normalizedHubId,
    hubStates,
    hubStateNames
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

  const normalizedStateId = normalizeStateId(stateId);
  return hub.states.some(s => normalizeStateId(s) === normalizedStateId);
}

export function normalizeStateName(stateName: string): string {
  return stateName.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function isStateNameInHub(stateName: string | null | undefined, hubId: string | null): boolean {
  if (!stateName || !hubId) return false;
  
  const normalizedHubId = normalizeHubId(hubId);
  if (!normalizedHubId) return false;

  const hubStatesData = getStatesInHub(normalizedHubId);
  const normalizedStateName = normalizeStateName(stateName);
  const stateIdFromName = normalizeStateId(stateName);
  
  return hubStatesData.some(s => 
    normalizeStateName(s.name) === normalizedStateName ||
    normalizeStateId(s.id) === stateIdFromName
  );
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
    if ((item as any).hub_id && (item as any).hub_id === hubAccessInfo.hubId) {
      return true;
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
