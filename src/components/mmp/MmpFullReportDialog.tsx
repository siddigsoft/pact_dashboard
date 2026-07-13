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

// ── Stat badge colours (dark slate/teal palette) ──────────────────────────────
const clsCard: Record<EntryClass | 'total', string> = {
  total:       'border-teal-700/60   bg-teal-900/30   text-teal-200',
  done:        'border-emerald-700/60 bg-emerald-900/30 text-emerald-200',
  in_progress: 'border-amber-700/60  bg-amber-900/20   text-amber-200',
  attention:   'border-red-700/60    bg-red-900/20     text-red-300',
  pending:     'border-slate-600/60  bg-slate-800/40   text-slate-300',
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
  const [excelLoading, setExcelLoading] = useState(false);

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

  // ── Excel Export (ExcelJS — fully formatted) ──────────────────────────────
  const exportExcel = async () => {
    if (!stats || !mmp) return;
    setExcelLoading(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = 'PACT Command Center — ICT Unit';
      wb.company = 'PACT';

      const now       = format(new Date(), 'dd MMM yyyy HH:mm');
      const mmpTitle  = mmp.name || mmp.mmp_id || mmpName || 'MMP';
      const project   = (mmp.project as any)?.name || '—';

      // ── Palette ──────────────────────────────────────────────────────
      const NAVY    = 'FF0F2041';
      const NAVY2   = 'FF1D3461';
      const WHITE   = 'FFFFFFFF';
      const GREY_H  = 'FFE8EDF4';
      const GREY_LT = 'FFF8FAFC';
      const GREEN   = 'FF059669';
      const AMBER   = 'FFD97706';
      const RED     = 'FFDC2626';
      const SLATE   = 'FF64748B';
      const GOLD    = 'FFFBBF24';

      type ExWS = ExcelJS.Worksheet;

      // ── Shared helpers ────────────────────────────────────────────────
      const border = (style: ExcelJS.BorderStyle = 'thin'): ExcelJS.Borders => ({
        top:    { style, color: { argb: 'FFD1D5DB' } },
        left:   { style, color: { argb: 'FFD1D5DB' } },
        bottom: { style, color: { argb: 'FFD1D5DB' } },
        right:  { style, color: { argb: 'FFD1D5DB' } },
      });

      const applyBorder = (row: ExcelJS.Row, style: ExcelJS.BorderStyle = 'thin') =>
        row.eachCell({ includeEmpty: true }, c => { c.border = border(style); });

      const addTitleBlock = (ws: ExWS, title: string, sub: string, numCols: number) => {
        ws.mergeCells(1, 1, 1, numCols);
        const t = ws.getCell('A1');
        t.value     = title;
        t.font      = { bold: true, size: 13, color: { argb: WHITE } };
        t.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
        t.alignment = { horizontal: 'center', vertical: 'middle' };
        ws.getRow(1).height = 28;

        ws.mergeCells(2, 1, 2, numCols);
        const s = ws.getCell('A2');
        s.value     = sub;
        s.font      = { italic: true, size: 9, color: { argb: 'FF374151' } };
        s.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
        s.alignment = { horizontal: 'center', vertical: 'middle' };
        ws.getRow(2).height = 15;
      };

      const addHeaderRow = (ws: ExWS, headers: string[], accentCol?: number) => {
        const row = ws.addRow(headers);
        row.height = 22;
        row.eachCell((cell, i) => {
          cell.font      = { bold: true, size: 10, color: { argb: WHITE } };
          cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: (accentCol && i === accentCol) ? GREEN : NAVY2 } };
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          cell.border    = border();
        });
        return row;
      };

      const addDataRow = (ws: ExWS, values: (string | number | null)[], isOdd: boolean) => {
        const row = ws.addRow(values);
        row.height = 18;
        const bg = isOdd ? GREY_LT : GREY_H;
        row.eachCell({ includeEmpty: true }, cell => {
          cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
          cell.font      = { size: 10 };
          cell.alignment = { vertical: 'middle', wrapText: true };
          cell.border    = border();
        });
        return row;
      };

      const addTotalsRow = (ws: ExWS, values: (string | number | null)[]) => {
        const row = ws.addRow(values);
        row.height = 22;
        row.eachCell({ includeEmpty: true }, cell => {
          cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
          cell.font      = { bold: true, size: 10, color: { argb: WHITE } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border    = border('medium');
        });
        row.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
        return row;
      };

      const pctArgb = (pct: number) =>
        pct >= 80 ? GREEN : pct >= 50 ? AMBER : RED;

      const coverageCell = (row: ExcelJS.Row, colIdx: number, pct: number) => {
        const c = row.getCell(colIdx);
        c.font = { bold: true, size: 10, color: { argb: pctArgb(pct) } };
      };

      const subtitle = `MMP: ${mmpTitle}  |  Project: ${project}  |  Status: ${mmp.status || '—'}  |  Generated: ${now}`;

      // ════════════════════════════════════════════════════════════════
      // Sheet 1 — Summary
      // ════════════════════════════════════════════════════════════════
      const wsSumm = wb.addWorksheet('Summary');
      wsSumm.columns = [{ key: 'a', width: 34 }, { key: 'b', width: 22 }];
      addTitleBlock(wsSumm, 'PACT Command Center — Full MMP Status Report', subtitle, 2);

      const summSections: [string, string | number][] = [
        ['MMP Name',         mmpTitle],
        ['Project',          project],
        ['MMP ID',           mmp.mmp_id || '—'],
        ['MMP Status',       mmp.status || '—'],
        ['Generated',        now],
        ['', ''],
        ['── COVERAGE ──', ''],
        ['Total Sites',      stats.total],
        ['Covered',          `${stats.done} (${stats.coveragePct}%)`],
        ['In Progress',      stats.inProgress],
        ['Needs Attention',  stats.attention],
        ['Pending',          stats.pending],
        ['States',           stats.stateCount],
        ['Coordinators',     stats.coordCount],
        ['Total Fees (SDG)', stats.totalFees],
        ['', ''],
        ['── DOWN PAYMENTS ──', ''],
        ['Requests',         downPayments.length],
        ['Total Requested (SDG)', downPayments.reduce((s, d) => s + Number(d.requested_amount || 0), 0)],
        ['Total Paid (SDG)', downPayments.reduce((s, d) => s + Number(d.total_paid_amount || 0), 0)],
        ['Remaining (SDG)',  downPayments.reduce((s, d) => s + Number(d.remaining_amount || 0), 0)],
        ['', ''],
        ['── COST SUBMISSIONS ──', ''],
        ['Submissions',      costSubmissions.length],
        ['Total Amount (SDG)', costSubmissions.reduce((s, c) => s + Number(c.amount_cents || 0), 0) / 100],
        ['Approved (SDG)',   costSubmissions.filter(c => c.status === 'approved').reduce((s, c) => s + Number(c.amount_cents || 0), 0) / 100],
        ['Pending (SDG)',    costSubmissions.filter(c => c.status === 'pending').reduce((s, c) => s + Number(c.amount_cents || 0), 0) / 100],
        ['', ''],
        ['── ACTIVITY ──', ''],
        ['Log Entries',      activityLogs.length],
      ];

      summSections.forEach(([label, value], i) => {
        const row = wsSumm.addRow([label, value]);
        row.height = 18;
        const isSection = String(label).startsWith('──');
        const isEmpty = !label;
        row.getCell(1).font = isSection
          ? { bold: true, size: 10, color: { argb: WHITE } }
          : { size: 10, bold: !isEmpty };
        row.getCell(2).font = { size: 10 };
        if (isSection) {
          row.eachCell({ includeEmpty: true }, c => {
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY2 } };
            c.font = { bold: true, size: 10, color: { argb: WHITE } };
            c.border = border();
          });
          wsSumm.mergeCells(row.number, 1, row.number, 2);
        } else if (!isEmpty) {
          const bg = i % 2 === 0 ? GREY_LT : GREY_H;
          row.eachCell({ includeEmpty: true }, c => {
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
            c.border = border();
            c.alignment = { vertical: 'middle' };
          });
        }
        if (label === 'Coverage %' || label === 'Covered') {
          row.getCell(2).font = { bold: true, size: 10, color: { argb: pctArgb(stats.coveragePct) } };
        }
      });

      // ════════════════════════════════════════════════════════════════
      // Sheet 2 — By State
      // ════════════════════════════════════════════════════════════════
      const wsState = wb.addWorksheet('By State');
      wsState.columns = [
        { key: 'state', width: 26 }, { key: 'total', width: 9 },
        { key: 'done',  width: 10 }, { key: 'ip',    width: 13 },
        { key: 'att',   width: 11 }, { key: 'pend',  width: 9 },
        { key: 'pct',   width: 12 }, { key: 'coords',width: 12 },
        { key: 'fees',  width: 16 },
      ];
      addTitleBlock(wsState, 'By State — Coverage Breakdown', subtitle, 9);
      addHeaderRow(wsState, ['State', 'Total', 'Covered', 'In Progress', 'Attention', 'Pending', 'Coverage %', 'Coordinators', 'Fees (SDG)']);

      stats.byState.forEach((s, i) => {
        const row = addDataRow(wsState, [s.name, s.total, s.done, s.inProgress, s.attention, s.pending, `${s.coveragePct}%`, s.coordIds.size, s.fees || 0], i % 2 === 0);
        row.getCell(1).font = { bold: true, size: 10 };
        row.getCell(3).font = { size: 10, color: { argb: GREEN } };
        row.getCell(4).font = { size: 10, color: { argb: AMBER } };
        row.getCell(5).font = { size: 10, color: { argb: RED } };
        row.getCell(6).font = { size: 10, color: { argb: SLATE } };
        coverageCell(row, 7, s.coveragePct);
      });
      const stTot = addTotalsRow(wsState, ['TOTAL', stats.total, stats.done, stats.inProgress, stats.attention, stats.pending, `${stats.coveragePct}%`, stats.coordCount, stats.totalFees]);
      coverageCell(stTot, 7, stats.coveragePct);

      // ════════════════════════════════════════════════════════════════
      // Sheet 3 — By Coordinator
      // ════════════════════════════════════════════════════════════════
      const wsCoord = wb.addWorksheet('By Coordinator');
      wsCoord.columns = [
        { key: 'name',   width: 30 }, { key: 'states', width: 9 },
        { key: 'total',  width: 10 }, { key: 'done',   width: 10 },
        { key: 'ip',     width: 13 }, { key: 'att',    width: 11 },
        { key: 'pend',   width: 10 }, { key: 'pct',    width: 12 },
      ];
      addTitleBlock(wsCoord, 'Coordinator Performance', subtitle, 8);
      addHeaderRow(wsCoord, ['Coordinator', 'States', 'Assigned', 'Covered', 'In Progress', 'Attention', 'Pending', 'Coverage %']);

      stats.byCoordinator.forEach((c, i) => {
        const pending = c.total - c.done - c.inProgress - c.attention;
        const row = addDataRow(wsCoord, [c.name, c.states.size, c.total, c.done, c.inProgress, c.attention, pending, `${c.coveragePct}%`], i % 2 === 0);
        row.getCell(1).font = { bold: true, size: 10 };
        row.getCell(4).font = { size: 10, color: { argb: GREEN } };
        row.getCell(5).font = { size: 10, color: { argb: AMBER } };
        row.getCell(6).font = { size: 10, color: { argb: RED } };
        coverageCell(row, 8, c.coveragePct);
      });
      const coordTotStates = new Set(stats.byCoordinator.flatMap(c => [...c.states])).size;
      const cTot = addTotalsRow(wsCoord, [
        `TOTAL (${stats.coordCount})`,
        coordTotStates,
        stats.byCoordinator.reduce((s, c) => s + c.total, 0),
        stats.byCoordinator.reduce((s, c) => s + c.done, 0),
        stats.byCoordinator.reduce((s, c) => s + c.inProgress, 0),
        stats.byCoordinator.reduce((s, c) => s + c.attention, 0),
        stats.byCoordinator.reduce((s, c) => s + (c.total - c.done - c.inProgress - c.attention), 0),
        `${stats.coveragePct}%`,
      ]);
      coverageCell(cTot, 8, stats.coveragePct);

      // ════════════════════════════════════════════════════════════════
      // Sheet 4 — All Sites
      // ════════════════════════════════════════════════════════════════
      const wsSites = wb.addWorksheet('All Sites');
      wsSites.columns = [
        { key: 'name',  width: 30 }, { key: 'code',  width: 14 },
        { key: 'state', width: 20 }, { key: 'loc',   width: 20 },
        { key: 'stat',  width: 22 }, { key: 'cat',   width: 13 },
        { key: 'enum',  width: 16 }, { key: 'trans', width: 16 },
        { key: 'cost',  width: 12 },
      ];
      addTitleBlock(wsSites, `All Sites (${entries.length} total)`, subtitle, 9);
      addHeaderRow(wsSites, ['Site Name', 'Site Code', 'State', 'Locality', 'Status', 'Category', 'Enum Fee (SDG)', 'Trans Fee (SDG)', 'Cost (SDG)']);

      const CAT_COLOR: Record<string, string> = {
        done: GREEN, in_progress: AMBER, attention: RED, pending: SLATE,
      };
      entries.forEach((e, i) => {
        const cat = classifyEntry(e.status);
        const row = addDataRow(wsSites, [
          e.site_name || '', e.site_code || '',
          e.state || e.hub_office || '', e.locality || '',
          fmtStatus(e.status), cat.replace('_', ' '),
          Number(e.enumerator_fee || 0), Number(e.transport_fee || 0), Number(e.cost || 0),
        ], i % 2 === 0);
        row.getCell(6).font = { size: 10, bold: true, color: { argb: CAT_COLOR[cat] || SLATE } };
      });

      // ════════════════════════════════════════════════════════════════
      // Sheet 5 — Down Payments (if any)
      // ════════════════════════════════════════════════════════════════
      if (downPayments.length > 0) {
        const wsDP = wb.addWorksheet('Down Payments');
        wsDP.columns = [
          { key: 'site',  width: 28 }, { key: 'hub',   width: 20 },
          { key: 'type',  width: 16 }, { key: 'stat',  width: 18 },
          { key: 'sup',   width: 14 }, { key: 'adm',   width: 14 },
          { key: 'req',   width: 16 }, { key: 'paid',  width: 14 },
          { key: 'rem',   width: 16 }, { key: 'date',  width: 14 },
          { key: 'fpaid', width: 14 },
        ];
        addTitleBlock(wsDP, 'Down Payment Requests', subtitle, 11);
        addHeaderRow(wsDP, ['Site Name', 'Hub', 'Type', 'Status', 'Supervisor', 'Admin', 'Requested (SDG)', 'Paid (SDG)', 'Remaining (SDG)', 'Date', 'Fully Paid']);

        const DP_STATUS_COLOR: Record<string, string> = {
          fully_paid: GREEN, approved: '4338CA', partially_paid: AMBER,
          pending_admin: '7C3AED', pending_supervisor: 'EA580C', rejected: RED,
        };
        const totReq = downPayments.reduce((s, d) => s + Number(d.requested_amount || 0), 0);
        const totPaid = downPayments.reduce((s, d) => s + Number(d.total_paid_amount || 0), 0);
        const totRem = downPayments.reduce((s, d) => s + Number(d.remaining_amount || 0), 0);

        downPayments.forEach((dp, i) => {
          const row = addDataRow(wsDP, [
            dp.site_name || '—', dp.hub_name || '—',
            (dp.payment_type || '').replace(/_/g, ' ') || '—',
            (dp.status || '').replace(/_/g, ' '),
            dp.supervisor_status || '—', dp.admin_status || '—',
            Number(dp.requested_amount || 0), Number(dp.total_paid_amount || 0), Number(dp.remaining_amount || 0),
            dp.created_at ? format(new Date(dp.created_at), 'dd MMM yyyy') : '—',
            dp.fully_paid_at ? format(new Date(dp.fully_paid_at), 'dd MMM yyyy') : '—',
          ], i % 2 === 0);
          const statusArgb = DP_STATUS_COLOR[dp.status] || SLATE;
          row.getCell(4).font = { bold: true, size: 10, color: { argb: `FF${statusArgb}`.replace(/^FFFF/, 'FF') } };
          row.getCell(7).font = { size: 10 };
          row.getCell(8).font = { size: 10, color: { argb: GREEN } };
          row.getCell(9).font = { size: 10, color: { argb: totRem > 0 ? RED : GREEN } };
        });

        const dpTot = addTotalsRow(wsDP, [
          `TOTAL (${downPayments.length})`, '', '', '', '', '',
          totReq, totPaid, totRem, '', '',
        ]);
        dpTot.getCell(7).font = { bold: true, size: 10, color: { argb: GOLD } };
        dpTot.getCell(8).font = { bold: true, size: 10, color: { argb: GREEN } };
        dpTot.getCell(9).font = { bold: true, size: 10, color: { argb: totRem > 0 ? RED : GREEN } };
      }

      // ════════════════════════════════════════════════════════════════
      // Sheet 6 — Cost Submissions (if any)
      // ════════════════════════════════════════════════════════════════
      if (costSubmissions.length > 0) {
        const wsCS = wb.addWorksheet('Cost Submissions');
        wsCS.columns = [
          { key: 'title', width: 30 }, { key: 'cat',  width: 22 },
          { key: 'stat',  width: 16 }, { key: 't1',   width: 12 },
          { key: 't2',    width: 12 }, { key: 'amt',  width: 16 },
          { key: 'date',  width: 14 },
        ];
        addTitleBlock(wsCS, 'Operational Cost Submissions', subtitle, 7);
        addHeaderRow(wsCS, ['Title / Group', 'Category', 'Overall Status', 'Tier 1', 'Tier 2', 'Amount (SDG)', 'Date']);

        const CS_STATUS_COLOR: Record<string, string> = {
          approved: GREEN, pending: AMBER, rejected: RED,
        };
        const totAmt = costSubmissions.reduce((s, c) => s + Number(c.amount_cents || 0), 0) / 100;

        costSubmissions.forEach((cs, i) => {
          const row = addDataRow(wsCS, [
            cs.request_title || '—',
            (cs.expense_category || '').replace(/_/g, ' '),
            (cs.status || '—').replace(/_/g, ' '),
            (cs.tier1_status || '—').replace(/_/g, ' '),
            (cs.tier2_status || '—').replace(/_/g, ' '),
            Number(cs.amount_cents || 0) / 100,
            cs.created_at ? format(new Date(cs.created_at), 'dd MMM yyyy') : '—',
          ], i % 2 === 0);
          const sc = CS_STATUS_COLOR[cs.status] || SLATE;
          row.getCell(3).font = { bold: true, size: 10, color: { argb: sc } };
          row.getCell(4).font = { size: 10, color: { argb: CS_STATUS_COLOR[cs.tier1_status] || SLATE } };
          row.getCell(5).font = { size: 10, color: { argb: CS_STATUS_COLOR[cs.tier2_status] || SLATE } };
          row.getCell(6).font = { size: 10, bold: true };
        });

        const csTot = addTotalsRow(wsCS, [`TOTAL (${costSubmissions.length})`, '', '', '', '', totAmt, '']);
        csTot.getCell(6).font = { bold: true, size: 10, color: { argb: GOLD } };
      }

      // ════════════════════════════════════════════════════════════════
      // Sheet 7 — Activity Log (if any)
      // ════════════════════════════════════════════════════════════════
      if (activityLogs.length > 0) {
        const wsAct = wb.addWorksheet('Activity Log');
        wsAct.columns = [
          { key: 'ts',   width: 18 }, { key: 'actor', width: 24 },
          { key: 'role', width: 18 }, { key: 'act',   width: 22 },
          { key: 'desc', width: 40 }, { key: 'prev',  width: 18 },
          { key: 'next', width: 18 },
        ];
        addTitleBlock(wsAct, 'MMP Activity Log', subtitle, 7);
        addHeaderRow(wsAct, ['Timestamp', 'Actor', 'Role', 'Action', 'Description', 'Previous State', 'New State']);

        const ACT_COLOR = (action: string) => {
          const a = (action || '').toLowerCase();
          if (a.includes('reject') || a.includes('recall') || a.includes('return')) return RED;
          if (a.includes('approve') || a.includes('complete') || a.includes('verify')) return GREEN;
          if (a.includes('update') || a.includes('edit')) return 'FF2563EB';
          return SLATE;
        };

        activityLogs.forEach((log, i) => {
          const prevState = typeof log.previous_state === 'string'
            ? log.previous_state : (log.previous_state as any)?.status || '';
          const newState = typeof log.new_state === 'string'
            ? log.new_state : (log.new_state as any)?.status || '';
          const row = addDataRow(wsAct, [
            log.timestamp ? format(new Date(log.timestamp), 'dd MMM yyyy HH:mm') : '—',
            log.actor_name || 'System',
            (log.actor_role || '').replace(/_/g, ' '),
            (log.action || '').replace(/_/g, ' '),
            log.description || log.details || '—',
            prevState, newState,
          ], i % 2 === 0);
          row.getCell(1).font = { size: 9, color: { argb: SLATE } };
          row.getCell(4).font = { bold: true, size: 10, color: { argb: ACT_COLOR(log.action) } };
          if (newState) row.getCell(7).font = { bold: true, size: 10, color: { argb: GREEN } };
        });
      }

      // ── Download ────────────────────────────────────────────────────
      const buffer = await wb.xlsx.writeBuffer();
      const blob   = new Blob([buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const a      = document.createElement('a');
      a.href       = URL.createObjectURL(blob);
      a.download   = `MMP-Full-Report-${mmp.mmp_id || mmpId}-${format(new Date(), 'yyyyMMdd')}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      console.error('MMP Excel export error:', err);
    } finally {
      setExcelLoading(false);
    }
  };

  // ── Progress bar ──────────────────────────────────────────────────────────
  const ProgressBar = ({ pct }: { pct: number }) => (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden min-w-[80px]">
        <div
          className={`h-1.5 rounded-full ${pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-semibold tabular-nums w-8 text-right text-slate-300">{pct}%</span>
    </div>
  );

  // ── Badge for status class ────────────────────────────────────────────────
  const ClassBadge = ({ cls }: { cls: EntryClass }) => {
    const conf: Record<EntryClass, { label: string; cls: string }> = {
      done:        { label: 'Covered',     cls: 'bg-emerald-900/50 text-emerald-300 border border-emerald-700/50' },
      in_progress: { label: 'In Progress', cls: 'bg-amber-900/40 text-amber-300 border border-amber-700/50' },
      attention:   { label: 'Attention',   cls: 'bg-red-900/40 text-red-300 border border-red-700/50' },
      pending:     { label: 'Pending',     cls: 'bg-slate-800 text-slate-400 border border-slate-600' },
    };
    const c = conf[cls];
    return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${c.cls}`}>{c.label}</span>;
  };

  // ── Shared table header cell ──────────────────────────────────────────────
  const TH = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
    <th className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-700 ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  );
  const TR = ({ children, i }: { children: React.ReactNode; i: number }) => (
    <tr className={`border-b border-slate-700/30 ${i % 2 === 0 ? '' : 'bg-slate-800/30'} hover:bg-slate-700/20 transition-colors`}>
      {children}
    </tr>
  );
  const TotalsRow = ({ children }: { children: React.ReactNode }) => (
    <tr className="bg-slate-700/60 font-bold border-t border-slate-600">{children}</tr>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent
        className="flex flex-col p-0 gap-0 overflow-hidden bg-slate-900 border border-slate-700 text-slate-100 [&>button:last-child]:hidden"
        style={{ width: '98vw', maxWidth: '98vw', height: '96vh', maxHeight: '96vh' }}
        onInteractOutside={e => e.preventDefault()}
      >
        {/* Teal accent strip */}
        <div className="h-1 bg-gradient-to-r from-teal-500 via-teal-400 to-emerald-400 flex-shrink-0" />

        {/* Header */}
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-slate-700 flex-shrink-0 bg-slate-900/80">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2 text-base font-bold text-white">
                <BarChart3 className="h-5 w-5 text-teal-400 flex-shrink-0" />
                Full MMP Status Report
              </DialogTitle>
              <p className="text-sm text-slate-400 mt-0.5 truncate">
                {mmpName} {mmp?.mmp_id ? `· ${mmp.mmp_id}` : ''} {(mmp?.project as any)?.name ? `· ${(mmp.project as any).name}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={exportExcel}
                disabled={!stats || excelLoading}
                className="border-emerald-600/60 text-emerald-300 bg-emerald-900/20 hover:bg-emerald-900/40 hover:border-emerald-500"
              >
                {excelLoading
                  ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  : <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />}
                {excelLoading ? 'Building…' : 'Excel'}
              </Button>
              <Button
                size="sm"
                onClick={exportPDF}
                disabled={!stats}
                className="bg-teal-600 hover:bg-teal-500 text-white border-0"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                PDF
              </Button>
              <button onClick={onClose} className="p-1.5 rounded-md hover:bg-slate-700 transition-colors">
                <X className="h-4 w-4 text-slate-400" />
              </button>
            </div>
          </div>
        </DialogHeader>

        {/* Body */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-teal-400" />
            <span className="ml-3 text-slate-400 text-sm">Loading report data…</span>
          </div>
        ) : !stats ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 gap-2 text-slate-400">
            <AlertCircle className="h-8 w-8" />
            <p className="text-sm">No site entries found for this MMP.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Summary stat cards */}
            <div className="grid grid-cols-5 gap-2 px-5 pt-4 pb-3 flex-shrink-0">
              {[
                { label: 'Total Sites', value: stats.total, icon: MapPin, cls: 'total' as const },
                { label: `Covered (${stats.coveragePct}%)`, value: stats.done, icon: CheckCircle2, cls: 'done' as const },
                { label: 'In Progress', value: stats.inProgress, icon: Clock, cls: 'in_progress' as const },
                { label: 'Attention', value: stats.attention, icon: ShieldAlert, cls: 'attention' as const },
                { label: 'Pending', value: stats.pending, icon: Activity, cls: 'pending' as const },
              ].map(({ label, value, icon: Icon, cls }) => (
                <div key={cls} className={`rounded-xl border p-3 ${clsCard[cls]}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon className="h-3.5 w-3.5 opacity-70" />
                    <span className="text-[10px] uppercase tracking-wider opacity-80">{label}</span>
                  </div>
                  <div className="text-2xl font-extrabold tabular-nums">{value.toLocaleString()}</div>
                </div>
              ))}
            </div>

            {/* Coverage bar */}
            <div className="px-5 pb-3 flex-shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 w-20">Overall</span>
                <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all ${stats.coveragePct >= 70 ? 'bg-emerald-500' : stats.coveragePct >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${stats.coveragePct}%` }}
                  />
                </div>
                <span className="text-sm font-extrabold text-teal-300 w-12 text-right tabular-nums">{stats.coveragePct}%</span>
                <span className="text-xs text-slate-400">{stats.stateCount} states · {stats.coordCount} coordinators</span>
              </div>
            </div>

            {/* Tabs */}
            <Tabs value={tab} onValueChange={setTab} className="flex-1 overflow-hidden flex flex-col">
              <TabsList className="flex-shrink-0 mx-5 w-auto justify-start bg-slate-800 border border-slate-700 p-1 rounded-xl">
                <TabsTrigger value="overview" className="text-xs data-[state=active]:bg-teal-600 data-[state=active]:text-white text-slate-400">
                  <BarChart3 className="h-3.5 w-3.5 mr-1.5" />By State
                </TabsTrigger>
                <TabsTrigger value="coordinators" className="text-xs data-[state=active]:bg-teal-600 data-[state=active]:text-white text-slate-400">
                  <Users className="h-3.5 w-3.5 mr-1.5" />Coordinators
                </TabsTrigger>
                <TabsTrigger value="sites" className="text-xs data-[state=active]:bg-teal-600 data-[state=active]:text-white text-slate-400">
                  <MapPin className="h-3.5 w-3.5 mr-1.5" />All Sites ({entries.length.toLocaleString()})
                </TabsTrigger>
                <TabsTrigger value="breakdown" className="text-xs data-[state=active]:bg-teal-600 data-[state=active]:text-white text-slate-400">
                  <TrendingUp className="h-3.5 w-3.5 mr-1.5" />Status Breakdown
                </TabsTrigger>
                <TabsTrigger value="financial" className="text-xs data-[state=active]:bg-teal-600 data-[state=active]:text-white text-slate-400">
                  <DollarSign className="h-3.5 w-3.5 mr-1.5" />Financial
                  {(downPayments.length + costSubmissions.length) > 0 && (
                    <span className="ml-1 text-[10px] bg-teal-800 text-teal-200 px-1.5 py-0.5 rounded-full font-semibold">
                      {downPayments.length + costSubmissions.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="activity" className="text-xs data-[state=active]:bg-teal-600 data-[state=active]:text-white text-slate-400">
                  <History className="h-3.5 w-3.5 mr-1.5" />Activity
                  {activityLogs.length > 0 && (
                    <span className="ml-1 text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded-full font-semibold">
                      {activityLogs.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* ── Tab: By State ── */}
              <TabsContent value="overview" className="flex-1 overflow-auto px-5 py-3 mt-0">
                <table className="w-full text-sm border-separate border-spacing-0">
                  <thead className="sticky top-0 bg-slate-900 z-10">
                    <tr>
                      <TH>State</TH>
                      <TH right>Total</TH>
                      <TH right>Covered</TH>
                      <TH right>In Progress</TH>
                      <TH right>Attention</TH>
                      <TH right>Pending</TH>
                      <TH>Coverage</TH>
                      <TH right>Coords</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.byState.map((s, i) => (
                      <TR key={s.name} i={i}>
                        <td className="px-3 py-2 font-medium text-slate-200">{s.name}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-white">{s.total}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-400">{s.done}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-amber-400">{s.inProgress}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-red-400">{s.attention}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-400">{s.pending}</td>
                        <td className="px-3 py-2 min-w-[140px]"><ProgressBar pct={s.coveragePct} /></td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-400">{s.coordIds.size}</td>
                      </TR>
                    ))}
                    <TotalsRow>
                      <td className="px-3 py-2 text-slate-200">TOTAL</td>
                      <td className="px-3 py-2 text-right tabular-nums text-white">{stats.total}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-400">{stats.done}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-400">{stats.inProgress}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-red-400">{stats.attention}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-400">{stats.pending}</td>
                      <td className="px-3 py-2"><ProgressBar pct={stats.coveragePct} /></td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-400">{stats.coordCount}</td>
                    </TotalsRow>
                  </tbody>
                </table>
              </TabsContent>

              {/* ── Tab: Coordinators ── */}
              <TabsContent value="coordinators" className="flex-1 overflow-auto px-5 py-3 mt-0">
                {stats.byCoordinator.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 text-sm">No coordinator assignments found.</div>
                ) : (
                  <table className="w-full text-sm border-separate border-spacing-0">
                    <thead className="sticky top-0 bg-slate-900 z-10">
                      <tr>
                        <TH>#</TH>
                        <TH>Coordinator</TH>
                        <TH right>States</TH>
                        <TH right>Assigned</TH>
                        <TH right>Covered</TH>
                        <TH right>In Progress</TH>
                        <TH right>Attention</TH>
                        <TH right>Pending</TH>
                        <TH>Coverage</TH>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.byCoordinator.map((c, i) => (
                        <TR key={c.id} i={i}>
                          <td className="px-3 py-2 text-slate-500 text-xs">{i + 1}</td>
                          <td className="px-3 py-2 font-medium text-slate-200">{c.name}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-400">{c.states.size}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-white">{c.total}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-emerald-400">{c.done}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-amber-400">{c.inProgress}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-red-400">{c.attention}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-400">{c.total - c.done - c.inProgress - c.attention}</td>
                          <td className="px-3 py-2"><ProgressBar pct={c.coveragePct} /></td>
                        </TR>
                      ))}
                      <TotalsRow>
                        <td className="px-3 py-2 text-slate-500 text-xs">—</td>
                        <td className="px-3 py-2 text-slate-200">TOTAL ({stats.coordCount} coordinators)</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                          {new Set(stats.byCoordinator.flatMap(c => [...c.states])).size}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-white">{stats.byCoordinator.reduce((s, c) => s + c.total, 0)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-400">{stats.byCoordinator.reduce((s, c) => s + c.done, 0)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-amber-400">{stats.byCoordinator.reduce((s, c) => s + c.inProgress, 0)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-red-400">{stats.byCoordinator.reduce((s, c) => s + c.attention, 0)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-400">{stats.byCoordinator.reduce((s, c) => s + (c.total - c.done - c.inProgress - c.attention), 0)}</td>
                        <td className="px-3 py-2"><ProgressBar pct={stats.coveragePct} /></td>
                      </TotalsRow>
                    </tbody>
                  </table>
                )}
              </TabsContent>

              {/* ── Tab: All Sites ── */}
              <TabsContent value="sites" className="flex-1 overflow-hidden flex flex-col mt-0 px-5 pt-3 pb-0">
                <div className="flex gap-2 mb-3 flex-shrink-0">
                  <input
                    type="text"
                    placeholder="Search site name, code, state…"
                    value={siteFilter}
                    onChange={e => setSiteFilter(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-sm rounded-lg bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30"
                  />
                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className="px-3 py-1.5 text-sm rounded-lg bg-slate-800 border border-slate-600 text-slate-200 focus:outline-none focus:border-teal-500"
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
                    <thead className="sticky top-0 bg-slate-900 z-10">
                      <tr>
                        <TH>Site</TH>
                        <TH>Code</TH>
                        <TH>State</TH>
                        <TH>Locality</TH>
                        <TH>Status</TH>
                        <TH>Category</TH>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSites.map((e, i) => (
                        <TR key={e.id} i={i}>
                          <td className="px-3 py-1.5 font-medium text-slate-200 max-w-[180px] truncate" title={e.site_name || ''}>{e.site_name || '—'}</td>
                          <td className="px-3 py-1.5 text-slate-500 font-mono text-xs">{e.site_code || '—'}</td>
                          <td className="px-3 py-1.5 text-slate-400">{e.state || e.hub_office || '—'}</td>
                          <td className="px-3 py-1.5 text-slate-500 text-xs">{e.locality || '—'}</td>
                          <td className="px-3 py-1.5 text-xs text-slate-300">{fmtStatus(e.status)}</td>
                          <td className="px-3 py-1.5"><ClassBadge cls={classifyEntry(e.status)} /></td>
                        </TR>
                      ))}
                    </tbody>
                  </table>
                  {filteredSites.length === 0 && (
                    <div className="text-center py-8 text-slate-400 text-sm">No sites match the filter.</div>
                  )}
                  {entries.length > 500 && (
                    <p className="text-xs text-slate-500 text-center py-2">Showing 500 of {entries.length} — use export for the full list.</p>
                  )}
                </div>
              </TabsContent>

              {/* ── Tab: Status Breakdown ── */}
              <TabsContent value="breakdown" className="flex-1 overflow-auto px-5 py-3 mt-0">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-slate-200">
                      <FileText className="h-4 w-4 text-teal-400" />
                      Top Statuses
                    </h3>
                    <div className="space-y-2">
                      {stats.topStatuses.map(([status, count]) => {
                        const pct = Math.round((count / stats.total) * 100);
                        return (
                          <div key={status} className="flex items-center gap-3">
                            <ClassBadge cls={classifyEntry(status)} />
                            <span className="text-sm flex-1 truncate text-slate-300">{fmtStatus(status)}</span>
                            <span className="text-sm tabular-nums font-semibold w-8 text-right text-white">{count}</span>
                            <div className="w-24 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                              <div className="h-1.5 bg-teal-500 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-slate-500 w-8 text-right">{pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-slate-200">
                      <Activity className="h-4 w-4 text-teal-400" />
                      Category Overview
                    </h3>
                    {[
                      { label: 'Covered (Done)', value: stats.done, color: 'bg-emerald-500', pct: stats.coveragePct },
                      { label: 'In Progress', value: stats.inProgress, color: 'bg-amber-500', pct: Math.round((stats.inProgress / stats.total) * 100) },
                      { label: 'Needs Attention', value: stats.attention, color: 'bg-red-500', pct: Math.round((stats.attention / stats.total) * 100) },
                      { label: 'Pending', value: stats.pending, color: 'bg-slate-500', pct: Math.round((stats.pending / stats.total) * 100) },
                    ].map(({ label, value, color, pct }) => (
                      <div key={label} className="mb-3">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-300">{label}</span>
                          <span className="font-semibold text-white">{value.toLocaleString()} ({pct}%)</span>
                        </div>
                        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                          <div className={`h-2 ${color} rounded-full`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    ))}
                    <div className="mt-4 pt-3 border-t border-slate-700 text-xs text-slate-400 space-y-1.5">
                      <div className="flex justify-between"><span>Total Fees</span><span className="font-semibold text-teal-300 tabular-nums">SDG {stats.totalFees.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span>MMP ID</span><span className="font-mono text-slate-300">{mmp?.mmp_id || '—'}</span></div>
                      <div className="flex justify-between"><span>MMP Status</span><span className="capitalize text-slate-300">{mmp?.status || '—'}</span></div>
                      <div className="flex justify-between"><span>Uploaded</span><span className="text-slate-300">{mmp?.created_at ? format(new Date(mmp.created_at), 'dd MMM yyyy') : '—'}</span></div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* ── Tab: Financial ── */}
              <TabsContent value="financial" className="flex-1 overflow-auto px-5 py-3 mt-0 space-y-6">
                {financeLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-teal-400 mr-2" />
                    <span className="text-sm text-slate-400">Loading financial data…</span>
                  </div>
                ) : (
                  <>
                    {/* ── Down Payments ─── */}
                    <div>
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-slate-200">
                        <Banknote className="h-4 w-4 text-emerald-400" />
                        Down Payment Requests
                        <span className="text-xs font-normal text-slate-500">({downPayments.length} records)</span>
                      </h3>
                      {downPayments.length === 0 ? (
                        <p className="text-sm text-slate-400 py-4 text-center">No down payment requests linked to this MMP.</p>
                      ) : (
                        <>
                          <div className="flex flex-wrap gap-2 mb-3">
                            {Object.entries(
                              downPayments.reduce<Record<string, number>>((acc, dp) => { acc[dp.status] = (acc[dp.status] || 0) + 1; return acc; }, {})
                            ).sort((a, b) => b[1] - a[1]).map(([status, count]) => {
                              const statusColors: Record<string, string> = {
                                fully_paid: 'bg-emerald-900/50 text-emerald-300 border border-emerald-700/50',
                                approved: 'bg-teal-900/50 text-teal-300 border border-teal-700/50',
                                partially_paid: 'bg-amber-900/40 text-amber-300 border border-amber-700/50',
                                pending_admin: 'bg-purple-900/40 text-purple-300 border border-purple-700/50',
                                pending_supervisor: 'bg-orange-900/40 text-orange-300 border border-orange-700/50',
                                rejected: 'bg-red-900/40 text-red-300 border border-red-700/50',
                              };
                              const cls = statusColors[status] || 'bg-slate-800 text-slate-300 border border-slate-600';
                              return (
                                <span key={status} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${cls}`}>
                                  {status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                  <span className="font-bold">{count}</span>
                                </span>
                              );
                            })}
                          </div>
                          <div className="grid grid-cols-3 gap-3 mb-3">
                            {[
                              { label: 'Total Requested', value: downPayments.reduce((s, d) => s + Number(d.requested_amount || 0), 0), color: 'text-white' },
                              { label: 'Total Paid', value: downPayments.reduce((s, d) => s + Number(d.total_paid_amount || 0), 0), color: 'text-emerald-400' },
                              { label: 'Remaining Balance', value: downPayments.reduce((s, d) => s + Number(d.remaining_amount || 0), 0), color: 'text-orange-400' },
                            ].map(({ label, value, color }) => (
                              <div key={label} className="rounded-xl border border-slate-700 bg-slate-800/50 px-3 py-2">
                                <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">{label}</p>
                                <p className={`text-base font-bold tabular-nums ${color}`}>SDG {value.toLocaleString()}</p>
                              </div>
                            ))}
                          </div>
                          <table className="w-full text-sm border-separate border-spacing-0">
                            <thead className="sticky top-0 bg-slate-900 z-10">
                              <tr>
                                <TH>Site</TH><TH>Hub</TH><TH>Type</TH><TH>Status</TH>
                                <TH right>Requested (SDG)</TH><TH right>Paid (SDG)</TH><TH right>Remaining</TH><TH>Date</TH>
                              </tr>
                            </thead>
                            <tbody>
                              {downPayments.map((dp, i) => {
                                const statusColors: Record<string, string> = {
                                  fully_paid: 'text-emerald-400', approved: 'text-teal-400',
                                  partially_paid: 'text-amber-400', pending_admin: 'text-purple-400',
                                  pending_supervisor: 'text-orange-400', rejected: 'text-red-400',
                                };
                                return (
                                  <TR key={dp.id} i={i}>
                                    <td className="px-3 py-1.5 font-medium text-slate-200 max-w-[140px] truncate" title={dp.site_name || ''}>{dp.site_name || '—'}</td>
                                    <td className="px-3 py-1.5 text-slate-400 text-xs">{dp.hub_name || '—'}</td>
                                    <td className="px-3 py-1.5 text-slate-400 text-xs capitalize">{(dp.payment_type || '').replace(/_/g, ' ') || '—'}</td>
                                    <td className={`px-3 py-1.5 text-xs font-medium capitalize ${statusColors[dp.status] || 'text-slate-400'}`}>
                                      {(dp.status || '').replace(/_/g, ' ')}
                                    </td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-300">{Number(dp.requested_amount || 0).toLocaleString()}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-emerald-400">{Number(dp.total_paid_amount || 0).toLocaleString()}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-orange-400">{Number(dp.remaining_amount || 0).toLocaleString()}</td>
                                    <td className="px-3 py-1.5 text-xs text-slate-500">{dp.created_at ? format(new Date(dp.created_at), 'dd MMM yyyy') : '—'}</td>
                                  </TR>
                                );
                              })}
                              <TotalsRow>
                                <td className="px-3 py-2 text-slate-200" colSpan={4}>TOTAL ({downPayments.length})</td>
                                <td className="px-3 py-2 text-right tabular-nums text-white">{downPayments.reduce((s, d) => s + Number(d.requested_amount || 0), 0).toLocaleString()}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-emerald-400">{downPayments.reduce((s, d) => s + Number(d.total_paid_amount || 0), 0).toLocaleString()}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-orange-400">{downPayments.reduce((s, d) => s + Number(d.remaining_amount || 0), 0).toLocaleString()}</td>
                                <td className="px-3 py-2" />
                              </TotalsRow>
                            </tbody>
                          </table>
                        </>
                      )}
                    </div>

                    {/* ── Operational Cost Submissions ─── */}
                    <div>
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-slate-200">
                        <DollarSign className="h-4 w-4 text-teal-400" />
                        Operational Cost Submissions
                        <span className="text-xs font-normal text-slate-500">({costSubmissions.length} records)</span>
                      </h3>
                      {costSubmissions.length === 0 ? (
                        <p className="text-sm text-slate-400 py-4 text-center">No cost submissions linked to this MMP.</p>
                      ) : (
                        <>
                          <div className="flex flex-wrap gap-2 mb-3">
                            {Object.entries(
                              costSubmissions.reduce<Record<string, number>>((acc, cs) => { acc[cs.status] = (acc[cs.status] || 0) + 1; return acc; }, {})
                            ).sort((a, b) => b[1] - a[1]).map(([status, count]) => {
                              const cls = status === 'approved' ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-700/50'
                                : status === 'pending' ? 'bg-amber-900/40 text-amber-300 border border-amber-700/50'
                                : status === 'rejected' ? 'bg-red-900/40 text-red-300 border border-red-700/50'
                                : 'bg-slate-800 text-slate-300 border border-slate-600';
                              return (
                                <span key={status} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${cls}`}>
                                  {status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                  <span className="font-bold">{count}</span>
                                </span>
                              );
                            })}
                          </div>
                          <div className="grid grid-cols-3 gap-3 mb-3">
                            <div className="rounded-xl border border-slate-700 bg-slate-800/50 px-3 py-2">
                              <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">Total Amount</p>
                              <p className="text-base font-bold tabular-nums text-white">
                                SDG {(costSubmissions.reduce((s, c) => s + Number(c.amount_cents || 0), 0) / 100).toLocaleString()}
                              </p>
                            </div>
                            <div className="rounded-xl border border-slate-700 bg-slate-800/50 px-3 py-2">
                              <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">Approved</p>
                              <p className="text-base font-bold tabular-nums text-emerald-400">
                                SDG {(costSubmissions.filter(c => c.status === 'approved').reduce((s, c) => s + Number(c.amount_cents || 0), 0) / 100).toLocaleString()}
                              </p>
                            </div>
                            <div className="rounded-xl border border-slate-700 bg-slate-800/50 px-3 py-2">
                              <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">Pending</p>
                              <p className="text-base font-bold tabular-nums text-amber-400">
                                SDG {(costSubmissions.filter(c => c.status === 'pending').reduce((s, c) => s + Number(c.amount_cents || 0), 0) / 100).toLocaleString()}
                              </p>
                            </div>
                          </div>
                          <table className="w-full text-sm border-separate border-spacing-0">
                            <thead className="sticky top-0 bg-slate-900 z-10">
                              <tr>
                                <TH>Title / Category</TH><TH>Status</TH><TH>Tier 1</TH><TH>Tier 2</TH>
                                <TH right>Amount (SDG)</TH><TH>Date</TH>
                              </tr>
                            </thead>
                            <tbody>
                              {costSubmissions.map((cs, i) => {
                                const tierBadge = (s: string | null) => {
                                  if (!s) return null;
                                  const cls = s === 'approved' ? 'text-emerald-400' : s === 'pending' ? 'text-amber-400' : s === 'rejected' ? 'text-red-400' : 'text-slate-400';
                                  return <span className={`capitalize text-xs ${cls}`}>{s.replace(/_/g, ' ')}</span>;
                                };
                                return (
                                  <TR key={cs.id} i={i}>
                                    <td className="px-3 py-1.5 max-w-[180px]">
                                      <div className="font-medium truncate text-xs text-slate-200" title={cs.request_title || ''}>{cs.request_title || '—'}</div>
                                      <div className="text-slate-500 text-xs capitalize">{(cs.expense_category || '').replace(/_/g, ' ')}</div>
                                    </td>
                                    <td className={`px-3 py-1.5 text-xs font-medium capitalize ${cs.status === 'approved' ? 'text-emerald-400' : cs.status === 'pending' ? 'text-amber-400' : cs.status === 'rejected' ? 'text-red-400' : 'text-slate-400'}`}>
                                      {(cs.status || '').replace(/_/g, ' ')}
                                    </td>
                                    <td className="px-3 py-1.5">{tierBadge(cs.tier1_status)}</td>
                                    <td className="px-3 py-1.5">{tierBadge(cs.tier2_status)}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-300">{(Number(cs.amount_cents || 0) / 100).toLocaleString()}</td>
                                    <td className="px-3 py-1.5 text-xs text-slate-500">{cs.created_at ? format(new Date(cs.created_at), 'dd MMM yyyy') : '—'}</td>
                                  </TR>
                                );
                              })}
                              <TotalsRow>
                                <td className="px-3 py-2 text-slate-200" colSpan={4}>TOTAL ({costSubmissions.length})</td>
                                <td className="px-3 py-2 text-right tabular-nums text-white">{(costSubmissions.reduce((s, c) => s + Number(c.amount_cents || 0), 0) / 100).toLocaleString()}</td>
                                <td className="px-3 py-2" />
                              </TotalsRow>
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
                    <Loader2 className="h-5 w-5 animate-spin text-teal-400 mr-2" />
                    <span className="text-sm text-slate-400">Loading activity…</span>
                  </div>
                ) : activityLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400">
                    <History className="h-8 w-8 opacity-40" />
                    <p className="text-sm">No activity logs found for this MMP.</p>
                  </div>
                ) : (
                  <div className="space-y-0 relative">
                    <div className="absolute left-[18px] top-4 bottom-4 w-px bg-slate-700" />
                    {activityLogs.map((log, i) => {
                      const isReject = log.action?.includes('reject') || log.action?.includes('recall') || log.action?.includes('return');
                      const isApprove = log.action?.includes('approve') || log.action?.includes('complete') || log.action?.includes('verify');
                      const isEdit = log.action?.includes('update') || log.action?.includes('edit');
                      const dotCls = isReject ? 'bg-red-900/60 text-red-400 border-red-700/60'
                        : isApprove ? 'bg-emerald-900/60 text-emerald-400 border-emerald-700/60'
                        : isEdit ? 'bg-teal-900/60 text-teal-400 border-teal-700/60'
                        : 'bg-slate-800 text-slate-400 border-slate-600';
                      const badgeCls = isReject ? 'bg-red-900/40 text-red-300'
                        : isApprove ? 'bg-emerald-900/40 text-emerald-300'
                        : isEdit ? 'bg-teal-900/40 text-teal-300'
                        : 'bg-slate-800 text-slate-400';
                      return (
                        <div key={log.id || i} className="flex gap-3 relative pb-4">
                          <div className="flex-shrink-0 w-9 flex items-start justify-center pt-0.5 z-10">
                            <div className={`w-4 h-4 rounded-full border-2 border-slate-900 flex items-center justify-center ${dotCls}`}>
                              <div className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0 bg-slate-800/60 rounded-xl border border-slate-700 px-3 py-2">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="font-semibold text-sm text-white">{log.actor_name || 'System'}</span>
                              {log.actor_role && (
                                <span className="text-[10px] text-slate-400 bg-slate-700 px-1.5 py-0.5 rounded capitalize">
                                  {log.actor_role.replace(/_/g, ' ')}
                                </span>
                              )}
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeCls}`}>
                                {(log.action || 'action').replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                              </span>
                              <span className="text-[10px] text-slate-500 ml-auto tabular-nums">
                                {log.timestamp ? format(new Date(log.timestamp), 'dd MMM yyyy · HH:mm') : '—'}
                              </span>
                            </div>
                            {(log.description || log.details) && (
                              <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">
                                {log.description || log.details}
                              </p>
                            )}
                            {(log.previous_state || log.new_state) && (
                              <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                                {log.previous_state && (
                                  <span className="bg-slate-700 px-1.5 py-0.5 rounded capitalize line-through opacity-60">
                                    {typeof log.previous_state === 'string' ? log.previous_state : (log.previous_state as any)?.status || JSON.stringify(log.previous_state).slice(0, 30)}
                                  </span>
                                )}
                                {log.previous_state && log.new_state && <span className="text-slate-600">→</span>}
                                {log.new_state && (
                                  <span className="bg-teal-900/50 text-teal-300 px-1.5 py-0.5 rounded capitalize font-medium">
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
