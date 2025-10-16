import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, Users, Shield, Settings } from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import { useRoleManagement } from '@/context/role-management/RoleManagementContext';
import { RoleCard } from '@/components/role-management/RoleCard';
import { CreateRoleDialog } from '@/components/role-management/CreateRoleDialog';
import { EditRoleDialog } from '@/components/role-management/EditRoleDialog';
import { UserRoleAssignment } from '@/components/role-management/UserRoleAssignment';
import { PermissionTester } from '@/components/role-management/PermissionTester';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { RoleWithPermissions, CreateRoleRequest, UpdateRoleRequest, AssignRoleRequest, AppRole } from '@/types/roles';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';

const RoleManagement = () => {
  const { currentUser, users, refreshUsers } = useAppContext();
  const { canManageRoles: canManageRolesAuth } = useAuthorization();
  const {
    roles,
    isLoading,
    createRole,
    updateRole,
    deleteRole,
    assignRoleToUser,
    removeRoleFromUser,
    getUserRolesByUserId,
    fetchUserRoles
  } = useRoleManagement();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showUserAssignment, setShowUserAssignment] = useState(false);
  const [showPermissionTester, setShowPermissionTester] = useState(false);
  const [selectedRole, setSelectedRole] = useState<RoleWithPermissions | null>(null);

  // Gate by granular permissions (fallback to legacy for backward compatibility)
  const canManageRoles = canManageRolesAuth();

  if (!canManageRoles) {
    return (
      <div className="container mx-auto py-6">
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertDescription>
            You don't have permission to access role management.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const handleCreateRole = async (roleData: CreateRoleRequest): Promise<boolean> => {
    const result = await createRole(roleData);
    return !!result;
  };

  const handleEditRole = (role: RoleWithPermissions) => {
    setSelectedRole(role);
    setShowEditDialog(true);
  };

  const handleUpdateRole = async (roleId: string, roleData: UpdateRoleRequest): Promise<boolean> => {
    const ok = await updateRole(roleId, roleData);
    if (ok) {
      setShowEditDialog(false);
      setSelectedRole(null);
    }
    return ok;
  };

  const handleDeleteRole = async (roleId: string) => {
    if (confirm('Are you sure you want to delete this role? This action cannot be undone.')) {
      await deleteRole(roleId);
    }
  };

  const handleViewUsers = (role: RoleWithPermissions) => {
    setSelectedRole(role);
    setShowUserAssignment(true);
  };

  const getAssignedUsers = (role: RoleWithPermissions) => {
    // Filter users who have this specific role
    return users.filter(user => {
      const userRoles = getUserRolesByUserId(user.id);
      return userRoles.some(userRole => 
        (role.is_system_role && userRole.role === role.name) ||
        (!role.is_system_role && userRole.role_id === role.id)
      );
    });
  };

  const getUnassignedUsers = (role: RoleWithPermissions) => {
    const assignedUsers = getAssignedUsers(role);
    return users.filter(user => !assignedUsers.some(assigned => assigned.id === user.id));
  };

  // Keep Users page in sync when assignments change
  const handleAssignRoleToUser = async (data: AssignRoleRequest): Promise<void> => {
    if (!selectedRole) return;

    // Enforce exclusivity: clear existing roles for the target user first
    const { error: clearErr } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', data.user_id);
    if (clearErr) {
      console.error('Clear user roles failed:', clearErr);
      return;
    }

    // Assign only the selected role (system or custom)
    const ok = await assignRoleToUser(data);
    if (!ok) {
      return;
    }

    // Update profiles.role for system roles to reflect primary; set neutral for custom
    if (selectedRole.is_system_role) {
      const { error: profErr } = await supabase
        .from('profiles')
        .update({ role: selectedRole.name })
        .eq('id', data.user_id);
      if (profErr) console.warn('profiles.role update failed (RLS?):', profErr);
    } else {
      const { error: profErr } = await supabase
        .from('profiles')
        .update({ role: 'custom' })
        .eq('id', data.user_id);
      if (profErr) console.warn('profiles.role neutral update failed (RLS?):', profErr);
    }

    // Refresh lists so Assigned Users updates immediately
    await fetchUserRoles();
    await refreshUsers();
  };

  const handleRemoveRoleFromUser = async (userId: string, roleId?: string, role?: AppRole): Promise<void> => {
    await removeRoleFromUser(userId, roleId, role);
    await refreshUsers();
  };
  const systemRoles = roles.filter(role => role.is_system_role);
  const customRoles = roles.filter(role => !role.is_system_role);

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Role Management</h1>
          <p className="text-gray-500 mt-2">
            Manage roles and permissions for your organization
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowPermissionTester(true)} variant="outline">
            <Shield className="h-4 w-4 mr-2" />
            Test Permissions
          </Button>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Role
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Roles</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{roles.length}</div>
            <p className="text-xs text-muted-foreground">
              {systemRoles.length} system + {customRoles.length} custom
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.length}</div>
            <p className="text-xs text-muted-foreground">
              Across all roles
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Roles</CardTitle>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {roles.filter(role => role.is_active).length}
            </div>
            <p className="text-xs text-muted-foreground">
              Currently active
            </p>
          </CardContent>
        </Card>
      </div>

      {/* System Roles */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">System Roles</h2>
          <p className="text-gray-500">Built-in roles with predefined permissions</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {systemRoles.map(role => (
            <RoleCard
              key={role.id}
              role={role}
              onEdit={handleEditRole}
              onDelete={handleDeleteRole}
              onViewUsers={handleViewUsers}
              userCount={getAssignedUsers(role).length}
            />
          ))}
        </div>
      </div>

      {/* Custom Roles */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Custom Roles</h2>
          <p className="text-gray-500">Organization-specific roles with custom permissions</p>
        </div>
        
        {customRoles.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Shield className="h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Custom Roles</h3>
              <p className="text-gray-500 text-center mb-4">
                Create custom roles to define specific permissions for your organization.
              </p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Custom Role
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {customRoles.map(role => (
              <RoleCard
                key={role.id}
                role={role}
                onEdit={handleEditRole}
                onDelete={handleDeleteRole}
                onViewUsers={handleViewUsers}
                userCount={getAssignedUsers(role).length}
              />
            ))}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <CreateRoleDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreateRole={handleCreateRole}
        isLoading={isLoading}
      />

      <EditRoleDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        role={selectedRole}
        onUpdateRole={handleUpdateRole}
        isLoading={isLoading}
      />

      <UserRoleAssignment
        open={showUserAssignment}
        onOpenChange={setShowUserAssignment}
        role={selectedRole}
        users={users}
        assignedUsers={selectedRole ? getAssignedUsers(selectedRole) : []}
        availableRoles={roles}
        onAssignRole={handleAssignRoleToUser}
        onRemoveRole={handleRemoveRoleFromUser}
        isLoading={isLoading}
      />

      {/* Permission Tester Dialog */}
      <Dialog open={showPermissionTester} onOpenChange={setShowPermissionTester}>
        <DialogContent className="w-full sm:max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[85vh] overflow-y-auto p-0">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Permission Testing</h2>
              <Button 
                variant="outline" 
                onClick={() => setShowPermissionTester(false)}
              >
                Close
              </Button>
            </div>
            <PermissionTester />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RoleManagement;