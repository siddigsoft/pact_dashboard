
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  CheckCircle2, XCircle, AlertTriangle, ArrowRight, Download,
  Archive, Loader2, Info
} from 'lucide-react';
import type { WizardState } from '../CycleCloseWizard';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [closingDialog, setClosingDialog] = useState(false);
  const [closing, setClosing] = useState(false);
  const [overrideTargetId, setOverrideTargetId] = useState<number | null>(null);
  const [overrideJustification, setOverrideJustification] = useState('');
  const [savingOverride, setSavingOverride] = useState(false);

  const matchResults = wizardState.matchResults;
  const hasFile = matchResults.length > 0;
  const allMatchesResolved = !matchResults.some(r => r.status === 'review');
  const notCoveredIds = Object.keys(wizardState.uncoveredReasons);
  const allSitesResolved = Object.keys(wizardState.resolvedSites).length === 0 ||
    Object.values(wizardState.resolvedSites).every(v => v !== 'resubmit');
  const allReasonsAssigned = notCoveredIds.every(id => !!wizardState.uncoveredReasons[id]?.reason);
  const allExceptionsDecided = Object.keys(wizardState.exceptionDecisions).every(k => !!wizardState.exceptionDecisions[k]?.decision);
  const hasPaymentActions = Object.keys(wizardState.paymentActions).length > 0 ||
    matchResults.filter(r => r.status === 'auto' || r.action === 'confirm').length === 0;

  const checks: CheckItem[] = [
    { id: 1, label: 'Clean data uploaded & applied', description: 'WFP file matched and applied', jumpStep: 2, passes: hasFile },
    { id: 2, label: 'All matches resolved', description: 'No "needs review" rows remaining', jumpStep: 2, passes: allMatchesResolved },
    { id: 3, label: 'All sites resolved', description: 'Every site is WFP-confirmed / Not-covered / Overridden', jumpStep: 3, passes: allSitesResolved },
    { id: 4, label: 'Not-covered reasons assigned', description: 'Every not-covered site has a reason', jumpStep: 4, passes: allReasonsAssigned },
    { id: 5, label: 'All exceptions decided', description: 'Every advance on not-covered site has a decision', jumpStep: 5, passes: allExceptionsDecided },
    { id: 6, label: 'All enumerators reconciled', description: 'Every enumerator has a settlement status', jumpStep: 6, passes: hasPaymentActions },
    { id: 7, label: 'No pending cost submissions', description: 'All operational cost submissions approved or rejected', jumpStep: 1, passes: true },
  ];

  const allPassed = checks.every(c => c.passes || !!wizardState.overrides[c.id]);
  const blockedChecks = checks.filter(c => !c.passes && !wizardState.overrides[c.id]);

  const totalSites = matchResults.length;
  const confirmedSites = matchResults.filter(r => r.status === 'auto' || r.action === 'confirm').length;
  const notCoveredCount = notCoveredIds.length;

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
    // PDF
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('PACT Cycle Close — Official Record', 14, 20);
    doc.setFontSize(11);
    doc.text(`Cycle: ${wizardState.selectedMmp?.name ?? ''}`, 14, 32);
    doc.text(`Closed by: ${currentUser?.full_name ?? 'User'} on ${new Date().toLocaleString()}`, 14, 40);
    doc.text(`Sites: ${confirmedSites} confirmed, ${notCoveredCount} not covered (of ${totalSites} total)`, 14, 48);
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
    doc.save(`cycle-close-official-${wizardState.selectedMmp?.name ?? 'cycle'}.pdf`);

    // Excel (6 sheets)
    const wb = XLSX.utils.book_new();

    // Sheet 1: Site Summary
    const siteRows = (wizardState.matchResults).map(r => ({
      'Site Name': r.matchedSiteName ?? r.wfpRow['site_name'] ?? '',
      'WFP Status': r.status,
      'Match Type': r.matchLevel,
      'Action': r.action ?? r.status,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(siteRows), 'Site Summary');

    // Sheet 2: Not Covered
    const ncRows = Object.entries(wizardState.uncoveredReasons).map(([id, r]) => ({
      'Site ID': id,
      Reason: r.reason,
      Note: r.note,
      'Follow-Up Required': r.flagged ? 'Yes' : 'No',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ncRows.length ? ncRows : [{}]), 'Not Covered Sites');

    // Sheet 3: Exceptions
    const exRows = Object.entries(wizardState.exceptionDecisions).map(([id, d]) => ({
      'Site ID': id,
      Decision: d.decision,
      Amount: d.amount ?? '',
      Justification: d.justification ?? '',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exRows.length ? exRows : [{}]), 'Exceptions');

    // Sheet 4: Overrides
    const ovRows = Object.entries(wizardState.overrides).map(([id, ov]) => ({
      'Check': checks.find(c => c.id === Number(id))?.label ?? id,
      'Override By': ov.by,
      'When': new Date(ov.at).toLocaleString(),
      'Justification': ov.justification,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ovRows.length ? ovRows : [{}]), 'Override Log');

    XLSX.writeFile(wb, `cycle-close-workbook-${wizardState.selectedMmp?.name ?? 'cycle'}.xlsx`);
  };

  const handleCloseCycle = async () => {
    if (!allPassed || !confirmChecked) return;
    setClosing(true);
    await supabase.from('mmp_files').update({
      status: 'closed',
      closed_at: new Date().toISOString(),
      closed_by: currentUser?.id,
    }).eq('id', wizardState.selectedMmpId!);

    // Generate reports
    await generateCycleCloseReports();

    updateWizardState({ cycleClosedAt: new Date().toISOString() });
    setClosing(false);
    setClosingDialog(false);
  };

  const isClosed = !!wizardState.cycleClosedAt;

  if (isClosed) {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-6 text-center">
        <div className="flex flex-col items-center gap-4 py-8">
          <CheckCircle2 className="h-16 w-16 text-green-600" />
          <h2 className="text-2xl font-bold text-green-700">Cycle Closed Successfully</h2>
          <p className="text-muted-foreground">
            {wizardState.selectedMmp?.name} was closed on {new Date(wizardState.cycleClosedAt!).toLocaleString()}.
          </p>
          <p className="text-sm text-muted-foreground">The official Cycle Close PDF and Excel workbook have been downloaded automatically.</p>
        </div>
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
        <h2 className="text-xl font-semibold">Step 7 — Final Review & Close</h2>
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
            disabled={!confirmChecked}
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
