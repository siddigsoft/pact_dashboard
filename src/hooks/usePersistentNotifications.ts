import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';

export interface PersistentNotification {
  id: string;
  event_type: string;
  entity_type?: string;
  entity_id?: string;
  priority: 'urgent' | 'high' | 'normal';
  status: 'pending' | 'sent' | 'failed' | 'read';
  recipient_id: string;
  recipient_email?: string;
  recipient_role?: string;
  title_en: string;
  title_ar?: string;
  message_en: string;
  message_ar?: string;
  triggered_by?: string;
  triggered_by_name?: string;
  workflow_stage?: string;
  action_url?: string;
  metadata?: Record<string, any>;
  email_sent: boolean;
  email_sent_at?: string;
  created_at: string;
  read_at?: string;
}

export function usePersistentNotifications() {
  const { user } = useUser();
  const [notifications, setNotifications] = useState<PersistentNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [urgentCount, setUrgentCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) {
      setNotifications([]);
      setUnreadCount(0);
      setUrgentCount(0);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('Error fetching notifications:', error);
        return;
      }

      const notifs = (data || []) as PersistentNotification[];
      setNotifications(notifs);
      setUnreadCount(notifs.filter(n => n.status !== 'read').length);
      setUrgentCount(notifs.filter(n => n.priority === 'urgent' && n.status !== 'read').length);
    } catch (err) {
      console.error('Error fetching notifications:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  const markAsRead = useCallback(async (notificationId: string) => {
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ status: 'read', read_at: new Date().toISOString() })
        .eq('id', notificationId)
        .eq('recipient_id', user.id);

      if (error) {
        console.error('Error marking notification as read:', error);
        return;
      }

      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, status: 'read' as const, read_at: new Date().toISOString() } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  }, [user?.id]);

  const markAllAsRead = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ status: 'read', read_at: new Date().toISOString() })
        .eq('recipient_id', user.id)
        .neq('status', 'read');

      if (error) {
        console.error('Error marking all notifications as read:', error);
        return;
      }

      setNotifications(prev => 
        prev.map(n => ({ ...n, status: 'read' as const, read_at: new Date().toISOString() }))
      );
      setUnreadCount(0);
      setUrgentCount(0);
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  }, [user?.id]);

  const deleteNotification = useCallback(async (notificationId: string) => {
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId)
        .eq('recipient_id', user.id);

      if (error) {
        console.error('Error deleting notification:', error);
        return;
      }

      setNotifications(prev => prev.filter(n => n.id !== notificationId));
    } catch (err) {
      console.error('Error deleting notification:', err);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${user.id}`
        },
        (payload) => {
          const newNotification = payload.new as PersistentNotification;
          setNotifications(prev => [newNotification, ...prev]);
          setUnreadCount(prev => prev + 1);
          if (newNotification.priority === 'urgent') {
            setUrgentCount(prev => prev + 1);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${user.id}`
        },
        (payload) => {
          const updatedNotification = payload.new as PersistentNotification;
          setNotifications(prev => 
            prev.map(n => n.id === updatedNotification.id ? updatedNotification : n)
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const getNotificationsByPriority = useCallback((priority: 'urgent' | 'high' | 'normal') => {
    return notifications.filter(n => n.priority === priority);
  }, [notifications]);

  const getUnreadNotifications = useCallback(() => {
    return notifications.filter(n => n.status !== 'read');
  }, [notifications]);

  return {
    notifications,
    unreadCount,
    urgentCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    fetchNotifications,
    getNotificationsByPriority,
    getUnreadNotifications
  };
}
