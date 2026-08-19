
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertCircle, MapPin, Users, Calendar, Info, Download, Clock, RotateCcw, Trash2 } from 'lucide-react';
import type { WizardState, SavedSession } from '../CycleCloseWizard';
import * as XLSX from 'xlsx';

interface Props {
  wizardState: WizardState;
  updateWizardState: (patch: Partial<WizardState>) => void;
  onNext: () => void;
  canAdvance: boolean;
  canGoBack: boolean;
  /** Populated when localStorage has a saved session for the currently-selected cycle. */
  savedSession?: SavedSession | null;
  onResume?: () => void;
  onStartFresh?: () => void;
  nextLabel?: string;
}

function formatSavedAt(iso: string): string {
  try {
    const d = new Date(iso);
    const now = Date.now();
    const diffMs = now - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    return d.toLocaleDateString();
  } catch {
    return '—';
  }
}

// Matches the current 6-step wizard (Step3 "Resolve Unmatched" was merged into Step2)
const STEP_LABELS: Record<number, string> = {
  1: 'Select Cycle',
  2: 'Upload & Match',
  3: 'Mark Uncovered',
  4: 'Exceptions',
  5: 'Reconciliation',
  6: 'Final Close',
};

const CYCLE_PAGE_SIZE = 80;

export default function Step1SelectCycle({
  wizardState, updateWizardState, onNext, canAdvance,
  savedSession, onResume, onStartFresh, nextLabel,
}: Props) {
  const [openCycles, setOpenCycles] = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [siteCount, setSiteCount]   = useState(0);
  const [enumeratorCount, setEnumeratorCount] = useState(0);
  const [loadingMoreCycles, setLoadingMoreCycles] = useState(false);
  const [hasMoreCycles, setHasMoreCycles] = useState(false);

  useEffect(() => { loadCycles(); }, []);

  const loadCycles = async (offset = 0) => {
    const loadingMore = offset > 0;
    if (loadingMore) setLoadingMoreCycles(true);
    else setLoading(true);
    setError(null);

    // Keep this query bounded. The previous unbounded sort made the wizard wait
    // for every historical MMP row before it could render the selector.
    const request = supabase
      .from('mmp_files')
      .select('id, name, status, hub, created_at, month, cycle_status')
      .not('status', 'eq', 'rejected')
      .neq('cycle_status', 'closed')    // exclude already-closed cycles
      .order('created_at', { ascending: false })
      .range(offset, offset + CYCLE_PAGE_SIZE - 1);

    let timeoutId: number | undefined;
    try {
      const { data, error } = await Promise.race([
        request,
        new Promise<never>((_, reject) => {
          timeoutId = window.setTimeout(
            () => reject(new Error('Loading cycles took too long. Please try again.')),
            8_000,
          );
        }),
      ]);
      if (error) {
        setError(error.message);
      } else {
        const rows = data ?? [];
        setOpenCycles(previous => loadingMore ? [...previous, ...rows] : rows);
        setHasMoreCycles(rows.length === CYCLE_PAGE_SIZE);
      }
    } catch (err: any) {
      setError(err?.message ?? 'Unable to load cycles.');
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      if (loadingMore) setLoadingMoreCycles(false);
      else setLoading(false);
    }
  };

  const handleSelect = async (mmpId: string) => {
    const mmp = openCycles.find(m => m.id === mmpId);
    // Reset all state so stale data from a different cycle never bleeds through.
    // (If there is a saved session for this cycle, the Resume banner handles restoration.)
    updateWizardState({
      selectedMmpId: mmpId,
      selectedMmp: mmp,
      uploadedFileName: null,
      fileColumns: [],
      fileRows: [],
      columnMapping: {},
      fileConfirmed: false,
      mmpColumns: [],
      mmpRawRows: [],
      matchingPairs: [],
      matchResults: [],
      resolvedSites: {},
      uncoveredReasons: {},
      exceptionDecisions: {},
      paymentActions: {},
      overrides: {},
      cycleClosedAt: null,
    });

    // Both stat queries are independent — fire in parallel
    const [{ count: sc }, { data: entries }] = await Promise.all([
      supabase
        .from('mmp_site_entries')
        .select('*', { count: 'exact', head: true })
        .eq('mmp_file_id', mmpId),
      supabase
        .from('mmp_site_entries')
        .select('accepted_by')
        .eq('mmp_file_id', mmpId)
        .not('accepted_by', 'is', null),
    ]);
    setSiteCount(sc ?? 0);
    const uniqueEnums = new Set((entries ?? []).map((e: any) => e.accepted_by).filter(Boolean));
    setEnumeratorCount(uniqueEnums.size);
  };

  const exportCycleSummary = async () => {
    if (!wizardState.selectedMmpId) return;
    const { data } = await supabase
      .from('mmp_site_entries')
      .select('site_name, state, locality, activity, status, accepted_by, claimed_by, visit_started_by')
      .eq('mmp_file_id', wizardState.selectedMmpId);

    const rows = (data ?? []).map((r: any) => ({
      'Site Name': r.site_name,
      State: r.state,
      Locality: r.locality,
      Activity: r.activity,
      Status: r.status,
      'Enumerator ID': r.accepted_by ?? r.claimed_by ?? r.visit_started_by ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cycle Summary');
    XLSX.writeFile(wb, `cycle-summary-${wizardState.selectedMmp?.name ?? 'cycle'}.xlsx`);
  };

  const selectedMmp    = wizardState.selectedMmp;
  const isAlreadyClosed = selectedMmp?.status === 'closed';
  const showResumeBanner =
    !!savedSession &&
    !!wizardState.selectedMmpId &&
    savedSession.wizardState.selectedMmpId === wizardState.selectedMmpId;

  // Summary of what was saved — shown in the resume banner
  const resumeSummary = (() => {
    if (!savedSession) return null;
    const parts: string[] = [];
    if (savedSession.wizardState.uploadedFileName) {
      parts.push(`File: ${savedSession.wizardState.uploadedFileName}`);
    }
    const validPairs = (savedSession.wizardState.matchingPairs ?? []).filter(
      p => p.mmpColumn && p.wfpColumn
    );
    if (validPairs.length > 0) {
      parts.push(`${validPairs.length} matching pair${validPairs.length !== 1 ? 's' : ''} defined`);
    }
    const matched = (savedSession.wizardState.matchResults ?? []).filter(
      r => r.status === 'auto' || (r.status === 'actioned' && (r.action === 'confirm' || r.action === 'extra'))
    ).length;
    if (matched > 0) parts.push(`${matched} rows confirmed`);
    return parts.join(' · ');
  })();

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Step 1 — Select Cycle</h2>
        <p className="text-sm text-muted-foreground mt-0.5" dir="rtl">الخطوة ١ — اختيار الدورة</p>
        <p className="text-muted-foreground text-sm">Choose which MMP cycle you are closing. Only open or in-progress cycles are shown.</p>
      </div>

      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex gap-3">
        <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
          <p className="font-medium">What this step does</p>
          <p>Select the monthly monitoring plan cycle you want to close. Once selected, you will see a summary of the cycle's sites, enumerators, and current status. Closing a cycle is permanent unless a FOM or Admin re-opens it.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading cycles…</span>
        </div>
      ) : error ? (
        <div className="space-y-3">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button type="button" variant="outline" size="sm" onClick={() => { setError(null); loadCycles(); }}>
            Retry
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Select MMP Cycle</label>
            <Select value={wizardState.selectedMmpId ?? ''} onValueChange={handleSelect}>
              <SelectTrigger className="w-full" data-testid="select-mmp-cycle">
                <SelectValue placeholder="Choose a cycle to close…" />
              </SelectTrigger>
              <SelectContent>
                {openCycles.length === 0 && (
                  <SelectItem value="__none" disabled>No open cycles found</SelectItem>
                )}
                {openCycles.map(mmp => (
                  <SelectItem key={mmp.id} value={mmp.id}>
                    {mmp.name}
                    {mmp.month && ` — ${mmp.month}/${new Date(mmp.created_at).getFullYear()}`}
                    {mmp.hub && ` (${mmp.hub})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasMoreCycles && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto px-0 text-xs"
                disabled={loadingMoreCycles}
                onClick={() => loadCycles(openCycles.length)}
                data-testid="button-load-older-cycles"
              >
                {loadingMoreCycles
                  ? <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Loading older cycles…</>
                  : 'Load older cycles'}
              </Button>
            )}
            {!wizardState.selectedMmpId && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Please select a cycle before continuing
              </p>
            )}
          </div>

          {/* ── Resume banner ─────────────────────────────────────────────── */}
          {showResumeBanner && (
            <div className="border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 space-y-3">
                  <div>
                    <p className="font-semibold text-sm text-amber-800 dark:text-amber-200">
                      Unsaved session found — resume where you left off?
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-300 mt-1 space-y-0.5">
                      <span className="font-medium">
                        Saved {formatSavedAt(savedSession!.savedAt)}
                      </span>
                      {' · '}
                      <span>
                        Was on <strong>Step {savedSession!.currentStep} — {STEP_LABELS[savedSession!.currentStep] ?? ''}</strong>
                      </span>
                    </p>
                    {resumeSummary && (
                      <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">{resumeSummary}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      type="button"
                      size="sm"
                      className="bg-amber-600 hover:bg-amber-700 text-white h-8"
                      onClick={onResume}
                      data-testid="button-resume-session"
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                      Resume from Step {savedSession!.currentStep}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 border-amber-300 text-amber-700 hover:bg-amber-100"
                      onClick={onStartFresh}
                      data-testid="button-start-fresh"
                    >
                      Start Fresh
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={onStartFresh}
                      data-testid="button-discard-session"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      Remove session
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Cycle summary card ────────────────────────────────────────── */}
          {selectedMmp && !isAlreadyClosed && (
            <div className="bg-muted/50 border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">{selectedMmp.name}</h3>
                <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
                  {(() => {
                    const s = (selectedMmp.status ?? '').toLowerCase().replace(/_/g, ' ');
                    const labels: Record<string, string> = {
                      'pending': 'Pending',
                      'approved': 'Approved',
                      'verified': 'Verified',
                      'forwarded to coordinator': 'Forwarded to Coordinator',
                      'forwarded to fom': 'Forwarded to FOM',
                      'in progress': 'In Progress',
                      'completed': 'Completed',
                    };
                    return labels[s] ?? (s ? s.replace(/\b\w/g, c => c.toUpperCase()) : 'Open');
                  })()}
                </Badge>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="flex items-center gap-1.5 text-sm">
                  <MapPin className="h-4 w-4 text-blue-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">Total Sites</p>
                    <p className="font-semibold">{siteCount}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <Users className="h-4 w-4 text-purple-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">Enumerators</p>
                    <p className="font-semibold">
                      {enumeratorCount === 0
                        ? <span className="text-muted-foreground text-xs font-normal">None assigned yet</span>
                        : enumeratorCount}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <Calendar className="h-4 w-4 text-green-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">Cycle Month</p>
                    <p className="font-semibold">
                      {selectedMmp.month ?? '—'}/{selectedMmp.created_at ? new Date(selectedMmp.created_at).getFullYear() : '—'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <MapPin className="h-4 w-4 text-orange-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">Hub</p>
                    <p className="font-semibold text-xs">{selectedMmp.hub ?? 'All'}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {isAlreadyClosed && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                This cycle was already closed on {new Date(selectedMmp.closed_at).toLocaleDateString()}. Re-open it first if changes are needed (FOM/Admin only).
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-4 border-t">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={exportCycleSummary}
          disabled={!wizardState.selectedMmpId}
          data-testid="button-export-cycle-summary"
        >
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Export Cycle Summary (Excel)
        </Button>
        <Button
          type="button"
          onClick={onNext}
          disabled={!canAdvance || isAlreadyClosed}
          data-testid="button-start-guided-close"
        >
          {nextLabel ?? 'Start Guided Close →'}
        </Button>
      </div>
    </div>
  );
}
