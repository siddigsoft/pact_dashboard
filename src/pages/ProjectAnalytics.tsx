import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  BarChart3,
  FolderKanban,
  CheckCircle2,
  Clock3,
  AlertTriangle,
  XCircle,
  Download,
  ExternalLink,
  ArrowUpDown,
  Filter,
  TrendingUp,
} from 'lucide-react';
import { format, parseISO, isValid, differenceInDays } from 'date-fns';

import { supabase } from '@/integrations/supabase/client';
import { GradientStatCard } from '@/components/ui/gradient-stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PROJECT_TYPE_OPTIONS, getProjectFlow } from '@/config/projectFlows';
import { normaliseProjectType } from '@/types/project';

const STALL_THRESHOLD_DAYS = 14;

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
}

interface FlowLogRow {
  project_id: string;
  stage_id: string;
  stage_label: string;
  advanced_at: string;
}

interface ProfileRow {
  id: string;
  full_name: string;
}

interface AnalyticsData {
  projects: ProjectRow[];
  latestAdvancedAt: Record<string, string>;
  pms: ProfileRow[];
}

async function fetchAnalyticsData(): Promise<AnalyticsData> {
  const [projRes, logRes, pmRes] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, project_code, project_type, status, start_date, end_date, current_flow_stage, team'),
    supabase
      .from('project_flow_log')
      .select('project_id, stage_id, stage_label, advanced_at')
      .order('advanced_at', { ascending: false }),
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('status', 'approved')
      .order('full_name'),
  ]);

  if (projRes.error) throw new Error(projRes.error.message);

  const projects = (projRes.data ?? []) as ProjectRow[];

  const latestAdvancedAt: Record<string, string> = {};
  for (const row of (logRes.data ?? []) as FlowLogRow[]) {
    if (!latestAdvancedAt[row.project_id]) {
      latestAdvancedAt[row.project_id] = row.advanced_at;
    }
  }

  return {
    projects,
    latestAdvancedAt,
    pms: (pmRes.data ?? []) as ProfileRow[],
  };
}

function safeDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  try {
    const d = parseISO(s);
    return isValid(d) ? d : null;
  } catch {
    return null;
  }
}

function fmtDate(s: string | null | undefined): string {
  const d = safeDate(s);
  return d ? format(d, 'dd MMM yyyy') : '—';
}

type SortField = 'name' | 'type' | 'stage' | 'daysSince';
type SortDir = 'asc' | 'desc';

const STATUS_COLORS: Record<string, string> = {
  active: '#16a34a',
  completed: '#2563eb',
  onHold: '#f59e0b',
  draft: '#64748b',
  cancelled: '#dc2626',
};

const TYPE_COLORS = [
  '#1D3461', '#2563eb', '#16a34a', '#f59e0b', '#8b5cf6',
  '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#6366f1',
];

export default function ProjectAnalytics() {
  const navigate = useNavigate();

  const [typeFilter, setTypeFilter] = useState('all');
  const [pmFilter, setPmFilter] = useState('all');
  const [startFrom, setStartFrom] = useState('');
  const [startTo, setStartTo] = useState('');
  const [stallSort, setStallSort] = useState<{ field: SortField; dir: SortDir }>({ field: 'daysSince', dir: 'desc' });

  const { data, isLoading } = useQuery({
    queryKey: ['project_analytics'],
    queryFn: fetchAnalyticsData,
    staleTime: 60_000,
  });

  const filteredProjects = useMemo(() => {
    if (!data) return [];
    return data.projects.filter((p) => {
      if (typeFilter !== 'all' && normaliseProjectType(p.project_type) !== typeFilter) return false;
      if (pmFilter !== 'all') {
        const pm = (p.team as { projectManager?: string } | null)?.projectManager ?? '';
        if (pm !== pmFilter) return false;
      }
      const d = safeDate(p.start_date);
      if (startFrom && d && d < parseISO(startFrom)) return false;
      if (startTo && d && d > parseISO(startTo)) return false;
      return true;
    });
  }, [data, typeFilter, pmFilter, startFrom, startTo]);

  const stats = useMemo(() => {
    const total = filteredProjects.length;
    const active = filteredProjects.filter(p => p.status === 'active').length;
    const completed = filteredProjects.filter(p => p.status === 'completed').length;
    const onHoldOrCancelled = filteredProjects.filter(p => p.status === 'onHold' || p.status === 'cancelled').length;
    const now = new Date();
    const stalled = filteredProjects.filter(p => {
      if (p.status === 'completed' || p.status === 'cancelled') return false;
      const lastAdv = data?.latestAdvancedAt[p.id];
      if (!lastAdv) return false;
      const d = safeDate(lastAdv);
      return d ? differenceInDays(now, d) >= STALL_THRESHOLD_DAYS : false;
    }).length;
    return { total, active, completed, onHoldOrCancelled, stalled };
  }, [filteredProjects, data]);

  const stageDistribution = useMemo(() => {
    const counts: Record<string, { label: string; count: number }> = {};
    for (const p of filteredProjects) {
      const flow = getProjectFlow(normaliseProjectType(p.project_type));
      const stageId = p.current_flow_stage ?? flow.stages[0]?.id ?? 'unknown';
      const stage = flow.stages.find(s => s.id === stageId);
      const label = stage?.label ?? stageId;
      const key = label;
      if (!counts[key]) counts[key] = { label, count: 0 };
      counts[key].count += 1;
    }
    return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 15);
  }, [filteredProjects]);

  const completionByType = useMemo(() => {
    const byType: Record<string, { label: string; total: number; completed: number }> = {};
    for (const p of filteredProjects) {
      const type = normaliseProjectType(p.project_type);
      const flow = getProjectFlow(type);
      const label = flow.label.replace(' (Legacy)', '');
      if (!byType[type]) byType[type] = { label, total: 0, completed: 0 };
      byType[type].total += 1;
      if (p.status === 'completed') byType[type].completed += 1;
    }
    return Object.values(byType)
      .filter(v => v.total > 0)
      .map(v => ({
        label: v.label,
        total: v.total,
        completed: v.completed,
        rate: v.total > 0 ? Math.round((v.completed / v.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredProjects]);

  const stalledProjects = useMemo(() => {
    if (!data) return [];
    const now = new Date();
    const stalled = filteredProjects
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
        const daysSince = d ? differenceInDays(now, d) : 0;
        return {
          id: p.id,
          name: p.name,
          projectCode: p.project_code,
          type: getProjectFlow(normaliseProjectType(p.project_type)).label.replace(' (Legacy)', ''),
          stageName: stage?.label ?? stageId,
          lastAdvancedAt: lastAdv,
          daysSince,
          status: p.status,
        };
      });

    return stalled.sort((a, b) => {
      const { field, dir } = stallSort;
      let cmp = 0;
      if (field === 'name') cmp = a.name.localeCompare(b.name);
      else if (field === 'type') cmp = a.type.localeCompare(b.type);
      else if (field === 'stage') cmp = a.stageName.localeCompare(b.stageName);
      else cmp = a.daysSince - b.daysSince;
      return dir === 'asc' ? cmp : -cmp;
    });
  }, [filteredProjects, data, stallSort]);

  const uniquePMs = useMemo(() => {
    const names = new Set<string>();
    for (const p of data?.projects ?? []) {
      const pm = (p.team as { projectManager?: string } | null)?.projectManager;
      if (pm) names.add(pm);
    }
    return Array.from(names).sort();
  }, [data?.projects]);

  const handleSort = useCallback((field: SortField) => {
    setStallSort(prev => ({
      field,
      dir: prev.field === field && prev.dir === 'asc' ? 'desc' : 'asc',
    }));
  }, []);

  const downloadCSV = useCallback(() => {
    const rows = filteredProjects.map(p => {
      const flow = getProjectFlow(normaliseProjectType(p.project_type));
      const stageId = p.current_flow_stage ?? flow.stages[0]?.id ?? '';
      const stage = flow.stages.find(s => s.id === stageId);
      const lastAdv = data?.latestAdvancedAt[p.id];
      const d = safeDate(lastAdv);
      const daysSince = d ? differenceInDays(new Date(), d) : '';
      return {
        'Project Code': p.project_code,
        'Project Name': p.name,
        'Type': flow.label.replace(' (Legacy)', ''),
        'Status': p.status,
        'Current Stage': stage?.label ?? stageId,
        'Start Date': fmtDate(p.start_date),
        'End Date': fmtDate(p.end_date),
        'Project Manager': (p.team as { projectManager?: string } | null)?.projectManager ?? '',
        'Last Stage Advancement': lastAdv ? fmtDate(lastAdv) : '',
        'Days Since Last Advancement': daysSince,
      };
    });

    const headers = Object.keys(rows[0] ?? {});
    const lines = [
      headers.join(','),
      ...rows.map(r => headers.map(h => JSON.stringify((r as Record<string, string | number>)[h] ?? '')).join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `project-analytics-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredProjects, data]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-3 md:p-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-md bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center flex-shrink-0">
            <BarChart3 className="h-4.5 w-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Project Analytics</h1>
            <p className="text-xs text-muted-foreground">Loading data…</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-72 bg-muted animate-pulse rounded-lg" />
          <div className="h-72 bg-muted animate-pulse rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-3 md:p-4 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-md bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center flex-shrink-0">
            <BarChart3 className="h-4.5 w-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Project Analytics</h1>
            <p className="text-xs text-muted-foreground">Flow progress and health across all projects</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={downloadCSV}
          disabled={filteredProjects.length === 0}
          data-testid="button-export-csv"
        >
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Project Type</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-8 w-[180px] text-xs" data-testid="select-type-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {PROJECT_TYPE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Project Manager</Label>
              <Select value={pmFilter} onValueChange={setPmFilter}>
                <SelectTrigger className="h-8 w-[180px] text-xs" data-testid="select-pm-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All PMs</SelectItem>
                  {uniquePMs.map(name => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Start Date From</Label>
              <Input
                type="date"
                className="h-8 text-xs w-[150px]"
                value={startFrom}
                onChange={e => setStartFrom(e.target.value)}
                data-testid="input-start-from"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Start Date To</Label>
              <Input
                type="date"
                className="h-8 text-xs w-[150px]"
                value={startTo}
                onChange={e => setStartTo(e.target.value)}
                data-testid="input-start-to"
              />
            </div>

            {(typeFilter !== 'all' || pmFilter !== 'all' || startFrom || startTo) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => { setTypeFilter('all'); setPmFilter('all'); setStartFrom(''); setStartTo(''); }}
                data-testid="button-clear-filters"
              >
                Clear filters
              </Button>
            )}

            <div className="ml-auto text-xs text-muted-foreground self-end pb-1">
              {filteredProjects.length} project{filteredProjects.length !== 1 ? 's' : ''} shown
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        <GradientStatCard
          title="Total"
          value={stats.total}
          subtitle="Filtered projects"
          icon={FolderKanban}
          color="blue"
          size="sm"
          data-testid="stat-total"
        />
        <GradientStatCard
          title="Active"
          value={stats.active}
          subtitle="In progress"
          icon={TrendingUp}
          color="green"
          size="sm"
          data-testid="stat-active"
        />
        <GradientStatCard
          title="Completed"
          value={stats.completed}
          subtitle={stats.total > 0 ? `${Math.round((stats.completed / stats.total) * 100)}% rate` : '0%'}
          icon={CheckCircle2}
          color="cyan"
          size="sm"
          data-testid="stat-completed"
        />
        <GradientStatCard
          title="On Hold / Cancelled"
          value={stats.onHoldOrCancelled}
          subtitle="Inactive"
          icon={XCircle}
          color="orange"
          size="sm"
          data-testid="stat-inactive"
        />
        <GradientStatCard
          title="Stalled"
          value={stats.stalled}
          subtitle={`No advance ≥${STALL_THRESHOLD_DAYS}d`}
          icon={AlertTriangle}
          color="red"
          size="sm"
          data-testid="stat-stalled"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Stage Distribution */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Stage Distribution</CardTitle>
            <p className="text-xs text-muted-foreground">Projects currently at each flow stage</p>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            {stageDistribution.length === 0 ? (
              <div className="h-52 flex items-center justify-center text-xs text-muted-foreground">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stageDistribution} margin={{ top: 4, right: 8, left: -20, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10 }}
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 12 }}
                    formatter={(v: number) => [v, 'Projects']}
                  />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                    {stageDistribution.map((_, i) => (
                      <Cell key={i} fill={TYPE_COLORS[i % TYPE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Completion Rate by Type */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Completion Rate by Type</CardTitle>
            <p className="text-xs text-muted-foreground">Completed vs. total projects per project type</p>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            {completionByType.length === 0 ? (
              <div className="h-52 flex items-center justify-center text-xs text-muted-foreground">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={completionByType} margin={{ top: 4, right: 8, left: -20, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10 }}
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 12 }}
                    formatter={(v: number, name: string) => [v, name === 'completed' ? 'Completed' : 'Total']}
                  />
                  <Legend
                    iconSize={10}
                    wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                    formatter={(v) => v === 'completed' ? 'Completed' : 'Total'}
                  />
                  <Bar dataKey="total" fill="#cbd5e1" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="completed" fill="#1D3461" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stalled Projects Table */}
      <Card>
        <CardHeader className="pb-3 pt-4 px-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Stalled Projects
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                No flow stage advancement in {STALL_THRESHOLD_DAYS}+ days
              </p>
            </div>
            {stalledProjects.length > 0 && (
              <Badge variant="secondary" className="text-xs">{stalledProjects.length}</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {stalledProjects.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500 opacity-60" />
              No stalled projects — all projects are progressing on time.
            </div>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-[200px]">
                      <button
                        className="flex items-center gap-1 hover:text-foreground transition-colors"
                        onClick={() => handleSort('name')}
                        data-testid="sort-by-name"
                      >
                        Project <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </TableHead>
                    <TableHead className="text-xs">
                      <button
                        className="flex items-center gap-1 hover:text-foreground transition-colors"
                        onClick={() => handleSort('type')}
                        data-testid="sort-by-type"
                      >
                        Type <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </TableHead>
                    <TableHead className="text-xs">
                      <button
                        className="flex items-center gap-1 hover:text-foreground transition-colors"
                        onClick={() => handleSort('stage')}
                        data-testid="sort-by-stage"
                      >
                        Current Stage <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </TableHead>
                    <TableHead className="text-xs">Last Advanced</TableHead>
                    <TableHead className="text-xs text-right">
                      <button
                        className="flex items-center gap-1 hover:text-foreground transition-colors ml-auto"
                        onClick={() => handleSort('daysSince')}
                        data-testid="sort-by-days"
                      >
                        Days Stalled <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </TableHead>
                    <TableHead className="text-xs w-[80px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stalledProjects.map((p) => (
                    <TableRow key={p.id} data-testid={`row-stalled-${p.id}`}>
                      <TableCell className="py-2">
                        <div className="font-medium text-sm truncate max-w-[180px]" title={p.name}>{p.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{p.projectCode}</div>
                      </TableCell>
                      <TableCell className="py-2 text-xs text-muted-foreground">{p.type}</TableCell>
                      <TableCell className="py-2">
                        <Badge
                          variant="outline"
                          className="text-xs"
                          style={{ borderColor: STATUS_COLORS[p.status] ?? '#64748b', color: STATUS_COLORS[p.status] ?? '#64748b' }}
                        >
                          {p.stageName}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2 text-xs text-muted-foreground">{fmtDate(p.lastAdvancedAt)}</TableCell>
                      <TableCell className="py-2 text-right">
                        <span className={`text-sm font-semibold ${p.daysSince >= 30 ? 'text-red-600' : 'text-amber-600'}`}>
                          {p.daysSince}d
                        </span>
                      </TableCell>
                      <TableCell className="py-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs px-2"
                          onClick={() => navigate(`/projects/${p.id}`)}
                          data-testid={`button-view-stalled-${p.id}`}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          View
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
  );
}
