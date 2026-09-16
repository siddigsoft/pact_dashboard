import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { ensureValidSession } from '@/lib/session-health';
import { 
  Role, 
  Permission, 
  RoleWithPermissions, 
  CreateRoleRequest, 
  UpdateRoleRequest,
  AssignRoleRequest,
  AppRole,
  UserRole,
  ResourceType,
  ActionType,
  RESOURCES,
  ACTIONS,
  DEFAULT_ROLE_PERMISSIONS
} from '@/types/roles';

interface RoleManagementContextType {
  // State
  roles: RoleWithPermissions[];
  userRoles: UserRole[];
  isLoading: boolean;
  
  // Role management
  fetchRoles: () => Promise<void>;
  createRole: (roleData: CreateRoleRequest) => Promise<Role | null>;
  updateRole: (roleId: string, roleData: UpdateRoleRequest) => Promise<boolean>;
  deleteRole: (roleId: string) => Promise<boolean>;
  
  // User role assignment
  assignRoleToUser: (assignData: AssignRoleRequest) => Promise<boolean>;
  removeRoleFromUser: (userId: string, roleId: string) => Promise<boolean>;
  fetchUserRoles: (userId?: string) => Promise<void>;
  
  // Permission checking
  hasPermission: (userId: string, resource: ResourceType, action: ActionType) => boolean;
  getUserPermissions: (userId: string) => Permission[];
  refreshUserPermissions: (userId: string) => Promise<Permission[]>;
  
  // Utility functions
  getRoleById: (roleId: string) => RoleWithPermissions | undefined;
  getRoleByName: (roleName: string) => RoleWithPermissions | undefined;
  getUserRolesByUserId: (userId: string) => UserRole[];
}

const RoleManagementContext = createContext<RoleManagementContextType | undefined>(undefined);

export const RoleManagementProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [roles, setRoles] = useState<RoleWithPermissions[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const [permissionsCache, setPermissionsCache] = useState<Record<string, Pick<Permission, 'resource' | 'action' | 'conditions'>[]>>({});
  const [overridesCache, setOverridesCache] = useState<Record<string, { resource: string; action: string; is_granted: boolean; expires_at: string | null }[]>>({});

  const fetchRoles = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_roles_with_permissions');
      
      if (error) throw error;
      
      if (data) {
        const formattedRoles: RoleWithPermissions[] = data.map((role: any) => ({
          id: role.role_id,
          name: role.role_name,
          display_name: role.display_name,
          description: role.description,
          is_system_role: role.is_system_role,
          is_active: role.is_active,
          created_at: '',
          updated_at: '',
          permissions: role.permissions || []
        }));
        setRoles(formattedRoles);

        // Note: Admin permissions are fully managed by Super Admin — no self-heal override
      }
    } catch (error: any) {
      // Log the full error for debugging but never expose raw network/DB error
      // messages to users — they're not actionable and cause unnecessary alarm.
      console.error('Error fetching roles:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshUserPermissions = useCallback(async (userId: string): Promise<Permission[]> => {
    try {
      const { data, error } = await supabase.rpc('get_user_permissions', { user_uuid: userId });
      if (error) throw error;

      setPermissionsCache(prev => ({ ...prev, [userId]: (data || []) as any }));

      // Also fetch per-user overrides so hasPermission can apply them
      try {
        const now = new Date().toISOString();
        const { data: ovData } = await supabase
          .from('user_permission_overrides')
          .select('resource, action, is_granted, expires_at')
          .eq('user_id', userId)
          .or(`expires_at.is.null,expires_at.gt.${now}`);
        setOverridesCache(prev => ({ ...prev, [userId]: (ovData || []) as any }));
      } catch {
        // table may not exist yet — fail silently
      }

      return ((data || []) as any);
    } catch (error) {
      console.error('Error fetching user permissions:', error);
      return [] as any;
    }
  }, []);

  const createRole = async (roleData: CreateRoleRequest): Promise<Role | null> => {
    const session = await ensureValidSession();
    if (!session.success) return null;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('upsert_role_access', {
        payload: {
          role_id: roleData.role_id ?? null,
          name: roleData.name,
          display_name: roleData.display_name,
          description: roleData.description ?? '',
          is_active: true,
          permissions: (roleData.permissions ?? []).map((p) => ({
            resource: p.resource,
            action: p.action,
            conditions: (p as { conditions?: unknown }).conditions ?? null,
          })),
          page_slugs: roleData.page_slugs ?? [],
          tab_rules: roleData.tab_rules ?? [],
          column_rules: roleData.column_rules ?? [],
          ...(roleData.cost_scope ? { cost_scope: roleData.cost_scope } : {}),
          assign_user_ids: roleData.assign_user_ids ?? [],
          set_as_primary: roleData.set_as_primary ?? true,
          reason: roleData.reason ?? 'Role saved via Role Management wizard',
        },
      });

      if (error) throw error;

      const role = (data as { role?: Role } | null)?.role ?? null;
      if (!role?.id) throw new Error('upsert_role_access returned no role');

      toast({
        title: 'Role saved',
        description: `Role "${roleData.display_name}" was saved transactionally.`,
      });

      await fetchRoles();
      await fetchUserRoles();
      return role;
    } catch (error: any) {
      console.error('Error creating role:', error);
      toast({
        title: 'Error creating role',
        description: error.message,
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const updateRole = async (roleId: string, roleData: UpdateRoleRequest): Promise<boolean> => {
    const session = await ensureValidSession();
    if (!session.success) return false;
    setIsLoading(true);
    try {
      const existingRole = roles.find((role) => role.id === roleId);
      if (!existingRole) {
        throw new Error('Role is not loaded. Refresh roles and try again.');
      }

      // The server replaces the role and its permission set in one transaction.
      // This avoids the previous partial-save window between separate role,
      // permission-delete, and permission-insert browser requests.
      const { error } = await supabase.rpc('upsert_role_access', {
        payload: {
          role_id: roleId,
          name: existingRole.name,
          display_name: roleData.display_name ?? existingRole.display_name,
          description: roleData.description ?? existingRole.description ?? '',
          is_active: roleData.is_active ?? existingRole.is_active,
          permissions: (roleData.permissions ?? existingRole.permissions ?? []).map((permission) => ({
            resource: permission.resource,
            action: permission.action,
            conditions: (permission as { conditions?: unknown }).conditions ?? null,
          })),
          ...(roleData.page_slugs ? { page_slugs: roleData.page_slugs } : {}),
          ...(roleData.tab_rules ? { tab_rules: roleData.tab_rules } : {}),
          ...(roleData.column_rules ? { column_rules: roleData.column_rules } : {}),
          ...(roleData.cost_scope ? { cost_scope: roleData.cost_scope } : {}),
          reason: 'Role updated from Role Management',
        },
      });
      if (error) throw error;

      toast({ title: 'Role updated', description: 'Role was updated successfully.' });
      await fetchRoles();
      return true;
    } catch (error: any) {
      console.error('Error updating role:', error);
      toast({
        title: 'Error updating role',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const deleteRole = async (roleId: string): Promise<boolean> => {
    const session = await ensureValidSession();
    if (!session.success) return false;
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('roles')
        .delete()
        .eq('id', roleId);
      if (error) throw error;

      toast({ title: 'Role deleted', description: 'Role removed successfully.' });
      await fetchRoles();
      return true;
    } catch (error: any) {
      console.error('Error deleting role:', error);
      toast({
        title: 'Error deleting role',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const assignRoleToUser = async (assignData: AssignRoleRequest): Promise<boolean> => {
    const session = await ensureValidSession();
    if (!session.success) return false;
    setIsLoading(true);
    try {
      const { error } = await supabase.rpc('assign_role_to_user', {
        p_target_user_id: assignData.user_id,
        p_target_role_id: assignData.role_id,
        p_reason: 'Assigned from Role Management',
      });
      if (error) throw error;

      toast({ title: 'Role assigned', description: 'User role assignment saved.' });
      await fetchUserRoles();
      await refreshUserPermissions(assignData.user_id);
      return true;
    } catch (error: any) {
      console.error('Error assigning role:', error);
      toast({
        title: 'Error assigning role',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const removeRoleFromUser = async (userId: string, roleId: string): Promise<boolean> => {
    const session = await ensureValidSession();
    if (!session.success) return false;
    setIsLoading(true);
    try {
      const { error } = await supabase.rpc('remove_role_from_user', {
        p_target_user_id: userId,
        p_target_role_id: roleId,
        p_reason: 'Removed from Role Management',
      });
      if (error) throw error;

      toast({ title: 'Role removed', description: 'User role removed.' });
      await fetchUserRoles();
      await refreshUserPermissions(userId);
      return true;
    } catch (error: any) {
      console.error('Error removing role:', error);
      toast({
        title: 'Error removing role',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUserRoles = async (userId?: string): Promise<void> => {
    try {
      let query = (supabase as any)
        .from('canonical_user_role_assignments')
        .select('id, user_id, role_id, assigned_by, assigned_at, created_at, roles(name)');
      if (userId) query = query.eq('user_id', userId);

      const { data, error } = await query;
      if (error) throw error;

      if (data) {
        const mapped: UserRole[] = data.map((r: any) => ({
          id: r.id,
          user_id: r.user_id,
          role: (r.roles?.name || 'unknown') as AppRole,
          role_id: r.role_id,
          assigned_by: r.assigned_by || undefined,
          assigned_at: r.assigned_at || undefined,
          created_at: r.created_at,
        }));

        if (!userId) {
          setUserRoles(mapped);
          console.log(`RoleManagement: fetched ${mapped.length} canonical role assignments`);
        } else {
          setUserRoles(prev => {
            const others = prev.filter(ur => ur.user_id !== userId);
            const combined = [...others, ...mapped];
            console.log(`RoleManagement: fetched ${mapped.length} canonical role assignments for ${userId}`);
            return combined;
          });
        }
      }
    } catch (error: any) {
      console.error('Error fetching user roles:', error);
    }
  };

  const hasPermission = (userId: string, resource: ResourceType, action: ActionType): boolean => {
    // ── 1. Super Admin bypass ────────────────────────────────────────────────
    // Check both DB-cached perms and the userRoles cache for super-admin strings
    const perms = permissionsCache[userId];
    const hasSuperAdminPerm = perms?.some(p => p.resource === 'system' && p.action === 'override');
    if (hasSuperAdminPerm) return true;

    // ── 2. Per-user overrides win over role defaults ──────────────────────────
    const overrides = overridesCache[userId];
    if (overrides && overrides.length > 0) {
      const override = overrides.find(o => o.resource === resource && o.action === action);
      if (override) return override.is_granted;
    }

    // ── 3. DB-cached role permissions ────────────────────────────────────────
    if (perms && perms.length > 0) {
      return perms.some(p => p.resource === resource && p.action === action);
    }

    // An empty server permission set is authoritative; never restore revoked
    // permissions from static presets or a free-text profile role.
    return false;
  };

  const getUserPermissions = (userId: string): Permission[] => {
    return ((permissionsCache[userId] as unknown as Permission[]) || []);
  };

  const getRoleById = (roleId: string): RoleWithPermissions | undefined => {
    return roles.find(role => role.id === roleId);
  };

  const getRoleByName = (roleName: string): RoleWithPermissions | undefined => {
    return roles.find(role => role.name === roleName);
  };

  const getUserRolesByUserId = (userId: string): UserRole[] => {
    return userRoles.filter(userRole => userRole.user_id === userId);
  };

  useEffect(() => {
    fetchRoles();
    fetchUserRoles().catch(() => {});
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) {
          await refreshUserPermissions(user.id);
        }
      } catch {}
    })();
  }, [fetchRoles, refreshUserPermissions]);

  // Keep in sync with changes coming from other parts of the app (e.g., Users page)
  useEffect(() => {
    const channel = supabase
        .channel('rm_canonical_role_assignments_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
          table: 'canonical_user_role_assignments',
      }, (payload: any) => {
        fetchUserRoles().catch(() => {});
        const uid = payload?.new?.user_id || payload?.old?.user_id;
        if (uid) {
          refreshUserPermissions(uid).catch(() => {});
        }
      })
      .subscribe();

    return () => {
      try { supabase.removeChannel(channel); } catch {}
    };
  }, [refreshUserPermissions]);

  // When any role's permissions change (via SecurityPanel Grant/Revoke), refresh the
  // current user's permission cache so their action buttons update immediately without
  // requiring a page reload. All connected clients receive this event independently,
  // so every online user in the affected role gets the update in real-time.
  useEffect(() => {
    const permChannel = supabase
      .channel('rm_permissions_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'permissions',
      }, async () => {
        // Refresh roles so SecurityPanel UI is consistent
        fetchRoles().catch(() => {});
        // Refresh the current user's permission cache so checkPermission() sees the change
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user?.id) {
            refreshUserPermissions(user.id).catch(() => {});
          }
        } catch { /* best-effort */ }
      })
      .subscribe();

    return () => {
      try { supabase.removeChannel(permChannel); } catch {}
    };
  }, [fetchRoles, refreshUserPermissions]);

  const contextValue: RoleManagementContextType = {
    roles,
    userRoles,
    isLoading,
    fetchRoles,
    createRole,
    updateRole,
    deleteRole,
    assignRoleToUser,
    removeRoleFromUser,
    fetchUserRoles,
    hasPermission,
    getUserPermissions,
    refreshUserPermissions,
    getRoleById,
    getRoleByName,
    getUserRolesByUserId
  };

  return (
    <RoleManagementContext.Provider value={contextValue}>
      {children}
    </RoleManagementContext.Provider>
  );
};

export const useRoleManagement = () => {
  const context = useContext(RoleManagementContext);
  if (context === undefined) {
    throw new Error('useRoleManagement must be used within a RoleManagementProvider');
  }
  return context;
};
