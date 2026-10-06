/**
 * UnifiedAccessManager — per-user exceptions only.
 * Role baselines are edited in Role Management → Roles.
 */
import { useState, useMemo, useEffect, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Search, Globe, Layers, Key, Database, Shield, User, ChevronRight,
  BarChart3, Columns3, FileText, AlertTriangle, RefreshCw, SlidersHorizontal,
  MoreHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppContext } from '@/context/AppContext';
import { SelectedUserAccessProvider, useSelectedUserAccess } from '@/context/role-management/SelectedUserAccessContext';
import { OverviewTab }     from './unified/OverviewTab';
import { PageAccessTab }   from './unified/PageAccessTab';
import { TabAccessTab }    from './unified/TabAccessTab';
import { PermissionsTab }  from './unified/PermissionsTab';
import { DataScopeTab }    from './unified/DataScopeTab';
import { AccessAuditTab }  from './unified/AccessAuditTab';
import { FilterControlsTab } from './unified/FilterControlsTab';
import { isSuperAdminRole } from '@/lib/effectiveAccess';

const ROLE_LABEL: Record<string, string> = {
  superAdmin: 'Super Admin', admin: 'Admin', countryDirector: 'Country Director',
  ict: 'ICT', fom: 'Field Ops Manager', financialAdmin: 'Finance Admin',
  projectManager: 'Project Manager', seniorOperationsLead: 'Senior Ops Lead',
  supervisor: 'Supervisor', coordinator: 'Coordinator', dataTeam: 'Data Team',
  dataCollector: 'Data Collector', reviewer: 'Reviewer', auditor: 'Auditor',
  seniorManagement: 'Senior Management',
};
const ROLE_COLOR: Record<string, string> = {
  superAdmin: 'bg-red-100 text-red-700', admin: 'bg-orange-100 text-orange-700',
  countryDirector: 'bg-amber-100 text-amber-700', ict: 'bg-purple-100 text-purple-700',
  fom: 'bg-indigo-100 text-indigo-700', financialAdmin: 'bg-yellow-100 text-yellow-700',
  projectManager: 'bg-blue-100 text-blue-700', supervisor: 'bg-teal-100 text-teal-700',
  coordinator: 'bg-emerald-100 text-emerald-700', dataTeam: 'bg-lime-100 text-lime-700',
  dataCollector: 'bg-green-100 text-green-700', auditor: 'bg-gray-100 text-gray-700',
  reviewer: 'bg-cyan-100 text-cyan-700', seniorManagement: 'bg-rose-100 text-rose-700',
};

type UAMUser = { id: string; name?: string | null; email: string; role: string };
type TabKey = 'overview' | 'pages' | 'tabs' | 'buttons' | 'reports' | 'columns' | 'filters' | 'scope' | 'overrides' | 'audit';

const PRIMARY_TABS: { key: TabKey; icon: typeof User; label: string }[] = [
  { key: 'overview', icon: User, label: 'Summary' },
  { key: 'pages', icon: Globe, label: 'Pages' },
  { key: 'tabs', icon: Layers, label: 'Hub tabs' },
  { key: 'buttons', icon: Key, label: 'Actions' },
  { key: 'overrides', icon: Shield, label: 'Exceptions' },
];

const MORE_TABS: { key: TabKey; icon: typeof User; label: string }[] = [
  { key: 'reports', icon: BarChart3, label: 'Reports' },
  { key: 'columns', icon: Columns3, label: 'Columns' },
  { key: 'filters', icon: SlidersHorizontal, label: 'Filters' },
  { key: 'scope', icon: Database, label: 'Data scope' },
  { key: 'audit', icon: FileText, label: 'Audit log' },
];

function getInitials(name?: string | null, email?: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return (parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2)).toUpperCase();
  }
  return email?.slice(0, 2).toUpperCase() ?? '??';
}

export function UnifiedAccessManager({ containerClassName }: { containerClassName?: string } = {}) {
  const { users } = useAppContext();
  const [searchParams] = useSearchParams();
  const requestedUser = searchParams.get('accessUser');
  const requestedPage = searchParams.get('accessPage');

  const [search, setSearch]         = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(requestedUser);
  const [activeTab, setActiveTab]   = useState<TabKey>('pages');

  const allRoles = useMemo(() => {
    const roles = [...new Set(users.map(u => u.role).filter(Boolean))].filter(r => !isSuperAdminRole(r));
    return roles.sort();
  }, [users]);

  const filteredUsers = useMemo<UAMUser[]>(() => {
    const q = search.toLowerCase();
    return (users as UAMUser[]).filter(u => {
      if (!u.role || isSuperAdminRole(u.role)) return false;
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (q) {
        const name = (u.name ?? '').toLowerCase();
        const email = u.email.toLowerCase();
        if (!name.includes(q) && !email.includes(q)) return false;
      }
      return true;
    });
  }, [users, search, roleFilter]);

  useEffect(() => {
    if (requestedUser && filteredUsers.some(user => user.id === requestedUser)) setSelectedId(requestedUser);
    else if (filteredUsers.length) {
      setSelectedId(previous => previous && filteredUsers.some(user => user.id === previous)
        ? previous
        : filteredUsers[0].id);
    } else {
      setSelectedId(null);
    }
    if (requestedPage) setActiveTab('pages');
  }, [requestedUser, requestedPage, filteredUsers]);

  const selectedUser = useMemo<UAMUser | null>(
    () => (selectedId ? ((users as UAMUser[]).find(u => u.id === selectedId) ?? null) : null),
    [users, selectedId],
  );
  const isSA = isSuperAdminRole(selectedUser?.role);
  const moreActive = MORE_TABS.some(t => t.key === activeTab);

  const tabProps = selectedUser ? {
    userId: selectedUser.id,
    userRole: selectedUser.role,
    userName: selectedUser.name ?? selectedUser.email,
    isSelectedSuperAdmin: isSA,
  } : null;

  return (
    <div className={containerClassName ?? 'flex h-full min-h-0 min-w-0 overflow-hidden rounded-xl border bg-background'}>

      {/* People list */}
      <div className="flex max-h-44 w-full shrink-0 flex-col border-b border-slate-200 bg-slate-50/80 sm:max-h-none sm:w-56 sm:border-b-0 sm:border-r md:w-64">
        <div className="space-y-2 border-b border-slate-200 p-3">
          <p className="text-xs font-semibold text-slate-800">People</p>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search…" className="h-8 pl-8 text-xs" />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="All roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {allRoles.map(r => (
                <SelectItem key={r} value={r}>{ROLE_LABEL[r] ?? r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {filteredUsers.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">No users found</p>
          ) : filteredUsers.map(u => (
            <UserListRow
              key={u.id}
              user={u}
              isSelected={u.id === selectedId}
              onClick={() => { setSelectedId(u.id); setActiveTab('pages'); }}
            />
          ))}
        </div>

        <p className="border-t border-slate-200 p-2 text-center text-[10px] text-muted-foreground">
          {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}
        </p>
      </div>

      {!selectedUser ? (
        <EmptyState />
      ) : (
        <SelectedUserAccessProvider key={selectedUser.id} userId={selectedUser.id} userRole={selectedUser.role}>
          <AccessLoadGate>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white dark:bg-background">
            <UserHeader user={selectedUser} isSA={isSA} />

            <Tabs value={activeTab} onValueChange={v => setActiveTab(v as TabKey)}
              aria-label="User exception sections"
              className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <div className="flex shrink-0 items-center gap-1 border-b border-slate-200 bg-slate-50/60 px-3 py-2">
                <TabsList className="h-auto flex-1 justify-start gap-0.5 rounded-none border-0 bg-transparent p-0">
                  {PRIMARY_TABS.map(({ key, icon: Icon, label }) => (
                    <TabsTrigger
                      key={key}
                      value={key}
                      className={cn(
                        'h-8 shrink-0 gap-1.5 rounded-md border-0 px-2.5 text-xs font-medium shadow-none',
                        'text-slate-600 bg-transparent hover:bg-white hover:text-slate-900',
                        'data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-sm',
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" />
                      <span className="hidden sm:inline">{label}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={cn(
                        'h-8 gap-1.5 px-2.5 text-xs font-medium',
                        moreActive ? 'bg-slate-900 text-white hover:bg-slate-800 hover:text-white' : 'text-slate-600',
                      )}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                      {moreActive ? (MORE_TABS.find(t => t.key === activeTab)?.label ?? 'More') : 'More'}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {MORE_TABS.map(({ key, label }) => (
                      <DropdownMenuItem key={key} onClick={() => setActiveTab(key)}>
                        {label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {tabProps && (
                <>
                  <TabsContent value="overview" className="m-0 min-h-0 flex-1 overflow-hidden">
                    <OverviewTab {...tabProps} onTabChange={t => setActiveTab((t === 'permissions' ? 'buttons' : t) as TabKey)} />
                  </TabsContent>
                  <TabsContent value="pages" className="m-0 min-h-0 flex-1 overflow-hidden">
                    <PageAccessTab {...tabProps} initialPageSlug={requestedPage ?? undefined} onTabChange={t => setActiveTab((t === 'permissions' ? 'buttons' : t) as TabKey)} />
                  </TabsContent>
                  <TabsContent value="tabs" className="m-0 min-h-0 flex-1 overflow-hidden">
                    <TabAccessTab {...tabProps} />
                  </TabsContent>
                  <TabsContent value="buttons" className="m-0 min-h-0 flex-1 overflow-hidden">
                    <PermissionsTab {...tabProps} section="actions" actionFilter="buttons" />
                  </TabsContent>
                  <TabsContent value="reports" className="m-0 min-h-0 flex-1 overflow-hidden">
                    <PermissionsTab {...tabProps} section="actions" actionFilter="reports" />
                  </TabsContent>
                  <TabsContent value="columns" className="m-0 min-h-0 flex-1 overflow-hidden">
                    <PermissionsTab {...tabProps} section="columns" />
                  </TabsContent>
                  <TabsContent value="filters" className="m-0 min-h-0 flex-1 overflow-hidden">
                    <FilterControlsTab {...tabProps} />
                  </TabsContent>
                  <TabsContent value="scope" className="m-0 min-h-0 flex-1 overflow-hidden">
                    <DataScopeTab {...tabProps} />
                  </TabsContent>
                  <TabsContent value="overrides" className="m-0 min-h-0 flex-1 overflow-hidden">
                    <PermissionsTab {...tabProps} section="grants" />
                  </TabsContent>
                  <TabsContent value="audit" className="m-0 min-h-0 flex-1 overflow-hidden">
                    <AccessAuditTab {...tabProps} />
                  </TabsContent>
                </>
              )}
            </Tabs>
          </div>
          </AccessLoadGate>
        </SelectedUserAccessProvider>
      )}
    </div>
  );
}

function UserListRow({ user, isSelected, onClick }: { user: UAMUser; isSelected: boolean; onClick: () => void }) {
  const initials = getInitials(user.name, user.email);
  const roleCls = ROLE_COLOR[user.role] ?? 'bg-gray-100 text-gray-600';
  return (
    <button type="button" onClick={onClick} aria-pressed={isSelected}
      aria-label={`Manage access for ${user.name ?? user.email}`}
      className={cn(
        'flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
        isSelected ? 'border-r-2 border-primary bg-primary/10' : 'hover:bg-muted/50',
      )}>
      <Avatar className="h-7 w-7 shrink-0">
        <AvatarFallback className={cn('text-[10px] font-bold', roleCls)}>{initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{user.name ?? user.email}</p>
        <p className="truncate text-[10px] text-muted-foreground">{ROLE_LABEL[user.role] ?? user.role}</p>
      </div>
      {isSelected && <ChevronRight className="h-3 w-3 shrink-0 text-primary" />}
    </button>
  );
}

function UserHeader({ user, isSA }: { user: UAMUser; isSA: boolean }) {
  const initials = getInitials(user.name, user.email);
  const roleCls = ROLE_COLOR[user.role] ?? 'bg-gray-100 text-gray-600';
  return (
    <div className={cn(
      'flex shrink-0 items-center gap-3 border-b border-slate-200 px-4 py-3',
      isSA ? 'bg-red-50/60 dark:bg-red-950/10' : 'bg-white dark:bg-background',
    )}>
      <Avatar className="h-9 w-9 shrink-0">
        <AvatarFallback className={cn('text-sm font-bold', roleCls)}>{initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {user.name ?? user.email}
          </p>
          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', roleCls)}>
            {ROLE_LABEL[user.role] ?? user.role}
          </span>
          {isSA && (
            <Badge className="flex items-center gap-0.5 border-0 bg-red-100 px-1.5 text-[9px] text-red-700">
              <Shield className="h-2.5 w-2.5" /> Read only
            </Badge>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-500">{user.email}</p>
      </div>
      <p className="hidden max-w-[12rem] text-right text-[11px] leading-snug text-slate-500 sm:block">
        <span className="font-medium text-slate-700 dark:text-slate-200">User exceptions</span>
        <span className="block text-slate-400">Role defaults → Roles tab</span>
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center text-muted-foreground">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
        <User className="h-7 w-7 opacity-30" />
      </div>
      <div>
        <p className="text-sm font-semibold">Select a person</p>
        <p className="mt-1 text-xs opacity-70">Grant or block access for that user. Role defaults stay under Roles.</p>
      </div>
    </div>
  );
}

function AccessLoadGate({ children }: { children: ReactNode }) {
  const { loadError, loadWarning, loading, hasLoaded, refresh } = useSelectedUserAccess();

  if (loadError && !loading && !hasLoaded) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div role="alert" className="max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-destructive" />
          <h2 className="text-sm font-semibold">Access data is unavailable</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            We could not load this user&apos;s access settings. Try again or pick another person.
          </p>
          <Button type="button" size="sm" className="mt-4 gap-1.5" onClick={() => void refresh()}>
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      </div>
    );
  }
  return (
    <>
      {loadError && hasLoaded && (
        <div role="alert" className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-300/50 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
          <span>Refresh failed. Showing last loaded settings.</span>
          <Button type="button" variant="outline" size="sm" className="h-7 gap-1" onClick={() => void refresh()}>
            <RefreshCw className="h-3 w-3" /> Retry
          </Button>
        </div>
      )}
      {loadWarning && (
        <div role="status" className="flex shrink-0 items-center gap-2 border-b border-amber-300/50 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>{loadWarning}</span>
        </div>
      )}
      {children}
    </>
  );
}
