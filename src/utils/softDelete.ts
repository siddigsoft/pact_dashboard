/**
 * softDelete — Global recycle-bin utility
 *
 * Call this BEFORE every hard delete in the application.
 * It saves a full JSON snapshot of the record to the `recycle_bin` table.
 * The caller then proceeds with the normal Supabase .delete() call.
 *
 * Usage:
 *   const ok = await softDelete(supabase, 'positions', position.id, position, userId, userName);
 *   if (!ok) return; // recycle-bin insert failed — abort the delete
 *   await supabase.from('positions').delete().eq('id', position.id);
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface RecycleBinEntry {
  table_name: string;
  record_id: string;
  record_data: Record<string, unknown>;
  deleted_by?: string;
  deleted_by_name?: string;
  notes?: string;
  context?: Record<string, unknown>;
}

/**
 * Save a record snapshot to the recycle bin before deleting it.
 * Returns true on success, false on failure (caller should abort the delete).
 */
export async function softDelete(
  supabase: SupabaseClient,
  tableName: string,
  recordId: string,
  snapshot: Record<string, unknown>,
  deletedBy?: string,
  deletedByName?: string,
  notes?: string,
  context?: Record<string, unknown>
): Promise<boolean> {
  const { error } = await supabase.from('recycle_bin').insert({
    table_name: tableName,
    record_id: String(recordId),
    record_data: snapshot,
    deleted_by: deletedBy ?? null,
    deleted_by_name: deletedByName ?? null,
    notes: notes ?? null,
    context: context ?? {},
  });

  if (error) {
    console.error('[softDelete] Failed to save to recycle bin — aborting delete:', {
      tableName, recordId, error: error.message,
    });
    return false;
  }
  return true;
}

/**
 * Restore a record from the recycle bin back to its original table.
 * Marks the recycle_bin row as restored.
 *
 * NOTE: The caller is responsible for removing fields that conflict with
 * DB constraints (e.g. auto-generated columns) before passing snapshot back.
 */
export async function restoreFromBin(
  supabase: SupabaseClient,
  binId: string,
  tableName: string,
  snapshot: Record<string, unknown>,
  restoredBy?: string,
  restoredByName?: string
): Promise<{ success: boolean; error?: string }> {
  // 1. Re-insert the record into the original table
  const { error: insertError } = await supabase.from(tableName as any).upsert(snapshot as any, { onConflict: 'id' });
  if (insertError) {
    return { success: false, error: insertError.message };
  }

  // 2. Mark recycle bin entry as restored
  const { error: updateError } = await supabase
    .from('recycle_bin')
    .update({
      restored_at: new Date().toISOString(),
      restored_by: restoredBy ?? null,
      restored_by_name: restoredByName ?? null,
    })
    .eq('id', binId);

  if (updateError) {
    console.warn('[restoreFromBin] Could not mark bin entry as restored:', updateError.message);
  }

  return { success: true };
}
