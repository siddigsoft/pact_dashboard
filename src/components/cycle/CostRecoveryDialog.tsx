/**
 * CostRecoveryDialog — Phase B
 * Triggered when a not-covered site has an approved advance that needs resolution.
 * Three options: Roll to Next MMP | Return Required | Write-Off
 *
 * After decision: writes to cost_recovery_log + payment_event_log + dispatches
 * the correct notification (Events 5, 6, or 7 from the notification plan).
 */

import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  RotateCcw, AlertTriangle, Trash2, CheckCircle2, Loader2,
  DollarSign, Calendar, Info, ArrowRight,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { logPaymentEvent } from '@/services/paymentEventLogger';
import { dispatchNotification } from '@/lib/notify';

export type RecoveryDecision = 'rolled' | 'return_required' | 'writeoff';

export interface CostRecoverySite {
  id: string;
  site_name: string;
  site_code?: string | null;
  state?: string | null;
  mmp_id: string;
  mmp_name?: string | null;
  enumerator_id?: string | null;
  enumerator_name?: string | null;
  supervisor_id?: string | null;
}

export interface CostRecoveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  site: CostRecoverySite;
  advanceId?: string | null;
  advanceAmount: number;
  currency?: string;
  existingDecision?: string | null;
  onDecisionSaved: () => void;
}

const REPAYMENT_METHODS = [
  { value: 'cash',                    label: 'Cash Return',                  labelAr: 'إعادة نقدية' },
  { value: 'deduction_next_payment',  label: 'Deduction from Next Payment',  labelAr: 'خصم من المستحق التالي' },
  { value: 'fee_reclassification',    label: 'Move to Enumerator Fees',      labelAr: 'تحويل إلى أتعاب العداد' },
  { value: 'reuse_other_site',        label: 'Reuse for Another Site',       labelAr: 'إعادة تخصيص لموقع آخر' },
];

export function CostRecoveryDialog({
  open,
  onOpenChange,
  site,
  advanceId,
  advanceAmount,
  currency = 'SDG',
  existingDecision,
  onDecisionSaved,
}: CostRecoveryDialogProps) {
  const { currentUser } = useAppContext();
  const { toast } = useToast();

  const [step, setStep] = useState<'choose' | 'details' | 'confirm'>('choose');
  const [decision, setDecision] = useState<RecoveryDecision | null>(null);
  const [saving, setSaving] = useState(false);

  // Roll state
  const [targetMmpId, setTargetMmpId] = useState('');
  const [eligibleMmps, setEligibleMmps] = useState<{ id: string; name: string }[]>([]);
  const [loadingMmps, setLoadingMmps] = useState(false);
  const [rollNote, setRollNote] = useState('');

  // Return state
  const [repaymentMethod, setRepaymentMethod] = useState('');
  const [repaymentDeadline, setRepaymentDeadline] = useState('');
  const [returnNote, setReturnNote] = useState('');

  // Write-off state
  const [writeoffReason, setWriteoffReason] = useState('');
  const [writeoffSignatureName, setWriteoffSignatureName] = useState('');

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setStep('choose');
      setDecision(null);
      setTargetMmpId('');
      setRollNote('');
      setRepaymentMethod('');
      setRepaymentDeadline('');
      setReturnNote('');
      setWriteoffReason('');
      setWriteoffSignatureName('');
    }
  }, [open]);

  // Load eligible MMPs when Roll is chosen
  useEffect(() => {
    if (decision === 'rolled' && site.enumerator_id && site.state) {
      setLoadingMmps(true);
      supabase
        .from('mmp_files')
        .select('id, name')
        .in('status', ['active', 'draft'])
        .neq('id', site.mmp_id)
        .then(({ data }) => {
          setEligibleMmps((data || []).map((m: any) => ({ id: m.id, name: m.name })));
          setLoadingMmps(false);
        });
    }
  }, [decision, site.enumerator_id, site.state, site.mmp_id]);

  const handleChooseDecision = (d: RecoveryDecision) => {
    setDecision(d);
    setStep('details');
  };

  const isDetailsValid = () => {
    if (decision === 'rolled') return Boolean(targetMmpId);
    if (decision === 'return_required') return Boolean(repaymentMethod && repaymentDeadline);
    if (decision === 'writeoff') return writeoffReason.trim().length >= 10 && writeoffSignatureName.trim().length >= 3;
    return false;
  };

  const handleSave = async () => {
    if (!decision || !currentUser?.id) return;
    setSaving(true);
    try {
      const targetMmpName = eligibleMmps.find(m => m.id === targetMmpId)?.name || null;

      // 1. Write to cost_recovery_log
      const payload: Record<string, unknown> = {
        site_entry_id: site.id,
        mmp_id: site.mmp_id,
        amount: advanceAmount,
        amount_currency: currency,
        decision,
        decided_by: currentUser.id,
        decided_by_name: currentUser.full_name || currentUser.email || 'Admin',
        decided_by_role: (currentUser as any).role || '',
        enumerator_id: site.enumerator_id || null,
        enumerator_name: site.enumerator_name || null,
      };

      if (advanceId) {
        payload.down_payment_request_id = advanceId as any;
      }

      if (decision === 'rolled') {
        payload.target_mmp_id = targetMmpId;
        payload.target_mmp_name = targetMmpName;
        payload.decision_note = rollNote || null;
      } else if (decision === 'return_required') {
        payload.repayment_method = repaymentMethod;
        payload.repayment_deadline = repaymentDeadline;
        payload.repayment_status = 'pending';
        payload.decision_note = returnNote || null;
      } else if (decision === 'writeoff') {
        payload.writeoff_reason = writeoffReason;
        payload.writeoff_signed_by = currentUser.id;
        payload.writeoff_signed_by_name = writeoffSignatureName;
        payload.writeoff_signed_at = new Date().toISOString();
        payload.writeoff_signature_method = 'typed_name';
      }

      const { error: logErr } = await supabase
        .from('cost_recovery_log')
        .upsert(payload as any, { onConflict: 'site_entry_id' });

      if (logErr) throw new Error(logErr.message);

      // 2. Write to payment_event_log
      const eventTypeMap: Record<RecoveryDecision, string> = {
        rolled:           'recovery_decision_rolled',
        return_required:  'recovery_decision_return_required',
        writeoff:         'recovery_decision_writeoff',
      };

      await logPaymentEvent({
        eventType: eventTypeMap[decision] as any,
        amount: advanceAmount,
        amountCurrency: currency,
        siteEntryId: site.id,
        mmpId: site.mmp_id,
        paymentRefId: advanceId || null,
        performedById: currentUser.id,
        performedByName: currentUser.full_name || '',
        performedByRole: (currentUser as any).role || '',
        enumeratorId: site.enumerator_id || null,
        note: decision === 'rolled' ? rollNote : decision === 'return_required' ? returnNote : writeoffReason,
        metadata: decision === 'rolled'
          ? { target_mmp_id: targetMmpId, target_mmp_name: targetMmpName }
          : decision === 'return_required'
            ? { repayment_method: repaymentMethod, repayment_deadline: repaymentDeadline }
            : { writeoff_reason: writeoffReason },
      });

      // 3. Dispatch notifications
      const adminName = currentUser.full_name || 'Admin';
      const amountStr = `${advanceAmount.toLocaleString()} ${currency}`;
      const siteName = site.site_name;
      const mmpName = site.mmp_name || 'this MMP';
      const recipients: string[] = [];
      if (site.enumerator_id) recipients.push(site.enumerator_id);
      if (site.supervisor_id) recipients.push(site.supervisor_id);

      if (decision === 'rolled' && recipients.length > 0) {
        await dispatchNotification({
          event: 'cost_recovery_rolled',
          recipientIds: recipients,
          titleEn: 'Your Payment Rolled to Next Cycle',
          titleAr: 'تم ترحيل دفعتك إلى الدورة القادمة',
          messageEn: `${amountStr} approved for ${siteName} has been rolled forward to ${targetMmpName || 'the next MMP'}. The amount will be pre-approved for your next visit.`,
          messageAr: `تم ترحيل ${amountStr} المعتمد لموقع ${siteName} إلى خطة ${targetMmpName || 'التالية'}. سيكون المبلغ معتمداً مسبقاً لزيارتك القادمة.`,
          priority: 'normal',
          entityType: 'mmp',
          entityId: site.mmp_id,
          actionUrl: `/down-payment?mmp=${targetMmpId}`,
          sendWhatsApp: true,
          sendEmail: false,
          triggeredBy: currentUser.id,
          triggeredByName: adminName,
        });
      } else if (decision === 'return_required') {
        const methodLabel = REPAYMENT_METHODS.find(m => m.value === repaymentMethod)?.label || repaymentMethod;
        const notifyIds: string[] = [];
        if (site.enumerator_id) notifyIds.push(site.enumerator_id);

        // Also notify finance officers
        const { data: financeUsers } = await supabase
          .from('profiles')
          .select('id')
          .in('role', ['finance', 'Finance'])
          .eq('status', 'approved');
        (financeUsers || []).forEach((f: any) => notifyIds.push(f.id));

        if (notifyIds.length > 0) {
          await dispatchNotification({
            event: 'cost_recovery_return_required',
            recipientIds: notifyIds,
            titleEn: 'Return of Payment Required',
            titleAr: 'مطلوب إعادة الدفعة',
            messageEn: `${amountStr} received for ${siteName} must be returned by ${repaymentDeadline}. Method: ${methodLabel}.`,
            messageAr: `يجب إعادة ${amountStr} المستلم لموقع ${siteName} بحلول ${repaymentDeadline}. الطريقة: ${methodLabel}.`,
            priority: 'high',
            entityType: 'mmp',
            entityId: site.mmp_id,
            actionUrl: `/down-payment?tab=recoveries`,
            sendWhatsApp: true,
            sendEmail: true,
            triggeredBy: currentUser.id,
            triggeredByName: adminName,
          });
        }
      } else if (decision === 'writeoff') {
        const { data: financeAndSuperAdmin } = await supabase
          .from('profiles')
          .select('id')
          .in('role', ['finance', 'Finance', 'super_admin', 'Super Admin', 'superAdmin', 'SuperAdmin'])
          .eq('status', 'approved');
        const notifyIds = (financeAndSuperAdmin || []).map((p: any) => p.id);

        if (notifyIds.length > 0) {
          await dispatchNotification({
            event: 'cost_recovery_writeoff_approved',
            recipientIds: notifyIds,
            titleEn: 'Payment Write-Off Approved',
            titleAr: 'تمت الموافقة على شطب الدفعة',
            messageEn: `${amountStr} for ${siteName} in ${mmpName} has been written off. Approved by: ${adminName}. Reason: ${writeoffReason}`,
            messageAr: `تم شطب ${amountStr} لموقع ${siteName} في خطة ${mmpName}. اعتمده: ${adminName}. السبب: ${writeoffReason}`,
            priority: 'normal',
            entityType: 'mmp',
            entityId: site.mmp_id,
            sendEmail: true,
            triggeredBy: currentUser.id,
            triggeredByName: adminName,
          });
        }
      }

      toast({
        title: 'Recovery decision saved',
        description: decisionLabel(decision),
      });

      onDecisionSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="dialog-cost-recovery">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-amber-500" />
            Cost Recovery — {site.site_name}
          </DialogTitle>
          <DialogDescription>
            <span dir="rtl" className="block text-right text-xs text-muted-foreground">استرداد التكلفة</span>
            An advance of <strong>{advanceAmount.toLocaleString()} {currency}</strong> was approved for this
            site but it was marked <em>Not Covered</em>. Choose how to resolve the money.
          </DialogDescription>
        </DialogHeader>

        {/* ── STEP: CHOOSE ─────────────────────────────────────── */}
        {step === 'choose' && (
          <div className="space-y-3 py-2" data-testid="recovery-step-choose">
            <OptionCard
              icon={<RotateCcw className="h-5 w-5 text-blue-500" />}
              title="Roll to Next MMP"
              titleAr="ترحيل للدورة التالية"
              description="Keep the money with the same enumerator — pre-allocate it to a future MMP cycle."
              descriptionAr="الاحتفاظ بالمبلغ مع العداد وتخصيصه مسبقاً لدورة مستقبلية."
              onClick={() => handleChooseDecision('rolled')}
              testId="button-recovery-roll"
            />
            <OptionCard
              icon={<AlertTriangle className="h-5 w-5 text-amber-500" />}
              title="Return Required"
              titleAr="مطلوب الإعادة"
              description="Require the enumerator to return the money. Set a deadline and repayment method."
              descriptionAr="طلب إعادة المبلغ من العداد مع تحديد الطريقة والموعد النهائي."
              onClick={() => handleChooseDecision('return_required')}
              testId="button-recovery-return"
            />
            <OptionCard
              icon={<Trash2 className="h-5 w-5 text-red-500" />}
              title="Write Off"
              titleAr="شطب المبلغ"
              description="Write off the amount. Requires a justification and your typed signature."
              descriptionAr="شطب المبلغ مع توقيع التبرير. يتطلب ذلك توقيعك."
              onClick={() => handleChooseDecision('writeoff')}
              testId="button-recovery-writeoff"
            />
          </div>
        )}

        {/* ── STEP: DETAILS ────────────────────────────────────── */}
        {step === 'details' && decision === 'rolled' && (
          <div className="space-y-4 py-2" data-testid="recovery-step-roll">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                The enumerator keeps the money. It will be pre-approved for the same enumerator in the MMP you select below.
              </AlertDescription>
            </Alert>
            <div className="space-y-1">
              <Label>Target MMP <span className="text-red-500">*</span></Label>
              {loadingMmps ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading eligible MMPs…
                </div>
              ) : (
                <Select value={targetMmpId} onValueChange={setTargetMmpId}>
                  <SelectTrigger data-testid="select-target-mmp">
                    <SelectValue placeholder="Select target MMP…" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleMmps.length === 0
                      ? <SelectItem value="_none" disabled>No eligible MMPs found</SelectItem>
                      : eligibleMmps.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1">
              <Label>Note (optional)</Label>
              <Textarea
                value={rollNote}
                onChange={e => setRollNote(e.target.value)}
                placeholder="Any context for the roll-over…"
                className="min-h-[64px]"
                data-testid="input-roll-note"
              />
            </div>
          </div>
        )}

        {step === 'details' && decision === 'return_required' && (
          <div className="space-y-4 py-2" data-testid="recovery-step-return">
            <Alert>
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <AlertDescription>
                The enumerator will be notified and must return <strong>{advanceAmount.toLocaleString()} {currency}</strong> by the deadline.
              </AlertDescription>
            </Alert>
            <div className="space-y-1">
              <Label>Repayment Method <span className="text-red-500">*</span></Label>
              <Select value={repaymentMethod} onValueChange={setRepaymentMethod}>
                <SelectTrigger data-testid="select-repayment-method">
                  <SelectValue placeholder="Select method…" />
                </SelectTrigger>
                <SelectContent>
                  {REPAYMENT_METHODS.map(m => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                      <span dir="rtl" className="ml-2 text-xs text-muted-foreground"> {m.labelAr}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Repayment Deadline <span className="text-red-500">*</span></Label>
              <Input
                type="date"
                value={repaymentDeadline}
                onChange={e => setRepaymentDeadline(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                data-testid="input-repayment-deadline"
              />
            </div>
            <div className="space-y-1">
              <Label>Note (optional)</Label>
              <Textarea
                value={returnNote}
                onChange={e => setReturnNote(e.target.value)}
                placeholder="Additional instructions for enumerator or finance…"
                className="min-h-[64px]"
                data-testid="input-return-note"
              />
            </div>
          </div>
        )}

        {step === 'details' && decision === 'writeoff' && (
          <div className="space-y-4 py-2" data-testid="recovery-step-writeoff">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This action permanently writes off <strong>{advanceAmount.toLocaleString()} {currency}</strong>.
                This is recorded in the financial audit log and cannot be undone without Super Admin override.
              </AlertDescription>
            </Alert>
            <div className="space-y-1">
              <Label>Justification <span className="text-red-500">*</span> <span className="text-xs text-muted-foreground">(minimum 10 characters)</span></Label>
              <Textarea
                value={writeoffReason}
                onChange={e => setWriteoffReason(e.target.value)}
                placeholder="Provide a clear reason for writing off this amount…"
                className="min-h-[80px]"
                data-testid="input-writeoff-reason"
              />
              <p className="text-xs text-muted-foreground">{writeoffReason.length}/10 minimum</p>
            </div>
            <div className="space-y-1">
              <Label>
                Type your full name to authorize <span className="text-red-500">*</span>
                <span dir="rtl" className="mr-1 text-xs text-muted-foreground"> (اكتب اسمك الكامل للتفويض)</span>
              </Label>
              <Input
                value={writeoffSignatureName}
                onChange={e => setWriteoffSignatureName(e.target.value)}
                placeholder="Your full name…"
                data-testid="input-writeoff-signature"
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === 'choose' && (
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-recovery">
              Cancel
            </Button>
          )}
          {step === 'details' && (
            <>
              <Button variant="outline" onClick={() => setStep('choose')} data-testid="button-back-recovery">
                Back
              </Button>
              <Button
                onClick={handleSave}
                disabled={!isDetailsValid() || saving}
                className={decision === 'writeoff' ? 'bg-red-600 hover:bg-red-700 text-white' : ''}
                data-testid="button-confirm-recovery"
              >
                {saving
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</>
                  : <><CheckCircle2 className="h-4 w-4 mr-2" /> {decisionLabel(decision)} </>}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function decisionLabel(d: RecoveryDecision | null) {
  if (d === 'rolled') return 'Confirm Roll-Over';
  if (d === 'return_required') return 'Require Return';
  if (d === 'writeoff') return 'Authorize Write-Off';
  return 'Confirm';
}

function OptionCard({
  icon, title, titleAr, description, descriptionAr, onClick, testId,
}: {
  icon: React.ReactNode;
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="w-full text-left rounded-lg border border-border bg-card p-4 hover:bg-accent hover:border-primary/30 transition-colors group"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm">{title}</span>
            <span dir="rtl" className="text-xs text-muted-foreground">{titleAr}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
          <p dir="rtl" className="text-xs text-muted-foreground/70 mt-0.5 text-right">{descriptionAr}</p>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </button>
  );
}
