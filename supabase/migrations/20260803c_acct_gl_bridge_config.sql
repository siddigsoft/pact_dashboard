-- =============================================================================
-- Migration: GL Bridge Account Code Configuration
-- Date: 2026-08-03
-- Purpose: Replace hardcoded account codes in bridge RPCs with a config table
--          so Finance can map each bridge event to the correct debit/credit
--          accounts from the Chart of Accounts via the UI.
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE throughout
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CONFIG TABLE
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.acct_gl_bridge_config (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_event      text        NOT NULL UNIQUE,   -- e.g. 'pre_fund_disbursement'
  event_label       text        NOT NULL,           -- human-readable label for the UI
  event_description text,                           -- tooltip / help text
  debit_account_id  uuid        REFERENCES public.acct_accounts(id) ON DELETE SET NULL,
  credit_account_id uuid        REFERENCES public.acct_accounts(id) ON DELETE SET NULL,
  is_active         boolean     NOT NULL DEFAULT true,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.acct_gl_bridge_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance roles can manage GL bridge config"
  ON public.acct_gl_bridge_config
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin','Admin','admin','finance','financialAdmin','accountant')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. DEFAULT ROWS (one per bridge event; account IDs start NULL)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.acct_gl_bridge_config (source_event, event_label, event_description)
VALUES
  ('pre_fund_disbursement', 'Pre-Fund Disbursement',
   'Posted when a pre-funding transaction is disbursed. DR = Disbursement Expense, CR = Pre-Fund Cash/Bank.'),

  ('payroll_run', 'Payroll Run',
   'Posted when a payroll run is finalised. DR = Salary Expense, CR = Salaries Payable.'),

  ('eosb_accrual', 'EOSB Accrual',
   'Posted for end-of-service benefit accruals. DR = EOSB Expense, CR = EOSB Provision.'),

  ('manual_advance', 'Manual Staff Advance',
   'Posted when a salary advance is paid. DR = Staff Advances (asset), CR = Cash/Bank.'),

  ('advance_recovery', 'Advance Recovery',
   'Posted when a salary advance is recovered via payroll deduction. DR = Cash/Bank, CR = Staff Advances.'),

  ('asset_depreciation', 'Asset Depreciation',
   'Posted when a periodic depreciation run is processed. DR = Depreciation Expense, CR = Accumulated Depreciation.'),

  ('asset_disposal_gain', 'Asset Disposal — Gain',
   'Posted when an asset is disposed of at above net book value. DR = Accumulated Depreciation + Cash, CR = Asset at Cost + Gain on Disposal.'),

  ('asset_disposal_loss', 'Asset Disposal — Loss',
   'Posted when an asset is disposed of at below net book value. DR = Accumulated Depreciation + Loss on Disposal, CR = Asset at Cost.'),

  ('leave_liability', 'Leave Liability Accrual',
   'Posted when leave is approved; accrues the liability. DR = Leave Expense, CR = Leave Payable.'),

  ('budget_encumbrance', 'Budget Encumbrance (PO)',
   'Posted when a purchase order is raised to encumber budget. DR = Encumbrance Expense, CR = Encumbrance Payable.')

ON CONFLICT (source_event) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. HELPER FUNCTION — look up a bridge config account
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.gl_bridge_account(
  p_source_event text,
  p_side         text   -- 'debit' or 'credit'
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT CASE p_side
    WHEN 'debit'  THEN debit_account_id
    WHEN 'credit' THEN credit_account_id
  END
  FROM public.acct_gl_bridge_config
  WHERE source_event = p_source_event
    AND is_active = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.gl_bridge_account(text, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. UPDATED RPC — post_prefunding_to_gl (reads config instead of hardcoded codes)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.post_prefunding_to_gl()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_posted   int := 0;
  v_skipped  int := 0;
  v_errors   int := 0;
  v_txn      RECORD;
  v_period   RECORD;
  v_entry_id uuid;
  v_cash_acct  uuid;
  v_exp_acct   uuid;
  v_err_msg  text;
BEGIN
  -- Resolve account IDs from config table (not hardcoded any more)
  v_exp_acct  := public.gl_bridge_account('pre_fund_disbursement', 'debit');
  v_cash_acct := public.gl_bridge_account('pre_fund_disbursement', 'credit');

  FOR v_txn IN
    SELECT pft.*
    FROM   public.pre_fund_transactions pft
    WHERE  NOT EXISTS (
      SELECT 1 FROM public.acct_gl_bridge_log l
      WHERE  l.source_table = 'pre_fund_transactions'
        AND  l.source_id    = pft.id::text
        AND  l.status       = 'success'
    )
    ORDER BY pft.created_at
  LOOP
    BEGIN
      -- Find open period covering this transaction
      SELECT fp.id INTO v_period
      FROM   public.acct_fiscal_periods fp
      JOIN   public.acct_fiscal_years   fy ON fy.id = fp.fiscal_year_id
      WHERE  fp.status  = 'open'
        AND  fp.start_date <= v_txn.created_at::date
        AND  fp.end_date   >= v_txn.created_at::date
      LIMIT 1;

      IF v_period IS NULL THEN
        INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,error_message)
        VALUES('pre_fund_transactions', v_txn.id::text, 'disbursement', 'skipped',
               'No open period found for date ' || v_txn.created_at::date);
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      IF v_cash_acct IS NULL OR v_exp_acct IS NULL THEN
        INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,error_message)
        VALUES('pre_fund_transactions', v_txn.id::text, 'disbursement', 'skipped',
               'GL accounts not configured — set debit/credit for "pre_fund_disbursement" in GL Bridge Settings');
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      INSERT INTO public.acct_journal_entries(
        period_id, posting_date, description_en, source_type, source_id,
        status, posted_at, idempotency_key
      ) VALUES(
        v_period.id,
        v_txn.created_at::date,
        'Pre-Fund Disbursement: ' || COALESCE(v_txn.description, v_txn.id::text),
        'prefunding',
        v_txn.id::text,
        'posted',
        now(),
        'pf_' || v_txn.id::text
      )
      RETURNING id INTO v_entry_id;

      INSERT INTO public.acct_journal_lines(
        entry_id, line_no, account_id, debit_credit,
        functional_amount, original_amount, original_currency, functional_currency, fx_rate, description
      ) VALUES
        (v_entry_id, 1, v_exp_acct,  'DR', v_txn.amount, v_txn.amount,
         COALESCE(v_txn.currency,'SDG'), 'SDG', 1, 'Pre-fund disbursement'),
        (v_entry_id, 2, v_cash_acct, 'CR', v_txn.amount, v_txn.amount,
         COALESCE(v_txn.currency,'SDG'), 'SDG', 1, 'Pre-fund cash reduction');

      INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,journal_entry_id)
      VALUES('pre_fund_transactions', v_txn.id::text, 'disbursement', 'success', v_entry_id);
      v_posted := v_posted + 1;

    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT;
      INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,error_message)
      VALUES('pre_fund_transactions', v_txn.id::text, 'disbursement', 'error', v_err_msg);
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('posted', v_posted, 'skipped', v_skipped, 'errors', v_errors);
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_prefunding_to_gl() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. UPDATED RPC — post_payroll_to_gl
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.post_payroll_to_gl()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_posted  int := 0;
  v_skipped int := 0;
  v_errors  int := 0;
  v_run     RECORD;
  v_period  RECORD;
  v_entry_id uuid;
  v_sal_acct  uuid;
  v_pay_acct  uuid;
  v_err_msg   text;
BEGIN
  v_sal_acct := public.gl_bridge_account('payroll_run', 'debit');
  v_pay_acct := public.gl_bridge_account('payroll_run', 'credit');

  FOR v_run IN
    SELECT pr.*
    FROM   public.payroll_runs pr
    WHERE  pr.status = 'completed'
      AND  NOT EXISTS (
        SELECT 1 FROM public.acct_gl_bridge_log l
        WHERE  l.source_table = 'payroll_runs'
          AND  l.source_id    = pr.id::text
          AND  l.status       = 'success'
      )
    ORDER BY pr.created_at
  LOOP
    BEGIN
      SELECT fp.id INTO v_period
      FROM   public.acct_fiscal_periods fp
      WHERE  fp.status = 'open'
        AND  fp.start_date <= COALESCE(v_run.processed_at, v_run.created_at)::date
        AND  fp.end_date   >= COALESCE(v_run.processed_at, v_run.created_at)::date
      LIMIT 1;

      IF v_period IS NULL THEN
        INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,error_message)
        VALUES('payroll_runs', v_run.id::text, 'payroll_cost', 'skipped', 'No open period');
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      IF v_sal_acct IS NULL OR v_pay_acct IS NULL THEN
        INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,error_message)
        VALUES('payroll_runs', v_run.id::text, 'payroll_cost', 'skipped',
               'GL accounts not configured — set debit/credit for "payroll_run" in GL Bridge Settings');
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      INSERT INTO public.acct_journal_entries(
        period_id, posting_date, description_en, source_type, source_id,
        status, posted_at, idempotency_key
      ) VALUES(
        v_period.id,
        COALESCE(v_run.processed_at, v_run.created_at)::date,
        'Payroll Run: ' || COALESCE(v_run.period_label, v_run.id::text),
        'payroll',
        v_run.id::text,
        'posted',
        now(),
        'pr_' || v_run.id::text
      )
      RETURNING id INTO v_entry_id;

      INSERT INTO public.acct_journal_lines(
        entry_id, line_no, account_id, debit_credit,
        functional_amount, original_amount, original_currency, functional_currency, fx_rate, description
      ) VALUES
        (v_entry_id, 1, v_sal_acct, 'DR', v_run.total_amount, v_run.total_amount,
         COALESCE(v_run.currency,'SDG'), 'SDG', 1,
         'Salary expense — ' || COALESCE(v_run.period_label,'')),
        (v_entry_id, 2, v_pay_acct, 'CR', v_run.total_amount, v_run.total_amount,
         COALESCE(v_run.currency,'SDG'), 'SDG', 1,
         'Net pay accrual — ' || COALESCE(v_run.period_label,''));

      INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,journal_entry_id)
      VALUES('payroll_runs', v_run.id::text, 'payroll_cost', 'success', v_entry_id);
      v_posted := v_posted + 1;

    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT;
      INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,error_message)
      VALUES('payroll_runs', v_run.id::text, 'payroll_cost', 'error', v_err_msg);
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('posted', v_posted, 'skipped', v_skipped, 'errors', v_errors);
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_payroll_to_gl() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. UPDATED RPC — post_eosb_to_gl
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.post_eosb_to_gl()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_posted  int := 0;
  v_errors  int := 0;
  v_row     RECORD;
  v_period  RECORD;
  v_entry_id uuid;
  v_exp_acct  uuid;
  v_prov_acct uuid;
  v_err_msg   text;
BEGIN
  v_exp_acct  := public.gl_bridge_account('eosb_accrual', 'debit');
  v_prov_acct := public.gl_bridge_account('eosb_accrual', 'credit');

  FOR v_row IN
    SELECT ea.*
    FROM   public.eosb_accrual ea
    WHERE  NOT EXISTS (
      SELECT 1 FROM public.acct_gl_bridge_log l
      WHERE  l.source_table = 'eosb_accrual'
        AND  l.source_id    = ea.id::text
        AND  l.status       = 'success'
    )
    ORDER BY ea.created_at
  LOOP
    BEGIN
      SELECT fp.id INTO v_period
      FROM   public.acct_fiscal_periods fp
      WHERE  fp.status = 'open'
      ORDER  BY fp.start_date DESC LIMIT 1;

      IF v_period IS NULL OR v_exp_acct IS NULL OR v_prov_acct IS NULL THEN
        INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,error_message)
        VALUES('eosb_accrual', v_row.id::text, 'accrual', 'skipped',
               CASE
                 WHEN v_period IS NULL THEN 'No open period'
                 ELSE 'GL accounts not configured — set debit/credit for "eosb_accrual" in GL Bridge Settings'
               END);
        v_errors := v_errors + 1;
        CONTINUE;
      END IF;

      INSERT INTO public.acct_journal_entries(
        period_id, posting_date, description_en, source_type, source_id,
        status, posted_at, idempotency_key
      ) VALUES(
        v_period.id, now()::date,
        'EOSB Accrual: ' || v_row.period,
        'eosb_accrual', v_row.id::text, 'posted', now(),
        'eosb_' || v_row.id::text
      )
      RETURNING id INTO v_entry_id;

      INSERT INTO public.acct_journal_lines(
        entry_id, line_no, account_id, debit_credit,
        functional_amount, original_amount, original_currency, functional_currency, fx_rate, description
      ) VALUES
        (v_entry_id, 1, v_exp_acct,  'DR', v_row.accrued_amount, v_row.accrued_amount,
         COALESCE(v_row.currency,'SDG'), 'SDG', 1, 'EOSB accrual expense'),
        (v_entry_id, 2, v_prov_acct, 'CR', v_row.accrued_amount, v_row.accrued_amount,
         COALESCE(v_row.currency,'SDG'), 'SDG', 1, 'EOSB provision increase');

      INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,journal_entry_id)
      VALUES('eosb_accrual', v_row.id::text, 'accrual', 'success', v_entry_id);
      v_posted := v_posted + 1;

    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT;
      INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,error_message)
      VALUES('eosb_accrual', v_row.id::text, 'accrual', 'error', v_err_msg);
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('posted', v_posted, 'errors', v_errors);
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_eosb_to_gl() TO authenticated;

COMMIT;

-- =============================================================================
-- AFTER RUNNING THIS MIGRATION
-- =============================================================================
-- Open Accounting → Financial Operations → GL Bridge Settings and use the
-- account pickers to assign a debit + credit account to each bridge event.
--
-- Verify the table exists:
--   SELECT source_event, event_label, debit_account_id, credit_account_id
--   FROM   acct_gl_bridge_config ORDER BY source_event;
-- =============================================================================
