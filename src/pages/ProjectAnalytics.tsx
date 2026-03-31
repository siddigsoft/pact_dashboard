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
} from 'recharts';
import {
  BarChart3,
  FolderKanban,
  CheckCircle2,
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
import { getProjectFlow } from '@/config/projectFlows';
import { normaliseProjectType } from '@/types/project';

const STALL_THRESHOLD_DAYS = 14;

const STATUS_COLORS: Record<string, string> = {
  active: '#16a34a',
  completed: '#1D3461',
  onHold: '#f59e0b',
  draft: '#94a3b8',
  cancelled: '#dc2626',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  completed: 'Completed',
  onHold: 'On Hold',
  draft: 'Draft',
  cancelled: 'Cancelled',
};

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
  advanced_at: string;
}

interface QueryFilters {
  projectId: string;
  pmFilter: string;
  startFrom: string;
  startTo: string;
}

interface AnalyticsData {
  projects: ProjectRow[];
  latestAdvancedAt: Record<string, string>;
}

async function fetchAnalyticsData(filters: QueryFilters): Promise<AnalyticsData> {
  // Use RPC to bypass PostgREST schema cache for new columns (current_flow_stage etc.)
  const { data: allProjects, error: projError } = await supabase
    .rpc('get_projects_for_analytics');

  if (projError) throw new Error(projError.message);

  // Apply filters client-side
  let projects = (allProjects ?? []) as ProjectRow[];
  if (filters.projectId !== 'all') {
    projects = projects.filter(p => p.id === filters.projectId);
  }
  if (filters.pmFilter !== 'all') {
    projects = projects.filter(p => (p.team as any)?.projectManager === filters.pmFilter);
  }
  if (filters.startFrom) {
    projects = projects.filter(p => p.start_date && p.start_date >= filters.startFrom!);
  }
  if (filters.startTo) {
    projects = projects.filter(p => p.start_date && p.start_date <= filters.startTo!);
  }
  const relevantIds = projects.map(p => p.id);

  let latestAdvancedAt: Record<string, string> = {};
  if (relevantIds.length > 0) {
    const { data: logData } = await supabase
      .from('project_flow_log')
      .select('project_id, advanced_at')
      .in('project_id', relevantIds)
      .order('advanced_at', { ascending: false });

    for (const row of (logData ?? []) as FlowLogRow[]) {
      if (!latestAdvancedAt[row.project_id]) {
        latestAdvancedAt[row.project_id] = row.advanced_at;
      }
    }
  }

  return { projects, latestAdvancedAt };
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

function isAtFinalStage(p: ProjectRow): boolean {
  const flow = getProjectFlow(normaliseProjectType(p.project_type));
  const finalStageId = flow.stages[flow.stages.length - 1]?.id;
  return !!finalStageId && p.current_flow_stage === finalStageId;
}

type SortField = 'name' | 'type' | 'stage' | 'daysSince';
type SortDir = 'asc' | 'desc';

export default function ProjectAnalytics() {
  const navigate = useNavigate();

  const [projectIdFilter, setProjectIdFilter] = useState('all');
  const [pmFilter, setPmFilter] = useState('all');
  const [startFrom, setStartFrom] = useState('');
  const [startTo, setStartTo] = useState('');
  const [stallSort, setStallSort] = useState<{ field: SortField; dir: SortDir }>({ field: 'daysSince', dir: 'desc' });

  const { data: allProjectNames } = useQuery({
    queryKey: ['project_names_list'],
    queryFn: async () => {
      const { data } = await supabase
        .from('projects')
        .select('id, name, project_code')
        .order('name', { ascending: true });
      return (data ?? []) as { id: string; name: string; project_code: string }[];
    },
    staleTime: 120_000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['project_analytics', projectIdFilter, pmFilter, startFrom, startTo],
    queryFn: () => fetchAnalyticsData({ projectId: projectIdFilter, pmFilter, startFrom, startTo }),
    staleTime: 60_000,
  });

  const projects = data?.projects ?? [];

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
      .map(v => ({
        label: v.label,
        total: v.total,
        reachedFinal: v.reachedFinal,
        rate: v.total > 0 ? Math.round((v.reachedFinal / v.total) * 100) : 0,
      }))
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
        const daysSince = d ? differenceInDays(now, d) : 0;
        return {
          id: p.id,
          name: p.name,
          projectCode: p.project_code,
          type: flow.label.replace(' (Legacy)', ''),
          stageName: stage?.label ?? stageId,
          lastAdvancedAt: lastAdv,
          daysSince,
          status: p.status,
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

  const handleSort = useCallback((field: SortField) => {
    setStallSort(prev => ({
      field,
      dir: prev.field === field && prev.dir === 'asc' ? 'desc' : 'asc',
    }));
  }, []);

  const downloadCSV = useCallback(() => {
    const rows = projects.map(p => {
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
        'At Final Stage': isAtFinalStage(p) ? 'Yes' : 'No',
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
  }, [projects, data]);

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

  const hasFilters = projectIdFilter !== 'all' || pmFilter !== 'all' || !!startFrom || !!startTo;

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
          disabled={projects.length === 0}
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
              <Label className="text-xs">Project List</Label>
              <Select value={projectIdFilter} onValueChange={setProjectIdFilter}>
                <SelectTrigger className="h-8 w-[220px] text-xs" data-testid="select-project-filter">
                  <SelectValue placeholder="All Projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {(allProjectNames ?? []).map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.project_code ? `[${p.project_code}] ${p.name}` : p.name}
                    </SelectItem>
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

            {hasFilters && (
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
              {projects.length} project{projects.length !== 1 ? 's' : ''} shown
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
        {/* Stage Distribution — stacked bar coloured by status */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Stage Distribution</CardTitle>
            <p className="text-xs text-muted-foreground">Projects at each flow stage, coloured by status</p>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            {stageDistribution.length === 0 ? (
              <div className="h-52 flex items-center justify-center text-xs text-muted-foreground">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={stageDistribution} margin={{ top: 4, right: 8, left: -20, bottom: 70 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10 }}
                    angle={-40}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Legend
                    iconSize={10}
                    wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                    formatter={(v) => STATUS_LABELS[v as string] ?? v}
                  />
                  {Object.entries(STATUS_COLORS).map(([status, color]) => (
                    <Bar
                      key={status}
                      dataKey={status}
                      stackId="a"
                      fill={color}
                      radius={status === 'cancelled' ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Completion Rate by Type — dual bars (total vs reached final) + % in tooltip */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Completion Rate by Type</CardTitle>
            <p className="text-xs text-muted-foreground">Completed / final-stage vs. total, per project type</p>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            {completionByType.length === 0 ? (
              <div className="h-52 flex items-center justify-center text-xs text-muted-foreground">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={completionByType} margin={{ top: 4, right: 8, left: -20, bottom: 70 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10 }}
                    angle={-40}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 12 }}
                    formatter={(v: number, name: string, props: { payload?: { rate?: number } }) => {
                      if (name === 'reachedFinal') {
                        const rate = props.payload?.rate ?? 0;
                        return [`${v} (${rate}%)`, 'Completed / Final Stage'];
                      }
                      return [v, 'Total'];
                    }}
                  />
                  <Legend
                    iconSize={10}
                    wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                    formatter={(v) => v === 'reachedFinal' ? 'Completed / Final Stage' : 'Total'}
                  />
                  <Bar dataKey="total" fill="#cbd5e1" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="reachedFinal" fill="#1D3461" radius={[3, 3, 0, 0]} />
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
                  {stalledProjects.map(p => (
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
                          style={{
                            borderColor: STATUS_COLORS[p.status] ?? '#64748b',
                            color: STATUS_COLORS[p.status] ?? '#64748b',
                          }}
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
