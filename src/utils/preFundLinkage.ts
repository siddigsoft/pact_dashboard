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
 *   - create a pre_fund_transactions record (user_id = submitter, created_by = finance actor)
 *   - deduct from available_balance (and increment paid_amount)
 *   - back-link the source row
 *   - deduct from the submitter's pre_fund_allocations.spent_amount (if allocated)
 *
 * Allocation guard: if a fund has ANY allocations, the SUBMITTER (userId) must be
 * one of them with sufficient remaining balance. Falls back to createdBy only when
 * userId is not provided.
 *
 * Matching priority (highest score wins):
 *  4 — country + project + cost_category match  (scope = country_project_category)
 *  3 — country + project match  (scope = country_project OR scope = country_project_category without category)
 *  2 — project-only match       (scope = project)
 *  1 — country-only match       (scope = country)
 *  0.5 — any active fund in same currency with sufficient balance
 *
 * When scope is country_project_category, a fund with a non-null cost_category that does NOT
 * match costCategory is excluded (score stays at 3 only if country+project match and cost_category
 * is null/unset; score is -1 if cost_category is set but mismatches).
 */
export async function linkPaymentToPreFund(params: {
  amount: number;
  currency: string;
  countryId?: string | null;
  projectId?: string | null;
  /**
   * Expense / cost category from the source record (e.g. OCS expense_category).
   * Required to get a score-4 match on funds scoped to country_project_category.
   */
  costCategory?: string | null;
  sourceTable: 'operational_cost_submissions' | 'down_payment_requests';
  sourceId: string;
  reference?: string | null;
  description?: string | null;
  paymentDate: string;
  /** Finance admin who approved/triggered the payment (for GL audit trail) */
  createdBy?: string | null;
  /** The field staff member who submitted/made the payment — used for allocation checks */
  userId?: string | null;
  /** URL of the payment receipt / attachment to store on the transaction */
  receiptUrl?: string | null;
}): Promise<FundLinkResult> {
  const {
    amount, currency, countryId, projectId, costCategory,
    sourceTable, sourceId, reference, description,
    paymentDate, createdBy, userId, receiptUrl,
  } = params;

  // The submitter is userId when provided; otherwise fall back to createdBy.
  // This is the identity used for allocation eligibility + deduction.
  const submitterId: string | null = userId ?? createdBy ?? null;

  const today = paymentDate.split('T')[0];

  // ── Read-only: load and score candidates ────────────────────────────────
  const { data: activeFunds, error: fetchErr } = await (supabase as any)
    .from('pre_fund_requests')
    .select('id,name,matching_scope,country_id,project_id,cost_category,available_balance,currency')
    .eq('status', 'active')
    .eq('currency', currency)
    .lte('start_date', today)
    .gte('end_date', today);

  if (fetchErr) return { linked: false, message: `Fund query failed: ${fetchErr.message}` };
  if (!activeFunds || (activeFunds as any[]).length === 0) {
    return { linked: false, message: 'No active pre-fund for this currency and period.' };
  }

  // ── Check user allocations for each candidate fund ───────────────────────
  // If a fund has allocations defined, the submitter (submitterId) must be one of them
  // AND have sufficient remaining balance.
  const fundIds = (activeFunds as any[]).map(f => f.id);
  const { data: allAllocations } = await (supabase as any)
    .from('pre_fund_allocations')
    .select('pre_fund_request_id,user_id,allocated_amount,spent_amount')
    .in('pre_fund_request_id', fundIds);

  const allocsByFund: Record<string, any[]> = {};
  for (const a of (allAllocations ?? [])) {
    if (!allocsByFund[a.pre_fund_request_id]) allocsByFund[a.pre_fund_request_id] = [];
    allocsByFund[a.pre_fund_request_id].push(a);
  }

  const scored = (activeFunds as any[]).map(f => {
    const scope: string = f.matching_scope ?? 'country';
    let score = 0;

    const countryProjectMatch = countryId && projectId
      && f.country_id === countryId && f.project_id === projectId;

    if (scope === 'country_project_category') {
      if (countryProjectMatch) {
        const fundCategory: string | null = f.cost_category ?? null;
        if (fundCategory) {
          // Fund has a specific category — only match if the payment's category matches exactly
          if (costCategory && costCategory === fundCategory) {
            score = 4; // perfect triple-match: country + project + category
          } else {
            // Category mismatch — this fund is ineligible for this payment
            return { fund: f, score: -1, userAllocation: null };
          }
        } else {
          // Fund has no category restriction — treat as a country+project match
          score = 3;
        }
      }
    } else if (scope === 'country_project' && countryProjectMatch) {
      score = 3;
    } else if (scope === 'project' && projectId && f.project_id === projectId) {
      score = 2;
    } else if (scope === 'country' && countryId && f.country_id === countryId) {
      score = 1;
    } else if ((f.available_balance ?? 0) >= amount) {
      score = 0.5;
    }

    // Allocation guard: check submitterId against the fund's allocation list
    const fundAllocs = allocsByFund[f.id] ?? [];
    let userAllocation: any = null;
    if (fundAllocs.length > 0) {
      // submitterId = field staff who made the payment (not the finance admin)
      const myAlloc = submitterId
        ? fundAllocs.find(a => a.user_id === submitterId)
        : null;
      if (!myAlloc) {
        // Fund is allocation-gated and this submitter has no allocation
        return { fund: f, score: -1, userAllocation: null };
      }
      const remaining = Number(myAlloc.allocated_amount) - Number(myAlloc.spent_amount);
      if (remaining < amount) {
        // Allocated but insufficient personal balance remaining
        return { fund: f, score: -1, userAllocation: null };
      }
      userAllocation = myAlloc;
    }

    return { fund: f, score, userAllocation };
  }).filter(x => x.score > 0 && (x.fund.available_balance ?? 0) >= amount)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return {
      linked: false,
      message: 'No active pre-fund matches this payment (check user allocation or fund balance). Finance must link manually in the Pre-Funding Registry.',
    };
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

  const best = scored[0];
  const bestFund = best.fund;

  // ── Atomic write via RPC ─────────────────────────────────────────────────
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
      p_user_id:      submitterId,        // field staff submitter for attribution
      p_receipt_url:  receiptUrl ?? null,
    }
  );

  if (rpcErr) return { linked: false, message: `Linkage RPC failed: ${rpcErr.message}` };
  if (rpcResult && rpcResult.success === false) {
    return { linked: false, message: rpcResult.error ?? 'Linkage failed.' };
  }
  // Allocation deduction is now inside link_payment_atomically_rpc — same DB transaction.
  // No separate deduct_pf_allocation call needed.

  return {
    linked: true,
    fundId: bestFund.id,
    fundName: bestFund.name,
    transactionId: rpcResult?.transaction_id,
    message: `Linked to "${bestFund.name}"`,
  };
}
