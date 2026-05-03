import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/types/supabase';
import { v4 as uuidv4 } from 'uuid';

type SyncQueueEntry = Database['public']['Tables']['offline_sync_queue']['Row'];
type SyncConflict = Database['public']['Tables']['sync_conflicts']['Row'];
type MobileDevice = Database['public']['Tables']['mobile_devices']['Row'];

interface SyncQueueItem {
  id?: string;
  table: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  recordId?: string;
  localId?: string;
  data: Record<string, any>;
}

interface SyncResult {
  queued: number;
  synced: number;
  failed: number;
  conflicts: number;
}

interface ConflictResolution {
  conflictId: string;
  strategy: 'auto' | 'manual' | 'server_wins' | 'client_wins';
  resolvedValue?: any;
}

/**
 * Register or update a mobile device
 */
export async function registerMobileDevice(
  deviceId: string,
  deviceName: string,
  deviceType: 'ios' | 'android',
  appVersion: string,
  osVersion: string
): Promise<{ device: MobileDevice | null; error: string | null }> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return { device: null, error: 'Not authenticated' };

    const { data, error } = await supabase
      .from('mobile_devices')
      .upsert(
        {
          user_id: userData.user.id,
          device_id: deviceId,
          device_name: deviceName,
          device_type: deviceType,
          app_version: appVersion,
          os_version: osVersion,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,device_id' }
      )
      .select()
      .single();

    if (error) return { device: null, error: error.message };
    return { device: data, error: null };
  } catch (err) {
    console.error('Error registering mobile device:', err);
    return { device: null, error: 'Failed to register device' };
  }
}

/**
 * Add an item to the offline sync queue
 */
export async function queueOfflineOperation(
  table: string,
  operation: 'CREATE' | 'UPDATE' | 'DELETE',
  data: Record<string, any>,
  recordId?: string,
  deviceId?: string
): Promise<{ queueId: string | null; error: string | null }> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return { queueId: null, error: 'Not authenticated' };

    const localId = recordId || uuidv4();

    const { data: queueEntry, error } = await supabase
      .from('offline_sync_queue')
      .insert({
        user_id: userData.user.id,
        device_id: deviceId || 'unknown',
        table_name: table,
        operation,
        record_id: recordId ? recordId : null,
        local_id: !recordId ? localId : null,
        payload: data,
        sync_status: 'pending',
      })
      .select('id')
      .single();

    if (error) return { queueId: null, error: error.message };
    return { queueId: queueEntry?.id, error: null };
  } catch (err) {
    console.error('Error queuing offline operation:', err);
    return { queueId: null, error: 'Failed to queue operation' };
  }
}

/**
 * Get pending sync items for a device
 */
export async function getPendingSyncQueue(
  deviceId: string,
  limit: number = 100
): Promise<{
  queue: SyncQueueEntry[];
  error: string | null;
}> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return { queue: [], error: 'Not authenticated' };

    const { data, error } = await supabase
      .from('offline_sync_queue')
      .select('*')
      .eq('user_id', userData.user.id)
      .eq('device_id', deviceId)
      .eq('sync_status', 'pending')
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) return { queue: [], error: error.message };
    return { queue: data || [], error: null };
  } catch (err) {
    console.error('Error getting pending sync queue:', err);
    return { queue: [], error: 'Failed to fetch sync queue' };
  }
}

/**
 * Sync a single queue entry
 */
export async function syncQueueEntry(
  syncQueueId: string
): Promise<{
  success: boolean;
  recordId?: string;
  error?: string;
}> {
  try {
    // First, check for conflicts
    const { data: conflictCheck, error: conflictError } = await supabase.rpc(
      'detect_sync_conflicts',
      { p_sync_queue_id: syncQueueId }
    );

    if (conflictError) {
      return { success: false, error: conflictError.message };
    }

    if (conflictCheck && conflictCheck.length > 0 && conflictCheck[0].has_conflict) {
      // Conflict detected - mark for manual resolution
      await supabase
        .from('offline_sync_queue')
        .update({ sync_status: 'failed' })
        .eq('id', syncQueueId);

      return { success: false, error: 'Sync conflict detected - manual resolution needed' };
    }

    // Process the sync
    const { data, error } = await supabase.rpc('process_sync_queue_entry', {
      p_sync_queue_id: syncQueueId,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: data?.success || false,
      recordId: data?.new_record_id,
      error: data?.message,
    };
  } catch (err) {
    console.error('Error syncing queue entry:', err);
    return { success: false, error: 'Failed to sync entry' };
  }
}

/**
 * Batch sync all pending items
 */
export async function syncAllPending(deviceId: string): Promise<SyncResult> {
  try {
    const { queue, error: queueError } = await getPendingSyncQueue(deviceId, 1000);

    if (queueError) {
      return { queued: 0, synced: 0, failed: 0, conflicts: 0 };
    }

    let synced = 0;
    let failed = 0;
    let conflicts = 0;

    for (const item of queue) {
      const { success, error } = await syncQueueEntry(item.id);

      if (success) {
        synced++;
      } else if (error?.includes('conflict')) {
        conflicts++;
      } else {
        failed++;
      }
    }

    return {
      queued: queue.length,
      synced,
      failed,
      conflicts,
    };
  } catch (err) {
    console.error('Error batch syncing:', err);
    return { queued: 0, synced: 0, failed: 0, conflicts: 0 };
  }
}

/**
 * Get unresolved conflicts for a user
 */
export async function getUnresolvedConflicts(): Promise<{
  conflicts: SyncConflict[];
  error: string | null;
}> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return { conflicts: [], error: 'Not authenticated' };

    const { data, error } = await supabase
      .from('sync_conflicts')
      .select(
        `
        *,
        offline_sync_queue(id, table_name, operation, payload)
      `
      )
      .is('resolved_at', null)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) return { conflicts: [], error: error.message };
    return { conflicts: data || [], error: null };
  } catch (err) {
    console.error('Error getting conflicts:', err);
    return { conflicts: [], error: 'Failed to fetch conflicts' };
  }
}

/**
 * Resolve a sync conflict
 */
export async function resolveConflict(
  conflictId: string,
  strategy: 'server_wins' | 'client_wins' | 'custom',
  customValue?: any
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return { success: false, error: 'Not authenticated' };

    let resolvedValue = null;
    if (strategy === 'custom' && customValue) {
      resolvedValue = customValue;
    }

    const { error } = await supabase
      .from('sync_conflicts')
      .update({
        resolution_strategy: strategy,
        resolved_value: resolvedValue,
        resolved_by_user_id: userData.user.id,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', conflictId);

    if (error) return { success: false, error: error.message };

    // Re-attempt sync with resolution
    const { data: conflict } = await supabase
      .from('sync_conflicts')
      .select('sync_queue_id')
      .eq('id', conflictId)
      .single();

    if (conflict) {
      await syncQueueEntry(conflict.sync_queue_id);
    }

    return { success: true };
  } catch (err) {
    console.error('Error resolving conflict:', err);
    return { success: false, error: 'Failed to resolve conflict' };
  }
}

/**
 * Get sync statistics for a user
 */
export async function getSyncStatistics(
  deviceId?: string
): Promise<{
  totalQueued: number;
  pendingSync: number;
  syncedCount: number;
  failedCount: number;
  conflictCount: number;
  error: string | null;
}> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      return {
        totalQueued: 0,
        pendingSync: 0,
        syncedCount: 0,
        failedCount: 0,
        conflictCount: 0,
        error: 'Not authenticated',
      };
    }

    let query = supabase
      .from('offline_sync_queue')
      .select('sync_status', { count: 'exact' })
      .eq('user_id', userData.user.id);

    if (deviceId) {
      query = query.eq('device_id', deviceId);
    }

    const { data, count, error } = await query;

    if (error) {
      return {
        totalQueued: 0,
        pendingSync: 0,
        syncedCount: 0,
        failedCount: 0,
        conflictCount: 0,
        error: error.message,
      };
    }

    const pending = data?.filter((d: any) => d.sync_status === 'pending').length || 0;
    const synced = data?.filter((d: any) => d.sync_status === 'synced').length || 0;
    const failed = data?.filter((d: any) => d.sync_status === 'failed').length || 0;

    const { data: conflictData, error: conflictError } = await supabase
      .from('sync_conflicts')
      .select('*', { count: 'exact' })
      .is('resolved_at', null);

    const conflictCount = conflictData?.length || 0;

    return {
      totalQueued: count || 0,
      pendingSync: pending,
      syncedCount: synced,
      failedCount: failed,
      conflictCount,
      error: null,
    };
  } catch (err) {
    console.error('Error getting sync statistics:', err);
    return {
      totalQueued: 0,
      pendingSync: 0,
      syncedCount: 0,
      failedCount: 0,
      conflictCount: 0,
      error: 'Failed to fetch statistics',
    };
  }
}

/**
 * Clear old sync queue entries (completed syncs older than N days)
 */
export async function cleanupOldSyncEntries(olderThanDays: number = 30): Promise<{
  deletedCount: number;
  error: string | null;
}> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const { data, error } = await supabase
      .from('offline_sync_queue')
      .delete()
      .eq('sync_status', 'synced')
      .lt('synced_at', cutoffDate.toISOString());

    if (error) return { deletedCount: 0, error: error.message };

    return { deletedCount: data?.length || 0, error: null };
  } catch (err) {
    console.error('Error cleaning up sync entries:', err);
    return { deletedCount: 0, error: 'Failed to cleanup entries' };
  }
}
