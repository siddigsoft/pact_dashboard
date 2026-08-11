/**
 * UnifiedAccessManager — the single place where a Super Admin manages every
 * dimension of access for any user: page access, hub-tab access, action
 * permissions, column visibility, and data scope.
 */
import { useState, useMemo, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Search, Globe, Layers, Key, Database, Shield, User, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppContext } from '@/context/AppContext';
import { SelectedUserAccessProvider } from '@/context/role-management/SelectedUserAccessContext';
import { OverviewTab }     from './unified/OverviewTab';
import { PageAccessTab }   from './unified/PageAccessTab';
import { TabAccessTab }    from './unified/TabAccessTab';
import { PermissionsTab }  from './unified/PermissionsTab';
import { DataScopeTab }    from './unified/DataScopeTab';

// ── Role display helpers ────────────────────────────────────────────────────
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

function getInitials(name?: string | null, email?: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return (parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2)).toUpperCase();
  }
  return email?.slice(0, 2).toUpperCase() ?? '??';
}

// ── Types ──────────────────────────────────────────────────────────────────
type UAMUser = { id: string; name?: string | null; email: string; role: string };
type TabKey = 'overview' | 'pages' | 'tabs' | 'permissions' | 'scope';

// ── Component ──────────────────────────────────────────────────────────────
export function UnifiedAccessManager() {
  const { users } = useAppContext();

  const [search, setSearch]         = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab]   = useState<TabKey>('overview');

  // Distinct roles in the user list (exclude superAdmin — can't be overridden)
  const allRoles = useMemo(() => {
    const roles = [...new Set(users.map(u => u.role).filter(Boolean))].filter(r => r !== 'superAdmin');
    return roles.sort();
  }, [users]);

  // Filter users: exclude superAdmins from the editable list
  const filteredUsers = useMemo<UAMUser[]>(() => {
    const q = search.toLowerCase();
    return (users as UAMUser[]).filter(u => {
      if (!u.role || u.role === 'superAdmin') return false;
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (q) {
        const name = (u.name ?? '').toLowerCase();
        const email = u.email.toLowerCase();
        if (!name.includes(q) && !email.includes(q)) return false;
      }
      return true;
    });
  }, [users, search, roleFilter]);

  const selectedUser = useMemo<UAMUser | null>(
    () => (selectedId ? ((users as UAMUser[]).find(u => u.id === selectedId) ?? null) : null),
    [users, selectedId],
  );
  const isSA = selectedUser?.role === 'superAdmin';

  const tabProps = selectedUser ? {
    userId: selectedUser.id,
    userRole: selectedUser.role,
    userName: selectedUser.name ?? selectedUser.email,
    isSelectedSuperAdmin: isSA,
  } : null;

  return (
    <div className="flex h-[calc(100vh-260px)] min-h-[600px] border rounded-xl overflow-hidden bg-background">

      {/* ── Left panel: user list ── */}
      <div className="w-72 shrink-0 flex flex-col border-r bg-muted/20">
        {/* Search */}
        <div className="p-3 border-b space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search users…" className="pl-8 h-8 text-xs" />
          </div>
          {/* Role filter chips */}
          <div className="flex flex-wrap gap-1">
            <RoleChip value="all" active={roleFilter === 'all'} label="All" onClick={setRoleFilter} />
            {allRoles.slice(0, 8).map(r => (
              <RoleChip key={r} value={r} active={roleFilter === r}
                label={ROLE_LABEL[r] ?? r} onClick={setRoleFilter} />
            ))}
          </div>
        </div>

        {/* User list */}
        <div className="flex-1 overflow-y-auto py-1">
          {filteredUsers.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-8">No users found</p>
          ) : filteredUsers.map(u => (
            <UserListRow
              key={u.id}
              user={u}
              isSelected={u.id === selectedId}
              onClick={() => { setSelectedId(u.id); setActiveTab('overview'); }}
            />
          ))}
        </div>

        <div className="p-2 border-t text-[10px] text-muted-foreground text-center">
          {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''} · Super Admins excluded
        </div>
      </div>

      {/* ── Right panel ── */}
      {!selectedUser ? (
        <EmptyState />
      ) : (
        <SelectedUserAccessProvider userId={selectedUser.id} userRole={selectedUser.role}>
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* User header */}
            <UserHeader user={selectedUser} isSA={isSA} />

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={v => setActiveTab(v as TabKey)}
              className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="shrink-0 w-full justify-start rounded-none border-b bg-card px-3 gap-0 h-9">
                {([
                  { key: 'overview',     icon: User,   label: 'Overview' },
                  { key: 'pages',        icon: Globe,  label: 'Page Access' },
                  { key: 'tabs',         icon: Layers, label: 'Tab Access' },
                  { key: 'permissions',  icon: Key,    label: 'Permissions' },
                  { key: 'scope',        icon: Database, label: 'Data Scope' },
                ] as const).map(({ key, icon: Icon, label }) => (
                  <TabsTrigger key={key} value={key}
                    className="h-full rounded-none text-xs border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent gap-1.5">
                    <Icon className="h-3 w-3" />
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>

              {tabProps && (
                <>
                  <TabsContent value="overview" className="flex-1 overflow-hidden m-0">
                    <OverviewTab {...tabProps} onTabChange={t => setActiveTab(t as TabKey)} />
                  </TabsContent>
                  <TabsContent value="pages" className="flex-1 overflow-hidden m-0">
                    <PageAccessTab {...tabProps} />
                  </TabsContent>
                  <TabsContent value="tabs" className="flex-1 overflow-hidden m-0">
                    <TabAccessTab {...tabProps} />
                  </TabsContent>
                  <TabsContent value="permissions" className="flex-1 overflow-hidden m-0">
                    <PermissionsTab {...tabProps} />
                  </TabsContent>
                  <TabsContent value="scope" className="flex-1 overflow-hidden m-0">
                    <DataScopeTab {...tabProps} />
                  </TabsContent>
                </>
              )}
            </Tabs>
          </div>
        </SelectedUserAccessProvider>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function RoleChip({ value, active, label, onClick }: {
  value: string; active: boolean; label: string; onClick: (v: string) => void;
}) {
  return (
    <button onClick={() => onClick(value)}
      className={cn('text-[10px] px-2 py-0.5 rounded-full border font-medium transition-colors',
        active ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-background hover:bg-muted text-muted-foreground'
      )}>
      {label}
    </button>
  );
}

function UserListRow({ user, isSelected, onClick }: { user: UAMUser; isSelected: boolean; onClick: () => void }) {
  const initials = getInitials(user.name, user.email);
  const roleCls = ROLE_COLOR[user.role] ?? 'bg-gray-100 text-gray-600';
  return (
    <button onClick={onClick}
      className={cn('w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors',
        isSelected ? 'bg-primary/10 border-r-2 border-primary' : 'hover:bg-muted/50'
      )}>
      <Avatar className="h-7 w-7 shrink-0">
        <AvatarFallback className={cn('text-[10px] font-bold', roleCls)}>{initials}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{user.name ?? user.email}</p>
        <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
      </div>
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full font-medium', roleCls)}>
          {ROLE_LABEL[user.role] ?? user.role}
        </span>
        {isSelected && <ChevronRight className="h-3 w-3 text-primary" />}
      </div>
    </button>
  );
}

function UserHeader({ user, isSA }: { user: UAMUser; isSA: boolean }) {
  const initials = getInitials(user.name, user.email);
  const roleCls = ROLE_COLOR[user.role] ?? 'bg-gray-100 text-gray-600';
  return (
    <div className={cn(
      'shrink-0 flex items-center gap-3 px-5 py-3 border-b',
      isSA ? 'bg-red-50/50 dark:bg-red-950/10' : 'bg-card/50'
    )}>
      <Avatar className="h-9 w-9 shrink-0">
        <AvatarFallback className={cn('text-sm font-bold', roleCls)}>{initials}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold truncate">{user.name ?? user.email}</p>
          {isSA && (
            <Badge className="text-[9px] px-1.5 bg-red-100 text-red-700 border-0 flex items-center gap-0.5">
              <Shield className="h-2.5 w-2.5" /> Super Admin — Read Only
            </Badge>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
      </div>
      <span className={cn('text-[10px] px-2 py-1 rounded-full font-medium shrink-0', roleCls)}>
        {ROLE_LABEL[user.role] ?? user.role}
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 text-muted-foreground px-8">
      <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
        <User className="h-8 w-8 opacity-30" />
      </div>
      <div>
        <p className="text-sm font-semibold">Select a user</p>
        <p className="text-xs opacity-70 mt-1">Choose a user from the left panel to manage their page access, tab visibility, action permissions, and data scope.</p>
      </div>
    </div>
  );
}
