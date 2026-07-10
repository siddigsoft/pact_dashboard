import { useEffect, useState, useMemo, useRef } from 'react';
import {
  format, getISOWeek, startOfISOWeek, endOfISOWeek,
  parseISO, isValid, subWeeks, differenceInDays,
} from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Project } from '@/types/project';
import { getEffectiveStages, getProjectStageProgress } from '@/config/projectFlows';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, LabelList,
  BarChart, Bar,
} from 'recharts';
import {
  Target, AlertTriangle, CheckCircle, TrendingUp, Clock3,
  ShieldAlert, Headphones, Users, ClipboardList, CalendarClock,
  RefreshCw, CalendarCheck, ShieldCheck, Wallet, Printer,
  Activity, ChevronDown, ChevronUp, Milestone, TriangleAlert,
  Layers, Link2, CheckSquare, Square, GitBranch, ExternalLink,
  Briefcase, MapPin, DollarSign, Calendar,
} from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────────────────── */
interface Risk {
  id: string; title: string; category: string; risk_score: number;
  status: string; owner_id: string | null; mitigation_plan: string | null;
  contingency_plan: string | null; due_date: string | null; updated_at: string;
}
interface MilestoneLite { id: string; title: string; status: string; due_date: string | null; }
interface MmpLite { id: string; name?: string; status?: string; }
interface CrmOppty { id: string; title: string; stage: string; value_usd: number | null; expected_close_date: string | null; }

interface Props {
  project: Project;
  currentFlowStageId?: string;
}

/* ─── Helpers ────────────────────────────────────────────────────────── */
function getRiskMeta(score: number) {
  if (score >= 17) return { label: 'Critical', color: 'text-red-600 dark:text-red-400',      bg: 'bg-red-50 dark:bg-red-950/30',    dot: 'bg-red-500' };
  if (score >= 10) return { label: 'High',     color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/30', dot: 'bg-orange-500' };
  if (score >= 5)  return { label: 'Medium',   color: 'text-amber-600 dark:text-amber-400',   bg: 'bg-amber-50 dark:bg-amber-950/30',   dot: 'bg-amber-500' };
  return              { label: 'Low',      color: 'text-green-600 dark:text-green-400',   bg: 'bg-green-50 dark:bg-green-950/30',   dot: 'bg-green-500' };
}
const STATUS_META: Record<string, { label: string; color: string }> = {
  draft:     { label: 'Draft',     color: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200' },
  active:    { label: 'Active',    color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300' },
  onHold:    { label: 'On Hold',   color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300' },
  completed: { label: 'Completed', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' },
};
const FOLLOW_UP_LABELS: Record<string, string> = {
  open: 'In Progress', mitigated: 'Mitigated', accepted: 'Accepted', closed: 'Resolved',
};
const CRM_STAGE_META: Record<string, { label: string; color: string }> = {
  prospect:    { label: 'Prospect',    color: 'text-slate-600 dark:text-slate-400' },
  proposal:    { label: 'Proposal',    color: 'text-blue-600 dark:text-blue-400' },
  negotiation: { label: 'Negotiation', color: 'text-amber-600 dark:text-amber-400' },
  won:         { label: 'Won ✓',       color: 'text-emerald-600 dark:text-emerald-400' },
  lost:        { label: 'Lost',        color: 'text-red-600 dark:text-red-400' },
};
function healthLabel(score: number) {
  if (score >= 80) return { label: 'Excellent', color: 'bg-emerald-500 text-white' };
  if (score >= 65) return { label: 'Good',      color: 'bg-indigo-500 text-white' };
  if (score >= 45) return { label: 'Fair',      color: 'bg-amber-500 text-white' };
  if (score >= 25) return { label: 'At Risk',   color: 'bg-orange-500 text-white' };
  return                   { label: 'Critical', color: 'bg-red-600 text-white' };
}
function safeParseISO(s: string | null | undefined): Date | null {
  if (!s) return null;
  try { const d = parseISO(s); return isValid(d) ? d : null; } catch { return null; }
}

/* ─── Component ──────────────────────────────────────────────────────── */
export function ProjectWeeklyDashboard({ project, currentFlowStageId }: Props) {
  const navigate = useNavigate();

  const [risks, setRisks]       = useState<Risk[]>([]);
  const [milestones, setMilestones] = useState<MilestoneLite[]>([]);
  const [mmps, setMmps]         = useState<MmpLite[]>([]);
  const [crmOppty, setCrmOppty] = useState<CrmOppty | null>(null);
  const [loading, setLoading]   = useState(true);

  const [showAllRisks, setShowAllRisks]   = useState(false);
  const [showGantt, setShowGantt]         = useState(true);
  const [includeSubActs, setIncludeSubActs] = useState(false);
  const dashRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const relatedMMPs = (project as any).relatedMMPs ?? [];
    const crmId = (project as any).crmOpportunityId;
    Promise.all([
      supabase.from('project_risks')
        .select('id,title,category,risk_score,status,owner_id,mitigation_plan,contingency_plan,due_date,updated_at')
        .eq('project_id', project.id).order('risk_score', { ascending: false }),
      supabase.from('project_milestones')
        .select('id,title,status,due_date')
        .eq('project_id', project.id).order('due_date', { ascending: true, nullsFirst: false }),
      relatedMMPs.length > 0
        ? supabase.from('mmp_files').select('id,name,status').in('id', relatedMMPs.slice(0, 50))
        : Promise.resolve({ data: [] }),
      crmId
        ? supabase.from('crm_opportunities').select('id,title,stage,value_usd,expected_close_date').eq('id', crmId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]).then(([r, m, mmpRes, crmRes]) => {
      if (!alive) return;
      setRisks((r.data || []) as Risk[]);
      setMilestones((m.data || []) as MilestoneLite[]);
      setMmps((mmpRes.data || []) as MmpLite[]);
      setCrmOppty(crmRes.data as CrmOppty | null);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [project.id]);

  const now = useMemo(() => new Date(), []);

  /* Period */
  const weekNumber  = getISOWeek(now);
  const weekStart   = startOfISOWeek(now);
  const weekEnd     = endOfISOWeek(now);
  const periodLabel = `Week ${weekNumber}`;
  const periodRange = `${format(weekStart, 'd MMM')} – ${format(weekEnd, 'd MMM yyyy')}`;

  /* Days remaining */
  const daysRemaining = useMemo(() => {
    const e = safeParseISO(project.endDate);
    return e ? differenceInDays(e, now) : null;
  }, [project.endDate, now]);

  /* Activities */
  const activities     = project.activities || [];
  const totalActs      = activities.length;
  const completedActs  = activities.filter((a: any) => a.status === 'completed').length;
  const inProgressActs = activities.filter((a: any) => a.status === 'inProgress').length;
  const allSubActs     = activities.flatMap((a: any) => a.subActivities || []);
  const completedSubActs  = allSubActs.filter((s: any) => s.status === 'completed').length;
  const inProgressSubActs = allSubActs.filter((s: any) => s.status === 'inProgress').length;
  const totalCount      = includeSubActs ? totalActs + allSubActs.length : totalActs;
  const completedCount  = includeSubActs ? completedActs + completedSubActs : completedActs;
  const inProgressCount = includeSubActs ? inProgressActs + inProgressSubActs : inProgressActs;
  const notStartedCount = Math.max(totalCount - completedCount - inProgressCount, 0);
  const overallProgress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const pct = (n: number) => totalCount > 0 ? Math.round((n / totalCount) * 100) : 0;

  const overdueActs = activities.filter((a: any) => {
    if (a.status === 'completed' || a.status === 'cancelled') return false;
    const e = safeParseISO(a.endDate); return e ? e < now : false;
  }).length;
  const thisWeekDue = activities.filter((a: any) => {
    if (a.status === 'completed' || a.status === 'cancelled') return false;
    const e = safeParseISO(a.endDate); return e ? e >= weekStart && e <= weekEnd : false;
  }).length;

  /* Milestones */
  const totalMilestones     = milestones.length;
  const completedMilestones = milestones.filter(m => m.status === 'completed').length;
  const milestonePercent    = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;
  const nextMilestone = milestones.find(m => m.status !== 'completed' && m.due_date) ?? null;
  const nextMilestoneDays = nextMilestone?.due_date
    ? (() => { const e = safeParseISO(nextMilestone.due_date); return e ? differenceInDays(e, now) : null; })() : null;

  /* Risks */
  const openRisks   = risks.filter(r => r.status === 'open');
  const topRisk     = openRisks[0] ?? null;
  const topRiskMeta = topRisk ? getRiskMeta(topRisk.risk_score)
    : { label: 'None', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-950/30', dot: 'bg-green-500' };

  /* Budget */
  const budget          = (project as any).budget ?? null;
  const budgetTotal     = budget?.total ?? 0;
  const budgetAllocated = budget?.allocated ?? 0;
  const budgetCurrency  = budget?.currency ?? 'USD';
  const budgetRemaining = budget?.remaining ?? (budgetTotal - budgetAllocated);
  const budgetUsedPct   = budgetTotal > 0 ? Math.round((budgetAllocated / budgetTotal) * 100) : 0;

  /* Team */
  const teamComposition: any[] = (project as any).team?.teamComposition ?? [];
  const teamMembers: string[]  = (project as any).team?.members ?? [];
  const teamCount = teamComposition.length || teamMembers.length;
  const workloadData = useMemo(() =>
    teamComposition
      .filter(m => m.name && (m.workload ?? 0) > 0)
      .map(m => ({ name: m.name.split(' ')[0], workload: m.workload }))
      .sort((a, b) => b.workload - a.workload)
      .slice(0, 8),
  [teamComposition]);

  /* Deliverables */
  const deliverablesState: Record<string, boolean> = (project as any).team?.deliverablesState ?? {};
  const deliverableEntries = Object.entries(deliverablesState);
  const deliverablesDone   = deliverableEntries.filter(([, v]) => v).length;

  /* Stage pipeline */
  const resolvedFlowStageId = currentFlowStageId ?? project.currentFlowStage;
  const effectiveStages = useMemo(() =>
    getEffectiveStages(project.projectType ?? 'tpm', (project as any).customFlowStages ?? null),
  [project.projectType, project.customFlowStages]);
  const stageProgress = useMemo(() =>
    getProjectStageProgress(project.projectType ?? 'tpm', resolvedFlowStageId, (project as any).customFlowStages ?? null),
  [project.projectType, resolvedFlowStageId, project.customFlowStages]);
  const currentStageIdx = stageProgress?.stageIdx ?? 0;

  /* Health score */
  const healthScore = useMemo(() => {
    const actScore  = totalCount > 0 ? (completedCount / totalCount) * 40 : 20;
    const riskScore = openRisks.length === 0 ? 30 : Math.max(0, 30 - openRisks.length * 5);
    const msScore   = totalMilestones > 0 ? (completedMilestones / totalMilestones) * 30 : 15;
    return Math.min(100, Math.round(actScore + riskScore + msScore));
  }, [totalCount, completedCount, openRisks.length, totalMilestones, completedMilestones]);
  const health = healthLabel(healthScore);

  /* Progress over time */
  const progressOverTime = useMemo(() =>
    Array.from({ length: 6 }, (_, i) => {
      const ref  = subWeeks(now, 5 - i);
      const wEnd = endOfISOWeek(ref);
      const wNum = getISOWeek(ref);
      const done = activities.filter((a: any) => {
        if (a.status !== 'completed') return false;
        const d = safeParseISO(a.endDate || a.updatedAt);
        return d ? d <= wEnd : true;
      }).length;
      return { week: `W${wNum}`, progress: totalActs > 0 ? Math.round((done / totalActs) * 100) : 0 };
    }),
  [activities, totalActs, now]);

  /* Gantt */
  const ganttScale = useMemo(() => {
    const dates: Date[] = [];
    activities.forEach((a: any) => {
      const s = safeParseISO(a.startDate); const e = safeParseISO(a.endDate);
      if (s) dates.push(s); if (e) dates.push(e);
    });
    const ps = safeParseISO(project.startDate); const pe = safeParseISO(project.endDate);
    if (ps) dates.push(ps); if (pe) dates.push(pe);
    if (dates.length < 2) return null;
    const min = dates.reduce((a, b) => a < b ? a : b);
    const max = dates.reduce((a, b) => a > b ? a : b);
    return { min, max, span: Math.max(differenceInDays(max, min), 1) };
  }, [activities, project.startDate, project.endDate]);

  /* Donut */
  const donutData = [
    { name: 'Completed',   value: completedCount,  color: '#6366f1' },
    { name: 'In Progress', value: inProgressCount,  color: '#8b5cf6' },
    { name: 'Not Started', value: notStartedCount,  color: '#cbd5e1' },
  ].filter(d => d.value > 0);

  const gradId       = `pgGrad-${project.id}`;
  const statusMeta   = STATUS_META[project.status ?? ''] ?? STATUS_META['draft'];
  const relatedMMPs: string[]        = (project as any).relatedMMPs ?? [];
  const relatedSiteVisits: string[]  = (project as any).relatedSiteVisits ?? [];
  const hasLinkedSystems = relatedMMPs.length > 0 || relatedSiteVisits.length > 0 || !!crmOppty;
  const hasTeamData      = workloadData.length > 0;
  const hasDeliverables  = deliverableEntries.length > 0;
  const showBottomRow    = hasTeamData || hasDeliverables || hasLinkedSystems;

  /* ── Skeleton ── */
  if (loading) {
    return (
      <div className="rounded-xl border bg-card p-4 animate-pulse space-y-3">
        <div className="h-8 bg-[#0F2041]/20 rounded-lg w-full" />
        <div className="grid grid-cols-5 gap-2">{[0,1,2,3,4].map(i => <div key={i} className="h-14 bg-muted rounded-lg" />)}</div>
        <div className="h-16 bg-muted rounded-lg" />
        <div className="grid grid-cols-3 gap-3">{[0,1,2].map(i => <div key={i} className="h-40 bg-muted rounded-lg" />)}</div>
      </div>
    );
  }

  /* ── Collapsible section header ── */
  const CollapseHeader = ({ icon, label, count, open, onToggle, accent = 'text-muted-foreground' }:
    { icon: React.ReactNode; label: string; count?: string; open: boolean; onToggle: () => void; accent?: string }) => (
    <button onClick={onToggle}
      className="w-full flex items-center gap-2 px-3 py-2 bg-muted/40 hover:bg-muted/60 transition-colors border-b text-left">
      <span className={accent}>{icon}</span>
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
      {count && <Badge variant="outline" className="ml-1 text-[9px] px-1.5 py-0">{count}</Badge>}
      {open
        ? <ChevronUp className="h-3.5 w-3.5 ml-auto text-muted-foreground" />
        : <ChevronDown className="h-3.5 w-3.5 ml-auto text-muted-foreground" />}
    </button>
  );

  return (
    <div ref={dashRef} className="rounded-xl border bg-card shadow-sm overflow-hidden print:shadow-none"
      data-testid="project-weekly-dashboard">

      {/* ═══════════════════════════════════════════════════════════════════
          A. HEADER BAR
          ═════════════════════════════════════════════════════════════════ */}
      <div className="bg-[#0F2041] px-4 py-2.5 flex items-center gap-2 flex-wrap">
        <TrendingUp className="h-4 w-4 text-indigo-300 flex-shrink-0" />
        <span className="text-white font-semibold text-sm">Weekly Project Dashboard</span>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${statusMeta.color}`}>
          {statusMeta.label}
        </span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${health.color}`}>
          ● {healthScore}/100 · {health.label}
        </span>
        <span className="text-white/50 text-xs hidden sm:block ml-auto">
          {periodLabel} · {periodRange}
        </span>
        <Button size="sm" variant="ghost" onClick={() => window.print()}
          className="h-6 px-2 text-white/70 hover:text-white hover:bg-white/10 print:hidden"
          data-testid="dashboard-print-btn">
          <Printer className="h-3.5 w-3.5 mr-1" /><span className="text-xs">Export</span>
        </Button>
      </div>

      <div className="p-4 space-y-4">

        {/* ═══════════════════════════════════════════════════════════════
            B. 5 KPI PILLS — one compact horizontal row
            ═════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {/* Progress */}
          <div className="rounded-lg border bg-indigo-50 dark:bg-indigo-950/30 border-indigo-100 dark:border-indigo-900 px-3 py-2 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-indigo-500 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Progress</p>
              <p className="text-base font-bold text-indigo-600 dark:text-indigo-400 leading-none">{overallProgress}%</p>
              {totalCount > 0 && <p className="text-[9px] text-muted-foreground">{completedCount}/{totalCount} tasks</p>}
            </div>
          </div>
          {/* Milestones */}
          <div className={`rounded-lg border px-3 py-2 flex items-center gap-2 ${
            (totalMilestones - completedMilestones) > 0
              ? 'bg-violet-50 dark:bg-violet-950/30 border-violet-100 dark:border-violet-900'
              : 'bg-muted/30'}`}>
            <Target className={`h-4 w-4 flex-shrink-0 ${(totalMilestones - completedMilestones) > 0 ? 'text-violet-500' : 'text-muted-foreground'}`} />
            <div className="min-w-0">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Milestones</p>
              <p className={`text-base font-bold leading-none ${(totalMilestones - completedMilestones) > 0 ? 'text-violet-600 dark:text-violet-400' : ''}`}>
                {completedMilestones}/{totalMilestones}
              </p>
              {nextMilestone && nextMilestoneDays !== null && (
                <p className={`text-[9px] ${nextMilestoneDays < 0 ? 'text-red-500' : nextMilestoneDays <= 7 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                  next in {Math.abs(nextMilestoneDays)}d
                </p>
              )}
            </div>
          </div>
          {/* Days remaining */}
          <div className={`rounded-lg border px-3 py-2 flex items-center gap-2 ${
            daysRemaining !== null && daysRemaining < 0 ? 'bg-red-50 dark:bg-red-950/30 border-red-100 dark:border-red-900' :
            daysRemaining !== null && daysRemaining <= 14 ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900' :
            'bg-muted/30'}`}>
            <Calendar className={`h-4 w-4 flex-shrink-0 ${
              daysRemaining !== null && daysRemaining < 0 ? 'text-red-500' :
              daysRemaining !== null && daysRemaining <= 14 ? 'text-amber-500' : 'text-muted-foreground'}`} />
            <div className="min-w-0">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wide">
                {daysRemaining !== null && daysRemaining < 0 ? 'Overdue' : 'Days Left'}
              </p>
              <p className={`text-base font-bold leading-none ${
                daysRemaining !== null && daysRemaining < 0 ? 'text-red-600 dark:text-red-400' :
                daysRemaining !== null && daysRemaining <= 14 ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                {daysRemaining !== null ? Math.abs(daysRemaining) : '—'}
              </p>
              {project.endDate && <p className="text-[9px] text-muted-foreground">{format(parseISO(project.endDate), 'd MMM yy')}</p>}
            </div>
          </div>
          {/* Budget */}
          <div className={`rounded-lg border px-3 py-2 flex items-center gap-2 ${
            budgetUsedPct > 90 ? 'bg-red-50 dark:bg-red-950/30 border-red-100 dark:border-red-900' :
            budgetUsedPct > 75 ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900' :
            'bg-muted/30'}`}>
            <Wallet className={`h-4 w-4 flex-shrink-0 ${budgetUsedPct > 90 ? 'text-red-500' : budgetUsedPct > 75 ? 'text-amber-500' : 'text-muted-foreground'}`} />
            <div className="min-w-0">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Budget Used</p>
              <p className={`text-base font-bold leading-none ${
                budgetUsedPct > 90 ? 'text-red-600 dark:text-red-400' :
                budgetUsedPct > 75 ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                {budgetTotal > 0 ? `${budgetUsedPct}%` : '—'}
              </p>
              {budgetTotal > 0 && <p className="text-[9px] text-muted-foreground truncate">{budgetCurrency} {budgetTotal.toLocaleString()}</p>}
            </div>
          </div>
          {/* Open risks */}
          <div className={`rounded-lg border px-3 py-2 flex items-center gap-2 ${
            openRisks.length > 0 ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-100 dark:border-orange-900' : 'bg-muted/30'}`}>
            <ShieldAlert className={`h-4 w-4 flex-shrink-0 ${openRisks.length > 0 ? 'text-orange-500' : 'text-muted-foreground'}`} />
            <div className="min-w-0">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Open Risks</p>
              <p className={`text-base font-bold leading-none ${openRisks.length > 0 ? 'text-orange-600 dark:text-orange-400' : ''}`}>
                {openRisks.length}
              </p>
              <p className={`text-[9px] ${topRiskMeta.color}`}>{topRiskMeta.label}</p>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            C. STAGE PIPELINE — full width
            ═════════════════════════════════════════════════════════════ */}
        {effectiveStages.length > 0 && (
          <div className="rounded-lg border overflow-hidden">
            <div className="bg-muted/40 px-3 py-2 border-b flex items-center gap-2">
              <GitBranch className="h-3.5 w-3.5 text-indigo-500" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Stage Pipeline</span>
              {stageProgress && (
                <>
                  <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 ml-1">
                    {stageProgress.stageName}
                  </span>
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    Stage {stageProgress.stageIdx + 1}/{stageProgress.totalStages} · {stageProgress.pct}% complete
                  </span>
                </>
              )}
            </div>
            <div className="px-3 py-3 overflow-x-auto">
              <div className="flex items-center gap-1 min-w-max">
                {effectiveStages.map((stage, idx) => {
                  const isPast    = idx < currentStageIdx;
                  const isCurrent = idx === currentStageIdx;
                  return (
                    <div key={stage.id} className="flex items-center">
                      <div className={`flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg border text-center
                        min-w-[84px] max-w-[104px] transition-all ${
                          isCurrent ? 'bg-indigo-600 border-indigo-700 text-white shadow scale-105 z-10' :
                          isPast    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400' :
                          'bg-muted/20 border-muted text-muted-foreground'}`}>
                        <span className="text-[8px] font-bold">
                          {isPast ? '✓' : isCurrent ? '▶' : String(idx + 1)}
                        </span>
                        <span className="text-[10px] font-medium leading-tight line-clamp-2">{stage.label}</span>
                      </div>
                      {idx < effectiveStages.length - 1 && (
                        <div className={`h-px w-3 flex-shrink-0 ${
                          isPast || isCurrent ? 'bg-emerald-400' : 'bg-border'}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            D. 3-COLUMN ROW — Activities · Progress Chart · Budget+Milestones
            ═════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

          {/* D1. Activity breakdown + stats */}
          <Card className="border bg-muted/20">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted-foreground">Activities</p>
                {allSubActs.length > 0 && (
                  <button onClick={() => setIncludeSubActs(p => !p)}
                    className="flex items-center gap-0.5 text-[9px] text-indigo-500 border border-indigo-200 dark:border-indigo-800 rounded px-1.5 py-0.5"
                    data-testid="include-sub-toggle">
                    <Layers className="h-2.5 w-2.5 mr-0.5" />
                    {includeSubActs ? 'w/ Sub-tasks' : 'Top-level'}
                  </button>
                )}
              </div>
              {totalCount === 0 ? (
                <div className="flex flex-col items-center py-6 text-muted-foreground gap-1">
                  <CheckCircle className="h-8 w-8 text-slate-200 dark:text-slate-700" />
                  <p className="text-xs">No activities yet</p>
                </div>
              ) : (
                <>
                  {/* Donut */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="relative h-[80px] w-[80px] flex-shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={donutData} innerRadius="60%" outerRadius="80%"
                            dataKey="value" strokeWidth={0} startAngle={90} endAngle={-270}>
                            {donutData.map((e, i) => <Cell key={i} fill={e.color} />)}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-lg font-bold leading-none">{overallProgress}%</span>
                        <span className="text-[8px] text-muted-foreground">done</span>
                      </div>
                    </div>
                    <div className="space-y-1.5 flex-1 text-xs">
                      {[
                        { label: 'Completed',   n: completedCount,  color: 'bg-indigo-500' },
                        { label: 'In Progress', n: inProgressCount, color: 'bg-violet-500' },
                        { label: 'Not Started', n: notStartedCount, color: 'bg-slate-300 dark:bg-slate-600' },
                      ].map(row => (
                        <div key={row.label} className="flex items-center gap-1.5">
                          <span className={`h-2 w-2 rounded-full flex-shrink-0 ${row.color}`} />
                          <span className="text-muted-foreground flex-1 text-[10px]">{row.label}</span>
                          <span className="font-semibold text-[10px]">{pct(row.n)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Activity stats — 3 mini pills */}
                  <div className="grid grid-cols-3 gap-1.5 border-t pt-2">
                    {[
                      { icon: <TriangleAlert className="h-3 w-3" />, value: overdueActs,   label: 'Overdue',
                        cls: overdueActs > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground' },
                      { icon: <CalendarClock className="h-3 w-3" />, value: thisWeekDue,  label: 'This week',
                        cls: thisWeekDue > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground' },
                      { icon: <Activity className="h-3 w-3" />,      value: completedActs, label: 'Done',
                        cls: 'text-emerald-600 dark:text-emerald-400' },
                    ].map(s => (
                      <div key={s.label} className="flex flex-col items-center py-1 rounded-md bg-muted/30">
                        <span className={s.cls}>{s.icon}</span>
                        <span className={`text-sm font-bold leading-none mt-0.5 ${s.cls}`}>{s.value}</span>
                        <span className="text-[9px] text-muted-foreground">{s.label}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* D2. Progress over time chart */}
          <Card className="border bg-muted/20">
            <CardContent className="p-3">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Progress Over Time</p>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={progressOverTime} margin={{ top: 28, right: 10, left: -22, bottom: 0 }}>
                  <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 9 }}
                    axisLine={false} tickLine={false} ticks={[0, 50, 100]} />
                  <Tooltip formatter={(v: number) => [`${v}%`, 'Progress']} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  <Area type="monotone" dataKey="progress" stroke="#6366f1" strokeWidth={2}
                    fill={`url(#${gradId})`}
                    dot={(props: any) => {
                      const isLast = props.index === progressOverTime.length - 1;
                      return <circle key={props.index} cx={props.cx} cy={props.cy}
                        r={isLast ? 4 : 3} fill="#6366f1"
                        stroke={isLast ? '#fff' : 'none'} strokeWidth={isLast ? 2 : 0} />;
                    }}
                    activeDot={{ r: 5, strokeWidth: 0 }}>
                    <LabelList dataKey="progress" content={(props: any) => {
                      const { x, y, value, index } = props;
                      if (index !== progressOverTime.length - 1 || value === 0) return null;
                      return (
                        <g key={index}>
                          <rect x={x - 16} y={y - 22} width={32} height={16} rx={4} fill="#6366f1" />
                          <text x={x} y={y - 10} textAnchor="middle" fill="#fff" fontSize={9} fontWeight={700}>{value}%</text>
                        </g>
                      );
                    }} />
                  </Area>
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* D3. Budget + Milestones */}
          <Card className="border bg-muted/20">
            <CardContent className="p-3 space-y-3">
              {/* Budget */}
              {budgetTotal > 0 ? (
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Wallet className="h-3.5 w-3.5 text-indigo-500" />
                    <span className="text-xs font-semibold text-muted-foreground">Budget</span>
                    <span className={`ml-auto text-xs font-bold ${
                      budgetUsedPct > 90 ? 'text-red-600 dark:text-red-400' :
                      budgetUsedPct > 75 ? 'text-amber-600 dark:text-amber-400' : 'text-indigo-600 dark:text-indigo-400'}`}>
                      {budgetUsedPct}%
                    </span>
                  </div>
                  <Progress value={budgetUsedPct} className="h-2 mb-1.5" />
                  <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                    {[
                      { label: 'Total',     value: `${budgetTotal.toLocaleString()} ${budgetCurrency}` },
                      { label: 'Allocated', value: `${budgetAllocated.toLocaleString()} ${budgetCurrency}` },
                      { label: 'Remaining', value: `${budgetRemaining.toLocaleString()} ${budgetCurrency}`,
                        cls: budgetRemaining < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400' },
                    ].map(r => (
                      <div key={r.label} className="col-span-1">
                        <p className="text-[9px] text-muted-foreground">{r.label}</p>
                        <p className={`text-[10px] font-semibold truncate ${(r as any).cls ?? ''}`}>{r.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                  <Wallet className="h-4 w-4 text-slate-300" />No budget set
                </div>
              )}

              {/* Divider */}
              {budgetTotal > 0 && totalMilestones > 0 && <div className="border-t" />}

              {/* Milestones */}
              {totalMilestones > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Target className="h-3.5 w-3.5 text-violet-500" />
                    <span className="text-xs font-semibold text-muted-foreground">Milestones</span>
                    <span className="ml-auto text-[10px] font-bold text-violet-600 dark:text-violet-400">{milestonePercent}%</span>
                  </div>
                  <Progress value={milestonePercent} className="h-2 mb-2" />
                  <div className="space-y-1">
                    {milestones.slice(0, 4).map(m => {
                      const dLeft = m.due_date && safeParseISO(m.due_date)
                        ? differenceInDays(safeParseISO(m.due_date)!, now) : null;
                      return (
                        <div key={m.id} className="flex items-center gap-1.5">
                          {m.status === 'completed'
                            ? <CheckCircle className="h-3 w-3 text-indigo-500 flex-shrink-0" />
                            : <Milestone className={`h-3 w-3 flex-shrink-0 ${dLeft !== null && dLeft < 0 ? 'text-red-500' : dLeft !== null && dLeft <= 7 ? 'text-amber-500' : 'text-muted-foreground'}`} />}
                          <span className={`text-[10px] leading-tight truncate flex-1 ${m.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>
                            {m.title}
                          </span>
                          {dLeft !== null && m.status !== 'completed' && (
                            <span className={`text-[9px] flex-shrink-0 font-medium ${dLeft < 0 ? 'text-red-500' : dLeft <= 7 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                              {dLeft < 0 ? `${Math.abs(dLeft)}d late` : `${dLeft}d`}
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {totalMilestones > 4 && (
                      <p className="text-[9px] text-muted-foreground pt-0.5">
                        +{totalMilestones - 4} more milestones
                      </p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            E. BOTTOM ROW — Team Workload · Deliverables · Linked Systems
               (conditional — only renders if at least one section has data)
            ═════════════════════════════════════════════════════════════ */}
        {showBottomRow && (
          <div className={`grid grid-cols-1 gap-3 ${
            [hasTeamData, hasDeliverables, hasLinkedSystems].filter(Boolean).length === 3 ? 'md:grid-cols-3' :
            [hasTeamData, hasDeliverables, hasLinkedSystems].filter(Boolean).length === 2 ? 'md:grid-cols-2' :
            'md:grid-cols-1'}`}>

            {/* E1. Team Workload */}
            {hasTeamData && (
              <Card className="border bg-muted/20">
                <CardContent className="p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Users className="h-3.5 w-3.5 text-blue-500" />
                    <span className="text-xs font-semibold text-muted-foreground">Team Workload</span>
                    {teamCount > 0 && (
                      <Badge variant="outline" className="ml-auto text-[9px] px-1.5">{teamCount} members</Badge>
                    )}
                  </div>
                  <ResponsiveContainer width="100%" height={Math.max(80, workloadData.length * 26)}>
                    <BarChart data={workloadData} layout="vertical"
                      margin={{ top: 0, right: 28, left: 4, bottom: 0 }}>
                      <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`}
                        tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }}
                        axisLine={false} tickLine={false} width={56} />
                      <Tooltip formatter={(v: number) => [`${v}%`, 'Workload']}
                        contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                      <Bar dataKey="workload" radius={[0, 3, 3, 0]} maxBarSize={14}>
                        {workloadData.map((d, i) => (
                          <Cell key={i} fill={d.workload >= 90 ? '#ef4444' : d.workload >= 70 ? '#f59e0b' : '#6366f1'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {[{ color:'bg-red-400', l:'≥90% overloaded'}, { color:'bg-amber-400', l:'≥70% high'}, { color:'bg-indigo-400', l:'normal'}].map(l => (
                      <span key={l.l} className="flex items-center gap-1 text-[9px] text-muted-foreground">
                        <span className={`h-2 w-2 rounded-full ${l.color}`} />{l.l}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* E2. Deliverables Checklist */}
            {hasDeliverables && (
              <Card className="border bg-muted/20">
                <CardContent className="p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <ClipboardList className="h-3.5 w-3.5 text-teal-500" />
                    <span className="text-xs font-semibold text-muted-foreground">Deliverables</span>
                    <Badge variant="outline" className="ml-auto text-[9px] px-1.5">
                      {deliverablesDone}/{deliverableEntries.length}
                    </Badge>
                  </div>
                  <Progress
                    value={deliverableEntries.length > 0 ? Math.round((deliverablesDone / deliverableEntries.length) * 100) : 0}
                    className="h-1.5 mb-2" />
                  <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                    {deliverableEntries.map(([key, done]) => (
                      <div key={key} className={`flex items-center gap-1.5 px-1.5 py-1 rounded-md ${
                        done ? 'bg-emerald-50 dark:bg-emerald-950/20' : 'bg-muted/30'}`}>
                        {done
                          ? <CheckSquare className="h-3 w-3 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                          : <Square className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                        <span className={`text-[10px] leading-snug ${
                          done ? 'text-emerald-700 dark:text-emerald-300 line-through decoration-emerald-400' : 'text-muted-foreground'}`}>
                          {key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* E3. Linked Systems */}
            {hasLinkedSystems && (
              <Card className="border bg-muted/20">
                <CardContent className="p-3 space-y-2.5">
                  <div className="flex items-center gap-1.5">
                    <Link2 className="h-3.5 w-3.5 text-indigo-500" />
                    <span className="text-xs font-semibold text-muted-foreground">Linked Systems</span>
                  </div>

                  {/* MMPs */}
                  {mmps.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1 mb-1">
                        <MapPin className="h-3 w-3 text-indigo-400" />
                        <span className="text-[10px] font-semibold text-muted-foreground">Monitoring Plans</span>
                        <Badge variant="outline" className="ml-auto text-[8px] px-1">{mmps.length}</Badge>
                      </div>
                      <div className="space-y-0.5">
                        {mmps.slice(0, 3).map(m => (
                          <button key={m.id} onClick={() => navigate(`/mmp/${m.id}/view`)}
                            className="w-full flex items-center gap-1 text-[10px] text-left hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors group py-0.5">
                            <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 flex-shrink-0" />
                            <span className="truncate flex-1">{m.name ?? m.id.slice(0, 8)}</span>
                            {m.status && <Badge variant="outline" className="text-[8px] px-1 py-0 capitalize">{m.status}</Badge>}
                          </button>
                        ))}
                        {mmps.length > 3 && <p className="text-[9px] text-muted-foreground pl-3">+{mmps.length - 3} more</p>}
                      </div>
                      <button onClick={() => navigate('/mmp-management')}
                        className="text-[9px] text-indigo-500 hover:underline flex items-center gap-0.5 mt-1">
                        View all <ExternalLink className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  )}

                  {/* Site visits */}
                  {relatedSiteVisits.length > 0 && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Activity className="h-3 w-3 text-violet-400" />
                        <span className="text-[10px] text-muted-foreground">{relatedSiteVisits.length} site visits</span>
                      </div>
                      <button onClick={() => navigate('/site-visits')}
                        className="text-[9px] text-violet-500 hover:underline flex items-center gap-0.5">
                        View <ExternalLink className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  )}

                  {/* CRM opportunity */}
                  {crmOppty && (
                    <div className="border-t pt-2">
                      <div className="flex items-center gap-1 mb-1">
                        <Briefcase className="h-3 w-3 text-emerald-500" />
                        <span className="text-[10px] font-semibold text-muted-foreground">CRM Opportunity</span>
                      </div>
                      <p className="text-[10px] font-medium line-clamp-1 mb-1">{crmOppty.title}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        {CRM_STAGE_META[crmOppty.stage] && (
                          <span className={`text-[10px] font-semibold ${CRM_STAGE_META[crmOppty.stage].color}`}>
                            {CRM_STAGE_META[crmOppty.stage].label}
                          </span>
                        )}
                        {crmOppty.value_usd && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <DollarSign className="h-2.5 w-2.5" />
                            {crmOppty.value_usd >= 1_000_000
                              ? `${(crmOppty.value_usd / 1_000_000).toFixed(1)}M`
                              : crmOppty.value_usd >= 1_000
                                ? `${(crmOppty.value_usd / 1_000).toFixed(0)}K`
                                : crmOppty.value_usd.toFixed(0)} USD
                          </span>
                        )}
                      </div>
                      <button onClick={() => navigate('/crm/opportunities')}
                        className="text-[9px] text-emerald-600 hover:underline flex items-center gap-0.5 mt-1">
                        View in CRM <ExternalLink className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            F. ACTIVITY TIMELINE (GANTT) — full width, collapsible
            ═════════════════════════════════════════════════════════════ */}
        {ganttScale && activities.length > 0 && (
          <div className="rounded-lg border overflow-hidden">
            <CollapseHeader
              icon={<CalendarClock className="h-3.5 w-3.5" />}
              label="Activity Timeline"
              count={`${activities.length} activities`}
              open={showGantt}
              onToggle={() => setShowGantt(p => !p)}
              accent="text-violet-500"
            />
            {showGantt && (
              <div className="p-3 overflow-x-auto">
                <div className="flex justify-between text-[9px] text-muted-foreground mb-2 px-[120px]">
                  <span>{format(ganttScale.min, 'd MMM yyyy')}</span>
                  <span>{format(ganttScale.max, 'd MMM yyyy')}</span>
                </div>
                <div className="space-y-1.5">
                  {activities.slice(0, 15).map((a: any) => {
                    const s = safeParseISO(a.startDate) ?? ganttScale.min;
                    const e = safeParseISO(a.endDate)   ?? ganttScale.max;
                    const leftPct  = Math.max(0, (differenceInDays(s, ganttScale.min) / ganttScale.span) * 100);
                    const widthPct = Math.max(2, (differenceInDays(e, s) / ganttScale.span) * 100);
                    const isOverdue = a.status !== 'completed' && a.status !== 'cancelled'
                      && safeParseISO(a.endDate) && safeParseISO(a.endDate)! < now;
                    const barColor = a.status === 'completed' ? 'bg-indigo-500' :
                                     isOverdue                ? 'bg-red-500' :
                                     a.status === 'inProgress' ? 'bg-violet-500' : 'bg-slate-300 dark:bg-slate-600';
                    return (
                      <div key={a.id} className="flex items-center gap-2">
                        <div className="w-[116px] flex-shrink-0">
                          <p className="text-[10px] font-medium truncate leading-none">{a.name}</p>
                          <p className={`text-[8px] capitalize ${
                            a.status === 'completed' ? 'text-indigo-500' :
                            isOverdue ? 'text-red-500' : 'text-muted-foreground'}`}>
                            {isOverdue ? 'overdue' : a.status}
                          </p>
                        </div>
                        <div className="flex-1 relative h-5 bg-muted/50 rounded-sm overflow-hidden">
                          <div className={`absolute top-0.5 bottom-0.5 rounded-sm ${barColor} opacity-80`}
                            style={{ left: `${leftPct}%`, width: `${Math.min(widthPct, 100 - leftPct)}%` }} />
                          <div className="absolute top-0 bottom-0 w-px bg-orange-400/70"
                            style={{ left: `${Math.max(0, Math.min(100, (differenceInDays(now, ganttScale.min) / ganttScale.span) * 100))}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  {activities.length > 15 && (
                    <p className="text-[10px] text-muted-foreground text-center pt-1">
                      +{activities.length - 15} more activities
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-3 pt-2 border-t flex-wrap">
                  {[
                    { color: 'bg-indigo-500', label: 'Completed' },
                    { color: 'bg-violet-500', label: 'In Progress' },
                    { color: 'bg-red-500',    label: 'Overdue' },
                    { color: 'bg-slate-300',  label: 'Not Started' },
                  ].map(l => (
                    <span key={l.label} className="flex items-center gap-1 text-[9px] text-muted-foreground">
                      <span className={`h-2 w-4 rounded-sm ${l.color} opacity-80`} />{l.label}
                    </span>
                  ))}
                  <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
                    <span className="h-3 w-px bg-orange-400 inline-block" /> Today
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            G. RISKS & CHALLENGES — full width, collapsible
            ═════════════════════════════════════════════════════════════ */}
        <div className="rounded-lg border overflow-hidden">
          <CollapseHeader
            icon={<ShieldAlert className="h-3.5 w-3.5" />}
            label={openRisks.length > 0 ? `Risks & Challenges (${openRisks.length} open)` : 'Risks & Challenges'}
            open={showAllRisks}
            onToggle={() => setShowAllRisks(p => !p)}
            accent={openRisks.length > 0 ? 'text-orange-500' : 'text-muted-foreground'}
          />
          {showAllRisks && (
            <div className="p-3">
              {openRisks.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
                  <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  No open risks or challenges identified.
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Top challenge detail */}
                  {topRisk && (
                    <div className={`rounded-lg border p-3 ${topRiskMeta.bg}`}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5">
                          <AlertTriangle className={`h-3.5 w-3.5 flex-shrink-0 ${topRiskMeta.color}`} />
                          <p className="text-xs font-semibold leading-snug">{topRisk.title}</p>
                        </div>
                        <Badge variant="outline" className={`text-[9px] flex-shrink-0 ${topRiskMeta.color}`}>
                          {topRiskMeta.label} · {topRisk.risk_score}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2">
                        {[
                          { label: 'Category',       value: topRisk.category || '—',           icon: <Users className="h-3 w-3 text-blue-500" /> },
                          { label: 'Mitigation',     value: topRisk.mitigation_plan || '—',    icon: <ClipboardList className="h-3 w-3 text-violet-500" /> },
                          { label: 'Support needed', value: topRisk.contingency_plan || '—',   icon: <Headphones className="h-3 w-3 text-indigo-500" /> },
                          { label: 'Status',         value: FOLLOW_UP_LABELS[topRisk.status] ?? topRisk.status, icon: <RefreshCw className="h-3 w-3 text-indigo-500" /> },
                          { label: 'Due date',       value: topRisk.due_date && safeParseISO(topRisk.due_date) ? format(parseISO(topRisk.due_date), 'd MMM yyyy') : '—', icon: <CalendarClock className="h-3 w-3 text-rose-500" /> },
                          { label: 'Resolution',     value: ['mitigated','closed','accepted'].includes(topRisk.status) && safeParseISO(topRisk.updated_at) ? format(parseISO(topRisk.updated_at), 'd MMM yyyy') : 'Pending', icon: <CalendarCheck className="h-3 w-3 text-teal-500" /> },
                          { label: 'Risk level',     value: topRiskMeta.label, icon: <ShieldCheck className={`h-3 w-3 ${topRiskMeta.color}`} /> },
                        ].map(cell => (
                          <div key={cell.label}>
                            <div className="flex items-center gap-1 mb-0.5">{cell.icon}
                              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{cell.label}</p>
                            </div>
                            <p className="text-[10px] font-medium pl-4 leading-snug">{cell.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* All other open risks */}
                  {openRisks.length > 1 && (
                    <div className="divide-y border rounded-lg overflow-hidden">
                      {openRisks.slice(1).map(r => {
                        const meta = getRiskMeta(r.risk_score);
                        return (
                          <div key={r.id} className="px-3 py-2 flex items-start gap-2.5">
                            <span className={`h-2 w-2 rounded-full mt-1.5 flex-shrink-0 ${meta.dot}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium leading-snug">{r.title}</p>
                              <p className="text-[10px] text-muted-foreground capitalize">
                                {r.category}{r.due_date && safeParseISO(r.due_date) && (
                                  <> · Due {format(parseISO(r.due_date), 'd MMM yyyy')}</>
                                )}
                              </p>
                            </div>
                            <Badge variant="outline" className={`text-[9px] flex-shrink-0 ${meta.color}`}>
                              {meta.label} · {r.risk_score}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
