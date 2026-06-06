import { useState, useEffect, useMemo } from 'react';
import { isProtectedOwner } from '@/lib/protected-accounts';
import { AdminRoleConfirmDialog } from '@/components/ui/AdminRoleConfirmDialog';
import { useUser } from '@/context/user/UserContext';
import { useProjectContext } from '@/context/project/ProjectContext';
import { User } from '@/types';
import { Project, ProjectRole, ProjectTeamMember } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useDebounce } from '@/hooks/useDebounce';
import { TableSkeleton } from '@/components/ui/skeletons';
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
import { Link, Navigate } from 'react-router-dom';
import { useAuthorization } from '@/hooks/use-authorization';
import { toDisplayLabel, VISIBLE_ROLE_CODES, normalizeRole } from '@/utils/roleMapping';
import { sudanStates } from '@/data/sudanStates';
import { useApproval } from '@/context/approval/ApprovalContext';
import { supabase } from '@/integrations/supabase/client';
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
  AlertCircle,
  FolderPlus,
  Briefcase,
  Copy,
  Info,
  TriangleAlert,
  UserCheck,
  Edit2,
  MessageSquare as MessageIcon,
  Calendar as CalendarIcon,
  MapPin
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
import { ensureValidSession } from '@/lib/session-health';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useRoleManagement } from '@/context/role-management/RoleManagementContext';
import { useAppContextSelector } from '@/context/AppContext';
import UserClassificationBadge from '@/components/user/UserClassificationBadge';
import RoleBadge from '@/components/user/RoleBadge';

const STATE_ID_TO_NAME = new Map(sudanStates.map(s => [s.id, s.name]));

const Users = () => {
  const { currentUser, users, approveUser, rejectUser, refreshUsers, sendPasswordRecoveryEmail } = useUser();
  const { roles: allRoles, getUserRolesByUserId } = useRoleManagement();
  const { projects, updateProjectTeam, fetchProjects } = useProjectContext();
  const { canManageRoles } = useAuthorization();
  const { toast } = useToast();
  const roles = useAppContextSelector((c) => c.roles);
  
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isLoadingApproval, setIsLoadingApproval] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  
  const [passwordResetDialog, setPasswordResetDialog] = useState<{ open: boolean; user?: User }>({ open: false });
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [adminPasswordDialog, setAdminPasswordDialog] = useState<{ open: boolean; user?: User }>({ open: false });
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; userId?: string; action?: 'delete' | 'deactivate' }>({ open: false });
  
  const [addToProjectDialog, setAddToProjectDialog] = useState<{ open: boolean; user?: User }>({ open: false });
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedProjectRole, setSelectedProjectRole] = useState<ProjectRole>('dataCollector');
  const [isAddingToProject, setIsAddingToProject] = useState(false);

  const [activateWithRoleDialog, setActivateWithRoleDialog] = useState<{ open: boolean; user?: User; selectedRole?: string }>({ open: false });
  const [isActivatingWithRole, setIsActivatingWithRole] = useState(false);
  const [usersAdminOtpOpen, setUsersAdminOtpOpen] = useState(false);
  const [rejectWithReasonDialog, setRejectWithReasonDialog] = useState<{ open: boolean; userId?: string; userName?: string }>({ open: false });
  const [rejectionReason, setRejectionReason] = useState('');
  const [isRejectingWithReason, setIsRejectingWithReason] = useState(false);

  const [notifLevelDialog, setNotifLevelDialog] = useState<{ open: boolean; user?: User; level?: string }>({ open: false });
  const [isSavingNotifLevel, setIsSavingNotifLevel] = useState(false);

  const primaryRole = currentUser?.role?.toLowerCase() || '';
  const isAdminOrICT = 
    (roles || []).includes('admin' as any) || 
    (roles || []).includes('ict' as any) || 
    (roles || []).includes('superAdmin' as any) ||
    primaryRole === 'admin' ||
    primaryRole === 'ict' ||
    primaryRole === 'superadmin';

  const isSuperAdminUser =
    primaryRole === 'superadmin' ||
    primaryRole === 'super_admin' ||
    currentUser?.role === 'superAdmin' ||
    currentUser?.role === 'SuperAdmin';

  if (!isAdminOrICT && !canManageRoles()) {
    return <Navigate to="/dashboard" replace />;
  }

  const getInitials = (name: string | undefined | null): string => {
    if (!name || typeof name !== 'string') return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getPrimaryRoleLabel = (user: User): string => {
    if (!user?.id) return toDisplayLabel(user?.role || 'unknown');
    const urs = getUserRolesByUserId(user.id) ?? [];
    if (!Array.isArray(urs) || urs.length === 0) return toDisplayLabel(user.role || 'unknown');
    const sys = urs.find(ur => ur && !!ur.role);
    if (sys?.role) return toDisplayLabel(sys.role as string);
    const custom = urs.find(ur => ur && !!ur.role_id);
    if (custom?.role_id) {
      const r = allRoles.find(rr => rr.id === custom.role_id);
      return r?.display_name || r?.name || 'custom';
    }
    return toDisplayLabel(user.role || 'unknown');
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

  // Roles that qualify as "admin" for tab/stat purposes
  const ADMIN_ROLE_VARIANTS = [
    'admin', 'Admin', 'Administrator', 'administrator',
    'super_admin', 'superAdmin', 'SuperAdmin', 'super admin',
  ];
  const isAdminRole = (u: User) =>
    ADMIN_ROLE_VARIANTS.includes(u.role ?? '') ||
    (u.roles && Array.isArray(u.roles) && u.roles.some(r => ADMIN_ROLE_VARIANTS.includes(r as string)));

  // Statistics — "pending" means awaiting review (not rejected/inactive/approved)
  const stats = useMemo(() => {
    const pending = users.filter(u =>
      !u.isApproved &&
      u.profileStatus !== 'rejected' &&
      u.profileStatus !== 'inactive'
    );
    const approved = users.filter(u => u.isApproved);
    const admins = users.filter(isAdminRole);
    return {
      total: users.length,
      pending: pending.length,
      approved: approved.length,
      admins: admins.length
    };
  }, [users]);

  // Detect duplicate emails — group users that share the same email address
  const duplicateGroups = useMemo(() => {
    const emailMap: Record<string, User[]> = {};
    users.forEach(u => {
      if (!u.email) return;
      const key = u.email.toLowerCase().trim();
      if (!emailMap[key]) emailMap[key] = [];
      emailMap[key].push(u);
    });
    return Object.entries(emailMap)
      .filter(([, group]) => group.length > 1)
      .map(([email, group]) => ({ email, users: group }))
      .sort((a, b) => b.users.length - a.users.length);
  }, [users]);

  // Set of all IDs that are part of a duplicate group — used to highlight rows
  const duplicateIds = useMemo(() => {
    const ids = new Set<string>();
    duplicateGroups.forEach(g => g.users.forEach(u => ids.add(u.id)));
    return ids;
  }, [duplicateGroups]);

  // Filtered users based on tab and filters
  const filteredUsers = useMemo(() => {
    let result = [...users];
    
    // Tab filter
    if (activeTab === 'pending') {
      result = result.filter(u => !u.isApproved);
    } else if (activeTab === 'approved') {
      result = result.filter(u => u.isApproved);
    } else if (activeTab === 'admins') {
      result = result.filter(isAdminRole);
    }
    
    // Search filter (using debounced value for performance)
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase();
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
  }, [users, activeTab, debouncedSearchQuery, roleFilter, statusFilter, currentUser]);

  // Track initial load state - set to false after a short delay to handle empty datasets
  useEffect(() => {
    if (users.length > 0) {
      setIsInitialLoad(false);
    } else {
      // Even if users array is empty, stop showing skeleton after 2 seconds
      const timer = setTimeout(() => setIsInitialLoad(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [users]);

  // Fetch projects on mount for the add to project dialog
  useEffect(() => {
    if (projects.length === 0) {
      fetchProjects();
    }
  }, []);

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
      
      const approvedUser = users.find(u => u.id === userId);
      if (approvedUser && projects.length > 0) {
        setAddToProjectDialog({ open: true, user: approvedUser });
        setSelectedProjectId('');
        setSelectedProjectRole('dataCollector');
      }
    } catch (error) {
      toast({ title: "Approval failed", description: "Could not approve user", variant: "destructive" });
    } finally {
      setIsLoadingApproval(null);
    }
  };

  const handleAddToProject = async () => {
    if (!addToProjectDialog.user || !selectedProjectId) return;
    
    const project = projects.find(p => p.id === selectedProjectId);
    if (!project) {
      toast({ title: "Project not found", variant: "destructive" });
      return;
    }
    
    setIsAddingToProject(true);
    try {
      const newMember: ProjectTeamMember = {
        userId: addToProjectDialog.user.id,
        name: addToProjectDialog.user.name || addToProjectDialog.user.email || 'Unknown',
        role: selectedProjectRole,
        joinedAt: new Date().toISOString(),
        assignedActivities: [],
        workload: 0
      };
      
      const existingTeam = project.team?.teamComposition || [];
      const isAlreadyMember = existingTeam.some(m => m.userId === addToProjectDialog.user!.id);
      
      if (isAlreadyMember) {
        toast({ title: "Already a member", description: "This user is already part of this project team" });
        setAddToProjectDialog({ open: false });
        return;
      }
      
      const updatedTeam = {
        ...project.team,
        teamComposition: [...existingTeam, newMember]
      };
      
      await updateProjectTeam(project.id, updatedTeam);
      
      toast({ 
        title: "Added to project", 
        description: `${addToProjectDialog.user.name || 'User'} has been added to ${project.name}` 
      });
      setAddToProjectDialog({ open: false });
    } catch (error) {
      toast({ title: "Failed to add to project", description: "Could not add user to project team", variant: "destructive" });
    } finally {
      setIsAddingToProject(false);
    }
  };

  const projectRoleOptions: { value: ProjectRole; label: string }[] = [
    { value: 'projectManager', label: 'Project Manager' },
    { value: 'fieldAssistant', label: 'Field Assistant' },
    { value: 'dataCollector', label: 'Data Collector' },
    { value: 'supervisor', label: 'Supervisor' },
    { value: 'coordinator', label: 'Coordinator' },
    { value: 'analyst', label: 'Analyst' },
    { value: 'reviewer', label: 'Reviewer' },
    { value: 'other', label: 'Other' }
  ];

  const activeProjects = useMemo(() => {
    return projects.filter(p => p.status === 'active' || p.status === 'draft');
  }, [projects]);

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

  const handleActivateWithRole = async () => {
    if (!activateWithRoleDialog.user) return;
    const { user, selectedRole } = activateWithRoleDialog;
    if (isProtectedOwner(user.id)) {
      toast({ title: 'Protected Account', description: 'This account role cannot be changed.', variant: 'destructive' });
      setActivateWithRoleDialog({ open: false });
      return;
    }
    setIsActivatingWithRole(true);
    try {
      const roleChanged = selectedRole && selectedRole !== user.role;
      if (roleChanged) {
        const { error: roleError } = await supabase
          .from('profiles')
          .update({ role: selectedRole })
          .eq('id', user.id);
        if (roleError) {
          toast({
            title: "Role update failed",
            description: "Could not update user role before activation. Activation was not completed.",
            variant: "destructive",
          });
          return;
        }
      }
      const approved = await approveUser(user.id);
      if (!approved) {
        return;
      }
      toast({ title: "User activated", description: `${user.name || 'User'} has been activated${roleChanged ? ` as ${toDisplayLabel(selectedRole!)}` : ''}.` });
      setActivateWithRoleDialog({ open: false });
      if (projects.length > 0) {
        setAddToProjectDialog({ open: true, user });
        setSelectedProjectId('');
        setSelectedProjectRole('dataCollector');
      }
    } catch (error) {
      toast({ title: "Activation failed", description: "Could not activate user", variant: "destructive" });
    } finally {
      setIsActivatingWithRole(false);
    }
  };

  const handleRejectWithReason = async () => {
    if (!rejectWithReasonDialog.userId) return;
    const { userId, userName } = rejectWithReasonDialog;
    setIsRejectingWithReason(true);
    try {
      // Mark profile as rejected (soft reject) rather than deleting, so the notification persists
      // The profile gets status='rejected' so they cannot log in but we can retain the notification.
      // We .select('id') so we can detect when RLS silently blocks the update (no error, 0 rows).
      const { data: updated, error: statusError } = await supabase
        .from('profiles')
        .update({ status: 'rejected', is_active: false })
        .eq('id', userId)
        .select('id');

      const blockedByRls = !statusError && (!updated || updated.length === 0);
      const missingColumn = !!statusError && /column .* (does not exist|status)/i.test(statusError.message || '');

      if (missingColumn) {
        // Schema doesn't have the soft-reject columns yet — fall back to hard delete and trust its toast.
        const ok = await rejectUser(userId);
        if (ok) {
          toast({ title: "User rejected", description: `${userName || 'User'}'s registration has been rejected.` });
        }
        setRejectWithReasonDialog({ open: false });
        setRejectionReason('');
        return;
      }

      if (statusError || blockedByRls) {
        toast({
          title: "Rejection blocked by security policy",
          description: "Your role does not have permission to reject this user. Ask a Super Admin to update the Row Level Security policy on the profiles table to allow admins to UPDATE status/is_active.",
          variant: "destructive",
        });
        setRejectWithReasonDialog({ open: false });
        setRejectionReason('');
        return;
      }

      // Insert rejection notification with mandatory reason
      await supabase.from('notifications').insert({
        recipient_id: userId,
        title: 'Your registration was not approved',
        message: `Your account registration could not be approved at this time. Reason: ${rejectionReason.trim()}. Please contact your supervisor for more information.`,
        type: 'warning',
        category: 'account',
        priority: 'high',
        is_read: false,
        created_at: new Date().toISOString(),
      });

      // Refresh users list to remove rejected user from local state
      await handleRefreshUsers();
      localStorage.removeItem(`user-${userId}`);

      toast({ title: "User rejected", description: `${userName || 'User'}'s registration has been rejected and they have been notified.` });
      setRejectWithReasonDialog({ open: false });
      setRejectionReason('');
    } catch (error) {
      toast({ title: "Rejection failed", description: "Could not reject user", variant: "destructive" });
    } finally {
      setIsRejectingWithReason(false);
    }
  };

  const NOTIF_LEVELS = [
    { value: 'field',       label: 'Field Staff',   desc: 'Task & site-visit alerts only' },
    { value: 'coordinator', label: 'Coordinator',   desc: '+ Coverage, MMP & dispatch alerts' },
    { value: 'manager',     label: 'Manager',       desc: '+ Team, leave & timesheet approvals' },
    { value: 'director',    label: 'Director',      desc: '+ Budget, project & financial alerts' },
    { value: 'executive',   label: 'Executive',     desc: '+ Strategic & all operational alerts' },
    { value: 'system',      label: 'System (IT)',   desc: 'Everything including system events' },
  ] as const;

  const handleSaveNotifLevel = async () => {
    if (!notifLevelDialog.user || !notifLevelDialog.level) return;
    setIsSavingNotifLevel(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ notification_level: notifLevelDialog.level })
        .eq('id', notifLevelDialog.user.id);
      if (error) throw error;
      toast({
        title: 'Notification level updated',
        description: `${notifLevelDialog.user.name}'s notification level set to ${NOTIF_LEVELS.find(l => l.value === notifLevelDialog.level)?.label}.`,
      });
      setNotifLevelDialog({ open: false });
      await refreshUsers();
    } catch (e: any) {
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    } finally {
      setIsSavingNotifLevel(false);
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
      const { data, error } = await supabase.rpc('admin_change_user_password', {
        target_user_id: adminPasswordDialog.user.id,
        new_password: newPassword
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
    const session = await ensureValidSession();
    if (!session.success) return;
    setDeletingUserId(confirmDialog.userId);
    try {
      if (confirmDialog.action === 'delete') {
        // Delete related records first to avoid foreign key constraint violations
        // Delete notifications where user is the recipient
        await supabase.from('notifications').delete().eq('recipient_id', confirmDialog.userId);
        // Delete notifications triggered by the user
        await supabase.from('notifications').delete().eq('triggered_by', confirmDialog.userId);
        
        // Now delete the profile
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

  const UserRow = ({ user, highlightDuplicate = false }: { user: User; highlightDuplicate?: boolean }) => {
    const canManageRolesUI = canManageRoles();
    const activeStatus = getActiveStatus(user);
    const isOnline = activeStatus === 'Online';
    const isDupe = highlightDuplicate || duplicateIds.has(user.id);

    return (
      <TableRow
        className={`group hover:bg-muted/40 transition-colors ${isDupe ? 'bg-orange-50/60 dark:bg-orange-950/20' : ''}`}
        data-testid={`row-user-${user.id}`}
      >
        <TableCell className="py-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Avatar className="h-10 w-10 ring-2 ring-background shadow-sm">
                <AvatarImage src={user.avatar} />
                <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/5 text-primary text-sm font-semibold">
                  {getInitials(user.name)}
                </AvatarFallback>
              </Avatar>
              {isOnline && (
                <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 border-2 border-background ring-1 ring-green-400/30" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="font-semibold text-sm truncate leading-tight">{user.name || 'Unnamed User'}</p>
                {isDupe && (
                  <span title="Duplicate email" className="shrink-0">
                    <TriangleAlert className="h-3.5 w-3.5 text-orange-500" />
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate mt-0.5">{user.email}</p>
            </div>
          </div>
        </TableCell>
        <TableCell className="py-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <RoleBadge role={getPrimaryRoleLabel(user)} size="sm" />
            <UserClassificationBadge userId={user.id} compact />
          </div>
          {user.stateId && STATE_ID_TO_NAME.has(user.stateId) && (
            <div className="flex items-center gap-1 mt-1">
              <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-[11px] text-muted-foreground leading-tight">{STATE_ID_TO_NAME.get(user.stateId)}</span>
            </div>
          )}
        </TableCell>
        <TableCell className="hidden md:table-cell py-3">
          {user.isApproved ? (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 font-medium">
              <CheckCircle className="h-3 w-3 mr-1" />
              Active
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800 font-medium">
              <Clock className="h-3 w-3 mr-1" />
              Pending
            </Badge>
          )}
        </TableCell>
        <TableCell className="hidden lg:table-cell py-3">
          <span className={`text-xs font-medium ${isOnline ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>{activeStatus}</span>
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
                  {isSuperAdminUser && (
                    <DropdownMenuItem
                      onClick={() => setNotifLevelDialog({ open: true, user, level: (user as any).notification_level || 'coordinator' })}
                      data-testid={`button-notif-level-${user.id}`}
                    >
                      <Settings className="h-4 w-4 mr-2" />
                      Set Notification Level
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
      <div className="flex items-center justify-between gap-4 px-4 sm:px-6 py-4 border-b bg-gradient-to-r from-background to-muted/30 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <UsersIcon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight">User Management</h1>
            <p className="text-xs text-muted-foreground hidden sm:block">Manage team members, roles and permissions</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="icon"
            className="h-9 w-9 rounded-lg"
            onClick={handleRefreshUsers}
            disabled={isRefreshing}
            data-testid="button-refresh"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
          {isAdminOrICT && (
            <Button size="sm" className="h-9 px-4 shadow-sm" asChild data-testid="button-add-user">
              <Link to="/register">
                <UserPlus className="h-4 w-4 mr-1.5" />
                Add User
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-4 sm:px-6 py-4">
        <Card className="p-4 border-l-4 border-l-slate-400 dark:border-l-slate-600 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Users</p>
              <p className="text-2xl font-bold mt-1">{stats.total}</p>
            </div>
            <div className="p-2.5 rounded-full bg-slate-100 dark:bg-slate-800">
              <UsersIcon className="h-4 w-4 text-slate-600 dark:text-slate-400" />
            </div>
          </div>
        </Card>
        <Card className="p-4 border-l-4 border-l-green-500 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Active</p>
              <p className="text-2xl font-bold mt-1 text-green-600 dark:text-green-400">{stats.approved}</p>
            </div>
            <div className="p-2.5 rounded-full bg-green-100 dark:bg-green-900/30">
              <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </Card>
        <Card className="p-4 border-l-4 border-l-amber-500 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pending</p>
              <p className="text-2xl font-bold mt-1 text-amber-600 dark:text-amber-400">{stats.pending}</p>
            </div>
            <div className="p-2.5 rounded-full bg-amber-100 dark:bg-amber-900/30">
              <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
          </div>
        </Card>
        <Card className="p-4 border-l-4 border-l-primary hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Admins</p>
              <p className="text-2xl font-bold mt-1">{stats.admins}</p>
            </div>
            <div className="p-2.5 rounded-full bg-primary/10">
              <Shield className="h-4 w-4 text-primary" />
            </div>
          </div>
        </Card>
      </div>

      {/* Tabs Navigation */}
      <div className="px-4 sm:px-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
            <TabsList className="h-10 p-1 bg-muted/60 rounded-lg flex-wrap">
              <TabsTrigger value="all" className="text-xs sm:text-sm px-3 sm:px-4 rounded-md data-[state=active]:shadow-sm" data-testid="tab-all">
                All Users
              </TabsTrigger>
              <TabsTrigger value="approved" className="text-xs sm:text-sm px-3 sm:px-4 rounded-md data-[state=active]:shadow-sm" data-testid="tab-approved">
                Active
              </TabsTrigger>
              <TabsTrigger value="pending" className="text-xs sm:text-sm px-3 sm:px-4 rounded-md data-[state=active]:shadow-sm" data-testid="tab-pending">
                Pending
                {stats.pending > 0 && (
                  <Badge variant="destructive" className="ml-1.5 h-5 min-w-[20px] px-1.5 text-[10px] rounded-full">{stats.pending}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="admins" className="text-xs sm:text-sm px-3 sm:px-4 rounded-md data-[state=active]:shadow-sm" data-testid="tab-admins">
                Admins
              </TabsTrigger>
              <TabsTrigger value="duplicates" className="text-xs sm:text-sm px-3 sm:px-4 rounded-md data-[state=active]:shadow-sm data-[state=active]:bg-orange-600 data-[state=active]:text-white" data-testid="tab-duplicates">
                <TriangleAlert className="h-3.5 w-3.5 mr-1" />
                Duplicates
                {duplicateGroups.length > 0 && (
                  <Badge className="ml-1.5 h-5 min-w-[20px] px-1.5 text-[10px] rounded-full bg-orange-500 hover:bg-orange-500">{duplicateGroups.length}</Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Search and Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[180px] max-w-[280px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search users..."
                  className="pl-9 h-9 rounded-lg border-muted-foreground/20 focus-visible:ring-primary/30"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="input-search"
                />
              </div>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="h-9 w-[140px] rounded-lg" data-testid="select-role">
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
                  className="h-9 px-3 text-muted-foreground hover:text-foreground"
                  onClick={() => { setSearchQuery(''); setRoleFilter('all'); }}
                  data-testid="button-clear-filters"
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </div>

          {/* ── Duplicates Tab Content ── */}
          <TabsContent value="duplicates" className="mt-0">
            {/* Prevention guidance banner */}
            <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-4 py-3 mb-4 flex gap-3">
              <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div className="space-y-1 text-sm">
                <p className="font-semibold text-blue-800 dark:text-blue-300">How to prevent future duplicates</p>
                <ul className="text-blue-700 dark:text-blue-400 space-y-1 text-xs list-disc pl-4">
                  <li>Supabase Auth already enforces unique emails at sign-up — most duplicates in this list come from profiles created via direct database inserts or data migrations.</li>
                  <li>Enable <strong>Email Confirmation</strong> in your Supabase Auth settings so every new sign-up must verify their email before a profile is created.</li>
                  <li>Never insert rows directly into the <code className="bg-blue-100 dark:bg-blue-900 rounded px-1">profiles</code> table without a matching auth user — use the Admin API or the registration flow.</li>
                  <li>To clean up: keep the account the user actively logs in with, then delete the other one below.</li>
                </ul>
              </div>
            </div>

            {duplicateGroups.length === 0 ? (
              <Card className="p-10">
                <div className="flex flex-col items-center justify-center text-center gap-3">
                  <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-4">
                    <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                  </div>
                  <h3 className="font-semibold text-base">No duplicate emails found</h3>
                  <p className="text-sm text-muted-foreground">Every email address in the system is unique.</p>
                </div>
              </Card>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-orange-600 dark:text-orange-400">{duplicateGroups.length} email address{duplicateGroups.length !== 1 ? 'es' : ''}</span> shared by multiple accounts.
                  Delete the account you do not need — the other will remain intact.
                </p>
                {duplicateGroups.map(({ email, users: groupUsers }) => (
                  <Card key={email} className="overflow-hidden border-orange-200 dark:border-orange-800">
                    {/* Group header */}
                    <div className="flex items-center gap-3 px-4 py-3 bg-orange-50 dark:bg-orange-950/30 border-b border-orange-200 dark:border-orange-800">
                      <TriangleAlert className="h-4 w-4 text-orange-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-orange-800 dark:text-orange-300 truncate">{email}</p>
                        <p className="text-xs text-orange-600 dark:text-orange-400">{groupUsers.length} accounts share this email</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => { navigator.clipboard.writeText(email); toast({ title: 'Email copied' }); }}
                        className="text-orange-400 hover:text-orange-600 dark:hover:text-orange-300 transition-colors"
                        title="Copy email"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {/* Accounts in this group */}
                    <div className="divide-y dark:divide-border">
                      {groupUsers.map((u, idx) => {
                        const activeStatus = getActiveStatus(u);
                        const isOnline = activeStatus === 'Online';
                        return (
                          <div key={u.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors" data-testid={`row-dupe-${u.id}`}>
                            {/* Index indicator */}
                            <span className="shrink-0 w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 text-[11px] font-bold flex items-center justify-center">
                              {idx + 1}
                            </span>
                            {/* Avatar */}
                            <div className="relative shrink-0">
                              <Avatar className="h-9 w-9">
                                <AvatarImage src={u.avatar} />
                                <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/5 text-primary text-xs font-semibold">
                                  {getInitials(u.name)}
                                </AvatarFallback>
                              </Avatar>
                              {isOnline && <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-background" />}
                            </div>
                            {/* Info */}
                            <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-3 gap-1">
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{u.name || 'Unnamed'}</p>
                                <p className="text-[10px] text-muted-foreground font-mono truncate">{u.id.slice(0, 8)}…</p>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <RoleBadge role={getPrimaryRoleLabel(u)} size="sm" />
                                {u.isApproved
                                  ? <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 text-[10px] px-1.5 py-0"><CheckCircle className="h-2.5 w-2.5 mr-1" />Active</Badge>
                                  : <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 text-[10px] px-1.5 py-0"><Clock className="h-2.5 w-2.5 mr-1" />Pending</Badge>}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                <span className={isOnline ? 'text-green-600 dark:text-green-400 font-medium' : ''}>{activeStatus}</span>
                                <span className="text-muted-foreground/40 mx-1">·</span>
                                <span>{getAuthMethod(u) === 'google' ? 'Google Auth' : 'Email/Password'}</span>
                              </div>
                            </div>
                            {/* Actions */}
                            <div className="flex items-center gap-1 shrink-0">
                              <Button variant="ghost" size="icon" className="h-7 w-7" asChild title="View profile">
                                <Link to={`/users/${u.id}`}><Eye className="h-4 w-4" /></Link>
                              </Button>
                              {isAdminOrICT && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                                  onClick={() => handleDelete(u.id)}
                                  disabled={deletingUserId === u.id}
                                  title="Delete this account"
                                  data-testid={`button-delete-dupe-${u.id}`}
                                >
                                  {deletingUserId === u.id
                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    : <Trash2 className="h-3.5 w-3.5" />}
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Pending Activations Queue — enhanced view for pending tab */}
          <TabsContent value="pending" className="mt-0">
            {filteredUsers.filter(u => !u.isApproved && u.profileStatus !== 'rejected' && u.profileStatus !== 'inactive').length === 0 ? (
              <Card className="p-10">
                <div className="flex flex-col items-center justify-center text-center gap-3">
                  <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-4">
                    <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                  </div>
                  <h3 className="font-semibold text-base">No pending activations</h3>
                  <p className="text-sm text-muted-foreground">All registered users have been reviewed.</p>
                </div>
              </Card>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1 pb-1">
                  <CalendarIcon className="h-4 w-4 text-amber-600" />
                  <p className="text-sm text-muted-foreground">
                    <span className="font-semibold text-amber-700 dark:text-amber-400">{filteredUsers.filter(u => !u.isApproved && u.profileStatus !== 'rejected' && u.profileStatus !== 'inactive').length} user{filteredUsers.filter(u => !u.isApproved && u.profileStatus !== 'rejected' && u.profileStatus !== 'inactive').length !== 1 ? 's' : ''}</span> awaiting activation. Review each registration and approve, modify role, or reject.
                  </p>
                </div>
                {filteredUsers.filter(u => !u.isApproved && u.profileStatus !== 'rejected' && u.profileStatus !== 'inactive').map((user) => (
                  <Card key={user.id} className="overflow-hidden border-amber-200 dark:border-amber-800" data-testid={`card-pending-${user.id}`}>
                    <div className="flex flex-col md:flex-row md:items-center gap-4 p-4">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Avatar className="h-12 w-12 ring-2 ring-amber-200 dark:ring-amber-800 shrink-0">
                          <AvatarImage src={user.avatar} />
                          <AvatarFallback className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-semibold text-base">
                            {getInitials(user.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm">{user.name || 'Unnamed User'}</p>
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800 text-xs">
                              <Clock className="h-2.5 w-2.5 mr-1" /> Pending
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{user.email}</p>
                          {user.phone && (
                            <p className="text-xs text-muted-foreground mt-0.5">{user.phone}</p>
                          )}
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-muted-foreground">Requested role:</span>
                              <RoleBadge role={getPrimaryRoleLabel(user)} size="sm" />
                            </div>
                            {user.createdAt && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <CalendarIcon className="h-3 w-3" />
                                <span>Submitted {new Date(user.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                              </div>
                            )}
                          </div>
                          {user.hubId && (
                            <p className="text-xs text-muted-foreground mt-0.5">Hub: <span className="font-medium">{user.hubId}</span></p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-3 text-xs"
                          asChild
                          data-testid={`button-view-pending-${user.id}`}
                        >
                          <Link to={`/users/${user.id}`}>
                            <Eye className="h-3.5 w-3.5 mr-1" /> Profile
                          </Link>
                        </Button>
                        {isAdminOrICT && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-3 text-xs border-blue-200 text-blue-600 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400"
                              onClick={() => setActivateWithRoleDialog({ open: true, user, selectedRole: user.role })}
                              data-testid={`button-activate-role-${user.id}`}
                            >
                              <Edit2 className="h-3.5 w-3.5 mr-1" /> Activate & Modify Role
                            </Button>
                            <Button
                              variant="default"
                              size="sm"
                              className="h-8 px-3 text-xs"
                              onClick={() => handleApproveUser(user.id)}
                              disabled={isLoadingApproval === user.id}
                              data-testid={`button-approve-pending-${user.id}`}
                            >
                              {isLoadingApproval === user.id ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                              Activate
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-3 text-xs border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
                              onClick={() => setRejectWithReasonDialog({ open: true, userId: user.id, userName: user.name || user.email })}
                              data-testid={`button-reject-pending-${user.id}`}
                            >
                              <X className="h-3.5 w-3.5 mr-1" /> Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Users Table — rendered for all tabs except duplicates and pending */}
          <TabsContent value={activeTab} className="mt-0" hidden={activeTab === 'duplicates' || activeTab === 'pending'}>
            {isInitialLoad && users.length === 0 ? (
              <TableSkeleton rows={8} columns={5} />
            ) : users.length === 0 ? (
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
              <div className="border rounded-xl overflow-hidden shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 border-b-2">
                      <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">User</TableHead>
                      <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Role</TableHead>
                      <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground hidden md:table-cell">Status</TableHead>
                      <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground hidden lg:table-cell">Last Active</TableHead>
                      <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground text-right">Actions</TableHead>
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
        <div className="px-4 sm:px-6 py-3 mt-auto border-t bg-muted/20">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide mr-1">Quick Links:</span>
            <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" asChild data-testid="link-role-management">
              <Link to="/role-management">
                <Shield className="h-3.5 w-3.5 mr-1.5" />
                Role Management
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" asChild data-testid="link-audit-logs">
              <Link to="/audit-logs">
                <Settings className="h-3.5 w-3.5 mr-1.5" />
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

      {/* Activate with Role Modification Dialog */}
      <Dialog open={activateWithRoleDialog.open} onOpenChange={(open) => setActivateWithRoleDialog({ ...activateWithRoleDialog, open })}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" />
              Activate User & Assign Role
            </DialogTitle>
            <DialogDescription>
              Review and optionally modify the role before activating {activateWithRoleDialog.user?.name || 'this user'}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-3">
            {activateWithRoleDialog.user && (
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={activateWithRoleDialog.user.avatar} />
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                    {getInitials(activateWithRoleDialog.user.name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-sm">{activateWithRoleDialog.user.name || 'Unnamed User'}</p>
                  <p className="text-xs text-muted-foreground">{activateWithRoleDialog.user.email}</p>
                </div>
              </div>
            )}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Assign Role</label>
              <Select
                value={activateWithRoleDialog.selectedRole || activateWithRoleDialog.user?.role || ''}
                onValueChange={(val) => setActivateWithRoleDialog(prev => ({ ...prev, selectedRole: val }))}
              >
                <SelectTrigger data-testid="select-activate-role">
                  <SelectValue placeholder="Select role..." />
                </SelectTrigger>
                <SelectContent>
                  {VISIBLE_ROLE_CODES.map((roleCode) => (
                    <SelectItem key={roleCode} value={roleCode}>
                      {toDisplayLabel(roleCode)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activateWithRoleDialog.selectedRole && activateWithRoleDialog.user?.role &&
               normalizeRole(activateWithRoleDialog.selectedRole) !== normalizeRole(activateWithRoleDialog.user.role) && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  Role will be changed from <strong>{toDisplayLabel(activateWithRoleDialog.user.role)}</strong> to <strong>{toDisplayLabel(activateWithRoleDialog.selectedRole)}</strong>
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setActivateWithRoleDialog({ open: false })}>Cancel</Button>
            <Button
              onClick={() => {
                const selectedRole = activateWithRoleDialog.selectedRole;
                const isAdminEscalation = selectedRole && ['Admin', 'SuperAdmin'].includes(selectedRole);
                if (isAdminEscalation && isProtectedOwner(currentUser?.id)) {
                  setUsersAdminOtpOpen(true);
                } else {
                  handleActivateWithRole();
                }
              }}
              disabled={isActivatingWithRole}
              data-testid="button-confirm-activate-role"
            >
              {isActivatingWithRole ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Activate User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject with Reason Dialog */}
      <Dialog open={rejectWithReasonDialog.open} onOpenChange={(open) => { if (!open) { setRejectWithReasonDialog({ open: false }); setRejectionReason(''); } }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <UserX className="h-5 w-5" />
              Reject Registration
            </DialogTitle>
            <DialogDescription>
              Rejecting <strong>{rejectWithReasonDialog.userName}</strong>'s registration. Provide a reason — they will be notified via in-app message.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Rejection Reason <span className="text-red-500">*</span>
              </label>
              <Textarea
                placeholder="e.g. Missing required credentials, duplicate account, not a recognized employee..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="resize-none" rows={3}
                data-testid="textarea-rejection-reason"
              />
              {!rejectionReason.trim() && (
                <p className="text-xs text-muted-foreground mt-1">A reason is required so the user understands why their registration was not approved.</p>
              )}
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-200">
              <strong>Note:</strong> The user's account will be marked as rejected and they will not be able to log in. They will receive an in-app notification with your reason.
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setRejectWithReasonDialog({ open: false }); setRejectionReason(''); }}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleRejectWithReason}
              disabled={isRejectingWithReason || !rejectionReason.trim()}
              data-testid="button-confirm-reject"
            >
              {isRejectingWithReason ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <X className="h-4 w-4 mr-2" />}
              Reject Registration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add to Project Dialog */}
      <Dialog open={addToProjectDialog.open} onOpenChange={(open) => { 
        if (!open) setAddToProjectDialog({ open: false }); 
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus className="h-5 w-5 text-primary" />
              Add User to Project Team
            </DialogTitle>
            <DialogDescription>
              Would you like to add {addToProjectDialog.user?.name || 'this user'} to a project team?
            </DialogDescription>
          </DialogHeader>
          
          {activeProjects.length === 0 ? (
            <div className="py-6 text-center">
              <Briefcase className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No active projects available.</p>
              <p className="text-xs text-muted-foreground mt-1">Create a project first to add team members.</p>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={addToProjectDialog.user?.avatar} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {getInitials(addToProjectDialog.user?.name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{addToProjectDialog.user?.name || 'Unnamed User'}</p>
                  <p className="text-xs text-muted-foreground">{addToProjectDialog.user?.email}</p>
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium mb-1.5 block">Select Project</label>
                <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                  <SelectTrigger data-testid="select-project">
                    <SelectValue placeholder="Choose a project..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeProjects.map(project => (
                      <SelectItem key={project.id} value={project.id}>
                        <div className="flex items-center gap-2">
                          <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{project.name}</span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-1">
                            {project.status}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="text-sm font-medium mb-1.5 block">Role in Project</label>
                <Select value={selectedProjectRole} onValueChange={(val) => setSelectedProjectRole(val as ProjectRole)}>
                  <SelectTrigger data-testid="select-project-role">
                    <SelectValue placeholder="Select role..." />
                  </SelectTrigger>
                  <SelectContent>
                    {projectRoleOptions.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          
          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              variant="outline" 
              onClick={() => setAddToProjectDialog({ open: false })}
              data-testid="button-skip-project"
            >
              Skip
            </Button>
            {activeProjects.length > 0 && (
              <Button 
                onClick={handleAddToProject} 
                disabled={!selectedProjectId || isAddingToProject}
                data-testid="button-add-to-project"
              >
                {isAddingToProject ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <UserPlus className="h-4 w-4 mr-2" />
                )}
                Add to Team
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AdminRoleConfirmDialog
        open={usersAdminOtpOpen}
        onClose={() => setUsersAdminOtpOpen(false)}
        onConfirmed={async () => {
          setUsersAdminOtpOpen(false);
          await handleActivateWithRole();
        }}
        targetUserName={activateWithRoleDialog.user?.name || 'this user'}
        targetRole={activateWithRoleDialog.selectedRole || ''}
        currentUserName={currentUser?.name || 'Platform Owner'}
      />

      {/* Notification Level Dialog — Super Admin only */}
      <Dialog open={notifLevelDialog.open} onOpenChange={(open) => { if (!open) setNotifLevelDialog({ open: false }); }}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-purple-600" />
              Set Notification Level
            </DialogTitle>
            <DialogDescription>
              Control which notification categories <strong>{notifLevelDialog.user?.name}</strong> receives.
              This is managed by Super Admin only.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {NOTIF_LEVELS.map(lvl => (
              <button
                key={lvl.value}
                onClick={() => setNotifLevelDialog(prev => ({ ...prev, level: lvl.value }))}
                className={`w-full flex items-start gap-3 p-3 rounded-lg border-2 text-left transition-all ${
                  notifLevelDialog.level === lvl.value
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                    : 'border-transparent bg-muted/30 hover:bg-muted/60'
                }`}
                data-testid={`button-notif-level-option-${lvl.value}`}
              >
                <div className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                  notifLevelDialog.level === lvl.value ? 'border-purple-500' : 'border-muted-foreground/30'
                }`}>
                  {notifLevelDialog.level === lvl.value && (
                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                  )}
                </div>
                <div>
                  <p className="font-medium text-sm">{lvl.label}</p>
                  <p className="text-xs text-muted-foreground">{lvl.desc}</p>
                </div>
              </button>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setNotifLevelDialog({ open: false })}>Cancel</Button>
            <Button
              onClick={handleSaveNotifLevel}
              disabled={isSavingNotifLevel || !notifLevelDialog.level}
              className="bg-purple-600 hover:bg-purple-700"
              data-testid="button-save-notif-level"
            >
              {isSavingNotifLevel ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Save Level
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Users;
