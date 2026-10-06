import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Plus, Shield, LayoutDashboard } from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import { useRoleManagement } from '@/context/role-management/RoleManagementContext';
import { RoleCard } from '@/components/role-management/RoleCard';
import { CreateRoleDialog } from '@/components/role-management/CreateRoleDialog';
import { EditRoleDialog } from '@/components/role-management/EditRoleDialog';
import { UserRoleAssignment } from '@/components/role-management/UserRoleAssignment';
import { RoleWithPermissions, CreateRoleRequest, UpdateRoleRequest, AssignRoleRequest } from '@/types/roles';
import { useAuthorization } from '@/hooks/use-authorization';
import { useApproval } from '@/context/approval/ApprovalContext';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { SecurityOverview } from '@/components/role-management/SecurityOverview';

const RoleManagement = () => {
  const navigate = useNavigate();
  const { users, refreshUsers } = useAppContext();
  const { canManageRoles: canManageRolesAuth } = useAuthorization();
  const { canBypassApproval, createApprovalRequest, hasPendingRequest } = useApproval();
  const { toast } = useToast();
  const {
    roles,
    isLoading,
    createRole,
    updateRole,
    deleteRole,
    assignRoleToUser,
    removeRoleFromUser,
    getUserRolesByUserId,
    fetchUserRoles,
  } = useRoleManagement();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showUserAssignment, setShowUserAssignment] = useState(false);
  const [selectedRole, setSelectedRole] = useState<RoleWithPermissions | null>(null);
  const [cloneSourceRole, setCloneSourceRole] = useState<RoleWithPermissions | null>(null);
  const [activeRoleTab, setActiveRoleTab] = useState('overview');

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

  const doDeleteRole = async (roleId: string) => {
    const roleToDelete = roles.find(r => r.id === roleId);
    if (!roleToDelete) return;

    if (canBypassApproval()) {
      await deleteRole(roleId);
      toast({
        title: 'Role deleted',
        description: `${roleToDelete.display_name || roleToDelete.name} has been deleted.`,
      });
    } else if (hasPendingRequest('role', roleId)) {
      toast({
        title: 'Request Pending',
        description: 'An approval request is already pending for this role.',
        variant: 'destructive',
      });
    } else {
      const result = await createApprovalRequest({
        type: 'delete_role',
        resourceType: 'role',
        resourceId: roleId,
        resourceName: roleToDelete.display_name || roleToDelete.name,
        reason: `Delete role: ${roleToDelete.display_name || roleToDelete.name}`,
      });
      if (result.success) {
        toast({
          title: 'Request Submitted',
          description: 'Your deletion request has been sent to SuperAdmin for approval.',
        });
      } else {
        toast({
          title: 'Request Failed',
          description: result.error || 'Failed to submit approval request.',
          variant: 'destructive',
        });
      }
    }
  };

  const handleDeleteRole = (roleId: string) => {
    const roleToDelete = roles.find(r => r.id === roleId);
    if (!roleToDelete) return;
    toast({
      title: 'Delete this role?',
      description: `"${roleToDelete.display_name || roleToDelete.name}" will be permanently deleted. This cannot be undone.`,
      variant: 'destructive',
      action: <ToastAction altText="Confirm deletion" onClick={() => doDeleteRole(roleId)}>Delete</ToastAction>,
    });
  };

  const handleViewUsers = (role: RoleWithPermissions) => {
    setSelectedRole(role);
    setShowUserAssignment(true);
  };

  const getAssignedUsers = (role: RoleWithPermissions) => {
    const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z]/g, '');
    const roleNorm = norm(role.name);

    return users.filter(user => {
      const uroles = getUserRolesByUserId(user.id);
      if (uroles.some(ur => ur.role_id === role.id)) return true;
      if (role.is_system_role && user.role) {
        return norm(user.role) === roleNorm;
      }
      return false;
    });
  };

  const handleAssignRoleToUser = async (data: AssignRoleRequest): Promise<void> => {
    if (!selectedRole) return;
    const ok = await assignRoleToUser(data);
    if (!ok) return;
    await fetchUserRoles();
    await refreshUsers();
  };

  const handleRemoveRoleFromUser = async (userId: string, roleId: string): Promise<void> => {
    await removeRoleFromUser(userId, roleId);
    await refreshUsers();
  };

  const handleCloneRole = (role: RoleWithPermissions) => {
    setCloneSourceRole(role);
    setShowCreateDialog(true);
  };

  const systemRoles = roles.filter(role => role.is_system_role);
  const customRoles = roles.filter(role => !role.is_system_role);
  const assignmentCount = users.reduce((count, user) => count + getUserRolesByUserId(user.id).length, 0);

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-5 p-3 sm:p-5 lg:p-7">
      <div className="flex shrink-0 flex-col items-start justify-between gap-4 lg:flex-row lg:items-center">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#18252b] text-amber-300 shadow-sm">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-800 dark:text-white">
              Security &amp; Access
            </h1>
            <p className="text-xs font-medium uppercase tracking-[0.15em] text-slate-500">
              Role baselines
            </p>
          </div>
        </div>
        <div className="flex w-full flex-wrap gap-2 lg:w-auto">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => navigate('/admin-hub?tab=users')}
            className="w-full gap-1.5 sm:w-auto"
          >
            <ArrowLeft className="h-4 w-4" />
            Administration Hub
          </Button>
          <Button
            size="sm"
            onClick={() => setShowCreateDialog(true)}
            data-testid="button-create-role"
            className="w-full sm:w-auto"
          >
            <Plus className="mr-2 h-4 w-4" />
            <span>Create Role <span className="text-[10px] opacity-70">/ إنشاء دور</span></span>
          </Button>
        </div>
      </div>

      <Tabs value={activeRoleTab} onValueChange={setActiveRoleTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mb-4 h-auto w-full justify-start gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-[#fbfaf7] p-1">
          <TabsTrigger value="overview" className="gap-2 text-xs" data-testid="tab-overview">
            <LayoutDashboard className="h-3.5 w-3.5" /> Overview
          </TabsTrigger>
          <TabsTrigger value="roles" className="gap-2 text-xs" data-testid="tab-roles">
            <Shield className="h-4 w-4" />
            <span>Roles <span className="text-[10px] opacity-60">/ الأدوار</span></span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="m-0">
          <SecurityOverview
            roleCount={roles.length}
            activeRoleCount={roles.filter(r => r.is_active).length}
            userCount={users.length}
            assignmentCount={assignmentCount}
            onOpenPeople={() => navigate('/super-admin-hub?tab=user-access')}
            onOpenRoles={() => setActiveRoleTab('roles')}
          />
        </TabsContent>

        <TabsContent value="roles" className="min-h-0 space-y-6">
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">
                System Roles <span className="text-base font-normal text-muted-foreground" dir="rtl">/ الأدوار النظامية</span>
              </h2>
              <p className="text-gray-500">Built-in roles with predefined permissions</p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {systemRoles.map(role => (
                <RoleCard
                  key={role.id}
                  role={role}
                  onEdit={handleEditRole}
                  onDelete={handleDeleteRole}
                  onViewUsers={handleViewUsers}
                  onClone={handleCloneRole}
                  userCount={getAssignedUsers(role).length}
                />
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">
                Custom Roles <span className="text-base font-normal text-muted-foreground" dir="rtl">/ الأدوار المخصصة</span>
              </h2>
              <p className="text-gray-500">Organization-specific roles with custom permissions</p>
            </div>
            {customRoles.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Shield className="mb-4 h-12 w-12 text-gray-400" />
                  <h3 className="mb-1 text-lg font-medium text-gray-900">No Custom Roles</h3>
                  <p className="mb-4 text-center text-gray-500">
                    Create custom roles to define specific permissions for your organization.
                  </p>
                  <Button onClick={() => setShowCreateDialog(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create First Custom Role
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {customRoles.map(role => (
                  <RoleCard
                    key={role.id}
                    role={role}
                    onEdit={handleEditRole}
                    onDelete={handleDeleteRole}
                    onViewUsers={handleViewUsers}
                    onClone={handleCloneRole}
                    userCount={getAssignedUsers(role).length}
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <CreateRoleDialog
        open={showCreateDialog}
        onOpenChange={(isOpen) => {
          setShowCreateDialog(isOpen);
          if (!isOpen) setCloneSourceRole(null);
        }}
        onCreateRole={handleCreateRole}
        isLoading={isLoading}
        cloneSourceRole={cloneSourceRole}
        users={users}
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
    </div>
  );
};

export default RoleManagement;
