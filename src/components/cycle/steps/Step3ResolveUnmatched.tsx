
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertTriangle, AlertCircle, Info, Download, CheckCircle2, Loader2 } from 'lucide-react';
import type { WizardState } from '../CycleCloseWizard';
import * as XLSX from 'xlsx';

interface UnresolvedSite {
  id: string;
  site_name: string;
  state: string;
  locality: string;
  enumerator_name: string;
  status: string;
  rejection_reason?: string;
}

interface Props {
  wizardState: WizardState;
  updateWizardState: (patch: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
  canAdvance: boolean;
  canGoBack: boolean;
  canOverride: boolean;
  currentUser: any;
}

export default function Step3ResolveUnmatched({ wizardState, updateWizardState, onNext, onBack, canGoBack, canOverride, currentUser }: Props) {
  const [sites, setSites] = useState<UnresolvedSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [overrideDialog, setOverrideDialog] = useState<{ open: boolean; siteId: string; siteName: string } | null>(null);
  const [overrideJustification, setOverrideJustification] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (wizardState.selectedMmpId) loadSites();
  }, [wizardState.selectedMmpId, wizardState.matchResults]);

  const loadSites = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('mmp_site_entries')
      .select('id, site_name, state, locality, status, data_collector_id, profiles(full_name)')
      .eq('mmp_file_id', wizardState.selectedMmpId!)
      .in('status', ['submitted', 'wfp_rejected', 'completed']);

    // Determine which are unresolved: rejected by WFP match OR still submitted without a WFP confirm
    const rejectedIds = new Set(
      wizardState.matchResults.filter(r => r.action === 'reject').map(r => r.matchedSiteId).filter(Boolean)
    );
    const confirmedIds = new Set(
      wizardState.matchResults.filter(r => r.action === 'confirm' || r.status === 'auto').map(r => r.matchedSiteId).filter(Boolean)
    );
    const resolvedInWizard = new Set(Object.keys(wizardState.resolvedSites));

    const unresolved: UnresolvedSite[] = (data ?? [])
      .filter((s: any) => !confirmedIds.has(s.id) && !resolvedInWizard.has(s.id))
      .map((s: any) => ({
        id: s.id,
        site_name: s.site_name ?? '—',
        state: s.state ?? '—',
        locality: s.locality ?? '—',
        enumerator_name: s.profiles?.full_name ?? 'Unknown',
        status: rejectedIds.has(s.id) ? 'wfp_rejected' : s.status,
        rejection_reason: rejectedIds.has(s.id) ? 'Rejected in WFP clean data' : undefined,
      }));
    setSites(unresolved);
    setLoading(false);
  };

  const handleAction = (siteId: string, action: 'not_covered' | 'resubmit') => {
    updateWizardState({
      resolvedSites: { ...wizardState.resolvedSites, [siteId]: action },
    });
    setSites(prev => prev.filter(s => s.id !== siteId));
  };

  const handleOverrideConfirm = async () => {
    if (!overrideDialog || overrideJustification.length < 10) return;
    setSaving(true);
    await supabase.from('mmp_site_entries').update({
      status: 'wfp_confirmed',
      wfp_override_justification: overrideJustification,
      wfp_override_by: currentUser?.id,
      wfp_override_at: new Date().toISOString(),
    }).eq('id', overrideDialog.siteId);
    updateWizardState({
      resolvedSites: { ...wizardState.resolvedSites, [overrideDialog.siteId]: 'override_confirmed' },
    });
    setSites(prev => prev.filter(s => s.id !== overrideDialog.siteId));
    setSaving(false);
    setOverrideDialog(null);
    setOverrideJustification('');
  };

  const exportRejectedReport = () => {
    const rows = sites.map(s => ({
      'Site Name': s.site_name,
      State: s.state,
      Locality: s.locality,
      Enumerator: s.enumerator_name,
      Status: s.status,
      'Rejection Reason': s.rejection_reason ?? '',
      'Action Taken': wizardState.resolvedSites[s.id] ?? 'Pending',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rejected Sites');
    XLSX.writeFile(wb, 'rejected-sites-report.xlsx');
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading unresolved sites…</span>
      </div>
    );
  }

  const allDone = sites.length === 0;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Step 3 — Resolve Unmatched Sites</h2>
        <p className="text-muted-foreground text-sm">Sites that are WFP-rejected or still submitted after matching need a resolution before closing.</p>
      </div>

      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex gap-3">
        <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800 dark:text-blue-200">
          <p className="font-medium">Three actions available per site</p>
          <p>1. <strong>Mark Not Covered</strong> — moves to Step 4 for reason assignment.</p>
          <p>2. <strong>Override to Confirmed</strong> (FOM/Admin only) — requires written justification and is logged permanently.</p>
          <p>3. <strong>Flag for Re-submission</strong> — site stays open; cycle cannot close until resolved.</p>
        </div>
      </div>

      {allDone ? (
        <div className="flex items-center gap-3 bg-green-50 dark:bg-green-950/30 border border-green-200 rounded-lg p-4">
          <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
          <p className="text-sm text-green-800 dark:text-green-200 font-medium">All unmatched sites have been resolved. Ready to continue.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sites.map(site => (
            <div key={site.id} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-sm">{site.site_name}</p>
                  <p className="text-xs text-muted-foreground">{site.state} / {site.locality} — {site.enumerator_name}</p>
                </div>
                <Badge variant={site.status === 'wfp_rejected' ? 'destructive' : 'outline'} className="text-xs flex-shrink-0">
                  {site.status === 'wfp_rejected' ? 'WFP Rejected' : site.status}
                </Badge>
              </div>

              {site.status === 'wfp_rejected' && (
                <Alert className="bg-amber-50 border-amber-200">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-800 text-xs">
                    ⚠️ This site was marked "Complete" by the enumerator but was rejected in the WFP clean data. Payment for this site will not be processed unless a manager overrides this status with justification.
                  </AlertDescription>
                </Alert>
              )}

              {site.rejection_reason && (
                <p className="text-xs text-muted-foreground">Reason: {site.rejection_reason}</p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAction(site.id, 'not_covered')}
                  className="text-xs"
                  data-testid={`button-not-covered-${site.id}`}
                >
                  Mark Not Covered
                </Button>
                {canOverride && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setOverrideDialog({ open: true, siteId: site.id, siteName: site.site_name })}
                    className="text-xs text-amber-700 border-amber-300 hover:bg-amber-50"
                    data-testid={`button-override-${site.id}`}
                  >
                    Override to Confirmed
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAction(site.id, 'resubmit')}
                  className="text-xs text-blue-700 border-blue-200 hover:bg-blue-50"
                  data-testid={`button-resubmit-${site.id}`}
                >
                  Flag for Re-submission
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Override Dialog */}
      <Dialog open={!!overrideDialog?.open} onOpenChange={() => setOverrideDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Override to Confirmed — {overrideDialog?.siteName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                This override will be logged permanently with your name, timestamp, and justification. It cannot be undone without re-opening the cycle.
              </AlertDescription>
            </Alert>
            <div className="space-y-1">
              <label className="text-sm font-medium">Justification (required)</label>
              <Textarea
                placeholder="Explain why this site should be confirmed despite WFP rejection…"
                value={overrideJustification}
                onChange={e => setOverrideJustification(e.target.value)}
                rows={3}
                data-testid="input-override-justification"
              />
              <p className="text-xs text-muted-foreground">{overrideJustification.length} characters (minimum 10)</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideDialog(null)}>Cancel</Button>
            <Button
              onClick={handleOverrideConfirm}
              disabled={overrideJustification.length < 10 || saving}
              className="bg-amber-600 hover:bg-amber-700 text-white"
              data-testid="button-confirm-override"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Confirm Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-between pt-4 border-t">
        <div className="flex items-center gap-2">
          {canGoBack && <Button variant="outline" size="sm" onClick={onBack} data-testid="button-back-step3">← Back</Button>}
          <Button variant="outline" size="sm" onClick={exportRejectedReport} data-testid="button-export-rejected">
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export Rejected Sites Report
          </Button>
        </div>
        <Button onClick={onNext} data-testid="button-next-step3">
          Next: Mark Uncovered →
        </Button>
      </div>
    </div>
  );
}
