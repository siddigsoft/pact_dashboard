import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Download, FileSpreadsheet, Loader2, MapPin, Users,
  CheckCircle2, Clock, AlertCircle, BarChart3, X,
  ShieldAlert, TrendingUp, Activity, FileText, DollarSign, History, Banknote,
  Archive, RotateCcw,
} from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── Status helpers ────────────────────────────────────────────────────────────
//
// "Covered" = visit is genuinely terminal-complete. Aligned with
// TERMINAL_COMPLETION_RAW_STATUSES in src/utils/siteCompletionStatus.ts.
//   - 'submitted'              enumerator self-reported to WFP ODK (Phase A terminal)
//   - 'wfp_confirmed'          WFP confirmed receipt (Phase C gold standard)
//   - 'completed'              legacy pre-Phase-A terminal value
//   - 'verified'               legacy permit-verified terminal value
//
// NOT counted as covered (moved to in_progress):
//   - 'approved', 'cp_verified', 'locality_permit_verified',
//     'approved_and_costed', 'costed'
//   These are post-submission workflow steps, NOT confirmation of visit completion.
//   Including them was inflating coverage (e.g. Red Sea showing 100%).
//
// 'not_covered' and 'cancelled' → Attention (terminal but visit did not happen).
//
// Only truly terminal statuses count as "Covered":
//   wfp_confirmed — WFP confirmed receipt (gold standard)
//   completed     — legacy pre-Phase-A terminal value
//   submitted     — enumerator self-reported to WFP ODK (Phase A terminal)
// "verified", "approved", "costed" etc. are post-submission approval-chain
// steps and must NOT count as covered — they inflated coverage (e.g. Red Sea 100%).
// COVERED = only truly WFP-confirmed or legacy-completed visits.
// Everything else — including submitted, verified, approved, costed — is
// still in the approval/confirmation pipeline and must NOT count as covered.
const DONE_STATUSES = new Set([
  'wfp_confirmed', // WFP confirmed — gold standard
  'completed',     // legacy pre-Phase-A terminal value
]);
const IN_PROGRESS_STATUSES = new Set([
  'accepted', 'claimed', 'in_progress', 'ongoing', 'dispatched', 'assigned',
  'forwarded', 'forwarded_to_coordinator', 'forwarded_to_fom', 'permits_attached',
  'with_coordinators', 'acknowledged', 'site_claim',
  // post-submission steps: enumerator done but not yet WFP-confirmed
  'submitted', 'submitted_for_review',
  // post-verification approval chain: supervisor/FOM/finance steps, NOT terminal
  'verified', 'approved', 'cp_verified', 'locality_permit_verified',
  'approved_and_costed', 'costed',
]);
const ATTENTION_STATUSES = new Set([
  'rejected', 'declined', 'returned', 'returned_to_fom', 'recalled', 'sent_back',
  // terminal non-visits — officially documented as not covered or cancelled
  'not_covered', 'cancelled',
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

interface ActivityExportRow {
  timestamp: string | null;
  actor: string;
  role: string;
  action: string;
  description: string;
  previousState: string;
  newState: string;
}

// ── Stat card left-border accent colours ─────────────────────────────
const clsCard: Record<EntryClass | 'total', { border: string; icon: string; num: string }> = {
  total:       { border: 'border-l-teal-500',    icon: 'text-teal-500',    num: 'text-teal-700' },
  done:        { border: 'border-l-emerald-500', icon: 'text-emerald-500', num: 'text-emerald-700' },
  in_progress: { border: 'border-l-amber-500',  icon: 'text-amber-500',   num: 'text-amber-700' },
  attention:   { border: 'border-l-red-500',    icon: 'text-red-500',     num: 'text-red-700' },
  pending:     { border: 'border-l-gray-400',   icon: 'text-gray-400',    num: 'text-gray-600' },
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
            .select('id, name, mmp_id, status, cycle_status, created_at, uploaded_by, workflow, archivedby, archivedat, project:projects(name)')
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
        // down_payment_requests links to MMPs via mmp_site_entry_id (site-level FK),
        // NOT mmp_file_id — so we must look up by the entry IDs for this MMP.
        const entryIds = allEntries.map(e => e.id);

        const dpQuery = entryIds.length > 0
          ? supabase
              .from('down_payment_requests')
              .select('id, site_name, hub_name, status, requested_amount, total_paid_amount, remaining_amount, payment_type, created_at, supervisor_status, admin_status, fully_paid_at')
              .in('mmp_site_entry_id', entryIds)
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [] as any[], error: null });

        const [dpRes, csRes, alRes] = await Promise.allSettled([
          dpQuery,
          // operational_cost_submissions has both mmp_file_id and mmp_id columns;
          // query both to avoid missing records linked via either column.
          supabase
            .from('operational_cost_submissions')
            .select('id, status, tier1_status, tier2_status, tier3_status, amount_cents, expense_category, description, hub_id, created_at, request_title')
            .or(`mmp_file_id.eq.${mmpId},mmp_id.eq.${mmpId}`)
            .order('created_at', { ascending: false }),
          supabase
            .from('audit_logs')
            .select('id, actor_name, actor_role, timestamp, action, description, details, new_state, previous_state')
            .in('entity_type', ['mmp', 'mmp_file', 'mmp_files'])
            .eq('entity_id', mmpId)
            .order('timestamp', { ascending: false })
            .limit(100),
        ]);
        if (dpRes.status === 'fulfilled') setDownPayments((dpRes.value as any).data || []);
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

  const activityExportRows = useMemo<ActivityExportRow[]>(() => {
    const rows: ActivityExportRow[] = activityLogs.map(log => {
      const previousState = typeof log.previous_state === 'string'
        ? log.previous_state
        : log.previous_state?.status || '';
      const newState = typeof log.new_state === 'string'
        ? log.new_state
        : log.new_state?.status || '';
      const details = typeof log.details === 'string'
        ? log.details
        : log.details
          ? JSON.stringify(log.details)
          : '';

      return {
        timestamp: log.timestamp || null,
        actor: log.actor_name || 'System',
        role: (log.actor_role || '').replace(/_/g, ' '),
        action: (log.action || 'activity').replace(/_/g, ' '),
        description: log.description || details || '—',
        previousState,
        newState,
      };
    });

    const workflow = mmp?.workflow && typeof mmp.workflow === 'object' ? mmp.workflow : {};
    const archiveHistory = Array.isArray(workflow.archive_history) ? workflow.archive_history : [];
    const cycles = [...archiveHistory];
    const isCurrentlyArchived = mmp?.status === 'archived' || mmp?.cycle_status === 'archived';
    const archivedBy = mmp?.archivedby || workflow.archived_by;
    const archivedAt = mmp?.archivedat || workflow.archived_at;

    if (isCurrentlyArchived && archivedBy) {
      cycles.push({
        archived_by: archivedBy,
        archived_at: archivedAt || null,
        pre_archive_status: workflow.pre_archive_status || null,
        restored_by: null,
        restored_at: null,
      });
    }

    if (
      !isCurrentlyArchived &&
      workflow.restored_by &&
      workflow.restored_at &&
      !archiveHistory.some((item: any) => item.restored_at === workflow.restored_at)
    ) {
      cycles.push({
        archived_by: workflow.archived_by || null,
        archived_at: workflow.archived_at || null,
        pre_archive_status: workflow.pre_archive_status || null,
        restored_by: workflow.restored_by,
        restored_at: workflow.restored_at,
      });
    }

    cycles.forEach((cycle: any) => {
      if (cycle.archived_by || cycle.archived_at) {
        rows.push({
          timestamp: cycle.archived_at || null,
          actor: cycle.archived_by || 'System',
          role: '',
          action: 'Archived',
          description: 'MMP archived',
          previousState: cycle.pre_archive_status || '',
          newState: 'archived',
        });
      }
      if (cycle.restored_by || cycle.restored_at) {
        rows.push({
          timestamp: cycle.restored_at || null,
          actor: cycle.restored_by || 'System',
          role: '',
          action: 'Restored',
          description: 'MMP restored from archive',
          previousState: 'archived',
          newState: cycle.restored_status || '',
        });
      }
    });

    return rows.sort((a, b) => {
      const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return bTime - aTime;
    });
  }, [activityLogs, mmp]);

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
        ['Log Entries',      activityExportRows.length],
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
      // Sheet 7 — Activity
      // ════════════════════════════════════════════════════════════════
      const wsAct = wb.addWorksheet('Activity');
      wsAct.columns = [
        { key: 'ts',   width: 20 }, { key: 'actor', width: 26 },
        { key: 'role', width: 18 }, { key: 'act',   width: 22 },
        { key: 'desc', width: 42 }, { key: 'prev',  width: 18 },
        { key: 'next', width: 18 },
      ];
      addTitleBlock(wsAct, `MMP Activity (${activityExportRows.length} records)`, subtitle, 7);
      addHeaderRow(wsAct, ['Timestamp', 'Actor', 'Role', 'Action', 'Description', 'Previous State', 'New State']);

      const ACT_COLOR = (action: string) => {
        const a = (action || '').toLowerCase();
        if (a.includes('reject') || a.includes('recall') || a.includes('return')) return RED;
        if (a.includes('approve') || a.includes('complete') || a.includes('verify') || a.includes('restore')) return GREEN;
        if (a.includes('archive')) return AMBER;
        if (a.includes('update') || a.includes('edit')) return 'FF2563EB';
        return SLATE;
      };

      if (activityExportRows.length === 0) {
        const emptyRow = wsAct.addRow(['No activity recorded for this MMP.']);
        wsAct.mergeCells(emptyRow.number, 1, emptyRow.number, 7);
        emptyRow.height = 28;
        emptyRow.getCell(1).font = { italic: true, size: 10, color: { argb: SLATE } };
        emptyRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        emptyRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY_LT } };
        emptyRow.getCell(1).border = border();
      } else {
        activityExportRows.forEach((event, i) => {
          const row = addDataRow(wsAct, [
            event.timestamp ? format(new Date(event.timestamp), 'dd MMM yyyy HH:mm') : '—',
            event.actor,
            event.role || '—',
            event.action,
            event.description,
            event.previousState || '—',
            event.newState || '—',
          ], i % 2 === 0);
          row.getCell(1).font = { size: 9, color: { argb: SLATE } };
          row.getCell(4).font = { bold: true, size: 10, color: { argb: ACT_COLOR(event.action) } };
          if (event.newState) row.getCell(7).font = { bold: true, size: 10, color: { argb: GREEN } };
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
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden min-w-[80px]">
        <div
          className={`h-1.5 rounded-full ${pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-semibold tabular-nums w-8 text-right text-muted-foreground">{pct}%</span>
    </div>
  );

  // ── Badge for status class ────────────────────────────────────────────────
  const ClassBadge = ({ cls }: { cls: EntryClass }) => {
    const conf: Record<EntryClass, { label: string; cls: string }> = {
      done:        { label: 'Covered',     cls: 'bg-emerald-100 text-emerald-700 border border-emerald-300' },
      in_progress: { label: 'In Progress', cls: 'bg-amber-100 text-amber-700 border border-amber-300' },
      attention:   { label: 'Attention',   cls: 'bg-red-100 text-red-700 border border-red-300' },
      pending:     { label: 'Pending',     cls: 'bg-gray-100 text-gray-600 border border-gray-300' },
    };
    const c = conf[cls];
    return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${c.cls}`}>{c.label}</span>;
  };

  // ── Shared table header cell ──────────────────────────────────────────────
  const TH = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
    <th className={`px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 bg-gray-50 border-b-2 border-gray-200 ${right ? 'text-right' : 'text-left'} first:rounded-tl-lg last:rounded-tr-lg`}>
      {children}
    </th>
  );
  const TR = ({ children, i }: { children: React.ReactNode; i: number }) => (
    <tr className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-teal-50/40 transition-colors`}>
      {children}
    </tr>
  );
  const TotalsRow = ({ children }: { children: React.ReactNode }) => (
    <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">{children}</tr>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent
        className="max-w-5xl w-full max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden bg-gray-50 border-0 shadow-2xl text-foreground"
        onInteractOutside={e => e.preventDefault()}
      >
        {/* Header — teal gradient */}
        <DialogHeader className="px-5 pt-4 pb-4 flex-shrink-0 bg-gradient-to-r from-teal-700 to-teal-600">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2 text-base font-bold text-white">
                <div className="h-7 w-7 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0">
                  <BarChart3 className="h-4 w-4 text-white" />
                </div>
                Full MMP Status Report
              </DialogTitle>
              <p className="text-xs text-teal-200 mt-1 truncate pl-9">
                {mmpName}{mmp?.mmp_id ? ` · ${mmp.mmp_id}` : ''}{(mmp?.project as any)?.name ? ` · ${(mmp.project as any).name}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={exportExcel}
                disabled={!stats || excelLoading}
                className="border-white/30 text-white bg-white/10 hover:bg-white/20 hover:border-white/50 h-8 text-xs"
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
                className="bg-white/15 hover:bg-white/25 text-white border border-white/30 h-8 text-xs"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                PDF
              </Button>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/15 transition-colors ml-1">
                <X className="h-4 w-4 text-white/80" />
              </button>
            </div>
          </div>
        </DialogHeader>

        {/* Body */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-teal-600" />
            <span className="ml-3 text-muted-foreground text-sm">Loading report data…</span>
          </div>
        ) : !stats ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
            <AlertCircle className="h-8 w-8" />
            <p className="text-sm">No site entries found for this MMP.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Summary stat cards */}
            <div className="grid grid-cols-5 gap-3 px-5 pt-4 pb-3 flex-shrink-0">
              {[
                { label: 'Total Sites',    value: stats.total,      icon: MapPin,      cls: 'total'       as const },
                { label: 'Covered',        value: stats.done,       icon: CheckCircle2,cls: 'done'        as const },
                { label: 'In Progress',    value: stats.inProgress, icon: Clock,       cls: 'in_progress' as const },
                { label: 'Attention',      value: stats.attention,  icon: ShieldAlert, cls: 'attention'   as const },
                { label: 'Pending',        value: stats.pending,    icon: Activity,    cls: 'pending'     as const },
              ].map(({ label, value, icon: Icon, cls }) => {
                const c = clsCard[cls];
                return (
                  <div key={cls} className={`rounded-xl bg-white border border-gray-100 border-l-4 shadow-sm p-3 ${c.border}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</span>
                      <Icon className={`h-4 w-4 ${c.icon} opacity-70`} />
                    </div>
                    <div className={`text-2xl font-extrabold tabular-nums ${c.num}`}>{value.toLocaleString()}</div>
                    {cls === 'done' && (
                      <div className="text-[10px] text-gray-400 mt-0.5 tabular-nums">{stats.coveragePct}% coverage</div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Coverage strip */}
            <div className="mx-5 mb-3 rounded-xl bg-white border border-gray-100 shadow-sm px-4 py-2.5 flex-shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 w-20 flex-shrink-0">Coverage</span>
                <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-2.5 rounded-full transition-all ${stats.coveragePct >= 70 ? 'bg-emerald-500' : stats.coveragePct >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${stats.coveragePct}%` }}
                  />
                </div>
                <span className={`text-sm font-extrabold w-12 text-right tabular-nums ${stats.coveragePct >= 70 ? 'text-emerald-600' : stats.coveragePct >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
                  {stats.coveragePct}%
                </span>
                <span className="text-xs text-gray-400 hidden sm:block">{stats.stateCount} states · {stats.coordCount} coordinators</span>
              </div>
            </div>

            {/* Tabs */}
            <Tabs value={tab} onValueChange={setTab} className="flex-1 overflow-hidden flex flex-col">
              <TabsList className="flex-shrink-0 mx-5 w-auto justify-start bg-white border border-gray-200 shadow-sm p-1 rounded-xl gap-0.5">
                <TabsTrigger value="overview" className="text-xs data-[state=active]:bg-teal-600 data-[state=active]:text-white data-[state=active]:shadow-sm text-gray-500 hover:text-gray-700 rounded-lg px-3 py-1.5">
                  <BarChart3 className="h-3.5 w-3.5 mr-1.5" />By State
                </TabsTrigger>
                <TabsTrigger value="coordinators" className="text-xs data-[state=active]:bg-teal-600 data-[state=active]:text-white data-[state=active]:shadow-sm text-gray-500 hover:text-gray-700 rounded-lg px-3 py-1.5">
                  <Users className="h-3.5 w-3.5 mr-1.5" />Coordinators
                </TabsTrigger>
                <TabsTrigger value="sites" className="text-xs data-[state=active]:bg-teal-600 data-[state=active]:text-white data-[state=active]:shadow-sm text-gray-500 hover:text-gray-700 rounded-lg px-3 py-1.5">
                  <MapPin className="h-3.5 w-3.5 mr-1.5" />All Sites ({entries.length.toLocaleString()})
                </TabsTrigger>
                <TabsTrigger value="breakdown" className="text-xs data-[state=active]:bg-teal-600 data-[state=active]:text-white data-[state=active]:shadow-sm text-gray-500 hover:text-gray-700 rounded-lg px-3 py-1.5">
                  <TrendingUp className="h-3.5 w-3.5 mr-1.5" />Status Breakdown
                </TabsTrigger>
                <TabsTrigger value="financial" className="text-xs data-[state=active]:bg-teal-600 data-[state=active]:text-white data-[state=active]:shadow-sm text-gray-500 hover:text-gray-700 rounded-lg px-3 py-1.5">
                  <DollarSign className="h-3.5 w-3.5 mr-1.5" />Financial
                  {(downPayments.length + costSubmissions.length) > 0 && (
                    <span className="ml-1.5 text-[10px] bg-teal-100 text-teal-700 data-[state=active]:bg-white/20 data-[state=active]:text-white px-1.5 py-0.5 rounded-full font-bold">
                      {downPayments.length + costSubmissions.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="activity" className="text-xs data-[state=active]:bg-teal-600 data-[state=active]:text-white data-[state=active]:shadow-sm text-gray-500 hover:text-gray-700 rounded-lg px-3 py-1.5">
                  <History className="h-3.5 w-3.5 mr-1.5" />Activity
                  {activityLogs.length > 0 && (
                    <span className="ml-1.5 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-bold">
                      {activityLogs.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* ── Tab: By State ── */}
              <TabsContent value="overview" className="flex-1 overflow-auto px-5 py-3 mt-0">
                <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm bg-white">
                  <table className="w-full text-sm border-separate border-spacing-0">
                  <thead className="sticky top-0 bg-gray-50 z-10">
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
                        <td className="px-3 py-2 font-medium text-foreground">{s.name}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground">{s.total}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-600">{s.done}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-amber-600">{s.inProgress}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-red-600">{s.attention}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{s.pending}</td>
                        <td className="px-3 py-2 min-w-[140px]"><ProgressBar pct={s.coveragePct} /></td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{s.coordIds.size}</td>
                      </TR>
                    ))}
                    <TotalsRow>
                      <td className="px-3 py-2 text-foreground">TOTAL</td>
                      <td className="px-3 py-2 text-right tabular-nums text-foreground">{stats.total}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-600">{stats.done}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-600">{stats.inProgress}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-red-600">{stats.attention}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{stats.pending}</td>
                      <td className="px-3 py-2"><ProgressBar pct={stats.coveragePct} /></td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{stats.coordCount}</td>
                    </TotalsRow>
                  </tbody>
                  </table>
                </div>
              </TabsContent>

              {/* ── Tab: Coordinators ── */}
              <TabsContent value="coordinators" className="flex-1 overflow-auto px-5 py-3 mt-0">
                {stats.byCoordinator.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground text-sm">No coordinator assignments found.</div>
                ) : (
                  <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm bg-white">
                    <table className="w-full text-sm border-separate border-spacing-0">
                    <thead className="sticky top-0 bg-gray-50 z-10">
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
                          <td className="px-3 py-2 text-muted-foreground text-xs">{i + 1}</td>
                          <td className="px-3 py-2 font-medium text-foreground">{c.name}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{c.states.size}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground">{c.total}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-emerald-600">{c.done}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-amber-600">{c.inProgress}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-red-600">{c.attention}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{c.total - c.done - c.inProgress - c.attention}</td>
                          <td className="px-3 py-2"><ProgressBar pct={c.coveragePct} /></td>
                        </TR>
                      ))}
                      <TotalsRow>
                        <td className="px-3 py-2 text-muted-foreground text-xs">—</td>
                        <td className="px-3 py-2 text-foreground">TOTAL ({stats.coordCount} coordinators)</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {new Set(stats.byCoordinator.flatMap(c => [...c.states])).size}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-foreground">{stats.byCoordinator.reduce((s, c) => s + c.total, 0)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-600">{stats.byCoordinator.reduce((s, c) => s + c.done, 0)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-amber-600">{stats.byCoordinator.reduce((s, c) => s + c.inProgress, 0)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-red-600">{stats.byCoordinator.reduce((s, c) => s + c.attention, 0)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{stats.byCoordinator.reduce((s, c) => s + (c.total - c.done - c.inProgress - c.attention), 0)}</td>
                        <td className="px-3 py-2"><ProgressBar pct={stats.coveragePct} /></td>
                      </TotalsRow>
                    </tbody>
                    </table>
                  </div>
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
                    className="flex-1 px-3 py-1.5 text-sm rounded-xl bg-white border border-gray-200 text-foreground placeholder-gray-400 shadow-sm focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20"
                  />
                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className="px-3 py-1.5 text-sm rounded-xl bg-white border border-gray-200 text-foreground shadow-sm focus:outline-none focus:border-teal-400"
                  >
                    <option value="all">All Categories</option>
                    <option value="done">Covered</option>
                    <option value="in_progress">In Progress</option>
                    <option value="attention">Needs Attention</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>
                <div className="overflow-auto flex-1 pb-3">
                  <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm bg-white">
                    <table className="w-full text-sm border-separate border-spacing-0">
                    <thead className="sticky top-0 bg-gray-50 z-10">
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
                          <td className="px-3 py-1.5 font-medium text-foreground max-w-[180px] truncate" title={e.site_name || ''}>{e.site_name || '—'}</td>
                          <td className="px-3 py-1.5 text-muted-foreground font-mono text-xs">{e.site_code || '—'}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{e.state || e.hub_office || '—'}</td>
                          <td className="px-3 py-1.5 text-muted-foreground text-xs">{e.locality || '—'}</td>
                          <td className="px-3 py-1.5 text-xs text-muted-foreground">{fmtStatus(e.status)}</td>
                          <td className="px-3 py-1.5"><ClassBadge cls={classifyEntry(e.status)} /></td>
                        </TR>
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
                </div>
              </TabsContent>

              {/* ── Tab: Status Breakdown ── */}
              <TabsContent value="breakdown" className="flex-1 overflow-auto px-5 py-3 mt-0">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-foreground">
                      <FileText className="h-4 w-4 text-teal-600" />
                      Top Statuses
                    </h3>
                    <div className="space-y-2">
                      {stats.topStatuses.map(([status, count]) => {
                        const pct = Math.round((count / stats.total) * 100);
                        return (
                          <div key={status} className="flex items-center gap-3">
                            <ClassBadge cls={classifyEntry(status)} />
                            <span className="text-sm flex-1 truncate text-muted-foreground">{fmtStatus(status)}</span>
                            <span className="text-sm tabular-nums font-semibold w-8 text-right text-foreground">{count}</span>
                            <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-1.5 bg-teal-500 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-foreground">
                      <Activity className="h-4 w-4 text-teal-600" />
                      Category Overview
                    </h3>
                    {[
                      { label: 'Covered (Done)', value: stats.done, color: 'bg-emerald-500', pct: stats.coveragePct },
                      { label: 'In Progress', value: stats.inProgress, color: 'bg-amber-500', pct: Math.round((stats.inProgress / stats.total) * 100) },
                      { label: 'Needs Attention', value: stats.attention, color: 'bg-red-500', pct: Math.round((stats.attention / stats.total) * 100) },
                      { label: 'Pending', value: stats.pending, color: 'bg-gray-400', pct: Math.round((stats.pending / stats.total) * 100) },
                    ].map(({ label, value, color, pct }) => (
                      <div key={label} className="mb-3">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="font-semibold text-foreground">{value.toLocaleString()} ({pct}%)</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className={`h-2 ${color} rounded-full`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    ))}
                    <div className="mt-4 pt-3 border-t border-border text-xs text-muted-foreground space-y-1.5">
                      <div className="flex justify-between"><span>Total Fees</span><span className="font-semibold text-teal-600 tabular-nums">SDG {stats.totalFees.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span>MMP ID</span><span className="font-mono text-muted-foreground">{mmp?.mmp_id || '—'}</span></div>
                      <div className="flex justify-between"><span>MMP Status</span><span className="capitalize text-muted-foreground">{mmp?.status || '—'}</span></div>
                      <div className="flex justify-between"><span>Uploaded</span><span className="text-muted-foreground">{mmp?.created_at ? format(new Date(mmp.created_at), 'dd MMM yyyy') : '—'}</span></div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* ── Tab: Financial ── */}
              <TabsContent value="financial" className="flex-1 overflow-auto px-5 py-3 mt-0 space-y-6">
                {financeLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-teal-600 mr-2" />
                    <span className="text-sm text-muted-foreground">Loading financial data…</span>
                  </div>
                ) : (
                  <>
                    {/* ── Down Payments ─── */}
                    <div>
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-foreground">
                        <Banknote className="h-4 w-4 text-emerald-600" />
                        Down Payment Requests
                        <span className="text-xs font-normal text-muted-foreground">({downPayments.length} records)</span>
                      </h3>
                      {downPayments.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4 text-center">No down payment requests linked to this MMP.</p>
                      ) : (
                        <>
                          <div className="flex flex-wrap gap-2 mb-3">
                            {Object.entries(
                              downPayments.reduce<Record<string, number>>((acc, dp) => { acc[dp.status] = (acc[dp.status] || 0) + 1; return acc; }, {})
                            ).sort((a, b) => b[1] - a[1]).map(([status, count]) => {
                              const statusColors: Record<string, string> = {
                                fully_paid: 'bg-emerald-100 text-emerald-700 border border-emerald-300',
                                approved: 'bg-teal-100 text-teal-700 border border-teal-300',
                                partially_paid: 'bg-amber-100 text-amber-700 border border-amber-300',
                                pending_admin: 'bg-purple-100 text-purple-700 border border-purple-300',
                                pending_supervisor: 'bg-orange-100 text-orange-700 border border-orange-300',
                                rejected: 'bg-red-100 text-red-700 border border-red-300',
                              };
                              const cls = statusColors[status] || 'bg-gray-100 text-gray-600 border border-gray-300';
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
                              { label: 'Total Requested', value: downPayments.reduce((s, d) => s + Number(d.requested_amount || 0), 0), color: 'text-foreground' },
                              { label: 'Total Paid', value: downPayments.reduce((s, d) => s + Number(d.total_paid_amount || 0), 0), color: 'text-emerald-600' },
                              { label: 'Remaining Balance', value: downPayments.reduce((s, d) => s + Number(d.remaining_amount || 0), 0), color: 'text-orange-600' },
                            ].map(({ label, value, color }) => (
                              <div key={label} className="rounded-xl border border-border bg-muted/40 px-3 py-2">
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{label}</p>
                                <p className={`text-base font-bold tabular-nums ${color}`}>SDG {value.toLocaleString()}</p>
                              </div>
                            ))}
                          </div>
                          <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm bg-white">
                            <table className="w-full text-sm border-separate border-spacing-0">
                            <thead className="sticky top-0 bg-gray-50 z-10">
                              <tr>
                                <TH>Site</TH><TH>Hub</TH><TH>Type</TH><TH>Status</TH>
                                <TH right>Requested (SDG)</TH><TH right>Paid (SDG)</TH><TH right>Remaining</TH><TH>Date</TH>
                              </tr>
                            </thead>
                            <tbody>
                              {downPayments.map((dp, i) => {
                                const statusColors: Record<string, string> = {
                                  fully_paid: 'text-emerald-600', approved: 'text-teal-600',
                                  partially_paid: 'text-amber-600', pending_admin: 'text-purple-600',
                                  pending_supervisor: 'text-orange-600', rejected: 'text-red-600',
                                };
                                return (
                                  <TR key={dp.id} i={i}>
                                    <td className="px-3 py-1.5 font-medium text-foreground max-w-[140px] truncate" title={dp.site_name || ''}>{dp.site_name || '—'}</td>
                                    <td className="px-3 py-1.5 text-muted-foreground text-xs">{dp.hub_name || '—'}</td>
                                    <td className="px-3 py-1.5 text-muted-foreground text-xs capitalize">{(dp.payment_type || '').replace(/_/g, ' ') || '—'}</td>
                                    <td className={`px-3 py-1.5 text-xs font-medium capitalize ${statusColors[dp.status] || 'text-muted-foreground'}`}>
                                      {(dp.status || '').replace(/_/g, ' ')}
                                    </td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{Number(dp.requested_amount || 0).toLocaleString()}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-emerald-600">{Number(dp.total_paid_amount || 0).toLocaleString()}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-orange-600">{Number(dp.remaining_amount || 0).toLocaleString()}</td>
                                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{dp.created_at ? format(new Date(dp.created_at), 'dd MMM yyyy') : '—'}</td>
                                  </TR>
                                );
                              })}
                              <TotalsRow>
                                <td className="px-3 py-2 text-foreground" colSpan={4}>TOTAL ({downPayments.length})</td>
                                <td className="px-3 py-2 text-right tabular-nums text-foreground">{downPayments.reduce((s, d) => s + Number(d.requested_amount || 0), 0).toLocaleString()}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-emerald-600">{downPayments.reduce((s, d) => s + Number(d.total_paid_amount || 0), 0).toLocaleString()}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-orange-600">{downPayments.reduce((s, d) => s + Number(d.remaining_amount || 0), 0).toLocaleString()}</td>
                                <td className="px-3 py-2" />
                              </TotalsRow>
                            </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </div>

                    {/* ── Operational Cost Submissions ─── */}
                    <div>
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-foreground">
                        <DollarSign className="h-4 w-4 text-teal-600" />
                        Operational Cost Submissions
                        <span className="text-xs font-normal text-muted-foreground">({costSubmissions.length} records)</span>
                      </h3>
                      {costSubmissions.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4 text-center">No cost submissions linked to this MMP.</p>
                      ) : (
                        <>
                          <div className="flex flex-wrap gap-2 mb-3">
                            {Object.entries(
                              costSubmissions.reduce<Record<string, number>>((acc, cs) => { acc[cs.status] = (acc[cs.status] || 0) + 1; return acc; }, {})
                            ).sort((a, b) => b[1] - a[1]).map(([status, count]) => {
                              const cls = status === 'approved' ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                                : status === 'pending' ? 'bg-amber-100 text-amber-700 border border-amber-300'
                                : status === 'rejected' ? 'bg-red-100 text-red-700 border border-red-300'
                                : 'bg-gray-100 text-gray-600 border border-gray-300';
                              return (
                                <span key={status} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${cls}`}>
                                  {status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                  <span className="font-bold">{count}</span>
                                </span>
                              );
                            })}
                          </div>
                          <div className="grid grid-cols-3 gap-3 mb-3">
                            <div className="rounded-xl border border-border bg-muted/40 px-3 py-2">
                              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Total Amount</p>
                              <p className="text-base font-bold tabular-nums text-foreground">
                                SDG {(costSubmissions.reduce((s, c) => s + Number(c.amount_cents || 0), 0) / 100).toLocaleString()}
                              </p>
                            </div>
                            <div className="rounded-xl border border-border bg-muted/40 px-3 py-2">
                              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Approved</p>
                              <p className="text-base font-bold tabular-nums text-emerald-600">
                                SDG {(costSubmissions.filter(c => c.status === 'approved').reduce((s, c) => s + Number(c.amount_cents || 0), 0) / 100).toLocaleString()}
                              </p>
                            </div>
                            <div className="rounded-xl border border-border bg-muted/40 px-3 py-2">
                              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Pending</p>
                              <p className="text-base font-bold tabular-nums text-amber-600">
                                SDG {(costSubmissions.filter(c => c.status === 'pending').reduce((s, c) => s + Number(c.amount_cents || 0), 0) / 100).toLocaleString()}
                              </p>
                            </div>
                          </div>
                          <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm bg-white">
                            <table className="w-full text-sm border-separate border-spacing-0">
                            <thead className="sticky top-0 bg-gray-50 z-10">
                              <tr>
                                <TH>Title / Category</TH><TH>Status</TH><TH>Tier 1</TH><TH>Tier 2</TH>
                                <TH right>Amount (SDG)</TH><TH>Date</TH>
                              </tr>
                            </thead>
                            <tbody>
                              {costSubmissions.map((cs, i) => {
                                const tierBadge = (s: string | null) => {
                                  if (!s) return null;
                                  const cls = s === 'approved' ? 'text-emerald-600' : s === 'pending' ? 'text-amber-600' : s === 'rejected' ? 'text-red-600' : 'text-muted-foreground';
                                  return <span className={`capitalize text-xs ${cls}`}>{s.replace(/_/g, ' ')}</span>;
                                };
                                return (
                                  <TR key={cs.id} i={i}>
                                    <td className="px-3 py-1.5 max-w-[180px]">
                                      <div className="font-medium truncate text-xs text-foreground" title={cs.request_title || ''}>{cs.request_title || '—'}</div>
                                      <div className="text-muted-foreground text-xs capitalize">{(cs.expense_category || '').replace(/_/g, ' ')}</div>
                                    </td>
                                    <td className={`px-3 py-1.5 text-xs font-medium capitalize ${cs.status === 'approved' ? 'text-emerald-600' : cs.status === 'pending' ? 'text-amber-600' : cs.status === 'rejected' ? 'text-red-600' : 'text-muted-foreground'}`}>
                                      {(cs.status || '').replace(/_/g, ' ')}
                                    </td>
                                    <td className="px-3 py-1.5">{tierBadge(cs.tier1_status)}</td>
                                    <td className="px-3 py-1.5">{tierBadge(cs.tier2_status)}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{(Number(cs.amount_cents || 0) / 100).toLocaleString()}</td>
                                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{cs.created_at ? format(new Date(cs.created_at), 'dd MMM yyyy') : '—'}</td>
                                  </TR>
                                );
                              })}
                              <TotalsRow>
                                <td className="px-3 py-2 text-foreground" colSpan={4}>TOTAL ({costSubmissions.length})</td>
                                <td className="px-3 py-2 text-right tabular-nums text-foreground">{(costSubmissions.reduce((s, c) => s + Number(c.amount_cents || 0), 0) / 100).toLocaleString()}</td>
                                <td className="px-3 py-2" />
                              </TotalsRow>
                            </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </div>
                  </>
                )}
              </TabsContent>

              {/* ── Tab: Activity ── */}
              <TabsContent value="activity" className="flex-1 overflow-auto px-5 py-3 mt-0 space-y-4">
                {/* ── Lifecycle Events (archive / restore cycles from workflow JSONB) ── */}
                {(() => {
                  const wf = (mmp?.workflow as any) || {};
                  const history: any[] = wf.archive_history || [];

                  // Use DB columns as ground truth for the current archive state.
                  // workflow.restored_by/restored_at persist across multiple cycles so
                  // they must NOT be used to infer the current cycle — only archive_history
                  // (completed cycles) and the live DB archivedby column are authoritative.
                  const isCurrentlyArchived = !!mmp?.archivedby || mmp?.status === 'archived';
                  const archivedBy = mmp?.archivedby || wf.archived_by;
                  const archivedAt = mmp?.archivedat || wf.archived_at;

                  // Completed cycles come from archive_history (source of truth).
                  const cycles: any[] = [...history];

                  // Open archive cycle: MMP is currently archived and this cycle isn't
                  // in archive_history yet (archive_history only gets an entry on restore).
                  if (isCurrentlyArchived && archivedBy) {
                    cycles.push({
                      archived_by: archivedBy,
                      archived_at: archivedAt || null,
                      pre_archive_status: wf.pre_archive_status || null,
                      restored_by: null,   // not restored yet
                      restored_at: null,
                    });
                  }

                  // Legacy backward-compat: pre-archive_history restores stored only
                  // top-level restored_by/restored_at and have no archive_history entry.
                  // Only surface these when the MMP is NOT currently archived (preventing
                  // phantom restore rows in archive→restore→archive sequences).
                  if (
                    !isCurrentlyArchived &&
                    wf.restored_by &&
                    wf.restored_at &&
                    !history.some((h: any) => h.restored_at === wf.restored_at)
                  ) {
                    cycles.push({
                      archived_by: wf.archived_by || null,
                      archived_at: wf.archived_at || null,
                      pre_archive_status: wf.pre_archive_status || null,
                      restored_by: wf.restored_by,
                      restored_at: wf.restored_at,
                    });
                  }

                  if (cycles.length === 0) return null;

                  return (
                    <div>
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-foreground">
                        <Archive className="h-4 w-4 text-orange-500" />
                        Archive / Restore History
                      </h3>
                      <div className="rounded-xl border border-orange-200 overflow-hidden shadow-sm bg-white">
                        <table className="w-full text-sm border-separate border-spacing-0">
                          <thead className="sticky top-0 bg-orange-50 z-10">
                            <tr>
                              <TH>Event</TH>
                              <TH>By (User ID)</TH>
                              <TH>At</TH>
                              <TH>Previous Status</TH>
                            </tr>
                          </thead>
                          <tbody>
                            {cycles.flatMap((cycle: any, ci: number) => {
                              const rows = [];
                              if (cycle.archived_by || cycle.archived_at) {
                                rows.push(
                                  <TR key={`arch-${ci}`} i={ci * 2}>
                                    <td className="px-3 py-2">
                                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-700 bg-orange-100 border border-orange-200 rounded-full px-2.5 py-0.5">
                                        <Archive className="h-3 w-3" />Archived
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{cycle.archived_by || '—'}</td>
                                    <td className="px-3 py-2 text-xs text-muted-foreground">
                                      {cycle.archived_at ? format(new Date(cycle.archived_at), 'dd MMM yyyy · HH:mm') : '—'}
                                    </td>
                                    <td className="px-3 py-2 text-xs text-muted-foreground capitalize">
                                      {cycle.pre_archive_status ? cycle.pre_archive_status.replace(/_/g, ' ') : '—'}
                                    </td>
                                  </TR>
                                );
                              }
                              if (cycle.restored_by || cycle.restored_at) {
                                rows.push(
                                  <TR key={`rest-${ci}`} i={ci * 2 + 1}>
                                    <td className="px-3 py-2">
                                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700 bg-teal-100 border border-teal-200 rounded-full px-2.5 py-0.5">
                                        <RotateCcw className="h-3 w-3" />Restored
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{cycle.restored_by || '—'}</td>
                                    <td className="px-3 py-2 text-xs text-muted-foreground">
                                      {cycle.restored_at ? format(new Date(cycle.restored_at), 'dd MMM yyyy · HH:mm') : '—'}
                                    </td>
                                    <td className="px-3 py-2 text-xs text-muted-foreground">—</td>
                                  </TR>
                                );
                              }
                              return rows;
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}

                {/* ── Audit-log timeline ── */}
                {financeLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-teal-600 mr-2" />
                    <span className="text-sm text-muted-foreground">Loading activity…</span>
                  </div>
                ) : activityLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                    <History className="h-8 w-8 opacity-40" />
                    <p className="text-sm">No activity logs found for this MMP.</p>
                  </div>
                ) : (
                  <div className="space-y-0 relative">
                    <div className="absolute left-[18px] top-4 bottom-4 w-px bg-muted" />
                    {activityLogs.map((log, i) => {
                      const isReject = log.action?.includes('reject') || log.action?.includes('recall') || log.action?.includes('return');
                      const isApprove = log.action?.includes('approve') || log.action?.includes('complete') || log.action?.includes('verify');
                      const isEdit = log.action?.includes('update') || log.action?.includes('edit');
                      const dotCls = isReject ? 'bg-red-100 text-red-600 border-red-300'
                        : isApprove ? 'bg-emerald-100 text-emerald-600 border-emerald-300'
                        : isEdit ? 'bg-teal-100 text-teal-600 border-teal-300'
                        : 'bg-gray-100 text-gray-500 border-gray-300';
                      const badgeCls = isReject ? 'bg-red-100 text-red-700'
                        : isApprove ? 'bg-emerald-100 text-emerald-700'
                        : isEdit ? 'bg-teal-100 text-teal-700'
                        : 'bg-gray-100 text-gray-600';
                      return (
                        <div key={log.id || i} className="flex gap-3 relative pb-4">
                          <div className="flex-shrink-0 w-9 flex items-start justify-center pt-0.5 z-10">
                            <div className={`w-4 h-4 rounded-full border-2 border-background flex items-center justify-center ${dotCls}`}>
                              <div className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0 bg-muted/30 rounded-xl border border-border px-3 py-2">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="font-semibold text-sm text-foreground">{log.actor_name || 'System'}</span>
                              {log.actor_role && (
                                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded capitalize">
                                  {log.actor_role.replace(/_/g, ' ')}
                                </span>
                              )}
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeCls}`}>
                                {(log.action || 'action').replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                              </span>
                              <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">
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
                                {log.previous_state && log.new_state && <span className="text-muted-foreground">→</span>}
                                {log.new_state && (
                                  <span className="bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded capitalize font-medium">
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
