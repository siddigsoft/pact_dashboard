import { useState, useEffect, useMemo } from 'react';
import { useUser } from '@/context/user/UserContext';
import { User } from '@/types';
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
  RefreshCw,
  Loader2,
  Users as UsersIcon,
  CheckCircle,
  KeyRound,
  Mail,
  MoreHorizontal,
  Trash2,
  UserX,
  Eye,
  Settings,
  AlertCircle
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useRoleManagement } from '@/context/role-management/RoleManagementContext';
import { useAppContext } from '@/context/AppContext';
import UserClassificationBadge from '@/components/user/UserClassificationBadge';
import RoleBadge from '@/components/user/RoleBadge';

const Users = () => {
  const { currentUser, users, approveUser, rejectUser, refreshUsers, sendPasswordRecoveryEmail } = useUser();
  const { roles: allRoles, getUserRolesByUserId } = useRoleManagement();
  const { canManageRoles } = useAuthorization();
  const { toast } = useToast();
  const { roles } = useAppContext();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isLoadingApproval, setIsLoadingApproval] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  
  const [passwordResetDialog, setPasswordResetDialog] = useState<{ open: boolean; user?: User }>({ open: false });
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [adminPasswordDialog, setAdminPasswordDialog] = useState<{ open: boolean; user?: User }>({ open: false });
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; userId?: string; action?: 'delete' | 'deactivate' }>({ open: false });

  const primaryRole = currentUser?.role?.toLowerCase() || '';
  const isAdminOrICT = 
    (roles || []).includes('admin' as any) || 
    (roles || []).includes('ict' as any) || 
    (roles || []).includes('superAdmin' as any) ||
    primaryRole === 'admin' ||
    primaryRole === 'ict' ||
    primaryRole === 'superadmin';

  const getInitials = (name: string | undefined | null): string => {
    if (!name || typeof name !== 'string') return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getPrimaryRoleLabel = (user: User): string => {
    if (!user?.id) return user?.role || 'unknown';
    const urs = getUserRolesByUserId(user.id) ?? [];
    if (!Array.isArray(urs) || urs.length === 0) return user.role || 'unknown';
    const sys = urs.find(ur => ur && !!ur.role);
    if (sys?.role) return sys.role as string;
    const custom = urs.find(ur => ur && !!ur.role_id);
    if (custom?.role_id) {
      const r = allRoles.find(rr => rr.id === custom.role_id);
      return r?.display_name || r?.name || 'custom';
    }
    return user.role || 'unknown';
  };

  // Check if user is a Google OAuth user (no password set)
  const isGoogleAuthUser = (user: User): boolean => {
    // Check provider metadata if available
    if ((user as any).provider === 'google') return true;
    if ((user as any).auth_provider === 'google') return true;
    if ((user as any).identities?.some((i: any) => i.provider === 'google')) return true;
    // Check app metadata
    if ((user as any).app_metadata?.provider === 'google') return true;
    if ((user as any).user_metadata?.provider === 'google') return true;
    return false;
  };

  // Get auth method label for display
  const getAuthMethod = (user: User): 'email' | 'google' => {
    return isGoogleAuthUser(user) ? 'google' : 'email';
  };

  // Statistics
  const stats = useMemo(() => {
    const pending = users.filter(u => !u.isApproved);
    const approved = users.filter(u => u.isApproved);
    const admins = users.filter(u => 
      u.role === 'admin' || 
      (u.roles && Array.isArray(u.roles) && u.roles.includes('admin' as any))
    );
    return {
      total: users.length,
      pending: pending.length,
      approved: approved.length,
      admins: admins.length
    };
  }, [users]);

  // Filtered users based on tab and filters
  const filteredUsers = useMemo(() => {
    let result = [...users];
    
    // Tab filter
    if (activeTab === 'pending') {
      result = result.filter(u => !u.isApproved);
    } else if (activeTab === 'approved') {
      result = result.filter(u => u.isApproved);
    } else if (activeTab === 'admins') {
      result = result.filter(u => 
        u.role === 'admin' || 
        (u.roles && Array.isArray(u.roles) && u.roles.includes('admin' as any))
      );
    }
    
    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(u => 
        (u.name && u.name.toLowerCase().includes(query)) ||
        (u.email && u.email.toLowerCase().includes(query)) ||
        (u.role && u.role.toLowerCase().includes(query))
      );
    }
    
    // Role filter
    if (roleFilter !== 'all') {
      result = result.filter(u => getPrimaryRoleLabel(u).toLowerCase() === roleFilter.toLowerCase());
    }
    
    // Status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'approved') {
        result = result.filter(u => u.isApproved);
      } else if (statusFilter === 'pending') {
        result = result.filter(u => !u.isApproved);
      }
    }
    
    // Exclude current user
    if (currentUser) {
      result = result.filter(u => u.id !== currentUser.id);
    }
    
    return result;
  }, [users, activeTab, searchQuery, roleFilter, statusFilter, currentUser]);

  // Get unique roles for filter
  const availableRoles = useMemo(() => {
    const rolesSet = new Set<string>();
    users.forEach(u => {
      const role = getPrimaryRoleLabel(u);
      if (role && role !== 'unknown') rolesSet.add(role);
    });
    return Array.from(rolesSet).sort();
  }, [users]);

  const handleRefreshUsers = async () => {
    setIsRefreshing(true);
    try {
      await refreshUsers();
      toast({ title: "Users refreshed", description: "User list synchronized successfully" });
    } catch (err) {
      toast({ title: "Refresh failed", description: "Could not refresh users", variant: "destructive" });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleApproveUser = async (userId: string) => {
    setIsLoadingApproval(userId);
    try {
      await approveUser(userId);
      toast({ title: "User approved", description: "User has been approved successfully" });
    } catch (error) {
      toast({ title: "Approval failed", description: "Could not approve user", variant: "destructive" });
    } finally {
      setIsLoadingApproval(null);
    }
  };

  const handleRejectUser = async (userId: string) => {
    setIsLoadingApproval(userId);
    try {
      await rejectUser(userId);
      toast({ title: "User rejected", description: "User has been rejected" });
    } catch (error) {
      toast({ title: "Rejection failed", description: "Could not reject user", variant: "destructive" });
    } finally {
      setIsLoadingApproval(null);
    }
  };

  const handleOpenPasswordReset = (user: User) => {
    setPasswordResetDialog({ open: true, user });
  };

  const handleSendPasswordReset = async () => {
    if (!passwordResetDialog.user?.email) return;
    setIsSendingReset(true);
    try {
      await sendPasswordRecoveryEmail(passwordResetDialog.user.email);
      toast({ title: "Reset email sent", description: `Password reset email sent to ${passwordResetDialog.user.email}` });
      setPasswordResetDialog({ open: false });
    } catch (error: any) {
      toast({ title: "Failed to send reset email", description: error.message, variant: "destructive" });
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
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: "Password too short", description: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    setIsChangingPassword(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-change-password', {
        body: { userId: adminPasswordDialog.user.id, newPassword }
      });
      if (error) throw error;
      if (data?.success) {
        toast({ title: "Password changed", description: `Password updated for ${adminPasswordDialog.user.name || adminPasswordDialog.user.email}` });
        setAdminPasswordDialog({ open: false });
        setNewPassword('');
        setConfirmPassword('');
      } else {
        throw new Error(data?.error || 'Failed to change password');
      }
    } catch (error: any) {
      toast({ title: "Failed to change password", description: error.message, variant: "destructive" });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleDelete = async (userId: string) => {
    setConfirmDialog({ open: true, userId, action: 'delete' });
  };

  const handleDeactivate = async (userId: string) => {
    setConfirmDialog({ open: true, userId, action: 'deactivate' });
  };

  const executeAction = async () => {
    if (!confirmDialog.userId) return;
    setDeletingUserId(confirmDialog.userId);
    try {
      if (confirmDialog.action === 'delete') {
        const { error } = await supabase.from('profiles').delete().eq('id', confirmDialog.userId);
        if (error) throw error;
        toast({ title: "User deleted", description: "User has been permanently deleted" });
      } else {
        const { error } = await supabase.from('profiles').update({ is_active: false }).eq('id', confirmDialog.userId);
        if (error) throw error;
        toast({ title: "User deactivated", description: "User has been deactivated" });
      }
      await refreshUsers();
    } catch (error: any) {
      toast({ title: "Action failed", description: error.message, variant: "destructive" });
    } finally {
      setDeletingUserId(null);
      setConfirmDialog({ open: false });
    }
  };

  const getActiveStatus = (user: User) => {
    if (!user.lastActive) return '-';
    const lastActiveDate = new Date(user.lastActive);
    const now = new Date();
    const minutes = Math.round((now.getTime() - lastActiveDate.getTime()) / 60000);
    if (minutes < 5) return 'Online';
    if (minutes < 60) return `${minutes}m ago`;
    if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
    return `${Math.round(minutes / 1440)}d ago`;
  };

  const UserRow = ({ user }: { user: User }) => {
    const canManageRolesUI = canManageRoles();
    const activeStatus = getActiveStatus(user);
    const isOnline = activeStatus === 'Online';

    return (
      <TableRow className="group" data-testid={`row-user-${user.id}`}>
        <TableCell>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Avatar className="h-9 w-9">
                <AvatarImage src={user.avatar} />
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                  {getInitials(user.name)}
                </AvatarFallback>
              </Avatar>
              {isOnline && (
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-background" />
              )}
            </div>
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{user.name || 'Unnamed User'}</p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1.5">
            <RoleBadge role={getPrimaryRoleLabel(user)} size="sm" />
            <UserClassificationBadge userId={user.id} compact />
          </div>
        </TableCell>
        <TableCell className="hidden md:table-cell">
          {user.isApproved ? (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
              <CheckCircle className="h-3 w-3 mr-1" />
              Active
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800">
              <Clock className="h-3 w-3 mr-1" />
              Pending
            </Badge>
          )}
        </TableCell>
        <TableCell className="hidden lg:table-cell">
          <span className="text-xs text-muted-foreground">{activeStatus}</span>
        </TableCell>
        <TableCell>
          <div className="flex items-center justify-end gap-1">
            {!user.isApproved && isAdminOrICT && (
              <>
                <Button 
                  variant="default" 
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => handleApproveUser(user.id)}
                  disabled={isLoadingApproval === user.id}
                  data-testid={`button-approve-${user.id}`}
                >
                  {isLoadingApproval === user.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => handleRejectUser(user.id)}
                  disabled={isLoadingApproval === user.id}
                  data-testid={`button-reject-${user.id}`}
                >
                  <X className="h-3 w-3" />
                </Button>
              </>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" asChild data-testid={`button-view-${user.id}`}>
              <Link to={`/users/${user.id}`}>
                <Eye className="h-4 w-4" />
              </Link>
            </Button>
            {(isAdminOrICT || canManageRolesUI) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" data-testid={`button-menu-${user.id}`}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem asChild>
                    <Link to={`/users/${user.id}`} className="flex items-center">
                      <UserCog className="h-4 w-4 mr-2" />
                      View Profile
                    </Link>
                  </DropdownMenuItem>
                  {canManageRolesUI && (
                    <DropdownMenuItem asChild>
                      <Link to="/role-management" className="flex items-center">
                        <Shield className="h-4 w-4 mr-2" />
                        Manage Roles
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {isAdminOrICT && (
                    <>
                      <DropdownMenuSeparator />
                      {isGoogleAuthUser(user) ? (
                        <DropdownMenuItem disabled className="text-muted-foreground">
                          <Mail className="h-4 w-4 mr-2" />
                          Google Auth (No Password)
                        </DropdownMenuItem>
                      ) : (
                        <>
                          <DropdownMenuItem onClick={() => handleOpenPasswordReset(user)}>
                            <Mail className="h-4 w-4 mr-2" />
                            Send Reset Email
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleOpenAdminPasswordChange(user)}>
                            <KeyRound className="h-4 w-4 mr-2" />
                            Set New Password
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleDeactivate(user.id)} disabled={deletingUserId === user.id}>
                        <UserX className="h-4 w-4 mr-2" />
                        Deactivate
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => handleDelete(user.id)} 
                        disabled={deletingUserId === user.id}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete User
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 p-4 border-b bg-background sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <UsersIcon className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">User Management</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={handleRefreshUsers}
            disabled={isRefreshing}
            data-testid="button-refresh"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
          {isAdminOrICT && (
            <Button size="sm" asChild data-testid="button-add-user">
              <Link to="/register">
                <UserPlus className="h-4 w-4 mr-1" />
                Add User
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <UsersIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Total Users</span>
          </div>
          <p className="text-2xl font-bold mt-1">{stats.total}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span className="text-sm text-muted-foreground">Active</span>
          </div>
          <p className="text-2xl font-bold mt-1 text-green-600">{stats.approved}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-600" />
            <span className="text-sm text-muted-foreground">Pending</span>
          </div>
          <p className="text-2xl font-bold mt-1 text-amber-600">{stats.pending}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span className="text-sm text-muted-foreground">Admins</span>
          </div>
          <p className="text-2xl font-bold mt-1">{stats.admins}</p>
        </Card>
      </div>

      {/* Tabs Navigation */}
      <div className="px-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
            <TabsList className="h-9">
              <TabsTrigger value="all" className="text-xs px-3" data-testid="tab-all">
                All Users
              </TabsTrigger>
              <TabsTrigger value="approved" className="text-xs px-3" data-testid="tab-approved">
                Active
              </TabsTrigger>
              <TabsTrigger value="pending" className="text-xs px-3" data-testid="tab-pending">
                Pending
                {stats.pending > 0 && (
                  <Badge variant="destructive" className="ml-1.5 h-4 px-1 text-[10px]">{stats.pending}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="admins" className="text-xs px-3" data-testid="tab-admins">
                Admins
              </TabsTrigger>
            </TabsList>

            {/* Search and Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[180px] max-w-[280px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search users..."
                  className="pl-8 h-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="input-search"
                />
              </div>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="h-9 w-[130px]" data-testid="select-role">
                  <SelectValue placeholder="All Roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {availableRoles.map(role => (
                    <SelectItem key={role} value={role}>{role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(searchQuery || roleFilter !== 'all') && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => { setSearchQuery(''); setRoleFilter('all'); }}
                  data-testid="button-clear-filters"
                >
                  <X className="h-3 w-3 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </div>

          {/* Users Table */}
          <TabsContent value={activeTab} className="mt-0">
            {users.length === 0 ? (
              <Card className="p-8">
                <div className="flex flex-col items-center justify-center text-center">
                  <AlertCircle className="h-10 w-10 text-muted-foreground mb-3" />
                  <h3 className="font-medium mb-1">No users found</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Click refresh to sync users from the database
                  </p>
                  <Button onClick={handleRefreshUsers} disabled={isRefreshing}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                    Refresh Users
                  </Button>
                </div>
              </Card>
            ) : filteredUsers.length === 0 ? (
              <Card className="p-8">
                <div className="flex flex-col items-center justify-center text-center">
                  <Search className="h-10 w-10 text-muted-foreground mb-3" />
                  <h3 className="font-medium mb-1">No matches found</h3>
                  <p className="text-sm text-muted-foreground">
                    Try adjusting your search or filters
                  </p>
                </div>
              </Card>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">User</TableHead>
                      <TableHead className="font-medium">Role</TableHead>
                      <TableHead className="font-medium hidden md:table-cell">Status</TableHead>
                      <TableHead className="font-medium hidden lg:table-cell">Last Active</TableHead>
                      <TableHead className="font-medium text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map(user => (
                      <UserRow key={user.id} user={user} />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Quick Links */}
      {isAdminOrICT && (
        <div className="p-4 mt-auto border-t">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground mr-2">Quick Links:</span>
            <Button variant="outline" size="sm" asChild data-testid="link-role-management">
              <Link to="/role-management">
                <Shield className="h-3.5 w-3.5 mr-1" />
                Role Management
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild data-testid="link-audit-logs">
              <Link to="/audit-logs">
                <Settings className="h-3.5 w-3.5 mr-1" />
                Audit Logs
              </Link>
            </Button>
          </div>
        </div>
      )}

      {/* Password Reset Dialog */}
      <Dialog open={passwordResetDialog.open} onOpenChange={(open) => setPasswordResetDialog({ open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Password Reset</DialogTitle>
            <DialogDescription>
              Send a password reset email to {passwordResetDialog.user?.email}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleSendPasswordReset} disabled={isSendingReset}>
              {isSendingReset ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
              Send Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin Password Change Dialog */}
      <Dialog open={adminPasswordDialog.open} onOpenChange={(open) => setAdminPasswordDialog({ open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set New Password</DialogTitle>
            <DialogDescription>
              Set a new password for {adminPasswordDialog.user?.name || adminPasswordDialog.user?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">New Password</label>
              <Input 
                type="password" 
                value={newPassword} 
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                className="mt-1"
                data-testid="input-new-password"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Confirm Password</label>
              <Input 
                type="password" 
                value={confirmPassword} 
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                className="mt-1"
                data-testid="input-confirm-password"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleAdminPasswordChange} disabled={isChangingPassword || !newPassword}>
              {isChangingPassword ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <KeyRound className="h-4 w-4 mr-2" />}
              Set Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Action Dialog */}
      <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog({ ...confirmDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmDialog.action === 'delete' ? 'Delete User' : 'Deactivate User'}
            </DialogTitle>
            <DialogDescription>
              {confirmDialog.action === 'delete' 
                ? 'This will permanently delete the user. This action cannot be undone.'
                : 'This will deactivate the user account. They will not be able to log in.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button 
              variant={confirmDialog.action === 'delete' ? 'destructive' : 'default'} 
              onClick={executeAction}
              disabled={deletingUserId !== null}
            >
              {deletingUserId ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {confirmDialog.action === 'delete' ? 'Delete' : 'Deactivate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Users;
