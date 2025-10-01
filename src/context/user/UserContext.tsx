
import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { useRoles } from '@/hooks/use-roles';
import { AppRole } from '@/types';
import { supabase } from '@/integrations/supabase/client';

interface UserContextType {
  currentUser: User | null;
  users: User[];
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  registerUser: (user: Partial<User>) => Promise<boolean>;
  approveUser: (userId: string) => Promise<boolean>;
  rejectUser: (userId: string) => Promise<boolean>;
  updateUser: (user: User) => Promise<boolean>;
  updateUserLocation: (latitude: number, longitude: number) => Promise<boolean>;
  updateUserAvailability: (status: 'online' | 'offline' | 'busy') => Promise<boolean>;
  toggleLocationSharing: (isSharing: boolean) => Promise<boolean>;
  refreshUsers: () => Promise<void>;
  roles: AppRole[];
  hasRole: (role: AppRole) => boolean;
  addRole: (userId: string, role: AppRole) => Promise<boolean>;
  removeRole: (userId: string, role: AppRole) => Promise<boolean>;
  emailVerificationPending: boolean;
  verificationEmail?: string;
  resendVerificationEmail: (email?: string) => Promise<boolean>;
  clearEmailVerificationNotice: () => void;
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
          wallet: parsedUser.wallet || {
            balance: 0,
            currency: 'USD'
          },
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

  const loadUsersFromStorage = () => {
    const storedUsersMap: Record<string, Partial<User>> = {};
    
    const initialUsers: User[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('user-')) {
        try {
          const userId = key.split('user-')[1];
          const userData = JSON.parse(localStorage.getItem(key) || '');
          if (!userData.availability) {
            userData.availability = 'offline';
          }
          storedUsersMap[userId] = userData;
        } catch (err) {
          console.error("Error parsing stored user:", err);
        }
      }
    }
    
    const mergedUsers = initialUsers.map(user => {
      if (storedUsersMap[user.id]) {
        return { ...user, ...storedUsersMap[user.id] };
      }
      return user;
    });
    
    Object.values(storedUsersMap).forEach(storedUser => {
      if (storedUser.id && !mergedUsers.some(u => u.id === storedUser.id)) {
        // Ensure required fields are present before adding to mergedUsers
        const completeUser: User = {
          id: storedUser.id,
          name: storedUser.name || 'Unknown',
          email: storedUser.email || '',
          role: storedUser.role || 'dataCollector',
          lastActive: storedUser.lastActive || new Date().toISOString(),
          availability: storedUser.availability || 'offline',
          wallet: storedUser.wallet || {
            balance: 0,
            currency: 'USD'
          },
          ...storedUser,
        };
        mergedUsers.push(completeUser);
      }
    });
    
    return mergedUsers;
  };

  const [appUsers, setAppUsers] = useState<User[]>(loadUsersFromStorage);
  
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
      console.log("Refreshing users from Supabase...");
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*');
      
      if (profilesError) {
        console.error("Error fetching profiles:", profilesError);
        return;
      }

      console.log("Profiles fetched:", profilesData?.length || 0);
      
      const allUserRoles: Record<string, AppRole[]> = {};
      
      if (profilesData && profilesData.length > 0) {
        const { data: userRoles, error: rolesError } = await supabase
          .from('user_roles')
          .select('*');
          
        if (rolesError) {
          console.error("Error fetching user roles:", rolesError);
        } else if (userRoles) {
          userRoles.forEach((role) => {
            if (!allUserRoles[role.user_id]) {
              allUserRoles[role.user_id] = [];
            }
            allUserRoles[role.user_id].push(role.role as AppRole);
          });
          console.log("User roles fetched:", Object.keys(allUserRoles).length);
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
            localityId: profile.locality_id || existingUser.localityId,
            avatar: profile.avatar_url || existingUser.avatar,
            username: profile.username || existingUser.username,
            fullName: profile.full_name || existingUser.fullName,
            phone: profile.phone || existingUser.phone,
            employeeId: profile.employee_id || existingUser.employeeId,
            lastActive: existingUser.lastActive || new Date().toISOString(),
            isApproved: profile.status === 'approved' || false,
            availability: profile.availability || existingUser.availability || 'offline',
            createdAt: profile.created_at || existingUser.createdAt || new Date().toISOString(),
            location: locationData,
            wallet: existingUser.wallet || {
              balance: 0,
              currency: 'USD'
            },
            performance: existingUser.performance || {
              rating: 0,
              totalCompletedTasks: 0,
              onTimeCompletion: 0,
            },
          } as User;
        });
        
        const mergedUsers = [
          ...supabaseUsers
        ];
        
        mergedUsers.forEach(user => {
          const storageKey = `user-${user.id}`;
          localStorage.setItem(storageKey, JSON.stringify(user));
        });
        
        console.log("Total merged users:", mergedUsers.length);
        setAppUsers(mergedUsers);
      }
    } catch (error) {
      console.error("Error in fetchUsers:", error);
    }
  };

  useEffect(() => {
    refreshUsers();
    
    const pollingInterval = setInterval(refreshUsers, 30000);
    
    return () => clearInterval(pollingInterval);
  }, []);

  useEffect(() => {
    const activityInterval = setInterval(() => {
      if (currentUser) {
        setCurrentUser(prev => {
          if (!prev) return prev;
          const updated = {
            ...prev,
            lastActive: new Date().toISOString()
          };
          
          localStorage.setItem('PACTCurrentUser', JSON.stringify(updated));
          
          return updated;
        });

        setAppUsers(prev => 
          prev.map(user => 
            user.id === currentUser.id 
              ? { ...user, lastActive: new Date().toISOString() }
              : user
          )
        );
      }
      
      setAppUsers(prev => 
        prev.map(user => {
          if (user.id === currentUser?.id) return user;
          
          if (Math.random() > 0.95) {
            const newAvailability = user.availability === 'online' ? 'offline' : 'online';
            return {
              ...user,
              availability: newAvailability,
              lastActive: newAvailability === 'online' ? new Date().toISOString() : user.lastActive
            };
          }
          return user;
        })
      );
    }, 60000);
    
    return () => clearInterval(activityInterval);
  }, [currentUser]);

  // Hydrate current user from existing Supabase session (OAuth/email) and listen for auth state changes
  const setUserFromAuthUser = async (authUser: any): Promise<boolean> => {
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();

      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', authUser.id);

      const userRolesList = userRoles ? userRoles.map(r => r.role as AppRole) : [];

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

      const isApproved = (profileData?.status === 'approved');
      if (!isApproved) {
        toast({
          title: 'Pending approval',
          description: 'Your account is pending approval by an administrator.',
        });
        await supabase.auth.signOut();
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
        wallet: {
          balance: 0,
          currency: 'USD',
        },
        performance: {
          rating: 0,
          totalCompletedTasks: 0,
          onTimeCompletion: 0,
        }
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

  useEffect(() => {
    let unsub: { unsubscribe: () => void } | undefined;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) await setUserFromAuthUser(user);
        } else {
          setCurrentUser(null);
          localStorage.removeItem('PACTCurrentUser');
        }
      } catch {}

      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
        try {
          if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) await setUserFromAuthUser(user);
          } else if (event === 'SIGNED_OUT') {
            setCurrentUser(null);
            localStorage.removeItem('PACTCurrentUser');
          }
        } catch (err) {
          console.error('Auth state handler error:', err);
        }
      });
      unsub = subscription;
    })();

    return () => {
      try { unsub?.unsubscribe(); } catch {}
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
          
        const userRolesList = userRoles ? userRoles.map(r => r.role as AppRole) : [];
        
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

        const isApproved = (profileData?.status === 'approved');
        if (!isApproved) {
          toast({
            title: 'Pending approval',
            description: 'Your account is pending approval by an administrator.',
          });
          await supabase.auth.signOut();
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
          wallet: {
            balance: 0,
            currency: 'USD',
          },
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
      await supabase.auth.signOut();
      
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
      const { error: signUpError } = await supabase.auth.signUp({
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
          }
        }
      });
      
      if (signUpError) {
        console.error("Supabase signup error:", signUpError);
        toast({
          title: "Registration failed",
          description: "There was a problem creating your account. Please try again.",
          variant: "destructive",
        });
        return false;
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
          title: "Rejection blocked",
          description: "No user was deleted. Check Row Level Security policies for profiles.",
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

  const updateUserLocation = async (latitude: number, longitude: number): Promise<boolean> => {
    try {
      if (!currentUser) return false;

      const now = new Date().toISOString();
      
      const { error } = await supabase
        .from('profiles')
        .update({
          location: {
            latitude,
            longitude,
            lastUpdated: now
          }
        })
        .eq('id', currentUser.id);
      
      if (error) {
        console.error("Update location error:", error);
      }
      
      const updatedUsers = appUsers.map(u => 
        u.id === currentUser.id ? {
          ...u,
          location: {
            ...u.location,
            latitude,
            longitude,
            lastUpdated: now,
          },
        } : u
      );
      
      setAppUsers(updatedUsers);

      const updatedCurrentUser = {
        ...currentUser,
        location: {
          ...currentUser.location,
          latitude,
          longitude,
          lastUpdated: now,
        },
      };
      
      setCurrentUser(updatedCurrentUser);
      
      localStorage.setItem(`user-${currentUser.id}`, JSON.stringify(updatedCurrentUser));
      localStorage.setItem('PACTCurrentUser', JSON.stringify(updatedCurrentUser));

      return true;
    } catch (error) {
      console.error("Update location error:", error);
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
        console.error("Update availability error:", error);
      }
      
      const updatedUsers = appUsers.map(u => 
        u.id === currentUser.id ? {
          ...u,
          availability: status,
          lastActive: status !== 'offline' ? new Date().toISOString() : u.lastActive,
        } : u
      );
      
      setAppUsers(updatedUsers);

      const updatedCurrentUser = {
        ...currentUser,
        availability: status,
        lastActive: status !== 'offline' ? new Date().toISOString() : currentUser.lastActive,
      };
      
      setCurrentUser(updatedCurrentUser);
      
      localStorage.setItem(`user-${currentUser.id}`, JSON.stringify(updatedCurrentUser));
      localStorage.setItem('PACTCurrentUser', JSON.stringify(updatedCurrentUser));

      return true;
    } catch (error) {
      console.error("Update availability error:", error);
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
      
      const updatedUser = {
        ...user,
        availability: user.availability || 'offline'
      };
      
      try {
        const { error } = await supabase
          .from('profiles')
          .update({
            full_name: updatedUser.fullName || updatedUser.name,
            username: updatedUser.username,
            role: updatedUser.role,
            avatar_url: updatedUser.avatar,
            hub_id: updatedUser.hubId,
            state_id: updatedUser.stateId,
            locality_id: updatedUser.localityId,
            employee_id: updatedUser.employeeId,
            phone: updatedUser.phone,
          })
          .eq('id', updatedUser.id);
        
        if (error) {
          console.error("Supabase update error:", error);
        }
      } catch (supabaseError) {
        console.error("Supabase operation failed:", supabaseError);
      }
      
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
    } catch (error) {
      console.error("Update user error:", error);
      toast({
        title: "Update user error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
      return false;
    }
  };

  const contextValue: UserContextType = {
    currentUser,
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
    roles,
    hasRole,
    addRole,
    removeRole,
    emailVerificationPending: emailVerification.pending,
    verificationEmail: emailVerification.email,
    resendVerificationEmail,
    clearEmailVerificationNotice,
  };

  return (
    <UserContext.Provider
      value={{
        currentUser,
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
        roles,
        hasRole,
        addRole,
        removeRole,
        emailVerificationPending: emailVerification.pending,
        verificationEmail: emailVerification.email,
        resendVerificationEmail,
        clearEmailVerificationNotice,
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
