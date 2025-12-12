import { supabase } from '@/integrations/supabase/client';

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

// Fetch Coordinator users (role = 'coordinator')
export async function fetchCoordinatorUsers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, username, email, hub_id, state_id, locality_id')
    .eq('role', 'coordinator')
    .order('full_name', { ascending: true });

  if (error) throw error;
  return data || [];
}

// Append forwarded FOM IDs to mmp_files.workflow
export async function appendForwardedToFom(mmpId: string, userIds: string[]) {
  if (!mmpId || !userIds?.length) return;

  const { data: row, error: fetchError } = await supabase
    .from('mmp_files')
    .select('workflow')
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

// Insert notifications helper
export async function insertNotifications(rows: any[]) {
  if (!rows?.length) return;
  const { error } = await supabase.from('notifications').insert(rows);
  if (error) throw error;
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

  if (updateError && updateError.code !== 'PGRST100') {
    // PGRST100 happens because we can't merge JSON easily via update; we'll do row-by-row fallback.
    const updates = siteEntryIds.map(async (id) => {
      const { data: existing, error: loadError } = await supabase
        .from('mmp_site_entries')
        .select('additional_data')
        .eq('id', id)
        .single();
      if (loadError) throw loadError;
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
      if (rowUpdateError) throw rowUpdateError;
    });
    await Promise.all(updates);
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

