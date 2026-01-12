import { supabase } from '@/integrations/supabase/client';
import { logForwardingAudit, logStatusChangeAudit } from '@/services/mmpAudit.service';

// Fetch FOM users (role = 'fom')
export async function fetchFomUsers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, username, email, hub_id, state_id, locality_id')
    .eq('role', 'fom')
    .order('full_name', { ascending: true });

  if (error) throw error;
  return data || [];
}

// Fetch Coordinator users (role = 'coordinator' - case insensitive)
export async function fetchCoordinatorUsers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, username, email, hub_id, state_id, locality_id')
    .or('role.eq.coordinator,role.eq.Coordinator,role.ilike.%coordinator%')
    .order('full_name', { ascending: true });

  if (error) throw error;
  return data || [];
}

// Append forwarded FOM IDs to mmp_files.workflow
export async function appendForwardedToFom(mmpId: string, userIds: string[]) {
  if (!mmpId || !userIds?.length) return;

  const { data: row, error: fetchError } = await supabase
    .from('mmp_files')
    .select('workflow, name, status')
    .eq('id', mmpId)
    .single();
  if (fetchError) throw fetchError;

  const now = new Date().toISOString();
  const wf = (row?.workflow as any) || {};
  const existing = Array.isArray(wf.forwardedToFomIds) ? wf.forwardedToFomIds : [];
  const forwardedToFomIds = Array.from(new Set([...existing, ...userIds]));
  const next = { ...wf, forwardedToFomIds, forwardedAt: now, lastUpdated: now };

  const { error: updateError } = await supabase
    .from('mmp_files')
    .update({ workflow: next })
    .eq('id', mmpId);
  if (updateError) throw updateError;

  // Log forwarding audit with timestamp
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const currentUser = sessionData?.session?.user;
    
    await logForwardingAudit(
      mmpId,
      row?.name || 'Unknown MMP',
      'to_fom',
      userIds,
      currentUser?.id || 'unknown',
      currentUser?.user_metadata?.full_name || currentUser?.email,
      currentUser?.email
    );
  } catch (auditError) {
    console.warn('[MMP Actions] Forward to FOM audit log failed:', auditError);
  }
}

// Clear forwarded workflow fields
export async function clearForwardedWorkflow(mmpId: string) {
  const { data: row, error: fetchError } = await supabase
    .from('mmp_files')
    .select('workflow')
    .eq('id', mmpId)
    .single();
  if (fetchError) throw fetchError;

  const wf = (row?.workflow as any) || {};
  const next = {
    ...wf,
    forwardedToFomIds: [],
    forwardedAt: null,
    lastUpdated: new Date().toISOString(),
  };

  const { error: updateError } = await supabase
    .from('mmp_files')
    .update({ workflow: next })
    .eq('id', mmpId);
  if (updateError) throw updateError;
}

// Insert notifications helper - maps to actual DB schema
// PREFERRED: Use new column names (recipient_id, title_en, title_ar, message_en, message_ar, event_type, etc.)
// DEPRECATED: Old column names (user_id, title, message, type, link) are still supported for backward compatibility
export async function insertNotifications(rows: any[]) {
  if (!rows?.length) return;
  
  // Database has extended columns: recipient_id, title_en, title_ar, message_en, message_ar, 
  // event_type, entity_id, entity_type, action_url, priority, status, etc.
  // Also has legacy columns: user_id, title, message, type, link, related_entity_id, related_entity_type
  // We'll populate both sets to ensure compatibility during migration period
  
  const sanitizedRows = rows.map(row => {
    // Extract values, preferring new column names
    const recipientId = row.recipient_id || row.user_id;
    const titleEn = row.title_en || row.title || '';
    const titleAr = row.title_ar || row.title || titleEn; // Fallback to English if Arabic not provided
    const messageEn = row.message_en || row.message || '';
    const messageAr = row.message_ar || row.message || messageEn; // Fallback to English if Arabic not provided
    const eventType = row.event_type || row.type || 'system';
    const entityId = row.entity_id || row.related_entity_id || null;
    const entityType = row.entity_type || row.related_entity_type || null;
    const actionUrl = row.action_url || row.link || null;
    const priority = row.priority || (row.type === 'error' ? 'urgent' : row.type === 'warning' ? 'high' : 'normal');
    
    // Warn if using deprecated columns
    if (row.user_id && !row.recipient_id) {
      console.warn('[insertNotifications] Using deprecated column "user_id". Please use "recipient_id" instead.');
    }
    if (row.title && !row.title_en) {
      console.warn('[insertNotifications] Using deprecated column "title". Please use "title_en" and "title_ar" instead.');
    }
    if (row.message && !row.message_en) {
      console.warn('[insertNotifications] Using deprecated column "message". Please use "message_en" and "message_ar" instead.');
    }
    if (row.link && !row.action_url) {
      console.warn('[insertNotifications] Using deprecated column "link". Please use "action_url" instead.');
    }
    if (row.type && !row.event_type) {
      console.warn('[insertNotifications] Using deprecated column "type". Please use "event_type" instead.');
    }
    
    // Map event_type to type for legacy columns (info, success, warning, error)
    let type = 'info';
    if (row.type && ['info', 'success', 'warning', 'error'].includes(row.type)) {
      type = row.type;
    } else if (priority === 'urgent') {
      type = 'error';
    } else if (priority === 'high') {
      type = 'warning';
    } else if (eventType === 'system') {
      type = 'info';
    }
    
    return {
      // New columns (primary) - REQUIRED
      recipient_id: recipientId,
      title_en: titleEn,
      title_ar: titleAr,
      message_en: messageEn,
      message_ar: messageAr,
      event_type: eventType,
      entity_id: entityId,
      entity_type: entityType,
      action_url: actionUrl,
      priority: priority,
      status: row.status || 'pending',
      // Legacy columns (for backward compatibility during migration)
      user_id: recipientId,
      title: titleEn, // Use English title for legacy column
      message: messageEn, // Use English message for legacy column
      type: type,
      link: actionUrl,
      related_entity_id: entityId,
      related_entity_type: entityType,
      is_read: false,
    };
  });
  const { error } = await supabase.from('notifications').insert(sanitizedRows);
  if (error) {
    console.error('[insertNotifications] Error inserting notifications:', error);
    throw error;
  }
}

// Batch update mmp_site_entries forwarding to coordinator
export async function forwardSitesToCoordinator(opts: {
  siteEntryIds: string[];
  coordinatorId: string;
  supervisorId?: string;
  currentUserId?: string;
  stateId?: string;
  attachStatePermit?: boolean;
  mmpName?: string;
  mmpId?: string;
}) {
  const {
    siteEntryIds,
    coordinatorId,
    supervisorId,
    currentUserId,
    stateId,
    attachStatePermit,
    mmpName,
    mmpId,
  } = opts;
  if (!siteEntryIds.length || !coordinatorId) return;

  const forwardedAt = new Date().toISOString();

  // Update entries
  const { error: updateError } = await supabase
    .from('mmp_site_entries')
    .update({
      status: 'Pending',
      forwarded_by_user_id: currentUserId || null,
      forwarded_to_user_id: coordinatorId,
      forwarded_at: forwardedAt,
      dispatched_by: currentUserId || null,
      dispatched_at: forwardedAt,
    })
    .in('id', siteEntryIds);

  if (updateError) {
    console.error('Batch update error:', updateError);
    // PGRST100 happens because we can't merge JSON easily via update; we'll do row-by-row fallback.
    // For other errors, still try row-by-row as a fallback before giving up.
    const updates = siteEntryIds.map(async (id) => {
      const { data: existing, error: loadError } = await supabase
        .from('mmp_site_entries')
        .select('additional_data')
        .eq('id', id)
        .single();
      if (loadError) {
        console.error(`Failed to load site entry ${id}:`, loadError);
        throw loadError;
      }
      const existingAD = existing?.additional_data || {};
      const nextAD = {
        ...existingAD,
        assigned_to: coordinatorId,
        assigned_by: currentUserId || null,
        assigned_at: forwardedAt,
        supervisor_id: supervisorId || null,
        notes: `Forwarded from MMP ${mmpName || mmpId || ''} for CP verification`,
        ...(attachStatePermit
          ? {
              state_permit_attached: true,
              state_permit_state_id: stateId,
              state_permit_attached_at: forwardedAt,
            }
          : {}),
      };

      const { error: rowUpdateError } = await supabase
        .from('mmp_site_entries')
        .update({
          status: 'Pending',
          forwarded_by_user_id: currentUserId || null,
          forwarded_to_user_id: coordinatorId,
          forwarded_at: forwardedAt,
          dispatched_by: currentUserId || null,
          dispatched_at: forwardedAt,
          additional_data: nextAD,
        })
        .eq('id', id);
      if (rowUpdateError) {
        console.error(`Failed to update site entry ${id}:`, rowUpdateError);
        throw rowUpdateError;
      }
    });
    await Promise.all(updates);
  } else {
    // Batch update succeeded, but we still need to update additional_data for each entry
    // since batch updates can't merge JSON fields
    const updates = siteEntryIds.map(async (id) => {
      const { data: existing, error: loadError } = await supabase
        .from('mmp_site_entries')
        .select('additional_data')
        .eq('id', id)
        .single();
      if (loadError) return; // Skip if can't load
      const existingAD = existing?.additional_data || {};
      const nextAD = {
        ...existingAD,
        assigned_to: coordinatorId,
        assigned_by: currentUserId || null,
        assigned_at: forwardedAt,
        supervisor_id: supervisorId || null,
        notes: `Forwarded from MMP ${mmpName || mmpId || ''} for CP verification`,
        ...(attachStatePermit
          ? {
              state_permit_attached: true,
              state_permit_state_id: stateId,
              state_permit_attached_at: forwardedAt,
            }
          : {}),
      };

      await supabase
        .from('mmp_site_entries')
        .update({ additional_data: nextAD })
        .eq('id', id);
    });
    await Promise.all(updates);
  }

  // Update parent MMP status to reflect coordinator forwarding
  if (mmpId) {
    // Get the current workflow data to preserve existing fields
    const { data: mmpData } = await supabase
      .from('mmp_files')
      .select('workflow')
      .eq('id', mmpId)
      .single();

    const existingWorkflow = mmpData?.workflow || {};
    const updatedWorkflow = {
      ...existingWorkflow,
      currentStage: 'forwarded_to_coordinator',
      forwardedToCoordinatorAt: forwardedAt,
      forwardedToCoordinatorBy: currentUserId || null,
      lastCoordinatorId: coordinatorId,
    };

    const { error: mmpUpdateError } = await supabase
      .from('mmp_files')
      .update({
        status: 'forwarded_to_coordinator',
        workflow: updatedWorkflow,
      })
      .eq('id', mmpId);

    if (mmpUpdateError) {
      console.error('Failed to update parent MMP status:', mmpUpdateError);
    } else {
      console.log(`[MMP] Updated MMP ${mmpId} status to forwarded_to_coordinator`);
    }
  }
}

// Location data service helpers
export async function fetchHubs() {
  const { data, error } = await supabase
    .from('hubs')
    .select('id, name, description, is_active')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return data || [];
}

export async function fetchHubStates() {
  const { data, error } = await supabase
    .from('hub_states')
    .select('hub_id, state_id, state_name, state_code')
    .order('state_name');
  if (error) throw error;
  return data || [];
}

export async function fetchStates() {
  const { data, error } = await supabase
    .from('hub_states')
    .select('state_id, state_name, state_code')
    .order('state_name');
  if (error) throw error;
  
  // Convert to State interface format and remove duplicates
  const uniqueStates: any[] = [];
  const seenStates = new Set<string>();
  
  (data || []).forEach(state => {
    if (!seenStates.has(state.state_id)) {
      seenStates.add(state.state_id);
      uniqueStates.push({
        id: state.state_id,
        name: state.state_name,
        code: state.state_code
      });
    }
  });
  
  return uniqueStates;
}

export async function fetchLocalities() {
  const { data, error } = await supabase
    .from('sites_registry')
    .select('locality_id, locality_name, state_id')
    .order('locality_name');
  if (error) throw error;
  
  // Convert to format and remove duplicates
  const uniqueLocalities: any[] = [];
  const seen = new Set<string>();
  
  (data || []).forEach(loc => {
    const key = `${loc.locality_id}-${loc.state_id}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueLocalities.push({
        id: loc.locality_id,
        name: loc.locality_name,
        state_id: loc.state_id
      });
    }
  });
  
  return uniqueLocalities;
}

// Fetch forwarded site entries for an MMP
export async function fetchForwardedSiteEntries(mmpFileId: string) {
  const { data, error } = await supabase
    .from('mmp_site_entries')
    .select('id, forwarded_at, forwarded_by_user_id, forwarded_to_user_id, dispatched_at, additional_data')
    .eq('mmp_file_id', mmpFileId);
  if (error) throw error;
  return data || [];
}

