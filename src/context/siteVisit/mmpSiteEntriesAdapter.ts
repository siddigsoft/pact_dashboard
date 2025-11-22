/**
 * Adapter for mapping mmp_site_entries to SiteVisit format
 * This allows the application to work with the new database schema
 * where site visit details are stored in mmp_site_entries
 */

import { SiteVisit } from '@/types';
import { supabase } from '@/integrations/supabase/client';

interface MMPSiteEntry {
  id: string;
  mmp_file_id: string;
  site_code: string;
  hub_office: string;
  state: string;
  locality: string;
  site_name: string;
  cp_name: string;
  visit_type: string;
  visit_date: string;
  main_activity: string;
  activity_at_site: string;
  monitoring_by: string;
  survey_tool: string;
  use_market_diversion: boolean;
  use_warehouse_monitoring: boolean;
  comments: string;
  additional_data: any;
  status: string;
  created_at: string;
  cost: number;
  verification_notes: string;
  verified_by: string;
  verified_at: string;
  dispatched_by: string;
  dispatched_at: string;
  updated_at: string;
  enumerator_fee: number;
  transport_fee: number;
  accepted_by: string;
  accepted_at: string;
  mmp_files?: {
    id: string;
    mmp_id: string;
    name: string;
    uploaded_by: string;
    uploaded_at: string;
    approved_by: string;
    approved_at: string;
    hub: string;
    month: string;
    project_id: string;
  };
}

/**
 * Maps mmp_site_entry to SiteVisit format
 */
export const mapMMPSiteEntryToSiteVisit = (entry: MMPSiteEntry): SiteVisit => {
  const totalFee = entry.cost || (entry.enumerator_fee || 0) + (entry.transport_fee || 0);
  
  return {
    id: entry.id,
    siteName: entry.site_name || '',
    siteCode: entry.site_code || '',
    status: mapStatus(entry.status),
    locality: entry.locality || '',
    state: entry.state || '',
    activity: entry.activity_at_site || entry.main_activity || '',
    priority: 'medium', // Default priority
    dueDate: entry.visit_date || new Date().toISOString(),
    assignedTo: '', // Will be set when assigned
    assignedBy: entry.dispatched_by,
    assignedAt: entry.dispatched_at,
    notes: entry.comments || '',
    attachments: [],
    completedAt: entry.status === 'Completed' ? entry.updated_at : undefined,
    rating: undefined,
    ratingNotes: undefined,
    fees: {
      total: totalFee,
      currency: 'SDG',
      distanceFee: 0,
      complexityFee: 0,
      urgencyFee: 0,
      baseAmount: entry.enumerator_fee || 0,
      baseFee: entry.enumerator_fee || 0,
      transportation: entry.transport_fee || 0,
    },
    scheduledDate: entry.visit_date || new Date().toISOString(),
    description: entry.comments || '',
    tasks: [],
    permitDetails: {
      federal: false,
      state: false,
      locality: false,
      verifiedBy: entry.verified_by,
      verifiedAt: entry.verified_at,
    },
    location: {
      address: `${entry.site_name}, ${entry.locality}, ${entry.state}`,
      latitude: entry.additional_data?.latitude || 0,
      longitude: entry.additional_data?.longitude || 0,
      region: entry.state || '',
    },
    coordinates: {
      latitude: entry.additional_data?.latitude || 0,
      longitude: entry.additional_data?.longitude || 0,
    },
    mmpDetails: {
      mmpId: entry.mmp_files?.mmp_id || '',
      projectName: entry.mmp_files?.name || '',
      uploadedBy: entry.mmp_files?.uploaded_by || '',
      uploadedAt: entry.mmp_files?.uploaded_at || '',
      region: entry.state || '',
      approvedBy: entry.mmp_files?.approved_by,
      approvedAt: entry.mmp_files?.approved_at,
    },
    complexity: 'medium', // Default complexity
    visitType: 'regular',
    visitTypeRaw: entry.visit_type,
    mainActivity: entry.main_activity || '',
    projectActivities: [],
    hub: entry.hub_office || entry.mmp_files?.hub || '',
    cpName: entry.cp_name || '',
    team: {},
    resources: [],
    risks: '',
    estimatedDuration: '',
    visitHistory: [],
    monitoringType: entry.survey_tool,
    createdAt: entry.created_at,
    projectName: entry.mmp_files?.name || '',
    startTime: undefined,
    hubOffice: entry.hub_office || '',
    siteActivity: entry.activity_at_site || '',
    monitoringBy: entry.monitoring_by || '',
    surveyTool: entry.survey_tool || '',
    useMarketDiversion: entry.use_market_diversion || false,
    useWarehouseMonitoring: entry.use_warehouse_monitoring || false,
    arrivalLatitude: entry.additional_data?.arrival_latitude,
    arrivalLongitude: entry.additional_data?.arrival_longitude,
    arrivalTimestamp: entry.additional_data?.arrival_timestamp,
    journeyPath: entry.additional_data?.journey_path || [],
    arrivalRecorded: entry.additional_data?.arrival_recorded || false,
    region: entry.state,
    site_code: entry.site_code,
  };
};

/**
 * Maps database status to application status
 */
const mapStatus = (dbStatus: string): SiteVisit['status'] => {
  const statusMap: Record<string, SiteVisit['status']> = {
    'Pending': 'pending',
    'Assigned': 'assigned',
    'In Progress': 'inProgress',
    'Completed': 'completed',
    'Cancelled': 'cancelled',
    'Canceled': 'canceled',
    'Verified': 'permitVerified',
  };
  
  return statusMap[dbStatus] || 'pending';
};

/**
 * Maps application status to database status
 */
const mapStatusToDb = (appStatus: SiteVisit['status']): string => {
  const statusMap: Record<SiteVisit['status'], string> = {
    'pending': 'Pending',
    'completed': 'Completed',
    'cancelled': 'Cancelled',
    'canceled': 'Cancelled',
    'permitVerified': 'Verified',
    'assigned': 'Assigned',
    'inProgress': 'In Progress',
  };
  
  return statusMap[appStatus] || 'Pending';
};

/**
 * Fetches site visits from mmp_site_entries table
 */
export const fetchSiteVisitsFromMMPEntries = async (): Promise<SiteVisit[]> => {
  const { data, error } = await supabase
    .from('mmp_site_entries')
    .select(`
      *,
      mmp_files (
        id,
        mmp_id,
        name,
        uploaded_by,
        uploaded_at,
        approved_by,
        approved_at,
        hub,
        month,
        project_id
      )
    `)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching mmp_site_entries:', error);
    throw error;
  }
  
  return (data || []).map(mapMMPSiteEntryToSiteVisit);
};

/**
 * Creates a site visit in mmp_site_entries
 * This is used when creating site visits that should be part of an MMP
 */
export const createMMPSiteEntry = async (
  mmpFileId: string,
  siteVisit: Partial<SiteVisit>
): Promise<SiteVisit> => {
  const dbEntry = {
    mmp_file_id: mmpFileId,
    site_code: siteVisit.siteCode || '',
    hub_office: siteVisit.hubOffice || siteVisit.hub || '',
    state: siteVisit.state || '',
    locality: siteVisit.locality || '',
    site_name: siteVisit.siteName || '',
    cp_name: siteVisit.cpName || '',
    visit_type: siteVisit.visitTypeRaw || siteVisit.visitType || 'regular',
    visit_date: siteVisit.dueDate || siteVisit.scheduledDate || new Date().toISOString(),
    main_activity: siteVisit.mainActivity || siteVisit.activity || '',
    activity_at_site: siteVisit.siteActivity || siteVisit.activity || '',
    monitoring_by: siteVisit.monitoringBy || '',
    survey_tool: siteVisit.surveyTool || '',
    use_market_diversion: siteVisit.useMarketDiversion || false,
    use_warehouse_monitoring: siteVisit.useWarehouseMonitoring || false,
    comments: siteVisit.notes || siteVisit.description || '',
    additional_data: {
      latitude: siteVisit.coordinates?.latitude || siteVisit.location?.latitude || 0,
      longitude: siteVisit.coordinates?.longitude || siteVisit.location?.longitude || 0,
      arrival_latitude: siteVisit.arrivalLatitude,
      arrival_longitude: siteVisit.arrivalLongitude,
      arrival_timestamp: siteVisit.arrivalTimestamp,
      journey_path: siteVisit.journeyPath,
      arrival_recorded: siteVisit.arrivalRecorded,
    },
    status: mapStatusToDb(siteVisit.status || 'pending'),
    cost: siteVisit.fees?.total || 0,
    enumerator_fee: siteVisit.fees?.baseFee || siteVisit.fees?.baseAmount || 0,
    transport_fee: siteVisit.fees?.transportation || 0,
    dispatched_by: siteVisit.assignedBy,
    dispatched_at: siteVisit.assignedAt,
  };
  
  const { data, error } = await supabase
    .from('mmp_site_entries')
    .insert(dbEntry)
    .select(`
      *,
      mmp_files (
        id,
        mmp_id,
        name,
        uploaded_by,
        uploaded_at,
        approved_by,
        approved_at,
        hub,
        month,
        project_id
      )
    `)
    .single();
  
  if (error) {
    console.error('Error creating mmp_site_entry:', error);
    throw error;
  }
  
  return mapMMPSiteEntryToSiteVisit(data);
};

/**
 * Updates an mmp_site_entry
 */
export const updateMMPSiteEntry = async (
  id: string,
  updates: Partial<SiteVisit>
): Promise<SiteVisit> => {
  const dbUpdates: any = {};
  
  if (updates.siteCode !== undefined) dbUpdates.site_code = updates.siteCode;
  if (updates.hubOffice !== undefined || updates.hub !== undefined) {
    dbUpdates.hub_office = updates.hubOffice || updates.hub;
  }
  if (updates.state !== undefined) dbUpdates.state = updates.state;
  if (updates.locality !== undefined) dbUpdates.locality = updates.locality;
  if (updates.siteName !== undefined) dbUpdates.site_name = updates.siteName;
  if (updates.cpName !== undefined) dbUpdates.cp_name = updates.cpName;
  if (updates.visitTypeRaw !== undefined || updates.visitType !== undefined) {
    dbUpdates.visit_type = updates.visitTypeRaw || updates.visitType;
  }
  if (updates.dueDate !== undefined || updates.scheduledDate !== undefined) {
    dbUpdates.visit_date = updates.dueDate || updates.scheduledDate;
  }
  if (updates.mainActivity !== undefined || updates.activity !== undefined) {
    dbUpdates.main_activity = updates.mainActivity || updates.activity;
  }
  if (updates.siteActivity !== undefined || updates.activity !== undefined) {
    dbUpdates.activity_at_site = updates.siteActivity || updates.activity;
  }
  if (updates.monitoringBy !== undefined) dbUpdates.monitoring_by = updates.monitoringBy;
  if (updates.surveyTool !== undefined) dbUpdates.survey_tool = updates.surveyTool;
  if (updates.useMarketDiversion !== undefined) dbUpdates.use_market_diversion = updates.useMarketDiversion;
  if (updates.useWarehouseMonitoring !== undefined) dbUpdates.use_warehouse_monitoring = updates.useWarehouseMonitoring;
  if (updates.notes !== undefined || updates.description !== undefined) {
    dbUpdates.comments = updates.notes || updates.description;
  }
  if (updates.status !== undefined) {
    dbUpdates.status = mapStatusToDb(updates.status);
  }
  if (updates.fees !== undefined) {
    if (updates.fees.total !== undefined) dbUpdates.cost = updates.fees.total;
    if (updates.fees.baseFee !== undefined || updates.fees.baseAmount !== undefined) {
      dbUpdates.enumerator_fee = updates.fees.baseFee || updates.fees.baseAmount;
    }
    if (updates.fees.transportation !== undefined) dbUpdates.transport_fee = updates.fees.transportation;
  }
  if (updates.assignedBy !== undefined) dbUpdates.dispatched_by = updates.assignedBy;
  if (updates.assignedAt !== undefined) dbUpdates.dispatched_at = updates.assignedAt;
  
  // Handle additional_data updates
  if (updates.coordinates || updates.location || updates.arrivalLatitude || 
      updates.arrivalLongitude || updates.arrivalTimestamp || updates.journeyPath || 
      updates.arrivalRecorded !== undefined) {
    // First, get the current additional_data
    const { data: currentData } = await supabase
      .from('mmp_site_entries')
      .select('additional_data')
      .eq('id', id)
      .single();
    
    const currentAdditionalData = currentData?.additional_data || {};
    
    dbUpdates.additional_data = {
      ...currentAdditionalData,
      ...(updates.coordinates?.latitude !== undefined && { latitude: updates.coordinates.latitude }),
      ...(updates.coordinates?.longitude !== undefined && { longitude: updates.coordinates.longitude }),
      ...(updates.location?.latitude !== undefined && { latitude: updates.location.latitude }),
      ...(updates.location?.longitude !== undefined && { longitude: updates.location.longitude }),
      ...(updates.arrivalLatitude !== undefined && { arrival_latitude: updates.arrivalLatitude }),
      ...(updates.arrivalLongitude !== undefined && { arrival_longitude: updates.arrivalLongitude }),
      ...(updates.arrivalTimestamp !== undefined && { arrival_timestamp: updates.arrivalTimestamp }),
      ...(updates.journeyPath !== undefined && { journey_path: updates.journeyPath }),
      ...(updates.arrivalRecorded !== undefined && { arrival_recorded: updates.arrivalRecorded }),
    };
  }
  
  // Perform the update
  const { error: updateError } = await supabase
    .from('mmp_site_entries')
    .update(dbUpdates)
    .eq('id', id);
  
  if (updateError) {
    console.error('Error updating mmp_site_entry:', updateError);
    throw updateError;
  }
  
  // Fetch the updated record
  const { data, error } = await supabase
    .from('mmp_site_entries')
    .select(`
      *,
      mmp_files (
        id,
        mmp_id,
        name,
        uploaded_by,
        uploaded_at,
        approved_by,
        approved_at,
        hub,
        month,
        project_id
      )
    `)
    .eq('id', id)
    .single();
  
  if (error) {
    console.error('Error fetching updated mmp_site_entry:', error);
    throw error;
  }
  
  return mapMMPSiteEntryToSiteVisit(data);
};

/**
 * Deletes an mmp_site_entry
 */
export const deleteMMPSiteEntry = async (id: string): Promise<boolean> => {
  const { error } = await supabase
    .from('mmp_site_entries')
    .delete()
    .eq('id', id);
  
  if (error) {
    console.error('Error deleting mmp_site_entry:', error);
    throw error;
  }
  
  return true;
};
