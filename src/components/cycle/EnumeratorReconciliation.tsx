/**
 * EnumeratorReconciliation
 * Per-enumerator financial reconciliation table for the Cycle Close Finance tab.
 * Shows: Sites Assigned | WFP Confirmed | Advance Paid | Total Earned | Net to Pay
 * Actions: Generate Payment | Schedule Recovery | Write-Off | Redirect to Fees
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  CheckCircle2, AlertTriangle, Loader2, RefreshCw,
  DollarSign, Download, ArrowUpRight, ArrowDownLeft,
  Minus, Users, FileSpreadsheet, Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { exportMultiSheetExcel } from '@/utils/report-export';
import { format } from 'date-fns';
import { dispatchNotification } from '@/lib/notify';

interface EnumRow {
  enumeratorId: string | null;
  enumeratorName: string;
  sitesAssigned: number;
  wfpConfirmed: number;
  wfpRejected: number;
  notCovered: number;
  advancePaid: number;
  enumeratorFeeEarned: number;
  transportFeeEarned: number;
  totalEarned: number;
  netToPay: number;               // positive = owe to enumerator, negative = overpaid
  currency: string;
  settlementStatus: 'pending' | 'payment_generated' | 'recovery_scheduled' | 'written_off' | 'redirected' | 'balanced';
  settlementNote: string | null;
  hasNoAdvance: boolean;          // completed with no advance at all
  hasDiscrepancy: boolean;        // "complete" but wfp_rejected sites
  discrepancyCount: number;
}

interface ActionDialogState {
  row: EnumRow | null;
  mode: 'payment' | 'recovery' | 'writeoff' | 'redirect' | null;
}

interface Props {
  mmpId: string;
  mmpName?: string;
  wfpApplied: boolean;
}

const CURRENCY_DEFAULT = 'SDG';

export function EnumeratorReconciliation({ mmpId, mmpName, wfpApplied }: Props) {
  const { currentUser } = useAppContext();
  const { toast } = useToast();
  const [rows, setRows] = useState<EnumRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState<ActionDialogState>({ row: null, mode: null });

  // Dialog form state
  const [formNote, setFormNote] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formRecoveryMethod, setFormRecoveryMethod] = useState('deduction_next_payment');
  const [formDeadline, setFormDeadline] = useState('');

  const load = useCallback(async () => {
    if (!mmpId) return;
    setLoading(true);
    try {
      // 1. All site entries for this MMP
      const { data: entries } = await supabase
        .from('mmp_site_entries')
        .select('id, status, accepted_by, not_covered_flag, enumerator_fee, transport_fee, currency')
        .eq('mmp_file_id', mmpId);

      const allEntries = entries || [];
      const entryIds = allEntries.map(e => e.id);

      // 2. Profiles for enumerator names
      const enumIds = [...new Set(allEntries.map(e => e.accepted_by).filter(Boolean))] as string[];
      let profileMap: Record<string, string> = {};
      if (enumIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', enumIds);
        (profiles || []).forEach((p: any) => { profileMap[p.id] = p.full_name || 'Unknown'; });
      }

      // 3. Down payment requests (advances)
      let advanceData: any[] = [];
      if (entryIds.length > 0) {
        const PAGE = 1000;
        for (let from = 0; ; from += PAGE) {
          const { data } = await supabase
            .from('down_payment_requests')
            .select('mmp_site_entry_id, total_paid_amount, requested_amount, status, currency')
            .in('mmp_site_entry_id', entryIds)
            .in('status', ['approved', 'partially_paid', 'fully_paid', 'paid'])
            .range(from, from + PAGE - 1);
          advanceData = [...advanceData, ...(data || [])];
          if (!data || data.length < PAGE) break;
        }
      }

      // 4. Settlement records (if any exist)
      let settlementMap: Record<string, { status: string; note: string | null }> = {};
      if (enumIds.length > 0) {
        const { data: settlements } = await supabase
          .from('enumerator_reconciliation_records')
          .select('enumerator_id, settlement_status, settlement_note')
          .eq('mmp_id', mmpId)
          .in('enumerator_id', enumIds);
        (settlements || []).forEach((s: any) => {
          settlementMap[s.enumerator_id] = { status: s.settlement_status, note: s.settlement_note };
        });
      }

      // Group site entries by enumerator
      const grouped: Record<string, {
        entries: typeof allEntries;
        currency: string;
      }> = {};

      // Also group "no enumerator assigned" together
      allEntries.forEach(e => {
        const key = e.accepted_by || '__unassigned__';
        if (!grouped[key]) grouped[key] = { entries: [], currency: e.currency || CURRENCY_DEFAULT };
        grouped[key].entries.push(e);
      });

      // Map advance amounts per site entry
      const advanceByEntry: Record<string, number> = {};
      advanceData.forEach((a: any) => {
        const paid = a.total_paid_amount ?? a.requested_amount ?? 0;
        advanceByEntry[a.mmp_site_entry_id] = (advanceByEntry[a.mmp_site_entry_id] ?? 0) + paid;
      });

      const result: EnumRow[] = Object.entries(grouped).map(([key, group]) => {
        const isUnassigned = key === '__unassigned__';
        const enumId = isUnassigned ? null : key;
        const enumName = isUnassigned ? 'Unassigned Sites' : (profileMap[key] || 'Unknown');

        const sitesAssigned = group.entries.length;
        const confirmed = group.entries.filter(e => {
          const st = (e.status || '').toLowerCase();
          return st === 'wfp_confirmed' || st === 'verified' || st === 'approved' || st === 'completed';
        });
        const rejected = group.entries.filter(e => (e.status || '').toLowerCase() === 'wfp_rejected');
        const notCov = group.entries.filter(e =>
          e.not_covered_flag === true || (e.status || '').toLowerCase() === 'not_covered'
        );

        // Complete but WFP rejected (discrepancy)
        const completeButRejected = group.entries.filter(e => {
          const st = (e.status || '').toLowerCase();
          return st === 'wfp_rejected';
        });

        const advancePaid = group.entries.reduce((s, e) => s + (advanceByEntry[e.id] ?? 0), 0);
        const enumFeeEarned = confirmed.reduce((s, e) => s + (e.enumerator_fee ?? 0), 0);
        const transportEarned = confirmed.reduce((s, e) => s + (e.transport_fee ?? 0), 0);
        const totalEarned = enumFeeEarned + transportEarned;
        const netToPay = totalEarned - advancePaid;

        const settlement = enumId ? settlementMap[enumId] : null;
        let settlementStatus: EnumRow['settlementStatus'] = 'pending';
        if (settlement) {
          settlementStatus = settlement.status as EnumRow['settlementStatus'];
        } else if (Math.abs(netToPay) < 1) {
          settlementStatus = 'balanced';
        }

        return {
          enumeratorId: enumId,
          enumeratorName: enumName,
          sitesAssigned,
          wfpConfirmed: confirmed.length,
          wfpRejected: rejected.length,
          notCovered: notCov.length,
          advancePaid,
          enumeratorFeeEarned: enumFeeEarned,
          transportFeeEarned: transportEarned,
          totalEarned,
          netToPay,
          currency: group.currency,
          settlementStatus,
          settlementNote: settlement?.note ?? null,
          hasNoAdvance: advancePaid === 0 && confirmed.length > 0,
          hasDiscrepancy: completeButRejected.length > 0,
          discrepancyCount: completeButRejected.length,
        };
      }).sort((a, b) => {
        // Pending first, then by name
        if (a.settlementStatus === 'pending' && b.settlementStatus !== 'pending') return -1;
        if (b.settlementStatus === 'pending' && a.settlementStatus !== 'pending') return 1;
        return a.enumeratorName.localeCompare(b.enumeratorName);
      });

      setRows(result);
    } catch (err: any) {
      console.error('EnumeratorReconciliation load error', err);
    } finally {
      setLoading(false);
    }
  }, [mmpId]);

  useEffect(() => { load(); }, [load]);

  const openDialog = (row: EnumRow, mode: ActionDialogState['mode']) => {
    setDialog({ row, mode });
    setFormNote('');
    setFormAmount(mode === 'redirect' ? String(Math.abs(row.netToPay)) : '');
    setFormRecoveryMethod('deduction_next_payment');
    setFormDeadline('');
  };

  const saveSettlement = async (status: EnumRow['settlementStatus'], note: string) => {
    if (!dialog.row || !currentUser?.id) return;
    setSaving(true);
    try {
      const rec = {
        mmp_id: mmpId,
        enumerator_id: dialog.row.enumeratorId,
        enumerator_name: dialog.row.enumeratorName,
        settlement_status: status,
        settlement_note: note || null,
        net_to_pay: dialog.row.netToPay,
        advance_paid: dialog.row.advancePaid,
        total_earned: dialog.row.totalEarned,
        currency: dialog.row.currency,
        decided_by: currentUser.id,
        decided_by_name: currentUser.full_name || currentUser.email || 'Admin',
        decided_at: new Date().toISOString(),
      };

      await supabase
        .from('enumerator_reconciliation_records')
        .upsert(rec as any, { onConflict: 'mmp_id,enumerator_id' });

      // Notify the enumerator
      if (dialog.row.enumeratorId) {
        const actionLabels: Record<string, string> = {
          payment_generated: 'A balance payment has been generated for your confirmed site visits.',
          recovery_scheduled: `A recovery of ${Math.abs(dialog.row.netToPay).toLocaleString()} ${dialog.row.currency} has been scheduled. Method: ${formRecoveryMethod}.`,
          written_off: 'The advance balance difference has been written off.',
          redirected: `${formAmount} ${dialog.row.currency} has been redirected to your enumerator fees.`,
        };
        if (actionLabels[status]) {
          await dispatchNotification({
            event: 'payment_balance_updated',
            recipientIds: [dialog.row.enumeratorId],
            titleEn: 'Cycle Close — Payment Update',
            titleAr: 'إغلاق الدورة — تحديث الدفعة',
            messageEn: actionLabels[status],
            messageAr: actionLabels[status],
            priority: 'normal',
            entityType: 'mmp',
            entityId: mmpId,
            triggeredBy: currentUser.id,
            triggeredByName: currentUser.full_name || 'Admin',
          }).catch(() => {});
        }
      }

      toast({ title: 'Settlement saved', description: `${dialog.row.enumeratorName} → ${status.replace(/_/g, ' ')}` });
      setDialog({ row: null, mode: null });
      await load();
    } catch (err: any) {
      toast({ title: 'Error saving settlement', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDialogSave = async () => {
    if (!dialog.row || !dialog.mode) return;
    const { mode, row } = dialog;
    let status: EnumRow['settlementStatus'] = 'pending';
    let note = formNote;

    if (mode === 'payment') {
      if (row.netToPay <= 0 && !row.hasNoAdvance) {
        toast({ title: 'No payment needed', description: 'Net to pay is zero or negative.', variant: 'destructive' });
        return;
      }
      status = 'payment_generated';
      note = `Payment of ${row.netToPay.toLocaleString()} ${row.currency} generated. ${formNote}`.trim();
    } else if (mode === 'recovery') {
      if (!formRecoveryMethod) { toast({ title: 'Select a recovery method', variant: 'destructive' }); return; }
      if (!formDeadline) { toast({ title: 'Enter a recovery deadline', variant: 'destructive' }); return; }
      status = 'recovery_scheduled';
      note = `Recovery: ${Math.abs(row.netToPay).toLocaleString()} ${row.currency} via ${formRecoveryMethod} by ${formDeadline}. ${formNote}`.trim();
    } else if (mode === 'writeoff') {
      if (formNote.trim().length < 10) {
        toast({ title: 'Justification required', description: 'Please enter at least 10 characters.', variant: 'destructive' });
        return;
      }
      status = 'written_off';
      note = formNote;
    } else if (mode === 'redirect') {
      const amt = parseFloat(formAmount);
      if (isNaN(amt) || amt <= 0) { toast({ title: 'Enter a valid amount', variant: 'destructive' }); return; }
      if (formNote.trim().length < 5) { toast({ title: 'Justification required', variant: 'destructive' }); return; }
      status = 'redirected';
      note = `Redirected ${amt.toLocaleString()} ${row.currency} to enumerator fees. Reason: ${formNote}`;
    }

    await saveSettlement(status, note);
  };

  const exportExcel = () => {
    const mainRows = rows.map(r => ({
      'Enumerator': r.enumeratorName,
      'Sites Assigned': r.sitesAssigned,
      'WFP Confirmed': r.wfpConfirmed,
      'WFP Rejected': r.wfpRejected,
      'Not Covered': r.notCovered,
      'Advance Paid': r.advancePaid,
      'Enumerator Fee Earned': r.enumeratorFeeEarned,
      'Transport Fee Earned': r.transportFeeEarned,
      'Total Earned': r.totalEarned,
      'Net to Pay (+) / Recover (-)': r.netToPay,
      'Currency': r.currency,
      'Settlement Status': r.settlementStatus.replace(/_/g, ' '),
      'Note': r.settlementNote || '',
      'Has Discrepancy': r.hasDiscrepancy ? 'Yes' : 'No',
    }));

    const totals = [{
      'Item': 'Total Advances Paid', 'Value': rows.reduce((s, r) => s + r.advancePaid, 0).toLocaleString(),
    }, {
      'Item': 'Total Earned (confirmed sites)', 'Value': rows.reduce((s, r) => s + r.totalEarned, 0).toLocaleString(),
    }, {
      'Item': 'Total to Pay Out', 'Value': rows.filter(r => r.netToPay > 0).reduce((s, r) => s + r.netToPay, 0).toLocaleString(),
    }, {
      'Item': 'Total to Recover', 'Value': rows.filter(r => r.netToPay < 0).reduce((s, r) => s + Math.abs(r.netToPay), 0).toLocaleString(),
    }, {
      'Item': 'Enumerators Pending Settlement', 'Value': rows.filter(r => r.settlementStatus === 'pending').length,
    }];

    exportMultiSheetExcel([
      { name: 'Enumerator Reconciliation', data: mainRows },
      { name: 'Financial Totals', data: totals },
    ], `enumerator-reconciliation-${mmpId.slice(0, 8)}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  // Totals
  const totalAdvances = rows.reduce((s, r) => s + r.advancePaid, 0);
  const totalEarned   = rows.reduce((s, r) => s + r.totalEarned, 0);
  const totalPayOut   = rows.filter(r => r.netToPay > 0).reduce((s, r) => s + r.netToPay, 0);
  const totalRecover  = rows.filter(r => r.netToPay < 0).reduce((s, r) => s + Math.abs(r.netToPay), 0);
  const pendingCount  = rows.filter(r => r.settlementStatus === 'pending').length;
  const currency      = rows[0]?.currency || CURRENCY_DEFAULT;

  const statusBadge = (row: EnumRow) => {
    const cfg: Record<string, { label: string; cls: string }> = {
      pending:           { label: 'Pending', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
      payment_generated: { label: 'Payment Generated', cls: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' },
      recovery_scheduled:{ label: 'Recovery Scheduled', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300' },
      written_off:       { label: 'Written Off', cls: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' },
      redirected:        { label: 'Redirected to Fees', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
      balanced:          { label: 'Balanced', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
    };
    const c = cfg[row.settlementStatus] || cfg.pending;
    return <Badge className={cn('text-xs', c.cls)}>{c.label}</Badge>;
  };

  if (!wfpApplied) {
    return (
      <Card className="border-amber-200 dark:border-amber-800">
        <CardContent className="py-8 text-center space-y-2">
          <AlertTriangle className="h-8 w-8 mx-auto text-amber-400" />
          <p className="font-medium text-sm">WFP Confirmation Not Yet Applied</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Upload and apply the WFP clean data file first. Enumerator reconciliation is unlocked only after site visit coverage is confirmed by the WFP data.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="enumerator-reconciliation">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-500" />
            Enumerator Financial Reconciliation
            <span dir="rtl" className="text-xs font-normal text-muted-foreground">مطابقة مستحقات العدادين</span>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Advance paid vs. actual coverage confirmed. Settle each enumerator before closing the cycle.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} data-testid="button-refresh-recon">
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1', loading && 'animate-spin')} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportExcel} disabled={rows.length === 0} data-testid="button-export-recon">
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> Export
          </Button>
        </div>
      </div>

      {/* KPI summary */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Advances Paid', labelAr: 'إجمالي السلف', value: totalAdvances.toLocaleString(), sub: currency, color: 'text-foreground' },
            { label: 'Total Earned (Confirmed)', labelAr: 'المستحق المؤكد', value: totalEarned.toLocaleString(), sub: currency, color: 'text-blue-600 dark:text-blue-400' },
            { label: 'Balance Payments Due', labelAr: 'مدفوعات مستحقة', value: totalPayOut.toLocaleString(), sub: currency, color: 'text-green-600 dark:text-green-400' },
            { label: 'Pending Settlement', labelAr: 'بانتظار التسوية', value: pendingCount, sub: 'enumerators', color: pendingCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600' },
          ].map(k => (
            <Card key={k.label} className="p-3 border-0 bg-muted/40">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p dir="rtl" className="text-[10px] text-muted-foreground/70">{k.labelAr}</p>
              <p className={cn('text-lg font-bold', k.color)}>{k.value}</p>
              <p className="text-[10px] text-muted-foreground">{k.sub}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Recovery total callout */}
      {totalRecover > 0 && (
        <Alert className="border-orange-200 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-800">
          <AlertTriangle className="h-4 w-4 text-orange-500" />
          <AlertDescription className="text-xs text-orange-700 dark:text-orange-300">
            <strong>{totalRecover.toLocaleString()} {currency}</strong> overpaid across {rows.filter(r => r.netToPay < 0).length} enumerator{rows.filter(r => r.netToPay < 0).length !== 1 ? 's' : ''} — decide how to handle the excess (recovery, write-off, or redirect).
          </AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading reconciliation data…</span>
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <CheckCircle2 className="h-10 w-10 mx-auto text-green-500 mb-3" />
            <p className="text-sm font-medium">No site entries found for this cycle.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map(row => {
            const netPositive = row.netToPay > 0.5;
            const netNegative = row.netToPay < -0.5;
            const netZero     = !netPositive && !netNegative;
            const isPending   = row.settlementStatus === 'pending';

            return (
              <Card
                key={row.enumeratorId || 'unassigned'}
                className={cn(
                  'border',
                  isPending && netPositive  && 'border-green-200 dark:border-green-800',
                  isPending && netNegative  && 'border-orange-200 dark:border-orange-800',
                  isPending && row.hasNoAdvance && 'border-blue-200 dark:border-blue-800',
                  !isPending && 'border-muted',
                )}
                data-testid={`row-recon-${row.enumeratorId || 'unassigned'}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3 flex-wrap">
                    {/* Enumerator info */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{row.enumeratorName}</span>
                        {statusBadge(row)}
                        {row.hasNoAdvance && (
                          <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 text-xs">No Advance</Badge>
                        )}
                        {row.hasDiscrepancy && (
                          <Badge className="bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 text-xs gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {row.discrepancyCount} WFP Rejected
                          </Badge>
                        )}
                      </div>

                      {/* Site counts */}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span>Assigned: <strong className="text-foreground">{row.sitesAssigned}</strong></span>
                        <span className="text-green-600 dark:text-green-400">✓ Confirmed: <strong>{row.wfpConfirmed}</strong></span>
                        {row.wfpRejected > 0 && <span className="text-red-500">✗ Rejected: <strong>{row.wfpRejected}</strong></span>}
                        {row.notCovered > 0 && <span className="text-muted-foreground">Not Covered: <strong>{row.notCovered}</strong></span>}
                      </div>

                      {/* Financial breakdown */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                        {[
                          { label: 'Advance Paid', value: row.advancePaid, cls: 'text-muted-foreground' },
                          { label: 'Total Earned', value: row.totalEarned, cls: 'text-blue-600 dark:text-blue-400' },
                          {
                            label: netZero ? 'Balanced' : netPositive ? 'Balance to Pay' : 'Overpaid (Recover)',
                            value: Math.abs(row.netToPay),
                            cls: netZero ? 'text-green-600' : netPositive ? 'text-green-600 font-bold' : 'text-orange-600 font-bold',
                          },
                        ].map(f => (
                          <div key={f.label} className="bg-muted/40 rounded-lg p-2">
                            <p className="text-[10px] text-muted-foreground">{f.label}</p>
                            <p className={cn('text-xs font-semibold tabular-nums', f.cls)}>
                              {netZero && f.label === 'Balanced' ? '—' : `${f.value.toLocaleString()} ${row.currency}`}
                            </p>
                          </div>
                        ))}
                      </div>

                      {row.settlementNote && (
                        <p className="text-xs text-muted-foreground italic mt-1">{row.settlementNote}</p>
                      )}

                      {/* Discrepancy warning */}
                      {row.hasDiscrepancy && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {row.discrepancyCount} site{row.discrepancyCount !== 1 ? 's' : ''} marked "Complete" by enumerator but rejected in WFP data — excluded from payment.
                        </p>
                      )}
                    </div>

                    {/* Action buttons */}
                    {isPending && (
                      <div className="flex flex-col gap-1.5 shrink-0 min-w-[130px]">
                        {/* Pay balance */}
                        {(netPositive || row.hasNoAdvance) && (
                          <Button
                            size="sm"
                            className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white gap-1"
                            onClick={() => openDialog(row, 'payment')}
                            data-testid={`button-generate-payment-${row.enumeratorId}`}
                          >
                            <ArrowUpRight className="h-3 w-3" />
                            {row.hasNoAdvance ? 'Generate Full Payment' : 'Generate Payment'}
                          </Button>
                        )}
                        {/* Schedule recovery */}
                        {netNegative && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-orange-300 text-orange-700 gap-1"
                            onClick={() => openDialog(row, 'recovery')}
                            data-testid={`button-recovery-${row.enumeratorId}`}
                          >
                            <ArrowDownLeft className="h-3 w-3" />
                            Schedule Recovery
                          </Button>
                        )}
                        {/* Redirect to fees */}
                        {netNegative && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1"
                            onClick={() => openDialog(row, 'redirect')}
                            data-testid={`button-redirect-${row.enumeratorId}`}
                          >
                            <Minus className="h-3 w-3" />
                            Redirect to Fees
                          </Button>
                        )}
                        {/* Write-off */}
                        {(netNegative || netZero) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-muted-foreground gap-1"
                            onClick={() => openDialog(row, 'writeoff')}
                            data-testid={`button-writeoff-${row.enumeratorId}`}
                          >
                            Write-Off
                          </Button>
                        )}
                        {/* Balanced — just mark settled */}
                        {netZero && !row.hasNoAdvance && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1 border-green-300 text-green-700"
                            onClick={() => saveSettlement('balanced', 'Balanced — no payment or recovery needed.')}
                            data-testid={`button-balanced-${row.enumeratorId}`}
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Mark Balanced
                          </Button>
                        )}
                      </div>
                    )}
                    {!isPending && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs shrink-0"
                        onClick={() => openDialog(row, row.netToPay > 0 ? 'payment' : 'recovery')}
                        data-testid={`button-change-settlement-${row.enumeratorId}`}
                      >
                        Change
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Financial totals footer */}
      {rows.length > 0 && (
        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-muted-foreground mb-3">Cycle Financial Totals</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              {[
                { label: 'Total Advances Paid', value: totalAdvances, cls: 'text-foreground' },
                { label: 'Total Earned (WFP confirmed)', value: totalEarned, cls: 'text-blue-600' },
                { label: 'Balance Payments Due', value: totalPayOut, cls: 'text-green-600 font-bold' },
                { label: 'To Recover / Write-Off', value: totalRecover, cls: 'text-orange-600 font-bold' },
              ].map(f => (
                <div key={f.label} className="space-y-0.5">
                  <p className="text-muted-foreground">{f.label}</p>
                  <p className={cn('font-semibold tabular-nums', f.cls)}>{f.value.toLocaleString()} {currency}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Dialog */}
      <Dialog open={Boolean(dialog.row && dialog.mode)} onOpenChange={open => { if (!open) setDialog({ row: null, mode: null }); }}>
        <DialogContent className="max-w-md" data-testid="dialog-recon-action">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-amber-500" />
              {dialog.mode === 'payment'  && (dialog.row?.hasNoAdvance ? 'Generate Full Payment' : 'Generate Balance Payment')}
              {dialog.mode === 'recovery' && 'Schedule Recovery'}
              {dialog.mode === 'writeoff' && 'Write Off Difference'}
              {dialog.mode === 'redirect' && 'Redirect to Enumerator Fees'}
            </DialogTitle>
            {dialog.row && (
              <DialogDescription>
                {dialog.row.enumeratorName} · {Math.abs(dialog.row.netToPay).toLocaleString()} {dialog.row.currency}
                {dialog.mode === 'payment' && dialog.row.hasNoAdvance && ' (no advance was taken — full payment for all confirmed sites)'}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="space-y-4 py-2">
            {dialog.mode === 'payment' && dialog.row && (
              <>
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    This will generate a payment record for <strong>{Math.max(dialog.row.netToPay, dialog.row.totalEarned).toLocaleString()} {dialog.row.currency}</strong> covering {dialog.row.wfpConfirmed} confirmed site{dialog.row.wfpConfirmed !== 1 ? 's' : ''} (transport + enumerator fees).
                    The payment record will appear in the Finance queue for processing.
                  </AlertDescription>
                </Alert>
                <div className="space-y-1">
                  <Label>Breakdown</Label>
                  <div className="rounded-lg border p-3 space-y-1 text-xs">
                    <div className="flex justify-between"><span>Enumerator fees ({dialog.row.wfpConfirmed} sites)</span><span className="font-mono">{dialog.row.enumeratorFeeEarned.toLocaleString()} {dialog.row.currency}</span></div>
                    <div className="flex justify-between"><span>Transport fees ({dialog.row.wfpConfirmed} sites)</span><span className="font-mono">{dialog.row.transportFeeEarned.toLocaleString()} {dialog.row.currency}</span></div>
                    <div className="flex justify-between"><span>Advance already paid</span><span className="font-mono text-muted-foreground">− {dialog.row.advancePaid.toLocaleString()} {dialog.row.currency}</span></div>
                    <div className="flex justify-between font-semibold border-t pt-1 mt-1"><span>Net to pay</span><span className="font-mono text-green-600">{dialog.row.netToPay.toLocaleString()} {dialog.row.currency}</span></div>
                  </div>
                </div>
              </>
            )}

            {dialog.mode === 'recovery' && dialog.row && (
              <>
                <Alert className="border-orange-200 bg-orange-50 dark:bg-orange-950/30">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  <AlertDescription className="text-xs text-orange-700 dark:text-orange-300">
                    Enumerator was overpaid by <strong>{Math.abs(dialog.row.netToPay).toLocaleString()} {dialog.row.currency}</strong>. Schedule a recovery and the enumerator will be notified.
                  </AlertDescription>
                </Alert>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label>Recovery Method <span className="text-red-500">*</span></Label>
                    <Select value={formRecoveryMethod} onValueChange={setFormRecoveryMethod}>
                      <SelectTrigger data-testid="select-recovery-method">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="deduction_next_payment">Deduct from Next Payment</SelectItem>
                        <SelectItem value="cash_return">Cash Return</SelectItem>
                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Deadline <span className="text-red-500">*</span></Label>
                    <Input type="date" value={formDeadline} onChange={e => setFormDeadline(e.target.value)} min={new Date().toISOString().split('T')[0]} data-testid="input-recovery-deadline" />
                  </div>
                </div>
              </>
            )}

            {dialog.mode === 'redirect' && dialog.row && (
              <>
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Redirect part or all of the overpaid advance to the enumerator's fee line. Use this when the enumerator did additional work not captured as transport.
                  </AlertDescription>
                </Alert>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label>Amount to Redirect <span className="text-red-500">*</span> (max: {Math.abs(dialog.row.netToPay).toLocaleString()} {dialog.row.currency})</Label>
                    <Input
                      type="number"
                      value={formAmount}
                      onChange={e => setFormAmount(e.target.value)}
                      max={Math.abs(dialog.row.netToPay)}
                      min={0}
                      data-testid="input-redirect-amount"
                    />
                  </div>
                </div>
              </>
            )}

            {dialog.mode === 'writeoff' && dialog.row && (
              <Alert className="border-red-200 bg-red-50 dark:bg-red-950/30">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <AlertDescription className="text-xs text-red-700 dark:text-red-300">
                  This will write off <strong>{Math.abs(dialog.row.netToPay).toLocaleString()} {dialog.row.currency}</strong>. This action is logged permanently with your name and justification.
                </AlertDescription>
              </Alert>
            )}

            {/* Note / justification for all modes */}
            <div className="space-y-1">
              <Label>
                {dialog.mode === 'writeoff' || dialog.mode === 'redirect' ? 'Justification' : 'Note (optional)'}
                {(dialog.mode === 'writeoff' || dialog.mode === 'redirect') && <span className="text-red-500"> *</span>}
              </Label>
              <Textarea
                value={formNote}
                onChange={e => setFormNote(e.target.value)}
                placeholder={
                  dialog.mode === 'writeoff' ? 'Required: explain why this amount is being written off (min 10 characters)…'
                  : dialog.mode === 'redirect' ? 'Required: explain what additional work justifies the redirect…'
                  : 'Optional note for the finance team…'
                }
                className="min-h-[72px]"
                data-testid="input-action-note"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ row: null, mode: null })} disabled={saving}>Cancel</Button>
            <Button onClick={handleDialogSave} disabled={saving} data-testid="button-confirm-action">
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
