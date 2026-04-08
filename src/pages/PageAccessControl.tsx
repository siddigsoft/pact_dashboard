import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, CheckSquare, FolderOpen, FolderKanban, Compass,
  Users, Shield, Handshake, CalendarOff, Activity, Building2,
  BarChart3, MessageSquare, Calendar, Bell, Search, UserX, UserCheck,
  ChevronRight, Info, Lock, Unlock, Loader2,
} from 'lucide-react';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';

// ── Page registry ──────────────────────────────────────────────────────────────

const PAGES = [
  { slug: 'dashboard',              label: 'Dashboard',              path: '/dashboard',              icon: LayoutDashboard, defaultRoles: ['super_admin','admin','ict','field_operations_manager','data_analyst'] },
  { slug: 'my-tasks',               label: 'My Tasks',               path: '/my-tasks',               icon: CheckSquare,     defaultRoles: ['all'] },
  { slug: 'workspace',              label: 'Workspace Hub',          path: '/workspace',              icon: FolderOpen,      defaultRoles: ['super_admin','grant_required'] },
  { slug: 'projects',               label: 'Projects',               path: '/projects',               icon: FolderKanban,    defaultRoles: ['super_admin','admin','ict','field_operations_manager'] },
  { slug: 'portfolio',              label: 'Portfolio Dashboard',    path: '/portfolio',              icon: BarChart3,       defaultRoles: ['super_admin','admin','field_operations_manager'] },
  { slug: 'field-operation-manager',label: 'Field Operation Manager',path: '/field-operation-manager',icon: Compass,         defaultRoles: ['super_admin','admin','field_operations_manager'] },
  { slug: 'mmp',                    label: 'MMP Management',         path: '/mmp',                    icon: Activity,        defaultRoles: ['super_admin','admin','field_operations_manager','coordinator'] },
  { slug: 'site-visits',            label: 'Site Visits',            path: '/site-visits',            icon: Compass,         defaultRoles: ['super_admin','admin','field_operations_manager','coordinator','data_collector'] },
  { slug: 'hr',                     label: 'HR Hub',                 path: '/hr',                     icon: Users,           defaultRoles: ['super_admin','admin','financial_admin'] },
  { slug: 'leave',                  label: 'Leave Requests',         path: '/leave',                  icon: CalendarOff,     defaultRoles: ['all'] },
  { slug: 'crm',                    label: 'CRM Hub',                path: '/crm',                    icon: Handshake,       defaultRoles: ['super_admin','admin','field_operations_manager'] },
  { slug: 'departments',            label: 'Departments',            path: '/departments',            icon: Building2,       defaultRoles: ['super_admin','admin'] },
  { slug: 'chat',                   label: 'Chat',                   path: '/chat',                   icon: MessageSquare,   defaultRoles: ['all'] },
  { slug: 'calendar',               label: 'Calendar',               path: '/calendar',               icon: Calendar,        defaultRoles: ['all'] },
  { slug: 'notifications',          label: 'Notifications',          path: '/notifications',          icon: Bell,            defaultRoles: ['all'] },
  { slug: 'users',                  label: 'User Management',        path: '/users',                  icon: Users,           defaultRoles: ['super_admin','admin','ict'] },
  { slug: 'role-management',        label: 'Role Management',        path: '/role-management',        icon: Shield,          defaultRoles: ['super_admin','admin'] },
  { slug: 'pdm',                    label: 'PDM Analytics',          path: '/pdm',                    icon: BarChart3,       defaultRoles: ['super_admin','admin','field_operations_manager','data_analyst'] },
];

// ── Types ──────────────────────────────────────────────────────────────────────

interface Profile {
  id: string;
  full_name: string | null;
  role: string | null;
}

interface Override {
  id: string;
  page_slug: string;
  user_id: string;
  is_blocked: boolean;
  notes: string | null;
  created_at: string;
}

// ── Role label helper ──────────────────────────────────────────────────────────

function roleBadgeCls(role: string) {
  if (role === 'super_admin') return 'bg-violet-100 text-violet-700';
  if (role === 'admin') return 'bg-[#1D3461]/10 text-[#1D3461]';
  if (role === 'financial_admin') return 'bg-emerald-100 text-emerald-700';
  if (role === 'field_operations_manager') return 'bg-orange-100 text-orange-700';
  if (role === 'data_analyst') return 'bg-cyan-100 text-cyan-700';
  if (role === 'coordinator') return 'bg-blue-100 text-blue-700';
  if (role === 'data_collector') return 'bg-slate-100 text-slate-600';
  return 'bg-slate-100 text-slate-600';
}

function hasDefaultAccess(page: typeof PAGES[0], role: string | null) {
  if (!role) return false;
  if (role === 'super_admin') return true;
  if (page.defaultRoles.includes('all')) return true;
  return page.defaultRoles.includes(role);
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function PageAccessControl() {
  const { currentUser } = useAppContext();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedPage, setSelectedPage] = useState(PAGES[0]);
  const [userSearch, setUserSearch] = useState('');
  const [pageSearch, setPageSearch] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState('');

  // Load all profiles
  const { data: profiles = [] } = useQuery<Profile[]>({
    queryKey: ['page-access-profiles'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, role').order('full_name');
      return (data ?? []) as Profile[];
    },
    staleTime: 60_000,
  });

  // Load all overrides
  const { data: overrides = [], refetch } = useQuery<Override[]>({
    queryKey: ['page-access-overrides'],
    queryFn: async () => {
      const { data } = await supabase.from('page_access_overrides').select('*');
      return (data ?? []) as Override[];
    },
    staleTime: 30_000,
  });

  // Map: pageSlug → userId → Override
  const overrideMap = useMemo(() => {
    const m: Record<string, Record<string, Override>> = {};
    overrides.forEach(o => {
      if (!m[o.page_slug]) m[o.page_slug] = {};
      m[o.page_slug][o.user_id] = o;
    });
    return m;
  }, [overrides]);

  async function setOverride(userId: string, isBlocked: boolean, existingId?: string) {
    setSavingId(userId);
    try {
      if (existingId) {
        await supabase.from('page_access_overrides').update({
          is_blocked: isBlocked,
          notes: notesDraft.trim() || null,
          granted_by: currentUser?.id,
        }).eq('id', existingId);
      } else {
        await supabase.from('page_access_overrides').insert({
          page_slug: selectedPage.slug,
          user_id: userId,
          is_blocked: isBlocked,
          notes: notesDraft.trim() || null,
          granted_by: currentUser?.id,
        });
      }
      const name = profiles.find(p => p.id === userId)?.full_name ?? 'User';
      toast({
        title: isBlocked ? 'Access blocked' : 'Access granted',
        description: `${name} → ${selectedPage.label}`,
      });
      refetch();
      qc.invalidateQueries({ queryKey: ['page-access-overrides'] });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSavingId(null);
    }
  }

  async function removeOverride(id: string, userId: string) {
    setSavingId(userId);
    try {
      await supabase.from('page_access_overrides').delete().eq('id', id);
      toast({ title: 'Override removed', description: 'User will use their default role access.' });
      refetch();
      qc.invalidateQueries({ queryKey: ['page-access-overrides'] });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSavingId(null);
    }
  }

  const filteredPages = PAGES.filter(p =>
    p.label.toLowerCase().includes(pageSearch.toLowerCase())
  );

  const nonSuperProfiles = profiles.filter(p => p.role !== 'super_admin');
  const filteredUsers = nonSuperProfiles.filter(p =>
    (p.full_name ?? '').toLowerCase().includes(userSearch.toLowerCase()) ||
    (p.role ?? '').replace(/_/g, ' ').toLowerCase().includes(userSearch.toLowerCase())
  );

  const pageOverrides = overrideMap[selectedPage.slug] ?? {};

  // Count overrides per page for the left panel badges
  const pageOverrideCount = (slug: string) => Object.keys(overrideMap[slug] ?? {}).length;

  // Status for a user on the selected page
  function getUserStatus(profile: Profile) {
    const ov = pageOverrides[profile.id];
    const roleAccess = hasDefaultAccess(selectedPage, profile.role);
    if (ov) {
      return ov.is_blocked ? 'blocked' : 'granted';
    }
    return roleAccess ? 'role' : 'denied';
  }

  const statusLabel: Record<string, { label: string; cls: string; icon: typeof Lock }> = {
    granted: { label: 'Explicitly Granted', cls: 'bg-emerald-100 text-emerald-700', icon: UserCheck },
    blocked: { label: 'Explicitly Blocked', cls: 'bg-red-100 text-red-700', icon: Lock },
    role:    { label: 'Role Access',         cls: 'bg-blue-100 text-blue-700',    icon: Shield },
    denied:  { label: 'No Access',           cls: 'bg-slate-100 text-slate-500',  icon: UserX },
  };

  const initials = (name: string | null) =>
    (name ?? '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <TooltipProvider>
      <div className="flex h-screen bg-background overflow-hidden">

        {/* ── Left: page list ───────────────────────────────────────────────── */}
        <div className="w-64 flex-shrink-0 border-r flex flex-col bg-card">
          <div className="p-4 border-b">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-[#0F2041] to-[#1D3461] flex items-center justify-center">
                <Shield className="h-4 w-4 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-[#0F2041]">Page Access</h2>
                <p className="text-[10px] text-muted-foreground">{PAGES.length} pages · Super Admin</p>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={pageSearch} onChange={e => setPageSearch(e.target.value)}
                placeholder="Search pages…" className="pl-8 h-8 text-xs" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {filteredPages.map(page => {
              const Icon = page.icon;
              const isSelected = page.slug === selectedPage.slug;
              const ovCount = pageOverrideCount(page.slug);
              return (
                <button
                  key={page.slug}
                  onClick={() => { setSelectedPage(page); setUserSearch(''); }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all group',
                    isSelected
                      ? 'bg-[#1D3461] text-white'
                      : 'hover:bg-muted/50 text-foreground'
                  )}
                >
                  <Icon className={cn('h-3.5 w-3.5 shrink-0', isSelected ? 'text-white' : 'text-muted-foreground')} />
                  <span className="flex-1 text-xs font-medium truncate">{page.label}</span>
                  {ovCount > 0 && (
                    <span className={cn(
                      'text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0',
                      isSelected ? 'bg-white/20 text-white' : 'bg-[#1D3461]/10 text-[#1D3461]'
                    )}>{ovCount}</span>
                  )}
                  <ChevronRight className={cn('h-3 w-3 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity', isSelected && 'opacity-100')} />
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Right: user access panel ──────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b bg-card flex-shrink-0">
            <div>
              <h3 className="text-base font-bold">{selectedPage.label}</h3>
              <p className="text-xs text-muted-foreground">{selectedPage.path}</p>
            </div>
            <div className="flex-1" />
            {/* Default roles info */}
            <div className="flex items-center gap-1 flex-wrap justify-end">
              <span className="text-[10px] text-muted-foreground mr-1">Default access:</span>
              {selectedPage.defaultRoles.map(r => (
                <span key={r} className={cn('text-[9px] font-medium px-1.5 py-0.5 rounded-full capitalize', roleBadgeCls(r))}>
                  {r === 'all' ? 'Everyone' : r.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 px-6 py-2 bg-muted/30 border-b text-[10px] text-muted-foreground flex-shrink-0">
            <Tooltip>
              <TooltipTrigger className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />Role Access
                <Info className="h-3 w-3" />
              </TooltipTrigger>
              <TooltipContent className="text-xs max-w-[200px]">User can access this page through their role. No override set.</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />Explicitly Granted
                <Info className="h-3 w-3" />
              </TooltipTrigger>
              <TooltipContent className="text-xs max-w-[200px]">You manually granted access to this user, even if their role doesn't allow it.</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />Explicitly Blocked
                <Info className="h-3 w-3" />
              </TooltipTrigger>
              <TooltipContent className="text-xs max-w-[200px]">You manually blocked this user, even if their role normally grants access.</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-slate-300 inline-block" />No Access
                <Info className="h-3 w-3" />
              </TooltipTrigger>
              <TooltipContent className="text-xs max-w-[200px]">No role access and no override. User cannot see this page.</TooltipContent>
            </Tooltip>
          </div>

          {/* Search */}
          <div className="px-6 py-3 border-b flex-shrink-0">
            <div className="relative max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={userSearch} onChange={e => setUserSearch(e.target.value)}
                placeholder="Search users…" className="pl-8 h-8 text-xs" />
            </div>
          </div>

          {/* User list */}
          <div className="flex-1 overflow-y-auto px-6 py-3">
            <div className="space-y-1">
              {filteredUsers.map(profile => {
                const status = getUserStatus(profile);
                const ov = pageOverrides[profile.id];
                const sl = statusLabel[status];
                const Icon = sl.icon;
                const isSaving = savingId === profile.id;
                return (
                  <div key={profile.id} className={cn(
                    'flex items-center gap-3 p-3 rounded-xl border transition-colors group',
                    status === 'blocked' ? 'bg-red-50/40 dark:bg-red-900/5 border-red-200/50' :
                    status === 'granted' ? 'bg-emerald-50/40 dark:bg-emerald-900/5 border-emerald-200/50' :
                    'bg-card hover:bg-muted/20'
                  )}>
                    {/* Avatar */}
                    <div className={cn(
                      'w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0',
                      status === 'denied' || status === 'blocked'
                        ? 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                        : 'bg-[#0F2041]/10 text-[#0F2041]'
                    )}>
                      {initials(profile.full_name)}
                    </div>

                    {/* Name + role */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{profile.full_name ?? 'Unknown'}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className={cn('text-[9px] font-medium px-1.5 py-0.5 rounded-full capitalize', roleBadgeCls(profile.role ?? ''))}>
                          {(profile.role ?? 'unknown').replace(/_/g, ' ')}
                        </span>
                        {ov?.notes && (
                          <Tooltip>
                            <TooltipTrigger><Info className="h-3 w-3 text-muted-foreground" /></TooltipTrigger>
                            <TooltipContent className="text-xs">{ov.notes}</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </div>

                    {/* Status badge */}
                    <span className={cn('text-[10px] font-medium px-2 py-1 rounded-full flex items-center gap-1 shrink-0', sl.cls)}>
                      <Icon className="h-3 w-3" />{sl.label}
                    </span>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {isSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <>
                          {/* Grant button — shown when denied or blocked */}
                          {(status === 'denied' || status === 'blocked') && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="sm" variant="ghost"
                                  className="opacity-0 group-hover:opacity-100 h-7 px-2 text-xs text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-opacity"
                                  onClick={() => setOverride(profile.id, false, ov?.id)}>
                                  <Unlock className="h-3 w-3 mr-1" />Grant
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs">Give this user access to {selectedPage.label}, regardless of their role</TooltipContent>
                            </Tooltip>
                          )}

                          {/* Block button — shown when role or granted */}
                          {(status === 'role' || status === 'granted') && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="sm" variant="ghost"
                                  className="opacity-0 group-hover:opacity-100 h-7 px-2 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-opacity"
                                  onClick={() => setOverride(profile.id, true, ov?.id)}>
                                  <Lock className="h-3 w-3 mr-1" />Block
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs">Block this user from {selectedPage.label}, even if their role allows it</TooltipContent>
                            </Tooltip>
                          )}

                          {/* Remove override — shown when any override exists */}
                          {ov && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="sm" variant="ghost"
                                  className="opacity-0 group-hover:opacity-100 h-7 px-2 text-xs text-muted-foreground hover:bg-muted transition-opacity"
                                  onClick={() => removeOverride(ov.id, profile.id)}>
                                  Reset
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs">Remove override — revert to default role access</TooltipContent>
                            </Tooltip>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
