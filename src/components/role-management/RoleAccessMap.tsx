import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  CheckCircle2, MinusCircle, XCircle, Eye, PenLine, BadgeCheck,
  Users, BarChart3, Grid3X3, Search, Info, ChevronDown, ChevronUp,
  Shield, Lock, Download,
} from 'lucide-react';
import { DEFAULT_ROLE_PERMISSIONS, RESOURCE_LABELS, ACTION_LABELS, ResourceType, ActionType, AppRole } from '@/types/roles';
import { cn } from '@/lib/utils';

// ─── Role display config ────────────────────────────────────────────────────
const ROLES: AppRole[] = [
  'SuperAdmin', 'Admin', 'CountryDirector', 'Field Operation Manager (FOM)',
  'FinancialAdmin', 'ICT', 'ProjectManager', 'SeniorOperationsLead',
  'Supervisor', 'Coordinator', 'DataTeam', 'DataCollector', 'Reviewer', 'Auditor',
];

const ROLE_SHORT: Record<string, string> = {
  SuperAdmin: 'SA', Admin: 'Ad', CountryDirector: 'CD',
  'Field Operation Manager (FOM)': 'FOM', FinancialAdmin: 'FA', ICT: 'ICT',
  ProjectManager: 'PM', SeniorOperationsLead: 'SOL', Supervisor: 'Sup',
  Coordinator: 'Crd', DataTeam: 'DT', DataCollector: 'DC', Reviewer: 'Rev', Auditor: 'Aud',
};

const ROLE_COLOR: Record<string, string> = {
  SuperAdmin: 'bg-red-600', Admin: 'bg-orange-500', CountryDirector: 'bg-blue-600',
  'Field Operation Manager (FOM)': 'bg-teal-600', FinancialAdmin: 'bg-green-600',
  ICT: 'bg-violet-600', ProjectManager: 'bg-cyan-600', SeniorOperationsLead: 'bg-indigo-600',
  Supervisor: 'bg-amber-600', Coordinator: 'bg-lime-600', DataTeam: 'bg-pink-600',
  DataCollector: 'bg-sky-600', Reviewer: 'bg-gray-500', Auditor: 'bg-slate-600',
};

// ─── Resource grouping ───────────────────────────────────────────────────────
const RESOURCE_GROUPS: { group: string; resources: ResourceType[] }[] = [
  { group: 'Administration', resources: ['users', 'roles', 'permissions', 'settings', 'system', 'super_admins', 'audit_logs'] },
  { group: 'Programme', resources: ['projects', 'portfolio', 'analytics', 'mmp', 'site_visits', 'hub_operations'] },
  { group: 'Field Operations', resources: ['safety', 'incidents', 'equipment', 'coverage_map'] },
  { group: 'Finance', resources: ['finances', 'wallets', 'accounting', 'down_payments', 'cost_submissions'] },
  { group: 'HR', resources: ['hr', 'payroll', 'leave'] },
  { group: 'Tools & Communication', resources: ['surveys', 'tasks', 'notifications', 'broadcast', 'whatsapp', 'calendar', 'signatures', 'integrations', 'transactions'] },
  { group: 'CRM & Reports', resources: ['crm', 'reports'] },
];

// ─── Derive access level from DEFAULT_ROLE_PERMISSIONS ───────────────────────
type AccessLevel = 'full' | 'read+write' | 'approve' | 'submit' | 'read' | 'export' | 'none';

function deriveAccessLevel(role: AppRole, resource: ResourceType): AccessLevel {
  const perms = DEFAULT_ROLE_PERMISSIONS[role] || [];
  const actions = perms
    .filter(p => p.resource === resource)
    .map(p => p.action);
  if (actions.length === 0) return 'none';
  if (actions.includes('delete') || (actions.includes('create') && actions.includes('update') && actions.includes('approve'))) return 'full';
  if (actions.includes('override') || actions.includes('restore')) return 'full';
  if (actions.includes('approve')) return 'approve';
  if (actions.includes('create') && actions.includes('update')) return 'read+write';
  if (actions.includes('submit')) return 'submit';
  if (actions.includes('update')) return 'read+write';
  if (actions.includes('read') || actions.includes('export')) return 'read';
  return 'none';
}

function hasAction(role: AppRole, resource: ResourceType, action: ActionType): boolean {
  return (DEFAULT_ROLE_PERMISSIONS[role] || []).some(p => p.resource === resource && p.action === action);
}

// ─── Access level visual config ───────────────────────────────────────────────
const ACCESS_CONFIG: Record<AccessLevel, { label: string; icon: any; cell: string; badge: string; dot: string }> = {
  full:       { label: 'Full',       icon: CheckCircle2, cell: 'bg-emerald-50 dark:bg-emerald-950/40',  badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', dot: 'bg-emerald-500' },
  'read+write':{ label: 'Read+Write', icon: PenLine,      cell: 'bg-cyan-50 dark:bg-cyan-950/30',        badge: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300', dot: 'bg-cyan-500' },
  approve:    { label: 'Approve',    icon: BadgeCheck,    cell: 'bg-violet-50 dark:bg-violet-950/30',    badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300', dot: 'bg-violet-500' },
  submit:     { label: 'Submit',     icon: PenLine,       cell: 'bg-amber-50 dark:bg-amber-950/30',      badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', dot: 'bg-amber-500' },
  read:       { label: 'Read',       icon: Eye,           cell: 'bg-blue-50 dark:bg-blue-950/30',        badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', dot: 'bg-blue-500' },
  export:     { label: 'Export',     icon: Download,      cell: 'bg-sky-50 dark:bg-sky-950/30',          badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300', dot: 'bg-sky-500' },
  none:       { label: 'None',       icon: XCircle,       cell: '',                                       badge: 'bg-gray-100 text-gray-400 dark:bg-gray-800/40 dark:text-gray-500', dot: 'bg-gray-300' },
};

// ─── Permission detail popover ────────────────────────────────────────────────
function PermissionDetail({ role, resource }: { role: AppRole; resource: ResourceType }) {
  const perms = (DEFAULT_ROLE_PERMISSIONS[role] || []).filter(p => p.resource === resource);
  if (perms.length === 0) return <span className="text-xs text-muted-foreground">No access</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {perms.map(p => (
        <Badge key={p.action} variant="outline" className="text-[10px] px-1.5 py-0">
          {ACTION_LABELS[p.action as ActionType] || p.action}
        </Badge>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function RoleAccessMap() {
  const [search, setSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(RESOURCE_GROUPS.map(g => g.group)));
  const [selectedRole, setSelectedRole] = useState<AppRole | null>(null);
  const [activeTab, setActiveTab] = useState<'matrix' | 'role-detail' | 'legend'>('matrix');

  const filteredGroups = useMemo(() => {
    const q = search.toLowerCase();
    return RESOURCE_GROUPS.map(g => ({
      ...g,
      resources: g.resources.filter(r =>
        RESOURCE_LABELS[r]?.toLowerCase().includes(q) || r.toLowerCase().includes(q)
      ),
    })).filter(g => g.resources.length > 0);
  }, [search]);

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(group) ? next.delete(group) : next.add(group);
      return next;
    });
  };

  // Role detail: show all resources for a selected role with actions
  const roleDetailGroups = useMemo(() => {
    if (!selectedRole) return [];
    return RESOURCE_GROUPS.map(g => ({
      ...g,
      resources: g.resources.filter(r => {
        const perms = (DEFAULT_ROLE_PERMISSIONS[selectedRole] || []).filter(p => p.resource === r);
        return perms.length > 0;
      }),
    })).filter(g => g.resources.length > 0);
  }, [selectedRole]);

  return (
    <TooltipProvider>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Grid3X3 className="h-5 w-5 text-blue-600" />
                Live Permission Matrix
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Derived from DEFAULT_ROLE_PERMISSIONS — reflects current role definitions in real time
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search module…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 h-8 text-xs w-44"
                />
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Tabs value={activeTab} onValueChange={v => setActiveTab(v as any)}>
            <div className="px-6 border-b">
              <TabsList className="h-9 mb-0 rounded-none border-0 bg-transparent gap-1">
                <TabsTrigger value="matrix" className="text-xs h-8 data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none">
                  <Grid3X3 className="h-3.5 w-3.5 mr-1" /> Permission Matrix
                </TabsTrigger>
                <TabsTrigger value="role-detail" className="text-xs h-8 data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none">
                  <Shield className="h-3.5 w-3.5 mr-1" /> Role Deep-Dive
                </TabsTrigger>
                <TabsTrigger value="legend" className="text-xs h-8 data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none">
                  <Info className="h-3.5 w-3.5 mr-1" /> Legend
                </TabsTrigger>
              </TabsList>
            </div>

            {/* ── Matrix Tab ── */}
            <TabsContent value="matrix" className="mt-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse min-w-[900px]">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="py-2.5 px-4 text-left font-semibold text-muted-foreground w-44 sticky left-0 bg-muted/60 z-10">
                        Module / Resource
                      </th>
                      {ROLES.map(role => (
                        <th key={role} className="py-2 px-1 text-center">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className={cn(
                                'inline-flex items-center justify-center w-9 h-6 rounded text-[10px] font-bold text-white cursor-default',
                                ROLE_COLOR[role] || 'bg-gray-500'
                              )}>
                                {ROLE_SHORT[role] || role.slice(0, 2)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">{role}</TooltipContent>
                          </Tooltip>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGroups.map(({ group, resources }) => (
                      <>
                        {/* Group header row */}
                        <tr
                          key={`group-${group}`}
                          className="bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors"
                          onClick={() => toggleGroup(group)}
                        >
                          <td colSpan={ROLES.length + 1} className="py-1.5 px-4 font-semibold text-muted-foreground text-[11px] uppercase tracking-wider sticky left-0">
                            <span className="flex items-center gap-1.5">
                              {expandedGroups.has(group) ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
                              {group}
                            </span>
                          </td>
                        </tr>

                        {/* Resource rows */}
                        {expandedGroups.has(group) && resources.map(resource => (
                          <tr key={resource} className="border-b border-border/40 hover:bg-muted/10 transition-colors">
                            <td className="py-2 px-4 font-medium text-foreground sticky left-0 bg-background z-10 border-r border-border/30">
                              {RESOURCE_LABELS[resource] || resource}
                            </td>
                            {ROLES.map(role => {
                              const level = deriveAccessLevel(role, resource);
                              const cfg = ACCESS_CONFIG[level];
                              const Icon = cfg.icon;
                              return (
                                <td key={role} className={cn('py-1.5 px-1 text-center', cfg.cell)}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="flex flex-col items-center gap-0.5 cursor-default">
                                        <Icon className={cn('h-3.5 w-3.5', level === 'none' ? 'text-muted-foreground/30' : level === 'full' ? 'text-emerald-600' : level === 'approve' ? 'text-violet-600' : level === 'read+write' ? 'text-cyan-600' : level === 'submit' ? 'text-amber-600' : 'text-blue-500')} />
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-xs">
                                      <div className="space-y-1">
                                        <p className="font-semibold text-xs">{role} → {RESOURCE_LABELS[resource]}</p>
                                        <p className="text-[10px] text-muted-foreground">{cfg.label} access</p>
                                        <PermissionDetail role={role} resource={resource} />
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Legend row */}
              <div className="px-6 py-3 border-t flex flex-wrap gap-3 text-[10px]">
                {(Object.entries(ACCESS_CONFIG) as [AccessLevel, any][]).filter(([k]) => k !== 'export').map(([level, cfg]) => {
                  const Icon = cfg.icon;
                  return (
                    <span key={level} className="flex items-center gap-1 text-muted-foreground">
                      <Icon className="h-3 w-3" />
                      {cfg.label}
                    </span>
                  );
                })}
              </div>
            </TabsContent>

            {/* ── Role Deep-Dive Tab ── */}
            <TabsContent value="role-detail" className="mt-0 p-6 space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-3">Select a role to see every action it can perform across all modules.</p>
                <div className="flex flex-wrap gap-2">
                  {ROLES.map(role => (
                    <button
                      key={role}
                      onClick={() => setSelectedRole(role === selectedRole ? null : role)}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all',
                        selectedRole === role
                          ? 'text-white ring-2 ring-offset-1 ' + (ROLE_COLOR[role] || 'bg-gray-500')
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      )}
                      style={selectedRole === role ? {} : {}}
                    >
                      <span className={cn('w-2 h-2 rounded-full', ROLE_COLOR[role] || 'bg-gray-400')} />
                      {ROLE_SHORT[role] || role}
                    </button>
                  ))}
                </div>
              </div>

              {selectedRole && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className={cn('px-3 py-1 rounded-full text-xs font-bold text-white', ROLE_COLOR[selectedRole])}>
                      {selectedRole}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      — {(DEFAULT_ROLE_PERMISSIONS[selectedRole] || []).length} permission entries across {roleDetailGroups.length} groups
                    </span>
                  </div>

                  {roleDetailGroups.map(({ group, resources }) => (
                    <Card key={group} className="border-border/60">
                      <CardHeader className="py-2.5 px-4 pb-2">
                        <CardTitle className="text-sm font-semibold text-muted-foreground">{group}</CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-3 pt-0">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {resources.map(resource => {
                            const actions = (DEFAULT_ROLE_PERMISSIONS[selectedRole] || [])
                              .filter(p => p.resource === resource)
                              .map(p => p.action as ActionType);
                            return (
                              <div key={resource} className="flex items-start gap-2 p-2 rounded-lg bg-muted/30 border border-border/30">
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium truncate">{RESOURCE_LABELS[resource]}</p>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {actions.map(a => (
                                      <Badge key={a} variant="outline" className="text-[9px] px-1.5 py-0 h-4">
                                        {ACTION_LABELS[a] || a}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {!selectedRole && (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                  <Shield className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm">Select a role above to inspect its full permission set</p>
                </div>
              )}
            </TabsContent>

            {/* ── Legend Tab ── */}
            <TabsContent value="legend" className="mt-0 p-6 space-y-6">
              <div>
                <h3 className="text-sm font-semibold mb-3">Access Level Key</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(Object.entries(ACCESS_CONFIG) as [AccessLevel, any][]).map(([level, cfg]) => {
                    const Icon = cfg.icon;
                    return (
                      <div key={level} className={cn('flex items-start gap-3 p-3 rounded-lg border', cfg.cell || 'border-border/40')}>
                        <Icon className="h-5 w-5 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-semibold">{cfg.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {level === 'full' && 'Can create, read, update, delete, and approve. Highest access.'}
                            {level === 'read+write' && 'Can read and modify records but cannot approve or delete.'}
                            {level === 'approve' && 'Can approve or reject items submitted by others.'}
                            {level === 'submit' && 'Can submit items for approval but cannot approve themselves.'}
                            {level === 'read' && 'Read-only access. Can view and export but not change.'}
                            {level === 'export' && 'Can only export data. No create/update/delete.'}
                            {level === 'none' && 'No access. Module is hidden or blocked for this role.'}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-3">Role Codes</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {ROLES.map(role => (
                    <div key={role} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 border border-border/30">
                      <span className={cn('inline-flex items-center justify-center w-8 h-6 rounded text-[10px] font-bold text-white flex-shrink-0', ROLE_COLOR[role])}>
                        {ROLE_SHORT[role]}
                      </span>
                      <span className="text-xs truncate">{role}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20 p-4">
                <div className="flex items-start gap-2">
                  <Lock className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-amber-800 dark:text-amber-300 space-y-1">
                    <p className="font-semibold">How permissions are applied</p>
                    <p>This matrix shows default role permissions from the system codebase. Per-user overrides (set in the "User Permission Overrides" tab) can grant or block specific actions for individual users on top of these defaults.</p>
                    <p>SuperAdmin always bypasses all checks regardless of any override.</p>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
