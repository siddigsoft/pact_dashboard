import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useUser } from '@/context/user/UserContext';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ScrollText, Loader2, Search, ArrowRight, Building2, GitBranch,
  Activity, Users, CalendarDays, Download, Crown, Sparkles, RefreshCw,
} from 'lucide-react';
import {
  format, parseISO, isToday, isYesterday, isThisWeek, isThisMonth, subDays, isAfter,
} from 'date-fns';
import { Navigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface AuditRow {
  id: string;
  profile_id: string;
  field: 'reports_to' | 'department_id';
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  reason: string | null;
  created_at: string;
}

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-violet-100 text-violet-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
  'bg-fuchsia-100 text-fuchsia-700',
  'bg-indigo-100 text-indigo-700',
];
function avatarFor(idOrName: string): string {
  let h = 0;
  for (let i = 0; i < idOrName.length; i++) h = (h * 31 + idOrName.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() ?? '').join('') || '?';
}

function PersonChip({
  id, name, suffix, dataTestId,
}: { id: string; name: string | null | undefined; suffix?: React.ReactNode; dataTestId?: string }) {
  const display = name ?? id.slice(0, 8);
  return (
    <div className="inline-flex items-center gap-2" data-testid={dataTestId}>
      <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0', avatarFor(id))}>
        {initials(display)}
      </div>
      <span className="text-xs font-medium truncate max-w-[160px]">{display}</span>
      {suffix}
    </div>
  );
}

function ValuePill({
  field, value, profiles, depts, tone,
}: {
  field: 'reports_to' | 'department_id';
  value: string | null;
  profiles: Record<string, string>;
  depts: Record<string, string>;
  tone: 'old' | 'new';
}) {
  if (!value) {
    return (
      <span className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border',
        tone === 'old'
          ? 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700'
          : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/40',
      )}>
        — none —
      </span>
    );
  }
  const label = field === 'reports_to'
    ? (profiles[value] ?? value.slice(0, 8))
    : (depts[value] ?? value.slice(0, 8));
  const cls = tone === 'old'
    ? 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 line-through opacity-70'
    : field === 'reports_to'
      ? 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-800/40 font-semibold'
      : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800/40 font-semibold';
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border max-w-[200px]', cls)}>
      {tone === 'new' && (field === 'reports_to' ? <GitBranch className="h-3 w-3 shrink-0" /> : <Building2 className="h-3 w-3 shrink-0" />)}
      <span className="truncate">{label}</span>
    </span>
  );
}

function StatCard({
  icon, label, value, accent, dataTestId,
}: { icon: React.ReactNode; label: string; value: string | number; accent: string; dataTestId?: string }) {
  return (
    <Card className="border-0 shadow-sm" data-testid={dataTestId}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', accent)}>{icon}</div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</p>
          <p className="text-lg font-bold leading-tight truncate">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function dateBucket(iso: string): string {
  const d = parseISO(iso);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  if (isThisWeek(d, { weekStartsOn: 1 })) return 'Earlier this week';
  if (isThisMonth(d)) return 'Earlier this month';
  return format(d, 'MMMM yyyy');
}

export default function HierarchyAuditLogPage() {
  const { hasAnyRole } = useAuthorization();
  const { currentUser } = useUser();
  const isAdmin = hasAnyRole(['super_admin', 'admin', 'hr']);

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [depts, setDepts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [fieldFilter, setFieldFilter] = useState<string>('all');
  const [rangeFilter, setRangeFilter] = useState<'all' | '7d' | '30d' | 'today'>('all');

  useEffect(() => { if (isAdmin) load(); /* eslint-disable-line */ }, [isAdmin]);

  async function load() {
    setLoading(true);
    const [a, p, d] = await Promise.all([
      supabase.from('hierarchy_audit_log').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('profiles').select('id, full_name'),
      supabase.from('departments').select('id, name'),
    ]);
    if (a.data) setRows(a.data as AuditRow[]);
    if (p.data) setProfiles(Object.fromEntries(p.data.map((x: any) => [x.id, x.full_name])));
    if (d.data) setDepts(Object.fromEntries(d.data.map((x: any) => [x.id, x.name])));
    setLoading(false);
  }

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  // ── Filtering ────────────────────────────────────────────────────────────
  const visible = useMemo(() => {
    let list = rows;
    if (fieldFilter !== 'all') list = list.filter(r => r.field === fieldFilter);
    if (rangeFilter !== 'all') {
      const cutoff = rangeFilter === 'today'
        ? subDays(new Date(), 1)
        : rangeFilter === '7d'
          ? subDays(new Date(), 7)
          : subDays(new Date(), 30);
      list = list.filter(r => isAfter(parseISO(r.created_at), cutoff));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        (profiles[r.profile_id] ?? '').toLowerCase().includes(q) ||
        (r.changed_by && (profiles[r.changed_by] ?? '').toLowerCase().includes(q)) ||
        (r.reason ?? '').toLowerCase().includes(q));
    }
    return list;
  }, [rows, fieldFilter, rangeFilter, search, profiles]);

  // ── KPI calculations ─────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = rows.length;
    const week = rows.filter(r => isThisWeek(parseISO(r.created_at), { weekStartsOn: 1 })).length;
    const reportingChanges = rows.filter(r => r.field === 'reports_to').length;
    const deptChanges = rows.filter(r => r.field === 'department_id').length;
    const changerCounts: Record<string, number> = {};
    for (const r of rows) {
      if (r.changed_by) changerCounts[r.changed_by] = (changerCounts[r.changed_by] ?? 0) + 1;
    }
    const topEntry = Object.entries(changerCounts).sort((a, b) => b[1] - a[1])[0];
    const topChanger = topEntry ? { name: profiles[topEntry[0]] ?? topEntry[0].slice(0, 8), count: topEntry[1] } : null;
    return { total, week, reportingChanges, deptChanges, topChanger };
  }, [rows, profiles]);

  // ── Group visible rows by date bucket ────────────────────────────────────
  const grouped = useMemo(() => {
    const groups: Record<string, AuditRow[]> = {};
    const order: string[] = [];
    for (const r of visible) {
      const k = dateBucket(r.created_at);
      if (!groups[k]) { groups[k] = []; order.push(k); }
      groups[k].push(r);
    }
    return order.map(k => ({ label: k, rows: groups[k] }));
  }, [visible]);

  // ── CSV export ───────────────────────────────────────────────────────────
  function exportCsv() {
    const header = ['When', 'Person', 'Field', 'From', 'To', 'Changed by', 'Reason'];
    const fmtVal = (field: string, val: string | null) => {
      if (!val) return '';
      if (field === 'reports_to') return profiles[val] ?? val;
      if (field === 'department_id') return depts[val] ?? val;
      return val;
    };
    const lines = [header.join(',')];
    for (const r of visible) {
      const cells = [
        format(parseISO(r.created_at), 'yyyy-MM-dd HH:mm'),
        profiles[r.profile_id] ?? r.profile_id,
        r.field === 'reports_to' ? 'Manager' : 'Department',
        fmtVal(r.field, r.old_value),
        fmtVal(r.field, r.new_value),
        r.changed_by ? (profiles[r.changed_by] ?? 'Unknown') : 'System',
        r.reason ?? '',
      ].map(c => `"${String(c).replace(/"/g, '""').replace(/[\r\n]+/g, ' ')}"`);
      lines.push(cells.join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hierarchy-audit-${format(new Date(), 'yyyyMMdd-HHmm')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5" data-testid="page-hierarchy-audit">

      {/* Header */}
      <header className="flex flex-wrap items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
          <ScrollText className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold leading-tight">Hierarchy Audit Log</h1>
          <p className="text-xs text-muted-foreground">Every change to reporting line and department, tracked automatically.</p>
        </div>
        <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={load} disabled={loading} data-testid="btn-refresh-audit">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </Button>
        <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={exportCsv} disabled={visible.length === 0} data-testid="btn-export-audit">
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </Button>
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<Activity className="h-5 w-5 text-blue-600" />}
          label="Total tracked"
          value={stats.total}
          accent="bg-blue-100 dark:bg-blue-950/30"
          dataTestId="stat-total"
        />
        <StatCard
          icon={<Sparkles className="h-5 w-5 text-emerald-600" />}
          label="This week"
          value={stats.week}
          accent="bg-emerald-100 dark:bg-emerald-950/30"
          dataTestId="stat-week"
        />
        <StatCard
          icon={<GitBranch className="h-5 w-5 text-violet-600" />}
          label="Reporting line"
          value={stats.reportingChanges}
          accent="bg-violet-100 dark:bg-violet-950/30"
          dataTestId="stat-manager"
        />
        <StatCard
          icon={<Building2 className="h-5 w-5 text-cyan-600" />}
          label="Department"
          value={stats.deptChanges}
          accent="bg-cyan-100 dark:bg-cyan-950/30"
          dataTestId="stat-dept"
        />
      </div>

      {/* Most-active changer banner */}
      {stats.topChanger && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 dark:border-amber-800/40">
          <Crown className="h-4 w-4 text-amber-500 shrink-0" />
          <p className="text-xs text-amber-900 dark:text-amber-200">
            Most-active changer: <span className="font-semibold">{stats.topChanger.name}</span> with{' '}
            <span className="font-semibold">{stats.topChanger.count}</span> change{stats.topChanger.count === 1 ? '' : 's'}.
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={fieldFilter} onValueChange={setFieldFilter}>
          <SelectTrigger className="h-9 w-44" data-testid="select-field-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All change types</SelectItem>
            <SelectItem value="reports_to">Reporting line only</SelectItem>
            <SelectItem value="department_id">Department only</SelectItem>
          </SelectContent>
        </Select>
        <Select value={rangeFilter} onValueChange={(v: any) => setRangeFilter(v)}>
          <SelectTrigger className="h-9 w-40" data-testid="select-range-filter">
            <CalendarDays className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any time</SelectItem>
            <SelectItem value="today">Last 24 hours</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="outline" className="h-9 px-3 text-xs font-medium bg-white dark:bg-slate-900" data-testid="badge-result-count">
          {visible.length} of {rows.length} shown
        </Badge>
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            data-testid="input-search-audit"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or reason…"
            className="pl-8 w-64"
          />
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="h-14 rounded-xl bg-slate-100 dark:bg-slate-800/40 animate-pulse" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-16 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <ScrollText className="h-6 w-6 text-slate-400" />
            </div>
            <p className="text-sm font-medium">No matching changes</p>
            <p className="text-xs text-muted-foreground mt-1">
              {rows.length === 0
                ? "Once you change a profile's manager or department, it will appear here."
                : 'Try clearing the filters or widening the time range.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {grouped.map(group => (
            <div key={group.label}>
              <div className="flex items-center gap-2 mb-2 px-1">
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{group.label}</h2>
                <span className="text-[10px] text-muted-foreground/60">·</span>
                <span className="text-[10px] text-muted-foreground/60">{group.rows.length} change{group.rows.length === 1 ? '' : 's'}</span>
                <div className="flex-1 h-px bg-border ml-2" />
              </div>
              <Card className="border-0 shadow-sm overflow-hidden">
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-900/40 text-[10px] uppercase tracking-wide text-muted-foreground border-b">
                      <tr>
                        <th className="text-left px-4 py-2 font-semibold">When</th>
                        <th className="text-left px-4 py-2 font-semibold">Person</th>
                        <th className="text-left px-4 py-2 font-semibold w-[120px]">Type</th>
                        <th className="text-left px-4 py-2 font-semibold">Change</th>
                        <th className="text-left px-4 py-2 font-semibold">Changed by</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map(r => {
                        const isYou = r.changed_by && r.changed_by === currentUser?.id;
                        const personName = profiles[r.profile_id] ?? r.profile_id.slice(0, 8);
                        const changerName = r.changed_by ? (profiles[r.changed_by] ?? 'Unknown user') : null;
                        return (
                          <tr
                            key={r.id}
                            className="border-t hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors"
                            data-testid={`row-audit-${r.id}`}
                          >
                            <td className="px-4 py-3 align-top">
                              <p className="text-xs font-medium whitespace-nowrap">{format(parseISO(r.created_at), 'HH:mm')}</p>
                              <p className="text-[10px] text-muted-foreground whitespace-nowrap">{format(parseISO(r.created_at), 'dd MMM')}</p>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <PersonChip id={r.profile_id} name={personName} dataTestId={`person-${r.id}`} />
                            </td>
                            <td className="px-4 py-3 align-top">
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[10px] gap-1 font-semibold',
                                  r.field === 'reports_to'
                                    ? 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-800/40'
                                    : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800/40',
                                )}
                              >
                                {r.field === 'reports_to' ? <GitBranch className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
                                {r.field === 'reports_to' ? 'Manager' : 'Department'}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <ValuePill field={r.field} value={r.old_value} profiles={profiles} depts={depts} tone="old" />
                                <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                <ValuePill field={r.field} value={r.new_value} profiles={profiles} depts={depts} tone="new" />
                              </div>
                              {r.reason && (
                                <p className="text-[10px] text-muted-foreground italic mt-1.5 max-w-[400px] truncate" title={r.reason}>
                                  Reason: {r.reason}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3 align-top">
                              {changerName ? (
                                <PersonChip
                                  id={r.changed_by!}
                                  name={changerName}
                                  suffix={isYou ? <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 px-1.5 py-0.5 rounded-full">YOU</span> : null}
                                  dataTestId={`changer-${r.id}`}
                                />
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                  <Users className="h-3 w-3" /> System
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
