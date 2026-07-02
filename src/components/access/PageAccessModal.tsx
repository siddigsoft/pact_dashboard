import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { normalizeRole } from '@/utils/roleMapping';
import { Search, Shield, Info } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  PAGE_DEFS,
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

  const page = PAGE_DEFS.find(p => p.slug === pageSlug) ?? PAGE_DEFS[0];

  const { data: profiles = [] } = useQuery<Profile[]>({
    queryKey: ['pac-profiles'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, role').order('full_name');
      return (data ?? []) as Profile[];
    },
    staleTime: 120_000,
    enabled: true,          // pre-load in background so dialog opens instantly
  });

  const { data: overrides = [], refetch } = useQuery<PageOverride[]>({
    queryKey: ['pac-overrides', pageSlug],
    queryFn: async () => {
      const { data } = await supabase
        .from('page_access_overrides')
        .select('*')
        .eq('page_slug', pageSlug);  // fetch only this page's overrides
      return (data ?? []) as PageOverride[];
    },
    staleTime: 15_000,
    enabled: true,          // pre-load so dialog opens instantly
  });

  const pageOverrideMap = useMemo(() => {
    const m: Record<string, PageOverride> = {};
    overrides.forEach(o => { m[o.user_id] = o; });
    return m;
  }, [overrides]);

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

  const nonSuperProfiles = profiles.filter(p => normalizeRole(p.role ?? '') !== 'superAdmin');

  const filtered = nonSuperProfiles.filter(p =>
    (p.full_name ?? '').toLowerCase().includes(userSearch.toLowerCase()) ||
    (ROLE_LABELS[normalizeRole(p.role ?? '') ?? ''] ?? p.role ?? '').toLowerCase().includes(userSearch.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) =>
    STATUS_ORDER[getAccessStatus(page, a, pageOverrideMap)] -
    STATUS_ORDER[getAccessStatus(page, b, pageOverrideMap)]
  );

  const counts: Record<AccessStatus, number> = { blocked: 0, granted: 0, role: 0, denied: 0 };
  nonSuperProfiles.forEach(p => { counts[getAccessStatus(page, p, pageOverrideMap)]++; });

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
                </DialogTitle>
                <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{page.path}</p>
                <div className="flex items-center gap-1 flex-wrap mt-2">
                  <span className="text-[10px] text-muted-foreground mr-1">Default access:</span>
                  {page.roles.map(r => (
                    <span key={r} className={cn('text-[9px] font-medium px-1.5 py-0.5 rounded-full',
                      r === 'all' ? 'bg-blue-100 text-blue-700' :
                      r === '!dataCollector' ? 'bg-orange-100 text-orange-700' :
                      ROLE_COLORS[r] ?? 'bg-slate-100 text-slate-500')}>
                      {r === 'all' ? 'Everyone' : r === '!dataCollector' ? 'All except Data Collector' : ROLE_LABELS[r] ?? r}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              {([
                { key: 'role',    dot: 'bg-blue-400',    label: 'Role Access' },
                { key: 'granted', dot: 'bg-emerald-400', label: 'Granted' },
                { key: 'blocked', dot: 'bg-red-400',     label: 'Blocked' },
                { key: 'denied',  dot: 'bg-slate-300',   label: 'No Access' },
              ] as const).map(({ key, dot, label }) => (
                <div key={key} className="flex items-center gap-1">
                  <span className={cn('w-2 h-2 rounded-full', dot)} />
                  <span className="text-[10px] text-muted-foreground">{label}:</span>
                  <span className="text-[10px] font-bold">{counts[key]}</span>
                </div>
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
              {sorted.map(profile => {
                const status = getAccessStatus(page, profile, pageOverrideMap);
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
