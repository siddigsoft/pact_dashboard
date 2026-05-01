import { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Users, DollarSign, CheckCircle2, Clock, AlertTriangle,
  Search, Download, FileSpreadsheet, RefreshCw, TrendingUp,
  MapPin, Building2, Calendar,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';

// ── types ────────────────────────────────────────────────────────────────────

interface FeeRow {
  id: string;
  siteName: string;
  siteCode: string;
  state: string;
  locality: string;
  siteStatus: string;
  enumeratorName: string;
  enumeratorFee: number | null;
  transportFee: number | null;
  totalFee: number | null;
  costAcknowledged: boolean;
  mmpId: string;
  mmpName: string;
  mmpHub: string;
  mmpMonth: string | null;
  cycleStatus: string;
  currency: string;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null) {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString();
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'MMM yyyy'); } catch { return iso; }
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    wfp_confirmed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    verified:      'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    completed:     'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
    approved:      'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
    in_progress:   'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    inprogress:    'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    accepted:      'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    dispatched:    'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    assigned:      'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    not_covered:   'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    cancelled:     'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    pending:       'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  };
  const cls = map[status] || map[status?.toLowerCase()] || map['pending'];
  const label = status?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Unknown';
  return <Badge className={`text-[10px] ${cls}`}>{label}</Badge>;
}

function cycleBadge(cs: string) {
  const map: Record<string, string> = {
    closed: 'bg-green-100 text-green-800',
    pending_approval: 'bg-purple-100 text-purple-800',
    closing: 'bg-amber-100 text-amber-800',
    active: 'bg-blue-100 text-blue-800',
  };
  return (
    <Badge className={`text-[10px] ${map[cs] || 'bg-gray-100 text-gray-700'}`}>
      {cs?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Active'}
    </Badge>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function EnumeratorFeesReport() {
  const { toast } = useToast();

  // ── state ──────────────────────────────────────────────────────────────────
  const [rows, setRows] = useState<FeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterMmp, setFilterMmp] = useState('all');
  const [filterHub, setFilterHub] = useState('all');
  const [filterState, setFilterState] = useState('all');
  const [filterAck, setFilterAck] = useState('all');
  const [filterCycle, setFilterCycle] = useState('all');
  const [filterSiteStatus, setFilterSiteStatus] = useState('all');

  // ── fetch ──────────────────────────────────────────────────────────────────
  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Site entries
      const { data: entries, error: entErr } = await supabase
        .from('mmp_site_entries')
        .select('id, site_name, site_code, state, locality, status, accepted_by, monitoring_by, enumerator_fee, transport_fee, cost, cost_acknowledged, mmp_file_id')
        .order('site_name');
      if (entErr) throw entErr;

      const entryList = entries || [];

      // 2. MMP files
      const mmpIds = [...new Set(entryList.map((e: any) => e.mmp_file_id).filter(Boolean))];
      const mmpMap: Record<string, { name: string; hub: string; month: string | null; cycle_status: string }> = {};
      if (mmpIds.length > 0) {
        const { data: mmps } = await supabase
          .from('mmp_files')
          .select('id, name, hub, month, cycle_status')
          .in('id', mmpIds);
        (mmps || []).forEach((m: any) => {
          mmpMap[m.id] = { name: m.name, hub: m.hub || '—', month: m.month, cycle_status: m.cycle_status || 'active' };
        });
      }

      // 3. Profiles by UUID (accepted_by)
      const profileIds = [...new Set(entryList.map((e: any) => e.accepted_by).filter(Boolean))];
      const profileMap: Record<string, string> = {};
      if (profileIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, display_name')
          .in('id', profileIds);
        (profs || []).forEach((p: any) => {
          profileMap[p.id] = p.display_name || p.full_name || 'Unknown';
        });
      }

      // 4. Profiles by email (monitoring_by)
      const emails = [...new Set(entryList.map((e: any) => e.monitoring_by).filter(Boolean))];
      const emailMap: Record<string, string> = {};
      if (emails.length > 0) {
        const { data: emaPs } = await supabase
          .from('profiles')
          .select('email, full_name, display_name')
          .in('email', emails);
        (emaPs || []).forEach((p: any) => {
          if (p.email) emailMap[p.email] = p.display_name || p.full_name || p.email;
        });
      }

      const mapped: FeeRow[] = entryList.map((e: any) => {
        const mmp = mmpMap[e.mmp_file_id] || { name: '—', hub: '—', month: null, cycle_status: 'active' };
        const enumFee = e.enumerator_fee != null ? Number(e.enumerator_fee) : null;
        const transFee = e.transport_fee != null ? Number(e.transport_fee) : null;
        const total = (enumFee !== null || transFee !== null)
          ? (enumFee ?? 0) + (transFee ?? 0)
          : null;
        return {
          id: e.id,
          siteName: e.site_name || '—',
          siteCode: e.site_code || '—',
          state: e.state || '—',
          locality: e.locality || '—',
          siteStatus: e.status || 'pending',
          enumeratorName:
            profileMap[e.accepted_by] ||
            emailMap[e.monitoring_by] ||
            e.monitoring_by ||
            'Unassigned',
          enumeratorFee: enumFee,
          transportFee: transFee,
          totalFee: total,
          costAcknowledged: e.cost_acknowledged ?? false,
          mmpId: e.mmp_file_id,
          mmpName: mmp.name,
          mmpHub: mmp.hub,
          mmpMonth: mmp.month,
          cycleStatus: mmp.cycle_status,
          currency: 'SDG',
        };
      });

      setRows(mapped);
    } catch (err: any) {
      toast({ title: 'Failed to load fees', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // ── derived lists for filter dropdowns ────────────────────────────────────
  const mmps   = useMemo(() => [...new Map(rows.map(r => [r.mmpId, r.mmpName])).entries()].sort((a,b) => a[1].localeCompare(b[1])), [rows]);
  const hubs   = useMemo(() => [...new Set(rows.map(r => r.mmpHub))].filter(Boolean).sort(), [rows]);
  const states = useMemo(() => [...new Set(rows.map(r => r.state))].filter(h => h !== '—').sort(), [rows]);
  const siteStatuses = useMemo(() => [...new Set(rows.map(r => r.siteStatus))].filter(Boolean).sort(), [rows]);

  // ── filtered rows ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(r => {
      if (filterMmp !== 'all' && r.mmpId !== filterMmp) return false;
      if (filterHub !== 'all' && r.mmpHub !== filterHub) return false;
      if (filterState !== 'all' && r.state !== filterState) return false;
      if (filterCycle !== 'all' && r.cycleStatus !== filterCycle) return false;
      if (filterSiteStatus !== 'all' && r.siteStatus !== filterSiteStatus) return false;
      if (filterAck === 'acknowledged' && !r.costAcknowledged) return false;
      if (filterAck === 'pending' && r.costAcknowledged) return false;
      if (filterAck === 'no_fee' && r.totalFee !== null) return false;
      if (filterAck === 'has_fee' && r.totalFee === null) return false;
      if (q) {
        const hay = [r.siteName, r.siteCode, r.enumeratorName, r.state, r.locality, r.mmpName, r.mmpHub].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, filterMmp, filterHub, filterState, filterCycle, filterSiteStatus, filterAck]);

  // ── KPI totals ────────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const withFee = filtered.filter(r => r.totalFee !== null && r.totalFee > 0);
    const noFee   = filtered.filter(r => r.totalFee === null || r.totalFee === 0);
    const ackd    = withFee.filter(r => r.costAcknowledged);
    const pending = withFee.filter(r => !r.costAcknowledged);
    const totalPayable  = withFee.reduce((s, r) => s + (r.totalFee ?? 0), 0);
    const totalAckd     = ackd.reduce((s, r) => s + (r.totalFee ?? 0), 0);
    const totalPending  = pending.reduce((s, r) => s + (r.totalFee ?? 0), 0);
    const totalEnumFee  = withFee.reduce((s, r) => s + (r.enumeratorFee ?? 0), 0);
    const totalTransFee = withFee.reduce((s, r) => s + (r.transportFee ?? 0), 0);
    return { total: filtered.length, withFee: withFee.length, noFee: noFee.length, ackd: ackd.length, pending: pending.length, totalPayable, totalAckd, totalPending, totalEnumFee, totalTransFee };
  }, [filtered]);

  // ── export ────────────────────────────────────────────────────────────────
  const exportCsv = () => {
    const header = ['Enumerator','Site Name','Site Code','State','Locality','MMP','Hub','Month','Cycle Status','Site Status','Enumerator Fee (SDG)','Transport Fee (SDG)','Total Fee (SDG)','Acknowledged'];
    const lines = [header.join(','), ...filtered.map(r => [
      r.enumeratorName, r.siteName, r.siteCode, r.state, r.locality,
      r.mmpName, r.mmpHub, r.mmpMonth || '', r.cycleStatus, r.siteStatus,
      r.enumeratorFee ?? '', r.transportFee ?? '', r.totalFee ?? '',
      r.costAcknowledged ? 'Yes' : 'No',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `enumerator-fees-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const data = filtered.map(r => ({
      'Enumerator': r.enumeratorName,
      'Site Name': r.siteName,
      'Site Code': r.siteCode,
      'State': r.state,
      'Locality': r.locality,
      'MMP': r.mmpName,
      'Hub': r.mmpHub,
      'Month': r.mmpMonth || '',
      'Cycle Status': r.cycleStatus,
      'Site Status': r.siteStatus,
      'Enumerator Fee (SDG)': r.enumeratorFee ?? '',
      'Transport Fee (SDG)': r.transportFee ?? '',
      'Total Fee (SDG)': r.totalFee ?? '',
      'Acknowledged': r.costAcknowledged ? 'Yes' : 'No',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Enumerator Fees');
    XLSX.writeFile(wb, `enumerator-fees-${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-green-600" />
            Enumerator Fees Report
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track enumerator and transport fees across all MMP site visits — by cycle, hub, state, and acknowledgement status.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={fetchData} disabled={loading} data-testid="button-refresh-fees">
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card data-testid="kpi-total-payable">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              <span className="text-xs text-muted-foreground font-medium">Total Payable</span>
            </div>
            {loading ? <Skeleton className="h-7 w-24" /> : (
              <>
                <p className="text-xl font-bold text-blue-700 dark:text-blue-300">{kpi.totalPayable.toLocaleString()} SDG</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{kpi.totalEnumFee.toLocaleString()} fees + {kpi.totalTransFee.toLocaleString()} transport</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card data-testid="kpi-acknowledged">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-xs text-muted-foreground font-medium">Acknowledged</span>
            </div>
            {loading ? <Skeleton className="h-7 w-24" /> : (
              <>
                <p className="text-xl font-bold text-green-700 dark:text-green-300">{kpi.totalAckd.toLocaleString()} SDG</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{kpi.ackd} site{kpi.ackd !== 1 ? 's' : ''} confirmed</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card data-testid="kpi-pending">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-amber-600" />
              <span className="text-xs text-muted-foreground font-medium">Pending Ack.</span>
            </div>
            {loading ? <Skeleton className="h-7 w-24" /> : (
              <>
                <p className="text-xl font-bold text-amber-700 dark:text-amber-300">{kpi.totalPending.toLocaleString()} SDG</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{kpi.pending} site{kpi.pending !== 1 ? 's' : ''} awaiting</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card data-testid="kpi-no-fee">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              <span className="text-xs text-muted-foreground font-medium">Fee Not Set</span>
            </div>
            {loading ? <Skeleton className="h-7 w-24" /> : (
              <>
                <p className="text-xl font-bold text-orange-600 dark:text-orange-400">{kpi.noFee}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">site entries missing fee</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Search enumerator, site, MMP…" className="pl-8 h-8 text-xs" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-fee-search" />
            </div>
            <Select value={filterHub} onValueChange={setFilterHub}>
              <SelectTrigger className="w-[150px] h-8 text-xs" data-testid="select-fee-hub"><Building2 className="h-3 w-3 mr-1.5 shrink-0" /><SelectValue placeholder="All Hubs" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Hubs</SelectItem>
                {hubs.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterMmp} onValueChange={setFilterMmp}>
              <SelectTrigger className="w-[180px] h-8 text-xs" data-testid="select-fee-mmp"><Calendar className="h-3 w-3 mr-1.5 shrink-0" /><SelectValue placeholder="All MMPs" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All MMPs</SelectItem>
                {mmps.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterState} onValueChange={setFilterState}>
              <SelectTrigger className="w-[140px] h-8 text-xs" data-testid="select-fee-state"><MapPin className="h-3 w-3 mr-1.5 shrink-0" /><SelectValue placeholder="All States" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                {states.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterCycle} onValueChange={setFilterCycle}>
              <SelectTrigger className="w-[150px] h-8 text-xs" data-testid="select-fee-cycle"><SelectValue placeholder="All Cycle Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cycles</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="closing">Closing</SelectItem>
                <SelectItem value="pending_approval">Pending Approval</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterSiteStatus} onValueChange={setFilterSiteStatus}>
              <SelectTrigger className="w-[150px] h-8 text-xs" data-testid="select-fee-site-status"><SelectValue placeholder="All Site Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Site Status</SelectItem>
                {siteStatuses.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterAck} onValueChange={setFilterAck}>
              <SelectTrigger className="w-[150px] h-8 text-xs" data-testid="select-fee-ack"><SelectValue placeholder="Acknowledgement" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="acknowledged">✓ Acknowledged</SelectItem>
                <SelectItem value="pending">⏳ Pending Ack.</SelectItem>
                <SelectItem value="has_fee">Has Fee Set</SelectItem>
                <SelectItem value="no_fee">Fee Not Set</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-1.5 ml-auto">
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={exportCsv} data-testid="button-export-fees-csv">
                <Download className="h-3 w-3" /> CSV
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={exportExcel} data-testid="button-export-fees-xlsx">
                <FileSpreadsheet className="h-3 w-3" /> Excel
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">{filtered.length} of {rows.length} entries</p>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> Fee Entries
          </CardTitle>
          <CardDescription>One row per site visit entry. Fees are set per site in the MMP Management page.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <DollarSign className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No fee entries found</p>
              <p className="text-sm mt-1">Adjust filters or check that site entries have fees recorded.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Enumerator</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead>State / Locality</TableHead>
                    <TableHead>MMP</TableHead>
                    <TableHead>Hub</TableHead>
                    <TableHead className="text-right">Enum. Fee</TableHead>
                    <TableHead className="text-right">Transport</TableHead>
                    <TableHead className="text-right font-semibold">Total</TableHead>
                    <TableHead className="text-center">Site Status</TableHead>
                    <TableHead className="text-center">Cycle</TableHead>
                    <TableHead className="text-center">Ack.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(r => (
                    <TableRow key={r.id} className="text-xs hover:bg-muted/30" data-testid={`row-fee-${r.id}`}>
                      <TableCell className="font-medium max-w-[140px] truncate" title={r.enumeratorName}>{r.enumeratorName}</TableCell>
                      <TableCell>
                        <div className="font-medium max-w-[140px] truncate" title={r.siteName}>{r.siteName}</div>
                        <div className="text-[10px] text-muted-foreground">{r.siteCode}</div>
                      </TableCell>
                      <TableCell>
                        <div>{r.state}</div>
                        <div className="text-[10px] text-muted-foreground">{r.locality}</div>
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate" title={r.mmpName}>
                        <div>{r.mmpName}</div>
                        <div className="text-[10px] text-muted-foreground">{r.mmpMonth ? fmtDate(r.mmpMonth + '-01') : '—'}</div>
                      </TableCell>
                      <TableCell>{r.mmpHub}</TableCell>
                      <TableCell className="text-right font-mono">
                        {r.enumeratorFee != null ? `${fmt(r.enumeratorFee)} ${r.currency}` : <span className="text-orange-500">—</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {r.transportFee != null ? `${fmt(r.transportFee)} ${r.currency}` : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {r.totalFee != null && r.totalFee > 0
                          ? <span className="text-green-700 dark:text-green-400">{fmt(r.totalFee)} {r.currency}</span>
                          : <span className="text-orange-500 text-[10px]">Not set</span>}
                      </TableCell>
                      <TableCell className="text-center">{statusBadge(r.siteStatus)}</TableCell>
                      <TableCell className="text-center">{cycleBadge(r.cycleStatus)}</TableCell>
                      <TableCell className="text-center">
                        {r.totalFee != null && r.totalFee > 0
                          ? r.costAcknowledged
                            ? <Badge className="text-[10px] bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">✓ Yes</Badge>
                            : <Badge className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">⏳ Pending</Badge>
                          : <span className="text-muted-foreground text-[10px]">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary by MMP */}
      {!loading && filtered.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Summary by MMP</CardTitle>
            <CardDescription>Totals grouped per MMP cycle</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>MMP</TableHead>
                    <TableHead>Hub</TableHead>
                    <TableHead>Cycle</TableHead>
                    <TableHead className="text-right">Sites</TableHead>
                    <TableHead className="text-right">Total Fees (SDG)</TableHead>
                    <TableHead className="text-right text-green-700">Acknowledged</TableHead>
                    <TableHead className="text-right text-amber-700">Pending</TableHead>
                    <TableHead className="text-right text-orange-600">Fee Not Set</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    const grouped = new Map<string, { name: string; hub: string; cs: string; rows: FeeRow[] }>();
                    filtered.forEach(r => {
                      if (!grouped.has(r.mmpId)) grouped.set(r.mmpId, { name: r.mmpName, hub: r.mmpHub, cs: r.cycleStatus, rows: [] });
                      grouped.get(r.mmpId)!.rows.push(r);
                    });
                    return [...grouped.entries()].sort((a,b) => a[1].name.localeCompare(b[1].name)).map(([mmpId, g]) => {
                      const total = g.rows.reduce((s, r) => s + (r.totalFee ?? 0), 0);
                      const ackd  = g.rows.filter(r => r.costAcknowledged && (r.totalFee ?? 0) > 0).reduce((s, r) => s + (r.totalFee ?? 0), 0);
                      const pend  = g.rows.filter(r => !r.costAcknowledged && (r.totalFee ?? 0) > 0).reduce((s, r) => s + (r.totalFee ?? 0), 0);
                      const noFee = g.rows.filter(r => r.totalFee === null || r.totalFee === 0).length;
                      return (
                        <TableRow key={mmpId} className="text-xs">
                          <TableCell className="font-medium">{g.name}</TableCell>
                          <TableCell className="text-muted-foreground">{g.hub}</TableCell>
                          <TableCell>{cycleBadge(g.cs)}</TableCell>
                          <TableCell className="text-right">{g.rows.length}</TableCell>
                          <TableCell className="text-right font-mono font-semibold">{total.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono text-green-700 dark:text-green-400">{ackd > 0 ? ackd.toLocaleString() : '—'}</TableCell>
                          <TableCell className="text-right font-mono text-amber-700 dark:text-amber-400">{pend > 0 ? pend.toLocaleString() : '—'}</TableCell>
                          <TableCell className="text-right text-orange-600">{noFee > 0 ? noFee : '—'}</TableCell>
                        </TableRow>
                      );
                    });
                  })()}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
