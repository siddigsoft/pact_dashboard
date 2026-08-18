/**
 * CycleExceptionRollover — Exception Tracker / Rollover Executor
 *
 * Shows all pending "Roll to Next MMP" and "Hold for Next MMP" exception
 * decisions from closed cycles. Finance can:
 *  1. Pick a target open MMP for each enumerator
 *  2. See their claimed / confirmed sites in that MMP
 *  3. Execute the swap — re-links the advance to the new site
 *     and marks the exception action as executed
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  CheckCircle2, Loader2, AlertCircle, ArrowRight, Info,
  RefreshCw, ExternalLink,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useUserContext } from '@/context/UserContext';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExceptionAction {
  id: string;
  mmp_file_id: string;
  mmp_site_entry_id: string | null;
  advance_id: string | null;
  enumerator_id: string | null;
  enumerator_name: string | null;
  site_name: string | null;
  advance_amount: number;
  advance_status: string | null;
  decision: 'roll' | 'hold';
  executed: boolean;
  // Joined
  mmp_name?: string;
}

interface OpenMmp {
  id: string;
  name: string;
  status: string;
  start_date: string | null;
}

interface EnumeratorSite {
  id: string;
  site_name: string;
  state: string;
  locality: string;
  coverage_status: string; // matching_status or similar
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CycleExceptionRollover() {
  const { currentUser } = useUserContext();
  const navigate = useNavigate();

  const [actions, setActions]         = useState<ExceptionAction[]>([]);
  const [loading, setLoading]         = useState(true);
  const [openMmps, setOpenMmps]       = useState<OpenMmp[]>([]);

  // Per-action state
  const [selectedMmp, setSelectedMmp] = useState<Record<string, string>>({});
  const [enumSites, setEnumSites]     = useState<Record<string, EnumeratorSite[]>>({});
  const [loadingSites, setLoadingSites] = useState<Record<string, boolean>>({});
  const [selectedSite, setSelectedSite] = useState<Record<string, string>>({});

  // Execution dialog
  const [confirmAction, setConfirmAction] = useState<ExceptionAction | null>(null);
  const [execNote, setExecNote]           = useState('');
  const [executing, setExecuting]         = useState(false);

  useEffect(() => { loadData(); }, []);

  // ── Load pending actions + open MMPs ───────────────────────────────────────

  const loadData = async () => {
    setLoading(true);
    const [{ data: actData }, { data: mmpData }] = await Promise.all([
      supabase
        .from('cycle_exception_actions')
        .select('*, mmp_files!mmp_file_id(name)')
        .in('decision', ['roll', 'hold'])
        .eq('executed', false)
        .order('created_at', { ascending: false }),
      supabase
        .from('mmp_files')
        .select('id, name, status, start_date')
        .not('status', 'eq', 'closed')
        .order('start_date', { ascending: false }),
    ]);

    const acts: ExceptionAction[] = (actData ?? []).map((r: any) => ({
      ...r,
      mmp_name: r.mmp_files?.name ?? '—',
    }));
    setActions(acts);
    setOpenMmps((mmpData ?? []) as OpenMmp[]);
    setLoading(false);
  };

  // ── Load enumerator's sites in the selected target MMP ────────────────────

  const loadEnumeratorSites = async (actionId: string, mmpId: string, enumId: string | null) => {
    if (!enumId) return;
    setLoadingSites(prev => ({ ...prev, [actionId]: true }));
    setEnumSites(prev => ({ ...prev, [actionId]: [] }));

    const { data } = await supabase
      .from('mmp_site_entries')
      .select('id, site_name, state, locality, status')
      .eq('mmp_file_id', mmpId)
      .eq('accepted_by', enumId);

    const sites: EnumeratorSite[] = (data ?? []).map((s: any) => ({
      id: s.id,
      site_name: s.site_name,
      state: s.state ?? '',
      locality: s.locality ?? '',
      coverage_status: s.status ?? 'Unknown',
    }));
    setEnumSites(prev => ({ ...prev, [actionId]: sites }));
    setLoadingSites(prev => ({ ...prev, [actionId]: false }));
  };

  const handleMmpSelect = (action: ExceptionAction, mmpId: string) => {
    setSelectedMmp(prev => ({ ...prev, [action.id]: mmpId }));
    setSelectedSite(prev => ({ ...prev, [action.id]: '' }));
    loadEnumeratorSites(action.id, mmpId, action.enumerator_id);
  };

  // ── Execute rollover ───────────────────────────────────────────────────────

  const executeRollover = async () => {
    if (!confirmAction) return;
    const targetSiteId = selectedSite[confirmAction.id];
    const targetMmpId  = selectedMmp[confirmAction.id];
    if (!targetSiteId || !targetMmpId) return;

    setExecuting(true);
    try {
      // 1. Re-link the advance to the new site in the target MMP
      if (confirmAction.advance_id) {
        const { error: advErr } = await supabase
          .from('down_payment_requests')
          .update({ mmp_site_entry_id: targetSiteId })
          .eq('id', confirmAction.advance_id);

        if (advErr) throw new Error(`Failed to re-link advance: ${advErr.message}`);
      }

      // 2. Find the site name for the target site
      const targetSite = (enumSites[confirmAction.id] ?? []).find(s => s.id === targetSiteId);
      const targetMmp  = openMmps.find(m => m.id === targetMmpId);

      // 3. Mark action as executed
      const { error: updErr } = await supabase
        .from('cycle_exception_actions')
        .update({
          executed:          true,
          executed_at:       new Date().toISOString(),
          executed_by_name:  currentUser?.full_name ?? 'Unknown',
          execution_note:    execNote || null,
          rollover_mmp_id:   targetMmpId,
          rollover_site_id:  targetSiteId,
          rollover_site_name: targetSite?.site_name ?? null,
        })
        .eq('id', confirmAction.id);

      if (updErr) throw new Error(`Failed to mark action executed: ${updErr.message}`);

      alert(`✅ Rollover executed!\n\nAdvance for "${confirmAction.enumerator_name}" re-linked to:\nSite: ${targetSite?.site_name}\nMMP: ${targetMmp?.name}`);
      setConfirmAction(null);
      setExecNote('');
      await loadData();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setExecuting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading exception actions…
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Exception Rollover Tracker</h1>
          <p className="text-sm text-muted-foreground" dir="rtl">متابعة ترحيل سلف الاستثناءات</p>
          <p className="text-sm text-muted-foreground">
            Pending "Roll to Next MMP" and "Hold" decisions from closed cycles. Execute each rollover by linking the enumerator's advance to their confirmed site in the target cycle.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={loadData} className="shrink-0">
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Refresh
        </Button>
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex gap-3">
        <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
          <p className="font-semibold">How rollovers work — كيف يعمل الترحيل</p>
          <p>
            Select the target open MMP cycle, then select the site where the enumerator is confirmed. Confirming will re-link the advance to that site so Step 6 Reconciliation of the new cycle picks it up correctly.
          </p>
          <p dir="rtl" className="text-xs text-blue-700">
            اختر دورة MMP المستهدفة ثم الموقع الذي أكد المعدد تغطيته. سيؤدي التأكيد إلى إعادة ربط السلفة بالموقع الجديد ليظهر في مطابقة الدورة القادمة.
          </p>
        </div>
      </div>

      {/* Empty state */}
      {actions.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-500" />
          <p className="text-lg font-semibold text-green-700">No pending rollovers</p>
          <p className="text-sm text-muted-foreground">
            All exception decisions have been executed, or no cycles have been closed with Roll/Hold decisions yet.
          </p>
          <p dir="rtl" className="text-xs text-muted-foreground">لا توجد ترحيلات معلقة. جميع قرارات الاستثناءات منفذة.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => navigate('/mmp')}>
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            Go to MMP List
          </Button>
        </div>
      )}

      {/* Pending rollover cards */}
      <div className="space-y-4">
        {actions.map(action => {
          const sites    = enumSites[action.id] ?? [];
          const mmpSel   = selectedMmp[action.id] ?? '';
          const siteSel  = selectedSite[action.id] ?? '';
          const loadingSite = loadingSites[action.id];
          const canExecute = !!mmpSel && !!siteSel;

          return (
            <div key={action.id} className="border rounded-lg p-5 space-y-4 bg-card">
              {/* Card header */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold">{action.enumerator_name ?? 'Unknown Enumerator'}</p>
                    <Badge className={`text-xs ${action.decision === 'roll'
                      ? 'bg-blue-100 text-blue-700 border-blue-300'
                      : 'bg-amber-100 text-amber-700 border-amber-300'}`}>
                      {action.decision === 'roll' ? '🔄 Roll to Next MMP' : '⏸ Hold for Next MMP'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Site: <strong>{action.site_name ?? '—'}</strong>
                    {' · '}
                    Closed cycle: <strong>{action.mmp_name ?? '—'}</strong>
                  </p>
                </div>
                <Badge className={`shrink-0 text-xs ${
                  action.advance_status === 'paid' || action.advance_status === 'fully_paid'
                    ? 'bg-green-100 text-green-700 border-green-300'
                    : action.advance_status === 'partially_paid'
                      ? 'bg-blue-100 text-blue-700 border-blue-300'
                      : 'bg-amber-100 text-amber-700 border-amber-300'
                }`}>
                  SDG {Number(action.advance_amount).toLocaleString()}
                  {' '}
                  {action.advance_status === 'paid' || action.advance_status === 'fully_paid' ? '✓ Paid'
                    : action.advance_status === 'partially_paid' ? '⚡ Partial'
                    : '⏳ Approved'}
                </Badge>
              </div>

              {/* Step 1: pick target MMP */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  1 · Select target MMP cycle — اختر دورة MMP المستهدفة
                </label>
                <Select value={mmpSel} onValueChange={v => handleMmpSelect(action, v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select an open MMP…" />
                  </SelectTrigger>
                  <SelectContent>
                    {openMmps.map(m => (
                      <SelectItem key={m.id} value={m.id}>
                        <span className="font-medium">{m.name}</span>
                        <span className="text-muted-foreground ml-2 text-xs">
                          — {m.status} {m.start_date ? `· ${m.start_date}` : ''}
                        </span>
                      </SelectItem>
                    ))}
                    {openMmps.length === 0 && (
                      <SelectItem value="__none__" disabled>No open MMPs found</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Step 2: pick enumerator's site in target MMP */}
              {mmpSel && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    2 · Select enumerator's confirmed site in that MMP — اختر الموقع المغطى للمعدد
                  </label>

                  {loadingSite ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading sites for {action.enumerator_name}…
                    </div>
                  ) : sites.length === 0 ? (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        {action.enumerator_name} has no sites in the selected MMP.
                        They may not have been assigned to this cycle yet.
                        <span dir="rtl" className="block mt-1">
                          المعدد ليس لديه مواقع في الدورة المختارة. ربما لم يتم تعيينه بعد.
                        </span>
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Select value={siteSel} onValueChange={v => setSelectedSite(prev => ({ ...prev, [action.id]: v }))}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a site…" />
                      </SelectTrigger>
                      <SelectContent>
                        {sites.map(s => (
                          <SelectItem key={s.id} value={s.id}>
                            <div className="flex flex-col gap-0.5 py-0.5">
                              <span className="font-medium">{s.site_name}</span>
                              <span className="text-muted-foreground text-xs">
                                {s.state} / {s.locality} · Status: {s.coverage_status}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              {/* Execute button */}
              {canExecute && (
                <div className="pt-1">
                  <Button
                    type="button"
                    className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
                    onClick={() => { setConfirmAction(action); setExecNote(''); }}
                  >
                    <ArrowRight className="h-4 w-4" />
                    Execute Rollover
                    <span dir="rtl" className="text-blue-200 text-xs ml-1">· تنفيذ الترحيل</span>
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    This will re-link SDG {Number(action.advance_amount).toLocaleString()} to {(enumSites[action.id] ?? []).find(s => s.id === siteSel)?.site_name} in {openMmps.find(m => m.id === mmpSel)?.name}.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Confirmation dialog */}
      <Dialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRight className="h-5 w-5 text-blue-600" />
              Confirm Rollover Execution
            </DialogTitle>
          </DialogHeader>
          {confirmAction && (
            <div className="space-y-4 py-2 text-sm">
              <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
                <p><strong>Enumerator:</strong> {confirmAction.enumerator_name}</p>
                <p><strong>Advance:</strong> SDG {Number(confirmAction.advance_amount).toLocaleString()} ({confirmAction.advance_status})</p>
                <p><strong>From site:</strong> {confirmAction.site_name} ({confirmAction.mmp_name})</p>
                <p><strong>Target site:</strong>{' '}
                  {(enumSites[confirmAction.id] ?? []).find(s => s.id === selectedSite[confirmAction.id])?.site_name}
                </p>
                <p><strong>Target MMP:</strong>{' '}
                  {openMmps.find(m => m.id === selectedMmp[confirmAction.id])?.name}
                </p>
              </div>
              <Textarea
                placeholder="Execution note (optional) — ملاحظة التنفيذ (اختياري)"
                value={execNote}
                onChange={e => setExecNote(e.target.value)}
                rows={2}
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground">
                This updates <code>down_payment_requests</code> to re-link the advance and marks this exception as resolved.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmAction(null)} disabled={executing}>Cancel</Button>
            <Button type="button" onClick={executeRollover} disabled={executing} className="bg-blue-600 hover:bg-blue-700 text-white">
              {executing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5 mr-1.5" />}
              {executing ? 'Executing…' : 'Confirm Rollover'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
