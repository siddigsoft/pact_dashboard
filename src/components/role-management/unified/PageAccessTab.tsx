/**
 * PageAccessTab — unified per-user page access + By-Page cross-user view
 * inside the Access Manager.
 *
 * Two modes (toggle at toolbar):
 *  • By User  — current user-centric view (page list, expand for col/action detail)
 *  • By Page  — pick any page and see ALL users, their status, R/W/C/D controls,
 *               plus role-default editing via the page_role_configs table.
 */
import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Search, ChevronRight, ChevronDown, Loader2, Shield,
  Eye, EyeOff, X, Key, Columns, ArrowRight,
  Users, LayoutDashboard, Pencil, Check, Filter,
  Lock, Unlock, UserCheck, UserX, Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  PAGE_DEFS, PAGE_GROUPS, PAGE_ROLE_ALL_OPTIONS, ROLE_LABELS, ROLE_COLORS,
  getRoleCode, hasDefaultAccess, getAccessStatus,
  parsePermissions, DEFAULT_PERMS, PERM_DEFS,
  type Perms, type AccessStatus,
} from '@/pages/PageAccessControl';
import { COLUMN_REGISTRY } from '@/lib/column-registry';
import { useSelectedUserAccess } from '@/context/role-management/SelectedUserAccessContext';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { TabProps } from './types';

// ── Page → resources mapping (used to surface action overrides inline) ────────
const PAGE_SLUG_TO_RESOURCES: Record<string, string[]> = {
  'cost-submission':      ['cost_submissions'],
  'admin-wallets':        ['wallets'],
  'transaction-scanner':  ['transactions'],
  'site-visits':          ['site_visits'],
  'payroll-admin':        ['payroll', 'hr'],
  'employees':            ['hr'],
  'users':                ['users'],
  'role-management':      ['roles', 'permissions'],
  'finance-hub':          ['finances', 'wallets', 'accounting', 'down_payments'],
  'hr':                   ['hr', 'payroll', 'leave', 'benefits'],
  'accounting':           ['accounting'],
  'pre-funding':          ['pre_funding'],
  'down-payment-tracker': ['down_payments'],
  'projects':             ['projects'],
  'programme-hub':        ['projects', 'portfolio', 'analytics'],
  'field-ops':            ['site_visits', 'safety', 'incidents', 'equipment'],
  'mmp':                  ['mmp'],
  'safety-hub':           ['safety'],
  'incident-reports':     ['incidents'],
  'equipment':            ['equipment'],
  'surveys':              ['surveys'],
  'analytics':            ['analytics'],
  'crm':                  ['crm'],
  'broadcast':            ['broadcast'],
  'whatsapp-admin':       ['whatsapp'],
  'notifications':        ['notifications'],
  'tasks':                ['tasks'],
  'super-admin-hub':      ['system', 'super_admins'],
};

// ── Visual config ─────────────────────────────────────────────────────────────
const GROUP_COLORS: Record<string, string> = {
  'My Workspace':         'bg-blue-100 text-blue-700',
  'Communication':        'bg-purple-100 text-purple-700',
  'Programme Management': 'bg-teal-100 text-teal-700',
  'Field Operations':     'bg-amber-100 text-amber-700',
  'Coordination':         'bg-lime-100 text-lime-700',
  'Finance':              'bg-green-100 text-green-700',
  'Accounting':           'bg-emerald-100 text-emerald-700',
  'HR & People':          'bg-pink-100 text-pink-700',
  'Analytics':            'bg-cyan-100 text-cyan-700',
  'Surveys':              'bg-sky-100 text-sky-700',
  'Administration':       'bg-red-100 text-red-700',
  'Super Admin':          'bg-rose-100 text-rose-700',
  'Audit & Security':     'bg-orange-100 text-orange-700',
  'CRM':                  'bg-violet-100 text-violet-700',
};

const EFF_CONFIG: Record<import('./types').AccessEffect, {
  label: string; dot: string; rowCls: string; btnLabel: string; btnCls: string;
}> = {
  superadmin: { label: 'Full Access',      dot: 'bg-red-400',     rowCls: '',                                                                       btnLabel: '—',             btnCls: 'opacity-30' },
  granted:    { label: 'Granted',          dot: 'bg-emerald-400', rowCls: 'bg-emerald-50/40 border-l-2 border-l-emerald-400',                       btnLabel: 'Remove Grant',  btnCls: 'text-amber-600 border-amber-200 hover:bg-amber-50' },
  blocked:    { label: 'Blocked',          dot: 'bg-red-400',     rowCls: 'bg-red-50/40 border-l-2 border-l-red-400',                               btnLabel: 'Remove Block',  btnCls: 'text-emerald-600 border-emerald-200 hover:bg-emerald-50' },
  'role-yes': { label: 'Role Default ✓',   dot: 'bg-blue-400',    rowCls: 'bg-blue-50/20',                                                          btnLabel: 'Block for User',btnCls: 'text-red-600 border-red-200 hover:bg-red-50' },
  'role-no':  { label: 'No Access',        dot: 'bg-slate-300',   rowCls: 'opacity-50',                                                             btnLabel: 'Grant to User', btnCls: 'text-emerald-600 border-emerald-200 hover:bg-emerald-50' },
};

const BY_PAGE_STATUS_UI = {
  granted: { label: 'Explicitly Granted', cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-400', icon: UserCheck },
  blocked: { label: 'Explicitly Blocked', cls: 'bg-red-100 text-red-700',         dot: 'bg-red-400',     icon: Lock     },
  role:    { label: 'Role Access',        cls: 'bg-blue-100 text-blue-700',        dot: 'bg-blue-400',    icon: Shield   },
  denied:  { label: 'No Access',          cls: 'bg-slate-100 text-slate-500',      dot: 'bg-slate-300',   icon: UserX    },
};
const STATUS_ORDER: Record<AccessStatus, number> = { blocked: 0, granted: 1, role: 2, denied: 3 };

function initials(name: string | null) {
  return (name ?? '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}
function roleLabel(rawRole: string | null) {
  const code = getRoleCode(rawRole);
  return ROLE_LABELS[code ?? ''] ?? (rawRole ?? 'Unknown');
}
function packPermissions(p: Perms) { return JSON.stringify(p); }

type StatusFilter = 'all' | 'granted' | 'blocked' | 'role-yes' | 'role-no';
type ByPageStatusFilter = AccessStatus | 'all';

// ── DB shapes ─────────────────────────────────────────────────────────────────
interface Profile { id: string; full_name: string | null; role: string | null; }
interface ByPageOverride {
  id: string; page_slug: string; user_id: string; is_blocked: boolean;
  level?: string | null; notes?: string | null; granted_by?: string | null;
}

// ── CS action labels for inline display ──────────────────────────────────────
const CS_ACTION_LABELS: Record<string, string> = {
  mark_paid: 'Mark Paid', revert_paid: 'Revert Paid', send_to_finance: 'Send to Finance',
  reconcile: 'Reconcile', recall: 'Recall', revert_tier: 'Revert Tier', edit: 'Edit Any',
};

// ── ByPageUserRow (inline in By-Page mode) ────────────────────────────────────
function ByPageUserRow({
  profile, status, override, saving, pageLabel, hasRoleAccess,
  onGrant, onBlock, onReset, onTogglePerm,
}: {
  profile: Profile;
  status: AccessStatus;
  override?: ByPageOverride;
  saving: boolean;
  pageLabel: string;
  hasRoleAccess: boolean;
  onGrant: () => void;
  onBlock: () => void;
  onReset: () => void;
  onTogglePerm: (p: Perms) => void;
}) {
  const ui = BY_PAGE_STATUS_UI[status];
  const Icon = ui.icon;
  const isGranted = status === 'granted';
  const isRole    = status === 'role';
  const currentPerms: Perms = isGranted && override
    ? parsePermissions(override.notes ?? null)
    : isRole ? { r: true, w: true, c: true, d: true } : { ...DEFAULT_PERMS };
  const isPartialRestriction = isGranted && hasRoleAccess && !(currentPerms.r && currentPerms.w && currentPerms.c && currentPerms.d);
  const showToggles = isGranted || isRole;

  return (
    <div className={cn(
      'flex items-start gap-2.5 p-2.5 rounded-xl border transition-colors group',
      status === 'blocked'         ? 'bg-red-50/50 border-red-200/60' :
      isPartialRestriction         ? 'bg-amber-50/30 border-amber-300/70' :
      status === 'granted'         ? 'bg-emerald-50/50 border-emerald-200/60' :
      status === 'role'            ? 'bg-blue-50/20 border-blue-100/40' :
      'bg-card border-transparent hover:border-border'
    )}>
      {/* Avatar */}
      <div className={cn(
        'w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5',
        status === 'denied' || status === 'blocked'
          ? 'bg-slate-200 text-slate-500' : 'bg-[#0F2041]/10 text-[#0F2041]'
      )}>
        {initials(profile.full_name)}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold leading-tight">{profile.full_name ?? 'Unknown'}</p>
        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
          <span className={cn('text-[9px] font-medium px-1.5 py-0.5 rounded-full capitalize shrink-0',
            ROLE_COLORS[getRoleCode(profile.role) ?? ''] ?? 'bg-slate-100 text-slate-500'
          )}>
            {roleLabel(profile.role)}
          </span>

          <Tooltip>
            <TooltipTrigger asChild>
              <span className={cn(
                'text-[9px] font-medium px-1.5 py-0.5 rounded-full flex items-center gap-0.5 whitespace-nowrap shrink-0 cursor-help',
                isPartialRestriction ? 'bg-amber-100 text-amber-700' : ui.cls,
              )}>
                <Icon className="h-2.5 w-2.5" />
                {isPartialRestriction ? 'Partial Restriction' : ui.label}
              </span>
            </TooltipTrigger>
            {isPartialRestriction && (
              <TooltipContent className="text-xs max-w-[200px]">
                Role-based access but some permissions restricted via override.
              </TooltipContent>
            )}
          </Tooltip>

          {/* Controls */}
          <div className="flex items-center gap-1 ml-auto">
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            ) : status === 'blocked' ? (
              <button
                onClick={onGrant}
                className="opacity-0 group-hover:opacity-100 text-[9px] flex items-center gap-0.5 px-2 py-0.5 rounded border text-sky-600 border-sky-200 hover:bg-sky-50 transition-all"
              >
                <Unlock className="h-2.5 w-2.5" /> Unblock
              </button>
            ) : (
              <>
                {/* R/W/C/D toggles */}
                <div className={cn(
                  'flex items-center gap-0.5 transition-opacity',
                  !showToggles && 'opacity-0 group-hover:opacity-100',
                  isRole && !isPartialRestriction && 'opacity-0 group-hover:opacity-100',
                )}>
                  {PERM_DEFS.map(pd => {
                    const active = showToggles && currentPerms[pd.key];
                    return (
                      <Tooltip key={pd.key}>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => {
                              if (!isGranted && !isRole) {
                                onTogglePerm({ r: true, w: pd.key === 'w', c: pd.key === 'c', d: pd.key === 'd' });
                              } else if (isRole) {
                                onTogglePerm({ ...currentPerms, [pd.key]: !currentPerms[pd.key] });
                              } else {
                                const next = { ...currentPerms, [pd.key]: !currentPerms[pd.key] };
                                if (!next.r && !next.w && !next.c && !next.d) next.r = true;
                                onTogglePerm(next);
                              }
                            }}
                            className={cn(
                              'text-[8px] font-bold px-1 py-0.5 rounded border transition-all',
                              active ? pd.activeClass : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-400'
                            )}
                          >
                            {pd.label[0]}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">{pd.label} — {pd.desc}</TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>

                <button
                  onClick={onBlock}
                  className="opacity-0 group-hover:opacity-100 text-[9px] flex items-center gap-0.5 px-2 py-0.5 rounded border text-red-600 border-red-200 hover:bg-red-50 transition-all"
                >
                  <Lock className="h-2.5 w-2.5" /> Block
                </button>
              </>
            )}

            {override && !saving && (
              <button
                onClick={onReset}
                className="opacity-0 group-hover:opacity-100 text-[9px] px-2 py-0.5 rounded border text-muted-foreground border-border hover:bg-muted transition-all"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────
interface PageAccessTabProps extends TabProps {
  onTabChange: (tab: string) => void;
}

export function PageAccessTab({ userRole, isSelectedSuperAdmin, onTabChange, userId }: PageAccessTabProps) {
  const { currentUser } = useAppContext();
  const { toast } = useToast();
  const qc = useQueryClient();

  // ── Context (By-User mode) ────────────────────────────────────────────────
  const {
    loading, savingKey, effectivePage, togglePage,
    columnConfigs, permOverrides, upsertColumnVisibility, removeColumnVisibility,
  } = useSelectedUserAccess();

  // ── Mode ──────────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<'user' | 'page'>('user');

  // ── By-User state ─────────────────────────────────────────────────────────
  const [search,        setSearch]        = useState('');
  const [statusFilter,  setStatusFilter]  = useState<StatusFilter>('all');
  const [expandedGroups,setExpandedGroups]= useState<Set<string>>(new Set(PAGE_GROUPS.slice(0, 4)));
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());

  // ── By-Page state ─────────────────────────────────────────────────────────
  const [selectedPage,      setSelectedPage]      = useState(PAGE_DEFS[0]);
  const [pageSearch,        setPageSearch]        = useState('');
  const [byPageUserSearch,  setByPageUserSearch]  = useState('');
  const [byPageStatusFilter,setByPageStatusFilter]= useState<ByPageStatusFilter>('all');
  const [pageGroupExpanded, setPageGroupExpanded] = useState<Set<string>>(new Set(PAGE_GROUPS.slice(0, 4)));
  const [rolePopoverOpen,   setRolePopoverOpen]   = useState(false);
  const [savingRoles,       setSavingRoles]       = useState(false);
  const [savingByPageId,    setSavingByPageId]    = useState<string | null>(null);

  // ── By-Page queries (only active when needed) ─────────────────────────────
  const { data: profiles = [] } = useQuery<Profile[]>({
    queryKey: ['bp-profiles'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, role').order('full_name');
      return (data ?? []) as Profile[];
    },
    staleTime: 60_000,
    enabled: viewMode === 'page',
  });

  const { data: allOverrides = [], refetch: refetchOverrides } = useQuery<ByPageOverride[]>({
    queryKey: ['bp-page-overrides'],
    queryFn: async () => {
      const { data } = await supabase.from('page_access_overrides').select('*');
      return (data ?? []) as ByPageOverride[];
    },
    staleTime: 15_000,
    enabled: viewMode === 'page',
  });

  const { data: roleConfigs = {}, refetch: refetchRoleConfigs } = useQuery<Record<string, string[]>>({
    queryKey: ['bp-role-configs'],
    queryFn: async () => {
      const { data } = await supabase.from('page_role_configs').select('page_slug, roles');
      const m: Record<string, string[]> = {};
      (data ?? []).forEach((r: any) => { m[r.page_slug] = r.roles; });
      return m;
    },
    staleTime: 30_000,
    enabled: viewMode === 'page',
  });

  // ── By-Page computed ──────────────────────────────────────────────────────
  const overrideByPageSlug = useMemo(() => {
    const m: Record<string, Record<string, ByPageOverride>> = {};
    allOverrides.forEach(o => {
      if (!m[o.page_slug]) m[o.page_slug] = {};
      m[o.page_slug][o.user_id] = o;
    });
    return m;
  }, [allOverrides]);

  const effectiveRoles = roleConfigs[selectedPage.slug] ?? selectedPage.roles;
  const pageOverrideMap = overrideByPageSlug[selectedPage.slug] ?? {};
  const nonSuperProfiles = useMemo(() => profiles.filter(p => getRoleCode(p.role) !== 'superAdmin'), [profiles]);

  const filteredByPageUsers = useMemo(() => {
    const q = byPageUserSearch.toLowerCase();
    return nonSuperProfiles
      .filter(p => {
        if (q && !(p.full_name ?? '').toLowerCase().includes(q) && !roleLabel(p.role).toLowerCase().includes(q)) return false;
        if (byPageStatusFilter !== 'all') {
          if (getAccessStatus(selectedPage, p, pageOverrideMap, effectiveRoles) !== byPageStatusFilter) return false;
        }
        return true;
      })
      .sort((a, b) =>
        STATUS_ORDER[getAccessStatus(selectedPage, a, pageOverrideMap, effectiveRoles)] -
        STATUS_ORDER[getAccessStatus(selectedPage, b, pageOverrideMap, effectiveRoles)]
      );
  }, [nonSuperProfiles, byPageUserSearch, byPageStatusFilter, selectedPage, pageOverrideMap, effectiveRoles]);

  const byPageCounts = useMemo(() => {
    const c = { blocked: 0, granted: 0, role: 0, denied: 0 };
    nonSuperProfiles.forEach(p => c[getAccessStatus(selectedPage, p, pageOverrideMap, effectiveRoles)]++);
    return c;
  }, [nonSuperProfiles, selectedPage, pageOverrideMap, effectiveRoles]);

  const filteredByPagePages = useMemo(() => {
    const q = pageSearch.toLowerCase();
    return PAGE_DEFS.filter(p => !q || p.label.toLowerCase().includes(q) || p.group.toLowerCase().includes(q));
  }, [pageSearch]);
  const byPageGroupedPages = useMemo(() =>
    PAGE_GROUPS.map(g => ({ group: g, pages: filteredByPagePages.filter(p => p.group === g) })).filter(g => g.pages.length),
    [filteredByPagePages],
  );
  const effectivePageGroupExpanded = pageSearch.trim() ? new Set(byPageGroupedPages.map(g => g.group)) : pageGroupExpanded;

  function togglePageGroup(g: string) {
    setPageGroupExpanded(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });
  }

  // ── By-Page save helpers ──────────────────────────────────────────────────
  async function applyByPageOverride(
    profile: Profile, isBlocked: boolean, perms: Perms = DEFAULT_PERMS, existingId?: string,
  ) {
    setSavingByPageId(profile.id);
    try {
      const level: 'view' | 'manage' = (perms.w || perms.c || perms.d) ? 'manage' : 'view';
      const notes = isBlocked ? null : packPermissions(perms);
      if (existingId) {
        await supabase.from('page_access_overrides')
          .update({ is_blocked: isBlocked, level, notes, granted_by: currentUser?.id })
          .eq('id', existingId);
      } else {
        await supabase.from('page_access_overrides')
          .insert({ page_slug: selectedPage.slug, user_id: profile.id, is_blocked: isBlocked, level, notes, granted_by: currentUser?.id });
      }
      const permStr = isBlocked ? 'Blocked' :
        [perms.r && 'Read', perms.w && 'Write', perms.c && 'Create', perms.d && 'Delete'].filter(Boolean).join(' + ');
      toast({ title: isBlocked ? 'Access blocked' : 'Access granted', description: `${profile.full_name ?? 'User'} → ${selectedPage.label} (${permStr})` });
      refetchOverrides();
      qc.invalidateQueries({ queryKey: ['bp-page-overrides'] });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setSavingByPageId(null); }
  }

  async function removeByPageOverride(id: string, userId: string) {
    setSavingByPageId(userId);
    try {
      await supabase.from('page_access_overrides').delete().eq('id', id);
      toast({ title: 'Override removed', description: 'User reverts to role-based access.' });
      refetchOverrides();
      qc.invalidateQueries({ queryKey: ['bp-page-overrides'] });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setSavingByPageId(null); }
  }

  async function saveRoleConfig(slug: string, roles: string[]) {
    setSavingRoles(true);
    try {
      await supabase.from('page_role_configs').upsert(
        { page_slug: slug, roles, updated_by: currentUser?.id, updated_at: new Date().toISOString() },
        { onConflict: 'page_slug' }
      );
      refetchRoleConfigs();
      qc.invalidateQueries({ queryKey: ['bp-role-configs'] });
      toast({ title: 'Default access updated', description: `Roles saved for ${selectedPage.label}.` });
    } catch (e: any) {
      toast({ title: 'Error saving roles', description: e.message, variant: 'destructive' });
    } finally { setSavingRoles(false); }
  }

  // ── By-User helpers ───────────────────────────────────────────────────────
  const userColMap = useMemo(() =>
    Object.fromEntries(columnConfigs.filter(c => c.user_id === userId).map(c => [`${c.page_slug}:${c.column_key}`, c])),
    [columnConfigs, userId],
  );
  const roleColMap = useMemo(() =>
    Object.fromEntries(columnConfigs.filter(c => c.role === userRole).map(c => [`${c.page_slug}:${c.column_key}`, c])),
    [columnConfigs, userRole],
  );
  const colRegBySlug = useMemo(() =>
    Object.fromEntries(COLUMN_REGISTRY.map(p => [p.pageSlug, p])),
    [],
  );
  const filteredByUserPages = useMemo(() => {
    const q = search.toLowerCase();
    return PAGE_DEFS.filter(p => {
      if (q && !p.label.toLowerCase().includes(q) && !p.group.toLowerCase().includes(q)) return false;
      if (statusFilter !== 'all') {
        if (effectivePage(p.slug) !== statusFilter) return false;
      }
      return true;
    });
  }, [search, statusFilter, effectivePage]);
  const groupedByUserPages = useMemo(() =>
    PAGE_GROUPS.map(g => ({ group: g, pages: filteredByUserPages.filter(p => p.group === g) })).filter(g => g.pages.length),
    [filteredByUserPages],
  );
  const effectiveByUserExpanded = (search || statusFilter !== 'all')
    ? new Set(groupedByUserPages.map(g => g.group)) : expandedGroups;

  const byUserStats = useMemo(() => {
    const accessible = PAGE_DEFS.filter(p => { const e = effectivePage(p.slug); return e === 'role-yes' || e === 'granted' || e === 'superadmin'; }).length;
    const blocked    = PAGE_DEFS.filter(p => effectivePage(p.slug) === 'blocked').length;
    const granted    = PAGE_DEFS.filter(p => effectivePage(p.slug) === 'granted').length;
    return { accessible, blocked, granted };
  }, [effectivePage]);

  // ── Super admin short-circuit ─────────────────────────────────────────────
  if (isSelectedSuperAdmin && viewMode === 'user') {
    return (
      <TooltipProvider>
        <div className="flex flex-col h-full overflow-hidden">
          {/* Mode toggle — still show so admin can switch to By-Page */}
          <div className="px-5 py-3 border-b bg-card/50">
            <ModeToggle viewMode={viewMode} onSwitch={setViewMode} />
          </div>
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3 text-muted-foreground">
            <Shield className="h-10 w-10 opacity-20" />
            <p className="text-sm font-semibold">Super Admin — All Pages Always Accessible</p>
            <p className="text-xs max-w-xs opacity-70">Super Admins bypass all page access rules. Switch to "By Page" to manage other users.</p>
          </div>
        </div>
      </TooltipProvider>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <TooltipProvider>
      <div className="flex flex-col h-full overflow-hidden">

        {/* ── Toolbar ────────────────────────────────────────────────────── */}
        <div className="px-5 py-3 border-b bg-card/50 flex flex-col gap-2">
          <ModeToggle viewMode={viewMode} onSwitch={(m) => { setViewMode(m); }} />

          {viewMode === 'user' && (
            <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search pages…" className="pl-8 h-7 text-xs" />
              </div>
              <div className="flex gap-1 flex-wrap">
                {(['all', 'granted', 'blocked', 'role-yes', 'role-no'] as StatusFilter[]).map(s => (
                  <button key={s} onClick={() => setStatusFilter(s)}
                    className={cn('px-2.5 py-1 text-[10px] font-medium rounded-full border transition-colors',
                      statusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
                    )}>
                    {s === 'all'      ? `All (${PAGE_DEFS.length})`
                      : s === 'granted'  ? `Granted (${byUserStats.granted})`
                      : s === 'blocked'  ? `Blocked (${byUserStats.blocked})`
                      : s === 'role-yes' ? 'Role Default ✓' : 'No Access'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── By-User stats bar ─────────────────────────────────────────── */}
        {viewMode === 'user' && (
          <div className="px-5 py-2 border-b bg-muted/20 flex items-center gap-3 text-[10px] text-muted-foreground">
            <span>{byUserStats.accessible} accessible</span>
            <span>·</span><span>{byUserStats.blocked} blocked</span>
            <span>·</span><span>{byUserStats.granted} granted overrides</span>
            <span>·</span><span className="italic opacity-70">Click a page row to see column visibility and action permissions inline</span>
          </div>
        )}

        {/* ── Body ───────────────────────────────────────────────────────── */}
        {viewMode === 'user' ? (
          /* ════════════════ BY USER ════════════════ */
          <ByUserBody
            loading={loading}
            savingKey={savingKey}
            effectivePage={effectivePage}
            togglePage={togglePage}
            expandedGroups={expandedGroups}
            setExpandedGroups={setExpandedGroups}
            expandedPages={expandedPages}
            setExpandedPages={setExpandedPages}
            groupedPages={groupedByUserPages}
            effectiveExpanded={effectiveByUserExpanded}
            colRegBySlug={colRegBySlug}
            userColMap={userColMap}
            roleColMap={roleColMap}
            permOverrides={permOverrides}
            upsertColumnVisibility={upsertColumnVisibility}
            removeColumnVisibility={removeColumnVisibility}
            onTabChange={onTabChange}
            userRole={userRole}
            userId={userId}
            onSwitchToByPage={(slug) => {
              const page = PAGE_DEFS.find(p => p.slug === slug);
              if (page) { setSelectedPage(page); setViewMode('page'); }
            }}
          />
        ) : (
          /* ════════════════ BY PAGE ════════════════ */
          <div className="flex flex-1 overflow-hidden">
            {/* Left: page tree */}
            <div className="w-56 flex-shrink-0 border-r flex flex-col bg-card">
              <div className="p-2 border-b">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                  <Input value={pageSearch} onChange={e => setPageSearch(e.target.value)}
                    placeholder="Search pages…" className="pl-7 h-7 text-[11px]" />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
                {byPageGroupedPages.map(({ group, pages }) => {
                  const isOpen = effectivePageGroupExpanded.has(group);
                  return (
                    <div key={group}>
                      <button onClick={() => togglePageGroup(group)}
                        className="w-full flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors">
                        <ChevronRight className={cn('h-2.5 w-2.5 transition-transform', isOpen && 'rotate-90')} />
                        {group}
                      </button>
                      {isOpen && pages.map(page => {
                        const Icon = page.icon;
                        const isSelected = page.slug === selectedPage.slug;
                        const ovCount = Object.keys(overrideByPageSlug[page.slug] ?? {}).length;
                        const isCustomRole = !!roleConfigs[page.slug];
                        return (
                          <button key={page.slug}
                            onClick={() => { setSelectedPage(page); setByPageUserSearch(''); setByPageStatusFilter('all'); }}
                            className={cn('w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-left transition-all ml-1',
                              isSelected ? 'bg-[#1D3461] text-white' : 'hover:bg-muted/50 text-foreground'
                            )}>
                            <Icon className={cn('h-3 w-3 shrink-0', isSelected ? 'text-white/80' : 'text-muted-foreground')} />
                            <span className="flex-1 text-[11px] font-medium truncate">{page.label}</span>
                            <div className="flex items-center gap-0.5 shrink-0">
                              {isCustomRole && (
                                <span className={cn('text-[7px] font-bold px-1 py-0.5 rounded-full',
                                  isSelected ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700')}>C</span>
                              )}
                              {ovCount > 0 && (
                                <span className={cn('text-[8px] font-bold px-1.5 py-0.5 rounded-full',
                                  isSelected ? 'bg-white/20 text-white' : 'bg-[#1D3461]/10 text-[#1D3461]')}>{ovCount}</span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: user list for selected page */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Page header with role defaults */}
              <div className="px-4 py-3 border-b bg-card flex-shrink-0">
                <div className="flex items-start gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm font-bold">{selectedPage.label}</h3>
                      {selectedPage.note && (
                        <Tooltip>
                          <TooltipTrigger><Info className="h-3 w-3 text-muted-foreground" /></TooltipTrigger>
                          <TooltipContent className="text-xs max-w-[200px]">{selectedPage.note}</TooltipContent>
                        </Tooltip>
                      )}
                      {roleConfigs[selectedPage.slug] && (
                        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">custom roles</span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground font-mono">{selectedPage.path}</p>
                  </div>
                </div>

                {/* Role defaults row */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-muted-foreground shrink-0">Default access:</span>
                  {effectiveRoles.map(r => (
                    <button key={r}
                      onClick={() => saveRoleConfig(selectedPage.slug, effectiveRoles.filter(x => x !== r))}
                      disabled={savingRoles}
                      title={`Remove ${r === 'all' ? 'Everyone' : ROLE_LABELS[r] ?? r}`}
                      className={cn('group flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded-full transition-opacity',
                        r === 'all' ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' :
                        r === '!dataCollector' ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' :
                        cn(ROLE_COLORS[r] ?? 'bg-slate-100 text-slate-500', 'hover:opacity-80')
                      )}>
                      {r === 'all' ? 'Everyone' : r === '!dataCollector' ? 'All except DC' : ROLE_LABELS[r] ?? r}
                      <X className="h-2 w-2 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}

                  <Popover open={rolePopoverOpen} onOpenChange={setRolePopoverOpen}>
                    <PopoverTrigger asChild>
                      <button className="flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-muted hover:bg-muted/80 text-muted-foreground border border-dashed transition-colors">
                        <Pencil className="h-2 w-2" /> Edit
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-68 p-3">
                      <div className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                        <Shield className="h-3.5 w-3.5 text-[#1D3461]" /> Edit default access roles
                      </div>
                      <p className="text-[10px] text-muted-foreground mb-2.5">
                        Toggle which roles have default access to <span className="font-medium">{selectedPage.label}</span>.
                        Changes are saved immediately.
                      </p>
                      <div className="flex flex-wrap gap-1 mb-2.5">
                        {PAGE_ROLE_ALL_OPTIONS.map(r => {
                          const active = effectiveRoles.includes(r);
                          return (
                            <button key={r} disabled={savingRoles}
                              onClick={() => {
                                const next = active ? effectiveRoles.filter(x => x !== r) : [...effectiveRoles, r];
                                saveRoleConfig(selectedPage.slug, next);
                              }}
                              className={cn(
                                'flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded-full border transition-all',
                                active
                                  ? cn('border-transparent', r === 'all' ? 'bg-blue-100 text-blue-700' : ROLE_COLORS[r] ?? 'bg-slate-100 text-slate-500')
                                  : 'bg-background border-dashed text-muted-foreground hover:bg-muted'
                              )}>
                              {active && <Check className="h-2 w-2" />}
                              {r === 'all' ? 'Everyone' : ROLE_LABELS[r] ?? r}
                            </button>
                          );
                        })}
                      </div>
                      {roleConfigs[selectedPage.slug] && (
                        <button disabled={savingRoles}
                          onClick={() => {
                            supabase.from('page_role_configs').delete().eq('page_slug', selectedPage.slug).then(() => {
                              refetchRoleConfigs();
                              qc.invalidateQueries({ queryKey: ['bp-role-configs'] });
                              toast({ title: 'Reset to defaults', description: `${selectedPage.label} reverted to built-in roles.` });
                            });
                          }}
                          className="w-full text-[9px] text-muted-foreground hover:text-destructive text-center py-0.5 transition-colors">
                          Reset to built-in defaults
                        </button>
                      )}
                      {savingRoles && <p className="text-[9px] text-center text-muted-foreground mt-1 animate-pulse">Saving…</p>}
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Status filter chips */}
                <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                  {(['all', 'granted', 'blocked', 'role', 'denied'] as const).map(s => (
                    <button key={s}
                      onClick={() => setByPageStatusFilter(s === byPageStatusFilter ? 'all' : s)}
                      className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium border transition-all',
                        byPageStatusFilter === s ? 'bg-[#1D3461] text-white border-[#1D3461]' : 'border-muted-foreground/30 text-muted-foreground hover:border-[#1D3461] hover:text-[#1D3461]'
                      )}>
                      {s === 'all' ? `All ${nonSuperProfiles.length}` : (
                        <>
                          <span className={cn('w-1.5 h-1.5 rounded-full inline-block', BY_PAGE_STATUS_UI[s]?.dot ?? '')} />
                          {BY_PAGE_STATUS_UI[s]?.label ?? s} {byPageCounts[s as AccessStatus] ?? ''}
                        </>
                      )}
                    </button>
                  ))}
                  <div className="ml-auto relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                    <Input value={byPageUserSearch} onChange={e => setByPageUserSearch(e.target.value)}
                      placeholder="Search users…" className="pl-6 h-6 text-[10px] w-44" />
                  </div>
                </div>
              </div>

              {/* User list */}
              <div className="flex-1 overflow-y-auto px-4 py-2.5">
                {profiles.length === 0 && (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                )}
                {profiles.length > 0 && filteredByPageUsers.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <Filter className="h-7 w-7 text-muted-foreground/30 mb-2" />
                    <p className="text-xs text-muted-foreground">No users match this filter.</p>
                    <button onClick={() => { setByPageStatusFilter('all'); setByPageUserSearch(''); }}
                      className="text-[10px] text-[#1D3461] hover:underline mt-1">Clear filter</button>
                  </div>
                )}
                <div className="space-y-1.5 max-w-2xl">
                  {filteredByPageUsers.map(profile => {
                    const status = getAccessStatus(selectedPage, profile, pageOverrideMap, effectiveRoles);
                    const ov = pageOverrideMap[profile.id];
                    const hasRole = hasDefaultAccess(selectedPage, profile.role, effectiveRoles);
                    const saving = savingByPageId === profile.id;
                    return (
                      <ByPageUserRow
                        key={profile.id}
                        profile={profile}
                        status={status}
                        override={ov}
                        saving={saving}
                        pageLabel={selectedPage.label}
                        hasRoleAccess={hasRole}
                        onGrant={() => applyByPageOverride(profile, false, DEFAULT_PERMS, ov?.id)}
                        onBlock={() => applyByPageOverride(profile, true, DEFAULT_PERMS, ov?.id)}
                        onReset={() => ov && removeByPageOverride(ov.id, profile.id)}
                        onTogglePerm={(perms) => applyByPageOverride(profile, false, perms, ov?.id)}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

// ── Mode toggle sub-component ─────────────────────────────────────────────────
function ModeToggle({ viewMode, onSwitch }: { viewMode: 'user' | 'page'; onSwitch: (m: 'user' | 'page') => void }) {
  return (
    <div className="flex rounded-lg border p-0.5 bg-muted/40 w-fit">
      <button
        onClick={() => onSwitch('user')}
        className={cn(
          'flex items-center gap-1 text-[10px] font-medium px-3 py-1.5 rounded-md transition-all',
          viewMode === 'user' ? 'bg-white dark:bg-slate-800 shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <Users className="h-3 w-3" /> By User
      </button>
      <button
        onClick={() => onSwitch('page')}
        className={cn(
          'flex items-center gap-1 text-[10px] font-medium px-3 py-1.5 rounded-md transition-all',
          viewMode === 'page' ? 'bg-white dark:bg-slate-800 shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <LayoutDashboard className="h-3 w-3" /> By Page
      </button>
    </div>
  );
}

// ── By-User body extracted to avoid re-renders on mode switch ─────────────────
function ByUserBody({
  loading, savingKey, effectivePage, togglePage,
  expandedGroups, setExpandedGroups, expandedPages, setExpandedPages,
  groupedPages, effectiveExpanded,
  colRegBySlug, userColMap, roleColMap, permOverrides,
  upsertColumnVisibility, removeColumnVisibility,
  onTabChange, userRole, userId, onSwitchToByPage,
}: {
  loading: boolean;
  savingKey: string | null;
  effectivePage: (slug: string) => import('./types').AccessEffect;
  togglePage: (slug: string) => void;
  expandedGroups: Set<string>;
  setExpandedGroups: (fn: (prev: Set<string>) => Set<string>) => void;
  expandedPages: Set<string>;
  setExpandedPages: (fn: (prev: Set<string>) => Set<string>) => void;
  groupedPages: { group: string; pages: typeof PAGE_DEFS }[];
  effectiveExpanded: Set<string>;
  colRegBySlug: Record<string, typeof COLUMN_REGISTRY[0]>;
  userColMap: Record<string, any>;
  roleColMap: Record<string, any>;
  permOverrides: any[];
  upsertColumnVisibility: (pageSlug: string, colKey: string, hidden: boolean, target: 'user' | 'role') => void;
  removeColumnVisibility: (id: string) => void;
  onTabChange: (tab: string) => void;
  userRole: string;
  userId: string;
  onSwitchToByPage: (slug: string) => void;
}) {
  if (loading) {
    return <div className="p-5 space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 rounded-lg" />)}</div>;
  }

  function toggleGroup(g: string) {
    setExpandedGroups(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });
  }
  function togglePageExpand(slug: string) {
    setExpandedPages(prev => { const n = new Set(prev); n.has(slug) ? n.delete(slug) : n.add(slug); return n; });
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-1">
      {groupedPages.length === 0 && (
        <p className="text-center text-xs text-muted-foreground py-10">No pages match your filter</p>
      )}
      {groupedPages.map(({ group, pages }) => {
        const isOpen = effectiveExpanded.has(group);
        const groupAccessible = pages.filter(p => { const e = effectivePage(p.slug); return e === 'role-yes' || e === 'granted'; }).length;
        return (
          <div key={group}>
            <button onClick={() => toggleGroup(group)}
              className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-muted/50 rounded-lg transition-colors">
              {isOpen ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground flex-1 text-left">{group}</span>
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', GROUP_COLORS[group] ?? 'bg-slate-100 text-slate-600')}>
                {groupAccessible}/{pages.length}
              </span>
            </button>

            {isOpen && (
              <div className="ml-2 space-y-0.5 mb-1">
                {pages.map(page => {
                  const eff = effectivePage(page.slug);
                  const cfg = EFF_CONFIG[eff];
                  const saving = savingKey === `page:${page.slug}`;
                  const isExpanded = expandedPages.has(page.slug);

                  const colDef = colRegBySlug[page.slug];
                  const pageResources = PAGE_SLUG_TO_RESOURCES[page.slug] ?? [];
                  const pagePermOverrides = permOverrides.filter(o => pageResources.includes(o.resource));
                  const hasExpandContent = !!colDef || pagePermOverrides.length > 0;

                  const colRuleCount = (colDef?.columns ?? []).filter(c => {
                    const k = `${page.slug}:${c.key}`;
                    return userColMap[k] || roleColMap[k];
                  }).length;
                  const actionOverrideCount = pagePermOverrides.length;

                  return (
                    <div key={page.slug} className="rounded-lg overflow-hidden">
                      <div className={cn('flex items-center gap-2 px-3 py-2 border border-transparent', cfg.rowCls,
                        hasExpandContent && 'cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors'
                      )}
                        onClick={hasExpandContent ? () => togglePageExpand(page.slug) : undefined}
                      >
                        <div className="shrink-0 w-3">
                          {hasExpandContent
                            ? (isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />)
                            : <div className="h-3 w-3" />
                          }
                        </div>
                        <div className={cn('h-2 w-2 rounded-full shrink-0', cfg.dot)} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className="text-xs font-medium truncate">{page.label}</p>
                            {colRuleCount > 0 && (
                              <Badge className="text-[9px] h-3.5 px-1 bg-blue-100 text-blue-700 border-0 shrink-0">
                                <Columns className="h-2 w-2 mr-0.5" />{colRuleCount}
                              </Badge>
                            )}
                            {actionOverrideCount > 0 && (
                              <Badge className="text-[9px] h-3.5 px-1 bg-amber-100 text-amber-700 border-0 shrink-0">
                                <Key className="h-2 w-2 mr-0.5" />{actionOverrideCount}
                              </Badge>
                            )}
                          </div>
                          {page.note && <p className="text-[10px] text-muted-foreground truncate mt-0.5">{page.note}</p>}
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0',
                              eff === 'granted'  ? 'bg-emerald-100 text-emerald-700' :
                              eff === 'blocked'  ? 'bg-red-100 text-red-700' :
                              eff === 'role-yes' ? 'bg-blue-100 text-blue-700' :
                              'bg-slate-100 text-slate-500'
                            )}>
                              {cfg.label}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs max-w-[200px]">
                            <p className="font-mono">{page.path}</p>
                            {page.note && <p className="opacity-70">{page.note}</p>}
                          </TooltipContent>
                        </Tooltip>
                        <button
                          disabled={saving || eff === 'superadmin'}
                          onClick={e => { e.stopPropagation(); togglePage(page.slug); }}
                          className={cn('text-[10px] border rounded px-2.5 py-1 shrink-0 font-medium transition-colors disabled:opacity-40 min-w-[90px] text-center', cfg.btnCls)}
                        >
                          {saving ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : cfg.btnLabel}
                        </button>
                      </div>

                      {/* Expanded: column visibility + action overrides */}
                      {isExpanded && hasExpandContent && (
                        <div className="ml-6 mb-1.5 border border-t-0 rounded-b-lg overflow-hidden bg-muted/10">
                          {colDef && (
                            <div>
                              <div className="flex items-center gap-1.5 px-3 py-2 bg-blue-50/60 dark:bg-blue-900/10 border-b">
                                <Columns className="h-3 w-3 text-blue-600" />
                                <p className="text-[10px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-400 flex-1">Column Visibility</p>
                                <p className="text-[9px] text-muted-foreground">Blue = role · Purple = this user</p>
                              </div>
                              <div className="px-3 py-1 grid grid-cols-[1fr_auto_auto] gap-2 text-[9px] font-semibold text-muted-foreground uppercase tracking-wide border-b bg-muted/20">
                                <span>Column</span>
                                <span className="w-24 text-center">For all {userRole}s</span>
                                <span className="w-24 text-center">This user only</span>
                              </div>
                              {colDef.columns.map(col => {
                                const k = `${page.slug}:${col.key}`;
                                const roleRow = roleColMap[k];
                                const userRow = userColMap[k];
                                const roleSaving = savingKey === `col:role:${page.slug}:${col.key}`;
                                const userSaving = savingKey === `col:user:${page.slug}:${col.key}`;
                                const roleRemSaving = roleRow ? savingKey === `col:remove:${roleRow.id}` : false;
                                const userRemSaving = userRow ? savingKey === `col:remove:${userRow.id}` : false;
                                return (
                                  <div key={col.key} className="px-3 py-1.5 border-b grid grid-cols-[1fr_auto_auto] gap-2 items-center hover:bg-muted/20 last:border-b-0">
                                    <div>
                                      <p className="text-[11px] font-medium">{col.label}</p>
                                      {col.sensitive && <Badge className="text-[8px] h-3 px-1 bg-orange-100 text-orange-700 border-0">sensitive</Badge>}
                                    </div>
                                    {/* Role toggle */}
                                    <div className="w-24 flex items-center justify-center gap-1">
                                      {roleRow ? (
                                        <>
                                          <span className={cn('text-[9px] flex items-center gap-0.5', roleRow.is_hidden ? 'text-red-600' : 'text-emerald-600')}>
                                            {roleRow.is_hidden ? <EyeOff className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
                                            {roleRow.is_hidden ? 'Hidden' : 'Visible'}
                                          </span>
                                          <button disabled={roleRemSaving} onClick={() => removeColumnVisibility(roleRow.id)} className="text-muted-foreground hover:text-destructive disabled:opacity-40">
                                            {roleRemSaving ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <X className="h-2.5 w-2.5" />}
                                          </button>
                                        </>
                                      ) : (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <button disabled={roleSaving} onClick={e => { e.stopPropagation(); upsertColumnVisibility(page.slug, col.key, true, 'role'); }}
                                              className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 border rounded text-red-600 border-red-200 hover:bg-red-50 disabled:opacity-40">
                                              {roleSaving ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <EyeOff className="h-2.5 w-2.5" />} Hide
                                            </button>
                                          </TooltipTrigger>
                                          <TooltipContent className="text-xs">Hide for all {userRole}s</TooltipContent>
                                        </Tooltip>
                                      )}
                                    </div>
                                    {/* User toggle */}
                                    <div className="w-24 flex items-center justify-center gap-1">
                                      {userRow ? (
                                        <>
                                          <span className={cn('text-[9px] flex items-center gap-0.5', userRow.is_hidden ? 'text-red-600' : 'text-emerald-600')}>
                                            {userRow.is_hidden ? <EyeOff className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
                                            {userRow.is_hidden ? 'Hidden' : 'Visible'}
                                          </span>
                                          <button disabled={userRemSaving} onClick={() => removeColumnVisibility(userRow.id)} className="text-muted-foreground hover:text-destructive disabled:opacity-40">
                                            {userRemSaving ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <X className="h-2.5 w-2.5" />}
                                          </button>
                                        </>
                                      ) : (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <button disabled={userSaving} onClick={e => { e.stopPropagation(); upsertColumnVisibility(page.slug, col.key, true, 'user'); }}
                                              className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 border rounded text-red-600 border-red-200 hover:bg-red-50 disabled:opacity-40">
                                              {userSaving ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <EyeOff className="h-2.5 w-2.5" />} Hide
                                            </button>
                                          </TooltipTrigger>
                                          <TooltipContent className="text-xs">Hide only for this user</TooltipContent>
                                        </Tooltip>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {pagePermOverrides.length > 0 && (
                            <div>
                              <div className="flex items-center gap-1.5 px-3 py-2 bg-amber-50/60 dark:bg-amber-900/10 border-b border-t">
                                <Key className="h-3 w-3 text-amber-600" />
                                <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400 flex-1">Active Action Overrides</p>
                                <button onClick={e => { e.stopPropagation(); onTabChange('permissions'); }}
                                  className="flex items-center gap-0.5 text-[9px] text-primary hover:underline">
                                  Manage all <ArrowRight className="h-2.5 w-2.5" />
                                </button>
                              </div>
                              <div className="px-3 py-2 flex flex-wrap gap-1.5">
                                {pagePermOverrides.map(o => (
                                  <span key={o.id} className={cn(
                                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border',
                                    o.is_granted ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-red-50 text-red-700 border-red-300'
                                  )}>
                                    {o.is_granted ? '✓' : '✗'} {CS_ACTION_LABELS[o.action] ?? o.action}
                                    <span className="opacity-60">({o.resource})</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {pagePermOverrides.length === 0 && pageResources.length > 0 && (
                            <div className="px-3 py-2 flex items-center gap-1.5 border-t">
                              <Key className="h-3 w-3 text-muted-foreground" />
                              <span className="text-[10px] text-muted-foreground">No action overrides for this page.</span>
                              <button onClick={e => { e.stopPropagation(); onTabChange('permissions'); }}
                                className="flex items-center gap-0.5 text-[9px] text-primary hover:underline ml-1">
                                Add in Permissions <ArrowRight className="h-2.5 w-2.5" />
                              </button>
                            </div>
                          )}

                          {/* Role-defaults footer — always visible when row is expanded */}
                          <div className="px-3 py-2 flex items-center gap-1.5 bg-slate-50/60 dark:bg-slate-900/20 border-t">
                            <Shield className="h-3 w-3 text-muted-foreground" />
                            <span className="text-[10px] text-muted-foreground flex-1">Want to change which roles can see this page by default?</span>
                            <button onClick={e => { e.stopPropagation(); onSwitchToByPage(page.slug); }}
                              className="flex items-center gap-0.5 text-[9px] text-primary hover:underline shrink-0">
                              Edit role defaults <ArrowRight className="h-2.5 w-2.5" />
                            </button>
                          </div>
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
  );
}
