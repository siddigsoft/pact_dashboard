import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  DEFAULT_ROLE_PERMISSIONS, RESOURCE_LABELS, ACTION_LABELS,
  ResourceType, ActionType, AppRole,
} from '@/types/roles';
import { PAGE_DEFS, PAGE_GROUPS, hasDefaultAccess, getAccessStatus } from '@/pages/PageAccessControl';
import {
  Search, Shield, Lock, Unlock, CheckCircle2, XCircle, MinusCircle,
  Users, FileText, Settings, ChevronRight, ChevronDown, Eye, BarChart2, Download,
} from 'lucide-react';

// ── Map profiles.role (camelCase code) → DEFAULT_ROLE_PERMISSIONS key (AppRole) ─
// profiles.role stores e.g. 'countryDirector'; DEFAULT_ROLE_PERMISSIONS uses 'CountryDirector'
const ROLE_CODE_TO_APP_ROLE: Record<string, AppRole> = {
  superAdmin:            'SuperAdmin',
  admin:                 'Admin',
  countryDirector:       'CountryDirector',
  ict:                   'ICT',
  fom:                   'Field Operation Manager (FOM)',
  financialAdmin:        'FinancialAdmin',
  projectManager:        'ProjectManager',
  seniorOperationsLead:  'SeniorOperationsLead',
  supervisor:            'Supervisor',
  coordinator:           'Coordinator',
  dataTeam:              'DataTeam',
  dataCollector:         'DataCollector',
  reviewer:              'Reviewer',
  auditor:               'Auditor',
};

// ── Resource groups ─────────────────────────────────────────────────────────
const RESOURCE_GROUPS: { group: string; resources: ResourceType[] }[] = [
  { group: 'Administration',   resources: ['users','roles','permissions','settings','system','super_admins','audit_logs'] },
  { group: 'Programme',        resources: ['projects','portfolio','analytics','mmp','site_visits','hub_operations'] },
  { group: 'Field Operations', resources: ['safety','incidents','equipment','coverage_map'] },
  { group: 'Finance',          resources: ['finances','wallets','accounting','down_payments','cost_submissions','pre_funding','procurement','fixed_assets'] },
  { group: 'HR',               resources: ['hr','payroll','leave','benefits','succession','pulse_surveys','hr_analytics'] },
  { group: 'Tools',            resources: ['surveys','tasks','notifications','broadcast','whatsapp','calendar','signatures','integrations','transactions'] },
  { group: 'CRM & Reports',    resources: ['crm','reports'] },
];

// Key actions shown in the profile (most relevant to day-to-day decisions)
const KEY_ACTIONS: ActionType[] = ['create','read','update','delete','approve','export'];

// Status chip config
const PAGE_STATUS = {
  role:    { label: 'Role Access',  dot: 'bg-blue-400',    cls: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300' },
  granted: { label: 'Granted',      dot: 'bg-emerald-400', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300' },
  blocked: { label: 'Blocked',      dot: 'bg-red-400',     cls: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300' },
  denied:  { label: 'No Access',    dot: 'bg-slate-300',   cls: 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400' },
};

function roleLabel(role: string): string {
  const MAP: Record<string, string> = {
    superAdmin: 'Super Admin', admin: 'Admin', countryDirector: 'Country Director',
    fom: 'Field Ops Manager', financialAdmin: 'Finance Admin', projectManager: 'Project Manager',
    coordinator: 'Coordinator', supervisor: 'Supervisor', dataTeam: 'Data Team',
    dataCollector: 'Data Collector', ict: 'ICT', employee: 'Employee',
    auditor: 'Auditor', reviewer: 'Reviewer', seniorOperationsLead: 'Senior Operations Lead',
  };
  return MAP[role] ?? role;
}

function initials(name: string | null) {
  return (name ?? '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

function roleBadgeClass(role: string): string {
  const MAP: Record<string, string> = {
    superAdmin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    admin: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    financialAdmin: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
    fom: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    coordinator: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    supervisor: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
    dataTeam: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
    dataCollector: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
    employee: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  };
  return MAP[role] ?? 'bg-slate-100 text-slate-600';
}

export function UserAccessProfile() {
  const { users } = useAppContext();

  const [search, setSearch]                       = useState('');
  const [selectedId, setSelectedId]               = useState<string>('');
  const [pageOverrides, setPageOverrides]         = useState<any[]>([]);
  const [permOverrides, setPermOverrides]         = useState<any[]>([]);
  const [loadingData, setLoadingData]             = useState(false);
  const [activeTab, setActiveTab]                 = useState<'pages' | 'permissions'>('pages');
  const [expandedPageGroups, setExpandedPageGroups] = useState<Set<string>>(new Set(PAGE_GROUPS.slice(0, 4)));
  const [expandedPermGroups, setExpandedPermGroups] = useState<Set<string>>(new Set(RESOURCE_GROUPS.slice(0, 3).map(g => g.group)));
  const [pageSearch, setPageSearch]               = useState('');
  const [permSearch, setPermSearch]               = useState('');

  const filteredUsers = users.filter(u =>
    !search ||
    (u.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (u.email ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const selectedUser = users.find(u => u.id === selectedId);

  // ── Load overrides for selected user ───────────────────────────────────────
  const loadUserData = useCallback(async (uid: string) => {
    setLoadingData(true);
    try {
      const [pageRes, permRes] = await Promise.all([
        supabase.from('page_access_overrides').select('*').eq('user_id', uid),
        supabase.from('user_permission_overrides').select('*').eq('user_id', uid),
      ]);
      setPageOverrides((pageRes.data ?? []) as any[]);
      setPermOverrides((permRes.data ?? []) as any[]);
    } catch {
      setPageOverrides([]);
      setPermOverrides([]);
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) {
      loadUserData(selectedId);
      setPageSearch('');
      setPermSearch('');
    }
  }, [selectedId, loadUserData]);

  // ── Derived data ────────────────────────────────────────────────────────────
  // Page override map: slug → override row
  const pageOvMap = Object.fromEntries(pageOverrides.map(o => [o.page_slug, o]));

  // Permission override map: `resource:action` → is_granted
  const permOvMap = Object.fromEntries(
    permOverrides.map(o => [`${o.resource}:${o.action}`, o.is_granted as boolean])
  );

  // profiles.role stores camelCase codes ('countryDirector'), map to AppRole PascalCase key
  const rawRoleCode = (selectedUser as any)?.role as string | undefined;
  const appRole: AppRole | undefined = rawRoleCode ? ROLE_CODE_TO_APP_ROLE[rawRoleCode] : undefined;
  const rolePerms = appRole ? (DEFAULT_ROLE_PERMISSIONS[appRole] ?? []) : [];
  const isSuperAdmin = rawRoleCode === 'superAdmin';

  // Effective permission for a resource × action
  function effectivePerm(resource: ResourceType, action: ActionType): 'granted' | 'blocked' | 'role-yes' | 'role-no' {
    if (isSuperAdmin) return 'granted';
    const key = `${resource}:${action}`;
    if (key in permOvMap) return permOvMap[key] ? 'granted' : 'blocked';
    const inRole = rolePerms.some(p => p.resource === resource && p.action === action);
    return inRole ? 'role-yes' : 'role-no';
  }

  // Pages: filter & group
  const filteredPages = PAGE_DEFS.filter(p =>
    !pageSearch ||
    p.label.toLowerCase().includes(pageSearch.toLowerCase()) ||
    p.path.toLowerCase().includes(pageSearch.toLowerCase())
  );
  const byPageGroup = PAGE_GROUPS
    .map(g => ({ group: g, pages: filteredPages.filter(p => p.group === g) }))
    .filter(g => g.pages.length > 0);

  // Resources: filter
  const filteredResGroups = RESOURCE_GROUPS.map(g => ({
    ...g,
    resources: g.resources.filter(r =>
      !permSearch ||
      (RESOURCE_LABELS[r] ?? r).toLowerCase().includes(permSearch.toLowerCase())
    ) as ResourceType[],
  })).filter(g => g.resources.length > 0);

  // KPIs
  const accessiblePages = PAGE_DEFS.filter(p => {
    const ov = pageOvMap[p.slug];
    if (ov?.is_blocked) return false;
    if (ov && !ov.is_blocked) return true;
    return hasDefaultAccess(p, userRole ?? null);
  });
  const blockedPages = pageOverrides.filter(o => o.is_blocked);
  const activePermOverrides = permOverrides.filter(o => !o.expires_at || new Date(o.expires_at) > new Date());

  return (
    <div className="flex gap-0 min-h-[680px] border rounded-xl overflow-hidden bg-background">

      {/* ── Left: User list ─────────────────────────────────────────────────── */}
      <div className="w-64 shrink-0 border-r flex flex-col bg-muted/20">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search users…"
              className="pl-8 h-8 text-xs"
              data-testid="input-user-profile-search"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredUsers.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-8">No users found</p>
          ) : (
            filteredUsers.map(u => (
              <button
                key={u.id}
                onClick={() => setSelectedId(u.id)}
                data-testid={`button-select-user-${u.id}`}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-all border-b border-transparent',
                  selectedId === u.id
                    ? 'bg-primary/10 border-primary/20'
                    : 'hover:bg-muted/60'
                )}
              >
                <div className={cn(
                  'h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
                  selectedId === u.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                )}>
                  {initials(u.name ?? null)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{u.name ?? 'Unknown'}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{(u as any).role ? roleLabel((u as any).role) : u.email}</p>
                </div>
                {selectedId === u.id && <ChevronRight className="h-3 w-3 text-primary shrink-0" />}
              </button>
            ))
          )}
        </div>
        <div className="p-2 border-t">
          <p className="text-[10px] text-center text-muted-foreground">{filteredUsers.length} users</p>
        </div>
      </div>

      {/* ── Right: Access profile ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedId ? (
          // Empty state
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8 py-16">
            <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
              <Eye className="h-7 w-7 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-base font-semibold">Select a User</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Choose any user from the left panel to see their complete access profile —
                which pages they can visit and what they can do on each.
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1" dir="rtl">
                اختر مستخدمًا لعرض ملف صلاحياته الكامل — الصفحات والإجراءات المتاحة
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-2 max-w-md w-full">
              {[
                { icon: FileText, label: 'Page Access', desc: 'Which pages they can visit', color: 'text-blue-500' },
                { icon: Shield, label: 'Permissions', desc: 'What they can do on each module', color: 'text-purple-500' },
                { icon: Settings, label: 'Overrides', desc: 'Individual grants & blocks applied', color: 'text-amber-500' },
              ].map(({ icon: Icon, label, desc, color }) => (
                <div key={label} className="border rounded-xl p-3 bg-muted/30">
                  <Icon className={cn('h-4 w-4 mb-1.5', color)} />
                  <p className="text-xs font-semibold">{label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        ) : loadingData ? (
          // Loading skeleton
          <div className="flex-1 p-6 space-y-4">
            <Skeleton className="h-20 w-full rounded-xl" />
            <div className="grid grid-cols-3 gap-3">
              {[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
            </div>
            <Skeleton className="h-10 w-full rounded-lg" />
            <div className="space-y-2">
              {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 rounded-lg" />)}
            </div>
          </div>
        ) : (
          <>
            {/* ── User header ─────────────────────────────────────────────── */}
            <div className="px-6 py-4 border-b bg-card flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                  {initials(selectedUser?.name ?? null)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold truncate">{selectedUser?.name ?? 'Unknown'}</h3>
                  <p className="text-xs text-muted-foreground truncate">{selectedUser?.email ?? ''}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', roleBadgeClass((selectedUser as any)?.role ?? ''))}>
                      {roleLabel((selectedUser as any)?.role ?? '')}
                    </span>
                    {isSuperAdmin && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 flex items-center gap-1">
                        <Shield className="h-2.5 w-2.5" /> Full Access (Super Admin)
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => loadUserData(selectedId)}
                  className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded border hover:border-border transition-colors"
                  data-testid="button-refresh-access-profile"
                >
                  Refresh
                </button>
              </div>

              {/* KPI summary cards */}
              <div className="grid grid-cols-3 gap-3 mt-4">
                <div className="border rounded-xl p-3 bg-blue-50/50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-800/30">
                  <p className="text-[10px] text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1">
                    <FileText className="h-3 w-3" /> Accessible Pages
                  </p>
                  <p className="text-xl font-bold text-blue-700 dark:text-blue-300 mt-0.5">{accessiblePages.length}</p>
                  <p className="text-[10px] text-blue-500/80">of {PAGE_DEFS.length} total pages</p>
                </div>
                <div className="border rounded-xl p-3 bg-red-50/50 dark:bg-red-900/10 border-red-100 dark:border-red-800/30">
                  <p className="text-[10px] text-red-600 dark:text-red-400 font-medium flex items-center gap-1">
                    <Lock className="h-3 w-3" /> Blocked Pages
                  </p>
                  <p className="text-xl font-bold text-red-700 dark:text-red-300 mt-0.5">{blockedPages.length}</p>
                  <p className="text-[10px] text-red-500/80">explicit page blocks</p>
                </div>
                <div className="border rounded-xl p-3 bg-amber-50/50 dark:bg-amber-900/10 border-amber-100 dark:border-amber-800/30">
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                    <Settings className="h-3 w-3" /> Permission Overrides
                  </p>
                  <p className="text-xl font-bold text-amber-700 dark:text-amber-300 mt-0.5">{activePermOverrides.length}</p>
                  <p className="text-[10px] text-amber-500/80">active action overrides</p>
                </div>
              </div>
            </div>

            {/* ── Tabs: Pages | Permissions ───────────────────────────────── */}
            <Tabs value={activeTab} onValueChange={v => setActiveTab(v as any)} className="flex-1 flex flex-col overflow-hidden">
              <div className="px-6 pt-3 border-b flex-shrink-0">
                <TabsList className="h-8">
                  <TabsTrigger value="pages" className="text-xs gap-1.5" data-testid="tab-access-profile-pages">
                    <FileText className="h-3.5 w-3.5" /> Pages
                    <span className="ml-1 text-[10px] opacity-60">({accessiblePages.length} accessible)</span>
                  </TabsTrigger>
                  <TabsTrigger value="permissions" className="text-xs gap-1.5" data-testid="tab-access-profile-permissions">
                    <Shield className="h-3.5 w-3.5" /> Permissions
                    {activePermOverrides.length > 0 && (
                      <span className="ml-1 text-[10px] bg-amber-100 text-amber-700 px-1 rounded">{activePermOverrides.length}</span>
                    )}
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* ── Pages tab ─────────────────────────────────────────────── */}
              <TabsContent value="pages" className="flex-1 overflow-y-auto m-0">
                <div className="px-6 py-3 border-b bg-muted/20 flex items-center gap-3 sticky top-0 z-10">
                  <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                    <Input
                      value={pageSearch}
                      onChange={e => setPageSearch(e.target.value)}
                      placeholder="Search pages…"
                      className="pl-7 h-7 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-2.5 text-[10px] text-muted-foreground shrink-0">
                    {Object.entries(PAGE_STATUS).map(([key, cfg]) => (
                      <span key={key} className="flex items-center gap-1">
                        <span className={cn('w-2 h-2 rounded-full inline-block', cfg.dot)} />
                        {cfg.label}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="px-6 py-4 space-y-3">
                  {byPageGroup.map(({ group, pages }) => (
                    <div key={group}>
                      <button
                        onClick={() => setExpandedPageGroups(prev => {
                          const next = new Set(prev);
                          next.has(group) ? next.delete(group) : next.add(group);
                          return next;
                        })}
                        className="w-full flex items-center gap-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {expandedPageGroups.has(group)
                          ? <ChevronDown className="h-3 w-3" />
                          : <ChevronRight className="h-3 w-3" />}
                        {group}
                        <span className="text-[10px] font-normal normal-case">({pages.length})</span>
                        {/* Mini access count */}
                        {(() => {
                          const accessible = pages.filter(p => {
                            const ov = pageOvMap[p.slug];
                            if (ov?.is_blocked) return false;
                            if (ov && !ov.is_blocked) return true;
                            return hasDefaultAccess(p, userRole ?? null);
                          }).length;
                          return (
                            <span className={cn('ml-auto text-[10px] font-normal normal-case px-1.5 py-0.5 rounded-full',
                              accessible === pages.length ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20' : accessible === 0 ? 'bg-slate-100 text-slate-400' : 'bg-amber-50 text-amber-600'
                            )}>
                              {accessible}/{pages.length} accessible
                            </span>
                          );
                        })()}
                      </button>
                      {expandedPageGroups.has(group) && (
                        <div className="space-y-1 pl-4 mt-1">
                          {pages.map(page => {
                            const ov = pageOvMap[page.slug];
                            const status = getAccessStatus(page, selectedUser as any, { [page.slug]: ov }, undefined);
                            const cfg = PAGE_STATUS[status as keyof typeof PAGE_STATUS] ?? PAGE_STATUS.denied;
                            const Icon = page.icon;
                            return (
                              <div
                                key={page.slug}
                                className={cn(
                                  'flex items-center gap-3 px-3 py-2.5 rounded-xl border text-[12px] transition-colors',
                                  status === 'blocked' ? 'bg-red-50/40 dark:bg-red-900/5 border-red-200/60' :
                                  status === 'granted' ? 'bg-emerald-50/40 dark:bg-emerald-900/5 border-emerald-200/60' :
                                  status === 'role'    ? 'bg-blue-50/20 border-blue-100/40' :
                                  'bg-card border-transparent'
                                )}
                                data-testid={`row-page-access-${page.slug}`}
                              >
                                <span className={cn('w-2 h-2 rounded-full shrink-0', cfg.dot)} />
                                <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold truncate">{page.label}</p>
                                  <p className="text-[10px] text-muted-foreground font-mono truncate">{page.path}</p>
                                </div>
                                {page.note && (
                                  <p className="text-[10px] text-muted-foreground italic hidden md:block max-w-[180px] truncate">{page.note}</p>
                                )}
                                <span className={cn('text-[9px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0 flex items-center gap-1', cfg.cls)}>
                                  {status === 'blocked' && <Lock className="h-2.5 w-2.5" />}
                                  {status === 'granted' && <Unlock className="h-2.5 w-2.5" />}
                                  {status === 'role'    && <Shield className="h-2.5 w-2.5" />}
                                  {cfg.label}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </TabsContent>

              {/* ── Permissions tab ────────────────────────────────────────── */}
              <TabsContent value="permissions" className="flex-1 overflow-y-auto m-0">
                <div className="px-6 py-3 border-b bg-muted/20 flex items-center gap-3 sticky top-0 z-10">
                  <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                    <Input
                      value={permSearch}
                      onChange={e => setPermSearch(e.target.value)}
                      placeholder="Search modules…"
                      className="pl-7 h-7 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-2.5 text-[10px] text-muted-foreground shrink-0">
                    <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Allowed</span>
                    <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-red-500" /> Blocked</span>
                    <span className="flex items-center gap-1"><MinusCircle className="h-3 w-3 text-slate-400" /> No Access</span>
                  </div>
                </div>

                {/* Action header row */}
                <div className="px-6 py-2 border-b bg-muted/10 flex items-center gap-2 text-[10px] font-semibold text-muted-foreground sticky top-[49px] z-10">
                  <span className="flex-1 pl-1">Module</span>
                  {KEY_ACTIONS.map(a => (
                    <span key={a} className="w-16 text-center capitalize">{ACTION_LABELS[a] ?? a}</span>
                  ))}
                  <span className="w-20 text-center">Overrides</span>
                </div>

                <div className="px-6 py-4 space-y-3">
                  {filteredResGroups.map(({ group, resources }) => (
                    <div key={group}>
                      <button
                        onClick={() => setExpandedPermGroups(prev => {
                          const next = new Set(prev);
                          next.has(group) ? next.delete(group) : next.add(group);
                          return next;
                        })}
                        className="w-full flex items-center gap-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {expandedPermGroups.has(group)
                          ? <ChevronDown className="h-3 w-3" />
                          : <ChevronRight className="h-3 w-3" />}
                        {group}
                        <span className="text-[10px] font-normal normal-case">({resources.length} modules)</span>
                        {/* Count active overrides in this group */}
                        {(() => {
                          const count = resources.reduce((n, r) =>
                            n + KEY_ACTIONS.filter(a => `${r}:${a}` in permOvMap).length, 0);
                          return count > 0 ? (
                            <span className="ml-auto text-[10px] font-normal normal-case px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 dark:bg-amber-900/20">
                              {count} override{count !== 1 ? 's' : ''}
                            </span>
                          ) : null;
                        })()}
                      </button>

                      {expandedPermGroups.has(group) && (
                        <div className="space-y-1 pl-4 mt-1">
                          {resources.map(resource => {
                            const overrideCount = KEY_ACTIONS.filter(a => `${resource}:${a}` in permOvMap).length;
                            return (
                              <div
                                key={resource}
                                className={cn(
                                  'flex items-center gap-2 px-3 py-2.5 rounded-xl border text-[11px] transition-colors',
                                  overrideCount > 0 ? 'bg-amber-50/30 dark:bg-amber-900/5 border-amber-200/60' : 'bg-card border-transparent'
                                )}
                                data-testid={`row-perm-${resource}`}
                              >
                                <span className="flex-1 font-medium pl-1 truncate min-w-0">
                                  {RESOURCE_LABELS[resource] ?? resource}
                                </span>

                                {KEY_ACTIONS.map(action => {
                                  const eff = effectivePerm(resource, action);
                                  if (eff === 'granted') return (
                                    <span key={action} className="w-16 flex justify-center" title={`${ACTION_LABELS[action]}: Allowed${`${resource}:${action}` in permOvMap ? ' (Override)' : ' (Role)'}`}>
                                      <CheckCircle2 className={cn('h-4 w-4', `${resource}:${action}` in permOvMap ? 'text-amber-500' : 'text-emerald-500')} />
                                    </span>
                                  );
                                  if (eff === 'role-yes') return (
                                    <span key={action} className="w-16 flex justify-center" title={`${ACTION_LABELS[action]}: Allowed by role`}>
                                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                    </span>
                                  );
                                  if (eff === 'blocked') return (
                                    <span key={action} className="w-16 flex justify-center" title={`${ACTION_LABELS[action]}: Explicitly blocked`}>
                                      <XCircle className="h-4 w-4 text-red-500" />
                                    </span>
                                  );
                                  return (
                                    <span key={action} className="w-16 flex justify-center" title={`${ACTION_LABELS[action]}: Not available for this role`}>
                                      <MinusCircle className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                                    </span>
                                  );
                                })}

                                {/* Override count */}
                                <span className="w-20 flex justify-center">
                                  {overrideCount > 0 ? (
                                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                                      {overrideCount} override{overrideCount !== 1 ? 's' : ''}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground/40">—</span>
                                  )}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Legend */}
                <div className="mx-6 mb-6 p-3 rounded-xl border bg-muted/20 text-[10px] text-muted-foreground">
                  <p className="font-semibold mb-1.5">Legend / مفتاح الرموز</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Allowed by their role (default)</span>
                    <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-amber-500" /> Explicitly GRANTED by an admin override</span>
                    <span className="flex items-center gap-1.5"><XCircle className="h-3 w-3 text-red-500" /> Explicitly BLOCKED by an admin override</span>
                    <span className="flex items-center gap-1.5"><MinusCircle className="h-3 w-3 text-slate-400" /> Not available for this role (no access)</span>
                  </div>
                  <p className="mt-1.5 text-[9px] opacity-70" dir="rtl">
                    أيقونة برتقالية = منح صريح / أيقونة حمراء = حجب صريح / خضراء = ضمن الدور / رمادية = لا صلاحية
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  );
}
