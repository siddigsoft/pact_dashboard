import { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import {
  Users, DollarSign, CheckCircle2, Clock, AlertTriangle,
  Search, Download, FileSpreadsheet, RefreshCw, TrendingUp,
  MapPin, Building2, Calendar, Wallet, Undo2, Banknote,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';
import { useUser } from '@/context/user/UserContext';
import { useSuperAdmin } from '@/context/superAdmin/SuperAdminContext';

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
  feePaidStatus: 'unpaid' | 'paid';
  feePaidAmount: number | null;
  feePaidAt: string | null;
  feePaymentMethod: string | null;
  feePaymentNotes: string | null;
}

const PAYMENT_METHODS = ['Bank Transfer', 'Bankak', 'Cash', 'Other'];

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
  const { currentUser } = useUser();
  const { isSuperAdmin } = useSuperAdmin();

  const userRole = currentUser?.role?.toLowerCase();
  const isFinance = userRole === 'admin' || userRole === 'financialadmin' || userRole === 'superadmin' || isSuperAdmin;

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
  const [filterPaid, setFilterPaid] = useState('all');

  // ── payment tracking state ────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payMethod, setPayMethod] = useState('Bank Transfer');
  const [payNotes, setPayNotes] = useState('');
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [unpayId, setUnpayId] = useState<string | null>(null);

  // ── fetch ──────────────────────────────────────────────────────────────────
  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Site entries — paginate past Supabase/PostgREST's default 1000-row cap
      const PAGE_SIZE = 1000;
      const entryList: any[] = [];
      for (let page = 0; ; page++) {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        const { data: entryPage, error: entErr } = await supabase
          .from('mmp_site_entries')
          .select('id, site_name, site_code, state, locality, status, accepted_by, monitoring_by, enumerator_fee, transport_fee, cost, cost_acknowledged, mmp_file_id, fee_paid_status, fee_paid_amount, fee_paid_at, fee_payment_method, fee_payment_notes')
          .order('site_name')
          .range(from, to);
        if (entErr) throw entErr;
        entryList.push(...(entryPage || []));
        if (!entryPage || entryPage.length < PAGE_SIZE) break;
      }

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
          feePaidStatus: (e.fee_paid_status === 'paid' ? 'paid' : 'unpaid') as 'paid' | 'unpaid',
          feePaidAmount: e.fee_paid_amount != null ? Number(e.fee_paid_amount) : null,
          feePaidAt: e.fee_paid_at || null,
          feePaymentMethod: e.fee_payment_method || null,
          feePaymentNotes: e.fee_payment_notes || null,
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
      if (filterPaid === 'paid' && r.feePaidStatus !== 'paid') return false;
      if (filterPaid === 'unpaid' && r.feePaidStatus !== 'unpaid') return false;
      if (q) {
        const hay = [r.siteName, r.siteCode, r.enumeratorName, r.state, r.locality, r.mmpName, r.mmpHub].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, filterMmp, filterHub, filterState, filterCycle, filterSiteStatus, filterAck, filterPaid]);

  // ── KPI totals ────────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const withFee = filtered.filter(r => r.totalFee !== null && r.totalFee > 0);
    const noFee   = filtered.filter(r => r.totalFee === null || r.totalFee === 0);
    const ackd    = withFee.filter(r => r.costAcknowledged);
    const pending = withFee.filter(r => !r.costAcknowledged);
    const paid    = withFee.filter(r => r.feePaidStatus === 'paid');
    const unpaid  = withFee.filter(r => r.feePaidStatus !== 'paid');
    const totalPayable  = withFee.reduce((s, r) => s + (r.totalFee ?? 0), 0);
    const totalAckd     = ackd.reduce((s, r) => s + (r.totalFee ?? 0), 0);
    const totalPending  = pending.reduce((s, r) => s + (r.totalFee ?? 0), 0);
    const totalEnumFee  = withFee.reduce((s, r) => s + (r.enumeratorFee ?? 0), 0);
    const totalTransFee = withFee.reduce((s, r) => s + (r.transportFee ?? 0), 0);
    const totalPaid     = paid.reduce((s, r) => s + (r.feePaidAmount ?? r.totalFee ?? 0), 0);
    const totalUnpaid   = unpaid.reduce((s, r) => s + (r.totalFee ?? 0), 0);
    return { total: filtered.length, withFee: withFee.length, noFee: noFee.length, ackd: ackd.length, pending: pending.length, totalPayable, totalAckd, totalPending, totalEnumFee, totalTransFee, paid: paid.length, unpaid: unpaid.length, totalPaid, totalUnpaid };
  }, [filtered]);

  // ── export ────────────────────────────────────────────────────────────────
  const exportCsv = () => {
    const header = ['Enumerator','Site Name','Site Code','State','Locality','MMP','Hub','Month','Cycle Status','Site Status','Enumerator Fee (SDG)','Transport Fee (SDG)','Total Fee (SDG)','Acknowledged','Payment Status','Paid Date','Payment Method'];
    const lines = [header.join(','), ...filtered.map(r => [
      r.enumeratorName, r.siteName, r.siteCode, r.state, r.locality,
      r.mmpName, r.mmpHub, r.mmpMonth || '', r.cycleStatus, r.siteStatus,
      r.enumeratorFee ?? '', r.transportFee ?? '', r.totalFee ?? '',
      r.costAcknowledged ? 'Yes' : 'No',
      r.feePaidStatus === 'paid' ? 'Paid' : 'Unpaid',
      r.feePaidAt ? fmtDate(r.feePaidAt) : '',
      r.feePaymentMethod || '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `enumerator-fees-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  // ── payment mutations ─────────────────────────────────────────────────────
  const payableSelected = useMemo(
    () => filtered.filter(r => selectedIds.has(r.id) && r.feePaidStatus !== 'paid' && (r.totalFee ?? 0) > 0),
    [filtered, selectedIds]
  );
  const selectedTotal = useMemo(() => payableSelected.reduce((s, r) => s + (r.totalFee ?? 0), 0), [payableSelected]);

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAllUnpaid = () => {
    const unpaidVisible = filtered.filter(r => r.feePaidStatus !== 'paid' && (r.totalFee ?? 0) > 0).map(r => r.id);
    const allSelected = unpaidVisible.length > 0 && unpaidVisible.every(id => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : new Set(unpaidVisible));
  };

  const submitPayment = async () => {
    if (payableSelected.length === 0) return;
    setPaySubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const paidAtIso = new Date(`${payDate}T12:00:00`).toISOString();
      const updates = payableSelected.map(r => ({
        id: r.id,
        totalFee: r.totalFee ?? 0,
      }));
      for (const u of updates) {
        const { error } = await supabase
          .from('mmp_site_entries')
          .update({
            fee_paid_status: 'paid',
            fee_paid_amount: u.totalFee,
            fee_paid_at: paidAtIso,
            fee_paid_by: user?.id ?? null,
            fee_payment_method: payMethod,
            fee_payment_notes: payNotes || null,
          })
          .eq('id', u.id);
        if (error) throw error;
      }
      toast({ title: 'Payment recorded', description: `Marked ${updates.length} fee${updates.length !== 1 ? 's' : ''} as paid (${selectedTotal.toLocaleString()} SDG).` });
      setPayDialogOpen(false);
      setSelectedIds(new Set());
      setPayNotes('');
      await fetchData();
    } catch (err: any) {
      toast({ title: 'Failed to record payment', description: err?.message, variant: 'destructive' });
    } finally {
      setPaySubmitting(false);
    }
  };

  const confirmUnpay = async () => {
    if (!unpayId) return;
    try {
      const { error } = await supabase
        .from('mmp_site_entries')
        .update({
          fee_paid_status: 'unpaid',
          fee_paid_amount: null,
          fee_paid_at: null,
          fee_paid_by: null,
          fee_payment_method: null,
          fee_payment_notes: null,
        })
        .eq('id', unpayId);
      if (error) throw error;
      toast({ title: 'Payment reverted', description: 'Fee marked as unpaid again.' });
      setUnpayId(null);
      await fetchData();
    } catch (err: any) {
      toast({ title: 'Failed to revert payment', description: err?.message, variant: 'destructive' });
    }
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
      'Payment Status': r.feePaidStatus === 'paid' ? 'Paid' : 'Unpaid',
      'Paid Date': r.feePaidAt ? fmtDate(r.feePaidAt) : '',
      'Payment Method': r.feePaymentMethod || '',
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
            Enumerator Fees Report & Payments
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track enumerator and transport fees across all MMP site visits — by cycle, hub, state, and acknowledgement status.
            {isFinance && ' Mark fees as paid here to reflect payments made outside the app (e.g. site visits completed manually).'}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={fetchData} disabled={loading} data-testid="button-refresh-fees">
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
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
        <Card data-testid="kpi-paid">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="h-4 w-4 text-emerald-600" />
              <span className="text-xs text-muted-foreground font-medium">Paid</span>
            </div>
            {loading ? <Skeleton className="h-7 w-24" /> : (
              <>
                <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300">{kpi.totalPaid.toLocaleString()} SDG</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{kpi.paid} site{kpi.paid !== 1 ? 's' : ''} paid</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card data-testid="kpi-unpaid">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Banknote className="h-4 w-4 text-red-500" />
              <span className="text-xs text-muted-foreground font-medium">Unpaid</span>
            </div>
            {loading ? <Skeleton className="h-7 w-24" /> : (
              <>
                <p className="text-xl font-bold text-red-600 dark:text-red-400">{kpi.totalUnpaid.toLocaleString()} SDG</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{kpi.unpaid} site{kpi.unpaid !== 1 ? 's' : ''} unpaid</p>
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
            <Select value={filterPaid} onValueChange={setFilterPaid}>
              <SelectTrigger className="w-[130px] h-8 text-xs" data-testid="select-fee-paid"><SelectValue placeholder="Payment" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Payment</SelectItem>
                <SelectItem value="paid">💰 Paid</SelectItem>
                <SelectItem value="unpaid">⏳ Unpaid</SelectItem>
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
          <div className="flex items-center justify-between mt-2 gap-2 flex-wrap">
            <p className="text-[11px] text-muted-foreground">{filtered.length} of {rows.length} entries</p>
            {isFinance && (
              <Button
                size="sm"
                className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                disabled={payableSelected.length === 0}
                onClick={() => setPayDialogOpen(true)}
                data-testid="button-mark-paid"
              >
                <Wallet className="h-3.5 w-3.5" />
                Mark {payableSelected.length > 0 ? `${payableSelected.length} ` : ''}Paid
                {payableSelected.length > 0 && ` (${selectedTotal.toLocaleString()} SDG)`}
              </Button>
            )}
          </div>
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
                    {isFinance && (
                      <TableHead className="w-8">
                        <Checkbox
                          checked={(() => {
                            const unpaidVisible = filtered.filter(r => r.feePaidStatus !== 'paid' && (r.totalFee ?? 0) > 0).map(r => r.id);
                            return unpaidVisible.length > 0 && unpaidVisible.every(id => selectedIds.has(id));
                          })()}
                          onCheckedChange={toggleSelectAllUnpaid}
                          data-testid="checkbox-select-all-fees"
                        />
                      </TableHead>
                    )}
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
                    <TableHead className="text-center">Payment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(r => {
                    const payable = (r.totalFee ?? 0) > 0;
                    return (
                    <TableRow key={r.id} className="text-xs hover:bg-muted/30" data-testid={`row-fee-${r.id}`}>
                      {isFinance && (
                        <TableCell>
                          {payable && r.feePaidStatus !== 'paid' && (
                            <Checkbox
                              checked={selectedIds.has(r.id)}
                              onCheckedChange={() => toggleSelected(r.id)}
                              data-testid={`checkbox-fee-${r.id}`}
                            />
                          )}
                        </TableCell>
                      )}
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
                      <TableCell className="text-center">
                        {!payable ? (
                          <span className="text-muted-foreground text-[10px]">—</span>
                        ) : r.feePaidStatus === 'paid' ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <Badge className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">💰 Paid</Badge>
                            <span className="text-[9px] text-muted-foreground">{r.feePaidAt ? fmtDate(r.feePaidAt) : ''}{r.feePaymentMethod ? ` · ${r.feePaymentMethod}` : ''}</span>
                            {isFinance && (
                              <button
                                type="button"
                                className="text-[9px] text-muted-foreground hover:text-red-600 underline flex items-center gap-0.5"
                                onClick={() => setUnpayId(r.id)}
                                data-testid={`button-unpay-${r.id}`}
                              >
                                <Undo2 className="h-2.5 w-2.5" /> Undo
                              </button>
                            )}
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">Unpaid</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                    );
                  })}
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

      {/* Mark as Paid dialog */}
      <Dialog open={payDialogOpen} onOpenChange={(o) => { if (!paySubmitting) setPayDialogOpen(o); }}>
        <DialogContent data-testid="dialog-mark-paid">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-emerald-600" /> Mark Fees as Paid
            </DialogTitle>
            <DialogDescription>
              This records the payment on {payableSelected.length} site entr{payableSelected.length !== 1 ? 'ies' : 'y'} for a total of{' '}
              <span className="font-semibold text-foreground">{selectedTotal.toLocaleString()} SDG</span>.
              It does not touch the Wallet or Withdrawal system — use this to reflect fees already paid outside the app.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-xs">Payment Date</Label>
              <Input
                type="date"
                value={payDate}
                onChange={e => setPayDate(e.target.value)}
                className="h-9 mt-1"
                data-testid="input-pay-date"
              />
            </div>
            <div>
              <Label className="text-xs">Payment Method</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger className="h-9 mt-1" data-testid="select-pay-method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea
                value={payNotes}
                onChange={e => setPayNotes(e.target.value)}
                placeholder="e.g. Paid in cash by hub coordinator, batch settled 04/07"
                className="mt-1 text-sm"
                rows={3}
                data-testid="input-pay-notes"
              />
            </div>
            <div className="max-h-32 overflow-y-auto rounded border p-2 space-y-1">
              {payableSelected.map(r => (
                <div key={r.id} className="flex justify-between text-xs">
                  <span className="truncate max-w-[220px]" title={`${r.enumeratorName} — ${r.siteName}`}>{r.enumeratorName} — {r.siteName}</span>
                  <span className="font-mono shrink-0">{(r.totalFee ?? 0).toLocaleString()} SDG</span>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialogOpen(false)} disabled={paySubmitting} data-testid="button-cancel-pay">
              Cancel
            </Button>
            <Button onClick={submitPayment} disabled={paySubmitting} className="bg-emerald-600 hover:bg-emerald-700" data-testid="button-confirm-pay">
              {paySubmitting ? 'Saving…' : `Confirm Payment (${selectedTotal.toLocaleString()} SDG)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Undo payment confirm dialog */}
      <Dialog open={!!unpayId} onOpenChange={(o) => { if (!o) setUnpayId(null); }}>
        <DialogContent data-testid="dialog-unpay">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Undo2 className="h-4 w-4 text-red-500" /> Revert Payment?
            </DialogTitle>
            <DialogDescription>
              This will mark the fee as unpaid again and clear its payment date, method, and notes. Use this only to correct a mistake.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnpayId(null)} data-testid="button-cancel-unpay">Cancel</Button>
            <Button variant="destructive" onClick={confirmUnpay} data-testid="button-confirm-unpay">Revert to Unpaid</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
