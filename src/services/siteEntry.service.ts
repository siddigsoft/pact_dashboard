/**
 * Centralized site entry update service.
 *
 * Use `updateSiteEntryWithAudit` instead of calling supabase directly when
 * changing meaningful fields on mmp_site_entries. This ensures:
 *  1. The app-level audit log is written with full actor/reason context.
 *  2. The database trigger (site_entry_audit_trigger) fires as a second safety net.
 *
 * For bulk updates across many sites use `batchUpdateSiteEntriesWithAudit`.
 */

import { supabase } from '@/integrations/supabase/client';
import { logSiteEntryAction, type MMPAuditAction } from '@/services/mmpAudit.service';

export interface SiteEntryFields {
  status?: string;
  forwarded_by_user_id?: string | null;
  forwarded_to_user_id?: string | null;
  forwarded_at?: string | null;
  dispatched_by?: string | null;
  dispatched_at?: string | null;
  accepted_by?: string | null;
  accepted_at?: string | null;
  verified_by?: string | null;
  verified_at?: string | null;
  verification_notes?: string | null;
  rejected_by?: string | null;
  rejected_at?: string | null;
  rejection_comments?: string | null;
  claimed_by?: string | null;
  claimed_at?: string | null;
  visit_started_by?: string | null;
  visit_started_at?: string | null;
  visit_completed_by?: string | null;
  visit_completed_at?: string | null;
  cost?: number | null;
  enumerator_fee?: number | null;
  transport_fee?: number | null;
  cost_acknowledged?: boolean | null;
  cost_acknowledged_by?: string | null;
  cost_acknowledged_at?: string | null;
  additional_data?: Record<string, unknown>;
}

export interface SiteEntryUpdateOpts {
  siteId: string;
  siteName?: string;
  mmpId?: string;
  updates: SiteEntryFields;
  action: MMPAuditAction;
  performedBy: string;
  performedByName?: string;
  performedByEmail?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Fetch lightweight current state for audit diff, then apply updates and log.
 */
export async function updateSiteEntryWithAudit(opts: SiteEntryUpdateOpts): Promise<void> {
  const {
    siteId,
    siteName,
    mmpId,
    updates,
    action,
    performedBy,
    performedByName,
    performedByEmail,
    reason,
    metadata,
  } = opts;

  // 1. Fetch current state so we can populate previous_state in the audit log.
  const { data: current } = await supabase
    .from('mmp_site_entries')
    .select('status, site_name, mmp_file_id, forwarded_to_user_id, dispatched_by, accepted_by, rejected_by, cost')
    .eq('id', siteId)
    .single();

  const resolvedSiteName = siteName ?? current?.site_name ?? siteId;
  const resolvedMmpId    = mmpId    ?? current?.mmp_file_id;

  // 2. Apply the update.
  const { error } = await supabase
    .from('mmp_site_entries')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', siteId);

  if (error) throw error;

  // 3. Log to audit_logs (DB trigger also fires, but app log carries richer actor context).
  await logSiteEntryAction({
    siteId,
    siteName: resolvedSiteName,
    mmpId: resolvedMmpId,
    action,
    previousStatus: current?.status,
    newStatus: updates.status ?? current?.status,
    performedBy,
    performedByName,
    performedByEmail,
    reason,
    metadata: {
      ...metadata,
      previousState: current,
    },
  });
}

/**
 * Apply the same update + audit to multiple site entries.
 * Each entry is logged individually so the audit trail is per-site.
 */
export async function batchUpdateSiteEntriesWithAudit(opts: {
  siteIds: string[];
  updates: SiteEntryFields;
  action: MMPAuditAction;
  performedBy: string;
  performedByName?: string;
  performedByEmail?: string;
  reason?: string;
  mmpId?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ successCount: number; failedIds: string[] }> {
  const { siteIds, updates, action, performedBy, performedByName, performedByEmail, reason, mmpId, metadata } = opts;

  // Fetch all current states in one query for efficiency.
  const { data: currentRows } = await supabase
    .from('mmp_site_entries')
    .select('id, status, site_name, mmp_file_id')
    .in('id', siteIds);

  const currentMap = Object.fromEntries((currentRows ?? []).map(r => [r.id, r]));

  // Apply the batch update.
  const { error: batchError } = await supabase
    .from('mmp_site_entries')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .in('id', siteIds);

  const failedIds: string[] = [];

  if (batchError) {
    // Fall back to per-row updates so we capture partial success.
    await Promise.all(
      siteIds.map(async id => {
        const { error } = await supabase
          .from('mmp_site_entries')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', id);
        if (error) failedIds.push(id);
      })
    );
  }

  // Log each successfully-updated site individually.
  const succeeded = siteIds.filter(id => !failedIds.includes(id));
  await Promise.all(
    succeeded.map(id => {
      const row = currentMap[id];
      return logSiteEntryAction({
        siteId: id,
        siteName: row?.site_name ?? id,
        mmpId: mmpId ?? row?.mmp_file_id,
        action,
        previousStatus: row?.status,
        newStatus: updates.status ?? row?.status,
        performedBy,
        performedByName,
        performedByEmail,
        reason,
        metadata,
      }).catch(err =>
        console.warn(`[SiteEntryService] Audit log failed for site ${id}:`, err)
      );
    })
  );

  return { successCount: succeeded.length, failedIds };
}
