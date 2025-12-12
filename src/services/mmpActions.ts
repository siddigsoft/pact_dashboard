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

