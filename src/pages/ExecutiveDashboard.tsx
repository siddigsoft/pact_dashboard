import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Loader2, RefreshCw, Users, FolderOpen, MapPin, DollarSign,
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Clock,
  BarChart3, ArrowRight, Shield, Activity, Target, Zap,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  RadialBarChart, RadialBar, Cell, BarChart, Bar,
} from 'recharts';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { formatNumber } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';

interface OrgKPIs {
  totalStaff: number;
  activeStaff: number;
  fieldStaff: number;
  pendingApprovals: number;
}
interface ProjectKPIs {
  total: number;
  active: number;
  completed: number;
  atRisk: number;
  healthData: { name: string; value: number; fill: string }[];
}
interface FinKPIs {
  totalBudget: number;
  totalSpent: number;
  utilizationPct: number;
  overBudgetCount: number;
  monthlyTrend: { month: string; spent: number; budget: number }[];
}
interface MMPKPIs {
  totalSites: number;
  visitedSites: number;
  coveragePct: number;
  activeCycles: number;
  pendingVisits: number;
}
interface HRKPIs {
  pendingLeave: number;
  onLeaveToday: number;
  pendingContracts: number;
  openPositions: number;
}

const SCORE_COLOR = (pct: number) =>
  pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444';

function KPICard({
  title, value, sub, icon: Icon, trend, trendLabel, color = 'text-foreground', href, loading,
}: {
  title: string; value: string | number; sub?: string; icon: React.ElementType;
  trend?: 'up' | 'down' | 'neutral'; trendLabel?: string; color?: string; href?: string; loading?: boolean;
}) {
  return (
    <Card className="relative overflow-hidden hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1 min-w-0 flex-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{title}</p>
            {loading ? (
              <div className="h-7 w-16 bg-muted animate-pulse rounded" />
            ) : (
              <p className={cn('text-2xl font-bold tabular-nums', color)} data-testid={`kpi-${title.toLowerCase().replace(/\s+/g, '-')}`}>
                {value}
              </p>
            )}
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
            {trend && trendLabel && (
              <div className={cn('flex items-center gap-1 text-xs font-medium', trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-muted-foreground')}>
                {trend === 'up' ? <TrendingUp className="h-3 w-3" /> : trend === 'down' ? <TrendingDown className="h-3 w-3" /> : null}
                {trendLabel}
              </div>
            )}
          </div>
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 ml-2">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
        {href && (
          <Link to={href} className="absolute inset-0" aria-label={`Go to ${title}`} />
        )}
      </CardContent>
    </Card>
  );
}

export default function ExecutiveDashboard() {
  const { hasAnyRole } = useAuthorization();
  const canAccess = hasAnyRole(['super_admin', 'admin', 'Admin', 'country_director', 'countryDirector', 'fom', 'FOM']);

  const [org, setOrg] = useState<OrgKPIs | null>(null);
  const [proj, setProj] = useState<ProjectKPIs | null>(null);
  const [fin, setFin] = useState<FinKPIs | null>(null);
  const [mmp, setMMP] = useState<MMPKPIs | null>(null);
  const [hr, setHR] = useState<HRKPIs | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const todayStr = format(now, 'yyyy-MM-dd');

      const [
        profilesRes, projectsRes, budgetRes, tbRes, siteRes, visitRes, cycleRes,
      ] = await Promise.all([
        supabase.from('profiles').select('id, is_active, role, hub_id').limit(2000),
        supabase.from('projects').select('id, status, health_score').limit(1000),
        supabase.from('acct_budget_lines').select('account_id, budget_amount').limit(5000),
        supabase.rpc('acct_trial_balance' as any, { p_period_id: null, p_branch_id: null, p_fund_id: null } as any).limit(5000),
        supabase.from('master_sites').select('id, latitude, longitude').limit(3000),
        supabase.from('site_visits').select('id, site_id, status').limit(5000),
        supabase.from('mmp_files').select('id, status').limit(100),
      ]);

      // Org KPIs
      const allProfiles = profilesRes.data ?? [];
      const activeStaff = allProfiles.filter((p: any) => p.is_active !== false).length;
      const fieldRoles = ['data_collector', 'dataCollector', 'field_officer', 'coordinator', 'supervisor'];
      const fieldStaff = allProfiles.filter((p: any) => fieldRoles.includes(p.role ?? '')).length;
      setOrg({ totalStaff: allProfiles.length, activeStaff, fieldStaff, pendingApprovals: 0 });

      // Project KPIs
      const allProj = projectsRes.data ?? [];
      const active = allProj.filter((p: any) => p.status === 'active' || p.status === 'in_progress').length;
      const completed = allProj.filter((p: any) => p.status === 'completed').length;
      const atRisk = allProj.filter((p: any) => (p.health_score ?? 100) < 50).length;
      setProj({
        total: allProj.length, active, completed, atRisk,
        healthData: [
          { name: 'Active', value: active, fill: '#6366f1' },
          { name: 'Completed', value: completed, fill: '#22c55e' },
          { name: 'At Risk', value: atRisk, fill: '#ef4444' },
          { name: 'Other', value: Math.max(0, allProj.length - active - completed - atRisk), fill: '#94a3b8' },
        ],
      });

      // Financial KPIs + monthly trend
      const totalBudget = (budgetRes.data ?? []).reduce((s: number, b: any) => s + Number(b.budget_amount ?? 0), 0);
      const tbRows: any[] = Array.isArray(tbRes.data) ? tbRes.data : [];
      const totalSpent = tbRows
        .filter((r: any) => (r.account_type ?? '') === 'expense')
        .reduce((s: number, r: any) => s + Math.abs(Number(r.net_balance ?? 0)), 0);
      const utilizationPct = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

      const monthlyTrend = await (async () => {
        const months = [];
        for (let i = 5; i >= 0; i--) {
          const mo = subMonths(now, i);
          const monthLabel = format(mo, 'MMM');
          months.push({ month: monthLabel, spent: 0, budget: totalBudget / 6 });
        }
        return months;
      })();

      setFin({ totalBudget, totalSpent, utilizationPct, overBudgetCount: 0, monthlyTrend });

      // MMP KPIs
      const sitesData = siteRes.data ?? [];
      const visitsData = visitRes.data ?? [];
      const visitedSiteIds = new Set(
        visitsData.filter((v: any) => v.status === 'completed').map((v: any) => v.site_id)
      );
      const visitedSites = sitesData.filter((s: any) => visitedSiteIds.has(s.id)).length;
      const cyclesData = cycleRes.data ?? [];
      const activeCycles = cyclesData.filter((c: any) => c.status === 'active' || c.status === 'open').length;
      const pendingVisits = visitsData.filter((v: any) => v.status === 'planned' || v.status === 'scheduled').length;
      setMMP({
        totalSites: sitesData.length,
        visitedSites,
        coveragePct: sitesData.length > 0 ? Math.round((visitedSites / sitesData.length) * 100) : 0,
        activeCycles,
        pendingVisits,
      });

      // HR KPIs (simple)
      setHR({ pendingLeave: 0, onLeaveToday: 0, pendingContracts: 0, openPositions: 0 });

      setLastRefresh(new Date());
    } catch (err) {
      console.error('Executive dashboard error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const handleRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (!canAccess) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-muted-foreground">Access restricted to senior management.</p>
    </div>
  );

  const overallScore = [
    mmp ? mmp.coveragePct : 0,
    fin ? Math.min(100, fin.utilizationPct < 90 ? 80 : fin.utilizationPct < 100 ? 60 : 40) : 0,
    proj ? (proj.total > 0 ? Math.round(((proj.active + proj.completed) / proj.total) * 100) : 0) : 0,
  ].reduce((s, v) => s + v, 0) / 3;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Executive Dashboard</h1>
          <p className="text-sm text-muted-foreground">Last updated {format(lastRefresh, 'MMM d, yyyy · HH:mm')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} data-testid="button-refresh-executive">
          <RefreshCw className={cn('h-4 w-4 mr-2', refreshing && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Org Health Score */}
      <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="p-5">
          <div className="flex items-center gap-6">
            <div className="relative h-20 w-20 shrink-0">
              <svg viewBox="0 0 36 36" className="h-20 w-20 -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="15.9" fill="none"
                  stroke={SCORE_COLOR(overallScore)}
                  strokeWidth="3"
                  strokeDasharray={`${overallScore} ${100 - overallScore}`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl font-bold" style={{ color: SCORE_COLOR(overallScore) }}>{Math.round(overallScore)}</span>
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground uppercase tracking-wide font-medium">Organisation Health Score</p>
              <p className="text-2xl font-bold mt-0.5">
                {overallScore >= 80 ? 'Excellent' : overallScore >= 60 ? 'Good' : overallScore >= 40 ? 'Needs Attention' : 'Critical'}
              </p>
              <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                <span>MMP Coverage: <strong className="text-foreground">{mmp?.coveragePct ?? 0}%</strong></span>
                <span>Budget Util: <strong className="text-foreground">{fin?.utilizationPct ?? 0}%</strong></span>
                <span>Active Projects: <strong className="text-foreground">{proj?.active ?? 0}</strong></span>
              </div>
            </div>
            <div className="ml-auto hidden md:flex items-center gap-2">
              <Badge variant="outline" className={cn('gap-1', overallScore >= 70 ? 'border-green-500 text-green-700' : 'border-amber-500 text-amber-700')}>
                <Activity className="h-3 w-3" />
                {overallScore >= 70 ? 'On Track' : 'Review Required'}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Module KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="Total Staff" value={loading ? '—' : (org?.totalStaff ?? 0)} sub={`${org?.fieldStaff ?? 0} field staff`} icon={Users} href="/employees" loading={loading} />
        <KPICard title="Active Projects" value={loading ? '—' : (proj?.active ?? 0)} sub={`${proj?.atRisk ?? 0} at risk`} icon={FolderOpen} color={proj?.atRisk ? 'text-amber-600' : 'text-foreground'} href="/projects" loading={loading} />
        <KPICard title="MMP Coverage" value={loading ? '—' : `${mmp?.coveragePct ?? 0}%`} sub={`${mmp?.visitedSites ?? 0} / ${mmp?.totalSites ?? 0} sites`} icon={MapPin} color={SCORE_COLOR(mmp?.coveragePct ?? 0)} trend={mmp && mmp.coveragePct >= 70 ? 'up' : 'down'} trendLabel={mmp && mmp.coveragePct >= 70 ? 'On target' : 'Below target'} href="/coverage-map" loading={loading} />
        <KPICard title="Budget Used" value={loading ? '—' : `${fin?.utilizationPct ?? 0}%`} sub={`${formatNumber(fin?.totalSpent ?? 0)} of ${formatNumber(fin?.totalBudget ?? 0)}`} icon={DollarSign} color={fin && fin.utilizationPct > 95 ? 'text-red-600' : fin && fin.utilizationPct > 80 ? 'text-amber-600' : 'text-foreground'} href="/accounting/budget-variance" loading={loading} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Budget trend */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              6-Month Spend Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <div className="h-40 bg-muted animate-pulse rounded" /> : (
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={fin?.monthlyTrend ?? []}>
                  <defs>
                    <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => formatNumber(v)} width={60} />
                  <Tooltip formatter={(v: number) => [formatNumber(v), 'Spent']} />
                  <Area type="monotone" dataKey="spent" stroke="#6366f1" fill="url(#spendGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Project health donut */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Project Status Mix
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <div className="h-40 bg-muted animate-pulse rounded" /> : (
              <>
                <ResponsiveContainer width="100%" height={120}>
                  <RadialBarChart cx="50%" cy="50%" innerRadius={30} outerRadius={55} data={proj?.healthData ?? []} startAngle={180} endAngle={0}>
                    <RadialBar dataKey="value" cornerRadius={4}>
                      {(proj?.healthData ?? []).map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </RadialBar>
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-1 mt-1">
                  {(proj?.healthData ?? []).map(d => (
                    <div key={d.name} className="flex items-center gap-1.5 text-xs">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: d.fill }} />
                      <span className="text-muted-foreground">{d.name}</span>
                      <span className="font-semibold ml-auto">{d.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick links & alerts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Quick links */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Quick Links
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {[
              { label: 'Finance Dashboard', href: '/accounting/finance-dashboard', icon: BarChart3 },
              { label: 'MMP Coverage Map', href: '/coverage-map', icon: MapPin },
              { label: 'Approvals Hub', href: '/approvals', icon: CheckCircle2 },
              { label: 'Budget vs Actuals', href: '/accounting/budget-variance', icon: DollarSign },
              { label: 'Period Close', href: '/accounting/period-close', icon: Shield },
              { label: 'HR Hub', href: '/hr', icon: Users },
            ].map(({ label, href, icon: Icon }) => (
              <Link
                key={href}
                to={href}
                className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted transition-colors group"
                data-testid={`link-${label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <div className="flex items-center gap-2 text-sm">
                  <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  {label}
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            ))}
          </CardContent>
        </Card>

        {/* Status indicators */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Module Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              {
                label: 'MMP Coverage', value: `${mmp?.coveragePct ?? 0}%`,
                status: (mmp?.coveragePct ?? 0) >= 70 ? 'ok' : 'warn',
                sub: `${mmp?.activeCycles ?? 0} active cycles · ${mmp?.pendingVisits ?? 0} pending visits`,
              },
              {
                label: 'Budget Utilization', value: `${fin?.utilizationPct ?? 0}%`,
                status: (fin?.utilizationPct ?? 0) <= 90 ? 'ok' : 'warn',
                sub: `${formatNumber(fin?.totalSpent ?? 0)} spent of ${formatNumber(fin?.totalBudget ?? 0)}`,
              },
              {
                label: 'Projects', value: `${proj?.active ?? 0} active`,
                status: (proj?.atRisk ?? 0) === 0 ? 'ok' : 'warn',
                sub: `${proj?.completed ?? 0} completed · ${proj?.atRisk ?? 0} at risk`,
              },
              {
                label: 'Workforce', value: `${org?.activeStaff ?? 0} active`,
                status: 'ok',
                sub: `${org?.fieldStaff ?? 0} field · ${org?.totalStaff ?? 0} total staff`,
              },
            ].map(({ label, value, status, sub }) => (
              <div key={label} className="flex items-start gap-3">
                {status === 'ok'
                  ? <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  : <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{label}</p>
                    <span className={cn('text-sm font-bold', status === 'ok' ? 'text-green-600' : 'text-amber-600')}>{value}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{sub}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
