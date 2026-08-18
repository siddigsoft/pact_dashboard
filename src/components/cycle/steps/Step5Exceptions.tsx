
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info, CheckCircle2, Loader2, Download, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import type { WizardState, ExceptionDecision } from '../CycleCloseWizard';
import { exportFormattedExceptions, type ExceptionSite } from '@/utils/cycleCloseExport';

interface Props {
  wizardState: WizardState;
  updateWizardState: (patch: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
  canGoBack: boolean;
  canOverride: boolean;
  currentUser: any;
}

// ── Decision sets ─────────────────────────────────────────────────────────────

const DECISIONS_PAID = [
  {
    value: 'roll',
    label: 'Roll to Next MMP',
    labelAr: 'رحّل إلى الدورة التالية',
    desc: 'Treat as pre-payment for the next cycle.',
    descAr: 'تُعامَل كدفعة مقدمة للدورة القادمة.',
    track: 'Flagged as a rollover advance. Finance uses the Exception Tracker to link it to the enumerator\'s site in the next MMP.',
    trackAr: 'تُعلَّم كسلفة منقولة. تربطها المالية بموقع المعدد في الدورة القادمة عبر صفحة متابعة الاستثناءات.',
  },
  {
    value: 'return',
    label: 'Return Required',
    labelAr: 'استرداد مطلوب',
    desc: 'Enumerator must return the cash.',
    descAr: 'يجب على المعدد إعادة المبلغ نقداً.',
    track: 'Logged in Step 6 Reconciliation as a scheduled recovery. Finance generates a recovery receipt record.',
    trackAr: 'يُسجَّل في الخطوة ٦ كاسترداد مجدوَل. تُنشئ المالية سجل استلام الاسترداد.',
  },
  {
    value: 'writeoff',
    label: 'Write-Off',
    labelAr: 'شطب',
    desc: 'Amount is too small or unrecoverable. Justification required.',
    descAr: 'المبلغ صغير جداً أو يتعذر استرداده. مطلوب مبرر.',
    track: 'Recorded as "writeoff" in mmp_payment_records. Visible in Step 6 and the Final Close workbook Exceptions sheet.',
    trackAr: 'يُحفظ بنوع "شطب" في سجلات المدفوعات. يظهر في الخطوة ٦ وورقة الاستثناءات.',
  },
  {
    value: 'redirect',
    label: 'Redirect to Enumerator Fees',
    labelAr: 'تحويل إلى أتعاب المعددين',
    desc: 'Enumerator did related work — reclassify to the fee line.',
    descAr: 'قام المعدد بعمل ذي صلة — يُحوَّل إلى بند الأتعاب.',
    track: 'GL journal entry: Debit Enumerator Fees / Credit Transport Advance. Visible in GL ledger and Exceptions sheet.',
    trackAr: 'قيد محاسبي: مدين أتعاب المعددين / دائن سلفة النقل. يظهر في دفتر الأستاذ العام.',
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
    track: 'Marked "on hold". Finance uses the Exception Tracker to link it to the next MMP and release payment.',
    trackAr: 'يُعلَّم معلقاً. تربطه المالية بالدورة القادمة عبر صفحة متابعة الاستثناءات وتُصرف الدفعة.',
  },
  {
    value: 'reassign',
    label: 'Reassign to Covered Site',
    labelAr: 'إعادة تعيين لموقع مغطى',
    desc: 'Move this advance to a site the enumerator DID cover in this cycle.',
    descAr: 'نقل السلفة إلى موقع قام المعدد بتغطيته في هذه الدورة.',
    track: 'Advance re-linked to the selected confirmed site. Visible in Step 6 Reconciliation.',
    trackAr: 'تُربط السلفة بالموقع المؤكد المحدد. تظهر في مطابقة الخطوة ٦.',
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

// ── Component ─────────────────────────────────────────────────────────────────

export default function Step5Exceptions({
  wizardState, updateWizardState, onNext, onBack, canGoBack, canOverride,
}: Props) {
  const [exceptions, setExceptions]           = useState<ExceptionSite[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [showPaidGuide, setShowPaidGuide]     = useState(false);
  const [showApprGuide, setShowApprGuide]     = useState(false);

  useEffect(() => {
    if (wizardState.selectedMmpId) loadExceptions();
  }, [wizardState.selectedMmpId, wizardState.uncoveredReasons]);

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadExceptions = async () => {
    setLoading(true);
    const notCoveredIds = Object.keys(wizardState.uncoveredReasons);
    if (!notCoveredIds.length) { setLoading(false); return; }

    const { data: siteData } = await supabase
      .from('mmp_site_entries')
      .select('id, site_name, state, locality, accepted_by')
      .in('id', notCoveredIds);

    if (!siteData?.length) { setLoading(false); return; }

    // Resolve enumerator names
    const enumUuids = [...new Set((siteData as any[]).map((s: any) => s.accepted_by).filter(Boolean))];
    const nameMap: Record<string, string> = {};
    if (enumUuids.length) {
      const { data: profileRows } = await supabase
        .from('profiles').select('id, full_name').in('id', enumUuids);
      for (const p of (profileRows ?? [])) { if (p.full_name) nameMap[p.id] = p.full_name; }
    }

    // Load advances per site entry (include id + approver for downstream actions)
    const { data: advances } = await supabase
      .from('down_payment_requests')
      .select('id, mmp_site_entry_id, total_paid_amount, requested_amount, status, supervisor_approved_by')
      .in('mmp_site_entry_id', notCoveredIds)
      .in('status', ['approved', 'paid', 'partially_paid', 'fully_paid']);

    // Build per-site map (take the record with the highest paid amount if multiple)
    interface AdvanceRec {
      id: string; paidAmount: number; requestedAmount: number;
      status: 'paid' | 'fully_paid' | 'partially_paid' | 'approved';
      approvedById: string | null;
    }
    const advanceBySite: Record<string, AdvanceRec> = {};
    for (const a of (advances ?? []) as any[]) {
      const siteId = a.mmp_site_entry_id as string;
      const paid   = (a.total_paid_amount as number) ?? 0;
      const req    = (a.requested_amount as number) ?? 0;
      const existing = advanceBySite[siteId];
      if (!existing || paid > existing.paidAmount) {
        advanceBySite[siteId] = {
          id: a.id as string,
          paidAmount: paid,
          requestedAmount: req,
          status: a.status as AdvanceRec['status'],
          approvedById: (a.supervisor_approved_by as string | null) ?? null,
        };
      }
    }

    // Resolve approver names (supervisor_approved_by UUIDs)
    const approverUuids = [...new Set(
      Object.values(advanceBySite).map(r => r.approvedById).filter(Boolean) as string[]
    )];
    const approverNameMap: Record<string, string> = {};
    if (approverUuids.length) {
      const { data: approverRows } = await supabase
        .from('profiles').select('id, full_name').in('id', approverUuids);
      for (const p of (approverRows ?? [])) {
        if (p.full_name) approverNameMap[p.id] = p.full_name;
      }
    }

    const exceptionSites: ExceptionSite[] = (siteData as any[])
      .filter((s: any) => s.accepted_by && advanceBySite[s.id])
      .map((s: any) => {
        const adv = advanceBySite[s.id];
        return {
          siteId:          s.id as string,
          siteName:        s.site_name as string,
          state:           s.state as string,
          locality:        s.locality as string,
          enumeratorId:    s.accepted_by as string,
          enumeratorName:  nameMap[s.accepted_by] ?? 'Unknown',
          advancePaid:     adv.paidAmount,
          requestedAmount: adv.requestedAmount,
          advanceStatus:   adv.status,
          advanceId:       adv.id,
          approvedByName:  adv.approvedById ? (approverNameMap[adv.approvedById] ?? 'Unknown approver') : undefined,
        };
      });

    setExceptions(exceptionSites);
    setLoading(false);
  };

  // ── State helpers ───────────────────────────────────────────────────────────

  const setDecision = (siteId: string, patch: Partial<ExceptionDecision>) => {
    const current = wizardState.exceptionDecisions[siteId] ?? {} as ExceptionDecision;
    updateWizardState({
      exceptionDecisions: { ...wizardState.exceptionDecisions, [siteId]: { ...current, ...patch } },
    });
  };

  const isSiteComplete = (site: ExceptionSite): boolean => {
    const d = wizardState.exceptionDecisions[site.siteId];
    if (!d?.decision) return false;
    if (d.decision === 'redirect')  return !!d.justification && (d.amount ?? 0) > 0 && (d.amount ?? 0) <= site.advancePaid;
    if (d.decision === 'writeoff')  return !!d.justification;
    if (d.decision === 'reduce')    return (d.amount ?? 0) > 0 && (d.amount ?? 0) < site.requestedAmount;
    if (d.decision === 'reassign')  return !!d.targetSiteId;
    return true;
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
  const allDecided    = exceptions.every(isSiteComplete);

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
              key={site.siteId}
              site={site}
              decision={wizardState.exceptionDecisions[site.siteId]}
              decisions={DECISIONS_PAID as any}
              isDone={isSiteComplete(site)}
              canOverride={canOverride}
              setDecision={setDecision}
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
              key={site.siteId}
              site={site}
              decision={wizardState.exceptionDecisions[site.siteId]}
              decisions={DECISIONS_APPROVED as any}
              isDone={isSiteComplete(site)}
              canOverride={canOverride}
              setDecision={setDecision}
              variant="approved"
            />
          ))}
        </section>
      )}

      {!allDecided && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            All exceptions must have a decision before advancing. — يجب اتخاذ قرار لجميع الاستثناءات قبل المتابعة.
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
        <Button type="button" onClick={onNext} disabled={!allDecided} data-testid="button-next-step5">
          Next: Financial Reconciliation →
        </Button>
      </div>
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
        Not-covered sites with advance payments linked to their enumerators. Each requires a decision before the cycle can close.
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
  setDecision: (siteId: string, patch: Partial<ExceptionDecision>) => void;
  variant: 'paid' | 'approved';
}

function SiteCard({ site, decision: d, decisions, isDone, canOverride, setDecision, variant }: SiteCardProps) {
  const isPartial = site.advanceStatus === 'partially_paid';

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
    ? 'border-green-300 bg-green-50/20'
    : variant === 'paid'
      ? 'border-green-200'
      : 'border-amber-200';

  const chosen = decisions.find(x => x.value === d?.decision);

  return (
    <div className={`border rounded-lg p-4 space-y-3 ${borderClass}`}>
      {/* Site header */}
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <p className="font-semibold text-sm">{site.siteName}</p>
          <p className="text-xs text-muted-foreground">{site.state} / {site.locality} — {site.enumeratorName}</p>
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

      {/* Decision selector */}
      <Select
        value={d?.decision ?? ''}
        onValueChange={v => setDecision(site.siteId, { decision: v as ExceptionDecision['decision'] })}
      >
        <SelectTrigger className="w-full" data-testid={`select-decision-${site.siteId}`}>
          <SelectValue placeholder="Select recovery action… — اختر إجراء الاسترداد" />
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

      {d?.decision === 'redirect' && (
        <div className="space-y-2 pl-3 border-l-2 border-green-400">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs font-medium w-32">Amount to redirect</label>
            <Input
              type="number" min={0} max={site.advancePaid}
              value={d?.amount ?? ''}
              onChange={e => setDecision(site.siteId, { amount: Number(e.target.value) })}
              className="w-36 h-8 text-sm"
              placeholder={`Max: ${site.advancePaid}`}
              data-testid={`input-redirect-amount-${site.siteId}`}
            />
            <span className="text-xs text-muted-foreground">SDG (max: {site.advancePaid.toLocaleString()})</span>
          </div>
          {(d?.amount ?? 0) > site.advancePaid && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Amount cannot exceed paid amount (SDG {site.advancePaid.toLocaleString()})
            </p>
          )}
          <Textarea
            placeholder="Justification (required) — why is this advance being redirected to enumerator fees?"
            value={d?.justification ?? ''}
            onChange={e => setDecision(site.siteId, { justification: e.target.value })}
            rows={2} className="text-sm"
            data-testid={`input-redirect-justification-${site.siteId}`}
          />
          {!canOverride && (
            <p className="text-xs text-amber-600">⚠️ Redirect decisions must be approved by FOM or Admin</p>
          )}
          <p className="text-xs text-muted-foreground">GL: Debit Enumerator Fees / Credit Transport Advance</p>
        </div>
      )}

      {d?.decision === 'writeoff' && (
        <Textarea
          placeholder="Write-off justification (required) — المبرر مطلوب…"
          value={d?.justification ?? ''}
          onChange={e => setDecision(site.siteId, { justification: e.target.value })}
          rows={2} className="text-sm"
          data-testid={`input-writeoff-justification-${site.siteId}`}
        />
      )}

      {d?.decision === 'reduce' && (
        <div className="space-y-2 pl-3 border-l-2 border-amber-400">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs font-medium w-36">Reduced amount to approve</label>
            <Input
              type="number" min={1} max={site.requestedAmount - 1}
              value={d?.amount ?? ''}
              onChange={e => setDecision(site.siteId, { amount: Number(e.target.value) })}
              className="w-36 h-8 text-sm"
              placeholder={`< ${site.requestedAmount}`}
              data-testid={`input-reduce-amount-${site.siteId}`}
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
            Target site ID (covered site in this MMP for this enumerator). This will be fully supported via the Exception Tracker page after cycle close.
          </p>
          <p dir="rtl" className="text-xs text-muted-foreground">
            سيتم دعم عملية إعادة التعيين بالكامل عبر صفحة متابعة الاستثناءات بعد إغلاق الدورة.
          </p>
          <Input
            placeholder="Target site ID…"
            value={d?.targetSiteId ?? ''}
            onChange={e => setDecision(site.siteId, { targetSiteId: e.target.value })}
            className="h-8 text-sm font-mono"
            data-testid={`input-reassign-site-${site.siteId}`}
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

      {/* ── Not-decided warning ── */}
      {!d?.decision && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          You must select a recovery action for {site.siteName} before closing.
        </p>
      )}
    </div>
  );
}
