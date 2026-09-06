
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
import type { RoleFlags } from '../CycleCloseWizard';
import { allUncoveredReasonsConfirmed, uncoveredSiteIdsFromWizardState } from '../CycleCloseWizard';
import { allExceptionActionsExecuted } from '../exceptionExecution';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { exportCycleCloseWorkbook, type CheckResult } from '@/utils/cycleCloseExport';

interface CheckItem {
  id: number;        // stable key used for overrides storage — never renumber
  displayNum: number; // sequential 1–N shown to the user
  label: string;
  description: string;
  jumpStep: number;
  passes: boolean;
  fixItUrl?: string; // if set, "Fix it" navigates to this URL instead of jumping to a wizard step
}

interface Props {
  wizardState: WizardState;
  updateWizardState: (patch: Partial<WizardState>) => void;
  onNext?: () => void;
  onBack: () => void;
  canGoBack: boolean;
  canOverride: boolean;
  canFinalizeClose?: boolean;
  roleFlags?: RoleFlags;
  currentUser: any;
  goToStep?: (step: number) => void;
}

export default function Step7FinalClose({ wizardState, updateWizardState, onBack, canGoBack, canOverride, canFinalizeClose, roleFlags, currentUser, goToStep }: Props) {
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

  // ── Field Payments checks (async) ────────────────────────────────────────
  // Check 8: WFP-confirmed covered sites whose fee still has a cash balance
  // Check 9: exception actions that have not executed successfully in the wizard
  const [unpaidFeeCount,  setUnpaidFeeCount]  = useState<number | null>(null); // null = loading
  const [pendingExcCount, setPendingExcCount]  = useState<number | null>(null);
  const [attributionLoading, setAttributionLoading] = useState(false);
  const [attributionError, setAttributionError] = useState<string | null>(null);

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

    // Check 8: only persisted WFP-confirmed covered sites may be paid. Assigned,
    // claimed, rejected, submitted, and explicitly not-covered sites are never
    // financial obligations merely because they exist in this cycle.
    supabase
      .from('mmp_site_entries')
      .select('id, attribution_collector_id, attribution_status, enumerator_fee, transport_fee, fee_cash_paid_amount, fee_advance_offset_amount')
      .eq('mmp_file_id', mmpId)
      .eq('status', 'wfp_confirmed')
      .or('not_covered_flag.is.null,not_covered_flag.eq.false')
      .not('attribution_collector_id', 'is', null)
      .then(({ data: sites, error }) => {
        if (error) {
          setUnpaidFeeCount(null);
          return;
        }
        const unpaidCoveredSites = (sites as any[] ?? []).filter(site => {
          const grossFee = Number(site.enumerator_fee ?? 0) + Number(site.transport_fee ?? 0);
          const settled = Number(site.fee_cash_paid_amount ?? 0) + Number(site.fee_advance_offset_amount ?? 0);
          return grossFee - settled > 0.005;
        });
        setUnpaidFeeCount(unpaidCoveredSites.length);
      });

    // Check 9: any exception action still unexecuted, regardless of decision type
    supabase
      .from('cycle_exception_actions')
      .select('id', { count: 'exact', head: true })
      .eq('mmp_file_id', mmpId)
      .eq('executed', false)
      .then(({ count }) => setPendingExcCount(count ?? 0));
  }, [wizardState.selectedMmpId]);

  useEffect(() => {
    const mmpId = wizardState.selectedMmpId;
    if (!mmpId) return;
    setAttributionLoading(true);
    (supabase as any).rpc('get_cycle_attribution_report', { p_mmp_id: mmpId })
      .then(({ data, error }: any) => {
        if (error) {
          setAttributionError(error.message ?? 'Could not load collection attribution report.');
          updateWizardState({ attributionReport: [], attributionUnresolvedCount: Number.MAX_SAFE_INTEGER, attributionLoaded: false });
          return;
        }
        setAttributionError(null);
        const report = data?.rows ?? [];
        const unresolved = report.filter((r: any) =>
          r.requires_attribution === true &&
          (!['auto', 'corrected'].includes(String(r.status ?? '').toLowerCase()) || !r.resolved_collector_id)
        ).length;
        updateWizardState({ attributionReport: report, attributionUnresolvedCount: unresolved, attributionLoaded: true });
      })
      .finally(() => setAttributionLoading(false));
  }, [wizardState.selectedMmpId]);

  const matchResults = wizardState.matchResults;
  const hasFile = matchResults.length > 0;
  const allMatchesResolved = !matchResults.some(r => r.status === 'review');

  // Step 3: no resubmit-pending sites
  const allSitesResolved = Object.values(wizardState.resolvedSites).every(v => v !== 'resubmit');

  // Step 3: every truly uncovered site must have a supervisor-confirmed reason.
  const allReasonsConfirmed = allUncoveredReasonsConfirmed(wizardState);

  const allExceptionsExecuted = allExceptionActionsExecuted(wizardState.exceptionDecisions);

  // id = stable key for overrides storage (never renumber); displayNum = sequential label shown to user.
  // Check id:6 ("All enumerators reconciled") was removed — it was keyed off wizardState.paymentActions
  // which Step 5 (Reconciliation) no longer writes. The real fee-payment gate is check id:8 below.
  const checks: CheckItem[] = [
    { id: 1, displayNum: 1, label: 'Clean data uploaded & applied', description: 'WFP file matched and applied', jumpStep: 2, passes: hasFile },
    { id: 2, displayNum: 2, label: 'All matches resolved', description: 'No "needs review" rows remaining', jumpStep: 2, passes: allMatchesResolved },
    { id: 3, displayNum: 3, label: 'All sites resolved', description: 'Every site is WFP-confirmed / Not-covered / Overridden — resolve in Upload & Match', jumpStep: 2, passes: allSitesResolved },
    { id: 4, displayNum: 4, label: 'Not-covered reasons confirmed', description: 'Every not-covered site has a supervisor-confirmed reason', jumpStep: 3, passes: allReasonsConfirmed },
    {
      id: 5,
      displayNum: 5,
      label: 'All exception actions completed',
      description: 'Every not-covered advance action executed successfully inside the Cycle Close wizard',
      jumpStep: 4,
      passes: allExceptionsExecuted,
    },
    { id: 7, displayNum: 6, label: 'No pending cost submissions', description: 'Manually verify all operational cost submissions are approved/rejected before closing', jumpStep: 1, passes: true },
    // Note: check 6 (id:7) is not auto-computed — FOM must verify manually; the override mechanism exists if acceptable to close with pending submissions.
    {
      id: 8, displayNum: 7,
      label: 'Enumerator fees paid',
      description: unpaidFeeCount === null
        ? 'Checking fee payment status…'
        : unpaidFeeCount === 0
          ? 'All WFP-confirmed covered-site fees are settled'
          : `${unpaidFeeCount} WFP-confirmed covered site${unpaidFeeCount !== 1 ? 's have' : ' has'} an unpaid fee balance — pay via Field Payments Centre`,
      jumpStep: 1,
      passes: unpaidFeeCount === 0,
      fixItUrl: '/field-payments?tab=fees',
    },
    {
      id: 9, displayNum: 8,
      label: 'Exception actions executed',
      description: pendingExcCount === null
        ? 'Checking exception action status…'
        : pendingExcCount === 0
          ? 'No saved exception action is waiting for execution'
          : `${pendingExcCount} exception action${pendingExcCount !== 1 ? 's are' : ' is'} still pending — complete it in Step 4`,
      jumpStep: 4,
      passes: pendingExcCount === null ? true : pendingExcCount === 0,
    },
    {
      id: 10, displayNum: 9,
      label: 'Collection attribution resolved',
      description: attributionLoading
        ? 'Checking collection attribution report…'
        : wizardState.attributionUnresolvedCount === 0
          ? 'All WFP collection identities are resolved'
          : `${wizardState.attributionUnresolvedCount} collection attribution issue${wizardState.attributionUnresolvedCount === 1 ? ' remains' : 's remain'} — resolve in Reconciliation`,
      jumpStep: 5,
      passes: !attributionLoading && wizardState.attributionUnresolvedCount === 0,
    },
  ];

  const hardBlockCheckIds = new Set([5, 8, 9, 10]);
  const allPassed = checks.every(c =>
    c.passes || (!hardBlockCheckIds.has(c.id) && !!wizardState.overrides[c.id])
  );
  const blockedChecks = checks.filter(c =>
    !c.passes && (hardBlockCheckIds.has(c.id) || !wizardState.overrides[c.id])
  );

  const totalSites = matchResults.length;
  const confirmedSites = matchResults.filter(r => r.status === 'auto' || r.action === 'confirm').length;
  const allNotCoveredIds = new Set(uncoveredSiteIdsFromWizardState(wizardState));
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
    if (!mayFinalize) return;
    if (!allPassed || !confirmChecked) return;
    // If no pre-approved snapshot, require the admin to have typed CONFIRM
    if (incentiveStatus === 'missing' && incentiveConfirmText.trim() !== 'CONFIRM') return;
    setClosing(true);
    try {
      // Re-check immediately before close so stale browser state can never turn a
      // selected-but-unexecuted decision into a closed cycle.
      const { count: pendingActions, error: pendingError } = await supabase
        .from('cycle_exception_actions')
        .select('id', { count: 'exact', head: true })
        .eq('mmp_file_id', wizardState.selectedMmpId!)
        .eq('executed', false);
      if (pendingError) throw new Error(`Could not verify exception actions: ${pendingError.message}`);
      if (!allExceptionsExecuted || (pendingActions ?? 0) > 0) {
        alert('Final Close is blocked because one or more exception actions have not executed successfully. Return to Step 4 and complete every action.');
        setClosing(false);
        setClosingDialog(false);
        goToStep?.(4);
        return;
      }

      // The report RPC is authoritative; never rely solely on the browser copy
      // when the final close request is submitted.
      const { data: latestAttributionReport, error: latestAttributionError } = await (supabase as any).rpc(
        'get_cycle_attribution_report',
        { p_mmp_id: wizardState.selectedMmpId! },
      );
      if (latestAttributionError) throw new Error(`Could not verify collection attribution: ${latestAttributionError.message}`);
      const latestAttribution = latestAttributionReport?.rows ?? [];
      const unresolvedAttribution = latestAttribution.filter((r: any) =>
        r.requires_attribution === true &&
        (!['auto', 'corrected'].includes(String(r.status ?? '').toLowerCase()) || !r.resolved_collector_id)
      ).length;
      if (unresolvedAttribution > 0) {
        updateWizardState({ attributionReport: latestAttribution ?? [], attributionUnresolvedCount: unresolvedAttribution, attributionLoaded: true });
        alert(`Final Close is blocked because ${unresolvedAttribution} collection attribution issue${unresolvedAttribution === 1 ? ' remains' : 's remain'}. Return to Reconciliation and correct them.`);
        setClosing(false);
        setClosingDialog(false);
        goToStep?.(5);
        return;
      }

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

      // Reports generated after confirmed atomic DB write
      await generateCycleCloseReports();
      updateWizardState({ cycleClosedAt: closedAt });
    } catch (err: any) {
      console.error('Unexpected error closing cycle:', err);
      alert(`An unexpected error occurred: ${err?.message ?? err}\n\nPlease check the cycle status before retrying.`);
    } finally {
      setClosing(false);
      setClosingDialog(false);
    }
  };

  const isClosed = !!wizardState.cycleClosedAt;
  const mayFinalize = !!canFinalizeClose;

  if (isClosed) {
    const allDecisions = Object.values(wizardState.exceptionDecisions);
    const journalCount = allDecisions.filter(d => !!d.journalEntryId).length;

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
            {allDecisions.length > 0 && (
              <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-green-700">All actions completed before close</span>
                <span className="font-semibold">{allDecisions.length} exception{allDecisions.length > 1 ? 's' : ''}</span>
              </div>
            )}
            {journalCount > 0 && (
              <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-slate-700">GL journals posted</span>
                <span className="font-semibold">{journalCount}</span>
              </div>
            )}
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
        <h2 className="text-xl font-semibold">Step 6 — Final Review &amp; Close</h2>
        <p className="text-sm text-muted-foreground mt-0.5" dir="rtl">الخطوة ٦ — المراجعة النهائية وإغلاق الدورة</p>
        <p className="text-muted-foreground text-sm">
          All checks must pass before the cycle can close. Exception execution checks are hard blockers and cannot be overridden.
        </p>
      </div>

      {!mayFinalize && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900">
          <AlertTriangle className="h-4 w-4 text-amber-700" />
          <AlertDescription>
            Read-only final close stage: only FOM, Admin, or Super Admin can close a cycle.
            {roleFlags?.isSupervisor ? ' Supervisor role detected.' : roleFlags?.isCoordinator ? ' Coordinator role detected.' : ''}
          </AlertDescription>
        </Alert>
      )}

      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex gap-3">
        <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800 dark:text-blue-200">
          <p>
            Click <strong>"Fix it"</strong> on any failing check to jump directly to the relevant step.
            Permitted operational checks may be overridden with a written justification; exception actions must actually succeed.
          </p>
        </div>
      </div>
      {attributionError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Collection attribution could not be verified: {attributionError}. Final Close is blocked until the report loads successfully.</AlertDescription>
        </Alert>
      )}

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
                  <p className="text-sm font-medium">{check.displayNum}. {check.label}</p>
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
                  <Button
                    type="button" size="sm" variant="outline"
                    className="text-xs h-7 flex items-center gap-1"
                    onClick={() => check.fixItUrl ? navigate(check.fixItUrl) : goToStep?.(check.jumpStep)}
                    data-testid={`button-fixit-${check.id}`}
                  >
                    Fix it {check.fixItUrl ? <ExternalLink className="h-3 w-3" /> : <ArrowRight className="h-3 w-3" />}
                  </Button>
                  {canOverride && !hardBlockCheckIds.has(check.id) && (
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
            {blockedChecks.length} check{blockedChecks.length > 1 ? 's' : ''} still block Final Close: {blockedChecks.map(c => c.label).join(', ')}.
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
            disabled={!mayFinalize || !confirmChecked || (incentiveStatus === 'missing' && incentiveConfirmText.trim() !== 'CONFIRM')}
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
            <Button type="button" onClick={handleCloseCycle} disabled={!mayFinalize || closing} className="bg-green-600 hover:bg-green-700 text-white" data-testid="button-confirm-final-close">
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
