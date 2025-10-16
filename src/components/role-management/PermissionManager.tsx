import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Save, Shield, AlertTriangle } from 'lucide-react';
import { RoleWithPermissions, ResourceType, ActionType, RESOURCES, ACTIONS } from '@/types/roles';
import { useToast } from '@/components/ui/use-toast';

interface PermissionManagerProps {
  role: RoleWithPermissions;
  onUpdatePermissions: (roleId: string, permissions: { resource: ResourceType; action: ActionType }[]) => Promise<boolean>;
  isLoading?: boolean;
}

// Helper function to get permission display name
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

// Helper function to get permission color
const getPermissionColor = (action: ActionType): string => {
  const colors: Record<ActionType, string> = {
    create: 'bg-green-100 text-green-800 border-green-200',
    read: 'bg-blue-100 text-blue-800 border-blue-200',
    update: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    delete: 'bg-red-100 text-red-800 border-red-200',
    approve: 'bg-purple-100 text-purple-800 border-purple-200',
    assign: 'bg-indigo-100 text-indigo-800 border-indigo-200'
  };
  return colors[action];
};

export const PermissionManager: React.FC<PermissionManagerProps> = ({
  role,
  onUpdatePermissions,
  isLoading = false
}) => {
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // Initialize selected permissions from role
  useEffect(() => {
    const currentPermissions = new Set(
      role.permissions.map(p => `${p.resource}:${p.action}`)
    );
    setSelectedPermissions(currentPermissions);
    setHasChanges(false);
  }, [role]);

  const handlePermissionToggle = (resource: ResourceType, action: ActionType) => {
    const permissionKey = `${resource}:${action}`;
    const newSelected = new Set(selectedPermissions);
    
    if (newSelected.has(permissionKey)) {
      newSelected.delete(permissionKey);
    } else {
      newSelected.add(permissionKey);
    }
    
    setSelectedPermissions(newSelected);
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const permissions = Array.from(selectedPermissions).map(key => {
      const [resource, action] = key.split(':') as [ResourceType, ActionType];
      return { resource, action };
    });

    const success = await onUpdatePermissions(role.id, permissions);
    if (success) {
      setHasChanges(false);
      toast({
        title: 'Permissions updated',
        description: `Permissions for ${role.display_name} have been updated successfully.`,
      });
    }
    setSaving(false);
  };

  const handleSelectAll = (resource: ResourceType) => {
    const resourcePermissions = ACTIONS.map(action => `${resource}:${action}`);
    const allSelected = resourcePermissions.every(perm => selectedPermissions.has(perm));
    
    const newSelected = new Set(selectedPermissions);
    if (allSelected) {
      // Deselect all for this resource
      resourcePermissions.forEach(perm => newSelected.delete(perm));
    } else {
      // Select all for this resource
      resourcePermissions.forEach(perm => newSelected.add(perm));
    }
    
    setSelectedPermissions(newSelected);
    setHasChanges(true);
  };

  const getResourcePermissionCount = (resource: ResourceType) => {
    return ACTIONS.filter(action => selectedPermissions.has(`${resource}:${action}`)).length;
  };

  const isSystemRole = role.is_system_role;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Permission Management</h3>
          <p className="text-sm text-gray-500">
            Manage granular permissions for {role.display_name}
          </p>
        </div>
        {hasChanges && (
          <Button onClick={handleSave} disabled={saving} size="sm">
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        )}
      </div>

      {isSystemRole && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            This is a system role. Modifying permissions may affect core functionality.
            Changes will be applied to all users with this role.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        {RESOURCES.map(resource => {
          const permissionCount = getResourcePermissionCount(resource);
          const totalActions = ACTIONS.length;
          const allSelected = permissionCount === totalActions;
          const someSelected = permissionCount > 0 && permissionCount < totalActions;

          return (
            <Card key={resource}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`${resource}-all`}
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onCheckedChange={() => handleSelectAll(resource)}
                    />
                    <Label htmlFor={`${resource}-all`} className="text-sm font-medium">
                      {resource.replace('_', ' ').toUpperCase()}
                    </Label>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {permissionCount}/{totalActions}
                  </Badge>
                </div>
              </CardHeader>
              
              <CardContent className="pt-0">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {ACTIONS.map(action => {
                    const permissionKey = `${resource}:${action}`;
                    const isSelected = selectedPermissions.has(permissionKey);
                    
                    return (
                      <div key={action} className="flex items-center space-x-2">
                        <Checkbox
                          id={permissionKey}
                          checked={isSelected}
                          onCheckedChange={() => handlePermissionToggle(resource, action)}
                        />
                        <Label 
                          htmlFor={permissionKey} 
                          className="text-sm cursor-pointer flex-1"
                        >
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${isSelected ? getPermissionColor(action) : 'bg-gray-50 text-gray-600 border-gray-200'}`}
                          >
                            {getPermissionDisplayName(resource, action)}
                          </Badge>
                        </Label>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {hasChanges && (
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button 
            variant="outline" 
            onClick={() => {
              // Reset to original permissions
              const originalPermissions = new Set(
                role.permissions.map(p => `${p.resource}:${p.action}`)
              );
              setSelectedPermissions(originalPermissions);
              setHasChanges(false);
            }}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            Save Permissions
          </Button>
        </div>
      )}
    </div>
  );
};
