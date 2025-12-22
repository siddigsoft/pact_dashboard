
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Notification, NotificationCategory } from '@/types';
import { supabase } from '@/integrations/supabase/client';


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
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [appNotifications, setAppNotifications] = useState<Notification[]>(initialNotifications);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('connecting');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
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
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', currentUserId)
          .single();
        
        if (profile?.role) {
          setCurrentUserRole(profile.role);
        }
        
        // Fetch user's project memberships (table may not exist in some deployments)
        try {
          const { data: teamMemberships, error: teamError } = await supabase
            .from('team_members')
            .select('project_id')
            .eq('user_id', currentUserId);
          
          if (!teamError && teamMemberships) {
            const projectIds = teamMemberships
              .map(m => m.project_id)
              .filter((id): id is string => id !== null);
            setCurrentUserProjects(projectIds);
          }
        } catch {
          // team_members table may not exist - this is optional
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
    // Ensure we have a valid userId - prefer recipient_id, fallback to user_id
    const userId = row.recipient_id || row.user_id;
    
    // Log if we have a notification with missing userId (shouldn't happen but helps debug)
    if (!userId && row.id) {
      console.warn('[NotificationContext] Notification missing userId:', row.id, {
        recipient_id: row.recipient_id,
        user_id: row.user_id,
        title: row.title_en || row.title
      });
    }
    
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
        // Fetch notifications where recipient_id OR user_id matches current user
        // Database has both columns - recipient_id is the primary one in extended schema
        console.log('[NotificationContext] Fetching notifications for user:', currentUserId);
        console.log('[NotificationContext] Current user role:', currentUserRole);
        
        // If user is admin or super admin, also include system notifications (like MMP uploads)
        const isAdmin = currentUserRole && ['admin', 'Admin', 'super_admin', 'superAdmin', 'SuperAdmin'].includes(currentUserRole);
        
        let allNotifications: any[] = [];
        
        // First, fetch user's own notifications
        const { data: userNotifications, error: userError } = await supabase
          .from('notifications')
          .select('*')
          .or(`recipient_id.eq.${currentUserId},user_id.eq.${currentUserId}`)
          .order('created_at', { ascending: false })
          .limit(50);
        
        if (userError) {
          console.error('[NotificationContext] Error fetching user notifications:', userError);
        } else if (userNotifications) {
          allNotifications = userNotifications;
          console.log('[NotificationContext] User notifications:', userNotifications.length);
        }
        
        // If admin, also fetch system notifications (MMP uploads, etc.)
        if (isAdmin) {
          console.log('[NotificationContext] Admin user - fetching system notifications');
          const { data: systemNotifications, error: systemError } = await supabase
            .from('notifications')
            .select('*')
            .eq('event_type', 'system')
            .in('entity_type', ['mmpFile', 'siteVisit'])
            .order('created_at', { ascending: false })
            .limit(50);
          
          if (systemError) {
            console.error('[NotificationContext] Error fetching system notifications:', systemError);
          } else if (systemNotifications) {
            console.log('[NotificationContext] System notifications:', systemNotifications.length);
            // Merge and deduplicate by ID
            const existingIds = new Set(allNotifications.map(n => n.id));
            const newSystemNotifications = systemNotifications.filter(n => !existingIds.has(n.id));
            allNotifications = [...allNotifications, ...newSystemNotifications];
            // Sort by created_at descending
            allNotifications.sort((a, b) => 
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
            // Limit to 50 total
            allNotifications = allNotifications.slice(0, 50);
          }
        }
        
        const error = userError;
        const data = allNotifications;
        
        console.log('[NotificationContext] Query result - error:', error);
        console.log('[NotificationContext] Query result - data count:', data?.length || 0);
        
        if (!cancelled) {
          if (error) {
            console.error('[NotificationContext] Failed to fetch notifications:', error);
            console.error('[NotificationContext] Error code:', error.code);
            console.error('[NotificationContext] Error message:', error.message);
            console.error('[NotificationContext] Error details:', error.details);
            console.error('[NotificationContext] Error hint:', error.hint);
          } else if (data) {
            console.log('[NotificationContext] Raw notifications fetched:', data.length);
            console.log('[NotificationContext] Sample notification:', data[0]);
            
            // Additional client-side filter as backup + role/project filtering
            const mapped = data.map(mapDbToNotification);
            console.log('[NotificationContext] Mapped notifications:', mapped.length);
            
            const filteredOutChat = mapped.filter(n => n.title !== 'Chat System Active');
            console.log('[NotificationContext] After filtering out chat:', filteredOutChat.length);
            
            const filtered = filteredOutChat.filter(filterByRoleAndProject);
            console.log('[NotificationContext] After role/project filter:', filtered.length);
            console.log('[NotificationContext] Final notifications to display:', filtered);
            
            setAppNotifications(filtered);
            setLastRefresh(new Date());
          } else {
            console.warn('[NotificationContext] No data returned from query');
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
            // Only add if it matches current user
            if (n.userId === currentUserId && filterByRoleAndProject(n)) {
              setAppNotifications(prev => {
                // Avoid duplicates
                if (prev.some(p => p.id === n.id)) return prev;
                return [n, ...prev].slice(0, 50);
              });
            }
          })
          .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${currentUserId}`,
          }, (payload) => {
            const n = mapDbToNotification((payload as any).new);
            // Only add if it matches current user (double check)
            if (n.userId === currentUserId && filterByRoleAndProject(n)) {
              setAppNotifications(prev => {
                // Avoid duplicates
                if (prev.some(p => p.id === n.id)) return prev;
                return [n, ...prev].slice(0, 50);
              });
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
        const { error } = await supabase.from('notifications').insert({
          recipient_id: notification.userId,
          user_id: notification.userId, // Also set for RLS policy compatibility
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
      const { error } = await supabase.from('notifications').update({ 
        status: 'read', 
        read_at: new Date().toISOString() 
      }).eq('id', notificationId);
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
      // Fallback to currentUserId from state
      userId = currentUserId;
    }
    
    if (!userId) {
      console.warn('Cannot clear notifications: no authenticated user ID');
      throw new Error('User not authenticated');
    }
    
    console.log(`Attempting to delete all notifications for user: ${userId}`);
    
    // Delete all notifications for the current user from the database
    try {
      // Delete notifications where recipient_id matches
      const { data: deletedData, error } = await supabase
        .from('notifications')
        .delete()
        .eq('recipient_id', userId)
        .select('id');
      
      if (error) {
        console.error('Failed to delete notifications:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        
        // Check if it's an RLS policy error
        if (error.code === '42501' || error.message?.includes('policy')) {
          console.error('RLS policy error: User may not have permission to delete notifications');
          throw new Error('Permission denied: Unable to delete notifications. Please check RLS policies.');
        }
        
        throw error;
      }
      
      const deletedCount = deletedData?.length || 0;
      console.log(`Successfully deleted ${deletedCount} notifications`);
      
      // Clear local state immediately
      setAppNotifications([]);
      
      // Verify deletion by checking if any notifications remain
      const { data: remaining, error: verifyError } = await supabase
        .from('notifications')
        .select('id')
        .eq('recipient_id', userId)
        .limit(1);
      
      if (verifyError) {
        console.warn('Error verifying deletion:', verifyError);
      } else if (remaining && remaining.length > 0) {
        console.warn(`Warning: ${remaining.length} notification(s) still exist after delete. This might be due to RLS policies or concurrent inserts.`);
      } else {
        console.log('Verification: All notifications successfully deleted');
      }
      
      return deletedCount;
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
        realtimeStatus,
        lastRefresh,
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
