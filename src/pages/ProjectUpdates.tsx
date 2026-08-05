import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ClipboardCheck, ChevronRight, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DirectorUpdatePanel } from '@/components/project/DirectorUpdatePanel';
import { currentCycle, type RiskFlag, type UpdateStatus } from '@/hooks/useProjectDirectorUpdate';
import { cn } from '@/lib/utils';

interface ProjectRow { id: string; name: string; project_code: string | null; status: string | null; current_flow_stage: string | null; }
interface CycleUpdate { project_id: string; status: UpdateStatus; risk_flag: RiskFlag | null; overall_progress: number | null; overall_progress_override: number | null; }

const FLAG_DOT: Record<RiskFlag, string> = {
  green: 'bg-emerald-500', yellow: 'bg-amber-400', orange: 'bg-orange-500', red: 'bg-red-500',
};
const STATUS_BADGE: Record<string, string> = {
  'not started': 'bg-muted text-muted-foreground',
  draft: 'bg-muted text-muted-foreground',
  submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  validated: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  returned: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
};

export default function ProjectUpdates() {
  const cycle = useMemo(() => currentCycle(), []);
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const projects = useQuery({
    queryKey: ['pu_projects'],
    queryFn: async (): Promise<ProjectRow[]> => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, project_code, status, current_flow_stage')
        .neq('archived', true)
        .order('name');
      if (error) throw error;
      return (data ?? []) as ProjectRow[];
    },
    staleTime: 60_000,
  });

  const cycleUpdates = useQuery({
    queryKey: ['pu_cycle_updates', cycle.period],
    queryFn: async (): Promise<Record<string, CycleUpdate>> => {
      const { data, error } = await supabase
        .from('project_director_updates')
        .select('project_id, status, risk_flag, overall_progress, overall_progress_override')
        .eq('reporting_period', cycle.period);
      if (error) throw error;
      const map: Record<string, CycleUpdate> = {};
      for (const r of (data ?? []) as CycleUpdate[]) map[r.project_id] = r;
      return map;
    },
    staleTime: 30_000,
  });

  const rows = useMemo(() => {
    const list = projects.data ?? [];
    const needle = q.trim().toLowerCase();
    return list.filter(p => !needle || p.name.toLowerCase().includes(needle) || (p.project_code ?? '').toLowerCase().includes(needle));
  }, [projects.data, q]);

  const updates = cycleUpdates.data ?? {};
  const selectedProject = (projects.data ?? []).find(p => p.id === selected) ?? null;

  const summary = useMemo(() => {
    const list = projects.data ?? [];
    let submitted = 0, validated = 0, pending = 0;
    for (const p of list) {
      const u = updates[p.id];
      if (u?.status === 'validated') validated++;
      else if (u?.status === 'submitted') submitted++;
      else pending++;
    }
    return { total: list.length, submitted, validated, pending };
  }, [projects.data, updates]);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <ClipboardCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Project Updates</h1>
            <p className="text-sm text-muted-foreground">
              Directors' implementation updates for <span className="font-medium text-foreground">{cycle.label}</span>. Pick a project to record or review its update.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground"><b className="text-foreground tabular-nums">{summary.validated}</b> validated</span>
          <span className="text-muted-foreground"><b className="text-blue-600 tabular-nums">{summary.submitted}</b> to review</span>
          <span className="text-muted-foreground"><b className="text-foreground tabular-nums">{summary.pending}</b> pending</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(280px,360px)_1fr] gap-6">
        {/* Project list */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search projects…" value={q} onChange={e => setQ(e.target.value)} className="pl-9" />
          </div>
          <div className="rounded-xl border divide-y overflow-hidden">
            {projects.isLoading && <div className="p-4 text-sm text-muted-foreground">Loading projects…</div>}
            {!projects.isLoading && rows.length === 0 && <div className="p-4 text-sm text-muted-foreground">No projects match.</div>}
            {rows.map(p => {
              const u = updates[p.id];
              const st = u?.status ?? 'not started';
              const prog = u?.overall_progress_override ?? u?.overall_progress;
              const active = selected === p.id;
              return (
                <button key={p.id} onClick={() => setSelected(p.id)}
                  className={cn('w-full text-left px-3.5 py-3 flex items-center gap-3 transition', active ? 'bg-primary/5' : 'hover:bg-muted/50')}>
                  <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', u?.risk_flag ? FLAG_DOT[u.risk_flag] : 'bg-muted-foreground/30')} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {p.project_code ? `${p.project_code} · ` : ''}{prog != null ? `${Math.round(Number(prog))}%` : p.current_flow_stage ?? '—'}
                    </div>
                  </div>
                  <Badge className={cn('shrink-0 text-[10px]', STATUS_BADGE[st])}>{st.replace('_', ' ')}</Badge>
                  <ChevronRight className={cn('h-4 w-4 shrink-0 text-muted-foreground transition', active && 'text-primary')} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Detail */}
        <div className="min-w-0">
          {selectedProject ? (
            <div className="rounded-xl border p-5 sm:p-6">
              <div className="mb-4 pb-4 border-b">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Project</div>
                <div className="text-base font-semibold">{selectedProject.name}</div>
              </div>
              <DirectorUpdatePanel projectId={selectedProject.id} />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed h-full min-h-[320px] flex flex-col items-center justify-center text-center p-8">
              <ClipboardCheck className="h-8 w-8 text-muted-foreground/50 mb-3" />
              <p className="font-medium">Select a project</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Choose a project on the left to record this cycle's implementation update, log challenges and open actions, and set its risk flag.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
