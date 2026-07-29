
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info, AlertTriangle, AlertCircle, CheckCircle2, Loader2, Download } from 'lucide-react';
import type { WizardState, UncoveredReason } from '../CycleCloseWizard';
import * as XLSX from 'xlsx';

const NOT_COVERED_REASONS = [
  { value: 'not_distributed', label: 'Not Distributed' },
  { value: 'cp_not_confirmed', label: 'CP Not Confirmed / Switched Off' },
  { value: 'security_concerns', label: '🔴 Security Concerns', flagged: true },
  { value: 'access_denied', label: '🔴 Access Denied', flagged: true },
  { value: 'staff_unavailable', label: 'Staff Unavailable' },
  { value: 'weather', label: 'Weather / Natural Disaster' },
  { value: 'budget_constraints', label: 'Budget Constraints' },
  { value: 'time_constraints', label: 'Time Constraints' },
  { value: 'duplicate_site', label: 'Duplicate Site' },
  { value: 'wfp_rejected', label: 'WFP Rejected' },
  { value: 'other', label: 'Other (specify below)' },
];

interface UncoveredSite {
  id: string;
  site_name: string;
  state: string;
  locality: string;
  enumerator_name: string;
  source: 'not_covered' | 'rejected_match' | 'manual';
}

interface Props {
  wizardState: WizardState;
  updateWizardState: (patch: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
  canAdvance: boolean;
  canGoBack: boolean;
}

export default function Step4MarkUncovered({ wizardState, updateWizardState, onNext, onBack, canAdvance, canGoBack }: Props) {
  const [sites, setSites] = useState<UncoveredSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkReason, setBulkReason] = useState('');
  const [bulkNote, setBulkNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (wizardState.selectedMmpId) loadUncoveredSites();
  }, [wizardState.selectedMmpId, wizardState.resolvedSites]);

  const loadUncoveredSites = async () => {
    setLoading(true);

    // Sites marked as not_covered in Step 3
    const step3NotCovered = Object.entries(wizardState.resolvedSites)
      .filter(([, v]) => v === 'not_covered')
      .map(([k]) => k);

    // Sites rejected in matching (Step 2)
    const rejectedMatchIds = wizardState.matchResults
      .filter(r => r.action === 'reject')
      .map(r => r.matchedSiteId)
      .filter(Boolean) as string[];

    const allIds = [...new Set([...step3NotCovered, ...rejectedMatchIds])];

    if (allIds.length === 0) {
      // Check for sites with not_covered status in DB
      const { data } = await supabase
        .from('mmp_site_entries')
        .select('id, site_name, state, locality, data_collector_id, profiles(full_name), status')
        .eq('mmp_file_id', wizardState.selectedMmpId!)
        .eq('status', 'not_covered');
      setSites((data ?? []).map((s: any) => ({
        id: s.id,
        site_name: s.site_name,
        state: s.state,
        locality: s.locality,
        enumerator_name: s.profiles?.full_name ?? 'Unknown',
        source: 'manual',
      })));
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('mmp_site_entries')
      .select('id, site_name, state, locality, data_collector_id, profiles(full_name)')
      .in('id', allIds);

    setSites((data ?? []).map((s: any) => ({
      id: s.id,
      site_name: s.site_name,
      state: s.state,
      locality: s.locality,
      enumerator_name: s.profiles?.full_name ?? 'Unknown',
      source: step3NotCovered.includes(s.id) ? 'not_covered' : 'rejected_match',
    })));
    setLoading(false);
  };

  const setReason = (siteId: string, patch: Partial<UncoveredReason>) => {
    const current = wizardState.uncoveredReasons[siteId] ?? { reason: '', note: '', flagged: false };
    const reasonMeta = NOT_COVERED_REASONS.find(r => r.value === (patch.reason ?? current.reason));
    updateWizardState({
      uncoveredReasons: {
        ...wizardState.uncoveredReasons,
        [siteId]: { ...current, ...patch, flagged: !!reasonMeta?.flagged },
      },
    });
  };

  const applyBulk = () => {
    if (!bulkReason || selected.size === 0) return;
    const reasonMeta = NOT_COVERED_REASONS.find(r => r.value === bulkReason);
    const patch: Record<string, UncoveredReason> = {};
    selected.forEach(id => {
      patch[id] = { reason: bulkReason, note: bulkNote, flagged: !!reasonMeta?.flagged };
    });
    updateWizardState({ uncoveredReasons: { ...wizardState.uncoveredReasons, ...patch } });
    setSelected(new Set());
    setBulkReason('');
    setBulkNote('');
  };

  const saveAndNext = async () => {
    setSaving(true);
    for (const [siteId, reasonData] of Object.entries(wizardState.uncoveredReasons)) {
      await supabase.from('mmp_site_entries').update({
        status: 'not_covered',
        not_covered_reason: reasonData.reason,
        not_covered_note: reasonData.note,
        needs_followup: reasonData.flagged,
      }).eq('id', siteId);
    }
    setSaving(false);
    onNext();
  };

  const exportNotCoveredReport = () => {
    const rows = sites.map(s => {
      const r = wizardState.uncoveredReasons[s.id];
      return {
        'Site Name': s.site_name,
        State: s.state,
        Locality: s.locality,
        Enumerator: s.enumerator_name,
        Reason: r?.reason ?? 'Not assigned',
        Notes: r?.note ?? '',
        'Flagged for Follow-Up': r?.flagged ? 'Yes' : 'No',
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Not Covered Sites');
    XLSX.writeFile(wb, 'not-covered-sites-report.xlsx');
  };

  if (loading) {
    return <div className="flex items-center gap-2 justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading sites…</div>;
  }

  const allAssigned = sites.every(s => !!wizardState.uncoveredReasons[s.id]?.reason);
  const flaggedCount = Object.values(wizardState.uncoveredReasons).filter(r => r.flagged).length;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Step 4 — Mark Uncovered Sites</h2>
        <p className="text-muted-foreground text-sm">Assign a reason for every site that was not visited or not confirmed. All sites must have a reason before closing.</p>
      </div>

      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex gap-3">
        <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800 dark:text-blue-200">
          <p className="font-medium">What this step does</p>
          <p>Sites with Security Concerns or Access Denied are automatically flagged with a red badge and generate a follow-up action item for the next cycle. You can select multiple sites and assign the same reason in bulk.</p>
        </div>
      </div>

      {sites.length === 0 ? (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg p-4">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <p className="text-sm text-green-800 font-medium">No uncovered sites to assign reasons to. Ready to continue.</p>
        </div>
      ) : (
        <>
          {flaggedCount > 0 && (
            <Alert className="bg-red-50 border-red-200">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                {flaggedCount} site{flaggedCount > 1 ? 's' : ''} flagged with Security/Access issues — follow-up actions will be auto-created for the next cycle.
              </AlertDescription>
            </Alert>
          )}

          {/* Bulk assignment */}
          {selected.size > 0 && (
            <div className="border border-blue-200 bg-blue-50 dark:bg-blue-950/20 rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium text-blue-800 dark:text-blue-200">{selected.size} site{selected.size > 1 ? 's' : ''} selected — bulk assign reason:</p>
              <div className="flex gap-2 flex-wrap">
                <Select value={bulkReason} onValueChange={setBulkReason}>
                  <SelectTrigger className="w-64 h-8 text-sm" data-testid="select-bulk-reason">
                    <SelectValue placeholder="Select reason…" />
                  </SelectTrigger>
                  <SelectContent>
                    {NOT_COVERED_REASONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Textarea
                  placeholder="Optional note…"
                  value={bulkNote}
                  onChange={e => setBulkNote(e.target.value)}
                  className="h-8 min-h-[2rem] text-sm resize-none"
                  rows={1}
                />
                <Button size="sm" onClick={applyBulk} disabled={!bulkReason} data-testid="button-apply-bulk">
                  Apply to {selected.size} sites
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {sites.map(site => {
              const assigned = wizardState.uncoveredReasons[site.id];
              const isSelected = selected.has(site.id);
              const isFlagged = assigned?.flagged;
              return (
                <div key={site.id} className={`border rounded-lg p-4 space-y-3 ${isFlagged ? 'border-red-300 bg-red-50/30' : ''}`}>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={v => setSelected(prev => {
                        const n = new Set(prev);
                        v ? n.add(site.id) : n.delete(site.id);
                        return n;
                      })}
                      data-testid={`checkbox-site-${site.id}`}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{site.site_name}</p>
                        {isFlagged && <Badge className="bg-red-100 text-red-700 border-red-300 text-xs">⚠️ Follow-up Required</Badge>}
                        <Badge variant="outline" className="text-xs">{site.source === 'rejected_match' ? 'WFP Rejected' : 'Not Covered'}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{site.state} / {site.locality} — {site.enumerator_name}</p>
                    </div>
                    {assigned?.reason && <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />}
                  </div>
                  <div className="flex gap-2 pl-8 flex-wrap">
                    <Select
                      value={assigned?.reason ?? ''}
                      onValueChange={v => setReason(site.id, { reason: v })}
                    >
                      <SelectTrigger className="w-64 h-8 text-xs" data-testid={`select-reason-${site.id}`}>
                        <SelectValue placeholder="Select reason…" />
                      </SelectTrigger>
                      <SelectContent>
                        {NOT_COVERED_REASONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {assigned?.reason === 'other' && (
                      <Textarea
                        placeholder="Specify reason…"
                        value={assigned?.note ?? ''}
                        onChange={e => setReason(site.id, { note: e.target.value })}
                        className="flex-1 min-h-[2rem] text-xs"
                        rows={1}
                        data-testid={`input-reason-note-${site.id}`}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {!allAssigned && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>All uncovered sites must have a reason assigned before advancing to the next step.</AlertDescription>
            </Alert>
          )}
        </>
      )}

      <div className="flex items-center justify-between pt-4 border-t">
        <div className="flex items-center gap-2">
          {canGoBack && <Button variant="outline" size="sm" onClick={onBack} data-testid="button-back-step4">← Back</Button>}
          <Button variant="outline" size="sm" onClick={exportNotCoveredReport} disabled={sites.length === 0} data-testid="button-export-not-covered">
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export Not-Covered Report
          </Button>
        </div>
        <Button onClick={saveAndNext} disabled={!allAssigned || saving} data-testid="button-next-step4">
          {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          Next: Resolve Exceptions →
        </Button>
      </div>
    </div>
  );
}
