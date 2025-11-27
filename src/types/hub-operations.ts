export interface ManagedHub {
  id: string;
  name: string;
  description?: string;
  project_id?: string;
  states: string[];
  coordinates?: { latitude: number; longitude: number };
  created_at: string;
  created_by: string;
  updated_at?: string;
}

export interface SiteRegistry {
  id: string;
  site_code: string;
  site_name: string;
  state_id: string;
  state_name: string;
  locality_id: string;
  locality_name: string;
  hub_id?: string;
  hub_name?: string;
  gps_latitude?: number;
  gps_longitude?: number;
  gps_captured_by?: string;
  gps_captured_at?: string;
  activity_type?: string;
  status: 'registered' | 'active' | 'inactive' | 'archived';
  mmp_count: number;
  last_mmp_date?: string;
  created_at: string;
  created_by: string;
  updated_at?: string;
}

export interface ProjectScope {
  id: string;
  project_id: string;
  project_name: string;
  hub_id?: string;
  hub_name?: string;
  state_ids: string[];
  locality_ids: string[];
  created_at: string;
  updated_at?: string;
}

export interface HubState {
  hub_id: string;
  state_id: string;
}

export interface SiteCodeComponents {
  stateCode: string;
  localityCode: string;
  siteName: string;
  sequenceNumber: number;
  activityType: string;
}

export function generateSiteCode(
  stateCode: string,
  localityName: string,
  siteName: string,
  sequenceNumber: number,
  activityType: string = 'TPM'
): string {
  const localityCode = localityName
    .split(' ')
    .map(word => word.charAt(0).toUpperCase())
    .join('')
    .substring(0, 3);
  
  const siteNameCode = siteName
    .replace(/[^a-zA-Z0-9]/g, '')
    .substring(0, 6)
    .toUpperCase();
  
  const paddedSequence = String(sequenceNumber).padStart(4, '0');
  
  return `${stateCode}-${localityCode}-${siteNameCode}-${paddedSequence}-${activityType}`;
}

export function parseSiteCode(siteCode: string): SiteCodeComponents | null {
  const parts = siteCode.split('-');
  if (parts.length < 5) return null;
  
  return {
    stateCode: parts[0],
    localityCode: parts[1],
    siteName: parts[2],
    sequenceNumber: parseInt(parts[3], 10),
    activityType: parts[4] || 'TPM'
  };
}
