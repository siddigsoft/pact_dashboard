import { useEffect, useState, useMemo } from 'react';
import {
  format, getISOWeek, startOfISOWeek, endOfISOWeek,
  parseISO, isValid, subWeeks,
} from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Project } from '@/types/project';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import {
  Flag, Calendar, Target, AlertTriangle,
  CheckCircle, TrendingUp, Clock3, ShieldAlert,
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
  if (score >= 17) return { label: 'Critical', color: 'text-red-600 dark:text-red-400',   bg: 'bg-red-50 dark:bg-red-950/30' };
  if (score >= 10) return { label: 'High',     color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/30' };
  if (score >= 5)  return { label: 'Medium',   color: 'text-amber-600 dark:text-amber-400',   bg: 'bg-amber-50 dark:bg-amber-950/30' };
  return              { label: 'Low',      color: 'text-green-600 dark:text-green-400',   bg: 'bg-green-50 dark:bg-green-950/30' };
}

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

  const now = new Date();

  const weekNumber  = getISOWeek(now);
  const weekStart   = startOfISOWeek(now);
  const weekEnd     = endOfISOWeek(now);
  const periodLabel = `Week ${weekNumber}`;
  const periodRange = `${format(weekStart, 'd MMM')} – ${format(weekEnd, 'd MMM yyyy')}`;

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

  const openRisks  = risks.filter(r => r.status === 'open');
  const topRisk    = openRisks[0] ?? null;
  const topRiskMeta = topRisk
    ? getRiskMeta(topRisk.risk_score)
    : { label: 'None', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-950/30' };

  const openActions = activities.filter(
    (a: any) => a.status !== 'completed' && a.status !== 'cancelled',
  ).length;

  const progressOverTime = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const ref    = subWeeks(now, 5 - i);
      const wEnd   = endOfISOWeek(ref);
      const wNum   = getISOWeek(ref);
      const done   = activities.filter((a: any) => {
        if (a.status !== 'completed' || !a.updatedAt) return false;
        try {
          const d = parseISO(a.updatedAt);
          return isValid(d) && d <= wEnd;
        } catch { return false; }
      }).length;
      return { week: `W${wNum}`, progress: totalActs > 0 ? Math.round((done / totalActs) * 100) : 0 };
    });
  }, [activities, totalActs]);

  const donutData = [
    { name: 'Completed',   value: completedActs,  color: '#6366f1' },
    { name: 'In Progress', value: inProgressActs,  color: '#8b5cf6' },
    { name: 'Not Started', value: notStartedActs,  color: '#cbd5e1' },
  ].filter(d => d.value > 0);

  const pct = (n: number) =>
    totalActs > 0 ? Math.round((n / totalActs) * 100) : 0;

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
                <p className="font-semibold text-sm leading-tight truncate">{project.name}</p>
              </div>
            </CardContent>
          </Card>

          {/* Reporting Period */}
          <Card className="border bg-muted/30">
            <CardContent className="p-3 flex items-start gap-2.5">
              <div className="p-1.5 rounded-md bg-indigo-500/10 mt-0.5 flex-shrink-0">
                <Calendar className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Reporting Period</p>
                <p className="font-semibold text-sm">{periodLabel}</p>
                <p className="text-[10px] text-muted-foreground">{periodRange}</p>
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

        {/* ── Row 2: Donut + Progress over time ─────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

          {/* Donut chart */}
          <Card className="border bg-muted/30">
            <CardContent className="p-3">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Implementation Progress</p>
              <div className="flex items-center gap-4">
                <div className="relative h-[90px] w-[90px] flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donutData.length ? donutData : [{ name: 'empty', value: 1, color: '#e2e8f0' }]}
                        innerRadius="62%"
                        outerRadius="82%"
                        dataKey="value"
                        strokeWidth={0}
                        startAngle={90}
                        endAngle={-270}
                      >
                        {(donutData.length
                          ? donutData
                          : [{ color: '#e2e8f0' }]
                        ).map((entry, i) => (
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
            </CardContent>
          </Card>

          {/* Progress over time line chart */}
          <Card className="border bg-muted/30 md:col-span-2">
            <CardContent className="p-3">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Progress Over Time</p>
              <ResponsiveContainer width="100%" height={100}>
                <AreaChart data={progressOverTime} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="pgGrad" x1="0" y1="0" x2="0" y2="1">
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
                    fill="url(#pgGrad)"
                    dot={{ r: 3, fill: '#6366f1', strokeWidth: 0 }}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* ── Rows 3–4: Challenge block from top open risk ─────────── */}
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
                { label: 'Challenge Identified', value: topRisk.title },
                { label: 'Support Needed',       value: topRisk.contingency_plan || '—' },
                { label: 'Responsible Unit',      value: topRisk.category ? topRisk.category.charAt(0).toUpperCase() + topRisk.category.slice(1) : '—' },
                { label: 'Action Required',       value: topRisk.mitigation_plan || '—' },
                {
                  label: 'Deadline',
                  value: topRisk.due_date && isValid(parseISO(topRisk.due_date))
                    ? format(parseISO(topRisk.due_date), 'd MMM yyyy')
                    : '—',
                },
                {
                  label: 'Follow-up Status',
                  value: FOLLOW_UP_LABELS[topRisk.status] ?? topRisk.status,
                  highlight: topRisk.status === 'open',
                },
                {
                  label: 'Resolution Date',
                  value: ['mitigated', 'closed', 'accepted'].includes(topRisk.status) && isValid(parseISO(topRisk.updated_at))
                    ? format(parseISO(topRisk.updated_at), 'd MMM yyyy')
                    : 'Pending',
                },
                { label: 'Risk Level', value: topRiskMeta.label, riskColor: topRiskMeta.color },
              ].map(cell => (
                <div key={cell.label} className="space-y-0.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{cell.label}</p>
                  <p className={`text-xs font-medium leading-snug ${cell.riskColor ?? ''} ${cell.highlight ? 'text-indigo-600 dark:text-indigo-400' : ''}`}>
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
