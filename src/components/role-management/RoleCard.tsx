import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { MoreHorizontal, Edit2, Trash2, Users, ChevronDown, ChevronRight, Shield, Eye, EyeOff } from 'lucide-react';
import { RoleWithPermissions, ResourceType, ActionType } from '@/types/roles';

interface RoleCardProps {
  role: RoleWithPermissions;
  onEdit: (role: RoleWithPermissions) => void;
  onDelete: (roleId: string) => void;
  onViewUsers: (role: RoleWithPermissions) => void;
  userCount?: number;
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
    create: 'bg-green-100 text-green-800',
    read: 'bg-blue-100 text-blue-800',
    update: 'bg-yellow-100 text-yellow-800',
    delete: 'bg-red-100 text-red-800',
    approve: 'bg-purple-100 text-purple-800',
    assign: 'bg-indigo-100 text-indigo-800'
  };
  return colors[action];
};

// Helper function to group permissions by resource
const groupPermissionsByResource = (permissions: any[]) => {
  const grouped: Record<string, any[]> = {};
  permissions.forEach(perm => {
    if (!grouped[perm.resource]) {
      grouped[perm.resource] = [];
    }
    grouped[perm.resource].push(perm);
  });
  return grouped;
};

export const RoleCard: React.FC<RoleCardProps> = ({
  role,
  onEdit,
  onDelete,
  onViewUsers,
  userCount = 0
}) => {
  const [isPermissionsExpanded, setIsPermissionsExpanded] = useState(false);
  const groupedPermissions = groupPermissionsByResource(role.permissions);

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="text-base font-medium">
            {role.display_name}
            {role.is_system_role && (
              <Badge variant="secondary" className="ml-2 text-xs">
                System
              </Badge>
            )}
          </CardTitle>
          <CardDescription className="text-sm text-gray-500">
            {role.description || 'No description provided'}
          </CardDescription>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onViewUsers(role)}>
              <Users className="mr-2 h-4 w-4" />
              View Users ({userCount})
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(role)}>
              <Edit2 className="mr-2 h-4 w-4" />
              Edit Role
            </DropdownMenuItem>
            {!role.is_system_role && (
              <DropdownMenuItem 
                onClick={() => onDelete(role.id)}
                className="text-red-600"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Role
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-4">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Users assigned:</span>
              <span className="font-medium">{userCount}</span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Status:</span>
              <Badge variant={role.is_active ? "default" : "secondary"}>
                {role.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>
          </div>

          {/* Permissions Section */}
          <div className="space-y-2">
            <Collapsible open={isPermissionsExpanded} onOpenChange={setIsPermissionsExpanded}>
              <CollapsibleTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="w-full justify-between p-0 h-auto font-medium text-sm"
                >
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    <span>Permissions ({role.permissions.length})</span>
                  </div>
                  {isPermissionsExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              
              <CollapsibleContent className="space-y-3 mt-3">
                {Object.keys(groupedPermissions).length === 0 ? (
                  <div className="text-sm text-gray-500 italic">
                    No permissions assigned
                  </div>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(groupedPermissions).map(([resource, perms]) => (
                      <div key={resource} className="space-y-2">
                        <div className="text-sm font-medium text-gray-700 capitalize">
                          {resource.replace('_', ' ')}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {perms.map((perm, index) => (
                            <Badge 
                              key={`${perm.resource}-${perm.action}-${index}`}
                              variant="outline"
                              className={`text-xs ${getPermissionColor(perm.action)}`}
                            >
                              {getPermissionDisplayName(perm.resource, perm.action)}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};