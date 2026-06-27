-- =============================================================================
-- PRE-FUNDING ATOMIC RPCs — CANONICAL MIGRATION
--
-- This file is the authoritative Supabase migration for all pre-fund RPCs.
-- Sourced from pre_funding_atomic_rpcs.sql (project root).
-- Fresh environments run this automatically via supabase db push/reset.
-- =============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- Shared helper: assert the calling user has a finance/admin role.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _assert_finance_role()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT LOWER(role) INTO v_role
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;

  IF v_role IS NULL OR v_role NOT IN (
    'super_admin', 'superadmin', 'admin',
    'financialadmin', 'financial_admin',
    'financialAdmin'
  ) THEN
    RAISE EXCEPTION 'Access denied: finance or admin role required (role="%").', v_role;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION _assert_finance_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION _assert_finance_role() TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC 1: activate_pre_fund_rpc
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
SET search_path = public
AS $$
DECLARE
  v_receipt_acct_id  UUID;
  v_liab_acct_id     UUID;
  v_je_id            UUID;
  v_idempotency_key  TEXT;
  v_period_id        UUID;
  v_acct_fund_id     UUID;
  v_bank_acct_id     UUID;
  v_bank_recon_on    BOOLEAN;
BEGIN
  PERFORM _assert_finance_role();

  SELECT id INTO v_period_id
  FROM acct_fiscal_periods
  WHERE start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE AND status = 'open'
  ORDER BY start_date DESC LIMIT 1;

  IF v_period_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error',
      'No open fiscal period for today — open a period in Accounting → Fiscal Years first.');
  END IF;

  SELECT id INTO v_acct_fund_id FROM acct_funds WHERE is_active = true LIMIT 1;

  IF v_acct_fund_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error',
      'No active fund found in Fund Registry — create a fund in Accounting → Funds first.');
  END IF;

  SELECT id INTO v_receipt_acct_id FROM acct_accounts WHERE code = p_gl_receipt_code LIMIT 1;
  SELECT id INTO v_liab_acct_id    FROM acct_accounts WHERE code = p_gl_liability_code LIMIT 1;

  IF v_receipt_acct_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error',
      'GL account not found for code "' || p_gl_receipt_code || '".');
  END IF;
  IF v_liab_acct_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error',
      'GL account not found for code "' || p_gl_liability_code || '".');
  END IF;

  v_idempotency_key := 'pf-received-' || p_fund_id::TEXT ||
    CASE WHEN p_idempotency_suffix <> '' THEN '-' || p_idempotency_suffix ELSE '' END;

  INSERT INTO acct_journal_entries (
    description_en, description_ar, posting_date, period_id, status,
    source_type, source_id, idempotency_key, created_by
  ) VALUES (
    'Pre-Fund Received — ' || p_fund_name || ' activated',
    'استلام التمويل المسبق — ' || p_fund_name,
    CURRENT_DATE, v_period_id, 'draft',
    'pre_fund_requests', p_fund_id, v_idempotency_key, p_created_by
  ) RETURNING id INTO v_je_id;

  INSERT INTO acct_journal_lines (entry_id, line_no, account_id, fund_id, debit_credit,
    original_amount, original_currency, functional_amount, functional_currency,
    description, function)
  VALUES
    (v_je_id, 1, v_receipt_acct_id, v_acct_fund_id, 'DR',
     p_amount, p_currency, p_amount, p_currency,
     'Pre-fund receipt — ' || p_fund_name, 'program'),
    (v_je_id, 2, v_liab_acct_id, v_acct_fund_id, 'CR',
     p_amount, p_currency, p_amount, p_currency,
     'Pre-fund liability deferred — ' || p_fund_name, 'program');

  INSERT INTO acct_gl_bridge_log (source_table, source_id, event_type, status, journal_entry_id)
  VALUES ('pre_fund_requests', p_fund_id, 'pre_fund_received', 'success', v_je_id);

  UPDATE pre_fund_requests
  SET status            = 'active',
      available_balance = p_amount,
      activated_at      = NOW(),
      receipt_url       = COALESCE(p_receipt_url, receipt_url)
  WHERE id = p_fund_id;

  SELECT COALESCE((integration_bank_recon)::BOOLEAN, true)
  INTO   v_bank_recon_on
  FROM   pre_fund_settings LIMIT 1;

  IF COALESCE(v_bank_recon_on, true) THEN
    SELECT id INTO v_bank_acct_id
    FROM   acct_bank_accounts
    WHERE  currency = p_currency
    LIMIT  1;

    IF v_bank_acct_id IS NOT NULL THEN
      INSERT INTO acct_bank_statement_lines (
        bank_account_id, statement_date, description,
        reference, amount, currency, pre_fund_request_id
      ) VALUES (
        v_bank_acct_id,
        CURRENT_DATE,
        'Pre-fund received: ' || p_fund_name,
        'PF-' || UPPER(LEFT(p_fund_id::TEXT, 8)),
        p_amount,
        p_currency,
        p_fund_id
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'journal_entry_id', v_je_id);
END;
$$;

REVOKE ALL ON FUNCTION activate_pre_fund_rpc(UUID,TEXT,NUMERIC,TEXT,TEXT,TEXT,UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION activate_pre_fund_rpc(UUID,TEXT,NUMERIC,TEXT,TEXT,TEXT,UUID,TEXT,TEXT) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC 2: link_payment_atomically_rpc (canonical 11-arg version)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION link_payment_atomically_rpc(
  p_fund_id       UUID,
  p_amount        NUMERIC,
  p_currency      TEXT,
  p_source_table  TEXT,
  p_source_id     UUID,
  p_reference     TEXT    DEFAULT NULL,
  p_description   TEXT    DEFAULT NULL,
  p_payment_date  DATE    DEFAULT CURRENT_DATE,
  p_created_by    UUID    DEFAULT NULL,
  p_user_id       UUID    DEFAULT NULL,
  p_receipt_url   TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_txn_id          UUID;
  v_new_balance     NUMERIC;
  v_cur_balance     NUMERIC;
  v_gl_liab_code    TEXT;
  v_gl_rcpt_code    TEXT;
  v_liab_id         UUID;
  v_rcpt_id         UUID;
  v_je_id           UUID;
  v_ik              TEXT;
  v_alloc_rows      INT;
  v_alloc_remaining NUMERIC;
BEGIN
  PERFORM _assert_finance_role();

  SELECT available_balance, gl_liability_account, gl_receipt_account
  INTO   v_cur_balance, v_gl_liab_code, v_gl_rcpt_code
  FROM   pre_fund_requests WHERE id = p_fund_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Fund not found.');
  END IF;

  IF v_cur_balance < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient pre-fund balance (' || v_cur_balance::TEXT ||
               ' ' || p_currency || ' available; ' || p_amount::TEXT || ' requested).'
    );
  END IF;

  v_new_balance := v_cur_balance - p_amount;

  INSERT INTO pre_fund_transactions (
    pre_fund_request_id, transaction_type, amount, currency,
    reference, description, transaction_date, reconciled,
    source_table, source_id, created_by,
    user_id, receipt_url
  ) VALUES (
    p_fund_id, 'payment', p_amount, p_currency,
    p_reference,
    COALESCE(p_description, 'Auto-linked from ' || p_source_table),
    p_payment_date, false,
    p_source_table, p_source_id, p_created_by,
    COALESCE(p_user_id, p_created_by),
    p_receipt_url
  ) RETURNING id INTO v_txn_id;

  UPDATE pre_fund_requests
  SET available_balance = v_new_balance,
      paid_amount       = COALESCE(paid_amount, 0) + p_amount
  WHERE id = p_fund_id;

  IF p_source_table = 'operational_cost_submissions' THEN
    UPDATE operational_cost_submissions
    SET pre_fund_transaction_id = v_txn_id WHERE id = p_source_id;
  ELSIF p_source_table = 'down_payment_requests' THEN
    UPDATE down_payment_requests
    SET pre_fund_transaction_id = v_txn_id WHERE id = p_source_id;
  END IF;

  -- Allocation guard: when fund has allocations, submitter MUST be allocated
  IF p_user_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pre_fund_allocations
               WHERE pre_fund_request_id = p_fund_id LIMIT 1) THEN
      SELECT allocated_amount - spent_amount
      INTO   v_alloc_remaining
      FROM   pre_fund_allocations
      WHERE  pre_fund_request_id = p_fund_id AND user_id = p_user_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'User has no allocation for this fund. Allocate budget before linking payments.'
        );
      END IF;

      IF v_alloc_remaining < p_amount THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Insufficient personal allocation (' || v_alloc_remaining::TEXT ||
                   ' remaining; ' || p_amount::TEXT || ' requested).'
        );
      END IF;

      UPDATE pre_fund_allocations
      SET spent_amount = spent_amount + p_amount, updated_at = now()
      WHERE pre_fund_request_id = p_fund_id AND user_id = p_user_id;

      GET DIAGNOSTICS v_alloc_rows = ROW_COUNT;
      IF v_alloc_rows = 0 THEN
        RAISE EXCEPTION 'Allocation row vanished between lock and update — rolling back.';
      END IF;
    END IF;
  END IF;

  -- GL posting (pre_fund_paid)
  IF v_gl_liab_code IS NOT NULL AND v_gl_rcpt_code IS NOT NULL THEN
    SELECT id INTO v_liab_id FROM acct_accounts WHERE code = v_gl_liab_code LIMIT 1;
    SELECT id INTO v_rcpt_id  FROM acct_accounts WHERE code = v_gl_rcpt_code  LIMIT 1;

    IF v_liab_id IS NOT NULL AND v_rcpt_id IS NOT NULL THEN
      v_ik := 'pf-paid-' || p_source_table || '-' || p_source_id::TEXT;

      IF NOT EXISTS (SELECT 1 FROM acct_journal_entries WHERE idempotency_key = v_ik) THEN
        INSERT INTO acct_journal_entries (
          description_en, description_ar, posting_date, status,
          source_type, source_id, idempotency_key, created_by
        ) VALUES (
          'Pre-Fund Disbursement — ' || COALESCE(p_description, p_source_table),
          'صرف التمويل المسبق — '    || COALESCE(p_description, p_source_table),
          p_payment_date, 'draft',
          p_source_table, p_source_id, v_ik, p_created_by
        ) RETURNING id INTO v_je_id;

        INSERT INTO acct_journal_lines (
          entry_id, line_no, account_id, debit_credit,
          original_amount, original_currency, functional_amount, functional_currency,
          description, function
        ) VALUES
          (v_je_id, 1, v_liab_id, 'DR',
           p_amount, p_currency, p_amount, p_currency,
           'Pre-fund disbursement — liability released', 'program'),
          (v_je_id, 2, v_rcpt_id,  'CR',
           p_amount, p_currency, p_amount, p_currency,
           'Pre-fund disbursement — cash/bank outflow', 'program');

        INSERT INTO acct_gl_bridge_log (source_table, source_id, event_type, status, journal_entry_id)
        VALUES (p_source_table, p_source_id, 'pre_fund_paid', 'success', v_je_id);
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_txn_id,
    'new_balance', v_new_balance
  );
END;
$$;

-- Drop legacy 9-arg overload so PostgREST has a single unambiguous signature
DROP FUNCTION IF EXISTS link_payment_atomically_rpc(UUID,NUMERIC,TEXT,TEXT,UUID,TEXT,TEXT,DATE,UUID);

REVOKE ALL ON FUNCTION link_payment_atomically_rpc(UUID,NUMERIC,TEXT,TEXT,UUID,TEXT,TEXT,DATE,UUID,UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION link_payment_atomically_rpc(UUID,NUMERIC,TEXT,TEXT,UUID,TEXT,TEXT,DATE,UUID,UUID,TEXT) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC 3: add_pre_fund_transaction_rpc
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.add_pre_fund_transaction_rpc(uuid,text,text,numeric,text,text,text,date,uuid,text,text);
DROP FUNCTION IF EXISTS add_pre_fund_transaction_rpc(uuid,text,text,numeric,text,text,text,date,uuid,text,text);
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
SET search_path = public
AS $$
DECLARE
  v_txn_id   UUID;
  v_je_id    UUID;
  v_dr_id    UUID;
  v_cr_id    UUID;
  v_gl_event TEXT;
  v_post_gl  BOOLEAN;
BEGIN
  PERFORM _assert_finance_role();

  v_gl_event := CASE p_transaction_type
    WHEN 'payment'       THEN 'pre_fund_paid'
    WHEN 'commitment'    THEN 'pre_fund_committed'
    WHEN 'carry_forward' THEN 'pre_fund_carry_forward'
    ELSE NULL
  END;

  v_post_gl := (v_gl_event IS NOT NULL
                AND p_gl_debit_code IS NOT NULL
                AND p_gl_credit_code IS NOT NULL);

  INSERT INTO pre_fund_transactions (
    pre_fund_request_id, transaction_type, amount, currency,
    reference, description, transaction_date, reconciled, created_by
  ) VALUES (
    p_fund_id, p_transaction_type, p_amount, p_currency,
    p_reference, p_description, p_transaction_date, false, p_created_by
  ) RETURNING id INTO v_txn_id;

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

  RETURN jsonb_build_object(
    'success',          true,
    'transaction_id',   v_txn_id,
    'journal_entry_id', v_je_id,
    'gl_posted',        v_post_gl
  );
END;
$$;

REVOKE ALL ON FUNCTION add_pre_fund_transaction_rpc(UUID,TEXT,TEXT,NUMERIC,TEXT,TEXT,TEXT,DATE,UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION add_pre_fund_transaction_rpc(UUID,TEXT,TEXT,NUMERIC,TEXT,TEXT,TEXT,DATE,UUID,TEXT,TEXT) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC 4: close_pre_fund_period_rpc
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
  p_surplus_action      TEXT,
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
SET search_path = public
AS $$
DECLARE
  v_recon_id   UUID;
  v_je_id      UUID;
  v_cf_je_id   UUID;
  v_liab_id    UUID;
  v_bank_id    UUID;
  v_exp_id     UUID;
  v_cf_id      UUID;
  v_variance   NUMERIC;
  v_posting_dt DATE := CURRENT_DATE;
BEGIN
  PERFORM _assert_finance_role();

  v_variance := GREATEST(0, p_surplus - p_return_amt - p_carry_forward_amt);

  SELECT id INTO v_liab_id FROM acct_accounts WHERE code = p_gl_liability_code LIMIT 1;
  SELECT id INTO v_bank_id FROM acct_accounts WHERE code = p_gl_receipt_code   LIMIT 1;
  SELECT id INTO v_exp_id  FROM acct_accounts WHERE code = p_gl_expense_code   LIMIT 1;
  SELECT id INTO v_cf_id   FROM acct_accounts WHERE code = p_gl_cf_code        LIMIT 1;

  INSERT INTO pre_fund_reconciliations (
    pre_fund_request_id, period_start, period_end,
    total_funded, total_paid, total_committed, variance,
    surplus_action, carry_forward_amount, return_amount, reserve_amount,
    status, closed_at, closed_by, notes
  ) VALUES (
    p_fund_id, p_period_start, p_period_end,
    p_total_funded, p_total_paid, p_total_committed,
    v_variance,
    p_surplus_action, p_carry_forward_amt, p_return_amt, p_reserve_amt,
    'closed', NOW(), p_closed_by, p_notes
  ) RETURNING id INTO v_recon_id;

  UPDATE pre_fund_requests SET status = 'closed' WHERE id = p_fund_id;

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

  INSERT INTO acct_gl_bridge_log (source_table, source_id, event_type, status, journal_entry_id)
  VALUES ('pre_fund_reconciliations', v_recon_id, 'pre_fund_closed', 'success', v_je_id);

  IF p_carry_forward_amt > 0 AND v_liab_id IS NOT NULL AND v_cf_id IS NOT NULL THEN
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

  RETURN jsonb_build_object(
    'success',             true,
    'reconciliation_id',   v_recon_id,
    'journal_entry_id',    v_je_id,
    'cf_journal_entry_id', v_cf_je_id
  );
END;
$$;

REVOKE ALL ON FUNCTION close_pre_fund_period_rpc(UUID,TEXT,DATE,DATE,NUMERIC,NUMERIC,NUMERIC,NUMERIC,TEXT,NUMERIC,NUMERIC,NUMERIC,TEXT,TEXT,UUID,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION close_pre_fund_period_rpc(UUID,TEXT,DATE,DATE,NUMERIC,NUMERIC,NUMERIC,NUMERIC,TEXT,NUMERIC,NUMERIC,NUMERIC,TEXT,TEXT,UUID,TEXT,TEXT,TEXT,TEXT) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- Auto-renewal scheduler (run_pre_fund_renewal_check)
-- Auth: pg_cron runs as postgres/supabase_admin; Edge Functions use service_role JWT
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION run_pre_fund_renewal_check()
RETURNS TABLE(fund_id UUID, fund_name TEXT, action TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receipt_acct_id UUID;
  v_liab_acct_id    UUID;
  v_je_id           UUID;
  v_ik              TEXT;
  r                 RECORD;
BEGIN
  -- Guard: allow pg_cron (current_user = postgres/supabase_admin) OR
  -- Edge Function scheduler (JWT role = service_role). JWT claims are absent
  -- in pg_cron context, so current_user is checked first.
  IF current_user NOT IN ('postgres', 'supabase_admin', 'supabase_auth_admin')
     AND coalesce(current_setting('request.jwt.claims.role', true), '') NOT IN ('service_role')
  THEN
    RAISE EXCEPTION 'run_pre_fund_renewal_check: unauthorized caller (db_user="%" jwt_role="%").',
      current_user,
      coalesce(current_setting('request.jwt.claims.role', true), '');
  END IF;

  UPDATE pre_fund_requests
  SET ending_soon_alert = true, updated_at = now()
  WHERE status IN ('active','low_balance')
    AND end_date IS NOT NULL
    AND end_date <= (CURRENT_DATE + (warning_days || ' days')::INTERVAL)
    AND ending_soon_alert = false;

  UPDATE pre_fund_requests
  SET status = 'low_balance', low_balance_alert = true, updated_at = now()
  WHERE status = 'active'
    AND threshold_pct IS NOT NULL
    AND amount > 0
    AND (available_balance / amount * 100) <= threshold_pct;

  FOR r IN
    SELECT pfr.id, pfr.name, pfr.amount, pfr.currency,
           pfr.gl_receipt_account, pfr.gl_liability_account,
           pfr.auto_renewal_mode, pfr.grace_period_days
    FROM pre_fund_requests pfr
    WHERE pfr.status IN ('active','low_balance','ending_soon')
      AND pfr.auto_renewal_mode IN ('auto_draft','auto_activate')
      AND pfr.end_date IS NOT NULL
      AND pfr.end_date <= (CURRENT_DATE + COALESCE(pfr.grace_period_days, 0))
      AND NOT EXISTS (
        SELECT 1 FROM pre_fund_requests child
        WHERE child.parent_fund_id = pfr.id
          AND child.status NOT IN ('rejected','cancelled')
      )
  LOOP
    IF r.auto_renewal_mode = 'auto_draft' THEN
      INSERT INTO pre_fund_requests (
        name, amount, currency, status,
        gl_receipt_account, gl_liability_account,
        auto_renewal_mode, grace_period_days, parent_fund_id
      ) VALUES (
        r.name || ' (Renewal)',
        r.amount, r.currency, 'draft',
        r.gl_receipt_account, r.gl_liability_account,
        r.auto_renewal_mode, r.grace_period_days,
        r.id
      );
      fund_id   := r.id;
      fund_name := r.name;
      action    := 'auto_drafted_renewal';
      RETURN NEXT;

    ELSIF r.auto_renewal_mode = 'auto_activate' THEN
      v_ik := 'pf-renew-' || r.id::TEXT;
      IF NOT EXISTS (SELECT 1 FROM acct_journal_entries WHERE idempotency_key = v_ik) THEN
        SELECT id INTO v_receipt_acct_id
        FROM acct_accounts WHERE code = r.gl_receipt_account LIMIT 1;
        SELECT id INTO v_liab_acct_id
        FROM acct_accounts WHERE code = r.gl_liability_account LIMIT 1;

        IF v_receipt_acct_id IS NOT NULL AND v_liab_acct_id IS NOT NULL THEN
          INSERT INTO acct_journal_entries (
            description_en, posting_date, status, source_type, source_id,
            idempotency_key
          ) VALUES (
            'Pre-Fund Auto-Renewal — ' || r.name,
            CURRENT_DATE, 'draft',
            'pre_fund_requests', r.id, v_ik
          ) RETURNING id INTO v_je_id;

          INSERT INTO acct_journal_lines (entry_id, line_no, account_id, debit_credit,
            original_amount, original_currency, functional_amount, functional_currency,
            description, function)
          VALUES
            (v_je_id, 1, v_receipt_acct_id, 'DR',
             r.amount, r.currency, r.amount, r.currency,
             'Auto-renewal receipt — ' || r.name, 'program'),
            (v_je_id, 2, v_liab_acct_id, 'CR',
             r.amount, r.currency, r.amount, r.currency,
             'Auto-renewal liability — ' || r.name, 'program');
        END IF;
      END IF;

      UPDATE pre_fund_requests
      SET status            = 'active',
          available_balance = amount,
          activated_at      = NOW()
      WHERE id = r.id;

      fund_id   := r.id;
      fund_name := r.name;
      action    := 'auto_activated';
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION run_pre_fund_renewal_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION run_pre_fund_renewal_check() FROM authenticated;
GRANT EXECUTE ON FUNCTION run_pre_fund_renewal_check() TO service_role;
-- pg_cron schedule (uncomment after enabling the pg_cron extension in Supabase dashboard):
-- SELECT cron.schedule('pre-fund-renewal-check', '0 6 * * *', 'SELECT run_pre_fund_renewal_check()');
