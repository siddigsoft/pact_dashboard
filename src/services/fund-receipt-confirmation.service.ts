import { supabase } from '@/integrations/supabase/client';

export interface FundReceiptConfirmation {
  id: string;
  userId: string;
  walletId: string;
  amount: number;
  currency: string;
  status: string;
  fundReceiptConfirmed: boolean;
  fundReceiptConfirmedAt: string | null;
  fundReceiptSignatureUrl: string | null;
  fundReceiptNotes: string | null;
  requestReason: string | null;
  adminProcessedAt: string | null;
  createdAt: string;
}

export class FundReceiptConfirmationService {
  static async getApprovedWithdrawals(userId: string): Promise<FundReceiptConfirmation[]> {
    const { data, error } = await supabase
      .from('withdrawal_requests')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'approved')
      .order('admin_processed_at', { ascending: false });

    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      walletId: row.wallet_id,
      amount: parseFloat(row.amount),
      currency: row.currency,
      status: row.status,
      fundReceiptConfirmed: row.fund_receipt_confirmed || false,
      fundReceiptConfirmedAt: row.fund_receipt_confirmed_at,
      fundReceiptSignatureUrl: row.fund_receipt_signature_url,
      fundReceiptNotes: row.fund_receipt_notes,
      requestReason: row.request_reason,
      adminProcessedAt: row.admin_processed_at,
      createdAt: row.created_at,
    }));
  }

  static async getPendingConfirmations(userId: string): Promise<FundReceiptConfirmation[]> {
    const { data, error } = await supabase
      .from('withdrawal_requests')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'approved')
      .eq('fund_receipt_confirmed', false)
      .order('admin_processed_at', { ascending: false });

    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      walletId: row.wallet_id,
      amount: parseFloat(row.amount),
      currency: row.currency,
      status: row.status,
      fundReceiptConfirmed: false,
      fundReceiptConfirmedAt: null,
      fundReceiptSignatureUrl: null,
      fundReceiptNotes: null,
      requestReason: row.request_reason,
      adminProcessedAt: row.admin_processed_at,
      createdAt: row.created_at,
    }));
  }

  static async confirmReceipt(
    requestId: string,
    userId: string,
    options?: {
      notes?: string;
      signatureUrl?: string;
    }
  ): Promise<{ success: boolean; confirmedAt: string }> {
    const { data: request, error: fetchError } = await supabase
      .from('withdrawal_requests')
      .select('*')
      .eq('id', requestId)
      .eq('user_id', userId)
      .eq('status', 'approved')
      .single();

    if (fetchError || !request) {
      throw new Error('Withdrawal request not found or not eligible for confirmation');
    }

    if (request.fund_receipt_confirmed) {
      throw new Error('Fund receipt already confirmed / تم تأكيد الاستلام مسبقاً');
    }

    const confirmedAt = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('withdrawal_requests')
      .update({
        fund_receipt_confirmed: true,
        fund_receipt_confirmed_at: confirmedAt,
        fund_receipt_signature_url: options?.signatureUrl || null,
        fund_receipt_notes: options?.notes || null,
        updated_at: confirmedAt,
      })
      .eq('id', requestId)
      .eq('user_id', userId);

    if (updateError) throw updateError;

    return { success: true, confirmedAt };
  }

  static async getConfirmationStatus(requestId: string): Promise<{
    confirmed: boolean;
    confirmedAt: string | null;
    notes: string | null;
  }> {
    const { data, error } = await supabase
      .from('withdrawal_requests')
      .select('fund_receipt_confirmed, fund_receipt_confirmed_at, fund_receipt_notes')
      .eq('id', requestId)
      .single();

    if (error) throw error;

    return {
      confirmed: data?.fund_receipt_confirmed || false,
      confirmedAt: data?.fund_receipt_confirmed_at || null,
      notes: data?.fund_receipt_notes || null,
    };
  }

  static async getReceiptStats(userId: string): Promise<{
    totalApproved: number;
    totalConfirmed: number;
    totalPendingConfirmation: number;
    totalAmountConfirmed: number;
    totalAmountPending: number;
  }> {
    const { data, error } = await supabase
      .from('withdrawal_requests')
      .select('amount, fund_receipt_confirmed')
      .eq('user_id', userId)
      .eq('status', 'approved');

    if (error) throw error;

    const rows = data || [];
    const confirmed = rows.filter((r: any) => r.fund_receipt_confirmed);
    const pending = rows.filter((r: any) => !r.fund_receipt_confirmed);

    return {
      totalApproved: rows.length,
      totalConfirmed: confirmed.length,
      totalPendingConfirmation: pending.length,
      totalAmountConfirmed: confirmed.reduce((sum: number, r: any) => sum + parseFloat(r.amount), 0),
      totalAmountPending: pending.reduce((sum: number, r: any) => sum + parseFloat(r.amount), 0),
    };
  }
}
