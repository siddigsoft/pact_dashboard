import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Download, FileSpreadsheet, Loader2, MapPin, Users,
  CheckCircle2, Clock, AlertCircle, BarChart3, X,
  ShieldAlert, TrendingUp, Activity, FileText, DollarSign, History, Banknote,
} from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// ── Status helpers ────────────────────────────────────────────────────────────
const DONE_STATUSES = new Set([
  'wfp_confirmed', 'completed', 'verified', 'approved', 'cp_verified',
  'locality_permit_verified', 'approved_and_costed', 'costed',
]);
const IN_PROGRESS_STATUSES = new Set([
  'accepted', 'claimed', 'in_progress', 'ongoing', 'dispatched', 'assigned',
  'forwarded', 'forwarded_to_coordinator', 'forwarded_to_fom', 'permits_attached',
  'with_coordinators', 'submitted', 'acknowledged', 'site_claim',
]);
const ATTENTION_STATUSES = new Set([
  'rejected', 'declined', 'returned', 'returned_to_fom', 'recalled', 'sent_back',
]);

type EntryClass = 'done' | 'in_progress' | 'attention' | 'pending';

function classifyEntry(status: string): EntryClass {
  const s = (status || '').toLowerCase().trim();
  if (DONE_STATUSES.has(s)) return 'done';
  if (IN_PROGRESS_STATUSES.has(s)) return 'in_progress';
  if (ATTENTION_STATUSES.has(s)) return 'attention';
  return 'pending';
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending', not_covered: 'Not Covered', new: 'New', cancelled: 'Cancelled',
  assigned: 'Assigned', forwarded: 'Forwarded', forwarded_to_fom: 'Fwd → FOM',
  forwarded_to_coordinator: 'Fwd → Coord', with_coordinators: 'With Coordinators',
  dispatched: 'Dispatched', accepted: 'Accepted', acknowledged: 'Acknowledged',
  claimed: 'Claimed', ongoing: 'In Progress', in_progress: 'In Progress',
  permits_attached: 'Permits Attached', submitted: 'Submitted', cp_verified: 'CP Verified',
  verified: 'Verified ✓', approved: 'Approved ✓', costed: 'Costed ✓',
  completed: 'Completed ✓', wfp_confirmed: 'WFP Confirmed ✓', rejected: 'Rejected',
  declined: 'Declined', returned: 'Returned', returned_to_fom: 'Returned to FOM',
  recalled: 'Recalled', written_off: 'Written Off',
};

function fmtStatus(s: string) {
  return STATUS_LABEL[(s || '').toLowerCase()] || (s || '—').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Interfaces ────────────────────────────────────────────────────────────────
interface SiteEntry {
  id: string;
  site_name: string | null;
  site_code: string | null;
  status: string;
  hub_office: string | null;
  state: string | null;
  locality: string | null;
  forwarded_to_user_id: string | null;
  additional_data: Record<string, any> | null;
  enumerator_fee: number | null;
  transport_fee: number | null;
  cost: number | null;
  visit_completed_by: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  mmpId: string;
  mmpName: string;
}

// ── Stat badge colours ───────────────────────────────────────────────────────
const clsCard: Record<EntryClass | 'total', string> = {
  total:       'border-blue-200   dark:border-blue-800   bg-blue-50/60   dark:bg-blue-950/20  text-blue-700   dark:text-blue-300',
  done:        'border-green-200  dark:border-green-800  bg-green-50/60  dark:bg-green-950/20 text-green-700  dark:text-green-300',
  in_progress: 'border-amber-200  dark:border-amber-800  bg-amber-50/60  dark:bg-amber-950/20 text-amber-700  dark:text-amber-300',
  attention:   'border-red-200    dark:border-red-800    bg-red-50/60    dark:bg-red-950/20   text-red-600    dark:text-red-400',
  pending:     'border-slate-200  dark:border-slate-700  bg-slate-50/60  dark:bg-slate-900/20 text-slate-600  dark:text-slate-400',
};

const MmpFullReportDialog = ({ open, onClose, mmpId, mmpName }: Props) => {
  const [mmp, setMmp] = useState<any>(null);
  const [entries, setEntries] = useState<SiteEntry[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('overview');
  const [siteFilter, setSiteFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  // Financial & Activity data
  const [downPayments, setDownPayments] = useState<any[]>([]);
  const [costSubmissions, setCostSubmissions] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [financeLoading, setFinanceLoading] = useState(false);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open || !mmpId) return;
    setLoading(true);
    setFinanceLoading(true);
    setEntries([]);
    setMmp(null);
    setProfileMap({});
    setDownPayments([]);
    setCostSubmissions([]);
    setActivityLogs([]);

    (async () => {
      try {
        const [{ data: mmpData }, allEntries] = await Promise.all([
          supabase
            .from('mmp_files')
            .select('id, name, mmp_id, status, cycle_status, created_at, uploaded_by, project:projects(name)')
            .eq('id', mmpId)
            .single(),
          (async () => {
            let all: SiteEntry[] = [];
            let from = 0;
            while (true) {
              const { data, error } = await supabase
                .from('mmp_site_entries')
                .select('id, site_name, site_code, status, hub_office, state, locality, forwarded_to_user_id, additional_data, enumerator_fee, transport_fee, cost, visit_completed_by')
                .eq('mmp_file_id', mmpId)
                .range(from, from + 999);
              if (error) break;
              if (!data?.length) break;
              all = all.concat(data as SiteEntry[]);
              if (data.length < 1000) break;
              from += 1000;
            }
            return all;
          })(),
        ]);

        setMmp(mmpData);
        setEntries(allEntries);

        // Resolve coordinator names
        const coordIds = new Set<string>();
        allEntries.forEach(e => {
          const id = (e.additional_data as any)?.assigned_to || e.forwarded_to_user_id;
          if (id) coordIds.add(id);
        });
        if (coordIds.size > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, email')
            .in('id', [...coordIds]);
          const pm: Record<string, string> = {};
          (profiles || []).forEach((p: any) => { pm[p.id] = p.full_name || p.email || p.id; });
          setProfileMap(pm);
        }
      } finally {
        setLoading(false);
      }

      // ── Financial + Activity (parallel, non-blocking) ─────────────────
      try {
        const [dpRes, csRes, alRes] = await Promise.allSettled([
          supabase
            .from('down_payment_requests')
            .select('id, site_name, hub_name, status, requested_amount, total_paid_amount, remaining_amount, payment_type, created_at, supervisor_status, admin_status, fully_paid_at')
            .eq('mmp_file_id', mmpId)
            .order('created_at', { ascending: false }),
          supabase
            .from('operational_cost_submissions')
            .select('id, status, tier1_status, tier2_status, tier3_status, amount_cents, expense_category, description, hub_id, created_at, request_title')
            .eq('mmp_file_id', mmpId)
            .order('created_at', { ascending: false }),
          supabase
            .from('audit_logs')
            .select('id, actor_name, actor_role, timestamp, action, description, details, new_state, previous_state')
            .in('entity_type', ['mmp', 'mmp_file', 'mmp_files'])
            .eq('entity_id', mmpId)
            .order('timestamp', { ascending: false })
            .limit(100),
        ]);
        if (dpRes.status === 'fulfilled') setDownPayments(dpRes.value.data || []);
        if (csRes.status === 'fulfilled') setCostSubmissions(csRes.value.data || []);
        if (alRes.status === 'fulfilled') setActivityLogs(alRes.value.data || []);
      } finally {
        setFinanceLoading(false);
      }
    })();
  }, [open, mmpId]);

  // ── Derived stats ─────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!entries.length) return null;

    let done = 0, inProgress = 0, attention = 0, pending = 0, totalFees = 0;
    const stateMap: Record<string, { total: number; done: number; inProgress: number; attention: number; pending: number; fees: number; coordIds: Set<string> }> = {};
    const coordMap: Record<string, { name: string; states: Set<string>; total: number; done: number; inProgress: number; attention: number }> = {};
    const statusCountMap: Record<string, number> = {};

    entries.forEach(e => {
      const stateName = e.state || e.hub_office || 'Unknown State';
      const cls = classifyEntry(e.status);
      const fee = Number(e.enumerator_fee || 0) + Number(e.transport_fee || 0) + Number(e.cost || 0);
      totalFees += fee;

      statusCountMap[e.status] = (statusCountMap[e.status] || 0) + 1;

      if (cls === 'done') done++;
      else if (cls === 'in_progress') inProgress++;
      else if (cls === 'attention') attention++;
      else pending++;

      if (!stateMap[stateName]) {
        stateMap[stateName] = { total: 0, done: 0, inProgress: 0, attention: 0, pending: 0, fees: 0, coordIds: new Set() };
      }
      const st = stateMap[stateName];
      st.total++;
      st.fees += fee;
      if (cls === 'done') st.done++;
      else if (cls === 'in_progress') st.inProgress++;
      else if (cls === 'attention') st.attention++;
      else st.pending++;

      const coordId = (e.additional_data as any)?.assigned_to || e.forwarded_to_user_id;
      if (coordId) {
        st.coordIds.add(coordId);
        if (!coordMap[coordId]) {
          coordMap[coordId] = { name: profileMap[coordId] || coordId, states: new Set(), total: 0, done: 0, inProgress: 0, attention: 0 };
        }
        const co = coordMap[coordId];
        co.states.add(stateName);
        co.total++;
        if (cls === 'done') co.done++;
        else if (cls === 'in_progress') co.inProgress++;
        else if (cls === 'attention') co.attention++;
      }
    });

    const total = entries.length;
    const byState = Object.entries(stateMap)
      .map(([name, s]) => ({ name, ...s, coveragePct: s.total > 0 ? Math.round((s.done / s.total) * 100) : 0 }))
      .sort((a, b) => b.total - a.total);

    const byCoordinator = Object.entries(coordMap)
      .map(([id, c]) => ({ id, ...c, name: profileMap[id] || c.name, coveragePct: c.total > 0 ? Math.round((c.done / c.total) * 100) : 0 }))
      .sort((a, b) => b.total - a.total);

    const topStatuses = Object.entries(statusCountMap).sort((a, b) => b[1] - a[1]).slice(0, 10);

    return {
      total, done, inProgress, attention, pending, totalFees,
      coveragePct: total > 0 ? Math.round((done / total) * 100) : 0,
      stateCount: Object.keys(stateMap).length,
      coordCount: Object.keys(coordMap).length,
      byState, byCoordinator, topStatuses,
    };
  }, [entries, profileMap]);

  // ── Filtered sites ────────────────────────────────────────────────────────
  const filteredSites = useMemo(() => {
    let list = entries;
    if (statusFilter !== 'all') list = list.filter(e => classifyEntry(e.status) === statusFilter);
    if (siteFilter) {
      const q = siteFilter.toLowerCase();
      list = list.filter(e =>
        (e.site_name || '').toLowerCase().includes(q) ||
        (e.site_code || '').toLowerCase().includes(q) ||
        (e.state || e.hub_office || '').toLowerCase().includes(q)
      );
    }
    return list.slice(0, 500); // cap display at 500
  }, [entries, siteFilter, statusFilter]);

  // ── PDF Export ────────────────────────────────────────────────────────────
  const exportPDF = () => {
    if (!stats || !mmp) return;
    const doc = new jsPDF({ orientation: 'landscape' });
    const now = format(new Date(), 'dd MMM yyyy HH:mm');
    const mmpTitle = mmp.name || mmp.mmp_id || mmpName;

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Full MMP Status Report', 14, 16);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`${mmpTitle}  |  Project: ${(mmp.project as any)?.name || '—'}  |  Generated: ${now}`, 14, 24);
    doc.setFontSize(9);
    doc.text(
      `Total: ${stats.total}  •  Covered: ${stats.done} (${stats.coveragePct}%)  •  In Progress: ${stats.inProgress}  •  Needs Attention: ${stats.attention}  •  Pending: ${stats.pending}  •  States: ${stats.stateCount}  •  Coordinators: ${stats.coordCount}`,
      14, 30
    );

    autoTable(doc, {
      startY: 36,
      head: [['State', 'Total', 'Covered', 'In Progress', 'Attention', 'Pending', 'Coverage %', 'Coordinators', 'Fees (SDG)']],
      body: stats.byState.map(s => [s.name, s.total, s.done, s.inProgress, s.attention, s.pending, `${s.coveragePct}%`, s.coordIds.size, s.fees > 0 ? s.fees.toLocaleString() : '—']),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [30, 80, 160] },
      alternateRowStyles: { fillColor: [240, 244, 255] },
    });

    const y1 = (doc as any).lastAutoTable?.finalY + 8 || 120;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Coordinator Performance', 14, y1);

    autoTable(doc, {
      startY: y1 + 4,
      head: [['Coordinator', 'States', 'Assigned', 'Covered', 'In Progress', 'Attention', 'Pending', 'Coverage %']],
      body: stats.byCoordinator.map(c => [c.name, c.states.size, c.total, c.done, c.inProgress, c.attention, c.total - c.done - c.inProgress - c.attention, `${c.coveragePct}%`]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [60, 120, 80] },
      alternateRowStyles: { fillColor: [240, 255, 244] },
    });

    doc.save(`MMP-Full-Report-${mmp.mmp_id || mmpId}-${format(new Date(), 'yyyyMMdd')}.pdf`);
  };

  // ── Excel Export ──────────────────────────────────────────────────────────
  const exportExcel = () => {
    if (!stats || !mmp) return;
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['PACT Command Center — Full MMP Status Report'],
      [''],
      ['MMP Name', mmp.name || mmp.mmp_id || ''],
      ['Project', (mmp.project as any)?.name || ''],
      ['MMP Status', mmp.status || ''],
      ['Generated', format(new Date(), 'dd MMM yyyy HH:mm')],
      [''],
      ['SUMMARY'],
      ['Total Sites', stats.total],
      ['Covered', stats.done],
      ['Coverage %', `${stats.coveragePct}%`],
      ['In Progress', stats.inProgress],
      ['Needs Attention', stats.attention],
      ['Pending', stats.pending],
      ['Total States', stats.stateCount],
      ['Total Coordinators', stats.coordCount],
      ['Total Fees (SDG)', stats.totalFees],
    ]), 'Summary');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['State', 'Total', 'Covered', 'In Progress', 'Attention', 'Pending', 'Coverage %', 'Coordinators', 'Fees (SDG)'],
      ...stats.byState.map(s => [s.name, s.total, s.done, s.inProgress, s.attention, s.pending, `${s.coveragePct}%`, s.coordIds.size, s.fees]),
    ]), 'By State');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Coordinator', 'States Assigned', 'Total', 'Covered', 'In Progress', 'Attention', 'Pending', 'Coverage %'],
      ...stats.byCoordinator.map(c => [c.name, c.states.size, c.total, c.done, c.inProgress, c.attention, c.total - c.done - c.inProgress - c.attention, `${c.coveragePct}%`]),
    ]), 'By Coordinator');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Site Name', 'Site Code', 'State', 'Locality', 'Status', 'Category', 'Enumerator Fee', 'Transport Fee'],
      ...entries.map(e => [
        e.site_name || '', e.site_code || '',
        e.state || e.hub_office || '', e.locality || '',
        fmtStatus(e.status), classifyEntry(e.status),
        e.enumerator_fee || '', e.transport_fee || '',
      ]),
    ]), 'All Sites');

    XLSX.writeFile(wb, `MMP-Full-Report-${mmp.mmp_id || mmpId}-${format(new Date(), 'yyyyMMdd')}.xlsx`);
  };

  // ── Progress bar ──────────────────────────────────────────────────────────
  const ProgressBar = ({ pct }: { pct: number }) => (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden min-w-[80px]">
        <div
          className={`h-1.5 rounded-full ${pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-semibold tabular-nums w-8 text-right">{pct}%</span>
    </div>
  );

  // ── Badge for status class ────────────────────────────────────────────────
  const ClassBadge = ({ cls }: { cls: EntryClass }) => {
    const conf: Record<EntryClass, { label: string; cls: string }> = {
      done:        { label: 'Covered',     cls: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
      in_progress: { label: 'In Progress', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
      attention:   { label: 'Attention',   cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
      pending:     { label: 'Pending',     cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
    };
    const c = conf[cls];
    return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${c.cls}`}>{c.label}</span>;
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent
        className="max-w-5xl w-full max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden"
        onInteractOutside={e => e.preventDefault()}
      >
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-3 border-b flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2 text-base font-bold">
                <BarChart3 className="h-5 w-5 text-indigo-600 flex-shrink-0" />
                Full MMP Status Report
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-0.5 truncate">
                {mmpName} {mmp?.mmp_id ? `· ${mmp.mmp_id}` : ''} {(mmp?.project as any)?.name ? `· ${(mmp.project as any).name}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button variant="outline" size="sm" onClick={exportExcel} disabled={!stats} className="text-green-700 border-green-300 hover:bg-green-50">
                <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />
                Excel
              </Button>
              <Button size="sm" onClick={exportPDF} disabled={!stats} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                <Download className="h-3.5 w-3.5 mr-1.5" />
                PDF
              </Button>
              <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted transition-colors">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        </DialogHeader>

        {/* Body */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
            <span className="ml-3 text-muted-foreground text-sm">Loading report data…</span>
          </div>
        ) : !stats ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
            <AlertCircle className="h-8 w-8" />
            <p className="text-sm">No site entries found for this MMP.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Summary cards */}
            <div className="grid grid-cols-5 gap-2 px-5 pt-4 pb-3 flex-shrink-0">
              {[
                { label: 'Total Sites', value: stats.total, icon: MapPin, cls: 'total' as const },
                { label: `Covered (${stats.coveragePct}%)`, value: stats.done, icon: CheckCircle2, cls: 'done' as const },
                { label: 'In Progress', value: stats.inProgress, icon: Clock, cls: 'in_progress' as const },
                { label: 'Attention', value: stats.attention, icon: ShieldAlert, cls: 'attention' as const },
                { label: 'Pending', value: stats.pending, icon: Activity, cls: 'pending' as const },
              ].map(({ label, value, icon: Icon, cls }) => (
                <div key={cls} className={`rounded-lg border p-3 ${clsCard[cls]}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon className="h-3.5 w-3.5 opacity-70" />
                    <span className="text-xs opacity-80">{label}</span>
                  </div>
                  <div className="text-2xl font-bold tabular-nums">{value.toLocaleString()}</div>
                </div>
              ))}
            </div>

            {/* Coverage bar */}
            <div className="px-5 pb-3 flex-shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-20">Overall</span>
                <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-2.5 rounded-full transition-all ${stats.coveragePct >= 70 ? 'bg-green-500' : stats.coveragePct >= 40 ? 'bg-amber-500' : 'bg-red-400'}`}
                    style={{ width: `${stats.coveragePct}%` }}
                  />
                </div>
                <span className="text-sm font-bold w-12 text-right tabular-nums">{stats.coveragePct}%</span>
                <span className="text-xs text-muted-foreground">{stats.stateCount} states · {stats.coordCount} coordinators</span>
              </div>
            </div>

            {/* Tabs */}
            <Tabs value={tab} onValueChange={setTab} className="flex-1 overflow-hidden flex flex-col">
              <TabsList className="flex-shrink-0 mx-5 w-auto justify-start">
                <TabsTrigger value="overview" className="text-xs">
                  <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
                  By State
                </TabsTrigger>
                <TabsTrigger value="coordinators" className="text-xs">
                  <Users className="h-3.5 w-3.5 mr-1.5" />
                  Coordinators
                </TabsTrigger>
                <TabsTrigger value="sites" className="text-xs">
                  <MapPin className="h-3.5 w-3.5 mr-1.5" />
                  All Sites ({entries.length.toLocaleString()})
                </TabsTrigger>
                <TabsTrigger value="breakdown" className="text-xs">
                  <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
                  Status Breakdown
                </TabsTrigger>
                <TabsTrigger value="financial" className="text-xs">
                  <DollarSign className="h-3.5 w-3.5 mr-1.5" />
                  Financial
                  {(downPayments.length + costSubmissions.length) > 0 && (
                    <span className="ml-1 text-[10px] bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded-full font-semibold">
                      {downPayments.length + costSubmissions.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="activity" className="text-xs">
                  <History className="h-3.5 w-3.5 mr-1.5" />
                  Activity
                  {activityLogs.length > 0 && (
                    <span className="ml-1 text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded-full font-semibold">
                      {activityLogs.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* ── Tab: By State ── */}
              <TabsContent value="overview" className="flex-1 overflow-auto px-5 py-3 mt-0">
                <table className="w-full text-sm border-separate border-spacing-0">
                  <thead className="sticky top-0 bg-background z-10">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground border-b">State</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground border-b">Total</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-green-700 border-b">Covered</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-amber-700 border-b">In Progress</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-red-600 border-b">Attention</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 border-b">Pending</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground border-b min-w-[140px]">Coverage</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground border-b">Coords</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.byState.map((s, i) => (
                      <tr key={s.name} className={i % 2 === 0 ? '' : 'bg-muted/20'}>
                        <td className="px-3 py-2 font-medium">{s.name}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{s.total}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-green-700 dark:text-green-400">{s.done}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-amber-700 dark:text-amber-400">{s.inProgress}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-red-600 dark:text-red-400">{s.attention}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{s.pending}</td>
                        <td className="px-3 py-2"><ProgressBar pct={s.coveragePct} /></td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{s.coordIds.size}</td>
                      </tr>
                    ))}
                    <tr className="bg-primary/5 font-bold border-t-2 border-primary/20">
                      <td className="px-3 py-2">TOTAL</td>
                      <td className="px-3 py-2 text-right tabular-nums">{stats.total}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-green-700">{stats.done}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-700">{stats.inProgress}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-red-600">{stats.attention}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{stats.pending}</td>
                      <td className="px-3 py-2"><ProgressBar pct={stats.coveragePct} /></td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{stats.coordCount}</td>
                    </tr>
                  </tbody>
                </table>
              </TabsContent>

              {/* ── Tab: Coordinators ── */}
              <TabsContent value="coordinators" className="flex-1 overflow-auto px-5 py-3 mt-0">
                {stats.byCoordinator.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground text-sm">No coordinator assignments found.</div>
                ) : (
                  <table className="w-full text-sm border-separate border-spacing-0">
                    <thead className="sticky top-0 bg-background z-10">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground border-b">#</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground border-b">Coordinator</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground border-b">States</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground border-b">Assigned</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-green-700 border-b">Covered</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-amber-700 border-b">In Progress</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-red-600 border-b">Attention</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 border-b">Pending</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground border-b min-w-[120px]">Coverage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.byCoordinator.map((c, i) => (
                        <tr key={c.id} className={i % 2 === 0 ? '' : 'bg-muted/20'}>
                          <td className="px-3 py-2 text-muted-foreground text-xs">{i + 1}</td>
                          <td className="px-3 py-2 font-medium">{c.name}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{c.states.size}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">{c.total}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-green-700 dark:text-green-400">{c.done}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-amber-700 dark:text-amber-400">{c.inProgress}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-red-600 dark:text-red-400">{c.attention}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{c.total - c.done - c.inProgress - c.attention}</td>
                          <td className="px-3 py-2"><ProgressBar pct={c.coveragePct} /></td>
                        </tr>
                      ))}
                      {/* Totals row */}
                      <tr className="bg-primary/5 font-bold border-t-2 border-primary/20">
                        <td className="px-3 py-2 text-muted-foreground text-xs">—</td>
                        <td className="px-3 py-2">TOTAL ({stats.coordCount} coordinators)</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {new Set(stats.byCoordinator.flatMap(c => [...c.states])).size}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{stats.byCoordinator.reduce((s, c) => s + c.total, 0)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-green-700">{stats.byCoordinator.reduce((s, c) => s + c.done, 0)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-amber-700">{stats.byCoordinator.reduce((s, c) => s + c.inProgress, 0)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-red-600">{stats.byCoordinator.reduce((s, c) => s + c.attention, 0)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{stats.byCoordinator.reduce((s, c) => s + (c.total - c.done - c.inProgress - c.attention), 0)}</td>
                        <td className="px-3 py-2"><ProgressBar pct={stats.coveragePct} /></td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </TabsContent>

              {/* ── Tab: All Sites ── */}
              <TabsContent value="sites" className="flex-1 overflow-hidden flex flex-col mt-0 px-5 pt-3 pb-0">
                {/* Filter bar */}
                <div className="flex gap-2 mb-3 flex-shrink-0">
                  <input
                    type="text"
                    placeholder="Search site name, code, state…"
                    value={siteFilter}
                    onChange={e => setSiteFilter(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className="px-3 py-1.5 text-sm border rounded-md bg-background focus:outline-none"
                  >
                    <option value="all">All Categories</option>
                    <option value="done">Covered</option>
                    <option value="in_progress">In Progress</option>
                    <option value="attention">Needs Attention</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>
                <div className="overflow-auto flex-1 pb-3">
                  <table className="w-full text-sm border-separate border-spacing-0">
                    <thead className="sticky top-0 bg-background z-10">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground border-b">Site</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground border-b">Code</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground border-b">State</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground border-b">Locality</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground border-b">Status</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground border-b">Category</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSites.map((e, i) => (
                        <tr key={e.id} className={i % 2 === 0 ? '' : 'bg-muted/20'}>
                          <td className="px-3 py-1.5 font-medium max-w-[180px] truncate" title={e.site_name || ''}>{e.site_name || '—'}</td>
                          <td className="px-3 py-1.5 text-muted-foreground font-mono text-xs">{e.site_code || '—'}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{e.state || e.hub_office || '—'}</td>
                          <td className="px-3 py-1.5 text-muted-foreground text-xs">{e.locality || '—'}</td>
                          <td className="px-3 py-1.5 text-xs">{fmtStatus(e.status)}</td>
                          <td className="px-3 py-1.5"><ClassBadge cls={classifyEntry(e.status)} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredSites.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-sm">No sites match the filter.</div>
                  )}
                  {entries.length > 500 && (
                    <p className="text-xs text-muted-foreground text-center py-2">Showing 500 of {entries.length} — use export for the full list.</p>
                  )}
                </div>
              </TabsContent>

              {/* ── Tab: Status Breakdown ── */}
              <TabsContent value="breakdown" className="flex-1 overflow-auto px-5 py-3 mt-0">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      Top Statuses
                    </h3>
                    <div className="space-y-2">
                      {stats.topStatuses.map(([status, count]) => {
                        const pct = Math.round((count / stats.total) * 100);
                        return (
                          <div key={status} className="flex items-center gap-3">
                            <ClassBadge cls={classifyEntry(status)} />
                            <span className="text-sm flex-1 truncate">{fmtStatus(status)}</span>
                            <span className="text-sm tabular-nums font-medium w-8 text-right">{count}</span>
                            <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-1.5 bg-primary rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <Activity className="h-4 w-4 text-muted-foreground" />
                      Category Overview
                    </h3>
                    {[
                      { label: 'Covered (Done)', value: stats.done, color: 'bg-green-500', pct: stats.coveragePct },
                      { label: 'In Progress', value: stats.inProgress, color: 'bg-amber-500', pct: Math.round((stats.inProgress / stats.total) * 100) },
                      { label: 'Needs Attention', value: stats.attention, color: 'bg-red-500', pct: Math.round((stats.attention / stats.total) * 100) },
                      { label: 'Pending', value: stats.pending, color: 'bg-slate-400', pct: Math.round((stats.pending / stats.total) * 100) },
                    ].map(({ label, value, color, pct }) => (
                      <div key={label} className="mb-3">
                        <div className="flex justify-between text-sm mb-1">
                          <span>{label}</span>
                          <span className="font-medium">{value.toLocaleString()} ({pct}%)</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className={`h-2 ${color} rounded-full`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    ))}
                    <div className="mt-4 pt-3 border-t text-xs text-muted-foreground space-y-1">
                      <div className="flex justify-between"><span>Total Fees</span><span className="font-medium tabular-nums">SDG {stats.totalFees.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span>MMP ID</span><span className="font-mono">{mmp?.mmp_id || '—'}</span></div>
                      <div className="flex justify-between"><span>MMP Status</span><span className="capitalize">{mmp?.status || '—'}</span></div>
                      <div className="flex justify-between"><span>Uploaded</span><span>{mmp?.created_at ? format(new Date(mmp.created_at), 'dd MMM yyyy') : '—'}</span></div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* ── Tab: Financial ── */}
              <TabsContent value="financial" className="flex-1 overflow-auto px-5 py-3 mt-0 space-y-6">
                {financeLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-indigo-600 mr-2" />
                    <span className="text-sm text-muted-foreground">Loading financial data…</span>
                  </div>
                ) : (
                  <>
                    {/* ── Down Payments ─── */}
                    <div>
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <Banknote className="h-4 w-4 text-emerald-600" />
                        Down Payment Requests
                        <span className="text-xs font-normal text-muted-foreground">({downPayments.length} records)</span>
                      </h3>
                      {downPayments.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4 text-center">No down payment requests linked to this MMP.</p>
                      ) : (
                        <>
                          {/* Status summary pills */}
                          <div className="flex flex-wrap gap-2 mb-3">
                            {Object.entries(
                              downPayments.reduce<Record<string, number>>((acc, dp) => { acc[dp.status] = (acc[dp.status] || 0) + 1; return acc; }, {})
                            ).sort((a, b) => b[1] - a[1]).map(([status, count]) => {
                              const statusColors: Record<string, string> = {
                                fully_paid: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
                                approved: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
                                partially_paid: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
                                pending_admin: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
                                pending_supervisor: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
                                rejected: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
                              };
                              const cls = statusColors[status] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
                              return (
                                <span key={status} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${cls}`}>
                                  {status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                  <span className="font-bold">{count}</span>
                                </span>
                              );
                            })}
                          </div>
                          {/* Totals summary */}
                          <div className="grid grid-cols-3 gap-3 mb-3">
                            {[
                              { label: 'Total Requested', value: downPayments.reduce((s, d) => s + Number(d.requested_amount || 0), 0) },
                              { label: 'Total Paid', value: downPayments.reduce((s, d) => s + Number(d.total_paid_amount || 0), 0) },
                              { label: 'Remaining Balance', value: downPayments.reduce((s, d) => s + Number(d.remaining_amount || 0), 0) },
                            ].map(({ label, value }) => (
                              <div key={label} className="rounded-lg border bg-muted/30 px-3 py-2">
                                <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                                <p className="text-base font-bold tabular-nums">SDG {value.toLocaleString()}</p>
                              </div>
                            ))}
                          </div>
                          {/* Detail table */}
                          <table className="w-full text-sm border-separate border-spacing-0">
                            <thead className="sticky top-0 bg-background z-10">
                              <tr>
                                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground border-b">Site</th>
                                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground border-b">Hub</th>
                                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground border-b">Type</th>
                                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground border-b">Status</th>
                                <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground border-b">Requested (SDG)</th>
                                <th className="text-right px-3 py-2 text-xs font-semibold text-green-700 border-b">Paid (SDG)</th>
                                <th className="text-right px-3 py-2 text-xs font-semibold text-red-600 border-b">Remaining</th>
                                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground border-b">Date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {downPayments.map((dp, i) => {
                                const statusColors: Record<string, string> = {
                                  fully_paid: 'text-green-700 dark:text-green-400',
                                  approved: 'text-blue-700 dark:text-blue-400',
                                  partially_paid: 'text-amber-700 dark:text-amber-400',
                                  pending_admin: 'text-purple-700 dark:text-purple-400',
                                  pending_supervisor: 'text-orange-600 dark:text-orange-400',
                                  rejected: 'text-red-600 dark:text-red-400',
                                };
                                return (
                                  <tr key={dp.id} className={i % 2 === 0 ? '' : 'bg-muted/20'}>
                                    <td className="px-3 py-1.5 font-medium max-w-[140px] truncate" title={dp.site_name || ''}>{dp.site_name || '—'}</td>
                                    <td className="px-3 py-1.5 text-muted-foreground text-xs">{dp.hub_name || '—'}</td>
                                    <td className="px-3 py-1.5 text-muted-foreground text-xs capitalize">{(dp.payment_type || '').replace(/_/g, ' ') || '—'}</td>
                                    <td className={`px-3 py-1.5 text-xs font-medium capitalize ${statusColors[dp.status] || 'text-muted-foreground'}`}>
                                      {(dp.status || '').replace(/_/g, ' ')}
                                    </td>
                                    <td className="px-3 py-1.5 text-right tabular-nums">{Number(dp.requested_amount || 0).toLocaleString()}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-green-700 dark:text-green-400">{Number(dp.total_paid_amount || 0).toLocaleString()}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-red-600 dark:text-red-400">{Number(dp.remaining_amount || 0).toLocaleString()}</td>
                                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{dp.created_at ? format(new Date(dp.created_at), 'dd MMM yyyy') : '—'}</td>
                                  </tr>
                                );
                              })}
                              {/* Down payments totals row */}
                              <tr className="bg-primary/5 font-bold border-t-2 border-primary/20">
                                <td className="px-3 py-2" colSpan={4}>TOTAL ({downPayments.length})</td>
                                <td className="px-3 py-2 text-right tabular-nums">{downPayments.reduce((s, d) => s + Number(d.requested_amount || 0), 0).toLocaleString()}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-green-700">{downPayments.reduce((s, d) => s + Number(d.total_paid_amount || 0), 0).toLocaleString()}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-red-600">{downPayments.reduce((s, d) => s + Number(d.remaining_amount || 0), 0).toLocaleString()}</td>
                                <td className="px-3 py-2" />
                              </tr>
                            </tbody>
                          </table>
                        </>
                      )}
                    </div>

                    {/* ── Operational Cost Submissions ─── */}
                    <div>
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-indigo-600" />
                        Operational Cost Submissions
                        <span className="text-xs font-normal text-muted-foreground">({costSubmissions.length} records)</span>
                      </h3>
                      {costSubmissions.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4 text-center">No cost submissions linked to this MMP.</p>
                      ) : (
                        <>
                          {/* Status summary pills */}
                          <div className="flex flex-wrap gap-2 mb-3">
                            {Object.entries(
                              costSubmissions.reduce<Record<string, number>>((acc, cs) => { acc[cs.status] = (acc[cs.status] || 0) + 1; return acc; }, {})
                            ).sort((a, b) => b[1] - a[1]).map(([status, count]) => {
                              const cls = status === 'approved' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                                : status === 'pending' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                                : status === 'rejected' ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
                              return (
                                <span key={status} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${cls}`}>
                                  {status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                  <span className="font-bold">{count}</span>
                                </span>
                              );
                            })}
                          </div>
                          {/* Total amount */}
                          <div className="grid grid-cols-3 gap-3 mb-3">
                            <div className="rounded-lg border bg-muted/30 px-3 py-2">
                              <p className="text-xs text-muted-foreground mb-0.5">Total Amount</p>
                              <p className="text-base font-bold tabular-nums">
                                SDG {(costSubmissions.reduce((s, c) => s + Number(c.amount_cents || 0), 0) / 100).toLocaleString()}
                              </p>
                            </div>
                            <div className="rounded-lg border bg-muted/30 px-3 py-2">
                              <p className="text-xs text-muted-foreground mb-0.5">Approved</p>
                              <p className="text-base font-bold tabular-nums text-green-700">
                                SDG {(costSubmissions.filter(c => c.status === 'approved').reduce((s, c) => s + Number(c.amount_cents || 0), 0) / 100).toLocaleString()}
                              </p>
                            </div>
                            <div className="rounded-lg border bg-muted/30 px-3 py-2">
                              <p className="text-xs text-muted-foreground mb-0.5">Pending</p>
                              <p className="text-base font-bold tabular-nums text-amber-700">
                                SDG {(costSubmissions.filter(c => c.status === 'pending').reduce((s, c) => s + Number(c.amount_cents || 0), 0) / 100).toLocaleString()}
                              </p>
                            </div>
                          </div>
                          {/* Detail table */}
                          <table className="w-full text-sm border-separate border-spacing-0">
                            <thead className="sticky top-0 bg-background z-10">
                              <tr>
                                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground border-b">Title / Category</th>
                                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground border-b">Overall Status</th>
                                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground border-b">Tier 1</th>
                                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground border-b">Tier 2</th>
                                <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground border-b">Amount (SDG)</th>
                                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground border-b">Date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {costSubmissions.map((cs, i) => {
                                const tierBadge = (s: string | null) => {
                                  if (!s) return null;
                                  const cls = s === 'approved' ? 'text-green-700' : s === 'pending' ? 'text-amber-700' : s === 'rejected' ? 'text-red-600' : 'text-muted-foreground';
                                  return <span className={`capitalize text-xs ${cls}`}>{s.replace(/_/g, ' ')}</span>;
                                };
                                return (
                                  <tr key={cs.id} className={i % 2 === 0 ? '' : 'bg-muted/20'}>
                                    <td className="px-3 py-1.5 max-w-[180px]">
                                      <div className="font-medium truncate text-xs" title={cs.request_title || ''}>{cs.request_title || '—'}</div>
                                      <div className="text-muted-foreground text-xs capitalize">{(cs.expense_category || '').replace(/_/g, ' ')}</div>
                                    </td>
                                    <td className={`px-3 py-1.5 text-xs font-medium capitalize ${cs.status === 'approved' ? 'text-green-700' : cs.status === 'pending' ? 'text-amber-700' : cs.status === 'rejected' ? 'text-red-600' : 'text-muted-foreground'}`}>
                                      {(cs.status || '').replace(/_/g, ' ')}
                                    </td>
                                    <td className="px-3 py-1.5">{tierBadge(cs.tier1_status)}</td>
                                    <td className="px-3 py-1.5">{tierBadge(cs.tier2_status)}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums">{(Number(cs.amount_cents || 0) / 100).toLocaleString()}</td>
                                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{cs.created_at ? format(new Date(cs.created_at), 'dd MMM yyyy') : '—'}</td>
                                  </tr>
                                );
                              })}
                              {/* Cost submissions totals row */}
                              <tr className="bg-primary/5 font-bold border-t-2 border-primary/20">
                                <td className="px-3 py-2" colSpan={4}>TOTAL ({costSubmissions.length})</td>
                                <td className="px-3 py-2 text-right tabular-nums">{(costSubmissions.reduce((s, c) => s + Number(c.amount_cents || 0), 0) / 100).toLocaleString()}</td>
                                <td className="px-3 py-2" />
                              </tr>
                            </tbody>
                          </table>
                        </>
                      )}
                    </div>
                  </>
                )}
              </TabsContent>

              {/* ── Tab: Activity ── */}
              <TabsContent value="activity" className="flex-1 overflow-auto px-5 py-3 mt-0">
                {financeLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-indigo-600 mr-2" />
                    <span className="text-sm text-muted-foreground">Loading activity…</span>
                  </div>
                ) : activityLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
                    <History className="h-8 w-8 opacity-40" />
                    <p className="text-sm">No activity logs found for this MMP.</p>
                  </div>
                ) : (
                  <div className="space-y-0 relative">
                    {/* Timeline line */}
                    <div className="absolute left-[18px] top-4 bottom-4 w-px bg-border" />
                    {activityLogs.map((log, i) => {
                      const actionColor = log.action?.includes('reject') || log.action?.includes('recall') || log.action?.includes('return')
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                        : log.action?.includes('approve') || log.action?.includes('complete') || log.action?.includes('verify')
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                        : log.action?.includes('update') || log.action?.includes('edit')
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
                      return (
                        <div key={log.id || i} className="flex gap-3 relative pb-4">
                          {/* Dot */}
                          <div className="flex-shrink-0 w-9 flex items-start justify-center pt-0.5 z-10">
                            <div className={`w-4 h-4 rounded-full border-2 border-background flex items-center justify-center ${actionColor}`}>
                              <div className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                            </div>
                          </div>
                          {/* Content */}
                          <div className="flex-1 min-w-0 bg-muted/20 rounded-lg border px-3 py-2">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="font-semibold text-sm">{log.actor_name || 'System'}</span>
                              {log.actor_role && (
                                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded capitalize">
                                  {log.actor_role.replace(/_/g, ' ')}
                                </span>
                              )}
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${actionColor}`}>
                                {(log.action || 'action').replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                              </span>
                              <span className="text-xs text-muted-foreground ml-auto tabular-nums">
                                {log.timestamp ? format(new Date(log.timestamp), 'dd MMM yyyy · HH:mm') : '—'}
                              </span>
                            </div>
                            {(log.description || log.details) && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                {log.description || log.details}
                              </p>
                            )}
                            {(log.previous_state || log.new_state) && (
                              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                {log.previous_state && (
                                  <span className="bg-muted px-1.5 py-0.5 rounded capitalize line-through opacity-60">
                                    {typeof log.previous_state === 'string' ? log.previous_state : (log.previous_state as any)?.status || JSON.stringify(log.previous_state).slice(0, 30)}
                                  </span>
                                )}
                                {log.previous_state && log.new_state && <span>→</span>}
                                {log.new_state && (
                                  <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded capitalize font-medium">
                                    {typeof log.new_state === 'string' ? log.new_state : (log.new_state as any)?.status || JSON.stringify(log.new_state).slice(0, 30)}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default MmpFullReportDialog;
