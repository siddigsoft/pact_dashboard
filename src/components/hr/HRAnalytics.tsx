import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area, CartesianGrid,
} from 'recharts';
import { format, subMonths, parseISO, startOfMonth } from 'date-fns';

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
        .select('id,role,department_id,contract_type,created_at,is_employee')
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
        .select('id,user_id,leave_type,start_date,duration_days,status')
        .gte('start_date', sixMonthsAgo)
        .eq('status', 'approved');
      return data ?? [];
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

  /* Monthly headcount trend (joined per month, last 12 months) */
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
      cnt[k] = (cnt[k] ?? 0) + (Number(r.duration_days) || 1);
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
        .reduce((s: number, r: any) => s + (Number(r.duration_days) || 1), 0),
    }));
  }, [leaveReqs]);

  /* KPIs */
  const avgTenureMonths = useMemo(() => {
    if (!profiles.length) return 0;
    const now = Date.now();
    const total = profiles.reduce((s: number, p: any) => {
      if (!p.created_at) return s;
      return s + Math.round((now - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30));
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
          { label: 'Leave Days (6m)',     value: leaveReqs.reduce((s: number, r: any) => s + (Number(r.duration_days) || 1), 0), color: 'text-amber-700 dark:text-amber-300', accent: 'bg-amber-500' },
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
