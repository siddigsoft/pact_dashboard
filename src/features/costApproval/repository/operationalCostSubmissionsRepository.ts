import { supabase } from '@/integrations/supabase/client';

export async function fetchPaidOperationalCostSubmissionsBySubmittedBy(submittedBy: string) {
  const { data, error } = await supabase
    .from('operational_cost_submissions')
    .select('*')
    .eq('submitted_by', submittedBy)
    .eq('status', 'paid')
    .order('paid_at', { ascending: false });

  if (error) throw error;
  return (data || []) as Array<Record<string, unknown>>;
}

export async function confirmOperationalCostReceipt(params: {
  costId: string;
  signatureId?: string | null;
}) {
  const now = new Date().toISOString();

  const { error } = await supabase
    .from('operational_cost_submissions')
    .update({
      fund_receipt_confirmed: true,
      fund_receipt_confirmed_at: now,
      fund_receipt_signature_url: params.signatureId || null,
      updated_at: now,
    })
    .eq('id', params.costId);

  if (!error) return;

  // Some setups may reject the update if it was already confirmed;
  // in that case we still want to allow reconciliation.
  if (error?.message?.includes('fund_receipt_confirmed')) {
    const { error: reconcileError } = await supabase
      .from('operational_cost_submissions')
      .update({ status: 'reconciled', updated_at: now })
      .eq('id', params.costId);

    if (reconcileError) throw reconcileError;
    return;
  }

  throw error;
}

