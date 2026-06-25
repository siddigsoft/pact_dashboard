-- Pre-Fund Schema Alignment
-- Adds columns missing from pre_fund_settings and relaxes constraints
-- to match the UI options in PreFundingSettings.tsx and PreFundingReconciliation.tsx.

-- ── 1. pre_fund_settings — add missing reconciliation action toggle columns ──
ALTER TABLE IF EXISTS public.pre_fund_settings
  ADD COLUMN IF NOT EXISTS reconciliation_action_return_bank    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reconciliation_action_return_finance boolean NOT NULL DEFAULT true;

-- ── 2. pre_fund_reconciliations — extend surplus_action constraint ────────────
-- The existing constraint only allows carry_forward|return|split|reserve.
-- The UI also exposes return_bank and return_finance as distinct variants.
DO $$
BEGIN
  -- Drop existing check constraint (name may vary across environments)
  DECLARE
    v_constraint text;
  BEGIN
    SELECT conname INTO v_constraint
    FROM   pg_constraint c
    JOIN   pg_class r ON r.oid = c.conrelid
    WHERE  r.relname = 'pre_fund_reconciliations'
      AND  c.contype = 'c'
      AND  pg_get_constraintdef(c.oid) ILIKE '%surplus_action%'
    LIMIT 1;

    IF v_constraint IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.pre_fund_reconciliations DROP CONSTRAINT %I', v_constraint);
    END IF;
  END;
END
$$;

ALTER TABLE IF EXISTS public.pre_fund_reconciliations
  ADD CONSTRAINT IF NOT EXISTS pre_fund_reconciliations_surplus_action_check
  CHECK (surplus_action IN (
    'carry_forward', 'return', 'return_bank', 'return_finance', 'split', 'reserve'
  ));

-- ── 3. pre_fund_transactions — extend transaction_type constraint ─────────────
-- The existing constraint does not include 'bank_statement', which is used
-- by the CSV bank-statement import feature as a reference-only entry type.
DO $$
BEGIN
  DECLARE
    v_constraint text;
  BEGIN
    SELECT conname INTO v_constraint
    FROM   pg_constraint c
    JOIN   pg_class r ON r.oid = c.conrelid
    WHERE  r.relname = 'pre_fund_transactions'
      AND  c.contype = 'c'
      AND  pg_get_constraintdef(c.oid) ILIKE '%transaction_type%'
    LIMIT 1;

    IF v_constraint IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.pre_fund_transactions DROP CONSTRAINT %I', v_constraint);
    END IF;
  END;
END
$$;

ALTER TABLE IF EXISTS public.pre_fund_transactions
  ADD CONSTRAINT IF NOT EXISTS pre_fund_transactions_transaction_type_check
  CHECK (transaction_type IN (
    'receipt', 'commitment', 'payment', 'reversal',
    'carry_forward', 'return', 'adjustment', 'bank_statement'
  ));

-- Note: bank_statement entries are reference-only (reconciliation helpers).
-- They do NOT affect available_balance / paid_amount and are excluded from
-- accounting totals via the UI filter (accountingTxns excludes bank_statement).
