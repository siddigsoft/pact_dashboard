-- =============================================================================
-- Migration: Bridge RPCs — draft-then-post ordering fix
-- Date: 2026-08-03
-- Purpose: All GL bridge RPCs previously inserted journal entries directly as
--          'posted' and then inserted lines.  With the new INSERT guard trigger
--          (20260803e), line inserts into 'posted' entries are blocked.
--          This migration patches every bridge RPC to use:
--            INSERT entry (status='draft') → INSERT lines → UPDATE to 'posted'
--
-- Covered functions:
--   • post_prefunding_to_gl
--   • post_payroll_to_gl
--   • post_eosb_to_gl
--   • post_asset_depreciation_to_gl
--
-- Safe to re-run: all are CREATE OR REPLACE.
-- Must run AFTER 20260803e (which installs the triggers and fixes acct_post_journal).
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. post_prefunding_to_gl
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.post_prefunding_to_gl()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_posted  int := 0;
  v_skipped int := 0;
  v_errors  int := 0;
  v_txn     RECORD;
  v_period  RECORD;
  v_entry_id uuid;
  v_exp_acct  uuid;
  v_cash_acct uuid;
  v_err_msg   text;
BEGIN
  -- Role check
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin','Admin','admin','finance','financialAdmin','accountant')
  ) THEN
    RETURN jsonb_build_object('error','Access denied: Finance or Admin role required.');
  END IF;

  -- Look up GL accounts from bridge config
  v_exp_acct  := public.gl_bridge_account('pre_fund_disbursement', 'debit');
  v_cash_acct := public.gl_bridge_account('pre_fund_disbursement', 'credit');

  FOR v_txn IN
    SELECT pft.*
    FROM   public.pre_fund_transactions pft
    WHERE  pft.status IN ('approved','disbursed','paid')
      AND  NOT EXISTS (
        SELECT 1 FROM public.acct_gl_bridge_log l
        WHERE  l.source_table = 'pre_fund_transactions'
          AND  l.source_id    = pft.id::text
          AND  l.status       = 'success'
      )
    ORDER BY pft.created_at
  LOOP
    BEGIN
      SELECT fp.* INTO v_period
      FROM   public.acct_fiscal_periods fp
      WHERE  fp.status = 'open'
        AND  fp.start_date <= v_txn.created_at::date
        AND  fp.end_date   >= v_txn.created_at::date
      LIMIT 1;

      IF v_period IS NULL THEN
        INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,error_message)
        VALUES('pre_fund_transactions', v_txn.id::text, 'disbursement', 'skipped', 'No open fiscal period for transaction date');
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      IF v_exp_acct IS NULL OR v_cash_acct IS NULL THEN
        INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,error_message)
        VALUES('pre_fund_transactions', v_txn.id::text, 'disbursement', 'skipped',
               'GL accounts not configured — set debit/credit for "pre_fund_disbursement" in GL Bridge Settings');
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      -- Insert entry as DRAFT, then lines, then transition to POSTED
      INSERT INTO public.acct_journal_entries(
        period_id, posting_date, description_en, source_type, source_id,
        status, idempotency_key
      ) VALUES(
        v_period.id,
        v_txn.created_at::date,
        'Pre-Fund Disbursement: ' || COALESCE(v_txn.description, v_txn.id::text),
        'prefunding',
        v_txn.id::text,
        'draft',
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

      -- Transition to posted — triggers DEFERRED balance check at COMMIT
      UPDATE public.acct_journal_entries
         SET status = 'posted', posted_at = now()
       WHERE id = v_entry_id;

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
-- 2. post_payroll_to_gl
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
  -- Role check
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin','Admin','admin','finance','financialAdmin','accountant')
  ) THEN
    RETURN jsonb_build_object('error','Access denied: Finance or Admin role required.');
  END IF;

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
      SELECT fp.* INTO v_period
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

      -- Insert entry as DRAFT, then lines, then transition to POSTED
      INSERT INTO public.acct_journal_entries(
        period_id, posting_date, description_en, source_type, source_id,
        status, idempotency_key
      ) VALUES(
        v_period.id,
        COALESCE(v_run.processed_at, v_run.created_at)::date,
        'Payroll Run: ' || COALESCE(v_run.period_label, v_run.id::text),
        'payroll',
        v_run.id::text,
        'draft',
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

      -- Transition to posted
      UPDATE public.acct_journal_entries
         SET status = 'posted', posted_at = now()
       WHERE id = v_entry_id;

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
-- 3. post_eosb_to_gl
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
  -- Role check
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin','Admin','admin','finance','financialAdmin','accountant')
  ) THEN
    RETURN jsonb_build_object('error','Access denied: Finance or Admin role required.');
  END IF;

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
      SELECT fp.* INTO v_period
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

      -- Insert entry as DRAFT, then lines, then transition to POSTED
      INSERT INTO public.acct_journal_entries(
        period_id, posting_date, description_en, source_type, source_id,
        status, idempotency_key
      ) VALUES(
        v_period.id, now()::date,
        'EOSB Accrual: ' || v_row.period,
        'eosb_accrual', v_row.id::text,
        'draft',
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

      -- Transition to posted
      UPDATE public.acct_journal_entries
         SET status = 'posted', posted_at = now()
       WHERE id = v_entry_id;

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

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. post_asset_depreciation_to_gl
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.post_asset_depreciation_to_gl(
  p_fiscal_period_id  uuid,
  p_periods_per_year  int  DEFAULT 12
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_posted   int  := 0;
  v_skipped  int  := 0;
  v_errors   int  := 0;
  v_total    numeric(20,4) := 0;

  v_asset         RECORD;
  v_period        RECORD;
  v_entry_id      uuid;
  v_run_id        uuid;
  v_err_msg       text;

  v_nbv           numeric(20,4);
  v_period_charge numeric(20,4);
  v_rate          numeric(8,6);
  v_dep_acct      uuid;
  v_acc_acct      uuid;

  v_idem_key      text;
BEGIN
  -- Server-side authorisation
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id   = auth.uid()
      AND role IN ('super_admin','Admin','admin','finance','financialAdmin','accountant')
  ) THEN
    RETURN jsonb_build_object(
      'error', 'Access denied: Finance or Admin role required to post depreciation.'
    );
  END IF;

  -- Input validation
  IF p_periods_per_year IS NULL OR p_periods_per_year NOT IN (1, 4, 12) THEN
    RETURN jsonb_build_object(
      'error', 'Invalid p_periods_per_year: must be 1 (annual), 4 (quarterly), or 12 (monthly).'
    );
  END IF;

  IF p_fiscal_period_id IS NULL THEN
    RETURN jsonb_build_object('error', 'p_fiscal_period_id is required.');
  END IF;

  -- Validate period
  SELECT fp.*, fy.fiscal_year_code
  INTO   v_period
  FROM   public.acct_fiscal_periods fp
  JOIN   public.acct_fiscal_years   fy ON fy.id = fp.fiscal_year_id
  WHERE  fp.id = p_fiscal_period_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Fiscal period not found');
  END IF;

  -- Fallback accounts from bridge config
  v_dep_acct := public.gl_bridge_account('asset_depreciation', 'debit');
  v_acc_acct := public.gl_bridge_account('asset_depreciation', 'credit');

  FOR v_asset IN
    SELECT *
    FROM   public.unified_assets ua
    WHERE  ua.status IN ('available', 'assigned', 'maintenance')
      AND  ua.purchase_value    IS NOT NULL
      AND  ua.purchase_value    > 0
      AND  ua.useful_life_years IS NOT NULL
      AND  ua.useful_life_years > 0
      AND  ua.depreciation_method IS NOT NULL
  LOOP
    BEGIN
      v_idem_key := 'dep_ua_' || v_asset.id::text || '_' || p_fiscal_period_id::text;

      -- Idempotency: skip if already posted for this period
      IF EXISTS (
        SELECT 1 FROM public.acct_gl_bridge_log
        WHERE  source_table = 'unified_assets'
          AND  source_id    = v_asset.id::text
          AND  event_type   = 'asset_depreciation'
          AND  status       = 'success'
          AND  notes        = v_idem_key
      ) THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      -- Skip fully-depreciated assets
      IF v_asset.accumulated_depreciation >= v_asset.purchase_value THEN
        INSERT INTO public.acct_gl_bridge_log(source_table, source_id, event_type, status, error_message, notes)
        VALUES('unified_assets', v_asset.id::text, 'asset_depreciation', 'skipped',
               'Asset fully depreciated', v_idem_key);
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      -- Resolve GL accounts (per-asset overrides take priority)
      v_dep_acct := COALESCE(v_asset.dep_expense_account_id,  public.gl_bridge_account('asset_depreciation', 'debit'));
      v_acc_acct := COALESCE(v_asset.accum_dep_account_id,    public.gl_bridge_account('asset_depreciation', 'credit'));

      IF v_dep_acct IS NULL OR v_acc_acct IS NULL THEN
        INSERT INTO public.acct_gl_bridge_log(source_table, source_id, event_type, status, error_message, notes)
        VALUES('unified_assets', v_asset.id::text, 'asset_depreciation', 'skipped',
               'GL accounts not configured — set "asset_depreciation" in GL Bridge Settings or per-asset overrides',
               v_idem_key);
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      -- Compute NBV
      v_nbv := v_asset.purchase_value - v_asset.accumulated_depreciation;

      -- Compute period charge
      IF v_asset.depreciation_method = 'straight_line' THEN
        v_period_charge := v_asset.purchase_value / (v_asset.useful_life_years * p_periods_per_year);
      ELSIF v_asset.depreciation_method = 'declining_balance' THEN
        v_rate := COALESCE(v_asset.depreciation_rate, 1.0 / v_asset.useful_life_years);
        v_period_charge := v_nbv * v_rate / p_periods_per_year;
      ELSE
        v_period_charge := v_asset.purchase_value / (v_asset.useful_life_years * p_periods_per_year);
      END IF;

      v_period_charge := ROUND(v_period_charge, 4);
      v_period_charge := LEAST(v_period_charge, v_asset.purchase_value - v_asset.accumulated_depreciation);

      IF v_period_charge <= 0 THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      -- Insert entry as DRAFT, then lines, then transition to POSTED
      INSERT INTO public.acct_journal_entries(
        period_id, posting_date, description_en, source_type, source_id,
        status, idempotency_key
      ) VALUES(
        v_period.id,
        v_period.end_date,
        'Depreciation: ' || v_asset.name || ' (' || v_period.period_label || ')',
        'asset_depreciation',
        v_asset.id::text,
        'draft',
        v_idem_key
      )
      RETURNING id INTO v_entry_id;

      INSERT INTO public.acct_journal_lines(
        entry_id, line_no, account_id, debit_credit,
        functional_amount, original_amount, original_currency, functional_currency, fx_rate, description
      ) VALUES
        (v_entry_id, 1, v_dep_acct, 'DR', v_period_charge, v_period_charge,
         v_asset.currency, 'SDG', 1,
         'Depreciation expense — ' || v_asset.name),
        (v_entry_id, 2, v_acc_acct, 'CR', v_period_charge, v_period_charge,
         v_asset.currency, 'SDG', 1,
         'Accumulated depreciation — ' || v_asset.name);

      -- Transition to posted — fires DEFERRED balance check at COMMIT
      UPDATE public.acct_journal_entries
         SET status = 'posted', posted_at = now()
       WHERE id = v_entry_id;

      -- Update accumulated depreciation on the asset
      UPDATE public.unified_assets
         SET accumulated_depreciation = COALESCE(accumulated_depreciation, 0) + v_period_charge
       WHERE id = v_asset.id;

      INSERT INTO public.acct_gl_bridge_log(
        source_table, source_id, event_type, status, journal_entry_id, notes
      ) VALUES(
        'unified_assets', v_asset.id::text, 'asset_depreciation', 'success', v_entry_id, v_idem_key
      );

      v_posted := v_posted + 1;
      v_total  := v_total + v_period_charge;

    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT;
      INSERT INTO public.acct_gl_bridge_log(source_table, source_id, event_type, status, error_message, notes)
      VALUES('unified_assets', v_asset.id::text, 'asset_depreciation', 'error', v_err_msg, v_idem_key);
      v_errors := v_errors + 1;
    END;
  END LOOP;

  -- Record run summary
  INSERT INTO public.asset_depreciation_runs(
    period_label, periods_per_year, run_date,
    asset_count, total_depreciation, skipped_count, error_count, status
  ) VALUES(
    v_period.period_label, p_periods_per_year, CURRENT_DATE,
    v_posted, v_total, v_skipped, v_errors,
    CASE WHEN v_errors = 0 THEN 'completed' WHEN v_posted > 0 THEN 'partial' ELSE 'failed' END
  )
  RETURNING id INTO v_run_id;

  RETURN jsonb_build_object(
    'run_id',   v_run_id,
    'posted',   v_posted,
    'skipped',  v_skipped,
    'errors',   v_errors,
    'total',    v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_asset_depreciation_to_gl(uuid, int) TO authenticated;

-- =============================================================================
-- 5. acct_bridge_post_journal — 8-param (used by payroll, ops-cost, wallet, etc.)
-- =============================================================================
-- This is the central GL bridge dispatcher called by row-level triggers across
-- the system. It previously inserted entries as 'posted' then inserted lines —
-- which now conflicts with the INSERT guard from 20260803e.
-- Fix: INSERT draft → INSERT lines → app-level balance check → UPDATE to posted.
CREATE OR REPLACE FUNCTION public.acct_bridge_post_journal(
  p_source_table   text,
  p_source_id      uuid,
  p_event_type     text,
  p_posting_date   date,
  p_description_en text,
  p_description_ar text,
  p_lines          jsonb,
  p_posted_by      uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_id    uuid;
  v_idempotency text;
  v_period_id   uuid;
  v_fund_id     uuid;
  v_poster_id   uuid;
  v_line        jsonb;
  v_line_no     int  := 0;
  v_account_id  uuid;
  v_balance     numeric(20,4);
  v_engine_on   boolean;
  v_bridge_on   boolean;
BEGIN
  -- Gate: master engine switch
  SELECT is_enabled INTO v_engine_on
    FROM public.feature_flags WHERE key = 'acct.posting_engine.enabled';
  IF NOT COALESCE(v_engine_on, false) THEN
    RAISE EXCEPTION 'BRIDGE_SKIP: acct.posting_engine.enabled is OFF';
  END IF;

  -- Gate: per-source bridge flag
  SELECT is_enabled INTO v_bridge_on
    FROM public.feature_flags WHERE key = 'acct.bridge.' || p_source_table;
  IF NOT COALESCE(v_bridge_on, false) THEN
    RAISE EXCEPTION 'BRIDGE_SKIP: acct.bridge.% is OFF', p_source_table;
  END IF;

  -- Idempotency: return existing entry if already posted
  v_idempotency := p_source_table || '::' || p_source_id::text || '::' || p_event_type;
  SELECT id INTO v_entry_id
    FROM public.acct_journal_entries
   WHERE idempotency_key = v_idempotency;
  IF FOUND THEN
    RETURN v_entry_id;
  END IF;

  -- Resolve open fiscal period
  SELECT id INTO v_period_id
    FROM public.acct_fiscal_periods
   WHERE status IN ('open','soft_closed')
     AND start_date <= p_posting_date
     AND end_date   >= p_posting_date
   ORDER BY start_date DESC LIMIT 1;
  IF v_period_id IS NULL THEN
    RAISE EXCEPTION 'BRIDGE_NO_PERIOD: no open fiscal period for date %', p_posting_date;
  END IF;

  -- Resolve default fund
  SELECT id INTO v_fund_id FROM public.acct_funds WHERE code = 'GENERAL' AND is_active = true LIMIT 1;
  IF v_fund_id IS NULL THEN
    SELECT id INTO v_fund_id FROM public.acct_funds WHERE is_active = true ORDER BY created_at LIMIT 1;
  END IF;
  IF v_fund_id IS NULL THEN
    RAISE EXCEPTION 'BRIDGE_NO_FUND: no active fund found';
  END IF;

  -- Resolve poster
  v_poster_id := p_posted_by;
  IF v_poster_id IS NULL THEN
    SELECT id INTO v_poster_id FROM public.profiles
     WHERE lower(role) IN ('super_admin','superadmin') ORDER BY created_at LIMIT 1;
  END IF;
  IF v_poster_id IS NULL THEN
    RAISE EXCEPTION 'BRIDGE_NO_POSTER: no super_admin profile found';
  END IF;

  IF jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'BRIDGE_INSUFFICIENT_LINES: must supply at least 2 lines';
  END IF;

  -- Insert entry as DRAFT (lines follow in same txn, then UPDATE to posted)
  INSERT INTO public.acct_journal_entries (
    period_id, posting_date, description_en, description_ar,
    source_type, source_id, status, idempotency_key, created_by
  ) VALUES (
    v_period_id, p_posting_date, p_description_en, p_description_ar,
    p_source_table, p_source_id, 'draft', v_idempotency, v_poster_id
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_entry_id;

  IF v_entry_id IS NULL THEN
    -- Lost the race or already existed; return existing id
    SELECT id INTO v_entry_id FROM public.acct_journal_entries WHERE idempotency_key = v_idempotency;
    RETURN v_entry_id;
  END IF;

  -- Insert lines (entry is 'draft' so INSERT guard allows this)
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_line_no := v_line_no + 1;
    SELECT id INTO v_account_id
      FROM public.acct_accounts
     WHERE code = (v_line->>'account_code') AND is_postable = true;
    IF v_account_id IS NULL THEN
      RAISE EXCEPTION 'BRIDGE_ACCOUNT_NOT_FOUND: code=%', (v_line->>'account_code');
    END IF;
    INSERT INTO public.acct_journal_lines (
      entry_id, line_no, account_id, fund_id, function,
      original_amount, original_currency, functional_amount, functional_currency,
      debit_credit, description
    ) VALUES (
      v_entry_id, v_line_no, v_account_id, v_fund_id,
      COALESCE(v_line->>'function', 'program'),
      (v_line->>'amount')::numeric, COALESCE(v_line->>'currency', 'SDG'),
      (v_line->>'amount')::numeric, 'SDG',
      v_line->>'debit_credit', v_line->>'description'
    );
  END LOOP;

  -- Application-level balance check (belt-and-suspenders before DB trigger)
  SELECT SUM(CASE WHEN debit_credit = 'DR' THEN functional_amount ELSE -functional_amount END)
    INTO v_balance
    FROM public.acct_journal_lines WHERE entry_id = v_entry_id;
  IF ABS(COALESCE(v_balance, 1)) > 0.005 THEN
    RAISE EXCEPTION 'BRIDGE_IMBALANCE: DR/CR mismatch by % for entry %', v_balance, v_entry_id;
  END IF;

  -- Transition to posted — DEFERRED balance trigger fires at COMMIT
  UPDATE public.acct_journal_entries
     SET status = 'posted', posted_at = now(), posted_by = v_poster_id
   WHERE id = v_entry_id;

  PERFORM pg_notify('acct_journal_posted', v_entry_id::text);
  RETURN v_entry_id;
END $$;

COMMENT ON FUNCTION public.acct_bridge_post_journal(text,uuid,text,date,text,text,jsonb,uuid) IS
  'Internal SECURITY DEFINER function for GL bridge triggers. '
  'Uses draft-then-post ordering so the DB-level balance trigger fires at COMMIT. '
  'Idempotent on source_table::source_id::event_type.';

GRANT EXECUTE ON FUNCTION public.acct_bridge_post_journal(text,uuid,text,date,text,text,jsonb,uuid) TO authenticated;

-- =============================================================================
-- 6. acct_bridge_post_journal — 9-param / country-aware version
-- =============================================================================
CREATE OR REPLACE FUNCTION public.acct_bridge_post_journal(
  p_source_table   text,
  p_source_id      uuid,
  p_event_type     text,
  p_posting_date   date,
  p_description_en text,
  p_description_ar text,
  p_lines          jsonb,
  p_posted_by      uuid DEFAULT NULL,
  p_country_id     uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_id    uuid;
  v_idempotency text;
  v_period_id   uuid;
  v_fund_id     uuid;
  v_poster_id   uuid;
  v_line        jsonb;
  v_line_no     int  := 0;
  v_account_id  uuid;
  v_balance     numeric(20,4);
  v_engine_on   boolean;
  v_bridge_on   boolean;
BEGIN
  -- Gate: engine + bridge flag
  SELECT is_enabled INTO v_engine_on
    FROM public.feature_flags WHERE key = 'acct.posting_engine.enabled';
  IF NOT COALESCE(v_engine_on, false) THEN
    RAISE EXCEPTION 'BRIDGE_SKIP: acct.posting_engine.enabled is OFF';
  END IF;
  SELECT is_enabled INTO v_bridge_on
    FROM public.feature_flags WHERE key = 'acct.bridge.' || p_source_table;
  IF NOT COALESCE(v_bridge_on, false) THEN
    RAISE EXCEPTION 'BRIDGE_SKIP: acct.bridge.% is OFF', p_source_table;
  END IF;

  -- Idempotency
  v_idempotency := p_source_table || '::' || p_source_id::text || '::' || p_event_type;
  SELECT id INTO v_entry_id FROM public.acct_journal_entries WHERE idempotency_key = v_idempotency;
  IF FOUND THEN RETURN v_entry_id; END IF;

  -- Resolve period
  SELECT id INTO v_period_id
    FROM public.acct_fiscal_periods
   WHERE status IN ('open','soft_closed')
     AND start_date <= p_posting_date AND end_date >= p_posting_date
   ORDER BY start_date DESC LIMIT 1;
  IF v_period_id IS NULL THEN
    RAISE EXCEPTION 'BRIDGE_NO_PERIOD: no open fiscal period for date %', p_posting_date;
  END IF;

  -- Resolve fund
  SELECT id INTO v_fund_id FROM public.acct_funds WHERE code = 'GENERAL' AND is_active = true LIMIT 1;
  IF v_fund_id IS NULL THEN
    SELECT id INTO v_fund_id FROM public.acct_funds WHERE is_active = true ORDER BY created_at LIMIT 1;
  END IF;
  IF v_fund_id IS NULL THEN RAISE EXCEPTION 'BRIDGE_NO_FUND: no active fund found'; END IF;

  -- Resolve poster
  v_poster_id := p_posted_by;
  IF v_poster_id IS NULL THEN
    SELECT id INTO v_poster_id FROM public.profiles
     WHERE lower(role) IN ('super_admin','superadmin') ORDER BY created_at LIMIT 1;
  END IF;
  IF v_poster_id IS NULL THEN RAISE EXCEPTION 'BRIDGE_NO_POSTER: no super_admin profile found'; END IF;

  IF jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'BRIDGE_INSUFFICIENT_LINES: must supply at least 2 lines';
  END IF;

  -- Insert entry as DRAFT
  INSERT INTO public.acct_journal_entries (
    period_id, posting_date, description_en, description_ar,
    source_type, source_id, status, idempotency_key, created_by, country_id
  ) VALUES (
    v_period_id, p_posting_date, p_description_en, p_description_ar,
    p_source_table, p_source_id, 'draft', v_idempotency, v_poster_id, p_country_id
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_entry_id;

  IF v_entry_id IS NULL THEN
    SELECT id INTO v_entry_id FROM public.acct_journal_entries WHERE idempotency_key = v_idempotency;
    RETURN v_entry_id;
  END IF;

  -- Insert lines using country-first account resolution
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_line_no := v_line_no + 1;
    -- Country-specific account first, then global fallback (country_id IS NULL)
    SELECT id INTO v_account_id
      FROM public.acct_accounts
     WHERE code = (v_line->>'account_code')
       AND is_postable = true
       AND (country_id = p_country_id OR country_id IS NULL)
     ORDER BY CASE WHEN country_id = p_country_id THEN 0 ELSE 1 END
     LIMIT 1;
    IF v_account_id IS NULL THEN
      RAISE EXCEPTION 'BRIDGE_ACCOUNT_NOT_FOUND: code=%, country=%',
        (v_line->>'account_code'), p_country_id;
    END IF;
    INSERT INTO public.acct_journal_lines (
      entry_id, line_no, account_id, fund_id, function,
      original_amount, original_currency, functional_amount, functional_currency,
      debit_credit, description
    ) VALUES (
      v_entry_id, v_line_no, v_account_id, v_fund_id,
      COALESCE(v_line->>'function', 'program'),
      (v_line->>'amount')::numeric, COALESCE(v_line->>'currency', 'SDG'),
      (v_line->>'amount')::numeric, 'SDG',
      v_line->>'debit_credit', v_line->>'description'
    );
  END LOOP;

  -- Application-level balance check
  SELECT SUM(CASE WHEN debit_credit = 'DR' THEN functional_amount ELSE -functional_amount END)
    INTO v_balance FROM public.acct_journal_lines WHERE entry_id = v_entry_id;
  IF ABS(COALESCE(v_balance, 1)) > 0.005 THEN
    RAISE EXCEPTION 'BRIDGE_IMBALANCE: DR/CR mismatch by % for entry %', v_balance, v_entry_id;
  END IF;

  -- Transition to posted
  UPDATE public.acct_journal_entries
     SET status = 'posted', posted_at = now(), posted_by = v_poster_id
   WHERE id = v_entry_id;

  PERFORM pg_notify('acct_journal_posted', v_entry_id::text);
  RETURN v_entry_id;
END $$;

COMMENT ON FUNCTION public.acct_bridge_post_journal(text,uuid,text,date,text,text,jsonb,uuid,uuid) IS
  'Country-aware GL bridge dispatcher (9-param). Uses draft-then-post ordering. '
  'Resolves accounts by (code, country_id) with global fallback (country_id IS NULL). '
  'Idempotent on source_table::source_id::event_type.';

GRANT EXECUTE ON FUNCTION public.acct_bridge_post_journal(text,uuid,text,date,text,text,jsonb,uuid,uuid) TO authenticated;

COMMIT;
