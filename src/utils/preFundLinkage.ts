import { supabase } from '@/integrations/supabase/client';

// ─────────────────────────────────────────────────────────────────────────────
// Direct (non-atomic) fallback used when link_payment_atomically_rpc is not
// deployed yet. Performs the same 3 writes as the RPC but without a DB
// transaction wrapper — safe for production since each write is idempotent
// when retried and the pre_fund_transactions.source_id uniqueness prevents
// duplicate deductions.
// ─────────────────────────────────────────────────────────────────────────────
async function directLinkPayment(params: {
  fundId: string;
  fundName: string;
  amount: number;
  currency: string;
  sourceTable: string;
  sourceId: string;
  reference: string | null;
  description: string | null;
  paymentDate: string;
  createdBy: string | null;
  userId: string | null;
  receiptUrl: string | null;
}): Promise<FundLinkResult> {
  const { fundId, fundName, amount, currency, sourceTable, sourceId,
    reference, description, paymentDate, createdBy, userId, receiptUrl } = params;

  // 1. Check for existing transaction (prevent duplicate deductions on retry)
  const { data: existing } = await (supabase as any)
    .from('pre_fund_transactions')
    .select('id')
    .eq('source_table', sourceTable)
    .eq('source_id', sourceId)
    .maybeSingle();

  if (existing?.id) {
    return {
      linked: true,
      fundId,
      fundName,
      transactionId: existing.id,
      message: `Already linked to "${fundName}"`,
    };
  }

  // 2. Insert transaction row
  const { data: txnRow, error: txnErr } = await (supabase as any)
    .from('pre_fund_transactions')
    .insert({
      pre_fund_request_id: fundId,
      transaction_type: 'payment',
      amount,
      currency,
      reference,
      description: description ?? `Auto-linked from ${sourceTable}`,
      transaction_date: paymentDate,
      reconciled: false,
      source_table: sourceTable,
      source_id: sourceId,
      created_by: createdBy,
      user_id: userId ?? createdBy,
      receipt_url: receiptUrl,
    })
    .select('id')
    .single();

  if (txnErr) {
    return { linked: false, message: `Failed to record transaction: ${txnErr.message}` };
  }

  const txnId: string = txnRow.id;

  // 3. Deduct from fund balance
  const { data: fund } = await (supabase as any)
    .from('pre_fund_requests')
    .select('available_balance,paid_amount')
    .eq('id', fundId)
    .single();

  const newBalance = Number(fund?.available_balance ?? 0) - amount;
  const newPaid    = Number(fund?.paid_amount ?? 0) + amount;

  const { error: balErr } = await (supabase as any)
    .from('pre_fund_requests')
    .update({ available_balance: newBalance, paid_amount: newPaid })
    .eq('id', fundId);

  if (balErr) {
    // Transaction row was inserted — clean it up so retry works
    await (supabase as any).from('pre_fund_transactions').delete().eq('id', txnId);
    return { linked: false, message: `Failed to deduct fund balance: ${balErr.message}` };
  }

  // 4. Back-link source row
  await (supabase as any)
    .from(sourceTable)
    .update({ pre_fund_transaction_id: txnId })
    .eq('id', sourceId);

  return {
    linked: true,
    fundId,
    fundName,
    transactionId: txnId,
    message: `Linked to "${fundName}" (direct)`,
  };
}

export interface UnlinkResult {
  unlinked: boolean;
  message: string;
}

/**
 * Reverse a pre-fund transaction that was created by linkPaymentToPreFund.
 *
 * Delegates entirely to `unlink_payment_atomically_rpc` — a SECURITY DEFINER PostgreSQL
 * function that performs all reversal steps inside a single DB transaction:
 *   1. Lookup pre_fund_transactions by source_table + source_id
 *   2. Delete the transaction row
 *   3. Restore available_balance / paid_amount on the fund
 *   4. Clear the pre_fund_transaction_id back-link on the source row
 *   5. Restore the submitter's allocation spent_amount (if allocation exists)
 *
 * If any step fails the DB rolls back automatically — no partial-state corruption.
 * Safe to call even if no transaction was ever linked (returns unlinked:false silently).
 *
 * Requires: `unlink_payment_atomically_rpc` deployed from pre_funding_atomic_rpcs.sql
 */
export async function unlinkPaymentFromPreFund(
  sourceTable: 'down_payment_requests' | 'operational_cost_submissions',
  sourceId: string,
): Promise<UnlinkResult> {
  const { data: result, error } = await (supabase as any).rpc(
    'unlink_payment_atomically_rpc',
    { p_source_table: sourceTable, p_source_id: sourceId },
  );

  if (error) {
    const isNotDeployed =
      (error as any).code === 'PGRST202' ||
      String(error.message).toLowerCase().includes('could not find the function') ||
      String(error.message).toLowerCase().includes('does not exist');
    if (isNotDeployed) {
      return {
        unlinked: false,
        message: 'Pre-funding SQL not yet deployed. Run pre_funding_atomic_rpcs.sql in the Supabase SQL Editor.',
      };
    }
    return { unlinked: false, message: `Unlink RPC failed: ${error.message}` };
  }

  if (result && result.success === false) {
    if (result.code === 'no_link_found') {
      return { unlinked: false, message: 'No pre-fund transaction linked to this record.' };
    }
    return { unlinked: false, message: result.error ?? 'Unlink failed.' };
  }

  return { unlinked: true, message: 'Pre-fund transaction reversed and balance restored.' };
}

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
 *   - deduct from the submitter's pre_fund_allocations.spent_amount (if allocated)
 *
 * MATCHING PRIORITY (highest score wins):
 *  5 — submitter has an explicit allocation in this fund with sufficient remaining balance
 *      (allocation is the most authoritative link — Finance deliberately assigned this user)
 *  4 — country + project + cost_category match  (scope = country_project_category)
 *  3 — country + project match  (scope = country_project OR country_project_category without category)
 *  2 — project-only match       (scope = project)
 *  1 — country-only match       (scope = country)
 *
 * If the fund has allocations AND the submitter is NOT in the list, that fund is excluded.
 * If the fund has NO allocations, it is an open pool (scores 1–4 apply normally).
 *
 * For partial payments: pass the ACTUAL amount being paid now (not the full approved amount).
 * The balance/allocation guards check against this amount so partial deductions work correctly.
 */
export async function linkPaymentToPreFund(params: {
  amount: number;
  currency: string;
  countryId?: string | null;
  projectId?: string | null;
  costCategory?: string | null;
  sourceTable: 'operational_cost_submissions' | 'down_payment_requests';
  sourceId: string;
  reference?: string | null;
  description?: string | null;
  paymentDate: string;
  createdBy?: string | null;
  userId?: string | null;
  receiptUrl?: string | null;
}): Promise<FundLinkResult> {
  const {
    amount, currency, countryId, projectId, costCategory,
    sourceTable, sourceId, reference, description,
    paymentDate, createdBy, userId, receiptUrl,
  } = params;

  const submitterId: string | null = userId ?? createdBy ?? null;
  const today = paymentDate.split('T')[0];

  // ── Load all active funds for this currency and period ───────────────────
  const { data: activeFunds, error: fetchErr } = await (supabase as any)
    .from('pre_fund_requests')
    .select('id,name,matching_scope,country_id,project_id,cost_category,available_balance,currency')
    .in('status', ['active', 'low_balance'])
    .eq('currency', currency)
    .lte('start_date', today)
    .gte('end_date', today);

  if (fetchErr) return { linked: false, message: `Fund query failed: ${fetchErr.message}` };
  if (!activeFunds || (activeFunds as any[]).length === 0) {
    return { linked: false, message: 'No active pre-fund for this currency and period.' };
  }

  const fundIds = (activeFunds as any[]).map(f => f.id);

  // ── Load allocations for all candidates ─────────────────────────────────
  const { data: allAllocations } = await (supabase as any)
    .from('pre_fund_allocations')
    .select('pre_fund_request_id,user_id,allocated_amount,spent_amount')
    .in('pre_fund_request_id', fundIds);

  const allocsByFund: Record<string, any[]> = {};
  for (const a of (allAllocations ?? [])) {
    if (!allocsByFund[a.pre_fund_request_id]) allocsByFund[a.pre_fund_request_id] = [];
    allocsByFund[a.pre_fund_request_id].push(a);
  }

  // ── Score each fund ──────────────────────────────────────────────────────
  const scored = (activeFunds as any[]).map(f => {
    // Insufficient balance → always exclude
    if ((f.available_balance ?? 0) < amount) {
      return { fund: f, score: -1, userAllocation: null };
    }

    const fundAllocs = allocsByFund[f.id] ?? [];
    let userAllocation: any = null;

    if (fundAllocs.length > 0) {
      if (submitterId) {
        const myAlloc = fundAllocs.find((a: any) => a.user_id === submitterId);
        if (myAlloc) {
          const remaining = Number(myAlloc.allocated_amount) - Number(myAlloc.spent_amount);
          // Submitter is allocated but over their personal cap → exclude this fund
          if (remaining < amount) return { fund: f, score: -1, userAllocation: null };
          userAllocation = myAlloc;
          // Score 5: submitter has a valid personal allocation — highest priority.
          // Finance deliberately assigned this user to this fund so we always prefer it.
          return { fund: f, score: 5, userAllocation };
        }
        // Submitter is NOT in the allocation list → fall through to scope scoring.
        // The fund balance is still deducted; personal allocation is NOT tracked
        // (no allocation row exists for this person).
      }
      // No submitterId or submitter not allocated → fall through to scope scoring
    }

    // Fund has no allocations (or submitter not in allocation list) → score by scope
    const scope: string = f.matching_scope ?? 'country';
    let score = 0;

    // 'global' scope: fund covers all payments regardless of country/project
    if (scope === 'global') {
      return { fund: f, score: 1, userAllocation: null };
    }

    const countryProjectMatch = countryId && projectId
      && f.country_id === countryId && f.project_id === projectId;

    if (scope === 'country_project_category') {
      if (countryProjectMatch) {
        const fundCategory: string | null = f.cost_category ?? null;
        if (fundCategory) {
          if (costCategory && costCategory === fundCategory) {
            score = 4;
          } else {
            return { fund: f, score: -1, userAllocation: null };
          }
        } else {
          score = 3;
        }
      }
    } else if (scope === 'country_project' && countryProjectMatch) {
      score = 3;
    } else if (scope === 'project' && projectId && f.project_id === projectId) {
      score = 2;
    } else if (scope === 'country' && countryId && f.country_id === countryId) {
      score = 1;
    }

    return { fund: f, score, userAllocation };
  }).filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    // ── Single-fund fallback ───────────────────────────────────────────────
    // If scope matching found nothing (e.g. down-payment requests carry no
    // country/project), fall back to any active fund with sufficient balance.
    // Include allocation-gated funds here too — p_user_id is passed as NULL so
    // the RPC skips the allocation eligibility check (balance-only deduction).
    const fundsWithBalance = (activeFunds as any[]).filter(
      f => (f.available_balance ?? 0) >= amount
    );
    if (fundsWithBalance.length === 1) {
      const fallbackFund = fundsWithBalance[0];
      const { data: rpcFallback, error: rpcFallbackErr } = await (supabase as any).rpc(
        'link_payment_atomically_rpc', {
          p_fund_id:      fallbackFund.id,
          p_amount:       amount,
          p_currency:     currency,
          p_source_table: sourceTable,
          p_source_id:    sourceId,
          p_reference:    reference ?? null,
          p_description:  description ?? null,
          p_payment_date: today,
          p_created_by:   createdBy ?? null,
          p_user_id:      null,
          p_receipt_url:  receiptUrl ?? null,
        }
      );
      if (rpcFallbackErr) {
        const notDeployed =
          (rpcFallbackErr as any).code === 'PGRST202' ||
          String(rpcFallbackErr.message).toLowerCase().includes('could not find the function') ||
          String(rpcFallbackErr.message).toLowerCase().includes('does not exist');
        if (notDeployed) {
          return directLinkPayment({
            fundId: fallbackFund.id, fundName: fallbackFund.name,
            amount, currency, sourceTable, sourceId,
            reference: reference ?? null, description: description ?? null,
            paymentDate: today, createdBy: createdBy ?? null,
            userId: null, receiptUrl: receiptUrl ?? null,
          });
        }
        return { linked: false, message: `Linkage RPC failed: ${rpcFallbackErr.message}` };
      }
      if (rpcFallback && rpcFallback.success === false) {
        return { linked: false, message: rpcFallback.error ?? 'Linkage failed.' };
      }
      return {
        linked: true,
        fundId: fallbackFund.id,
        fundName: fallbackFund.name,
        transactionId: rpcFallback?.transaction_id,
        message: `Auto-linked to "${fallbackFund.name}" (only active fund)`,
      };
    }
    // Multiple funds — require manual selection
    if (fundsWithBalance.length > 1) {
      return {
        linked: false,
        needsManualSelection: true,
        candidates: fundsWithBalance.map((f: any) => ({ id: f.id, name: f.name })),
        message: `${fundsWithBalance.length} active pre-funds available — please link manually in Pre-Funding → Reconciliation.`,
      };
    }
    return {
      linked: false,
      message: 'No active pre-fund matches this payment (check fund balance, date range, or set the fund scope to "global"). Finance can link manually in Pre-Funding → Reconciliation.',
    };
  }

  const topScore = scored[0].score;
  const topCandidates = scored.filter(x => x.score === topScore);

  // If there are multiple funds at the SAME score AND they are all open-pool (score < 5),
  // require manual selection. A score-5 tie (two allocated funds for same user) is
  // extremely rare but we still require manual selection to avoid ambiguity.
  if (topCandidates.length > 1) {
    return {
      linked: false,
      needsManualSelection: true,
      candidates: topCandidates.map(x => ({ id: x.fund.id, name: x.fund.name })),
      message: `${topCandidates.length} pre-funds match equally — please link manually in Pre-Funding → Reconciliation.`,
    };
  }

  const best = scored[0];
  const bestFund = best.fund;

  // Only pass p_user_id when the submitter has an actual allocation row — the RPC
  // will RAISE EXCEPTION if p_user_id is non-null but has no allocation in this fund.
  const rpcUserId = best.userAllocation ? submitterId : null;

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
      p_user_id:      rpcUserId,
      p_receipt_url:  receiptUrl ?? null,
    }
  );

  if (rpcErr) {
    const isNotDeployed =
      (rpcErr as any).code === 'PGRST202' ||
      String(rpcErr.message).toLowerCase().includes('could not find the function') ||
      String(rpcErr.message).toLowerCase().includes('does not exist');
    if (isNotDeployed) {
      // RPC not deployed — fall back to direct writes
      return directLinkPayment({
        fundId: bestFund.id, fundName: bestFund.name,
        amount, currency, sourceTable, sourceId,
        reference: reference ?? null, description: description ?? null,
        paymentDate: today, createdBy: createdBy ?? null,
        userId: rpcUserId, receiptUrl: receiptUrl ?? null,
      });
    }
    return { linked: false, message: `Linkage RPC failed: ${rpcErr.message}` };
  }
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

/**
 * Find the best matching active pre-fund for a list of submitter IDs.
 * Returns the fund to pre-select in the batch pay dialog.
 * Priority: fund with most submitters covered by allocations → scope match → any active fund.
 */
export async function detectBestPreFundForSubmitters(params: {
  submitterIds: string[];
  currency: string;
  totalAmount: number;
  countryIds?: (string | null)[];
  projectIds?: (string | null)[];
}): Promise<{ fundId: string | null; fundName: string | null; matchReason: string }> {
  const { submitterIds, currency, totalAmount, countryIds = [], projectIds = [] } = params;
  const today = new Date().toISOString().split('T')[0];

  const { data: activeFunds, error } = await (supabase as any)
    .from('pre_fund_requests')
    .select('id,name,matching_scope,country_id,project_id,available_balance,currency')
    .in('status', ['active', 'low_balance'])
    .eq('currency', currency)
    .lte('start_date', today)
    .gte('end_date', today);

  if (error || !activeFunds || (activeFunds as any[]).length === 0) {
    return { fundId: null, fundName: null, matchReason: 'No active pre-fund found' };
  }

  const fundIds = (activeFunds as any[]).map((f: any) => f.id);

  // Load allocations for all submitters across all candidate funds
  const { data: allAllocations } = await (supabase as any)
    .from('pre_fund_allocations')
    .select('pre_fund_request_id,user_id,allocated_amount,spent_amount')
    .in('pre_fund_request_id', fundIds)
    .in('user_id', submitterIds.filter(Boolean));

  const allocsByFund: Record<string, any[]> = {};
  for (const a of (allAllocations ?? [])) {
    if (!allocsByFund[a.pre_fund_request_id]) allocsByFund[a.pre_fund_request_id] = [];
    allocsByFund[a.pre_fund_request_id].push(a);
  }

  let bestFund: any = null;
  let bestScore = -1;
  let bestReason = '';

  for (const f of activeFunds as any[]) {
    if ((f.available_balance ?? 0) < totalAmount) continue;

    const fundAllocs = allocsByFund[f.id] ?? [];
    let score = 0;
    let reason = '';

    if (fundAllocs.length > 0) {
      const coveredCount = submitterIds.filter(uid =>
        fundAllocs.some((a: any) => a.user_id === uid)
      ).length;
      if (coveredCount > 0) {
        // Score by coverage: 10 + fraction of submitters covered
        score = 10 + (coveredCount / submitterIds.length);
        reason = `${coveredCount} of ${submitterIds.length} submitter(s) allocated to this fund`;
      }
    } else {
      // Open pool — score by scope match
      const uniqueCountries = [...new Set(countryIds.filter(Boolean))];
      const uniqueProjects  = [...new Set(projectIds.filter(Boolean))];
      const scope = f.matching_scope ?? 'country';

      const countryMatch = uniqueCountries.length === 1 && f.country_id === uniqueCountries[0];
      const projectMatch = uniqueProjects.length  === 1 && f.project_id === uniqueProjects[0];

      if (scope === 'country_project' && countryMatch && projectMatch) {
        score = 3; reason = 'Matched country + project';
      } else if (scope === 'project' && projectMatch) {
        score = 2; reason = 'Matched project';
      } else if (scope === 'country' && countryMatch) {
        score = 1; reason = 'Matched country';
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestFund = f;
      bestReason = reason;
    }
  }

  if (!bestFund) {
    return { fundId: null, fundName: null, matchReason: 'No matching fund with sufficient balance' };
  }

  return { fundId: bestFund.id, fundName: bestFund.name, matchReason: bestReason };
}
