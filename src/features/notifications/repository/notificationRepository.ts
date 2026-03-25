/**
 * In-app notifications table — reads/writes for NotificationContext.
 * Realtime channels stay in the context.
 */
import { supabase } from '@/integrations/supabase/client';
import type { Notification } from '@/types';

export async function fetchNotificationsByRecipient(userId: string, limit: number) {
  return supabase
    .from('notifications')
    .select('*')
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
}

export async function fetchNotificationsByUserIdColumn(userId: string, limit: number) {
  return supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
}

export async function fetchAdminScopeNotifications(limit: number) {
  return supabase
    .from('notifications')
    .select('*')
    .in('entity_type', [
      'mmpFile',
      'siteVisit',
      'wallet',
      'downPayment',
      'costSubmission',
      'retainer',
      'transaction',
      'account',
      'recovery',
    ])
    .in('event_type', [
      'system',
      'assignments',
      'approvals',
      'financial',
      'wallet',
      'retainer',
      'account',
      'recall',
    ])
    .order('created_at', { ascending: false })
    .limit(limit);
}

export async function insertNotificationRow(
  notification: Omit<Notification, 'id' | 'isRead' | 'createdAt'>,
) {
  return supabase.from('notifications').insert({
    recipient_id: notification.userId,
    user_id: notification.userId,
    title_en: notification.title,
    title_ar: notification.title,
    message_en: notification.message,
    message_ar: notification.message,
    priority: notification.priority || 'normal',
    action_url: notification.link || null,
    entity_id: notification.relatedEntityId || null,
    entity_type: notification.relatedEntityType || null,
    event_type: notification.category || 'system',
    status: 'pending',
    email_sent: false,
  });
}

export async function markNotificationRead(notificationId: string) {
  return supabase
    .from('notifications')
    .update({
      status: 'read',
      read_at: new Date().toISOString(),
    })
    .eq('id', notificationId);
}

export async function deleteNotificationsForRecipient(userId: string) {
  return supabase.from('notifications').delete().eq('recipient_id', userId).select('id');
}

export async function dismissBroadcastRead(notificationId: string) {
  return supabase
    .from('notifications')
    .update({
      status: 'read',
      read_at: new Date().toISOString(),
    })
    .eq('id', notificationId);
}
