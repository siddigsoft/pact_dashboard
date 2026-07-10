import { useEffect, useState, useMemo, useRef } from 'react';
import {
  format, getISOWeek, startOfISOWeek, endOfISOWeek,
  parseISO, isValid, subWeeks, differenceInDays,
} from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Project } from '@/types/project';
import {
  getEffectiveStages, getProjectStageProgress,
} from '@/config/projectFlows';
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
  Flag, Calendar, Target, AlertTriangle, CheckCircle,
  TrendingUp, Clock3, ShieldAlert, Headphones, Users,
  ClipboardList, CalendarClock, RefreshCw, CalendarCheck,
  ShieldCheck, Wallet, Printer, Activity, ChevronDown,
  ChevronUp, Milestone, TriangleAlert, Layers,
  Link2, CheckSquare, Square, GitBranch, ExternalLink,
  Briefcase, MapPin, DollarSign,
} from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────────────────── */
interface Risk {
  id: string; title: string; category: string; risk_score: number;
  status: string; owner_id: string | null; mitigation_plan: string | null;
  contingency_plan: string | null; due_date: string | null; updated_at: string;
}
interface MilestoneLite {
  id: string; title: string; status: string; due_date: string | null;
}
interface MmpLite { id: string; name?: string; status?: string; }
interface CrmOppty { id: string; title: string; stage: string; value_usd: number | null; expected_close_date: string | null; }

interface Props { project: Project; }

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
export function ProjectWeeklyDashboard({ project }: Props) {
  const navigate = useNavigate();

  const [risks, setRisks]         = useState<Risk[]>([]);
  const [milestones, setMilestones] = useState<MilestoneLite[]>([]);
  const [mmps, setMmps]           = useState<MmpLite[]>([]);
  const [crmOppty, setCrmOppty]   = useState<CrmOppty | null>(null);
  const [loading, setLoading]     = useState(true);

  /* Collapse state */
  const [showAllRisks, setShowAllRisks]       = useState(false);
  const [showGantt, setShowGantt]             = useState(true);
  const [showWorkload, setShowWorkload]        = useState(true);
  const [showDeliverables, setShowDeliverables] = useState(true);
  const [showLinks, setShowLinks]             = useState(true);
  const [includeSubActs, setIncludeSubActs]   = useState(false);
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
  const allSubActs          = activities.flatMap((a: any) => a.subActivities || []);
  const completedSubActs    = allSubActs.filter((s: any) => s.status === 'completed').length;
  const inProgressSubActs   = allSubActs.filter((s: any) => s.status === 'inProgress').length;
  const totalCount      = includeSubActs ? totalActs + allSubActs.length  : totalActs;
  const completedCount  = includeSubActs ? completedActs + completedSubActs : completedActs;
  const inProgressCount = includeSubActs ? inProgressActs + inProgressSubActs : inProgressActs;
  const notStartedCount = Math.max(totalCount - completedCount - inProgressCount, 0);
  const overallProgress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const pct = (n: number) => totalCount > 0 ? Math.round((n / totalCount) * 100) : 0;

  /* Overdue & this-week */
  const overdueActs = activities.filter((a: any) => {
    if (a.status === 'completed' || a.status === 'cancelled') return false;
    const e = safeParseISO(a.endDate); return e ? e < now : false;
  }).length;
  const thisWeekDue = activities.filter((a: any) => {
    if (a.status === 'completed' || a.status === 'cancelled') return false;
    const e = safeParseISO(a.endDate); return e ? e >= weekStart && e <= weekEnd : false;
  }).length;
  const openActions = activities.filter((a: any) => a.status !== 'completed' && a.status !== 'cancelled').length;

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

  /* Workload chart data */
  const workloadData = useMemo(() =>
    teamComposition
      .filter(m => m.name && (m.workload ?? 0) > 0)
      .map(m => ({ name: m.name.split(' ')[0], workload: m.workload, role: m.role ?? '' }))
      .sort((a, b) => b.workload - a.workload)
      .slice(0, 8),
  [teamComposition]);

  /* Deliverables */
  const deliverablesState: Record<string, boolean> = (project as any).team?.deliverablesState ?? {};
  const deliverableEntries = Object.entries(deliverablesState);
  const deliverablesDone   = deliverableEntries.filter(([, v]) => v).length;

  /* Project stage pipeline */
  const effectiveStages = useMemo(() =>
    getEffectiveStages(project.projectType ?? 'tpm', (project as any).customFlowStages ?? null),
  [project.projectType, project.customFlowStages]);
  const stageProgress = useMemo(() =>
    getProjectStageProgress(project.projectType ?? 'tpm', project.currentFlowStage, (project as any).customFlowStages ?? null),
  [project.projectType, project.currentFlowStage, project.customFlowStages]);
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
  const progressOverTime = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const ref  = subWeeks(now, 5 - i);
      const wEnd = endOfISOWeek(ref);
      const wNum = getISOWeek(ref);
      const done = activities.filter((a: any) => {
        if (a.status !== 'completed') return false;
        const d = safeParseISO(a.endDate || a.updatedAt);
        return d ? d <= wEnd : true;
      }).length;
      return { week: `W${wNum}`, progress: totalActs > 0 ? Math.round((done / totalActs) * 100) : 0 };
    });
  }, [activities, totalActs, now]);

  /* Gantt scale */
  const ganttScale = useMemo(() => {
    const dates: Date[] = [];
    activities.forEach((a: any) => {
      const s = safeParseISO(a.startDate); const e = safeParseISO(a.endDate);
      if (s) dates.push(s); if (e) dates.push(e);
    });
    const projStart = safeParseISO(project.startDate);
    const projEnd   = safeParseISO(project.endDate);
    if (projStart) dates.push(projStart); if (projEnd) dates.push(projEnd);
    if (dates.length < 2) return null;
    const min = dates.reduce((a, b) => a < b ? a : b);
    const max = dates.reduce((a, b) => a > b ? a : b);
    const span = Math.max(differenceInDays(max, min), 1);
    return { min, max, span };
  }, [activities, project.startDate, project.endDate]);

  /* Donut */
  const donutData = [
    { name: 'Completed',   value: completedCount,  color: '#6366f1' },
    { name: 'In Progress', value: inProgressCount,  color: '#8b5cf6' },
    { name: 'Not Started', value: notStartedCount,  color: '#cbd5e1' },
  ].filter(d => d.value > 0);

  const gradId     = `pgGrad-${project.id}`;
  const statusMeta = STATUS_META[project.status ?? ''] ?? STATUS_META['draft'];
  const relatedMMPs: string[] = (project as any).relatedMMPs ?? [];
  const relatedSiteVisits: string[] = (project as any).relatedSiteVisits ?? [];

  /* ── Skeleton ── */
  if (loading) {
    return (
      <div className="rounded-xl border bg-card p-5 animate-pulse space-y-3">
        <div className="h-4 bg-muted rounded w-56" />
        <div className="grid grid-cols-4 gap-3">{[0,1,2,3].map(i => <div key={i} className="h-20 bg-muted rounded-lg" />)}</div>
        <div className="grid grid-cols-3 gap-3">
          <div className="h-36 bg-muted rounded-lg" />
          <div className="col-span-2 h-36 bg-muted rounded-lg" />
        </div>
      </div>
    );
  }

  /* ── Section header helper ── */
  const SectionHeader = ({
    icon, label, count, open, onToggle, accent = 'text-muted-foreground',
  }: { icon: React.ReactNode; label: string; count?: string; open: boolean; onToggle: () => void; accent?: string }) => (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2 px-3 py-2 bg-muted/40 hover:bg-muted/70 transition-colors rounded-lg border text-left"
    >
      <span className={accent}>{icon}</span>
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
      {count && <Badge variant="outline" className="ml-1 text-[9px] px-1.5 py-0">{count}</Badge>}
      {open ? <ChevronUp className="h-3.5 w-3.5 ml-auto text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto text-muted-foreground" />}
    </button>
  );

  return (
    <div ref={dashRef} className="rounded-xl border bg-card shadow-sm overflow-hidden print:shadow-none" data-testid="project-weekly-dashboard">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="bg-[#0F2041] px-4 py-2.5 flex items-center gap-2 flex-wrap">
        <TrendingUp className="h-4 w-4 text-indigo-300 flex-shrink-0" />
        <span className="text-white font-semibold text-sm">Weekly Project Dashboard</span>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${statusMeta.color}`}>{statusMeta.label}</span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ml-1 ${health.color}`}>
          ● Health {healthScore}/100 · {health.label}
        </span>
        <span className="text-white/50 text-xs hidden sm:block ml-auto">{periodLabel} · {periodRange}</span>
        <Button size="sm" variant="ghost" onClick={() => window.print()}
          className="h-6 px-2 text-white/70 hover:text-white hover:bg-white/10 print:hidden" data-testid="dashboard-print-btn">
          <Printer className="h-3.5 w-3.5 mr-1" /><span className="text-xs">Export</span>
        </Button>
      </div>

      <div className="p-4 space-y-3">

        {/* ── Row 1: 4 header cards ───────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">

          {/* Project Name */}
          <Card className="border bg-muted/30">
            <CardContent className="p-3 flex items-start gap-2.5">
              <div className="p-1.5 rounded-md bg-indigo-500/10 mt-0.5 flex-shrink-0">
                <Flag className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Project Name</p>
                <p className="font-semibold text-sm leading-tight line-clamp-2">{project.name}</p>
                {(project as any).projectCode && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">{(project as any).projectCode}</p>
                )}
                {teamCount > 0 && (
                  <div className="flex items-center gap-1 mt-1.5">
                    <Users className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">{teamCount} member{teamCount !== 1 ? 's' : ''}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Reporting Period */}
          <Card className="border bg-muted/30">
            <CardContent className="p-3 flex items-start gap-2.5">
              <div className="p-1.5 rounded-md bg-indigo-500/10 mt-0.5 flex-shrink-0">
                <Calendar className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Reporting Period</p>
                <p className="font-semibold text-sm">{periodLabel}</p>
                <p className="text-[10px] text-muted-foreground">{periodRange}</p>
                {daysRemaining !== null && (
                  <p className={`text-[10px] font-semibold mt-1 ${
                    daysRemaining < 0 ? 'text-red-600 dark:text-red-400' :
                    daysRemaining <= 14 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                  }`}>
                    {daysRemaining < 0 ? `${Math.abs(daysRemaining)}d overdue` : daysRemaining === 0 ? 'Due today' : `${daysRemaining}d remaining`}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Milestones */}
          <Card className="border bg-muted/30">
            <CardContent className="p-3 flex items-start gap-2.5">
              <div className="p-1.5 rounded-md bg-indigo-500/10 mt-0.5 flex-shrink-0">
                <Target className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Milestones</p>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-semibold text-sm">{completedMilestones} of {totalMilestones}</span>
                  <span className="text-indigo-600 dark:text-indigo-400 text-xs font-bold ml-auto">{milestonePercent}%</span>
                </div>
                <Progress value={milestonePercent} className="h-1.5 mt-1 mb-1.5" />
                <div className="flex items-center gap-3 mb-1">
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 inline-block" />{completedMilestones} Done
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-300 inline-block" />{totalMilestones - completedMilestones} Left
                  </span>
                </div>
                {nextMilestone && (
                  <div className="border-t pt-1.5">
                    <p className="text-[9px] text-muted-foreground flex items-center gap-1 mb-0.5">
                      <Milestone className="h-2.5 w-2.5" /> Next milestone
                    </p>
                    <p className="text-[10px] font-medium leading-tight line-clamp-1">{nextMilestone.title}</p>
                    {nextMilestoneDays !== null && (
                      <p className={`text-[9px] font-semibold ${
                        nextMilestoneDays < 0 ? 'text-red-600 dark:text-red-400' :
                        nextMilestoneDays <= 7 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
                      }`}>
                        {nextMilestoneDays < 0 ? `${Math.abs(nextMilestoneDays)}d overdue` : nextMilestoneDays === 0 ? 'Due today' : `in ${nextMilestoneDays}d`}
                        {' · '}{format(parseISO(nextMilestone.due_date!), 'd MMM')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Summary 2×2 */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest px-0.5">Summary</p>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { icon: <TrendingUp className="h-3.5 w-3.5" />, label: 'Progress', value: `${overallProgress}%`, cls: 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300', iconCls: 'text-indigo-600 dark:text-indigo-400' },
                { icon: <AlertTriangle className="h-3.5 w-3.5" />, label: 'Challenges', value: String(openRisks.length), cls: 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300', iconCls: 'text-amber-600 dark:text-amber-400' },
                { icon: <Clock3 className="h-3.5 w-3.5" />, label: 'Open Actions', value: String(openActions), cls: 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300', iconCls: 'text-blue-600 dark:text-blue-400' },
                { icon: <ShieldAlert className="h-3.5 w-3.5" />, label: 'Risk Level', value: topRiskMeta.label, cls: `${topRiskMeta.bg} ${topRiskMeta.color}`, iconCls: topRiskMeta.color },
              ].map(c => (
                <Card key={c.label} className={`border ${c.cls.split(' ')[0]}`}>
                  <CardContent className="p-2 text-center">
                    <span className={`flex justify-center mb-0.5 ${c.iconCls}`}>{c.icon}</span>
                    <p className="text-[9px] text-muted-foreground leading-none">{c.label}</p>
                    <p className={`text-sm font-bold leading-tight ${c.cls}`}>{c.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>

        {/* ── Activity stats strip ────────────────────────────────────── */}
        {totalActs > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: <TriangleAlert className={`h-4 w-4 flex-shrink-0 ${overdueActs > 0 ? 'text-red-500' : 'text-muted-foreground'}`} />,
                value: overdueActs, label: 'Overdue Activities',
                cls: overdueActs > 0 ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900' : 'bg-muted/30',
                textCls: overdueActs > 0 ? 'text-red-600 dark:text-red-400' : '' },
              { icon: <CalendarClock className={`h-4 w-4 flex-shrink-0 ${thisWeekDue > 0 ? 'text-amber-500' : 'text-muted-foreground'}`} />,
                value: thisWeekDue, label: 'Due This Week',
                cls: thisWeekDue > 0 ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900' : 'bg-muted/30',
                textCls: thisWeekDue > 0 ? 'text-amber-600 dark:text-amber-400' : '' },
              { icon: <Activity className="h-4 w-4 flex-shrink-0 text-emerald-500" />,
                value: completedActs, label: 'Completed',
                cls: 'bg-muted/30', textCls: '' },
            ].map(c => (
              <div key={c.label} className={`rounded-lg border px-3 py-2 flex items-center gap-2 ${c.cls}`}>
                {c.icon}
                <div>
                  <p className={`text-lg font-bold leading-none ${c.textCls}`}>{c.value}</p>
                  <p className="text-[10px] text-muted-foreground">{c.label}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Budget bar ──────────────────────────────────────────────── */}
        {budgetTotal > 0 && (
          <Card className="border bg-muted/30">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <Wallet className="h-3.5 w-3.5 text-indigo-500 flex-shrink-0" />
                <span className="text-xs font-semibold text-muted-foreground">Budget Utilisation</span>
                <span className={`ml-auto text-xs font-bold ${budgetUsedPct > 90 ? 'text-red-600 dark:text-red-400' : budgetUsedPct > 75 ? 'text-amber-600 dark:text-amber-400' : 'text-indigo-600 dark:text-indigo-400'}`}>{budgetUsedPct}%</span>
              </div>
              <Progress value={budgetUsedPct} className="h-2" />
              <div className="flex items-center justify-between mt-1.5 text-[10px] text-muted-foreground flex-wrap gap-1">
                <span>Allocated: <span className="font-semibold text-foreground">{budgetAllocated.toLocaleString()} {budgetCurrency}</span></span>
                <span>Total: <span className="font-semibold text-foreground">{budgetTotal.toLocaleString()} {budgetCurrency}</span></span>
                <span>Remaining: <span className={`font-semibold ${budgetRemaining < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{budgetRemaining.toLocaleString()} {budgetCurrency}</span></span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Stage Pipeline ──────────────────────────────────────────── */}
        {effectiveStages.length > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-muted/40 px-3 py-2 flex items-center gap-2 border-b">
              <GitBranch className="h-3.5 w-3.5 text-indigo-500" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Project Stage Pipeline</span>
              {stageProgress && (
                <span className="ml-auto text-[10px] text-muted-foreground font-medium">
                  Stage {stageProgress.stageIdx + 1} of {stageProgress.totalStages} · {stageProgress.pct}%
                </span>
              )}
            </div>
            <div className="p-3 overflow-x-auto">
              <div className="flex items-center gap-1 min-w-max">
                {effectiveStages.map((stage, idx) => {
                  const isPast    = idx < currentStageIdx;
                  const isCurrent = idx === currentStageIdx;
                  const isFuture  = idx > currentStageIdx;
                  return (
                    <div key={stage.id} className="flex items-center">
                      <div className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg border text-center min-w-[80px] max-w-[100px] transition-all ${
                        isCurrent ? 'bg-indigo-600 border-indigo-700 text-white shadow-md scale-105' :
                        isPast    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400' :
                        'bg-muted/30 border-muted text-muted-foreground'
                      }`}>
                        <span className="text-[8px] font-bold uppercase tracking-wide">
                          {isPast ? '✓' : isCurrent ? '▶' : `${idx + 1}`}
                        </span>
                        <span className="text-[10px] font-medium leading-tight line-clamp-2">{stage.label}</span>
                      </div>
                      {idx < effectiveStages.length - 1 && (
                        <div className={`h-px w-4 flex-shrink-0 ${isPast || isCurrent ? 'bg-emerald-400' : 'bg-muted'}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Donut + Chart ───────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card className="border bg-muted/30">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted-foreground">Implementation Progress</p>
                {allSubActs.length > 0 && (
                  <button onClick={() => setIncludeSubActs(p => !p)}
                    className="flex items-center gap-0.5 text-[9px] text-indigo-500 border border-indigo-200 dark:border-indigo-800 rounded px-1.5 py-0.5"
                    data-testid="include-sub-toggle">
                    <Layers className="h-2.5 w-2.5" />
                    {includeSubActs ? 'w/ Sub-tasks' : 'Top-level'}
                  </button>
                )}
              </div>
              {totalCount === 0 ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
                  <CheckCircle className="h-4 w-4 text-slate-300" /> No activities yet
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="relative h-[90px] w-[90px] flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={donutData} innerRadius="62%" outerRadius="82%" dataKey="value" strokeWidth={0} startAngle={90} endAngle={-270}>
                          {donutData.map((e, i) => <Cell key={i} fill={e.color} />)}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-lg font-bold leading-none">{overallProgress}%</span>
                      <span className="text-[9px] text-muted-foreground">of plan</span>
                    </div>
                  </div>
                  <div className="space-y-2 text-xs flex-1">
                    {[
                      { label: 'Completed',   n: completedCount,  color: 'bg-indigo-500' },
                      { label: 'In Progress', n: inProgressCount, color: 'bg-violet-500' },
                      { label: 'Not Started', n: notStartedCount, color: 'bg-slate-300 dark:bg-slate-600' },
                    ].map(row => (
                      <div key={row.label} className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full flex-shrink-0 ${row.color}`} />
                        <span className="text-muted-foreground flex-1">{row.label}</span>
                        <span className="font-semibold">{pct(row.n)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border bg-muted/30 md:col-span-2">
            <CardContent className="p-3">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Progress Over Time</p>
              <ResponsiveContainer width="100%" height={108}>
                <AreaChart data={progressOverTime} margin={{ top: 28, right: 12, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} ticks={[0,25,50,75,100]} />
                  <Tooltip formatter={(v: number) => [`${v}%`, 'Progress']} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  <Area type="monotone" dataKey="progress" stroke="#6366f1" strokeWidth={2} fill={`url(#${gradId})`}
                    dot={(props: any) => {
                      const isLast = props.index === progressOverTime.length - 1;
                      return <circle key={props.index} cx={props.cx} cy={props.cy} r={isLast ? 4 : 3} fill="#6366f1" stroke={isLast ? '#fff' : 'none'} strokeWidth={isLast ? 2 : 0} />;
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
        </div>

        {/* ── Mini Gantt ──────────────────────────────────────────────── */}
        {ganttScale && activities.length > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <SectionHeader icon={<CalendarClock className="h-3.5 w-3.5" />} label="Activity Timeline (Gantt)"
              count={`${activities.length}`} open={showGantt} onToggle={() => setShowGantt(p => !p)} accent="text-violet-500" />
            {showGantt && (
              <div className="p-3 overflow-x-auto">
                {/* Axis labels */}
                <div className="flex justify-between text-[9px] text-muted-foreground mb-2 px-[120px]">
                  <span>{format(ganttScale.min, 'd MMM')}</span>
                  <span>{format(ganttScale.max, 'd MMM yyyy')}</span>
                </div>
                <div className="space-y-1.5">
                  {activities.slice(0, 15).map((a: any) => {
                    const s = safeParseISO(a.startDate) ?? ganttScale.min;
                    const e = safeParseISO(a.endDate)   ?? ganttScale.max;
                    const leftPct  = Math.max(0, (differenceInDays(s, ganttScale.min) / ganttScale.span) * 100);
                    const widthPct = Math.max(2, (differenceInDays(e, s) / ganttScale.span) * 100);
                    const isOverdue = a.status !== 'completed' && a.status !== 'cancelled' && safeParseISO(a.endDate) && safeParseISO(a.endDate)! < now;
                    const barColor = a.status === 'completed' ? 'bg-indigo-500' :
                                     isOverdue                ? 'bg-red-500' :
                                     a.status === 'inProgress' ? 'bg-violet-500' : 'bg-slate-300 dark:bg-slate-600';
                    return (
                      <div key={a.id} className="flex items-center gap-2">
                        <div className="w-[116px] flex-shrink-0">
                          <p className="text-[10px] font-medium truncate leading-none">{a.name}</p>
                          <p className={`text-[8px] capitalize ${
                            a.status === 'completed' ? 'text-indigo-500' :
                            isOverdue ? 'text-red-500' : 'text-muted-foreground'
                          }`}>{isOverdue ? 'overdue' : a.status}</p>
                        </div>
                        <div className="flex-1 relative h-5 bg-muted/50 rounded-sm overflow-hidden">
                          <div
                            className={`absolute top-0.5 bottom-0.5 rounded-sm ${barColor} opacity-80`}
                            style={{ left: `${leftPct}%`, width: `${Math.min(widthPct, 100 - leftPct)}%` }}
                          />
                          {/* Today line */}
                          <div className="absolute top-0 bottom-0 w-px bg-orange-400/70"
                            style={{ left: `${Math.max(0, Math.min(100, (differenceInDays(now, ganttScale.min) / ganttScale.span) * 100))}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  {activities.length > 15 && (
                    <p className="text-[10px] text-muted-foreground text-center pt-1">+ {activities.length - 15} more activities</p>
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

        {/* ── Team Workload ────────────────────────────────────────────── */}
        {workloadData.length > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <SectionHeader icon={<Users className="h-3.5 w-3.5" />} label="Team Workload Distribution"
              count={`${teamComposition.length} members`} open={showWorkload} onToggle={() => setShowWorkload(p => !p)} accent="text-blue-500" />
            {showWorkload && (
              <div className="p-3">
                <ResponsiveContainer width="100%" height={Math.max(80, workloadData.length * 28)}>
                  <BarChart data={workloadData} layout="vertical" margin={{ top: 2, right: 32, left: 8, bottom: 2 }}>
                    <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={60} />
                    <Tooltip formatter={(v: number) => [`${v}%`, 'Workload']} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    <Bar dataKey="workload" radius={[0, 4, 4, 0]} maxBarSize={16}>
                      {workloadData.map((d, i) => (
                        <Cell key={i} fill={d.workload >= 90 ? '#ef4444' : d.workload >= 70 ? '#f59e0b' : '#6366f1'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <p className="text-[9px] text-muted-foreground text-right mt-1">🔴 ≥90% overloaded · 🟡 ≥70% high · 🔵 normal</p>
              </div>
            )}
          </div>
        )}

        {/* ── Deliverables Checklist ───────────────────────────────────── */}
        {deliverableEntries.length > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <SectionHeader
              icon={<ClipboardList className="h-3.5 w-3.5" />}
              label="Deliverables Checklist"
              count={`${deliverablesDone}/${deliverableEntries.length} done`}
              open={showDeliverables}
              onToggle={() => setShowDeliverables(p => !p)}
              accent="text-teal-500"
            />
            {showDeliverables && (
              <div className="p-3">
                <Progress value={deliverableEntries.length > 0 ? Math.round((deliverablesDone / deliverableEntries.length) * 100) : 0} className="h-1.5 mb-3" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {deliverableEntries.map(([key, done]) => (
                    <div key={key} className={`flex items-center gap-2 px-2 py-1.5 rounded-md border ${done ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800' : 'bg-muted/30'}`}>
                      {done
                        ? <CheckSquare className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                        : <Square className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                      <span className={`text-[10px] leading-snug ${done ? 'text-emerald-700 dark:text-emerald-300 line-through decoration-emerald-400' : 'text-muted-foreground'}`}>
                        {key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Integrations Panel (MMP + Site Visits + CRM) ────────────── */}
        {(relatedMMPs.length > 0 || relatedSiteVisits.length > 0 || crmOppty) && (
          <div className="border rounded-lg overflow-hidden">
            <SectionHeader icon={<Link2 className="h-3.5 w-3.5" />} label="Linked Systems"
              open={showLinks} onToggle={() => setShowLinks(p => !p)} accent="text-indigo-500" />
            {showLinks && (
              <div className="p-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* MMP */}
                {relatedMMPs.length > 0 && (
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <MapPin className="h-3.5 w-3.5 text-indigo-500" />
                      <span className="text-xs font-semibold">Monitoring Plans</span>
                      <Badge variant="outline" className="ml-auto text-[9px] px-1.5">{mmps.length}</Badge>
                    </div>
                    <div className="space-y-1">
                      {mmps.slice(0, 4).map(m => (
                        <button key={m.id} onClick={() => navigate(`/mmp/${m.id}/view`)}
                          className="w-full flex items-center gap-1.5 text-[10px] text-left hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors group">
                          <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 flex-shrink-0" />
                          <span className="truncate">{m.name ?? m.id.slice(0, 8)}</span>
                          {m.status && (
                            <Badge variant="outline" className="ml-auto text-[8px] px-1 py-0 capitalize flex-shrink-0">{m.status}</Badge>
                          )}
                        </button>
                      ))}
                      {mmps.length > 4 && <p className="text-[9px] text-muted-foreground">+{mmps.length - 4} more</p>}
                    </div>
                    <button onClick={() => navigate('/mmp-management')}
                      className="mt-2 text-[9px] text-indigo-500 hover:underline flex items-center gap-1">
                      View all MMPs <ExternalLink className="h-2.5 w-2.5" />
                    </button>
                  </div>
                )}

                {/* Site Visits */}
                {relatedSiteVisits.length > 0 && (
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Activity className="h-3.5 w-3.5 text-violet-500" />
                      <span className="text-xs font-semibold">Site Visits</span>
                      <Badge variant="outline" className="ml-auto text-[9px] px-1.5">{relatedSiteVisits.length}</Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mb-2">
                      {relatedSiteVisits.length} linked site visit{relatedSiteVisits.length !== 1 ? 's' : ''}
                    </p>
                    <button onClick={() => navigate('/site-visits')}
                      className="text-[9px] text-violet-500 hover:underline flex items-center gap-1">
                      View Site Visits <ExternalLink className="h-2.5 w-2.5" />
                    </button>
                  </div>
                )}

                {/* CRM Opportunity */}
                {crmOppty && (
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Briefcase className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="text-xs font-semibold">CRM Opportunity</span>
                    </div>
                    <p className="text-[10px] font-medium leading-snug mb-1 line-clamp-2">{crmOppty.title}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {CRM_STAGE_META[crmOppty.stage] && (
                        <span className={`text-[10px] font-semibold ${CRM_STAGE_META[crmOppty.stage].color}`}>
                          {CRM_STAGE_META[crmOppty.stage].label}
                        </span>
                      )}
                      {crmOppty.value_usd && (
                        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          <DollarSign className="h-2.5 w-2.5" />
                          {crmOppty.value_usd >= 1_000_000
                            ? `${(crmOppty.value_usd / 1_000_000).toFixed(1)}M`
                            : crmOppty.value_usd >= 1_000
                              ? `${(crmOppty.value_usd / 1_000).toFixed(0)}K`
                              : crmOppty.value_usd.toFixed(0)} USD
                        </span>
                      )}
                    </div>
                    {crmOppty.expected_close_date && (
                      <p className="text-[9px] text-muted-foreground mt-1">
                        Close: {format(parseISO(crmOppty.expected_close_date), 'd MMM yyyy')}
                      </p>
                    )}
                    <button onClick={() => navigate('/crm/opportunities')}
                      className="mt-2 text-[9px] text-emerald-600 hover:underline flex items-center gap-1">
                      View in CRM <ExternalLink className="h-2.5 w-2.5" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Top challenge block ──────────────────────────────────────── */}
        {topRisk ? (
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-muted/60 px-3 py-2 border-b flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Active Challenge (Highest Risk)</span>
              <Badge variant="outline" className={`ml-auto text-[10px] capitalize ${topRiskMeta.color}`}>{topRiskMeta.label}</Badge>
            </div>
            <div className="p-3 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3">
              {[
                { label: 'Challenge Identified', value: topRisk.title, icon: <AlertTriangle className="h-3 w-3 text-amber-500 flex-shrink-0" /> },
                { label: 'Support Needed', value: topRisk.contingency_plan || '—', icon: <Headphones className="h-3 w-3 text-indigo-500 flex-shrink-0" /> },
                { label: 'Responsible Unit', value: topRisk.category ? topRisk.category.charAt(0).toUpperCase() + topRisk.category.slice(1) : '—', icon: <Users className="h-3 w-3 text-blue-500 flex-shrink-0" /> },
                { label: 'Action Required', value: topRisk.mitigation_plan || '—', icon: <ClipboardList className="h-3 w-3 text-violet-500 flex-shrink-0" /> },
                { label: 'Deadline', value: safeParseISO(topRisk.due_date) ? format(parseISO(topRisk.due_date!), 'd MMM yyyy') : '—', icon: <CalendarClock className="h-3 w-3 text-rose-500 flex-shrink-0" /> },
                { label: 'Follow-up Status', value: FOLLOW_UP_LABELS[topRisk.status] ?? topRisk.status, highlight: topRisk.status === 'open', icon: <RefreshCw className="h-3 w-3 text-indigo-500 flex-shrink-0" /> },
                { label: 'Resolution Date', value: ['mitigated','closed','accepted'].includes(topRisk.status) && safeParseISO(topRisk.updated_at) ? format(parseISO(topRisk.updated_at), 'd MMM yyyy') : 'Pending', icon: <CalendarCheck className="h-3 w-3 text-teal-500 flex-shrink-0" /> },
                { label: 'Risk Level', value: topRiskMeta.label, riskColor: topRiskMeta.color, icon: <ShieldCheck className={`h-3 w-3 flex-shrink-0 ${topRiskMeta.color}`} /> },
              ].map(cell => (
                <div key={cell.label} className="space-y-0.5">
                  <div className="flex items-center gap-1 mb-0.5">{cell.icon}
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{cell.label}</p>
                  </div>
                  <p className={`text-xs font-medium leading-snug pl-4 ${(cell as any).riskColor ?? ''} ${(cell as any).highlight ? 'text-indigo-600 dark:text-indigo-400' : ''}`}>
                    {cell.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground border rounded-lg px-3 py-2.5 bg-muted/30">
            <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
            No open challenges identified for this project.
          </div>
        )}

        {/* ── All open risks ───────────────────────────────────────────── */}
        {openRisks.length > 1 && (
          <div className="border rounded-lg overflow-hidden">
            <button onClick={() => setShowAllRisks(p => !p)}
              className="w-full px-3 py-2 bg-muted/40 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted/70 transition-colors"
              data-testid="toggle-all-risks">
              <ShieldAlert className="h-3.5 w-3.5 text-orange-500" />
              All Open Risks ({openRisks.length})
              {showAllRisks ? <ChevronUp className="h-3.5 w-3.5 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
            </button>
            {showAllRisks && (
              <div className="divide-y">
                {openRisks.map(r => {
                  const meta = getRiskMeta(r.risk_score);
                  return (
                    <div key={r.id} className="px-3 py-2 flex items-start gap-3">
                      <span className={`h-2 w-2 rounded-full mt-1.5 flex-shrink-0 ${meta.dot}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium leading-snug">{r.title}</p>
                        <p className="text-[10px] text-muted-foreground capitalize">
                          {r.category}{r.due_date && safeParseISO(r.due_date) && <> · Due {format(parseISO(r.due_date), 'd MMM yyyy')}</>}
                        </p>
                      </div>
                      <Badge variant="outline" className={`text-[9px] flex-shrink-0 ${meta.color}`}>{meta.label} · {r.risk_score}</Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
