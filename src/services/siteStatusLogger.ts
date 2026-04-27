import { supabase } from '@/integrations/supabase/client';

export type StatusChangeSource =
  | 'enumerator_app'
  | 'admin_override'
  | 'system_wfp_match'
  | 'migration'
  | 'cycle_close'
  | 'system';

export interface LogStatusChangeParams {
  siteEntryId: string;
  mmpId?: string | null;
  oldStatus: string | null;
  newStatus: string;
  changedById?: string | null;
  changedByName?: string | null;
  changedByRole?: string | null;
  source: StatusChangeSource;
  note?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Appends one row to site_visit_status_log.
 * Call this immediately after every status mutation on mmp_site_entries.
 * This function never throws — it logs silently on error so it never blocks
 * the parent operation.
 */
export async function logStatusChange(params: LogStatusChangeParams): Promise<void> {
  try {
    const { error } = await supabase.from('site_visit_status_log').insert({
      site_entry_id: params.siteEntryId,
      mmp_id: params.mmpId ?? null,
      old_status: params.oldStatus ?? null,
      new_status: params.newStatus,
      changed_by: params.changedById ?? null,
      changed_by_name: params.changedByName ?? null,
      changed_by_role: params.changedByRole ?? null,
      change_source: params.source,
      note: params.note ?? null,
      metadata: params.metadata ?? null,
    });

    if (error) {
      console.warn('[siteStatusLogger] Failed to log status change:', error.message);
    }
  } catch (err) {
    console.warn('[siteStatusLogger] Unexpected error logging status change:', err);
  }
}

/**
 * Bulk-log status changes for multiple sites at once (e.g., WFP match apply).
 * All rows share the same source, changedBy, and note.
 */
export async function logStatusChangeBulk(
  rows: Array<{
    siteEntryId: string;
    mmpId?: string | null;
    oldStatus: string | null;
    newStatus: string;
  }>,
  shared: {
    changedById?: string | null;
    changedByName?: string | null;
    changedByRole?: string | null;
    source: StatusChangeSource;
    note?: string | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<void> {
  if (rows.length === 0) return;

  try {
    const inserts = rows.map(r => ({
      site_entry_id: r.siteEntryId,
      mmp_id: r.mmpId ?? null,
      old_status: r.oldStatus ?? null,
      new_status: r.newStatus,
      changed_by: shared.changedById ?? null,
      changed_by_name: shared.changedByName ?? null,
      changed_by_role: shared.changedByRole ?? null,
      change_source: shared.source,
      note: shared.note ?? null,
      metadata: shared.metadata ?? null,
    }));

    const { error } = await supabase.from('site_visit_status_log').insert(inserts);

    if (error) {
      console.warn('[siteStatusLogger] Bulk log failed:', error.message);
    }
  } catch (err) {
    console.warn('[siteStatusLogger] Unexpected error in bulk log:', err);
  }
}

/**
 * Fetch the complete status history for a single site entry,
 * ordered oldest → newest.
 */
export async function fetchStatusHistory(siteEntryId: string) {
  const { data, error } = await supabase
    .from('site_visit_status_log')
    .select(
      'id, old_status, new_status, changed_by_name, changed_by_role, change_source, note, metadata, created_at',
    )
    .eq('site_entry_id', siteEntryId)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('[siteStatusLogger] Failed to fetch status history:', error.message);
    return [];
  }

  return data ?? [];
}
