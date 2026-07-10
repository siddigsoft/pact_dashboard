import { useEffect, useState, useMemo } from 'react';
import {
  format, getISOWeek, startOfISOWeek, endOfISOWeek,
  parseISO, isValid, subWeeks, differenceInDays,
} from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Project } from '@/types/project';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, LabelList,
} from 'recharts';
import {
  Flag, Calendar, Target, AlertTriangle,
  CheckCircle, TrendingUp, Clock3, ShieldAlert,
  Headphones, Users, ClipboardList, CalendarClock,
  RefreshCw, CalendarCheck, ShieldCheck, Wallet,
} from 'lucide-react';

interface Risk {
  id: string;
  title: string;
  category: string;
  risk_score: number;
  status: string;
  owner_id: string | null;
  mitigation_plan: string | null;
  contingency_plan: string | null;
  due_date: string | null;
  updated_at: string;
}

interface MilestoneLite {
  id: string;
  status: string;
}

interface Props {
  project: Project;
}

function getRiskMeta(score: number): { label: string; color: string; bg: string } {
  if (score >= 17) return { label: 'Critical', color: 'text-red-600 dark:text-red-400',      bg: 'bg-red-50 dark:bg-red-950/30' };
  if (score >= 10) return { label: 'High',     color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/30' };
  if (score >= 5)  return { label: 'Medium',   color: 'text-amber-600 dark:text-amber-400',   bg: 'bg-amber-50 dark:bg-amber-950/30' };
  return              { label: 'Low',      color: 'text-green-600 dark:text-green-400',   bg: 'bg-green-50 dark:bg-green-950/30' };
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  draft:     { label: 'Draft',     color: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300' },
  active:    { label: 'Active',    color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  onHold:    { label: 'On Hold',   color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  completed: { label: 'Completed', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
};

const FOLLOW_UP_LABELS: Record<string, string> = {
  open:      'In Progress',
  mitigated: 'Mitigated',
  accepted:  'Accepted',
  closed:    'Resolved',
};

export function ProjectWeeklyDashboard({ project }: Props) {
  const [risks, setRisks]           = useState<Risk[]>([]);
  const [milestones, setMilestones] = useState<MilestoneLite[]>([]);
  const [loading, setLoading]       = useState(true);

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
        .select('id,status')
        .eq('project_id', project.id),
    ]).then(([r, m]) => {
      if (!alive) return;
      setRisks(r.data || []);
      setMilestones(m.data || []);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [project.id]);

  const now = useMemo(() => new Date(), []);

  const weekNumber  = getISOWeek(now);
  const weekStart   = startOfISOWeek(now);
  const weekEnd     = endOfISOWeek(now);
  const periodLabel = `Week ${weekNumber}`;
  const periodRange = `${format(weekStart, 'd MMM')} – ${format(weekEnd, 'd MMM yyyy')}`;

  // Days remaining from project.endDate
  const daysRemaining = useMemo(() => {
    if (!project.endDate) return null;
    try {
      const end = parseISO(project.endDate);
      if (!isValid(end)) return null;
      return differenceInDays(end, now);
    } catch { return null; }
  }, [project.endDate, now]);

  const activities       = project.activities || [];
  const totalActs        = activities.length;
  const completedActs    = activities.filter((a: any) => a.status === 'completed').length;
  const inProgressActs   = activities.filter((a: any) => a.status === 'inProgress').length;
  const notStartedActs   = Math.max(totalActs - completedActs - inProgressActs, 0);
  const overallProgress  = totalActs > 0 ? Math.round((completedActs / totalActs) * 100) : 0;

  const totalMilestones     = milestones.length;
  const completedMilestones = milestones.filter(m => m.status === 'completed').length;
  const milestonePercent    = totalMilestones > 0
    ? Math.round((completedMilestones / totalMilestones) * 100)
    : 0;

  const openRisks   = risks.filter(r => r.status === 'open');
  const topRisk     = openRisks[0] ?? null;
  const topRiskMeta = topRisk
    ? getRiskMeta(topRisk.risk_score)
    : { label: 'None', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-950/30' };

  const openActions = activities.filter(
    (a: any) => a.status !== 'completed' && a.status !== 'cancelled',
  ).length;

  // Budget from project.budget
  const budget    = (project as any).budget ?? null;
  const budgetTotal     = budget?.total     ?? 0;
  const budgetAllocated = budget?.allocated ?? 0;
  const budgetCurrency  = budget?.currency  ?? 'USD';
  const budgetUsedPct   = budgetTotal > 0 ? Math.round((budgetAllocated / budgetTotal) * 100) : 0;

  // FIX: use activity.endDate (completed acts) as the completion proxy
  // since ProjectActivity has no updatedAt field.
  const progressOverTime = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const ref  = subWeeks(now, 5 - i);
      const wEnd = endOfISOWeek(ref);
      const wNum = getISOWeek(ref);
      const done = activities.filter((a: any) => {
        if (a.status !== 'completed') return false;
        // Use endDate as proxy for when the activity was completed
        const dateStr = a.endDate || a.updatedAt;
        if (!dateStr) return true; // no date — assume completed before now, count in last week only
        try {
          const d = parseISO(dateStr);
          return isValid(d) && d <= wEnd;
        } catch { return false; }
      }).length;
      return {
        week: `W${wNum}`,
        progress: totalActs > 0 ? Math.round((done / totalActs) * 100) : 0,
      };
    });
  }, [activities, totalActs, now]);

  const donutData = [
    { name: 'Completed',   value: completedActs,  color: '#6366f1' },
    { name: 'In Progress', value: inProgressActs,  color: '#8b5cf6' },
    { name: 'Not Started', value: notStartedActs,  color: '#cbd5e1' },
  ].filter(d => d.value > 0);

  const pct = (n: number) =>
    totalActs > 0 ? Math.round((n / totalActs) * 100) : 0;

  // Unique gradient ID per project to avoid SVG ID collision
  const gradId = `pgGrad-${project.id}`;

  const statusMeta = STATUS_META[project.status ?? ''] ?? STATUS_META['draft'];

  if (loading) {
    return (
      <div className="rounded-xl border bg-card p-5 animate-pulse space-y-3">
        <div className="h-4 bg-muted rounded w-56" />
        <div className="grid grid-cols-4 gap-3">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-20 bg-muted rounded-lg" />)}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="h-36 bg-muted rounded-lg" />
          <div className="col-span-2 h-36 bg-muted rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden" data-testid="project-weekly-dashboard">

      {/* ── Dark header bar ──────────────────────────────────────────── */}
      <div className="bg-[#0F2041] px-4 py-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-indigo-300" />
          <span className="text-white font-semibold text-sm">Weekly Project Dashboard</span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ml-1 ${statusMeta.color}`}>
            {statusMeta.label}
          </span>
        </div>
        <span className="text-white/50 text-xs hidden sm:block">
          {periodLabel} · {periodRange}
        </span>
      </div>

      <div className="p-4 space-y-3">

        {/* ── Row 1: Header cards + Summary ─────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">

          {/* Project Name */}
          <Card className="border bg-muted/30">
            <CardContent className="p-3 flex items-start gap-2.5">
              <div className="p-1.5 rounded-md bg-indigo-500/10 mt-0.5 flex-shrink-0">
                <Flag className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Project Name</p>
                <p className="font-semibold text-sm leading-tight line-clamp-2">{project.name}</p>
                {(project as any).projectCode && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">{(project as any).projectCode}</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Reporting Period + Days Remaining */}
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
                    daysRemaining <= 14 ? 'text-amber-600 dark:text-amber-400' :
                    'text-emerald-600 dark:text-emerald-400'
                  }`}>
                    {daysRemaining < 0
                      ? `${Math.abs(daysRemaining)}d overdue`
                      : daysRemaining === 0
                        ? 'Due today'
                        : `${daysRemaining}d remaining`}
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
                  <span className="font-semibold text-sm">
                    {completedMilestones} of {totalMilestones}
                  </span>
                  <span className="text-indigo-600 dark:text-indigo-400 text-xs font-bold ml-auto">
                    {milestonePercent}%
                  </span>
                </div>
                <Progress value={milestonePercent} className="h-1.5 mt-1 mb-1.5" />
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 inline-block" />
                    {completedMilestones} Done
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-300 inline-block" />
                    {totalMilestones - completedMilestones} Left
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary panel */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest px-0.5">
              Summary
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              <Card className="border bg-indigo-50 dark:bg-indigo-950/30">
                <CardContent className="p-2 text-center">
                  <TrendingUp className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 mx-auto mb-0.5" />
                  <p className="text-[9px] text-muted-foreground leading-none">Progress</p>
                  <p className="text-lg font-bold text-indigo-700 dark:text-indigo-300 leading-tight">
                    {overallProgress}%
                  </p>
                </CardContent>
              </Card>
              <Card className="border bg-amber-50 dark:bg-amber-950/30">
                <CardContent className="p-2 text-center">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 mx-auto mb-0.5" />
                  <p className="text-[9px] text-muted-foreground leading-none">Challenges</p>
                  <p className="text-lg font-bold text-amber-700 dark:text-amber-300 leading-tight">
                    {openRisks.length}
                  </p>
                </CardContent>
              </Card>
              <Card className="border bg-blue-50 dark:bg-blue-950/30">
                <CardContent className="p-2 text-center">
                  <Clock3 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 mx-auto mb-0.5" />
                  <p className="text-[9px] text-muted-foreground leading-none">Open Actions</p>
                  <p className="text-lg font-bold text-blue-700 dark:text-blue-300 leading-tight">
                    {openActions}
                  </p>
                </CardContent>
              </Card>
              <Card className={`border ${topRiskMeta.bg}`}>
                <CardContent className="p-2 text-center">
                  <ShieldAlert className={`h-3.5 w-3.5 mx-auto mb-0.5 ${topRiskMeta.color}`} />
                  <p className="text-[9px] text-muted-foreground leading-none">Risk Level</p>
                  <p className={`text-sm font-bold leading-tight ${topRiskMeta.color}`}>
                    {topRiskMeta.label}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* ── Budget bar (only if budget data exists) ────────────────── */}
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
              <div className="flex items-center justify-between mt-1.5 text-[10px] text-muted-foreground">
                <span>Allocated: <span className="font-semibold text-foreground">
                  {budgetAllocated.toLocaleString()} {budgetCurrency}
                </span></span>
                <span>Total: <span className="font-semibold text-foreground">
                  {budgetTotal.toLocaleString()} {budgetCurrency}
                </span></span>
                <span>Remaining: <span className={`font-semibold ${
                  budget?.remaining < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
                }`}>
                  {(budget?.remaining ?? budgetTotal - budgetAllocated).toLocaleString()} {budgetCurrency}
                </span></span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Row 2: Donut + Progress over time ─────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

          {/* Donut chart */}
          <Card className="border bg-muted/30">
            <CardContent className="p-3">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Implementation Progress</p>
              {totalActs === 0 ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
                  <CheckCircle className="h-4 w-4 text-slate-300" />
                  No activities yet
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="relative h-[90px] w-[90px] flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={donutData}
                          innerRadius="62%"
                          outerRadius="82%"
                          dataKey="value"
                          strokeWidth={0}
                          startAngle={90}
                          endAngle={-270}
                        >
                          {donutData.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
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
                      { label: 'Completed',   n: completedActs,  color: 'bg-indigo-500' },
                      { label: 'In Progress', n: inProgressActs,  color: 'bg-violet-500' },
                      { label: 'Not Started', n: notStartedActs,  color: 'bg-slate-300 dark:bg-slate-600' },
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

          {/* Progress over time area chart */}
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
                  <XAxis
                    dataKey="week"
                    tick={{ fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tickFormatter={v => `${v}%`}
                    tick={{ fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    ticks={[0, 25, 50, 75, 100]}
                  />
                  <Tooltip
                    formatter={(v: number) => [`${v}%`, 'Progress']}
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid rgba(0,0,0,0.1)' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="progress"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fill={`url(#${gradId})`}
                    dot={(props: any) => {
                      const isLast = props.index === progressOverTime.length - 1;
                      return (
                        <circle
                          key={props.index}
                          cx={props.cx}
                          cy={props.cy}
                          r={isLast ? 4 : 3}
                          fill="#6366f1"
                          stroke={isLast ? '#fff' : 'none'}
                          strokeWidth={isLast ? 2 : 0}
                        />
                      );
                    }}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                  >
                    <LabelList
                      dataKey="progress"
                      position="top"
                      content={(props: any) => {
                        const { x, y, value, index } = props;
                        if (index !== progressOverTime.length - 1 || value === 0) return null;
                        return (
                          <g key={index}>
                            <rect x={x - 16} y={y - 22} width={32} height={16} rx={4} fill="#6366f1" />
                            <text x={x} y={y - 10} textAnchor="middle" fill="#fff" fontSize={9} fontWeight={700}>
                              {value}%
                            </text>
                          </g>
                        );
                      }}
                    />
                  </Area>
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* ── Challenge block from top open risk ────────────────────── */}
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
                {
                  label: 'Challenge Identified',
                  value: topRisk.title,
                  icon: <AlertTriangle className="h-3 w-3 text-amber-500 flex-shrink-0" />,
                },
                {
                  label: 'Support Needed',
                  value: topRisk.contingency_plan || '—',
                  icon: <Headphones className="h-3 w-3 text-indigo-500 flex-shrink-0" />,
                },
                {
                  label: 'Responsible Unit',
                  value: topRisk.category
                    ? topRisk.category.charAt(0).toUpperCase() + topRisk.category.slice(1)
                    : '—',
                  icon: <Users className="h-3 w-3 text-blue-500 flex-shrink-0" />,
                },
                {
                  label: 'Action Required',
                  value: topRisk.mitigation_plan || '—',
                  icon: <ClipboardList className="h-3 w-3 text-violet-500 flex-shrink-0" />,
                },
                {
                  label: 'Deadline',
                  value: topRisk.due_date && isValid(parseISO(topRisk.due_date))
                    ? format(parseISO(topRisk.due_date), 'd MMM yyyy')
                    : '—',
                  icon: <CalendarClock className="h-3 w-3 text-rose-500 flex-shrink-0" />,
                },
                {
                  label: 'Follow-up Status',
                  value: FOLLOW_UP_LABELS[topRisk.status] ?? topRisk.status,
                  highlight: topRisk.status === 'open',
                  icon: <RefreshCw className="h-3 w-3 text-indigo-500 flex-shrink-0" />,
                },
                {
                  label: 'Resolution Date',
                  value: ['mitigated', 'closed', 'accepted'].includes(topRisk.status) &&
                    isValid(parseISO(topRisk.updated_at))
                    ? format(parseISO(topRisk.updated_at), 'd MMM yyyy')
                    : 'Pending',
                  icon: <CalendarCheck className="h-3 w-3 text-teal-500 flex-shrink-0" />,
                },
                {
                  label: 'Risk Level',
                  value: topRiskMeta.label,
                  riskColor: topRiskMeta.color,
                  icon: <ShieldCheck className={`h-3 w-3 flex-shrink-0 ${topRiskMeta.color}`} />,
                },
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
      </div>
    </div>
  );
}
