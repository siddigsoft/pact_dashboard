
import { supabase } from '@/integrations/supabase/client';
import { SiteVisit } from '@/types';

export const fetchSiteVisits = async () => {
  const { data, error } = await supabase
    .from('site_visits')
    .select('*');
    
  if (error) {
    console.error('Error fetching site visits:', error);
    throw error;
  }
  
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
    due_date: siteVisit.dueDate ? new Date(siteVisit.dueDate).toISOString() : null,
    notes: siteVisit.notes,
    main_activity: siteVisit.mainActivity,
    location: siteVisit.location,
    fees: siteVisit.fees,
    mmp_id: (siteVisit as any).mmpId || siteVisit.mmpDetails?.mmpId,
    visit_data: {
      permitDetails: siteVisit.permitDetails,
      complexity: siteVisit.complexity,
      visitType: siteVisit.visitType,
      projectActivities: siteVisit.projectActivities,
      mmpDetails: siteVisit.mmpDetails
    }
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
  if (updates.projectActivities !== undefined) {
    visitDataUpdates.projectActivities = updates.projectActivities;
    hasVisitDataUpdates = true;
  }
  if (updates.mmpDetails !== undefined) {
    visitDataUpdates.mmpDetails = updates.mmpDetails;
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
