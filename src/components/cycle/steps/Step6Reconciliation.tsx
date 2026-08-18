
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Download, Info, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { WizardState } from '../CycleCloseWizard';
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

export default function Step6Reconciliation({ wizardState, updateWizardState, onNext, onBack, canGoBack, canOverride, currentUser }: Props) {
  const [rows, setRows] = useState<EnumRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [writeoffDialog, setWriteoffDialog] = useState<{ open: boolean; enumId: string; name: string } | null>(null);
  const [writeoffJustification, setWriteoffJustification] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (wizardState.selectedMmpId) buildReconciliation();
  }, [wizardState.selectedMmpId]);

  const buildReconciliation = async () => {
    setLoading(true);

    // Fetch entries with per-site fee columns and all enumerator-linkage columns.
    // transport_fee / enumerator_fee live on each entry row, not on mmp_files.
    // Enumerator linkage may be accepted_by, claimed_by, or visit_started_by (UUID).
    // Do NOT join profiles!accepted_by — there is no FK constraint; do a separate lookup.
    const { data: entries } = await supabase
      .from('mmp_site_entries')
      .select(
        'id, accepted_by, claimed_by, visit_started_by, status, transport_fee, enumerator_fee, additional_data'
      )
      .eq('mmp_file_id', wizardState.selectedMmpId!);

    const notCoveredIds = new Set(Object.keys(wizardState.uncoveredReasons));
    const confirmedMatchIds = new Set(
      wizardState.matchResults
        .filter(r => r.status === 'auto' || r.action === 'confirm')
        .map(r => r.matchedSiteId)
        .filter(Boolean) as string[]
    );

    // Pick the best available enumerator UUID per entry
    const resolveEnumId = (e: any): string | null =>
      e.accepted_by || e.claimed_by || e.visit_started_by || null;

    // Group by enumerator (name resolved below after profile lookup)
    const byEnum: Record<string, { name: string; entries: any[] }> = {};
    for (const e of (entries ?? [])) {
      const id = resolveEnumId(e);
      if (!id) continue;
      // Fallback name from additional_data text fields
      const ad = (e as any).additional_data ?? {};
      const adName = ad.collector_name || ad.accepted_by_name || ad.enumerator_name ||
                     ad.data_collector_name || ad.collectorName || 'Unknown';
      if (!byEnum[id]) byEnum[id] = { name: adName, entries: [] };
      byEnum[id].entries.push(e);
    }

    // Resolve profile names for all enumerator UUIDs in one batch
    // ── Profiles + advances in parallel (were sequential) ────────────────────
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

      // Earnings are computed from per-site fees of WFP-confirmed sites only
      const confirmedEntries = data.entries.filter(e => confirmedMatchIds.has(e.id));
      const wfpConfirmed = confirmedEntries.length;
      const wfpRejected = data.entries.filter(e =>
        wizardState.matchResults.some(r => r.matchedSiteId === e.id && r.action === 'reject')
      ).length;
      const notCoveredCount = data.entries.filter(e => notCoveredIds.has(e.id)).length;

      const advancePaid = advanceByEnum[enumId] ?? 0;

      // Sum per-site transport and enumerator fees for confirmed sites
      const transportEarned = confirmedEntries.reduce((s, e) => s + (Number(e.transport_fee) || 0), 0);
      const feesEarned      = confirmedEntries.reduce((s, e) => s + (Number(e.enumerator_fee) || 0), 0);
      const totalEarned     = transportEarned + feesEarned;
      const netToPay        = totalEarned - advancePaid;

      // Representative rates (shown in UI for reference; may vary per site)
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
        paymentDone: !!wizardState.paymentActions[enumId]?.done,
      };
    });

    setRows(tableRows);
    setLoading(false);
  };

  const handleGeneratePayment = async (row: EnumRow, type: 'balance' | 'full') => {
    setSaving(true);
    await supabase.from('mmp_payment_records').insert({
      mmp_file_id: wizardState.selectedMmpId,
      enumerator_id: row.enumeratorId,
      transport_amount: row.transportEarned,
      fee_amount: row.feesEarned,
      net_amount: type === 'full' ? row.totalEarned : row.netToPay,
      payment_type: type,
      created_by: currentUser?.id,
      status: 'pending',
    }).select().maybeSingle();
    updateWizardState({
      paymentActions: { ...wizardState.paymentActions, [row.enumeratorId]: { action: 'pay', done: true } },
    });
    setRows(prev => prev.map(r => r.enumeratorId === row.enumeratorId ? { ...r, paymentDone: true } : r));
    setSaving(false);
  };

  const handleScheduleRecovery = async (row: EnumRow) => {
    setSaving(true);
    await supabase.from('mmp_payment_records').insert({
      mmp_file_id: wizardState.selectedMmpId,
      enumerator_id: row.enumeratorId,
      net_amount: Math.abs(row.netToPay),
      payment_type: 'recovery',
      created_by: currentUser?.id,
      status: 'pending_recovery',
    });
    updateWizardState({
      paymentActions: { ...wizardState.paymentActions, [row.enumeratorId]: { action: 'recover', done: true } },
    });
    setRows(prev => prev.map(r => r.enumeratorId === row.enumeratorId ? { ...r, paymentDone: true } : r));
    setSaving(false);
  };

  const handleWriteoff = async () => {
    if (!writeoffDialog || writeoffJustification.length < 10) return;
    setSaving(true);
    await supabase.from('mmp_payment_records').insert({
      mmp_file_id: wizardState.selectedMmpId,
      enumerator_id: writeoffDialog.enumId,
      payment_type: 'writeoff',
      writeoff_justification: writeoffJustification,
      writeoff_by: currentUser?.id,
      status: 'written_off',
    });
    updateWizardState({
      paymentActions: { ...wizardState.paymentActions, [writeoffDialog.enumId]: { action: 'writeoff', done: true } },
    });
    setRows(prev => prev.map(r => r.enumeratorId === writeoffDialog.enumId ? { ...r, paymentDone: true } : r));
    setSaving(false);
    setWriteoffDialog(null);
    setWriteoffJustification('');
  };

  const exportReconciliation = () => {
    void exportFormattedReconciliation(rows, wizardState);
  };

  const exportPaymentRunSheet = () => {
    void exportFormattedPaymentRun(rows, wizardState);
  };

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

  const totalAdvances = rows.reduce((s, r) => s + r.advancePaid, 0);
  const totalEarned = rows.reduce((s, r) => s + r.totalEarned, 0);
  const totalToPay = rows.filter(r => r.netToPay > 0).reduce((s, r) => s + r.netToPay, 0);
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
        <p className="text-muted-foreground text-sm">One row per enumerator. Review earnings vs. advances and generate payments or recoveries.</p>
      </div>

      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex gap-3">
        <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800 dark:text-blue-200">
          <p><span className="inline-block w-3 h-3 bg-green-500 rounded-sm mr-1" />Green = owe money to enumerator &nbsp;
          <span className="inline-block w-3 h-3 bg-amber-400 rounded-sm mr-1" />Amber = balanced &nbsp;
          <span className="inline-block w-3 h-3 bg-red-500 rounded-sm mr-1" />Red = overpaid &nbsp;
          <span className="inline-block w-3 h-3 bg-blue-500 rounded-sm mr-1" />Blue = no advance taken</p>
        </div>
      </div>

      {/* Discrepancy warning */}
      {discrepancySites.length > 0 && (
        <Alert className="bg-amber-50 border-amber-300">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            <strong>Payment Discrepancy Alert:</strong> {discrepancySites.length} site{discrepancySites.length > 1 ? 's are' : ' is'} marked "Complete" in the system but rejected in WFP clean data. These sites are excluded from payment calculations. Confirm this is correct before closing.
          </AlertDescription>
        </Alert>
      )}

      {/* Reconciliation table */}
      <div className="space-y-3">
        {rows.map(row => (
          <div key={row.enumeratorId} className={`border rounded-lg p-4 space-y-3 ${rowColor(row)}`}>
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

            {row.paymentDone ? (
              <div className="flex items-center gap-1.5 text-xs text-green-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Action recorded — sent to finance queue
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(row.rowType === 'green') && (
                  <Button type="button" size="sm" className="bg-green-600 hover:bg-green-700 text-white text-xs" onClick={() => handleGeneratePayment(row, 'balance')} disabled={saving} data-testid={`button-generate-payment-${row.enumeratorId}`}>
                    Generate Payment (SDG {row.netToPay.toLocaleString()})
                  </Button>
                )}
                {row.rowType === 'blue' && (
                  <Button type="button" size="sm" className="bg-blue-600 hover:bg-blue-700 text-white text-xs" onClick={() => handleGeneratePayment(row, 'full')} disabled={saving} data-testid={`button-generate-full-payment-${row.enumeratorId}`}>
                    Generate Full Payment — Transport SDG {row.transportEarned.toLocaleString()} + Fees SDG {row.feesEarned.toLocaleString()}
                  </Button>
                )}
                {row.rowType === 'red' && (
                  <>
                    <Button type="button" size="sm" variant="outline" className="text-xs border-red-300 text-red-700 hover:bg-red-50" onClick={() => handleScheduleRecovery(row)} disabled={saving} data-testid={`button-schedule-recovery-${row.enumeratorId}`}>
                      Schedule Recovery (SDG {Math.abs(row.netToPay).toLocaleString()})
                    </Button>
                    {canOverride && (
                      <Button type="button" size="sm" variant="outline" className="text-xs border-slate-300" onClick={() => setWriteoffDialog({ open: true, enumId: row.enumeratorId, name: row.enumeratorName })} data-testid={`button-writeoff-${row.enumeratorId}`}>
                        Write-Off
                      </Button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        ))}
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

      {/* Write-off dialog */}
      <Dialog open={!!writeoffDialog?.open} onOpenChange={() => setWriteoffDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Write-Off Overpayment — {writeoffDialog?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Textarea
              placeholder="Justification for write-off (required, min 10 characters)…"
              value={writeoffJustification}
              onChange={e => setWriteoffJustification(e.target.value)}
              rows={3}
              data-testid="input-writeoff-justification-step6"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setWriteoffDialog(null)}>Cancel</Button>
            <Button type="button" onClick={handleWriteoff} disabled={writeoffJustification.length < 10 || saving} className="bg-red-600 hover:bg-red-700 text-white" data-testid="button-confirm-writeoff-step6">
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Confirm Write-Off
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-between pt-4 border-t">
        <div className="flex flex-wrap items-center gap-2">
          {canGoBack && <Button type="button" variant="outline" size="sm" onClick={onBack} data-testid="button-back-step6">← Back</Button>}
          <Button type="button" variant="outline" size="sm" onClick={exportReconciliation} data-testid="button-export-reconciliation"><Download className="h-3.5 w-3.5 mr-1" />Reconciliation (Excel)</Button>
          <Button type="button" variant="outline" size="sm" onClick={exportPaymentRunSheet} data-testid="button-export-payment-run"><Download className="h-3.5 w-3.5 mr-1" />Payment Run Sheet</Button>
          <Button type="button" variant="outline" size="sm" onClick={exportFinancialSummaryPDF} data-testid="button-export-financial-pdf"><Download className="h-3.5 w-3.5 mr-1" />Financial Summary (PDF)</Button>
        </div>
        <Button type="button" onClick={onNext} data-testid="button-next-step6">Next: Final Review & Close →</Button>
      </div>
    </div>
  );
}
