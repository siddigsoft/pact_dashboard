-- ─────────────────────────────────────────────────────────────────────────────
-- PATCH: Fix Allocation Dashboard "Total Spent = 0" bug
-- Run this in the Supabase SQL Editor (safe to run multiple times).
--
-- Steps:
--   1. Add user_id column to pre_fund_transactions (if missing)
--   2. Backfill user_id on existing transactions from source documents
--   3. Recalculate spent_amount in pre_fund_allocations from transactions
--   4. Rebuild add_pre_fund_transaction_rpc with p_user_id param
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Step 1: ensure user_id column exists ─────────────────────────────────────
ALTER TABLE pre_fund_transactions
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pf_transactions_user
  ON pre_fund_transactions(user_id);

-- ── Step 2: backfill user_id from source documents ───────────────────────────
-- Operational Cost Submissions (submitted_by is the field staff)
UPDATE pre_fund_transactions pft
SET    user_id = ocs.submitted_by
FROM   operational_cost_submissions ocs
WHERE  pft.reference     = ocs.id::TEXT
  AND  pft.transaction_type = 'payment'
  AND  pft.user_id       IS NULL
  AND  ocs.submitted_by  IS NOT NULL;

-- Down-Payment Requests (requested_by is the field staff)
UPDATE pre_fund_transactions pft
SET    user_id = dp.requested_by
FROM   down_payment_requests dp
WHERE  pft.reference     = dp.id::TEXT
  AND  pft.transaction_type = 'payment'
  AND  pft.user_id       IS NULL
  AND  dp.requested_by   IS NOT NULL;

-- Enumerator Fees (enumerator_id is the field staff)
UPDATE pre_fund_transactions pft
SET    user_id = ef.enumerator_id
FROM   enumerator_fees ef
WHERE  pft.reference     = ef.id::TEXT
  AND  pft.transaction_type = 'payment'
  AND  pft.user_id       IS NULL
  AND  ef.enumerator_id  IS NOT NULL;

-- Fallback: if still NULL, default to created_by (whoever recorded the transaction)
UPDATE pre_fund_transactions
SET    user_id = created_by
WHERE  user_id IS NULL
  AND  created_by IS NOT NULL
  AND  transaction_type = 'payment';

-- ── Step 3: recalculate spent_amount in pre_fund_allocations ─────────────────
UPDATE pre_fund_allocations pfa
SET    spent_amount = COALESCE((
         SELECT SUM(pft.amount)
         FROM   pre_fund_transactions pft
         WHERE  pft.pre_fund_request_id = pfa.pre_fund_request_id
           AND  pft.user_id             = pfa.user_id
           AND  pft.transaction_type    = 'payment'
       ), 0),
       updated_at = now();

-- ── Step 4: rebuild add_pre_fund_transaction_rpc with p_user_id ──────────────
DROP FUNCTION IF EXISTS public.add_pre_fund_transaction_rpc(uuid,text,text,numeric,text,text,text,date,uuid,text,text);
DROP FUNCTION IF EXISTS add_pre_fund_transaction_rpc(uuid,text,text,numeric,text,text,text,date,uuid,text,text);
DROP FUNCTION IF EXISTS public.add_pre_fund_transaction_rpc(uuid,text,text,numeric,text,text,text,date,uuid,text,text,uuid);
DROP FUNCTION IF EXISTS add_pre_fund_transaction_rpc(uuid,text,text,numeric,text,text,text,date,uuid,text,text,uuid);

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
  p_gl_credit_code   TEXT    DEFAULT NULL,
  -- NEW: optional target user whose allocation is deducted (super_admin only)
  p_user_id          UUID    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_txn_id      UUID;
  v_je_id       UUID;
  v_dr_id       UUID;
  v_cr_id       UUID;
  v_gl_event    TEXT;
  v_post_gl     BOOLEAN;
  v_alloc_rows  INT;
BEGIN
  v_gl_event := CASE p_transaction_type
    WHEN 'payment'       THEN 'pre_fund_paid'
    WHEN 'commitment'    THEN 'pre_fund_committed'
    WHEN 'carry_forward' THEN 'pre_fund_carry_forward'
    ELSE NULL
  END;

  v_post_gl := (v_gl_event IS NOT NULL
                AND p_gl_debit_code IS NOT NULL
                AND p_gl_credit_code IS NOT NULL);

  -- Insert the transaction row
  INSERT INTO pre_fund_transactions (
    pre_fund_request_id, transaction_type, amount, currency,
    reference, description, transaction_date, reconciled, created_by, user_id
  ) VALUES (
    p_fund_id, p_transaction_type, p_amount, p_currency,
    p_reference, p_description, p_transaction_date, false,
    p_created_by,
    COALESCE(p_user_id, p_created_by)
  ) RETURNING id INTO v_txn_id;

  -- Optional GL journal entry
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

  -- ── Allocation deduction (payment type + target user specified) ──────────
  IF p_user_id IS NOT NULL AND p_transaction_type = 'payment' THEN
    IF EXISTS (SELECT 1 FROM pre_fund_allocations
               WHERE pre_fund_request_id = p_fund_id LIMIT 1) THEN
      UPDATE pre_fund_allocations
      SET spent_amount = spent_amount + p_amount,
          updated_at   = now()
      WHERE pre_fund_request_id = p_fund_id
        AND user_id = p_user_id;

      GET DIAGNOSTICS v_alloc_rows = ROW_COUNT;
      IF v_alloc_rows = 0 THEN
        RAISE EXCEPTION
          'No allocation found for this user in fund %. Allocate a budget for this user first.',
          p_fund_id;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success',          true,
    'transaction_id',   v_txn_id,
    'journal_entry_id', v_je_id,
    'gl_posted',        v_post_gl
  );
END;
$$;

REVOKE ALL ON FUNCTION add_pre_fund_transaction_rpc(UUID,TEXT,TEXT,NUMERIC,TEXT,TEXT,TEXT,DATE,UUID,TEXT,TEXT,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION add_pre_fund_transaction_rpc(UUID,TEXT,TEXT,NUMERIC,TEXT,TEXT,TEXT,DATE,UUID,TEXT,TEXT,UUID) TO authenticated;
