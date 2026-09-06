
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Download, Info, AlertTriangle, ExternalLink, ArrowRight, RefreshCw, ShieldAlert, Badge } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AttributionReportRow, WizardState } from '../CycleCloseWizard';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  type EnumRow,
  exportFormattedReconciliation,
  exportFormattedPaymentRun,
} from '@/utils/cycleCloseExport';

interface Props {
  wizardState: WizardState;
  updateWizardState: (patch: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
  canGoBack: boolean;
  canOverride: boolean;
  currentUser: any;
}

// ── Finance payment queue: one row per WFP-covered site Finance must pay ─────
interface PaymentQueueRow {
  siteId: string;
  siteName: string;
  enumeratorName: string;
  enumeratorFee: number;
  transportFee: number;
  totalFee: number;
  advanceOffset: number;
  cashOutstanding: number;
  feePaidStatus: string;
  receiptUrl: string | null;
  receiptReference: string | null;
}

export default function Step6Reconciliation({ wizardState, updateWizardState, onNext, onBack, canGoBack }: Props) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<EnumRow[]>([]);
  const [paymentQueue, setPaymentQueue] = useState<PaymentQueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [attributionLoading, setAttributionLoading] = useState(false);
  const [stateFilter, setStateFilter] = useState('all');
  const [issueFilter, setIssueFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [users, setUsers] = useState<any[]>([]);
  const [correction, setCorrection] = useState<any | null>(null);
  const [reason, setReason] = useState('');
  const [selectedUser, setSelectedUser] = useState('');
  const [correctionSaving, setCorrectionSaving] = useState(false);
  const [attributionError, setAttributionError] = useState<string | null>(null);

  useEffect(() => {
    if (wizardState.selectedMmpId) {
      buildReconciliation();
      loadAttribution();
    }
  }, [wizardState.selectedMmpId]);

  const loadAttribution = async () => {
    if (!wizardState.selectedMmpId) return;
    setAttributionLoading(true);
    const [reportResult, usersResult, devicesResult] = await Promise.all([
      (supabase as any).rpc('get_cycle_attribution_report', { p_mmp_id: wizardState.selectedMmpId }),
      (supabase as any).rpc('list_field_attribution_users'),
      (supabase as any).rpc('list_field_devices'),
    ]);
    void devicesResult;
    if (reportResult.error) {
      setAttributionError(reportResult.error.message ?? 'Could not load collection attribution report.');
      updateWizardState({ attributionReport: [], attributionUnresolvedCount: Number.MAX_SAFE_INTEGER, attributionLoaded: false });
      setAttributionLoading(false);
      return;
    }
    setAttributionError(null);
    const report = (reportResult.data?.rows ?? []) as AttributionReportRow[];
    const officialUsers = (usersResult.error ? [] : usersResult.data ?? []).filter((u: any) => {
      const roles = [u.role, ...(Array.isArray(u.roles) ? u.roles : []), ...(Array.isArray(u.additional_roles) ? u.additional_roles.map((r: any) => r?.role) : [])]
        .filter(Boolean).map((r: any) => String(r).toLowerCase().replace(/[\s_-]/g, ''));
      return roles.some((r: string) => r === 'collector' || r === 'datacollector' || r === 'coordinator');
    });
    setUsers(officialUsers as any[]);
    const unresolved = report.filter(r => r.requires_attribution === true &&
      (!['auto', 'corrected'].includes(String(r.status ?? '').toLowerCase()) || !r.resolved_collector_id)).length;
    updateWizardState({
      attributionReport: report,
      attributionUnresolvedCount: unresolved,
      attributionLoaded: true,
    });
    setAttributionLoading(false);
  };

  const attributionRows = wizardState.attributionReport ?? [];
  const isResolved = (r: AttributionReportRow) => r.requires_attribution !== true ||
    (['auto', 'corrected'].includes(String(r.status ?? '').toLowerCase()) && !!r.resolved_collector_id);
  const states = useMemo(() => [...new Set(attributionRows.map(r => r.state).filter(Boolean))].sort(), [attributionRows]);
  const filteredAttribution = attributionRows.filter(r => {
    const state = r.state ?? '';
    const status = String(r.status ?? '').toLowerCase();
    const issueType = String(r.issue_type ?? '').toLowerCase();
    return (stateFilter === 'all' || state === stateFilter) &&
      (issueFilter === 'all' || issueType === issueFilter) &&
      (statusFilter === 'all' || status === statusFilter);
  });
  const unresolvedAttribution = attributionRows.filter(r => !isResolved(r));

  const saveCorrection = async () => {
    if (!correction || !selectedUser || reason.trim().length < 10) return;
    setCorrectionSaving(true);
    const { error } = await (supabase as any).rpc('correct_collection_attribution', {
      p_site_id: correction.site_id ?? correction.siteId,
      p_device_id: correction.device_id,
      p_collector_id: selectedUser,
      p_coordinator_id: correction.coordinator_id ?? null,
      p_reason: reason.trim(),
    });
    if (!error) {
      setCorrection(null); setReason(''); setSelectedUser('');
      await loadAttribution();
      await buildReconciliation();
    } else alert(error.message ?? 'Could not save correction.');
    setCorrectionSaving(false);
  };

  const buildReconciliation = async () => {
    setLoading(true);

    // Fetch entries with per-site fee columns and all enumerator-linkage columns.
    // transport_fee / enumerator_fee live on each entry row, not on mmp_files.
    // WFP-confirmed rows must use the corrected attribution identity. Legacy
    // linkage remains available only for non-confirmed exception/history rows.
    // Do not join profiles inline — do a separate lookup for official names.
    // Cast to any: fee_* payment columns and not_covered_flag are newer DB
    // columns not yet reflected in the generated Supabase types.
    const { data: entries } = await (supabase as any)
      .from('mmp_site_entries')
      .select(
        'id, site_name, accepted_by, claimed_by, visit_started_by, attribution_collector_id, attribution_status, status, not_covered_flag, ' +
        'transport_fee, enumerator_fee, additional_data, ' +
        'fee_paid_status, fee_paid_amount, fee_cash_paid_amount, fee_advance_offset_amount, ' +
        'fee_payment_reference, fee_receipt_url'
      )
      .eq('mmp_file_id', wizardState.selectedMmpId!);

    const notCoveredIds = new Set(Object.keys(wizardState.uncoveredReasons));
    const confirmedMatchIds = new Set(
      wizardState.matchResults
        .filter(r => r.status === 'auto' || r.action === 'confirm')
        .map(r => r.matchedSiteId)
        .filter(Boolean) as string[]
    );

    const isWfpConfirmed = (e: any): boolean =>
      String(e.status ?? '').toLowerCase() === 'wfp_confirmed' || confirmedMatchIds.has(e.id);

    // Corrected device attribution is authoritative for confirmed financial
    // rows. Never fall back to accepted/claimed/visit identity in that case.
    const resolveEnumId = (e: any): string | null =>
      isWfpConfirmed(e)
        ? (e.attribution_collector_id || null)
        : (e.accepted_by || e.claimed_by || e.visit_started_by || null);

    // Group by enumerator (name resolved below after profile lookup)
    const byEnum: Record<string, { name: string; entries: any[] }> = {};
    for (const e of (entries ?? [])) {
      const id = resolveEnumId(e);
      if (!id) continue;
      const ad = (e as any).additional_data ?? {};
      const adName = ad.collector_name || ad.accepted_by_name || ad.enumerator_name ||
                     ad.data_collector_name || ad.collectorName || 'Unknown';
      if (!byEnum[id]) byEnum[id] = {
        name: isWfpConfirmed(e) ? 'Unknown' : adName,
        entries: [],
      };
      byEnum[id].entries.push(e);
    }

    // Resolve profile names + advances in parallel
    const allEnumIds = Object.keys(byEnum);
    const entryIds   = (entries ?? []).map((e: any) => e.id);

    const [profileResult, advancesResult] = await Promise.all([
      allEnumIds.length
        ? supabase.from('profiles').select('id, full_name').in('id', allEnumIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
      entryIds.length
        ? supabase
            .from('down_payment_requests')
            .select('mmp_site_entry_id, total_paid_amount, requested_amount, status')
            .in('mmp_site_entry_id', entryIds)
            .in('status', ['approved', 'paid', 'partially_paid', 'fully_paid'])
        : Promise.resolve({ data: [] }),
    ]);

    for (const p of (profileResult.data ?? [])) {
      if (byEnum[p.id] && p.full_name) byEnum[p.id].name = p.full_name;
    }
    const advances = advancesResult.data;

    // Map entry_id → enumerator UUID so we can attribute advances to enumerators
    const entryToEnum: Record<string, string> = {};
    for (const e of (entries ?? [])) {
      const enumId = resolveEnumId(e);
      if (enumId) entryToEnum[(e as any).id] = enumId;
    }

    const advanceByEnum: Record<string, number> = {};
    for (const a of (advances ?? [])) {
      const enumId = entryToEnum[(a as any).mmp_site_entry_id];
      if (!enumId) continue;
      const amount = (a as any).total_paid_amount ?? (a as any).requested_amount ?? 0;
      advanceByEnum[enumId] = (advanceByEnum[enumId] ?? 0) + amount;
    }

    const tableRows: EnumRow[] = Object.entries(byEnum).map(([enumId, data]) => {
      const sitesAssigned = data.entries.length;

      const confirmedEntries = data.entries.filter(isWfpConfirmed);
      const wfpConfirmed = confirmedEntries.length;
      const wfpRejected = data.entries.filter(e =>
        wizardState.matchResults.some(r => r.matchedSiteId === e.id && r.action === 'reject')
      ).length;
      const notCoveredCount = data.entries.filter(e => notCoveredIds.has(e.id)).length;

      const advancePaid = advanceByEnum[enumId] ?? 0;

      const transportEarned = confirmedEntries.reduce((s, e) => s + (Number(e.transport_fee) || 0), 0);
      const feesEarned      = confirmedEntries.reduce((s, e) => s + (Number(e.enumerator_fee) || 0), 0);
      const totalEarned     = transportEarned + feesEarned;
      const netToPay        = totalEarned - advancePaid;

      const transportRate = confirmedEntries.length > 0
        ? Math.round(transportEarned / confirmedEntries.length)
        : 0;
      const feeRate = confirmedEntries.length > 0
        ? Math.round(feesEarned / confirmedEntries.length)
        : 0;

      let rowType: EnumRow['rowType'] = 'amber';
      if (advancePaid === 0) rowType = 'blue';
      else if (netToPay > 0) rowType = 'green';
      else if (netToPay < 0) rowType = 'red';

      return {
        enumeratorId: enumId,
        enumeratorName: data.name,
        sitesAssigned,
        wfpConfirmed,
        wfpRejected,
        notCovered: notCoveredCount,
        advancePaid,
        transportRate,
        feeRate,
        transportEarned,
        feesEarned,
        totalEarned,
        netToPay,
        rowType,
        paymentDone: false, // read-only step — payment happens in Field Payments Centre
      };
    });

    setRows(tableRows);

    // ── Build the Finance payment queue: one row per WFP-covered site ────────
    // Include a site only when it is confirmed by the current wizard result
    // (auto match / confirmed link) OR already persisted as wfp_confirmed in the
    // DB. Always exclude not-covered sites.
    const enumNameById: Record<string, string> = {};
    for (const [enumId, data] of Object.entries(byEnum)) enumNameById[enumId] = data.name;

    const queueRows: PaymentQueueRow[] = (entries ?? [])
      .filter((e: any) => {
        if (notCoveredIds.has(e.id)) return false;
        if (e.not_covered_flag === true) return false;
         return isWfpConfirmed(e);
      })
      .map((e: any) => {
        const enumId = resolveEnumId(e);
        const enumeratorName = (enumId && enumNameById[enumId]) || 'Unknown';
        const enumeratorFee = Number(e.enumerator_fee) || 0;
        const transportFee = Number(e.transport_fee) || 0;
        const totalFee = enumeratorFee + transportFee;
        const advanceOffset = Math.min(Number(e.fee_advance_offset_amount) || 0, totalFee);
        // Cash still owed after advance offset and any cash already paid.
        const cashPaid = Number(e.fee_cash_paid_amount) || 0;
        const cashOutstanding = Math.max(totalFee - advanceOffset - cashPaid, 0);
        return {
          siteId: e.id,
          siteName: e.site_name ?? '—',
          enumeratorName,
          enumeratorFee,
          transportFee,
          totalFee,
          advanceOffset,
          cashOutstanding,
          feePaidStatus: String(e.fee_paid_status ?? 'unpaid'),
          receiptUrl: e.fee_receipt_url ?? null,
          receiptReference: e.fee_payment_reference ?? null,
        };
      })
      .sort((a: PaymentQueueRow, b: PaymentQueueRow) => a.siteName.localeCompare(b.siteName));

    setPaymentQueue(queueRows);
    setLoading(false);
  };

  const exportReconciliation = () => void exportFormattedReconciliation(rows, wizardState);
  const exportPaymentRunSheet = () => void exportFormattedPaymentRun(rows, wizardState);

  const exportFinancialSummaryPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Cycle Financial Summary', 14, 20);
    doc.setFontSize(10);
    doc.text(`Cycle: ${wizardState.selectedMmp?.name ?? ''}`, 14, 30);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 37);
    (autoTable as any)(doc, {
      startY: 45,
      head: [['Enumerator', 'Assigned', 'Confirmed', 'Advance', 'Earned', 'Net']],
      body: rows.map(r => [r.enumeratorName, r.sitesAssigned, r.wfpConfirmed, r.advancePaid, r.totalEarned, r.netToPay]),
    });
    doc.save('cycle-financial-summary.pdf');
  };

  const totalAdvances  = rows.reduce((s, r) => s + r.advancePaid, 0);
  const totalEarned    = rows.reduce((s, r) => s + r.totalEarned, 0);
  const totalToPay     = rows.filter(r => r.netToPay > 0).reduce((s, r) => s + r.netToPay, 0);
  const totalToRecover = rows.filter(r => r.netToPay < 0).reduce((s, r) => s + Math.abs(r.netToPay), 0);

  const discrepancySites = wizardState.matchResults.filter(r =>
    r.action === 'reject' && r.matchedSiteId
  );

  const rowColor = (r: EnumRow) => {
    if (r.rowType === 'green') return 'bg-green-50 dark:bg-green-950/20 border-green-200';
    if (r.rowType === 'red') return 'bg-red-50 dark:bg-red-950/20 border-red-200';
    if (r.rowType === 'blue') return 'bg-blue-50 dark:bg-blue-950/20 border-blue-200';
    return 'bg-amber-50 dark:bg-amber-950/20 border-amber-200';
  };

  // Derive a direct link to Field Payments Centre (Fees tab), pre-filtered to this MMP
  const fieldPaymentsUrl = `/field-payments?tab=fees${wizardState.selectedMmpId ? '&mmp=' + wizardState.selectedMmpId : ''}`;
  const recoveryUrl = `/field-payments?tab=recovery${wizardState.selectedMmpId ? '&mmp=' + wizardState.selectedMmpId : ''}`;

  // Counts for CTA
  const sitesToPay     = rows.filter(r => r.rowType === 'green' || r.rowType === 'blue').length;
  const sitesToRecover = rows.filter(r => r.rowType === 'red').length;

  if (loading) return (
    <div className="flex items-center gap-2 justify-center py-12 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" /> Building reconciliation…
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Step 5 — Financial Reconciliation</h2>
        <p className="text-sm text-muted-foreground mt-0.5" dir="rtl">الخطوة ٥ — المراجعة والمطابقة المالية</p>
        <p className="text-muted-foreground text-sm">Review earnings vs. advances. Download the reports below, then pay fees via Field Payments Centre.</p>
      </div>

      <section className="border rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/30 border-b flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-sm flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-amber-600" />Collection Attribution</h3>
            <p className="text-xs text-muted-foreground mt-1">Compare WFP identity evidence with the official Command Center field-user profile before closing.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={loadAttribution} disabled={attributionLoading} className="shrink-0">
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${attributionLoading ? 'animate-spin' : ''}`} />Refresh
          </Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 border-b bg-background">
          {[
            ['Total evidence', attributionRows.length],
            ['Unresolved', unresolvedAttribution.length],
            ['Resolved', attributionRows.length - unresolvedAttribution.length],
            ['States', states.length],
          ].map(([label, value]) => <div key={label} className="rounded-md border px-3 py-2"><p className="text-[11px] text-muted-foreground">{label}</p><p className="text-lg font-semibold">{value}</p></div>)}
        </div>
        {states.length > 0 && <div className="px-4 py-3 border-b grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {states.map(state => {
            const stateRows = attributionRows.filter(r => r.state === state);
            const open = stateRows.filter(r => !isResolved(r)).length;
            return <button type="button" key={state} onClick={() => setStateFilter(state)} className="text-left rounded-md border px-3 py-2 hover:bg-muted/50">
              <p className="text-xs font-medium truncate">{state}</p><p className="text-[11px] text-muted-foreground">{stateRows.length} records · <span className={open ? 'text-amber-700' : 'text-green-700'}>{open} open</span></p>
            </button>;
          })}
        </div>}
        <div className="flex flex-wrap gap-2 p-3 border-b">
          <Select value={stateFilter} onValueChange={setStateFilter}><SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="All states" /></SelectTrigger><SelectContent><SelectItem value="all">All states</SelectItem>{states.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
          <Select value={issueFilter} onValueChange={setIssueFilter}><SelectTrigger className="w-48 h-8 text-xs"><SelectValue placeholder="All issue types" /></SelectTrigger><SelectContent><SelectItem value="all">All issue types</SelectItem><SelectItem value="device_owner_mismatch">Device owner mismatch</SelectItem><SelectItem value="missing_attribution">Missing attribution</SelectItem><SelectItem value="claimed_not_submitted">Claimed, not submitted</SelectItem><SelectItem value="not_covered">Not covered</SelectItem></SelectContent></Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="All statuses" /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="auto">Auto</SelectItem><SelectItem value="corrected">Corrected</SelectItem></SelectContent></Select>
        </div>
        {attributionError ? <Alert variant="destructive" className="m-4"><AlertDescription>Attribution report unavailable: {attributionError}. Refresh before continuing.</AlertDescription></Alert> : filteredAttribution.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No attribution evidence matches these filters.</p> : (
          <div className="overflow-x-auto max-h-[430px]"><table className="w-full text-xs"><thead className="sticky top-0 bg-muted"><tr>
            {['State / Site','Issue type','WFP raw device','WFP raw name','Claimed collector','Resolved official collector','Status / method','Action'].map(h => <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>)}
          </tr></thead><tbody>{filteredAttribution.map((r, i) => {
            const status = String(r.status ?? 'unresolved');
            return <tr key={r.id ?? `${r.site_id}-${i}`} className="border-t align-top">
              <td className="px-3 py-2"><span className="font-medium">{r.state ?? '—'}</span><br /><span className="text-muted-foreground">{r.site_name ?? r.site_id ?? '—'}</span></td>
              <td className="px-3 py-2"><span>{r.issue_type ?? '—'}</span>{r.exception_code && <span className="block mt-1 font-mono text-[10px] text-muted-foreground">{r.exception_code}</span>}</td><td className="px-3 py-2 font-mono">{r.wfp_raw_device_id ?? '—'}</td><td className="px-3 py-2">{r.wfp_raw_interviewer_name ?? '—'}</td>
              <td className="px-3 py-2">{r.claimed_collector_name ?? r.claimed_collector ?? '—'}</td><td className="px-3 py-2 font-medium">{r.resolved_collector_name ?? r.resolved_collector ?? '—'}</td>
              <td className="px-3 py-2"><Badge variant={isResolved(r) ? 'default' : 'destructive'}>{status}{r.method ? ` · ${r.method}` : ''}</Badge>{r.correction_reason && <p className="mt-1 max-w-48 text-[10px] leading-snug text-muted-foreground">{r.correction_reason}</p>}</td>
              <td className="px-3 py-2">{r.requires_attribution === true && !isResolved(r) && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCorrection(r)}>Correct</Button>}</td>
            </tr>;
          })}</tbody></table></div>
        )}
      </section>

      {/* Legend */}
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex gap-3">
        <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800 dark:text-blue-200">
          <p>
            <span className="inline-block w-3 h-3 bg-green-500 rounded-sm mr-1" />Green = owe money to enumerator &nbsp;
            <span className="inline-block w-3 h-3 bg-amber-400 rounded-sm mr-1" />Amber = balanced &nbsp;
            <span className="inline-block w-3 h-3 bg-red-500 rounded-sm mr-1" />Red = overpaid &nbsp;
            <span className="inline-block w-3 h-3 bg-blue-500 rounded-sm mr-1" />Blue = no advance taken
          </p>
        </div>
      </div>

      {/* ── Action required banner ── */}
      {(sitesToPay > 0 || sitesToRecover > 0) && (
        <div className="border-2 border-amber-300 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-800 dark:text-amber-200 text-sm">Finance pays only WFP-covered sites — complete payments in Field Payments Centre</p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                This step is a financial view only. Finance disburses fees exclusively for sites confirmed as covered by WFP (auto-matched or manually confirmed) — not-covered sites are never paid. Actual fee disbursements and advance recoveries are processed in Field Payments Centre, where Finance marks each payment with a receipt and the payment status updates automatically.
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5" dir="rtl">
                هذه الخطوة للمراجعة فقط. تدفع المالية أتعاب المواقع المؤكدة من برنامج الغذاء فقط — لا تُدفع المواقع غير المغطاة. تتم المدفوعات والاسترداد في مركز المدفوعات الميدانية.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {sitesToPay > 0 && (
              <Button
                type="button"
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white text-xs gap-1.5"
                onClick={() => navigate(fieldPaymentsUrl)}
                data-testid="button-go-to-field-payments-fees"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Pay {sitesToPay} enumerator{sitesToPay !== 1 ? 's' : ''} — Field Payments Centre (Fees)
              </Button>
            )}
            {sitesToRecover > 0 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="text-xs border-red-300 text-red-700 hover:bg-red-50 gap-1.5"
                onClick={() => navigate(recoveryUrl)}
                data-testid="button-go-to-field-payments-recovery"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Recover from {sitesToRecover} overpaid enumerator{sitesToRecover !== 1 ? 's' : ''} — Field Payments Centre (Recovery)
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Discrepancy warning */}
      {discrepancySites.length > 0 && (
        <Alert className="bg-amber-50 border-amber-300">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            <strong>Payment Discrepancy Alert:</strong> {discrepancySites.length} site{discrepancySites.length > 1 ? 's are' : ' is'} marked "Complete" in the system but rejected in WFP clean data. These sites are excluded from payment calculations. Confirm this is correct before closing.
          </AlertDescription>
        </Alert>
      )}

      {/* Reconciliation rows — read-only display */}
      <div className="space-y-3">
        {rows.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">No enumerator data found for this MMP.</div>
        )}
        {rows.map(row => (
          <div key={row.enumeratorId} className={`border rounded-lg p-4 space-y-2 ${rowColor(row)}`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <p className="font-semibold text-sm">{row.enumeratorName}</p>
                <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                  <span>Assigned: <strong>{row.sitesAssigned}</strong></span>
                  <span>WFP Confirmed: <strong className="text-green-700">{row.wfpConfirmed}</strong></span>
                  <span>Rejected: <strong className="text-red-600">{row.wfpRejected}</strong></span>
                  <span>Not Covered: <strong>{row.notCovered}</strong></span>
                </div>
              </div>
              <div className="text-right text-xs">
                <div className="flex gap-3 flex-wrap justify-end">
                  <div>Advance Paid: <strong>SDG {row.advancePaid.toLocaleString()}</strong></div>
                  <div>Transport Earned: <strong>SDG {row.transportEarned.toLocaleString()}</strong></div>
                  <div>Fees Earned: <strong>SDG {row.feesEarned.toLocaleString()}</strong></div>
                  <div>Total Earned: <strong>SDG {row.totalEarned.toLocaleString()}</strong></div>
                </div>
                <div className={`text-sm font-bold mt-1 ${row.netToPay > 0 ? 'text-green-700' : row.netToPay < 0 ? 'text-red-700' : 'text-amber-700'}`}>
                  Net to Pay: SDG {row.netToPay.toLocaleString()}
                </div>
              </div>
            </div>
            {/* Per-row action hint */}
            {row.rowType === 'green' && (
              <button
                type="button"
                onClick={() => navigate(fieldPaymentsUrl)}
                className="flex items-center gap-1 text-xs text-green-700 hover:text-green-900 hover:underline"
              >
                <ArrowRight className="h-3 w-3" />
                Pay balance (SDG {row.netToPay.toLocaleString()}) in Field Payments Centre → Fees tab
              </button>
            )}
            {row.rowType === 'blue' && (
              <button
                type="button"
                onClick={() => navigate(fieldPaymentsUrl)}
                className="flex items-center gap-1 text-xs text-blue-700 hover:text-blue-900 hover:underline"
              >
                <ArrowRight className="h-3 w-3" />
                Pay full amount (SDG {row.totalEarned.toLocaleString()}) in Field Payments Centre → Fees tab
              </button>
            )}
            {row.rowType === 'red' && (
              <button
                type="button"
                onClick={() => navigate(recoveryUrl)}
                className="flex items-center gap-1 text-xs text-red-700 hover:text-red-900 hover:underline"
              >
                <ArrowRight className="h-3 w-3" />
                Recover SDG {Math.abs(row.netToPay).toLocaleString()} in Field Payments Centre → Recovery tab
              </button>
            )}
          </div>
        ))}
      </div>

      {/* ── Finance Payment Queue (WFP-covered sites only) ── */}
      <div className="border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between gap-2 flex-wrap px-4 py-3 bg-muted/40 border-b">
          <div>
            <h3 className="font-semibold text-sm">Finance Payment Queue — WFP-Covered Sites</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Only sites confirmed as covered by WFP appear here. Finance pays these in Field Payments Centre; not-covered sites are excluded.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            className="bg-green-600 hover:bg-green-700 text-white text-xs gap-1.5"
            onClick={() => navigate(fieldPaymentsUrl)}
            data-testid="button-payment-queue-field-payments"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open Field Payments Centre (Fees)
          </Button>
        </div>
        {paymentQueue.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No WFP-covered sites to pay for this cycle.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Site</th>
                  <th className="px-3 py-2 text-left font-medium">Enumerator</th>
                  <th className="px-3 py-2 text-right font-medium">Enum. Fee</th>
                  <th className="px-3 py-2 text-right font-medium">Transport</th>
                  <th className="px-3 py-2 text-right font-medium">Total Fee</th>
                  <th className="px-3 py-2 text-right font-medium">Advance Offset</th>
                  <th className="px-3 py-2 text-right font-medium">Cash Outstanding</th>
                  <th className="px-3 py-2 text-left font-medium">Payment Status</th>
                  <th className="px-3 py-2 text-left font-medium">Receipt</th>
                  <th className="px-3 py-2 text-center font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {paymentQueue.map((q, i) => {
                  const paid = q.feePaidStatus.toLowerCase() === 'paid' || q.feePaidStatus.toLowerCase() === 'fully_paid';
                  const partial = q.feePaidStatus.toLowerCase() === 'partially_paid';
                  return (
                    <tr key={q.siteId} className={`border-t ${i % 2 === 0 ? '' : 'bg-muted/20'}`}>
                      <td className="px-3 py-1.5 font-medium">{q.siteName}</td>
                      <td className="px-3 py-1.5">{q.enumeratorName}</td>
                      <td className="px-3 py-1.5 text-right">SDG {q.enumeratorFee.toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-right">SDG {q.transportFee.toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-right font-medium">SDG {q.totalFee.toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-right">SDG {q.advanceOffset.toLocaleString()}</td>
                      <td className={`px-3 py-1.5 text-right font-semibold ${q.cashOutstanding > 0 ? 'text-amber-700' : 'text-muted-foreground'}`}>
                        SDG {q.cashOutstanding.toLocaleString()}
                      </td>
                      <td className="px-3 py-1.5">
                        <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded border ${
                          paid
                            ? 'bg-green-100 text-green-700 border-green-200'
                            : partial
                              ? 'bg-amber-100 text-amber-700 border-amber-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}>
                          {q.feePaidStatus}
                        </span>
                      </td>
                      <td className="px-3 py-1.5">
                        {q.receiptUrl ? (
                          <a
                            href={q.receiptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline inline-flex items-center gap-1"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {q.receiptReference ?? 'View'}
                          </a>
                        ) : q.receiptReference ? (
                          <span className="text-muted-foreground">{q.receiptReference}</span>
                        ) : (
                          <span className="text-muted-foreground/50 italic">—</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => navigate(fieldPaymentsUrl)}
                          className="text-primary hover:underline inline-flex items-center gap-1"
                          data-testid={`button-pay-site-${q.siteId}`}
                        >
                          <ArrowRight className="h-3 w-3" />
                          {paid ? 'View' : 'Pay'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {paymentQueue.length > 0 && (
          <div className="border-t px-4 py-2 bg-muted/20 text-[10px] text-muted-foreground">
            {paymentQueue.length} WFP-covered site{paymentQueue.length !== 1 ? 's' : ''} · payments processed in Field Payments Centre
          </div>
        )}
      </div>

      {/* Totals */}
      <div className="border rounded-lg p-4 bg-muted/30 space-y-2">
        <h3 className="font-semibold text-sm mb-3">Cycle Financial Totals</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          {[
            { label: 'Total Advances Paid', value: totalAdvances },
            { label: 'Total Earned (WFP-confirmed)', value: totalEarned },
            { label: 'Total to Pay Out', value: totalToPay },
            { label: 'Total to Recover', value: totalToRecover },
            { label: 'Net Cycle Cost', value: totalEarned - totalAdvances },
          ].map(item => (
            <div key={item.label} className="space-y-0.5">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="font-semibold">SDG {item.value.toLocaleString()}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between pt-4 border-t">
        <div className="flex flex-wrap items-center gap-2">
          {canGoBack && <Button type="button" variant="outline" size="sm" onClick={onBack} data-testid="button-back-step6">← Back</Button>}
          <Button type="button" variant="outline" size="sm" onClick={exportReconciliation} data-testid="button-export-reconciliation">
            <Download className="h-3.5 w-3.5 mr-1" />Reconciliation (Excel)
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={exportPaymentRunSheet} data-testid="button-export-payment-run">
            <Download className="h-3.5 w-3.5 mr-1" />Payment Run Sheet
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={exportFinancialSummaryPDF} data-testid="button-export-financial-pdf">
            <Download className="h-3.5 w-3.5 mr-1" />Financial Summary (PDF)
          </Button>
        </div>
        <Button type="button" onClick={onNext} data-testid="button-next-step6">
          Next: Final Review &amp; Close →
        </Button>
      </div>
      <Dialog open={!!correction} onOpenChange={open => !open && setCorrection(null)}>
        <DialogContent><DialogHeader><DialogTitle>Correct collection attribution</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2"><p className="text-sm text-muted-foreground">Select the official field user. The final name is sourced from the profile directory, not the WFP file.</p>
            <Select value={selectedUser} onValueChange={setSelectedUser}><SelectTrigger><SelectValue placeholder="Choose official field user" /></SelectTrigger><SelectContent>{users.map(u => <SelectItem key={u.id ?? u.user_id} value={String(u.id ?? u.user_id)}>{u.full_name ?? u.name ?? u.email}</SelectItem>)}</SelectContent></Select>
            <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Required reason for correction (minimum 10 characters)" rows={4} />
          </div><DialogFooter><Button variant="outline" onClick={() => setCorrection(null)}>Cancel</Button><Button onClick={saveCorrection} disabled={!selectedUser || reason.trim().length < 10 || correctionSaving}>{correctionSaving ? 'Saving…' : 'Save correction'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
