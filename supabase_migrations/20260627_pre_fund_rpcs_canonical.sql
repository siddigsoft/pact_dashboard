-- ============================================================
-- Pre-Funding Atomic RPCs — Canonical Migration
-- Run in Supabase Dashboard → SQL Editor
-- Safe to re-run: all objects use CREATE OR REPLACE / IF NOT EXISTS
-- ============================================================

-- ── 1. Tables ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pre_fund_transactions (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pre_fund_request_id  uuid        NOT NULL REFERENCES pre_fund_requests(id) ON DELETE CASCADE,
  transaction_type     text        NOT NULL CHECK (transaction_type IN ('receipt','payment','commitment','reversal','carry_forward','return','reserve','adjustment')),
  amount               numeric     NOT NULL,
  currency             text        NOT NULL DEFAULT 'SDG',
  reference            text,
  description          text,
  transaction_date     date        NOT NULL DEFAULT CURRENT_DATE,
  source_table         text,
  source_id            uuid,
  user_id              uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by           uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  receipt_url          text,
  gl_journal_entry_id  uuid,
  idempotency_key      text        UNIQUE,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pre_fund_allocations (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pre_fund_request_id  uuid        NOT NULL REFERENCES pre_fund_requests(id) ON DELETE CASCADE,
  user_id              uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  allocated_amount     numeric     NOT NULL DEFAULT 0,
  spent_amount         numeric     NOT NULL DEFAULT 0,
  currency             text        NOT NULL DEFAULT 'SDG',
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pre_fund_request_id, user_id)
);

CREATE TABLE IF NOT EXISTS pre_fund_reconciliations (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pre_fund_request_id  uuid        NOT NULL REFERENCES pre_fund_requests(id) ON DELETE CASCADE,
  period_start         date,
  period_end           date,
  total_funded         numeric     NOT NULL DEFAULT 0,
  total_paid           numeric     NOT NULL DEFAULT 0,
  total_committed      numeric     NOT NULL DEFAULT 0,
  surplus              numeric     NOT NULL DEFAULT 0,
  surplus_action       text,
  carry_forward_amount numeric     NOT NULL DEFAULT 0,
  return_amount        numeric     NOT NULL DEFAULT 0,
  reserve_amount       numeric     NOT NULL DEFAULT 0,
  currency             text        NOT NULL DEFAULT 'SDG',
  notes                text,
  closed_by            uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  gl_journal_entry_id  uuid,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pre_fund_settings (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  default_warning_days     integer     NOT NULL DEFAULT 14,
  default_renewal_mode     text        NOT NULL DEFAULT 'off',
  default_threshold_pct    numeric,
  bank_api_key_encrypted   text,
  bank_api_url             text,
  bank_api_provider        text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- Ensure idempotency_key column exists on pre_fund_transactions
-- (needed when the table was created before this column was added)
ALTER TABLE pre_fund_transactions ADD COLUMN IF NOT EXISTS idempotency_key text;
DO $idem$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pre_fund_transactions_idempotency_key_key'
      AND conrelid = 'pre_fund_transactions'::regclass
  ) THEN
    ALTER TABLE pre_fund_transactions
      ADD CONSTRAINT pre_fund_transactions_idempotency_key_key UNIQUE (idempotency_key);
  END IF;
END $idem$;

-- Add back-link column to source tables (harmless if already exists)
ALTER TABLE down_payment_requests
  ADD COLUMN IF NOT EXISTS pre_fund_transaction_id uuid;

ALTER TABLE operational_cost_submissions
  ADD COLUMN IF NOT EXISTS pre_fund_transaction_id uuid;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pft_fund_id   ON pre_fund_transactions(pre_fund_request_id);
CREATE INDEX IF NOT EXISTS idx_pft_source     ON pre_fund_transactions(source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_pft_idem       ON pre_fund_transactions(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pfa_fund_user  ON pre_fund_allocations(pre_fund_request_id, user_id);

-- ── 2. RLS ────────────────────────────────────────────────────────────────

ALTER TABLE pre_fund_transactions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pre_fund_allocations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pre_fund_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pre_fund_settings        ENABLE ROW LEVEL SECURITY;

-- Finance / admin can do everything; others read-only
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pre_fund_transactions' AND policyname='pft_finance_all') THEN
    CREATE POLICY pft_finance_all ON pre_fund_transactions FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pre_fund_allocations' AND policyname='pfa_finance_all') THEN
    CREATE POLICY pfa_finance_all ON pre_fund_allocations FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pre_fund_reconciliations' AND policyname='pfr_finance_all') THEN
    CREATE POLICY pfr_finance_all ON pre_fund_reconciliations FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pre_fund_settings' AND policyname='pfs_finance_all') THEN
    CREATE POLICY pfs_finance_all ON pre_fund_settings FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── 3. add_pre_fund_transaction_rpc ───────────────────────────────────────
-- Core transaction handler.  All balance changes go through here.
-- Used by: reconciliation manual-link, CSV import, manual adjustment.
-- Returns: { success, transaction_id, gl_posted, error }

CREATE OR REPLACE FUNCTION add_pre_fund_transaction_rpc(
  p_fund_id          uuid,
  p_fund_name        text,
  p_transaction_type text,
  p_amount           numeric,
  p_currency         text,
  p_reference        text    DEFAULT NULL,
  p_description      text    DEFAULT NULL,
  p_transaction_date date    DEFAULT CURRENT_DATE,
  p_created_by       uuid    DEFAULT NULL,
  p_gl_debit_code    text    DEFAULT NULL,
  p_gl_credit_code   text    DEFAULT NULL,
  p_user_id          uuid    DEFAULT NULL,
  p_source_table     text    DEFAULT NULL,
  p_source_id        uuid    DEFAULT NULL,
  p_receipt_url      text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_txn_id     uuid;
  v_je_id      uuid;
  v_gl_posted  boolean := false;
  v_idem_key   text;
  v_fund       pre_fund_requests%ROWTYPE;
BEGIN
  -- Lock the fund row for the duration of this transaction
  SELECT * INTO v_fund
  FROM pre_fund_requests
  WHERE id = p_fund_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Fund not found: ' || p_fund_id);
  END IF;

  -- Idempotency check (source-linked payments only)
  IF p_source_table IS NOT NULL AND p_source_id IS NOT NULL THEN
    v_idem_key := 'pf-' || p_transaction_type || '-' || p_source_table || '-' || p_source_id;
    SELECT id INTO v_txn_id
    FROM pre_fund_transactions
    WHERE idempotency_key = v_idem_key;
    IF FOUND THEN
      RETURN jsonb_build_object('success', true, 'transaction_id', v_txn_id, 'gl_posted', false, 'duplicate', true);
    END IF;
  END IF;

  -- Insert transaction record
  INSERT INTO pre_fund_transactions (
    pre_fund_request_id, transaction_type, amount, currency,
    reference, description, transaction_date,
    source_table, source_id, user_id, created_by,
    receipt_url, idempotency_key
  ) VALUES (
    p_fund_id, p_transaction_type, p_amount, p_currency,
    p_reference, p_description, p_transaction_date,
    p_source_table, p_source_id, p_user_id, p_created_by,
    p_receipt_url, v_idem_key
  )
  RETURNING id INTO v_txn_id;

  -- Update fund balances
  IF p_transaction_type = 'payment' THEN
    UPDATE pre_fund_requests SET
      available_balance = GREATEST(0, available_balance - p_amount),
      paid_amount       = COALESCE(paid_amount, 0) + p_amount
    WHERE id = p_fund_id;

    -- Deduct from personal allocation if applicable
    IF p_user_id IS NOT NULL THEN
      UPDATE pre_fund_allocations SET
        spent_amount = COALESCE(spent_amount, 0) + p_amount
      WHERE pre_fund_request_id = p_fund_id
        AND user_id = p_user_id;
    END IF;

  ELSIF p_transaction_type = 'commitment' THEN
    UPDATE pre_fund_requests SET
      available_balance = GREATEST(0, available_balance - p_amount),
      committed_amount  = COALESCE(committed_amount, 0) + p_amount
    WHERE id = p_fund_id;

  ELSIF p_transaction_type = 'receipt' THEN
    UPDATE pre_fund_requests SET
      available_balance = available_balance + p_amount,
      amount            = amount + p_amount
    WHERE id = p_fund_id;

  ELSIF p_transaction_type IN ('reversal', 'adjustment') THEN
    UPDATE pre_fund_requests SET
      available_balance = available_balance + p_amount
    WHERE id = p_fund_id;
  END IF;

  -- Optional GL posting (draft journal entry)
  IF p_gl_debit_code IS NOT NULL AND p_gl_credit_code IS NOT NULL THEN
    BEGIN
      INSERT INTO acct_journal_entries (
        description, entry_date, currency, status, reference, created_by
      ) VALUES (
        COALESCE(p_description, p_transaction_type || ' — ' || p_fund_name),
        p_transaction_date,
        p_currency,
        'draft',
        COALESCE(p_reference, v_txn_id::text),
        p_created_by
      )
      RETURNING id INTO v_je_id;

      INSERT INTO acct_journal_lines (journal_entry_id, account_code, debit, credit, description)
      VALUES
        (v_je_id, p_gl_debit_code,  p_amount, 0,        'Pre-fund ' || p_transaction_type),
        (v_je_id, p_gl_credit_code, 0,        p_amount, 'Pre-fund ' || p_transaction_type);

      UPDATE pre_fund_transactions
      SET gl_journal_entry_id = v_je_id
      WHERE id = v_txn_id;

      v_gl_posted := true;
    EXCEPTION WHEN OTHERS THEN
      -- GL posting failure is non-fatal; transaction is still recorded
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'success',         true,
    'transaction_id',  v_txn_id,
    'gl_posted',       v_gl_posted,
    'journal_entry_id', v_je_id
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ── 4. link_payment_atomically_rpc ────────────────────────────────────────
-- Called automatically when a payment is approved/marked paid.
-- Scores and selects the best matching fund (matching done in TS layer),
-- so this RPC just does the atomic write for a pre-selected fund.

CREATE OR REPLACE FUNCTION link_payment_atomically_rpc(
  p_fund_id      uuid,
  p_amount       numeric,
  p_currency     text,
  p_source_table text,
  p_source_id    uuid,
  p_reference    text    DEFAULT NULL,
  p_description  text    DEFAULT NULL,
  p_payment_date date    DEFAULT CURRENT_DATE,
  p_created_by   uuid    DEFAULT NULL,
  p_user_id      uuid    DEFAULT NULL,
  p_receipt_url  text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_fund   pre_fund_requests%ROWTYPE;
  v_idem   text;
  v_txn_id uuid;
BEGIN
  -- Idempotency guard — prevent double-linking the same source payment
  v_idem := 'pf-payment-' || p_source_table || '-' || p_source_id;
  SELECT id INTO v_txn_id FROM pre_fund_transactions WHERE idempotency_key = v_idem;
  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'transaction_id', v_txn_id, 'duplicate', true, 'gl_posted', false);
  END IF;

  -- Verify fund is active and has sufficient balance
  SELECT * INTO v_fund FROM pre_fund_requests WHERE id = p_fund_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Fund not found');
  END IF;
  IF v_fund.status NOT IN ('active', 'low_balance') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Fund is not active (status: ' || v_fund.status || ')');
  END IF;
  IF v_fund.available_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient fund balance (' || v_fund.available_balance || ' < ' || p_amount || ')');
  END IF;

  -- Delegate to core handler
  v_result := add_pre_fund_transaction_rpc(
    p_fund_id          => p_fund_id,
    p_fund_name        => v_fund.name,
    p_transaction_type => 'payment',
    p_amount           => p_amount,
    p_currency         => p_currency,
    p_reference        => p_reference,
    p_description      => p_description,
    p_transaction_date => p_payment_date,
    p_created_by       => p_created_by,
    p_user_id          => p_user_id,
    p_source_table     => p_source_table,
    p_source_id        => p_source_id,
    p_receipt_url      => p_receipt_url
  );

  -- Check if fund balance has dropped below warning threshold and update status
  IF (v_result->>'success')::boolean THEN
    DECLARE
      v_new_bal  numeric;
      v_warn_pct numeric;
    BEGIN
      SELECT available_balance INTO v_new_bal FROM pre_fund_requests WHERE id = p_fund_id;
      SELECT threshold_pct INTO v_warn_pct FROM pre_fund_requests WHERE id = p_fund_id;
      IF v_warn_pct IS NOT NULL AND v_fund.amount > 0 THEN
        IF (v_new_bal / v_fund.amount * 100) <= v_warn_pct THEN
          UPDATE pre_fund_requests SET status = 'low_balance' WHERE id = p_fund_id AND status = 'active';
        END IF;
      END IF;
    END;
  END IF;

  RETURN v_result;
END;
$$;

-- ── 5. unlink_payment_atomically_rpc ──────────────────────────────────────
-- Reverses a linked payment: deletes the transaction and restores balances.

CREATE OR REPLACE FUNCTION unlink_payment_atomically_rpc(
  p_source_table text,
  p_source_id    uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_txn  pre_fund_transactions%ROWTYPE;
BEGIN
  SELECT * INTO v_txn
  FROM pre_fund_transactions
  WHERE source_table = p_source_table
    AND source_id    = p_source_id
    AND transaction_type = 'payment'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'no_link_found', 'error', 'No payment transaction linked to this record.');
  END IF;

  -- Restore fund balance
  UPDATE pre_fund_requests SET
    available_balance = available_balance + v_txn.amount,
    paid_amount       = GREATEST(0, COALESCE(paid_amount, 0) - v_txn.amount)
  WHERE id = v_txn.pre_fund_request_id;

  -- Restore personal allocation if applicable
  IF v_txn.user_id IS NOT NULL THEN
    UPDATE pre_fund_allocations SET
      spent_amount = GREATEST(0, COALESCE(spent_amount, 0) - v_txn.amount)
    WHERE pre_fund_request_id = v_txn.pre_fund_request_id
      AND user_id = v_txn.user_id;
  END IF;

  -- Clear back-link on source record
  BEGIN
    EXECUTE format(
      'UPDATE %I SET pre_fund_transaction_id = NULL WHERE id = $1',
      p_source_table
    ) USING p_source_id;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Delete the transaction
  DELETE FROM pre_fund_transactions WHERE id = v_txn.id;

  RETURN jsonb_build_object('success', true, 'reversed_amount', v_txn.amount);
END;
$$;

-- ── 6. activate_pre_fund_rpc ──────────────────────────────────────────────
-- Activates a fund: sets status → active, sets available_balance,
-- posts DR cash / CR liability GL journal entry.

CREATE OR REPLACE FUNCTION activate_pre_fund_rpc(
  p_fund_id            uuid,
  p_fund_name          text,
  p_amount             numeric,
  p_currency           text,
  p_gl_receipt_code    text,
  p_gl_liability_code  text,
  p_created_by         uuid    DEFAULT NULL,
  p_receipt_url        text    DEFAULT NULL,
  p_idempotency_suffix text    DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_je_id  uuid;
  v_idem   text := 'pf-activate-' || p_fund_id || p_idempotency_suffix;
BEGIN
  -- Idempotency
  IF EXISTS (SELECT 1 FROM pre_fund_transactions WHERE idempotency_key = v_idem) THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true);
  END IF;

  -- Activate fund
  UPDATE pre_fund_requests SET
    status            = 'active',
    available_balance = p_amount
  WHERE id = p_fund_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Fund not found');
  END IF;

  -- Record receipt transaction
  INSERT INTO pre_fund_transactions (
    pre_fund_request_id, transaction_type, amount, currency,
    description, transaction_date, created_by, receipt_url, idempotency_key
  ) VALUES (
    p_fund_id, 'receipt', p_amount, p_currency,
    'Fund activated — initial receipt', CURRENT_DATE, p_created_by, p_receipt_url, v_idem
  );

  -- GL journal entry (DR bank/cash, CR liability)
  BEGIN
    INSERT INTO acct_journal_entries (
      description, entry_date, currency, status, reference, created_by
    ) VALUES (
      'Pre-fund activation — ' || p_fund_name,
      CURRENT_DATE, p_currency, 'draft', 'pf-activate-' || p_fund_id, p_created_by
    )
    RETURNING id INTO v_je_id;

    INSERT INTO acct_journal_lines (journal_entry_id, account_code, debit, credit, description)
    VALUES
      (v_je_id, p_gl_receipt_code,   p_amount, 0,        'Cash received — ' || p_fund_name),
      (v_je_id, p_gl_liability_code, 0,        p_amount, 'Donor liability — ' || p_fund_name);
  EXCEPTION WHEN OTHERS THEN
    -- GL failure is non-fatal
    v_je_id := NULL;
  END;

  RETURN jsonb_build_object(
    'success',          true,
    'journal_entry_id', v_je_id
  );
END;
$$;

-- ── 7. close_pre_fund_period_rpc ──────────────────────────────────────────
-- Closes a fund period: inserts reconciliation record, updates fund status,
-- posts GL entries for surplus disposition.

CREATE OR REPLACE FUNCTION close_pre_fund_period_rpc(
  p_fund_id           uuid,
  p_fund_name         text,
  p_period_start      date,
  p_period_end        date,
  p_total_funded      numeric,
  p_total_paid        numeric,
  p_total_committed   numeric,
  p_surplus           numeric,
  p_surplus_action    text,
  p_carry_forward_amt numeric DEFAULT 0,
  p_return_amt        numeric DEFAULT 0,
  p_reserve_amt       numeric DEFAULT 0,
  p_currency          text    DEFAULT 'SDG',
  p_notes             text    DEFAULT NULL,
  p_closed_by         uuid    DEFAULT NULL,
  p_gl_liability_code text    DEFAULT NULL,
  p_gl_receipt_code   text    DEFAULT NULL,
  p_gl_expense_code   text    DEFAULT NULL,
  p_gl_cf_code        text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recon_id uuid;
  v_je_id    uuid;
BEGIN
  -- Insert reconciliation record
  INSERT INTO pre_fund_reconciliations (
    pre_fund_request_id, period_start, period_end,
    total_funded, total_paid, total_committed,
    surplus, surplus_action,
    carry_forward_amount, return_amount, reserve_amount,
    currency, notes, closed_by
  ) VALUES (
    p_fund_id, p_period_start, p_period_end,
    p_total_funded, p_total_paid, p_total_committed,
    p_surplus, p_surplus_action,
    p_carry_forward_amt, p_return_amt, p_reserve_amt,
    p_currency, p_notes, p_closed_by
  )
  RETURNING id INTO v_recon_id;

  -- Close the fund
  UPDATE pre_fund_requests SET
    status            = 'closed',
    available_balance = 0
  WHERE id = p_fund_id;

  -- GL surplus entry (optional, only if GL codes are set)
  IF p_gl_liability_code IS NOT NULL AND p_gl_expense_code IS NOT NULL AND p_surplus != 0 THEN
    BEGIN
      INSERT INTO acct_journal_entries (
        description, entry_date, currency, status, reference, created_by
      ) VALUES (
        'Pre-fund period close — ' || p_fund_name,
        COALESCE(p_period_end, CURRENT_DATE), p_currency, 'draft',
        'pf-close-' || p_fund_id, p_closed_by
      )
      RETURNING id INTO v_je_id;

      -- Surplus: DR liability / CR carry-forward or expense
      IF p_surplus > 0 THEN
        INSERT INTO acct_journal_lines (journal_entry_id, account_code, debit, credit, description)
        VALUES
          (v_je_id, p_gl_liability_code, p_surplus, 0,          'Surplus — close ' || p_fund_name),
          (v_je_id, COALESCE(p_gl_cf_code, p_gl_expense_code), 0, p_surplus, 'Surplus disposal');
      END IF;

      UPDATE pre_fund_reconciliations SET gl_journal_entry_id = v_je_id WHERE id = v_recon_id;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  RETURN jsonb_build_object(
    'success',          true,
    'reconciliation_id', v_recon_id,
    'journal_entry_id', v_je_id
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ── 8. store_pre_fund_bank_key ────────────────────────────────────────────
-- Stores (or clears) a bank API key against a pre_fund_settings row.
-- Key is stored as-is (plaintext); production should use pgcrypto if available.

CREATE OR REPLACE FUNCTION store_pre_fund_bank_key(
  p_settings_id uuid,
  p_key         text DEFAULT NULL,
  p_url         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE pre_fund_settings SET
    bank_api_key_encrypted = COALESCE(p_key, bank_api_key_encrypted),
    bank_api_url           = COALESCE(p_url, bank_api_url),
    updated_at             = now()
  WHERE id = p_settings_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Settings row not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── Reload PostgREST schema cache ─────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
