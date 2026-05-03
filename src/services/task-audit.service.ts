/**
 * Task Audit Service
 * Tracks all changes to tasks for compliance, debugging, and accountability
 * 
 * Usage:
 * await logTaskChange(taskId, 'status', 'todo', 'done', 'Completed by manager', userId);
 * const history = await getTaskAuditTrail(taskId);
 */

import { supabase } from '@/integrations/supabase/client';

export interface TaskChangeRecord {
  id: string;
  task_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string;
  change_reason?: string;
  created_at: string;
  changed_by_name?: string;
}

/**
 * Log a task change to audit trail
 */
export async function logTaskChange(
  taskId: string,
  fieldName: string,
  oldValue: any,
  newValue: any,
  reason?: string,
  userId?: string
): Promise<void> {
  try {
    // If no userId provided, get current user
    let finalUserId = userId;
    if (!finalUserId) {
      const { data: { user } } = await supabase.auth.getUser();
      finalUserId = user?.id;
    }

    if (!finalUserId) {
      console.warn('Cannot log task change: no user ID available');
      return;
    }

    const { error } = await supabase
      .from('task_change_history')
      .insert({
        task_id: taskId,
        field_name: fieldName,
        old_value: oldValue !== null && oldValue !== undefined ? JSON.stringify(oldValue) : null,
        new_value: newValue !== null && newValue !== undefined ? JSON.stringify(newValue) : null,
        changed_by: finalUserId,
        change_reason: reason || 'manual_update',
      });

    if (error) {
      console.error('Failed to log task change:', error);
    }
  } catch (err) {
    console.error('Error in logTaskChange:', err);
  }
}

/**
 * Get full audit trail for a task
 */
export async function getTaskAuditTrail(taskId: string): Promise<TaskChangeRecord[]> {
  try {
    const { data, error } = await supabase
      .from('task_change_history')
      .select(`
        id,
        task_id,
        field_name,
        old_value,
        new_value,
        changed_by,
        change_reason,
        created_at,
        changed_by_profile:changed_by(full_name)
      `)
      .eq('task_id', taskId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch audit trail:', error);
      return [];
    }

    return (data || []).map(record => ({
      ...record,
      changed_by_name: record.changed_by_profile?.full_name || 'Unknown User',
    }));
  } catch (err) {
    console.error('Error in getTaskAuditTrail:', err);
    return [];
  }
}

/**
 * Get changes for a specific field
 */
export async function getFieldChangeHistory(
  taskId: string,
  fieldName: string
): Promise<TaskChangeRecord[]> {
  try {
    const { data, error } = await supabase
      .from('task_change_history')
      .select(`
        id,
        task_id,
        field_name,
        old_value,
        new_value,
        changed_by,
        change_reason,
        created_at,
        changed_by_profile:changed_by(full_name)
      `)
      .eq('task_id', taskId)
      .eq('field_name', fieldName)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Failed to fetch field change history:', error);
      return [];
    }

    return (data || []).map(record => ({
      ...record,
      changed_by_name: record.changed_by_profile?.full_name || 'Unknown User',
    }));
  } catch (err) {
    console.error('Error in getFieldChangeHistory:', err);
    return [];
  }
}

/**
 * Get changes by a specific user
 */
export async function getUserTaskChanges(
  userId: string,
  limit: number = 100
): Promise<TaskChangeRecord[]> {
  try {
    const { data, error } = await supabase
      .from('task_change_history')
      .select(`
        id,
        task_id,
        field_name,
        old_value,
        new_value,
        changed_by,
        change_reason,
        created_at,
        changed_by_profile:changed_by(full_name),
        task:task_id(title)
      `)
      .eq('changed_by', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Failed to fetch user task changes:', error);
      return [];
    }

    return (data || []).map(record => ({
      ...record,
      changed_by_name: record.changed_by_profile?.full_name || 'Unknown User',
    }));
  } catch (err) {
    console.error('Error in getUserTaskChanges:', err);
    return [];
  }
}

/**
 * Get changes within a date range
 */
export async function getTaskChangesInRange(
  taskId: string,
  startDate: Date,
  endDate: Date
): Promise<TaskChangeRecord[]> {
  try {
    const { data, error } = await supabase
      .from('task_change_history')
      .select(`
        id,
        task_id,
        field_name,
        old_value,
        new_value,
        changed_by,
        change_reason,
        created_at,
        changed_by_profile:changed_by(full_name)
      `)
      .eq('task_id', taskId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Failed to fetch changes in range:', error);
      return [];
    }

    return (data || []).map(record => ({
      ...record,
      changed_by_name: record.changed_by_profile?.full_name || 'Unknown User',
    }));
  } catch (err) {
    console.error('Error in getTaskChangesInRange:', err);
    return [];
  }
}

/**
 * Export audit trail as JSON
 */
export async function exportAuditTrail(taskId: string): Promise<string> {
  const trail = await getTaskAuditTrail(taskId);
  return JSON.stringify(trail, null, 2);
}

/**
 * Get audit statistics for a task
 */
export async function getAuditStats(taskId: string): Promise<{
  totalChanges: number;
  uniqueUsers: number;
  fieldsChanged: string[];
  firstChange: string | null;
  lastChange: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from('task_change_history')
      .select('field_name, changed_by, created_at')
      .eq('task_id', taskId);

    if (error) {
      console.error('Failed to get audit stats:', error);
      return {
        totalChanges: 0,
        uniqueUsers: 0,
        fieldsChanged: [],
        firstChange: null,
        lastChange: null,
      };
    }

    const records = data || [];
    const uniqueUsers = new Set(records.map(r => r.changed_by)).size;
    const fieldsChanged = [...new Set(records.map(r => r.field_name))];
    const sortedByDate = records.sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    return {
      totalChanges: records.length,
      uniqueUsers,
      fieldsChanged,
      firstChange: sortedByDate[0]?.created_at || null,
      lastChange: sortedByDate[sortedByDate.length - 1]?.created_at || null,
    };
  } catch (err) {
    console.error('Error in getAuditStats:', err);
    return {
      totalChanges: 0,
      uniqueUsers: 0,
      fieldsChanged: [],
      firstChange: null,
      lastChange: null,
    };
  }
}
