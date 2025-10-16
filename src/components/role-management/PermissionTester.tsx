import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Shield, CheckCircle, XCircle, AlertTriangle, Users, Eye } from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import { useRoleManagement } from '@/context/role-management/RoleManagementContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { ResourceType, ActionType, RESOURCES, ACTIONS } from '@/types/roles';

interface PermissionTesterProps {
  selectedUserId?: string;
  selectedRoleId?: string;
}

export const PermissionTester: React.FC<PermissionTesterProps> = ({
  selectedUserId,
  selectedRoleId
}) => {
  const { currentUser, users } = useAppContext();
  const { roles, getUserRolesByUserId, hasPermission, getUserPermissions } = useRoleManagement();
  const { checkPermission, getCurrentUserPermissions } = useAuthorization();
  
  const [testUserId, setTestUserId] = useState(selectedUserId || '');
  const [testRoleId, setTestRoleId] = useState(selectedRoleId || '');
  const [testResults, setTestResults] = useState<Record<string, boolean>>({});
  const [userPermissions, setUserPermissions] = useState<any[]>([]);

  // Get user roles and permissions when test user changes
  useEffect(() => {
    if (testUserId) {
      const userRoles = getUserRolesByUserId(testUserId);
      const permissions = getUserPermissions(testUserId);
      setUserPermissions(permissions);
      
      // Test all possible permissions
      const results: Record<string, boolean> = {};
      RESOURCES.forEach(resource => {
        ACTIONS.forEach(action => {
          const key = `${resource}:${action}`;
          results[key] = hasPermission(testUserId, resource, action);
        });
      });
      setTestResults(results);
    }
  }, [testUserId, roles, getUserRolesByUserId, getUserPermissions, hasPermission]);

  const getPermissionDisplayName = (resource: ResourceType, action: ActionType): string => {
    const resourceNames: Record<ResourceType, string> = {
      users: 'Users',
      roles: 'Roles',
      permissions: 'Permissions',
      projects: 'Projects',
      mmp: 'MMP',
      site_visits: 'Site Visits',
      finances: 'Finances',
      reports: 'Reports',
      settings: 'Settings'
    };

    const actionNames: Record<ActionType, string> = {
      create: 'Create',
      read: 'View',
      update: 'Edit',
      delete: 'Delete',
      approve: 'Approve',
      assign: 'Assign'
    };

    return `${actionNames[action]} ${resourceNames[resource]}`;
  };

  const getPermissionColor = (hasPermission: boolean): string => {
    return hasPermission 
      ? 'bg-green-100 text-green-800 border-green-200' 
      : 'bg-red-100 text-red-800 border-red-200';
  };

  const getPermissionIcon = (hasPermission: boolean) => {
    return hasPermission ? (
      <CheckCircle className="h-4 w-4 text-green-600" />
    ) : (
      <XCircle className="h-4 w-4 text-red-600" />
    );
  };

  const testCurrentUserPermissions = () => {
    if (!currentUser) return;
    setTestUserId(currentUser.id);
  };

  const selectedUser = users.find(u => u.id === testUserId);
  const selectedRole = roles.find(r => r.id === testRoleId);
  const userRoles = testUserId ? getUserRolesByUserId(testUserId) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Permission Testing</h3>
          <p className="text-sm text-gray-500">
            Test user permissions and verify access control
          </p>
        </div>
        <Button onClick={testCurrentUserPermissions} variant="outline" size="sm">
          <Eye className="h-4 w-4 mr-2" />
          Test Current User
        </Button>
      </div>

      {/* User Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select User to Test</CardTitle>
          <CardDescription>
            Choose a user to test their permissions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">User</label>
              <select
                value={testUserId}
                onChange={(e) => setTestUserId(e.target.value)}
                className="w-full mt-1 p-2 border rounded-md"
              >
                <option value="">Select a user...</option>
                {users.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.full_name} ({user.role})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Role (for reference)</label>
              <select
                value={testRoleId}
                onChange={(e) => setTestRoleId(e.target.value)}
                className="w-full mt-1 p-2 border rounded-md"
              >
                <option value="">Select a role...</option>
                {roles.map(role => (
                  <option key={role.id} value={role.id}>
                    {role.display_name} ({role.is_system_role ? 'System' : 'Custom'})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedUser && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">User Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm font-medium">Name</p>
                <p className="text-sm text-gray-600">{selectedUser.full_name}</p>
              </div>
              <div>
                <p className="text-sm font-medium">Email</p>
                <p className="text-sm text-gray-600">{selectedUser.email}</p>
              </div>
              <div>
                <p className="text-sm font-medium">Primary Role</p>
                <Badge variant="outline">{selectedUser.role}</Badge>
              </div>
            </div>
            
            {userRoles.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium mb-2">Assigned Roles</p>
                <div className="flex flex-wrap gap-2">
                  {userRoles.map(userRole => (
                    <Badge key={userRole.id} variant="secondary">
                      {userRole.role}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Permission Test Results */}
      {testUserId && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            <h4 className="text-lg font-semibold">Permission Test Results</h4>
          </div>

          {RESOURCES.map(resource => {
            const resourcePermissions = ACTIONS.map(action => ({
              action,
              key: `${resource}:${action}`,
              hasPermission: testResults[`${resource}:${action}`] || false
            }));

            const grantedCount = resourcePermissions.filter(p => p.hasPermission).length;
            const totalCount = resourcePermissions.length;

            return (
              <Card key={resource}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base capitalize">
                      {resource.replace('_', ' ')}
                    </CardTitle>
                    <Badge variant="outline">
                      {grantedCount}/{totalCount} granted
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {resourcePermissions.map(({ action, key, hasPermission }) => (
                      <div
                        key={key}
                        className="flex items-center gap-2 p-2 rounded-md border"
                      >
                        {getPermissionIcon(hasPermission)}
                        <Badge
                          variant="outline"
                          className={`text-xs ${getPermissionColor(hasPermission)}`}
                        >
                          {getPermissionDisplayName(resource, action)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Current User Permission Summary */}
      {currentUser && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Current User Permission Summary</CardTitle>
            <CardDescription>
              Your current permissions in the system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {RESOURCES.map(resource => {
                const hasAnyPermission = ACTIONS.some(action => 
                  checkPermission(resource, action)
                );
                
                if (!hasAnyPermission) return null;

                return (
                  <div key={resource} className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium capitalize">
                      {resource.replace('_', ' ')}
                    </span>
                    <div className="flex gap-1">
                      {ACTIONS.map(action => {
                        const hasPermission = checkPermission(resource, action);
                        return hasPermission ? (
                          <Badge
                            key={action}
                            variant="outline"
                            className="text-xs bg-green-100 text-green-800"
                          >
                            {action}
                          </Badge>
                        ) : null;
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <strong>Testing Instructions:</strong>
          <br />
          1. Select a user to test their permissions
          <br />
          2. Verify that the displayed permissions match their assigned roles
          <br />
          3. Try removing permissions from their role and test again
          <br />
          4. Ensure that permission removal immediately revokes access
        </AlertDescription>
      </Alert>
    </div>
  );
};
