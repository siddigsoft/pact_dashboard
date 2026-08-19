
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Info, CheckCircle2, Loader2, Download, AlertCircle, ChevronDown, ChevronUp,
  Calendar, CreditCard, User, Hash, Receipt, Building2, Plus, Trash2, Sparkles,
  AlertTriangle, RotateCcw } from 'lucide-react';
import type { WizardState, ExceptionDecision, RoleFlags } from '../CycleCloseWizard';
import {
  canExecuteExceptionDecision,
  getAvailableExceptionDecisionValues,
  getExceptionDecisionKey,
  isExceptionDecisionDraftValid,
} from '../exceptionExecution';
import {
  buildAutomaticRedirectAllocations,
  getRedirectTargetCapacity,
  isEligibleRedirectAllocationTarget,
  summarizeRedirectAllocations,
  type RedirectAllocationDraft,
  type RedirectSettlementTarget,
} from '../redirectSettlement';
import { exportFormattedExceptions, type ExceptionSite } from '@/utils/cycleCloseExport';

interface Props {
  wizardState: WizardState;
  updateWizardState: (patch: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
  canGoBack: boolean;
  canOverride: boolean;
  roleFlags?: RoleFlags;
  currentUser: any;
}

interface OpenMmp {
  id: string;
  name: string;
  status: string | null;
  cycle_status: string | null;
  created_at: string | null;
}

interface TargetSite {
  id: string;
  site_name: string;
  state: string | null;
  locality: string | null;
  status: string | null;
  not_covered_flag?: boolean | null;
  enumerator_fee: number | null;
  transport_fee: number | null;
  fee_paid_amount: number | null;
  fee_cash_paid_amount?: number | null;
  fee_advance_offset_amount?: number | null;
  accepted_by?: string | null;
  sameEnumerator?: boolean;
}

interface CorrectedRedirectHistory {
  actionId: string;
  correctedAt?: string;
  correctedByName?: string;
  correctionReason?: string;
  originalJournalEntryId?: string;
  reversalJournalEntryId?: string;
  replacementActionId?: string;
}

interface FiscalPeriod {
  id: string;
  period_no: number;
  start_date: string;
  end_date: string;
  status: 'open' | 'soft_closed';
}

interface RedirectCorrectionDialog {
  site: ExceptionSite;
  decision: ExceptionDecision;
  reason: string;
  periodId: string;
  idempotencyKey: string;
  periods: FiscalPeriod[];
  loadingPeriods: boolean;
  submitting: boolean;
  error?: string;
}

const toSettlementTarget = (target: TargetSite): RedirectSettlementTarget => ({
  id: target.id,
  siteName: target.site_name,
  status: target.not_covered_flag ? 'not_covered' : target.status,
  enumeratorFee: target.enumerator_fee,
  transportFee: target.transport_fee,
  settledFeeAmount: target.fee_paid_amount,
  enumeratorId: target.accepted_by,
  sameEnumerator: target.sameEnumerator,
});

// ── Decision sets ─────────────────────────────────────────────────────────────

const DECISIONS_PAID = [
  {
    value: 'reassign',
    label: 'Reassign to Covered Site',
    labelAr: 'إعادة تعيين لموقع مغطى',
    desc: 'Move the already-paid advance to another covered site in this cycle.',
    descAr: 'نقل السلفة المصروفة إلى موقع مغطى آخر في هذه الدورة.',
    track: 'Select another covered site. The original payment stays intact and the advance is re-linked without a second payment.',
    trackAr: 'اختر موقعاً مغطى آخر. تبقى الدفعة الأصلية كما هي وتُعاد ربط السلفة دون دفعة ثانية.',
  },
  {
    value: 'roll',
    label: 'Roll to Next MMP',
    labelAr: 'رحّل إلى الدورة التالية',
    desc: 'Treat as pre-payment for the next cycle.',
    descAr: 'تُعامَل كدفعة مقدمة للدورة القادمة.',
    track: 'Select the target cycle and covered site here. The advance is re-linked before Final Close.',
    trackAr: 'اختر الدورة والموقع المغطى هنا. تُنقل السلفة قبل الإغلاق النهائي.',
  },
  {
    value: 'return',
    label: 'Return Required',
    labelAr: 'استرداد مطلوب',
    desc: 'Enumerator must return the cash.',
    descAr: 'يجب على المعدد إعادة المبلغ نقداً.',
    track: 'Record the actual collection date, method, and receipt reference here. The recovery posts to GL immediately.',
    trackAr: 'سجّل تاريخ وطريقة الاستلام ومرجع الإيصال هنا. يُرحّل الاسترداد محاسبياً فوراً.',
  },
  {
    value: 'writeoff',
    label: 'Write-Off',
    labelAr: 'شطب',
    desc: 'Amount is too small or unrecoverable. Justification required.',
    descAr: 'المبلغ صغير جداً أو يتعذر استرداده. مطلوب مبرر.',
    track: 'Authorized staff record the justification and post the write-off to GL before Final Close.',
    trackAr: 'يسجّل الموظف المخوّل المبرر ويُرحّل الشطب محاسبياً قبل الإغلاق النهائي.',
  },
  {
    value: 'redirect',
    label: 'Redirect to Enumerator Fees',
    labelAr: 'تحويل إلى أتعاب المعددين',
    desc: 'Use the paid transport advance to settle an eligible covered site’s outstanding fee.',
    descAr: 'استخدم سلفة النقل المصروفة لتسوية الأتعاب المتبقية لموقع مغطى مؤهل.',
    track: 'Allocate across one or more covered sites. Each target may be fully or partially settled. GL: Debit Enumerator Fees / Credit Transport Advance; no second payment is created.',
    trackAr: 'وزّع السلفة على موقع مغطى واحد أو أكثر، كلياً أو جزئياً. القيد: مدين أتعاب المعددين / دائن سلفة النقل دون دفعة ثانية.',
  },
] as const;

const DECISIONS_APPROVED = [
  {
    value: 'cancel',
    label: 'Cancel & Void',
    labelAr: 'إلغاء وشطب الطلب',
    desc: 'Cancel the advance request before disbursement — no money moves.',
    descAr: 'إلغاء طلب السلفة قبل الصرف — لا يتحرك أي مبلغ.',
    track: 'Advance request marked "cancelled". No payment record created. Visible in the Exceptions sheet.',
    trackAr: 'يُعلَّم الطلب بحالة "ملغى". لا يُنشأ أي سجل دفع.',
  },
  {
    value: 'hold',
    label: 'Hold for Next MMP',
    labelAr: 'تعليق ونقل للدورة التالية',
    desc: 'Keep approved but defer payment to the next cycle.',
    descAr: 'يبقى الطلب موافقاً عليه مع تأجيل الصرف للدورة القادمة.',
    track: 'Select the target cycle and covered site here. The approved advance is moved before Final Close.',
    trackAr: 'اختر الدورة والموقع المغطى هنا. يُنقل طلب السلفة المعتمد قبل الإغلاق النهائي.',
  },
  {
    value: 'reassign',
    label: 'Reassign to Covered Site',
    labelAr: 'إعادة تعيين لموقع مغطى',
    desc: 'Move this advance to a site the enumerator DID cover in this cycle.',
    descAr: 'نقل السلفة إلى موقع قام المعدد بتغطيته في هذه الدورة.',
    track: 'Advance re-linked to the selected confirmed site. Visible in Step 5 Reconciliation and the Final Close workbook.',
    trackAr: 'تُربط السلفة بالموقع المؤكد المحدد. تظهر في مطابقة الخطوة ٥ وتقرير الإغلاق.',
  },
  {
    value: 'reduce',
    label: 'Reduce & Approve',
    labelAr: 'تعديل وتحديد المبلغ',
    desc: 'Approve a smaller amount reflecting confirmed work only.',
    descAr: 'الموافقة على مبلغ أقل يعكس العمل المؤكد فعلياً.',
    track: 'Advance request updated with the reduced amount and approved for payment.',
    trackAr: 'يُحدَّث الطلب بالمبلغ المعدَّل ويُوافق عليه للصرف.',
  },
] as const;

type PaidDecision    = typeof DECISIONS_PAID[number]['value'];
type ApprovedDecision = typeof DECISIONS_APPROVED[number]['value'];

const isPaidSite    = (s: ExceptionSite) => s.advanceStatus !== 'approved';
const isApprovedSite = (s: ExceptionSite) => s.advanceStatus === 'approved';
const exceptionKey = (s: ExceptionSite) => getExceptionDecisionKey(s);
const paidDecisionsFor = (s: ExceptionSite) =>
  DECISIONS_PAID.filter(d => getAvailableExceptionDecisionValues(s).includes(d.value));
const approvedDecisionsFor = (s: ExceptionSite) =>
  DECISIONS_APPROVED.filter(d => getAvailableExceptionDecisionValues(s).includes(d.value));

// ── Component ─────────────────────────────────────────────────────────────────

export default function Step5Exceptions({
  wizardState, updateWizardState, onNext, onBack, canGoBack, canOverride,
  roleFlags, currentUser,
}: Props) {
  const [exceptions, setExceptions]           = useState<ExceptionSite[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [showPaidGuide, setShowPaidGuide]     = useState(false);
  const [showApprGuide, setShowApprGuide]     = useState(false);
  const [openMmps, setOpenMmps]               = useState<OpenMmp[]>([]);
  const [targetCycleLoadError, setTargetCycleLoadError] = useState<string | null>(null);
  const [targetSites, setTargetSites]          = useState<Record<string, TargetSite[]>>({});
  const [loadingTargetSites, setLoadingTargetSites] = useState<Record<string, boolean>>({});
  const [executing, setExecuting]              = useState<Record<string, boolean>>({});
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [correctedRedirects, setCorrectedRedirects] = useState<Record<string, CorrectedRedirectHistory[]>>({});
  const [correctionDialog, setCorrectionDialog] = useState<RedirectCorrectionDialog | null>(null);
  const decisionsRef = useRef(wizardState.exceptionDecisions);

  useEffect(() => {
    decisionsRef.current = wizardState.exceptionDecisions;
  }, [wizardState.exceptionDecisions]);

  const canExecute = !!(
    roleFlags?.isFinance || roleFlags?.isFOM || roleFlags?.isAdmin || roleFlags?.isSuperAdmin
  );
  const correctionRole = String(currentUser?.role ?? '').toLowerCase().replace(/[\s_()-]+/g, '');
  const canCorrectRedirect = ['superadmin', 'finance', 'accountant']
    .includes(correctionRole);
  useEffect(() => {
    if (wizardState.selectedMmpId) loadExceptions();
  }, [wizardState.selectedMmpId, wizardState.uncoveredReasons]);

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadExceptions = async () => {
    setLoading(true);
    const notCoveredIds = Object.keys(wizardState.uncoveredReasons);

    // Load persisted successful actions first. They remain reviewable after the
    // wizard is reopened, even when the transient uncovered-reason state is gone.
    const [actionsResult, mmpResult] = await Promise.all([
      supabase
        .from('cycle_exception_actions')
        .select('id, advance_id, mmp_site_entry_id, decision, decision_amount, justification, target_site_id, rollover_mmp_id, rollover_site_id, rollover_site_name, receipt_reference, return_method, recovery_date, executed, executed_at, executed_by_name, gl_journal_entry_id, execution_error, redirect_fee_gross_amount, redirect_fee_prior_settled_amount, redirect_fee_settled_amount, redirect_fee_remaining_amount, redirect_fee_status, source_payment_references, correction_status, corrected_at, corrected_by_name, correction_reason, correction_reversal_journal_id, correction_replacement_action_id')
        .eq('mmp_file_id', wizardState.selectedMmpId!)
        .eq('executed', true),
      supabase
        .from('mmp_files')
        .select('id, name, status, cycle_status, created_at')
        .neq('id', wizardState.selectedMmpId!)
        .order('created_at', { ascending: false }),
    ]);
    const actionRows = (actionsResult.data ?? []) as any[];
    const correctedActionIds = new Set(
      actionRows
        .filter(row => row.correction_status === 'reopened_for_correction')
        .map(row => row.id as string),
    );
    const correctedByAdvance = actionRows.reduce<Record<string, CorrectedRedirectHistory[]>>((history, row) => {
      if (!row.advance_id || row.correction_status !== 'reopened_for_correction') return history;
      (history[row.advance_id] ??= []).push({
        actionId: row.id,
        correctedAt: row.corrected_at ?? undefined,
        correctedByName: row.corrected_by_name ?? undefined,
        correctionReason: row.correction_reason ?? undefined,
        originalJournalEntryId: row.gl_journal_entry_id ?? undefined,
        reversalJournalEntryId: row.correction_reversal_journal_id ?? undefined,
        replacementActionId: row.correction_replacement_action_id ?? undefined,
      });
      return history;
    }, {});
    setCorrectedRedirects(correctedByAdvance);
    const actionIds = actionRows.map(row => row.id as string).filter(Boolean);
    let allocationRows: any[] = [];
    if (actionIds.length) {
      const allocationResult = await (supabase as any)
        .from('cycle_exception_action_allocations')
        .select('id, action_id, target_site_id, target_site_name, target_enumerator_id, cross_enumerator, amount, fee_gross_amount, fee_prior_settled_amount, fee_remaining_amount, fee_status, gl_journal_entry_id')
        .in('action_id', actionIds)
        .order('allocation_order');
      if (allocationResult.error) {
        const message = String(allocationResult.error.message ?? '').toLowerCase();
        if (!message.includes('does not exist') && !message.includes('schema cache')) {
          console.error('[CycleClose] Could not load redirect allocations:', allocationResult.error);
        }
      } else {
        allocationRows = allocationResult.data ?? [];
      }
    }
    const allocationsByAction = allocationRows.reduce<Record<string, any[]>>((rows, allocation) => {
      (rows[allocation.action_id] ??= []).push(allocation);
      return rows;
    }, {});
    const actionSiteIds = actionRows
      .map(row => row.mmp_site_entry_id as string | null)
      .filter((id): id is string => !!id);
    const actionAdvanceIds = actionRows
      .map(row => row.advance_id as string | null)
      .filter((id): id is string => !!id);
    const sourceSiteIds = [...new Set([...notCoveredIds, ...actionSiteIds])];

    if (mmpResult.error) {
      console.error('[CycleClose] Could not load target cycles:', mmpResult.error);
      setOpenMmps([]);
      setTargetCycleLoadError(`Could not load target cycles: ${mmpResult.error.message}`);
    } else {
      setTargetCycleLoadError(null);
      setOpenMmps(((mmpResult.data ?? []) as OpenMmp[]).filter(mmp =>
        mmp.status !== 'closed' && mmp.cycle_status !== 'closed'
      ));
    }

    if (!sourceSiteIds.length) {
      setExceptions([]);
      setLoading(false);
      return;
    }

    // Load by both source site and action advance ID. Roll/cancel actions can
    // move or change the advance, so source-site filtering alone loses history.
    const advanceSelect = [
      'id', 'mmp_site_entry_id', 'status',
      'total_paid_amount', 'requested_amount', 'remaining_amount',
      'payment_type', 'installment_plan', 'paid_installments', 'wallet_transaction_ids',
      'requested_by', 'requested_at',
      'supervisor_approved_by', 'supervisor_approved_at',
      'admin_processed_by', 'admin_processed_at',
    ].join(', ');
    const [siteResult, siteAdvancesResult, actionAdvancesResult] = await Promise.all([
      supabase
        .from('mmp_site_entries')
        .select('id, site_name, state, locality, accepted_by, enumerator_fee, transport_fee, fee_paid_status, fee_paid_amount, fee_cash_paid_amount, fee_advance_offset_amount, fee_paid_at, fee_payment_method, fee_payment_notes')
        .in('id', sourceSiteIds),
      supabase
        .from('down_payment_requests')
        .select(advanceSelect)
        .in('mmp_site_entry_id', sourceSiteIds),
      actionAdvanceIds.length
        ? supabase
          .from('down_payment_requests')
          .select(advanceSelect)
          .in('id', actionAdvanceIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const siteData = siteResult.data;
    if (!siteData?.length) {
      setExceptions([]);
      setLoading(false);
      return;
    }

    // Build one exception record per active advance. The server close gate is
    // also advance-scoped, so collapsing these by site can strand a second
    // advance with no executable card.
    interface AdvanceRec {
      id: string;
      siteId: string;
      paidAmount: number;
      requestedAmount: number;
      remainingAmount: number | null;
      status: 'paid' | 'fully_paid' | 'partially_paid' | 'approved';
      approvedById: string | null;
      requestedById: string | null;
      requestedAt: string | null;
      paymentType: 'full_advance' | 'installments' | null;
      supervisorApprovedAt: string | null;
      adminProcessedById: string | null;
      adminProcessedAt: string | null;
      installmentPlan: any[];
      paidInstallments: any[];
      walletTransactionIds: string[];
    }
    const activeAdvanceStatuses = new Set(['approved', 'paid', 'partially_paid', 'fully_paid']);
    const executedAdvanceIdSet = new Set(actionAdvanceIds);
    const advancesById = new Map<string, any>();
    for (const advance of [
      ...((siteAdvancesResult.data ?? []) as any[]),
      ...((actionAdvancesResult.data ?? []) as any[]),
    ]) {
      advancesById.set(advance.id, advance);
    }
    const advances: AdvanceRec[] = [...advancesById.values()]
      .filter(a => activeAdvanceStatuses.has(a.status) || executedAdvanceIdSet.has(a.id))
      .map(a => ({
      id: a.id as string,
      siteId: a.mmp_site_entry_id as string,
      paidAmount: (a.total_paid_amount as number) ?? 0,
      requestedAmount: (a.requested_amount as number) ?? 0,
      remainingAmount: a.remaining_amount ?? null,
      status: activeAdvanceStatuses.has(a.status)
        ? a.status as AdvanceRec['status']
        : ((a.total_paid_amount ?? 0) > 0 ? 'paid' : 'approved'),
      approvedById: (a.supervisor_approved_by as string | null) ?? null,
      requestedById: (a.requested_by as string | null) ?? null,
      requestedAt: (a.requested_at as string | null) ?? null,
      paymentType: (a.payment_type as 'full_advance' | 'installments' | null) ?? null,
      supervisorApprovedAt: (a.supervisor_approved_at as string | null) ?? null,
      adminProcessedById: (a.admin_processed_by as string | null) ?? null,
      adminProcessedAt: (a.admin_processed_at as string | null) ?? null,
      installmentPlan: (a.installment_plan as any[]) ?? [],
      paidInstallments: (a.paid_installments as any[]) ?? [],
      walletTransactionIds: (a.wallet_transaction_ids as string[]) ?? [],
    }));

    // ── Round 2: all profile lookups in parallel ─────────────────────────────
    const enumUuids        = [...new Set((siteData as any[]).map((s: any) => s.accepted_by).filter(Boolean))];
    const approverUuids    = [...new Set(advances.map(r => r.approvedById).filter(Boolean) as string[])];
    const requesterUuids   = [...new Set(advances.map(r => r.requestedById).filter(Boolean) as string[])];
    const adminUuids       = [...new Set(advances.map(r => r.adminProcessedById).filter(Boolean) as string[])];

    // Merge all secondary UUIDs into one batch (avoids 4 separate profile queries)
    const allSecondaryUuids = [...new Set([...approverUuids, ...requesterUuids, ...adminUuids])];

    const [profileResult, secondaryResult] = await Promise.all([
      enumUuids.length
        ? supabase.from('profiles').select('id, full_name').in('id', enumUuids)
        : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
      allSecondaryUuids.length
        ? supabase.from('profiles').select('id, full_name').in('id', allSecondaryUuids)
        : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
    ]);

    const nameMap: Record<string, string> = {};
    for (const p of (profileResult.data ?? [])) { if (p.full_name) nameMap[p.id] = p.full_name; }
    const approverNameMap: Record<string, string> = {};
    for (const p of (secondaryResult.data ?? [])) { if (p.full_name) approverNameMap[p.id] = p.full_name; }

    const siteById = Object.fromEntries((siteData as any[]).map((s: any) => [s.id, s]));
    const actionSourceSiteByAdvance = Object.fromEntries(
      actionRows
        .filter(row => row.advance_id && row.mmp_site_entry_id)
        .map(row => [row.advance_id, row.mmp_site_entry_id]),
    );
    const exceptionSites: ExceptionSite[] = advances
      .filter(adv => !!siteById[actionSourceSiteByAdvance[adv.id] ?? adv.siteId])
      .map(adv => {
        const sourceSiteId = actionSourceSiteByAdvance[adv.id] ?? adv.siteId;
        const s = siteById[sourceSiteId];
        return {
          siteId:              sourceSiteId,
          siteName:            s.site_name as string,
          state:               s.state as string,
          locality:            s.locality as string,
          enumeratorId:        (s.accepted_by as string | null) ?? undefined,
          enumeratorName:      s.accepted_by ? (nameMap[s.accepted_by] ?? 'Unknown') : 'Unassigned',
          advancePaid:         adv.paidAmount,
          requestedAmount:     adv.requestedAmount,
          remainingAmount:     adv.remainingAmount ?? undefined,
          advanceStatus:       adv.status,
          advanceId:           adv.id,
          approvedByName:      adv.approvedById     ? (approverNameMap[adv.approvedById]     ?? 'Unknown approver') : undefined,
          requestedByName:     adv.requestedById    ? (approverNameMap[adv.requestedById]    ?? undefined)          : undefined,
          requestedAt:         adv.requestedAt      ?? undefined,
          paymentType:         adv.paymentType      ?? undefined,
          supervisorApprovedAt: adv.supervisorApprovedAt ?? undefined,
          adminProcessedByName: adv.adminProcessedById ? (approverNameMap[adv.adminProcessedById] ?? undefined) : undefined,
          adminProcessedAt:    adv.adminProcessedAt ?? undefined,
          installmentPlan:     adv.installmentPlan,
          paidInstallments:    adv.paidInstallments,
          walletTransactionIds: adv.walletTransactionIds,
          feePaidStatus:       (s.fee_paid_status as 'unpaid' | 'partially_paid' | 'paid' | null) ?? undefined,
          feePaidAmount:       s.fee_paid_amount ?? undefined,
          feeCashPaidAmount:   s.fee_cash_paid_amount ?? undefined,
          feeAdvanceOffsetAmount: s.fee_advance_offset_amount ?? undefined,
          feeRemainingAmount:  Math.max(
            ((s.enumerator_fee ?? 0) + (s.transport_fee ?? 0)) - (s.fee_paid_amount ?? 0),
            0,
          ),
          feePaidAt:           s.fee_paid_at ?? undefined,
          feePaymentMethod:    s.fee_payment_method ?? undefined,
          feePaymentNotes:     s.fee_payment_notes ?? undefined,
        };
      });

    setExceptions(exceptionSites);

    const executedFromServer: Record<string, ExceptionDecision> = {};
    for (const row of actionRows) {
      if (!row.advance_id || correctedActionIds.has(row.id)) continue;
      executedFromServer[row.advance_id] = {
        decision: row.decision,
        amount: row.decision_amount ?? undefined,
        justification: row.justification ?? undefined,
        targetMmpId: row.rollover_mmp_id ?? undefined,
        targetSiteId: row.rollover_site_id ?? row.target_site_id ?? undefined,
        targetSiteName: row.rollover_site_name ?? undefined,
        receiptReference: row.receipt_reference ?? undefined,
        returnMethod: row.return_method ?? undefined,
        recoveryDate: row.recovery_date ?? undefined,
        executed: true,
        actionId: row.id,
        executedAt: row.executed_at ?? undefined,
        executedByName: row.executed_by_name ?? undefined,
        journalEntryId: row.gl_journal_entry_id ?? undefined,
        executionError: row.execution_error ?? undefined,
          allocations: (allocationsByAction[row.id] ?? []).map(allocation => ({
            targetSiteId: allocation.target_site_id,
            targetSiteName: allocation.target_site_name,
            targetEnumeratorId: allocation.target_enumerator_id,
            sameEnumerator: allocation.cross_enumerator === false,
            amount: Number(allocation.amount ?? 0),
            feeGrossAmount: Number(allocation.fee_gross_amount ?? 0),
            feePriorSettledAmount: Number(allocation.fee_prior_settled_amount ?? 0),
            feeRemainingAmount: Number(allocation.fee_remaining_amount ?? 0),
            feeSettlementStatus: allocation.fee_status,
            journalEntryId: allocation.gl_journal_entry_id ?? undefined,
          })),
          feeGrossAmount: row.redirect_fee_gross_amount ?? undefined,
          feePriorSettledAmount: row.redirect_fee_prior_settled_amount ?? undefined,
          feeSettledAmount: row.redirect_fee_settled_amount ?? undefined,
          feeRemainingAmount: row.redirect_fee_remaining_amount ?? undefined,
          feeSettlementStatus: row.redirect_fee_status ?? undefined,
          sourcePaymentReferences: Array.isArray(row.source_payment_references)
            ? row.source_payment_references.flat().filter(Boolean)
            : undefined,
      };
      if (executedFromServer[row.advance_id].allocations?.length) {
        const totalAllocated = executedFromServer[row.advance_id].allocations!
          .reduce((sum, allocation) => sum + allocation.amount, 0);
        executedFromServer[row.advance_id].unallocatedAmount = Math.max(
          Number(row.decision_amount ?? row.advance_amount ?? 0) - totalAllocated,
          0,
        );
      }
    }
    // Normalize client state to the current advance IDs. Migrate an old
    // site-keyed draft only where the site has exactly one active advance.
    const advancesPerSite = advances.reduce<Record<string, number>>((counts, adv) => {
      counts[adv.siteId] = (counts[adv.siteId] ?? 0) + 1;
      return counts;
    }, {});
    const normalizedDecisions: Record<string, ExceptionDecision> = {};
    for (const site of exceptionSites) {
      const existing = decisionsRef.current[site.advanceId]
        ?? (advancesPerSite[site.siteId] === 1
          ? decisionsRef.current[site.siteId]
          : undefined);
      if (existing && !correctedActionIds.has(existing.actionId ?? '')) {
        normalizedDecisions[site.advanceId] = existing;
      }
    }
    const nextDecisions = {
      ...normalizedDecisions,
      ...executedFromServer,
    };
    decisionsRef.current = nextDecisions;
    updateWizardState({ exceptionDecisions: nextDecisions });
    setLoading(false);
  };

  // ── State helpers ───────────────────────────────────────────────────────────

  const setDecision = (advanceId: string, patch: Partial<ExceptionDecision>) => {
    const current = decisionsRef.current[advanceId] ?? {} as ExceptionDecision;
    const nextDecisions = {
      ...decisionsRef.current,
      [advanceId]: { ...current, ...patch },
    };
    decisionsRef.current = nextDecisions;
    updateWizardState({ exceptionDecisions: nextDecisions });
  };

  const openRedirectCorrection = async (site: ExceptionSite, decision: ExceptionDecision) => {
    if (!decision.actionId || !canCorrectRedirect) return;
    const idempotencyKey = `${decision.actionId}:${crypto.randomUUID()}`;
    setCorrectionDialog({
      site,
      decision,
      reason: '',
      periodId: '',
      idempotencyKey,
      periods: [],
      loadingPeriods: true,
      submitting: false,
    });

    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await (supabase as any)
      .from('acct_fiscal_periods')
      .select('id, period_no, start_date, end_date, status')
      .in('status', ['open', 'soft_closed'])
      .lte('start_date', today)
      .gte('end_date', today)
      .order('start_date', { ascending: false });
    const periods = (data ?? []) as FiscalPeriod[];
    setCorrectionDialog(current => current?.idempotencyKey === idempotencyKey
      ? {
        ...current,
        periods,
        periodId: periods[0]?.id ?? '',
        loadingPeriods: false,
        error: error ? `Could not load fiscal periods: ${error.message}` : undefined,
      }
      : current);
  };

  const submitRedirectCorrection = async () => {
    if (!correctionDialog?.decision.actionId) return;
    if (correctionDialog.reason.trim().length < 10) {
      setCorrectionDialog(current => current
        ? { ...current, error: 'Enter a correction reason of at least 10 characters.' }
        : current);
      return;
    }
    if (!correctionDialog.periodId) {
      setCorrectionDialog(current => current
        ? { ...current, error: 'Select an open fiscal period for the reversal.' }
        : current);
      return;
    }

    setCorrectionDialog(current => current
      ? { ...current, submitting: true, error: undefined }
      : current);
    const key = exceptionKey(correctionDialog.site);
    try {
      const { data, error } = await (supabase as any).rpc(
        'reopen_cycle_redirect_for_correction',
        {
          p_action_id: correctionDialog.decision.actionId,
          p_reason: correctionDialog.reason.trim(),
          p_period_id: correctionDialog.periodId,
          p_idempotency_key: correctionDialog.idempotencyKey,
        },
      );
      if (error) throw new Error(error.message);
      const result = data as { ok?: boolean; error?: string } | null;
      if (!result?.ok) throw new Error(result?.error || 'The server did not reopen this Redirect.');

      const nextDecisions = { ...decisionsRef.current };
      delete nextDecisions[key];
      delete nextDecisions[correctionDialog.site.siteId];
      decisionsRef.current = nextDecisions;
      updateWizardState({ exceptionDecisions: nextDecisions });
      setCorrectionDialog(null);
      await loadExceptions();
    } catch (error: any) {
      const message = error?.message ?? 'The correction failed. Nothing was changed.';
      const migrationMissing = message.includes('reopen_cycle_redirect_for_correction')
        && message.toLowerCase().includes('schema cache');
      if (migrationMissing) setMigrationRequired(true);
      setCorrectionDialog(current => current
        ? {
          ...current,
          submitting: false,
          error: migrationMissing
            ? 'Apply the Redirect correction migration in Supabase, then reload this wizard.'
            : message,
        }
        : current);
    }
  };

  const isDraftValid = (site: ExceptionSite): boolean => {
    const targets = (targetSites[exceptionKey(site)] ?? []).map(toSettlementTarget);
    return isExceptionDecisionDraftValid(
      site,
      wizardState.exceptionDecisions[exceptionKey(site)],
      targets,
    );
  };

  const isSiteComplete = (site: ExceptionSite): boolean =>
    wizardState.exceptionDecisions[exceptionKey(site)]?.executed === true;

  const loadTargetSites = async (site: ExceptionSite, mmpId: string) => {
    const key = exceptionKey(site);
    if (!site.enumeratorId) {
      setDecision(key, { executionError: 'Assign an enumerator before selecting a transfer target.' });
      return;
    }
    setLoadingTargetSites(prev => ({ ...prev, [key]: true }));
    setTargetSites(prev => ({ ...prev, [key]: [] }));
    const { data, error } = await supabase
      .from('mmp_site_entries')
      .select('id, site_name, state, locality, status, not_covered_flag, accepted_by, enumerator_fee, transport_fee, fee_paid_amount, fee_cash_paid_amount, fee_advance_offset_amount')
      .eq('mmp_file_id', mmpId)
      .neq('id', site.siteId)
      .order('site_name');
    setLoadingTargetSites(prev => ({ ...prev, [key]: false }));
    if (error) {
      setDecision(key, { executionError: `Could not load target sites: ${error.message}` });
      return;
    }
    const decision = decisionsRef.current[key]?.decision;
    const candidates = ((data ?? []) as TargetSite[])
      .map(target => ({ ...target, sameEnumerator: target.accepted_by === site.enumeratorId }))
      .filter(target => !target.not_covered_flag && target.status?.toLowerCase() !== 'not_covered')
      .filter(target => decision !== 'redirect'
        || isEligibleRedirectAllocationTarget(site.siteId, toSettlementTarget(target)))
      .sort((left, right) => Number(!!right.sameEnumerator) - Number(!!left.sameEnumerator)
        || left.site_name.localeCompare(right.site_name));
    setTargetSites(prev => ({ ...prev, [key]: candidates }));
  };

  const selectTargetMmp = (site: ExceptionSite, mmpId: string) => {
    setDecision(exceptionKey(site), {
      targetMmpId: mmpId,
      targetSiteId: undefined,
      targetSiteName: undefined,
      executionError: undefined,
    });
    void loadTargetSites(site, mmpId);
  };

  const executeDecision = async (site: ExceptionSite) => {
    const key = exceptionKey(site);
    const d = wizardState.exceptionDecisions[key];
    if (!canExecute || !d || !isDraftValid(site) || d.executed) return;

    setExecuting(prev => ({ ...prev, [key]: true }));
    setDecision(key, { executionError: undefined });
    try {
      const rpcName = d.decision === 'redirect'
        ? 'execute_cycle_close_redirect_allocations'
        : 'execute_cycle_close_exception';
      const rpcParams = d.decision === 'redirect'
        ? {
          p_mmp_id: wizardState.selectedMmpId,
          p_source_site_id: site.siteId,
          p_advance_id: site.advanceId,
          p_allocations: (d.allocations ?? []).map(allocation => ({
            target_site_id: allocation.targetSiteId,
            amount: allocation.amount,
          })),
          p_justification: d.justification?.trim() || null,
        }
        : {
          p_mmp_id: wizardState.selectedMmpId,
          p_site_id: site.siteId,
          p_advance_id: site.advanceId,
          p_decision: d.decision,
          p_amount: d.amount ?? null,
          p_justification: d.justification?.trim() || null,
          p_target_mmp_id: d.targetMmpId ?? null,
          p_target_site_id: d.targetSiteId ?? null,
          p_receipt_reference: d.receiptReference?.trim() || null,
          p_return_method: d.returnMethod ?? null,
          p_recovery_date: d.recoveryDate ?? null,
        };
      const { data, error } = await (supabase as any).rpc(rpcName, rpcParams);

      if (error) throw new Error(error.message);
      const result = data as {
        ok?: boolean;
        error?: string;
        action_id?: string;
        executed_at?: string;
        journal_entry_id?: string | null;
        fee_gross_amount?: number;
        fee_settled_amount?: number;
        fee_remaining_amount?: number;
        fee_status?: 'partially_paid' | 'paid';
        unallocated_amount?: number;
        allocations?: Array<{
          target_site_id: string;
          target_site_name?: string;
          target_enumerator_id?: string | null;
          same_enumerator?: boolean;
          amount: number;
          fee_gross_amount: number;
          fee_prior_settled_amount: number;
          fee_remaining_amount: number;
          fee_status: 'partially_paid' | 'paid';
          journal_entry_id?: string | null;
        }>;
        message?: string;
      } | null;
      if (!result?.ok) throw new Error(result?.error || 'The server did not execute this action.');

      const returnedAllocations = result.allocations?.map(allocation => ({
        targetSiteId: allocation.target_site_id,
        targetSiteName: allocation.target_site_name,
        targetEnumeratorId: allocation.target_enumerator_id,
        sameEnumerator: allocation.same_enumerator,
        amount: Number(allocation.amount),
        feeGrossAmount: Number(allocation.fee_gross_amount),
        feePriorSettledAmount: Number(allocation.fee_prior_settled_amount),
        feeRemainingAmount: Number(allocation.fee_remaining_amount),
        feeSettlementStatus: allocation.fee_status,
        journalEntryId: allocation.journal_entry_id ?? undefined,
      })) ?? d.allocations;
      const selectedTarget = (targetSites[key] ?? []).find(s => s.id === d.targetSiteId);
      setDecision(key, {
        executed: true,
        actionId: result.action_id,
        executedAt: result.executed_at,
        executedByName: currentUser?.fullName ?? currentUser?.full_name ?? currentUser?.email ?? undefined,
        journalEntryId: result.journal_entry_id ?? undefined,
        targetSiteName: selectedTarget?.site_name ?? d.targetSiteName,
        allocations: returnedAllocations,
        unallocatedAmount: result.unallocated_amount ?? 0,
        feeGrossAmount: result.fee_gross_amount,
        feeSettledAmount: result.fee_settled_amount,
        feeRemainingAmount: result.fee_remaining_amount,
        feeSettlementStatus: result.fee_status,
        executionError: undefined,
      });
    } catch (error: any) {
      const rawMessage = error?.message ?? 'The action failed. Nothing was changed.';
      const migrationMissing = (
        (rawMessage.includes('execute_cycle_close_exception')
          || rawMessage.includes('execute_cycle_close_redirect_allocations')) &&
        rawMessage.toLowerCase().includes('schema cache')
      ) || (
        rawMessage.includes('v_mmp') &&
        rawMessage.includes('country_id')
      );
      if (migrationMissing) {
        setMigrationRequired(true);
      }
      setDecision(key, {
        executed: false,
        executionError: migrationMissing
          ? 'The Cycle Close database migration is incomplete in Supabase. Apply the ordered migrations shown above, including the multi-site allocation migration, then reload this page. No action was changed.'
          : rawMessage,
      });
    } finally {
      setExecuting(prev => ({ ...prev, [key]: false }));
    }
  };

  const exportExceptions = () => void exportFormattedExceptions(exceptions, wizardState);

  // ── Loading / empty ─────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center gap-2 justify-center py-12 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" /> Loading exceptions…
    </div>
  );

  const paidSites     = exceptions.filter(isPaidSite);
  const approvedSites = exceptions.filter(isApprovedSite);
  const allExecuted   = exceptions.every(isSiteComplete);

  if (exceptions.length === 0) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <Header />
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
      <Header />

      {migrationRequired && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Database setup required.</strong> Apply the ordered Cycle Close migration set from
            {' '}<code className="text-xs">supabase/migrations/</code>:
            {' '}<code className="text-xs">20260818_cycle_exception_actions.sql</code>,
            {' '}<code className="text-xs">20260818b_field_payments_columns.sql</code>,
            {' '}<code className="text-xs">20260818d_enumerator_fee_gl_bridge.sql</code>,
            {' '}<code className="text-xs">20260818_close_mmp_and_lock_incentives.sql</code>,
            {' '}<code className="text-xs">20260819_cycle_close_inline_exception_execution.sql</code>, then
            {' '}<code className="text-xs">20260819b_cycle_close_finalizer_role_variants.sql</code>, then
             {' '}<code className="text-xs">20260819c_cycle_close_mmp_country_scope.sql</code>, then
             {' '}<code className="text-xs">20260819e_cycle_redirect_fee_settlement_safety.sql</code>, then
             {' '}<code className="text-xs">20260819f_cycle_redirect_multi_site_allocations.sql</code>, then
             {' '}<code className="text-xs">20260819g_cycle_redirect_correction.sql</code>.
            {' '}Reload this wizard after they are applied.
          </AlertDescription>
        </Alert>
      )}

      {/* ── Summary counts ── */}
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="px-3 py-1 rounded-full bg-green-100 text-green-800 font-medium border border-green-300">
          💰 {paidSites.length} disbursed advance{paidSites.length !== 1 ? 's' : ''}
        </span>
        <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-800 font-medium border border-amber-300">
          ⏳ {approvedSites.length} approved (not yet paid)
        </span>
      </div>

      {/* ── Section A: Disbursed advances ── */}
      {paidSites.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm text-green-700 dark:text-green-400">
                💰 Disbursed Advances — سلف تم صرفها
              </h3>
              <p className="text-xs text-muted-foreground">Money has left the system — choose a recovery action for each site.</p>
            </div>
            <Button type="button" variant="ghost" size="sm" className="text-xs gap-1"
              onClick={() => setShowPaidGuide(v => !v)}>
              <Info className="h-3.5 w-3.5" />
              {showPaidGuide ? 'Hide' : 'Show'} options guide
              {showPaidGuide ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          </div>

          {showPaidGuide && (
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4 text-sm space-y-3">
              {DECISIONS_PAID.map(d => (
                <div key={d.value} className="space-y-0.5">
                  <p>
                    <strong>{d.label}</strong>
                    <span className="mx-1 text-green-500">·</span>
                    <strong dir="rtl">{d.labelAr}</strong>
                    <span className="mx-2 text-green-600">—</span>
                    <span>{d.desc}</span>
                  </p>
                  <p dir="rtl" className="text-xs text-green-700 dark:text-green-300">{d.descAr}</p>
                  <p className="text-xs text-green-600 dark:text-green-400">📍 {d.track}</p>
                  <p dir="rtl" className="text-xs text-green-600 dark:text-green-400">📍 {d.trackAr}</p>
                </div>
              ))}
            </div>
          )}

          {paidSites.map(site => (
            <SiteCard
              key={exceptionKey(site)}
              site={site}
              decision={wizardState.exceptionDecisions[exceptionKey(site)]}
              decisions={paidDecisionsFor(site) as any}
              isDone={isSiteComplete(site)}
              canOverride={canOverride}
              canExecute={canExecuteExceptionDecision(
                roleFlags ?? {},
                wizardState.exceptionDecisions[exceptionKey(site)]?.decision,
              )}
              setDecision={setDecision}
              openMmps={openMmps}
              targetCycleLoadError={targetCycleLoadError}
              targetSites={targetSites[exceptionKey(site)] ?? []}
              loadingTargetSites={!!loadingTargetSites[exceptionKey(site)]}
              executing={!!executing[exceptionKey(site)]}
              isDraftValid={isDraftValid(site)}
              onTargetMmpChange={mmpId => selectTargetMmp(site, mmpId)}
              onLoadSameMmpSites={() => loadTargetSites(site, wizardState.selectedMmpId!)}
              onExecute={() => executeDecision(site)}
              correctedHistory={correctedRedirects[site.advanceId] ?? []}
              canCorrectRedirect={canCorrectRedirect}
              onCorrectRedirect={() => {
                const decision = wizardState.exceptionDecisions[exceptionKey(site)];
                if (decision) void openRedirectCorrection(site, decision);
              }}
              variant="paid"
            />
          ))}
        </section>
      )}

      {/* ── Section B: Approved but unpaid ── */}
      {approvedSites.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm text-amber-700 dark:text-amber-400">
                ⏳ Approved — Not Yet Paid — موافق عليها ولم تُصرف بعد
              </h3>
              <p className="text-xs text-muted-foreground">Money is still in the system — different options apply since no cash has moved.</p>
              <p dir="rtl" className="text-xs text-muted-foreground">المبلغ لا يزال في النظام — خيارات مختلفة تنطبق لأن لا مبالغ صُرفت بعد.</p>
            </div>
            <Button type="button" variant="ghost" size="sm" className="text-xs gap-1"
              onClick={() => setShowApprGuide(v => !v)}>
              <Info className="h-3.5 w-3.5" />
              {showApprGuide ? 'Hide' : 'Show'} options guide
              {showApprGuide ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          </div>

          {showApprGuide && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-sm space-y-3">
              {DECISIONS_APPROVED.map(d => (
                <div key={d.value} className="space-y-0.5">
                  <p>
                    <strong>{d.label}</strong>
                    <span className="mx-1 text-amber-500">·</span>
                    <strong dir="rtl">{d.labelAr}</strong>
                    <span className="mx-2 text-amber-600">—</span>
                    <span>{d.desc}</span>
                  </p>
                  <p dir="rtl" className="text-xs text-amber-700 dark:text-amber-300">{d.descAr}</p>
                  <p className="text-xs text-amber-600 dark:text-amber-400">📍 {d.track}</p>
                  <p dir="rtl" className="text-xs text-amber-600 dark:text-amber-400">📍 {d.trackAr}</p>
                </div>
              ))}
            </div>
          )}

          {approvedSites.map(site => (
            <SiteCard
              key={exceptionKey(site)}
              site={site}
              decision={wizardState.exceptionDecisions[exceptionKey(site)]}
              decisions={approvedDecisionsFor(site) as any}
              isDone={isSiteComplete(site)}
              canOverride={canOverride}
              canExecute={canExecuteExceptionDecision(
                roleFlags ?? {},
                wizardState.exceptionDecisions[exceptionKey(site)]?.decision,
              )}
              setDecision={setDecision}
              openMmps={openMmps}
              targetCycleLoadError={targetCycleLoadError}
              targetSites={targetSites[exceptionKey(site)] ?? []}
              loadingTargetSites={!!loadingTargetSites[exceptionKey(site)]}
              executing={!!executing[exceptionKey(site)]}
              isDraftValid={isDraftValid(site)}
              onTargetMmpChange={mmpId => selectTargetMmp(site, mmpId)}
              onLoadSameMmpSites={() => loadTargetSites(site, wizardState.selectedMmpId!)}
              onExecute={() => executeDecision(site)}
              correctedHistory={correctedRedirects[site.advanceId] ?? []}
              canCorrectRedirect={canCorrectRedirect}
              onCorrectRedirect={() => {
                const decision = wizardState.exceptionDecisions[exceptionKey(site)];
                if (decision) void openRedirectCorrection(site, decision);
              }}
              variant="approved"
            />
          ))}
        </section>
      )}

      {!allExecuted && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Every action must execute successfully before advancing. Selecting a decision is not enough.
            {' '}— يجب تنفيذ كل إجراء بنجاح قبل المتابعة.
          </AlertDescription>
        </Alert>
      )}

      {!canExecute && !allExecuted && (
        <Alert className="border-amber-300 bg-amber-50">
          <AlertCircle className="h-4 w-4 text-amber-700" />
          <AlertDescription className="text-amber-900">
            Read-only exception stage. Finance, FOM, Admin, or Super Admin must execute these actions.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between pt-4 border-t">
        <div className="flex items-center gap-2">
          {canGoBack && (
            <Button type="button" variant="outline" size="sm" onClick={onBack} data-testid="button-back-step5">← Back</Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={exportExceptions} data-testid="button-export-exceptions">
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export Exceptions Report
          </Button>
        </div>
        <Button type="button" onClick={onNext} disabled={!allExecuted} data-testid="button-next-step5">
          Next: Financial Reconciliation →
        </Button>
      </div>

      <Dialog
        open={!!correctionDialog}
        onOpenChange={open => {
          if (!open && !correctionDialog?.submitting) setCorrectionDialog(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-amber-600" />
              Reopen advance for correction
            </DialogTitle>
            <DialogDescription>
              Reverse the incorrect Redirect journal and return this paid advance to the unresolved
              Cycle Close queue. The old action and both journals remain in history.
            </DialogDescription>
          </DialogHeader>

          {correctionDialog && (
            <div className="space-y-4">
              <Alert className="border-amber-300 bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-700" />
                <AlertDescription className="text-amber-900 text-xs">
                  This does not delete or edit the original Redirect. It posts a reversing journal,
                  restores the original paid advance status, and requires a new resolution before Final Close.
                </AlertDescription>
              </Alert>

              <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
                <DetailRow label="Site" value={correctionDialog.site.siteName} />
                <DetailRow label="Advance" value={correctionDialog.site.advanceId} mono />
                <DetailRow
                  label="Original journal"
                  value={correctionDialog.decision.journalEntryId ?? 'Missing — correction will be rejected'}
                  mono
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="redirect-correction-reason">Correction reason</Label>
                <Textarea
                  id="redirect-correction-reason"
                  value={correctionDialog.reason}
                  onChange={event => setCorrectionDialog(current => current
                    ? { ...current, reason: event.target.value, error: undefined }
                    : current)}
                  placeholder="Explain why the original Redirect was incorrect and must be reopened…"
                  rows={4}
                  disabled={correctionDialog.submitting}
                  data-testid="textarea-redirect-correction-reason"
                />
                <p className="text-[11px] text-muted-foreground">Required · minimum 10 characters</p>
              </div>

              <div className="space-y-1.5">
                <Label>Reversal fiscal period</Label>
                {correctionDialog.loadingPeriods ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading open periods…
                  </div>
                ) : correctionDialog.periods.length === 0 ? (
                  <p className="text-xs text-destructive">
                    No open or soft-closed fiscal period contains today. Finance must open a valid period first.
                  </p>
                ) : (
                  <Select
                    value={correctionDialog.periodId}
                    onValueChange={periodId => setCorrectionDialog(current => current
                      ? { ...current, periodId, error: undefined }
                      : current)}
                    disabled={correctionDialog.submitting}
                  >
                    <SelectTrigger data-testid="select-redirect-correction-period">
                      <SelectValue placeholder="Select fiscal period" />
                    </SelectTrigger>
                    <SelectContent>
                      {correctionDialog.periods.map(period => (
                        <SelectItem key={period.id} value={period.id}>
                          Period {period.period_no} · {period.start_date} to {period.end_date} ({period.status})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {correctionDialog.error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{correctionDialog.error}</AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCorrectionDialog(null)}
              disabled={correctionDialog?.submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-amber-600 hover:bg-amber-700"
              onClick={() => void submitRedirectCorrection()}
              disabled={
                !correctionDialog
                || correctionDialog.submitting
                || correctionDialog.loadingPeriods
                || !correctionDialog.periodId
                || correctionDialog.reason.trim().length < 10
              }
              data-testid="button-confirm-redirect-correction"
            >
              {correctionDialog?.submitting
                ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                : <RotateCcw className="h-4 w-4 mr-1.5" />}
              Reverse journal and reopen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Shared header ─────────────────────────────────────────────────────────────

function Header() {
  return (
    <div className="space-y-1">
      <h2 className="text-xl font-semibold">Step 4 — Resolve Exceptions</h2>
      <p className="text-sm text-muted-foreground" dir="rtl">الخطوة ٤ — الاستثناءات</p>
      <p className="text-muted-foreground text-sm">
        Complete each financial or operational action here. Final Close remains blocked until every card shows Executed.
      </p>
      <p className="text-sm text-muted-foreground" dir="rtl">
        مواقع غير مغطاة مرتبطة بسلف مدفوعة للمعددين — يجب اتخاذ قرار بشأن كل منها قبل إغلاق الدورة.
      </p>
    </div>
  );
}

// ── Site card ─────────────────────────────────────────────────────────────────

interface SiteCardProps {
  site: ExceptionSite;
  decision: ExceptionDecision | undefined;
  decisions: ReadonlyArray<{
    value: string; label: string; labelAr: string; desc: string; descAr: string; track: string; trackAr: string;
  }>;
  isDone: boolean;
  canOverride: boolean;
  canExecute: boolean;
  setDecision: (advanceId: string, patch: Partial<ExceptionDecision>) => void;
  openMmps: OpenMmp[];
  targetCycleLoadError: string | null;
  targetSites: TargetSite[];
  loadingTargetSites: boolean;
  executing: boolean;
  isDraftValid: boolean;
  onTargetMmpChange: (mmpId: string) => void;
  onLoadSameMmpSites: () => void;
  onExecute: () => void;
  correctedHistory: CorrectedRedirectHistory[];
  canCorrectRedirect: boolean;
  onCorrectRedirect: () => void;
  variant: 'paid' | 'approved';
}

function SiteCard({
  site, decision: d, decisions, isDone, canOverride, canExecute, setDecision, variant,
  openMmps, targetCycleLoadError, targetSites, loadingTargetSites, executing, isDraftValid,
  onTargetMmpChange, onLoadSameMmpSites, onExecute, correctedHistory,
  canCorrectRedirect, onCorrectRedirect,
}: SiteCardProps) {
  const [showPayment, setShowPayment] = useState(false);
  const [showExecutionDetails, setShowExecutionDetails] = useState(false);
  const isPartial = site.advanceStatus === 'partially_paid';
  const redirectSummary = d?.decision === 'redirect'
    ? summarizeRedirectAllocations(
      site.siteId,
      targetSites.map(toSettlementTarget),
      d.allocations,
      site.advancePaid,
    )
    : null;
  const crossEnumeratorNeedsApproval = !!redirectSummary?.hasCrossEnumerator && !canOverride;
  const executionAuthorized = canExecute && !crossEnumeratorNeedsApproval;

  const badgeEl = variant === 'paid' ? (
    <Badge className={`text-xs ${isPartial
      ? 'bg-blue-100 text-blue-700 border-blue-300'
      : 'bg-green-100 text-green-800 border-green-300'}`}>
      {isPartial
        ? `Paid SDG ${site.advancePaid.toLocaleString()} of ${site.requestedAmount.toLocaleString()}`
        : `✓ Paid: SDG ${site.advancePaid.toLocaleString()}`}
    </Badge>
  ) : (
    <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-xs">
      ⏳ Approved (Unpaid): SDG {site.requestedAmount.toLocaleString()}
    </Badge>
  );

  const borderClass = isDone
    ? 'border-green-400'
    : variant === 'paid'
      ? 'border-green-200'
      : 'border-amber-200';

  const chosen = decisions.find(x => x.value === d?.decision);

  return (
    <div className={`border rounded-lg overflow-hidden ${borderClass}`}>
      {correctedHistory.map(history => (
        <div
          key={history.actionId}
          className="border-b border-amber-200 bg-amber-50/80 px-4 py-3 text-xs space-y-1.5"
          data-testid={`corrected-redirect-history-${history.actionId}`}
        >
          <div className="flex items-center gap-2 text-amber-900 font-semibold">
            <RotateCcw className="h-3.5 w-3.5" />
            Previous Redirect reversed and reopened for correction
          </div>
          <p className="text-amber-800">
            Corrected {history.correctedAt ? new Date(history.correctedAt).toLocaleString('en-GB') : 'at an unrecorded time'}
            {history.correctedByName ? ` by ${history.correctedByName}` : ''}.
            The original action is retained below for audit history.
          </p>
          {history.correctionReason && (
            <p className="rounded border border-amber-200 bg-white/70 px-2 py-1">
              <span className="font-medium">Reason: </span>{history.correctionReason}
            </p>
          )}
          <div className="grid gap-x-3 sm:grid-cols-2">
            {history.originalJournalEntryId && (
              <DetailRow label="Original journal" value={history.originalJournalEntryId} mono />
            )}
            {history.reversalJournalEntryId && (
              <DetailRow label="Reversal journal" value={history.reversalJournalEntryId} mono />
            )}
            <DetailRow label="Original action" value={history.actionId} mono />
            {history.replacementActionId && (
              <DetailRow label="Replacement action" value={history.replacementActionId} mono />
            )}
          </div>
        </div>
      ))}
      {/* ── Done banner ─────────────────────────────────────────────── */}
      {isDone && chosen && (
        <>
          <button
            type="button"
            className="w-full bg-green-50 border-b border-green-200 px-4 py-2 flex items-center gap-2 text-green-700 text-xs font-semibold text-left hover:bg-green-100 transition-colors"
            onClick={() => setShowExecutionDetails(value => !value)}
            aria-expanded={showExecutionDetails}
            data-testid={`toggle-execution-details-${site.advanceId}`}
          >
            <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
            <span>Action executed — {chosen.label}</span>
            <span className="ml-auto flex items-center gap-2 text-green-500 text-[10px] font-normal">
              {d?.journalEntryId ? `GL journal ${d.journalEntryId.slice(0, 8)}…` : 'Completed ✓'}
              {showExecutionDetails
                ? <ChevronUp className="h-3.5 w-3.5" />
                : <ChevronDown className="h-3.5 w-3.5" />}
            </span>
          </button>
          {showExecutionDetails && (
            <ExecutionDetails
              decision={d}
              chosenLabel={chosen.label}
              openMmps={openMmps}
              site={site}
              canCorrectRedirect={
                canCorrectRedirect
                && d?.decision === 'redirect'
                && !!d.actionId
                && (d.allocations?.length ?? 0) === 0
              }
              onCorrectRedirect={onCorrectRedirect}
            />
          )}
        </>
      )}
      <div className="p-4 space-y-3">
      {/* Site header */}
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <p className="font-semibold text-sm">{site.siteName}</p>
          <p className="text-xs text-muted-foreground">{site.state} / {site.locality} — {site.enumeratorName}</p>
          <p className="text-[10px] font-mono text-muted-foreground">
            Advance {site.advanceId.slice(0, 8)}…
          </p>
          {site.approvedByName ? (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
              <span className="font-medium text-foreground/70">Approved by:</span>
              <span>{site.approvedByName}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] border ${
                variant === 'paid'
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                {variant === 'paid' ? 'Paid' : 'Approved — not yet paid'}
              </span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground/60 italic">Approver not recorded</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {badgeEl}
          {isDone && <CheckCircle2 className="h-4 w-4 text-green-500" />}
        </div>
      </div>

      {/* ── Payment details panel ──────────────────────────────────────── */}
      <div className="border rounded-md bg-slate-50/60">
        <button
          type="button"
          onClick={() => setShowPayment(v => !v)}
          className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100/60 rounded-md transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Receipt className="h-3.5 w-3.5" />
            Payment Details
            {site.paymentType && (
              <span className="ml-1 px-1.5 py-0.5 rounded border text-[10px] bg-slate-100 border-slate-200 text-slate-500">
                {site.paymentType === 'full_advance' ? 'Full Advance' : 'Installments'}
              </span>
            )}
          </span>
          {showPayment ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {showPayment && (
          <div className="px-3 pb-3 space-y-3 border-t border-slate-200/80 pt-2.5">

            {/* Summary row */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-white border rounded p-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Requested</p>
                <p className="text-sm font-semibold">SDG {site.requestedAmount.toLocaleString()}</p>
              </div>
              <div className={`bg-white border rounded p-2 ${site.advancePaid > 0 ? 'border-green-200' : ''}`}>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Paid Out</p>
                <p className={`text-sm font-semibold ${site.advancePaid > 0 ? 'text-green-700' : 'text-slate-400'}`}>
                  {site.advancePaid > 0 ? `SDG ${site.advancePaid.toLocaleString()}` : '—'}
                </p>
              </div>
              <div className={`bg-white border rounded p-2 ${(site.remainingAmount ?? 0) > 0 ? 'border-amber-200' : ''}`}>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Remaining</p>
                <p className={`text-sm font-semibold ${(site.remainingAmount ?? 0) > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
                  {site.remainingAmount != null ? `SDG ${site.remainingAmount.toLocaleString()}` : '—'}
                </p>
              </div>
            </div>

            {/* Advance ID */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Hash className="h-3 w-3 flex-shrink-0" />
              <span className="font-medium text-foreground/70">Advance ID:</span>
              <code className="font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                {site.advanceId}
              </code>
            </div>

            {/* Timeline */}
            <div className="space-y-1.5">
              {site.requestedAt && (
                <div className="flex items-center gap-2 text-xs">
                  <Calendar className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <span className="text-muted-foreground w-32 flex-shrink-0">Requested:</span>
                  <span>{new Date(site.requestedAt).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</span>
                  {site.requestedByName && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <User className="h-3 w-3" /> {site.requestedByName}
                    </span>
                  )}
                </div>
              )}
              {site.supervisorApprovedAt && (
                <div className="flex items-center gap-2 text-xs">
                  <Calendar className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <span className="text-muted-foreground w-32 flex-shrink-0">Supervisor approved:</span>
                  <span>{new Date(site.supervisorApprovedAt).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</span>
                  {site.approvedByName && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <User className="h-3 w-3" /> {site.approvedByName}
                    </span>
                  )}
                </div>
              )}
              {site.adminProcessedAt && (
                <div className="flex items-center gap-2 text-xs">
                  <Calendar className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <span className="text-muted-foreground w-32 flex-shrink-0">Admin processed:</span>
                  <span>{new Date(site.adminProcessedAt).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</span>
                  {site.adminProcessedByName && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Building2 className="h-3 w-3" /> {site.adminProcessedByName}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Installment breakdown */}
            {site.paymentType === 'installments' && (site.installmentPlan?.length ?? 0) > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Installment Plan</p>
                <div className="rounded border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-100 text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1 text-left font-medium">Stage</th>
                        <th className="px-2 py-1 text-right font-medium">Amount</th>
                        <th className="px-2 py-1 text-center font-medium">Status</th>
                        <th className="px-2 py-1 text-left font-medium">Paid date</th>
                        <th className="px-2 py-1 text-left font-medium">Ref</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(site.installmentPlan ?? []).map((inst, i) => (
                        <tr key={i} className={`border-t ${inst.paid ? 'bg-green-50/40' : ''}`}>
                          <td className="px-2 py-1.5 text-slate-700">
                            {inst.description || inst.stage || `Installment ${i + 1}`}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono font-medium">
                            SDG {(inst.amount ?? 0).toLocaleString()}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            {inst.paid
                              ? <span className="inline-flex items-center gap-0.5 text-green-700 text-[10px] font-medium"><CheckCircle2 className="h-3 w-3" /> Paid</span>
                              : <span className="text-amber-600 text-[10px]">Pending</span>}
                          </td>
                          <td className="px-2 py-1.5 text-muted-foreground">
                            {inst.paid_at ? new Date(inst.paid_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'}
                          </td>
                          <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
                            {inst.transaction_id
                              ? <code className="bg-slate-100 px-1 rounded">{inst.transaction_id.slice(-8)}</code>
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Wallet transaction IDs (full advance) */}
            {site.paymentType !== 'installments' && (site.walletTransactionIds?.length ?? 0) > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                  <CreditCard className="h-3 w-3" /> Wallet Transactions
                </p>
                <div className="flex flex-wrap gap-1">
                  {(site.walletTransactionIds ?? []).map((txId, i) => (
                    <code key={i} className="text-[10px] font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-slate-600">
                      {txId}
                    </code>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </div>

      {/* Decision selector */}
      <Select
        value={d?.decision ?? ''}
        disabled={isDone || executing}
        onValueChange={v => {
          const decision = v as ExceptionDecision['decision'];
          const requiresPaidAmount = ['return', 'writeoff', 'redirect'].includes(decision);
          setDecision(site.advanceId, {
            decision,
            amount: requiresPaidAmount ? site.advancePaid : undefined,
            recoveryDate: decision === 'return' ? new Date().toISOString().slice(0, 10) : undefined,
            targetMmpId: undefined,
            targetSiteId: undefined,
            targetSiteName: undefined,
             allocations: undefined,
             unallocatedAmount: undefined,
            receiptReference: undefined,
            returnMethod: undefined,
            executed: false,
            actionId: undefined,
            executedAt: undefined,
            journalEntryId: undefined,
            executionError: undefined,
          });
          if (decision === 'reassign' || decision === 'redirect') onLoadSameMmpSites();
        }}
      >
        <SelectTrigger className="w-full" data-testid={`select-decision-${site.advanceId}`}>
          {/* Show only the compact label in the trigger — full description is in the dropdown and tracking note */}
          <SelectValue placeholder="Select recovery action… — اختر إجراء الاسترداد">
            {chosen
              ? <span className="font-medium">{chosen.label} <span className="text-muted-foreground font-normal" dir="rtl">· {chosen.labelAr}</span></span>
              : null}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {decisions.map(dec => (
            <SelectItem key={dec.value} value={dec.value}>
              <div className="flex flex-col gap-0.5 py-0.5 max-w-sm">
                <span className="font-medium">
                  {dec.label} · <span dir="rtl">{dec.labelAr}</span>
                </span>
                <span className="text-muted-foreground text-xs">{dec.desc}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* ── Extra inputs per decision ── */}

      {d?.decision && ['return', 'writeoff', 'redirect'].includes(d.decision) && (
        <div className="space-y-2 pl-3 border-l-2 border-green-400">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs font-medium w-32">Resolution amount</label>
            <Input
              type="number"
              value={d?.amount ?? ''}
              className="w-36 h-8 text-sm"
              disabled
              data-testid={`input-resolution-amount-${site.advanceId}`}
            />
            <span className="text-xs text-muted-foreground">
              SDG — the full disbursed advance is resolved by this action
            </span>
          </div>
          {d.decision === 'return' && (
            <div className="grid sm:grid-cols-3 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-medium">Recovery date</label>
                <Input
                  type="date"
                  value={d.recoveryDate ?? ''}
                  onChange={e => setDecision(site.advanceId, { recoveryDate: e.target.value })}
                  disabled={isDone || executing}
                  className="h-8 text-sm"
                  data-testid={`input-return-date-${site.advanceId}`}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Return method</label>
                <Select
                  value={d.returnMethod ?? ''}
                  onValueChange={value => setDecision(site.advanceId, { returnMethod: value as 'cash' | 'bank_transfer' })}
                  disabled={isDone || executing}
                >
                  <SelectTrigger className="h-8 text-sm" data-testid={`select-return-method-${site.advanceId}`}>
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash received</SelectItem>
                    <SelectItem value="bank_transfer">Bank transfer received</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Receipt / transfer reference</label>
                <Input
                  value={d.receiptReference ?? ''}
                  onChange={e => setDecision(site.advanceId, { receiptReference: e.target.value })}
                  disabled={isDone || executing}
                  className="h-8 text-sm"
                  placeholder="Receipt number or bank reference"
                  data-testid={`input-return-receipt-${site.advanceId}`}
                />
              </div>
            </div>
          )}
          <Textarea
            placeholder={
              d.decision === 'return'
                ? 'Recovery note (required) — who received and verified the funds?'
                : d.decision === 'writeoff'
                  ? 'Write-off justification (required) — why is this unrecoverable?'
                  : 'Redirect justification (required) — what related work supports the fee reclassification?'
            }
            value={d?.justification ?? ''}
            onChange={e => setDecision(site.advanceId, { justification: e.target.value })}
            disabled={isDone || executing}
            rows={2}
            className="text-sm"
            data-testid={`input-${d.decision}-justification-${site.advanceId}`}
          />
          {d.decision === 'writeoff' && !canOverride && (
            <p className="text-xs text-amber-600">Write-Off execution requires FOM, Admin, or Super Admin authorization.</p>
          )}
          <p className="text-xs text-muted-foreground">
            {d.decision === 'return' && 'GL: Debit Cash / Bank · Credit Transport Advance'}
            {d.decision === 'writeoff' && 'GL: Debit Write-Off Expense · Credit Transport Advance'}
            {d.decision === 'redirect' && 'GL: Debit Enumerator Fees · Credit Transport Advance'}
          </p>
          {d.decision === 'redirect' && (
            <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50/60 p-3 text-xs">
              <p className="font-medium text-blue-900">
                Allocate the full advance across one or more covered sites.
              </p>
              <RedirectAllocationEditor
                sourceSiteId={site.siteId}
                advanceAmount={site.advancePaid}
                allocations={d.allocations ?? []}
                sites={targetSites}
                loading={loadingTargetSites}
                disabled={isDone || executing}
                canOverride={canOverride}
                onChange={allocations =>
                  setDecision(site.advanceId, {
                    allocations,
                    targetSiteId: allocations.length === 1 ? allocations[0].targetSiteId : undefined,
                    targetSiteName: allocations.length === 1 ? allocations[0].targetSiteName : 'Multiple covered sites',
                    unallocatedAmount: Math.max(
                      site.advancePaid - allocations.reduce((sum, allocation) => sum + allocation.amount, 0),
                      0,
                    ),
                  })
                }
              />
              <p className="text-blue-800">
                Each target is capped at its outstanding fee. A target may be fully or partially paid;
                the action cannot execute until the entire SDG {site.advancePaid.toLocaleString()} advance is allocated.
              </p>
            </div>
          )}
        </div>
      )}

      {d?.decision && ['roll', 'hold'].includes(d.decision) && (
        <div className="space-y-2 pl-3 border-l-2 border-blue-400">
          <div className="grid sm:grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">Target cycle</label>
              <Select
                value={d.targetMmpId ?? ''}
                onValueChange={onTargetMmpChange}
                disabled={isDone || executing}
              >
                <SelectTrigger className="h-8 text-sm" data-testid={`select-target-mmp-${site.advanceId}`}>
                  <SelectValue placeholder="Select an open cycle" />
                </SelectTrigger>
                <SelectContent>
                  {openMmps.length > 0 ? openMmps.map(mmp => (
                    <SelectItem key={mmp.id} value={mmp.id}>
                      {mmp.name} {mmp.created_at ? `· ${new Date(mmp.created_at).toLocaleDateString()}` : ''}
                    </SelectItem>
                  )) : (
                    <SelectItem value="__no_open_cycles__" disabled>
                      No other open cycles are available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {targetCycleLoadError ? (
                <p className="text-xs text-destructive">{targetCycleLoadError}</p>
              ) : openMmps.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Create or reopen another MMP cycle to use Roll or Hold.
                </p>
              ) : null}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Enumerator's covered target site</label>
              <TargetSiteSelect
                siteId={site.advanceId}
                value={d.targetSiteId}
                sites={targetSites}
                loading={loadingTargetSites}
                disabled={!d.targetMmpId || isDone || executing}
                onChange={(targetSiteId, targetSiteName) =>
                  setDecision(site.advanceId, { targetSiteId, targetSiteName })
                }
              />
            </div>
          </div>
          <Textarea
            placeholder={`${d.decision === 'roll' ? 'Rollover' : 'Hold'} justification (required)…`}
            value={d.justification ?? ''}
            onChange={e => setDecision(site.advanceId, { justification: e.target.value })}
            disabled={isDone || executing}
            rows={2}
            className="text-sm"
            data-testid={`input-${d.decision}-justification-${site.advanceId}`}
          />
        </div>
      )}

      {d?.decision === 'cancel' && (
        <Textarea
          placeholder="Cancellation justification (required)…"
          value={d.justification ?? ''}
          onChange={e => setDecision(site.advanceId, { justification: e.target.value })}
          disabled={isDone || executing}
          rows={2}
          className="text-sm"
          data-testid={`input-cancel-justification-${site.advanceId}`}
        />
      )}

      {d?.decision === 'reduce' && (
        <div className="space-y-2 pl-3 border-l-2 border-amber-400">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs font-medium w-36">Reduced amount to approve</label>
            <Input
              type="number" min={1} max={site.requestedAmount - 1}
              value={d?.amount ?? ''}
              onChange={e => setDecision(site.advanceId, { amount: Number(e.target.value) })}
              disabled={isDone || executing}
              className="w-36 h-8 text-sm"
              placeholder={`< ${site.requestedAmount}`}
              data-testid={`input-reduce-amount-${site.advanceId}`}
            />
            <span className="text-xs text-muted-foreground">SDG (requested: {site.requestedAmount.toLocaleString()})</span>
          </div>
          {(d?.amount ?? 0) >= site.requestedAmount && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Reduced amount must be less than the approved amount (SDG {site.requestedAmount.toLocaleString()})
            </p>
          )}
        </div>
      )}

      {d?.decision === 'reassign' && (
        <div className="space-y-1 pl-3 border-l-2 border-green-400">
          <p className="text-xs text-muted-foreground">
            Choose a covered site in this cycle. The same enumerator is preferred; a cross-enumerator move requires FOM, Admin, or Super Admin authorization.
          </p>
          <TargetSiteSelect
            siteId={site.advanceId}
            value={d.targetSiteId}
            sites={targetSites}
            loading={loadingTargetSites}
            disabled={isDone || executing}
            onChange={(targetSiteId, targetSiteName) =>
              setDecision(site.advanceId, { targetSiteId, targetSiteName })
            }
          />
        </div>
      )}

      {/* ── Tracking note (once decision selected) ── */}
      {chosen && (
        <div className="rounded-md bg-muted/60 border border-border px-3 py-2 space-y-1">
          <p className="text-xs text-muted-foreground flex items-start gap-1">
            <span className="font-medium shrink-0">📍 Tracked:</span>
            <span>{chosen.track}</span>
          </p>
          <p dir="rtl" className="text-xs text-muted-foreground">
            <span className="font-medium">📍 المتابعة:</span> {chosen.trackAr}
          </p>
        </div>
      )}

      {d?.executionError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Action not executed.</strong> {d.executionError}
          </AlertDescription>
        </Alert>
      )}

      {chosen && !isDone && (
        <div className="flex items-center justify-between gap-3 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            {isDraftValid
              ? crossEnumeratorNeedsApproval
                ? 'A cross-enumerator allocation requires FOM, Admin, or Super Admin authorization.'
                : 'Details complete. Execute now to apply and audit this action.'
              : 'Complete all required details before executing.'}
          </p>
          <Button
            type="button"
            size="sm"
            onClick={onExecute}
            disabled={!executionAuthorized || !isDraftValid || executing}
            data-testid={`button-execute-exception-${site.advanceId}`}
          >
            {executing && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {executing ? 'Executing…' : 'Execute Action'}
          </Button>
        </div>
      )}

      {/* ── Not-decided warning ── */}
      {!d?.decision && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          You must select a recovery action for {site.siteName} before closing.
        </p>
      )}
      </div>
    </div>
  );
}

function ExecutionDetails({
  decision,
  chosenLabel,
  openMmps,
  site,
  canCorrectRedirect,
  onCorrectRedirect,
}: {
  decision: ExceptionDecision | undefined;
  chosenLabel: string;
  openMmps: OpenMmp[];
  site: ExceptionSite;
  canCorrectRedirect: boolean;
  onCorrectRedirect: () => void;
}) {
  if (!decision) return null;

  const targetMmpName = decision.targetMmpId
    ? openMmps.find(mmp => mmp.id === decision.targetMmpId)?.name
    : undefined;
  const formatDateTime = (value?: string) => value
    ? new Date(value).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
    : 'Not recorded';

  return (
    <div
      className="border-b border-green-200 bg-green-50/60 px-4 py-3 text-xs space-y-2"
      data-testid={`execution-details-${decision.actionId ?? 'completed'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-green-800">Execution details</p>
        <span className="text-green-700">Completed successfully</span>
      </div>
      <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
        <DetailRow label="Action" value={chosenLabel} />
        <DetailRow label="Executed at" value={formatDateTime(decision.executedAt)} />
        <DetailRow label="Executed by" value={decision.executedByName || 'Not recorded'} />
        <DetailRow label="Amount" value={decision.amount != null ? `SDG ${decision.amount.toLocaleString()}` : 'Not applicable'} />
        {decision.journalEntryId && (
          <DetailRow label="GL journal entry" value={decision.journalEntryId} mono />
        )}
        {decision.returnMethod && (
          <DetailRow
            label="Return method"
            value={decision.returnMethod === 'bank_transfer' ? 'Bank transfer' : 'Cash'}
          />
        )}
        {decision.recoveryDate && <DetailRow label="Recovery date" value={decision.recoveryDate} />}
        {decision.receiptReference && (
          <DetailRow label="Receipt / transfer reference" value={decision.receiptReference} />
        )}
        {decision.targetMmpId && (
          <DetailRow label="Target cycle" value={targetMmpName || decision.targetMmpId} />
        )}
        {decision.targetSiteId && (
          <DetailRow label="Target site" value={decision.targetSiteName || decision.targetSiteId} />
        )}
      </div>
      {decision.justification && (
        <div className="rounded border border-green-200 bg-white/70 px-2 py-1.5">
          <span className="font-medium text-green-800">Justification: </span>
          <span className="text-slate-700">{decision.justification}</span>
        </div>
      )}
      {decision.decision === 'redirect' && (
        <div className="rounded border border-green-200 bg-white/70 px-2 py-2 space-y-1.5 text-slate-700">
          <p className="font-medium text-green-800">Payment trace — no second cash payment</p>
          <p>
            This uses the already-disbursed transportation advance as the fee settlement.
            It does not create a new payment, receipt, or Cost Submission.
          </p>
          <DetailRow label="Source Down Payment ID" value={site.advanceId} mono />
          <DetailRow label="Original transport amount" value={`SDG ${site.advancePaid.toLocaleString()}`} />
          {site.walletTransactionIds?.length ? (
            <DetailRow label="Original payment reference(s)" value={site.walletTransactionIds.join(', ')} mono />
          ) : (
            <DetailRow label="Original payment reference(s)" value="No wallet transaction reference recorded" />
          )}
          {(decision.allocations?.length ?? 0) > 0 ? (
            <div className="space-y-1.5 pt-1">
              <p className="font-medium text-green-800">
                Target allocations ({decision.allocations!.length})
              </p>
              {decision.allocations!.map((allocation, index) => (
                <div key={allocation.targetSiteId} className="rounded border border-green-100 bg-green-50/60 p-2">
                  <p className="font-semibold text-slate-800">
                    {index + 1}. {allocation.targetSiteName ?? allocation.targetSiteId}
                  </p>
                  <div className="grid gap-x-3 sm:grid-cols-2">
                    <DetailRow label="Allocated" value={`SDG ${allocation.amount.toLocaleString()}`} />
                    <DetailRow
                      label="Result"
                      value={allocation.feeSettlementStatus === 'paid' ? 'Fully paid' : 'Partially paid'}
                    />
                    {allocation.feeGrossAmount != null && (
                      <DetailRow label="Fee gross" value={`SDG ${allocation.feeGrossAmount.toLocaleString()}`} />
                    )}
                    {allocation.feePriorSettledAmount != null && (
                      <DetailRow label="Previously settled" value={`SDG ${allocation.feePriorSettledAmount.toLocaleString()}`} />
                    )}
                    {allocation.feeRemainingAmount != null && (
                      <DetailRow label="Fee remaining" value={`SDG ${allocation.feeRemainingAmount.toLocaleString()}`} />
                    )}
                    {allocation.journalEntryId && (
                      <DetailRow label="Allocation journal" value={allocation.journalEntryId} mono />
                    )}
                  </div>
                </div>
              ))}
              <DetailRow
                label="Total allocated"
                value={`SDG ${decision.allocations!.reduce((sum, allocation) => sum + allocation.amount, 0).toLocaleString()}`}
              />
              <DetailRow
                label="Unallocated"
                value={`SDG ${(decision.unallocatedAmount ?? 0).toLocaleString()}`}
              />
            </div>
          ) : (
            <>
              <DetailRow label="Target fee gross" value={decision.feeGrossAmount != null
                ? `SDG ${decision.feeGrossAmount.toLocaleString()}`
                : 'Recorded on the target site'} />
              <DetailRow label="Fee settled by this advance" value={`SDG ${(decision.feeSettledAmount ?? decision.amount ?? 0).toLocaleString()}`} />
              {decision.feeRemainingAmount != null && (
                <DetailRow label="Fee remaining after settlement" value={`SDG ${decision.feeRemainingAmount.toLocaleString()}`} />
              )}
              <DetailRow
                label="Fee settlement status"
                value={decision.feeSettlementStatus === 'paid' ? 'Fully paid' : 'Partially paid'}
              />
            </>
          )}
          {decision.sourcePaymentReferences?.length ? (
            <DetailRow label="Saved payment references" value={decision.sourcePaymentReferences.join(', ')} mono />
          ) : null}
          <p className="pt-1 text-green-700">
            GL posting: Debit Enumerator Fees · Credit Transport Advance
          </p>
          <p className="text-muted-foreground">
            Verify the original payment in{' '}
            <a className="font-semibold underline" href="/field-payments?tab=advances">Field Payments Centre → Advances</a>;
            verify every target result in{' '}
            <a className="font-semibold underline" href="/field-payments?tab=fees">Field Payments Centre → Fees</a>;
            and search the GL journal ID in <strong>Accounting → GL Bridge Audit / Ledger</strong>.
          </p>
          {canCorrectRedirect && (
            <div className="border-t border-amber-200 pt-2 mt-2 space-y-2">
              <p className="text-amber-800">
                If this legacy Redirect settled the wrong site, Finance can reverse its journal
                and return the paid advance to the unresolved queue without deleting this history.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 border-amber-400 text-amber-800 hover:bg-amber-50"
                onClick={onCorrectRedirect}
                data-testid={`button-reopen-redirect-${decision.actionId}`}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Reopen advance for correction
              </Button>
            </div>
          )}
        </div>
      )}
      {decision.actionId && (
        <p className="font-mono text-[10px] text-green-700/80">Action ID: {decision.actionId}</p>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <span className="text-muted-foreground">{label}: </span>
      <span className={mono ? 'font-mono break-all' : 'font-medium text-slate-700'}>{value}</span>
    </div>
  );
}

function RedirectAllocationEditor({
  sourceSiteId,
  advanceAmount,
  allocations,
  sites,
  loading,
  disabled,
  canOverride,
  onChange,
}: {
  sourceSiteId: string;
  advanceAmount: number;
  allocations: RedirectAllocationDraft[];
  sites: TargetSite[];
  loading: boolean;
  disabled: boolean;
  canOverride: boolean;
  onChange: (allocations: RedirectAllocationDraft[]) => void;
}) {
  const settlementTargets = sites.map(toSettlementTarget);
  const summary = summarizeRedirectAllocations(
    sourceSiteId,
    settlementTargets,
    allocations,
    advanceAmount,
  );
  const selectedIds = new Set(allocations.map(allocation => allocation.targetSiteId));
  const availableSites = sites.filter(site => !selectedIds.has(site.id));

  const addTarget = (targetSiteId: string) => {
    if (targetSiteId === '__add_target__') return;
    const target = sites.find(site => site.id === targetSiteId);
    if (!target) return;
    const amount = Math.min(summary.unallocatedAmount, getRedirectTargetCapacity(toSettlementTarget(target)));
    onChange([
      ...allocations,
      {
        targetSiteId: target.id,
        targetSiteName: target.site_name,
        targetEnumeratorId: target.accepted_by,
        sameEnumerator: target.sameEnumerator,
        amount,
      },
    ]);
  };

  const updateAmount = (index: number, amount: number) => {
    onChange(allocations.map((allocation, allocationIndex) =>
      allocationIndex === index ? { ...allocation, amount } : allocation
    ));
  };

  const removeTarget = (index: number) => {
    onChange(allocations.filter((_, allocationIndex) => allocationIndex !== index));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 border-blue-300 text-blue-800"
          disabled={disabled || loading || sites.length === 0}
          onClick={() => onChange(buildAutomaticRedirectAllocations(
            sourceSiteId,
            settlementTargets,
            advanceAmount,
          ))}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Auto-allocate
        </Button>
        <div className="min-w-64 flex-1">
          <Select
            value="__add_target__"
            disabled={disabled || loading || availableSites.length === 0 || summary.unallocatedAmount <= 0}
            onValueChange={addTarget}
          >
            <SelectTrigger className="h-8 bg-white text-sm" data-testid={`select-add-allocation-${sourceSiteId}`}>
              <SelectValue placeholder={loading ? 'Loading sites…' : 'Add covered target site'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__add_target__" disabled>
                <span className="flex items-center gap-1"><Plus className="h-3 w-3" /> Add covered target site</span>
              </SelectItem>
              {availableSites.map(site => (
                <SelectItem key={site.id} value={site.id}>
                  {site.site_name}
                  {` · remaining SDG ${getRedirectTargetCapacity(toSettlementTarget(site)).toLocaleString()}`}
                  {site.sameEnumerator === false ? ' · different enumerator' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {allocations.length === 0 ? (
        <div className="rounded border border-dashed border-blue-300 bg-white/60 p-3 text-center text-blue-800">
          Select targets manually or use Auto-allocate. Same-enumerator sites are filled first.
        </div>
      ) : (
        <div className="space-y-2">
          {allocations.map((allocation, index) => {
            const target = sites.find(site => site.id === allocation.targetSiteId);
            const capacity = target ? getRedirectTargetCapacity(toSettlementTarget(target)) : 0;
            const applied = Math.min(Math.max(allocation.amount || 0, 0), capacity);
            const remainingAfter = Math.max(capacity - applied, 0);
            return (
              <div
                key={allocation.targetSiteId}
                className="grid gap-2 rounded border border-blue-200 bg-white p-2 sm:grid-cols-[1fr_150px_32px]"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800">
                    {allocation.targetSiteName ?? target?.site_name ?? allocation.targetSiteId}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Fee remaining before allocation: SDG {capacity.toLocaleString()}
                    {' · '}after: SDG {remainingAfter.toLocaleString()}
                    {' · '}{remainingAfter === 0 ? 'Fully paid' : 'Partially paid'}
                  </p>
                  {(allocation.sameEnumerator ?? target?.sameEnumerator) === false && (
                    <p className={canOverride ? 'text-amber-700' : 'text-red-700'}>
                      Different enumerator — FOM/Admin/Super Admin authorization required.
                    </p>
                  )}
                </div>
                <div>
                  <label className="sr-only">Allocation amount</label>
                  <Input
                    type="number"
                    min={0.01}
                    max={capacity}
                    step="0.01"
                    value={allocation.amount || ''}
                    disabled={disabled}
                    onChange={event => updateAmount(index, Number(event.target.value))}
                    className="h-8 text-sm"
                    data-testid={`input-allocation-${allocation.targetSiteId}`}
                  />
                  <p className="mt-0.5 text-[10px] text-muted-foreground">SDG allocated</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-600"
                  disabled={disabled}
                  onClick={() => removeTarget(index)}
                  aria-label={`Remove ${allocation.targetSiteName ?? target?.site_name ?? 'target'}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 rounded border border-blue-200 bg-blue-100/70 p-2 text-center">
        <div>
          <p className="text-[10px] uppercase text-blue-700">Advance</p>
          <p className="font-semibold text-blue-950">SDG {advanceAmount.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-blue-700">Allocated</p>
          <p className="font-semibold text-blue-950">SDG {summary.totalAllocated.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-blue-700">Unallocated</p>
          <p className={`font-semibold ${summary.unallocatedAmount > 0 ? 'text-red-700' : 'text-green-700'}`}>
            SDG {summary.unallocatedAmount.toLocaleString()}
          </p>
        </div>
      </div>
      {summary.errors.map(error => (
        <p key={error} className="flex items-start gap-1 text-red-700">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" /> {error}
        </p>
      ))}
      {!summary.isComplete && summary.errors.length === 0 && allocations.length > 0 && (
        <p className="flex items-start gap-1 text-amber-700">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          Allocate the remaining SDG {summary.unallocatedAmount.toLocaleString()}, or choose another resolution for the entire advance.
        </p>
      )}
    </div>
  );
}

function TargetSiteSelect({
  siteId,
  value,
  sites,
  loading,
  disabled,
  onChange,
}: {
  siteId: string;
  value?: string;
  sites: TargetSite[];
  loading: boolean;
  disabled: boolean;
  onChange: (siteId: string, siteName: string) => void;
}) {
  return (
    <Select
      value={value ?? ''}
      disabled={disabled || loading}
      onValueChange={selectedId => {
        const selected = sites.find(site => site.id === selectedId);
        onChange(selectedId, selected?.site_name ?? selectedId);
      }}
    >
      <SelectTrigger className="h-8 text-sm" data-testid={`select-target-site-${siteId}`}>
        <SelectValue placeholder={loading ? 'Loading sites…' : 'Select covered site'} />
      </SelectTrigger>
      <SelectContent>
        {sites.map(site => (
          <SelectItem key={site.id} value={site.id}>
            {site.site_name}
            {(site.state || site.locality) ? ` · ${[site.state, site.locality].filter(Boolean).join(' / ')}` : ''}
            {site.enumerator_fee != null || site.transport_fee != null
              ? ` · fee remaining SDG ${Math.max(
                (site.enumerator_fee ?? 0) + (site.transport_fee ?? 0) - (site.fee_paid_amount ?? 0),
                0,
              ).toLocaleString()}`
              : ''}
            {site.sameEnumerator === false ? ' · different enumerator (approval required)' : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
