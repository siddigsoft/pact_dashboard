/**
 * Notification Delivery Tracking Service
 * Tracks email, WhatsApp, and push notification delivery status
 * 
 * Usage:
 * await recordDeliveryAttempt(notificationId, taskId, userId, 'email', 'delivered');
 * const status = await getDeliveryStatus(notificationId);
 */

import { supabase } from '@/integrations/supabase/client';

export interface DeliveryLog {
  id: string;
  notification_id: string;
  task_id: string | null;
  user_id: string;
  channel: 'email' | 'whatsapp' | 'push' | 'in_app';
  status: 'pending' | 'delivering' | 'delivered' | 'failed' | 'read' | 'bounced';
  delivery_timestamp: string | null;
  read_timestamp: string | null;
  error_message: string | null;
  provider: string | null;
  provider_reference_id: string | null;
  attempt_count: number;
  max_retries: number;
  created_at: string;
  updated_at: string;
}

export interface DeliverySummary {
  channel: string;
  status: string;
  count: number;
}

/**
 * Record a delivery attempt
 */
export async function recordDeliveryAttempt(
  notificationId: string,
  taskId: string | null,
  userId: string,
  channel: 'email' | 'whatsapp' | 'push' | 'in_app',
  status: 'pending' | 'delivering' | 'delivered' | 'failed' | 'read' | 'bounced',
  provider?: string,
  providerRefId?: string,
  errorMsg?: string
): Promise<void> {
  try {
    const { error } = await supabase
      .rpc('record_delivery_attempt', {
        p_notification_id: notificationId,
        p_task_id: taskId,
        p_user_id: userId,
        p_channel: channel,
        p_status: status,
        p_provider: provider,
        p_provider_ref_id: providerRefId,
        p_error_msg: errorMsg,
      });

    if (error) {
      console.error('Failed to record delivery attempt:', error);
    }
  } catch (err) {
    console.error('Error in recordDeliveryAttempt:', err);
  }
}

/**
 * Mark a notification as delivered
 */
export async function markAsDelivered(
  notificationId: string,
  channel: 'email' | 'whatsapp' | 'push' | 'in_app',
  timestamp: Date = new Date()
): Promise<void> {
  try {
    const { error } = await supabase
      .rpc('mark_delivery_delivered', {
        p_notification_id: notificationId,
        p_channel: channel,
        p_timestamp: timestamp.toISOString(),
      });

    if (error) {
      console.error('Failed to mark as delivered:', error);
    }
  } catch (err) {
    console.error('Error in markAsDelivered:', err);
  }
}

/**
 * Mark a notification as read
 */
export async function markAsRead(
  notificationId: string,
  channel: 'email' | 'whatsapp' | 'push' | 'in_app',
  timestamp: Date = new Date()
): Promise<void> {
  try {
    const { error } = await supabase
      .rpc('mark_delivery_read', {
        p_notification_id: notificationId,
        p_channel: channel,
        p_timestamp: timestamp.toISOString(),
      });

    if (error) {
      console.error('Failed to mark as read:', error);
    }
  } catch (err) {
    console.error('Error in markAsRead:', err);
  }
}

/**
 * Get delivery logs for a notification
 */
export async function getDeliveryLogs(notificationId: string): Promise<DeliveryLog[]> {
  try {
    const { data, error } = await supabase
      .from('notification_delivery_logs')
      .select('*')
      .eq('notification_id', notificationId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch delivery logs:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Error in getDeliveryLogs:', err);
    return [];
  }
}

/**
 * Get delivery summary for a notification
 */
export async function getDeliverySummary(notificationId: string): Promise<DeliverySummary[]> {
  try {
    const { data, error } = await supabase
      .rpc('get_notification_delivery_summary', {
        p_notification_id: notificationId,
      });

    if (error) {
      console.error('Failed to fetch delivery summary:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Error in getDeliverySummary:', err);
    return [];
  }
}

/**
 * Get delivery status for a specific user notification
 */
export async function getUserDeliveryStatus(
  notificationId: string,
  userId: string,
  channel?: 'email' | 'whatsapp' | 'push' | 'in_app'
): Promise<DeliveryLog | null> {
  try {
    let query = supabase
      .from('notification_delivery_logs')
      .select('*')
      .eq('notification_id', notificationId)
      .eq('user_id', userId);

    if (channel) {
      query = query.eq('channel', channel);
    }

    const { data, error } = await query.single();

    if (error && error.code !== 'PGRST116') {
      console.error('Failed to fetch user delivery status:', error);
      return null;
    }

    return data || null;
  } catch (err) {
    console.error('Error in getUserDeliveryStatus:', err);
    return null;
  }
}

/**
 * Get failed deliveries for retry
 */
export async function getFailedDeliveries(
  hoursOld: number = 1,
  limit: number = 100
): Promise<DeliveryLog[]> {
  try {
    const cutoffTime = new Date(Date.now() - hoursOld * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('notification_delivery_logs')
      .select('*')
      .eq('status', 'failed')
      .lt('attempt_count', 3) // Less than max retries
      .gt('created_at', cutoffTime)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('Failed to fetch failed deliveries:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Error in getFailedDeliveries:', err);
    return [];
  }
}

/**
 * Get delivery statistics for a user
 */
export async function getUserDeliveryStats(userId: string): Promise<{
  total: number;
  delivered: number;
  failed: number;
  pending: number;
  read: number;
}> {
  try {
    const { data, error } = await supabase
      .from('notification_delivery_logs')
      .select('status')
      .eq('user_id', userId);

    if (error) {
      console.error('Failed to fetch user delivery stats:', error);
      return { total: 0, delivered: 0, failed: 0, pending: 0, read: 0 };
    }

    const records = data || [];
    const stats = {
      total: records.length,
      delivered: records.filter(r => r.status === 'delivered').length,
      failed: records.filter(r => r.status === 'failed').length,
      pending: records.filter(r => r.status === 'pending').length,
      read: records.filter(r => r.status === 'read').length,
    };

    return stats;
  } catch (err) {
    console.error('Error in getUserDeliveryStats:', err);
    return { total: 0, delivered: 0, failed: 0, pending: 0, read: 0 };
  }
}

/**
 * Get delivery logs for a task
 */
export async function getTaskDeliveryLogs(taskId: string): Promise<DeliveryLog[]> {
  try {
    const { data, error } = await supabase
      .from('notification_delivery_logs')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch task delivery logs:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Error in getTaskDeliveryLogs:', err);
    return [];
  }
}

/**
 * Get delivery logs by channel
 */
export async function getDeliveryLogsByChannel(
  channel: 'email' | 'whatsapp' | 'push' | 'in_app',
  status?: 'pending' | 'delivering' | 'delivered' | 'failed' | 'read' | 'bounced',
  limit: number = 100
): Promise<DeliveryLog[]> {
  try {
    let query = supabase
      .from('notification_delivery_logs')
      .select('*')
      .eq('channel', channel);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Failed to fetch delivery logs by channel:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Error in getDeliveryLogsByChannel:', err);
    return [];
  }
}

/**
 * Calculate delivery rate for a time period
 */
export async function getDeliveryRate(
  startDate: Date,
  endDate: Date,
  channel?: 'email' | 'whatsapp' | 'push' | 'in_app'
): Promise<{
  total: number;
  delivered: number;
  rate: number;
  byChannel: Record<string, { total: number; delivered: number; rate: number }>;
}> {
  try {
    let query = supabase
      .from('notification_delivery_logs')
      .select('channel, status')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    if (channel) {
      query = query.eq('channel', channel);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to fetch delivery rate:', error);
      return { total: 0, delivered: 0, rate: 0, byChannel: {} };
    }

    const records = data || [];
    const total = records.length;
    const delivered = records.filter(r => r.status === 'delivered').length;

    // By channel breakdown
    const byChannel: Record<string, { total: number; delivered: number; rate: number }> = {};
    const channels = new Set(records.map(r => r.channel));

    for (const ch of channels) {
      const channelRecords = records.filter(r => r.channel === ch);
      const channelDelivered = channelRecords.filter(r => r.status === 'delivered').length;
      byChannel[ch] = {
        total: channelRecords.length,
        delivered: channelDelivered,
        rate: channelRecords.length > 0 ? (channelDelivered / channelRecords.length) * 100 : 0,
      };
    }

    return {
      total,
      delivered,
      rate: total > 0 ? (delivered / total) * 100 : 0,
      byChannel,
    };
  } catch (err) {
    console.error('Error in getDeliveryRate:', err);
    return { total: 0, delivered: 0, rate: 0, byChannel: {} };
  }
}
