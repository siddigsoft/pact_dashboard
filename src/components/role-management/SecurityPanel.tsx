import { useState, useCallback, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { useRoleManagement } from '@/context/role-management/RoleManagementContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { PAGE_DEFS, hasDefaultAccess } from '@/pages/PageAccessControl';
import { MODULE_REGISTRY } from '@/types/moduleRegistry';
import { DEFAULT_ROLE_PERMISSIONS, AppRole, ResourceType, ActionType } from '@/types/roles';
import {
  Search, Shield, Lock, Unlock, CheckCircle2, XCircle, MinusCircle,
  Users, ChevronRight, ChevronDown, RefreshCw, Loader2, UserCircle2,
  Layers, AlertCircle, Pencil, Eye,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// ─── Role catalogue ──────────────────────────────────────────────────────────
const ALL_ROLES: { code: string; label: string; color: string }[] = [
  { code: 'superAdmin',          label: 'Super Admin',        color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  { code: 'admin',               label: 'Admin',              color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  { code: 'countryDirector',     label: 'Country Director',   color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  { code: 'ict',                 label: 'ICT',                color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  { code: 'fom',                 label: 'Field Ops Manager',  color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' },
  { code: 'financialAdmin',      label: 'Finance Admin',      color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' },
  { code: 'projectManager',      label: 'Project Manager',    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  { code: 'seniorOperationsLead',label: 'Senior Ops Lead',    color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300' },
  { code: 'supervisor',          label: 'Supervisor',         color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300' },
  { code: 'coordinator',         label: 'Coordinator',        color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  { code: 'dataTeam',            label: 'Data Team',          color: 'bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-300' },
  { code: 'dataCollector',       label: 'Data Collector',     color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  { code: 'reviewer',            label: 'Reviewer',           color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  { code: 'auditor',             label: 'Auditor',            color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
];

const ROLE_CODE_TO_APP_ROLE: Record<string, AppRole> = {
  superAdmin: 'SuperAdmin', admin: 'Admin', countryDirector: 'CountryDirector',
  ict: 'ICT', fom: 'Field Operation Manager (FOM)', financialAdmin: 'FinancialAdmin',
  projectManager: 'ProjectManager', seniorOperationsLead: 'SeniorOperationsLead',
  supervisor: 'Supervisor', coordinator: 'Coordinator', dataTeam: 'DataTeam',
  dataCollector: 'DataCollector', reviewer: 'Reviewer', auditor: 'Auditor',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function initials(name: string | null) {
  return (name ?? '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}
function roleMeta(code: string) {
  return ALL_ROLES.find(r => r.code === code) ?? { code, label: code, color: 'bg-slate-100 text-slate-600' };
}
function roleHasAction(roleCode: string, resource: ResourceType, action: ActionType): boolean {
  if (roleCode === 'superAdmin') return true;
  const appRole = ROLE_CODE_TO_APP_ROLE[roleCode];
  if (!appRole) return false;
  return (DEFAULT_ROLE_PERMISSIONS[appRole] ?? []).some(p => p.resource === resource && p.action === action);
}
function findPageDef(route: string) {
  const norm = (s: string) => s.replace(/\/$/, '');
  return PAGE_DEFS.find(p => norm(p.path) === norm(route));
}

// ─── Status pill ─────────────────────────────────────────────────────────────
type Eff = 'superadmin' | 'grant-ov' | 'block-ov' | 'role-yes' | 'role-no';

function StatusPill({ eff, small }: { eff: Eff; small?: boolean }) {
  const size = small ? 'text-[9px] px-1 py-0' : 'text-[10px] px-1.5 py-0.5';
  if (eff === 'superadmin') return (
    <span className={cn('rounded-full font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 flex items-center gap-0.5', size)}>
      <Shield className="h-2.5 w-2.5" /> Full
    </span>
  );
  if (eff === 'grant-ov') return (
    <span className={cn('rounded-full font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 flex items-center gap-0.5', size)}>
      <CheckCircle2 className="h-2.5 w-2.5" /> Granted
    </span>
  );
  if (eff === 'block-ov') return (
    <span className={cn('rounded-full font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 flex items-center gap-0.5', size)}>
      <XCircle className="h-2.5 w-2.5" /> Blocked
    </span>
  );
  if (eff === 'role-yes') return (
    <span className={cn('rounded-full font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 flex items-center gap-0.5', size)}>
      <CheckCircle2 className="h-2.5 w-2.5" /> Role Access
    </span>
  );
  return (
    <span className={cn('rounded-full font-semibold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 flex items-center gap-0.5', size)}>
      <MinusCircle className="h-2.5 w-2.5" /> No Access
    </span>
  );
}

// ─── By-Role view ─────────────────────────────────────────────────────────────
function ByRoleView({ users: allUsers }: { users: any[] }) {
  const { roles, updateRole, fetchRoles } = useRoleManagement();
  const { currentUser } = useAppContext();
  const { toast } = useToast();

  // Derive edit capability directly — never rely on a prop that may be stale
  const rawMyRole: string = (currentUser as any)?.role ?? '';
  const canEdit = rawMyRole === 'superAdmin';
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [search, setSearch] = useState('');
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set(['Administration']));
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const filteredRoles = ALL_ROLES.filter(r =>
    !search || r.label.toLowerCase().includes(search.toLowerCase())
  );

  const roleUsers = useMemo(() =>
    allUsers.filter(u => (u as any).role === selectedRole),
    [allUsers, selectedRole]
  );

  const roleMeta_ = roleMeta(selectedRole);
  const [pagesOpen, setPagesOpen] = useState(false);

  // Use live DB role when available, fall back to defaults
  const liveRole = useMemo(() =>
    roles.find(r => r.name === selectedRole || r.code === selectedRole),
    [roles, selectedRole]
  );
  const livePerms = liveRole?.permissions ?? [];

  // Check if role has action: live DB first, then DEFAULT_ROLE_PERMISSIONS as fallback
  function liveRoleHasAction(resource: ResourceType, action: ActionType): boolean {
    if (selectedRole === 'superAdmin') return true;
    if (liveRole) {
      return livePerms.some(p => p.resource === resource && p.action === action);
    }
    return roleHasAction(selectedRole, resource, action);
  }

  const permCount = MODULE_REGISTRY.flatMap(m => m.pages.flatMap(p => p.actions))
    .filter(a => liveRoleHasAction(a.resource, a.action)).length;
  const totalActions = MODULE_REGISTRY.flatMap(m => m.pages.flatMap(p => p.actions)).length;
  const accessiblePages = PAGE_DEFS.filter(p => hasDefaultAccess(p, selectedRole));
  const isSystemRole = liveRole?.is_system_role ?? true;
  // Only superAdmin role itself is fully protected (Super Admin cannot edit their own role)
  const isProtected = selectedRole === 'superAdmin';

  // ── Toggle role-level permission ──────────────────────────────────────────
  async function handleToggleRolePerm(resource: ResourceType, action: ActionType, currentlyHas: boolean) {
    if (!liveRole || !canEdit || isProtected) return;
    const key = `${resource}:${action}`;
    setSavingKey(key);
    try {
      const currentPerms = livePerms.map(p => ({
        resource: p.resource as ResourceType,
        action: p.action as ActionType,
      }));
      const newPerms = currentlyHas
        ? currentPerms.filter(p => !(p.resource === resource && p.action === action))
        : [...currentPerms, { resource, action }];
      const ok = await updateRole(liveRole.id, { permissions: newPerms });
      if (ok) {
        // Wait for fetchRoles to complete so UI reflects the change immediately.
        // updateRole() already shows a "Role updated" toast — no duplicate needed.
        await fetchRoles();
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSavingKey(null);
    }
  }

  function toggleModule(mod: string) {
    setExpandedModules(prev => {
      const next = new Set(prev);
      next.has(mod) ? next.delete(mod) : next.add(mod);
      return next;
    });
  }

  return (
    <div className="flex min-h-[680px]">
      {/* Left: role list */}
      <div className="w-56 shrink-0 border-r flex flex-col bg-muted/20">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Filter roles…" className="pl-8 h-8 text-xs" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredRoles.map(r => (
            <button key={r.code} onClick={() => { setSelectedRole(r.code); setExpandedModules(new Set(MODULE_REGISTRY.map(m => m.module))); setPagesOpen(false); }}
              data-testid={`role-select-${r.code}`}
              className={cn('w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-all border-b border-transparent',
                selectedRole === r.code ? 'bg-primary/10 border-l-2 border-l-primary' : 'hover:bg-muted/60'
              )}>
              <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0', r.color)}>
                {r.label.split(' ').map(w => w[0]).join('').slice(0, 3)}
              </span>
              <span className="text-xs font-medium truncate">{r.label}</span>
              <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                {allUsers.filter(u => (u as any).role === r.code).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Right: role detail */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!selectedRole ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8 py-16 text-muted-foreground">
            <Layers className="h-10 w-10 opacity-30" />
            <p className="text-sm font-medium">Select a role from the left</p>
            <p className="text-xs opacity-60 max-w-xs">
              See every action button per page. {canEdit ? 'Click Grant or Revoke on any action to change it for the whole role.' : 'Super Admin can grant or revoke individual actions.'}
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* Role header */}
            <div className="px-5 py-3 border-b bg-card sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center shrink-0', roleMeta_.color)}>
                  <Shield className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold">{roleMeta_.label}</h3>
                    {isSystemRole && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 font-medium">System</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" />{roleUsers.length} users</span>
                    <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-blue-500" />{accessiblePages.length} pages</span>
                    <span className="flex items-center gap-1"><Shield className="h-3 w-3 text-purple-500" />{permCount}/{totalActions} actions</span>
                  </div>
                </div>
                {/* Edit mode badge — only when editing is actually possible */}
                {canEdit && !isProtected && (
                  <span className="flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800/40 rounded-lg px-2 py-1 shrink-0">
                    <Pencil className="h-3 w-3" /> Edit mode — Grant / Revoke below
                  </span>
                )}
                {canEdit && isProtected && (
                  <span className="flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800/40 rounded-lg px-2 py-1 shrink-0">
                    <Lock className="h-3 w-3" /> Protected role
                  </span>
                )}
              </div>
            </div>

            {/* Locked role notices */}
            {selectedRole === 'superAdmin' && (
              <div className="mx-5 mt-4 p-3 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-900/10 dark:border-amber-800/30 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300">
                <Lock className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Super Admin cannot be edited</p>
                  <p className="opacity-80 mt-0.5">This role always has full unrestricted access to everything. Select a different role to see Grant / Revoke buttons.</p>
                </div>
              </div>
            )}

            <div className="p-5 space-y-4">
              {/* Users row */}
              <section>
                <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" /> Users ({roleUsers.length})
                </h4>
                {roleUsers.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No users assigned to this role</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {roleUsers.map(u => (
                      <div key={u.id} className="flex items-center gap-1.5 bg-muted/40 border rounded-lg px-2 py-1">
                        <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold shrink-0">
                          {initials(u.name ?? null)}
                        </div>
                        <span className="text-xs font-medium truncate max-w-[120px]">{u.name ?? u.email}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Pages — collapsible to save space */}
              <section>
                <button
                  onClick={() => setPagesOpen(v => !v)}
                  className="w-full flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="btn-toggle-pages-section">
                  {pagesOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />
                  Accessible Pages ({accessiblePages.length} of {PAGE_DEFS.length})
                  <span className="ml-auto text-[10px] font-normal normal-case text-muted-foreground/70">
                    {pagesOpen ? 'Click to collapse' : 'Click to expand'}
                  </span>
                </button>
                {pagesOpen && (
                  <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-1.5">
                    {PAGE_DEFS.map(p => {
                      const ok = hasDefaultAccess(p, selectedRole);
                      return (
                        <div key={p.slug} className={cn('flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[11px]',
                          ok ? 'bg-blue-50/50 border-blue-100 text-blue-800 dark:bg-blue-900/10 dark:border-blue-800/30 dark:text-blue-300'
                             : 'bg-muted/20 border-transparent text-muted-foreground/50')}>
                          {ok ? <CheckCircle2 className="h-3 w-3 shrink-0 text-blue-500" /> : <MinusCircle className="h-3 w-3 shrink-0 opacity-30" />}
                          <span className="truncate">{p.label}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Module actions — immediately visible, all expanded by default */}
              <section>
                <div className="flex items-center gap-3 mb-3">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5 text-purple-500" />
                    Module Permissions — Action Buttons Per Page
                    <span className="text-purple-600 dark:text-purple-400 font-semibold">({permCount}/{totalActions})</span>
                  </h4>
                  <div className="ml-auto flex items-center gap-1.5">
                    <button
                      onClick={() => setExpandedModules(new Set(MODULE_REGISTRY.map(m => m.module)))}
                      className="text-[10px] text-muted-foreground hover:text-foreground border rounded px-2 py-0.5 transition-colors">
                      Expand All
                    </button>
                    <button
                      onClick={() => setExpandedModules(new Set())}
                      className="text-[10px] text-muted-foreground hover:text-foreground border rounded px-2 py-0.5 transition-colors">
                      Collapse All
                    </button>
                  </div>
                </div>

                {canEdit && !isProtected && (
                  <div className="mb-3 p-2.5 rounded-lg bg-emerald-50 border border-emerald-100 dark:bg-emerald-900/10 dark:border-emerald-800/20 flex items-center gap-2 text-[11px] text-emerald-700 dark:text-emerald-300">
                    <Pencil className="h-3.5 w-3.5 shrink-0" />
                    You can <strong>Grant</strong> or <strong>Revoke</strong> any action below — changes apply to everyone in the <strong>{roleMeta_.label}</strong> role immediately.
                  </div>
                )}

                <div className="space-y-2">
                  {MODULE_REGISTRY.map(mod => {
                    const isOpen = expandedModules.has(mod.module);
                    const allActions = mod.pages.flatMap(pg => pg.actions);
                    const grantedCount = allActions.filter(a => liveRoleHasAction(a.resource, a.action)).length;
                    return (
                      <div key={mod.module} className="border rounded-xl overflow-hidden">
                        <button onClick={() => toggleModule(mod.module)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                          data-testid={`role-module-${mod.module}`}>
                          {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                          <span className="text-sm font-semibold flex-1">{mod.module}</span>
                          <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                            grantedCount > 0 ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300'
                                             : 'bg-slate-100 text-slate-400')}>
                            {grantedCount}/{allActions.length}
                          </span>
                        </button>
                        {isOpen && (
                          <div className="divide-y">
                            {mod.pages.map(pg => (
                              <div key={pg.page} className="px-4 py-2.5">
                                <p className="text-[11px] font-semibold text-foreground/70 mb-2 flex items-center gap-1.5">
                                  <Eye className="h-3 w-3 text-blue-500" />
                                  {pg.page}
                                  <span className="text-[9px] font-normal text-muted-foreground/60">— buttons visible on this page</span>
                                </p>
                                <div className="space-y-1">
                                  {pg.actions.map(act => {
                                    const has = liveRoleHasAction(act.resource, act.action);
                                    const sKey = `${act.resource}:${act.action}`;
                                    const isSaving = savingKey === sKey;
                                    return (
                                      <div key={act.key}
                                        className={cn('flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition-colors',
                                          has ? 'bg-purple-50/60 dark:bg-purple-900/5' : 'bg-muted/20 opacity-60')}>
                                        {has
                                          ? <CheckCircle2 className="h-3.5 w-3.5 text-purple-500 shrink-0" />
                                          : <XCircle className="h-3.5 w-3.5 text-slate-300 shrink-0" />}
                                        <div className="flex-1 min-w-0">
                                          <span className="font-semibold">{act.label}</span>
                                          <span className="text-[10px] text-muted-foreground ml-2 hidden sm:inline">{act.description}</span>
                                        </div>
                                        <span className="text-[9px] text-muted-foreground/40 font-mono hidden lg:block shrink-0">
                                          {act.resource}:{act.action}
                                        </span>
                                        {/* Grant / Revoke — Super Admin editing non-superAdmin, non-admin roles */}
                                        {canEdit && !isProtected ? (
                                          <button
                                            onClick={() => handleToggleRolePerm(act.resource, act.action, has)}
                                            disabled={isSaving}
                                            data-testid={`btn-role-perm-toggle-${act.key}`}
                                            className={cn(
                                              'text-[10px] border rounded px-2.5 py-1 shrink-0 font-semibold transition-colors disabled:opacity-50 min-w-[52px] text-center',
                                              has
                                                ? 'text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-900/10'
                                                : 'text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:hover:bg-emerald-900/10'
                                            )}>
                                            {isSaving
                                              ? <Loader2 className="h-3 w-3 animate-spin mx-auto" />
                                              : has ? 'Revoke' : 'Grant'}
                                          </button>
                                        ) : null}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── By-User view ─────────────────────────────────────────────────────────────
function ByUserView({ users: allUsers, isSuperAdmin }: { users: any[]; isSuperAdmin: boolean }) {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [pageOverrides, setPageOverrides] = useState<any[]>([]);
  const [permOverrides, setPermOverrides] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());
  const [moduleSearch, setModuleSearch] = useState('');

  const filteredUsers = allUsers.filter(u =>
    !search ||
    (u.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (u.email ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const selectedUser = allUsers.find(u => u.id === selectedId);
  const rawRole: string = (selectedUser as any)?.role ?? '';
  const isSA = rawRole === 'superAdmin';

  // ── Load overrides ─────────────────────────────────────────────────────────
  const loadData = useCallback(async (uid: string) => {
    setLoading(true);
    try {
      const [pageRes, permRes] = await Promise.all([
        supabase.from('page_access_overrides').select('*').eq('user_id', uid),
        supabase.from('user_permission_overrides').select('*').eq('user_id', uid),
      ]);
      setPageOverrides(pageRes.data ?? []);
      setPermOverrides(permRes.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) { loadData(selectedId); setExpandedModules(new Set()); setExpandedPages(new Set()); }
  }, [selectedId, loadData]);

  // ── Derived maps ───────────────────────────────────────────────────────────
  const pageOvMap: Record<string, any> = Object.fromEntries(pageOverrides.map(o => [o.page_slug, o]));
  const permOvMap: Record<string, boolean> = Object.fromEntries(
    permOverrides.map(o => [`${o.resource}:${o.action}`, o.is_granted as boolean])
  );

  // ── Effective status ────────────────────────────────────────────────────────
  function effectivePage(slug: string): Eff {
    if (isSA) return 'superadmin';
    const ov = pageOvMap[slug];
    if (ov) return ov.is_blocked ? 'block-ov' : 'grant-ov';
    const def = PAGE_DEFS.find(p => p.slug === slug);
    return def && hasDefaultAccess(def, rawRole) ? 'role-yes' : 'role-no';
  }

  function effectiveAction(resource: ResourceType, action: ActionType): Eff {
    if (isSA) return 'superadmin';
    const key = `${resource}:${action}`;
    if (key in permOvMap) return permOvMap[key] ? 'grant-ov' : 'block-ov';
    return roleHasAction(rawRole, resource, action) ? 'role-yes' : 'role-no';
  }

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const accessiblePageCount = PAGE_DEFS.filter(p => {
    const eff = effectivePage(p.slug);
    return eff === 'superadmin' || eff === 'grant-ov' || eff === 'role-yes';
  }).length;
  const blockedOverrides = pageOverrides.filter(o => o.is_blocked).length;
  const grantedOverrides = pageOverrides.filter(o => !o.is_blocked).length;
  const actionOverrides = permOverrides.length;

  // ── Toggle page access ─────────────────────────────────────────────────────
  async function togglePage(slug: string) {
    if (!selectedId || isSA) return;
    setSavingKey(`page:${slug}`);
    const eff = effectivePage(slug);
    try {
      if (eff === 'grant-ov' || eff === 'block-ov') {
        // Remove override → restore role default
        await supabase.from('page_access_overrides').delete().eq('user_id', selectedId).eq('page_slug', slug);
        toast({ title: 'Override removed', description: `${slug} restored to role default.` });
      } else if (eff === 'role-yes') {
        // Block this page for user
        const { error } = await supabase.from('page_access_overrides').upsert(
          { user_id: selectedId, page_slug: slug, is_blocked: true },
          { onConflict: 'user_id,page_slug' }
        );
        if (error) throw error;
        toast({ title: 'Page blocked', description: `${slug} is now blocked for this user.` });
      } else {
        // Grant this page to user
        const { error } = await supabase.from('page_access_overrides').upsert(
          { user_id: selectedId, page_slug: slug, is_blocked: false },
          { onConflict: 'user_id,page_slug' }
        );
        if (error) throw error;
        toast({ title: 'Page granted', description: `${slug} is now accessible for this user.` });
      }
      await loadData(selectedId);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSavingKey(null);
    }
  }

  // ── Toggle action ──────────────────────────────────────────────────────────
  async function toggleAction(resource: ResourceType, action: ActionType) {
    if (!selectedId || isSA) return;
    const key = `${resource}:${action}`;
    setSavingKey(`perm:${key}`);
    const eff = effectiveAction(resource, action);
    try {
      if (eff === 'grant-ov' || eff === 'block-ov') {
        // Remove override
        await supabase.from('user_permission_overrides')
          .delete().eq('user_id', selectedId).eq('resource', resource).eq('action', action);
        toast({ title: 'Override removed', description: `${resource}:${action} restored to role default.` });
      } else if (eff === 'role-yes') {
        // Block this action for user
        const { error } = await supabase.from('user_permission_overrides').upsert(
          { user_id: selectedId, resource, action, is_granted: false },
          { onConflict: 'user_id,resource,action' }
        );
        if (error) throw error;
        toast({ title: 'Permission blocked', description: `${action} on ${resource} blocked for this user.` });
      } else {
        // Grant this action to user
        const { error } = await supabase.from('user_permission_overrides').upsert(
          { user_id: selectedId, resource, action, is_granted: true },
          { onConflict: 'user_id,resource,action' }
        );
        if (error) throw error;
        toast({ title: 'Permission granted', description: `${action} on ${resource} granted to this user.` });
      }
      await loadData(selectedId);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSavingKey(null);
    }
  }

  // ── Toggle helpers ─────────────────────────────────────────────────────────
  function toggleModule(mod: string) {
    setExpandedModules(prev => { const n = new Set(prev); n.has(mod) ? n.delete(mod) : n.add(mod); return n; });
  }
  function togglePageSection(key: string) {
    setExpandedPages(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  // ── Toggle button label/style ───────────────────────────────────────────────
  function pageToggleProps(eff: Eff): { label: string; cls: string } {
    if (eff === 'superadmin') return { label: '—', cls: 'opacity-30 cursor-default' };
    if (eff === 'grant-ov')   return { label: 'Remove Grant',  cls: 'text-amber-600 border-amber-200 hover:bg-amber-50 dark:hover:bg-amber-900/10' };
    if (eff === 'block-ov')   return { label: 'Remove Block',  cls: 'text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:hover:bg-emerald-900/10' };
    if (eff === 'role-yes')   return { label: 'Block for User',cls: 'text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-900/10' };
    return { label: 'Grant to User', cls: 'text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:hover:bg-emerald-900/10' };
  }
  function actionToggleProps(eff: Eff): { label: string; cls: string } {
    if (eff === 'superadmin') return { label: '—', cls: 'opacity-30 cursor-default' };
    if (eff === 'grant-ov')   return { label: 'Remove Grant',  cls: 'text-amber-600 border-amber-200 hover:bg-amber-50 dark:hover:bg-amber-900/10' };
    if (eff === 'block-ov')   return { label: 'Remove Block',  cls: 'text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:hover:bg-emerald-900/10' };
    if (eff === 'role-yes')   return { label: 'Block',         cls: 'text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-900/10' };
    return { label: 'Grant', cls: 'text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:hover:bg-emerald-900/10' };
  }

  // ── Row background by effective status ────────────────────────────────────
  function pageRowCls(eff: Eff) {
    if (eff === 'grant-ov')  return 'bg-emerald-50/40 border-emerald-100 dark:bg-emerald-900/5 dark:border-emerald-800/30';
    if (eff === 'block-ov')  return 'bg-red-50/40 border-red-100 dark:bg-red-900/5 dark:border-red-800/30';
    if (eff === 'role-yes')  return 'bg-blue-50/30 border-blue-100/50 dark:bg-blue-900/5 dark:border-blue-800/20';
    if (eff === 'superadmin')return 'bg-red-50/20 border-red-100/30 dark:bg-red-900/5 dark:border-red-800/20';
    return 'bg-card border-transparent opacity-60';
  }
  function actionRowCls(eff: Eff) {
    if (eff === 'grant-ov')  return 'bg-emerald-50/60 border-l-2 border-l-emerald-400';
    if (eff === 'block-ov')  return 'bg-red-50/60 border-l-2 border-l-red-400 opacity-60';
    if (eff === 'role-yes')  return 'bg-blue-50/20';
    if (eff === 'superadmin')return 'bg-red-50/10';
    return 'opacity-35';
  }

  // ── Filter modules by search ───────────────────────────────────────────────
  const filteredModules = useMemo(() => {
    if (!moduleSearch) return MODULE_REGISTRY;
    const q = moduleSearch.toLowerCase();
    return MODULE_REGISTRY.map(mod => ({
      ...mod,
      pages: mod.pages.map(pg => ({
        ...pg,
        actions: pg.actions.filter(a =>
          a.label.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.resource.toLowerCase().includes(q)
        ),
      })).filter(pg => pg.actions.length > 0 || pg.page.toLowerCase().includes(q)),
    })).filter(mod => mod.pages.length > 0 || mod.module.toLowerCase().includes(q));
  }, [moduleSearch]);

  return (
    <div className="flex min-h-[680px]">
      {/* Left: user list */}
      <div className="w-60 shrink-0 border-r flex flex-col bg-muted/20">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search users…" className="pl-8 h-8 text-xs"
              data-testid="input-security-user-search" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredUsers.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-8">No users found</p>
          ) : filteredUsers.map(u => {
            const meta = roleMeta((u as any).role ?? '');
            return (
              <button key={u.id} onClick={() => setSelectedId(u.id)}
                data-testid={`user-security-select-${u.id}`}
                className={cn('w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-all border-b border-transparent',
                  selectedId === u.id ? 'bg-primary/10 border-l-2 border-l-primary' : 'hover:bg-muted/60')}>
                <div className={cn('h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
                  selectedId === u.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                  {initials(u.name ?? null)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{u.name ?? 'Unknown'}</p>
                  <p className={cn('text-[10px] font-semibold truncate', meta.color.split(' ').slice(0, 2).join(' '))}>
                    {meta.label}
                  </p>
                </div>
                {selectedId === u.id && <ChevronRight className="h-3 w-3 text-primary shrink-0" />}
              </button>
            );
          })}
        </div>
        <div className="p-2 border-t">
          <p className="text-[10px] text-center text-muted-foreground">{filteredUsers.length} users</p>
        </div>
      </div>

      {/* Right: user detail */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!selectedId ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8 py-16 text-muted-foreground">
            <UserCircle2 className="h-12 w-12 opacity-20" />
            <div>
              <p className="text-sm font-semibold">Select a user</p>
              <p className="text-xs opacity-60 mt-1 max-w-sm">
                Choose any user from the left to see their complete security profile —
                every page and every button, with their effective access status.
                Toggle any permission inline.
              </p>
            </div>
          </div>
        ) : loading ? (
          <div className="flex-1 p-6 space-y-4">
            <Skeleton className="h-28 w-full rounded-xl" />
            <div className="grid grid-cols-4 gap-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
            {[1,2,3].map(i => <Skeleton key={i} className="h-12 rounded-xl" />)}
          </div>
        ) : (
          <>
            {/* User header */}
            <div className="px-5 py-4 border-b bg-card flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                  {initials(selectedUser?.name ?? null)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold truncate">{selectedUser?.name ?? 'Unknown'}</h3>
                  <p className="text-xs text-muted-foreground truncate">{selectedUser?.email ?? ''}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', roleMeta(rawRole).color)}>
                      {roleMeta(rawRole).label}
                    </span>
                    {isSA && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 flex items-center gap-1">
                        <Shield className="h-2.5 w-2.5" /> Full System Access
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => loadData(selectedId)} data-testid="btn-refresh-security"
                  className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded border hover:border-border transition-colors flex items-center gap-1">
                  <RefreshCw className="h-3 w-3" /> Refresh
                </button>
              </div>

              {/* KPI cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                {[
                  { label: 'Accessible Pages', value: accessiblePageCount, total: PAGE_DEFS.length, color: 'blue', Icon: CheckCircle2 },
                  { label: 'Blocked Pages', value: blockedOverrides, total: null, color: 'red', Icon: Lock },
                  { label: 'Granted Pages', value: grantedOverrides, total: null, color: 'emerald', Icon: Unlock },
                  { label: 'Action Overrides', value: actionOverrides, total: null, color: 'amber', Icon: Shield },
                ].map(({ label, value, total, color, Icon }) => (
                  <div key={label} className={cn('border rounded-xl p-2.5', {
                    'bg-blue-50/50 border-blue-100 dark:bg-blue-900/10 dark:border-blue-800/30': color === 'blue',
                    'bg-red-50/50 border-red-100 dark:bg-red-900/10 dark:border-red-800/30': color === 'red',
                    'bg-emerald-50/50 border-emerald-100 dark:bg-emerald-900/10 dark:border-emerald-800/30': color === 'emerald',
                    'bg-amber-50/50 border-amber-100 dark:bg-amber-900/10 dark:border-amber-800/30': color === 'amber',
                  })}>
                    <p className={cn('text-[10px] font-medium flex items-center gap-1', {
                      'text-blue-600 dark:text-blue-400': color === 'blue',
                      'text-red-600 dark:text-red-400': color === 'red',
                      'text-emerald-600 dark:text-emerald-400': color === 'emerald',
                      'text-amber-600 dark:text-amber-400': color === 'amber',
                    })}>
                      <Icon className="h-2.5 w-2.5" /> {label}
                    </p>
                    <p className={cn('text-lg font-bold mt-0.5', {
                      'text-blue-700 dark:text-blue-300': color === 'blue',
                      'text-red-700 dark:text-red-300': color === 'red',
                      'text-emerald-700 dark:text-emerald-300': color === 'emerald',
                      'text-amber-700 dark:text-amber-300': color === 'amber',
                    })}>{value}{total ? <span className="text-xs font-normal opacity-60 ml-0.5">/{total}</span> : ''}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Legend + search */}
            <div className="px-5 py-2 border-b bg-muted/20 flex items-center gap-4 flex-wrap flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input value={moduleSearch} onChange={e => setModuleSearch(e.target.value)}
                  placeholder="Search modules, pages, actions…" className="pl-7 h-7 text-xs w-52" />
              </div>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground ml-auto flex-wrap">
                {[
                  { label: 'Role Access', cls: 'bg-blue-400' },
                  { label: 'Override Grant', cls: 'bg-emerald-400' },
                  { label: 'Override Block', cls: 'bg-red-400' },
                  { label: 'No Access', cls: 'bg-slate-300' },
                ].map(({ label, cls }) => (
                  <span key={label} className="flex items-center gap-1">
                    <span className={cn('w-2 h-2 rounded-full', cls)} />
                    {label}
                  </span>
                ))}
              </div>
            </div>

            {/* Super Admin notice */}
            {isSA && (
              <div className="mx-5 mt-4 p-3 rounded-xl bg-red-50 border border-red-200 dark:bg-red-900/10 dark:border-red-800/30 flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Super Admin has unrestricted access to everything. No overrides can be applied to this role.
              </div>
            )}

            {/* Module sections */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {filteredModules.map(mod => {
                const isModOpen = expandedModules.has(mod.module);
                const allActions = mod.pages.flatMap(pg => pg.actions);
                const hasAccess = allActions.some(a => {
                  const eff = effectiveAction(a.resource, a.action);
                  return eff === 'superadmin' || eff === 'grant-ov' || eff === 'role-yes';
                });
                const overrideCount = allActions.filter(a => {
                  const eff = effectiveAction(a.resource, a.action);
                  return eff === 'grant-ov' || eff === 'block-ov';
                }).length;

                return (
                  <div key={mod.module} className="border rounded-xl overflow-hidden">
                    {/* Module header */}
                    <button onClick={() => toggleModule(mod.module)}
                      className="w-full flex items-center gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                      data-testid={`module-toggle-${mod.module}`}>
                      {isModOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-semibold">{mod.module}</span>
                        <span className="text-[10px] text-muted-foreground ml-2">{mod.description}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {overrideCount > 0 && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300 px-1.5 py-0.5 rounded-full font-semibold">
                            {overrideCount} override{overrideCount > 1 ? 's' : ''}
                          </span>
                        )}
                        <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                          hasAccess ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                                    : 'bg-slate-100 text-slate-400')}>
                          {mod.pages.length} page{mod.pages.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </button>

                    {/* Module content */}
                    {isModOpen && (
                      <div className="divide-y">
                        {mod.pages.map(pg => {
                          const pageDef = findPageDef(pg.route);
                          const slug = pageDef?.slug ?? pg.route.replace(/\//g, '');
                          const pageEff = pageDef ? effectivePage(pageDef.slug) : 'role-no';
                          const pageKey = `${mod.module}::${pg.page}`;
                          const isPgOpen = expandedPages.has(pageKey);
                          const actOverrides = pg.actions.filter(a => {
                            const e = effectiveAction(a.resource, a.action);
                            return e === 'grant-ov' || e === 'block-ov';
                          }).length;

                          return (
                            <div key={pg.page} className="pl-4">
                              {/* Page row */}
                              <div className={cn('flex items-center gap-2 pr-4 py-2.5 border-b border-dashed border-muted',
                                pageRowCls(pageEff))}>
                                <button onClick={() => togglePageSection(pageKey)}
                                  className="flex items-center gap-2 flex-1 min-w-0 text-left group"
                                  data-testid={`page-toggle-${slug}`}>
                                  {isPgOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold truncate">{pg.page}</p>
                                    <p className="text-[10px] text-muted-foreground truncate hidden sm:block">{pg.route}</p>
                                  </div>
                                  {actOverrides > 0 && (
                                    <span className="text-[10px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded font-semibold shrink-0">
                                      {actOverrides} action override{actOverrides > 1 ? 's' : ''}
                                    </span>
                                  )}
                                  <StatusPill eff={pageEff} small />
                                </button>

                                {/* Page access toggle button */}
                                {!isSA && pageDef && isSuperAdmin && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        onClick={() => togglePage(pageDef.slug)}
                                        disabled={savingKey === `page:${pageDef.slug}`}
                                        data-testid={`btn-page-toggle-${pageDef.slug}`}
                                        className={cn('text-[10px] border rounded px-2 py-1 shrink-0 font-medium transition-colors disabled:opacity-50',
                                          pageToggleProps(pageEff).cls)}>
                                        {savingKey === `page:${pageDef.slug}`
                                          ? <Loader2 className="h-3 w-3 animate-spin" />
                                          : pageToggleProps(pageEff).label}
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="left" className="text-xs max-w-[200px]">
                                      {pageEff === 'role-yes' && 'Override: block this page for this user only'}
                                      {pageEff === 'role-no' && 'Override: grant this page to this user only'}
                                      {(pageEff === 'grant-ov' || pageEff === 'block-ov') && 'Remove override — restore role default'}
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </div>

                              {/* Action rows (expanded) */}
                              {isPgOpen && (
                                <div className="py-1 space-y-0.5 ml-2">
                                  {pg.actions.map(act => {
                                    const eff = effectiveAction(act.resource, act.action);
                                    const aKey = `perm:${act.resource}:${act.action}`;
                                    const tp = actionToggleProps(eff);
                                    return (
                                      <div key={act.key}
                                        className={cn('flex items-center gap-2 px-3 py-2 rounded-lg transition-colors', actionRowCls(eff))}>
                                        <StatusPill eff={eff} small />
                                        <div className="flex-1 min-w-0">
                                          <p className="text-xs font-medium truncate">{act.label}</p>
                                          <p className="text-[10px] text-muted-foreground truncate hidden sm:block">{act.description}</p>
                                        </div>
                                        <span className="text-[9px] text-muted-foreground/60 font-mono hidden md:block shrink-0">
                                          {act.resource}:{act.action}
                                        </span>
                                        {/* Action toggle */}
                                        {!isSA && isSuperAdmin && (
                                          <button
                                            onClick={() => toggleAction(act.resource, act.action)}
                                            disabled={savingKey === aKey}
                                            data-testid={`btn-action-toggle-${act.key}`}
                                            className={cn('text-[10px] border rounded px-2 py-0.5 shrink-0 font-medium transition-colors disabled:opacity-50', tp.cls)}>
                                            {savingKey === aKey
                                              ? <Loader2 className="h-3 w-3 animate-spin" />
                                              : tp.label}
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main SecurityPanel ───────────────────────────────────────────────────────
export function SecurityPanel({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const { users } = useAppContext();
  const [view, setView] = useState<'role' | 'user'>('user');

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* View toggle */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-muted rounded-lg p-1 gap-1">
            <button
              onClick={() => setView('user')}
              data-testid="security-view-by-user"
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                view === 'user' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              <UserCircle2 className="h-4 w-4" />
              By User
            </button>
            <button
              onClick={() => setView('role')}
              data-testid="security-view-by-role"
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                view === 'role' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              <Layers className="h-4 w-4" />
              By Role
            </button>
          </div>
          <div className="text-xs text-muted-foreground">
            {view === 'user'
              ? 'Select a user → expand a module → click any page row to see its action buttons → toggle any individually'
              : isSuperAdmin
                ? 'Select a role → expand a module → see every action button per page → click Grant/Revoke to edit'
                : 'Select a role → expand a module → see every action button on each page (view only — Super Admin can edit)'}
          </div>
        </div>

        {/* Panel */}
        <div className="border rounded-xl overflow-hidden bg-background">
          {view === 'user'
            ? <ByUserView users={users} isSuperAdmin={isSuperAdmin} />
            : <ByRoleView users={users} />}
        </div>
      </div>
    </TooltipProvider>
  );
}
