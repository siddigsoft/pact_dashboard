-- Pre-Fund Schema Alignment
-- Adds columns missing from pre_fund_settings and relaxes constraints
-- to match the UI options in PreFundingSettings.tsx and PreFundingReconciliation.tsx.

-- ── 1. pre_fund_settings — add missing reconciliation action toggle columns ──
ALTER TABLE IF EXISTS public.pre_fund_settings
  ADD COLUMN IF NOT EXISTS reconciliation_action_return_bank    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reconciliation_action_return_finance boolean NOT NULL DEFAULT true;

-- ── 2. pre_fund_reconciliations — extend surplus_action constraint ────────────
-- DROP the existing constraint (unknown name), then re-add with extended values.
DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT conname INTO v_constraint
  FROM   pg_constraint c
  JOIN   pg_class r ON r.oid = c.conrelid
  WHERE  r.relname = 'pre_fund_reconciliations'
    AND  r.relnamespace = 'public'::regnamespace
    AND  c.contype = 'c'
    AND  pg_get_constraintdef(c.oid) ILIKE '%surplus_action%'
  LIMIT 1;

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.pre_fund_reconciliations DROP CONSTRAINT %I', v_constraint);
  END IF;

  -- Only add if it still doesn't exist (idempotent re-run safety)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    WHERE r.relname = 'pre_fund_reconciliations'
      AND r.relnamespace = 'public'::regnamespace
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%surplus_action%'
  ) THEN
    ALTER TABLE public.pre_fund_reconciliations
      ADD CONSTRAINT pre_fund_reconciliations_surplus_action_check
      CHECK (surplus_action IN (
        'carry_forward', 'return', 'return_bank', 'return_finance', 'split', 'reserve'
      ));
  END IF;
END
$$;

-- ── 3. pre_fund_transactions — extend transaction_type constraint ─────────────
-- 'bank_statement' is used by the CSV bank-statement import as a reference-only
-- entry type (excluded from accounting totals in the UI).
DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT conname INTO v_constraint
  FROM   pg_constraint c
  JOIN   pg_class r ON r.oid = c.conrelid
  WHERE  r.relname = 'pre_fund_transactions'
    AND  r.relnamespace = 'public'::regnamespace
    AND  c.contype = 'c'
    AND  pg_get_constraintdef(c.oid) ILIKE '%transaction_type%'
  LIMIT 1;

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.pre_fund_transactions DROP CONSTRAINT %I', v_constraint);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    WHERE r.relname = 'pre_fund_transactions'
      AND r.relnamespace = 'public'::regnamespace
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%transaction_type%'
  ) THEN
    ALTER TABLE public.pre_fund_transactions
      ADD CONSTRAINT pre_fund_transactions_transaction_type_check
      CHECK (transaction_type IN (
        'receipt', 'commitment', 'payment', 'reversal',
        'carry_forward', 'return', 'adjustment', 'bank_statement'
      ));
  END IF;
END
$$;
