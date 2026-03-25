import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import * as roleRepo from '@/features/roleManagement/repository/roleManagementRepository';
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
  ACTIONS
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
  removeRoleFromUser: (userId: string, roleId?: string, role?: AppRole) => Promise<boolean>;
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

  const fetchRoles = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await roleRepo.rpcGetRolesWithPermissions();
      
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

        // Self-heal: guarantee admin role has all permissions
        const admin = formattedRoles.find(r => r.name === 'admin');
        if (admin) {
          let isPrivileged = false;
          try {
            const { data: authUser } = await supabase.auth.getUser();
            const uid = authUser?.user?.id;
            if (uid) {
              const { data: prof } = await roleRepo.fetchProfileRoleByUserId(uid);
              if (prof?.role === 'admin' || prof?.role === 'ict') {
                isPrivileged = true;
              }
            }
          } catch {}

          if (isPrivileged) {
            const desired = new Set(
              RESOURCES.flatMap(rsrc => ACTIONS.map(act => `${rsrc}:${act}`))
            );
            const existing = new Set(
              (admin.permissions || []).map(p => `${p.resource}:${p.action}`)
            );
            const missing = Array.from(desired)
              .filter(key => !existing.has(key))
              .map(key => {
                const [resource, action] = key.split(':') as [ResourceType, ActionType];
                return { role_id: admin.id, resource, action, conditions: null as any };
              });
            if (missing.length > 0) {
              try {
                const session = await ensureValidSession();
                if (!session.success) return;
                await roleRepo.upsertPermissions(missing);
              } catch {
                // permissions table may not exist in some deployments
                console.debug('[RoleManagement] permissions table not available');
              }
            }
          }
        }
      }
    } catch (error: any) {
      console.error('Error fetching roles:', error);
      toast({
        title: 'Error fetching roles',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const refreshUserPermissions = useCallback(async (userId: string): Promise<Permission[]> => {
    try {
      const { data, error } = await roleRepo.rpcGetUserPermissions(userId);
      if (error) throw error;
      setPermissionsCache(prev => ({ ...prev, [userId]: (data || []) as any }));
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
      const { data: roleResult, error: roleError } = await roleRepo.insertRoleRecord(roleData);

      if (roleError) throw roleError;

      if (roleData.permissions && roleData.permissions.length > 0 && roleResult) {
        const permissionsToInsert = roleData.permissions.map(perm => ({
          role_id: roleResult.id,
          resource: perm.resource,
          action: perm.action,
          conditions: perm.conditions
        }));

        const { error: permissionsError } = await roleRepo.insertPermissionsRecords(permissionsToInsert);

        if (permissionsError) throw permissionsError;
      }

      toast({
        title: 'Role created successfully',
        description: `Role "${roleData.display_name}" has been created.`,
      });

      await fetchRoles();
      return roleResult;
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
      const updates: any = {};
      if (roleData.display_name !== undefined) updates.display_name = roleData.display_name;
      if (roleData.description !== undefined) updates.description = roleData.description;
      if (roleData.is_active !== undefined) updates.is_active = roleData.is_active;

      if (Object.keys(updates).length > 0) {
        const { error: roleError } = await roleRepo.updateRoleRecord(roleId, updates);
        if (roleError) {
          throw roleError;
        }
      }

      const isAdminRole = roles.find(r => r.id === roleId)?.name === 'admin';
      // Ensure desiredPermissions always includes a `conditions` property
      const desiredPermissions = isAdminRole
        ? RESOURCES.flatMap(rsrc => ACTIONS.map(act => ({ resource: rsrc, action: act, conditions: null } as any)))
        : roleData.permissions?.map(p => ({ ...p, conditions: (p as any).conditions ?? null }));

      if (desiredPermissions) {
        const { data: existing, error: existingErr } = await roleRepo.fetchPermissionsForRole(roleId);
        if (existingErr) {
          throw existingErr;
        }

        const existingArr = (existing || []) as { id: string; resource: string; action: string }[];
        
        const desiredSet = new Set(desiredPermissions.map(p => `${p.resource}:${p.action}`));
        const existingSet = new Set(existingArr.map(p => `${p.resource}:${p.action}`));

        // Delete permissions that are no longer desired
        const toDeleteIds = existingArr
          .filter((p) => !desiredSet.has(`${p.resource}:${p.action}`))
          .map((p) => p.id);
        
        if (toDeleteIds.length > 0) {
          const { error: delErr } = await roleRepo.deletePermissionsByIds(toDeleteIds);
          if (delErr) {
            throw delErr;
          }
        }

        // Insert only missing desired permissions to avoid requiring ON CONFLICT
        const toInsert = desiredPermissions
          .filter(p => !existingSet.has(`${p.resource}:${p.action}`))
          .map(p => ({
            role_id: roleId,
            resource: p.resource,
            action: p.action,
            conditions: p.conditions ?? null,
          }));
        
        if (toInsert.length > 0) {
          const { error: insErr } = await roleRepo.insertPermissionsBatch(toInsert);
          if (insErr) {
            throw insErr;
          }
        }
      }

      toast({ title: 'Role updated', description: 'Role was updated successfully.' });
      // Refresh roles in background to avoid blocking the dialog close
      fetchRoles().catch(() => {});
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
      const { error } = await roleRepo.deleteRoleById(roleId);
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
      const assignedBy = await roleRepo.fetchAuthUserId();
      const now = new Date().toISOString();

      if (assignData.role) {
        const { data: exists, error: checkErr } = await roleRepo.checkUserRoleExists(
          assignData.user_id,
          assignData.role,
        );
        if (checkErr) throw checkErr;

        if (!exists || exists.length === 0) {
          const { error: insErr } = await roleRepo.insertUserRoleSystem(
            assignData.user_id,
            assignData.role,
            assignedBy,
            now,
          );
          if (insErr) throw insErr;
        }
      } else if (assignData.role_id) {
        const { data: exists, error: checkErr } = await roleRepo.checkUserRoleIdExists(
          assignData.user_id,
          assignData.role_id,
        );
        if (checkErr) throw checkErr;

        if (!exists || exists.length === 0) {
          const { error: insErr } = await roleRepo.insertUserRoleCustom(
            assignData.user_id,
            assignData.role_id,
            assignedBy,
            now,
          );
          if (insErr) throw insErr;
        }
      } else {
        throw new Error('Either role or role_id must be provided');
      }

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

  const removeRoleFromUser = async (userId: string, roleId?: string, role?: AppRole): Promise<boolean> => {
    const session = await ensureValidSession();
    if (!session.success) return false;
    setIsLoading(true);
    try {
      if (!roleId && !role) throw new Error('Specify roleId or role to remove');
      const { error } = await roleRepo.deleteUserRoles(userId, roleId, role);
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
      const { data, error } = await roleRepo.fetchAllUserRoles(userId);
      if (error) throw error;

      if (data) {
        const mapped: UserRole[] = data.map((r: any) => ({
          id: r.id,
          user_id: r.user_id,
          role: r.role as AppRole,
          role_id: r.role_id || undefined,
          assigned_by: r.assigned_by || undefined,
          assigned_at: r.assigned_at || undefined,
          created_at: r.created_at,
        }));

        if (!userId) {
          setUserRoles(mapped);
          console.log(`RoleManagement: fetched ${mapped.length} user_roles`);
        } else {
          setUserRoles(prev => {
            const others = prev.filter(ur => ur.user_id !== userId);
            const combined = [...others, ...mapped];
            console.log(`RoleManagement: fetched ${mapped.length} user_roles for ${userId}`);
            return combined;
          });
        }
      }
    } catch (error: any) {
      console.error('Error fetching user roles:', error);
    }
  };

  const hasPermission = (userId: string, resource: ResourceType, action: ActionType): boolean => {
    const perms = permissionsCache[userId];
    if (!perms) return false;
    
    const hasSuperAdminPerm = perms.some(p => p.resource === 'system' && p.action === 'override');
    if (hasSuperAdminPerm) return true;
    
    return perms.some(p => p.resource === resource && p.action === action);
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
      .channel('rm_user_roles_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_roles',
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