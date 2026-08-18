
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

const DECISIONS = [
  {
    value: 'roll',
    label: 'Roll to Next MMP',
    labelAr: 'رحّل إلى الدورة التالية',
    desc: 'Treat as pre-payment for the next cycle.',
    descAr: 'تُعامَل كدفعة مقدمة للدورة القادمة.',
    track: 'Tracked in Step 6 Reconciliation of the next cycle as an existing advance for this enumerator.',
    trackAr: 'يظهر في المطابقة المالية (الخطوة ٦) للدورة القادمة كسلفة قائمة للمعدد.',
    color: 'blue',
  },
  {
    value: 'return',
    label: 'Return Required',
    labelAr: 'استرداد مطلوب',
    desc: 'Enumerator must return the money.',
    descAr: 'يجب على المعدد إعادة المبلغ.',
    track: 'Logged in Step 6 Reconciliation as a scheduled recovery. Finance generates a recovery payment record.',
    trackAr: 'يُسجَّل في الخطوة ٦ كاسترداد مجدوَل. تُنشئ المالية سجل استرداد الدفع.',
    color: 'red',
  },
  {
    value: 'writeoff',
    label: 'Write-Off',
    labelAr: 'شطب',
    desc: 'Amount is too small or unrecoverable.',
    descAr: 'المبلغ صغير جداً أو يتعذر استرداده.',
    track: 'Recorded in mmp_payment_records with type "writeoff". Visible in Step 6 Reconciliation and the Excel workbook Exceptions sheet.',
    trackAr: 'يُحفظ في سجلات المدفوعات بنوع "شطب". يظهر في الخطوة ٦ وورقة الاستثناءات في ملف Excel.',
    color: 'amber',
  },
  {
    value: 'redirect',
    label: 'Redirect to Enumerator Fees',
    labelAr: 'تحويل إلى أتعاب المعددين',
    desc: 'Enumerator did related work — redirect to fee line.',
    descAr: 'قام المعدد بعمل ذي صلة — يُحوَّل إلى بند الأتعاب.',
    track: 'Creates a GL journal entry: Debit Enumerator Fees / Credit Transport Advance. Visible in the GL ledger and the Exceptions sheet of the Final Close workbook.',
    trackAr: 'يُنشئ قيداً محاسبياً: مدين أتعاب المعددين / دائن سلفة النقل. يظهر في دفتر الأستاذ العام وورقة الاستثناءات.',
    color: 'green',
  },
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

    // Get site data for not-covered sites — do NOT use profiles!accepted_by join
    // (accepted_by has no FK constraint to profiles, the join silently fails)
    const { data: siteData } = await supabase
      .from('mmp_site_entries')
      .select('id, site_name, state, locality, accepted_by')
      .in('id', notCoveredIds);

    if (!siteData?.length) { setLoading(false); return; }

    // Resolve enumerator names via separate profiles lookup
    const enumUuids = [...new Set((siteData as any[]).map((s: any) => s.accepted_by).filter(Boolean))];
    const nameMap: Record<string, string> = {};
    if (enumUuids.length) {
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', enumUuids);
      for (const p of (profileRows ?? [])) {
        if (p.full_name) nameMap[p.id] = p.full_name;
      }
    }

    // Advances are stored in down_payment_requests, linked via mmp_site_entry_id
    // (there is no mmp_file_id on down_payment_requests — join through entries)
    const { data: advances } = await supabase
      .from('down_payment_requests')
      .select('mmp_site_entry_id, total_paid_amount, requested_amount, status')
      .in('mmp_site_entry_id', notCoveredIds)
      .in('status', ['approved', 'paid', 'partially_paid', 'fully_paid']);

    // Map advance totals to the enumerator of each site entry
    const entryToEnum: Record<string, string> = {};
    for (const s of (siteData as any[])) {
      if (s.accepted_by) entryToEnum[s.id] = s.accepted_by;
    }

    const advanceByEnum: Record<string, number> = {};
    for (const a of (advances ?? [])) {
      const enumId = entryToEnum[(a as any).mmp_site_entry_id];
      if (!enumId) continue;
      const amount = (a as any).total_paid_amount ?? (a as any).requested_amount ?? 0;
      advanceByEnum[enumId] = (advanceByEnum[enumId] ?? 0) + amount;
    }

    const exceptionSites: ExceptionSite[] = (siteData as any[])
      .filter((s: any) => s.accepted_by && advanceByEnum[s.accepted_by] > 0)
      .map((s: any) => ({
        siteId: s.id,
        siteName: s.site_name,
        state: s.state,
        locality: s.locality,
        enumeratorId: s.accepted_by,
        enumeratorName: nameMap[s.accepted_by] ?? 'Unknown',
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
    void exportFormattedExceptions(exceptions, wizardState);
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
          <p className="text-sm text-muted-foreground" dir="rtl">الخطوة ٥ — الاستثناءات</p>
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
        <p className="text-sm text-muted-foreground" dir="rtl">الخطوة ٥ — الاستثناءات</p>
        <p className="text-muted-foreground text-sm">
          These not-covered sites had advance payments already paid to their enumerators. Each one needs a decision before the cycle can close.
        </p>
        <p className="text-sm text-muted-foreground" dir="rtl">المواقع غير المغطاة التي صُرفت مدفوعاتها مسبقاً للمعددين — يجب اتخاذ قرار بشأن كل منها قبل إغلاق الدورة.</p>
      </div>

      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex gap-3">
        <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800 dark:text-blue-200 space-y-3 w-full">
          <p className="font-semibold">4 options per site — ٤ خيارات لكل موقع</p>
          {DECISIONS.map(d => (
            <div key={d.value} className="space-y-0.5">
              <p>
                <strong>{d.label}</strong>
                <span className="mx-1 text-blue-500">·</span>
                <strong dir="rtl">{d.labelAr}</strong>
                <span className="text-blue-600 ml-2">—</span>
                <span className="ml-1">{d.desc}</span>
              </p>
              <p dir="rtl" className="text-xs text-blue-700 dark:text-blue-300">{d.descAr}</p>
              <p className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                <span className="font-medium">📍 Tracked:</span> {d.track}
              </p>
              <p dir="rtl" className="text-xs text-blue-600 dark:text-blue-400">
                <span className="font-medium">📍 المتابعة:</span> {d.trackAr}
              </p>
            </div>
          ))}
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
                        <div className="flex flex-col gap-0.5 py-0.5">
                          <span className="font-medium">{dec.label} · <span dir="rtl">{dec.labelAr}</span></span>
                          <span className="text-muted-foreground text-xs">{dec.desc}</span>
                        </div>
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

                {d?.decision && (() => {
                  const chosen = DECISIONS.find(x => x.value === d.decision);
                  return chosen ? (
                    <div className="rounded-md bg-muted/60 border border-border px-3 py-2 space-y-1">
                      <p className="text-xs text-muted-foreground flex items-start gap-1">
                        <span className="font-medium shrink-0">📍 Tracked:</span>
                        <span>{chosen.track}</span>
                      </p>
                      <p dir="rtl" className="text-xs text-muted-foreground">
                        <span className="font-medium">📍 المتابعة:</span> {chosen.trackAr}
                      </p>
                    </div>
                  ) : null;
                })()}

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
