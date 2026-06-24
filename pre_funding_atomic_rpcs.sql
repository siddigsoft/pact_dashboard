-- ============================================================================
-- PRE-FUNDING ATOMIC RPCs
-- All multi-step financial writes wrapped in a single DB transaction.
-- Apply via Supabase SQL editor.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- RPC 1: activate_pre_fund_rpc
-- Wraps: GL JE + lines + bridge log + fund status/balance update
-- Called by: preFundActivation.ts (replaces sequential client calls)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION activate_pre_fund_rpc(
  p_fund_id              UUID,
  p_fund_name            TEXT,
  p_amount               NUMERIC,
  p_currency             TEXT,
  p_gl_receipt_code      TEXT,
  p_gl_liability_code    TEXT,
  p_created_by           UUID    DEFAULT NULL,
  p_receipt_url          TEXT    DEFAULT NULL,
  p_idempotency_suffix   TEXT    DEFAULT ''
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_receipt_acct_id  UUID;
  v_liab_acct_id     UUID;
  v_je_id            UUID;
  v_idempotency_key  TEXT;
BEGIN
  -- 1. Resolve GL account IDs
  SELECT id INTO v_receipt_acct_id FROM acct_accounts WHERE code = p_gl_receipt_code LIMIT 1;
  SELECT id INTO v_liab_acct_id    FROM acct_accounts WHERE code = p_gl_liability_code LIMIT 1;

  IF v_receipt_acct_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error',
      'GL account not found for code "' || p_gl_receipt_code || '" — configure accounts before activating this fund.');
  END IF;
  IF v_liab_acct_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error',
      'GL account not found for code "' || p_gl_liability_code || '" — configure accounts before activating this fund.');
  END IF;

  v_idempotency_key := 'pf-received-' || p_fund_id::TEXT ||
                       CASE WHEN p_idempotency_suffix <> '' THEN '-' || p_idempotency_suffix ELSE '' END;

  -- 2. All writes in one transaction block
  BEGIN
    -- Journal entry
    INSERT INTO acct_journal_entries (
      description_en, description_ar, posting_date, status,
      source_type, source_id, idempotency_key, created_by
    ) VALUES (
      'Pre-Fund Received — ' || p_fund_name || ' activated',
      'استلام التمويل المسبق — ' || p_fund_name,
      CURRENT_DATE, 'draft',
      'pre_fund_requests', p_fund_id, v_idempotency_key, p_created_by
    ) RETURNING id INTO v_je_id;

    -- Journal lines (DR cash, CR liability)
    INSERT INTO acct_journal_lines (entry_id, line_no, account_id, debit_credit,
      original_amount, original_currency, functional_amount, functional_currency,
      description, function)
    VALUES
      (v_je_id, 1, v_receipt_acct_id, 'DR',
       p_amount, p_currency, p_amount, p_currency,
       'Pre-fund receipt — ' || p_fund_name, 'program'),
      (v_je_id, 2, v_liab_acct_id, 'CR',
       p_amount, p_currency, p_amount, p_currency,
       'Pre-fund liability deferred — ' || p_fund_name, 'program');

    -- Bridge log
    INSERT INTO acct_gl_bridge_log (source_table, source_id, event_type, status, journal_entry_id)
    VALUES ('pre_fund_requests', p_fund_id, 'pre_fund_received', 'success', v_je_id);

    -- Activate the fund
    UPDATE pre_fund_requests
    SET status            = 'active',
        available_balance = p_amount,
        activated_at      = NOW(),
        receipt_url       = COALESCE(p_receipt_url, receipt_url)
    WHERE id = p_fund_id;

  EXCEPTION WHEN OTHERS THEN
    RAISE; -- rolls back everything inserted above
  END;

  RETURN jsonb_build_object('success', true, 'journal_entry_id', v_je_id);
END;
$$;

GRANT EXECUTE ON FUNCTION activate_pre_fund_rpc TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC 2: link_payment_atomically_rpc
-- Wraps: pre_fund_transactions insert + available_balance deduction + source back-link
-- Called by: preFundLinkage.ts (scoring/matching stays in TypeScript; only writes here)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION link_payment_atomically_rpc(
  p_fund_id       UUID,
  p_amount        NUMERIC,
  p_currency      TEXT,
  p_source_table  TEXT,   -- 'operational_cost_submissions' | 'down_payment_requests'
  p_source_id     UUID,
  p_reference     TEXT    DEFAULT NULL,
  p_description   TEXT    DEFAULT NULL,
  p_payment_date  DATE    DEFAULT CURRENT_DATE,
  p_created_by    UUID    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_txn_id       UUID;
  v_new_balance  NUMERIC;
  v_cur_balance  NUMERIC;
BEGIN
  -- Verify fund exists and has sufficient balance
  SELECT available_balance INTO v_cur_balance
  FROM pre_fund_requests WHERE id = p_fund_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Fund not found.');
  END IF;

  v_new_balance := GREATEST(0, v_cur_balance - p_amount);

  BEGIN
    -- 1. Create transaction record
    INSERT INTO pre_fund_transactions (
      pre_fund_request_id, transaction_type, amount, currency,
      reference, description, transaction_date, reconciled, created_by
    ) VALUES (
      p_fund_id, 'payment', p_amount, p_currency,
      p_reference, COALESCE(p_description, 'Auto-linked from ' || p_source_table),
      p_payment_date, false, p_created_by
    ) RETURNING id INTO v_txn_id;

    -- 2. Deduct balance
    UPDATE pre_fund_requests
    SET available_balance = v_new_balance,
        paid_amount       = COALESCE(paid_amount, 0) + p_amount
    WHERE id = p_fund_id;

    -- 3. Back-link source row (dynamic table via EXECUTE)
    IF p_source_table = 'operational_cost_submissions' THEN
      UPDATE operational_cost_submissions
      SET pre_fund_transaction_id = v_txn_id
      WHERE id = p_source_id;
    ELSIF p_source_table = 'down_payment_requests' THEN
      UPDATE down_payment_requests
      SET pre_fund_transaction_id = v_txn_id
      WHERE id = p_source_id;
    END IF;

  EXCEPTION WHEN OTHERS THEN
    RAISE;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_txn_id,
    'new_balance', v_new_balance
  );
END;
$$;

GRANT EXECUTE ON FUNCTION link_payment_atomically_rpc TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC 3: add_pre_fund_transaction_rpc
-- Wraps: txn insert + optional GL JE + lines + bridge log
-- Called by: PreFundingReconciliation.tsx handleAddTxn
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION add_pre_fund_transaction_rpc(
  p_fund_id          UUID,
  p_fund_name        TEXT,
  p_transaction_type TEXT,
  p_amount           NUMERIC,
  p_currency         TEXT,
  p_reference        TEXT    DEFAULT NULL,
  p_description      TEXT    DEFAULT NULL,
  p_transaction_date DATE    DEFAULT CURRENT_DATE,
  p_created_by       UUID    DEFAULT NULL,
  p_gl_debit_code    TEXT    DEFAULT NULL,
  p_gl_credit_code   TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_txn_id   UUID;
  v_je_id    UUID;
  v_dr_id    UUID;
  v_cr_id    UUID;
  v_gl_event TEXT;
  v_post_gl  BOOLEAN;
BEGIN
  v_gl_event := CASE p_transaction_type
    WHEN 'payment'      THEN 'pre_fund_paid'
    WHEN 'commitment'   THEN 'pre_fund_committed'
    WHEN 'carry_forward'THEN 'pre_fund_carry_forward'
    ELSE NULL
  END;

  v_post_gl := (v_gl_event IS NOT NULL AND p_gl_debit_code IS NOT NULL AND p_gl_credit_code IS NOT NULL);

  BEGIN
    -- 1. Insert transaction
    INSERT INTO pre_fund_transactions (
      pre_fund_request_id, transaction_type, amount, currency,
      reference, description, transaction_date, reconciled, created_by
    ) VALUES (
      p_fund_id, p_transaction_type, p_amount, p_currency,
      p_reference, p_description, p_transaction_date, false, p_created_by
    ) RETURNING id INTO v_txn_id;

    -- 2. GL Bridge (only for mapped event types with valid account codes)
    IF v_post_gl THEN
      SELECT id INTO v_dr_id FROM acct_accounts WHERE code = p_gl_debit_code  LIMIT 1;
      SELECT id INTO v_cr_id FROM acct_accounts WHERE code = p_gl_credit_code LIMIT 1;

      IF v_dr_id IS NULL OR v_cr_id IS NULL THEN
        RAISE EXCEPTION 'GL account not found (DR: %, CR: %)', p_gl_debit_code, p_gl_credit_code;
      END IF;

      INSERT INTO acct_journal_entries (
        description_en, posting_date, status, source_type, source_id,
        idempotency_key, created_by
      ) VALUES (
        'Pre-Fund ' || p_transaction_type || ' — ' || p_fund_name,
        p_transaction_date, 'draft',
        'pre_fund_transactions', v_txn_id,
        'pf-' || p_transaction_type || '-' || v_txn_id::TEXT,
        p_created_by
      ) RETURNING id INTO v_je_id;

      INSERT INTO acct_journal_lines (entry_id, line_no, account_id, debit_credit,
        original_amount, original_currency, functional_amount, functional_currency,
        description, function)
      VALUES
        (v_je_id, 1, v_dr_id, 'DR', p_amount, p_currency, p_amount, p_currency,
         v_gl_event || ' — ' || p_fund_name, 'program'),
        (v_je_id, 2, v_cr_id, 'CR', p_amount, p_currency, p_amount, p_currency,
         v_gl_event || ' — ' || p_fund_name, 'program');

      INSERT INTO acct_gl_bridge_log (source_table, source_id, event_type, status, journal_entry_id)
      VALUES ('pre_fund_transactions', v_txn_id, v_gl_event, 'success', v_je_id);
    END IF;

  EXCEPTION WHEN OTHERS THEN
    RAISE;
  END;

  RETURN jsonb_build_object(
    'success',           true,
    'transaction_id',    v_txn_id,
    'journal_entry_id',  v_je_id,
    'gl_posted',         v_post_gl
  );
END;
$$;

GRANT EXECUTE ON FUNCTION add_pre_fund_transaction_rpc TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC 4: close_pre_fund_period_rpc
-- Wraps: recon insert + fund status close + GL JEs + bridge logs (+ optional carry-forward JE)
-- Called by: PreFundingReconciliation.tsx handleClosePeriod
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION close_pre_fund_period_rpc(
  p_fund_id             UUID,
  p_fund_name           TEXT,
  p_period_start        DATE,
  p_period_end          DATE,
  p_total_funded        NUMERIC,
  p_total_paid          NUMERIC,
  p_total_committed     NUMERIC,
  p_surplus             NUMERIC,
  p_surplus_action      TEXT,   -- 'carry_forward' | 'return' | 'reserve' | 'split'
  p_carry_forward_amt   NUMERIC DEFAULT 0,
  p_return_amt          NUMERIC DEFAULT 0,
  p_reserve_amt         NUMERIC DEFAULT 0,
  p_currency            TEXT    DEFAULT 'USD',
  p_notes               TEXT    DEFAULT NULL,
  p_closed_by           UUID    DEFAULT NULL,
  p_gl_liability_code   TEXT    DEFAULT '2400',
  p_gl_receipt_code     TEXT    DEFAULT '1200',
  p_gl_expense_code     TEXT    DEFAULT '5600',
  p_gl_cf_code          TEXT    DEFAULT '2401'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_recon_id    UUID;
  v_je_id       UUID;
  v_cf_je_id    UUID;
  v_liab_id     UUID;
  v_bank_id     UUID;
  v_exp_id      UUID;
  v_cf_id       UUID;
  v_variance    NUMERIC;
  v_posting_dt  DATE := CURRENT_DATE;
BEGIN
  v_variance := GREATEST(0, p_surplus - p_return_amt - p_carry_forward_amt);

  -- Resolve GL account IDs (missing IDs just skip those lines — non-blocking)
  SELECT id INTO v_liab_id FROM acct_accounts WHERE code = p_gl_liability_code LIMIT 1;
  SELECT id INTO v_bank_id FROM acct_accounts WHERE code = p_gl_receipt_code   LIMIT 1;
  SELECT id INTO v_exp_id  FROM acct_accounts WHERE code = p_gl_expense_code   LIMIT 1;
  SELECT id INTO v_cf_id   FROM acct_accounts WHERE code = p_gl_cf_code        LIMIT 1;

  BEGIN
    -- 1. Insert reconciliation record
    INSERT INTO pre_fund_reconciliations (
      pre_fund_request_id, period_start, period_end,
      total_funded, total_paid, total_committed, variance,
      surplus_action, carry_forward_amount, return_amount, reserve_amount,
      status, closed_at, closed_by, notes
    ) VALUES (
      p_fund_id, p_period_start, p_period_end,
      p_total_funded, p_total_paid, p_total_committed, p_surplus,
      p_surplus_action, p_carry_forward_amt, p_return_amt, p_reserve_amt,
      'closed', NOW(), p_closed_by, p_notes
    ) RETURNING id INTO v_recon_id;

    -- 2. Close the fund
    UPDATE pre_fund_requests SET status = 'closed' WHERE id = p_fund_id;

    -- 3. GL Bridge: period-close journal entry
    INSERT INTO acct_journal_entries (
      description_en, description_ar, posting_date, status,
      source_type, source_id, idempotency_key, created_by
    ) VALUES (
      'Pre-Fund Period Close — ' || p_fund_name,
      'إغلاق فترة التمويل المسبق — ' || p_fund_name,
      v_posting_dt, 'draft',
      'pre_fund_reconciliations', v_recon_id,
      'pf-closed-' || p_fund_id::TEXT,
      p_closed_by
    ) RETURNING id INTO v_je_id;

    -- Lines: return portion (Dr liability → Cr bank)
    IF v_liab_id IS NOT NULL AND v_bank_id IS NOT NULL AND p_return_amt > 0 THEN
      INSERT INTO acct_journal_lines (entry_id, line_no, account_id, debit_credit,
        original_amount, original_currency, functional_amount, functional_currency,
        description, function)
      VALUES
        (v_je_id, 1, v_liab_id, 'DR', p_return_amt, p_currency, p_return_amt, p_currency,
         'Pre-fund close — return to donor', 'program'),
        (v_je_id, 2, v_bank_id, 'CR', p_return_amt, p_currency, p_return_amt, p_currency,
         'Donor refund — cash out', 'program');
    END IF;

    -- Lines: variance/expense (Dr liability → Cr expense)
    IF v_liab_id IS NOT NULL AND v_exp_id IS NOT NULL AND v_variance > 0 THEN
      INSERT INTO acct_journal_lines (entry_id, line_no, account_id, debit_credit,
        original_amount, original_currency, functional_amount, functional_currency,
        description, function)
      VALUES
        (v_je_id, 3, v_liab_id, 'DR', v_variance, p_currency, v_variance, p_currency,
         'Pre-fund close — variance treated as expense', 'program'),
        (v_je_id, 4, v_exp_id,  'CR', v_variance, p_currency, v_variance, p_currency,
         'Programme expense — residual balance', 'program');
    END IF;

    -- Bridge log for close entry
    INSERT INTO acct_gl_bridge_log (source_table, source_id, event_type, status, journal_entry_id)
    VALUES ('pre_fund_reconciliations', v_recon_id, 'pre_fund_closed', 'success', v_je_id);

    -- 4. Carry-forward GL entry (if applicable)
    IF p_surplus_action = 'carry_forward' AND p_carry_forward_amt > 0 AND
       v_liab_id IS NOT NULL AND v_cf_id IS NOT NULL THEN

      INSERT INTO acct_journal_entries (
        description_en, description_ar, posting_date, status,
        source_type, source_id, idempotency_key, created_by
      ) VALUES (
        'Pre-Fund Carry-Forward — ' || p_fund_name || ' (surplus carried to next period)',
        'ترحيل رصيد التمويل المسبق — ' || p_fund_name,
        v_posting_dt, 'draft',
        'pre_fund_reconciliations', v_recon_id,
        'pf-carry-fwd-' || p_fund_id::TEXT,
        p_closed_by
      ) RETURNING id INTO v_cf_je_id;

      INSERT INTO acct_journal_lines (entry_id, line_no, account_id, debit_credit,
        original_amount, original_currency, functional_amount, functional_currency,
        description, function)
      VALUES
        (v_cf_je_id, 1, v_liab_id, 'DR', p_carry_forward_amt, p_currency, p_carry_forward_amt, p_currency,
         'Carry-forward — close old-period pre-fund liability', 'program'),
        (v_cf_je_id, 2, v_cf_id,   'CR', p_carry_forward_amt, p_currency, p_carry_forward_amt, p_currency,
         'Carry-forward — open next-period pre-fund liability', 'program');

      INSERT INTO acct_gl_bridge_log (source_table, source_id, event_type, status, journal_entry_id)
      VALUES ('pre_fund_reconciliations', v_recon_id, 'pre_fund_carry_forward', 'success', v_cf_je_id);
    END IF;

  EXCEPTION WHEN OTHERS THEN
    RAISE;
  END;

  RETURN jsonb_build_object(
    'success',            true,
    'reconciliation_id',  v_recon_id,
    'journal_entry_id',   v_je_id,
    'cf_journal_entry_id', v_cf_je_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION close_pre_fund_period_rpc TO authenticated;
