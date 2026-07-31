
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertCircle, MapPin, Users, Calendar, Info, Download } from 'lucide-react';
import type { WizardState } from '../CycleCloseWizard';
import * as XLSX from 'xlsx';

interface Props {
  wizardState: WizardState;
  updateWizardState: (patch: Partial<WizardState>) => void;
  onNext: () => void;
  canAdvance: boolean;
  canGoBack: boolean;
}

export default function Step1SelectCycle({ wizardState, updateWizardState, onNext, canAdvance }: Props) {
  const [openCycles, setOpenCycles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [siteCount, setSiteCount] = useState(0);
  const [enumeratorCount, setEnumeratorCount] = useState(0);

  useEffect(() => {
    loadCycles();
  }, []);

  const loadCycles = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('mmp_files')
      .select('id, name, status, hub, created_at, month, cycle_status')
      .not('status', 'eq', 'rejected')
      .order('created_at', { ascending: false });
    if (error) setError(error.message);
    else setOpenCycles(data ?? []);
    setLoading(false);
  };

  const handleSelect = async (mmpId: string) => {
    const mmp = openCycles.find(m => m.id === mmpId);
    updateWizardState({ selectedMmpId: mmpId, selectedMmp: mmp });

    const { count: sc } = await supabase
      .from('mmp_site_entries')
      .select('*', { count: 'exact', head: true })
      .eq('mmp_file_id', mmpId);
    setSiteCount(sc ?? 0);

    const { data: entries } = await supabase
      .from('mmp_site_entries')
      .select('accepted_by')
      .eq('mmp_file_id', mmpId)
      .not('accepted_by', 'is', null);
    const uniqueEnums = new Set((entries ?? []).map((e: any) => e.accepted_by).filter(Boolean));
    setEnumeratorCount(uniqueEnums.size);
  };

  const exportCycleSummary = async () => {
    if (!wizardState.selectedMmpId) return;
    const { data } = await supabase
      .from('mmp_site_entries')
      .select('site_name, state, locality, activity, status, data_collector_id')
      .eq('mmp_file_id', wizardState.selectedMmpId);

    const rows = (data ?? []).map((r: any) => ({
      'Site Name': r.site_name,
      State: r.state,
      Locality: r.locality,
      Activity: r.activity,
      Status: r.status,
      'Enumerator ID': r.data_collector_id ?? '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cycle Summary');
    XLSX.writeFile(wb, `cycle-summary-${wizardState.selectedMmp?.name ?? 'cycle'}.xlsx`);
  };

  const selectedMmp = wizardState.selectedMmp;
  const isAlreadyClosed = selectedMmp?.status === 'closed';

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Step 1 — Select Cycle</h2>
        <p className="text-muted-foreground text-sm">Choose which MMP cycle you are closing. Only open or in-progress cycles are shown.</p>
      </div>

      {/* Help panel */}
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
            {!wizardState.selectedMmpId && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Please select a cycle before continuing
              </p>
            )}
          </div>

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
                    <p className="font-semibold">{enumeratorCount === 0 ? <span className="text-muted-foreground text-xs font-normal">None assigned yet</span> : enumeratorCount}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <Calendar className="h-4 w-4 text-green-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">Cycle Month</p>
                    <p className="font-semibold">{selectedMmp.month ?? '—'}/{selectedMmp.created_at ? new Date(selectedMmp.created_at).getFullYear() : '—'}</p>
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
          Start Guided Close →
        </Button>
      </div>
    </div>
  );
}
