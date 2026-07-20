import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { MoreHorizontal, Edit2, Trash2, Users, ChevronDown, ChevronRight, Shield, Copy, Lock } from 'lucide-react';
import { RoleWithPermissions, ResourceType, ActionType, RESOURCE_LABELS, ACTION_LABELS } from '@/types/roles';

interface RoleCardProps {
  role: RoleWithPermissions;
  onEdit: (role: RoleWithPermissions) => void;
  onDelete: (roleId: string) => void;
  onViewUsers: (role: RoleWithPermissions) => void;
  onClone?: (role: RoleWithPermissions) => void;
  userCount?: number;
}

// Use the canonical labels from types/roles.ts — single source of truth
const getResourceLabel = (resource: ResourceType): string =>
  RESOURCE_LABELS[resource] ?? resource.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const getActionLabel = (action: ActionType): string =>
  ACTION_LABELS[action] ?? action.charAt(0).toUpperCase() + action.slice(1);

// Action → badge color
const ACTION_COLORS: Record<ActionType, string> = {
  create:  'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  read:    'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  update:  'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  delete:  'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  approve: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  assign:  'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  archive: 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300',
  restore: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  override:'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  submit:  'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  export:  'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
};

const getPermissionColor = (action: ActionType): string =>
  ACTION_COLORS[action] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-800/40 dark:text-gray-300';

// Group permissions by resource
const groupPermissionsByResource = (permissions: any[]): Record<string, any[]> => {
  const grouped: Record<string, any[]> = {};
  permissions.forEach(perm => {
    if (!grouped[perm.resource]) grouped[perm.resource] = [];
    grouped[perm.resource].push(perm);
  });
  return grouped;
};

// Order actions for consistent display
const ACTION_ORDER: ActionType[] = ['create', 'read', 'update', 'delete', 'approve', 'assign', 'submit', 'archive', 'restore', 'override', 'export'];
const sortActions = (perms: any[]) =>
  [...perms].sort((a, b) => ACTION_ORDER.indexOf(a.action) - ACTION_ORDER.indexOf(b.action));

export const RoleCard: React.FC<RoleCardProps> = ({
  role,
  onEdit,
  onDelete,
  onViewUsers,
  onClone,
  userCount = 0
}) => {
  const [isPermissionsExpanded, setIsPermissionsExpanded] = useState(false);
  const groupedPermissions = groupPermissionsByResource(role.permissions);
  const resourceCount = Object.keys(groupedPermissions).length;

  // Determine card accent based on role type
  const accentClass = role.is_system_role
    ? 'border-l-4 border-l-blue-500'
    : 'border-l-4 border-l-purple-400';

  return (
    <TooltipProvider>
      <Card className={`w-full transition-shadow hover:shadow-md ${accentClass}`} data-testid={`role-card-${role.name}`}>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div className="space-y-1 min-w-0 flex-1 mr-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2 flex-wrap">
              <span className="truncate">{role.display_name}</span>
              {role.is_system_role && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="secondary" className="text-xs flex-shrink-0 gap-1">
                      <Lock className="h-2.5 w-2.5" />
                      System <span className="opacity-60">/ نظامي</span>
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>Built-in system role — cannot be deleted / دور نظامي مدمج</TooltipContent>
                </Tooltip>
              )}
              {!role.is_active && (
                <Badge variant="outline" className="text-xs flex-shrink-0 text-muted-foreground">Inactive <span className="opacity-60">/ غير نشط</span></Badge>
              )}
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground line-clamp-2">
              {role.description || <span>No description provided <span className="text-xs opacity-60" dir="rtl">/ لا يوجد وصف</span></span>}
            </CardDescription>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0 flex-shrink-0" data-testid={`role-menu-${role.name}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onViewUsers(role)} data-testid={`role-view-users-${role.name}`}>
                <Users className="mr-2 h-4 w-4" />
                View Users ({userCount}) <span className="text-[10px] text-muted-foreground ml-1">/ عرض المستخدمين</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEdit(role)} data-testid={`role-edit-${role.name}`}>
                <Edit2 className="mr-2 h-4 w-4" />
                Edit Role <span className="text-[10px] text-muted-foreground ml-1">/ تعديل الدور</span>
              </DropdownMenuItem>
              {onClone && (
                <DropdownMenuItem onClick={() => onClone(role)} data-testid={`role-clone-${role.name}`}>
                  <Copy className="mr-2 h-4 w-4" />
                  Clone Role <span className="text-[10px] text-muted-foreground ml-1">/ نسخ الدور</span>
                </DropdownMenuItem>
              )}
              {!role.is_system_role && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDelete(role.id)}
                    className="text-red-600 focus:text-red-600"
                    data-testid={`role-delete-${role.name}`}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Role <span className="text-[10px] text-red-400 ml-1">/ حذف الدور</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-muted/40 rounded-md p-2">
              <p className="text-lg font-bold text-foreground">{userCount}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Users</p>
              <p className="text-[9px] text-muted-foreground/60" dir="rtl">مستخدمون</p>
            </div>
            <div className="bg-muted/40 rounded-md p-2">
              <p className="text-lg font-bold text-foreground">{resourceCount}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Modules</p>
              <p className="text-[9px] text-muted-foreground/60" dir="rtl">وحدات</p>
            </div>
            <div className="bg-muted/40 rounded-md p-2">
              <p className="text-lg font-bold text-foreground">{role.permissions.length}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Actions</p>
              <p className="text-[9px] text-muted-foreground/60" dir="rtl">إجراءات</p>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Status <span className="text-[10px] opacity-60" dir="rtl">/ الحالة</span></span>
            <Badge
              variant={role.is_active ? 'default' : 'secondary'}
              className={`text-xs ${role.is_active ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200' : ''}`}
            >
              {role.is_active ? <span>Active <span className="opacity-60">/ نشط</span></span> : <span>Inactive <span className="opacity-60">/ غير نشط</span></span>}
            </Badge>
          </div>

          {/* Permissions Section */}
          {role.permissions.length > 0 && (
            <Collapsible open={isPermissionsExpanded} onOpenChange={setIsPermissionsExpanded}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-between p-2 h-auto font-medium text-xs hover:bg-muted/50"
                  data-testid={`role-permissions-toggle-${role.name}`}
                >
                  <div className="flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Permissions ({role.permissions.length}) <span className="opacity-60 text-[10px]">/ الصلاحيات</span></span>
                  </div>
                  {isPermissionsExpanded
                    ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  }
                </Button>
              </CollapsibleTrigger>

              <CollapsibleContent className="space-y-3 mt-2">
                {Object.entries(groupedPermissions).map(([resource, perms]) => (
                  <div key={resource} className="space-y-1.5">
                    <p className="text-xs font-semibold text-foreground/70 uppercase tracking-wide">
                      {getResourceLabel(resource as ResourceType)}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {sortActions(perms).map((perm, index) => (
                        <Badge
                          key={`${perm.resource}-${perm.action}-${index}`}
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 h-5 ${getPermissionColor(perm.action as ActionType)}`}
                        >
                          {getActionLabel(perm.action as ActionType)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {role.permissions.length === 0 && (
            <p className="text-xs text-muted-foreground italic text-center py-2">
              No permissions assigned <span className="block text-[10px] not-italic" dir="rtl">لم يتم تعيين صلاحيات</span>
            </p>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
};
