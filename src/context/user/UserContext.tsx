
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { User } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { isProtectedOwner } from '@/lib/protected-accounts';
import { useRoles } from '@/hooks/use-roles';
import { AppRole } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { EmailNotificationService } from '@/services/email-notification.service';
import i18n from '@/lib/i18n';
import { queryClient } from '@/lib/queryClient';

interface UserContextType {
  currentUser: User | null;
  authReady: boolean;
  users: User[];
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  registerUser: (user: Partial<User>) => Promise<boolean>;
  approveUser: (userId: string) => Promise<boolean>;
  rejectUser: (userId: string) => Promise<boolean>;
  updateUser: (user: User) => Promise<boolean>;
  updateUserLocation: (latitude: number, longitude: number, accuracy?: number) => Promise<boolean>;
  updateUserAvailability: (status: 'online' | 'offline' | 'busy') => Promise<boolean>;
  toggleLocationSharing: (isSharing: boolean) => Promise<boolean>;
  refreshUsers: () => Promise<void>;
  hydrateCurrentUser: () => Promise<boolean>;
  roles: AppRole[];
  hasRole: (role: AppRole) => boolean;
  addRole: (userId: string, role: AppRole) => Promise<boolean>;
  removeRole: (userId: string, role: AppRole) => Promise<boolean>;
  emailVerificationPending: boolean;
  verificationEmail?: string;
  resendVerificationEmail: (email?: string) => Promise<boolean>;
  clearEmailVerificationNotice: () => void;
  sendPasswordRecoveryEmail: (email: string) => Promise<boolean>;
  adminSetUserPassword: (email: string, newPassword: string) => Promise<boolean>;
  adminConfirmUserEmail: (userId: string) => Promise<boolean>;
  adminUpdateUserEmail: (userId: string, newEmail: string) => Promise<boolean>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const storedUser = localStorage.getItem('PACTCurrentUser');
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser) as User;
        return {
          ...parsedUser,
          availability: parsedUser.availability || 'online',
          lastActive: parsedUser.lastActive || new Date().toISOString()
        };
      } catch (error) {
        console.error("Error parsing stored user:", error);
        return null;
      }
    }
    return null;
  });

  const loadUsersFromStorage = (): User[] => {
    const users: User[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith('user-')) continue;
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const storedUser: Partial<User> = JSON.parse(raw);
        if (!storedUser.id) continue;
        users.push({
          id: storedUser.id,
          name: storedUser.name || 'Unknown',
          email: storedUser.email || '',
          role: storedUser.role || 'dataCollector',
          lastActive: storedUser.lastActive || new Date().toISOString(),
          availability: storedUser.availability || 'offline',
          ...storedUser,
        });
      } catch (err) {
        console.error('Error parsing stored user:', err);
      }
    }
    return users;
  };

  const [appUsers, setAppUsers] = useState<User[]>(loadUsersFromStorage);
  const [authReady, setAuthReady] = useState(false);
  
  // Debug: Track authReady changes
  useEffect(() => {
    console.log('[Auth] authReady state changed:', authReady);
  }, [authReady]);
  
  const { toast } = useToast();
  const { roles, hasRole, addRole, removeRole } = useRoles(currentUser?.id);

  const [emailVerification, setEmailVerification] = useState<{ pending: boolean; email?: string }>({ pending: false });

  const resendVerificationEmail = async (emailParam?: string): Promise<boolean> => {
    try {
      const target = emailParam || emailVerification.email;
      if (!target) return false;
      const { error } = await supabase.auth.resend({ type: 'signup', email: target });
      if (error) {
        toast({
          title: 'Resend failed',
          description: error.message || 'Failed to send verification link.',
          variant: 'destructive',
        });
        return false;
      }
      toast({
        title: 'Verification email sent',
        description: `We sent a verification link to ${target}.`,
      });
      return true;
    } catch (err: any) {
      toast({
        title: 'Resend failed',
        description: err?.message || 'Unexpected error while resending.',
        variant: 'destructive',
      });
      return false;
    }
  };

  const clearEmailVerificationNotice = () => setEmailVerification({ pending: false, email: undefined });

  const refreshUsers = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // Not authenticated: avoid RLS errors and empty responses
        setAppUsers([]);
        return;
      }
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, username, email, role, status, availability, avatar_url, phone, employee_id, state_id, hub_id, secondary_hub_id, locality_id, location, created_at, department_id, employment_type, contract_start_date, contract_end_date, reports_to, bank_account');
      
      if (profilesError) {
        console.error("Error fetching profiles:", profilesError);
        return;
      }

      console.log("Profiles fetched:", profilesData?.length || 0);
      
      const allUserRoles: Record<string, AppRole[]> = {};
      
      if (profilesData && profilesData.length > 0) {
        const { data: userRoles, error: rolesError } = await supabase
          .from('user_roles')
          .select('user_id, role');
          
        if (rolesError) {
          console.error("Error fetching user roles:", rolesError);
        } else if (userRoles) {
          userRoles.forEach((r) => {
            if (!allUserRoles[r.user_id]) {
              allUserRoles[r.user_id] = [];
            }
            // Only include system (text) roles here; custom roles use role_id and are managed in Role Management
            if (r.role) {
              allUserRoles[r.user_id].push(r.role as AppRole);
            }
          });
        }
        
        const supabaseUsers = profilesData.map(profile => {
          const localStorageKey = `user-${profile.id}`;
          let existingUser: Partial<User> = {};
          
          try {
            const storedUser = localStorage.getItem(localStorageKey);
            if (storedUser) {
              existingUser = JSON.parse(storedUser);
            }
          } catch (error) {
            console.error("Error parsing stored user:", error);
          }
          
          // Parse location data from database if it's a string
          let locationData = existingUser.location;
          if (profile.location) {
            try {
              if (typeof profile.location === 'string') {
                locationData = JSON.parse(profile.location);
              } else {
                locationData = profile.location;
              }
            } catch (error) {
              console.error("Error parsing location data:", error);
              locationData = existingUser.location;
            }
          }
          
          return {
            id: profile.id,
            name: profile.full_name || profile.username || 'Unknown',
            email: profile.email || existingUser.email || '',
            role: profile.role || 'dataCollector',
            roles: allUserRoles[profile.id] || [],
            stateId: profile.state_id || existingUser.stateId,
            hubId: profile.hub_id || existingUser.hubId,
            secondaryHubId: profile.secondary_hub_id || (profile.location as Record<string, string> | null)?.secondary_hub_id || existingUser.secondaryHubId,
            localityId: profile.locality_id || existingUser.localityId,
            avatar: profile.avatar_url || existingUser.avatar,
            username: profile.username || existingUser.username,
            fullName: profile.full_name || existingUser.fullName,
            phone: profile.phone || existingUser.phone,
            employeeId: profile.employee_id || existingUser.employeeId,
            lastActive: existingUser.lastActive || new Date().toISOString(),
            isApproved: profile.status === 'approved' || false,
            profileStatus: profile.status || 'pending',
            availability: profile.availability || existingUser.availability || 'offline',
            createdAt: profile.created_at || existingUser.createdAt || new Date().toISOString(),
            emergencyContact: (profile as Record<string, unknown>)['emergency_contact'] as string | null || existingUser.emergencyContact || null,
            bio: (profile as Record<string, unknown>)['bio'] as string | null || existingUser.bio || null,
            location: locationData,
            performance: existingUser.performance || {
              rating: 0,
              totalCompletedTasks: 0,
              onTimeCompletion: 0,
            },
            departmentId: profile.department_id ?? null,
            employmentType: profile.employment_type ?? null,
            contractStartDate: profile.contract_start_date ?? null,
            contractEndDate: profile.contract_end_date ?? null,
            reportsTo: profile.reports_to ?? null,
            bankAccount: (profile as any).bank_account ?? existingUser.bankAccount ?? undefined,
            countryId: (profile as any).country_id ?? existingUser.countryId ?? null,
          } as User;
        });
        
        supabaseUsers.forEach(user => {
          localStorage.setItem(`user-${user.id}`, JSON.stringify(user));
        });
        setAppUsers(supabaseUsers);
      }
    } catch (error) {
      console.error("Error in fetchUsers:", error);
    }
  };

  useEffect(() => {
    refreshUsers();

    // Set up real-time subscriptions for users and roles
    // Listen only to INSERT/DELETE on profiles — UPDATE is handled optimistically
    // by the 'profiles-updates' channel below to avoid a redundant full re-fetch.
    const usersChannel = supabase
      .channel('users-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'profiles' },
        () => { refreshUsers(); }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'profiles' },
        () => { refreshUsers(); }
      )
      .on(
        'postgres_changes',
        // Scope to INSERT/DELETE only — UPDATE is rare and INSERT/DELETE covers assignment changes.
        // Avoid event:'*' on the entire table; that triggers a full refreshUsers() for every
        // role change by any admin, exhausting the connection pool at scale.
        { event: 'INSERT', schema: 'public', table: 'user_roles' },
        () => { refreshUsers(); }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'user_roles' },
        () => { refreshUsers(); }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('[UserContext] Real-time subscription error — check Supabase replication settings');
        } else if (status === 'TIMED_OUT') {
          console.warn('[UserContext] Real-time subscription timed out');
        }
      });

    // Cleanup subscription on unmount
    return () => {
      supabase.removeChannel(usersChannel);
    };
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('profiles-updates')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        async (payload) => {
          const updated: any = (payload as any).new;
          if (!updated || !updated.id) return;

          // If the updated profile belongs to the current user and their status
          // changed to 'pending' or 'rejected', sign them out immediately so that
          // admin approval changes take effect on active sessions.
          const currentUserId = currentUserRef.current?.id;
          if (updated.id === currentUserId) {
            const newStatus = updated.status as string | undefined;
            const currentRoleNorm = (currentUserRef.current?.role || '').toLowerCase().replace(/[\s_-]/g, '');
            const isPrivileged = ['superadmin', 'admin', 'ict', 'fom', 'supervisor', 'hubsupervisor', 'datateam'].includes(currentRoleNorm);
            if (!isPrivileged && (newStatus === 'pending' || newStatus === 'rejected')) {
              toast({
                title: i18n.t('notifications.auth.pendingApproval'),
                description: i18n.t('notifications.auth.pendingApprovalDesc'),
                variant: 'destructive',
              });
              await supabase.auth.signOut({ scope: 'local' });
              return;
            }
          }

          let locationData: any | undefined = undefined;
          if (updated.location !== undefined) {
            try {
              locationData = typeof updated.location === 'string'
                ? JSON.parse(updated.location)
                : updated.location;
            } catch (e) {
              console.warn('Failed to parse profile.location from realtime payload');
            }
          }

          setAppUsers(prev => prev.map(u => {
            if (u.id !== updated.id) return u;
            return {
              ...u,
              availability: updated.availability ?? u.availability,
              location: locationData !== undefined ? { ...(u.location || {}), ...locationData } : u.location,
            };
          }));

          setCurrentUser(prev => {
            if (!prev || prev.id !== updated.id) return prev;
            const next = {
              ...prev,
              availability: updated.availability ?? prev.availability,
              location: locationData !== undefined ? { ...(prev.location || {}), ...locationData } : prev.location,
            } as User;
            try {
              localStorage.setItem('PACTCurrentUser', JSON.stringify(next));
              localStorage.setItem(`user-${next.id}`, JSON.stringify(next));
            } catch {}
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      try { supabase.removeChannel(channel); } catch {}
    };
  }, []);

  // Use a ref so the interval callback always reads the latest user ID
  // without the effect needing to restart every time currentUser changes.
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  useEffect(() => {
    const activityInterval = setInterval(() => {
      const user = currentUserRef.current;
      if (!user) return;

      setCurrentUser(prev => {
        if (!prev) return prev;
        const updated = { ...prev, lastActive: new Date().toISOString() };
        localStorage.setItem('PACTCurrentUser', JSON.stringify(updated));
        return updated;
      });

      setAppUsers(prev =>
        prev.map(u =>
          u.id === user.id ? { ...u, lastActive: new Date().toISOString() } : u
        )
      );
    }, 60000);

    return () => clearInterval(activityInterval);
  // Empty deps — interval is created once; currentUserRef.current is always fresh.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hydrate current user from existing Supabase session (OAuth/email) and listen for auth state changes
  const setUserFromAuthUser = async (authUser: any): Promise<boolean> => {
    try {
      // If offline, try to restore from localStorage first
      if (!navigator.onLine) {
        const storedUser = localStorage.getItem('PACTCurrentUser');
        if (storedUser) {
          try {
            const parsedUser = JSON.parse(storedUser) as User;
            // Only restore if it's the same user
            if (parsedUser.id === authUser.id) {
              setCurrentUser(parsedUser);
              console.log('[UserContext] Restored user from localStorage (offline, setUserFromAuthUser)');
              return true;
            }
          } catch (error) {
            console.error('[UserContext] Error parsing stored user:', error);
          }
        }
        // If no stored user or different user, we can't fetch profile offline
        // Return false but don't clear the existing user
        console.log('[UserContext] Cannot fetch profile offline - preserving existing session');
        return false;
      }
      
      const PROFILE_COLUMNS = 'id, full_name, username, email, role, status, availability, avatar_url, phone, employee_id, state_id, hub_id, secondary_hub_id, locality_id, location, created_at, department_id, employment_type, contract_start_date, contract_end_date, reports_to, bank_account';

      let { data: profileData } = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('id', authUser.id)
        .single();

      // Fallback: If not found by ID, try to find by email and sync the profile ID
      if (!profileData && authUser.email) {
        const { data: profileByEmail } = await supabase
          .from('profiles')
          .select(PROFILE_COLUMNS)
          .eq('email', authUser.email)
          .single();

        if (profileByEmail) {
          // Update the profile ID to match auth user ID for future logins
          const { data: updatedProfile } = await supabase
            .from('profiles')
            .update({ id: authUser.id })
            .eq('email', authUser.email)
            .select(PROFILE_COLUMNS)
            .single();
          
          profileData = updatedProfile || profileByEmail;
          
          // Also update super_admins table if this user is a super admin
          if (profileByEmail.role === 'superAdmin') {
            await supabase
              .from('super_admins')
              .update({ user_id: authUser.id })
              .eq('user_id', profileByEmail.id);
          }
        }
      }

      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', authUser.id);

      const userRolesList = userRoles
        ? userRoles
            .map(r => r.role)
            .filter((rr): rr is AppRole => !!rr)
        : [];

      // Fetch user's active classification
      const { data: classificationData } = await supabase
        .from('user_classifications')
        .select('classification_level, role_scope, has_retainer, retainer_amount_cents, retainer_currency, effective_from, effective_until')
        .eq('user_id', authUser.id)
        .eq('is_active', true)
        .order('effective_from', { ascending: false })
        .limit(1)
        .maybeSingle();

      const userProfile = profileData || {
        id: authUser.id,
        full_name: authUser.email?.split('@')[0] || '',
        username: authUser.email,
        role: 'dataCollector',
        status: 'pending',
      } as any;

      const userData = authUser.user_metadata || {};
      const userRole = typeof userData === 'object' && userData
        ? (userData as { role?: string }).role || 'dataCollector'
        : 'dataCollector';

      // Gate: only block users who are explicitly 'pending' or 'rejected'.
      // Privileged roles always bypass regardless of status.
      // null/undefined status = legacy account created before the status field existed → allow.
      const profileRoleNorm = (profileData?.role || '').toLowerCase().replace(/[\s_-]/g, '');
      const isPrivilegedRole = ['superadmin', 'admin', 'ict', 'fom', 'supervisor', 'hubsupervisor', 'datateam'].includes(profileRoleNorm);
      const explicitlyBlocked = profileData?.status === 'pending' || profileData?.status === 'rejected';
      if (!isPrivilegedRole && explicitlyBlocked) {
        toast({
          title: i18n.t('notifications.auth.pendingApproval'),
          description: i18n.t('notifications.auth.pendingApprovalDesc'),
        });
        await supabase.auth.signOut({ scope: 'local' });
        return false;
      }

      // Parse location data if it's a string
      let locationData;
      if (profileData?.location) {
        try {
          if (typeof profileData.location === 'string') {
            locationData = JSON.parse(profileData.location);
          } else {
            locationData = profileData.location;
          }
        } catch (error) {
          console.error("Error parsing location data:", error);
          locationData = undefined;
        }
      }

      const supabaseUser: User = {
        id: authUser.id,
        name: (userProfile as any).full_name || (userProfile as any).username || authUser.email?.split('@')[0] || 'User',
        email: authUser.email || '',
        role: (userProfile as any).role || userRole,
        roles: userRolesList.length > 0 ? userRolesList : undefined,
        stateId: (userProfile as any).state_id,
        hubId: (userProfile as any).hub_id,
        secondaryHubId: (userProfile as any).secondary_hub_id || (userProfile as any).location?.secondary_hub_id,
        localityId: (userProfile as any).locality_id,
        avatar: (userProfile as any).avatar_url,
        username: (userProfile as any).username,
        fullName: (userProfile as any).full_name,
        phone: (userProfile as any).phone,
        employeeId: (userProfile as any).employee_id,
        lastActive: new Date().toISOString(),
        isApproved: true,
        availability: profileData?.availability || 'online',
        location: locationData,
        performance: {
          rating: 0,
          totalCompletedTasks: 0,
          onTimeCompletion: 0,
        },
        classification: classificationData ? {
          level: classificationData.classification_level,
          roleScope: classificationData.role_scope,
          hasRetainer: classificationData.has_retainer || false,
          retainerAmountCents: classificationData.retainer_amount_cents || 0,
          retainerCurrency: classificationData.retainer_currency || 'SDG',
          effectiveFrom: classificationData.effective_from,
          effectiveUntil: classificationData.effective_until,
        } : undefined,
        departmentId: profileData?.department_id ?? null,
        employmentType: profileData?.employment_type ?? null,
        contractStartDate: profileData?.contract_start_date ?? null,
        contractEndDate: profileData?.contract_end_date ?? null,
        reportsTo: profileData?.reports_to ?? null,
        bankAccount: (profileData as any)?.bank_account ?? undefined,
        profileStatus: (userProfile as Record<string, unknown>)['status'] as string ?? 'approved',
        emergencyContact: (userProfile as Record<string, unknown>)['emergency_contact'] as string | null ?? null,
        bio: (userProfile as Record<string, unknown>)['bio'] as string | null ?? null,
      };

      setCurrentUser(supabaseUser);
      localStorage.setItem('PACTCurrentUser', JSON.stringify(supabaseUser));
      localStorage.setItem(`user-${supabaseUser.id}`, JSON.stringify(supabaseUser));

      const userExists = appUsers.some(u => u.id === supabaseUser.id);
      if (!userExists) {
        setAppUsers(prev => [...prev, supabaseUser]);
      }

      return true;
    } catch (e) {
      console.error('Bootstrap sign-in error:', e);
      return false;
    }
  };

  const hydrateCurrentUser = async (): Promise<boolean> => {
    const maxRetries = 3;
    const baseDelay = 2000;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), 8000);
          console.log(`Hydration retry attempt ${attempt + 1}/${maxRetries}, delay ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          console.error('Error getting session for hydration:', sessionError);
          continue;
        }
        if (!session?.user) {
          console.log('No session found for hydration');
          continue;
        }
        
        const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        console.log('Hydration AAL level:', aalData?.currentLevel, 'Next level:', aalData?.nextLevel);
        
        if (aalData?.nextLevel === 'aal2' && aalData?.currentLevel === 'aal1') {
          console.log('Session still at AAL1, MFA not yet complete, retrying...');
          continue;
        }
        
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError) {
          console.error('Error getting user for hydration:', userError);
          continue;
        }
        if (!user) {
          console.log('No user found for hydration');
          continue;
        }
        
        const result = await setUserFromAuthUser(user);
        if (result) {
          console.log('Successfully hydrated current user');
          return true;
        }
        console.log('setUserFromAuthUser returned false, retrying...');
      } catch (error) {
        console.error(`Error hydrating current user (attempt ${attempt + 1}):`, error);
      }
    }
    
    console.error('Failed to hydrate current user after all retries');
    return false;
  };

  useEffect(() => {
    let unsub: { unsubscribe: () => void } | undefined;
    let readyTimeout: any | undefined;

    const isOAuthCallback = typeof window !== 'undefined' && (
      (window.location && typeof window.location.hash === 'string' && window.location.hash.includes('access_token')) ||
      (window.location && typeof window.location.search === 'string' && new URLSearchParams(window.location.search).has('code'))
    );

    (async () => {
      try {
        // Check if we're offline - if so, restore from localStorage
        if (!navigator.onLine) {
          const storedUser = localStorage.getItem('PACTCurrentUser');
          if (storedUser) {
            try {
              const parsedUser = JSON.parse(storedUser) as User;
              setCurrentUser(parsedUser);
              console.log('[UserContext] Restored user from localStorage (offline mode)');
              return;
            } catch (error) {
              console.error('[UserContext] Error parsing stored user:', error);
            }
          }
        }
        
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) await setUserFromAuthUser(user);
          // Fetch full user list now that we know the session is live.
          // refreshUsers() is also called on mount but may have raced ahead
          // of session restoration and returned early — this guarantees it runs
          // at least once with a valid session.
          refreshUsers();
        } else {
          // Only clear user if we're online - preserve session when offline
          if (navigator.onLine) {
            setCurrentUser(null);
            localStorage.removeItem('PACTCurrentUser');
          } else {
            // Offline: try to restore from localStorage
            const storedUser = localStorage.getItem('PACTCurrentUser');
            if (storedUser) {
              try {
                const parsedUser = JSON.parse(storedUser) as User;
                setCurrentUser(parsedUser);
                console.log('[UserContext] Restored user from localStorage (offline, no session)');
              } catch (error) {
                console.error('[UserContext] Error parsing stored user:', error);
              }
            }
          }
        }
      } catch (error) {
        // Network error or other issue - preserve session if offline
        if (!navigator.onLine) {
          const storedUser = localStorage.getItem('PACTCurrentUser');
          if (storedUser) {
            try {
              const parsedUser = JSON.parse(storedUser) as User;
              setCurrentUser(parsedUser);
              console.log('[UserContext] Restored user from localStorage (offline, error)');
            } catch (parseError) {
              console.error('[UserContext] Error parsing stored user:', parseError);
            }
          }
        } else {
          console.error('[UserContext] Error getting session:', error);
        }
      }

      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
        try {
          if (event === 'SIGNED_IN') {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) await setUserFromAuthUser(user);
            refreshUsers();
          } else if (event === 'SIGNED_OUT') {
            // Only clear user if we're online - preserve session when offline
            // This prevents accidental logout when network is temporarily unavailable
            if (navigator.onLine) {
              setCurrentUser(null);
              localStorage.removeItem('PACTCurrentUser');
            } else {
              console.log('[UserContext] SIGNED_OUT event received offline - preserving session');
              // Keep the user in localStorage for offline use
            }
          }
        } catch (err) {
          console.error('Auth state handler error:', err);
          // If error occurs offline, preserve session
          if (!navigator.onLine) {
            const storedUser = localStorage.getItem('PACTCurrentUser');
            if (storedUser && !currentUser) {
              try {
                const parsedUser = JSON.parse(storedUser) as User;
                setCurrentUser(parsedUser);
                console.log('[UserContext] Restored user from localStorage after auth error (offline)');
              } catch (parseError) {
                console.error('[UserContext] Error parsing stored user:', parseError);
              }
            }
          }
        } finally {
          // Once we receive the first auth event post-mount, we can consider auth ready
          if (!authReady) setAuthReady(true);
          if (readyTimeout) clearTimeout(readyTimeout);
        }
      });
      unsub = subscription;

      // If we're not in an OAuth callback context, auth is ready now.
      // If we are, allow a short window for Supabase to process URL and emit SIGNED_IN.
      // Always set auth ready quickly - OAuth will trigger state change event anyway
      console.log('[Auth] Setting authReady=true immediately');
      setAuthReady(true);
    })();

    return () => {
      try { unsub?.unsubscribe(); } catch {}
      if (readyTimeout) clearTimeout(readyTimeout);
    };
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const { data: authData, error: authError } = await supabase.auth
        .signInWithPassword({ email, password });
      
      if (authError) {
        console.log("Supabase auth failed:", authError);

        const msg = (authError as any)?.message?.toString().toLowerCase() || "";
        const isEmailNotConfirmed = /email\s*not\s*confirm|email\s*not\s*verified/.test(msg);

        if (isEmailNotConfirmed) {
          setEmailVerification({ pending: true, email });
          try {
            const { error: resendError } = await supabase.auth.resend({ type: 'signup', email });
            if (resendError) {
              console.warn('Resend verification failed:', resendError);
              toast({
                title: "Email not verified",
                description: "Please check your inbox for the verification link. If you don't see it, try again later.",
                variant: "destructive",
              });
            } else {
              toast({
                title: "Verify your email",
                description: `We just sent a new verification link to ${email}. Check your inbox and spam folder.`,
              });
            }
          } catch (e) {
            console.warn('Resend verification threw:', e);
            toast({
              title: "Email not verified",
              description: "Please check your inbox for the verification link. If you don't see it, try again later.",
              variant: "destructive",
            });
          }
          return false;
        }

        toast({
          title: "Login failed",
          description: "Invalid email or password. Please try again.",
          variant: "destructive",
        });
        
        return false;
      } else if (authData?.user) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authData.user.id)
          .single();
        
        const { data: userRoles } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', authData.user.id);
          
        const userRolesList = userRoles
          ? userRoles
              .map(r => r.role)
              .filter((rr): rr is AppRole => !!rr)
          : [];
        
        const userProfile = profileData || {
          id: authData.user.id,
          full_name: authData.user.email?.split('@')[0] || '',
          username: authData.user.email,
          role: 'dataCollector',
        };
        
        const userData = authData.user.user_metadata || {};
        const userRole = typeof userData === 'object' && userData ? 
          (userData as {role?: string}).role || 'dataCollector' : 
          'dataCollector';

        // Gate: only block users who are explicitly 'pending' or 'rejected'.
        // Privileged roles always bypass regardless of status.
        // null/undefined status = legacy account → allow.
        const profileRoleNorm2 = (profileData?.role || '').toLowerCase().replace(/[\s_-]/g, '');
        const isPrivilegedRole2 = ['superadmin', 'admin', 'ict', 'fom', 'supervisor', 'hubsupervisor', 'datateam'].includes(profileRoleNorm2);
        const explicitlyBlocked2 = profileData?.status === 'pending' || profileData?.status === 'rejected';
        if (!isPrivilegedRole2 && explicitlyBlocked2) {
          toast({
            title: i18n.t('notifications.auth.pendingApproval'),
            description: i18n.t('notifications.auth.pendingApprovalDesc'),
          });
          await supabase.auth.signOut({ scope: 'local' });
          return false;
        }
        
        // Parse location data if it's a string
        let locationData;
        if (profileData?.location) {
          try {
            if (typeof profileData.location === 'string') {
              locationData = JSON.parse(profileData.location);
            } else {
              locationData = profileData.location;
            }
          } catch (error) {
            console.error("Error parsing location data:", error);
          }
        }
        
        const supabaseUser: User = {
          id: authData.user.id,
          name: userProfile.full_name || userProfile.username || authData.user.email?.split('@')[0] || 'User',
          email: authData.user.email || '',
          role: userProfile.role || userRole,
          roles: userRolesList.length > 0 ? userRolesList : undefined,
          stateId: userProfile.state_id,
          hubId: userProfile.hub_id,
          secondaryHubId: (userProfile as any).secondary_hub_id || (userProfile as any).location?.secondary_hub_id,
          localityId: userProfile.locality_id,
          avatar: userProfile.avatar_url,
          username: userProfile.username,
          fullName: userProfile.full_name,
          phone: userProfile.phone,
          employeeId: userProfile.employee_id,
          lastActive: new Date().toISOString(),
          isApproved,
          availability: profileData?.availability || 'online',
          location: locationData,
          performance: {
            rating: 0,
            totalCompletedTasks: 0,
            onTimeCompletion: 0,
          }
        };
        
        if (supabaseUser.role === 'admin' && (!supabaseUser.roles || !supabaseUser.roles.includes('admin' as AppRole))) {
          supabaseUser.roles = [...(supabaseUser.roles || []) as AppRole[], 'admin' as AppRole];
        }
        
        setCurrentUser(supabaseUser);
        localStorage.setItem('PACTCurrentUser', JSON.stringify(supabaseUser));
        
        localStorage.setItem(`user-${supabaseUser.id}`, JSON.stringify(supabaseUser));

        // Track first login for walkthrough — only if not already done
        const walkthroughKey = `walkthrough_completed_${supabaseUser.id}`;
        const firstLoginKey = `first_login_${supabaseUser.id}`;
        if (!localStorage.getItem(walkthroughKey) && !localStorage.getItem(firstLoginKey)) {
          localStorage.setItem(firstLoginKey, 'true');
        }

        // Invalidate cached queries so dashboard data loads fresh after login
        queryClient.invalidateQueries();
        
        const userExists = appUsers.some(u => u.id === supabaseUser.id);
        
        if (!userExists) {
          setAppUsers(prev => [...prev, supabaseUser]);
        }
        
        return true;
      }
      
      toast({
        title: "Login failed",
        description: "Invalid email or password. Please try again.",
        variant: "destructive",
      });
      return false;
    } catch (error) {
      console.error("Login error:", error);
      toast({
        title: "Login failed",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
      return false;
    }
  };

  const logout = async (): Promise<void> => {
    try {
      // Clear local state immediately so route guards react without delay
      setCurrentUser(null);
      localStorage.removeItem('PACTCurrentUser');

      // Then sign out from Supabase (network async)
      // Use scope: 'local' to only end this session, not all sessions for the user
      await supabase.auth.signOut({ scope: 'local' });
      
      toast({
        title: "Logout successful",
        description: "You have been logged out of the system.",
      });
    } catch (error) {
      console.error("Logout error:", error);
      toast({
        title: "Logout error",
        description: "An error occurred during logout.",
        variant: "destructive",
      });
    }
  };

  const registerUser = async (userData: Partial<User>): Promise<boolean> => {
    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: userData.email || '',
        password: userData.password || '',
        options: {
          data: {
            name: userData.name,
            phone: userData.phone,
            employeeId: userData.employeeId,
            role: userData.role,
            hubId: userData.hubId,
            stateId: userData.stateId,
            localityId: userData.localityId,
            avatar: userData.avatar,
            emergencyContact: userData.emergencyContact,
            bio: userData.bio,
          }
        }
      });
      
      if (signUpError) {
        console.error("Supabase signup error:", signUpError);
        let errorDesc = "There was a problem creating your account. Please try again.";
        const msg = (signUpError.message || '').toLowerCase();
        if (msg.includes('already registered') || msg.includes('already been registered')) {
          errorDesc = "This email is already registered. Please sign in or reset your password.";
        } else if (msg.includes('password')) {
          errorDesc = "Password must be at least 6 characters long.";
        } else if (msg.includes('rate limit') || msg.includes('too many')) {
          errorDesc = "Too many attempts. Please wait a moment and try again.";
        } else if (msg.includes('network') || msg.includes('fetch')) {
          errorDesc = "Network error. Please check your internet connection and try again.";
        }
        toast({
          title: "Registration failed",
          description: errorDesc,
          variant: "destructive",
        });
        return false;
      }

      if (signUpData?.user?.identities && signUpData.user.identities.length === 0) {
        toast({
          title: "Email already registered",
          description: "An account with this email already exists. Please sign in or reset your password.",
          variant: "destructive",
        });
        return false;
      }
      
      // Also explicitly update profiles table with onboarding fields the trigger may not map
      if (signUpData?.user?.id) {
        const profilePatch: Record<string, string | null | undefined> = {};
        if (userData.emergencyContact) profilePatch['emergency_contact'] = userData.emergencyContact;
        if (userData.bio) profilePatch['bio'] = userData.bio;
        if (Object.keys(profilePatch).length > 0) {
          await supabase.from('profiles').update(profilePatch).eq('id', signUpData.user.id);
        }
      }

      toast({
        title: "Registration successful",
        description: "Your account is pending approval by an administrator.",
      });
      
      await refreshUsers();
      return true;
    } catch (error) {
      console.error("Registration error:", error);
      toast({
        title: "Registration error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
      return false;
    }
  };

  const approveUser = async (userId: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({ status: 'approved' })
        .eq('id', userId)
        .select('id');
      
      if (error) {
        console.error("Supabase approval error:", error);
        toast({
          title: "Approval error",
          description: "There was an error approving the user in Supabase.",
          variant: "destructive",
        });
        return false;
      }
      if (!data || data.length === 0) {
        toast({
          title: "Approval blocked",
          description: "No user was updated. Check Row Level Security policies for profiles.",
          variant: "destructive",
        });
        return false;
      }
      
      setAppUsers(prev => 
        prev.map(user => 
          user.id === userId ? { ...user, isApproved: true } : user
        )
      );

      const storedUser = localStorage.getItem(`user-${userId}`);
      if (storedUser) {
        try {
          const parsedUser = JSON.parse(storedUser);
          localStorage.setItem(`user-${userId}`, JSON.stringify({
            ...parsedUser,
            isApproved: true
          }));
        } catch (error) {
          console.error("Error updating stored user:", error);
        }
      }

      toast({
        title: "User approved",
        description: "The user can now log in to the system.",
      });

      // Send welcome email and in-app notification to the newly approved user
      try {
        const { data: userProfile } = await supabase
          .from('profiles')
          .select('email, full_name, role')
          .eq('id', userId)
          .single();

        if (userProfile?.email) {
          EmailNotificationService.sendWelcomeEmail(
            userProfile.email,
            userProfile.full_name || 'User',
            userProfile.role || 'Data Collector'
          );
        }

        // Insert in-app notification for the approved user
        await supabase.from('notifications').insert({
          recipient_id: userId,
          title: 'Your account has been activated!',
          message: 'Welcome to PACT! Your account registration has been approved and you now have full access to the system. Log in to get started.',
          type: 'success',
          category: 'account',
          priority: 'high',
          link: '/dashboard',
          is_read: false,
          created_at: new Date().toISOString(),
        });
      } catch (emailError) {
        console.error('Failed to send welcome email or notification:', emailError);
      }

      // Mark as first login so walkthrough shows on next sign-in
      try {
        await supabase.from('profiles').update({ metadata: { first_login: true } }).eq('id', userId);
      } catch {}

      return true;
    } catch (error) {
      console.error("User approval error:", error);
      toast({
        title: "Approval error",
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
      return false;
    }
  };

  const rejectUser = async (userId: string): Promise<boolean> => {
    try {
      // Delete related notifications first to avoid foreign key constraint violations
      await supabase.from('notifications').delete().eq('recipient_id', userId);
      await supabase.from('notifications').delete().eq('triggered_by', userId);
      
      const { data, error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId)
        .select('id');
      
      if (error) {
        console.error("Supabase rejection error:", error);
      }
      if (error || !data || data.length === 0) {
        toast({
          title: "Rejection blocked by security policy",
          description: "Your role can't delete this profile. A Super Admin needs to grant admins DELETE permission on the profiles table (or use the soft-reject flow that sets status='rejected').",
          variant: "destructive",
        });
        return false;
      }
      
      setAppUsers(prev => prev.filter(user => user.id !== userId));

      localStorage.removeItem(`user-${userId}`);

      toast({
        title: "User rejected",
        description: "The user has been removed from the system.",
      });
      return true;
    } catch (error) {
      console.error("User rejection error:", error);
      toast({
        title: "Rejection error",
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
      return false;
    }
  };

  const updateUserLocation = async (latitude: number, longitude: number, accuracy?: number): Promise<boolean> => {
    try {
      if (!currentUser) return false;

      const now = new Date().toISOString();
      const mergedLocation = {
        ...(currentUser.location || {}),
        latitude,
        longitude,
        accuracy: accuracy !== undefined ? accuracy : (currentUser.location?.accuracy || undefined),
        lastUpdated: now,
        isSharing: true,
      } as NonNullable<User['location']>;

      const { data, error } = await supabase
        .from('profiles')
        .update({
          location: mergedLocation,
          location_sharing: true,
        })
        .eq('id', currentUser.id)
        .select('id');

      if (error || !data || data.length === 0) {
        console.error('Update location error:', error || 'No row updated (RLS?)');
        return false;
      }

      const updatedUsers = appUsers.map(u =>
        u.id === currentUser.id
          ? {
              ...u,
              location: {
                ...(u.location || {}),
                ...mergedLocation,
              },
            }
          : u
      );
      setAppUsers(updatedUsers);

      const updatedCurrentUser = {
        ...currentUser,
        location: {
          ...(currentUser.location || {}),
          ...mergedLocation,
        },
      };
      setCurrentUser(updatedCurrentUser);
      localStorage.setItem(`user-${currentUser.id}`, JSON.stringify(updatedCurrentUser));
      localStorage.setItem('PACTCurrentUser', JSON.stringify(updatedCurrentUser));
      return true;
    } catch (error) {
      console.error('Update location error:', error);
      return false;
    }
  };

  const updateUserAvailability = async (status: 'online' | 'offline' | 'busy'): Promise<boolean> => {
    try {
      if (!currentUser) return false;

      const { error } = await supabase
        .from('profiles')
        .update({
          availability: status,
        })
        .eq('id', currentUser.id);

      if (error) {
        console.error('Update availability error:', error);
      }

      const updatedUsers = appUsers.map(u =>
        u.id === currentUser.id
          ? {
              ...u,
              availability: status,
              lastActive:
                status !== 'offline' ? new Date().toISOString() : u.lastActive,
            }
          : u
      );
      setAppUsers(updatedUsers);

      const updatedCurrentUser = {
        ...currentUser,
        availability: status,
        lastActive:
          status !== 'offline' ? new Date().toISOString() : currentUser.lastActive,
      };
      setCurrentUser(updatedCurrentUser);
      localStorage.setItem(`user-${currentUser.id}`, JSON.stringify(updatedCurrentUser));
      localStorage.setItem('PACTCurrentUser', JSON.stringify(updatedCurrentUser));
      return true;
    } catch (error) {
      console.error('Update availability error:', error);
      return false;
    }
  };

  const toggleLocationSharing = async (isSharing: boolean): Promise<boolean> => {
    try {
      if (!currentUser) return false;

      const { error } = await supabase
        .from('profiles')
        .update({
          location_sharing: isSharing,
        })
        .eq('id', currentUser.id);
      
      if (error) {
        console.error("Toggle location sharing error:", error);
      }
      
      const updatedUsers = appUsers.map(u => 
        u.id === currentUser.id ? {
          ...u,
          location: {
            ...u.location,
            isSharing,
          },
        } : u
      );
      
      setAppUsers(updatedUsers);

      const updatedCurrentUser = {
        ...currentUser,
        location: {
          ...currentUser.location,
          isSharing,
        },
      };
      
      setCurrentUser(updatedCurrentUser);
      
      localStorage.setItem(`user-${currentUser.id}`, JSON.stringify(updatedCurrentUser));
      localStorage.setItem('PACTCurrentUser', JSON.stringify(updatedCurrentUser));

      if (isSharing) {
        toast({
          title: "Location sharing enabled",
          description: "Your location will be used for site visit assignments.",
        });
      } else {
        toast({
          title: "Location sharing disabled",
          description: "Your location will not be shared with the system.",
        });
      }

      return true;
    } catch (error) {
      console.error("Toggle location sharing error:", error);
      return false;
    }
  };

  const updateUser = async (user: User): Promise<boolean> => {
    try {
      console.log("Updating user:", user);

      // ── Protected owner guard ────────────────────────────────────────────
      // The owner account role can never be changed by anyone (including other super admins).
      // The DB trigger also enforces this, but we block it early in the UI layer too.
      if (isProtectedOwner(user.id)) {
        const existingUser = appUsers.find(u => u.id === user.id);
        if (existingUser && user.role !== existingUser.role) {
          toast({
            title: 'Protected Account',
            description: 'This account is protected. Its role cannot be changed.',
            variant: 'destructive',
          });
          return false;
        }
      }

      // ── Admin / SuperAdmin role assignment guard ──────────────────────────
      // Only the platform owner can promote users to Admin or SuperAdmin.
      const existingUser = appUsers.find(u => u.id === user.id);
      const isRoleEscalation =
        existingUser &&
        user.role !== existingUser.role &&
        ['Admin', 'SuperAdmin'].includes(user.role || '');
      if (isRoleEscalation && !isProtectedOwner(currentUser?.id)) {
        toast({
          title: 'Not Authorised',
          description: 'Only the platform owner can assign Admin or Super Admin roles.',
          variant: 'destructive',
        });
        return false;
      }
      // ────────────────────────────────────────────────────────────────────
      
      const updatedUser = {
        ...user,
        availability: user.availability || 'offline'
      };
      
      // Build the update payload used for both direct update and as fallback
      const updatePayload: Record<string, any> = {
        full_name: updatedUser.fullName || updatedUser.name,
        username: updatedUser.username,
        email: updatedUser.email,
        role: updatedUser.role,
        avatar_url: updatedUser.avatar,
        hub_id: updatedUser.hubId,
        state_id: updatedUser.stateId,
        locality_id: updatedUser.localityId,
        employee_id: updatedUser.employeeId,
        phone: updatedUser.phone,
        bank_account: (updatedUser as any).bankAccount || null,
        updated_at: new Date().toISOString(),
      };

      // Try direct update first — no row-count check (RLS may block RETURNING without blocking UPDATE)
      const { error: directError } = await supabase
        .from('profiles')
        .update(updatePayload)
        .eq('id', updatedUser.id);

      if (directError) {
        console.warn("Direct update failed, trying RPC:", directError.message);
        // Fallback: RPC bypasses RLS but may have the COALESCE jsonb bug on location column
        try {
          const { data: rpcData, error: rpcError } = await supabase.rpc('admin_update_profile', {
            target_id: updatedUser.id,
            new_full_name: updatedUser.fullName || updatedUser.name || null,
            new_username: updatedUser.username || null,
            new_email: updatedUser.email || null,
            new_role: updatedUser.role || null,
            new_avatar_url: updatedUser.avatar || null,
            new_hub_id: updatedUser.hubId || null,
            new_state_id: updatedUser.stateId || null,
            new_locality_id: updatedUser.localityId || null,
            new_employee_id: updatedUser.employeeId || null,
            new_phone: updatedUser.phone || null,
            new_bank_account: (updatedUser as any).bankAccount || null,
          });
          if (rpcError) {
            console.error("RPC also failed:", rpcError.message);
            toast({
              title: "Update failed",
              description: "Could not save profile changes. Please try again or contact support.",
              variant: "destructive",
            });
            return false;
          }
        } catch (rpcErr) {
          console.error("RPC threw exception:", rpcErr);
          toast({
            title: "Update failed",
            description: "Could not save profile changes. Please try again.",
            variant: "destructive",
          });
          return false;
        }
      }

      // Save secondary_hub_id: try direct column first, fall back to location JSONB
      const secHubValue = updatedUser.secondaryHubId !== undefined ? (updatedUser.secondaryHubId || null) : undefined;
      if (secHubValue !== undefined) {
        try {
          const { error: secErr } = await supabase
            .from('profiles')
            .update({ secondary_hub_id: secHubValue })
            .eq('id', updatedUser.id);
          if (secErr) {
            // Column likely doesn't exist yet — store in location JSONB as fallback
            console.info("secondary_hub_id column not available, storing in location JSONB:", secErr.message);
            const { data: profRow } = await supabase
              .from('profiles')
              .select('location')
              .eq('id', updatedUser.id)
              .single();
            const currentLocation = (profRow as any)?.location || {};
            const newLocation = { ...currentLocation, secondary_hub_id: secHubValue };
            const { error: locErr } = await supabase
              .from('profiles')
              .update({ location: newLocation })
              .eq('id', updatedUser.id);
            if (locErr) {
              console.warn("Location JSONB fallback also failed:", locErr.message);
            } else {
              console.log("Secondary hub stored in location JSONB:", secHubValue);
            }
          } else {
            console.log("Secondary hub updated via column:", secHubValue);
          }
        } catch (secHubErr) {
          console.warn("Secondary hub update error:", secHubErr);
        }
      }

      // Enforce single-role: remove any roles that DIFFER from the new primary role,
      // then ensure exactly one matching entry exists.  We do this in a safe order:
      // 1. Insert/upsert the correct role first (so the user is never left with zero roles)
      // 2. Delete all OTHER roles (conflicting secondary entries)
      if (updatedUser.role) {
        // Step 1 – ensure correct role exists (ignore conflict if already there)
        await supabase
          .from('user_roles')
          .upsert({ user_id: updatedUser.id, role: updatedUser.role }, { onConflict: 'user_id,role', ignoreDuplicates: true });
        // Step 2 – remove any roles that no longer apply
        await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', updatedUser.id)
          .neq('role', updatedUser.role);
      }

      // Update local caches only after confirmed DB success
      setAppUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
      localStorage.setItem(`user-${updatedUser.id}`, JSON.stringify(updatedUser));
      
      if (currentUser && updatedUser.id === currentUser.id) {
        setCurrentUser(updatedUser);
        localStorage.setItem('PACTCurrentUser', JSON.stringify(updatedUser));
      }
      
      toast({
        title: "User updated",
        description: `User ${updatedUser.name} has been updated successfully and will persist between sessions.`,
      });
      
      return true;
    } catch (error: any) {
      console.error("Update user error:", error);
      const detail =
        error?.message ||
        error?.error_description ||
        error?.details ||
        (typeof error === 'string' ? error : JSON.stringify(error));
      toast({
        title: "Update user error",
        description: detail || "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
      return false;
    }
  };

  const sendPasswordRecoveryEmail = async (email: string): Promise<boolean> => {
    try {
      // Use custom OTP flow instead of Supabase's built-in resetPasswordForEmail
      const { data, error } = await supabase.functions.invoke('verify-reset-otp', {
        body: { 
          email: email.toLowerCase(),
          action: 'generate'
        },
      });

      if (error || !data?.success) {
        console.error('Password recovery error:', error || data?.error);
        toast({
          title: 'Failed to send recovery email',
          description: error?.message || data?.error || 'An error occurred while sending the password recovery email.',
          variant: 'destructive',
        });
        return false;
      }

      toast({
        title: 'Recovery code sent',
        description: `A 6-digit verification code has been sent to ${email}. The user should check their inbox.`,
      });
      return true;
    } catch (error: any) {
      console.error('Password recovery error:', error);
      toast({
        title: 'Error',
        description: 'Failed to send password recovery email.',
        variant: 'destructive',
      });
      return false;
    }
  };

  const adminSetUserPassword = async (email: string, newPassword: string): Promise<boolean> => {
    try {
      const { data: userData, error: lookupError } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (lookupError || !userData) {
        toast({
          title: 'User not found',
          description: `No user found with email ${email}.`,
          variant: 'destructive',
        });
        return false;
      }

      toast({
        title: 'Password update requires Supabase Admin',
        description: 'Direct password setting requires Supabase service role. Please use "Send Recovery Email" instead, or update via Supabase Dashboard.',
        variant: 'destructive',
      });
      return false;
    } catch (error: any) {
      console.error('Admin set password error:', error);
      toast({
        title: 'Error',
        description: 'Failed to set user password.',
        variant: 'destructive',
      });
      return false;
    }
  };

  const adminConfirmUserEmail = async (userId: string): Promise<boolean> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({
          title: 'Authentication required',
          description: 'Please log in to perform this action.',
          variant: 'destructive',
        });
        return false;
      }

      const { data, error } = await supabase.functions.invoke('admin-confirm-email', {
        body: { userId },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error || !data?.success) {
        console.error('Email confirmation error:', error || data?.error);
        toast({
          title: 'Email confirmation failed',
          description: error?.message || data?.error || 'An error occurred while confirming the email.',
          variant: 'destructive',
        });
        return false;
      }

      toast({
        title: 'Email confirmed',
        description: 'The user\'s email has been manually confirmed. They can now log in.',
      });
      return true;
    } catch (error: any) {
      console.error('Admin confirm email error:', error);
      toast({
        title: 'Error',
        description: 'Failed to confirm user email.',
        variant: 'destructive',
      });
      return false;
    }
  };

  const adminUpdateUserEmail = async (userId: string, newEmail: string): Promise<boolean> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({
          title: 'Authentication required',
          description: 'Please log in to perform this action.',
          variant: 'destructive',
        });
        return false;
      }

      const { data, error } = await supabase.functions.invoke('admin-update-email', {
        body: { userId, newEmail: newEmail.toLowerCase() },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error || !data?.success) {
        console.error('Email update error:', error || data?.error);
        toast({
          title: 'Email update failed',
          description: error?.message || data?.error || 'An error occurred while updating the email.',
          variant: 'destructive',
        });
        return false;
      }

      toast({
        title: 'Email updated',
        description: 'The user\'s email has been updated successfully. They should use the new email to log in.',
      });

      await refreshUsers();
      return true;
    } catch (error: any) {
      console.error('Admin update email error:', error);
      toast({
        title: 'Error',
        description: 'Failed to update user email.',
        variant: 'destructive',
      });
      return false;
    }
  };

  const contextValue: UserContextType = {
    currentUser,
    authReady,
    users: appUsers,
    login,
    logout,
    registerUser,
    approveUser,
    rejectUser,
    updateUser,
    updateUserLocation,
    updateUserAvailability,
    toggleLocationSharing,
    refreshUsers,
    hydrateCurrentUser,
    roles,
    hasRole,
    addRole,
    removeRole,
    emailVerificationPending: emailVerification.pending,
    verificationEmail: emailVerification.email,
    resendVerificationEmail,
    clearEmailVerificationNotice,
    sendPasswordRecoveryEmail,
    adminSetUserPassword,
    adminConfirmUserEmail,
    adminUpdateUserEmail,
  };

  return (
    <UserContext.Provider
      value={{
        currentUser,
        authReady,
        users: appUsers,
        login,
        logout,
        registerUser,
        approveUser,
        rejectUser,
        updateUser,
        updateUserLocation,
        updateUserAvailability,
        toggleLocationSharing,
        refreshUsers,
        hydrateCurrentUser,
        roles,
        hasRole,
        addRole,
        removeRole,
        emailVerificationPending: emailVerification.pending,
        verificationEmail: emailVerification.email,
        resendVerificationEmail,
        clearEmailVerificationNotice,
        sendPasswordRecoveryEmail,
        adminSetUserPassword,
        adminConfirmUserEmail,
        adminUpdateUserEmail,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = (): UserContextType => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};
