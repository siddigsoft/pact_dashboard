
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info, CheckCircle2, Loader2, Download, AlertCircle } from 'lucide-react';
import type { WizardState, ExceptionDecision } from '../CycleCloseWizard';
import * as XLSX from 'xlsx';

interface ExceptionSite {
  siteId: string;
  siteName: string;
  state: string;
  locality: string;
  enumeratorId: string;
  enumeratorName: string;
  advancePaid: number;
}

interface Props {
  wizardState: WizardState;
  updateWizardState: (patch: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
  canGoBack: boolean;
  canOverride: boolean;
  currentUser: any;
}

const DECISIONS = [
  { value: 'roll', label: 'Roll to Next MMP', desc: 'Treat as pre-payment for the next cycle' },
  { value: 'return', label: 'Return Required', desc: 'Enumerator must return the money' },
  { value: 'writeoff', label: 'Write-Off', desc: 'Amount is too small or unrecoverable' },
  { value: 'redirect', label: 'Redirect to Enumerator Fees', desc: 'Enumerator did related work — redirect to fee line (GL: Debit Enumerator Fees / Credit Transport Advance)' },
];

export default function Step5Exceptions({ wizardState, updateWizardState, onNext, onBack, canGoBack, canOverride, currentUser }: Props) {
  const [exceptions, setExceptions] = useState<ExceptionSite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (wizardState.selectedMmpId) loadExceptions();
  }, [wizardState.selectedMmpId, wizardState.uncoveredReasons]);

  const loadExceptions = async () => {
    setLoading(true);

    const notCoveredIds = Object.keys(wizardState.uncoveredReasons);
    if (!notCoveredIds.length) { setLoading(false); return; }

    // Get enumerator IDs for not-covered sites
    const { data: siteData } = await supabase
      .from('mmp_site_entries')
      .select('id, site_name, state, locality, accepted_by, profiles!accepted_by(full_name)')
      .in('id', notCoveredIds);

    if (!siteData?.length) { setLoading(false); return; }

    const enumIds = [...new Set(siteData.map((s: any) => s.accepted_by).filter(Boolean))];

    // Check for advances paid (down_payments table)
    const { data: advances } = await supabase
      .from('down_payments')
      .select('id, user_id, amount, status, mmp_file_id')
      .eq('mmp_file_id', wizardState.selectedMmpId!)
      .in('user_id', enumIds)
      .in('status', ['approved', 'paid', 'partially_paid']);

    const advanceByEnum: Record<string, number> = {};
    (advances ?? []).forEach((a: any) => {
      advanceByEnum[a.user_id] = (advanceByEnum[a.user_id] ?? 0) + (a.amount ?? 0);
    });

    const exceptionSites: ExceptionSite[] = siteData
      .filter((s: any) => advanceByEnum[s.accepted_by] > 0)
      .map((s: any) => ({
        siteId: s.id,
        siteName: s.site_name,
        state: s.state,
        locality: s.locality,
        enumeratorId: s.accepted_by,
        enumeratorName: s.profiles?.full_name ?? 'Unknown',
        advancePaid: advanceByEnum[s.accepted_by] ?? 0,
      }));

    setExceptions(exceptionSites);
    setLoading(false);
  };

  const setDecision = (siteId: string, patch: Partial<ExceptionDecision>) => {
    const current = wizardState.exceptionDecisions[siteId] ?? {};
    updateWizardState({
      exceptionDecisions: { ...wizardState.exceptionDecisions, [siteId]: { ...current, ...patch } },
    });
  };

  const exportExceptions = () => {
    const rows = exceptions.map(e => {
      const d = wizardState.exceptionDecisions[e.siteId];
      return {
        'Site Name': e.siteName,
        State: e.state,
        Locality: e.locality,
        Enumerator: e.enumeratorName,
        'Advance Paid (SDG)': e.advancePaid,
        Decision: d?.decision ?? 'Pending',
        'Amount Redirected/Rolled': d?.amount ?? '',
        Justification: d?.justification ?? '',
        'Approved By': d?.approvedBy ?? '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Exceptions');
    XLSX.writeFile(wb, 'exceptions-report.xlsx');
  };

  if (loading) return (
    <div className="flex items-center gap-2 justify-center py-12 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" /> Loading exceptions…
    </div>
  );

  const allDecided = exceptions.every(e => {
    const d = wizardState.exceptionDecisions[e.siteId];
    if (!d?.decision) return false;
    if (d.decision === 'redirect') return !!d.justification && (d.amount ?? 0) > 0 && (d.amount ?? 0) <= e.advancePaid;
    if (d.decision === 'writeoff') return !!d.justification;
    return true;
  });

  if (exceptions.length === 0) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Step 5 — Resolve Exceptions</h2>
        </div>
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg p-4">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <p className="text-sm text-green-800 font-medium">No exceptions — no not-covered sites had advance payments. Ready to continue.</p>
        </div>
        <div className="flex items-center justify-between pt-4 border-t">
          {canGoBack && <Button type="button" variant="outline" size="sm" onClick={onBack}>← Back</Button>}
          <Button type="button" onClick={onNext} data-testid="button-next-step5-empty">Next: Financial Reconciliation →</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Step 5 — Resolve Exceptions</h2>
        <p className="text-muted-foreground text-sm">
          These not-covered sites had advance payments already paid to their enumerators. Each one needs a decision before the cycle can close.
        </p>
      </div>

      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex gap-3">
        <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
          <p className="font-medium">4 options per site</p>
          {DECISIONS.map(d => <p key={d.value}><strong>{d.label}:</strong> {d.desc}</p>)}
        </div>
      </div>

      <div className="space-y-4">
        {exceptions.map(site => {
          const d = wizardState.exceptionDecisions[site.siteId];
          const isDone = d?.decision && (d.decision !== 'redirect' || (!!d.justification && (d.amount ?? 0) > 0)) && (d.decision !== 'writeoff' || !!d.justification);
          return (
            <div key={site.siteId} className={`border rounded-lg p-4 space-y-4 ${isDone ? 'border-green-300 bg-green-50/20' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-sm">{site.siteName}</p>
                  <p className="text-xs text-muted-foreground">{site.state} / {site.locality} — {site.enumeratorName}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-xs">
                    Advance: SDG {site.advancePaid.toLocaleString()}
                  </Badge>
                  {isDone && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                </div>
              </div>

              <div className="space-y-3">
                <Select value={d?.decision ?? ''} onValueChange={v => setDecision(site.siteId, { decision: v as ExceptionDecision['decision'] })}>
                  <SelectTrigger className="w-full" data-testid={`select-decision-${site.siteId}`}>
                    <SelectValue placeholder="Select recovery action…" />
                  </SelectTrigger>
                  <SelectContent>
                    {DECISIONS.map(dec => (
                      <SelectItem key={dec.value} value={dec.value}>
                        <span className="font-medium">{dec.label}</span>
                        <span className="text-muted-foreground ml-2 text-xs">— {dec.desc}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {d?.decision === 'redirect' && (
                  <div className="space-y-2 pl-2 border-l-2 border-amber-400">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-medium w-32">Amount to redirect</label>
                      <Input
                        type="number"
                        min={0}
                        max={site.advancePaid}
                        value={d?.amount ?? ''}
                        onChange={e => setDecision(site.siteId, { amount: Number(e.target.value) })}
                        className="w-36 h-8 text-sm"
                        placeholder={`Max: ${site.advancePaid}`}
                        data-testid={`input-redirect-amount-${site.siteId}`}
                      />
                      <span className="text-xs text-muted-foreground">SDG (max: {site.advancePaid})</span>
                    </div>
                    {(d?.amount ?? 0) > site.advancePaid && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Redirect amount cannot exceed the advance paid (SDG {site.advancePaid})
                      </p>
                    )}
                    <Textarea
                      placeholder="Justification (required) — why is this advance being redirected to enumerator fees?"
                      value={d?.justification ?? ''}
                      onChange={e => setDecision(site.siteId, { justification: e.target.value })}
                      rows={2}
                      className="text-sm"
                      data-testid={`input-redirect-justification-${site.siteId}`}
                    />
                    {!canOverride && (
                      <p className="text-xs text-amber-600">⚠️ Redirect decisions must be approved by FOM or Admin</p>
                    )}
                    <p className="text-xs text-muted-foreground">GL effect: Debit Enumerator Fees / Credit Transport Advance</p>
                  </div>
                )}

                {d?.decision === 'writeoff' && (
                  <Textarea
                    placeholder="Write-off justification (required)…"
                    value={d?.justification ?? ''}
                    onChange={e => setDecision(site.siteId, { justification: e.target.value })}
                    rows={2}
                    className="text-sm"
                    data-testid={`input-writeoff-justification-${site.siteId}`}
                  />
                )}

                {!d?.decision && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    You must select a recovery action for {site.siteName} before closing.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!allDecided && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>All exceptions must have a decision before advancing.</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between pt-4 border-t">
        <div className="flex items-center gap-2">
          {canGoBack && <Button type="button" variant="outline" size="sm" onClick={onBack} data-testid="button-back-step5">← Back</Button>}
          <Button type="button" variant="outline" size="sm" onClick={exportExceptions} data-testid="button-export-exceptions">
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export Exceptions Report
          </Button>
        </div>
        <Button type="button" onClick={onNext} disabled={!allDecided} data-testid="button-next-step5">
          Next: Financial Reconciliation →
        </Button>
      </div>
    </div>
  );
}
