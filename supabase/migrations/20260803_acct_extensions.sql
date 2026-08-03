-- =============================================================================
-- Migration: Accounting Extensions — Opening Balances, Annual Budgets,
--            Unified Asset Master, Bank Statement Import, GL Bridge RPCs
-- Date: 2026-08-03
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run: all CREATE TABLE use IF NOT EXISTS; all RPCs use CREATE OR REPLACE
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. OPENING BALANCES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.acct_opening_balances (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year_id    uuid        NOT NULL REFERENCES public.acct_fiscal_years(id) ON DELETE RESTRICT,
  account_id        uuid        NOT NULL REFERENCES public.acct_accounts(id)     ON DELETE RESTRICT,
  debit_amount      numeric(20,4) NOT NULL DEFAULT 0,
  credit_amount     numeric(20,4) NOT NULL DEFAULT 0,
  notes             text,
  journal_entry_id  uuid        REFERENCES public.acct_journal_entries(id) ON DELETE SET NULL,
  posted_by         uuid        REFERENCES public.profiles(id)              ON DELETE SET NULL,
  posted_at         timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_ob_year_account UNIQUE (fiscal_year_id, account_id)
);

ALTER TABLE public.acct_opening_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance roles can manage opening balances"
  ON public.acct_opening_balances
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin','Admin','admin','finance','financialAdmin','accountant')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ANNUAL BUDGETS (org-wide)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.acct_annual_budgets (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year_id    uuid        NOT NULL REFERENCES public.acct_fiscal_years(id) ON DELETE RESTRICT,
  fiscal_year_code  text        NOT NULL,
  total_amount      numeric(20,4) NOT NULL DEFAULT 0,
  currency          text        NOT NULL DEFAULT 'SDG',
  status            text        NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','submitted','approved','active','closed','exceeded')),
  notes             text,
  approved_by       uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid        REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.acct_annual_budget_lines (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id         uuid        NOT NULL REFERENCES public.acct_annual_budgets(id) ON DELETE CASCADE,
  hub               text,
  donor             text,
  fund_id           uuid        REFERENCES public.acct_funds(id) ON DELETE SET NULL,
  account_code      text,
  category          text        NOT NULL,
  allocated_amount  numeric(20,4) NOT NULL DEFAULT 0,
  spent_amount      numeric(20,4) NOT NULL DEFAULT 0,
  currency          text        NOT NULL DEFAULT 'SDG',
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.acct_annual_budgets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acct_annual_budget_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance can manage annual budgets"
  ON public.acct_annual_budgets FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','Admin','admin','finance','financialAdmin','accountant','auditor')));

CREATE POLICY "Finance can manage budget lines"
  ON public.acct_annual_budget_lines FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','Admin','admin','finance','financialAdmin','accountant','auditor')));

-- Budget version snapshots (for version control)
CREATE TABLE IF NOT EXISTS public.acct_budget_versions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id   uuid        NOT NULL REFERENCES public.acct_annual_budgets(id) ON DELETE CASCADE,
  version_no  int         NOT NULL,
  snapshot    jsonb       NOT NULL,  -- JSON array of budget lines at this version
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (budget_id, version_no)
);

ALTER TABLE public.acct_budget_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance can view budget versions"
  ON public.acct_budget_versions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','Admin','admin','finance','financialAdmin','accountant','auditor')));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. UNIFIED ASSET MASTER
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.unified_assets (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_code               text        NOT NULL UNIQUE,
  name                     text        NOT NULL,
  asset_type               text        NOT NULL CHECK (asset_type IN ('hr','field_equipment','fixed_asset')),
  category                 text        NOT NULL,
  serial_number            text,
  model                    text,
  purchase_date            date,
  purchase_value           numeric(20,4),
  currency                 text        NOT NULL DEFAULT 'SDG',
  useful_life_years        int,
  depreciation_method      text        CHECK (depreciation_method IN ('straight_line','declining_balance','units_of_production','sum_of_years')),
  accumulated_depreciation numeric(20,4) NOT NULL DEFAULT 0,
  status                   text        NOT NULL DEFAULT 'available'
                           CHECK (status IN ('available','assigned','maintenance','retired','lost','disposed')),
  condition                text        CHECK (condition IN ('excellent','good','fair','poor','beyond_repair')),
  hub                      text,
  location                 text,
  custodian_name           text,
  assigned_to_id           uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  warranty_expiry          date,
  insurance_policy         text,
  notes                    text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  created_by               uuid        REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_unified_assets_type   ON public.unified_assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_unified_assets_hub    ON public.unified_assets(hub);
CREATE INDEX IF NOT EXISTS idx_unified_assets_status ON public.unified_assets(status);

ALTER TABLE public.unified_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view assets"
  ON public.unified_assets FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "Asset managers can create/update"
  ON public.unified_assets FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','Admin','admin','finance','financialAdmin','hr_admin','ICT','ict')));

-- Immutable assignment log
CREATE TABLE IF NOT EXISTS public.asset_assignment_logs (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id                  uuid        NOT NULL REFERENCES public.unified_assets(id) ON DELETE CASCADE,
  assigned_to_id            uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_to_name          text,
  assigned_by_id            uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_date             date        NOT NULL,
  returned_date             date,
  condition_on_assignment   text,
  condition_on_return       text,
  notes                     text,
  created_at                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.asset_assignment_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view assignment logs"
  ON public.asset_assignment_logs FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Asset managers can insert assignment logs"
  ON public.asset_assignment_logs FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','Admin','admin','hr_admin','ICT','ict','finance','financialAdmin')));

-- Disposal records
CREATE TABLE IF NOT EXISTS public.asset_disposals (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id         uuid        NOT NULL REFERENCES public.unified_assets(id) ON DELETE RESTRICT,
  disposal_type    text        NOT NULL CHECK (disposal_type IN ('sale','write_off','donation','loss','stolen','destroyed')),
  disposal_date    date        NOT NULL,
  proceeds         numeric(20,4) NOT NULL DEFAULT 0,
  currency         text        NOT NULL DEFAULT 'SDG',
  reason           text        NOT NULL,
  approved_by      uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  journal_entry_id uuid        REFERENCES public.acct_journal_entries(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid        REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.asset_disposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance can manage disposals"
  ON public.asset_disposals FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','Admin','admin','finance','financialAdmin')));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. BANK STATEMENT IMPORT
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bank_statements (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       uuid        NOT NULL REFERENCES public.acct_accounts(id) ON DELETE RESTRICT,
  statement_date   date        NOT NULL,
  opening_balance  numeric(20,4) NOT NULL DEFAULT 0,
  closing_balance  numeric(20,4) NOT NULL DEFAULT 0,
  currency         text        NOT NULL DEFAULT 'SDG',
  status           text        NOT NULL DEFAULT 'in_progress'
                   CHECK (status IN ('in_progress','cleared')),
  imported_at      timestamptz NOT NULL DEFAULT now(),
  imported_by      uuid        REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.bank_statement_lines (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id            uuid        NOT NULL REFERENCES public.bank_statements(id) ON DELETE CASCADE,
  transaction_date        date        NOT NULL,
  description             text,
  debit                   numeric(20,4) NOT NULL DEFAULT 0,
  credit                  numeric(20,4) NOT NULL DEFAULT 0,
  reference               text,
  status                  text        NOT NULL DEFAULT 'unmatched'
                          CHECK (status IN ('unmatched','matched','adjusted','cleared')),
  matched_journal_line_id uuid        REFERENCES public.acct_journal_lines(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bsl_statement ON public.bank_statement_lines(statement_id);
CREATE INDEX IF NOT EXISTS idx_bsl_status    ON public.bank_statement_lines(status);

ALTER TABLE public.bank_statements      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_statement_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance can manage bank statements"
  ON public.bank_statements FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','Admin','admin','finance','financialAdmin','accountant')));
CREATE POLICY "Finance can manage statement lines"
  ON public.bank_statement_lines FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','Admin','admin','finance','financialAdmin','accountant')));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. GL BRIDGE — Pre-Funding RPC
-- ─────────────────────────────────────────────────────────────────────────────
-- This function posts pre_fund_transactions that are not yet in acct_gl_bridge_log
-- (status=success) as journal entries.
-- 
-- IMPORTANT: Update the account IDs below to match YOUR chart of accounts:
--   p_cash_account    = your pre-funding cash/bank account code
--   p_expense_account = your pre-funding disbursement expense account code
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
  -- Resolve account IDs by code (update codes to match your COA)
  SELECT id INTO v_cash_acct FROM public.acct_accounts WHERE code = '1020' LIMIT 1;  -- Cash / Pre-fund holding
  SELECT id INTO v_exp_acct  FROM public.acct_accounts WHERE code = '6100' LIMIT 1;  -- Disbursement expense

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
        VALUES('pre_fund_transactions', v_txn.id::text, 'disbursement', 'skipped', 'No open period found for date ' || v_txn.created_at::date);
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      IF v_cash_acct IS NULL OR v_exp_acct IS NULL THEN
        INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,error_message)
        VALUES('pre_fund_transactions', v_txn.id::text, 'disbursement', 'skipped', 'GL accounts not configured (codes 1020/6100 not found)');
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      -- Create journal entry
      INSERT INTO public.acct_journal_entries(period_id, posting_date, description_en, source_type, source_id, status, posted_at, idempotency_key)
      VALUES(
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

      -- DR Expense / CR Cash
      INSERT INTO public.acct_journal_lines(entry_id, line_no, account_id, debit_credit, functional_amount, original_amount, original_currency, functional_currency, fx_rate, description)
      VALUES
        (v_entry_id, 1, v_exp_acct,  'DR', v_txn.amount, v_txn.amount, COALESCE(v_txn.currency,'SDG'), 'SDG', 1, 'Pre-fund disbursement'),
        (v_entry_id, 2, v_cash_acct, 'CR', v_txn.amount, v_txn.amount, COALESCE(v_txn.currency,'SDG'), 'SDG', 1, 'Pre-fund cash reduction');

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
-- 6. GL BRIDGE — Payroll RPC
-- ─────────────────────────────────────────────────────────────────────────────
-- Posts completed payroll_runs to the GL.
-- Update account codes to match your COA:
--   7000 = Salary Expense
--   2100 = Salaries Payable
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
  SELECT id INTO v_sal_acct FROM public.acct_accounts WHERE code = '7000' LIMIT 1;  -- Salary expense
  SELECT id INTO v_pay_acct FROM public.acct_accounts WHERE code = '2100' LIMIT 1;  -- Salaries payable

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
        VALUES('payroll_runs', v_run.id::text, 'payroll_cost', 'skipped', 'GL accounts 7000/2100 not found');
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      INSERT INTO public.acct_journal_entries(period_id, posting_date, description_en, source_type, source_id, status, posted_at, idempotency_key)
      VALUES(
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

      INSERT INTO public.acct_journal_lines(entry_id, line_no, account_id, debit_credit, functional_amount, original_amount, original_currency, functional_currency, fx_rate, description)
      VALUES
        (v_entry_id, 1, v_sal_acct, 'DR', v_run.total_amount, v_run.total_amount, COALESCE(v_run.currency,'SDG'), 'SDG', 1, 'Salary expense — ' || COALESCE(v_run.period_label,'')),
        (v_entry_id, 2, v_pay_acct, 'CR', v_run.total_amount, v_run.total_amount, COALESCE(v_run.currency,'SDG'), 'SDG', 1, 'Net pay accrual — ' || COALESCE(v_run.period_label,''));

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
-- 7. GL BRIDGE — EOSB Accrual RPC
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
  SELECT id INTO v_exp_acct  FROM public.acct_accounts WHERE code = '7100' LIMIT 1;  -- EOSB expense
  SELECT id INTO v_prov_acct FROM public.acct_accounts WHERE code = '2200' LIMIT 1;  -- EOSB provision

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
        v_errors := v_errors + 1;
        CONTINUE;
      END IF;

      INSERT INTO public.acct_journal_entries(period_id, posting_date, description_en, source_type, source_id, status, posted_at, idempotency_key)
      VALUES(v_period.id, now()::date, 'EOSB Accrual: ' || v_row.period, 'eosb_accrual', v_row.id::text, 'posted', now(), 'eosb_' || v_row.id::text)
      RETURNING id INTO v_entry_id;

      INSERT INTO public.acct_journal_lines(entry_id, line_no, account_id, debit_credit, functional_amount, original_amount, original_currency, functional_currency, fx_rate, description)
      VALUES
        (v_entry_id, 1, v_exp_acct,  'DR', v_row.accrued_amount, v_row.accrued_amount, COALESCE(v_row.currency,'SDG'), 'SDG', 1, 'EOSB accrual expense'),
        (v_entry_id, 2, v_prov_acct, 'CR', v_row.accrued_amount, v_row.accrued_amount, COALESCE(v_row.currency,'SDG'), 'SDG', 1, 'EOSB provision increase');

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
-- 1. Update the GL Bridge account codes in the RPCs to match your chart of accounts:
--      post_prefunding_to_gl : codes '1020' (cash) and '6100' (disbursement expense)
--      post_payroll_to_gl    : codes '7000' (salary expense) and '2100' (salaries payable)
--      post_eosb_to_gl       : codes '7100' (EOSB expense) and '2200' (EOSB provision)
--    Run: SELECT code, name_en FROM acct_accounts ORDER BY code;
--    to see your actual account codes.
--
-- 2. Verify tables were created:
--    SELECT table_name FROM information_schema.tables
--    WHERE table_schema = 'public'
--      AND table_name IN ('acct_opening_balances','acct_annual_budgets','acct_annual_budget_lines',
--                         'acct_budget_versions','unified_assets','asset_assignment_logs',
--                         'asset_disposals','bank_statements','bank_statement_lines');
-- =============================================================================
