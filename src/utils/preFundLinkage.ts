import { supabase } from '@/integrations/supabase/client';

export interface FundLinkResult {
  linked: boolean;
  fundId?: string;
  fundName?: string;
  transactionId?: string;
  message: string;
}

/**
 * Match a payment to the best active pre-fund and create a pre_fund_transactions
 * record, deduct from available_balance, and back-link the source row.
 *
 * Matching priority (highest score wins):
 *  3 — country + project match (scope: country_project or country_project_category)
 *  2 — project-only match (scope: project)
 *  1 — country-only match (scope: country)
 *  0.5 — any active fund in same currency with sufficient balance
 *
 * Called AFTER the cost/DP row is already set to paid — this is additive and
 * non-blocking (errors are returned, not thrown, so the parent payment flow is
 * never rolled back by a linkage failure).
 */
export async function linkPaymentToPreFund(params: {
  amount: number;
  currency: string;
  countryId?: string | null;
  projectId?: string | null;
  sourceTable: 'operational_cost_submissions' | 'down_payment_requests';
  sourceId: string;
  reference?: string | null;
  description?: string | null;
  paymentDate: string;
  createdBy?: string | null;
}): Promise<FundLinkResult> {
  const {
    amount, currency, countryId, projectId,
    sourceTable, sourceId, reference, description,
    paymentDate, createdBy,
  } = params;

  const today = paymentDate.split('T')[0];

  // Load all active funds that cover this date and match currency
  const { data: activeFunds, error: fetchErr } = await supabase
    .from('pre_fund_requests' as any)
    .select('id,name,matching_scope,country_id,project_id,available_balance,currency')
    .eq('status', 'active')
    .eq('currency', currency)
    .lte('start_date', today)
    .gte('end_date', today);

  if (fetchErr) return { linked: false, message: `Fund query failed: ${fetchErr.message}` };
  if (!activeFunds || (activeFunds as any[]).length === 0) {
    return { linked: false, message: 'No active pre-fund for this currency and period.' };
  }

  // Score each candidate
  const scored = (activeFunds as any[]).map(f => {
    const scope: string = f.matching_scope ?? 'country';
    let score = 0;
    if ((scope === 'country_project' || scope === 'country_project_category') &&
        countryId && projectId && f.country_id === countryId && f.project_id === projectId) {
      score = 3;
    } else if (scope === 'project' && projectId && f.project_id === projectId) {
      score = 2;
    } else if (scope === 'country' && countryId && f.country_id === countryId) {
      score = 1;
    } else if ((f.available_balance ?? 0) >= amount) {
      score = 0.5;
    }
    return { fund: f, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return { linked: false, message: 'No matching pre-fund for this payment scope.' };
  }

  const bestFund = scored[0].fund;

  // Create pre_fund_transactions record
  const { data: txn, error: txnErr } = await supabase
    .from('pre_fund_transactions' as any)
    .insert({
      pre_fund_request_id: bestFund.id,
      transaction_type: 'payment',
      amount,
      currency,
      reference: reference ?? null,
      description: description ?? `Auto-linked from ${sourceTable}`,
      transaction_date: today,
      reconciled: false,
      created_by: createdBy ?? null,
    })
    .select('id')
    .maybeSingle();

  if (txnErr) return { linked: false, message: `Transaction insert failed: ${txnErr.message}` };

  const txnId = (txn as any)?.id;
  const newBalance = Math.max(0, (bestFund.available_balance ?? 0) - amount);

  // Deduct from available_balance
  await supabase.from('pre_fund_requests' as any)
    .update({ available_balance: newBalance })
    .eq('id', bestFund.id);

  // Back-link source row
  await supabase.from(sourceTable as any)
    .update({ pre_fund_transaction_id: txnId })
    .eq('id', sourceId);

  return {
    linked: true,
    fundId: bestFund.id,
    fundName: bestFund.name,
    transactionId: txnId,
    message: `Linked to "${bestFund.name}"`,
  };
}
