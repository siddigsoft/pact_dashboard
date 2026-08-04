import { supabase } from '@/integrations/supabase/client';
import { ensureValidSession } from '@/lib/session-health';
import { insertNotificationsToDb } from '@/services/notification-insert';
import { logForwardingAudit, logStatusChangeAudit, logSiteEntryAction } from '@/services/mmpAudit.service';

// Fetch FOM users — role stored as 'fom' or 'Field Operation Manager (FOM)'
export async function fetchFomUsers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, username, email, hub_id, state_id, locality_id')
    .in('role', ['fom', 'FOM', 'Field Operation Manager (FOM)', 'field_operation_manager'])
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

  const session = await ensureValidSession();
  if (!session.success) return;

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
  await insertNotificationsToDb(sanitizedRows);
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
  const notes = `Forwarded from MMP ${mmpName || mmpId || ''} for CP verification`;

  const { error: rpcError } = await supabase.rpc('forward_mmp_site_entries', {
    p_ids: siteEntryIds,
    p_coordinator_id: coordinatorId,
    p_supervisor_id: supervisorId || null,
    p_current_user_id: currentUserId || null,
    p_state_id: stateId || null,
    p_attach_state_permit: !!attachStatePermit,
    p_notes: notes,
    p_forwarded_at: forwardedAt,
  });

  if (rpcError) {
    console.error('forward_mmp_site_entries RPC failed:', rpcError);
    throw rpcError;
  }

  // Log per-site audit entries for the forward operation
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const actor = sessionData?.session?.user;
    await Promise.all(
      siteEntryIds.map(id =>
        logSiteEntryAction({
          siteId: id,
          siteName: id,
          mmpId: mmpId,
          action: 'forward_to_coordinator',
          newStatus: 'Pending',
          performedBy: currentUserId || actor?.id || 'unknown',
          performedByName: actor?.user_metadata?.full_name || actor?.email,
          performedByEmail: actor?.email,
          metadata: {
            coordinatorId,
            supervisorId,
            forwardedAt,
            attachStatePermit,
            stateId,
          },
        }).catch(err => console.warn('[MMP Actions] Site forward audit failed:', err))
      )
    );
  } catch (auditErr) {
    console.warn('[MMP Actions] Forward-to-coordinator audit block failed:', auditErr);
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

// Reclaim MMP from coordinators back to FOM
export async function reclaimFromCoordinator(opts: {
  mmpId: string;
  reason: string;
  reasonCategory: string;
  currentUserId: string;
  additionalNotes?: string;
  coordinatorId?: string;
}) {
  const { mmpId, reason, reasonCategory, currentUserId, additionalNotes, coordinatorId } = opts;
  if (!mmpId) return;

  const now = new Date().toISOString();

  // 1. Get current MMP data
  const { data: mmpData, error: fetchError } = await supabase
    .from('mmp_files')
    .select('workflow, name, status')
    .eq('id', mmpId)
    .single();
  if (fetchError) throw fetchError;

  const wf = (mmpData?.workflow as any) || {};
  
  // 2. Build reclaim history entry
  const reclaimEntry = {
    reclaimedAt: now,
    reclaimedBy: currentUserId,
    reason: reason,
    reasonCategory: reasonCategory,
    additionalNotes: additionalNotes || '',
    previousStage: wf.currentStage || 'forwarded_to_coordinator',
    previousCoordinatorId: wf.lastCoordinatorId || null,
  };

  const reclaimHistory = Array.isArray(wf.reclaimHistory) ? [...wf.reclaimHistory, reclaimEntry] : [reclaimEntry];

  // 3. Get all site entries for this MMP
  const { data: siteEntries, error: entriesError } = await supabase
    .from('mmp_site_entries')
    .select('id, forwarded_to_user_id, accepted_by, forwarded_at, dispatched_at, additional_data, status')
    .eq('mmp_file_id', mmpId);
  if (entriesError) throw entriesError;

  const getEntryCoordinator = (e: any): string | null => {
    return e.forwarded_to_user_id || e.accepted_by || e.additional_data?.assigned_to || null;
  };

  // 4. Filter entries based on whether reclaiming from a specific coordinator or all
  const forwardedEntries = (siteEntries || []).filter((e: any) => {
    const coordForEntry = getEntryCoordinator(e);
    if (!coordForEntry) return false;

    if (coordinatorId) {
      return coordForEntry === coordinatorId;
    }
    return true;
  });

  const forwardedEntryIds = forwardedEntries.map((e: any) => e.id);

  // 5. Check if after reclaim there are still other active coordinators with sites
  const remainingAssigned = coordinatorId
    ? (siteEntries || []).filter((e: any) => {
        if (forwardedEntryIds.includes(e.id)) return false;
        const coordForEntry = getEntryCoordinator(e);
        return !!coordForEntry;
      })
    : [];
  const hasRemainingCoordinators = remainingAssigned.length > 0;

  // 6. Only revert MMP status to forwarded_to_fom if reclaiming ALL or no coordinators remain
  if (!coordinatorId || !hasRemainingCoordinators) {
    const updatedWorkflow = {
      ...wf,
      currentStage: 'forwarded_to_fom',
      reclaimedFromCoordinator: true,
      reclaimedAt: now,
      reclaimedBy: currentUserId,
      reclaimReason: reason,
      reclaimReasonCategory: reasonCategory,
      reclaimHistory: reclaimHistory,
      lastUpdated: now,
      forwardedToCoordinatorAt: null,
      forwardedToCoordinatorBy: null,
      lastCoordinatorId: null,
    };

    const { error: mmpUpdateError } = await supabase
      .from('mmp_files')
      .update({
        status: 'forwarded_to_fom',
        workflow: updatedWorkflow,
      })
      .eq('id', mmpId);
    if (mmpUpdateError) throw mmpUpdateError;
  } else {
    const updatedWorkflow = {
      ...wf,
      reclaimHistory: reclaimHistory,
      lastUpdated: now,
    };

    const { error: mmpUpdateError } = await supabase
      .from('mmp_files')
      .update({
        workflow: updatedWorkflow,
      })
      .eq('id', mmpId);
    if (mmpUpdateError) throw mmpUpdateError;
  }

  // 7. Reset the filtered site entries (single RPC — JSONB keys stripped server-side)
  if (forwardedEntryIds.length > 0) {
    const { error: reclaimRpcError } = await supabase.rpc('reclaim_mmp_site_entries', {
      p_ids: forwardedEntryIds,
    });
    if (reclaimRpcError) {
      console.error('reclaim_mmp_site_entries RPC failed:', reclaimRpcError);
      throw reclaimRpcError;
    }

    // ── FIX: Cancel any open (pending) advance requests for the reclaimed entries ──
    // When a site is reclaimed the collector who held it is no longer responsible.
    // Leaving their advance open would (a) block any new collector from submitting
    // an advance and (b) allow double-payment if the old request is later approved.
    // We cancel only truly-open statuses — paid/partially-paid rows need human review.
    try {
      const CANCELLABLE = ['pending_supervisor', 'pending_admin'];
      const { data: openAdvances, error: advFetchErr } = await supabase
        .from('down_payment_requests')
        .select('id, status, requested_by, site_name, requested_amount')
        .in('mmp_site_entry_id', forwardedEntryIds)
        .in('status', CANCELLABLE);

      if (advFetchErr) {
        console.warn('[MMP Reclaim] Could not fetch open advances to cancel:', advFetchErr.message);
      } else if (openAdvances && openAdvances.length > 0) {
        const advanceIds = openAdvances.map((a: any) => a.id);

        // Cancel each advance individually so we can safely merge the metadata note
        // without overwriting existing fields (a bulk .update() would replace the whole jsonb).
        await Promise.all(
          (openAdvances as any[]).map(async (adv: any) => {
            const mergedMeta = {
              ...(adv.metadata ?? {}),
              auto_cancelled_reason: `Auto-cancelled: site reclaimed on ${now}. Reason: ${reasonCategory} — ${reason}`,
              reclaimed_by: currentUserId,
            };
            const { error: cancelErr } = await supabase
              .from('down_payment_requests')
              .update({ status: 'cancelled', updated_at: now, metadata: mergedMeta })
              .eq('id', adv.id);
            if (cancelErr) {
              console.warn(`[MMP Reclaim] Failed to cancel advance ${adv.id}:`, cancelErr.message);
            }
          })
        );

        console.log(
          `[MMP Reclaim] Auto-cancelled ${advanceIds.length} open advance(s) for reclaimed sites:`,
          openAdvances.map((a: any) => a.site_name).join(', '),
        );

        // ── Notify finance / admin / supervisors about the auto-cancelled advances ──
        try {
          // Build a human-readable list of voided advances
          const advanceLines = (openAdvances as any[]).map((a: any) => {
            const amount = a.requested_amount
              ? `SDG ${Number(a.requested_amount).toLocaleString()}`
              : '';
            return a.site_name ? `${a.site_name}${amount ? ` (${amount})` : ''}` : a.id;
          });
          const advanceListText = advanceLines.join(', ');
          const mmpName = mmpData?.name || mmpId;

          const notifTitle = `Advance Requests Auto-Cancelled — ${mmpName}`;
          const notifTitleAr = `طلبات السلف ألغيت تلقائياً — ${mmpName}`;
          const notifMessage =
            `${advanceIds.length} advance request(s) were automatically cancelled when sites were reclaimed from coordinator. ` +
            `Reason: ${reasonCategory} — ${reason}. Affected sites: ${advanceListText}.`;
          const notifMessageAr =
            `تم إلغاء ${advanceIds.length} طلب(ات) سلفة تلقائياً عند استعادة المواقع من المنسق. ` +
            `السبب: ${reasonCategory} — ${reason}. المواقع المتأثرة: ${advanceListText}.`;
          const actionUrl = `/advance-requests?mmp=${mmpId}`;

          // Fetch finance and admin users to notify
          const { data: financeAdminUsers } = await supabase
            .from('profiles')
            .select('id, role')
            .in('role', [
              'financial_admin', 'finance',
              'admin', 'Admin',
              'superAdmin', 'super_admin', 'SuperAdmin',
            ])
            .eq('status', 'approved');

          // Also fetch hub supervisors if we know the hub
          let supervisorUsers: any[] = [];
          if (mmpData) {
            const { data: mmpHubData } = await supabase
              .from('mmp_files')
              .select('hub_id')
              .eq('id', mmpId)
              .single();
            if (mmpHubData?.hub_id) {
              const { data: supervisors } = await supabase
                .from('profiles')
                .select('id, role')
                .eq('role', 'supervisor')
                .eq('hub_id', mmpHubData.hub_id)
                .eq('status', 'approved');
              supervisorUsers = supervisors || [];
            }
          }

          // Combine recipients (deduplicated), always include the reclaimer
          const recipientSet = new Set<string>();
          (financeAdminUsers || []).forEach((u: any) => recipientSet.add(u.id));
          supervisorUsers.forEach((u: any) => recipientSet.add(u.id));
          recipientSet.add(currentUserId); // always notify the person who performed the reclaim

          const notifRows = Array.from(recipientSet).map((uid) => ({
            recipient_id: uid,
            user_id: uid,
            title_en: notifTitle,
            title_ar: notifTitleAr,
            message_en: notifMessage,
            message_ar: notifMessageAr,
            event_type: 'financial',
            entity_id: mmpId,
            entity_type: 'mmpFile',
            action_url: actionUrl,
            priority: 'high',
            status: 'pending',
            // Legacy columns
            title: notifTitle,
            message: notifMessage,
            link: actionUrl,
            related_entity_id: mmpId,
            related_entity_type: 'mmpFile',
            type: 'warning',
            is_read: false,
          }));

          if (notifRows.length > 0) {
            await insertNotificationsToDb(notifRows);
            console.log(
              `[MMP Reclaim] Sent advance-cancellation notifications to ${notifRows.length} recipient(s).`,
            );
          }
        } catch (notifErr) {
          // Non-fatal — never let notification errors block the reclaim
          console.warn('[MMP Reclaim] Failed to send advance-cancellation notifications:', notifErr);
        }
        // ────────────────────────────────────────────────────────────────────────
      }
    } catch (advErr) {
      // Non-fatal — log but don't abort the reclaim
      console.warn('[MMP Reclaim] Advance cancellation block failed:', advErr);
    }
    // ─────────────────────────────────────────────────────────────────────────
  }

  // Log MMP-level audit
  const newStatus = (!coordinatorId || !hasRemainingCoordinators) ? 'forwarded_to_fom' : 'forwarded_to_coordinator';
  try {
    await logStatusChangeAudit(
      'mmp',
      mmpId,
      mmpData?.name || 'Unknown MMP',
      mmpData?.status || 'forwarded_to_coordinator',
      newStatus,
      currentUserId,
      undefined,
      undefined,
      coordinatorId
        ? `Reclaimed from coordinator ${coordinatorId}: ${reasonCategory} - ${reason}`
        : `Reclaimed from all coordinators: ${reasonCategory} - ${reason}`
    );
  } catch (auditError) {
    console.warn('[MMP Actions] Reclaim audit log failed:', auditError);
  }

  // Log per-site audit entries for the reclaim
  if (forwardedEntryIds.length > 0) {
    try {
      await Promise.all(
        forwardedEntryIds.map(entryId => {
          const entry = (siteEntries || []).find((e: any) => e.id === entryId);
          return logSiteEntryAction({
            siteId: entryId,
            siteName: entry?.additional_data?.site_name ?? entry?.id ?? entryId,
            mmpId,
            action: 'reclaim_from_coordinator',
            previousStatus: entry?.status,
            newStatus: 'verified',
            performedBy: currentUserId,
            reason: `${reasonCategory}: ${reason}`,
            metadata: {
              previousCoordinatorId: coordinatorId ?? entry?.forwarded_to_user_id,
              reclaimedAt: now,
            },
          }).catch(err => console.warn(`[MMP Actions] Site reclaim audit failed for ${entryId}:`, err));
        })
      );
    } catch (siteAuditError) {
      console.warn('[MMP Actions] Per-site reclaim audit block failed:', siteAuditError);
    }
  }

  return {
    affectedSites: forwardedEntryIds.length,
    mmpName: mmpData?.name || 'Unknown MMP',
    newStatus,
  };
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
  try {
    const { data, error } = await supabase
      .from('mmp_site_entries')
      .select('id, forwarded_at, forwarded_by_user_id, forwarded_to_user_id, dispatched_at, additional_data, status, verified_at, verified_by, accepted_by')
      .eq('mmp_file_id', mmpFileId);
    if (error) {
      if (error.message?.includes('column') || error.code === '42703') {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('mmp_site_entries')
          .select('id, dispatched_at, additional_data, status')
          .eq('mmp_file_id', mmpFileId);
        if (fallbackError) throw fallbackError;
        return fallbackData || [];
      }
      throw error;
    }
    return data || [];
  } catch (err) {
    console.error('fetchForwardedSiteEntries error:', err);
    return [];
  }
}

