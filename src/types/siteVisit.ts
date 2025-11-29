export interface SiteVisit {
  id: string;
  name?: string;
  siteName: string;
  siteCode: string;
  status: 'pending' | 'completed' | 'cancelled' | 'permitVerified' | 'assigned' | 'inProgress' | 'canceled';
  locality: string;
  state: string;
  activity: string;
  priority: 'low' | 'medium' | 'high';
  dueDate: string;
  assignedTo: string;
  assignedBy?: string;
  assignedAt?: string;
  notes?: string;
  attachments?: string[];
  completedAt?: string;
  rating?: number;
  ratingNotes?: string;
  fees: {
    total: number;
    currency: string;
    distanceFee: number;
    complexityFee: number;
    urgencyFee: number;
    baseAmount?: number;
    baseFee?: number;
    transportation?: number;
  };
  scheduledDate: string;
  description?: string;
  tasks?: string[]; // Added optional tasks property
  permitDetails: {
    federal: boolean;
    state: boolean;
    locality: boolean;
    verifiedBy?: string;
    verifiedAt?: string;
  };
  location: {
    address: string;
    latitude: number;
    longitude: number;
    region: string;
  };
  coordinates: {
    latitude: number;
    longitude: number;
  };
  mmpDetails: {
    mmpId: string;
    projectId?: string;
    projectName: string;
    uploadedBy: string;
    uploadedAt: string;
    region: string;
    approvedBy?: string;
    approvedAt?: string;
  };
  complexity: 'low' | 'medium' | 'high';
  visitType: 'regular' | 'urgent' | 'follow-up';
  // Raw Visit Type from import (e.g., "PACT"), preserved in DB
  visitTypeRaw?: string;
  mainActivity: string;
  projectActivities: string[];
  hub?: string;
  // Cooperation Partner name from spreadsheet
  cpName?: string;
  team?: {
    coordinator?: string;
    supervisor?: string;
    fieldOfficer?: string;
  };
  resources?: string[];
  risks?: string;
  estimatedDuration?: string;
  visitHistory?: Array<{
    date: string;
    status: string;
    by: string;
  }>;
  monitoringType?: string;
  createdAt?: string;
  projectName?: string; 
  startTime?: string;
  // Monitoring Plan Structure Fields
  hubOffice?: string; // e.g., "Farchana Hub"
  siteActivity?: string; // e.g., "GFA"
  monitoringBy?: string; // e.g., "PACT"
  surveyTool?: string; // e.g., "PDM"
  useMarketDiversion?: boolean;
  useWarehouseMonitoring?: boolean;
  arrivalLatitude?: number;
  arrivalLongitude?: number;
  arrivalTimestamp?: string;
  journeyPath?: any[];
  arrivalRecorded?: boolean;

  // new optional legacy/compat fields to satisfy dashboard lookups
  region?: string;         // some records may have region at top-level
  site_code?: string;      // legacy snake_case field used in older codepaths
  
  // Fee-related compat fields for down payment and wallet features
  transport_fee?: number;  // direct transport fee from site_visits table
  enumerator_fee?: number; // direct enumerator fee from site_visits table
  transportFee?: number;   // camelCase alias for transport_fee
  
  // Acceptance/assignment compat fields for down payment button
  accepted_by?: string;    // snake_case from mmp_site_entries
  acceptedBy?: string;     // camelCase alias
}
