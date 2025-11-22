
import { supabase } from '@/integrations/supabase/client';
import { SiteVisit } from '@/types';
import { 
  fetchSiteVisitsFromMMPEntries, 
  mapMMPSiteEntryToSiteVisit,
  createMMPSiteEntry,
  updateMMPSiteEntry,
  deleteMMPSiteEntry
} from './mmpSiteEntriesAdapter';

/**
 * Fetches site visits from both site_visits table and mmp_site_entries table
 * Tries site_visits first (if it exists), then falls back to mmp_site_entries
 */
export const fetchSiteVisits = async (): Promise<SiteVisit[]> => {
  // First, try to fetch from site_visits table
  try {
    const { data, error, status } = await supabase
      .from('site_visits')
      .select('*');
    
    // If site_visits table doesn't exist (status 42P01 = undefined_table)
    // or if it's empty, try mmp_site_entries
    if (error && (error.code === '42P01' || error.message.includes('does not exist'))) {
      console.log('site_visits table not found, using mmp_site_entries');
      return await fetchSiteVisitsFromMMPEntries();
    }
    
    if (error) {
      console.error('Error fetching site visits:', error);
      // Try fallback to mmp_site_entries
      try {
        return await fetchSiteVisitsFromMMPEntries();
      } catch (fallbackError) {
        console.error('Error fetching from mmp_site_entries:', fallbackError);
        throw error; // Throw original error
      }
    }
    
    // If we got data, transform and return it
    if (data && data.length > 0) {
      return transformSiteVisitsData(data);
    }
    
    // If site_visits is empty, try to fetch from mmp_site_entries as fallback
    console.log('site_visits table is empty, fetching from mmp_site_entries');
    return await fetchSiteVisitsFromMMPEntries();
    
  } catch (error) {
    console.error('Error in fetchSiteVisits:', error);
    // Final fallback to mmp_site_entries
    try {
      return await fetchSiteVisitsFromMMPEntries();
    } catch (fallbackError) {
      console.error('All fetch attempts failed:', fallbackError);
      return [];
    }
  }
};

/**
 * Transform site_visits table data to SiteVisit format
 */
const transformSiteVisitsData = (data: any[]): SiteVisit[] => {
  // Transform the snake_case database fields to camelCase for the frontend
  const transformedData = data?.map(visit => ({
    id: visit.id,
    siteName: visit.site_name,
    siteCode: visit.site_code,
    status: visit.status,
    locality: visit.locality,
    state: visit.state,
    activity: visit.activity,
    priority: visit.priority,
    dueDate: visit.due_date,
    assignedTo: visit.assigned_to,
    assignedBy: visit.assigned_by,
    assignedAt: visit.assigned_at,
    notes: visit.notes,
    attachments: visit.attachments,
    completedAt: visit.completed_at,
    rating: visit.rating,
    fees: visit.fees || {},
    scheduledDate: visit.due_date,
    description: visit.notes,
    // Additional fields persisted in visit_data
    hub: visit.visit_data?.hub || visit.hub || "",
    cpName: visit.visit_data?.cpName,
    // Monitoring Plan Structure Fields
    hubOffice: visit.visit_data?.hubOffice || visit.hub_office || "Farchana Hub",
    siteActivity: visit.visit_data?.siteActivity || visit.activity_at_site || visit.activity || "GFA",
    monitoringBy: visit.visit_data?.monitoringBy || visit.monitoring_by || "PACT",
    surveyTool: visit.visit_data?.surveyTool || visit.survey_tool || "PDM",
    useMarketDiversion: visit.visit_data?.useMarketDiversion || visit.use_market_diversion || false,
    useWarehouseMonitoring: visit.visit_data?.useWarehouseMonitoring || visit.use_warehouse_monitoring || false,
    arrivalLatitude: visit.arrival_latitude,
    arrivalLongitude: visit.arrival_longitude,
    arrivalTimestamp: visit.arrival_timestamp,
    journeyPath: visit.journey_path,
    arrivalRecorded: visit.arrival_recorded || false,
    permitDetails: visit.visit_data?.permitDetails || {
      federal: false,
      state: false,
      locality: false
    },
    location: visit.location || {
      address: "",
      latitude: 0,
      longitude: 0,
      region: visit.state || ""
    },
    coordinates: visit.location ? {
      latitude: visit.location.latitude || 0,
      longitude: visit.location.longitude || 0
    } : {
      latitude: 0,
      longitude: 0
    },
    mmpDetails: visit.visit_data?.mmpDetails || {
      mmpId: visit.mmp_id || "",
      projectName: "",
      uploadedBy: "",
      uploadedAt: "",
      region: visit.location?.region || ""
    },
    complexity: visit.visit_data?.complexity || "medium",
    visitType: visit.visit_data?.visitType || "regular",
    visitTypeRaw: visit.visit_data?.visitTypeRaw,
    mainActivity: visit.main_activity || "",
    projectActivities: visit.visit_data?.projectActivities || [],
    createdAt: visit.created_at
  }));
  
  return transformedData as SiteVisit[];
};

export const createSiteVisitInDb = async (siteVisit: Partial<SiteVisit>) => {
  // Transform camelCase to snake_case for the database
  const dbSiteVisit = {
    site_name: siteVisit.siteName,
    site_code: siteVisit.siteCode,
    status: siteVisit.status,
    locality: siteVisit.locality,
    state: siteVisit.state,
    activity: siteVisit.activity,
    priority: siteVisit.priority,
    due_date: siteVisit.dueDate ? (() => {
      const date = new Date(siteVisit.dueDate);
      return isNaN(date.getTime()) ? null : date.toISOString();
    })() : null,
    notes: siteVisit.notes,
    main_activity: siteVisit.mainActivity,
    location: siteVisit.location,
    fees: siteVisit.fees,
    mmp_id: (siteVisit as any).mmpId || siteVisit.mmpDetails?.mmpId,
    visit_data: {
      permitDetails: siteVisit.permitDetails,
      complexity: siteVisit.complexity,
      visitType: siteVisit.visitType,
      visitTypeRaw: siteVisit.visitTypeRaw,
      projectActivities: siteVisit.projectActivities,
      mmpDetails: siteVisit.mmpDetails,
      hub: siteVisit.hub,
      cpName: siteVisit.cpName,
      // Monitoring Plan Structure Fields
      hubOffice: siteVisit.hubOffice,
      siteActivity: siteVisit.siteActivity,
      monitoringBy: siteVisit.monitoringBy,
      surveyTool: siteVisit.surveyTool,
      useMarketDiversion: siteVisit.useMarketDiversion,
      useWarehouseMonitoring: siteVisit.useWarehouseMonitoring
    },
    // Direct database fields for monitoring plan
    hub_office: siteVisit.hubOffice,
    activity_at_site: siteVisit.siteActivity,
    monitoring_by: siteVisit.monitoringBy,
    survey_tool: siteVisit.surveyTool,
    use_market_diversion: siteVisit.useMarketDiversion,
    use_warehouse_monitoring: siteVisit.useWarehouseMonitoring,
    arrival_latitude: siteVisit.arrivalLatitude,
    arrival_longitude: siteVisit.arrivalLongitude,
    arrival_timestamp: siteVisit.arrivalTimestamp,
    journey_path: siteVisit.journeyPath,
    arrival_recorded: siteVisit.arrivalRecorded
  };
  
  // Insert and return the created row in one round-trip
  const { data, error } = await supabase
    .from('site_visits')
    .insert(dbSiteVisit)
    .select('*')
    .single();
    
  if (error) {
    console.error('Error fetching created site visit:', error);
    throw error;
  }
  
  // Transform back to camelCase for frontend use
  return {
    id: data.id,
    siteName: data.site_name,
    siteCode: data.site_code,
    status: data.status,
    locality: data.locality,
    state: data.state,
    activity: data.activity,
    priority: data.priority,
    dueDate: data.due_date,
    assignedTo: data.assigned_to,
    assignedBy: data.assigned_by,
    assignedAt: data.assigned_at,
    notes: data.notes,
    attachments: data.attachments,
    completedAt: data.completed_at,
    rating: data.rating,
    fees: data.fees || {},
    scheduledDate: data.due_date,
    description: data.notes,
    hub: data.visit_data?.hub || data.hub || "",
    cpName: data.visit_data?.cpName,
    permitDetails: data.visit_data?.permitDetails || {
      federal: false,
      state: false,
      locality: false
    },
    location: data.location || {
      address: "",
      latitude: 0,
      longitude: 0,
      region: data.state || ""
    },
    coordinates: data.location ? {
      latitude: data.location.latitude || 0,
      longitude: data.location.longitude || 0
    } : {
      latitude: 0,
      longitude: 0
    },
    mmpDetails: data.visit_data?.mmpDetails || {
      mmpId: data.mmp_id || "",
      projectName: "",
      uploadedBy: "",
      uploadedAt: "",
      region: data.location?.region || ""
    },
    complexity: data.visit_data?.complexity || "medium",
    visitType: data.visit_data?.visitType || "regular",
    visitTypeRaw: data.visit_data?.visitTypeRaw,
    mainActivity: data.main_activity || "",
    projectActivities: data.visit_data?.projectActivities || [],
    createdAt: data.created_at
  } as SiteVisit;
};

export const deleteSiteVisitInDb = async (id: string) => {
  const { error } = await supabase
    .from('site_visits')
    .delete()
    .eq('id', id);
  if (error) {
    console.error('Error deleting site visit:', error);
    throw error;
  }
  return true;
};

export const updateSiteVisitInDb = async (id: string, updates: Partial<SiteVisit>) => {
  // Transform camelCase to snake_case for the database
  const dbUpdates: any = {};
  
  if (updates.siteName !== undefined) dbUpdates.site_name = updates.siteName;
  if (updates.siteCode !== undefined) dbUpdates.site_code = updates.siteCode;
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.locality !== undefined) dbUpdates.locality = updates.locality;
  if (updates.state !== undefined) dbUpdates.state = updates.state;
  if (updates.activity !== undefined) dbUpdates.activity = updates.activity;
  if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
  if (updates.dueDate !== undefined) dbUpdates.due_date = updates.dueDate;
  if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
  if (updates.mainActivity !== undefined) dbUpdates.main_activity = updates.mainActivity;
  if (updates.location !== undefined) dbUpdates.location = updates.location;
  if (updates.fees !== undefined) dbUpdates.fees = updates.fees;
  
  if (updates.assignedTo !== undefined) dbUpdates.assigned_to = updates.assignedTo;
  if (updates.assignedBy !== undefined) dbUpdates.assigned_by = updates.assignedBy;
  if (updates.assignedAt !== undefined) dbUpdates.assigned_at = updates.assignedAt;
  if (updates.attachments !== undefined) dbUpdates.attachments = updates.attachments;
  if (updates.completedAt !== undefined) dbUpdates.completed_at = updates.completedAt;
  if (updates.rating !== undefined) dbUpdates.rating = updates.rating;
  
  // Handle nested properties within visit_data
  const visitDataUpdates: any = {};
  let hasVisitDataUpdates = false;
  
  if (updates.permitDetails !== undefined) {
    visitDataUpdates.permitDetails = updates.permitDetails;
    hasVisitDataUpdates = true;
  }
  if (updates.complexity !== undefined) {
    visitDataUpdates.complexity = updates.complexity;
    hasVisitDataUpdates = true;
  }
  if (updates.visitType !== undefined) {
    visitDataUpdates.visitType = updates.visitType;
    hasVisitDataUpdates = true;
  }
  if (updates.visitTypeRaw !== undefined) {
    visitDataUpdates.visitTypeRaw = updates.visitTypeRaw;
    hasVisitDataUpdates = true;
  }
  if (updates.projectActivities !== undefined) {
    visitDataUpdates.projectActivities = updates.projectActivities;
    hasVisitDataUpdates = true;
  }
  if ((updates as any).visitDate !== undefined) {
    (visitDataUpdates as any).visitDate = (updates as any).visitDate;
    hasVisitDataUpdates = true;
  }
  if (updates.mmpDetails !== undefined) {
    visitDataUpdates.mmpDetails = updates.mmpDetails;
    hasVisitDataUpdates = true;
  }
  if (updates.hub !== undefined) {
    visitDataUpdates.hub = updates.hub;
    hasVisitDataUpdates = true;
  }
  if (updates.cpName !== undefined) {
    visitDataUpdates.cpName = updates.cpName;
    hasVisitDataUpdates = true;
  }
  
  if (hasVisitDataUpdates) {
    dbUpdates.visit_data = visitDataUpdates;
  }
  
  // First update the data
  const { error: updateError } = await supabase
    .from('site_visits')
    .update(dbUpdates)
    .eq('id', id);
    
  if (updateError) {
    console.error('Error updating site visit:', updateError);
    throw updateError;
  }
  
  // Then fetch the updated data in a separate query
  const { data, error } = await supabase
    .from('site_visits')
    .select('*')
    .eq('id', id)
    .single();
    
  if (error) {
    console.error('Error fetching updated site visit:', error);
    throw error;
  }
  
  try {
    const mmpId = data?.mmp_id;
    const siteCode = data?.site_code;
    if (mmpId && siteCode) {
      const statusMap: Record<string, string> = {
        verified: 'Verified',
        rejected: 'Rejected',
        approved: 'Approved',
        completed: 'Completed',
      };
      // Get current entry to check existing cost
      const { data: currentEntry } = await supabase
        .from('mmp_site_entries')
        .select('cost, status, additional_data')
        .eq('mmp_file_id', mmpId)
        .eq('site_code', siteCode)
        .single();

      const updatePayload: any = {
        site_name: data.site_name ?? undefined,
        state: data.state ?? undefined,
        locality: data.locality ?? undefined,
        main_activity: data.main_activity ?? undefined,
        visit_date: (data.visit_data && data.visit_data.visitDate) ? data.visit_data.visitDate : (data.due_date ?? undefined),
        activity_at_site: data.activity_at_site ?? data.activity ?? undefined,
        monitoring_by: data.monitoring_by ?? (data.visit_data?.monitoringBy ?? undefined),
        survey_tool: data.survey_tool ?? (data.visit_data?.surveyTool ?? undefined),
        use_market_diversion: (typeof data.use_market_diversion !== 'undefined') ? data.use_market_diversion : (data.visit_data?.useMarketDiversion ?? undefined),
        use_warehouse_monitoring: (typeof data.use_warehouse_monitoring !== 'undefined') ? data.use_warehouse_monitoring : (data.visit_data?.useWarehouseMonitoring ?? undefined),
        comments: data.notes ?? undefined,
        cost: (() => { try { const t = Number(data?.fees?.total); return isNaN(t) ? undefined : t; } catch { return undefined; } })(),
      };
      
      if (typeof updates.status !== 'undefined') {
        const mapped = statusMap[String(updates.status).toLowerCase()];
        if (mapped) {
          updatePayload.status = mapped;
          
          // If status is being set to 'Verified' and cost is 0 or null, set default fees
          // Default: Enumerator fees ($20) + Transport fees ($10 minimum) = $30
          if (mapped === 'Verified') {
            const existingCost = currentEntry?.cost;
            const feesCost = updatePayload.cost;
            const additionalData = currentEntry?.additional_data || {};
            const existingEnumFee = additionalData?.enumerator_fee;
            const existingTransFee = additionalData?.transport_fee;
            
            // Only set default if no cost exists (0, null, undefined) and no cost from fees
            if ((!existingCost || existingCost === 0 || existingCost === null) && (!feesCost || feesCost === 0)) {
              additionalData.enumerator_fee = 20; // $20 enumerator fee
              additionalData.transport_fee = 10; // $10 transport fee (minimum)
              updatePayload.cost = 30; // Total: $30
              updatePayload.additional_data = additionalData;
            } else if ((!existingEnumFee || existingEnumFee === 0) && (!existingTransFee || existingTransFee === 0)) {
              // If cost exists but fees don't, set fees based on cost
              if (existingCost === 30) {
                additionalData.enumerator_fee = 20;
                additionalData.transport_fee = 10;
              } else if (existingCost) {
                additionalData.enumerator_fee = existingCost - 10;
                additionalData.transport_fee = 10;
              }
              updatePayload.additional_data = additionalData;
            }
          }
        }
      }
      Object.keys(updatePayload).forEach(k => updatePayload[k] === undefined && delete updatePayload[k]);
      if (Object.keys(updatePayload).length > 0) {
        await supabase
          .from('mmp_site_entries')
          .update(updatePayload)
          .eq('mmp_file_id', mmpId)
          .eq('site_code', siteCode);
      }
    }
  } catch (e) {
    console.warn('Non-fatal: failed to sync mmp_site_entries from site_visits update', e);
  }
  
  // Transform back to camelCase for frontend use
  return {
    id: data.id,
    siteName: data.site_name,
    siteCode: data.site_code,
    status: data.status,
    locality: data.locality,
    state: data.state,
    activity: data.activity,
    priority: data.priority,
    dueDate: data.due_date,
    assignedTo: data.assigned_to,
    assignedBy: data.assigned_by,
    assignedAt: data.assigned_at,
    notes: data.notes,
    attachments: data.attachments,
    completedAt: data.completed_at,
    rating: data.rating,
    fees: data.fees || {},
    scheduledDate: data.due_date,
    description: data.notes,
    permitDetails: data.visit_data?.permitDetails || {
      federal: false,
      state: false,
      locality: false
    },
    location: data.location || {
      address: "",
      latitude: 0,
      longitude: 0,
      region: data.state || ""
    },
    coordinates: data.location ? {
      latitude: data.location.latitude || 0,
      longitude: data.location.longitude || 0
    } : {
      latitude: 0,
      longitude: 0
    },
    mmpDetails: data.visit_data?.mmpDetails || {
      mmpId: data.mmp_id || "",
      projectName: "",
      uploadedBy: "",
      uploadedAt: "",
      region: data.location?.region || ""
    },
    complexity: data.visit_data?.complexity || "medium",
    visitType: data.visit_data?.visitType || "regular",
    mainActivity: data.main_activity || "",
    projectActivities: data.visit_data?.projectActivities || [],
    createdAt: data.created_at
  } as SiteVisit;
};
