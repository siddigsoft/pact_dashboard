
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Notification, NotificationCategory } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import {
  fetchNotificationsByRecipient,
  fetchNotificationsByUserIdColumn,
  fetchAdminScopeNotifications,
  insertNotificationRow,
  markNotificationRead,
  deleteNotificationsForRecipient,
  dismissBroadcastRead,
} from '@/features/notifications/repository/notificationRepository';
import { fetchProfileRole, fetchTeamProjectIds } from '@/features/user/repository/profileRepository';


const initialNotifications: Notification[] = [];

type RealtimeStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface NotificationContextType {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id' | 'isRead' | 'createdAt'>) => void;
  markNotificationAsRead: (notificationId: string) => void;
  getUnreadNotificationsCount: () => number;
  clearAllNotifications: () => Promise<number>;
  realtimeStatus: RealtimeStatus;
  lastRefresh: Date | null;
  broadcastQueue: Notification[];
  dismissBroadcast: (notificationId: string) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [appNotifications, setAppNotifications] = useState<Notification[]>(initialNotifications);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('connecting');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [clearedAt, setClearedAt] = useState<Date | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [broadcastQueue, setBroadcastQueue] = useState<Notification[]>([]);

  // A notification should block the screen if it is a broadcast AND high/urgent priority AND unread
  const isBlockingBroadcast = useCallback((n: Notification): boolean => {
    return (
      (n.eventType === 'broadcast' ||
        n.relatedEntityType === 'broadcast' ||
        n.relatedEntityType === 'broadcast_batch') &&
      (n.priority === 'urgent' || n.priority === 'high') &&
      !n.isRead
    );
  }, []);
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

  // Get current user's role from profile
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [currentUserProjects, setCurrentUserProjects] = useState<string[]>([]);

  // Fetch user role and project assignments
  useEffect(() => {
    const fetchUserRoleAndProjects = async () => {
      if (!currentUserId) {
        setCurrentUserRole(null);
        setCurrentUserProjects([]);
        return;
      }
      
      try {
        // Fetch user role
        const role = await fetchProfileRole(currentUserId);
        if (role) setCurrentUserRole(role);

        try {
          const projectIds = await fetchTeamProjectIds(currentUserId);
          setCurrentUserProjects(projectIds);
        } catch {
          console.debug('[Notifications] team_members table not available, skipping project filter');
        }
      } catch (error) {
        console.error('Error fetching user role/projects:', error);
      }
    };
    
    fetchUserRoleAndProjects();
  }, [currentUserId]);

  // Helper to map DB row to UI Notification (using correct schema column names)
  // Supports both old columns (title, message, link, related_entity_id/type) 
  // and new columns (title_en, message_en, action_url, entity_id/type)
  const mapDbToNotification = useCallback((row: any): Notification => {
    const userId = row.recipient_id || row.user_id;
    
    return {
      id: row.id,
      userId: userId,
      title: row.title_en || row.title || '',
      message: row.message_en || row.message || '',
      // Map type: use row.type if present, otherwise derive from event_type or priority
      // event_type 'success' should map to type 'success', not 'info'
      type: row.type || 
            (row.event_type === 'success' ? 'success' : 
             row.event_type === 'error' ? 'error' :
             row.status === 'read' ? 'success' : 
             row.priority === 'urgent' ? 'error' : 
             row.priority === 'high' ? 'warning' : 
             'info'),
      isRead: row.is_read || !!row.read_at || row.status === 'read',
      createdAt: row.created_at,
      link: row.action_url || row.link || undefined,
      relatedEntityId: row.entity_id || row.related_entity_id || undefined,
      relatedEntityType: row.entity_type || row.related_entity_type || undefined,
      category: row.event_type || undefined,
      priority: row.priority || undefined,
      targetRoles: row.recipient_role ? [row.recipient_role] : undefined,
      projectId: undefined,
    };
  }, []);

  // Filter notifications by user role and project
  const filterByRoleAndProject = useCallback((notification: Notification): boolean => {
    // If notification has target roles, check if user has one of them
    if (notification.targetRoles && notification.targetRoles.length > 0) {
      if (!currentUserRole || !notification.targetRoles.includes(currentUserRole)) {
        return false;
      }
    }
    
    // If notification has a project ID, check if user is a member
    if (notification.projectId) {
      if (currentUserProjects.length === 0 || !currentUserProjects.includes(notification.projectId)) {
        return false;
      }
    }
    
    return true;
  }, [currentUserRole, currentUserProjects]);

  // Reset clear state when user changes (new session)
  useEffect(() => {
    setClearedAt(null);
    setDismissedIds(new Set());
  }, [currentUserId]);

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
        const isAdmin = currentUserRole && ['admin', 'Admin', 'super_admin', 'superAdmin', 'SuperAdmin'].includes(currentUserRole);
        
        let allNotifications: any[] = [];
        
        // First, fetch user's own notifications
        const [recipientResult, userResult] = await Promise.all([
          fetchNotificationsByRecipient(currentUserId, 50),
          fetchNotificationsByUserIdColumn(currentUserId, 50),
        ]);

        const userError = recipientResult.error || userResult.error;
        if (userError) {
          console.error('[NotificationContext] Error fetching notifications:', userError);
        } else {
          const merged = [...(recipientResult.data || []), ...(userResult.data || [])];
          const deduped = Array.from(
            new Map(merged.map((n: any) => [n.id, n])).values()
          );
          deduped.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          allNotifications = deduped.slice(0, 50);
        }
        
        // If admin, also fetch system and assignment notifications related to MMPs and site visits
        // This includes: MMP uploads (system), MMP forwarded to FOM (assignments), etc.
        if (isAdmin) {
          const { data: adminNotifications, error: adminError } = await fetchAdminScopeNotifications(50);
          
          if (adminError) {
            console.error('[NotificationContext] Error fetching admin notifications:', adminError);
          } else if (adminNotifications) {
            // Merge and deduplicate by ID
            const existingIds = new Set(allNotifications.map(n => n.id));
            const newAdminNotifications = adminNotifications.filter(n => !existingIds.has(n.id));
            allNotifications = [...allNotifications, ...newAdminNotifications];
            // Sort by created_at descending
            allNotifications.sort((a, b) => 
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
            // Limit to 50 total
            allNotifications = allNotifications.slice(0, 50);
          }
        }
        
        if (!cancelled) {
          if (userError) {
            console.error('[NotificationContext] Failed to fetch notifications:', userError);
          } else {
            const mapped = allNotifications.map(mapDbToNotification);
            const filteredOutChat = mapped.filter(n => n.title !== 'Chat System Active');
            const filtered = filteredOutChat.filter(filterByRoleAndProject);
            setAppNotifications(prev => {
              const currentClearedAt = clearedAt;
              const currentDismissedIds = dismissedIds;
              if (!currentClearedAt && currentDismissedIds.size === 0) return filtered;
              return filtered.filter(n => {
                if (currentDismissedIds.has(n.id)) return false;
                if (currentClearedAt && new Date(n.createdAt) <= currentClearedAt) return false;
                return true;
              });
            });
            setLastRefresh(new Date());
          }
        }
      } catch (err) {
        console.warn('Fetch notifications threw:', err);
      }
    };

    const subscribeRealtime = () => {
      if (!currentUserId) return;
      try {
        // Subscribe to notifications for recipient_id or user_id
        // Database uses recipient_id as primary column in extended schema
        channel = supabase
          .channel(`notifications-${currentUserId}`)
          // Listen for recipient_id (primary) and user_id (fallback)
          .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `recipient_id=eq.${currentUserId}`,
          }, (payload) => {
            const n = mapDbToNotification((payload as any).new);
            if (n.userId === currentUserId && filterByRoleAndProject(n)) {
              setAppNotifications(prev => {
                if (prev.some(p => p.id === n.id)) return prev;
                return [n, ...prev].slice(0, 50);
              });
              // Push to blocking queue if this is a high/urgent broadcast
              if (isBlockingBroadcast(n)) {
                setBroadcastQueue(prev =>
                  prev.some(b => b.id === n.id) ? prev : [...prev, n]
                );
              }
            }
          })
          .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${currentUserId}`,
          }, (payload) => {
            const n = mapDbToNotification((payload as any).new);
            if (n.userId === currentUserId && filterByRoleAndProject(n)) {
              setAppNotifications(prev => {
                if (prev.some(p => p.id === n.id)) return prev;
                return [n, ...prev].slice(0, 50);
              });
              // Push to blocking queue if this is a high/urgent broadcast
              if (isBlockingBroadcast(n)) {
                setBroadcastQueue(prev =>
                  prev.some(b => b.id === n.id) ? prev : [...prev, n]
                );
              }
            }
          })
          .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `recipient_id=eq.${currentUserId}`,
          }, (payload) => {
            const updated = mapDbToNotification((payload as any).new);
            if (updated.userId === currentUserId) {
              setAppNotifications(prev => 
                prev.map(n => n.id === updated.id ? updated : n)
              );
            }
          })
          .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${currentUserId}`,
          }, (payload) => {
            const updated = mapDbToNotification((payload as any).new);
            if (updated.userId === currentUserId) {
              setAppNotifications(prev => 
                prev.map(n => n.id === updated.id ? updated : n)
              );
            }
          })
          .on('postgres_changes', {
            event: 'DELETE',
            schema: 'public',
            table: 'notifications',
            filter: `recipient_id=eq.${currentUserId}`,
          }, (payload) => {
            const deletedId = (payload as any).old.id;
            setAppNotifications(prev => prev.filter(n => n.id !== deletedId));
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
          .subscribe((status, err) => {
            if (status === 'SUBSCRIBED') {
              console.log('Notifications realtime connected');
              setRealtimeStatus('connected');
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              console.warn('Notifications realtime error:', status, err);
              setRealtimeStatus('error');
              // Retry after delay
              setTimeout(() => {
                if (!cancelled && channel) {
                  setRealtimeStatus('connecting');
                  supabase.removeChannel(channel);
                  subscribeRealtime();
                }
              }, 5000);
            } else if (status === 'CLOSED') {
              setRealtimeStatus('disconnected');
            }
          });
      } catch (err) {
        console.warn('Realtime subscription failed:', err);
      }
    };

    fetchNotifications();
    subscribeRealtime();

    // Poll more frequently (every 15 seconds) as fallback for realtime
    const interval = setInterval(fetchNotifications, 15000);
    return () => {
      cancelled = true;
      try { if (channel) supabase.removeChannel(channel); } catch {}
      clearInterval(interval);
    };
  }, [currentUserId, mapDbToNotification, filterByRoleAndProject]);

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

    // Fire-and-forget persistence to Supabase (using correct schema columns)
    (async () => {
      try {
        const { error } = await insertNotificationRow(notification);
        if (error) {
          console.warn('Failed to persist notification:', error.message);
        }
      } catch (err) {
        console.warn('Failed to persist notification:', err);
      }
    })();
  }, [isDuplicateNotification]);

  const markNotificationAsRead = useCallback(async (notificationId: string) => {
    setAppNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n));
    try {
      // Update read_at and status to mark as read
      const { error } = await markNotificationRead(notificationId);
      if (error) {
        console.warn('Failed to persist read state:', error.message);
      }
    } catch (err) {
      console.warn('Failed to persist read state:', err);
    }
  }, []);

  const clearAllNotifications = useCallback(async () => {
    // Get the authenticated user ID directly from Supabase auth
    // This ensures it matches auth.uid() used in RLS policies
    let userId: string | null = null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id || null;
    } catch (err) {
      console.error('Failed to get authenticated user:', err);
      userId = currentUserId;
    }
    
    if (!userId) {
      console.warn('Cannot clear notifications: no authenticated user ID');
      throw new Error('User not authenticated');
    }
    
    // Track all currently visible notification IDs so they stay dismissed
    // even if they can't be deleted from DB (e.g. admin-fetched notifications)
    const currentIds = new Set(appNotifications.map(n => n.id));
    const clearTimestamp = new Date();
    
    try {
      const { data: deletedData, error } = await deleteNotificationsForRecipient(userId);
      
      if (error) {
        console.error('Failed to delete notifications:', error.code, error.message);
        if (error.code === '42501' || error.message?.includes('policy')) {
          throw new Error('Permission denied: Unable to delete notifications. Please check RLS policies.');
        }
        throw error;
      }
      
      const deletedCount = deletedData?.length || 0;
      
      // Set clear timestamp and dismissed IDs to prevent re-fetch from bringing them back
      setClearedAt(clearTimestamp);
      setDismissedIds(prev => {
        const next = new Set(prev);
        currentIds.forEach(id => next.add(id));
        return next;
      });
      setAppNotifications([]);
      
      return deletedCount;
    } catch (err) {
      console.error('Failed to clear all notifications:', err);
      throw err;
    }
  }, [currentUserId, appNotifications]);

  const getUnreadNotificationsCount = useCallback((): number => {
    if (!currentUserId) return 0;
    return appNotifications.filter(n =>
      n.userId === currentUserId && !n.isRead
    ).length;
  }, [appNotifications, currentUserId]);

  // Seed the blocking broadcast queue from initial fetch —
  // only show broadcasts created within the last hour to avoid replaying stale ones
  const [broadcastQueueSeeded, setBroadcastQueueSeeded] = useState(false);
  useEffect(() => {
    if (broadcastQueueSeeded || appNotifications.length === 0) return;
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const pending = appNotifications.filter(n =>
      isBlockingBroadcast(n) &&
      new Date(n.createdAt).getTime() > oneHourAgo
    );
    if (pending.length > 0) {
      setBroadcastQueue(pending);
    }
    setBroadcastQueueSeeded(true);
  }, [appNotifications, broadcastQueueSeeded, isBlockingBroadcast]);

  // Reset seeded flag when user changes
  useEffect(() => {
    setBroadcastQueueSeeded(false);
    setBroadcastQueue([]);
  }, [currentUserId]);

  const dismissBroadcast = useCallback(async (notificationId: string) => {
    // Remove from queue immediately
    setBroadcastQueue(prev => prev.filter(n => n.id !== notificationId));
    // Mark as read in local state and DB
    setAppNotifications(prev =>
      prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n)
    );
    try {
      await dismissBroadcastRead(notificationId);
    } catch (err) {
      console.warn('[Notification] Failed to mark broadcast as read:', err);
    }
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        notifications: appNotifications,
        addNotification,
        markNotificationAsRead,
        getUnreadNotificationsCount,
        clearAllNotifications,
        realtimeStatus,
        lastRefresh,
        broadcastQueue,
        dismissBroadcast,
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
