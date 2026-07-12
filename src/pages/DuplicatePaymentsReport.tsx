import { useState, useMemo } from 'react';
import { useDownPayment } from '@/context/downPayment/DownPaymentContext';
import { useUser } from '@/context/user/UserContext';
import { useSuperAdmin } from '@/context/superAdmin/SuperAdminContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle, Search, RefreshCw, ChevronDown, ChevronUp,
  MapPin, Building2, Calendar, DollarSign, Copy, Shield,
  FileSpreadsheet, Info, X,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { exportToExcel } from '@/utils/report-export';
import { useToast } from '@/hooks/use-toast';
import type { DownPaymentRequest } from '@/types/down-payment';

// ── Status helpers ────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = {
  pending_supervisor: 'Pending Supervisor',
  pending_admin:      'Pending Admin',
  approved:           'Approved',
  partially_paid:     'Partially Paid',
  fully_paid:         'Fully Paid',
  cancelled:          'Cancelled',
  rejected:           'Rejected',
  deleted:            'Deleted',
};

const STATUS_COLOR: Record<string, string> = {
  pending_supervisor: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  pending_admin:      'bg-blue-100 text-blue-800 border-blue-300',
  approved:           'bg-emerald-100 text-emerald-800 border-emerald-300',
  partially_paid:     'bg-orange-100 text-orange-800 border-orange-300',
  fully_paid:         'bg-green-100 text-green-800 border-green-300',
  cancelled:          'bg-gray-100 text-gray-600 border-gray-300',
  rejected:           'bg-red-100 text-red-700 border-red-300',
  deleted:            'bg-red-100 text-red-700 border-red-300',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={`text-[10px] py-0 px-1.5 ${STATUS_COLOR[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface DuplicateGroup {
  groupKey:      string;
  siteName:      string;
  mmpName:       string;
  hubName:       string;
  hubId:         string;
  stateName:     string;
  monthKey:      string;
  monthLabel:    string;
  requests:      DownPaymentRequest[];
  totalExposure: number;
  paidExposure:  number;
  severity:      'critical' | 'high' | 'medium';
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DuplicatePaymentsReport() {
  const { requests, loading, refreshRequests } = useDownPayment();
  const { toast } = useToast();

  // ── Filter state ────────────────────────────────────────────────────────────
  const [search,           setSearch]           = useState('');
  const [hubFilter,        setHubFilter]        = useState('all');
  const [stateFilter,      setStateFilter]      = useState('all');
  const [mmpFilter,        setMmpFilter]        = useState('all');
  const [enumeratorFilter, setEnumeratorFilter] = useState('all');
  const [monthFilter,      setMonthFilter]      = useState('all');
  const [severityFilter,   setSeverityFilter]   = useState('all');
  const [expandedKeys,     setExpandedKeys]     = useState<Set<string>>(new Set());

  const toggleExpand = (key: string) =>
    setExpandedKeys(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  // ── Active requests (drop cancelled/rejected/deleted) ─────────────────────
  const activeRequests = useMemo<DownPaymentRequest[]>(() =>
    requests.filter(r => !['cancelled', 'rejected', 'deleted'].includes(r.status)),
  [requests]);

  // ── Cascaded filter option lists ───────────────────────────────────────────
  const hubOptions = useMemo(() =>
    [...new Set(activeRequests.map(r => r.hubName).filter(Boolean))].sort() as string[],
  [activeRequests]);

  const stateOptions = useMemo(() => {
    const base = hubFilter !== 'all'
      ? activeRequests.filter(r => r.hubName === hubFilter)
      : activeRequests;
    return [...new Set(base.map(r => r.stateName).filter(Boolean))].sort() as string[];
  }, [activeRequests, hubFilter]);

  const mmpOptions = useMemo(() => {
    let base = activeRequests;
    if (hubFilter   !== 'all') base = base.filter(r => r.hubName   === hubFilter);
    if (stateFilter !== 'all') base = base.filter(r => r.stateName === stateFilter);
    return [...new Set(base.map(r => r.mmpName).filter(Boolean))].sort() as string[];
  }, [activeRequests, hubFilter, stateFilter]);

  const enumeratorOptions = useMemo(() => {
    let base = activeRequests;
    if (hubFilter   !== 'all') base = base.filter(r => r.hubName   === hubFilter);
    if (stateFilter !== 'all') base = base.filter(r => r.stateName === stateFilter);
    if (mmpFilter   !== 'all') base = base.filter(r => r.mmpName   === mmpFilter);
    const seen = new Map<string, string>();
    base.forEach(r => {
      if (r.requestedBy && !seen.has(r.requestedBy as string)) {
        seen.set(r.requestedBy as string, r.requestedByName ?? r.requestedBy as string);
      }
    });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [activeRequests, hubFilter, stateFilter, mmpFilter]);

  // ── Step 1: filter individual requests by hub/state/mmp/enumerator/month ──
  const preFilteredRequests = useMemo<DownPaymentRequest[]>(() => {
    return activeRequests.filter(r => {
      if (hubFilter        !== 'all' && r.hubName   !== hubFilter)                      return false;
      if (stateFilter      !== 'all' && r.stateName !== stateFilter)                    return false;
      if (mmpFilter        !== 'all' && r.mmpName   !== mmpFilter)                      return false;
      if (enumeratorFilter !== 'all' && r.requestedBy !== enumeratorFilter)             return false;
      if (monthFilter !== 'all') {
        const mk = r.requestedAt
          ? format(parseISO(r.requestedAt), 'yyyy-MM')
          : r.createdAt ? format(parseISO(r.createdAt), 'yyyy-MM') : '';
        if (mk !== monthFilter) return false;
      }
      return true;
    });
  }, [activeRequests, hubFilter, stateFilter, mmpFilter, enumeratorFilter, monthFilter]);

  // ── Step 2: build duplicate groups from pre-filtered requests ──────────────
  const allGroups = useMemo<DuplicateGroup[]>(() => {
    const map = new Map<string, DownPaymentRequest[]>();

    for (const r of preFilteredRequests) {
      const monthKey = r.requestedAt
        ? format(parseISO(r.requestedAt), 'yyyy-MM')
        : r.createdAt ? format(parseISO(r.createdAt), 'yyyy-MM') : 'unknown';

      const groupKey = r.mmpSiteEntryId
        ? `entry::${r.mmpSiteEntryId}`
        : `name::${(r.siteName ?? '').toLowerCase().trim()}::${r.hubId ?? 'nohub'}::${monthKey}`;

      if (!map.has(groupKey)) map.set(groupKey, []);
      map.get(groupKey)!.push(r);
    }

    const groups: DuplicateGroup[] = [];

    for (const [groupKey, reqs] of map.entries()) {
      if (reqs.length < 2) continue;

      const sample   = reqs[0];
      const monthKey = sample.requestedAt
        ? format(parseISO(sample.requestedAt), 'yyyy-MM')
        : sample.createdAt ? format(parseISO(sample.createdAt), 'yyyy-MM') : 'unknown';

      const totalExposure = reqs.reduce((s, r) => s + (r.requestedAmount ?? 0), 0);
      const paidExposure  = reqs
        .filter(r => ['fully_paid', 'partially_paid'].includes(r.status))
        .reduce((s, r) => s + (r.totalPaidAmount ?? r.requestedAmount ?? 0), 0);

      const hasPaid     = reqs.some(r => ['fully_paid', 'partially_paid'].includes(r.status));
      const hasApproved = reqs.some(r => ['approved', 'pending_admin'].includes(r.status));
      const severity: DuplicateGroup['severity'] = hasPaid ? 'critical' : hasApproved ? 'high' : 'medium';

      groups.push({
        groupKey,
        siteName:   sample.siteName   ?? '—',
        mmpName:    sample.mmpName    ?? '—',
        hubName:    sample.hubName    ?? '—',
        hubId:      sample.hubId      ?? '',
        stateName:  sample.stateName  ?? '—',
        monthKey,
        monthLabel: monthKey !== 'unknown' ? format(parseISO(`${monthKey}-01`), 'MMMM yyyy') : '—',
        requests:   reqs.sort((a, b) => (a.requestedAt ?? '').localeCompare(b.requestedAt ?? '')),
        totalExposure,
        paidExposure,
        severity,
      });
    }

    return groups.sort((a, b) => {
      const sv = { critical: 0, high: 1, medium: 2 };
      return sv[a.severity] - sv[b.severity] || b.totalExposure - a.totalExposure;
    });
  }, [preFilteredRequests]);

  // ── Month options derived from all active requests (not pre-filtered) ──────
  const monthOptions = useMemo(() => {
    const months = [...new Set(activeRequests.map(r => {
      if (r.requestedAt) return format(parseISO(r.requestedAt), 'yyyy-MM');
      if (r.createdAt)   return format(parseISO(r.createdAt),   'yyyy-MM');
      return null;
    }).filter(Boolean))].sort().reverse() as string[];
    return months;
  }, [activeRequests]);

  // ── Step 3: apply severity + search on groups ──────────────────────────────
  const filteredGroups = useMemo(() => {
    const q = search.toLowerCase().trim();
    return allGroups.filter(g => {
      if (severityFilter !== 'all' && g.severity !== severityFilter) return false;
      if (q && !g.siteName.toLowerCase().includes(q) && !g.mmpName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allGroups, severityFilter, search]);

  // ── Summary cards — based on filteredGroups (reflect all active filters) ──
  const stats = useMemo(() => {
    const totalSites    = filteredGroups.length;
    const totalExtra    = filteredGroups.reduce((s, g) => s + g.requests.length - 1, 0);
    const totalExposure = filteredGroups.reduce((s, g) => s + g.totalExposure, 0);
    const paidExposure  = filteredGroups.reduce((s, g) => s + g.paidExposure,  0);
    const criticalCount = filteredGroups.filter(g => g.severity === 'critical').length;
    const highCount     = filteredGroups.filter(g => g.severity === 'high').length;
    return { totalSites, totalExtra, totalExposure, paidExposure, criticalCount, highCount };
  }, [filteredGroups]);

  // ── Excel export ───────────────────────────────────────────────────────────
  const handleExport = () => {
    const rows = filteredGroups.flatMap(g =>
      g.requests.map((r, i) => ({
        'Group Key':         g.groupKey,
        'Site Name':         g.siteName,
        'MMP Name':          g.mmpName,
        'Hub':               g.hubName,
        'State':             g.stateName,
        'Month':             g.monthLabel,
        'Severity':          g.severity.toUpperCase(),
        'Total Requests':    g.requests.length,
        'Position in Group': i + 1,
        'Request ID':        r.id,
        'Status':            STATUS_LABEL[r.status] ?? r.status,
        'Enumerator':        r.requestedByName ?? r.requestedBy ?? '—',
        'Role':              r.requesterRole ?? '—',
        'Requested Date':    r.requestedAt ? format(parseISO(r.requestedAt), 'yyyy-MM-dd') : '—',
        'Requested Amount':  r.requestedAmount ?? 0,
        'Approved Amount':   r.approvedAmount ?? 0,
        'Total Paid':        r.totalPaidAmount ?? 0,
        'Remaining':         r.remainingAmount ?? 0,
        'Justification':     r.justification ?? '—',
      }))
    );
    exportToExcel(rows, `Duplicate_Payments_Report_${format(new Date(), 'yyyy-MM-dd')}`);
    toast({ title: 'Exported', description: `${rows.length} rows exported to Excel.` });
  };

  const severityBadge = (s: DuplicateGroup['severity']) => {
    if (s === 'critical') return 'bg-red-100 text-red-800 border-red-400';
    if (s === 'high')     return 'bg-orange-100 text-orange-800 border-orange-400';
    return 'bg-yellow-100 text-yellow-800 border-yellow-400';
  };
  const severityLabel = (s: DuplicateGroup['severity']) =>
    s === 'critical' ? '⚠ PAID DUPLICATE' : s === 'high' ? '⚠ APPROVED DUPLICATE' : 'PENDING DUPLICATE';

  const hasAnyFilter = hubFilter !== 'all' || stateFilter !== 'all' || mmpFilter !== 'all'
    || enumeratorFilter !== 'all' || monthFilter !== 'all' || severityFilter !== 'all' || search;

  const clearFilters = () => {
    setHubFilter('all'); setStateFilter('all'); setMmpFilter('all');
    setEnumeratorFilter('all'); setMonthFilter('all'); setSeverityFilter('all'); setSearch('');
  };

  // Auto-reset downstream filters when upstream changes
  const handleHubChange = (v: string) => {
    setHubFilter(v); setStateFilter('all'); setMmpFilter('all'); setEnumeratorFilter('all');
  };
  const handleStateChange = (v: string) => {
    setStateFilter(v); setMmpFilter('all'); setEnumeratorFilter('all');
  };
  const handleMmpChange = (v: string) => {
    setMmpFilter(v); setEnumeratorFilter('all');
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Copy className="h-5 w-5 text-red-600" />
            Duplicate Payments Report
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Sites with more than one active advance request — all statuses shown, nothing is cancelled.
            For investigation and follow-up only.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={refreshRequests}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={filteredGroups.length === 0}>
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" /> Export Excel
          </Button>
        </div>
      </div>

      {/* ── Info banner ── */}
      <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 px-4 py-2.5 text-xs text-blue-800 dark:text-blue-300">
        <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
        <span>
          This report shows every active advance request for sites that have more than one.
          No records are cancelled or deleted here — this is read-only.
          <strong className="ml-1">Red = already paid (financial risk). Orange = approved but not paid. Yellow = still pending.</strong>
        </span>
      </div>

      {/* ── Summary cards — update with filters ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-red-200">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Sites with Duplicates</div>
            <div className="text-2xl font-bold text-red-600">{stats.totalSites}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {stats.criticalCount} critical · {stats.highCount} high
            </div>
          </CardContent>
        </Card>
        <Card className="border-orange-200">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Extra Requests</div>
            <div className="text-2xl font-bold text-orange-600">{stats.totalExtra}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">beyond first request per site</div>
          </CardContent>
        </Card>
        <Card className="border-amber-200">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Total Exposure</div>
            <div className="text-lg font-bold text-amber-700">
              {stats.totalExposure.toLocaleString()}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">SDG (all duplicate requests)</div>
          </CardContent>
        </Card>
        <Card className="border-red-300">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Already Paid (Risk)</div>
            <div className="text-lg font-bold text-red-700">
              {stats.paidExposure.toLocaleString()}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">SDG from paid duplicates</div>
          </CardContent>
        </Card>
      </div>

      {/* ── Filters ── */}
      <div className="space-y-2">
        {/* Row 1: search + severity + clear */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search site or MMP name…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
              data-testid="input-duplicate-search"
            />
          </div>
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="h-8 w-[175px] text-xs" data-testid="select-severity-filter">
              <SelectValue placeholder="All severities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              <SelectItem value="critical">⚠ Paid duplicates</SelectItem>
              <SelectItem value="high">Approved duplicates</SelectItem>
              <SelectItem value="medium">Pending only</SelectItem>
            </SelectContent>
          </Select>
          {hasAnyFilter && (
            <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={clearFilters} data-testid="button-clear-filters">
              <X className="h-3 w-3" /> Clear all
            </Button>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            Showing {filteredGroups.length} duplicate sites
          </span>
        </div>

        {/* Row 2: Hub → State → MMP → Enumerator → Month */}
        <div className="flex flex-wrap gap-2 items-center">
          {/* Hub */}
          <Select value={hubFilter} onValueChange={handleHubChange}>
            <SelectTrigger className="h-8 w-[150px] text-xs" data-testid="select-hub-filter">
              <SelectValue placeholder="All hubs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All hubs</SelectItem>
              {hubOptions.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* State */}
          <Select value={stateFilter} onValueChange={handleStateChange} disabled={stateOptions.length === 0}>
            <SelectTrigger className="h-8 w-[150px] text-xs" data-testid="select-state-filter">
              <SelectValue placeholder="All states" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All states</SelectItem>
              {stateOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* MMP */}
          <Select value={mmpFilter} onValueChange={handleMmpChange} disabled={mmpOptions.length === 0}>
            <SelectTrigger className="h-8 w-[165px] text-xs" data-testid="select-mmp-filter">
              <SelectValue placeholder="All MMPs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All MMPs</SelectItem>
              {mmpOptions.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Enumerator */}
          <Select value={enumeratorFilter} onValueChange={setEnumeratorFilter} disabled={enumeratorOptions.length === 0}>
            <SelectTrigger className="h-8 w-[175px] text-xs" data-testid="select-enumerator-filter">
              <SelectValue placeholder="All enumerators" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All enumerators</SelectItem>
              {enumeratorOptions.map(e => (
                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Month */}
          <Select value={monthFilter} onValueChange={setMonthFilter}>
            <SelectTrigger className="h-8 w-[145px] text-xs" data-testid="select-month-filter">
              <SelectValue placeholder="All months" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All months</SelectItem>
              {monthOptions.map(m => (
                <SelectItem key={m} value={m}>
                  {format(parseISO(`${m}-01`), 'MMMM yyyy')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── No results ── */}
      {filteredGroups.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Shield className="h-10 w-10 mx-auto mb-3 text-emerald-500 opacity-60" />
            <p className="text-sm font-medium text-muted-foreground">
              {allGroups.length === 0
                ? 'No duplicate requests found for the selected filters.'
                : 'No results match the current filters.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Duplicate groups ── */}
      {filteredGroups.length > 0 && (
        <div className="space-y-3">
          {filteredGroups.map(group => (
            <Card
              key={group.groupKey}
              className={`border ${
                group.severity === 'critical' ? 'border-red-400 dark:border-red-600' :
                group.severity === 'high'     ? 'border-orange-400 dark:border-orange-600' :
                                                'border-yellow-300 dark:border-yellow-600'
              }`}
            >
              {/* ── Group header row ── */}
              <button
                type="button"
                className="w-full text-left"
                onClick={() => toggleExpand(group.groupKey)}
                data-testid={`button-expand-${group.groupKey}`}
              >
                <CardContent className={`p-4 ${
                  group.severity === 'critical' ? 'bg-red-50/40 dark:bg-red-950/20' :
                  group.severity === 'high'     ? 'bg-orange-50/40 dark:bg-orange-950/20' :
                                                  'bg-yellow-50/30 dark:bg-yellow-950/10'
                }`}>
                  <div className="flex items-start gap-3">
                    <AlertTriangle className={`h-4 w-4 flex-shrink-0 mt-0.5 ${
                      group.severity === 'critical' ? 'text-red-600' :
                      group.severity === 'high'     ? 'text-orange-500' : 'text-yellow-500'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-semibold text-sm">{group.siteName}</span>
                        <Badge variant="outline" className={`text-[10px] py-0 px-1.5 ${severityBadge(group.severity)}`}>
                          {severityLabel(group.severity)}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-slate-100 text-slate-700 border-slate-300">
                          {group.requests.length} REQUESTS
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {group.mmpName !== '—' && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />{group.mmpName}
                          </span>
                        )}
                        {group.hubName !== '—' && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />{group.hubName}
                          </span>
                        )}
                        {group.stateName !== '—' && (
                          <span className="flex items-center gap-1 text-muted-foreground/70">
                            {group.stateName}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />{group.monthLabel}
                        </span>
                        <span className="flex items-center gap-1 font-medium text-foreground/80">
                          <DollarSign className="h-3 w-3" />
                          Total: SDG {group.totalExposure.toLocaleString()}
                        </span>
                        {group.paidExposure > 0 && (
                          <span className="flex items-center gap-1 font-medium text-red-700 dark:text-red-400">
                            ⚠ Paid: SDG {group.paidExposure.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {expandedKeys.has(group.groupKey) ? 'Hide' : 'Details'}
                      </span>
                      {expandedKeys.has(group.groupKey)
                        ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>
                </CardContent>
              </button>

              {/* ── Expanded: individual requests table ── */}
              {expandedKeys.has(group.groupKey) && (
                <div className="border-t overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="text-xs bg-muted/30">
                        <TableHead className="py-2 text-xs">#</TableHead>
                        <TableHead className="py-2 text-xs">Request ID</TableHead>
                        <TableHead className="py-2 text-xs">Enumerator</TableHead>
                        <TableHead className="py-2 text-xs">Role</TableHead>
                        <TableHead className="py-2 text-xs">Date Submitted</TableHead>
                        <TableHead className="py-2 text-xs text-right">Requested (SDG)</TableHead>
                        <TableHead className="py-2 text-xs text-right">Paid (SDG)</TableHead>
                        <TableHead className="py-2 text-xs">Status</TableHead>
                        <TableHead className="py-2 text-xs max-w-[200px]">Justification</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.requests.map((r, i) => {
                        const isPaid = ['fully_paid', 'partially_paid'].includes(r.status);
                        return (
                          <TableRow
                            key={r.id}
                            className={`text-xs ${isPaid ? 'bg-red-50/50 dark:bg-red-950/10' : i === 0 ? 'bg-emerald-50/30 dark:bg-emerald-950/10' : ''}`}
                          >
                            <TableCell className="py-2 font-medium">
                              {i === 0
                                ? <span className="text-emerald-700 dark:text-emerald-400 font-bold">#1</span>
                                : <span className="text-red-600 font-bold">#{i + 1}</span>}
                            </TableCell>
                            <TableCell className="py-2 font-mono text-[10px] text-muted-foreground">
                              {r.id.substring(0, 8).toUpperCase()}
                            </TableCell>
                            <TableCell className="py-2">
                              {r.requestedByName ?? r.requestedBy ?? '—'}
                            </TableCell>
                            <TableCell className="py-2 capitalize text-muted-foreground">
                              {r.requesterRole ?? '—'}
                            </TableCell>
                            <TableCell className="py-2 text-muted-foreground whitespace-nowrap">
                              {r.requestedAt ? format(parseISO(r.requestedAt), 'MMM dd, yyyy') : '—'}
                            </TableCell>
                            <TableCell className="py-2 text-right font-medium">
                              {(r.requestedAmount ?? 0).toLocaleString()}
                            </TableCell>
                            <TableCell className={`py-2 text-right font-medium ${isPaid ? 'text-red-700 dark:text-red-400' : 'text-muted-foreground'}`}>
                              {(r.totalPaidAmount ?? 0).toLocaleString()}
                            </TableCell>
                            <TableCell className="py-2">
                              <StatusBadge status={r.status} />
                            </TableCell>
                            <TableCell className="py-2 max-w-[200px] truncate text-muted-foreground" title={r.justification ?? ''}>
                              {r.justification ?? '—'}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* ── Legend ── */}
      <div className="rounded-md border border-muted bg-muted/20 p-3 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground/70">Finance Reconciliation Guide</p>
        <p>• <strong>#1</strong> (green) = earliest request for this site — likely the intended payment</p>
        <p>• <strong>#2+</strong> (red) = duplicate requests — review with finance team before any payment</p>
        <p>• Paid duplicates (red rows) require immediate attention — verify if cash went out twice</p>
        <p>• This report is read-only. Contact your finance manager to cancel duplicates once confirmed.</p>
      </div>
    </div>
  );
}
