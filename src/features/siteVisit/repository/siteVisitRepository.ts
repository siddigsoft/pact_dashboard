/**
 * Site Visit Repository — pure async DB access, no React, no toasts.
 * Re-exports all site visit DB functions consolidated under this module.
 */
import { supabase } from '@/integrations/supabase/client';
import { SiteVisit } from '@/types';
import {
  fetchSiteVisitsFromMMPEntries,
  mapMMPSiteEntryToSiteVisit,
  createMMPSiteEntry,
  updateMMPSiteEntry,
  deleteMMPSiteEntry,
  getOrCreateDefaultMMPFile,
} from './mmpSiteEntriesAdapter';

export {
  fetchSiteVisitsFromMMPEntries,
  mapMMPSiteEntryToSiteVisit,
  createMMPSiteEntry,
  updateMMPSiteEntry,
  deleteMMPSiteEntry,
  getOrCreateDefaultMMPFile,
};

/**
 * Fetches site visits from mmp_site_entries table, with fallback to site_visits table
 */
export const fetchSiteVisits = async (): Promise<SiteVisit[]> => {
  // Primary and only source: mmp_site_entries
  const mmpEntries = await fetchSiteVisitsFromMMPEntries();
  return mmpEntries;
};

/**
 * Fetches site visits directly from site_visits table
 */
export const fetchFromSiteVisitsTable = async (): Promise<SiteVisit[]> => {
  const { data, error } = await supabase
    .from('site_visits')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching site_visits:', error);
    return [];
  }

  return (data || []).map(transformSiteVisitToApp);
};

/**
 * Transform site_visits table record to SiteVisit format
 */
const transformSiteVisitToApp = (entry: any): SiteVisit => {
  const enumeratorFee = Number(entry.enumerator_fee || 0);
  const transportFee = Number(entry.transport_fee || 0);
  const totalCost = Number(entry.cost) || (enumeratorFee + transportFee);
  const location = entry.location || {};

  const addressParts = (location.address || '').split(',').map((s: string) => s.trim());
  const inferredRegion = addressParts.length > 1 ? addressParts[addressParts.length - 1] : (addressParts[0] || '');
  const inferredLocality = addressParts.length > 1 ? addressParts[0] : '';

  return {
    id: entry.id,
    siteName: entry.site_name || '',
    siteCode: entry.site_code || '',
    status: mapSiteVisitStatus(entry.status),
    locality: inferredLocality,
    state: inferredRegion,
    activity: entry.notes || '',
    priority: 'medium',
    dueDate: entry.visit_date ? new Date(entry.visit_date).toISOString() : new Date().toISOString(),
    assignedTo: entry.assigned_to || '',
    assignedBy: entry.completed_by || entry.assigned_to || '',
    assignedAt: entry.accepted_at || entry.created_at,
    notes: entry.notes || '',
    attachments: entry.photos || [],
    completedAt: entry.status === 'completed' ? entry.updated_at : undefined,
    rating: entry.rating,
    ratingNotes: undefined,
    fees: {
      total: totalCost,
      currency: 'SDG',
      distanceFee: 0,
      complexityFee: 0,
      urgencyFee: 0,
      baseAmount: enumeratorFee,
      baseFee: enumeratorFee,
      transportation: transportFee,
    },
    scheduledDate: entry.visit_date ? new Date(entry.visit_date).toISOString() : undefined,
    description: entry.notes || '',
    tasks: [],
    permitDetails: { federal: false, state: false, locality: false },
    location: {
      address: location.address || entry.site_name || '',
      latitude: location.lat || 0,
      longitude: location.lng || 0,
      region: inferredRegion,
    },
    coordinates: { latitude: location.lat || 0, longitude: location.lng || 0 },
    mmpDetails: { mmpId: entry.mmp_id || '', projectId: '', projectName: '', uploadedBy: '', uploadedAt: '', region: inferredRegion },
    complexity: 'medium',
    visitType: 'regular',
    visitTypeRaw: undefined,
    mainActivity: '',
    projectActivities: [],
    hub: '',
    cpName: '',
    team: {},
    resources: [],
    risks: '',
    estimatedDuration: '',
    visitHistory: [],
    monitoringType: undefined,
    createdAt: entry.created_at,
    projectName: '',
    startTime: undefined,
    hubOffice: '',
    siteActivity: '',
    monitoringBy: '',
    surveyTool: '',
    useMarketDiversion: false,
    useWarehouseMonitoring: false,
    region: inferredRegion,
    site_code: entry.site_code,
    transport_fee: transportFee,
    transportFee: transportFee,
    enumerator_fee: enumeratorFee,
    accepted_by: entry.assigned_to,
    acceptedBy: entry.assigned_to,
  };
};

const mapSiteVisitStatus = (status: string): SiteVisit['status'] => {
  const s = (status || '').toLowerCase();
  const statusMap: Record<string, SiteVisit['status']> = {
    'pending': 'pending',
    'assigned': 'assigned',
    'in progress': 'inProgress',
    'ongoing': 'inProgress',
    'completed': 'completed',
    'cancelled': 'cancelled',
    'canceled': 'canceled',
    'verified': 'permitVerified',
    'dispatched': 'assigned',
    'accepted': 'assigned',
  };
  return statusMap[s] || 'pending';
};

export const createSiteVisitInDb = async (siteVisit: Partial<SiteVisit>) => {
  const mmpFileId = (siteVisit as any).mmpId || siteVisit.mmpDetails?.mmpId;

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

/** Raw `mmp_site_entries` row for edit UIs that map `visit_data` / `location` locally. */
export async function fetchMmpSiteEntryRowById(id: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('mmp_site_entries')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as Record<string, unknown>;
}

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
    if (updates.fees.baseAmount !== undefined) dbUpdates.enumerator_fee = updates.fees.baseAmount;
    if (updates.fees.transportation !== undefined) dbUpdates.transport_fee = updates.fees.transportation;
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

  const ad = updatedData.additional_data || {};
  const enumeratorFee = Number(updatedData.enumerator_fee || 0);
  const transportFee = Number(updatedData.transport_fee || 0);
  const totalCost = updatedData.cost ?? (enumeratorFee + transportFee);
  const fees = {
    total: totalCost,
    currency: 'SDG',
    distanceFee: transportFee,
    complexityFee: 0,
    urgencyFee: 0,
    baseAmount: enumeratorFee,
    transportation: transportFee,
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
    fees,
    scheduledDate: updatedData.visit_date ? new Date(updatedData.visit_date).toISOString() : undefined,
    description: updatedData.comments,
    hub: updatedData.hub_office || '',
    cpName: updatedData.cp_name || (updatedData as any).mmp_files?.projects?.name || (updatedData as any).mmp_files?.project_name || '',
    permitDetails: ad.permitDetails || { federal: false, state: false, locality: false },
    location: ad.location || { address: '', latitude: 0, longitude: 0, region: updatedData.state || '' },
    coordinates: ad.location ? { latitude: ad.location.latitude || 0, longitude: ad.location.longitude || 0 } : { latitude: 0, longitude: 0 },
    mmpDetails: { mmpId: updatedData.mmp_file_id || '', projectName: '', uploadedBy: '', uploadedAt: '', region: updatedData.state || '' },
    complexity: ad.complexity || 'medium',
    visitType: updatedData.visit_type || 'regular',
    visitTypeRaw: ad.visitTypeRaw,
    mainActivity: updatedData.main_activity || '',
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
    createdAt: updatedData.created_at,
  } as SiteVisit;
};

// ---------------------------------------------------------------------------
// Helper queries used by SiteVisitContext business logic
// ---------------------------------------------------------------------------

/** Fetch profiles and user_roles for data collector auto-assignment. */
export async function fetchDataCollectorProfiles(): Promise<{
  profiles: Array<{ id: string; full_name: string | null; role: string | null; state_id: string | null; locality_id: string | null; hub_id: string | null; location: any; availability: string | null }>;
  roles: Array<{ user_id: string; role: string | null }>;
}> {
  const [{ data: profiles }, { data: roles }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, role, state_id, locality_id, hub_id, location, availability'),
    supabase.from('user_roles').select('*'),
  ]);
  return { profiles: (profiles || []) as any[], roles: (roles || []) as any[] };
}

/** Fetch workload counts from mmp_site_entries (for auto-assignment scoring). */
export async function fetchMmpSiteEntryWorkloads(): Promise<Array<{ additional_data: any; status: string }>> {
  const { data } = await supabase
    .from('mmp_site_entries')
    .select('additional_data, status');
  return (data || []) as Array<{ additional_data: any; status: string }>;
}

/** Fetch mmp_site_entry ids for a hub/activity (for coverage stats). */
export async function fetchMmpSiteEntryIdsForActivity(
  hubId: string,
  activityName: string,
  statusFilter?: string,
): Promise<{ byMainActivity: string[]; byActivityAtSite: string[] }> {
  const [mainQuery, siteQuery] = await Promise.all([
    supabase
      .from('mmp_site_entries')
      .select('id')
      .eq('hub_office', hubId)
      .eq('main_activity', activityName)
      .then(r => r),
    supabase
      .from('mmp_site_entries')
      .select('id')
      .eq('hub_office', hubId)
      .eq('activity_at_site', activityName)
      .then(r => r),
  ]);

  if (statusFilter) {
    const [mainFiltered, siteFiltered] = await Promise.all([
      supabase
        .from('mmp_site_entries')
        .select('id')
        .eq('hub_office', hubId)
        .eq('main_activity', activityName)
        .eq('status', statusFilter),
      supabase
        .from('mmp_site_entries')
        .select('id')
        .eq('hub_office', hubId)
        .eq('activity_at_site', activityName)
        .eq('status', statusFilter),
    ]);
    return {
      byMainActivity: (mainFiltered.data || []).map(s => s.id),
      byActivityAtSite: (siteFiltered.data || []).map(s => s.id),
    };
  }

  return {
    byMainActivity: (mainQuery.data || []).map(s => s.id),
    byActivityAtSite: (siteQuery.data || []).map(s => s.id),
  };
}

/** Site entries accepted by a user (admin wallet work tab). */
export function fetchMmpSiteEntriesAcceptedByUser(userId: string, limit = 100) {
  return supabase
    .from('mmp_site_entries')
    .select(
      'id, site_name, site_code, status, state, locality, accepted_at, visit_completed_at, enumerator_fee, transport_fee, cost',
    )
    .eq('accepted_by', userId)
    .order('accepted_at', { ascending: false })
    .limit(limit);
}

/** Fee fields for recalculating earning transactions against site rows. */
export function fetchMmpSiteEntryFeeFieldsByIds(ids: string[]) {
  if (ids.length === 0) {
    return Promise.resolve({ data: [] as Record<string, unknown>[], error: null });
  }
  return supabase
    .from('mmp_site_entries')
    .select('id, site_name, site_code, enumerator_fee, transport_fee, cost')
    .in('id', ids);
}

/** Raw rows for an MMP file when context has no siteEntries yet (detail view). */
export function fetchMmpSiteEntriesRowsByMmpFileId(mmpFileId: string) {
  return supabase.from('mmp_site_entries').select('*').eq('mmp_file_id', mmpFileId);
}
