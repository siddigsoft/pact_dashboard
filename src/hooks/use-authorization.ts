import { useAppContext } from '@/context/AppContext';
import { useRoleManagement } from '@/context/role-management/RoleManagementContext';
import { useSuperAdmin } from '@/context/superAdmin/SuperAdminContext';
import { ResourceType, ActionType } from '@/types/roles';

export const useAuthorization = () => {
  const { currentUser } = useAppContext();
  const { hasPermission, getUserPermissions } = useRoleManagement();
  
  let isSuperAdminUser = false;
  try {
    const superAdminContext = useSuperAdmin();
    isSuperAdminUser = superAdminContext?.isSuperAdmin ?? false;
  } catch {
    isSuperAdminUser = false;
  }

  /**
   * Check if the current user is a SuperAdmin (highest role with all permissions)
   */
  const isSuperAdmin = (): boolean => {
    if (!currentUser) return false;
    if (isSuperAdminUser) return true;
    const roles = [currentUser.role, ...(Array.isArray(currentUser.roles) ? currentUser.roles : [])];
    return roles.some(r => r === 'SuperAdmin' || r === 'super_admin');
  };

  /**
   * Check if the current user has a specific permission
   * SuperAdmin bypasses all permission checks
   */
  const checkPermission = (resource: ResourceType, action: ActionType): boolean => {
    if (!currentUser) return false;
    if (isSuperAdmin()) return true;
    return hasPermission(currentUser.id, resource, action);
  };

  /**
   * Check if the current user has any of the specified roles
   */
  const hasAnyRole = (roles: string[]): boolean => {
    if (!currentUser) return false;
    const primary = currentUser.role;
    const extras = Array.isArray(currentUser.roles) ? currentUser.roles : [];
    return roles.some(r => r === primary || extras.includes(r as any));
  };

  /**
   * Check if the current user has all of the specified roles
   */
  const hasAllRoles = (roles: string[]): boolean => {
    if (!currentUser) return false;
    const primary = currentUser.role;
    const extras = Array.isArray(currentUser.roles) ? currentUser.roles : [];
    return roles.every(r => r === primary || extras.includes(r as any));
  };

  /**
   * Get all permissions for the current user
   */
  const getCurrentUserPermissions = () => {
    if (!currentUser) return [];
    return getUserPermissions(currentUser.id);
  };

  /**
   * Check if user can manage roles (super_admin/admin/ict only)
   */
  const canManageRoles = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('roles', 'create') || 
           checkPermission('roles', 'update') || 
           checkPermission('roles', 'delete') ||
           hasAnyRole(['admin']);
  };

  /**
   * Check if user can manage users
   */
  const canManageUsers = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('users', 'create') || 
           checkPermission('users', 'update') || 
           checkPermission('users', 'delete') ||
           hasAnyRole(['admin']);
  };

  /**
   * Check if user can approve MMP files
   */
  const canApproveMMP = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('mmp', 'approve') ||
           hasAnyRole(['admin']);
  };

  /**
   * Check if user can manage finances
   */
  const canManageFinances = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('finances', 'update') ||
           checkPermission('finances', 'approve') ||
           hasAnyRole(['admin']);
  };

  /**
   * Check if user can view all site visits
   */
  const canViewAllSiteVisits = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('site_visits', 'read') ||
           hasAnyRole(['admin']);
  };

  /**
   * Check if user can create projects
   */
  const canCreateProjects = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('projects', 'create') ||
           hasAnyRole(['admin']);
  };

  /**
   * Check if user can edit fee structures (super_admin/admin/ICT only)
   */
  const canEditFeeStructures = (): boolean => {
    if (isSuperAdmin()) return true;
    return hasAnyRole(['admin', 'Admin', 'ict', 'ICT', 'SuperAdmin', 'super_admin']);
  };

  /**
   * Check if user can manage super admins (super_admin only)
   */
  const canManageSuperAdmins = (): boolean => {
    return isSuperAdmin();
  };

  /**
   * Check if user can view audit logs
   */
  const canViewAuditLogs = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('audit_logs', 'read');
  };

  /**
   * Check if user can restore deleted records
   */
  const canRestoreRecords = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('audit_logs', 'restore');
  };

  /**
   * Check if user can override system actions
   */
  const canOverrideSystem = (): boolean => {
    return isSuperAdmin();
  };

  /**
   * Check if user can manage all wallets
   */
  const canManageAllWallets = (): boolean => {
    if (isSuperAdmin()) return true;
    return checkPermission('wallets', 'update') || checkPermission('wallets', 'approve');
  };

  /**
   * Higher-order component for conditional rendering based on permissions
   */
  const withPermission = (
    resource: ResourceType, 
    action: ActionType, 
    fallback?: React.ReactNode
  ) => {
    return (component: React.ReactNode) => {
      return checkPermission(resource, action) ? component : (fallback || null);
    };
  };

  /**
   * Higher-order component for conditional rendering based on roles
   */
  const withRole = (
    roles: string[], 
    fallback?: React.ReactNode
  ) => {
    return (component: React.ReactNode) => {
      return hasAnyRole(roles) ? component : (fallback || null);
    };
  };

  return {
    // Permission checks
    checkPermission,
    hasAnyRole,
    hasAllRoles,
    getCurrentUserPermissions,
    isSuperAdmin,
    
    // Specific feature permissions
    canManageRoles,
    canManageUsers,
    canApproveMMP,
    canManageFinances,
    canViewAllSiteVisits,
    canCreateProjects,
    canEditFeeStructures,
    canManageSuperAdmins,
    canViewAuditLogs,
    canRestoreRecords,
    canOverrideSystem,
    canManageAllWallets,
    
    // HOCs for conditional rendering
    withPermission,
    withRole,
    
    // User info
    currentUser,
    isAuthenticated: !!currentUser
  };
};