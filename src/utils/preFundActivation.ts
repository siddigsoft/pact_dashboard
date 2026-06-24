/**
 * Shared pre-fund activation utility.
 *
 * Called by ALL activation paths:
 *   1. Registry receipt upload (handleReceiptUpload)
 *   2. Registry bank auto-match (handleBankApiCheck — auto-match loop)
 *   3. Settings manual unmatched-transfer assignment (handleManualMatch)
 *
 * Delegates ALL multi-step writes to the activate_pre_fund_rpc Postgres
 * function which runs them inside a single DB transaction:
 *   - GL journal entry + lines + bridge log
 *   - Fund status → active, available_balance set
 *   - Bank statement line (when bank recon integration is on and a matching
 *     bank account exists for the currency)
 *
 * Everything is atomic — no partial state on failure.
 */

import { supabase } from '@/integrations/supabase/client';

export interface ActivatePreFundOptions {
  fundId: string;
  fundName: string;
  amount: number;
  currency: string;
  /** Account code for cash/bank DR leg. Must exist in acct_accounts. */
  glReceiptCode: string;
  /** Account code for deferred liability CR leg. Must exist in acct_accounts. */
  glLiabilityCode: string;
  createdBy?: string | null;
  receiptUrl?: string | null;
  idempotencyKeySuffix?: string;
}

export interface ActivatePreFundResult {
  journalEntryId?: string;
}

export async function activatePreFund(
  opts: ActivatePreFundOptions
): Promise<ActivatePreFundResult> {
  const {
    fundId,
    fundName,
    amount,
    currency,
    glReceiptCode,
    glLiabilityCode,
    createdBy = null,
    receiptUrl = null,
    idempotencyKeySuffix = '',
  } = opts;

  // Single RPC call — ALL writes (JE + lines + bridge log + fund update +
  // bank statement line) run inside one Postgres transaction.
  // Any failure rolls back everything — no partial state possible.
  const { data, error } = await (supabase as any).rpc('activate_pre_fund_rpc', {
    p_fund_id:            fundId,
    p_fund_name:          fundName,
    p_amount:             amount,
    p_currency:           currency,
    p_gl_receipt_code:    glReceiptCode,
    p_gl_liability_code:  glLiabilityCode,
    p_created_by:         createdBy,
    p_receipt_url:        receiptUrl,
    p_idempotency_suffix: idempotencyKeySuffix,
  });

  if (error) throw new Error(`Activation RPC failed: ${error.message}`);

  if (data && data.success === false) {
    throw new Error(data.error ?? 'Activation failed — unknown error from RPC.');
  }

  return { journalEntryId: data?.journal_entry_id };
}
