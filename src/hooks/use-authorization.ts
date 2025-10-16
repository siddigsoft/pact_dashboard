import { useAppContext } from '@/context/AppContext';
import { useRoleManagement } from '@/context/role-management/RoleManagementContext';
import { ResourceType, ActionType } from '@/types/roles';

export const useAuthorization = () => {
  const { currentUser } = useAppContext();
  const { hasPermission, getUserPermissions } = useRoleManagement();

  /**
   * Check if the current user has a specific permission
   */
  const checkPermission = (resource: ResourceType, action: ActionType): boolean => {
    if (!currentUser) return false;
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
   * Check if user can manage roles (admin/ict only)
   */
  const canManageRoles = (): boolean => {
    return checkPermission('roles', 'create') || 
           checkPermission('roles', 'update') || 
           checkPermission('roles', 'delete') ||
           hasAnyRole(['admin', 'ict']);
  };

  /**
   * Check if user can manage users
   */
  const canManageUsers = (): boolean => {
    return checkPermission('users', 'create') || 
           checkPermission('users', 'update') || 
           checkPermission('users', 'delete') ||
           hasAnyRole(['admin', 'ict']);
  };

  /**
   * Check if user can approve MMP files
   */
  const canApproveMMP = (): boolean => {
    return checkPermission('mmp', 'approve') ||
           hasAnyRole(['admin', 'ict', 'fom']);
  };

  /**
   * Check if user can manage finances
   */
  const canManageFinances = (): boolean => {
    return checkPermission('finances', 'update') ||
           checkPermission('finances', 'approve') ||
           hasAnyRole(['admin', 'ict', 'financialAdmin']);
  };

  /**
   * Check if user can view all site visits
   */
  const canViewAllSiteVisits = (): boolean => {
    return checkPermission('site_visits', 'read') ||
           hasAnyRole(['admin', 'ict', 'fom', 'financialAdmin', 'supervisor']);
  };

  /**
   * Check if user can create projects
   */
  const canCreateProjects = (): boolean => {
    return checkPermission('projects', 'create') ||
           hasAnyRole(['admin', 'ict', 'fom']);
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
    
    // Specific feature permissions
    canManageRoles,
    canManageUsers,
    canApproveMMP,
    canManageFinances,
    canViewAllSiteVisits,
    canCreateProjects,
    
    // HOCs for conditional rendering
    withPermission,
    withRole,
    
    // User info
    currentUser,
    isAuthenticated: !!currentUser
  };
};