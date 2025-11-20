import React from 'react';
import { useAuthorization } from '@/hooks/use-authorization';
import { ResourceType, ActionType } from '@/types/roles';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield } from 'lucide-react';

interface PermissionGuardProps {
  resource?: ResourceType;
  action?: ActionType;
  roles?: string[];
  fallback?: React.ReactNode;
  showAlert?: boolean;
  children: React.ReactNode;
}

export const PermissionGuard: React.FC<PermissionGuardProps> = ({
  resource,
  action,
  roles,
  fallback,
  showAlert = false,
  children
}) => {
  const { checkPermission, hasAnyRole } = useAuthorization();

  // Check permission-based access
  const hasPermissionAccess = resource && action ? checkPermission(resource, action) : true;
  
  // Check role-based access
  const hasRoleAccess = roles ? hasAnyRole(roles) : true;

  // User must have both permission and role access (if specified)
  const hasAccess = hasPermissionAccess && hasRoleAccess;

  if (!hasAccess) {
    if (fallback !== undefined) {
      return <>{fallback}</>;
    }

    if (showAlert) {
      return (
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertDescription>
            You don't have permission to access this feature.
          </AlertDescription>
        </Alert>
      );
    }

    return null;
  }

  return <>{children}</>;
};

// Convenience components for common use cases
export const AdminOnly: React.FC<{ children: React.ReactNode; fallback?: React.ReactNode }> = ({ 
  children, 
  fallback 
}) => (
  <PermissionGuard roles={['admin']} fallback={fallback}>
    {children}
  </PermissionGuard>
);

export const AdminOrICT: React.FC<{ children: React.ReactNode; fallback?: React.ReactNode }> = ({ 
  children, 
  fallback 
}) => (
  <PermissionGuard roles={['admin']} fallback={fallback}>
    {children}
  </PermissionGuard>
);

export const ManagerOnly: React.FC<{ children: React.ReactNode; fallback?: React.ReactNode }> = ({ 
  children, 
  fallback 
}) => (
  <PermissionGuard roles={['admin']} fallback={fallback}>
    {children}
  </PermissionGuard>
);