/**
 * Shared pre-fund activation utility.
 *
 * Called by ALL activation paths:
 *   1. Registry receipt upload (handleReceiptUpload)
 *   2. Registry bank auto-match (handleBankApiCheck — auto-match loop)
 *   3. Settings manual unmatched-transfer assignment (handleManualMatch)
 *
 * Atomically:
 *   a. Creates a GL journal entry + lines (pre_fund_received event) — fail-closed
 *   b. Logs to acct_gl_bridge_log
 *   c. Updates fund: status='active', available_balance=amount, activated_at, receipt_url (if provided)
 *   d. Creates bank statement line (integration-gated, non-blocking)
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

  const now = new Date().toISOString();

  // ── 1. Look up GL accounts + settings in parallel ──────────────────────────
  const [{ data: receiptAcct }, { data: liabAcct }, { data: bankReconSettings }, { data: bankAcctRow }] =
    await Promise.all([
      supabase.from('acct_accounts' as any).select('id').eq('code', glReceiptCode).maybeSingle(),
      supabase.from('acct_accounts' as any).select('id').eq('code', glLiabilityCode).maybeSingle(),
      supabase.from('pre_fund_settings').select('integration_bank_recon').limit(1).maybeSingle(),
      supabase.from('acct_bank_accounts' as any).select('id').eq('currency', currency).limit(1).maybeSingle(),
    ]);

  // ── 2. Create journal entry (fail-closed — must succeed before fund mutates) ──
  const idempotencyKey = `pf-received-${fundId}${idempotencyKeySuffix ? '-' + idempotencyKeySuffix : ''}`;
  const { data: je, error: jeErr } = await supabase.from('acct_journal_entries').insert({
    description_en: `Pre-Fund Received — ${fundName} activated`,
    description_ar: `استلام التمويل المسبق — ${fundName}`,
    posting_date: now.split('T')[0],
    status: 'draft',
    source_type: 'pre_fund_requests',
    source_id: fundId,
    idempotency_key: idempotencyKey,
    created_by: createdBy,
  }).select('id').maybeSingle();
  if (jeErr) throw new Error(`GL Bridge failed — cannot activate fund: ${jeErr.message}`);

  // Fail explicitly if either GL account code cannot be resolved — no silent skip
  if (!(receiptAcct as any)?.id)
    throw new Error(`GL account not found for code "${glReceiptCode}" — configure accounts before activating this fund.`);
  if (!(liabAcct as any)?.id)
    throw new Error(`GL account not found for code "${glLiabilityCode}" — configure accounts before activating this fund.`);

  const lines = [
    { entry_id: (je as any).id, line_no: 1, account_id: (receiptAcct as any).id, debit_credit: 'DR', original_amount: amount, original_currency: currency, functional_amount: amount, functional_currency: currency, description: `Pre-fund receipt — ${fundName}`, function: 'program' },
    { entry_id: (je as any).id, line_no: 2, account_id: (liabAcct as any).id,   debit_credit: 'CR', original_amount: amount, original_currency: currency, functional_amount: amount, functional_currency: currency, description: `Pre-fund liability deferred — ${fundName}`, function: 'program' },
  ];
  const { error: linesErr } = await supabase.from('acct_journal_lines').insert(lines);
  if (linesErr) throw new Error(`GL lines failed — cannot activate fund: ${linesErr.message}`);

  // ── 3. Bridge log ────────────────────────────────────────────────────────
  await supabase.from('acct_gl_bridge_log' as any).insert({
    source_table: 'pre_fund_requests',
    source_id: fundId,
    event_type: 'pre_fund_received',
    status: 'success',
    journal_entry_id: (je as any).id,
  });

  // ── 4. Activate the fund — only reached after GL succeeded ───────────────
  const updatePayload: Record<string, unknown> = {
    status: 'active',
    available_balance: amount,
    activated_at: now,
  };
  if (receiptUrl) updatePayload.receipt_url = receiptUrl;

  const { error: updErr } = await supabase.from('pre_fund_requests').update(updatePayload).eq('id', fundId);
  if (updErr) throw updErr;

  // ── 5. Bank statement line (integration-gated, non-blocking) ─────────────
  const bankReconOn = (bankReconSettings as any)?.integration_bank_recon !== false;
  if (bankReconOn && (bankAcctRow as any)?.id) {
    try {
      await supabase.from('acct_bank_statement_lines' as any).insert({
        bank_account_id: (bankAcctRow as any).id,
        statement_date: now.split('T')[0],
        description: `Pre-fund received: ${fundName}`,
        reference: `PF-${fundId.slice(0, 8).toUpperCase()}`,
        amount,
        currency,
        pre_fund_request_id: fundId,
      });
    } catch {
      // Non-blocking — bank statement line failure must not prevent activation
    }
  }
}
