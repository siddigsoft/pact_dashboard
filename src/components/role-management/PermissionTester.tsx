import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Shield, CheckCircle, XCircle, AlertTriangle, Eye, ChevronsUpDown, Info, UserCircle } from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import { useRoleManagement } from '@/context/role-management/RoleManagementContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { ResourceType, ActionType, RESOURCES, ACTIONS, RESOURCE_LABELS, ACTION_LABELS } from '@/types/roles';
import { cn } from '@/lib/utils';

interface PermissionTesterProps {
  selectedUserId?: string;
  selectedRoleId?: string;
}

// Canonical labels — single source of truth
const getResourceLabel = (resource: ResourceType): string =>
  RESOURCE_LABELS[resource] ?? resource.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const getActionLabel = (action: ActionType): string =>
  ACTION_LABELS[action] ?? action.charAt(0).toUpperCase() + action.slice(1);

// Determine permission source
type PermSource = 'superadmin' | 'override-granted' | 'override-blocked' | 'role' | 'none';

function resolveSource(
  resource: ResourceType,
  action: ActionType,
  perms: any[],
  overrides: any[],
  roleName: string | undefined
): { granted: boolean; source: PermSource; label: string } {
  const hasSuperAdmin = perms.some(p => p.resource === 'system' && p.action === 'override');
  if (hasSuperAdmin) return { granted: true, source: 'superadmin', label: 'Super Admin bypass' };

  const ov = overrides.find(o => o.resource === resource && o.action === action);
  if (ov) {
    return {
      granted: ov.is_granted,
      source: ov.is_granted ? 'override-granted' : 'override-blocked',
      label: ov.is_granted ? 'Manual override (granted)' : 'Manual override (blocked)',
    };
  }

  const fromRole = perms.some(p => p.resource === resource && p.action === action);
  if (fromRole) return { granted: true, source: 'role', label: `Via role: ${roleName ?? 'assigned role'}` };

  return { granted: false, source: 'none', label: 'No permission' };
}

// Source badge styling
const SOURCE_STYLES: Record<PermSource, string> = {
  superadmin: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300',
  'override-granted': 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300',
  'override-blocked': 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/40 dark:text-slate-400',
  role: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300',
  none: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800/30 dark:text-gray-500',
};

// Searchable user combobox
function UserCombobox({
  value,
  onChange,
  users,
}: {
  value: string;
  onChange: (v: string) => void;
  users: { id: string; name: string; role: string }[];
}) {
  const [open, setOpen] = useState(false);
  const selected = users.find(u => u.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          data-testid="user-combobox-trigger"
        >
          {selected ? (
            <span className="flex items-center gap-2">
              <UserCircle className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="truncate">{selected.name}</span>
              <Badge variant="outline" className="text-[10px] ml-1">{selected.role}</Badge>
            </span>
          ) : (
            <span className="text-muted-foreground">Search users…</span>
          )}
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search by name or role…" data-testid="user-combobox-search" />
          <CommandList>
            <CommandEmpty>No users found.</CommandEmpty>
            <CommandGroup>
              {users.map(user => (
                <CommandItem
                  key={user.id}
                  value={`${user.name} ${user.role}`}
                  onSelect={() => { onChange(user.id); setOpen(false); }}
                  data-testid={`user-option-${user.id}`}
                >
                  <div className="flex items-center justify-between w-full gap-2">
                    <span className="truncate">{user.name}</span>
                    <Badge variant="outline" className="text-[10px] flex-shrink-0">{user.role}</Badge>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export const PermissionTester: React.FC<PermissionTesterProps> = ({
  selectedUserId,
}) => {
  const { currentUser, users } = useAppContext();
  const { roles, getUserRolesByUserId, refreshUserPermissions } = useRoleManagement();
  const { checkPermission } = useAuthorization();

  const [testUserId, setTestUserId] = useState(selectedUserId || '');
  const [permsData, setPermsData] = useState<any[]>([]);
  const [overridesData, setOverridesData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');

  // Reload when user selection changes
  useEffect(() => {
    if (!testUserId) {
      setPermsData([]);
      setOverridesData([]);
      return;
    }
    setIsLoading(true);
    (async () => {
      try {
        const result = await refreshUserPermissions(testUserId);
        setPermsData(result as any[]);
        // Fetch overrides separately to show source
        try {
          const now = new Date().toISOString();
          const { supabase } = await import('@/integrations/supabase/client');
          const { data: ovData } = await supabase
            .from('user_permission_overrides')
            .select('resource, action, is_granted, expires_at')
            .eq('user_id', testUserId)
            .or(`expires_at.is.null,expires_at.gt.${now}`);
          setOverridesData((ovData || []) as any[]);
        } catch { setOverridesData([]); }
      } finally {
        setIsLoading(false);
      }
    })();
  }, [testUserId, refreshUserPermissions]);

  const selectedUser = users.find(u => u.id === testUserId);
  const userRoles = testUserId ? getUserRolesByUserId(testUserId) : [];
  const primaryRoleName = selectedUser?.role ?? userRoles[0]?.role ?? undefined;

  // Per-resource permission data for display
  const filteredResources = useMemo(() => {
    const q = searchFilter.toLowerCase();
    return RESOURCES.filter(r =>
      !q || getResourceLabel(r).toLowerCase().includes(q) || r.toLowerCase().includes(q)
    );
  }, [searchFilter]);

  const testCurrentUser = () => {
    if (currentUser) setTestUserId(currentUser.id);
  };

  return (
    <TooltipProvider>
      <div className="space-y-6" data-testid="permission-tester">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Permission Tester</h3>
            <p className="text-sm text-muted-foreground">
              See every permission for any user — and exactly how they got it
            </p>
          </div>
          <Button onClick={testCurrentUser} variant="outline" size="sm" data-testid="test-current-user-btn">
            <Eye className="h-4 w-4 mr-2" />
            Test My Account
          </Button>
        </div>

        {/* User Selection */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Select User</CardTitle>
            <CardDescription>Start typing to search across all staff members</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <UserCombobox
              value={testUserId}
              onChange={setTestUserId}
              users={users.map(u => ({ id: u.id, name: u.name, role: u.role }))}
            />
            {testUserId && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground text-xs h-7 px-2"
                onClick={() => { setTestUserId(''); setPermsData([]); setOverridesData([]); }}
                data-testid="clear-user-btn"
              >
                Clear selection
              </Button>
            )}
          </CardContent>
        </Card>

        {/* User Info + Role Tags */}
        {selectedUser && (
          <Card>
            <CardContent className="pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Name</p>
                  <p className="text-sm font-medium">{selectedUser.name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Email</p>
                  <p className="text-sm">{selectedUser.email}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Primary Role</p>
                  <Badge variant="outline" className="text-xs">{selectedUser.role}</Badge>
                </div>
              </div>
              {userRoles.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Assigned Roles (user_roles table)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {userRoles.map(ur => (
                      <Badge key={ur.id} variant="secondary" className="text-xs">{ur.role}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {overridesData.length > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <p className="text-xs text-muted-foreground mb-1">Active Manual Overrides ({overridesData.length})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {overridesData.map((ov, i) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className={`text-[10px] ${ov.is_granted ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}
                      >
                        {ov.is_granted ? '+' : '–'} {getResourceLabel(ov.resource as ResourceType)}:{getActionLabel(ov.action as ActionType)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Permission Results */}
        {testUserId && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-muted-foreground" />
                <h4 className="text-base font-semibold">
                  {isLoading ? 'Loading permissions…' : 'Permission Results'}
                </h4>
              </div>
              <div className="relative w-48">
                <Input
                  placeholder="Filter modules…"
                  value={searchFilter}
                  onChange={e => setSearchFilter(e.target.value)}
                  className="h-8 text-xs"
                  data-testid="permission-module-filter"
                />
              </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground px-1">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />Super Admin</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-orange-400 inline-block" />Override (granted)</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-400 inline-block" />From role</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-gray-300 inline-block" />No access</span>
            </div>

            <div className="space-y-3">
              {filteredResources.map(resource => {
                const resolved = ACTIONS.map(action => ({
                  action,
                  ...resolveSource(resource, action, permsData, overridesData, primaryRoleName),
                }));

                const grantedCount = resolved.filter(r => r.granted).length;

                // Skip resources with zero grants when filtering
                if (searchFilter && grantedCount === 0) return null;

                return (
                  <Card key={resource} className={grantedCount === 0 ? 'opacity-50' : ''}>
                    <CardHeader className="py-3 px-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold">{getResourceLabel(resource)}</CardTitle>
                        <Badge
                          variant="outline"
                          className={`text-xs ${grantedCount > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'text-muted-foreground'}`}
                        >
                          {grantedCount}/{ACTIONS.length} granted
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 px-4 pb-3">
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                        {resolved.map(({ action, granted, source, label }) => (
                          <Tooltip key={action}>
                            <TooltipTrigger asChild>
                              <div
                                className={cn(
                                  'flex items-center gap-1.5 p-2 rounded-md border text-xs cursor-default select-none',
                                  granted
                                    ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800/40'
                                    : 'bg-muted/30 border-border/30'
                                )}
                                data-testid={`perm-${resource}-${action}`}
                              >
                                {granted
                                  ? <CheckCircle className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                                  : <XCircle className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0" />
                                }
                                <span className={granted ? 'text-emerald-800 dark:text-emerald-300 font-medium' : 'text-muted-foreground'}>
                                  {getActionLabel(action)}
                                </span>
                                {source !== 'none' && source !== 'role' && (
                                  <span className={cn('text-[9px] ml-auto px-1 rounded border', SOURCE_STYLES[source])}>
                                    {source === 'superadmin' ? 'SA' : source === 'override-granted' ? 'OV+' : 'OV–'}
                                  </span>
                                )}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs max-w-[200px]">
                              <p className="font-semibold">{getResourceLabel(resource)} → {getActionLabel(action)}</p>
                              <p className="text-muted-foreground mt-0.5">{label}</p>
                            </TooltipContent>
                          </Tooltip>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Current user's own permission summary */}
        {currentUser && !testUserId && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <UserCircle className="h-4 w-4" />
                Your Permission Summary
              </CardTitle>
              <CardDescription>Modules where you currently have access</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {RESOURCES.map(resource => {
                  const grantedActions = ACTIONS.filter(action => checkPermission(resource, action));
                  if (grantedActions.length === 0) return null;
                  return (
                    <div key={resource} className="flex items-center gap-2 flex-wrap">
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                      <span className="text-sm font-medium w-36 flex-shrink-0">{getResourceLabel(resource)}</span>
                      <div className="flex gap-1 flex-wrap">
                        {grantedActions.map(action => (
                          <Badge key={action} variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-emerald-50 text-emerald-700 border-emerald-200">
                            {getActionLabel(action)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* How it works */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs space-y-1">
            <p className="font-semibold">How permissions are resolved</p>
            <p><strong>1. Super Admin</strong> — bypasses all checks if the user has <code>system:override</code>.</p>
            <p><strong>2. Manual overrides</strong> — per-user grants or blocks set in the "User Permission Overrides" tab win over role defaults.</p>
            <p><strong>3. Role defaults</strong> — from the user's assigned role(s) in the system.</p>
            <p>Hover any permission cell to see its exact source.</p>
          </AlertDescription>
        </Alert>
      </div>
    </TooltipProvider>
  );
};
