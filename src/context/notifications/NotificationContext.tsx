
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Notification } from '@/types';
import { supabase } from '@/integrations/supabase/client';


const initialNotifications: Notification[] = [];

interface NotificationContextType {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id' | 'isRead' | 'createdAt'>) => void;
  markNotificationAsRead: (notificationId: string) => void;
  getUnreadNotificationsCount: () => number;
  clearAllNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [appNotifications, setAppNotifications] = useState<Notification[]>(initialNotifications);
  // Get current user ID from localStorage or auth state
  const [currentUserId, setCurrentUserId] = useState<string | null>(() => {
    try {
      const storedUser = localStorage.getItem('PACTCurrentUser');
      if (storedUser) {
        const user = JSON.parse(storedUser);
        return user.id || null;
      }
    } catch (error) {
      console.error('Error getting user from localStorage:', error);
    }
    return null;
  });
  
  // Listen for user changes via localStorage events
  React.useEffect(() => {
    const handleStorageChange = () => {
      try {
        const storedUser = localStorage.getItem('PACTCurrentUser');
        if (storedUser) {
          const user = JSON.parse(storedUser);
          setCurrentUserId(user.id || null);
        } else {
          setCurrentUserId(null);
        }
      } catch (error) {
        console.error('Error parsing user from localStorage:', error);
        setCurrentUserId(null);
      }
    };

    // Listen for storage changes
    window.addEventListener('storage', handleStorageChange);
    
    // Check periodically for changes (in case same-tab updates don't trigger storage event)
    const interval = setInterval(handleStorageChange, 1000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // Resolve current user id directly from Supabase auth as primary source
  useEffect(() => {
    let unsub: { unsubscribe: () => void } | undefined;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) setCurrentUserId(user.id);
      } catch {}
      try {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
          const uid = session?.user?.id || null;
          setCurrentUserId(uid);
        });
        unsub = subscription;
      } catch {}
    })();
    return () => { try { unsub?.unsubscribe(); } catch {} };
  }, []);

  // Helper to map DB row to UI Notification
  const mapDbToNotification = useCallback((row: any): Notification => ({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    message: row.message,
    type: row.type,
    isRead: !!row.is_read,
    createdAt: row.created_at,
    link: row.link || undefined,
    relatedEntityId: row.related_entity_id || undefined,
    relatedEntityType: row.related_entity_type || undefined,
  }), []);

  // Load notifications for current user from Supabase and subscribe for realtime inserts
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    const fetchNotifications = async () => {
      if (!currentUserId) {
        setAppNotifications([]);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', currentUserId)
          .order('created_at', { ascending: false })
          .limit(50);
        if (!cancelled) {
          if (error) {
            console.warn('Failed to fetch notifications:', error);
          } else if (data) {
            setAppNotifications(data.map(mapDbToNotification));
          }
        }
      } catch (err) {
        console.warn('Fetch notifications threw:', err);
      }
    };

    const subscribeRealtime = () => {
      if (!currentUserId) return;
      try {
        channel = supabase
          .channel(`notifications-${currentUserId}`)
          .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${currentUserId}`,
          }, (payload) => {
            const n = mapDbToNotification((payload as any).new);
            setAppNotifications(prev => [n, ...prev].slice(0, 50));
          })
          .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${currentUserId}`,
          }, (payload) => {
            const updated = mapDbToNotification((payload as any).new);
            setAppNotifications(prev => 
              prev.map(n => n.id === updated.id ? updated : n)
            );
          })
          .on('postgres_changes', {
            event: 'DELETE',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${currentUserId}`,
          }, (payload) => {
            const deletedId = (payload as any).old.id;
            setAppNotifications(prev => prev.filter(n => n.id !== deletedId));
          })
          .subscribe();
      } catch (err) {
        console.warn('Realtime subscription failed:', err);
      }
    };

    fetchNotifications();
    subscribeRealtime();

    const interval = setInterval(fetchNotifications, 60000);
    return () => {
      cancelled = true;
      try { if (channel) supabase.removeChannel(channel); } catch {}
      clearInterval(interval);
    };
  }, [currentUserId, mapDbToNotification]);

  // Enhanced duplicate detection that checks content and creation time
  const isDuplicateNotification = useCallback((newNotification: Omit<Notification, 'id' | 'isRead' | 'createdAt'>) => {
    const now = Date.now();
    // Check for notifications with similar content created in the last 10 seconds
    return appNotifications.some(n => 
      n.userId === newNotification.userId && 
      n.title === newNotification.title && 
      n.message === newNotification.message &&
      n.type === newNotification.type &&
      !n.isRead &&
      now - new Date(n.createdAt).getTime() < 10000 // Notification from less than 10 seconds ago
    );
  }, [appNotifications]);

  const addNotification = useCallback((notification: Omit<Notification, 'id' | 'isRead' | 'createdAt'>) => {
    // Enhanced duplicate detection
    if (isDuplicateNotification(notification)) return;

    const newNotification: Notification = {
      id: `not${Date.now()}${Math.random().toString(36).substr(2, 5)}`, // More unique ID
      isRead: false,
      createdAt: new Date().toISOString(),
      ...notification,
    };

    setAppNotifications(prev => {
      // Limit to 50 notifications to prevent performance issues
      const updatedNotifications = [newNotification, ...prev];
      if (updatedNotifications.length > 50) {
        return updatedNotifications.slice(0, 50);
      }
      return updatedNotifications;
    });

    // Fire-and-forget persistence to Supabase
    (async () => {
      try {
        await supabase.from('notifications').insert({
          user_id: notification.userId,
          title: notification.title,
          message: notification.message,
          type: notification.type,
          link: notification.link,
          related_entity_id: notification.relatedEntityId,
          related_entity_type: notification.relatedEntityType,
        });
      } catch (err) {
        console.warn('Failed to persist notification:', err);
      }
    })();
  }, [isDuplicateNotification]);

  const markNotificationAsRead = useCallback(async (notificationId: string) => {
    setAppNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n));
    try {
      await supabase.from('notifications').update({ is_read: true }).eq('id', notificationId);
    } catch (err) {
      console.warn('Failed to persist read state:', err);
    }
  }, []);

  const clearAllNotifications = useCallback(async () => {
    if (!currentUserId) {
      console.warn('Cannot clear notifications: no current user ID');
      return;
    }
    
    console.log(`Attempting to delete all notifications for user: ${currentUserId}`);
    
    // Delete all notifications for the current user from the database
    try {
      // Delete all notifications for the current user
      // Note: Supabase DELETE returns the deleted rows if .select() is used
      const { data: deletedData, error } = await supabase
        .from('notifications')
        .delete()
        .eq('user_id', currentUserId)
        .select('id');
      
      if (error) {
        console.error('Failed to delete notifications:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        throw error;
      }
      
      console.log(`Successfully deleted ${deletedData?.length || 0} notifications`);
      
      // Clear local state immediately
      setAppNotifications([]);
      
      // Verify deletion by checking if any notifications remain
      const { data: remaining, error: verifyError } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', currentUserId)
        .limit(1);
      
      if (verifyError) {
        console.warn('Error verifying deletion:', verifyError);
      } else if (remaining && remaining.length > 0) {
        console.warn(`Warning: ${remaining.length} notification(s) still exist after delete. This might be due to RLS policies or concurrent inserts.`);
      } else {
        console.log('Verification: All notifications successfully deleted');
      }
    } catch (err) {
      console.error('Failed to clear all notifications:', err);
      // Don't clear local state if delete failed
      throw err;
    }
  }, [currentUserId]);

  const getUnreadNotificationsCount = useCallback((): number => {
    // If we don't have a current user ID, return 0
    if (!currentUserId) return 0;
    return appNotifications.filter(n => 
      n.userId === currentUserId && !n.isRead
    ).length;
  }, [appNotifications, currentUserId]);

  return (
    <NotificationContext.Provider
      value={{
        notifications: appNotifications,
        addNotification,
        markNotificationAsRead,
        getUnreadNotificationsCount,
        clearAllNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
