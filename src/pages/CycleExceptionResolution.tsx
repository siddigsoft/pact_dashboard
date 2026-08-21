/**
 * CycleExceptionResolution — Exception Resolution Centre
 *
 * Handles the three "action required" exception decisions that don't need
 * a target MMP (unlike roll/hold which go to the Rollover Tracker):
 *
 *  ① Write Off   — cancel an approved-but-unpaid advance entirely
 *  ② Return      — flag a paid advance for money-return collection
 *  ③ Redirect    — record where an approved-but-unpaid advance should move
 *
 * All three mark cycle_exception_actions.executed = true and update the
 * underlying down_payment_requests row accordingly.
 */

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  CheckCircle2, Loader2, AlertCircle, XCircle, RotateCcw,
  ArrowRightLeft, RefreshCw, Info, DollarSign, User, Building2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '@/context/user/UserContext';
import { format, parseISO } from 'date-fns';
import { cancelPaidDownPaymentRequest } from '@/utils/preFundLinkage';

// ── Types ──────────────────────────────────────────────────────────────────────

type ResolutionDecision = 'writeoff' | 'return' | 'redirect';

interface ExceptionAction {
  id: string;
  mmp_file_id: string;
  mmp_name?: string;
  mmp_site_entry_id: string | null;
  advance_id: string | null;
  enumerator_id: string | null;
  enumerator_name: string | null;
  site_name: string | null;
  advance_amount: number;
  advance_status: string | null;
  decision: ResolutionDecision;
  justification: string | null;
  executed: boolean;
  created_at: string;
}

type DialogState = {
  open: boolean;
  action: ExceptionAction | null;
  note: string;
  redirectHub: string;
  saving: boolean;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmtDate = (iso?: string | null) => {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'MMM dd, yyyy'); } catch { return '—'; }
};

const fmtAmount = (n: number) =>
  n > 0 ? `${n.toLocaleString()} SDG` : '—';

function statusBadge(status: string | null) {
  if (!status) return null;
  const map: Record<string, { label: string; cls: string }> = {
    approved:       { label: 'Approved',        cls: 'bg-green-100 text-green-700 border-green-300' },
    paid:           { label: 'Paid',             cls: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
    fully_paid:     { label: 'Fully Paid',       cls: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
    partially_paid: { label: 'Partially Paid',   cls: 'bg-purple-100 text-purple-700 border-purple-300' },
    pending_admin:  { label: 'Pending Admin',    cls: 'bg-blue-100 text-blue-700 border-blue-300' },
  };
  const cfg = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-700 border-gray-300' };
  return <Badge variant="outline" className={`text-[10px] ${cfg.cls}`}>{cfg.label}</Badge>;
}

// Decision metadata
const DECISION_META: Record<ResolutionDecision, {
  icon: React.ReactNode;
  label: string;
  labelAr: string;
  colour: string;        // tailwind border/bg class set
  actionLabel: string;
  actionLabelAr: string;
  description: string;
  noteLabel: string;
  noteRequired: boolean;
}> = {
  writeoff: {
    icon: <XCircle className="h-5 w-5 text-red-500" />,
    label: 'Write Off',
    labelAr: 'شطب',
    colour: 'border-red-200 bg-red-50 dark:bg-red-950/20',
    actionLabel: 'Confirm Write-Off',
    actionLabelAr: 'تأكيد الشطب',
    description: 'Cancel this approved-but-unpaid advance and mark it as written off. The advance will be set to "Cancelled (Written Off)" and removed from payment queues.',
    noteLabel: 'Write-off justification (optional)',
    noteRequired: false,
  },
  return: {
    icon: <RotateCcw className="h-5 w-5 text-amber-500" />,
    label: 'Request Return',
    labelAr: 'طلب استرداد',
    colour: 'border-amber-200 bg-amber-50 dark:bg-amber-950/20',
    actionLabel: 'Mark Return Requested',
    actionLabelAr: 'تسجيل طلب الاسترداد',
    description: 'Flag this paid advance so Finance can track the money-return process. The enumerator will need to return the funds to the office.',
    noteLabel: 'Collection note / contact details (optional)',
    noteRequired: false,
  },
  redirect: {
    icon: <ArrowRightLeft className="h-5 w-5 text-blue-500" />,
    label: 'Redirect to Correct Project',
    labelAr: 'إعادة توجيه للمشروع الصحيح',
    colour: 'border-blue-200 bg-blue-50 dark:bg-blue-950/20',
    actionLabel: 'Confirm Redirect',
    actionLabelAr: 'تأكيد إعادة التوجيه',
    description: 'Record where this advance should be charged. The advance will be updated with the new hub/project information you enter below.',
    noteLabel: 'Correct hub / project / activity (required)',
    noteRequired: true,
  },
};

// ── Action card ────────────────────────────────────────────────────────────────

function ActionCard({
  action,
  onExecute,
}: {
  action: ExceptionAction;
  onExecute: (a: ExceptionAction) => void;
}) {
  const meta = DECISION_META[action.decision];
  return (
    <div className={`rounded-lg border p-4 space-y-3 ${meta.colour}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {meta.icon}
          <div className="min-w-0">
            <p className="font-semibold truncate">{action.enumerator_name ?? '—'}</p>
            <p className="text-xs text-muted-foreground truncate">{action.site_name ?? '—'}</p>
          </div>
        </div>
        {statusBadge(action.advance_status)}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div className="flex items-center gap-1 text-muted-foreground">
          <DollarSign className="h-3 w-3" />
          <span>{fmtAmount(action.advance_amount)}</span>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <Building2 className="h-3 w-3" />
          <span className="truncate">{action.mmp_name ?? '—'}</span>
        </div>
        {action.justification && (
          <div className="col-span-2 text-muted-foreground italic">
            "{action.justification}"
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-muted-foreground">{fmtDate(action.created_at)}</span>
        <Button
          type="button"
          size="sm"
          onClick={() => onExecute(action)}
          className="h-7 text-xs"
          data-testid={`btn-execute-${action.id}`}
        >
          {meta.actionLabel}
        </Button>
      </div>
    </div>
  );
}

// ── Section ────────────────────────────────────────────────────────────────────

function DecisionSection({
  decision,
  actions,
  onExecute,
}: {
  decision: ResolutionDecision;
  actions: ExceptionAction[];
  onExecute: (a: ExceptionAction) => void;
}) {
  const meta = DECISION_META[decision];
  if (actions.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {meta.icon}
        <div>
          <h3 className="font-semibold">{meta.label}</h3>
          <p className="text-xs text-muted-foreground" dir="rtl">{meta.labelAr}</p>
        </div>
        <Badge variant="secondary" className="ml-auto">{actions.length}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">{meta.description}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {actions.map(a => (
          <ActionCard key={a.id} action={a} onExecute={onExecute} />
        ))}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function CycleExceptionResolution() {
  const { currentUser } = useUser();
  const navigate = useNavigate();

  const [actions, setActions]   = useState<ExceptionAction[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const [dialog, setDialog] = useState<DialogState>({
    open: false, action: null, note: '', redirectHub: '', saving: false,
  });

  // ── Load pending resolution actions ────────────────────────────────────────
  const loadActions = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await (supabase as any)
        .from('cycle_exception_actions')
        .select(`
          id, mmp_file_id, mmp_site_entry_id, advance_id,
          enumerator_id, enumerator_name, site_name,
          advance_amount, advance_status, decision,
          justification, executed, created_at,
          mmp_files!left ( name )
        `)
        .in('decision', ['writeoff', 'return', 'redirect'])
        .eq('executed', false)
        .order('created_at', { ascending: true });

      if (err) throw err;

      const mapped: ExceptionAction[] = (data ?? []).map((r: any) => ({
        ...r,
        mmp_name: r.mmp_files?.name ?? null,
      }));
      setActions(mapped);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load pending actions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadActions(); }, []);

  // ── Grouped by decision type ───────────────────────────────────────────────
  const byDecision = useMemo(() => ({
    writeoff: actions.filter(a => a.decision === 'writeoff'),
    return:   actions.filter(a => a.decision === 'return'),
    redirect: actions.filter(a => a.decision === 'redirect'),
  }), [actions]);

  const totalPending = actions.length;

  // ── Open confirm dialog ────────────────────────────────────────────────────
  const openDialog = (action: ExceptionAction) => {
    setDialog({ open: true, action, note: action.justification ?? '', redirectHub: '', saving: false });
  };

  // ── Execute ────────────────────────────────────────────────────────────────
  const handleExecute = async () => {
    const { action, note, redirectHub } = dialog;
    if (!action || !currentUser) return;

    const meta = DECISION_META[action.decision];
    if (meta.noteRequired && !redirectHub.trim()) return;

    setDialog(d => ({ ...d, saving: true }));
    try {
      const now = new Date().toISOString();

      // ── 1. Mutate the down_payment_requests row ──────────────────────────
      if (action.advance_id) {
        if (action.decision === 'writeoff') {
          // Reverse paid financial evidence before applying write-off metadata.
          const existingMeta = await fetchMeta(action.advance_id);
          const writeOffReason = note.trim() || action.justification || 'Written off at cycle close';
          await cancelPaidDownPaymentRequest(action.advance_id, `Cycle write-off: ${writeOffReason}`);
          const { data: writeOffRows, error: writeOffError } = await (supabase as any)
            .from('down_payment_requests')
            .update({
              metadata: {
                ...existingMeta,
                written_off: true,
                write_off_note: writeOffReason,
                write_off_by: currentUser.full_name ?? currentUser.id,
                write_off_at: now,
              },
            })
            .eq('id', action.advance_id)
            .select('id');
          if (writeOffError) throw writeOffError;
          if (writeOffRows?.length !== 1) throw new Error('Write-off metadata was not saved. Verify your access and try again.');

        } else if (action.decision === 'return') {
          // Flag for return collection — advance stays approved/paid
          const existingMeta = await fetchMeta(action.advance_id);
          const { data: returnRows, error: returnError } = await (supabase as any)
            .from('down_payment_requests')
            .update({
              metadata: {
                ...existingMeta,
                return_requested: true,
                return_requested_at: now,
                return_requested_by: currentUser.full_name ?? currentUser.id,
                return_collection_note: note.trim() || null,
              },
            })
            .eq('id', action.advance_id)
            .select('id');
          if (returnError) throw returnError;
          if (returnRows?.length !== 1) throw new Error('Return instruction was not saved. Verify your access and try again.');

        } else if (action.decision === 'redirect') {
          // Record redirect destination; update hub_name if provided
          const existingMeta = await fetchMeta(action.advance_id);
          const { data: redirectRows, error: redirectError } = await (supabase as any)
            .from('down_payment_requests')
            .update({
              ...(redirectHub.trim() ? { hub_name: redirectHub.trim() } : {}),
              metadata: {
                ...existingMeta,
                redirected: true,
                redirect_destination: redirectHub.trim() || note.trim(),
                redirect_note: note.trim() || null,
                redirect_by: currentUser.full_name ?? currentUser.id,
                redirect_at: now,
              },
            })
            .eq('id', action.advance_id)
            .select('id');
          if (redirectError) throw redirectError;
          if (redirectRows?.length !== 1) throw new Error('Redirect was not saved. Verify your access and try again.');
        }
      }

      // ── 2. Mark cycle_exception_actions as executed ──────────────────────
      const { data: executedRows, error: actionError } = await (supabase as any)
        .from('cycle_exception_actions')
        .update({
          executed: true,
          executed_at: now,
          executed_by: currentUser.id,
          executed_by_name: currentUser.full_name ?? null,
          execution_note:
            action.decision === 'writeoff' ? (note.trim() || 'Written off at cycle close') :
            action.decision === 'return'   ? (note.trim() || 'Return flagged') :
            `Redirected to: ${redirectHub.trim() || note.trim()}`,
        })
        .eq('id', action.id)
        .select('id');
      if (actionError) throw actionError;
      if (executedRows?.length !== 1) throw new Error('Cycle action was not marked as executed. Verify your access and try again.');

      // Remove from local state
      setActions(prev => prev.filter(a => a.id !== action.id));
      setDialog({ open: false, action: null, note: '', redirectHub: '', saving: false });

    } catch (e: any) {
      console.error('[CycleExceptionResolution] execute error:', e);
      setDialog(d => ({ ...d, saving: false }));
      alert(`Failed to execute action: ${e?.message ?? 'Unknown error'}`);
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  async function fetchMeta(advanceId: string): Promise<Record<string, any>> {
    const { data, error: metaError } = await (supabase as any)
      .from('down_payment_requests')
      .select('metadata')
      .eq('id', advanceId)
      .maybeSingle();
    if (metaError) throw metaError;
    return (data?.metadata as Record<string, any>) ?? {};
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">

      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <ArrowRightLeft className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Exception Resolution Centre</h1>
            <p className="text-sm text-muted-foreground" dir="rtl">مركز حل الاستثناءات</p>
          </div>
          <div className="ml-auto flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={loadActions}
              disabled={loading}
              data-testid="btn-refresh"
            >
              <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigate('/cycle-exceptions/rollover')}
            >
              Roll / Hold Tracker →
            </Button>
          </div>
        </div>
      </div>

      {/* Info banner */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm">
          This page shows exception decisions from closed cycles that require a Finance action:
          <strong> Write-Off</strong> (cancel an unpaid advance),
          <strong> Request Return</strong> (collect funds from a paid advance), and
          <strong> Redirect</strong> (move an advance to the correct project or hub).
          Each action updates the advance in real time and marks the exception as resolved.
        </AlertDescription>
      </Alert>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading pending resolution actions…
        </div>
      )}

      {/* All clear */}
      {!loading && totalPending === 0 && !error && (
        <div className="flex flex-col items-center py-16 gap-3 text-center">
          <CheckCircle2 className="h-14 w-14 text-green-500" />
          <h2 className="text-lg font-semibold text-green-700">All Resolved</h2>
          <p className="text-muted-foreground text-sm">
            No pending write-offs, returns, or redirects. All exception decisions have been executed.
          </p>
          <p className="text-xs text-muted-foreground" dir="rtl">لا توجد استثناءات معلقة — تمت معالجة جميع القرارات</p>
        </div>
      )}

      {/* Sections */}
      {!loading && totalPending > 0 && (
        <div className="space-y-8">

          <DecisionSection
            decision="writeoff"
            actions={byDecision.writeoff}
            onExecute={openDialog}
          />

          {byDecision.writeoff.length > 0 && byDecision.return.length > 0 && (
            <Separator />
          )}

          <DecisionSection
            decision="return"
            actions={byDecision.return}
            onExecute={openDialog}
          />

          {(byDecision.writeoff.length > 0 || byDecision.return.length > 0) &&
            byDecision.redirect.length > 0 && (
            <Separator />
          )}

          <DecisionSection
            decision="redirect"
            actions={byDecision.redirect}
            onExecute={openDialog}
          />
        </div>
      )}

      {/* ── Confirm Dialog ─────────────────────────────────────────────────── */}
      {dialog.action && (
        <Dialog
          open={dialog.open}
          onOpenChange={open => !open && !dialog.saving && setDialog(d => ({ ...d, open: false }))}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {DECISION_META[dialog.action.decision].icon}
                {DECISION_META[dialog.action.decision].actionLabel}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 text-sm">
              {/* Summary card */}
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">{dialog.action.enumerator_name ?? '—'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{dialog.action.site_name ?? '—'}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{dialog.action.mmp_name ?? '—'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-mono font-semibold">{fmtAmount(dialog.action.advance_amount)}</span>
                  {statusBadge(dialog.action.advance_status)}
                </div>
              </div>

              {/* Decision-specific confirmation text */}
              {dialog.action.decision === 'writeoff' && (
                <Alert>
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  <AlertDescription>
                    This will <strong>cancel</strong> the advance and mark it as "Written Off".
                    The action cannot be undone without Finance manually reverting the status.
                    <span className="block mt-1 text-xs" dir="rtl">سيتم إلغاء السلفة وشطبها نهائياً.</span>
                  </AlertDescription>
                </Alert>
              )}

              {dialog.action.decision === 'return' && (
                <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
                  <RotateCcw className="h-4 w-4 text-amber-500" />
                  <AlertDescription>
                    The advance will be <strong>flagged for return collection</strong>.
                    The enumerator must return the funds. No status change is made — the advance stays as-is until funds are confirmed returned.
                    <span className="block mt-1 text-xs" dir="rtl">سيتم تسجيل طلب استرداد المبلغ من المعدّاد.</span>
                  </AlertDescription>
                </Alert>
              )}

              {dialog.action.decision === 'redirect' && (
                <Alert className="border-blue-300 bg-blue-50 dark:bg-blue-950/20">
                  <ArrowRightLeft className="h-4 w-4 text-blue-500" />
                  <AlertDescription>
                    Record the <strong>correct hub, project, or activity</strong> this advance should be charged to.
                    The advance will be updated with the new hub name.
                    <span className="block mt-1 text-xs" dir="rtl">أدخل الجهة أو المشروع الصحيح لتحديث السلفة.</span>
                  </AlertDescription>
                </Alert>
              )}

              {/* Redirect-specific: new hub field */}
              {dialog.action.decision === 'redirect' && (
                <div className="space-y-1.5">
                  <Label htmlFor="redirect-hub">
                    Correct Hub / Project / Activity <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="redirect-hub"
                    placeholder="e.g. Kassala Hub — WFP VAM"
                    value={dialog.redirectHub}
                    onChange={e => setDialog(d => ({ ...d, redirectHub: e.target.value }))}
                    disabled={dialog.saving}
                    data-testid="input-redirect-hub"
                  />
                </div>
              )}

              {/* Note field (all types) */}
              <div className="space-y-1.5">
                <Label htmlFor="exec-note">
                  {DECISION_META[dialog.action.decision].noteLabel}
                </Label>
                <Textarea
                  id="exec-note"
                  rows={3}
                  placeholder="Add any relevant notes…"
                  value={dialog.note}
                  onChange={e => setDialog(d => ({ ...d, note: e.target.value }))}
                  disabled={dialog.saving}
                  data-testid="textarea-exec-note"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialog(d => ({ ...d, open: false }))}
                disabled={dialog.saving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleExecute}
                disabled={
                  dialog.saving ||
                  (dialog.action.decision === 'redirect' && !dialog.redirectHub.trim())
                }
                className={
                  dialog.action.decision === 'writeoff' ? 'bg-red-600 hover:bg-red-700 text-white' :
                  dialog.action.decision === 'return'   ? 'bg-amber-600 hover:bg-amber-700 text-white' :
                  'bg-blue-600 hover:bg-blue-700 text-white'
                }
                data-testid="btn-confirm-execute"
              >
                {dialog.saving
                  ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Saving…</>
                  : <><CheckCircle2 className="h-4 w-4 mr-1.5" />{DECISION_META[dialog.action.decision].actionLabel}</>
                }
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
