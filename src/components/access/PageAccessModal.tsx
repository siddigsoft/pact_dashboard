import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { normalizeRole } from '@/utils/roleMapping';
import { Search, Shield, Info, Pencil, X, Check, Filter } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  PAGE_DEFS,
  PAGE_ROLE_ALL_OPTIONS,
  Profile,
  PageOverride,
  UserAccessRow,
  getAccessStatus,
  AccessStatus,
  Perms,
  DEFAULT_PERMS,
} from '@/pages/PageAccessControl';

const STATUS_ORDER: Record<AccessStatus, number> = { blocked: 0, granted: 1, role: 2, denied: 3 };

const ROLE_COLORS: Record<string, string> = {
  superAdmin:'bg-violet-100 text-violet-700', admin:'bg-[#1D3461]/10 text-[#1D3461]',
  financialAdmin:'bg-emerald-100 text-emerald-700', fom:'bg-orange-100 text-orange-700',
  dataTeam:'bg-cyan-100 text-cyan-700', coordinator:'bg-blue-100 text-blue-700',
  supervisor:'bg-indigo-100 text-indigo-700', dataCollector:'bg-slate-100 text-slate-600',
  auditor:'bg-amber-100 text-amber-700', ict:'bg-teal-100 text-teal-700',
  projectManager:'bg-pink-100 text-pink-700', countryDirector:'bg-rose-100 text-rose-700',
  reviewer:'bg-gray-100 text-gray-600',
};

const ROLE_LABELS: Record<string, string> = {
  superAdmin:'Super Admin', admin:'Admin', financialAdmin:'Financial Admin',
  fom:'FOM', dataTeam:'Data Team', coordinator:'Coordinator',
  supervisor:'Supervisor', dataCollector:'Data Collector', auditor:'Auditor',
  ict:'ICT', projectManager:'Project Manager', countryDirector:'Country Director',
  reviewer:'Reviewer',
};

const STATUS_UI = {
  granted: { dot: 'bg-emerald-400', label: 'Granted' },
  blocked: { dot: 'bg-red-400',     label: 'Blocked' },
  role:    { dot: 'bg-blue-400',    label: 'Role Access' },
  denied:  { dot: 'bg-slate-300',   label: 'No Access' },
} as const;

interface PageAccessModalProps {
  open: boolean;
  onClose: () => void;
  pageSlug: string;
}

export function PageAccessModal({ open, onClose, pageSlug }: PageAccessModalProps) {
  const { currentUser } = useAppContext();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [userSearch, setUserSearch] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<AccessStatus | 'all'>('all');
  const [rolePopoverOpen, setRolePopoverOpen] = useState(false);
  const [savingRoles, setSavingRoles] = useState(false);

  const page = PAGE_DEFS.find(p => p.slug === pageSlug) ?? PAGE_DEFS[0];

  const { data: profiles = [] } = useQuery<Profile[]>({
    queryKey: ['pac-profiles'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, role').order('full_name');
      return (data ?? []) as Profile[];
    },
    staleTime: 120_000,
    enabled: true,
  });

  const { data: overrides = [], refetch } = useQuery<PageOverride[]>({
    queryKey: ['pac-overrides', pageSlug],
    queryFn: async () => {
      const { data } = await supabase
        .from('page_access_overrides')
        .select('*')
        .eq('page_slug', pageSlug);
      return (data ?? []) as PageOverride[];
    },
    staleTime: 15_000,
    enabled: true,
  });

  const { data: roleConfigs = {}, refetch: refetchRoleConfigs } = useQuery<Record<string, string[]>>({
    queryKey: ['pac-role-configs'],
    queryFn: async () => {
      const { data } = await supabase.from('page_role_configs').select('page_slug, roles');
      const m: Record<string, string[]> = {};
      (data ?? []).forEach((r: any) => { m[r.page_slug] = r.roles; });
      return m;
    },
    staleTime: 30_000,
    enabled: true,
  });

  const pageOverrideMap = useMemo(() => {
    const m: Record<string, PageOverride> = {};
    overrides.forEach(o => { m[o.user_id] = o; });
    return m;
  }, [overrides]);

  const effectiveRoles = roleConfigs[page.slug] ?? page.roles;

  async function applyOverride(userId: string, isBlocked: boolean, perms: Perms = DEFAULT_PERMS, existingId?: string) {
    setSavingId(userId);
    try {
      const level: 'view' | 'manage' = (perms.w || perms.c || perms.d) ? 'manage' : 'view';
      const notes = isBlocked ? null : JSON.stringify(perms);
      if (existingId) {
        await supabase.from('page_access_overrides').update({ is_blocked: isBlocked, level, notes, granted_by: currentUser?.id }).eq('id', existingId);
      } else {
        await supabase.from('page_access_overrides').insert({ page_slug: pageSlug, user_id: userId, is_blocked: isBlocked, level, notes, granted_by: currentUser?.id });
      }
      const name = profiles.find(p => p.id === userId)?.full_name ?? 'User';
      const permStr = isBlocked ? 'Blocked' :
        [perms.r && 'Read', perms.w && 'Write', perms.c && 'Create', perms.d && 'Delete'].filter(Boolean).join(' + ');
      toast({ title: isBlocked ? 'Access blocked' : 'Access granted', description: `${name} → ${page.label} (${permStr})` });
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
      toast({ title: 'Override removed' });
      refetch();
      qc.invalidateQueries({ queryKey: ['pac-overrides'] });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setSavingId(null); }
  }

  async function saveRoleConfig(roles: string[]) {
    setSavingRoles(true);
    try {
      await supabase.from('page_role_configs').upsert(
        { page_slug: page.slug, roles, updated_by: currentUser?.id, updated_at: new Date().toISOString() },
        { onConflict: 'page_slug' }
      );
      refetchRoleConfigs();
      qc.invalidateQueries({ queryKey: ['pac-role-configs'] });
      toast({ title: 'Default access updated', description: `Roles saved for ${page.label}.` });
    } catch (e: any) {
      toast({ title: 'Error saving roles', description: e.message, variant: 'destructive' });
    } finally { setSavingRoles(false); }
  }

  const nonSuperProfiles = profiles.filter(p => normalizeRole(p.role ?? '') !== 'superAdmin');

  const filtered = nonSuperProfiles.filter(p =>
    (p.full_name ?? '').toLowerCase().includes(userSearch.toLowerCase()) ||
    (ROLE_LABELS[normalizeRole(p.role ?? '') ?? ''] ?? p.role ?? '').toLowerCase().includes(userSearch.toLowerCase())
  );

  const sorted = [...filtered]
    .filter(p => statusFilter === 'all' || getAccessStatus(page, p, pageOverrideMap, effectiveRoles) === statusFilter)
    .sort((a, b) =>
      STATUS_ORDER[getAccessStatus(page, a, pageOverrideMap, effectiveRoles)] -
      STATUS_ORDER[getAccessStatus(page, b, pageOverrideMap, effectiveRoles)]
    );

  const counts: Record<AccessStatus, number> = { blocked: 0, granted: 0, role: 0, denied: 0 };
  nonSuperProfiles.forEach(p => { counts[getAccessStatus(page, p, pageOverrideMap, effectiveRoles)]++; });

  return (
    <TooltipProvider>
      <Dialog open={open} onOpenChange={v => !v && onClose()}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b flex-shrink-0">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#0F2041] to-[#1D3461] flex items-center justify-center shrink-0">
                <Shield className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-base font-bold flex items-center gap-2">
                  {page.label} — Access Control
                  {page.note && (
                    <Tooltip>
                      <TooltipTrigger><Info className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
                      <TooltipContent className="text-xs max-w-[220px]">{page.note}</TooltipContent>
                    </Tooltip>
                  )}
                  {roleConfigs[page.slug] && (
                    <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">custom</span>
                  )}
                </DialogTitle>
                <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{page.path}</p>

                {/* Editable default-role badges */}
                <div className="flex items-center gap-1 flex-wrap mt-2">
                  <span className="text-[10px] text-muted-foreground mr-1 shrink-0">Default access:</span>
                  {effectiveRoles.map(r => (
                    <button
                      key={r}
                      onClick={() => saveRoleConfig(effectiveRoles.filter(x => x !== r))}
                      disabled={savingRoles}
                      title={`Remove ${r === 'all' ? 'Everyone' : ROLE_LABELS[r] ?? r}`}
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
                        <Pencil className="h-2.5 w-2.5" />
                        Edit
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-72 p-3">
                      <div className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                        <Shield className="h-3.5 w-3.5 text-[#1D3461]" />
                        Edit default access roles
                      </div>
                      <p className="text-[10px] text-muted-foreground mb-3">
                        Toggle roles with default access to <span className="font-medium">{page.label}</span>. Changes save immediately.
                      </p>
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {PAGE_ROLE_ALL_OPTIONS.map(r => {
                          const active = effectiveRoles.includes(r);
                          return (
                            <button
                              key={r}
                              disabled={savingRoles}
                              onClick={() => saveRoleConfig(active
                                ? effectiveRoles.filter(x => x !== r)
                                : [...effectiveRoles, r]
                              )}
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
                      {roleConfigs[page.slug] && (
                        <button
                          disabled={savingRoles}
                          onClick={() => {
                            supabase.from('page_role_configs').delete().eq('page_slug', page.slug).then(() => {
                              refetchRoleConfigs();
                              qc.invalidateQueries({ queryKey: ['pac-role-configs'] });
                              toast({ title: 'Reset to defaults', description: `${page.label} reverted to built-in roles.` });
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

            {/* Count chips — click to filter */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <button
                onClick={() => setStatusFilter('all')}
                className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border transition-all',
                  statusFilter === 'all'
                    ? 'bg-[#1D3461] text-white border-[#1D3461]'
                    : 'bg-background border-muted-foreground/30 text-muted-foreground hover:border-[#1D3461] hover:text-[#1D3461]')}>
                <Filter className="h-2.5 w-2.5" />
                All <span className="font-bold ml-0.5">{nonSuperProfiles.length}</span>
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
                  {ui.label} <span className="font-bold ml-0.5">{counts[key]}</span>
                </button>
              ))}
            </div>
          </DialogHeader>

          <div className="px-6 py-3 border-b flex-shrink-0 bg-muted/20">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={userSearch} onChange={e => setUserSearch(e.target.value)}
                placeholder="Search users…" className="pl-8 h-8 text-xs" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-3">
            <div className="space-y-1">
              {sorted.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Filter className="h-8 w-8 text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">No users match this filter.</p>
                  <button onClick={() => setStatusFilter('all')} className="text-xs text-[#1D3461] hover:underline mt-1">Clear filter</button>
                </div>
              )}
              {sorted.map(profile => {
                const status = getAccessStatus(page, profile, pageOverrideMap, effectiveRoles);
                const ov = pageOverrideMap[profile.id];
                return (
                  <UserAccessRow
                    key={profile.id}
                    profile={profile}
                    status={status}
                    override={ov}
                    isSaving={savingId === profile.id}
                    pageLabel={page.label}
                    onTogglePerm={(perms) => applyOverride(profile.id, false, perms, ov?.id)}
                    onBlock={() => applyOverride(profile.id, true, DEFAULT_PERMS, ov?.id)}
                    onReset={() => removeOverride(ov!.id, profile.id)}
                  />
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
