/**
 * Role management — RPCs and roles / permissions / user_roles tables.
 */
import { supabase } from '@/integrations/supabase/client';
import type { AppRole, CreateRoleRequest, ResourceType, ActionType } from '@/types/roles';

export async function rpcGetRolesWithPermissions() {
  return supabase.rpc('get_roles_with_permissions');
}

export async function fetchProfileRoleByUserId(userId: string) {
  return supabase.from('profiles').select('role').eq('id', userId).single();
}

export async function upsertPermissions(
  rows: { role_id: string; resource: ResourceType; action: ActionType; conditions: any }[],
) {
  return supabase.from('permissions').upsert(rows, { onConflict: 'role_id,resource,action' });
}

export async function rpcGetUserPermissions(userId: string) {
  return supabase.rpc('get_user_permissions', { user_uuid: userId });
}

export async function insertRoleRecord(roleData: CreateRoleRequest) {
  return supabase
    .from('roles')
    .insert({
      name: roleData.name,
      display_name: roleData.display_name,
      description: roleData.description,
      is_system_role: false,
      is_active: true,
    })
    .select()
    .single();
}

export async function insertPermissionsRecords(
  rows: { role_id: string; resource: ResourceType; action: ActionType; conditions: any }[],
) {
  return supabase.from('permissions').insert(rows);
}

export async function updateRoleRecord(roleId: string, updates: Record<string, unknown>) {
  return supabase.from('roles').update(updates).eq('id', roleId);
}

export async function fetchPermissionsForRole(roleId: string) {
  return supabase.from('permissions').select('id, resource, action').eq('role_id', roleId);
}

export async function deletePermissionsByIds(ids: string[]) {
  return supabase.from('permissions').delete().in('id', ids);
}

export async function insertPermissionsBatch(
  rows: { role_id: string; resource: ResourceType; action: ActionType; conditions: any }[],
) {
  return supabase.from('permissions').insert(rows);
}

export async function deleteRoleById(roleId: string) {
  return supabase.from('roles').delete().eq('id', roleId);
}

export async function fetchAuthUserId(): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser();
  return auth?.user?.id ?? null;
}

export async function checkUserRoleExists(userId: string, role: AppRole) {
  return supabase.from('user_roles').select('id').eq('user_id', userId).eq('role', role).limit(1);
}

export async function checkUserRoleIdExists(userId: string, roleId: string) {
  return supabase.from('user_roles').select('id').eq('user_id', userId).eq('role_id', roleId).limit(1);
}

export async function insertUserRoleSystem(
  userId: string,
  role: AppRole,
  assignedBy: string | null,
  assignedAt: string,
) {
  return supabase.from('user_roles').insert({
    user_id: userId,
    role,
    assigned_by: assignedBy,
    assigned_at: assignedAt,
  });
}

export async function insertUserRoleCustom(
  userId: string,
  roleId: string,
  assignedBy: string | null,
  assignedAt: string,
) {
  return supabase.from('user_roles').insert({
    user_id: userId,
    role_id: roleId,
    assigned_by: assignedBy,
    assigned_at: assignedAt,
  });
}

export async function deleteUserRoles(userId: string, roleId?: string, role?: AppRole) {
  let q = supabase.from('user_roles').delete().eq('user_id', userId);
  if (roleId) q = q.eq('role_id', roleId);
  if (!roleId && role) q = q.eq('role', role);
  return q;
}

export async function fetchAllUserRoles(userId?: string) {
  let q = supabase
    .from('user_roles')
    .select('id, user_id, role, role_id, assigned_by, assigned_at, created_at');
  if (userId) q = q.eq('user_id', userId);
  return q;
}
