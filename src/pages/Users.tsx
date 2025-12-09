import React, { useState, useEffect, useMemo } from 'react';
import { useUser } from '@/context/user/UserContext';
import { User } from '@/types';
import UserRoleDashboard from '@/components/UserRoleDashboard';
import AdminUsersTable from '@/components/AdminUsersTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Link } from 'react-router-dom';
import { useAuthorization } from '@/hooks/use-authorization';
import { useApproval } from '@/context/approval/ApprovalContext';
import {
  User as UserIcon,
  Search,
  UserPlus,
  X,
  Check,
  UserCog,
  Clock,
  Shield,
  Edit,
  RefreshCw,
  AlertCircle,
  Bell,
  Loader2,
  Sparkles,
  Award,
  Users as UsersIcon,
  CheckCircle,
  KeyRound,
  Mail
} from 'lucide-react';
import { AppRole } from '@/types/roles';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import PendingApprovalsList from '@/components/PendingApprovalsList';
import { useRoleManagement } from '@/context/role-management/RoleManagementContext';
import { useAppContext } from '@/context/AppContext';
import UserClassificationBadge from '@/components/user/UserClassificationBadge';
import RoleBadge from '@/components/user/RoleBadge';

// Database role codes (camelCase) - matches Supabase app_role enum
const ALL_POSSIBLE_ROLES = [
  'admin',
  'ict',
  'fom',
  'financialAdmin',
  'supervisor',
  'coordinator',
  'dataCollector',
  'reviewer'
] as const;

const Users = () => {
  const { currentUser, users, approveUser, rejectUser, refreshUsers, hasRole, addRole, removeRole, sendPasswordRecoveryEmail } = useUser();
  const { roles: allRoles, getUserRolesByUserId, assignRoleToUser, removeRoleFromUser } = useRoleManagement();
  const { canManageRoles } = useAuthorization();
  const { canBypassApproval, createApprovalRequest, hasPendingRequest } = useApproval();
  const { toast } = useToast();
  const { roles } = useAppContext();
  const [filteredUsers, setFilteredUsers] = useState<User[]>(users);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedHub, setSelectedHub] = useState<string | null>(null);
  const [isLoadingApproval, setIsLoadingApproval] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('all-users');

  const [showAdminSection, setShowAdminSection] = useState(true);

  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [roleSelect, setRoleSelect] = useState<string>('');
  const [isRoleLoading, setIsRoleLoading] = useState(false);

  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; userId?: string; action?: 'delete' | 'deactivate' }>({ open: false });
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  const [passwordResetDialog, setPasswordResetDialog] = useState<{ open: boolean; user?: User }>({ open: false });
  const [isSendingReset, setIsSendingReset] = useState(false);

  const [adminPasswordDialog, setAdminPasswordDialog] = useState<{ open: boolean; user?: User }>({ open: false });
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const pendingUsers = useMemo(() => users.filter(user => !user.isApproved), [users]);
  const approvedUsers = useMemo(() => users.filter(user => user.isApproved), [users]);

  const primaryRole = currentUser?.role?.toLowerCase() || '';
  const isAdminOrICT = 
    (roles || []).includes('admin' as any) || 
    (roles || []).includes('ict' as any) || 
    (roles || []).includes('superAdmin' as any) ||
    primaryRole === 'admin' ||
    primaryRole === 'ict' ||
    primaryRole === 'superadmin';

  const getUserRoleLabels = (uid: string): string[] => {
    // Combine system roles (text) and custom roles (via role_id -> roles table)
    const urs = getUserRolesByUserId(uid);
    const labels = urs.map(ur => {
      if (ur.role) return ur.role as string;
      if (ur.role_id) {
        const r = allRoles.find(rr => rr.id === ur.role_id);
        return r?.display_name || r?.name || 'custom';
      }
      return 'custom';
    });
    return Array.from(new Set(labels));
  };

  // Determine the single, effective role label to display for a user
  const getPrimaryRoleLabel = (user: User): string => {
    const urs = getUserRolesByUserId(user.id);
    const sys = urs.find(ur => !!ur.role);
    if (sys?.role) return sys.role as string;
    const custom = urs.find(ur => !!ur.role_id);
    if (custom?.role_id) {
      const r = allRoles.find(rr => rr.id === custom.role_id);
      return r?.display_name || r?.name || 'custom';
    }
    return user.role;
  };

  const handleRefreshUsers = async () => {
    setIsRefreshing(true);
    try {
      await refreshUsers();
      
      toast({
        title: "Users refreshed",
        description: `Successfully synchronized with Supabase database`,
      });
    } catch (err) {
      console.error("Error refreshing users:", err);
      toast({
        title: "Refresh failed",
        description: "Could not fetch users from database",
        variant: "destructive"
      });
    } finally {
      setTimeout(() => {
        setIsRefreshing(false);
      }, 1000);
    }
  };

  useEffect(() => {
    // Initial refresh when component mounts
    handleRefreshUsers();
    
    // Set up auto-refresh interval
    const autoRefreshInterval = setInterval(() => {
      refreshUsers().catch(err => console.error("Auto-refresh error:", err));
    }, 60000); // Refresh every minute
    
    return () => clearInterval(autoRefreshInterval);
  }, []);

  useEffect(() => {
    let base = users;
    if (activeTab === 'pending-approvals') base = pendingUsers;
    else if (activeTab === 'approved-users') base = approvedUsers;

    let result = base;
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      result = result.filter(user => {
        // basic contact fields
        const matchesContact = (
          user.name?.toLowerCase().includes(lowerQuery) ||
          user.email?.toLowerCase().includes(lowerQuery) ||
          user.phone?.toLowerCase().includes(lowerQuery)
        );

        if (matchesContact) return true;

        // primary role label (system or custom display name)
        const primaryLabel = getPrimaryRoleLabel(user)?.toLowerCase() || '';
        if (primaryLabel.includes(lowerQuery)) return true;

        // raw profile.role (backwards compatibility) or roles array
        if (user.role && user.role.toLowerCase().includes(lowerQuery)) return true;
        if (Array.isArray(user.roles) && user.roles.some((r: any) => String(r).toLowerCase().includes(lowerQuery))) return true;

        // any assigned role entry (system roles stored on user_roles.role or custom via role_id)
        const urs = getUserRolesByUserId(user.id);
        if (urs.some(ur => (ur.role && String(ur.role).toLowerCase().includes(lowerQuery)))) return true;
        // for custom role ids, try mapping to display names
        if (urs.some(ur => {
          if (!ur.role_id) return false;
          const r = allRoles.find(rr => rr.id === ur.role_id);
          return !!(r && ((r.display_name || r.name) || '').toLowerCase().includes(lowerQuery));
        })) return true;

        return false;
      });
    }

    if (selectedRole) {
      if (selectedRole.startsWith('sys:')) {
        const sysRole = selectedRole.slice(4);
        result = result.filter(user =>
          user.role === sysRole ||
          (user.roles && user.roles.includes(sysRole as any)) ||
          getUserRolesByUserId(user.id).some(ur => ur.role === sysRole as any)
        );
      } else if (selectedRole.startsWith('custom:')) {
        const roleId = selectedRole.slice(7);
        result = result.filter(user =>
          getUserRolesByUserId(user.id).some(ur => ur.role_id === roleId)
        );
      } else {
        // Backward compatibility: plain system role value
        result = result.filter(user =>
          user.role === selectedRole ||
          (user.roles && user.roles.includes(selectedRole as any))
        );
      }
    }

    if (selectedState) {
      result = result.filter(user => user.stateId === selectedState);
    }

    if (selectedHub) {
      result = result.filter(user => user.hubId === selectedHub);
    }

    setFilteredUsers(result);
  }, [users, activeTab, searchQuery, selectedRole, selectedState, selectedHub]);

  const handleRoleClick = (role: string) => {
    if (selectedRole === role) {
      setSelectedRole(null);
    } else {
      setSelectedRole(role);
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map((n) => n[0]).join('').toUpperCase();
  };

  const handleOpenRoleEdit = (user: User) => {
    setEditingUser(user);
    setRoleSelect('');
  };

  const handleCloseRoleEdit = () => {
    setEditingUser(null);
    setRoleSelect('');
  };

  const handleConfirmRoleEdit = async () => {
    if (!editingUser || !roleSelect) return;
    setIsRoleLoading(true);

    try {
      let success = false;
      if (roleSelect.startsWith('sys:')) {
        const sysRole = roleSelect.slice(4) as AppRole;
        // Exclusive: clear all current roles first
        const { error: clearErr } = await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', editingUser.id);
        if (clearErr) throw clearErr;

        // Assign the selected system role
        success = await addRole(editingUser.id, sysRole);

        // Reflect primary in profiles.role for system roles
        const { error: profErr } = await supabase
          .from('profiles')
          .update({ role: sysRole })
          .eq('id', editingUser.id);
        if (profErr) throw profErr;

        // Keep local cache light: set only the selected system role
        const storedUser = localStorage.getItem(`user-${editingUser.id}`);
        if (storedUser) {
          try {
            const parsedUser = JSON.parse(storedUser);
            localStorage.setItem(`user-${editingUser.id}`, JSON.stringify({
              ...parsedUser,
              role: sysRole,
              roles: [sysRole],
            }));
          } catch (error) {
            console.error("Error updating stored user roles:", error);
          }
        }

        await refreshUsers();
      } else if (roleSelect.startsWith('custom:')) {
        const roleId = roleSelect.slice(7);
        // Exclusive: clear all current roles first
        const { error: clearErr } = await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', editingUser.id);
        if (clearErr) throw clearErr;

        // Assign the selected custom role
        success = await assignRoleToUser({ user_id: editingUser.id, role_id: roleId });

        // Set profiles.role to a neutral marker (not a system role) to avoid miscount
        const { error: profErr } = await supabase
          .from('profiles')
          .update({ role: 'custom' })
          .eq('id', editingUser.id);
        if (profErr) throw profErr;

        // Update local cache to reflect single effective role
        const storedUser = localStorage.getItem(`user-${editingUser.id}`);
        if (storedUser) {
          try {
            const parsedUser = JSON.parse(storedUser);
            localStorage.setItem(`user-${editingUser.id}`, JSON.stringify({
              ...parsedUser,
              role: 'custom',
              roles: [],
            }));
          } catch (error) {
            console.error("Error updating stored user roles:", error);
          }
        }

        await refreshUsers();
      }

      if (!success) {
        toast({
          title: "Role update failed",
          description: "The role could not be updated. Check permissions or try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error updating role:", error);
      toast({
        title: "Role update failed",
        description: "There was an error updating the user's role.",
        variant: "destructive"
      });
    } finally {
      setIsRoleLoading(false);
      setEditingUser(null);
      setRoleSelect('');
    }
  };

  const handleApproveUser = async (userId: string) => {
    setIsLoadingApproval(userId);
    
    try {
      const success = await approveUser(userId);
      
      if (success) {
        toast({
          title: "User approved",
          description: "The user has been successfully approved and can now log in.",
        });
        await refreshUsers();
      }
    } catch (error) {
      console.error("Error approving user:", error);
      toast({
        title: "Approval failed",
        description: "There was an error approving the user.",
        variant: "destructive"
      });
    } finally {
      setIsLoadingApproval(null);
    }
  };

  const handleRejectUser = async (userId: string) => {
    setIsLoadingApproval(userId);
    
    try {
      const success = await rejectUser(userId);
      
      if (success) {
        toast({
          title: "User rejected",
          description: "The user has been removed from the system.",
        });
        await refreshUsers();
      }
    } catch (error) {
      console.error("Error rejecting user:", error);
      toast({
        title: "Rejection failed",
        description: "There was an error rejecting the user.",
        variant: "destructive"
      });
    } finally {
      setIsLoadingApproval(null);
    }
  };

  const handleDelete = (userId: string) => {
    setConfirmDialog({ open: true, userId, action: 'delete' });
  };

  const handleDeactivate = (userId: string) => {
    setConfirmDialog({ open: true, userId, action: 'deactivate' });
  };

  // --- Add actual delete and deactivate logic ---
  const deleteUser = async (userId: string) => {
    // Remove from profiles table (or your users table)
    await supabase.from('profiles').delete().eq('id', userId);
    // Optionally, remove from auth.users if you have elevated permissions
    // await supabase.auth.admin.deleteUser(userId);
  };

  const deactivateUser = async (userId: string) => {
    // Set a flag in the profiles table (or your users table)
    await supabase.from('profiles').update({ is_active: false }).eq('id', userId);
    // Optionally, you can also remove from auth or set a custom claim
  };

  const confirmAction = async () => {
    if (confirmDialog.action === 'delete' && confirmDialog.userId) {
      const userToDelete = users.find(u => u.id === confirmDialog.userId);
      
      // SuperAdmin can bypass approval and delete directly
      if (canBypassApproval()) {
        setDeletingUserId(confirmDialog.userId);
        await deleteUser(confirmDialog.userId);
        await refreshUsers();
        setDeletingUserId(null);
        toast({
          title: "User deleted",
          description: `${userToDelete?.name || 'User'} has been successfully deleted from the system.`,
        });
      } else if (hasPendingRequest('user', confirmDialog.userId)) {
        toast({
          title: "Request Pending",
          description: "An approval request is already pending for this user.",
          variant: "destructive"
        });
      } else {
        // Non-SuperAdmin: create approval request
        const result = await createApprovalRequest({
          type: 'delete_user',
          resourceType: 'user',
          resourceId: confirmDialog.userId,
          resourceName: userToDelete?.name || 'Unknown User',
          reason: `Delete user: ${userToDelete?.name || 'Unknown User'} (${userToDelete?.email || 'No email'})`
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
    } else if (confirmDialog.action === 'deactivate' && confirmDialog.userId) {
      await deactivateUser(confirmDialog.userId);
      await refreshUsers();
    }
    setConfirmDialog({ open: false });
  };

  const handleOpenPasswordReset = (user: User) => {
    setPasswordResetDialog({ open: true, user });
  };

  const handleSendPasswordReset = async () => {
    if (!passwordResetDialog.user?.email) return;
    
    setIsSendingReset(true);
    try {
      const success = await sendPasswordRecoveryEmail(passwordResetDialog.user.email);
      if (success) {
        toast({
          title: "Password reset email sent",
          description: `A password reset link has been sent to ${passwordResetDialog.user.email}`,
        });
        setPasswordResetDialog({ open: false });
      }
    } catch (error) {
      console.error("Error sending password reset:", error);
      toast({
        title: "Failed to send reset email",
        description: "There was an error sending the password reset email.",
        variant: "destructive"
      });
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleOpenAdminPasswordChange = (user: User) => {
    setAdminPasswordDialog({ open: true, user });
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleAdminPasswordChange = async () => {
    if (!adminPasswordDialog.user?.id) return;
    
    if (newPassword.length < 6) {
      toast({
        title: "Password too short",
        description: "Password must be at least 6 characters long.",
        variant: "destructive"
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords do not match",
        description: "Please ensure both passwords are the same.",
        variant: "destructive"
      });
      return;
    }

    setIsChangingPassword(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-change-password', {
        body: {
          userId: adminPasswordDialog.user.id,
          newPassword: newPassword
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: "Password changed successfully",
          description: `Password has been updated for ${adminPasswordDialog.user.name || adminPasswordDialog.user.email}`,
        });
        setAdminPasswordDialog({ open: false });
        setNewPassword('');
        setConfirmPassword('');
      } else {
        throw new Error(data?.error || 'Failed to change password');
      }
    } catch (error: any) {
      console.error("Error changing password:", error);
      toast({
        title: "Failed to change password",
        description: error.message || "There was an error changing the user's password.",
        variant: "destructive"
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const stats = {
    totalUsers: users.length,
    pendingApprovals: pendingUsers.length,
    approvedUsers: approvedUsers.length,
    totalRoles: Array.from(new Set(users.map(u => getPrimaryRoleLabel(u)))).length
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <UsersIcon className="h-8 w-8 text-blue-600" />
            Users Management
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            View and manage user accounts and permissions
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleRefreshUsers}
            disabled={isRefreshing}
            data-testid="button-refresh-users"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
          
          <Button size="sm" asChild data-testid="button-add-user">
            <Link to="/register">
              <UserPlus className="mr-2 h-4 w-4" />
              Add User
            </Link>
          </Button>
        </div>
      </div>

      {/* Enhanced Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card 
          className="hover-elevate active-elevate-2 cursor-pointer overflow-hidden relative bg-gradient-to-br from-blue-500 to-blue-700 text-white border-0"
          onClick={() => setActiveTab('all-users')}
          data-testid="card-total-users"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/90">
              Total Users
            </CardTitle>
            <UsersIcon className="h-5 w-5 text-white/80" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{stats.totalUsers}</div>
            <p className="text-xs text-white/80 mt-1">
              Click to view all users
            </p>
          </CardContent>
          <Sparkles className="absolute -right-4 -bottom-4 h-24 w-24 text-white/10" />
        </Card>

        <Card 
          className="hover-elevate active-elevate-2 cursor-pointer overflow-hidden relative bg-gradient-to-br from-green-500 to-emerald-700 text-white border-0"
          onClick={() => setActiveTab('approved-users')}
          data-testid="card-approved-users"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/90">
              Approved Users
            </CardTitle>
            <CheckCircle className="h-5 w-5 text-white/80" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{stats.approvedUsers}</div>
            <p className="text-xs text-white/80 mt-1">
              Active in the system
            </p>
          </CardContent>
          <Sparkles className="absolute -right-4 -bottom-4 h-24 w-24 text-white/10" />
        </Card>

        <Card 
          className="hover-elevate active-elevate-2 cursor-pointer overflow-hidden relative bg-gradient-to-br from-purple-500 to-purple-700 text-white border-0"
          onClick={() => setActiveTab('pending-approvals')}
          data-testid="card-pending-approvals"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/90">
              Pending Approvals
            </CardTitle>
            <Clock className="h-5 w-5 text-white/80" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{stats.pendingApprovals}</div>
            <p className="text-xs text-white/80 mt-1">
              {stats.pendingApprovals > 0 ? 'Click to review' : 'No pending approvals'}
            </p>
          </CardContent>
          <Sparkles className="absolute -right-4 -bottom-4 h-24 w-24 text-white/10" />
        </Card>

        <Card 
          className="hover-elevate active-elevate-2 cursor-pointer overflow-hidden relative bg-gradient-to-br from-orange-500 to-red-600 text-white border-0"
          data-testid="card-unique-roles"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/90">
              Unique Roles
            </CardTitle>
            <Award className="h-5 w-5 text-white/80" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{stats.totalRoles}</div>
            <p className="text-xs text-white/80 mt-1">
              Active role types
            </p>
          </CardContent>
          <Sparkles className="absolute -right-4 -bottom-4 h-24 w-24 text-white/10" />
        </Card>
      </div>

      {users.length === 0 && (
        <Card className="p-6 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700/30 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <Clock size={20} />
              <p>No users found. If you've added users in Supabase, click Refresh Users to sync them.</p>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleRefreshUsers}
              disabled={isRefreshing}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing...' : 'Refresh Users'}
            </Button>
          </div>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
        <TabsList>
          <TabsTrigger value="all-users">All Users</TabsTrigger>
          <TabsTrigger value="pending-approvals" className="flex items-center gap-1">
            Pending Approvals
            {pendingUsers.length > 0 && (
              <Badge variant="secondary" className="ml-1 bg-amber-100 text-amber-800">
                {pendingUsers.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved-users">Approved Users</TabsTrigger>
        </TabsList>

        <TabsContent value="all-users" className="mt-0">
          {showAdminSection && <AdminUsersTable />}

          <div className="my-6">
            <UserRoleDashboard
              users={users}
              onRoleClick={handleRoleClick}
              onStateChange={setSelectedState}
              selectedState={selectedState}
              onHubChange={setSelectedHub}
              selectedHub={selectedHub}
            />
          </div>

          <div className="mb-6 flex flex-col md:flex-row gap-4">
            <div className="w-full md:w-64">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search users..."
                  className="pl-8"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              {selectedRole && (
                <Badge variant="outline" className="flex items-center gap-1">
                  Role: {(() => {
                    if (selectedRole.startsWith('sys:')) return selectedRole.slice(4);
                    if (selectedRole.startsWith('custom:')) {
                      const rid = selectedRole.slice(7);
                      const r = allRoles.find(rr => rr.id === rid);
                      return r?.display_name || r?.name || 'custom';
                    }
                    return selectedRole;
                  })()}
                  <button
                    onClick={() => setSelectedRole(null)}
                    className="ml-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}

              {selectedState && (
                <Badge variant="outline" className="flex items-center gap-1">
                  State filter active
                  <button
                    onClick={() => setSelectedState(null)}
                    className="ml-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}

              {selectedHub && (
                <Badge variant="outline" className="flex items-center gap-1">
                  Hub filter active
                  <button
                    onClick={() => setSelectedHub(null)}
                    className="ml-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
            </div>
          </div>

          <div className="relative overflow-hidden border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Classification</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => {
                    if (currentUser && user.id === currentUser.id) return null;

                    const lastActiveDate = user.lastActive ? new Date(user.lastActive) : null;
                    const now = new Date();
                    const minutesSinceActive = lastActiveDate
                      ? Math.round((now.getTime() - lastActiveDate.getTime()) / (1000 * 60))
                      : null;
                    const activeStatus = minutesSinceActive === null
                      ? 'Unknown'
                      : minutesSinceActive < 5
                        ? 'Just now'
                        : minutesSinceActive < 60
                          ? `${minutesSinceActive}m ago`
                          : minutesSinceActive < 24 * 60
                            ? `${Math.round(minutesSinceActive / 60)}h ago`
                            : `${Math.round(minutesSinceActive / (60 * 24))}d ago`;

                    const primaryRole = getPrimaryRoleLabel(user);

                    const isAdmin = currentUser && (currentUser.role === 'admin' || currentUser.role === 'Admin' ||
                      (currentUser.roles && Array.isArray(currentUser.roles) && (currentUser.roles.includes('admin' as any) || currentUser.roles.includes('Admin'))));
                    const canManageRolesUI = canManageRoles();

                    return (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar>
                              <AvatarImage src={user.avatar} />
                              <AvatarFallback className="bg-primary/10 text-primary">
                                {user.name ? getInitials(user.name) : <UserIcon className="h-4 w-4" />}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{user.name}</p>
                              <p className="text-xs text-muted-foreground">{user.phone || '-'}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <RoleBadge role={user.role} size="sm" />
                          </div>
                        </TableCell>
                        <TableCell>
                          <UserClassificationBadge userId={user.id} />
                        </TableCell>
                        <TableCell>
                          {user.isApproved ? (
                            <div className="flex items-center">
                              <Badge variant="success" className="bg-green-100 text-green-800 hover:bg-green-200">
                                <Check size={12} className="mr-1" /> Approved
                              </Badge>
                            </div>
                          ) : (
                            <div className="flex items-center">
                              <Badge variant="destructive" className="bg-amber-100 text-amber-800 hover:bg-amber-200">
                                <Clock size={12} className="mr-1" /> Pending
                              </Badge>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full 
                              ${user.availability === 'online' ? 'bg-green-500' : 'bg-gray-300'}`}>
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {activeStatus}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {!user.isApproved && isAdmin && (
                            <div className="flex justify-end gap-2 mb-2">
                              <Button 
                                variant="default" 
                                size="sm"
                                onClick={() => handleApproveUser(user.id)}
                                disabled={isLoadingApproval === user.id}
                              >
                                <Check className="h-4 w-4 mr-1" />
                                {isLoadingApproval === user.id ? "Processing..." : "Approve"}
                              </Button>
                              <Button 
                                variant="destructive" 
                                size="sm"
                                onClick={() => handleRejectUser(user.id)}
                                disabled={isLoadingApproval === user.id}
                              >
                                <X className="h-4 w-4 mr-1" />
                                {isLoadingApproval === user.id ? "Processing..." : "Reject"}
                              </Button>
                            </div>
                          )}
                          <Button variant="ghost" size="sm" asChild>
                            <Link to={`/users/${user.id}`}>
                              <UserCog className="h-4 w-4 mr-2" />
                              Manage
                            </Link>
                          </Button>
                          {canManageRolesUI && (
                            <Button variant="outline" size="sm" className="ml-2" asChild>
                              <Link to="/role-management" className="flex items-center">
                                <Shield className="h-4 w-4 mr-1" />
                                Manage Roles
                              </Link>
                            </Button>
                          )}
                          {isAdminOrICT && (
                            <div className="flex flex-wrap justify-end gap-2 mt-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenPasswordReset(user)}
                                data-testid={`button-reset-password-all-${user.id}`}
                              >
                                <Mail className="h-4 w-4 mr-1" />
                                Send Reset Email
                              </Button>
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => handleOpenAdminPasswordChange(user)}
                                data-testid={`button-change-password-all-${user.id}`}
                              >
                                <KeyRound className="h-4 w-4 mr-1" />
                                Set Password
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleDelete(user.id)}
                                disabled={deletingUserId === user.id}
                              >
                                {deletingUserId === user.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : null}
                                Delete
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeactivate(user.id)}
                                disabled={deletingUserId === user.id}
                              >
                                Deactivate
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                      No users found matching your criteria
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="pending-approvals" className="mt-0">
          <PendingApprovalsList 
            pendingUsers={pendingUsers}
            onApprove={handleApproveUser}
            onReject={handleRejectUser}
            isLoadingApproval={isLoadingApproval}
          />
        </TabsContent>

        <TabsContent value="approved-users" className="mt-0">
          <div className="relative overflow-hidden border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Classification</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approvedUsers.length > 0 ? (
                  approvedUsers.map((user) => {
                    if (currentUser && user.id === currentUser.id) return null;
                    const roleLabels = getUserRoleLabels(user.id);

                    const isAdmin = currentUser && (currentUser.role === 'admin' || currentUser.role === 'Admin' ||
                      (currentUser.roles && Array.isArray(currentUser.roles) && (currentUser.roles.includes('admin' as any) || currentUser.roles.includes('Admin'))));

                    return (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar>
                              <AvatarImage src={user.avatar} />
                              <AvatarFallback className="bg-primary/10 text-primary">
                                {user.name ? getInitials(user.name) : <UserIcon className="h-4 w-4" />}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{user.name}</p>
                              <p className="text-xs text-muted-foreground">{user.phone || '-'}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {roleLabels.length > 0 ? (
                              roleLabels.map((label, index) => (
                                <RoleBadge key={index} role={label} size="sm" />
                              ))
                            ) : (
                              <RoleBadge role={user.role} size="sm" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <UserClassificationBadge userId={user.id} />
                        </TableCell>
                        <TableCell>
                          <Badge variant="success" className="bg-green-100 text-green-800 hover:bg-green-200">
                            <Check size={12} className="mr-1" /> Active
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" asChild>
                            <Link to={`/users/${user.id}`}>
                              <UserCog className="h-4 w-4 mr-2" />
                              Manage
                            </Link>
                          </Button>
                          {isAdmin && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="ml-2"
                              onClick={() => handleOpenRoleEdit(user)}
                            >
                              <Shield className="h-4 w-4 mr-1" />
                              Edit Roles
                            </Button>
                          )}
                          {isAdminOrICT && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="ml-2"
                                onClick={() => handleOpenPasswordReset(user)}
                                data-testid={`button-reset-password-${user.id}`}
                              >
                                <Mail className="h-4 w-4 mr-1" />
                                Send Reset Email
                              </Button>
                              <Button
                                variant="default"
                                size="sm"
                                className="ml-2"
                                onClick={() => handleOpenAdminPasswordChange(user)}
                                data-testid={`button-change-password-${user.id}`}
                              >
                                <KeyRound className="h-4 w-4 mr-1" />
                                Set Password
                              </Button>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                      No approved users found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!editingUser} onOpenChange={handleCloseRoleEdit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Role</DialogTitle>
            <DialogDescription>
              Select a new role for{' '}
              <span className="font-bold">{editingUser?.name ?? ''}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="mb-3">
            <Select
              value={roleSelect}
              onValueChange={val => setRoleSelect(val)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {/* System roles */}
                <SelectItem disabled value="__sys_label">System Roles</SelectItem>
                {ALL_POSSIBLE_ROLES.map(role => (
                  <SelectItem key={`sys:${role}`} value={`sys:${role}`}>
                    {role}
                  </SelectItem>
                ))}
                {/* Custom roles from roles table */}
                {allRoles.filter(r => !r.is_system_role).length > 0 && (
                  <SelectItem disabled value="__custom_label">Custom Roles</SelectItem>
                )}
                {allRoles
                  .filter(r => !r.is_system_role)
                  .map(r => (
                    <SelectItem key={`custom:${r.id}`} value={`custom:${r.id}`}>
                      {r.display_name || r.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={handleConfirmRoleEdit}
              disabled={!roleSelect || isRoleLoading}
            >
              {isRoleLoading ? "Updating..." : "Update Role"}
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDialog.open} onOpenChange={open => setConfirmDialog(s => ({ ...s, open }))}>
        <DialogContent>
          <DialogHeader>
            Confirm {confirmDialog.action === 'delete' ? 'Delete' : 'Deactivate'} Account
          </DialogHeader>
          <div>
            Are you sure you want to {confirmDialog.action} this user account? This action cannot be undone.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog({ open: false })}>
              Cancel
            </Button>
            <Button variant={confirmDialog.action === 'delete' ? 'destructive' : 'default'} onClick={confirmAction}>
              {confirmDialog.action === 'delete' ? 'Delete' : 'Deactivate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={passwordResetDialog.open} onOpenChange={open => setPasswordResetDialog(open ? s => ({ ...s, open }) : { open: false })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset User Password</DialogTitle>
            <DialogDescription>
              Send a password reset link to this user&apos;s email address.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarImage src={passwordResetDialog.user?.avatar} />
                <AvatarFallback className="bg-primary/10 text-primary">
                  {passwordResetDialog.user?.name ? getInitials(passwordResetDialog.user.name) : <UserIcon className="h-4 w-4" />}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{passwordResetDialog.user?.name}</p>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {passwordResetDialog.user?.email}
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Clicking &quot;Send Reset Email&quot; will send a password reset link to the user&apos;s email address. They will be able to set a new password using that link.
            </p>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setPasswordResetDialog({ open: false })}
              disabled={isSendingReset}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSendPasswordReset}
              disabled={isSendingReset || !passwordResetDialog.user?.email}
              data-testid="button-confirm-send-reset"
            >
              {isSendingReset ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Send Reset Email
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={adminPasswordDialog.open} onOpenChange={open => {
        if (!open) {
          setAdminPasswordDialog({ open: false });
          setNewPassword('');
          setConfirmPassword('');
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set User Password</DialogTitle>
            <DialogDescription>
              Directly set a new password for this user. This will work for both email/password and OAuth accounts.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarImage src={adminPasswordDialog.user?.avatar} />
                <AvatarFallback className="bg-primary/10 text-primary">
                  {adminPasswordDialog.user?.name ? getInitials(adminPasswordDialog.user.name) : <UserIcon className="h-4 w-4" />}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{adminPasswordDialog.user?.name}</p>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {adminPasswordDialog.user?.email}
                </p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">New Password</label>
                <Input
                  type="password"
                  placeholder="Enter new password (min 6 characters)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  data-testid="input-new-password"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Confirm Password</label>
                <Input
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  data-testid="input-confirm-password"
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              After setting the password, the user can log in using their email and this new password.
            </p>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setAdminPasswordDialog({ open: false });
                setNewPassword('');
                setConfirmPassword('');
              }}
              disabled={isChangingPassword}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleAdminPasswordChange}
              disabled={isChangingPassword || !newPassword || !confirmPassword}
              data-testid="button-confirm-change-password"
            >
              {isChangingPassword ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Changing...
                </>
              ) : (
                <>
                  <KeyRound className="h-4 w-4 mr-2" />
                  Set Password
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Users;
