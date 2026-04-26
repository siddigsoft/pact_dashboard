import { useState, useMemo, useCallback, Component } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area,
} from 'recharts';
import {
  BarChart3, FolderKanban, CheckCircle2, AlertTriangle, XCircle,
  Download, ExternalLink, ArrowUpDown, Filter, TrendingUp, ChevronLeft,
  RefreshCw, Wallet, Target, Clock, ListChecks, Users, Calendar,
  TrendingDown, DollarSign, Activity, Layers, Search, ArrowRight,
} from 'lucide-react';
import { format, parseISO, isValid, differenceInDays, startOfMonth } from 'date-fns';

import { supabase } from '@/integrations/supabase/client';
import { GradientStatCard } from '@/components/ui/gradient-stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { getProjectFlow } from '@/config/projectFlows';
import { normaliseProjectType } from '@/types/project';
import { cn } from '@/lib/utils';

class ChartErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback?: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="h-52 flex items-center justify-center text-xs text-muted-foreground">Chart unavailable</div>
      );
    }
    return this.props.children;
  }
}

const STALL_THRESHOLD_DAYS = 14;

const STATUS_COLORS: Record<string, string> = {
  active: '#16a34a',
  completed: '#1D3461',
  onHold: '#f59e0b',
  draft: '#94a3b8',
  cancelled: '#dc2626',
};

const PALETTE = ['#0F2041','#1D3461','#4f86c6','#34d399','#f59e0b','#a78bfa','#f87171','#38bdf8','#fb923c'];

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
  budget: { total?: number; currency?: string; allocated?: number; remaining?: number; totalBudgetCents?: number; spentBudgetCents?: number } | null;
}

interface FlowLogRow { project_id: string; advanced_at: string; }

interface BudgetRow {
  project_id: string;
  total_budget_cents: number;
  allocated_budget_cents: number;
  spent_budget_cents: number;
  remaining_budget_cents: number;
  status: string;
}

interface FieldTaskRow {
  id: string;
  project_id: string;
  status: string;
  priority: string;
  estimated_hours: number | null;
  actual_hours: number | null;
  estimated_cost: number | null;
  actual_cost: number | null;
  due_date: string | null;
  title: string;
}

interface MilestoneRow {
  id: string;
  project_id: string;
  status: string;
  due_date: string | null;
  title: string;
}

interface QueryFilters { projectId: string; pmFilter: string; startFrom: string; startTo: string; clientType: string; }
interface AnalyticsData { projects: ProjectRow[]; latestAdvancedAt: Record<string, string>; }

async function fetchAnalyticsData(filters: QueryFilters): Promise<AnalyticsData> {
  const { data: allProjects, error: projError } = await supabase.rpc('get_projects_for_analytics');
  if (projError) throw new Error(projError.message);

  let projects = (allProjects ?? []) as ProjectRow[];
  if (filters.projectId !== 'all') projects = projects.filter(p => p.id === filters.projectId);
  if (filters.clientType !== 'all') projects = projects.filter(p => (p.client_type ?? 'internal') === filters.clientType);
  if (filters.pmFilter !== 'all') projects = projects.filter(p => (p.team as any)?.projectManager === filters.pmFilter);
  if (filters.startFrom) projects = projects.filter(p => p.start_date && p.start_date >= filters.startFrom);
  if (filters.startTo) projects = projects.filter(p => p.start_date && p.start_date <= filters.startTo);

  const relevantIds = projects.map(p => p.id);
  let latestAdvancedAt: Record<string, string> = {};
  if (relevantIds.length > 0) {
    const { data: logData } = await supabase
      .from('project_flow_log')
      .select('project_id, advanced_at')
      .in('project_id', relevantIds)
      .order('advanced_at', { ascending: false });
    for (const row of (logData ?? []) as FlowLogRow[]) {
      if (!latestAdvancedAt[row.project_id]) latestAdvancedAt[row.project_id] = row.advanced_at;
    }
  }
  return { projects, latestAdvancedAt };
}

function safeDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  try { const d = parseISO(s); return isValid(d) ? d : null; } catch { return null; }
}

function fmtDate(s: string | null | undefined): string {
  const d = safeDate(s);
  return d ? format(d, 'dd MMM yyyy') : '—';
}

function isAtFinalStage(p: ProjectRow): boolean {
  const flow = getProjectFlow(normaliseProjectType(p.project_type));
  const finalStageId = flow.stages[flow.stages.length - 1]?.id;
  return !!finalStageId && p.current_flow_stage === finalStageId;
}

function fmtMoney(cents: number, currency = 'SDG'): string {
  if (cents >= 1_000_000_000) return `${currency} ${(cents / 1_000_000_000).toFixed(1)}B`;
  if (cents >= 1_000_000) return `${currency} ${(cents / 1_000_000).toFixed(1)}M`;
  if (cents >= 1_000) return `${currency} ${(cents / 1_000).toFixed(0)}K`;
  return `${currency} ${cents.toFixed(0)}`;
}

function getProjectBudgetCents(
  p: ProjectRow,
  budgetMap: Record<string, BudgetRow>,
  actualSpentByProject: Record<string, number> = {},
): { total: number; spent: number; currency: string } {
  // Real disbursements pulled from operational_cost_submissions (per-project).
  // We use Math.max(budget_table_spent, real_disbursements) so the dashboard
  // never under-reports actual spend, even when project_budgets.spent_budget_cents
  // is sparse (the most common case).
  const realSpent = actualSpentByProject[p.id] ?? 0;
  const dbBudget = budgetMap[p.id];
  if (dbBudget) {
    const tableSpent = dbBudget.spent_budget_cents ?? 0;
    return {
      total: dbBudget.total_budget_cents ?? 0,
      spent: Math.max(tableSpent, realSpent),
      currency: 'SDG',
    };
  }
  const jb = p.budget;
  if (jb) {
    if (jb.totalBudgetCents != null) {
      return {
        total: jb.totalBudgetCents,
        spent: Math.max(jb.spentBudgetCents ?? 0, realSpent),
        currency: jb.currency ?? 'SDG',
      };
    }
    if (jb.total != null) {
      return {
        total: (jb.total ?? 0) * 100,
        spent: realSpent,
        currency: jb.currency ?? 'SDG',
      };
    }
  }
  return { total: 0, spent: realSpent, currency: 'SDG' };
}

type SortField = 'name' | 'type' | 'stage' | 'daysSince';
type SortDir = 'asc' | 'desc';
type AnalyticsTab = 'overview' | 'financial' | 'operational' | 'projects';

export default function ProjectAnalytics() {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<AnalyticsTab>('overview');
  const [projectIdFilter, setProjectIdFilter] = useState('all');
  const [clientTypeFilter, setClientTypeFilter] = useState('all');
  const [pmFilter, setPmFilter] = useState('all');
  const [startFrom, setStartFrom] = useState('');
  const [startTo, setStartTo] = useState('');
  const [stallSort, setStallSort] = useState<{ field: SortField; dir: SortDir }>({ field: 'daysSince', dir: 'desc' });
  const [projectSearch, setProjectSearch] = useState('');
  const [projectTableSort, setProjectTableSort] = useState<{ field: string; dir: SortDir }>({ field: 'name', dir: 'asc' });

  const { data: allProjectNames } = useQuery({
    queryKey: ['project_names_list'],
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, name, project_code').order('name');
      return (data ?? []) as { id: string; name: string; project_code: string }[];
    },
    staleTime: 300_000,
    refetchOnWindowFocus: false,
  });

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['project_analytics', projectIdFilter, clientTypeFilter, pmFilter, startFrom, startTo],
    queryFn: () => fetchAnalyticsData({ projectId: projectIdFilter, clientType: clientTypeFilter, pmFilter, startFrom, startTo }),
    staleTime: 300_000,
    gcTime: 600_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const { data: budgetsRaw = [] } = useQuery({
    queryKey: ['project_budgets_analytics'],
    queryFn: async () => {
      const { data } = await supabase
        .from('project_budgets')
        .select('project_id, total_budget_cents, allocated_budget_cents, spent_budget_cents, remaining_budget_cents, status');
      return (data ?? []) as BudgetRow[];
    },
    staleTime: 300_000,
    refetchOnWindowFocus: false,
  });

  const { data: fieldTasksRaw = [] } = useQuery({
    queryKey: ['project_field_tasks_analytics'],
    queryFn: async () => {
      const { data } = await supabase
        .from('project_field_tasks')
        .select('id, project_id, status, priority, estimated_hours, actual_hours, estimated_cost, actual_cost, due_date, title');
      return (data ?? []) as FieldTaskRow[];
    },
    staleTime: 300_000,
    refetchOnWindowFocus: false,
  });

  const { data: milestonesRaw = [] } = useQuery({
    queryKey: ['project_milestones_analytics'],
    queryFn: async () => {
      const { data } = await supabase
        .from('project_milestones')
        .select('id, project_id, status, due_date, title');
      return (data ?? []) as MilestoneRow[];
    },
    staleTime: 300_000,
    refetchOnWindowFocus: false,
  });

  // ── Real disbursements (mirrors PortfolioDashboard formula) ──────────────────
  // Why three tables: project_budgets.spent_budget_cents is sparsely populated
  // in this org's data, so the dashboard would show "Total Spent SDG 0" even
  // when millions had been disbursed. We pull from the actual money-movement
  // tables (op cost submissions, down-payments, site-visit cost submissions)
  // and roll them up into per-project actuals + an org-wide total.
  // Anti-double-count: a paid down-payment that later gets reconciled into a
  // cost submission would otherwise be counted twice. We use Math.max() at
  // the org level so the larger of (down_pays_paid, cost_subs_approved)
  // wins, never the sum. Limit 5000 keeps growth headroom.
  const { data: opCostsRaw = [] } = useQuery({
    queryKey: ['analytics_op_costs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('operational_cost_submissions')
        .select('id, project_id, amount_cents, status, tier1_status, tier2_status')
        .limit(5000);
      return (data ?? []) as Array<{
        id: string;
        project_id: string | null;
        amount_cents: number | null;
        status: string | null;
        tier1_status: string | null;
        tier2_status: string | null;
      }>;
    },
    staleTime: 300_000,
    refetchOnWindowFocus: false,
  });

  // down_payment_requests stores `requested_amount` as NUMERIC (whole units),
  // NOT cents. PortfolioDashboard multiplies by 100 to get cents — we mirror
  // that exactly for consistency. No project_id column on this table, so the
  // total only feeds the org-wide spent KPI, not per-project utilisation.
  const { data: downPaysRaw = [] } = useQuery({
    queryKey: ['analytics_down_pays'],
    queryFn: async () => {
      const { data } = await supabase
        .from('down_payment_requests')
        .select('id, status, requested_amount, supervisor_status, admin_status')
        .limit(5000);
      return (data ?? []) as Array<{
        id: string;
        status: string | null;
        requested_amount: number | null;
        supervisor_status: string | null;
        admin_status: string | null;
      }>;
    },
    staleTime: 300_000,
    refetchOnWindowFocus: false,
  });

  // site_visit_cost_submissions uses `total_cost_cents` (already cents) and is
  // linked via site_visit_id only — no direct project_id. Org-wide aggregate
  // only.
  const { data: costSubsRaw = [] } = useQuery({
    queryKey: ['analytics_cost_subs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('site_visit_cost_submissions')
        .select('id, status, total_cost_cents')
        .limit(5000);
      return (data ?? []) as Array<{
        id: string;
        status: string | null;
        total_cost_cents: number | null;
      }>;
    },
    staleTime: 300_000,
    refetchOnWindowFocus: false,
  });

  const projects = data?.projects ?? [];

  const budgetMap = useMemo(() => {
    const m: Record<string, BudgetRow> = {};
    budgetsRaw.forEach(b => { m[b.project_id] = b; });
    return m;
  }, [budgetsRaw]);

  const activeProjectIds = useMemo(() => new Set(projects.map(p => p.id)), [projects]);

  const fieldTasks = useMemo(() =>
    fieldTasksRaw.filter(t => activeProjectIds.has(t.project_id)),
    [fieldTasksRaw, activeProjectIds]);

  const milestones = useMemo(() =>
    milestonesRaw.filter(m => activeProjectIds.has(m.project_id)),
    [milestonesRaw, activeProjectIds]);

  const stats = useMemo(() => {
    const total = projects.length;
    const active = projects.filter(p => p.status === 'active').length;
    const completed = projects.filter(p => p.status === 'completed').length;
    const onHoldOrCancelled = projects.filter(p => p.status === 'onHold' || p.status === 'cancelled').length;
    const now = new Date();
    const stalled = projects.filter(p => {
      if (p.status === 'completed' || p.status === 'cancelled') return false;
      const lastAdv = data?.latestAdvancedAt[p.id];
      if (!lastAdv) return false;
      const d = safeDate(lastAdv);
      return d ? differenceInDays(now, d) >= STALL_THRESHOLD_DAYS : false;
    }).length;
    return { total, active, completed, onHoldOrCancelled, stalled };
  }, [projects, data]);

  const stageDistribution = useMemo(() => {
    type StageEntry = { label: string; active: number; completed: number; onHold: number; draft: number; cancelled: number };
    const counts: Record<string, StageEntry> = {};
    for (const p of projects) {
      const flow = getProjectFlow(normaliseProjectType(p.project_type));
      const stageId = p.current_flow_stage ?? flow.stages[0]?.id ?? 'unknown';
      const stage = flow.stages.find(s => s.id === stageId);
      const label = stage?.label ?? stageId;
      if (!counts[label]) counts[label] = { label, active: 0, completed: 0, onHold: 0, draft: 0, cancelled: 0 };
      const status = p.status as keyof Omit<StageEntry, 'label'>;
      if (status in counts[label]) counts[label][status] += 1;
      else counts[label].draft += 1;
    }
    return Object.values(counts)
      .sort((a, b) => {
        const tot = (e: StageEntry) => e.active + e.completed + e.onHold + e.draft + e.cancelled;
        return tot(b) - tot(a);
      })
      .slice(0, 15);
  }, [projects]);

  const completionByType = useMemo(() => {
    const byType: Record<string, { label: string; total: number; reachedFinal: number }> = {};
    for (const p of projects) {
      const type = normaliseProjectType(p.project_type);
      const flow = getProjectFlow(type);
      const label = flow.label.replace(' (Legacy)', '');
      if (!byType[type]) byType[type] = { label, total: 0, reachedFinal: 0 };
      byType[type].total += 1;
      if (isAtFinalStage(p) || p.status === 'completed') byType[type].reachedFinal += 1;
    }
    return Object.values(byType)
      .filter(v => v.total > 0)
      .map(v => ({ label: v.label, total: v.total, reachedFinal: v.reachedFinal, rate: v.total > 0 ? Math.round((v.reachedFinal / v.total) * 100) : 0 }))
      .sort((a, b) => b.total - a.total);
  }, [projects]);

  const stalledProjects = useMemo(() => {
    if (!data) return [];
    const now = new Date();
    return projects
      .filter(p => {
        if (p.status === 'completed' || p.status === 'cancelled') return false;
        const lastAdv = data.latestAdvancedAt[p.id];
        if (!lastAdv) return false;
        const d = safeDate(lastAdv);
        return d ? differenceInDays(now, d) >= STALL_THRESHOLD_DAYS : false;
      })
      .map(p => {
        const flow = getProjectFlow(normaliseProjectType(p.project_type));
        const stageId = p.current_flow_stage ?? flow.stages[0]?.id ?? '';
        const stage = flow.stages.find(s => s.id === stageId);
        const lastAdv = data.latestAdvancedAt[p.id];
        const d = safeDate(lastAdv);
        return {
          id: p.id, name: p.name, projectCode: p.project_code,
          type: flow.label.replace(' (Legacy)', ''),
          stageName: stage?.label ?? stageId,
          lastAdvancedAt: lastAdv, daysSince: d ? differenceInDays(now, d) : 0, status: p.status,
        };
      })
      .sort((a, b) => {
        const { field, dir } = stallSort;
        let cmp = 0;
        if (field === 'name') cmp = a.name.localeCompare(b.name);
        else if (field === 'type') cmp = a.type.localeCompare(b.type);
        else if (field === 'stage') cmp = a.stageName.localeCompare(b.stageName);
        else cmp = a.daysSince - b.daysSince;
        return dir === 'asc' ? cmp : -cmp;
      });
  }, [projects, data, stallSort]);

  const uniquePMs = useMemo(() => {
    const names = new Set<string>();
    for (const p of projects) {
      const pm = (p.team as { projectManager?: string } | null)?.projectManager;
      if (pm) names.add(pm);
    }
    return Array.from(names).sort();
  }, [projects]);

  // ── Financial analytics ──────────────────────────────────────────────────────
  // Build a per-project map of actual operational spend so each project's
  // utilisation reflects real disbursements, not the often-empty
  // project_budgets.spent_budget_cents column. Only op_costs has project_id;
  // down_payments and site_visit_cost_submissions don't and feed only the
  // org-wide total below. Filtered by activeProjectIds so when the user
  // applies project / PM / client / date filters, the financial KPIs and the
  // chart all respect the same scope (otherwise the per-project sum and the
  // org-wide total would draw from different datasets and the cards would
  // disagree with the chart bars).
  const opCostsApprovedByProject = useMemo(() => {
    const m: Record<string, number> = {};
    for (const o of opCostsRaw) {
      if (!o.project_id || !activeProjectIds.has(o.project_id)) continue;
      const s = (o.status ?? '').toLowerCase();
      const t1 = (o.tier1_status ?? '').toLowerCase();
      const t2 = (o.tier2_status ?? '').toLowerCase();
      const isApproved = s === 'approved' || s === 'paid' || (t1 === 'approved' && (t2 === 'approved' || t2 === 'paid'));
      if (!isApproved) continue;
      m[o.project_id] = (m[o.project_id] ?? 0) + (o.amount_cents ?? 0);
    }
    return m;
  }, [opCostsRaw, activeProjectIds]);

  const financialStats = useMemo(() => {
    let totalBudget = 0;
    let projectsWithBudget = 0;
    let projectsOverBudgetCount = 0;
    const byProject: { name: string; budget: number; spent: number; util: number }[] = [];
    let perProjectSpentTotal = 0;
    for (const p of projects) {
      const { total, spent } = getProjectBudgetCents(p, budgetMap, opCostsApprovedByProject);
      if (total > 0) {
        totalBudget += total;
        perProjectSpentTotal += spent;
        projectsWithBudget++;
        const util = total > 0 ? Math.round((spent / total) * 100) : 0;
        if (util > 100) projectsOverBudgetCount++;
        byProject.push({
          name: p.project_code ? `[${p.project_code}]` : p.name.slice(0, 20),
          budget: total,
          spent,
          util,
        });
      }
    }

    // Org-wide actual spend — same anti-double-count formula as PortfolioDashboard
    // KPI card: opCosts (always added) + Math.max(downPaysPaid, costSubsApproved)
    // because a down-payment is later reconciled into a cost submission.
    // op_costs are summed from the already-filtered map so the result respects
    // any project / PM / client / date filter the user has applied.
    const opCostsApprovedTotal = Object.values(opCostsApprovedByProject)
      .reduce((sum, v) => sum + v, 0);
    // down_payments and site_visit_cost_submissions don't carry a project_id,
    // so we can only fold them in when the user has not narrowed the view to
    // a subset of projects. With filters active these unscoped buckets get
    // skipped to avoid mixing scopes (a paid down-payment for project A
    // shouldn't inflate the spent KPI when the user is filtered to project B).
    const filtersActive =
      projectIdFilter !== 'all' ||
      clientTypeFilter !== 'all' ||
      pmFilter !== 'all' ||
      startFrom !== '' ||
      startTo !== '';
    const downPaysPaidTotal = filtersActive ? 0 : downPaysRaw
      .filter(dp => {
        const s = (dp.status ?? '').toLowerCase();
        const a = (dp.admin_status ?? '').toLowerCase();
        return s === 'paid' || s === 'approved' || a === 'paid' || a === 'approved';
      })
      .reduce((sum, dp) => sum + (dp.requested_amount ?? 0) * 100, 0);
    const costSubsApprovedTotal = filtersActive ? 0 : costSubsRaw
      .filter(c => { const s = (c.status ?? '').toLowerCase(); return s === 'approved' || s === 'paid'; })
      .reduce((sum, c) => sum + (c.total_cost_cents ?? 0), 0);
    const orgWideActualSpent = opCostsApprovedTotal + Math.max(downPaysPaidTotal, costSubsApprovedTotal);

    // Use the larger of (sum of per-project spends) and (org-wide actuals)
    // so the KPI never under-reports when org-wide cash moves don't carry a
    // project_id (down payments and site-visit cost subs have no FK back to
    // projects in this schema).
    const totalSpent = Math.max(perProjectSpentTotal, orgWideActualSpent);
    const avgUtil = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

    return {
      totalBudget,
      totalSpent,
      remaining: Math.max(0, totalBudget - totalSpent),
      projectsWithBudget,
      overBudget: projectsOverBudgetCount,
      avgUtil,
      byProject: byProject.sort((a, b) => b.budget - a.budget).slice(0, 10),
    };
  }, [projects, budgetMap, opCostsApprovedByProject, opCostsRaw, downPaysRaw, costSubsRaw]);

  // Roll up budget status across ALL filtered projects, not just rows in the
  // sparse `project_budgets` table. Projects without a budget row get bucketed
  // as "No Budget Yet" so the donut shows the real coverage gap instead of
  // misleading "Draft: 2".
  const budgetStatusDist = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of projects) {
      const b = budgetMap[p.id];
      const raw = b?.status ?? null;
      const key = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'No Budget Yet';
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [projects, budgetMap]);

  const projectStartsByMonth = useMemo(() => {
    const m: Record<string, number> = {};
    projects.forEach(p => {
      if (!p.start_date) return;
      const d = safeDate(p.start_date);
      if (!d) return;
      const key = format(startOfMonth(d), 'MMM yyyy');
      m[key] = (m[key] ?? 0) + 1;
    });
    return Object.entries(m).map(([month, count]) => ({ month, count })).slice(-12);
  }, [projects]);

  // ── Operational analytics ────────────────────────────────────────────────────
  // Status helpers are tolerant of multiple spellings because project_field_tasks
  // and personal_tasks each use a different convention ('completed' vs 'done',
  // 'in_progress' vs 'inprogress' vs 'in-progress'). Without these helpers the
  // dashboard counted real tasks as zero — same root cause as the org-wide
  // task health bug fixed in PortfolioDashboard.
  const isTaskDone = (s: string | null | undefined) => {
    const v = (s ?? '').toLowerCase();
    return v === 'completed' || v === 'done' || v === 'closed';
  };
  const isTaskInProgress = (s: string | null | undefined) => {
    const v = (s ?? '').toLowerCase();
    return v === 'in_progress' || v === 'inprogress' || v === 'in-progress' || v === 'doing' || v === 'started';
  };
  const isTaskTodo = (s: string | null | undefined) => {
    const v = (s ?? '').toLowerCase();
    return v === 'todo' || v === 'pending' || v === 'open' || v === 'new' || v === '';
  };

  const taskStats = useMemo(() => {
    const total = fieldTasks.length;
    const completed = fieldTasks.filter(t => isTaskDone(t.status)).length;
    const inProgress = fieldTasks.filter(t => isTaskInProgress(t.status)).length;
    const now = new Date();
    const overdue = fieldTasks.filter(t => {
      if (isTaskDone(t.status)) return false;
      const d = safeDate(t.due_date);
      return d ? d < now : false;
    }).length;
    const todo = fieldTasks.filter(t => isTaskTodo(t.status)).length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    const estHours = fieldTasks.reduce((s, t) => s + (t.estimated_hours ?? 0), 0);
    const actHours = fieldTasks.reduce((s, t) => s + (t.actual_hours ?? 0), 0);
    const estCost = fieldTasks.reduce((s, t) => s + (t.estimated_cost ?? 0), 0);
    const actCost = fieldTasks.reduce((s, t) => s + (t.actual_cost ?? 0), 0);

    return { total, completed, inProgress, overdue, todo, completionRate, estHours, actHours, estCost, actCost };
  }, [fieldTasks]);

  const tasksByPriority = useMemo(() => {
    const m: Record<string, { total: number; completed: number }> = {};
    fieldTasks.forEach(t => {
      const pri = t.priority || 'none';
      if (!m[pri]) m[pri] = { total: 0, completed: 0 };
      m[pri].total++;
      if (t.status === 'completed') m[pri].completed++;
    });
    return Object.entries(m).map(([name, v]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), total: v.total, completed: v.completed }));
  }, [fieldTasks]);

  const tasksByStatus = useMemo(() => {
    const m: Record<string, number> = {};
    fieldTasks.forEach(t => { const k = t.status || 'unknown'; m[k] = (m[k] ?? 0) + 1; });
    return Object.entries(m).map(([name, value], i) => ({ name: name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), value, color: PALETTE[i % PALETTE.length] }));
  }, [fieldTasks]);

  const milestoneStats = useMemo(() => {
    const total = milestones.length;
    const completed = milestones.filter(m => m.status === 'completed').length;
    const now = new Date();
    const overdue = milestones.filter(m => {
      if (m.status === 'completed') return false;
      const d = safeDate(m.due_date);
      return d ? d < now : false;
    }).length;
    const inProgress = milestones.filter(m => m.status === 'in_progress').length;
    const pending = milestones.filter(m => m.status === 'pending').length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, overdue, inProgress, pending, completionRate };
  }, [milestones]);

  const overdueMilestones = useMemo(() => {
    const now = new Date();
    return milestones.filter(m => {
      if (m.status === 'completed') return false;
      const d = safeDate(m.due_date);
      return d ? d < now : false;
    }).map(m => {
      const p = projects.find(pr => pr.id === m.project_id);
      const d = safeDate(m.due_date);
      return { ...m, projectName: p?.name ?? '—', daysOverdue: d ? differenceInDays(now, d) : 0 };
    }).sort((a, b) => b.daysOverdue - a.daysOverdue);
  }, [milestones, projects]);

  const tasksByProject = useMemo(() => {
    const m: Record<string, { name: string; total: number; completed: number }> = {};
    fieldTasks.forEach(t => {
      if (!m[t.project_id]) {
        const p = projects.find(pr => pr.id === t.project_id);
        m[t.project_id] = { name: p?.project_code ? `[${p.project_code}]` : (p?.name?.slice(0, 18) ?? '—'), total: 0, completed: 0 };
      }
      m[t.project_id].total++;
      if (t.status === 'completed') m[t.project_id].completed++;
    });
    return Object.values(m).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [fieldTasks, projects]);

  // ── All Projects table ───────────────────────────────────────────────────────
  const allProjectsTableData = useMemo(() => {
    return projects.map(p => {
      const flow = getProjectFlow(normaliseProjectType(p.project_type));
      const stageId = p.current_flow_stage ?? flow.stages[0]?.id ?? '';
      const stage = flow.stages.find(s => s.id === stageId);
      const { total: budgetCents } = getProjectBudgetCents(p, budgetMap);
      const projectTasks = fieldTasks.filter(t => t.project_id === p.id);
      const projectMilestones = milestones.filter(m => m.project_id === p.id);
      const pm = (p.team as any)?.projectManager ?? '—';
      const start = safeDate(p.start_date);
      const end = safeDate(p.end_date);
      const duration = start && end ? differenceInDays(end, start) : null;
      const lastAdv = data?.latestAdvancedAt[p.id];
      const lastAdvDate = safeDate(lastAdv);
      const daysSinceAdv = lastAdvDate ? differenceInDays(new Date(), lastAdvDate) : null;

      return {
        id: p.id,
        name: p.name,
        code: p.project_code,
        type: flow.label.replace(' (Legacy)', ''),
        status: p.status,
        stageName: stage?.label ?? stageId,
        pm,
        clientName: p.client_name ?? '—',
        clientType: p.client_type ?? 'internal',
        startDate: p.start_date,
        endDate: p.end_date,
        duration,
        budgetCents,
        tasksTotal: projectTasks.length,
        tasksCompleted: projectTasks.filter(t => t.status === 'completed').length,
        milestonesTotal: projectMilestones.length,
        milestonesCompleted: projectMilestones.filter(m => m.status === 'completed').length,
        daysSinceAdv,
      };
    });
  }, [projects, budgetMap, fieldTasks, milestones, data]);

  const filteredProjectsTable = useMemo(() => {
    let list = allProjectsTableData;
    if (projectSearch.trim()) {
      const q = projectSearch.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || (p.code ?? '').toLowerCase().includes(q) || p.pm.toLowerCase().includes(q));
    }
    const { field, dir } = projectTableSort;
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (field === 'name') cmp = a.name.localeCompare(b.name);
      else if (field === 'type') cmp = a.type.localeCompare(b.type);
      else if (field === 'status') cmp = a.status.localeCompare(b.status);
      else if (field === 'pm') cmp = a.pm.localeCompare(b.pm);
      else if (field === 'budget') cmp = a.budgetCents - b.budgetCents;
      else if (field === 'start') cmp = (a.startDate ?? '').localeCompare(b.startDate ?? '');
      else if (field === 'tasks') cmp = a.tasksTotal - b.tasksTotal;
      else if (field === 'milestones') cmp = a.milestonesTotal - b.milestonesTotal;
      return dir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [allProjectsTableData, projectSearch, projectTableSort]);

  const handleSort = useCallback((field: SortField) => {
    setStallSort(prev => ({ field, dir: prev.field === field && prev.dir === 'asc' ? 'desc' : 'asc' }));
  }, []);

  const handleTableSort = useCallback((field: string) => {
    setProjectTableSort(prev => ({ field, dir: prev.field === field && prev.dir === 'asc' ? 'desc' : 'asc' }));
  }, []);

  const downloadCSV = useCallback(() => {
    const rows = projects.map(p => {
      const flow = getProjectFlow(normaliseProjectType(p.project_type));
      const stageId = p.current_flow_stage ?? flow.stages[0]?.id ?? '';
      const stage = flow.stages.find(s => s.id === stageId);
      const pm = (p.team as any)?.projectManager ?? '';
      return [p.project_code, p.name, flow.label.replace(' (Legacy)', ''), p.status, stage?.label ?? '', pm, fmtDate(p.start_date), fmtDate(p.end_date)].join(',');
    });
    const csv = ['Project Code,Name,Type,Status,Stage,PM,Start Date,End Date', ...rows].join('\n');
    const a = Object.assign(document.createElement('a'), { href: 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv), download: 'project-analytics.csv' });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [projects]);

  const hasFilters = projectIdFilter !== 'all' || clientTypeFilter !== 'all' || pmFilter !== 'all' || startFrom !== '' || startTo !== '';
  const activeFilterCount = [projectIdFilter !== 'all', clientTypeFilter !== 'all', pmFilter !== 'all', startFrom !== '', startTo !== ''].filter(Boolean).length;

  const TABS: { id: AnalyticsTab; label: string; icon: typeof BarChart3 }[] = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'financial', label: 'Financial', icon: Wallet },
    { id: 'operational', label: 'Operational', icon: Activity },
    { id: 'projects', label: 'All Projects', icon: FolderKanban },
  ];

  const PageHeader = () => (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center flex-shrink-0 shadow-sm">
          <BarChart3 className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold leading-tight">Project Analytics</h1>
          <p className="text-xs text-muted-foreground">Flow progress, financials and health across all projects</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="h-8 text-xs gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </Button>
        <Button variant="outline" size="sm" onClick={downloadCSV} disabled={projects.length === 0} className="h-8 text-xs gap-1.5">
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </Button>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-3 md:p-4 space-y-4">
        <PageHeader />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-72 bg-muted animate-pulse rounded-xl" />
          <div className="h-72 bg-muted animate-pulse rounded-xl" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-background p-3 md:p-4 space-y-4">
        <PageHeader />
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
            <p className="font-medium text-sm mb-1">Failed to load analytics data</p>
            <p className="text-xs text-muted-foreground mb-4">Please check your connection and try again.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-3 md:p-4 space-y-4">
      <PageHeader />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card px-4 py-3 shadow-sm">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mr-1">
          <Filter className="h-3.5 w-3.5" />
          Filters
          {activeFilterCount > 0 && (
            <span className="bg-[#1D3461] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{activeFilterCount}</span>
          )}
        </div>

        <Select value={projectIdFilter} onValueChange={setProjectIdFilter}>
          <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue placeholder="All Projects" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {(allProjectNames ?? []).map(p => (
              <SelectItem key={p.id} value={p.id}>{p.project_code ? `[${p.project_code}] ${p.name}` : p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={clientTypeFilter} onValueChange={setClientTypeFilter}>
          <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="internal">Internal</SelectItem>
            <SelectItem value="customer">Customer / Donor</SelectItem>
          </SelectContent>
        </Select>

        <Select value={pmFilter} onValueChange={setPmFilter}>
          <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="All PMs" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All PMs</SelectItem>
            {uniquePMs.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">Start from</Label>
          <Input type="date" className="h-8 text-xs w-[140px]" value={startFrom} onChange={e => setStartFrom(e.target.value)} />
        </div>
        <div className="flex items-center gap-1.5">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">to</Label>
          <Input type="date" className="h-8 text-xs w-[140px]" value={startTo} onChange={e => setStartTo(e.target.value)} />
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => { setProjectIdFilter('all'); setClientTypeFilter('all'); setPmFilter('all'); setStartFrom(''); setStartTo(''); }}>
            Clear
          </Button>
        )}

        <div className="ml-auto text-xs text-muted-foreground font-medium">
          {projects.length} project{projects.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap -mb-px',
                activeTab === tab.id
                  ? 'border-[#1D3461] text-[#1D3461] dark:text-blue-300 dark:border-blue-300'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── OVERVIEW TAB ──────────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
            <GradientStatCard title="Total" value={String(stats.total)} subtitle="Filtered projects" icon={<FolderKanban className="h-4 w-4" />} gradient="from-blue-500 to-blue-700" />
            <GradientStatCard title="Active" value={String(stats.active)} subtitle="In progress" icon={<TrendingUp className="h-4 w-4" />} gradient="from-emerald-500 to-emerald-700" />
            <GradientStatCard title="Completed" value={String(stats.completed)} subtitle={`${stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}% rate`} icon={<CheckCircle2 className="h-4 w-4" />} gradient="from-[#0F2041] to-[#1D3461]" />
            <GradientStatCard title="On Hold / Ca..." value={String(stats.onHoldOrCancelled)} subtitle="Inactive" icon={<XCircle className="h-4 w-4" />} gradient="from-amber-500 to-amber-700" />
            <GradientStatCard title="Stalled" value={String(stats.stalled)} subtitle={`No advance ≥${STALL_THRESHOLD_DAYS}d`} icon={<AlertTriangle className="h-4 w-4" />} gradient="from-red-500 to-red-700" />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Stage Distribution</CardTitle>
                <p className="text-xs text-muted-foreground">Projects at each flow stage, coloured by status</p>
              </CardHeader>
              <CardContent>
                <ChartErrorBoundary>
                  {stageDistribution.length === 0 ? (
                    <div className="h-52 flex items-center justify-center text-xs text-muted-foreground">No data</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={stageDistribution} margin={{ top: 4, right: 8, left: -20, bottom: 60 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-40} textAnchor="end" interval={0} />
                        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                        <Tooltip contentStyle={{ fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                        <Bar dataKey="active" stackId="a" fill={STATUS_COLORS.active} name="Active" />
                        <Bar dataKey="completed" stackId="a" fill={STATUS_COLORS.completed} name="Completed" />
                        <Bar dataKey="onHold" stackId="a" fill={STATUS_COLORS.onHold} name="On Hold" />
                        <Bar dataKey="draft" stackId="a" fill={STATUS_COLORS.draft} name="Draft" />
                        <Bar dataKey="cancelled" stackId="a" fill={STATUS_COLORS.cancelled} name="Cancelled" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </ChartErrorBoundary>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Completion Rate by Type</CardTitle>
                <p className="text-xs text-muted-foreground">Completed / final-stage vs. total, per project type</p>
              </CardHeader>
              <CardContent>
                <ChartErrorBoundary>
                  {completionByType.length === 0 ? (
                    <div className="h-52 flex items-center justify-center text-xs text-muted-foreground">No data</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={completionByType} margin={{ top: 4, right: 8, left: -20, bottom: 60 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-40} textAnchor="end" interval={0} />
                        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                        <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: number, name: string) => [v, name === 'reachedFinal' ? 'Completed / Final Stage' : name]} />
                        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                        <Bar dataKey="total" fill="#94a3b8" name="Total" />
                        <Bar dataKey="reachedFinal" fill={STATUS_COLORS.completed} name="Completed / Final Stage" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </ChartErrorBoundary>
              </CardContent>
            </Card>
          </div>

          {/* Project starts by month */}
          {projectStartsByMonth.length > 0 && (
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Project Starts by Month</CardTitle>
                <p className="text-xs text-muted-foreground">Number of projects started each month</p>
              </CardHeader>
              <CardContent>
                <ChartErrorBoundary>
                  <ResponsiveContainer width="100%" height={160}>
                    <AreaChart data={projectStartsByMonth} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip contentStyle={{ fontSize: 11 }} />
                      <Area type="monotone" dataKey="count" fill="#1D3461" stroke="#0F2041" fillOpacity={0.15} name="Projects started" />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartErrorBoundary>
              </CardContent>
            </Card>
          )}

          {/* Stalled projects */}
          <Card className="shadow-sm">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Stalled Projects
                  {stalledProjects.length > 0 && (
                    <Badge variant="destructive" className="text-[10px] h-4 px-1.5">{stalledProjects.length}</Badge>
                  )}
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">No flow stage advancement for ≥{STALL_THRESHOLD_DAYS} days</p>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {stalledProjects.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">No stalled projects</p>
                  <p className="text-xs text-muted-foreground">All active projects have recent flow activity.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {([['name', 'Project'], ['type', 'Type'], ['stage', 'Stage'], ['', 'Last Advanced'], ['daysSince', 'Days Stalled'], ['', '']] as [SortField | '', string][]).map(([field, label]) => (
                          <TableHead key={label} className={cn('py-2 text-xs', field ? 'cursor-pointer hover:text-foreground' : '')} onClick={() => field && handleSort(field)}>
                            <div className="flex items-center gap-1">{label}{field && <ArrowUpDown className="h-3 w-3 text-muted-foreground" />}</div>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stalledProjects.map(p => (
                        <TableRow key={p.id} className="hover:bg-muted/40">
                          <TableCell className="py-2.5">
                            <div className="font-semibold text-sm truncate max-w-[180px]">{p.name}</div>
                            <div className="text-xs text-muted-foreground font-mono">{p.projectCode}</div>
                          </TableCell>
                          <TableCell className="py-2.5 text-xs text-muted-foreground">{p.type}</TableCell>
                          <TableCell className="py-2.5">
                            <Badge variant="outline" className="text-xs" style={{ borderColor: STATUS_COLORS[p.status] ?? '#64748b', color: STATUS_COLORS[p.status] ?? '#64748b', backgroundColor: `${STATUS_COLORS[p.status] ?? '#64748b'}12` }}>
                              {p.stageName}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-2.5 text-xs text-muted-foreground">{fmtDate(p.lastAdvancedAt)}</TableCell>
                          <TableCell className="py-2.5 text-right">
                            <span className={`text-sm font-bold ${p.daysSince >= 30 ? 'text-red-600' : 'text-amber-600'}`}>{p.daysSince}d</span>
                          </TableCell>
                          <TableCell className="py-2.5">
                            <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => navigate(`/projects/${p.id}`)}>
                              <ExternalLink className="h-3 w-3 mr-1" /> View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── FINANCIAL TAB ─────────────────────────────────────────────────────── */}
      {activeTab === 'financial' && (
        <div className="space-y-4">
          {/* Financial KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {[
              { label: 'Total Budget', value: fmtMoney(financialStats.totalBudget), sub: 'across all projects', color: 'text-[#0F2041] dark:text-blue-300', icon: <DollarSign className="h-4 w-4 text-blue-500" /> },
              { label: 'Total Spent', value: fmtMoney(financialStats.totalSpent), sub: 'actual expenditure', color: 'text-emerald-600', icon: <TrendingUp className="h-4 w-4 text-emerald-500" /> },
              { label: 'Remaining', value: fmtMoney(Math.max(0, financialStats.remaining)), sub: 'budget balance', color: 'text-violet-600', icon: <Wallet className="h-4 w-4 text-violet-500" /> },
              { label: 'Avg Utilization', value: `${financialStats.avgUtil}%`, sub: 'budget consumed', color: financialStats.avgUtil > 80 ? 'text-red-600' : financialStats.avgUtil > 60 ? 'text-amber-600' : 'text-emerald-600', icon: <Activity className="h-4 w-4 text-amber-500" /> },
              { label: 'Over Budget', value: String(financialStats.overBudget), sub: 'projects exceeded', color: financialStats.overBudget > 0 ? 'text-red-600' : 'text-emerald-600', icon: <AlertTriangle className="h-4 w-4 text-red-500" /> },
            ].map(k => (
              <Card key={k.label} className="shadow-sm border">
                <CardContent className="p-3 text-center">
                  <div className="flex justify-center mb-1">{k.icon}</div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{k.label}</p>
                  <p className={cn('text-base font-bold mt-0.5 leading-tight', k.color)}>{k.value}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{k.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Budget utilization per project */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Budget vs Spent by Project</CardTitle>
                <p className="text-xs text-muted-foreground">Top 10 projects by budget size (SDG)</p>
              </CardHeader>
              <CardContent>
                <ChartErrorBoundary>
                  {financialStats.byProject.length === 0 ? (
                    <div className="h-52 flex items-center justify-center text-xs text-muted-foreground">No budget data available</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={financialStats.byProject} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => fmtMoney(v)} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={72} />
                        <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: number) => [fmtMoney(v)]} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="budget" fill="#1D3461" name="Budget" radius={[0, 3, 3, 0]} />
                        <Bar dataKey="spent" fill="#34d399" name="Spent" radius={[0, 3, 3, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </ChartErrorBoundary>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Budget Status Distribution</CardTitle>
                <p className="text-xs text-muted-foreground">Budget records by approval status</p>
              </CardHeader>
              <CardContent>
                <ChartErrorBoundary>
                  {budgetStatusDist.length === 0 ? (
                    <div className="h-52 flex items-center justify-center text-xs text-muted-foreground">No budget records</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={budgetStatusDist} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                          {budgetStatusDist.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </ChartErrorBoundary>
              </CardContent>
            </Card>
          </div>

          {/* Budget utilization table */}
          {financialStats.byProject.length > 0 && (
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Budget Utilization Detail</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Project</TableHead>
                        <TableHead className="text-xs text-right">Budget</TableHead>
                        <TableHead className="text-xs text-right">Spent</TableHead>
                        <TableHead className="text-xs text-right">Remaining</TableHead>
                        <TableHead className="text-xs">Utilization</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {financialStats.byProject.map((b, i) => (
                        <TableRow key={i} className="hover:bg-muted/40">
                          <TableCell className="py-2 text-xs font-medium">{b.name}</TableCell>
                          <TableCell className="py-2 text-xs text-right">{fmtMoney(b.budget)}</TableCell>
                          <TableCell className="py-2 text-xs text-right text-emerald-600">{fmtMoney(b.spent)}</TableCell>
                          <TableCell className="py-2 text-xs text-right text-muted-foreground">{fmtMoney(b.budget - b.spent)}</TableCell>
                          <TableCell className="py-2">
                            <div className="flex items-center gap-2">
                              <Progress value={Math.min(b.util, 100)} className="h-1.5 w-20" />
                              <span className={cn('text-xs font-semibold', b.util > 100 ? 'text-red-600' : b.util > 80 ? 'text-amber-600' : 'text-emerald-600')}>{b.util}%</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── OPERATIONAL TAB ───────────────────────────────────────────────────── */}
      {activeTab === 'operational' && (
        <div className="space-y-4">
          {/* Task KPIs */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5"><ListChecks className="h-3.5 w-3.5" />Field Tasks</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              {[
                { label: 'Total Tasks', value: String(taskStats.total), color: 'text-[#0F2041] dark:text-blue-300' },
                { label: 'Completed', value: String(taskStats.completed), color: 'text-emerald-600' },
                { label: 'In Progress', value: String(taskStats.inProgress), color: 'text-blue-600' },
                { label: 'Overdue', value: String(taskStats.overdue), color: taskStats.overdue > 0 ? 'text-red-600' : 'text-emerald-600' },
                { label: 'To Do', value: String(taskStats.todo), color: 'text-muted-foreground' },
                { label: 'Completion', value: `${taskStats.completionRate}%`, color: taskStats.completionRate >= 70 ? 'text-emerald-600' : taskStats.completionRate >= 40 ? 'text-amber-600' : 'text-red-600' },
              ].map(k => (
                <Card key={k.label} className="shadow-sm border">
                  <CardContent className="p-3 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{k.label}</p>
                    <p className={cn('text-lg font-bold mt-0.5', k.color)}>{k.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Task charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Tasks by Status</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartErrorBoundary>
                  {tasksByStatus.length === 0 ? (
                    <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">No task data</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={tasksByStatus} cx="50%" cy="50%" outerRadius={75} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                          {tasksByStatus.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                        <Tooltip contentStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </ChartErrorBoundary>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Tasks by Priority</CardTitle>
                <p className="text-xs text-muted-foreground">Total vs completed per priority level</p>
              </CardHeader>
              <CardContent>
                <ChartErrorBoundary>
                  {tasksByPriority.length === 0 ? (
                    <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">No task data</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={tasksByPriority} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                        <Tooltip contentStyle={{ fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="total" fill="#94a3b8" name="Total" />
                        <Bar dataKey="completed" fill="#16a34a" name="Completed" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </ChartErrorBoundary>
              </CardContent>
            </Card>
          </div>

          {/* Tasks by project */}
          {tasksByProject.length > 0 && (
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Task Completion by Project</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartErrorBoundary>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={tasksByProject} margin={{ top: 4, right: 8, left: -20, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip contentStyle={{ fontSize: 11 }} />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                      <Bar dataKey="total" fill="#94a3b8" name="Total" />
                      <Bar dataKey="completed" fill="#16a34a" name="Completed" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartErrorBoundary>
              </CardContent>
            </Card>
          )}

          {/* Hours & cost summary */}
          {(taskStats.estHours > 0 || taskStats.actHours > 0) && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              {[
                { label: 'Est. Hours', value: taskStats.estHours.toFixed(1) + 'h', color: 'text-blue-600' },
                { label: 'Actual Hours', value: taskStats.actHours.toFixed(1) + 'h', color: taskStats.actHours > taskStats.estHours ? 'text-red-600' : 'text-emerald-600' },
                { label: 'Est. Cost', value: `SDG ${taskStats.estCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, color: 'text-violet-600' },
                { label: 'Actual Cost', value: `SDG ${taskStats.actCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, color: taskStats.actCost > taskStats.estCost ? 'text-red-600' : 'text-emerald-600' },
              ].map(k => (
                <Card key={k.label} className="shadow-sm border">
                  <CardContent className="p-3 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{k.label}</p>
                    <p className={cn('text-base font-bold mt-0.5', k.color)}>{k.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Milestone section */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5"><Target className="h-3.5 w-3.5" />Milestones</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              {[
                { label: 'Total', value: String(milestoneStats.total), color: 'text-[#0F2041] dark:text-blue-300' },
                { label: 'Completed', value: String(milestoneStats.completed), color: 'text-emerald-600' },
                { label: 'In Progress', value: String(milestoneStats.inProgress), color: 'text-blue-600' },
                { label: 'Pending', value: String(milestoneStats.pending), color: 'text-amber-600' },
                { label: 'Overdue', value: String(milestoneStats.overdue), color: milestoneStats.overdue > 0 ? 'text-red-600' : 'text-emerald-600' },
                { label: 'Completion', value: `${milestoneStats.completionRate}%`, color: milestoneStats.completionRate >= 70 ? 'text-emerald-600' : milestoneStats.completionRate >= 40 ? 'text-amber-600' : 'text-red-600' },
              ].map(k => (
                <Card key={k.label} className="shadow-sm border">
                  <CardContent className="p-3 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{k.label}</p>
                    <p className={cn('text-lg font-bold mt-0.5', k.color)}>{k.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Overdue milestones */}
          {overdueMilestones.length > 0 && (
            <Card className="shadow-sm border border-red-200 dark:border-red-900">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-red-700 dark:text-red-400">
                  <AlertTriangle className="h-4 w-4" />
                  Overdue Milestones
                  <Badge variant="destructive" className="text-[10px] h-4 px-1.5">{overdueMilestones.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Milestone</TableHead>
                        <TableHead className="text-xs">Project</TableHead>
                        <TableHead className="text-xs">Due Date</TableHead>
                        <TableHead className="text-xs text-right">Days Overdue</TableHead>
                        <TableHead className="text-xs" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overdueMilestones.slice(0, 15).map(m => (
                        <TableRow key={m.id} className="hover:bg-muted/40">
                          <TableCell className="py-2 text-xs font-medium">{m.title}</TableCell>
                          <TableCell className="py-2 text-xs text-muted-foreground">{m.projectName}</TableCell>
                          <TableCell className="py-2 text-xs text-red-600">{fmtDate(m.due_date)}</TableCell>
                          <TableCell className="py-2 text-right">
                            <span className="text-xs font-bold text-red-600">{m.daysOverdue}d</span>
                          </TableCell>
                          <TableCell className="py-2">
                            <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => navigate(`/projects/${m.project_id}`)}>
                              <ArrowRight className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── ALL PROJECTS TAB ──────────────────────────────────────────────────── */}
      {activeTab === 'projects' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search projects, PM…"
                value={projectSearch}
                onChange={e => setProjectSearch(e.target.value)}
                className="h-8 pl-8 text-xs w-56"
              />
            </div>
            <span className="text-xs text-muted-foreground ml-auto">{filteredProjectsTable.length} projects</span>
          </div>

          <Card className="shadow-sm">
            <CardContent className="pt-0 px-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      {[
                        { field: 'name', label: 'Project' },
                        { field: 'type', label: 'Type' },
                        { field: 'status', label: 'Status' },
                        { field: '', label: 'Stage' },
                        { field: 'pm', label: 'PM' },
                        { field: 'start', label: 'Start' },
                        { field: '', label: 'End' },
                        { field: 'budget', label: 'Budget' },
                        { field: 'tasks', label: 'Tasks' },
                        { field: 'milestones', label: 'Milestones' },
                        { field: '', label: '' },
                      ].map(({ field, label }) => (
                        <TableHead
                          key={label + field}
                          className={cn('text-xs py-2.5 whitespace-nowrap', field ? 'cursor-pointer hover:text-foreground' : '')}
                          onClick={() => field && handleTableSort(field)}
                        >
                          <div className="flex items-center gap-1">
                            {label}
                            {field && <ArrowUpDown className="h-3 w-3 text-muted-foreground" />}
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProjectsTable.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center py-12 text-xs text-muted-foreground">
                          No projects match the current filters
                        </TableCell>
                      </TableRow>
                    ) : filteredProjectsTable.map(p => (
                      <TableRow key={p.id} className="hover:bg-muted/30">
                        <TableCell className="py-2.5">
                          <div className="font-semibold text-sm max-w-[160px] truncate" title={p.name}>{p.name}</div>
                          {p.code && <div className="text-[10px] text-muted-foreground font-mono">{p.code}</div>}
                        </TableCell>
                        <TableCell className="py-2.5 text-xs text-muted-foreground max-w-[120px] truncate">{p.type}</TableCell>
                        <TableCell className="py-2.5">
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5 capitalize" style={{ borderColor: STATUS_COLORS[p.status] ?? '#64748b', color: STATUS_COLORS[p.status] ?? '#64748b', backgroundColor: `${STATUS_COLORS[p.status] ?? '#64748b'}15` }}>
                            {p.status.replace(/([A-Z])/g, ' $1')}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2.5 text-xs text-muted-foreground max-w-[100px] truncate">{p.stageName}</TableCell>
                        <TableCell className="py-2.5 text-xs">{p.pm}</TableCell>
                        <TableCell className="py-2.5 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(p.startDate)}</TableCell>
                        <TableCell className="py-2.5 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(p.endDate)}</TableCell>
                        <TableCell className="py-2.5 text-xs font-medium">
                          {p.budgetCents > 0 ? fmtMoney(p.budgetCents) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="py-2.5">
                          {p.tasksTotal > 0 ? (
                            <div className="flex items-center gap-1.5">
                              <Progress value={p.tasksTotal > 0 ? Math.round((p.tasksCompleted / p.tasksTotal) * 100) : 0} className="h-1.5 w-12" />
                              <span className="text-xs text-muted-foreground">{p.tasksCompleted}/{p.tasksTotal}</span>
                            </div>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="py-2.5">
                          {p.milestonesTotal > 0 ? (
                            <div className="flex items-center gap-1.5">
                              <Progress value={p.milestonesTotal > 0 ? Math.round((p.milestonesCompleted / p.milestonesTotal) * 100) : 0} className="h-1.5 w-12" />
                              <span className="text-xs text-muted-foreground">{p.milestonesCompleted}/{p.milestonesTotal}</span>
                            </div>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="py-2.5">
                          <Button variant="ghost" size="sm" className="h-7 text-xs px-2 hover:bg-[#1D3461]/10 hover:text-[#1D3461]" onClick={() => navigate(`/projects/${p.id}`)}>
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
