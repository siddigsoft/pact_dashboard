import { supabase } from '@/integrations/supabase/client';

export interface FundLinkResult {
  linked: boolean;
  fundId?: string;
  fundName?: string;
  transactionId?: string;
  /** True when 2+ funds tied for top score — Finance must link manually */
  needsManualSelection?: boolean;
  candidates?: Array<{ id: string; name: string }>;
  message: string;
}

/**
 * Match a payment to the best active pre-fund and atomically:
 *   - create a pre_fund_transactions record
 *   - deduct from available_balance (and increment paid_amount)
 *   - back-link the source row
 *
 * The scoring/matching phase is read-only TypeScript; the three writes are
 * delegated to link_payment_atomically_rpc which runs them inside a single
 * DB transaction — no partial state is possible on failure.
 *
 * Matching priority (highest score wins):
 *  3 — country + project match
 *  2 — project-only match
 *  1 — country-only match
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

  // ── Read-only: load and score candidates ────────────────────────────────
  const { data: activeFunds, error: fetchErr } = await (supabase as any)
    .from('pre_fund_requests')
    .select('id,name,matching_scope,country_id,project_id,available_balance,currency')
    .eq('status', 'active')
    .eq('currency', currency)
    .lte('start_date', today)
    .gte('end_date', today);

  if (fetchErr) return { linked: false, message: `Fund query failed: ${fetchErr.message}` };
  if (!activeFunds || (activeFunds as any[]).length === 0) {
    return { linked: false, message: 'No active pre-fund for this currency and period.' };
  }

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
  // Require sufficient balance for ALL score levels — scope-matched funds
  // with zero balance must not silently win over lower-scope funds with balance.
  }).filter(x => x.score > 0 && (x.fund.available_balance ?? 0) >= amount).sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return { linked: false, message: 'No active pre-fund matches this payment. Finance must link manually in the Pre-Funding Registry.' };
  }

  const topScore = scored[0].score;
  const topCandidates = scored.filter(x => x.score === topScore);
  if (topCandidates.length > 1) {
    return {
      linked: false,
      needsManualSelection: true,
      candidates: topCandidates.map(x => ({ id: x.fund.id, name: x.fund.name })),
      message: `${topCandidates.length} pre-funds match equally — please link manually in the Pre-Funding Registry.`,
    };
  }

  const bestFund = scored[0].fund;

  // ── Atomic write via RPC ─────────────────────────────────────────────────
  // txn insert + balance deduction + source back-link all in one DB transaction
  const { data: rpcResult, error: rpcErr } = await (supabase as any).rpc(
    'link_payment_atomically_rpc', {
      p_fund_id:      bestFund.id,
      p_amount:       amount,
      p_currency:     currency,
      p_source_table: sourceTable,
      p_source_id:    sourceId,
      p_reference:    reference ?? null,
      p_description:  description ?? null,
      p_payment_date: today,
      p_created_by:   createdBy ?? null,
    }
  );

  if (rpcErr) return { linked: false, message: `Linkage RPC failed: ${rpcErr.message}` };
  if (rpcResult && rpcResult.success === false) {
    return { linked: false, message: rpcResult.error ?? 'Linkage failed.' };
  }

  return {
    linked: true,
    fundId: bestFund.id,
    fundName: bestFund.name,
    transactionId: rpcResult?.transaction_id,
    message: `Linked to "${bestFund.name}"`,
  };
}
