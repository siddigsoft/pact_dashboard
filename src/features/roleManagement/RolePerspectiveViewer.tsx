import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Eye,
  Shield,
  Monitor,
  CheckCircle2,
  XCircle,
  Users,
  Lock,
  LayoutDashboard,
  Search,
} from 'lucide-react';
import { useAppContext } from '@/shared/context/AppContext';
import { useAuthorization } from '@/features/auth/hooks/use-authorization';
import { AppRole, DEFAULT_ROLE_PERMISSIONS, RESOURCES, ACTIONS, ResourceType, ActionType } from '@/types/roles';
import { getWorkflowMenuGroups } from '@/navigation/menu';
import { normalizeRole } from '@/utils/roleMapping';
import { DEFAULT_MENU_PREFERENCES } from '@/types/user-preferences';
import { Input } from '@/components/ui/input';

const ROLE_DISPLAY_NAMES: Record<AppRole, string> = {
  SuperAdmin: 'Super Admin',
  Admin: 'Admin',
  CountryDirector: 'Country Director',
  ICT: 'ICT',
  'Field Operation Manager (FOM)': 'Field Operation Manager (FOM)',
  FinancialAdmin: 'Financial Admin',
  ProjectManager: 'Project Manager',
  SeniorOperationsLead: 'Senior Operations Lead',
  Supervisor: 'Supervisor',
  Coordinator: 'Coordinator',
  DataTeam: 'Data Team',
  DataCollector: 'Data Collector',
  Reviewer: 'Reviewer',
};

const RESOURCE_DISPLAY: Record<ResourceType, string> = {
  users: 'Users',
  roles: 'Roles',
  permissions: 'Permissions',
  projects: 'Projects',
  mmp: 'MMP',
  site_visits: 'Site Visits',
  finances: 'Finances',
  reports: 'Reports',
  settings: 'Settings',
  super_admins: 'Super Admins',
  audit_logs: 'Audit Logs',
  wallets: 'Wallets',
  system: 'System',
};

const ACTION_DISPLAY: Record<ActionType, string> = {
  create: 'Create',
  read: 'View',
  update: 'Edit',
  delete: 'Delete',
  approve: 'Approve',
  assign: 'Assign',
  archive: 'Archive',
  restore: 'Restore',
  override: 'Override',
};

const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  SuperAdmin: 'Full system access. Can manage everything including other admins and system settings.',
  Admin: 'Manages users, roles, projects, MMP, site visits, finances, and settings.',
  CountryDirector: 'Read-only oversight. Can view MMP, submit costs, access own wallet, and view reports.',
  ICT: 'Technical operations. Manages users, projects, MMP, site visits, and system settings.',
  'Field Operation Manager (FOM)': 'Manages field operations including MMP, site visits, and project updates.',
  FinancialAdmin: 'Manages financial operations including approvals and wallet management.',
  ProjectManager: 'Full project lifecycle management with team, MMP, and financial oversight.',
  SeniorOperationsLead: 'Senior oversight with approval and override capabilities for operations and finances.',
  Supervisor: 'Supervises MMP and site visit activities with edit access.',
  Coordinator: 'Coordinates site visits and MMP with limited edit access.',
  DataTeam: 'Analytics-focused role with read access to data and report creation.',
  DataCollector: 'Field data collection with site visit and MMP read/update access.',
  Reviewer: 'Read-only access to site visits and MMP for review purposes.',
};

export default function RolePerspectiveViewer() {
  const { users } = useAppContext();
  const { isSuperAdmin } = useAuthorization();
  const [viewMode, setViewMode] = useState<'role' | 'user'>('role');
  const [selectedRole, setSelectedRole] = useState<AppRole | ''>('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [compareRole, setCompareRole] = useState<AppRole | '' | 'none'>('');

  const allRoles = Object.keys(DEFAULT_ROLE_PERMISSIONS) as AppRole[];

  const filteredUsers = useMemo(() => {
    if (!userSearch) return users;
    const q = userSearch.toLowerCase();
    return users.filter(u =>
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.role?.toLowerCase().includes(q)
    );
  }, [users, userSearch]);

  const selectedUser = useMemo(() =>
    users.find(u => u.id === selectedUserId),
    [users, selectedUserId]
  );

  const activeRole: AppRole | null = useMemo(() => {
    if (viewMode === 'role' && selectedRole) return selectedRole;
    if (viewMode === 'user' && selectedUser) {
      const normalized = normalizeRole(selectedUser.role);
      const match = allRoles.find(r => normalizeRole(r) === normalized);
      return match || null;
    }
    return null;
  }, [viewMode, selectedRole, selectedUser, allRoles]);

  const rolePermissions = useMemo(() => {
    if (!activeRole) return new Set<string>();
    const perms = DEFAULT_ROLE_PERMISSIONS[activeRole] || [];
    return new Set(perms.map(p => `${p.resource}:${p.action}`));
  }, [activeRole]);

  const comparePermissions = useMemo(() => {
    if (!compareRole || compareRole === 'none') return null;
    const perms = DEFAULT_ROLE_PERMISSIONS[compareRole as AppRole] || [];
    return new Set(perms.map(p => `${p.resource}:${p.action}`));
  }, [compareRole]);

  const isComparing = !!comparePermissions && !!compareRole && compareRole !== 'none';

  const menuGroups = useMemo(() => {
    if (!activeRole) return [];
    const isSA = activeRole === 'SuperAdmin';
    const roleForMenu = normalizeRole(activeRole) || '';
    const roleArray = [roleForMenu as AppRole, activeRole];
    const perms: Record<string, boolean> = {};
    const rolePerms = DEFAULT_ROLE_PERMISSIONS[activeRole] || [];
    rolePerms.forEach(p => {
      if (p.resource === 'site_visits') perms.siteVisits = true;
      if (p.resource === 'projects') perms.projects = true;
      if (p.resource === 'mmp') perms.mmp = true;
      if (p.resource === 'reports') perms.reports = true;
      if (p.resource === 'finances') perms.finances = true;
      if (p.resource === 'finances' && (p.action === 'approve' || p.action === 'update')) perms.financialOperations = true;
      if (p.resource === 'settings') perms.settings = true;
      if (p.resource === 'users') perms.users = true;
      if (p.resource === 'roles') perms.roleManagement = true;
      if (p.resource === 'site_visits' && p.action === 'read') perms.fieldTeam = true;
      if (p.resource === 'site_visits' && (p.action === 'update' || p.action === 'create')) perms.fieldOpManager = true;
      if (p.resource === 'site_visits' && p.action === 'read') perms.archive = true;
      if (p.resource === 'reports' && p.action === 'read') perms.dataVisibility = true;
    });
    perms.dashboard = true;
    return getWorkflowMenuGroups(roleArray, roleForMenu, perms, isSA, DEFAULT_MENU_PREFERENCES);
  }, [activeRole]);

  const permissionStats = useMemo(() => {
    const total = RESOURCES.length * ACTIONS.length;
    const granted = rolePermissions.size;
    return { total, granted, denied: total - granted, percentage: Math.round((granted / total) * 100) };
  }, [rolePermissions]);

  if (!isSuperAdmin()) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <Lock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold mb-2">Access Restricted</h2>
            <p className="text-sm text-muted-foreground">Only Super Admins can access this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto" data-testid="role-perspective-viewer">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
          <Eye className="h-6 w-6" />
          Role Perspective Viewer
        </h1>
        <p className="text-sm text-muted-foreground">
          See exactly what each role or user can access - screens, menus, and permissions
        </p>
      </div>

      <Tabs value={viewMode} onValueChange={(v) => { setViewMode(v as 'role' | 'user'); setSelectedRole(''); setSelectedUserId(''); setCompareRole(''); }} data-testid="tabs-view-mode">
        <TabsList>
          <TabsTrigger value="role" data-testid="tab-by-role">
            <Shield className="h-4 w-4 mr-1.5" />
            By Role
          </TabsTrigger>
          <TabsTrigger value="user" data-testid="tab-by-user">
            <Users className="h-4 w-4 mr-1.5" />
            By User
          </TabsTrigger>
        </TabsList>

        <TabsContent value="role" className="mt-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="text-sm font-medium mb-1.5 block">Select a Role</label>
              <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as AppRole)} data-testid="select-role">
                <SelectTrigger data-testid="select-role-trigger">
                  <SelectValue placeholder="Choose a role to view..." />
                </SelectTrigger>
                <SelectContent>
                  {allRoles.map(role => (
                    <SelectItem key={role} value={role} data-testid={`select-role-${role}`}>
                      {ROLE_DISPLAY_NAMES[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium mb-1.5 block">Compare with (optional)</label>
              <Select value={compareRole} onValueChange={(v) => setCompareRole(v as AppRole)} data-testid="select-compare-role">
                <SelectTrigger data-testid="select-compare-trigger">
                  <SelectValue placeholder="Compare with another role..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No comparison</SelectItem>
                  {allRoles.filter(r => r !== selectedRole).map(role => (
                    <SelectItem key={role} value={role}>
                      {ROLE_DISPLAY_NAMES[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="user" className="mt-4">
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users by name, email, or role..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="pl-9"
                data-testid="input-user-search"
              />
            </div>
            <Select value={selectedUserId} onValueChange={setSelectedUserId} data-testid="select-user">
              <SelectTrigger data-testid="select-user-trigger">
                <SelectValue placeholder="Choose a user to view their perspective..." />
              </SelectTrigger>
              <SelectContent>
                {filteredUsers.map(user => (
                  <SelectItem key={user.id} value={user.id} data-testid={`select-user-${user.id}`}>
                    {user.name} - {user.role} ({user.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </TabsContent>
      </Tabs>

      {activeRole && (
        <>
          <Card data-testid="card-role-summary">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  {viewMode === 'user' && selectedUser ? (
                    <span>{selectedUser.name} <span className="text-muted-foreground font-normal">as</span> {ROLE_DISPLAY_NAMES[activeRole]}</span>
                  ) : (
                    ROLE_DISPLAY_NAMES[activeRole]
                  )}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" data-testid="badge-permission-count">
                    {permissionStats.granted}/{permissionStats.total} permissions
                  </Badge>
                  <Badge variant="secondary" data-testid="badge-permission-percentage">
                    {permissionStats.percentage}% access
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{ROLE_DESCRIPTIONS[activeRole]}</p>
              {viewMode === 'user' && selectedUser && (
                <div className="mt-3 flex flex-wrap gap-3 text-sm">
                  <span><span className="font-medium">Email:</span> {selectedUser.email}</span>
                  <span><span className="font-medium">Hub:</span> {selectedUser.hubId || 'N/A'}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card data-testid="card-visible-screens">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Monitor className="h-4 w-4" />
                  Visible Screens & Menus
                </CardTitle>
              </CardHeader>
              <CardContent>
                {menuGroups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No menu items visible for this role.</p>
                ) : (
                  <div className="space-y-4">
                    {menuGroups.map(group => (
                      <div key={group.id} data-testid={`menu-group-${group.id}`}>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                          {group.label}
                        </h4>
                        <div className="space-y-1">
                          {group.items.map(item => {
                            const Icon = item.icon;
                            return (
                              <div
                                key={item.id}
                                className="flex items-center gap-2 py-1.5 px-2 rounded-md text-sm"
                                data-testid={`menu-item-${item.id}`}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                                {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0" />}
                                <span>{item.title}</span>
                                <span className="text-xs text-muted-foreground ml-auto">{item.url}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <Separator />
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <LayoutDashboard className="h-4 w-4" />
                      <span>Total visible screens: <strong className="text-foreground">{menuGroups.reduce((sum, g) => sum + g.items.length, 0)}</strong></span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-permission-summary">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Permission Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {RESOURCES.map(resource => {
                    const grantedActions = ACTIONS.filter(a => rolePermissions.has(`${resource}:${a}`));
                    if (grantedActions.length === 0) return null;
                    return (
                      <div key={resource} className="flex items-start gap-2 py-1" data-testid={`perm-summary-${resource}`}>
                        <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium">{RESOURCE_DISPLAY[resource]}</span>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {grantedActions.map(action => (
                              <Badge key={action} variant="secondary" className="text-[10px]">
                                {ACTION_DISPLAY[action]}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {RESOURCES.filter(r => !ACTIONS.some(a => rolePermissions.has(`${r}:${a}`))).length > 0 && (
                    <>
                      <Separator className="my-2" />
                      <p className="text-xs text-muted-foreground font-medium mb-1">No access:</p>
                      <div className="flex flex-wrap gap-1">
                        {RESOURCES.filter(r => !ACTIONS.some(a => rolePermissions.has(`${r}:${a}`))).map(resource => (
                          <Badge key={resource} variant="outline" className="text-[10px] text-muted-foreground">
                            {RESOURCE_DISPLAY[resource]}
                          </Badge>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card data-testid="card-permission-matrix">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Full Permission Matrix
                {isComparing && (
                  <Badge variant="outline" className="ml-2">
                    Comparing with {ROLE_DISPLAY_NAMES[compareRole as AppRole]}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-permission-matrix">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-4 font-medium">Resource</th>
                      {ACTIONS.map(action => (
                        <th key={action} className="text-center py-2 px-2 font-medium text-xs">
                          {ACTION_DISPLAY[action]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {RESOURCES.map(resource => (
                      <tr key={resource} className="border-b last:border-0" data-testid={`matrix-row-${resource}`}>
                        <td className="py-2 pr-4 font-medium">{RESOURCE_DISPLAY[resource]}</td>
                        {ACTIONS.map(action => {
                          const key = `${resource}:${action}`;
                          const has = rolePermissions.has(key);
                          const compareHas = comparePermissions?.has(key);
                          const showDiff = isComparing;
                          let diffIndicator = '';
                          if (showDiff) {
                            if (has && !compareHas) diffIndicator = 'extra';
                            else if (!has && compareHas) diffIndicator = 'missing';
                          }
                          return (
                            <td key={action} className="text-center py-2 px-2">
                              <div className="flex items-center justify-center">
                                {has ? (
                                  <CheckCircle2 className={`h-4 w-4 ${diffIndicator === 'extra' ? 'text-blue-500' : 'text-green-500'}`} />
                                ) : (
                                  <XCircle className={`h-4 w-4 ${diffIndicator === 'missing' ? 'text-amber-500' : 'text-muted-foreground/30'}`} />
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {isComparing && (
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-green-500" /> Both roles have
                  </span>
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-blue-500" /> Only {ROLE_DISPLAY_NAMES[activeRole]} has
                  </span>
                  <span className="flex items-center gap-1">
                    <XCircle className="h-3 w-3 text-amber-500" /> Only {ROLE_DISPLAY_NAMES[compareRole as AppRole]} has
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {!isComparing ? null : (
            <Card data-testid="card-comparison-detail">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Comparison: {ROLE_DISPLAY_NAMES[activeRole]} vs {ROLE_DISPLAY_NAMES[compareRole as AppRole]}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Shared Permissions</p>
                    <div className="space-y-1">
                      {Array.from(rolePermissions).filter(p => comparePermissions?.has(p)).map(p => {
                        const [res, act] = p.split(':');
                        return (
                          <div key={p} className="flex items-center gap-1.5 text-xs">
                            <CheckCircle2 className="h-3 w-3 text-green-500" />
                            <span>{RESOURCE_DISPLAY[res as ResourceType]} - {ACTION_DISPLAY[act as ActionType]}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-2">Only in {ROLE_DISPLAY_NAMES[activeRole]}</p>
                    <div className="space-y-1">
                      {Array.from(rolePermissions).filter(p => !comparePermissions?.has(p)).map(p => {
                        const [res, act] = p.split(':');
                        return (
                          <div key={p} className="flex items-center gap-1.5 text-xs">
                            <CheckCircle2 className="h-3 w-3 text-blue-500" />
                            <span>{RESOURCE_DISPLAY[res as ResourceType]} - {ACTION_DISPLAY[act as ActionType]}</span>
                          </div>
                        );
                      })}
                      {Array.from(rolePermissions).filter(p => !comparePermissions?.has(p)).length === 0 && (
                        <p className="text-xs text-muted-foreground">None</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-2">Only in {ROLE_DISPLAY_NAMES[compareRole as AppRole]}</p>
                    <div className="space-y-1">
                      {comparePermissions && Array.from(comparePermissions).filter((p: string) => !rolePermissions.has(p)).map((p: string) => {
                        const [res, act] = p.split(':');
                        return (
                          <div key={p} className="flex items-center gap-1.5 text-xs">
                            <XCircle className="h-3 w-3 text-amber-500" />
                            <span>{RESOURCE_DISPLAY[res as ResourceType]} - {ACTION_DISPLAY[act as ActionType]}</span>
                          </div>
                        );
                      })}
                      {comparePermissions && Array.from(comparePermissions).filter((p: string) => !rolePermissions.has(p)).length === 0 && (
                        <p className="text-xs text-muted-foreground">None</p>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {!activeRole && (
        <Card>
          <CardContent className="py-12 text-center">
            <Eye className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-1">Select a Role or User</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Choose a role from the dropdown above to see what screens and permissions that role has access to.
              You can also select a specific user to see their exact view.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
