import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Plus, Users, Shield, Sparkles, Award, Lock, FlaskConical, KeyRound } from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import { useRoleManagement } from '@/context/role-management/RoleManagementContext';
import { RoleCard } from '@/components/role-management/RoleCard';
import { CreateRoleDialog } from '@/components/role-management/CreateRoleDialog';
import { EditRoleDialog } from '@/components/role-management/EditRoleDialog';
import { UserRoleAssignment } from '@/components/role-management/UserRoleAssignment';
import { PermissionTester } from '@/components/role-management/PermissionTester';
import { CostSubmissionPermissions } from '@/components/role-management/CostSubmissionPermissions';
import { SecurityPanel } from '@/components/role-management/SecurityPanel';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { RoleWithPermissions, CreateRoleRequest, UpdateRoleRequest, AssignRoleRequest, AppRole } from '@/types/roles';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useApproval } from '@/context/approval/ApprovalContext';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { normalizeRole } from '@/utils/roleMapping';

const RoleManagement = () => {
  const { currentUser, users, refreshUsers } = useAppContext();
  const { canManageRoles: canManageRolesAuth, isSuperAdmin: isSuperAdminFn, hasAnyRole } = useAuthorization();
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
    fetchRoles,
  } = useRoleManagement();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showUserAssignment, setShowUserAssignment] = useState(false);
  const [showPermissionTester, setShowPermissionTester] = useState(false);
  const [selectedRole, setSelectedRole] = useState<RoleWithPermissions | null>(null);
  const [cloneSourceRole, setCloneSourceRole] = useState<RoleWithPermissions | null>(null);

  // ── Access gates ─────────────────────────────────────────────────────────
  const canManageRoles = canManageRolesAuth();
  // FIX: isSuperAdmin uses the proper hook — Admin is NOT Super Admin
  const isSuperAdmin = isSuperAdminFn();
  // Admin can see Cost Submission Access (both SA and Admin)
  const isAdminOrAbove = isSuperAdmin || hasAnyRole(['admin', 'Admin']);

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
        title: "Role deleted",
        description: `${roleToDelete.display_name || roleToDelete.name} has been deleted.`,
      });
    } else if (hasPendingRequest('role', roleId)) {
      toast({
        title: "Request Pending",
        description: "An approval request is already pending for this role.",
        variant: "destructive"
      });
    } else {
      const result = await createApprovalRequest({
        type: 'delete_role',
        resourceType: 'role',
        resourceId: roleId,
        resourceName: roleToDelete.display_name || roleToDelete.name,
        reason: `Delete role: ${roleToDelete.display_name || roleToDelete.name}`
      });
      if (result.success) {
        toast({
          title: "Request Submitted",
          description: "Your deletion request has been sent to SuperAdmin for approval.",
        });
      } else {
        toast({
          title: "Request Failed",
          description: result.error || "Failed to submit approval request.",
          variant: "destructive"
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
    // Normalize both sides to lowercase-alpha so PascalCase ('DataCollector')
    // matches camelCase ('dataCollector') and snake_case ('data_collector').
    const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z]/g, '');
    const roleNorm = norm(role.name);

    return users.filter(user => {
      // 1. Check user_roles table entries (case-insensitive role name match)
      const uroles = getUserRolesByUserId(user.id);
      const inUserRolesTable = uroles.some(ur =>
        (role.is_system_role && norm(ur.role as string) === roleNorm) ||
        (!role.is_system_role && ur.role_id === role.id)
      );
      if (inUserRolesTable) return true;

      // 2. Fallback: match via profiles.role for users with no user_roles row
      if (role.is_system_role && user.role) {
        return norm(user.role) === roleNorm;
      }
      return false;
    });
  };

  const getUnassignedUsers = (role: RoleWithPermissions) => {
    const assignedUsers = getAssignedUsers(role);
    return users.filter(user => !assignedUsers.some(assigned => assigned.id === user.id));
  };

  const handleAssignRoleToUser = async (data: AssignRoleRequest): Promise<void> => {
    if (!selectedRole) return;

    const { error: clearErr } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', data.user_id);
    if (clearErr) {
      console.error('Clear user roles failed:', clearErr);
      toast({ title: 'Failed to assign role', description: clearErr.message, variant: 'destructive' });
      return;
    }

    const ok = await assignRoleToUser(data);
    if (!ok) return;

    // Persist the role name on profiles so page access (PAGE_DEFS / canSeePage)
    // can resolve custom roles like SMT instead of the opaque 'custom' marker.
    {
      const { error: profErr } = await supabase
        .from('profiles')
        .update({ role: selectedRole.name })
        .eq('id', data.user_id);
      if (profErr) console.warn('profiles.role update failed (RLS?):', profErr);
    }

    await fetchUserRoles();
    await refreshUsers();
  };

  const handleRemoveRoleFromUser = async (userId: string, roleId?: string, role?: AppRole): Promise<void> => {
    await removeRoleFromUser(userId, roleId, role);
    await refreshUsers();
  };

  const handleCloneRole = (role: RoleWithPermissions) => {
    setCloneSourceRole(role);
    setShowCreateDialog(true);
  };

  const systemRoles = roles.filter(role => role.is_system_role);
  const customRoles = roles.filter(role => !role.is_system_role);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Shield className="h-8 w-8 text-blue-600" />
            Role Management
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-0.5">
            Manage roles, permissions, page access, and per-user overrides
          </p>
          <p className="text-sm text-muted-foreground/70 mt-0.5" dir="rtl">
            إدارة الأدوار والصلاحيات وصلاحيات الصفحات وتجاوزات المستخدمين
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowPermissionTester(true)}
            data-testid="button-open-permission-tester"
            className="gap-1.5"
          >
            <FlaskConical className="h-4 w-4" />
            <span>Test Permissions <span className="text-muted-foreground text-[10px]">/ اختبار الصلاحيات</span></span>
          </Button>
          <Button
            size="sm"
            onClick={() => setShowCreateDialog(true)}
            data-testid="button-create-role"
          >
            <Plus className="h-4 w-4 mr-2" />
            <span>Create Role <span className="text-[10px] opacity-70">/ إنشاء دور</span></span>
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="hover-elevate active-elevate-2 cursor-pointer overflow-hidden relative bg-gradient-to-br from-blue-500 to-blue-700 text-white border-0" data-testid="card-total-roles">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/90">Total Roles <span className="block text-[11px] font-normal text-white/70" dir="rtl">إجمالي الأدوار</span></CardTitle>
            <Shield className="h-5 w-5 text-white/80" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{roles.length}</div>
            <p className="text-xs text-white/80 mt-1">{systemRoles.length} system + {customRoles.length} custom</p>
            <p className="text-[10px] text-white/60 mt-0.5" dir="rtl">{systemRoles.length} نظامية + {customRoles.length} مخصصة</p>
          </CardContent>
          <Sparkles className="absolute -right-4 -bottom-4 h-24 w-24 text-white/10" />
        </Card>

        <Card className="hover-elevate active-elevate-2 cursor-pointer overflow-hidden relative bg-gradient-to-br from-green-500 to-emerald-700 text-white border-0" data-testid="card-total-users">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/90">Total Users <span className="block text-[11px] font-normal text-white/70" dir="rtl">إجمالي المستخدمين</span></CardTitle>
            <Users className="h-5 w-5 text-white/80" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{users.length}</div>
            <p className="text-xs text-white/80 mt-1">Across all roles</p>
            <p className="text-[10px] text-white/60 mt-0.5" dir="rtl">عبر جميع الأدوار</p>
          </CardContent>
          <Sparkles className="absolute -right-4 -bottom-4 h-24 w-24 text-white/10" />
        </Card>

        <Card className="hover-elevate active-elevate-2 cursor-pointer overflow-hidden relative bg-gradient-to-br from-purple-500 to-purple-700 text-white border-0" data-testid="card-active-roles">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/90">Active Roles <span className="block text-[11px] font-normal text-white/70" dir="rtl">الأدوار النشطة</span></CardTitle>
            <Award className="h-5 w-5 text-white/80" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{roles.filter(r => r.is_active).length}</div>
            <p className="text-xs text-white/80 mt-1">Currently active</p>
            <p className="text-[10px] text-white/60 mt-0.5" dir="rtl">نشطة حالياً</p>
          </CardContent>
          <Sparkles className="absolute -right-4 -bottom-4 h-24 w-24 text-white/10" />
        </Card>
      </div>

      {/* Tabbed content — 3 tabs only */}
      <Tabs defaultValue="roles">
        <TabsList className="mb-4 h-auto gap-1">
          {/* Tab 1: Roles */}
          <TabsTrigger value="roles" className="gap-2" data-testid="tab-roles">
            <Shield className="h-4 w-4" />
            <span>Roles <span className="text-[10px] opacity-60">/ الأدوار</span></span>
          </TabsTrigger>

          {/* Tab 2: Security Panel — unified everything */}
          <TabsTrigger value="security-panel" className="gap-2" data-testid="tab-security-panel">
            <KeyRound className="h-4 w-4" />
            <span>Security Panel <span className="text-[10px] opacity-60">/ لوحة الأمان</span></span>
          </TabsTrigger>

          {/* Tab 3: Cost Submission Access — Admin + Super Admin only */}
          {isAdminOrAbove && (
            <TabsTrigger value="cost-submissions" className="gap-2" data-testid="tab-cost-submission-perms">
              <Lock className="h-4 w-4" />
              <span>Cost Submission Access <span className="text-[10px] opacity-60">/ صلاحيات التكاليف</span></span>
            </TabsTrigger>
          )}
        </TabsList>

        {/* ── Tab 1: Roles ── */}
        <TabsContent value="roles" className="space-y-6">
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">System Roles <span className="text-base font-normal text-muted-foreground" dir="rtl">/ الأدوار النظامية</span></h2>
              <p className="text-gray-500">Built-in roles with predefined permissions</p>
              <p className="text-xs text-muted-foreground/70" dir="rtl">أدوار مدمجة بصلاحيات محددة مسبقاً</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
              <h2 className="text-xl font-semibold">Custom Roles <span className="text-base font-normal text-muted-foreground" dir="rtl">/ الأدوار المخصصة</span></h2>
              <p className="text-gray-500">Organization-specific roles with custom permissions</p>
              <p className="text-xs text-muted-foreground/70" dir="rtl">أدوار مخصصة للمؤسسة بصلاحيات محددة</p>
            </div>
            {customRoles.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Shield className="h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-1">No Custom Roles</h3>
                  <p className="text-xs text-muted-foreground/70 mb-1" dir="rtl">لا توجد أدوار مخصصة</p>
                  <p className="text-gray-500 text-center mb-4">
                    Create custom roles to define specific permissions for your organization.
                  </p>
                  <Button onClick={() => setShowCreateDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    <span>Create First Custom Role <span className="text-[10px] opacity-70">/ إنشاء أول دور مخصص</span></span>
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
                    onClone={handleCloneRole}
                    userCount={getAssignedUsers(role).length}
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Tab 2: Security Panel ── */}
        <TabsContent value="security-panel" className="mt-0">
          <div className="mb-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-indigo-600" />
              Security Panel <span className="text-base font-normal text-muted-foreground" dir="rtl">/ لوحة الأمان</span>
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              View by role or by user — every page, button, report and permission in one place. Toggle any access individually per user.
            </p>
          </div>
          <SecurityPanel isSuperAdmin={isSuperAdmin} />
        </TabsContent>

        {/* ── Tab 3: Cost Submission Access (Admin + Super Admin) ── */}
        {isAdminOrAbove && (
          <TabsContent value="cost-submissions">
            <CostSubmissionPermissions />
          </TabsContent>
        )}
      </Tabs>

      {/* Dialogs */}
      <CreateRoleDialog
        open={showCreateDialog}
        onOpenChange={(isOpen) => {
          setShowCreateDialog(isOpen);
          if (!isOpen) setCloneSourceRole(null);
        }}
        onCreateRole={handleCreateRole}
        isLoading={isLoading}
        cloneSourceRole={cloneSourceRole}
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

      {/* Permission Tester Dialog — now has a real trigger button */}
      <Dialog open={showPermissionTester} onOpenChange={setShowPermissionTester}>
        <DialogContent className="w-full sm:max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[85vh] overflow-y-auto p-0">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <FlaskConical className="h-5 w-5 text-blue-600" />
                  Permission Tester <span className="text-base font-normal text-muted-foreground" dir="rtl">/ اختبار الصلاحيات</span>
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">Simulate any user's effective permissions including overrides</p>
                <p className="text-xs text-muted-foreground/70" dir="rtl">محاكاة صلاحيات أي مستخدم بما في ذلك التجاوزات</p>
              </div>
              <Button variant="outline" onClick={() => setShowPermissionTester(false)}>Close</Button>
            </div>
            <PermissionTester />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RoleManagement;
