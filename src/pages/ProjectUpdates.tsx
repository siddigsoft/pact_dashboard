import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Search, ArrowRight, X, CheckCircle2, ClipboardCheck, Undo2, CircleDashed, FolderOpen } from 'lucide-react';
import { DirectorUpdatePanel } from '@/components/project/DirectorUpdatePanel';
import {
  activeCyclePeriods, currentCycle,
  type ReportingCadence, type RiskFlag, type UpdateStatus,
} from '@/hooks/useProjectDirectorUpdate';
import { cn } from '@/lib/utils';

interface ProjectRow {
  id: string; name: string; project_code: string | null; status: string | null;
  current_flow_stage: string | null; reporting_cadence: ReportingCadence | null;
}
interface CycleUpdate {
  project_id: string; reporting_period: string; status: UpdateStatus;
  risk_flag: RiskFlag | null; overall_progress: number | null; overall_progress_override: number | null;
}

type QueueFilter = 'all' | 'submitted' | 'pending' | 'validated' | 'returned';

const FLAG_DOT: Record<RiskFlag, string> = {
  green: 'bg-emerald-500', yellow: 'bg-amber-400', orange: 'bg-orange-500', red: 'bg-rose-500',
};
/* Soft halo around the risk dot — the same colour, carried into the row without a stripe. */
const FLAG_HALO: Record<RiskFlag, string> = {
  green: 'ring-emerald-500/20', yellow: 'ring-amber-400/25', orange: 'ring-orange-500/20', red: 'ring-rose-500/20',
};
const STATUS_LABEL: Record<string, string> = {
  'not started': 'Not started',
  draft: 'Draft',
  submitted: 'To review',
  validated: 'Validated',
  returned: 'Returned',
};

/* Soft badge palette, matching the Dashboard's bg-{hue}-100 / text-{hue}-700 idiom. */
const STATUS_PILL: Record<string, string> = {
  submitted: 'bg-sky-100 text-sky-700 ring-sky-600/15 dark:bg-sky-950/60 dark:text-sky-300 dark:ring-sky-400/20',
  validated: 'bg-emerald-100 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-400/20',
  returned: 'bg-amber-100 text-amber-700 ring-amber-600/15 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-400/20',
  draft: 'bg-indigo-100 text-indigo-700 ring-indigo-600/15 dark:bg-indigo-950/60 dark:text-indigo-300 dark:ring-indigo-400/20',
  'not started': 'bg-slate-100 text-slate-500 ring-slate-500/15 dark:bg-slate-800 dark:text-slate-400 dark:ring-white/10',
};

function projectPeriod(p: ProjectRow) {
  return currentCycle(p.reporting_cadence === 'biweekly' ? 'biweekly' : 'weekly').period;
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={cn(
      'uber-font shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] ring-1 ring-inset',
      STATUS_PILL[status] ?? STATUS_PILL['not started'],
    )}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function QueueSkeleton() {
  return (
    <div aria-hidden className="space-y-px">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-border/50 px-2 py-3.5">
          <div className="h-2 w-2 rounded-full bg-slate-200 animate-pulse dark:bg-slate-700" />
          <div className="flex-1 space-y-2">
            <div className="h-3 rounded bg-slate-200/80 animate-pulse dark:bg-slate-700/70" style={{ width: `${52 + ((i * 13) % 34)}%` }} />
            <div className="h-2 w-[38%] rounded bg-slate-200/50 animate-pulse dark:bg-slate-700/40" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ProjectUpdates() {
  const periods = useMemo(() => activeCyclePeriods(), []);
  const cycle = useMemo(() => currentCycle('weekly'), []);
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<QueueFilter>('all');

  const projects = useQuery({
    queryKey: ['pu_projects'],
    queryFn: async (): Promise<ProjectRow[]> => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, project_code, status, current_flow_stage, reporting_cadence')
        .neq('archived', true)
        .order('name');
      if (error) throw error;
      return (data ?? []) as ProjectRow[];
    },
    staleTime: 60_000,
  });

  const cycleUpdates = useQuery({
    queryKey: ['pu_cycle_updates', ...periods],
    queryFn: async (): Promise<CycleUpdate[]> => {
      const { data, error } = await supabase
        .from('project_director_updates')
        .select('project_id, reporting_period, status, risk_flag, overall_progress, overall_progress_override')
        .in('reporting_period', periods);
      if (error) throw error;
      return (data ?? []) as CycleUpdate[];
    },
    staleTime: 30_000,
  });

  const updatesList = cycleUpdates.data ?? [];

  const updatesFor = (p: ProjectRow): CycleUpdate | undefined => {
    const period = projectPeriod(p);
    return updatesList.find(u => u.project_id === p.id && u.reporting_period === period);
  };

  const summary = useMemo(() => {
    const list = projects.data ?? [];
    let submitted = 0, validated = 0, pending = 0, returned = 0;
    for (const p of list) {
      const u = updatesFor(p);
      if (u?.status === 'validated') validated++;
      else if (u?.status === 'submitted') submitted++;
      else if (u?.status === 'returned') returned++;
      else pending++;
    }
    return { total: list.length, submitted, validated, pending, returned };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects.data, updatesList]);

  const rows = useMemo(() => {
    const list = projects.data ?? [];
    const needle = q.trim().toLowerCase();
    return list.filter(p => {
      if (needle && !p.name.toLowerCase().includes(needle) && !(p.project_code ?? '').toLowerCase().includes(needle)) return false;
      const st = updatesFor(p)?.status;
      if (filter === 'all') return true;
      if (filter === 'pending') return !st || st === 'draft';
      return st === filter;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects.data, q, filter, updatesList]);

  const selectedProject = (projects.data ?? []).find(p => p.id === selected) ?? null;

  const filters: { id: QueueFilter; label: string; count: number; tone: string }[] = [
    { id: 'all', label: 'All', count: summary.total, tone: 'text-slate-500' },
    { id: 'submitted', label: 'To review', count: summary.submitted, tone: 'text-sky-600' },
    { id: 'pending', label: 'Pending', count: summary.pending, tone: 'text-indigo-600' },
    { id: 'returned', label: 'Returned', count: summary.returned, tone: 'text-amber-600' },
    { id: 'validated', label: 'Validated', count: summary.validated, tone: 'text-emerald-600' },
  ];

  /* Gradient KPI tiles, same vocabulary as the main Dashboard's GRADIENT_PRESETS.
     Each tile is also the filter control for its own bucket, so the colour is doing
     a job rather than sitting there. */
  const tiles = [
    // Light ends are -600 not -500: white on emerald/sky/amber-500 is ~2.5:1 and fails AA.
    { id: 'validated' as QueueFilter, label: 'Validated', value: summary.validated, caption: 'Published to dashboards', grad: 'from-emerald-600 to-teal-800', Icon: CheckCircle2 },
    { id: 'submitted' as QueueFilter, label: 'To review', value: summary.submitted, caption: 'Waiting on a validator', grad: 'from-sky-600 to-blue-800', Icon: ClipboardCheck },
    { id: 'returned' as QueueFilter, label: 'Returned', value: summary.returned, caption: 'Sent back for revision', grad: 'from-amber-600 to-orange-700', Icon: Undo2 },
    { id: 'pending' as QueueFilter, label: 'Pending', value: summary.pending, caption: 'No entry yet this cycle', grad: 'from-indigo-500 to-indigo-700', Icon: CircleDashed },
  ];

  return (
    <div className="relative min-h-full bg-[hsl(214_32%_96.5%)] dark:bg-[hsl(222_47%_6%)]">
      {/* A single clean top wash — colour without the muddy multi-stop radial. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-sky-100/70 via-sky-50/25 to-transparent dark:from-sky-950/30 dark:via-transparent"
      />

      <div className="relative mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10">

        {/* ── Masthead ── */}
        <header className="pb-6 pt-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-sky-700/80 dark:text-sky-300/80">
            Cycle {cycle.label}
            <span className="hidden text-muted-foreground/70 xl:inline"> · {cycle.start} → {cycle.end}</span>
          </p>
          <h1 className="uber-heading mt-2.5 text-[2rem] text-foreground sm:text-[2.375rem]">
            Project Updates
          </h1>
          <p className="mt-2.5 max-w-[60ch] text-[0.8125rem] leading-relaxed text-muted-foreground">
            Confirm this cycle&apos;s progress, flag risk, and submit for validation.
            Only validated updates reach the dashboards.
          </p>
        </header>

        {/* ── KPI tiles: click one to filter the register below ── */}
        <div className="grid grid-cols-2 gap-3 pb-7 lg:grid-cols-4 lg:gap-4">
          {tiles.map(({ id, label, value, caption, grad, Icon }) => {
            const active = filter === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(active ? 'all' : id)}
                aria-pressed={active}
                className={cn(
                  'group relative overflow-hidden rounded-xl bg-gradient-to-br p-4 text-left text-white sm:p-5',
                  grad,
                  'shadow-[0_2px_4px_rgba(15,23,42,0.08),0_12px_28px_-16px_rgba(15,23,42,0.5)]',
                  'transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
                  'hover:-translate-y-0.5 hover:shadow-[0_4px_8px_rgba(15,23,42,0.1),0_20px_36px_-18px_rgba(15,23,42,0.55)] active:translate-y-0 active:scale-[0.99]',
                  active && 'ring-2 ring-white/70 ring-offset-2 ring-offset-[hsl(214_32%_96.5%)] dark:ring-offset-[hsl(222_47%_6%)]',
                )}
              >
                <Icon aria-hidden className="absolute -bottom-5 -right-4 h-24 w-24 text-white/10 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-110" strokeWidth={1.5} />
                <div className="relative flex items-start justify-between gap-2">
                  <span className="uber-font text-[11px] font-bold uppercase tracking-[0.1em] text-white">{label}</span>
                  <Icon aria-hidden className="h-4 w-4 shrink-0 text-white/85" strokeWidth={2} />
                </div>
                <div className="relative mt-2 font-mono text-[2rem] font-medium leading-none tabular-nums">{value}</div>
                <p className="relative mt-2 text-[10.5px] leading-snug text-white/90">{caption}</p>
              </button>
            );
          })}
        </div>

        {/* ── Register (left) / entry sheet (right) ── */}
        <div className="grid gap-0 border-t border-slate-900/10 lg:grid-cols-[minmax(0,330px)_minmax(0,1fr)] dark:border-white/10">

          <aside className="flex min-w-0 flex-col gap-4 py-6 lg:sticky lg:top-0 lg:max-h-[calc(100dvh-5.5rem)] lg:self-start lg:border-r lg:border-slate-900/10 lg:pr-7 dark:lg:border-white/10">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" strokeWidth={2} />
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search name or code"
                aria-label="Search projects"
                className="h-10 w-full rounded-lg border border-blue-100 bg-white pl-9 pr-9 text-[0.8125rem] text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-shadow placeholder:text-muted-foreground/70 focus:border-primary/40 focus:outline-none focus:ring-[3px] focus:ring-primary/15 dark:border-blue-900 dark:bg-[hsl(222_40%_9.5%)]"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => setQ('')}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground/70 transition-colors hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              )}
            </div>

            {/* Ruled tab bar — the rule sits on each tab so a wrapped row keeps its baseline. */}
            <div role="tablist" aria-label="Update status filter" className="flex flex-wrap items-center">
              {filters.map(f => {
                const active = filter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFilter(f.id)}
                    className={cn(
                      'uber-font relative flex-1 whitespace-nowrap border-b border-slate-900/10 px-1 py-2 text-center text-[11px] font-semibold transition-colors duration-200 dark:border-white/10',
                      active ? 'text-primary' : 'text-muted-foreground hover:text-foreground/80',
                    )}
                  >
                    {f.label}
                    <span className={cn('ml-1 font-mono text-[10px] font-normal tabular-nums', active ? 'text-primary/70' : f.tone)}>
                      {f.count}
                    </span>
                    {active && (
                      <motion.span
                        layoutId="pu-tab-underline"
                        className="absolute inset-x-0 -bottom-px h-[2px] bg-primary"
                        transition={{ type: 'spring', stiffness: 480, damping: 38 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Horizontal padding gives the lifted active row room for its shadow. */}
            <div className="-mx-3 min-h-0 flex-1 overflow-y-auto px-3 pb-6">
              {projects.isLoading && <QueueSkeleton />}

              {!projects.isLoading && rows.length === 0 && (
                <div className="px-2 py-12">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                    <Search className="h-4 w-4 text-primary" strokeWidth={2} />
                  </div>
                  <p className="uber-font mt-3 text-sm font-bold text-foreground">Nothing matches</p>
                  <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted-foreground">
                    Clear the search or switch back to All.
                  </p>
                </div>
              )}

              <div role="listbox" aria-label="Projects">
                {rows.map((p, i) => {
                  const u = updatesFor(p);
                  const st = u?.status ?? 'not started';
                  const prog = u?.overall_progress_override ?? u?.overall_progress;
                  const active = selected === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => setSelected(p.id)}
                      style={{ animationDelay: `${Math.min(i, 12) * 26}ms` }}
                      className={cn(
                        'pdu-queue-row group relative flex w-full items-start gap-3 border-b px-2 py-3.5 text-left',
                        'transition-[background-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
                        active
                          ? 'z-10 rounded-lg border-transparent bg-white px-3 shadow-[0_1px_2px_rgba(37,99,235,0.08),0_10px_28px_-14px_rgba(37,99,235,0.5)] ring-1 ring-primary/25 dark:bg-[hsl(222_40%_11%)] dark:ring-primary/40'
                          : 'border-slate-900/[0.07] hover:bg-white/70 active:scale-[0.995] dark:border-white/[0.07] dark:hover:bg-white/[0.04]',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-[7px] h-2 w-2 shrink-0 rounded-full ring-4',
                          u?.risk_flag ? cn(FLAG_DOT[u.risk_flag], FLAG_HALO[u.risk_flag]) : 'bg-slate-300 ring-slate-300/20 dark:bg-slate-600 dark:ring-slate-600/25',
                        )}
                        title={u?.risk_flag ? `Risk: ${u.risk_flag}` : 'No risk flag yet'}
                      />

                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className={cn('uber-font min-w-0 flex-1 truncate text-[0.8125rem] leading-5', active ? 'font-bold text-foreground' : 'font-semibold text-foreground/85')}>
                            {p.name}
                          </span>
                          <StatusPill status={st} />
                        </span>

                        <span className="mt-1 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                          {p.project_code && <span className="truncate font-mono tracking-tight">{p.project_code}</span>}
                          {p.project_code && <span aria-hidden className="opacity-30">/</span>}
                          <span>{p.reporting_cadence === 'biweekly' ? 'Biweekly' : 'Weekly'}</span>
                          <span aria-hidden className="opacity-30">/</span>
                          <span className="truncate font-mono tabular-nums">
                            {prog != null ? `${Math.round(Number(prog))}%` : (p.current_flow_stage ?? 'no data')}
                          </span>
                        </span>

                        {prog != null && (
                          <span className="mt-2 block h-[3px] w-full overflow-hidden rounded-full bg-slate-900/[0.07] dark:bg-white/10">
                            <span
                              className={cn(
                                'block h-full rounded-full transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
                                u?.risk_flag ? FLAG_DOT[u.risk_flag] : 'bg-primary/60',
                              )}
                              style={{ width: `${Math.min(100, Math.max(0, Math.round(Number(prog))))}%` }}
                            />
                          </span>
                        )}
                      </span>

                      <ArrowRight
                        className={cn(
                          'mt-1 h-3.5 w-3.5 shrink-0 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
                          active ? 'translate-x-0 text-primary' : '-translate-x-1 text-transparent group-hover:translate-x-0 group-hover:text-primary/60',
                        )}
                        strokeWidth={2}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          <main className="min-w-0 py-6 lg:pl-8">
            {selectedProject ? (
              <div
                key={selectedProject.id}
                className="pdu-detail-enter rounded-xl border border-blue-100 bg-white px-5 pb-6 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_16px_40px_-24px_rgba(15,23,42,0.3)] sm:px-8 dark:border-blue-900 dark:bg-[hsl(222_40%_9.5%)]"
              >
                <div className="sticky top-0 z-10 -mx-5 mb-7 rounded-t-xl border-b border-blue-100 bg-white/[0.92] px-5 py-4 backdrop-blur-sm sm:-mx-8 sm:px-8 dark:border-blue-900 dark:bg-[hsl(222_40%_9.5%/0.92)]">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <FolderOpen className="h-4 w-4 text-primary" strokeWidth={2} />
                      </span>
                      <div className="min-w-0">
                        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                          {selectedProject.project_code ?? 'Project'}
                        </p>
                        <h2 className="uber-heading mt-0.5 truncate text-[1.375rem] text-foreground">
                          {selectedProject.name}
                        </h2>
                      </div>
                    </div>
                    <span className="uber-font shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-primary">
                      {selectedProject.reporting_cadence === 'biweekly' ? 'Biweekly' : 'Weekly'}
                    </span>
                  </div>
                </div>
                <DirectorUpdatePanel projectId={selectedProject.id} />
              </div>
            ) : (
              <div className="rounded-xl border border-blue-100 bg-white px-6 py-16 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:px-10 sm:py-20 dark:border-blue-900 dark:bg-[hsl(222_40%_9.5%)]">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <FolderOpen className="h-5 w-5 text-primary" strokeWidth={2} />
                </span>
                <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.18em] text-sky-700/80 dark:text-sky-300/80">
                  {cycle.label} · nothing open
                </p>
                <h2 className="uber-heading mt-2.5 text-[1.5rem] text-foreground">
                  Open an entry to begin
                </h2>
                <p className="mt-3 max-w-[46ch] text-[0.8125rem] leading-relaxed text-muted-foreground">
                  Every project in the register needs one confirmed entry per cycle. Pick one from the
                  left to record progress, or go straight to what is waiting on you.
                </p>
                {summary.submitted > 0 && (
                  <button
                    type="button"
                    onClick={() => setFilter('submitted')}
                    className="uber-font mt-7 inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-sky-500 to-blue-700 px-4 py-2.5 text-[0.8125rem] font-bold text-white shadow-[0_2px_4px_rgba(15,23,42,0.08),0_10px_24px_-14px_rgba(37,99,235,0.7)] transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]"
                  >
                    Review {summary.submitted} submission{summary.submitted === 1 ? '' : 's'}
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                )}
              </div>
            )}
          </main>
        </div>
      </div>

      <style>{`
        @keyframes pdu-row-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .pdu-queue-row { animation: pdu-row-in 0.34s cubic-bezier(0.16, 1, 0.3, 1) both; }
        @keyframes pdu-detail-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .pdu-detail-enter { animation: pdu-detail-in 0.28s cubic-bezier(0.16, 1, 0.3, 1) both; }
        @media (prefers-reduced-motion: reduce) {
          .pdu-queue-row, .pdu-detail-enter { animation: none; }
        }
      `}</style>
    </div>
  );
}
