/**
 * Shared pre-fund activation utility.
 *
 * Called by ALL activation paths:
 *   1. Registry receipt upload (handleReceiptUpload)
 *   2. Registry bank auto-match (handleBankApiCheck — auto-match loop)
 *   3. Settings manual unmatched-transfer assignment (handleManualMatch)
 *
 * Delegates ALL multi-step writes to the activate_pre_fund_rpc Postgres
 * function which runs them inside a single DB transaction — no partial
 * state is possible on failure.
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

export async function activatePreFund(opts: ActivatePreFundOptions): Promise<void> {
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

  // Single RPC call — all writes (JE + lines + bridge log + fund update) run
  // inside one Postgres transaction; any failure rolls back everything.
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

  // RPC returns { success: bool, error?: string } for domain-level failures
  if (data && data.success === false) {
    throw new Error(data.error ?? 'Activation failed — unknown error from RPC.');
  }

  // Non-blocking: attempt to create a bank statement line via a separate call
  // (integration-gated). Failure here never affects the already-committed activation.
  try {
    const [{ data: bankReconSettings }, { data: bankAcctRow }] = await Promise.all([
      supabase.from('pre_fund_settings').select('integration_bank_recon').limit(1).maybeSingle(),
      (supabase as any).from('acct_bank_accounts').select('id').eq('currency', currency).limit(1).maybeSingle(),
    ]);
    const bankReconOn = (bankReconSettings as any)?.integration_bank_recon !== false;
    if (bankReconOn && (bankAcctRow as any)?.id) {
      await (supabase as any).from('acct_bank_statement_lines').insert({
        bank_account_id: (bankAcctRow as any).id,
        statement_date: new Date().toISOString().split('T')[0],
        description: `Pre-fund received: ${fundName}`,
        reference: `PF-${fundId.slice(0, 8).toUpperCase()}`,
        amount,
        currency,
        pre_fund_request_id: fundId,
      });
    }
  } catch {
    // Non-blocking — bank statement line failure must not surface to the caller
  }
}
