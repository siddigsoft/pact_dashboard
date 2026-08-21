import { supabase } from '@/integrations/supabase/client';

export function createPreFundPaymentEventKey(params: {
  sourceTable: string;
  sourceId: string;
  amount: number;
  paymentDate: string;
  reference?: string | null;
  receiptUrl?: string | null;
}): string {
  // A key names a single payment operation, not a source/date/amount tuple.
  // It is persisted in pre_fund_transactions by the RPC and callers reuse it
  // only for a transport retry of this same operation.
  return `pf-payment:${params.sourceTable}:${params.sourceId}:${crypto.randomUUID()}`;
}

export type PreFundSourcePaymentLink = {
  paymentEventId: string;
  sourceTable: 'down_payment_requests' | 'operational_cost_submissions';
  sourceId: string;
  fundId: string;
  fundName: string;
  currency: string;
  paymentAmount: number;
  paymentDate: string | null;
  receiptUrl: string | null;
};

/**
 * Names one controlled source-payment operation. Reuse it only if the same
 * submit action is retried after a transport error.
 */
export function createRequiredPreFundPaymentEventKey(sourceTable: string, sourceId: string): string {
  return `source-payment:${sourceTable}:${sourceId}:${crypto.randomUUID()}`;
}

export async function fetchPreFundSourcePaymentLinks(
  sourceTable: PreFundSourcePaymentLink['sourceTable'],
  sourceIds: string[],
): Promise<PreFundSourcePaymentLink[]> {
  if (sourceIds.length === 0) return [];

  // Keep each PostgREST URL small. A page can contain hundreds or thousands of
  // requests, and one .in(source_id, allIds) call otherwise fails in the browser
  // with a generic "Failed to fetch" before Supabase can return an error.
  const QUERY_CHUNK_SIZE = 150;
  const chunks: string[][] = [];
  for (let i = 0; i < sourceIds.length; i += QUERY_CHUNK_SIZE) {
    chunks.push(sourceIds.slice(i, i + QUERY_CHUNK_SIZE));
  }

  const canonicalResults = await Promise.all(chunks.map(chunk => (supabase as any)
    .from('pre_fund_source_payment_links_v')
    .select('payment_event_id, source_table, source_id, fund_id, fund_name, currency, payment_amount, payment_date, receipt_url')
    .eq('source_table', sourceTable)
    .in('source_id', chunk)));
  const canonicalError = canonicalResults.find(result => result.error)?.error ?? null;
  const canonicalRows = canonicalResults.flatMap(result => result.data ?? []);

  // Verify every source before using its event. The ledger's reconciliation
  // totals reject payments whose Down Payment or Cost Submission was later
  // cancelled/rejected/unpaid; the source pages must use the same rule.
  const sourceSelect = sourceTable === 'down_payment_requests'
    ? 'id, pre_fund_transaction_id, status, metadata'
    : 'id, pre_fund_transaction_id, status';
  const sourceResults = await Promise.all(chunks.map(chunk => (supabase as any)
    .from(sourceTable)
    .select(sourceSelect)
    .in('id', chunk)));
  const sourceError = sourceResults.find(result => result.error)?.error ?? null;
  const sourceRows = sourceResults.flatMap(result => result.data ?? []);
  if (sourceError) {
    const sources = canonicalError
      ? `The canonical ledger view and source verification records could not be read. View: ${canonicalError.message}. Sources: ${sourceError.message}`
      : sourceError.message;
    throw new Error(sources);
  }

  const verifiedSourceIds = new Set<string>(
    ((sourceRows ?? []) as any[])
      .filter(row => {
        const isPaid = sourceTable === 'down_payment_requests'
          ? ['partially_paid', 'fully_paid', 'paid', 'reconciled'].includes(row.status)
          : ['partially_paid', 'paid', 'reconciled'].includes(row.status);
        return isPaid && row.metadata?.deleted !== true;
      })
      .map(row => row.id as string),
  );
  const canonicalLinks = canonicalError ? [] : ((canonicalRows ?? []) as any[])
    .filter(row => verifiedSourceIds.has(row.source_id))
    .map((row) => ({
      paymentEventId: row.payment_event_id,
      sourceTable: row.source_table,
      sourceId: row.source_id,
      fundId: row.fund_id,
      fundName: row.fund_name,
      currency: row.currency,
      paymentAmount: Number(row.payment_amount ?? 0),
      paymentDate: row.payment_date ?? null,
      receiptUrl: row.receipt_url ?? null,
    }));

  // The canonical view is the authority when it is available. Older
  // source-side back-links are only a compatibility path for databases that
  // have not yet installed that view; otherwise they can re-introduce payment
  // rows that the reversal-aware ledger correctly excludes.
  if (!canonicalError) return canonicalLinks;
  console.warn('[Pre-Fund] Canonical source-payment view unavailable:', canonicalError.message);

  // Earlier payment workflows recorded a source-side transaction back-link
  // without populating pre_fund_transactions.source_table/source_id. Read that
  // explicit historic evidence only as a migration-compatibility fallback;
  // never infer a fund from a date or request name.
  const sourceByTransaction = new Map<string, string>(
    ((sourceRows ?? []) as any[])
      .filter(row => row.pre_fund_transaction_id && verifiedSourceIds.has(row.id))
      .map(row => [row.pre_fund_transaction_id as string, row.id as string]),
  );
  const legacyTransactionIds = [...sourceByTransaction.keys()];
  if (legacyTransactionIds.length === 0) return canonicalLinks;

  const transactionChunks: string[][] = [];
  for (let i = 0; i < legacyTransactionIds.length; i += QUERY_CHUNK_SIZE) {
    transactionChunks.push(legacyTransactionIds.slice(i, i + QUERY_CHUNK_SIZE));
  }
  const transactionResults = await Promise.all(transactionChunks.map(chunk => (supabase as any)
    .from('pre_fund_transactions')
    .select('id, pre_fund_request_id, transaction_type, amount, currency, transaction_date, receipt_url')
    .in('id', chunk)
    .eq('transaction_type', 'payment')));
  const legacyError = transactionResults.find(result => result.error)?.error ?? null;
  const legacyTransactions = transactionResults.flatMap(result => result.data ?? []);
  if (legacyError) throw new Error(legacyError.message);

  const fundIds = [...new Set(((legacyTransactions ?? []) as any[])
    .map(transaction => transaction.pre_fund_request_id)
    .filter(Boolean))] as string[];
  if (fundIds.length === 0) return canonicalLinks;
  const fundChunks: string[][] = [];
  for (let i = 0; i < fundIds.length; i += QUERY_CHUNK_SIZE) {
    fundChunks.push(fundIds.slice(i, i + QUERY_CHUNK_SIZE));
  }
  const fundResults = await Promise.all(fundChunks.map(chunk => (supabase as any)
    .from('pre_fund_requests')
    .select('id, name')
    .in('id', chunk)));
  const fundsError = fundResults.find(result => result.error)?.error ?? null;
  const funds = fundResults.flatMap(result => result.data ?? []);
  if (fundsError) throw new Error(fundsError.message);
  const fundNameById = new Map<string, string>(
    ((funds ?? []) as any[]).map(fund => [fund.id as string, fund.name as string]),
  );

  const historicBackLinks: PreFundSourcePaymentLink[] = ((legacyTransactions ?? []) as any[])
    .filter(transaction => sourceByTransaction.has(transaction.id) && fundNameById.has(transaction.pre_fund_request_id))
    .map(transaction => ({
      paymentEventId: transaction.id,
      sourceTable,
      sourceId: sourceByTransaction.get(transaction.id)!,
      fundId: transaction.pre_fund_request_id,
      fundName: fundNameById.get(transaction.pre_fund_request_id)!,
      currency: transaction.currency,
      paymentAmount: Number(transaction.amount ?? 0),
      paymentDate: transaction.transaction_date ?? null,
      receiptUrl: transaction.receipt_url ?? null,
    }));
  return [...canonicalLinks, ...historicBackLinks];
}

export async function recordRequiredPreFundPayment(params: {
  sourceTable: PreFundSourcePaymentLink['sourceTable'];
  sourceId: string;
  fundId: string;
  amount: number;
  currency: string;
  paymentDate: string;
  createdBy: string | null;
  receiptUrl?: string | null;
  notes?: string | null;
  paymentEventKey: string;
}): Promise<{ success: boolean; idempotent?: boolean; transactionId?: string; message?: string }> {
  const { data, error } = await (supabase as any).rpc('record_required_pre_fund_payment_rpc', {
    p_source_table: params.sourceTable,
    p_source_id: params.sourceId,
    p_fund_id: params.fundId,
    p_amount: params.amount,
    p_currency: params.currency,
    p_payment_date: params.paymentDate.slice(0, 10),
    p_created_by: params.createdBy,
    p_receipt_url: params.receiptUrl ?? null,
    p_notes: params.notes ?? null,
    p_payment_event_key: params.paymentEventKey,
  });

  if (error) {
    const notDeployed = (error as any).code === 'PGRST202'
      || String(error.message).toLowerCase().includes('could not find the function')
      || String(error.message).toLowerCase().includes('does not exist');
    throw new Error(
      notDeployed
        ? 'Apply 20260821b_required_pre_fund_payment_links.sql before recording new payments.'
        : error.message,
    );
  }
  if (data?.success !== true) throw new Error(data?.error ?? 'Pre-Fund payment was not recorded.');
  return {
    success: true,
    idempotent: data?.idempotent === true,
    transactionId: data?.transaction_id,
  };
}

export async function recordDownPaymentWithWallet(params: {
  requestId: string;
  fundId: string;
  amount: number;
  currency: string;
  receiptUrl: string;
  notes?: string | null;
  paymentEventKey: string;
  installmentIndex?: number;
}): Promise<{ success: boolean; idempotent?: boolean; transactionId?: string; walletTransactionId?: string }> {
  const { data, error } = await (supabase as any).rpc('record_down_payment_with_wallet_rpc', {
    p_request_id: params.requestId,
    p_fund_id: params.fundId,
    p_amount: params.amount,
    p_currency: params.currency,
    p_receipt_url: params.receiptUrl,
    p_notes: params.notes ?? null,
    p_payment_event_key: params.paymentEventKey,
    p_installment_index: params.installmentIndex ?? null,
  });
  if (error) {
    const notDeployed = (error as any).code === 'PGRST202'
      || String(error.message).toLowerCase().includes('could not find the function')
      || String(error.message).toLowerCase().includes('does not exist');
    throw new Error(
      notDeployed
        ? 'Apply 20260821d_atomic_down_payment_payment_workflow.sql before recording Down Payment payments.'
        : error.message,
    );
  }
  if (data?.success !== true) throw new Error(data?.error ?? 'Down Payment could not be recorded.');
  return {
    success: true,
    idempotent: data?.idempotent === true,
    transactionId: data?.transaction_id,
    walletTransactionId: data?.wallet_transaction_id,
  };
}

export async function cancelPaidDownPaymentRequest(requestId: string): Promise<void> {
  const { data, error } = await (supabase as any).rpc('cancel_paid_down_payment_request_rpc', {
    p_request_id: requestId,
  });
  if (error) {
    const notDeployed = (error as any).code === 'PGRST202'
      || String(error.message).toLowerCase().includes('could not find the function')
      || String(error.message).toLowerCase().includes('does not exist');
    throw new Error(
      notDeployed
        ? 'Apply 20260821d_atomic_down_payment_payment_workflow.sql before cancelling paid Down Payment requests.'
        : error.message,
    );
  }
  if (data?.success !== true) throw new Error(data?.error ?? 'Down Payment could not be cancelled.');
}

export async function reopenDownPaymentAfterReversal(params: {
  requestId: string;
  targetStatus: 'pending_supervisor' | 'pending_admin' | 'approved';
  reason?: string;
}): Promise<void> {
  const { data, error } = await (supabase as any).rpc('reopen_down_payment_after_reversal_rpc', {
    p_request_id: params.requestId,
    p_target_status: params.targetStatus,
    p_reason: params.reason ?? null,
  });
  if (error) {
    const notDeployed = (error as any).code === 'PGRST202'
      || String(error.message).toLowerCase().includes('could not find the function')
      || String(error.message).toLowerCase().includes('does not exist');
    throw new Error(
      notDeployed
        ? 'Apply 20260821e_atomic_paid_down_payment_reopen.sql before reverting a paid Down Payment.'
        : error.message,
    );
  }
  if (data?.success !== true) throw new Error(data?.error ?? 'Down Payment could not be reopened.');
}

export async function correctRequiredPreFundPaymentLink(params: {
  originalPaymentEventId: string;
  replacementFundId: string;
  reason: string;
}): Promise<void> {
  const { data, error } = await (supabase as any).rpc('correct_required_pre_fund_payment_link_rpc', {
    p_original_payment_event_id: params.originalPaymentEventId,
    p_new_fund_id: params.replacementFundId,
    p_reason: params.reason,
  });
  if (error) throw new Error(error.message);
  if (data?.success !== true) throw new Error(data?.error ?? 'Fund correction was not recorded.');
}

async function linkPaymentAtomically(params: {
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
  paymentEventKey?: string | null;
}): Promise<FundLinkResult> {
  const eventKey = params.paymentEventKey ?? createPreFundPaymentEventKey(params);
  const { data, error } = await (supabase as any).rpc('link_payment_atomically_rpc', {
    p_fund_id: params.fundId,
    p_amount: params.amount,
    p_currency: params.currency,
    p_source_table: params.sourceTable,
    p_source_id: params.sourceId,
    p_reference: params.reference,
    p_description: params.description,
    p_payment_date: params.paymentDate,
    p_created_by: params.createdBy,
    p_user_id: params.userId,
    p_receipt_url: params.receiptUrl,
    p_payment_event_key: eventKey,
  });

  if (error) {
    const notDeployed = (error as any).code === 'PGRST202'
      || String(error.message).toLowerCase().includes('could not find the function')
      || String(error.message).toLowerCase().includes('does not exist');
    return {
      linked: false,
      message: notDeployed
        ? 'Pre-funding ledger migration is required before payments can be linked safely. Ask Finance to apply 20260820e_pre_fund_ledger_reconciliation.sql.'
        : `Linkage RPC failed: ${error.message}`,
    };
  }
  if (data?.success === false) return { linked: false, message: data.error ?? 'Linkage failed.' };
  return {
    linked: true,
    fundId: params.fundId,
    fundName: params.fundName,
    transactionId: data?.transaction_id,
    message: data?.idempotent
      ? `Payment event already linked to "${params.fundName}"`
      : `Linked to "${params.fundName}"`,
  };
}

/**
 * Reverse a direct balance deduction on a pre-fund request.
 * Used when unlink_payment_atomically_rpc is not yet deployed — the
 * source row was deducted via directLinkPayment's balance UPDATE but no
 * pre_fund_transactions row was created, so there's nothing to unlink via RPC.
 *
 * Safe to call even if the fund has already been partially adjusted:
 * uses GREATEST(0, ...) so paid_amount never goes negative.
 */
export async function reverseDirectDeduction(
  fundId: string,
  amount: number,
  userId?: string | null,
): Promise<{ reversed: boolean; message: string }> {
  return {
    reversed: false,
    message: 'Direct pre-fund balance reversal is disabled. Apply the pre-funding ledger migration and use the immutable reversal RPC.',
  };

  /*
  const { data: fund, error: fErr } = await supabase
    .from('pre_fund_requests')
    .select('paid_amount, available_balance')
    .eq('id', fundId)
    .single();
  if (fErr || !fund) return { reversed: false, message: fErr?.message ?? 'Fund not found' };

  const newPaid      = Math.max(0, Number(fund.paid_amount) - amount);
  const newAvailable = Number(fund.available_balance) + amount;

  const { error: uErr } = await supabase
    .from('pre_fund_requests')
    .update({ paid_amount: newPaid, available_balance: newAvailable })
    .eq('id', fundId);

  if (uErr) return { reversed: false, message: uErr.message };

  // Also restore the submitter's allocation spent_amount (mirrors directLinkPayment step 3b)
  if (userId) {
    const { data: alloc } = await (supabase as any)
      .from('pre_fund_allocations')
      .select('id,spent_amount')
      .eq('pre_fund_request_id', fundId)
      .eq('user_id', userId)
      .maybeSingle();
    if (alloc) {
      await (supabase as any)
        .from('pre_fund_allocations')
        .update({ spent_amount: Math.max(0, Number(alloc.spent_amount) - amount) })
        .eq('id', alloc.id);
    }
  }

  return { reversed: true, message: `Reversed ${amount} from fund — balance restored.` };
  */
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
 * This public route is intentionally limited to Down Payment cancellation. OCS
 * reversals must use the authorised atomic source-transition helper below.
 */
export async function unlinkPaymentFromPreFund(
  sourceTable: 'down_payment_requests',
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
  paymentEventKey?: string | null;
}): Promise<FundLinkResult> {
  const {
    amount, currency, countryId, projectId, costCategory,
    sourceTable, sourceId, reference, description,
    paymentDate, createdBy, userId, receiptUrl, paymentEventKey,
  } = params;
  // Generate once per payment initiation so every automatic matching branch
  // and immediate retry uses the same immutable operation key.
  const operationKey = paymentEventKey ?? createPreFundPaymentEventKey({
    sourceTable, sourceId, amount, paymentDate, reference, receiptUrl,
  });

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
          p_payment_event_key: operationKey,
        }
      );
      if (rpcFallbackErr) {
        const notDeployed =
          (rpcFallbackErr as any).code === 'PGRST202' ||
          String(rpcFallbackErr.message).toLowerCase().includes('could not find the function') ||
          String(rpcFallbackErr.message).toLowerCase().includes('does not exist');
        return {
          linked: false,
          message: notDeployed
            ? 'Pre-funding ledger migration is required before payments can be linked safely.'
            : `Linkage RPC failed: ${rpcFallbackErr.message}`,
        };
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
          p_payment_event_key: operationKey,
    }
  );

  if (rpcErr) {
    const isNotDeployed =
      (rpcErr as any).code === 'PGRST202' ||
      String(rpcErr.message).toLowerCase().includes('could not find the function') ||
      String(rpcErr.message).toLowerCase().includes('does not exist');
    return {
      linked: false,
      message: isNotDeployed
        ? 'Pre-funding ledger migration is required before payments can be linked safely.'
        : `Linkage RPC failed: ${rpcErr.message}`,
    };
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

/**
 * Link a payment to a KNOWN fund (fund already selected by the caller).
 * Used by the Reconciliation page retry panel when add_pre_fund_transaction_rpc
 * is not yet deployed — falls straight through to directLinkPayment.
 */
export async function linkPaymentToKnownFund(params: {
  fundId: string;
  fundName: string;
  amount: number;
  currency: string;
  sourceTable: string;
  sourceId: string;
  reference?: string | null;
  description?: string | null;
  paymentDate: string;
  createdBy?: string | null;
  userId?: string | null;
  receiptUrl?: string | null;
  paymentEventKey?: string | null;
}): Promise<FundLinkResult> {
  return linkPaymentAtomically({
    ...params,
    reference: params.reference ?? null,
    description: params.description ?? null,
    createdBy: params.createdBy ?? null,
    userId: params.userId ?? null,
    receiptUrl: params.receiptUrl ?? null,
  });
}

export async function revertOperationalCostPaymentsAtomically(
  sourceIds: string[],
  action: 'revert' | 'delete',
): Promise<{ success: boolean; message: string }> {
  const { data, error } = await (supabase as any).rpc(
    'revert_operational_cost_payments_atomically_rpc',
    { p_source_ids: sourceIds, p_action: action },
  );

  if (error) {
    const notDeployed =
      (error as any).code === 'PGRST202' ||
      String(error.message).toLowerCase().includes('could not find the function') ||
      String(error.message).toLowerCase().includes('does not exist');
    return {
      success: false,
      message: notDeployed
        ? 'Pre-funding ledger migration is required before paid submissions can be safely changed.'
        : error.message,
    };
  }
  return {
    success: data?.success === true,
    message: data?.success === true ? 'Payment source and ledger updated together.' : (data?.error ?? 'Source update failed.'),
  };
}
