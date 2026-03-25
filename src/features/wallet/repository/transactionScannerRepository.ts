import { supabase } from '@/integrations/supabase/client';

export type BankTransactionScansListRow = {
  id: string;
  session_name: string | null;
  scanned_at: string;
  receipt_count: number;
  total_amount: number;
  receipts: any[];
};

export async function fetchBankTransactionScanSessions(limit: number = 50) {
  return supabase
    .from('bank_transaction_scans')
    .select('id, session_name, scanned_at, receipt_count, total_amount, receipts')
    .order('scanned_at', { ascending: false })
    .limit(limit);
}

export function getSupabaseAuthUser() {
  return supabase.auth.getUser();
}

export async function insertBankTransactionScanSession(params: {
  session_name: string | null;
  scanned_by: string | null;
  receipts: any[];
  receipt_count: number;
  total_amount: number;
}) {
  return supabase
    .from('bank_transaction_scans')
    .insert({
      session_name: params.session_name,
      scanned_by: params.scanned_by,
      receipts: params.receipts,
      receipt_count: params.receipt_count,
      total_amount: params.total_amount,
    })
    .select('id');
}

export async function fetchBankTransactionScanSessionById(id: string) {
  return supabase
    .from('bank_transaction_scans')
    .select('receipts, receipt_count, total_amount, session_name')
    .eq('id', id)
    .single();
}

export async function updateBankTransactionScanSessionReceipts(params: {
  id: string;
  receipts: any[];
  receipt_count: number;
  total_amount: number;
}) {
  return supabase
    .from('bank_transaction_scans')
    .update({
      receipts: params.receipts,
      receipt_count: params.receipt_count,
      total_amount: params.total_amount,
    })
    .eq('id', params.id);
}

export async function deleteBankTransactionScanSession(id: string) {
  return supabase.from('bank_transaction_scans').delete().eq('id', id);
}

