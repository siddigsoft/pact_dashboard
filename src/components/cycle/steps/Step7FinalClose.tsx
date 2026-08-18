
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  CheckCircle2, XCircle, AlertTriangle, ArrowRight, Download,
  Archive, Loader2, Info, ExternalLink,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { WizardState } from '../CycleCloseWizard';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { exportCycleCloseWorkbook, type CheckResult } from '@/utils/cycleCloseExport';

interface CheckItem {
  id: number;
  label: string;
  description: string;
  jumpStep: number;
  passes: boolean;
}

interface Props {
  wizardState: WizardState;
  updateWizardState: (patch: Partial<WizardState>) => void;
  onNext?: () => void;
  onBack: () => void;
  canGoBack: boolean;
  canOverride: boolean;
  currentUser: any;
  goToStep?: (step: number) => void;
}

export default function Step7FinalClose({ wizardState, updateWizardState, onBack, canGoBack, canOverride, currentUser, goToStep }: Props) {
  const navigate = useNavigate();
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [closingDialog, setClosingDialog] = useState(false);
  const [closing, setClosing] = useState(false);
  const [overrideTargetId, setOverrideTargetId] = useState<number | null>(null);
  const [overrideJustification, setOverrideJustification] = useState('');
  const [savingOverride, setSavingOverride] = useState(false);

  // ── Incentive snapshot guard ─────────────────────────────────────────────
  // 'loading' | 'missing' | 'pre_approved' | 'approved' | 'paid' | 'skipped'
  const [incentiveStatus, setIncentiveStatus] = useState<string>('loading');
  const [incentiveConfirmText, setIncentiveConfirmText] = useState('');

  useEffect(() => {
    const mmpId = wizardState.selectedMmpId;
    if (!mmpId) return;
    supabase
      .from('mmp_incentive_snapshots')
      .select('id, status, skipped')
      .eq('mmp_id', mmpId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) { setIncentiveStatus('missing'); return; }
        setIncentiveStatus(data.skipped ? 'skipped' : data.status);
      });
  }, [wizardState.selectedMmpId]);

  const matchResults = wizardState.matchResults;
  const hasFile = matchResults.length > 0;
  const allMatchesResolved = !matchResults.some(r => r.status === 'review');

  // Step 3: no resubmit-pending sites
  const allSitesResolved = Object.values(wizardState.resolvedSites).every(v => v !== 'resubmit');

  // Step 4: every site from all three uncovered sources must have a reason
  const allNotCoveredIds = new Set<string>([
    ...matchResults
      .filter(r => r.action === 'reject' || r.status === 'unmatched')
      .map(r => r.matchedSiteId).filter(Boolean) as string[],
    ...Object.keys(wizardState.resolvedSites)
      .filter(k => wizardState.resolvedSites[k] === 'not_covered'),
    ...(wizardState.unmatchedMmpSiteIds ?? []),
  ]);
  const allReasonsAssigned = [...allNotCoveredIds].every(id => !!wizardState.uncoveredReasons[id]?.reason);

  const allExceptionsDecided = Object.keys(wizardState.exceptionDecisions).every(k => !!wizardState.exceptionDecisions[k]?.decision);

  // Step 6: no payment action may still be pending (all must be marked done, or no actions started = no advances)
  const anyPendingPayments = Object.values(wizardState.paymentActions).some(a => !a.done);
  const hasPaymentActions = !anyPendingPayments;

  const checks: CheckItem[] = [
    { id: 1, label: 'Clean data uploaded & applied', description: 'WFP file matched and applied', jumpStep: 2, passes: hasFile },
    { id: 2, label: 'All matches resolved', description: 'No "needs review" rows remaining', jumpStep: 2, passes: allMatchesResolved },
    { id: 3, label: 'All sites resolved', description: 'Every site is WFP-confirmed / Not-covered / Overridden', jumpStep: 3, passes: allSitesResolved },
    { id: 4, label: 'Not-covered reasons assigned', description: 'Every not-covered site has a reason', jumpStep: 4, passes: allReasonsAssigned },
    { id: 5, label: 'All exceptions decided', description: 'Every advance on not-covered site has a decision', jumpStep: 5, passes: allExceptionsDecided },
    { id: 6, label: 'All enumerators reconciled', description: 'Every enumerator has a settlement status', jumpStep: 6, passes: hasPaymentActions },
    { id: 7, label: 'No pending cost submissions', description: 'Manually verify all operational cost submissions are approved/rejected before closing', jumpStep: 1, passes: true },
    // Note: check 7 is not auto-computed (requires a separate DB query the wizard doesn't cache).
    // FOM must verify manually; the override mechanism exists if it's acceptable to close with pending submissions.
  ];

  const allPassed = checks.every(c => c.passes || !!wizardState.overrides[c.id]);
  const blockedChecks = checks.filter(c => !c.passes && !wizardState.overrides[c.id]);

  const totalSites = matchResults.length;
  const confirmedSites = matchResults.filter(r => r.status === 'auto' || r.action === 'confirm').length;
  const notCoveredCount = allNotCoveredIds.size;

  const handleOverride = async () => {
    if (overrideTargetId === null || overrideJustification.length < 20) return;
    setSavingOverride(true);
    const override = {
      justification: overrideJustification,
      by: currentUser?.full_name ?? 'User',
      at: new Date().toISOString(),
    };
    updateWizardState({ overrides: { ...wizardState.overrides, [overrideTargetId]: override } });
    setSavingOverride(false);
    setOverrideTargetId(null);
    setOverrideJustification('');
  };

  // ── Execute exception decisions against the DB ─────────────────────────────
  // Called once after the MMP is atomically closed.
  // Immediate: cancel → status='cancelled', reduce → update requested_amount,
  //            reassign → update mmp_site_entry_id
  // Deferred:  roll / hold → inserted into cycle_exception_actions, executed=false
  //            (Finance completes via /cycle-exceptions/rollover)
  // All decisions → inserted into cycle_exception_actions for audit.
  const executeExceptionDecisions = async () => {
    const decisions = wizardState.exceptionDecisions;
    const siteIds = Object.keys(decisions);
    if (!siteIds.length) return;

    // Re-fetch site data + advances for all exception sites
    const [{ data: siteRows }, { data: advances }] = await Promise.all([
      supabase
        .from('mmp_site_entries')
        .select('id, site_name, accepted_by')
        .in('id', siteIds),
      supabase
        .from('down_payment_requests')
        .select('id, mmp_site_entry_id, total_paid_amount, requested_amount, status')
        .in('mmp_site_entry_id', siteIds)
        .in('status', ['approved', 'paid', 'partially_paid', 'fully_paid']),
    ]);

    // Build site → advance map (best paid record per site)
    const advBySite: Record<string, { id: string; paid: number; requested: number; status: string }> = {};
    for (const a of (advances ?? []) as any[]) {
      const sid = a.mmp_site_entry_id as string;
      const paid = (a.total_paid_amount as number) ?? 0;
      if (!advBySite[sid] || paid > advBySite[sid].paid) {
        advBySite[sid] = { id: a.id, paid, requested: a.requested_amount ?? 0, status: a.status };
      }
    }

    // Fetch enumerator names
    const enumUuids = [...new Set((siteRows ?? []).map((s: any) => s.accepted_by).filter(Boolean))];
    const nameMap: Record<string, string> = {};
    if (enumUuids.length) {
      const { data: profiles } = await supabase
        .from('profiles').select('id, full_name').in('id', enumUuids);
      for (const p of (profiles ?? [])) { if ((p as any).full_name) nameMap[(p as any).id] = (p as any).full_name; }
    }

    const siteMap: Record<string, any> = {};
    for (const s of (siteRows ?? []) as any[]) { siteMap[s.id] = s; }

    // Execute immediate decisions + collect all for audit insert
    const auditRows: any[] = [];
    for (const [siteId, dec] of Object.entries(decisions)) {
      const site = siteMap[siteId];
      const adv  = advBySite[siteId];
      const isImmediate = ['cancel', 'reduce', 'reassign'].includes(dec.decision);
      const isDeferred  = ['roll', 'hold'].includes(dec.decision);

      // ── Immediate DB writes ──
      if (adv?.id) {
        if (dec.decision === 'cancel') {
          await supabase
            .from('down_payment_requests')
            .update({ status: 'cancelled' })
            .eq('id', adv.id);
        } else if (dec.decision === 'reduce' && (dec.amount ?? 0) > 0) {
          await supabase
            .from('down_payment_requests')
            .update({ requested_amount: dec.amount })
            .eq('id', adv.id);
        } else if (dec.decision === 'reassign' && dec.targetSiteId) {
          await supabase
            .from('down_payment_requests')
            .update({ mmp_site_entry_id: dec.targetSiteId })
            .eq('id', adv.id);
        }
      }

      auditRows.push({
        mmp_file_id:        wizardState.selectedMmpId,
        mmp_site_entry_id:  siteId,
        advance_id:         adv?.id ?? null,
        enumerator_id:      site?.accepted_by ?? null,
        enumerator_name:    nameMap[site?.accepted_by] ?? null,
        site_name:          site?.site_name ?? null,
        advance_amount:     adv ? (adv.paid > 0 ? adv.paid : adv.requested) : 0,
        advance_status:     adv?.status ?? null,
        decision:           dec.decision,
        decision_amount:    dec.amount ?? null,
        justification:      dec.justification ?? null,
        target_site_id:     dec.targetSiteId ?? null,
        executed:           isImmediate, // immediate = done; deferred = false
        executed_at:        isImmediate ? new Date().toISOString() : null,
        executed_by_name:   isImmediate ? (currentUser?.full_name ?? null) : null,
        execution_note:     isImmediate ? `Auto-executed at cycle close` : null,
        created_by_name:    currentUser?.full_name ?? null,
      });
    }

    if (auditRows.length) {
      const { error: insErr } = await supabase
        .from('cycle_exception_actions')
        .insert(auditRows);
      if (insErr) console.error('cycle_exception_actions insert error:', insErr);
    }

    // Return count of deferred (roll/hold) actions for UX feedback
    return auditRows.filter(r => !r.executed).length;
  };

  const generateCycleCloseReports = async () => {
    const cname = wizardState.selectedMmp?.name ?? 'cycle';

    // ── PDF summary (kept as official one-page signed record) ────────────────
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('PACT Cycle Close — Official Record', 14, 20);
    doc.setFontSize(11);
    doc.text(`Cycle: ${wizardState.selectedMmp?.name ?? ''}`, 14, 32);
    doc.text(`Closed by: ${currentUser?.full_name ?? 'User'} on ${new Date().toLocaleString()}`, 14, 40);
    doc.text(`Sites: ${confirmedSites} confirmed, ${allNotCoveredIds.size} not covered (of ${totalSites} total)`, 14, 48);
    (autoTable as any)(doc, {
      startY: 58,
      head: [['Check', 'Status', 'Override?']],
      body: checks.map(c => [
        c.label,
        c.passes ? '✅ Passed' : '❌ Failed',
        wizardState.overrides[c.id] ? `Override by ${wizardState.overrides[c.id].by}` : '',
      ]),
    });
    if (Object.keys(wizardState.overrides).length > 0) {
      const finalY = (doc as any).lastAutoTable.finalY + 10;
      doc.setFontSize(13);
      doc.text('Override Log', 14, finalY);
      (autoTable as any)(doc, {
        startY: finalY + 5,
        head: [['Check', 'By', 'When', 'Justification']],
        body: Object.entries(wizardState.overrides).map(([id, ov]) => [
          checks.find(c => c.id === Number(id))?.label ?? id,
          ov.by, new Date(ov.at).toLocaleString(), ov.justification,
        ]),
      });
    }
    doc.save(`cycle-close-official-${cname}.pdf`);

    // ── Formatted multi-sheet Excel workbook (all stages + advances) ─────────
    const checkResults: CheckResult[] = checks.map(c => ({
      id: c.id,
      label: c.label,
      passes: c.passes,
      override: wizardState.overrides[c.id],
    }));
    await exportCycleCloseWorkbook(wizardState, currentUser, checkResults);
  };

  const handleCloseCycle = async () => {
    if (!allPassed || !confirmChecked) return;
    // If no pre-approved snapshot, require the admin to have typed CONFIRM
    if (incentiveStatus === 'missing' && incentiveConfirmText.trim() !== 'CONFIRM') return;
    setClosing(true);
    try {
      // close_mmp_and_lock_incentives is a SECURITY DEFINER RPC that atomically:
      //   1. Updates mmp_files (status → closed)
      //   2. Locks any pre_approved snapshot → approved, OR inserts a skipped
      //      record if no snapshot exists — preventing retroactive pre-approval.
      // SECURITY DEFINER bypasses RLS so FOM/Admin/SuperAdmin can all call it
      // without needing direct write access to mmp_incentive_snapshots.
      const skipReason = incentiveStatus === 'missing'
        ? 'Cycle closed without incentive pre-approval (admin confirmed).'
        : undefined;

      // closed_by is derived server-side from auth.uid() — we do NOT pass it as
      // a parameter, preventing any client-side spoofing of the audit trail.
      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        'close_mmp_and_lock_incentives',
        {
          p_mmp_id:      wizardState.selectedMmpId!,
          p_skip_reason: skipReason ?? null,
        }
      );

      if (rpcError) {
        console.error('Cycle close RPC error:', rpcError);
        alert(`Failed to close cycle: ${rpcError.message}\n\nThe cycle has NOT been marked closed. Please try again.`);
        setClosing(false);
        return;
      }

      const result = rpcResult as { ok: boolean; closed_at?: string; error?: string } | null;
      if (!result?.ok) {
        const msg = result?.error ?? 'Unknown error from close_mmp_and_lock_incentives';
        console.error('Cycle close RPC returned failure:', msg);
        alert(`Failed to close cycle: ${msg}\n\nThe cycle has NOT been marked closed. Please try again.`);
        setClosing(false);
        return;
      }

      const closedAt = result.closed_at ?? new Date().toISOString();

      // Execute exception decisions (cancel/reduce/reassign immediately;
      // roll/hold inserted into cycle_exception_actions for the rollover page)
      const pendingRollovers = await executeExceptionDecisions();

      // Reports generated after confirmed atomic DB write
      await generateCycleCloseReports();
      updateWizardState({ cycleClosedAt: closedAt });

      if ((pendingRollovers ?? 0) > 0) {
        console.info(`[CycleClose] ${pendingRollovers} deferred rollover actions pending — visible at /cycle-exceptions/rollover`);
      }
    } catch (err: any) {
      console.error('Unexpected error closing cycle:', err);
      alert(`An unexpected error occurred: ${err?.message ?? err}\n\nPlease check the cycle status before retrying.`);
    } finally {
      setClosing(false);
      setClosingDialog(false);
    }
  };

  const isClosed = !!wizardState.cycleClosedAt;

  if (isClosed) {
    const allDecisions = Object.values(wizardState.exceptionDecisions);
    // Roll / Hold → Rollover Tracker
    const rolloverCount = allDecisions.filter(d => d.decision === 'roll' || d.decision === 'hold').length;
    // Write-off / Return / Redirect → Resolution Centre
    const resolutionCount = allDecisions.filter(d =>
      d.decision === 'writeoff' || d.decision === 'return' || d.decision === 'redirect'
    ).length;
    // Immediate (cancel/reduce/reassign) — already done, no follow-up needed
    const immediateCount = allDecisions.filter(d =>
      d.decision === 'cancel' || d.decision === 'reduce' || d.decision === 'reassign'
    ).length;

    return (
      <div className="max-w-2xl mx-auto p-6 space-y-6 text-center">
        <div className="flex flex-col items-center gap-4 py-8">
          <CheckCircle2 className="h-16 w-16 text-green-600" />
          <h2 className="text-2xl font-bold text-green-700">Cycle Closed Successfully</h2>
          <p className="text-sm text-green-600 mt-0.5" dir="rtl">تم إغلاق الدورة بنجاح</p>
          <p className="text-muted-foreground">
            {wizardState.selectedMmp?.name} was closed on {new Date(wizardState.cycleClosedAt!).toLocaleString()}.
          </p>
          <p className="text-sm text-muted-foreground">
            The official Cycle Close PDF and Excel workbook have been downloaded automatically.
          </p>
        </div>

        {/* ── Summary of all exception decisions ─────────────────────────── */}
        {allDecisions.length > 0 && (
          <div className="text-left border rounded-lg divide-y overflow-hidden">
            <div className="bg-muted/40 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Exception Decision Summary
            </div>
            {immediateCount > 0 && (
              <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-green-700">✅ Executed immediately at close</span>
                <span className="font-semibold">{immediateCount} advance{immediateCount > 1 ? 's' : ''}</span>
              </div>
            )}
            {rolloverCount > 0 && (
              <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-blue-700">📋 Pending — rollover / hold</span>
                <span className="font-semibold">{rolloverCount} advance{rolloverCount > 1 ? 's' : ''}</span>
              </div>
            )}
            {resolutionCount > 0 && (
              <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-amber-700">⚠️ Pending — write-off / return / redirect</span>
                <span className="font-semibold">{resolutionCount} advance{resolutionCount > 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Banner 1: Roll / Hold → Rollover Tracker ───────────────────── */}
        {rolloverCount > 0 && (
          <div className="text-left border border-blue-300 bg-blue-50 dark:bg-blue-950/30 rounded-lg p-4 text-sm space-y-2">
            <p className="font-semibold text-blue-800 dark:text-blue-200">
              📋 {rolloverCount} rollover action{rolloverCount > 1 ? 's' : ''} pending Finance follow-up
            </p>
            <p className="text-blue-700 dark:text-blue-300">
              {rolloverCount} exception{rolloverCount > 1 ? 's were' : ' was'} marked "Roll to Next MMP" or "Hold".
              Finance must link each advance to the enumerator's confirmed site in the target cycle.
            </p>
            <p dir="rtl" className="text-xs text-blue-700 dark:text-blue-400">
              {rolloverCount} استثناء محدد كـ "رحّل للدورة التالية" أو "تعليق". يجب على المالية إتمام الترحيل.
            </p>
            <Button
              type="button"
              className="bg-blue-600 hover:bg-blue-700 text-white mt-1"
              onClick={() => navigate('/cycle-exceptions/rollover')}
              data-testid="button-go-to-rollover"
            >
              <ExternalLink className="h-4 w-4 mr-1.5" />
              Open Exception Rollover Tracker
            </Button>
          </div>
        )}

        {/* ── Banner 2: Write-off / Return / Redirect → Resolution Centre ── */}
        {resolutionCount > 0 && (
          <div className="text-left border border-amber-300 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-4 text-sm space-y-2">
            <p className="font-semibold text-amber-800 dark:text-amber-200">
              ⚠️ {resolutionCount} resolution action{resolutionCount > 1 ? 's' : ''} require Finance action
            </p>
            <p className="text-amber-700 dark:text-amber-300">
              {resolutionCount} exception{resolutionCount > 1 ? 's were' : ' was'} marked for
              {' '}
              {[
                allDecisions.some(d => d.decision === 'writeoff') && 'Write-Off',
                allDecisions.some(d => d.decision === 'return')   && 'Return Collection',
                allDecisions.some(d => d.decision === 'redirect') && 'Project Redirect',
              ].filter(Boolean).join(' / ')}.
              Finance must complete each action in the Resolution Centre.
            </p>
            <p dir="rtl" className="text-xs text-amber-700 dark:text-amber-400">
              {resolutionCount} استثناء يتطلب إجراءً من المالية (شطب / استرداد / إعادة توجيه).
            </p>
            <Button
              type="button"
              className="bg-amber-600 hover:bg-amber-700 text-white mt-1"
              onClick={() => navigate('/cycle-exceptions/resolution')}
              data-testid="button-go-to-resolution"
            >
              <ExternalLink className="h-4 w-4 mr-1.5" />
              Open Exception Resolution Centre
            </Button>
          </div>
        )}

        <div className="flex flex-col items-center gap-2">
          <Button type="button" onClick={generateCycleCloseReports} variant="outline" data-testid="button-re-download-reports">
            <Download className="h-4 w-4 mr-1.5" />
            Download Reports Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Step 7 — Final Review &amp; Close</h2>
        <p className="text-sm text-muted-foreground mt-0.5" dir="rtl">الخطوة ٧ — المراجعة النهائية وإغلاق الدورة</p>
        <p className="text-muted-foreground text-sm">All 7 checks must pass before the cycle can be closed. FOM/Admin can override any failed check with justification.</p>
      </div>

      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex gap-3">
        <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800 dark:text-blue-200">
          <p>Click <strong>"Fix it"</strong> on any failing check to jump directly to the relevant step. FOM/Admin can override with a written justification (minimum 20 characters).</p>
        </div>
      </div>

      {/* Readiness checklist */}
      <div className="space-y-2">
        {checks.map(check => {
          const overridden = !!wizardState.overrides[check.id];
          const status = check.passes ? 'pass' : overridden ? 'override' : 'fail';
          return (
            <div key={check.id} className={`border rounded-lg p-4 flex items-center gap-3
              ${status === 'pass' ? 'bg-green-50 dark:bg-green-950/20 border-green-200' :
                status === 'override' ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200' :
                'bg-red-50 dark:bg-red-950/20 border-red-200'}`}>
              <div className="flex-shrink-0">
                {status === 'pass' && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                {status === 'override' && <AlertTriangle className="h-5 w-5 text-amber-600" />}
                {status === 'fail' && <XCircle className="h-5 w-5 text-red-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{check.id}. {check.label}</p>
                  {status === 'override' && (
                    <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-xs">
                      Overridden by {wizardState.overrides[check.id]?.by}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{check.description}</p>
                {status === 'override' && (
                  <p className="text-xs text-amber-700 mt-0.5">"{wizardState.overrides[check.id]?.justification}"</p>
                )}
              </div>
              {status === 'fail' && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button type="button" size="sm" variant="outline" className="text-xs h-7 flex items-center gap-1" onClick={() => goToStep?.(check.jumpStep)} data-testid={`button-fixit-${check.id}`}>
                    Fix it <ArrowRight className="h-3 w-3" />
                  </Button>
                  {canOverride && (
                    <Button type="button" size="sm" variant="outline" className="text-xs h-7 border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => setOverrideTargetId(check.id)} data-testid={`button-override-check-${check.id}`}>
                      Override
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {blockedChecks.length > 0 && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>
            {blockedChecks.length} check{blockedChecks.length > 1 ? 's' : ''} must pass or be overridden before closing: {blockedChecks.map(c => c.label).join(', ')}.
          </AlertDescription>
        </Alert>
      )}

      {/* Incentive pre-approval warning — shown when no snapshot exists */}
      {allPassed && incentiveStatus === 'missing' && (
        <div className="border-2 border-amber-400 rounded-lg p-4 space-y-3 bg-amber-50/30">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <p className="font-semibold text-amber-700 text-sm">Incentive bonuses have not been pre-approved</p>
          </div>
          <p className="text-xs text-amber-700">
            No incentive snapshot was pre-approved for this MMP. Closing without pre-approval means incentive bonuses cannot be paid for this cycle. If this is intentional, type <strong>CONFIRM</strong> below to proceed without incentives.
          </p>
          <input
            type="text"
            placeholder="Type CONFIRM to close without incentives"
            value={incentiveConfirmText}
            onChange={e => setIncentiveConfirmText(e.target.value)}
            className="w-full border border-amber-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            data-testid="input-incentive-confirm"
          />
        </div>
      )}

      {allPassed && (
        <div className="border-2 border-green-400 rounded-lg p-4 space-y-3 bg-green-50/30">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <p className="font-semibold text-green-700 text-sm">All checks passed — cycle is ready to close</p>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id="confirm-close"
              checked={confirmChecked}
              onCheckedChange={v => setConfirmChecked(!!v)}
              data-testid="checkbox-confirm-close"
            />
            <label htmlFor="confirm-close" className="text-sm cursor-pointer">
              I confirm this cycle is ready to close. I understand this action will be permanent and notifications will be sent to FOM, Finance, and Admin.
            </label>
          </div>
          <Button
            type="button"
            onClick={() => setClosingDialog(true)}
            disabled={!confirmChecked || (incentiveStatus === 'missing' && incentiveConfirmText.trim() !== 'CONFIRM')}
            className="bg-green-600 hover:bg-green-700 text-white"
            data-testid="button-close-cycle"
          >
            <Archive className="h-4 w-4 mr-1.5" />
            Close Cycle
          </Button>
        </div>
      )}

      {/* Override dialog */}
      <Dialog open={overrideTargetId !== null} onOpenChange={() => setOverrideTargetId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Override Check — {checks.find(c => c.id === overrideTargetId)?.label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                This override is logged permanently with your name, timestamp, and justification. It appears on the official cycle close record.
              </AlertDescription>
            </Alert>
            <Textarea
              placeholder="Justification (minimum 20 characters)…"
              value={overrideJustification}
              onChange={e => setOverrideJustification(e.target.value)}
              rows={3}
              data-testid="input-step7-override-justification"
            />
            <p className="text-xs text-muted-foreground">{overrideJustification.length}/20 minimum characters</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOverrideTargetId(null)}>Cancel</Button>
            <Button type="button" onClick={handleOverride} disabled={overrideJustification.length < 20 || savingOverride} className="bg-amber-600 hover:bg-amber-700 text-white" data-testid="button-confirm-step7-override">
              {savingOverride && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Apply Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Final close confirmation dialog */}
      <Dialog open={closingDialog} onOpenChange={setClosingDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Archive className="h-5 w-5 text-amber-500" />
              Confirm Cycle Close
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
              <p><strong>Cycle:</strong> {wizardState.selectedMmp?.name}</p>
              <p><strong>Total sites:</strong> {totalSites} ({confirmedSites} confirmed, {notCoveredCount} not covered)</p>
              <p><strong>Pending payment runs:</strong> {Object.values(wizardState.paymentActions).filter(a => !a.done).length}</p>
            </div>
            <p className="text-muted-foreground text-xs">
              Closing this cycle will mark it as closed in the system. The official Cycle Close PDF and a 6-sheet Excel workbook will be downloaded automatically. Notifications will be sent to FOM, Finance, and Admin.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setClosingDialog(false)}>Cancel</Button>
            <Button type="button" onClick={handleCloseCycle} disabled={closing} className="bg-green-600 hover:bg-green-700 text-white" data-testid="button-confirm-final-close">
              {closing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Archive className="h-3.5 w-3.5 mr-1.5" />}
              {closing ? 'Closing…' : 'Close Cycle Now'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-between pt-4 border-t">
        {canGoBack && <Button type="button" variant="outline" size="sm" onClick={onBack} data-testid="button-back-step7">← Back</Button>}
        <Button type="button" variant="outline" size="sm" onClick={generateCycleCloseReports} data-testid="button-download-reports">
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Download Draft Reports
        </Button>
      </div>
    </div>
  );
}
