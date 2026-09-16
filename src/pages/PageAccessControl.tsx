import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { normalizeRole } from '@/utils/roleMapping';
import {
  LayoutDashboard, CheckSquare, FolderOpen, FolderKanban, Compass,
  Users, Shield, Handshake, CalendarOff, Activity, Building2,
  BarChart3, MessageSquare, Calendar, Bell, Search, UserX, UserCheck,
  ChevronRight, Info, Lock, Unlock, Loader2, CreditCard, Banknote,
  FileText, Archive, Map, ClipboardList, Database, ClipboardCheck,
  TrendingUp, Receipt, DollarSign, Siren, AlertTriangle, Package,
  ScrollText, Award,
  Phone, Mail, Calculator, Landmark, Briefcase, GraduationCap,
  CalendarCheck, PieChart, LineChart, Target, Globe, RefreshCcw,
  Coins, ListChecks, Plug, History, HeartHandshake, Zap, Smartphone,
  BookOpen, Building, UserCog, Layers, GitBranch, BarChart2,
  ScanLine, Eye, Key, PlugZap, Megaphone, ClipboardEdit,
  Pencil, X, Check, Filter, LayoutList,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useRoleManagement } from '@/context/role-management/RoleManagementContext';

import { PageDef, PAGE_DEFS, PAGE_GROUPS, PAGE_NAVIGATION_GROUPS, getPageDefinition, getPageNavigationGroup, getPageRegistryIssues, PAGE_ROLE_ALL_OPTIONS } from '@/lib/access-registry';
export { PageDef, PAGE_DEFS, PAGE_GROUPS, PAGE_NAVIGATION_GROUPS, getPageDefinition, getPageNavigationGroup, PageRegistryIssue, getPageRegistryIssues, PAGE_ROLE_ALL_OPTIONS } from '@/lib/access-registry';

// ── Role display helpers ──────────────────────────────────────────────────────

export const ROLE_LABELS: Record<string, string> = {
  superAdmin: 'Super Admin', admin: 'Admin', ict: 'ICT', fom: 'FOM',
  financialAdmin: 'Financial Admin', auditor: 'Auditor', supervisor: 'Supervisor',
  coordinator: 'Coordinator', dataCollector: 'Data Collector', dataTeam: 'Data Team',
  reviewer: 'Reviewer', projectManager: 'Project Manager', countryDirector: 'Country Director',
  seniorOperationsLead: 'Senior Ops Lead',
  SMT: 'SMT',
  '!dataCollector': 'All except DC',
};

export const ROLE_COLORS: Record<string, string> = {
  superAdmin: 'bg-purple-100 text-purple-700',
  admin: 'bg-[#1D3461]/10 text-[#1D3461]',
  ict: 'bg-cyan-100 text-cyan-700',
  fom: 'bg-indigo-100 text-indigo-700',
  financialAdmin: 'bg-emerald-100 text-emerald-700',
  auditor: 'bg-orange-100 text-orange-700',
  supervisor: 'bg-blue-100 text-blue-700',
  coordinator: 'bg-teal-100 text-teal-700',
  dataCollector: 'bg-yellow-100 text-yellow-700',
  dataTeam: 'bg-lime-100 text-lime-700',
  reviewer: 'bg-rose-100 text-rose-700',
  projectManager: 'bg-violet-100 text-violet-700',
  countryDirector: 'bg-sky-100 text-sky-700',
  seniorOperationsLead: 'bg-amber-100 text-amber-700',
};

export function getRoleCode(rawRole: string | null): string | null {
  if (!rawRole) return null;
  const n = normalizeRole(rawRole);
  return n ?? rawRole.toLowerCase();
}

function roleCls(rawRole: string | null) {
  const code = getRoleCode(rawRole);
  return ROLE_COLORS[code ?? ''] ?? 'bg-slate-100 text-slate-500';
}

function roleLabel(rawRole: string | null) {
  const code = getRoleCode(rawRole);
  return ROLE_LABELS[code ?? ''] ?? (rawRole ?? 'Unknown');
}

/** effectiveRoles overrides page.roles when the super admin has customised defaults. */
export function hasDefaultAccess(page: PageDef, rawRole: string | null, effectiveRoles?: string[]): boolean {
  if (!rawRole) return false;
  const code = getRoleCode(rawRole);
  if (!code) return false;
  if (code === 'superAdmin') return true;
  const roles = effectiveRoles ?? page.roles;
  // Explicit listing always wins (case-insensitive) — needed for custom roles like SMT
  if (roles.some(r => !r.startsWith('!') && r.toLowerCase() === code.toLowerCase())) return true;
  // Built-in system roles inherit `all`; custom roles do not
  const systemCodes = new Set([
    'superAdmin', 'admin', 'ict', 'fom', 'financialAdmin', 'auditor',
    'supervisor', 'coordinator', 'dataCollector', 'dataTeam', 'reviewer',
    'projectManager', 'countryDirector', 'seniorOperationsLead', 'seniorManagement',
  ]);
  if (systemCodes.has(code) && roles.includes('all')) return true;
  if (roles.includes('!dataCollector')) return code !== 'dataCollector' && systemCodes.has(code);
  return false;
}

function initials(name: string | null) {
  return (name ?? '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

const STATUS_UI = {
  granted: { label: 'Explicitly Granted', cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-400', icon: UserCheck },
  blocked: { label: 'Explicitly Blocked', cls: 'bg-red-100 text-red-700',     dot: 'bg-red-400',     icon: Lock     },
  role:    { label: 'Role Access',         cls: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-400',    icon: Shield   },
  denied:  { label: 'No Access',           cls: 'bg-slate-100 text-slate-500',  dot: 'bg-slate-300',   icon: UserX    },
};

// ── Granular permissions (R/W/C/D) ────────────────────────────────────────────
// Stored as JSON in page_access_overrides.notes: {"r":true,"w":false,"c":false,"d":false}
export type Perms = { r: boolean; w: boolean; c: boolean; d: boolean };
export const DEFAULT_PERMS: Perms = { r: true, w: false, c: false, d: false };

export function parsePermissions(notes: string | null): Perms {
  if (!notes) return { ...DEFAULT_PERMS };
  try {
    const p = JSON.parse(notes);
    if (p && typeof p === 'object' && 'r' in p)
      return { r: !!p.r, w: !!p.w, c: !!p.c, d: !!p.d };
  } catch { /* ignore */ }
  return { ...DEFAULT_PERMS };
}

function packPermissions(perms: Perms): string { return JSON.stringify(perms); }

export const PERM_DEFS: { key: keyof Perms; label: string; desc: string; activeClass: string }[] = [
  { key: 'r', label: 'Read',   desc: 'View and read data on this page',  activeClass: 'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-900/30 dark:text-sky-300' },
  { key: 'w', label: 'Write',  desc: 'Edit and update existing records', activeClass: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300' },
  { key: 'c', label: 'Create', desc: 'Create new records on this page',  activeClass: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300' },
  { key: 'd', label: 'Delete', desc: 'Delete records on this page',      activeClass: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300' },
];

export type AccessStatus = keyof typeof STATUS_UI;
const STATUS_ORDER: Record<AccessStatus, number> = { blocked: 0, granted: 1, role: 2, denied: 3 };

export function getAccessStatus(
  page: PageDef,
  profile: Profile,
  overrideMap: Record<string, PageOverride>,
  effectiveRoles?: string[],
): AccessStatus {
  const ov = overrideMap[profile.id];
  if (ov) return ov.is_blocked ? 'blocked' : 'granted';
  return hasDefaultAccess(page, profile.role, effectiveRoles) ? 'role' : 'denied';
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Profile {
  id: string;
  full_name: string | null;
  role: string | null;
}

export interface PageOverride {
  id: string;
  page_slug: string;
  user_id: string;
  is_blocked: boolean;
  level: 'view' | 'manage';
  notes?: string | null;
  granted_by?: string | null;
  reason?: string | null;
  expires_at?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
}

// ── UserAccessRow ─────────────────────────────────────────────────────────────
export function UserAccessRow({
  profile,
  status,
  override,
  isSaving,
  pageLabel,
  hasRoleAccess,
  onTogglePerm,
  onBlock,
  onReset,
}: {
  profile: Profile;
  status: AccessStatus;
  override?: PageOverride;
  isSaving: boolean;
  pageLabel: string;
  hasRoleAccess?: boolean;
  onTogglePerm: (perms: Perms) => void;
  onBlock: () => void;
  onReset: () => void;
}) {
  const ui = STATUS_UI[status];
  const Icon = ui.icon;
  const isGranted = status === 'granted';
  const isRole    = status === 'role';

  // For granted users: use their actual override perms.
  // For role users: default to full perms (since role grants access) so admin can restrict.
  const currentPerms: Perms = isGranted && override
    ? parsePermissions(override.notes)
    : isRole
      ? { r: true, w: true, c: true, d: true }
      : { ...DEFAULT_PERMS };

  // Detect partial restriction: granted user who also has role access but not all perms
  const isPartialRestriction = isGranted && hasRoleAccess && !(currentPerms.r && currentPerms.w && currentPerms.c && currentPerms.d);

  function togglePerm(key: keyof Perms) {
    const next = { ...currentPerms, [key]: !currentPerms[key] };
    // For granted users: keep at least Read
    if (isGranted && !next.r && !next.w && !next.c && !next.d) next.r = true;
    onTogglePerm(next);
  }

  function grantDefault() {
    onTogglePerm({ ...DEFAULT_PERMS });
  }

  const showToggles = isGranted || isRole;

  return (
    <div className={cn(
      'flex items-start gap-3 p-3 rounded-xl border transition-colors group',
      status === 'blocked'     ? 'bg-red-50/50 dark:bg-red-900/5 border-red-200/60' :
      isPartialRestriction     ? 'bg-amber-50/30 dark:bg-amber-900/5 border-amber-300/70' :
      status === 'granted'     ? 'bg-emerald-50/50 dark:bg-emerald-900/5 border-emerald-200/60' :
      status === 'role'        ? 'bg-blue-50/20 border-blue-100/40' :
      'bg-card border-transparent hover:border-border'
    )}>
      {/* Avatar */}
      <div className={cn(
        'w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5',
        status === 'denied' || status === 'blocked'
          ? 'bg-slate-200 dark:bg-slate-700 text-slate-500'
          : 'bg-[#0F2041]/10 text-[#0F2041]'
      )}>
        {initials(profile.full_name)}
      </div>

      {/* Right column: 2-line layout so name always has full width */}
      <div className="flex-1 min-w-0">
        {/* Line 1: Name (always fully visible) */}
        <p className="text-sm font-semibold leading-tight">{profile.full_name ?? 'Unknown'}</p>

        {/* Line 2: Role badge + status + controls */}
        <div className="flex items-center gap-1.5 flex-wrap mt-1">
          <span className={cn('text-[9px] font-medium px-1.5 py-0.5 rounded-full capitalize shrink-0', roleCls(profile.role))}>
            {roleLabel(profile.role)}
          </span>

          {/* Status badge */}
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={cn(
                'text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap shrink-0 cursor-help',
                isPartialRestriction ? 'bg-amber-100 text-amber-700' : ui.cls,
              )}>
                <Icon className="h-3 w-3" />
                {isPartialRestriction ? 'Partial Restriction' : ui.label}
              </span>
            </TooltipTrigger>
            {isPartialRestriction && (
              <TooltipContent className="text-xs max-w-[200px]">
                This user has role-based access but some permissions have been restricted via an override.
              </TooltipContent>
            )}
          </Tooltip>

          {/* ── Granular permission toggles ──────────────────────── */}
          <div className="flex items-center gap-1 ml-auto">
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : status === 'blocked' ? (
              /* Blocked — show "Unblock with Read" button */
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="ghost"
                    className="opacity-0 group-hover:opacity-100 h-6 px-2 text-xs text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-opacity"
                    onClick={grantDefault}>
                    <Unlock className="h-3 w-3 mr-1" />Unblock
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">Unblock and grant Read access to {pageLabel}</TooltipContent>
              </Tooltip>
            ) : (
              <>
                {/* R / W / C / D permission pills */}
                <div className={cn(
                  'flex items-center gap-0.5 transition-opacity',
                  !showToggles && 'opacity-0 group-hover:opacity-100',
                  (isRole && !isPartialRestriction) && 'opacity-0 group-hover:opacity-100',
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
                                const next: Perms = { ...currentPerms, [pd.key]: !currentPerms[pd.key] };
                                onTogglePerm(next);
                              } else {
                                togglePerm(pd.key);
                              }
                            }}
                            className={cn(
                              'text-[9px] font-bold px-1.5 py-1 rounded-md border transition-all',
                              active
                                ? pd.activeClass
                                : 'bg-slate-50 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                            )}
                          >
                            {pd.label[0]}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">
                          {isRole
                            ? (active
                              ? `Restrict: remove ${pd.label} permission from ${profile.full_name?.split(' ')[0]} (creates override)`
                              : `Restore ${pd.label} permission for ${profile.full_name?.split(' ')[0]}`)
                            : (active
                              ? `Remove ${pd.label} permission from ${profile.full_name?.split(' ')[0]}`
                              : `Grant ${pd.label} permission: ${pd.desc}`)}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>

                {/* Block */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="ghost"
                      className="opacity-0 group-hover:opacity-100 h-6 px-2 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-opacity"
                      onClick={onBlock}>
                      <Lock className="h-3 w-3 mr-1" />Block
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">Block {profile.full_name?.split(' ')[0]} from {pageLabel}</TooltipContent>
                </Tooltip>
              </>
            )}

            {/* Reset (always shown if override exists) */}
            {override && !isSaving && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="ghost"
                    className="opacity-0 group-hover:opacity-100 h-6 px-2 text-xs text-muted-foreground hover:bg-muted transition-opacity"
                    onClick={onReset}>
                    Reset
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">Remove override — revert to role-based access</TooltipContent>
              </Tooltip>
            )}
          </div>{/* end controls */}
        </div>{/* end line-2 flex-wrap */}
      </div>{/* end right column */}
    </div>
  );
}

// ── Main page component ───────────────────────────────────────────────────────
export default function PageAccessControl() {
  const { currentUser } = useAppContext();
  const { roles: managedRoles } = useRoleManagement();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isSuperAdmin = normalizeRole(currentUser?.role ?? '') === 'superAdmin';
  const pageRoleOptions = useMemo(() => Array.from(new Set([
    ...PAGE_ROLE_ALL_OPTIONS,
    ...managedRoles.filter(role => role.is_active).map(role => role.name),
  ])), [managedRoles]);

  // View mode
  const [viewMode, setViewMode] = useState<'page' | 'user'>('page');

  // By-Page state
  const [selectedPage, setSelectedPage] = useState<PageDef>(PAGE_DEFS[0]);
  const [pageSearch, setPageSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['My Workspace']));
  const [statusFilter, setStatusFilter] = useState<AccessStatus | 'all'>('all');
  const [rolePopoverOpen, setRolePopoverOpen] = useState(false);
  const [savingRoles, setSavingRoles] = useState(false);

  // By-User state
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [byUserSearch, setByUserSearch] = useState('');
  const [byUserPageSearch, setByUserPageSearch] = useState('');
  const [expandedByUserGroups, setExpandedByUserGroups] = useState<Set<string>>(new Set(PAGE_GROUPS.slice(0, 3)));

  // Shared state
  const [userSearch, setUserSearch] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const { data: profiles = [] } = useQuery<Profile[]>({
    queryKey: ['pac-profiles'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, role').order('full_name');
      return (data ?? []) as Profile[];
    },
    staleTime: 60_000,
    enabled: isSuperAdmin,
  });

  const { data: overrides = [], refetch } = useQuery<PageOverride[]>({
    queryKey: ['pac-overrides'],
    queryFn: async () => {
      const { data } = await supabase.from('page_access_overrides').select('*');
      return (data ?? []) as PageOverride[];
    },
    staleTime: 15_000,
    enabled: isSuperAdmin,
  });

  const overrideMap = useMemo(() => {
    const m: Record<string, Record<string, PageOverride>> = {};
    overrides.forEach(o => {
      if (!m[o.page_slug]) m[o.page_slug] = {};
      m[o.page_slug][o.user_id] = o;
    });
    return m;
  }, [overrides]);

  // Per-user override map: user_id → page_slug → override
  const userOverrideMap = useMemo(() => {
    const m: Record<string, Record<string, PageOverride>> = {};
    overrides.forEach(o => {
      if (!m[o.user_id]) m[o.user_id] = {};
      m[o.user_id][o.page_slug] = o;
    });
    return m;
  }, [overrides]);

  // Detect orphan overrides — saved rows whose page_slug no longer exists in PAGE_DEFS.
  const validSlugs = useMemo(() => new Set(PAGE_DEFS.map(p => p.slug)), []);
  const orphanOverrides = useMemo(
    () => overrides.filter(o => !validSlugs.has(o.page_slug)),
    [overrides, validSlugs],
  );
  const orphanSlugs = useMemo(
    () => [...new Set(orphanOverrides.map(o => o.page_slug))],
    [orphanOverrides],
  );

  const { data: roleConfigs = {}, refetch: refetchRoleConfigs } = useQuery<Record<string, string[]>>({
    queryKey: ['pac-role-configs'],
    queryFn: async () => {
      const { data } = await supabase.from('page_role_configs').select('page_slug, roles');
      const m: Record<string, string[]> = {};
      (data ?? []).forEach((r: any) => { m[r.page_slug] = r.roles; });
      return m;
    },
    staleTime: 30_000,
    enabled: isSuperAdmin,
  });

  // Guard — after all hooks
  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-3 text-center px-6">
        <div className="h-14 w-14 rounded-2xl bg-red-100 flex items-center justify-center">
          <Lock className="h-6 w-6 text-red-500" />
        </div>
        <h2 className="text-lg font-bold">Super Admin Only</h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          This page is restricted to Super Admins. You do not have permission to view or modify page access settings.
        </p>
      </div>
    );
  }

  async function applyOverride(userId: string, pageSlug: string, isBlocked: boolean, perms: Perms = DEFAULT_PERMS, existingId?: string) {
    setSavingId(`${userId}-${pageSlug}`);
    try {
      const level: 'view' | 'manage' = (perms.w || perms.c || perms.d) ? 'manage' : 'view';
      const notes = isBlocked ? null : packPermissions(perms);
      if (existingId) {
        await supabase.from('page_access_overrides')
          .update({ is_blocked: isBlocked, level, notes, granted_by: currentUser?.id, approved_by: currentUser?.id, approved_at: new Date().toISOString() })
          .eq('id', existingId);
      } else {
        await supabase.from('page_access_overrides')
          .insert({ page_slug: pageSlug, user_id: userId, is_blocked: isBlocked, level, notes, granted_by: currentUser?.id, approved_by: currentUser?.id, approved_at: new Date().toISOString() });
      }
      const pageDef = PAGE_DEFS.find(p => p.slug === pageSlug);
      const name = profiles.find(p => p.id === userId)?.full_name ?? 'User';
      const permStr = isBlocked ? 'Blocked' :
        [perms.r && 'Read', perms.w && 'Write', perms.c && 'Create', perms.d && 'Delete']
          .filter(Boolean).join(' + ');
      toast({ title: isBlocked ? 'Access blocked' : 'Access granted', description: `${name} → ${pageDef?.label ?? pageSlug} (${permStr})` });
      refetch();
      qc.invalidateQueries({ queryKey: ['pac-overrides'] });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setSavingId(null); }
  }

  async function removeOverride(id: string, userId: string) {
    setSavingId(userId);
    try {
      await supabase.from('page_access_overrides').delete().eq('id', id);
      toast({ title: 'Override removed', description: 'User reverts to role-based access.' });
      refetch();
      qc.invalidateQueries({ queryKey: ['pac-overrides'] });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setSavingId(null); }
  }

  async function saveRoleConfig(slug: string, roles: string[]) {
    setSavingRoles(true);
    try {
      await supabase.from('page_role_configs').upsert(
        { page_slug: slug, roles, updated_by: currentUser?.id, updated_at: new Date().toISOString() },
        { onConflict: 'page_slug' }
      );
      refetchRoleConfigs();
      qc.invalidateQueries({ queryKey: ['pac-role-configs'] });
      toast({ title: 'Default access updated', description: `Roles saved for ${PAGE_DEFS.find(p => p.slug === slug)?.label ?? slug}.` });
    } catch (e: any) {
      toast({ title: 'Error saving roles', description: e.message, variant: 'destructive' });
    } finally { setSavingRoles(false); }
  }

  const nonSuperProfiles = profiles.filter(p => getRoleCode(p.role) !== 'superAdmin');
  const pageOverrideMap = overrideMap[selectedPage.slug] ?? {};

  const effectiveRoles = roleConfigs[selectedPage.slug] ?? selectedPage.roles;

  const filteredUsers = nonSuperProfiles.filter(p =>
    (p.full_name ?? '').toLowerCase().includes(userSearch.toLowerCase()) ||
    roleLabel(p.role).toLowerCase().includes(userSearch.toLowerCase())
  );

  const sortedUsers = [...filteredUsers]
    .filter(p => statusFilter === 'all' || getAccessStatus(selectedPage, p, pageOverrideMap, effectiveRoles) === statusFilter)
    .sort((a, b) =>
      STATUS_ORDER[getAccessStatus(selectedPage, a, pageOverrideMap, effectiveRoles)] -
      STATUS_ORDER[getAccessStatus(selectedPage, b, pageOverrideMap, effectiveRoles)]
    );

  const counts = { blocked: 0, granted: 0, role: 0, denied: 0 };
  nonSuperProfiles.forEach(p => { counts[getAccessStatus(selectedPage, p, pageOverrideMap, effectiveRoles)]++; });

  const ovCountForPage = (slug: string) => Object.keys(overrideMap[slug] ?? {}).length;

  const filteredPages = PAGE_DEFS.filter(p =>
    p.label.toLowerCase().includes(pageSearch.toLowerCase()) ||
    p.group.toLowerCase().includes(pageSearch.toLowerCase())
  );
  const groupedPages = PAGE_GROUPS.map(g => ({ group: g, pages: filteredPages.filter(p => p.group === g) })).filter(g => g.pages.length);
  // When a search is active, auto-expand every group that has a match so results aren't hidden behind collapsed headers
  const effectiveExpandedGroups = pageSearch.trim()
    ? new Set(groupedPages.map(g => g.group))
    : expandedGroups;

  function toggleGroup(g: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });
  }

  // ── By User view helpers ────────────────────────────────────────────────────
  const selectedUserProfile = profiles.find(p => p.id === selectedUserId) ?? null;

  const filteredByUserProfiles = nonSuperProfiles.filter(p =>
    (p.full_name ?? '').toLowerCase().includes(byUserSearch.toLowerCase()) ||
    roleLabel(p.role).toLowerCase().includes(byUserSearch.toLowerCase())
  );

  const byUserPages = PAGE_DEFS.filter(p =>
    p.label.toLowerCase().includes(byUserPageSearch.toLowerCase()) ||
    p.group.toLowerCase().includes(byUserPageSearch.toLowerCase())
  );

  const byUserGroupedPages = PAGE_GROUPS
    .map(g => ({ group: g, pages: byUserPages.filter(p => p.group === g) }))
    .filter(g => g.pages.length);

  function toggleByUserGroup(g: string) {
    setExpandedByUserGroups(prev => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <TooltipProvider>
      <div className="flex flex-col h-screen bg-background overflow-hidden">

        {/* #79 — Orphan override warning banner */}
        {orphanSlugs.length > 0 && (
          <div
            className="flex items-start gap-3 px-4 py-2.5 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs"
            data-testid="banner-orphan-overrides"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
            <div className="flex-1 min-w-0">
              <span className="font-semibold">Stale permission overrides detected — </span>
              {orphanSlugs.length} page slug{orphanSlugs.length !== 1 ? 's' : ''} in{' '}
              <code className="bg-amber-100 px-1 rounded font-mono">page_access_overrides</code>{' '}
              no longer exist in PAGE_DEFS:{' '}
              <span className="font-mono font-medium">{orphanSlugs.join(', ')}</span>.{' '}
              Run <code className="bg-amber-100 px-1 rounded font-mono">cleanup_orphan_page_permissions.sql</code>{' '}
              to remove them.
            </div>
          </div>
        )}

      <div className="flex flex-1 bg-background overflow-hidden">

        {/* Left panel */}
        <div className="w-64 flex-shrink-0 border-r flex flex-col bg-card">
          <div className="p-4 border-b">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-[#0F2041] to-[#1D3461] flex items-center justify-center shrink-0">
                <Shield className="h-4 w-4 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-[#0F2041]">Page Access Control</h2>
                <p className="text-[10px] text-muted-foreground">{PAGE_DEFS.length} pages · Super Admin only</p>
              </div>
            </div>

            {/* View mode toggle */}
            <div className="flex rounded-lg border p-0.5 bg-muted/40 mb-3">
              <button
                onClick={() => setViewMode('page')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1 text-[10px] font-medium py-1.5 rounded-md transition-all',
                  viewMode === 'page' ? 'bg-white dark:bg-slate-800 shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
                data-testid="button-view-by-page"
              >
                <LayoutDashboard className="h-3 w-3" /> By Page
              </button>
              <button
                onClick={() => setViewMode('user')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1 text-[10px] font-medium py-1.5 rounded-md transition-all',
                  viewMode === 'user' ? 'bg-white dark:bg-slate-800 shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
                data-testid="button-view-by-user"
              >
                <Users className="h-3 w-3" /> By User
              </button>
            </div>

            {viewMode === 'page' ? (
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={pageSearch} onChange={e => setPageSearch(e.target.value)}
                  placeholder="Search pages…" className="pl-8 h-8 text-xs" />
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={byUserSearch} onChange={e => setByUserSearch(e.target.value)}
                  placeholder="Search users…" className="pl-8 h-8 text-xs" />
              </div>
            )}
          </div>

          {/* Left panel content */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {viewMode === 'page' ? (
              // Page tree
              groupedPages.map(({ group, pages }) => (
                <div key={group}>
                  <button onClick={() => toggleGroup(group)}
                    className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors">
                    <ChevronRight className={cn('h-3 w-3 transition-transform', effectiveExpandedGroups.has(group) && 'rotate-90')} />
                    {group}
                  </button>
                  {effectiveExpandedGroups.has(group) && pages.map(page => {
                    const Icon = page.icon;
                    const isSelected = page.slug === selectedPage.slug;
                    const ovCount = ovCountForPage(page.slug);
                    return (
                      <button key={page.slug} onClick={() => { setSelectedPage(page); setUserSearch(''); setStatusFilter('all'); }}
                        className={cn('w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left transition-all ml-2',
                          isSelected ? 'bg-[#1D3461] text-white' : 'hover:bg-muted/50 text-foreground')}>
                        <Icon className={cn('h-3.5 w-3.5 shrink-0', isSelected ? 'text-white/80' : 'text-muted-foreground')} />
                        <span className="flex-1 text-xs font-medium truncate">{page.label}</span>
                        {ovCount > 0 && (
                          <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0',
                            isSelected ? 'bg-white/20 text-white' : 'bg-[#1D3461]/10 text-[#1D3461]')}>{ovCount}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            ) : (
              // User list
              <>
                {filteredByUserProfiles.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">No users found</p>
                ) : (
                  filteredByUserProfiles.map(p => {
                    const isSelected = p.id === selectedUserId;
                    const ovCount = Object.keys(userOverrideMap[p.id] ?? {}).length;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setSelectedUserId(p.id)}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left transition-all',
                          isSelected ? 'bg-[#1D3461] text-white' : 'hover:bg-muted/50 text-foreground'
                        )}
                        data-testid={`button-select-user-${p.id}`}
                      >
                        <div className={cn(
                          'w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0',
                          isSelected ? 'bg-white/20 text-white' : 'bg-[#0F2041]/10 text-[#0F2041]'
                        )}>
                          {initials(p.full_name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{p.full_name ?? 'Unknown'}</p>
                          <p className={cn('text-[9px] truncate', isSelected ? 'text-white/70' : 'text-muted-foreground')}>
                            {roleLabel(p.role)}
                          </p>
                        </div>
                        {ovCount > 0 && (
                          <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0',
                            isSelected ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700')}>{ovCount}</span>
                        )}
                      </button>
                    );
                  })
                )}
              </>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {viewMode === 'page' ? (
            // ── By Page view ─────────────────────────────────────────────────
            <>
              <div className="px-6 py-4 border-b bg-card flex-shrink-0">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold">{selectedPage.label}</h3>
                      {selectedPage.note && (
                        <Tooltip>
                          <TooltipTrigger><Info className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
                          <TooltipContent className="text-xs max-w-[220px]">{selectedPage.note}</TooltipContent>
                        </Tooltip>
                      )}
                      {roleConfigs[selectedPage.slug] && (
                        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">custom</span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground font-mono">{selectedPage.path}</p>

                    <div className="flex items-center gap-1 flex-wrap mt-2">
                      <span className="text-[10px] text-muted-foreground shrink-0">Default access:</span>
                      {effectiveRoles.map(r => (
                        <button
                          key={r}
                          onClick={() => saveRoleConfig(selectedPage.slug, effectiveRoles.filter(x => x !== r))}
                          disabled={savingRoles}
                          title={`Remove ${r === 'all' ? 'Everyone' : ROLE_LABELS[r] ?? r} from default access`}
                          className={cn('group flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded-full transition-opacity',
                            r === 'all' ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' :
                            r === '!dataCollector' ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' :
                            cn(ROLE_COLORS[r] ?? 'bg-slate-100 text-slate-500', 'hover:opacity-80')
                          )}>
                          {r === 'all' ? 'Everyone' : r === '!dataCollector' ? 'All except DC' : ROLE_LABELS[r] ?? r}
                          <X className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity -mr-0.5" />
                        </button>
                      ))}

                      <Popover open={rolePopoverOpen} onOpenChange={setRolePopoverOpen}>
                        <PopoverTrigger asChild>
                          <button className="flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-muted hover:bg-muted/80 text-muted-foreground border border-dashed transition-colors">
                            <Pencil className="h-2.5 w-2.5" /> Edit
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-72 p-3">
                          <div className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                            <Shield className="h-3.5 w-3.5 text-[#1D3461]" />
                            Edit default access roles
                          </div>
                          <p className="text-[10px] text-muted-foreground mb-3">
                            Toggle which roles have default access to <span className="font-medium">{selectedPage.label}</span>. Changes are saved immediately to the database.
                          </p>
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {pageRoleOptions.map(r => {
                              const active = effectiveRoles.includes(r);
                              return (
                                <button
                                  key={r}
                                  disabled={savingRoles}
                                  onClick={() => {
                                    const next = active ? effectiveRoles.filter(x => x !== r) : [...effectiveRoles, r];
                                    saveRoleConfig(selectedPage.slug, next);
                                  }}
                                  className={cn(
                                    'flex items-center gap-1 text-[9px] font-medium px-2 py-1 rounded-full border transition-all',
                                    active
                                      ? cn('border-transparent', r === 'all' ? 'bg-blue-100 text-blue-700' : ROLE_COLORS[r] ?? 'bg-slate-100 text-slate-500')
                                      : 'bg-background border-dashed text-muted-foreground hover:bg-muted'
                                  )}>
                                  {active && <Check className="h-2.5 w-2.5" />}
                                  {r === 'all' ? 'Everyone' : ROLE_LABELS[r] ?? r}
                                </button>
                              );
                            })}
                          </div>
                          {roleConfigs[selectedPage.slug] && (
                            <button
                              disabled={savingRoles}
                              onClick={() => {
                                supabase.from('page_role_configs').delete().eq('page_slug', selectedPage.slug).then(() => {
                                  refetchRoleConfigs();
                                  qc.invalidateQueries({ queryKey: ['pac-role-configs'] });
                                  toast({ title: 'Reset to defaults', description: `${selectedPage.label} reverted to built-in roles.` });
                                });
                              }}
                              className="w-full text-[9px] text-muted-foreground hover:text-destructive text-center py-1 transition-colors">
                              Reset to built-in defaults
                            </button>
                          )}
                          {savingRoles && <p className="text-[9px] text-center text-muted-foreground mt-1 animate-pulse">Saving…</p>}
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                </div>

                {/* Status filter chips */}
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <button
                    onClick={() => setStatusFilter('all')}
                    className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border transition-all',
                      statusFilter === 'all'
                        ? 'bg-[#1D3461] text-white border-[#1D3461]'
                        : 'bg-background border-muted-foreground/30 text-muted-foreground hover:border-[#1D3461] hover:text-[#1D3461]')}>
                    <Filter className="h-2.5 w-2.5" />
                    All <span className="font-bold">{nonSuperProfiles.length}</span>
                  </button>
                  {(Object.entries(STATUS_UI) as [AccessStatus, typeof STATUS_UI[AccessStatus]][]).map(([key, ui]) => (
                    <button
                      key={key}
                      onClick={() => setStatusFilter(prev => prev === key ? 'all' : key)}
                      className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border transition-all',
                        statusFilter === key
                          ? 'bg-[#1D3461] text-white border-[#1D3461]'
                          : 'bg-background border-muted-foreground/30 text-muted-foreground hover:border-[#1D3461] hover:text-[#1D3461]')}>
                      <span className={cn('w-1.5 h-1.5 rounded-full inline-block', ui.dot)} />
                      {ui.label} <span className="font-bold">{counts[key]}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="px-6 py-3 border-b flex-shrink-0 bg-muted/20">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="relative flex-1 min-w-[180px] max-w-sm">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input value={userSearch} onChange={e => setUserSearch(e.target.value)}
                      placeholder="Search users by name or role…" className="pl-8 h-8 text-xs" />
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground shrink-0">
                    <span className="font-medium">Permissions:</span>
                    {PERM_DEFS.map(pd => (
                      <Tooltip key={pd.key}>
                        <TooltipTrigger asChild>
                          <span className={cn('px-1.5 py-0.5 rounded-md border text-[9px] font-bold cursor-help', pd.activeClass)}>
                            {pd.label[0]}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">
                          <span className="font-bold">{pd.label}:</span> {pd.desc}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                    <span className="text-muted-foreground/60 ml-1">← click to toggle per user</span>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-3">
                <div className="space-y-1 max-w-3xl">
                  {sortedUsers.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <Filter className="h-8 w-8 text-muted-foreground/30 mb-2" />
                      <p className="text-sm text-muted-foreground">No users match this filter.</p>
                      <button onClick={() => setStatusFilter('all')} className="text-xs text-[#1D3461] hover:underline mt-1">Clear filter</button>
                    </div>
                  )}
                  {sortedUsers.map(profile => {
                    const status = getAccessStatus(selectedPage, profile, pageOverrideMap, effectiveRoles);
                    const ov = pageOverrideMap[profile.id];
                    const roleAccess = hasDefaultAccess(selectedPage, profile.role, effectiveRoles);
                    return (
                      <UserAccessRow
                        key={profile.id}
                        profile={profile}
                        status={status}
                        override={ov}
                        isSaving={savingId === `${profile.id}-${selectedPage.slug}`}
                        pageLabel={selectedPage.label}
                        hasRoleAccess={roleAccess}
                        onTogglePerm={(perms) => applyOverride(profile.id, selectedPage.slug, false, perms, ov?.id)}
                        onBlock={() => applyOverride(profile.id, selectedPage.slug, true, DEFAULT_PERMS, ov?.id)}
                        onReset={() => removeOverride(ov!.id, profile.id)}
                      />
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            // ── By User view ─────────────────────────────────────────────────
            <>
              {!selectedUserId ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
                  <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center">
                    <Users className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <h3 className="text-base font-semibold">Select a User</h3>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    Choose a user from the left panel to see all pages they can access, grouped by category.
                  </p>
                </div>
              ) : selectedUserProfile ? (
                <>
                  {/* By-User header */}
                  <div className="px-6 py-4 border-b bg-card flex-shrink-0">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#0F2041]/10 text-[#0F2041] flex items-center justify-center text-sm font-bold shrink-0">
                        {initials(selectedUserProfile.full_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-bold truncate">{selectedUserProfile.full_name ?? 'Unknown'}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', roleCls(selectedUserProfile.role))}>
                            {roleLabel(selectedUserProfile.role)}
                          </span>
                          {Object.keys(userOverrideMap[selectedUserId] ?? {}).length > 0 && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                              {Object.keys(userOverrideMap[selectedUserId]).length} override{Object.keys(userOverrideMap[selectedUserId]).length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-2">
                      Showing all {PAGE_DEFS.length} pages. Hover a row to adjust permissions.
                    </p>
                  </div>

                  {/* By-User page search */}
                  <div className="px-6 py-3 border-b flex-shrink-0 bg-muted/20">
                    <div className="flex items-center gap-3">
                      <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input value={byUserPageSearch} onChange={e => setByUserPageSearch(e.target.value)}
                          placeholder="Search pages…" className="pl-8 h-8 text-xs" />
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground shrink-0">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> Role Access</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> Granted</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> Blocked</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-300 inline-block" /> No Access</span>
                      </div>
                    </div>
                  </div>

                  {/* By-User page list */}
                  <div className="flex-1 overflow-y-auto px-6 py-3">
                    <div className="space-y-4 max-w-3xl">
                      {byUserGroupedPages.map(({ group, pages }) => (
                        <div key={group}>
                          <button
                            onClick={() => toggleByUserGroup(group)}
                            className="w-full flex items-center gap-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors mb-1"
                          >
                            <ChevronRight className={cn('h-3 w-3 transition-transform', expandedByUserGroups.has(group) && 'rotate-90')} />
                            {group}
                            <span className="text-[10px] font-normal normal-case">({pages.length})</span>
                          </button>
                          {expandedByUserGroups.has(group) && (
                            <div className="space-y-1 pl-4">
                              {pages.map(page => {
                                const effectivePageRoles = roleConfigs[page.slug] ?? page.roles;
                                const pageOvMap = overrideMap[page.slug] ?? {};
                                const status = getAccessStatus(page, selectedUserProfile, pageOvMap, effectivePageRoles);
                                const ov = pageOvMap[selectedUserId];
                                const roleAccess = hasDefaultAccess(page, selectedUserProfile.role, effectivePageRoles);
                                const Icon = page.icon;
                                const key = `${selectedUserId}-${page.slug}`;

                                return (
                                  <div
                                    key={page.slug}
                                    className={cn(
                                      'flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors group',
                                      status === 'blocked'  ? 'bg-red-50/50 dark:bg-red-900/5 border-red-200/60' :
                                      status === 'granted'  ? (roleAccess ? 'bg-amber-50/30 border-amber-200/60' : 'bg-emerald-50/50 border-emerald-200/60 dark:bg-emerald-900/5') :
                                      status === 'role'     ? 'bg-blue-50/20 border-blue-100/40' :
                                      'bg-card border-transparent hover:border-border'
                                    )}
                                  >
                                    <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-semibold truncate">{page.label}</p>
                                      <p className="text-[10px] text-muted-foreground font-mono truncate">{page.path}</p>
                                    </div>

                                    {/* Status chip */}
                                    <span className={cn(
                                      'text-[9px] font-medium px-1.5 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap shrink-0',
                                      status === 'granted' && roleAccess ? 'bg-amber-100 text-amber-700' : STATUS_UI[status].cls,
                                    )}>
                                      {status === 'granted' && roleAccess ? 'Partial Override' : STATUS_UI[status].label}
                                    </span>

                                    {/* R/W/C/D toggles on hover */}
                                    <div className={cn('flex items-center gap-0.5 transition-opacity', status === 'blocked' ? 'opacity-0 group-hover:opacity-100' : 'opacity-0 group-hover:opacity-100')}>
                                      {savingId === key ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                      ) : status === 'blocked' ? (
                                        <button
                                          onClick={() => applyOverride(selectedUserId, page.slug, false, DEFAULT_PERMS, ov?.id)}
                                          className="text-[9px] font-medium px-1.5 py-1 rounded-md border bg-sky-50 text-sky-700 border-sky-300 hover:bg-sky-100 transition-colors flex items-center gap-1"
                                        >
                                          <Unlock className="h-2.5 w-2.5" /> Unblock
                                        </button>
                                      ) : (
                                        <>
                                          {PERM_DEFS.map(pd => {
                                            const currentPerms: Perms = (status === 'granted' && ov)
                                              ? parsePermissions(ov.notes)
                                              : status === 'role'
                                                ? { r: true, w: true, c: true, d: true }
                                                : { ...DEFAULT_PERMS };
                                            const active = (status === 'granted' || status === 'role') && currentPerms[pd.key];
                                            return (
                                              <Tooltip key={pd.key}>
                                                <TooltipTrigger asChild>
                                                  <button
                                                    onClick={() => {
                                                      if (status === 'denied') {
                                                        applyOverride(selectedUserId, page.slug, false, { r: true, w: pd.key === 'w', c: pd.key === 'c', d: pd.key === 'd' }, ov?.id);
                                                      } else {
                                                        const next: Perms = { ...currentPerms, [pd.key]: !currentPerms[pd.key] };
                                                        applyOverride(selectedUserId, page.slug, false, next, ov?.id);
                                                      }
                                                    }}
                                                    className={cn(
                                                      'text-[9px] font-bold px-1.5 py-1 rounded-md border transition-all',
                                                      active ? pd.activeClass : 'bg-slate-50 dark:bg-slate-800 text-slate-400 border-slate-200 hover:border-slate-400'
                                                    )}
                                                  >
                                                    {pd.label[0]}
                                                  </button>
                                                </TooltipTrigger>
                                                <TooltipContent className="text-xs">
                                                  {active ? `Remove ${pd.label}` : `Grant ${pd.label}`} for {page.label}
                                                </TooltipContent>
                                              </Tooltip>
                                            );
                                          })}
                                          <button
                                            onClick={() => applyOverride(selectedUserId, page.slug, true, DEFAULT_PERMS, ov?.id)}
                                            className="text-[9px] font-medium px-1.5 py-1 rounded-md border bg-red-50 text-red-600 border-red-200 hover:bg-red-100 transition-colors ml-0.5 flex items-center gap-0.5"
                                          >
                                            <Lock className="h-2.5 w-2.5" />
                                          </button>
                                          {ov && (
                                            <button
                                              onClick={() => removeOverride(ov.id, selectedUserId)}
                                              className="text-[9px] font-medium px-1.5 py-1 rounded-md border border-muted-foreground/20 text-muted-foreground hover:bg-muted transition-colors"
                                            >
                                              Reset
                                            </button>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
      </div>
    </TooltipProvider>
  );
}
