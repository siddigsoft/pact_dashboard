import { supabase } from '@/integrations/supabase/client';

export type PaymentEventType =
  | 'site_confirmed'          // WFP confirmed the site — fee is now owed
  | 'site_rejected'           // WFP rejected the site — no fee
  | 'advance_approved'        // Down payment request approved (tier 1 or 2)
  | 'advance_paid'            // Advance disbursed to wallet
  | 'advance_reconciled'      // Advance marked as reconciled
  | 'advance_deducted_from_fee' // Advance deducted at settlement
  | 'recovery_decision_rolled'          // Not-covered cost rolled to next MMP
  | 'recovery_decision_return_required' // Not-covered cost — enumerator must return
  | 'recovery_decision_writeoff'        // Not-covered cost written off
  | 'repayment_received'      // Enumerator returned money
  | 'repayment_overdue'       // Repayment deadline passed
  | 'settlement_requested'    // Admin requested fee settlement on behalf of enumerator
  | 'settlement_disbursed'    // Finance confirmed disbursement to enumerator wallet
  | 'overpayment_detected'    // Enumerator was paid more than they earned
  | 'fee_locked'              // Fee locked at assignment (classification × base × multiplier)
  | 'fee_adjusted';           // Fee adjusted by admin with justification

export interface LogPaymentEventParams {
  eventType: PaymentEventType;
  amount?: number | null;
  amountCurrency?: string;
  siteEntryId?: string | null;
  mmpId?: string | null;
  paymentRefId?: string | null;
  performedById?: string | null;
  performedByName?: string | null;
  performedByRole?: string | null;
  enumeratorId?: string | null;
  note?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Appends one row to payment_event_log.
 * Call this for every money event that touches the system.
 * Never throws — logs silently on error so it never blocks the parent operation.
 */
export async function logPaymentEvent(params: LogPaymentEventParams): Promise<void> {
  try {
    const { error } = await supabase.from('payment_event_log').insert({
      event_type: params.eventType,
      amount: params.amount ?? null,
      amount_currency: params.amountCurrency ?? 'SDG',
      site_entry_id: params.siteEntryId ?? null,
      mmp_id: params.mmpId ?? null,
      payment_ref_id: params.paymentRefId ? (params.paymentRefId as any) : null,
      performed_by: params.performedById ?? null,
      performed_by_name: params.performedByName ?? null,
      performed_by_role: params.performedByRole ?? null,
      enumerator_id: params.enumeratorId ?? null,
      note: params.note ?? null,
      metadata: params.metadata ?? null,
    });

    if (error) {
      console.warn('[paymentEventLogger] Failed to log payment event:', error.message);
    }
  } catch (err) {
    console.warn('[paymentEventLogger] Unexpected error:', err);
  }
}

/**
 * Fetch the full money trail for a single site entry, ordered oldest → newest.
 * Used in the Money Timeline panel (enumerator view) and the full Money Trail panel (admin).
 */
export async function fetchPaymentTrail(siteEntryId: string) {
  const { data, error } = await supabase
    .from('payment_event_log')
    .select(
      'id, event_type, amount, amount_currency, payment_ref_id, performed_by_name, performed_by_role, enumerator_id, note, metadata, created_at',
    )
    .eq('site_entry_id', siteEntryId)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('[paymentEventLogger] Failed to fetch payment trail:', error.message);
    return [];
  }

  return data ?? [];
}

/**
 * Fetch all payment events for an MMP — used in the cycle History tab and Finance views.
 */
export async function fetchMmpPaymentTrail(mmpId: string) {
  const { data, error } = await supabase
    .from('payment_event_log')
    .select(
      'id, event_type, amount, amount_currency, site_entry_id, payment_ref_id, performed_by_name, performed_by_role, enumerator_id, note, metadata, created_at',
    )
    .eq('mmp_id', mmpId)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('[paymentEventLogger] Failed to fetch MMP payment trail:', error.message);
    return [];
  }

  return data ?? [];
}

/**
 * Human-readable label for each event type.
 * Used in the Money Timeline and History tab.
 */
export function paymentEventLabel(eventType: PaymentEventType): { en: string; ar: string } {
  const labels: Record<PaymentEventType, { en: string; ar: string }> = {
    site_confirmed:              { en: 'Site Confirmed by WFP',          ar: 'تم تأكيد الموقع من WFP' },
    site_rejected:               { en: 'Site Rejected by WFP',           ar: 'رُفض الموقع من WFP' },
    advance_approved:            { en: 'Advance Approved',               ar: 'تمت الموافقة على السلفة' },
    advance_paid:                { en: 'Advance Disbursed',              ar: 'تم صرف السلفة' },
    advance_reconciled:          { en: 'Advance Reconciled',             ar: 'تمت مطابقة السلفة' },
    advance_deducted_from_fee:   { en: 'Advance Deducted from Fee',      ar: 'تم خصم السلفة من المستحق' },
    recovery_decision_rolled:    { en: 'Cost Rolled to Next MMP',        ar: 'تم ترحيل التكلفة للدورة التالية' },
    recovery_decision_return_required: { en: 'Return of Funds Required', ar: 'مطلوب إعادة الأموال' },
    recovery_decision_writeoff:  { en: 'Cost Written Off',               ar: 'تم شطب التكلفة' },
    repayment_received:          { en: 'Repayment Received',             ar: 'تم استلام المبلغ المُعاد' },
    repayment_overdue:           { en: 'Repayment Overdue',              ar: 'تأخر السداد' },
    settlement_requested:        { en: 'Settlement Payment Requested',   ar: 'تم طلب سداد المستحق' },
    settlement_disbursed:        { en: 'Settlement Disbursed',           ar: 'تم صرف المستحق' },
    overpayment_detected:        { en: 'Overpayment Detected',           ar: 'تم اكتشاف دفع زائد' },
    fee_locked:                  { en: 'Fee Locked at Assignment',       ar: 'تم تثبيت المستحق عند التعيين' },
    fee_adjusted:                { en: 'Fee Adjusted',                   ar: 'تم تعديل المستحق' },
  };

  return labels[eventType] ?? { en: eventType, ar: eventType };
}
