import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  format, parseISO, isValid, differenceInDays, addDays, startOfToday,
  isBefore, isAfter,
} from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts';
import {
  Briefcase, TrendingUp, AlertTriangle, CheckCircle2, Clock,
  Loader2, RefreshCw, ChevronRight, Flag, DollarSign,
  Users, BarChart2, ArrowUpDown, Search, ExternalLink,
  ChevronDown, ChevronUp, Circle, XCircle, Target,
  Activity, Zap, Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { normaliseProjectType } from '@/types/project';
import { getProjectFlow } from '@/config/projectFlows';
import { useAuthorization } from '@/hooks/use-authorization';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProjectRow {
  id: string;
  name: string;
  project_code: string;
  project_type: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  current_flow_stage: string | null;
  team: { projectManager?: string } | null;
  client_type: string | null;
  client_name: string | null;
  budget: { total?: number; currency?: string; allocated?: number; totalBudgetCents?: number; spentBudgetCents?: number } | null;
  archived: boolean | null;
}

interface BudgetRow {
  project_id: string;
  total_budget_cents: number;
  allocated_budget_cents: number;
  spent_budget_cents: number;
  remaining_budget_cents: number;
}

interface MilestoneRow {
  id: string;
  project_id: string;
  title: string;
  status: string;
  due_date: string | null;
  assigned_to: string | null;
}

interface FlowLogRow {
  project_id: string;
  advanced_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STALL_DAYS = 14;

const STATUS_CFG: Record<string, { label: string; color: string; dot: string }> = {
  active:    { label: 'Active',    color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40', dot: 'bg-emerald-500' },
  draft:     { label: 'Draft',     color: 'bg-slate-100 text-slate-600 dark:bg-slate-800',          dot: 'bg-slate-400' },
  onHold:    { label: 'On Hold',   color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40',       dot: 'bg-amber-500' },
  completed: { label: 'Completed', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40',          dot: 'bg-blue-500' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700 dark:bg-red-900/40',             dot: 'bg-red-500' },
};

const TYPE_LABELS: Record<string, string> = {
  tpm: 'TPM', baseline_survey: 'Baseline Survey', endline_survey: 'Endline Survey',
  assessment: 'Assessment', evaluation: 'Evaluation', research: 'Research',
  capacity_building: 'Capacity Building', compliance: 'Compliance',
  infrastructure: 'Infrastructure', other: 'Other',
  survey: 'Survey', monitoring: 'Monitoring', training: 'Training',
};

const TYPE_COLORS = ['#0F2041','#1D3461','#4f86c6','#34d399','#f59e0b','#a78bfa','#f87171','#38bdf8','#fb923c','#6ee7b7','#fca5a5','#c4b5fd'];

function safeDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  try { const d = parseISO(s); return isValid(d) ? d : null; } catch { return null; }
}

function fmtDate(s: string | null | undefined) {
  const d = safeDate(s);
  return d ? format(d, 'dd MMM yyyy') : '—';
}

function fmtMoney(cents: number, currency = 'SDG'): string {
  if (cents >= 1_000_000_000) return `${currency} ${(cents / 1_000_000_000).toFixed(1)}B`;
  if (cents >= 1_000_000) return `${currency} ${(cents / 1_000_000).toFixed(1)}M`;
  if (cents >= 1_000) return `${currency} ${(cents / 1_000).toFixed(0)}K`;
  return `${currency} ${cents.toFixed(0)}`;
}

function getBudget(p: ProjectRow, budgetMap: Record<string, BudgetRow>): { total: number; spent: number; currency: string } {
  const db = budgetMap[p.id];
  if (db) return { total: db.total_budget_cents ?? 0, spent: db.spent_budget_cents ?? 0, currency: 'SDG' };
  const jb = p.budget;
  if (jb?.totalBudgetCents != null) return { total: jb.totalBudgetCents, spent: jb.spentBudgetCents ?? 0, currency: jb.currency ?? 'SDG' };
  if (jb?.total != null) return { total: jb.total * 100, spent: 0, currency: jb.currency ?? 'SDG' };
  return { total: 0, spent: 0, currency: 'SDG' };
}

function getFlowProgress(p: ProjectRow): { current: number; total: number; stageName: string } {
  const flow = getProjectFlow(normaliseProjectType(p.project_type));
  const stages = flow.stages;
  if (!stages.length) return { current: 0, total: 0, stageName: '—' };
  const idx = p.current_flow_stage ? stages.findIndex(s => s.id === p.current_flow_stage) : -1;
  const current = idx >= 0 ? idx + 1 : 0;
  const stageName = idx >= 0 ? (stages[idx]?.label ?? '—') : 'Not started';
  return { current, total: stages.length, stageName };
}

type HealthSignal = 'on-track' | 'at-risk' | 'stalled' | 'completed' | 'draft';

function getHealth(p: ProjectRow, lastAdvanced: Record<string, string>): HealthSignal {
  if (p.status === 'completed' || p.status === 'cancelled') return 'completed';
  if (p.status === 'draft') return 'draft';
  const last = lastAdvanced[p.id];
  if (last) {
    const d = safeDate(last);
    if (d && differenceInDays(new Date(), d) > STALL_DAYS) return 'stalled';
  }
  if (p.end_date) {
    const end = safeDate(p.end_date);
    if (end && isBefore(end, new Date())) return 'at-risk';
  }
  return 'on-track';
}

const HEALTH_CFG: Record<HealthSignal, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  'on-track':  { label: 'On Track',  bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  'at-risk':   { label: 'At Risk',   bg: 'bg-amber-100 dark:bg-amber-900/30',     text: 'text-amber-700 dark:text-amber-300',   icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  'stalled':   { label: 'Stalled',   bg: 'bg-red-100 dark:bg-red-900/30',         text: 'text-red-700 dark:text-red-300',       icon: <Clock className="h-3.5 w-3.5" /> },
  'completed': { label: 'Closed',    bg: 'bg-slate-100 dark:bg-slate-800',         text: 'text-slate-500',                       icon: <Circle className="h-3.5 w-3.5" /> },
  'draft':     { label: 'Draft',     bg: 'bg-slate-100 dark:bg-slate-800',         text: 'text-slate-500',                       icon: <Circle className="h-3.5 w-3.5" /> },
};

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchPortfolioData() {
  const [{ data: projectsRaw }, { data: budgetsRaw }, { data: milestonesRaw }, { data: flowLogRaw }] = await Promise.all([
    supabase.rpc('get_projects_for_analytics'),
    supabase.from('project_budgets').select('project_id, total_budget_cents, allocated_budget_cents, spent_budget_cents, remaining_budget_cents'),
    supabase.from('project_milestones').select('id, project_id, title, status, due_date, assigned_to').order('due_date', { ascending: true }),
    supabase.from('project_flow_log').select('project_id, advanced_at').order('advanced_at', { ascending: false }),
  ]);

  const projects = (projectsRaw ?? []) as ProjectRow[];
  const budgets = (budgetsRaw ?? []) as BudgetRow[];
  const milestones = (milestonesRaw ?? []) as MilestoneRow[];

  const latestAdvanced: Record<string, string> = {};
  for (const row of (flowLogRaw ?? []) as FlowLogRow[]) {
    if (!latestAdvanced[row.project_id]) latestAdvanced[row.project_id] = row.advanced_at;
  }

  return { projects, budgets, milestones, latestAdvanced };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, color, bg }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string; bg: string;
}) {
  return (
    <div className={cn('rounded-2xl border p-4 flex items-start gap-3', bg)}>
      <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0', bg)}>
        <Icon className={cn('h-5 w-5', color)} />
      </div>
      <div className="min-w-0">
        <p className={cn('text-2xl font-bold leading-none', color)}>{value}</p>
        <p className="text-[11px] text-muted-foreground mt-1 leading-tight">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, subtitle, defaultOpen = true, children }: {
  icon: React.ElementType; title: string; subtitle?: string;
  defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-muted/40 transition-colors"
      >
        <div className="h-8 w-8 rounded-lg bg-[#1D3461]/10 flex items-center justify-center flex-shrink-0">
          <Icon className="h-4 w-4 text-[#1D3461]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground">{title}</p>
          {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-5 pb-5 pt-0 border-t">{children}</div>}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PortfolioDashboard() {
  const navigate = useNavigate();
  const { hasAnyRole } = useAuthorization();
  const canSeeFinancials = hasAnyRole(['super_admin', 'admin', 'finance', 'fom']);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['portfolio_dashboard'],
    queryFn: fetchPortfolioData,
    staleTime: 3 * 60_000,
    refetchOnWindowFocus: false,
  });

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [healthFilter, setHealthFilter] = useState('all');
  const [sortField, setSortField] = useState<'name' | 'health' | 'burn' | 'end_date' | 'type'>('health');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [activeTab, setActiveTab] = useState('health');

  const projects = data?.projects ?? [];
  const milestones = data?.milestones ?? [];
  const latestAdvanced = data?.latestAdvanced ?? {};

  const budgetMap = useMemo(() => {
    const m: Record<string, BudgetRow> = {};
    (data?.budgets ?? []).forEach(b => { m[b.project_id] = b; });
    return m;
  }, [data?.budgets]);

  // Enrich projects with computed fields
  const enriched = useMemo(() => projects
    .filter(p => !p.archived)
    .map(p => {
      const budget = getBudget(p, budgetMap);
      const burnPct = budget.total > 0 ? Math.round((budget.spent / budget.total) * 100) : 0;
      const flow = getFlowProgress(p);
      const health = getHealth(p, latestAdvanced);
      const overdueMilestones = milestones.filter(m =>
        m.project_id === p.id && m.status !== 'completed' && m.due_date && isBefore(parseISO(m.due_date), new Date())
      ).length;
      const nextMilestone = milestones.find(m =>
        m.project_id === p.id && m.status !== 'completed' && m.due_date && isAfter(parseISO(m.due_date), new Date())
      );
      return { ...p, budget, burnPct, flow, health, overdueMilestones, nextMilestone };
    }), [projects, budgetMap, milestones, latestAdvanced]);

  // Filter + search
  const filtered = useMemo(() => {
    let rows = enriched;
    if (statusFilter !== 'all') rows = rows.filter(p => p.status === statusFilter);
    if (typeFilter !== 'all') rows = rows.filter(p => normaliseProjectType(p.project_type) === typeFilter);
    if (healthFilter !== 'all') rows = rows.filter(p => p.health === healthFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.project_code.toLowerCase().includes(q) ||
        (p.client_name ?? '').toLowerCase().includes(q)
      );
    }
    return [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortField === 'type') cmp = (a.project_type ?? '').localeCompare(b.project_type ?? '');
      else if (sortField === 'burn') cmp = a.burnPct - b.burnPct;
      else if (sortField === 'end_date') {
        const da = safeDate(a.end_date)?.getTime() ?? 0;
        const db2 = safeDate(b.end_date)?.getTime() ?? 0;
        cmp = da - db2;
      } else {
        const order: HealthSignal[] = ['stalled', 'at-risk', 'on-track', 'draft', 'completed'];
        cmp = order.indexOf(a.health) - order.indexOf(b.health);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [enriched, statusFilter, typeFilter, healthFilter, search, sortField, sortDir]);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  // ── KPI computations ──
  const kpis = useMemo(() => {
    const active = enriched.filter(p => p.status === 'active').length;
    const stalled = enriched.filter(p => p.health === 'stalled').length;
    const atRisk = enriched.filter(p => p.health === 'at-risk').length;
    const completedThisYear = enriched.filter(p => {
      if (p.status !== 'completed') return false;
      const end = safeDate(p.end_date);
      return end && end.getFullYear() === new Date().getFullYear();
    }).length;
    const totalBudget = enriched.reduce((s, p) => s + p.budget.total, 0);
    const totalSpent = enriched.reduce((s, p) => s + p.budget.spent, 0);
    const portfolioBurn = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
    const overdueMilestones = enriched.reduce((s, p) => s + p.overdueMilestones, 0);
    const allPMs = new Set(enriched.map(p => (p.team as any)?.projectManager).filter(Boolean));
    return { active, stalled, atRisk, completedThisYear, totalBudget, totalSpent, portfolioBurn, overdueMilestones, totalProjects: enriched.length, pmCount: allPMs.size };
  }, [enriched]);

  // ── Pipeline board (active projects by flow stage index) ──
  const pipelineGroups = useMemo(() => {
    const active = enriched.filter(p => p.status === 'active' || p.status === 'onHold');
    const stageMap: Record<string, typeof active> = {};
    active.forEach(p => {
      const key = p.current_flow_stage ?? '__none__';
      if (!stageMap[key]) stageMap[key] = [];
      stageMap[key].push(p);
    });
    const groups: { stageLabel: string; projects: typeof active; isStalled: boolean }[] = [];
    // Walk each project's flow to get stage labels
    const seen = new Set<string>();
    active.forEach(p => {
      const flow = getProjectFlow(normaliseProjectType(p.project_type));
      flow.stages.forEach(s => {
        if (!seen.has(s.id) && stageMap[s.id]?.length) {
          seen.add(s.id);
          groups.push({
            stageLabel: s.label,
            projects: stageMap[s.id],
            isStalled: false,
          });
        }
      });
    });
    // Unstaged
    if (stageMap['__none__']?.length) {
      groups.unshift({ stageLabel: 'Not Started', projects: stageMap['__none__'], isStalled: false });
    }
    return groups;
  }, [enriched]);

  // ── Milestone radar (next 30 days) ──
  const upcomingMilestones = useMemo(() => {
    const today = startOfToday();
    const limit = addDays(today, 30);
    return milestones
      .filter(m => m.status !== 'completed' && m.due_date)
      .map(m => {
        const due = safeDate(m.due_date)!;
        const project = enriched.find(p => p.id === m.project_id);
        const daysLeft = differenceInDays(due, today);
        return { ...m, due, daysLeft, projectName: project?.name ?? '—', projectCode: project?.project_code ?? '' };
      })
      .filter(m => isAfter(m.due, addDays(today, -1)) && isBefore(m.due, limit))
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [milestones, enriched]);

  const overdueMilestonesAll = useMemo(() => {
    const today = startOfToday();
    return milestones
      .filter(m => m.status !== 'completed' && m.due_date)
      .map(m => {
        const due = safeDate(m.due_date)!;
        const project = enriched.find(p => p.id === m.project_id);
        const daysOverdue = differenceInDays(today, due);
        return { ...m, due, daysOverdue, projectName: project?.name ?? '—', projectCode: project?.project_code ?? '' };
      })
      .filter(m => m.daysOverdue > 0)
      .sort((a, b) => b.daysOverdue - a.daysOverdue);
  }, [milestones, enriched]);

  // ── Budget chart data ──
  const budgetChartData = useMemo(() =>
    enriched
      .filter(p => p.budget.total > 0)
      .sort((a, b) => b.budget.total - a.budget.total)
      .slice(0, 12)
      .map(p => ({
        name: p.project_code || p.name.slice(0, 12),
        fullName: p.name,
        total: Math.round(p.budget.total / 100),
        spent: Math.round(p.budget.spent / 100),
        burn: p.burnPct,
      })),
    [enriched]);

  // ── Type distribution ──
  const typeDistrib = useMemo(() => {
    const counts: Record<string, number> = {};
    enriched.filter(p => p.status === 'active').forEach(p => {
      const t = normaliseProjectType(p.project_type);
      counts[t] = (counts[t] ?? 0) + 1;
    });
    return Object.entries(counts).map(([type, value], i) => ({
      name: TYPE_LABELS[type] ?? type,
      value,
      color: TYPE_COLORS[i % TYPE_COLORS.length],
    }));
  }, [enriched]);

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="h-8 w-8 animate-spin text-[#1D3461]" />
    </div>
  );

  if (isError) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <AlertTriangle className="h-10 w-10 text-red-500" />
      <p className="text-sm text-muted-foreground">Failed to load portfolio data</p>
      <Button onClick={() => refetch()} size="sm">Retry</Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* ── Gradient Header ── */}
      <div className="bg-gradient-to-r from-[#0F2041] to-[#1D3461] text-white px-6 py-8">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center">
              <Briefcase className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Portfolio Dashboard</h1>
              <p className="text-blue-200 text-sm mt-0.5">
                {kpis.totalProjects} projects · {kpis.active} active · {kpis.pmCount} project managers
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="border-white/30 text-white hover:bg-white/10"
          >
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Active Projects', value: kpis.active, sub: `${kpis.totalProjects} total`, color: 'text-emerald-300' },
            { label: 'Stalled', value: kpis.stalled, sub: `>${STALL_DAYS}d no progress`, color: kpis.stalled > 0 ? 'text-red-300' : 'text-emerald-300' },
            { label: 'At Risk', value: kpis.atRisk, sub: 'past end date', color: kpis.atRisk > 0 ? 'text-amber-300' : 'text-emerald-300' },
            { label: 'Milestones Overdue', value: kpis.overdueMilestones, sub: 'across portfolio', color: kpis.overdueMilestones > 0 ? 'text-red-300' : 'text-emerald-300' },
            { label: 'Portfolio Burn', value: `${kpis.portfolioBurn}%`, sub: `${fmtMoney(kpis.totalSpent)} spent`, color: kpis.portfolioBurn > 90 ? 'text-red-300' : 'text-white' },
            { label: 'Closed This Year', value: kpis.completedThisYear, sub: new Date().getFullYear().toString(), color: 'text-blue-200' },
          ].map(k => (
            <div key={k.label} className="bg-white/10 rounded-xl p-3 border border-white/10">
              <div className={cn('text-2xl font-bold leading-none', k.color)}>{k.value}</div>
              <div className="text-white/80 text-xs font-medium mt-1">{k.label}</div>
              <div className="text-blue-300/70 text-[10px] mt-0.5">{k.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="px-4 sm:px-6 py-6 space-y-5 max-w-[1600px] mx-auto">

        {/* ── Alert Bar ── */}
        {(kpis.stalled > 0 || kpis.overdueMilestones > 0) && (
          <div className="flex flex-wrap gap-2">
            {kpis.stalled > 0 && (
              <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-xl px-4 py-2.5 flex-1 min-w-[200px]">
                <Clock className="h-4 w-4 text-red-600 flex-shrink-0" />
                <p className="text-sm text-red-800 dark:text-red-300 font-medium">
                  <span className="font-bold">{kpis.stalled}</span> project{kpis.stalled !== 1 ? 's' : ''} stalled — no stage advance in {STALL_DAYS}+ days
                </p>
              </div>
            )}
            {kpis.overdueMilestones > 0 && (
              <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-xl px-4 py-2.5 flex-1 min-w-[200px]">
                <Flag className="h-4 w-4 text-amber-600 flex-shrink-0" />
                <p className="text-sm text-amber-800 dark:text-amber-300 font-medium">
                  <span className="font-bold">{kpis.overdueMilestones}</span> milestone{kpis.overdueMilestones !== 1 ? 's' : ''} overdue across the portfolio
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Tabs: Health / Finance / Milestones / Pipeline ── */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex flex-row flex-nowrap h-auto w-max min-w-full justify-start bg-muted/50 p-1 rounded-xl overflow-x-auto">
            <TabsTrigger value="health" className="gap-1.5 text-xs font-semibold">
              <Activity className="h-3.5 w-3.5" />Health Matrix
            </TabsTrigger>
            {canSeeFinancials && (
              <TabsTrigger value="finance" className="gap-1.5 text-xs font-semibold">
                <DollarSign className="h-3.5 w-3.5" />Financial
              </TabsTrigger>
            )}
            <TabsTrigger value="milestones" className="gap-1.5 text-xs font-semibold">
              <Flag className="h-3.5 w-3.5" />Milestones
              {kpis.overdueMilestones > 0 && (
                <span className="ml-1 h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {kpis.overdueMilestones}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="pipeline" className="gap-1.5 text-xs font-semibold">
              <Zap className="h-3.5 w-3.5" />Pipeline
            </TabsTrigger>
            <TabsTrigger value="types" className="gap-1.5 text-xs font-semibold">
              <BarChart2 className="h-3.5 w-3.5" />Mix
            </TabsTrigger>
          </TabsList>

          {/* ═══════════════ HEALTH MATRIX ═══════════════ */}
          <TabsContent value="health" className="mt-4 space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name or code…" className="pl-9 h-9 text-sm" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 w-36 text-xs"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {Object.entries(STATUS_CFG).map(([v, c]) => <SelectItem key={v} value={v} className="text-xs">{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-9 w-44 text-xs"><SelectValue placeholder="All Types" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {Object.entries(TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={healthFilter} onValueChange={setHealthFilter}>
                <SelectTrigger className="h-9 w-36 text-xs"><SelectValue placeholder="All Health" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Health</SelectItem>
                  {(['stalled', 'at-risk', 'on-track', 'draft', 'completed'] as HealthSignal[]).map(h => (
                    <SelectItem key={h} value={h} className="text-xs">{HEALTH_CFG[h].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">{filtered.length} project{filtered.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Health Matrix Table */}
            <div className="rounded-xl border overflow-hidden bg-card shadow-sm">
              {/* Table Header */}
              <div className="grid grid-cols-[minmax(180px,2fr)_100px_120px_140px_minmax(120px,1fr)_90px_40px] gap-0 text-[11px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/40 border-b px-4 py-2.5">
                {[
                  { label: 'Project', field: 'name' as const },
                  { label: 'Type', field: 'type' as const },
                  { label: 'Health', field: 'health' as const },
                  { label: 'Flow Progress', field: null },
                  { label: 'Next Milestone', field: null },
                  { label: 'Burn %', field: 'burn' as const },
                  { label: '', field: null },
                ].map((col, i) => (
                  <div
                    key={i}
                    className={cn('flex items-center gap-0.5', col.field && 'cursor-pointer hover:text-foreground')}
                    onClick={() => col.field && toggleSort(col.field)}
                  >
                    {col.label}
                    {col.field && sortField === col.field && (
                      sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                    )}
                    {col.field && sortField !== col.field && <ArrowUpDown className="h-3 w-3 opacity-30" />}
                  </div>
                ))}
              </div>

              {/* Rows */}
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-muted-foreground gap-2">
                  <Briefcase className="h-8 w-8 opacity-30" />
                  <p className="text-sm">No projects match your filters</p>
                </div>
              ) : (
                <div className="divide-y">
                  {filtered.map(p => {
                    const hCfg = HEALTH_CFG[p.health];
                    const sCfg = STATUS_CFG[p.status] ?? STATUS_CFG.draft;
                    const flowPct = p.flow.total > 0 ? Math.round((p.flow.current / p.flow.total) * 100) : 0;
                    const burnColor = p.burnPct >= 100 ? 'text-red-600' : p.burnPct >= 80 ? 'text-amber-600' : 'text-emerald-600';
                    return (
                      <div
                        key={p.id}
                        className="grid grid-cols-[minmax(180px,2fr)_100px_120px_140px_minmax(120px,1fr)_90px_40px] gap-0 px-4 py-3 items-center hover:bg-muted/30 transition-colors group"
                        data-testid={`portfolio-row-${p.id}`}
                      >
                        {/* Project Name */}
                        <div className="min-w-0 pr-3">
                          <p className="text-sm font-semibold truncate leading-tight">{p.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-muted-foreground font-mono">{p.project_code}</span>
                            <Badge className={cn('text-[9px] px-1.5 py-0', sCfg.color)}>{sCfg.label}</Badge>
                            {p.overdueMilestones > 0 && (
                              <Badge className="text-[9px] px-1 py-0 bg-red-100 text-red-700">{p.overdueMilestones} overdue</Badge>
                            )}
                          </div>
                        </div>

                        {/* Type */}
                        <div className="text-[11px] text-muted-foreground truncate pr-2">
                          {TYPE_LABELS[normaliseProjectType(p.project_type)] ?? p.project_type}
                        </div>

                        {/* Health */}
                        <div>
                          <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full', hCfg.bg, hCfg.text)}>
                            {hCfg.icon}{hCfg.label}
                          </span>
                        </div>

                        {/* Flow Progress */}
                        <div className="pr-3">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Progress value={flowPct} className="h-1.5 flex-1" />
                            <span className="text-[10px] text-muted-foreground font-medium flex-shrink-0">{p.flow.current}/{p.flow.total}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate">{p.flow.stageName}</p>
                        </div>

                        {/* Next Milestone */}
                        <div className="min-w-0 pr-2">
                          {p.nextMilestone ? (
                            <>
                              <p className="text-[11px] truncate leading-tight">{p.nextMilestone.title}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {fmtDate(p.nextMilestone.due_date)}
                                {p.nextMilestone.due_date && (() => {
                                  const d = differenceInDays(parseISO(p.nextMilestone!.due_date!), new Date());
                                  return d <= 7 ? <span className="ml-1 text-amber-600 font-medium">({d}d)</span> : null;
                                })()}
                              </p>
                            </>
                          ) : (
                            <span className="text-[11px] text-muted-foreground/50">—</span>
                          )}
                        </div>

                        {/* Budget Burn */}
                        {canSeeFinancials ? (
                          <div className="text-right pr-2">
                            <p className={cn('text-sm font-bold', burnColor)}>{p.burnPct}%</p>
                            <p className="text-[10px] text-muted-foreground">{fmtMoney(p.budget.spent, p.budget.currency)} spent</p>
                          </div>
                        ) : (
                          <div className="text-right pr-2 text-[11px] text-muted-foreground/40">—</div>
                        )}

                        {/* Link */}
                        <div className="flex justify-center">
                          <button
                            type="button"
                            onClick={() => navigate(`/projects/${p.id}`)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-[#1D3461] hover:bg-[#1D3461]/5 opacity-0 group-hover:opacity-100 transition-all"
                            title="Open project"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ═══════════════ FINANCIAL ═══════════════ */}
          {canSeeFinancials && (
            <TabsContent value="finance" className="mt-4 space-y-5">
              {/* Summary row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Total Portfolio Budget', value: fmtMoney(kpis.totalBudget), icon: DollarSign, color: 'text-[#1D3461]', bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' },
                  { label: 'Total Spent', value: fmtMoney(kpis.totalSpent), icon: TrendingUp, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' },
                  { label: 'Portfolio Burn Rate', value: `${kpis.portfolioBurn}%`, icon: Target, color: kpis.portfolioBurn > 90 ? 'text-red-600' : 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' },
                  { label: 'Over Budget', value: enriched.filter(p => p.burnPct > 100).length, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' },
                ].map(k => (
                  <KpiCard key={k.label} label={k.label} value={k.value} icon={k.icon} color={k.color} bg={`rounded-xl border p-4 ${k.bg}`} />
                ))}
              </div>

              {/* Budget vs Actual bar chart */}
              {budgetChartData.length > 0 ? (
                <SectionHeader icon={BarChart2} title="Budget vs. Spent by Project" subtitle="Top 12 projects by budget">
                  <div className="h-72 mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={budgetChartData} barGap={2} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
                        <Tooltip
                          contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                          formatter={(v: number, name: string) => [`SDG ${v.toLocaleString()}`, name === 'total' ? 'Budget' : 'Spent']}
                          labelFormatter={(l, payload) => payload?.[0]?.payload?.fullName ?? l}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="total" name="Budget" fill="#1D3461" opacity={0.3} radius={[4, 4, 0, 0]} />
                        <Bar dataKey="spent" name="Spent" radius={[4, 4, 0, 0]}>
                          {budgetChartData.map((entry, i) => (
                            <Cell key={i} fill={entry.burn >= 100 ? '#ef4444' : entry.burn >= 80 ? '#f59e0b' : '#10b981'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500 inline-block" />Under 80%</span>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500 inline-block" />80–100%</span>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-500 inline-block" />Over budget</span>
                  </div>
                </SectionHeader>
              ) : (
                <div className="flex items-center justify-center py-12 text-muted-foreground border rounded-xl">
                  <p className="text-sm">No budget data found for active projects</p>
                </div>
              )}

              {/* Top spenders list */}
              {budgetChartData.length > 0 && (
                <SectionHeader icon={TrendingUp} title="Highest Budget Projects" defaultOpen={false}>
                  <div className="space-y-2 mt-3">
                    {budgetChartData.slice(0, 8).map((p, i) => (
                      <div key={i} className="flex items-center gap-3 py-1">
                        <span className="text-[11px] font-bold text-muted-foreground w-4 flex-shrink-0">#{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{p.fullName}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Progress value={p.burn > 100 ? 100 : p.burn} className="h-1.5 flex-1" />
                            <span className={cn('text-[10px] font-bold flex-shrink-0', p.burn >= 100 ? 'text-red-600' : p.burn >= 80 ? 'text-amber-600' : 'text-emerald-600')}>{p.burn}%</span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-[11px] font-semibold">SDG {p.total.toLocaleString()}</p>
                          <p className="text-[10px] text-muted-foreground">{p.spent.toLocaleString()} spent</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionHeader>
              )}
            </TabsContent>
          )}

          {/* ═══════════════ MILESTONES ═══════════════ */}
          <TabsContent value="milestones" className="mt-4 space-y-4">
            {/* Overdue milestones */}
            {overdueMilestonesAll.length > 0 && (
              <SectionHeader icon={AlertTriangle} title={`${overdueMilestonesAll.length} Overdue Milestones`} subtitle="Require immediate attention">
                <div className="space-y-2 mt-3">
                  {overdueMilestonesAll.map(m => (
                    <div key={m.id}
                      className="flex items-start gap-3 p-3 rounded-xl border border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-900/10">
                      <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{m.title}</p>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                          <span className="font-medium text-red-600">{m.daysOverdue}d overdue</span>
                          <span>·</span>
                          <span>{m.projectName}</span>
                          <span className="font-mono text-[10px]">{m.projectCode}</span>
                        </div>
                      </div>
                      <span className="text-[11px] text-red-600 font-medium flex-shrink-0">{fmtDate(m.due_date)}</span>
                      <button
                        type="button"
                        onClick={() => navigate(`/projects/${m.project_id}?tab=milestones`)}
                        className="p-1 rounded text-red-400 hover:text-red-600 flex-shrink-0"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </SectionHeader>
            )}

            {/* Upcoming 30-day milestones */}
            <SectionHeader icon={Calendar} title="Upcoming Milestones — Next 30 Days" subtitle={`${upcomingMilestones.length} milestone${upcomingMilestones.length !== 1 ? 's' : ''} due`}>
              {upcomingMilestones.length === 0 ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <div className="text-center">
                    <Flag className="h-8 w-8 opacity-30 mx-auto mb-2" />
                    <p className="text-sm">No milestones due in the next 30 days</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 mt-3">
                  {upcomingMilestones.map(m => {
                    const urgency = m.daysLeft <= 3 ? 'border-red-200 bg-red-50/50 dark:bg-red-900/10 dark:border-red-800/30'
                      : m.daysLeft <= 7 ? 'border-amber-200 bg-amber-50/50 dark:bg-amber-900/10 dark:border-amber-800/30'
                      : 'border-border bg-card';
                    return (
                      <div key={m.id} className={cn('flex items-center gap-3 p-3 rounded-xl border', urgency)}>
                        <div className={cn(
                          'h-9 w-9 rounded-lg flex flex-col items-center justify-center flex-shrink-0 font-bold',
                          m.daysLeft <= 3 ? 'bg-red-100 text-red-700' : m.daysLeft <= 7 ? 'bg-amber-100 text-amber-700' : 'bg-[#1D3461]/10 text-[#1D3461]',
                        )}>
                          <span className="text-sm leading-none">{m.daysLeft}</span>
                          <span className="text-[8px] leading-none mt-0.5">days</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{m.title}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{m.projectName} <span className="font-mono">{m.projectCode}</span></p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-[11px] font-medium">{fmtDate(m.due_date)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => navigate(`/projects/${m.project_id}?tab=milestones`)}
                          className="p-1 rounded text-muted-foreground hover:text-[#1D3461]"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionHeader>
          </TabsContent>

          {/* ═══════════════ PIPELINE ═══════════════ */}
          <TabsContent value="pipeline" className="mt-4">
            {pipelineGroups.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-muted-foreground border-2 border-dashed rounded-xl gap-3">
                <Zap className="h-10 w-10 opacity-30" />
                <p className="text-sm">No active projects in the pipeline</p>
              </div>
            ) : (
              <div className="overflow-x-auto pb-2">
                <div className="flex gap-3 min-w-max">
                  {pipelineGroups.map((group, gi) => (
                    <div key={gi} className="w-64 flex-shrink-0">
                      <div className="flex items-center gap-2 mb-2 px-1">
                        <div className="h-2 w-2 rounded-full bg-[#1D3461] flex-shrink-0" />
                        <span className="text-xs font-bold text-foreground truncate">{group.stageLabel}</span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-auto flex-shrink-0">{group.projects.length}</Badge>
                      </div>
                      <div className="space-y-2">
                        {group.projects.map(p => {
                          const hCfg = HEALTH_CFG[p.health];
                          return (
                            <div
                              key={p.id}
                              onClick={() => navigate(`/projects/${p.id}`)}
                              className="bg-card border rounded-xl p-3 cursor-pointer hover:shadow-md hover:border-[#1D3461]/30 transition-all group"
                              data-testid={`pipeline-card-${p.id}`}
                            >
                              <div className="flex items-start justify-between gap-1 mb-2">
                                <p className="text-xs font-semibold leading-snug line-clamp-2 flex-1">{p.name}</p>
                                <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 flex-shrink-0 mt-0.5" />
                              </div>
                              <p className="text-[10px] font-mono text-muted-foreground mb-2">{p.project_code}</p>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={cn('inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full', hCfg.bg, hCfg.text)}>
                                  {hCfg.icon}{hCfg.label}
                                </span>
                                <Badge className={cn('text-[9px] px-1.5', STATUS_CFG[p.status]?.color ?? '')}>
                                  {STATUS_CFG[p.status]?.label ?? p.status}
                                </Badge>
                              </div>
                              {canSeeFinancials && p.burnPct > 0 && (
                                <div className="mt-2">
                                  <Progress value={Math.min(p.burnPct, 100)} className="h-1" />
                                  <p className="text-[9px] text-muted-foreground mt-0.5">{p.burnPct}% budget used</p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Stalled swimlane */}
            {enriched.filter(p => p.health === 'stalled').length > 0 && (
              <div className="mt-5">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-2 w-2 rounded-full bg-red-500" />
                  <span className="text-xs font-bold text-red-600">Stalled Projects ({enriched.filter(p => p.health === 'stalled').length})</span>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {enriched.filter(p => p.health === 'stalled').map(p => (
                    <div
                      key={p.id}
                      onClick={() => navigate(`/projects/${p.id}`)}
                      className="w-56 flex-shrink-0 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/40 rounded-xl p-3 cursor-pointer hover:shadow-md transition-all"
                    >
                      <p className="text-xs font-semibold leading-snug line-clamp-2 mb-1">{p.name}</p>
                      <p className="text-[10px] font-mono text-muted-foreground mb-1.5">{p.project_code}</p>
                      <p className="text-[10px] text-red-600 font-medium flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {latestAdvanced[p.id]
                          ? `${differenceInDays(new Date(), parseISO(latestAdvanced[p.id]))}d since last advance`
                          : 'No stage advances recorded'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* ═══════════════ PROJECT MIX ═══════════════ */}
          <TabsContent value="types" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Donut chart */}
              <div className="bg-card border rounded-2xl p-5 shadow-sm">
                <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                  <BarChart2 className="h-4 w-4 text-[#1D3461]" />Active Projects by Type
                </h3>
                {typeDistrib.length === 0 ? (
                  <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">No active projects</div>
                ) : (
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={typeDistrib} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                          {typeDistrib.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Status breakdown */}
              <div className="bg-card border rounded-2xl p-5 shadow-sm">
                <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                  <Users className="h-4 w-4 text-[#1D3461]" />Portfolio Status Breakdown
                </h3>
                <div className="space-y-3">
                  {Object.entries(STATUS_CFG).map(([status, cfg]) => {
                    const count = enriched.filter(p => p.status === status).length;
                    const pct = enriched.length > 0 ? Math.round((count / enriched.length) * 100) : 0;
                    return (
                      <div key={status} className="flex items-center gap-3">
                        <div className={cn('h-2 w-2 rounded-full flex-shrink-0', cfg.dot)} />
                        <span className="text-xs font-medium w-20 flex-shrink-0">{cfg.label}</span>
                        <Progress value={pct} className="h-2 flex-1" />
                        <span className="text-[11px] font-bold text-muted-foreground w-10 text-right flex-shrink-0">{count}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 pt-4 border-t">
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="bg-muted/30 rounded-lg p-2.5 text-center">
                      <p className="text-lg font-bold text-[#1D3461]">{enriched.length}</p>
                      <p className="text-muted-foreground">Total Projects</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-2.5 text-center">
                      <p className="text-lg font-bold text-emerald-600">
                        {enriched.length > 0 ? Math.round((enriched.filter(p => p.status === 'completed').length / enriched.length) * 100) : 0}%
                      </p>
                      <p className="text-muted-foreground">Completion Rate</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Type breakdown table */}
            <div className="bg-card border rounded-2xl p-5 shadow-sm mt-4">
              <h3 className="text-sm font-bold mb-4">Breakdown by Project Type</h3>
              <div className="space-y-2">
                {Object.entries(TYPE_LABELS).map(([type, label]) => {
                  const typeProjects = enriched.filter(p => normaliseProjectType(p.project_type) === type);
                  if (typeProjects.length === 0) return null;
                  const active = typeProjects.filter(p => p.status === 'active').length;
                  const completed = typeProjects.filter(p => p.status === 'completed').length;
                  const stalled = typeProjects.filter(p => p.health === 'stalled').length;
                  return (
                    <div key={type} className="flex items-center gap-3 py-2 border-b last:border-b-0">
                      <span className="text-xs font-medium w-36 flex-shrink-0">{label}</span>
                      <span className="text-xs font-bold w-4">{typeProjects.length}</span>
                      <div className="flex items-center gap-2 flex-wrap">
                        {active > 0 && <Badge className="text-[9px] px-1.5 bg-emerald-100 text-emerald-700">{active} active</Badge>}
                        {completed > 0 && <Badge className="text-[9px] px-1.5 bg-blue-100 text-blue-700">{completed} done</Badge>}
                        {stalled > 0 && <Badge className="text-[9px] px-1.5 bg-red-100 text-red-700">{stalled} stalled</Badge>}
                      </div>
                    </div>
                  );
                }).filter(Boolean)}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
