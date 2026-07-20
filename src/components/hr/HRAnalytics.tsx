import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area, CartesianGrid,
} from 'recharts';
import { format, subMonths, parseISO, startOfMonth, isWithinInterval } from 'date-fns';
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

const COLORS = ['#3b82f6','#8b5cf6','#14b8a6','#f59e0b','#ef4444','#22c55e','#06b6d4','#ec4899'];

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-5">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{title}</p>
      </CardHeader>
      <CardContent className="px-4 pb-4">{children}</CardContent>
    </Card>
  );
}

export default function HRAnalytics() {
  const { data: profiles = [], isLoading: loadP } = useQuery({
    queryKey: ['hr-analytics-profiles'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id,role,department_id,contract_type,created_at,hire_date,is_employee')
        .eq('is_employee', true);
      return data ?? [];
    },
    staleTime: 120_000,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['hr-analytics-depts'],
    queryFn: async () => {
      const { data } = await supabase.from('departments').select('id,name');
      return data ?? [];
    },
    staleTime: 300_000,
  });

  const { data: leaveReqs = [], isLoading: loadL } = useQuery({
    queryKey: ['hr-analytics-leave'],
    queryFn: async () => {
      const sixMonthsAgo = subMonths(new Date(), 6).toISOString().slice(0, 10);
      const { data } = await supabase
        .from('leave_requests')
        .select('id,user_id,leave_type,start_date,days_count,status')
        .gte('start_date', sixMonthsAgo)
        .eq('status', 'approved');
      return data ?? [];
    },
    staleTime: 120_000,
  });

  // Pulse survey data for engagement trend
  const { data: pulseResponses = [], isLoading: loadPulse } = useQuery({
    queryKey: ['hr-analytics-pulse'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hr_pulse_responses' as any)
        .select('id, survey_id, responses, submitted_at');
      if (error?.code === '42P01') return [];
      return (data ?? []) as any[];
    },
    staleTime: 120_000,
  });

  const { data: pulseSurveys = [] } = useQuery({
    queryKey: ['hr-analytics-pulse-surveys'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hr_pulse_surveys' as any)
        .select('id, title, questions, starts_at, ends_at');
      if (error?.code === '42P01') return [];
      return (data ?? []) as any[];
    },
    staleTime: 120_000,
  });

  const deptMap = useMemo(() => {
    const m: Record<string, string> = {};
    departments.forEach((d: any) => { m[d.id] = d.name; });
    return m;
  }, [departments]);

  /* Contract type split */
  const contractData = useMemo(() => {
    const cnt: Record<string, number> = {};
    profiles.forEach((p: any) => {
      const k = p.contract_type ?? 'unset';
      cnt[k] = (cnt[k] ?? 0) + 1;
    });
    return Object.entries(cnt).map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }));
  }, [profiles]);

  /* Department headcount */
  const deptData = useMemo(() => {
    const cnt: Record<string, number> = {};
    profiles.forEach((p: any) => {
      const name = deptMap[p.department_id ?? ''] ?? 'Unassigned';
      cnt[name] = (cnt[name] ?? 0) + 1;
    });
    return Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  }, [profiles, deptMap]);

  /* Role distribution */
  const roleData = useMemo(() => {
    const cnt: Record<string, number> = {};
    profiles.forEach((p: any) => {
      const r = (p as any).role ?? 'Unassigned';
      cnt[r] = (cnt[r] ?? 0) + 1;
    });
    return Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }));
  }, [profiles]);

  /* Monthly headcount trend (last 12 months) */
  const headcountTrend = useMemo(() => {
    const months: { label: string; key: string }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      months.push({ label: format(d, 'MMM yy'), key: format(startOfMonth(d), 'yyyy-MM') });
    }
    return months.map(({ label, key }) => ({
      month: label,
      count: profiles.filter((p: any) => p.created_at && p.created_at.slice(0, 7) <= key).length,
    }));
  }, [profiles]);

  /* Leave utilization by type (last 6 months) */
  const leaveByType = useMemo(() => {
    const cnt: Record<string, number> = {};
    leaveReqs.forEach((r: any) => {
      const k = r.leave_type ?? 'other';
      cnt[k] = (cnt[k] ?? 0) + (Number(r.days_count) || 1);
    });
    return Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([name, days]) => ({
      name: name.charAt(0).toUpperCase() + name.replace(/_/g, ' ').slice(1), days,
    }));
  }, [leaveReqs]);

  /* Monthly leave trend */
  const leaveTrend = useMemo(() => {
    const months: { label: string; key: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      months.push({ label: format(d, 'MMM yy'), key: format(d, 'yyyy-MM') });
    }
    return months.map(({ label, key }) => ({
      month: label,
      days: leaveReqs
        .filter((r: any) => r.start_date?.startsWith(key))
        .reduce((s: number, r: any) => s + (Number(r.days_count) || 1), 0),
    }));
  }, [leaveReqs]);

  /* ── Engagement / Pulse Survey Analytics ── */
  // Calculate eNPS from the most recent NPS question responses across all surveys
  const { engagementTrend, latestENPS, npsCategory } = useMemo(() => {
    if (!pulseSurveys.length || !pulseResponses.length) {
      return { engagementTrend: [], latestENPS: null, npsCategory: null };
    }

    // Map survey_id → NPS question IDs
    const npsQBysurvey: Record<string, string[]> = {};
    pulseSurveys.forEach((s: any) => {
      const npsQs = (s.questions ?? []).filter((q: any) => q.type === 'nps' || q.type === 'rating');
      if (npsQs.length) npsQBysurvey[s.id] = npsQs.map((q: any) => q.id);
    });

    // Group responses by month, compute avg rating per month
    const byMonth: Record<string, number[]> = {};
    pulseResponses.forEach((r: any) => {
      const month = (r.submitted_at ?? '').slice(0, 7);
      if (!month) return;
      const survey = pulseSurveys.find((s: any) => s.id === r.survey_id);
      if (!survey) return;
      const npsQIds = npsQBysurvey[survey.id] ?? [];
      npsQIds.forEach(qId => {
        const val = r.responses?.[qId];
        if (val != null && !isNaN(Number(val))) {
          if (!byMonth[month]) byMonth[month] = [];
          byMonth[month].push(Number(val));
        }
      });
    });

    // Build trend for last 6 months
    const months: { label: string; key: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      months.push({ label: format(d, 'MMM yy'), key: format(d, 'yyyy-MM') });
    }
    const trend = months.map(({ label, key }) => {
      const vals = byMonth[key] ?? [];
      const avg = vals.length ? vals.reduce((s, n) => s + n, 0) / vals.length : null;
      return { month: label, avg, responses: vals.length };
    });

    // Calculate eNPS from all NPS-type responses across all surveys
    const allNpsVals: number[] = [];
    pulseSurveys.forEach((s: any) => {
      const npsQs = (s.questions ?? []).filter((q: any) => q.type === 'nps');
      npsQs.forEach((q: any) => {
        pulseResponses.forEach((r: any) => {
          if (r.survey_id === s.id) {
            const val = r.responses?.[q.id];
            if (val != null && !isNaN(Number(val))) allNpsVals.push(Number(val));
          }
        });
      });
    });

    let eNPS: number | null = null;
    let cat: string | null = null;
    if (allNpsVals.length >= 3) {
      const promoters = allNpsVals.filter(n => n >= 9).length;
      const detractors = allNpsVals.filter(n => n <= 6).length;
      eNPS = Math.round(((promoters - detractors) / allNpsVals.length) * 100);
      cat = eNPS >= 50 ? 'Excellent' : eNPS >= 20 ? 'Good' : eNPS >= 0 ? 'Needs Improvement' : 'Critical';
    }

    return { engagementTrend: trend, latestENPS: eNPS, npsCategory: cat };
  }, [pulseSurveys, pulseResponses]);

  const totalPulseResponses = pulseResponses.length;
  const activeSurveys = pulseSurveys.filter((s: any) => {
    try {
      return isWithinInterval(new Date(), { start: parseISO(s.starts_at), end: parseISO(s.ends_at) });
    } catch { return false; }
  }).length;

  /* KPIs */
  const avgTenureMonths = useMemo(() => {
    if (!profiles.length) return 0;
    const now = Date.now();
    const total = profiles.reduce((s: number, p: any) => {
      const startDate = p.hire_date || p.created_at;
      if (!startDate) return s;
      return s + Math.round((now - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24 * 30));
    }, 0);
    return Math.round(total / profiles.length);
  }, [profiles]);

  const isLoading = loadP || loadL;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Employees',     value: profiles.length,     color: 'text-[#0F2041] dark:text-blue-300', accent: 'bg-blue-500'   },
          { label: 'Avg Tenure (months)', value: avgTenureMonths,     color: 'text-violet-700 dark:text-violet-300', accent: 'bg-violet-500' },
          { label: 'Leave Days (6m)',     value: leaveReqs.reduce((s: number, r: any) => s + (Number(r.days_count) || 1), 0), color: 'text-amber-700 dark:text-amber-300', accent: 'bg-amber-500' },
          { label: 'Unique Roles',        value: new Set(profiles.map((p: any) => p.role).filter(Boolean)).size, color: 'text-teal-700 dark:text-teal-300', accent: 'bg-teal-500' },
        ].map(k => (
          <Card key={k.label} className="overflow-hidden">
            <div className={`h-1 ${k.accent}`} />
            <CardContent className="pt-3 pb-3 px-4">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className={`text-2xl font-bold ${k.color}`}>{isLoading ? '—' : k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Engagement & Pulse Survey Section ── */}
      <SectionCard title="Engagement & Pulse Surveys">
        {loadPulse ? (
          <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-4">
            {/* eNPS + summary KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="border rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">eNPS Score</p>
                {latestENPS != null ? (
                  <div>
                    <p className={cn('text-2xl font-bold',
                      latestENPS >= 50 ? 'text-emerald-600' : latestENPS >= 20 ? 'text-blue-600' : latestENPS >= 0 ? 'text-amber-600' : 'text-red-600')}>
                      {latestENPS > 0 ? '+' : ''}{latestENPS}
                    </p>
                    <Badge variant="outline" className={cn('text-[10px] mt-1',
                      latestENPS >= 50 ? 'border-emerald-300 text-emerald-700' : latestENPS >= 20 ? 'border-blue-300 text-blue-700' : latestENPS >= 0 ? 'border-amber-300 text-amber-700' : 'border-red-300 text-red-700')}>
                      {npsCategory}
                    </Badge>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
              </div>
              <div className="border rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Total Responses</p>
                <p className="text-2xl font-bold text-violet-600">{totalPulseResponses}</p>
              </div>
              <div className="border rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Total Surveys</p>
                <p className="text-2xl font-bold text-blue-600">{pulseSurveys.length}</p>
              </div>
              <div className="border rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Active Now</p>
                <p className="text-2xl font-bold text-emerald-600">{activeSurveys}</p>
              </div>
            </div>

            {/* eNPS interpretation guide */}
            {latestENPS != null && (
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  {latestENPS >= 20
                    ? <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                    : latestENPS >= 0
                    ? <Minus className="h-3.5 w-3.5 text-amber-600" />
                    : <TrendingDown className="h-3.5 w-3.5 text-red-600" />}
                  eNPS &gt;50: Excellent · 20–50: Good · 0–20: Needs attention · &lt;0: Critical
                </span>
                {latestENPS < 0 && (
                  <span className="flex items-center gap-1 text-red-600">
                    <AlertTriangle className="h-3 w-3" />Consider running a deeper engagement survey to identify root causes.
                  </span>
                )}
              </div>
            )}

            {/* Engagement trend chart */}
            {engagementTrend.some(m => m.responses > 0) ? (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Average engagement score trend (last 6 months)</p>
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={engagementTrend} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="engGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#8b5cf6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}   />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={28} domain={[0, 10]} />
                    <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: any) => v != null ? [Number(v).toFixed(2), 'Avg score'] : ['—', 'Avg score']} />
                    <Area type="monotone" dataKey="avg" stroke="#8b5cf6" strokeWidth={2} fill="url(#engGrad)" name="Avg score" connectNulls />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-center py-6 text-sm text-muted-foreground">
                No pulse survey responses yet. Create and distribute a survey from the Pulse Surveys tab.
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {/* Headcount trend */}
      <SectionCard title="Headcount Growth — Last 12 Months">
        {isLoading ? <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">Loading…</div> : (
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={headcountTrend} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="hcGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}    />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={28} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} fill="url(#hcGrad)" name="Staff" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      {/* 2-col: contract split + dept headcount */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <SectionCard title="Contract Type Distribution">
          {isLoading ? <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">Loading…</div> : (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={contractData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`} labelLine={false}>
                  {contractData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard title="Department Headcount">
          {isLoading ? <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">Loading…</div> : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={deptData} layout="vertical" margin={{ left: 4, right: 24, top: 0, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="count" fill="#1D3461" radius={[0, 3, 3, 0]} name="Staff" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>

      {/* Role distribution */}
      <SectionCard title="Role Distribution (Top 10)">
        {isLoading ? <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">Loading…</div> : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={roleData} margin={{ left: 4, right: 24, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval={0} angle={-25} textAnchor="end" height={48} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={28} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Staff">
                {roleData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      {/* Leave analytics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <SectionCard title="Leave by Type — Last 6 Months (Days)">
          {isLoading ? <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">Loading…</div> : leaveByType.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No approved leave in the last 6 months.</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={leaveByType} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={28} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="days" radius={[4, 4, 0, 0]} name="Days taken">
                  {leaveByType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard title="Monthly Leave Volume Trend">
          {isLoading ? <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">Loading…</div> : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={leaveTrend} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="leaveGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={28} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="days" stroke="#f59e0b" strokeWidth={2} fill="url(#leaveGrad)" name="Leave days" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
