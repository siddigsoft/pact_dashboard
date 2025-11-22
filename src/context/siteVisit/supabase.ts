
import { supabase } from '@/integrations/supabase/client';
import { SiteVisit } from '@/types';
import { 
  fetchSiteVisitsFromMMPEntries, 
  mapMMPSiteEntryToSiteVisit,
  createMMPSiteEntry,
  updateMMPSiteEntry,
  deleteMMPSiteEntry,
  getOrCreateDefaultMMPFile
} from './mmpSiteEntriesAdapter';

/**
 * Fetches site visits from mmp_site_entries table
 */
export const fetchSiteVisits = async (): Promise<SiteVisit[]> => {
  return await fetchSiteVisitsFromMMPEntries();
};

/**
 * Transform site_visits table data to SiteVisit format
 */
const transformSiteVisitsData = (data: any[]): SiteVisit[] => {
  // Transform the snake_case database fields to camelCase for the frontend
  // Map mmp_site_entries to SiteVisit format
  const transformedData = data?.map(entry => {
    const additionalData = entry.additional_data || {};
    const enumeratorFee = entry.enumerator_fee || additionalData.enumerator_fee || 20;
    const transportFee = entry.transport_fee || additionalData.transport_fee || 10;
    const totalCost = entry.cost || (enumeratorFee + transportFee);
    const fees = {
      total: totalCost,
      currency: 'SDG',
      distanceFee: transportFee,
      complexityFee: 0,
      urgencyFee: 0,
      baseAmount: enumeratorFee,
      transportation: transportFee
    };
    
    return {
      id: entry.id,
      siteName: entry.site_name,
      siteCode: entry.site_code,
      status: entry.status || 'Pending',
      locality: entry.locality,
      state: entry.state,
      activity: entry.activity_at_site || entry.main_activity,
      priority: additionalData.priority || 'medium',
      dueDate: entry.visit_date ? new Date(entry.visit_date).toISOString() : undefined,
      assignedTo: additionalData.assigned_to || undefined,
      assignedBy: additionalData.assigned_by || undefined,
      assignedAt: additionalData.assigned_at || undefined,
      notes: entry.comments,
      attachments: additionalData.attachments || [],
      completedAt: additionalData.completed_at || undefined,
      rating: additionalData.rating || undefined,
      fees: fees,
      scheduledDate: entry.visit_date ? new Date(entry.visit_date).toISOString() : undefined,
      description: entry.comments,
      // Additional fields
      hub: entry.hub_office || "",
      cpName: entry.cp_name,
      // Monitoring Plan Structure Fields
      hubOffice: entry.hub_office || "Farchana Hub",
      siteActivity: entry.activity_at_site || "GFA",
      monitoringBy: entry.monitoring_by || "PACT",
      surveyTool: entry.survey_tool || "PDM",
      useMarketDiversion: entry.use_market_diversion || false,
      useWarehouseMonitoring: entry.use_warehouse_monitoring || false,
      arrivalLatitude: additionalData.arrival_latitude || undefined,
      arrivalLongitude: additionalData.arrival_longitude || undefined,
      arrivalTimestamp: additionalData.arrival_timestamp || undefined,
      journeyPath: additionalData.journey_path || undefined,
      arrivalRecorded: additionalData.arrival_recorded || false,
      permitDetails: additionalData.permitDetails || {
        federal: false,
        state: false,
        locality: false
      },
      location: additionalData.location || {
        address: "",
        latitude: 0,
        longitude: 0,
        region: entry.state || ""
      },
      coordinates: additionalData.location ? {
        latitude: additionalData.location.latitude || 0,
        longitude: additionalData.location.longitude || 0
      } : {
        latitude: 0,
        longitude: 0
      },
      mmpDetails: {
        mmpId: entry.mmp_file_id || "",
        projectName: "",
        uploadedBy: "",
        uploadedAt: "",
        region: entry.state || ""
      },
      complexity: additionalData.complexity || "medium",
      visitType: entry.visit_type || "regular",
      visitTypeRaw: additionalData.visitTypeRaw,
      mainActivity: entry.main_activity || "",
      projectActivities: additionalData.projectActivities || [],
      createdAt: entry.created_at
    };
  });
  
  return transformedData as SiteVisit[];
};

export const createSiteVisitInDb = async (siteVisit: Partial<SiteVisit>) => {
  // Determine if this is MMP-related (has mmpId or mmpDetails)
  const mmpFileId = (siteVisit as any).mmpId || siteVisit.mmpDetails?.mmpId;
  
  // If no mmpFileId provided, use default MMP file for standalone visits
  let finalMmpFileId = mmpFileId;
  if (!finalMmpFileId) {
    console.log('No MMP context provided, creating/using default MMP file for standalone visit');
    try {
      finalMmpFileId = await getOrCreateDefaultMMPFile();
    } catch (defaultError) {
      console.error('Failed to create default MMP file:', defaultError);
      throw new Error(
        'Unable to create site visit: could not create default MMP file. ' +
        'Please ensure the database is properly initialized.'
      );
    }
  }
  
  console.log(`✅ Creating site visit in mmp_site_entries with MMP file ID: ${finalMmpFileId}`);
  return await createMMPSiteEntry(finalMmpFileId, siteVisit);
};

export const deleteSiteVisitInDb = async (id: string) => {
  return await deleteMMPSiteEntry(id);
};

export const updateSiteVisitInDb = async (id: string, updates: Partial<SiteVisit>) => {
  // Get current entry first
  const { data: currentEntry, error: fetchError } = await supabase
    .from('mmp_site_entries')
    .select('*')
    .eq('id', id)
    .single();
    
  if (fetchError || !currentEntry) {
    console.error('Error fetching site entry:', fetchError);
    throw fetchError || new Error('Site entry not found');
  }
  
  // Transform camelCase to snake_case for mmp_site_entries
  const dbUpdates: any = {};
  const additionalData = { ...(currentEntry.additional_data || {}) };
  
  // Direct column updates
  if (updates.siteName !== undefined) dbUpdates.site_name = updates.siteName;
  if (updates.siteCode !== undefined) dbUpdates.site_code = updates.siteCode;
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.locality !== undefined) dbUpdates.locality = updates.locality;
  if (updates.state !== undefined) dbUpdates.state = updates.state;
  if (updates.mainActivity !== undefined) dbUpdates.main_activity = updates.mainActivity;
  if (updates.siteActivity !== undefined) dbUpdates.activity_at_site = updates.siteActivity;
  if (updates.activity !== undefined) dbUpdates.activity_at_site = updates.activity;
  if (updates.notes !== undefined) dbUpdates.comments = updates.notes;
  if (updates.hubOffice !== undefined) dbUpdates.hub_office = updates.hubOffice;
  if (updates.hub !== undefined) dbUpdates.hub_office = updates.hub;
  if (updates.cpName !== undefined) dbUpdates.cp_name = updates.cpName;
  if (updates.monitoringBy !== undefined) dbUpdates.monitoring_by = updates.monitoringBy;
  if (updates.surveyTool !== undefined) dbUpdates.survey_tool = updates.surveyTool;
  if (updates.useMarketDiversion !== undefined) dbUpdates.use_market_diversion = updates.useMarketDiversion;
  if (updates.useWarehouseMonitoring !== undefined) dbUpdates.use_warehouse_monitoring = updates.useWarehouseMonitoring;
  if (updates.visitType !== undefined) dbUpdates.visit_type = updates.visitType;
  
  if (updates.dueDate !== undefined) {
    const date = new Date(updates.dueDate);
    dbUpdates.visit_date = isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
  }
  
  if (updates.fees !== undefined) {
    dbUpdates.cost = updates.fees.total || 0;
    // Map fees structure - use baseAmount as enumerator_fee and transportation as transport_fee
    if (updates.fees.baseAmount !== undefined) dbUpdates.enumerator_fee = updates.fees.baseAmount;
    if (updates.fees.transportation !== undefined) dbUpdates.transport_fee = updates.fees.transportation;
    // Also check for direct enumerator_fee/transport_fee if present (for backward compatibility)
    if ((updates.fees as any).enumerator_fee !== undefined) dbUpdates.enumerator_fee = (updates.fees as any).enumerator_fee;
    if ((updates.fees as any).transport_fee !== undefined) dbUpdates.transport_fee = (updates.fees as any).transport_fee;
  }
  
  // Store workflow fields in additional_data
  if (updates.priority !== undefined) additionalData.priority = updates.priority;
  if (updates.assignedTo !== undefined) additionalData.assigned_to = updates.assignedTo;
  if (updates.assignedBy !== undefined) additionalData.assigned_by = updates.assignedBy;
  if (updates.assignedAt !== undefined) additionalData.assigned_at = updates.assignedAt;
  if (updates.attachments !== undefined) additionalData.attachments = updates.attachments;
  if (updates.completedAt !== undefined) additionalData.completed_at = updates.completedAt;
  if (updates.rating !== undefined) additionalData.rating = updates.rating;
  if (updates.permitDetails !== undefined) additionalData.permitDetails = updates.permitDetails;
  if (updates.complexity !== undefined) additionalData.complexity = updates.complexity;
  if (updates.visitTypeRaw !== undefined) additionalData.visitTypeRaw = updates.visitTypeRaw;
  if (updates.projectActivities !== undefined) additionalData.projectActivities = updates.projectActivities;
  if (updates.mmpDetails !== undefined) additionalData.mmpDetails = updates.mmpDetails;
  if (updates.location !== undefined) additionalData.location = updates.location;
  if (updates.arrivalLatitude !== undefined) additionalData.arrival_latitude = updates.arrivalLatitude;
  if (updates.arrivalLongitude !== undefined) additionalData.arrival_longitude = updates.arrivalLongitude;
  if (updates.arrivalTimestamp !== undefined) additionalData.arrival_timestamp = updates.arrivalTimestamp;
  if (updates.journeyPath !== undefined) additionalData.journey_path = updates.journeyPath;
  if (updates.arrivalRecorded !== undefined) additionalData.arrival_recorded = updates.arrivalRecorded;
  
  dbUpdates.additional_data = additionalData;
  
  // Update the entry
  const { error: updateError } = await supabase
    .from('mmp_site_entries')
    .update(dbUpdates)
    .eq('id', id);
    
  if (updateError) {
    console.error('Error updating site entry:', updateError);
    throw updateError;
  }
  
  // Fetch the updated data
  const { data: updatedData, error: fetchUpdatedError } = await supabase
    .from('mmp_site_entries')
    .select('*')
    .eq('id', id)
    .single();
    
  if (fetchUpdatedError) {
    console.error('Error fetching updated site entry:', fetchUpdatedError);
    throw fetchUpdatedError;
  }
  
  // Transform back to camelCase for frontend use
  const ad = updatedData.additional_data || {};
  const enumeratorFee = updatedData.enumerator_fee || ad.enumerator_fee || 20;
  const transportFee = updatedData.transport_fee || ad.transport_fee || 10;
  const totalCost = updatedData.cost || (enumeratorFee + transportFee);
  const fees = {
    total: totalCost,
    currency: 'SDG',
    distanceFee: transportFee,
    complexityFee: 0,
    urgencyFee: 0,
    baseAmount: enumeratorFee,
    transportation: transportFee
  };
  
  return {
    id: updatedData.id,
    siteName: updatedData.site_name,
    siteCode: updatedData.site_code,
    status: updatedData.status || 'Pending',
    locality: updatedData.locality,
    state: updatedData.state,
    activity: updatedData.activity_at_site || updatedData.main_activity,
    priority: ad.priority || 'medium',
    dueDate: updatedData.visit_date ? new Date(updatedData.visit_date).toISOString() : undefined,
    assignedTo: ad.assigned_to || undefined,
    assignedBy: ad.assigned_by || undefined,
    assignedAt: ad.assigned_at || undefined,
    notes: updatedData.comments,
    attachments: ad.attachments || [],
    completedAt: ad.completed_at || undefined,
    rating: ad.rating || undefined,
    fees: fees,
    scheduledDate: updatedData.visit_date ? new Date(updatedData.visit_date).toISOString() : undefined,
    description: updatedData.comments,
    hub: updatedData.hub_office || "",
    cpName: updatedData.cp_name,
    permitDetails: ad.permitDetails || {
      federal: false,
      state: false,
      locality: false
    },
    location: ad.location || {
      address: "",
      latitude: 0,
      longitude: 0,
      region: updatedData.state || ""
    },
    coordinates: ad.location ? {
      latitude: ad.location.latitude || 0,
      longitude: ad.location.longitude || 0
    } : {
      latitude: 0,
      longitude: 0
    },
    mmpDetails: {
      mmpId: updatedData.mmp_file_id || "",
      projectName: "",
      uploadedBy: "",
      uploadedAt: "",
      region: updatedData.state || ""
    },
    complexity: ad.complexity || "medium",
    visitType: updatedData.visit_type || "regular",
    visitTypeRaw: ad.visitTypeRaw,
    mainActivity: updatedData.main_activity || "",
    projectActivities: ad.projectActivities || [],
    hubOffice: updatedData.hub_office,
    siteActivity: updatedData.activity_at_site,
    monitoringBy: updatedData.monitoring_by,
    surveyTool: updatedData.survey_tool,
    useMarketDiversion: updatedData.use_market_diversion || false,
    useWarehouseMonitoring: updatedData.use_warehouse_monitoring || false,
    arrivalLatitude: ad.arrival_latitude,
    arrivalLongitude: ad.arrival_longitude,
    arrivalTimestamp: ad.arrival_timestamp,
    journeyPath: ad.journey_path,
    arrivalRecorded: ad.arrival_recorded || false,
    createdAt: updatedData.created_at
  } as SiteVisit;
};
