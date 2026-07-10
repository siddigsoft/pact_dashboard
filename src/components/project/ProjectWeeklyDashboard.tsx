import { useEffect, useState, useMemo, useRef } from 'react';
import {
  format, getISOWeek, startOfISOWeek, endOfISOWeek,
  parseISO, isValid, subWeeks, differenceInDays,
} from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Project } from '@/types/project';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, LabelList,
} from 'recharts';
import {
  Flag, Calendar, Target, AlertTriangle, CheckCircle,
  TrendingUp, Clock3, ShieldAlert, Headphones, Users,
  ClipboardList, CalendarClock, RefreshCw, CalendarCheck,
  ShieldCheck, Wallet, Printer, Activity, ChevronDown,
  ChevronUp, Milestone, TriangleAlert, Layers,
} from 'lucide-react';

/* ─── Types ────────────────────────────────────────────────────────── */
interface Risk {
  id: string; title: string; category: string; risk_score: number;
  status: string; owner_id: string | null; mitigation_plan: string | null;
  contingency_plan: string | null; due_date: string | null; updated_at: string;
}

interface MilestoneLite {
  id: string; title: string; status: string; due_date: string | null;
}

interface Props { project: Project; }

/* ─── Helpers ───────────────────────────────────────────────────────── */
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

function healthLabel(score: number) {
  if (score >= 80) return { label: 'Excellent', color: 'bg-emerald-500 text-white' };
  if (score >= 65) return { label: 'Good',      color: 'bg-indigo-500 text-white' };
  if (score >= 45) return { label: 'Fair',      color: 'bg-amber-500 text-white' };
  if (score >= 25) return { label: 'At Risk',   color: 'bg-orange-500 text-white' };
  return                   { label: 'Critical', color: 'bg-red-600 text-white' };
}

/* ─── Component ─────────────────────────────────────────────────────── */
export function ProjectWeeklyDashboard({ project }: Props) {
  const [risks, setRisks]           = useState<Risk[]>([]);
  const [milestones, setMilestones] = useState<MilestoneLite[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showAllRisks, setShowAllRisks]     = useState(false);
  const [includeSubActs, setIncludeSubActs] = useState(false);
  const dashRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      supabase
        .from('project_risks')
        .select('id,title,category,risk_score,status,owner_id,mitigation_plan,contingency_plan,due_date,updated_at')
        .eq('project_id', project.id)
        .order('risk_score', { ascending: false }),
      supabase
        .from('project_milestones')
        .select('id,title,status,due_date')
        .eq('project_id', project.id)
        .order('due_date', { ascending: true, nullsFirst: false }),
    ]).then(([r, m]) => {
      if (!alive) return;
      setRisks(r.data || []);
      setMilestones(m.data || []);
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
    if (!project.endDate) return null;
    try { const e = parseISO(project.endDate); return isValid(e) ? differenceInDays(e, now) : null; }
    catch { return null; }
  }, [project.endDate, now]);

  /* Activities (top-level) */
  const activities     = project.activities || [];
  const totalActs      = activities.length;
  const completedActs  = activities.filter((a: any) => a.status === 'completed').length;
  const inProgressActs = activities.filter((a: any) => a.status === 'inProgress').length;
  const notStartedActs = Math.max(totalActs - completedActs - inProgressActs, 0);

  /* Sub-activities (for toggle) */
  const allSubActs          = activities.flatMap((a: any) => a.subActivities || []);
  const completedSubActs    = allSubActs.filter((s: any) => s.status === 'completed').length;
  const inProgressSubActs   = allSubActs.filter((s: any) => s.status === 'inProgress').length;

  const totalCount      = includeSubActs ? totalActs + allSubActs.length  : totalActs;
  const completedCount  = includeSubActs ? completedActs + completedSubActs : completedActs;
  const inProgressCount = includeSubActs ? inProgressActs + inProgressSubActs : inProgressActs;
  const notStartedCount = Math.max(totalCount - completedCount - inProgressCount, 0);
  const overallProgress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const pct = (n: number) => totalCount > 0 ? Math.round((n / totalCount) * 100) : 0;

  /* Overdue activities */
  const overdueActs = activities.filter((a: any) => {
    if (a.status === 'completed' || a.status === 'cancelled') return false;
    if (!a.endDate) return false;
    try { const e = parseISO(a.endDate); return isValid(e) && e < now; }
    catch { return false; }
  }).length;

  /* This-week due activities */
  const thisWeekDue = activities.filter((a: any) => {
    if (a.status === 'completed' || a.status === 'cancelled') return false;
    if (!a.endDate) return false;
    try {
      const e = parseISO(a.endDate);
      return isValid(e) && e >= weekStart && e <= weekEnd;
    } catch { return false; }
  }).length;

  /* Open actions (non-completed, non-cancelled) */
  const openActions = activities.filter(
    (a: any) => a.status !== 'completed' && a.status !== 'cancelled',
  ).length;

  /* Milestones */
  const totalMilestones     = milestones.length;
  const completedMilestones = milestones.filter(m => m.status === 'completed').length;
  const milestonePercent    = totalMilestones > 0
    ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

  /* Next upcoming milestone */
  const nextMilestone = milestones.find(m => m.status !== 'completed' && m.due_date) ?? null;
  const nextMilestoneDays = nextMilestone?.due_date
    ? (() => { try { const e = parseISO(nextMilestone.due_date!); return isValid(e) ? differenceInDays(e, now) : null; } catch { return null; } })()
    : null;

  /* Risks */
  const openRisks   = risks.filter(r => r.status === 'open');
  const topRisk     = openRisks[0] ?? null;
  const topRiskMeta = topRisk ? getRiskMeta(topRisk.risk_score)
    : { label: 'None', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-950/30', dot: 'bg-green-500' };

  /* Budget */
  const budget          = (project as any).budget ?? null;
  const budgetTotal     = budget?.total     ?? 0;
  const budgetAllocated = budget?.allocated ?? 0;
  const budgetCurrency  = budget?.currency  ?? 'USD';
  const budgetRemaining = budget?.remaining ?? (budgetTotal - budgetAllocated);
  const budgetUsedPct   = budgetTotal > 0 ? Math.round((budgetAllocated / budgetTotal) * 100) : 0;

  /* Team */
  const teamComposition = (project as any).team?.teamComposition ?? [];
  const teamMembers     = (project as any).team?.members ?? [];
  const teamCount       = teamComposition.length || teamMembers.length;

  /* Health score (0–100) */
  const healthScore = useMemo(() => {
    const actScore  = totalCount > 0 ? (completedCount / totalCount) * 40 : 20;
    const riskScore = openRisks.length === 0 ? 30 : Math.max(0, 30 - openRisks.length * 5);
    const msScore   = totalMilestones > 0 ? (completedMilestones / totalMilestones) * 30 : 15;
    return Math.min(100, Math.round(actScore + riskScore + msScore));
  }, [totalCount, completedCount, openRisks.length, totalMilestones, completedMilestones]);

  /* Progress over time (use endDate of completed activities as proxy) */
  const progressOverTime = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const ref  = subWeeks(now, 5 - i);
      const wEnd = endOfISOWeek(ref);
      const wNum = getISOWeek(ref);
      const done = activities.filter((a: any) => {
        if (a.status !== 'completed') return false;
        const dateStr = a.endDate || a.updatedAt;
        if (!dateStr) return true;
        try { const d = parseISO(dateStr); return isValid(d) && d <= wEnd; }
        catch { return false; }
      }).length;
      return { week: `W${wNum}`, progress: totalActs > 0 ? Math.round((done / totalActs) * 100) : 0 };
    });
  }, [activities, totalActs, now]);

  /* Donut data */
  const donutData = [
    { name: 'Completed',   value: completedCount,  color: '#6366f1' },
    { name: 'In Progress', value: inProgressCount,  color: '#8b5cf6' },
    { name: 'Not Started', value: notStartedCount,  color: '#cbd5e1' },
  ].filter(d => d.value > 0);

  /* Gradient ID unique per project */
  const gradId    = `pgGrad-${project.id}`;
  const statusMeta = STATUS_META[project.status ?? ''] ?? STATUS_META['draft'];
  const health     = healthLabel(healthScore);

  /* Print handler */
  const handlePrint = () => window.print();

  /* ─ Skeleton ─ */
  if (loading) {
    return (
      <div className="rounded-xl border bg-card p-5 animate-pulse space-y-3">
        <div className="h-4 bg-muted rounded w-56" />
        <div className="grid grid-cols-4 gap-3">
          {[0,1,2,3].map(i => <div key={i} className="h-20 bg-muted rounded-lg" />)}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="h-36 bg-muted rounded-lg" />
          <div className="col-span-2 h-36 bg-muted rounded-lg" />
        </div>
      </div>
    );
  }

  /* ─ Render ─ */
  return (
    <div ref={dashRef} className="rounded-xl border bg-card shadow-sm overflow-hidden print:shadow-none print:border-0" data-testid="project-weekly-dashboard">

      {/* ── Header bar ───────────────────────────────────────────────── */}
      <div className="bg-[#0F2041] px-4 py-2.5 flex items-center gap-2 flex-wrap">
        <TrendingUp className="h-4 w-4 text-indigo-300 flex-shrink-0" />
        <span className="text-white font-semibold text-sm">Weekly Project Dashboard</span>

        {/* Status */}
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${statusMeta.color}`}>
          {statusMeta.label}
        </span>

        {/* Health score */}
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ml-1 ${health.color}`}>
          ● Health {healthScore}/100 · {health.label}
        </span>

        <span className="text-white/50 text-xs hidden sm:block ml-auto">
          {periodLabel} · {periodRange}
        </span>

        {/* Print button */}
        <Button
          size="sm"
          variant="ghost"
          onClick={handlePrint}
          className="h-6 px-2 text-white/70 hover:text-white hover:bg-white/10 print:hidden"
          data-testid="dashboard-print-btn"
        >
          <Printer className="h-3.5 w-3.5 mr-1" />
          <span className="text-xs">Export</span>
        </Button>
      </div>

      <div className="p-4 space-y-3">

        {/* ── Row 1: 4 header cards ─────────────────────────────────── */}
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
                    <span className="text-[10px] text-muted-foreground">{teamCount} team member{teamCount !== 1 ? 's' : ''}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Reporting Period + days remaining */}
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
                    daysRemaining < 0  ? 'text-red-600 dark:text-red-400' :
                    daysRemaining <= 14 ? 'text-amber-600 dark:text-amber-400' :
                    'text-emerald-600 dark:text-emerald-400'
                  }`}>
                    {daysRemaining < 0
                      ? `${Math.abs(daysRemaining)}d overdue`
                      : daysRemaining === 0 ? 'Due today'
                      : `${daysRemaining}d remaining`}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Milestones + next one */}
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
                <div className="flex items-center gap-3 mb-1.5">
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 inline-block" />
                    {completedMilestones} Done
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-300 inline-block" />
                    {totalMilestones - completedMilestones} Left
                  </span>
                </div>
                {nextMilestone && (
                  <div className="border-t pt-1.5">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5 flex items-center gap-1">
                      <Milestone className="h-2.5 w-2.5" /> Next
                    </p>
                    <p className="text-[10px] font-medium leading-tight line-clamp-1">{nextMilestone.title}</p>
                    {nextMilestoneDays !== null && (
                      <p className={`text-[9px] font-semibold ${
                        nextMilestoneDays < 0  ? 'text-red-600 dark:text-red-400' :
                        nextMilestoneDays <= 7 ? 'text-amber-600 dark:text-amber-400' :
                        'text-muted-foreground'
                      }`}>
                        {nextMilestoneDays < 0
                          ? `${Math.abs(nextMilestoneDays)}d overdue`
                          : nextMilestoneDays === 0 ? 'Due today'
                          : `in ${nextMilestoneDays}d`}
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
              <Card className="border bg-indigo-50 dark:bg-indigo-950/30">
                <CardContent className="p-2 text-center">
                  <TrendingUp className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 mx-auto mb-0.5" />
                  <p className="text-[9px] text-muted-foreground leading-none">Progress</p>
                  <p className="text-lg font-bold text-indigo-700 dark:text-indigo-300 leading-tight">{overallProgress}%</p>
                </CardContent>
              </Card>
              <Card className="border bg-amber-50 dark:bg-amber-950/30">
                <CardContent className="p-2 text-center">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 mx-auto mb-0.5" />
                  <p className="text-[9px] text-muted-foreground leading-none">Challenges</p>
                  <p className="text-lg font-bold text-amber-700 dark:text-amber-300 leading-tight">{openRisks.length}</p>
                </CardContent>
              </Card>
              <Card className="border bg-blue-50 dark:bg-blue-950/30">
                <CardContent className="p-2 text-center">
                  <Clock3 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 mx-auto mb-0.5" />
                  <p className="text-[9px] text-muted-foreground leading-none">Open Actions</p>
                  <p className="text-lg font-bold text-blue-700 dark:text-blue-300 leading-tight">{openActions}</p>
                </CardContent>
              </Card>
              <Card className={`border ${topRiskMeta.bg}`}>
                <CardContent className="p-2 text-center">
                  <ShieldAlert className={`h-3.5 w-3.5 mx-auto mb-0.5 ${topRiskMeta.color}`} />
                  <p className="text-[9px] text-muted-foreground leading-none">Risk Level</p>
                  <p className={`text-sm font-bold leading-tight ${topRiskMeta.color}`}>{topRiskMeta.label}</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* ── Activity stats strip ─────────────────────────────────────── */}
        {totalActs > 0 && (
          <div className="grid grid-cols-3 gap-2">
            <div className={`rounded-lg border px-3 py-2 flex items-center gap-2 ${
              overdueActs > 0 ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900' : 'bg-muted/30'
            }`}>
              <TriangleAlert className={`h-4 w-4 flex-shrink-0 ${overdueActs > 0 ? 'text-red-500' : 'text-muted-foreground'}`} />
              <div>
                <p className={`text-lg font-bold leading-none ${overdueActs > 0 ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
                  {overdueActs}
                </p>
                <p className="text-[10px] text-muted-foreground">Overdue Activities</p>
              </div>
            </div>
            <div className={`rounded-lg border px-3 py-2 flex items-center gap-2 ${
              thisWeekDue > 0 ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900' : 'bg-muted/30'
            }`}>
              <CalendarClock className={`h-4 w-4 flex-shrink-0 ${thisWeekDue > 0 ? 'text-amber-500' : 'text-muted-foreground'}`} />
              <div>
                <p className={`text-lg font-bold leading-none ${thisWeekDue > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'}`}>
                  {thisWeekDue}
                </p>
                <p className="text-[10px] text-muted-foreground">Due This Week</p>
              </div>
            </div>
            <div className="rounded-lg border px-3 py-2 flex items-center gap-2 bg-muted/30">
              <Activity className="h-4 w-4 flex-shrink-0 text-emerald-500" />
              <div>
                <p className="text-lg font-bold leading-none">{completedActs}</p>
                <p className="text-[10px] text-muted-foreground">
                  Completed{allSubActs.length > 0 && (
                    <button
                      onClick={() => setIncludeSubActs(p => !p)}
                      className="ml-1 underline underline-offset-2 text-indigo-500 hover:text-indigo-700"
                    >
                      {includeSubActs ? '(+sub ✓)' : '(+sub?)'}
                    </button>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Budget bar ───────────────────────────────────────────────── */}
        {budgetTotal > 0 && (
          <Card className="border bg-muted/30">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <Wallet className="h-3.5 w-3.5 text-indigo-500 flex-shrink-0" />
                <span className="text-xs font-semibold text-muted-foreground">Budget Utilisation</span>
                <span className={`ml-auto text-xs font-bold ${
                  budgetUsedPct > 90 ? 'text-red-600 dark:text-red-400' :
                  budgetUsedPct > 75 ? 'text-amber-600 dark:text-amber-400' :
                  'text-indigo-600 dark:text-indigo-400'
                }`}>{budgetUsedPct}%</span>
              </div>
              <Progress value={budgetUsedPct} className="h-2" />
              <div className="flex items-center justify-between mt-1.5 text-[10px] text-muted-foreground flex-wrap gap-1">
                <span>Allocated: <span className="font-semibold text-foreground">{budgetAllocated.toLocaleString()} {budgetCurrency}</span></span>
                <span>Total: <span className="font-semibold text-foreground">{budgetTotal.toLocaleString()} {budgetCurrency}</span></span>
                <span>Remaining: <span className={`font-semibold ${budgetRemaining < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {budgetRemaining.toLocaleString()} {budgetCurrency}
                </span></span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Row 2: Donut + Chart ─────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

          {/* Donut */}
          <Card className="border bg-muted/30">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted-foreground">Implementation Progress</p>
                {allSubActs.length > 0 && (
                  <button
                    onClick={() => setIncludeSubActs(p => !p)}
                    className="flex items-center gap-0.5 text-[9px] text-indigo-500 hover:text-indigo-700 border border-indigo-200 dark:border-indigo-800 rounded px-1.5 py-0.5"
                    data-testid="include-sub-toggle"
                  >
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
                        <Pie data={donutData} innerRadius="62%" outerRadius="82%"
                          dataKey="value" strokeWidth={0} startAngle={90} endAngle={-270}>
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

          {/* Progress over time */}
          <Card className="border bg-muted/30 md:col-span-2">
            <CardContent className="p-3">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Progress Over Time</p>
              <ResponsiveContainer width="100%" height={108}>
                <AreaChart data={progressOverTime} margin={{ top: 28, right: 12, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }}
                    axisLine={false} tickLine={false} ticks={[0, 25, 50, 75, 100]} />
                  <Tooltip formatter={(v: number) => [`${v}%`, 'Progress']}
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid rgba(0,0,0,0.1)' }} />
                  <Area type="monotone" dataKey="progress" stroke="#6366f1" strokeWidth={2}
                    fill={`url(#${gradId})`}
                    dot={(props: any) => {
                      const isLast = props.index === progressOverTime.length - 1;
                      return (
                        <circle key={props.index} cx={props.cx} cy={props.cy}
                          r={isLast ? 4 : 3} fill="#6366f1"
                          stroke={isLast ? '#fff' : 'none'} strokeWidth={isLast ? 2 : 0} />
                      );
                    }}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                  >
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

        {/* ── Top challenge block ──────────────────────────────────────── */}
        {topRisk ? (
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-muted/60 px-3 py-2 border-b flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Active Challenge (Highest Risk)
              </span>
              <Badge variant="outline" className={`ml-auto text-[10px] capitalize ${topRiskMeta.color}`}>
                {topRiskMeta.label}
              </Badge>
            </div>
            <div className="p-3 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3">
              {[
                { label: 'Challenge Identified', value: topRisk.title,
                  icon: <AlertTriangle className="h-3 w-3 text-amber-500 flex-shrink-0" /> },
                { label: 'Support Needed', value: topRisk.contingency_plan || '—',
                  icon: <Headphones className="h-3 w-3 text-indigo-500 flex-shrink-0" /> },
                { label: 'Responsible Unit',
                  value: topRisk.category ? topRisk.category.charAt(0).toUpperCase() + topRisk.category.slice(1) : '—',
                  icon: <Users className="h-3 w-3 text-blue-500 flex-shrink-0" /> },
                { label: 'Action Required', value: topRisk.mitigation_plan || '—',
                  icon: <ClipboardList className="h-3 w-3 text-violet-500 flex-shrink-0" /> },
                { label: 'Deadline',
                  value: topRisk.due_date && isValid(parseISO(topRisk.due_date))
                    ? format(parseISO(topRisk.due_date), 'd MMM yyyy') : '—',
                  icon: <CalendarClock className="h-3 w-3 text-rose-500 flex-shrink-0" /> },
                { label: 'Follow-up Status',
                  value: FOLLOW_UP_LABELS[topRisk.status] ?? topRisk.status,
                  highlight: topRisk.status === 'open',
                  icon: <RefreshCw className="h-3 w-3 text-indigo-500 flex-shrink-0" /> },
                { label: 'Resolution Date',
                  value: ['mitigated','closed','accepted'].includes(topRisk.status) && isValid(parseISO(topRisk.updated_at))
                    ? format(parseISO(topRisk.updated_at), 'd MMM yyyy') : 'Pending',
                  icon: <CalendarCheck className="h-3 w-3 text-teal-500 flex-shrink-0" /> },
                { label: 'Risk Level', value: topRiskMeta.label, riskColor: topRiskMeta.color,
                  icon: <ShieldCheck className={`h-3 w-3 flex-shrink-0 ${topRiskMeta.color}`} /> },
              ].map(cell => (
                <div key={cell.label} className="space-y-0.5">
                  <div className="flex items-center gap-1 mb-0.5">
                    {cell.icon}
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

        {/* ── All open risks table ─────────────────────────────────────── */}
        {openRisks.length > 1 && (
          <div className="border rounded-lg overflow-hidden">
            <button
              onClick={() => setShowAllRisks(p => !p)}
              className="w-full px-3 py-2 bg-muted/40 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted/70 transition-colors"
              data-testid="toggle-all-risks"
            >
              <ShieldAlert className="h-3.5 w-3.5 text-orange-500" />
              All Open Risks ({openRisks.length})
              {showAllRisks
                ? <ChevronUp className="h-3.5 w-3.5 ml-auto" />
                : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
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
                          {r.category}
                          {r.due_date && isValid(parseISO(r.due_date)) && (
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
    </div>
  );
}
