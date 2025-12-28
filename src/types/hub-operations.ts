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
  hub_office?: string;
  hubOffice?: string;
  gps_latitude?: number | null;
  gps_longitude?: number | null;
  gps_altitude?: number | null;
  gps_precision?: number | null;
  gps_captured_by?: string;
  gps_captured_at?: string;
  residence_latitude?: number | null;
  residence_longitude?: number | null;
  residence_altitude?: number | null;
  residence_precision?: number | null;
  activity_type?: string;
  status: 'registered' | 'active' | 'inactive' | 'archived' | string;
  mmp_count: number;
  last_mmp_date?: string;
  created_at: string;
  created_by: string;
  updated_at?: string;
  source?: 'registry' | 'mmp';
  // MMP-specific fields
  cp_name?: string;
  cpName?: string;
  activity_at_site?: string;
  siteActivity?: string;
  monitoring_by?: string;
  monitoringBy?: string;
  survey_tool?: string;
  surveyTool?: string;
  visit_date?: string;
  visitDate?: string;
  visit_type?: string;
  visitType?: string;
  main_activity?: string;
  mainActivity?: string;
  use_market_diversion?: boolean;
  useMarketDiversion?: boolean;
  use_warehouse_monitoring?: boolean;
  useWarehouseMonitoring?: boolean;
  comments?: string;
  additional_data?: any;
  additionalData?: any;
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
