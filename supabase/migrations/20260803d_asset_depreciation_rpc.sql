-- =============================================================================
-- Migration: Unified Asset Depreciation Run + RPC
-- Date: 2026-08-03
-- Adds:
--   1. asset_depreciation_runs  — tracks each run: period, totals, status
--   2. dep_expense_account_id / accum_dep_account_id on unified_assets (optional
--      per-asset GL override; falls back to gl_bridge_account() config)
--   3. post_asset_depreciation_to_gl(p_fiscal_period_id, p_periods_per_year)
--      RPC — computes period charge, posts journal, updates accumulated_dep,
--      logs to acct_gl_bridge_log, idempotent per asset per period.
-- Safe to re-run: IF NOT EXISTS / CREATE OR REPLACE throughout
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Optional per-asset GL account overrides on unified_assets
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.unified_assets
  ADD COLUMN IF NOT EXISTS dep_expense_account_id  uuid REFERENCES public.acct_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accum_dep_account_id    uuid REFERENCES public.acct_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS depreciation_rate        numeric(8,6);   -- for declining balance: e.g. 0.20 for 20%

COMMENT ON COLUMN public.unified_assets.dep_expense_account_id IS
  'DR account for depreciation journal. Falls back to gl_bridge_account(''asset_depreciation'',''debit'') if NULL.';
COMMENT ON COLUMN public.unified_assets.accum_dep_account_id IS
  'CR account for depreciation journal. Falls back to gl_bridge_account(''asset_depreciation'',''credit'') if NULL.';
COMMENT ON COLUMN public.unified_assets.depreciation_rate IS
  'Annual rate for declining_balance method (e.g. 0.20). If NULL, rate = 1/useful_life_years.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Depreciation run log table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.asset_depreciation_runs (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_period_id    uuid        REFERENCES public.acct_fiscal_periods(id) ON DELETE SET NULL,
  period_label        text        NOT NULL,
  periods_per_year    int         NOT NULL DEFAULT 12,
  run_date            date        NOT NULL DEFAULT CURRENT_DATE,
  asset_count         int         NOT NULL DEFAULT 0,
  total_depreciation  numeric(20,4) NOT NULL DEFAULT 0,
  skipped_count       int         NOT NULL DEFAULT 0,
  error_count         int         NOT NULL DEFAULT 0,
  status              text        NOT NULL DEFAULT 'completed'
                      CHECK (status IN ('completed','partial','error')),
  notes               text,
  posted_by           uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_adr_period ON public.asset_depreciation_runs(fiscal_period_id);

ALTER TABLE public.asset_depreciation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance can manage depreciation runs"
  ON public.asset_depreciation_runs FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin','Admin','admin','finance','financialAdmin','accountant','auditor')
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RPC: post_asset_depreciation_to_gl
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
  -- ── Server-side authorisation ─────────────────────────────────────────────
  -- SECURITY DEFINER means this runs as the function owner, so we must
  -- enforce Finance/Admin role membership explicitly before any mutation.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id   = auth.uid()
      AND role IN ('super_admin','Admin','admin','finance','financialAdmin','accountant')
  ) THEN
    RETURN jsonb_build_object(
      'error', 'Access denied: Finance or Admin role required to post depreciation.'
    );
  END IF;

  -- ── Input validation ──────────────────────────────────────────────────────
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

  -- ── Loop through depreciable, active assets ──────────────────────────────
  FOR v_asset IN
    SELECT *
    FROM   public.unified_assets ua
    WHERE  ua.status IN ('available', 'assigned', 'maintenance')
      AND  ua.purchase_value   IS NOT NULL
      AND  ua.purchase_value   > 0
      AND  ua.useful_life_years IS NOT NULL
      AND  ua.useful_life_years > 0
      AND  ua.depreciation_method IS NOT NULL
  LOOP
    BEGIN
      v_idem_key := 'dep_ua_' || v_asset.id::text || '_' || p_fiscal_period_id::text;

      -- Idempotency: skip if this asset was already posted for this period
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

      -- Skip fully-depreciated assets (accumulated >= purchase_value)
      IF v_asset.accumulated_depreciation >= v_asset.purchase_value THEN
        INSERT INTO public.acct_gl_bridge_log(source_table, source_id, event_type, status, error_message, notes)
        VALUES('unified_assets', v_asset.id::text, 'asset_depreciation', 'skipped',
               'Asset fully depreciated', v_idem_key);
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      -- Resolve GL accounts: prefer per-asset overrides, fall back to bridge config
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

      -- Compute period charge based on method
      IF v_asset.depreciation_method = 'straight_line' THEN
        v_period_charge := v_asset.purchase_value
                           / (v_asset.useful_life_years * p_periods_per_year);

      ELSIF v_asset.depreciation_method = 'declining_balance' THEN
        v_rate := COALESCE(v_asset.depreciation_rate, 1.0 / v_asset.useful_life_years);
        v_period_charge := v_nbv * v_rate / p_periods_per_year;

      ELSE
        -- Unknown method — fall back to straight line
        v_period_charge := v_asset.purchase_value
                           / (v_asset.useful_life_years * p_periods_per_year);
      END IF;

      v_period_charge := ROUND(v_period_charge, 4);

      -- Cap at remaining depreciable amount so we don't over-depreciate
      v_period_charge := LEAST(v_period_charge, v_asset.purchase_value - v_asset.accumulated_depreciation);

      IF v_period_charge <= 0 THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      -- ── Post journal entry (draft-then-post for INSERT guard compatibility) ──
      INSERT INTO public.acct_journal_entries(
        period_id, posting_date, description_en, source_type, source_id,
        status, idempotency_key
      ) VALUES(
        v_period.id,
        v_period.end_date,   -- post on last day of period
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

      -- Transition to posted — triggers DEFERRED balance check at COMMIT
      UPDATE public.acct_journal_entries
         SET status = 'posted', posted_at = now()
       WHERE id = v_entry_id;

      -- ── Update accumulated depreciation on the asset ──────────────────────
      UPDATE public.unified_assets
      SET    accumulated_depreciation = accumulated_depreciation + v_period_charge
      WHERE  id = v_asset.id;

      -- ── Log to bridge log ─────────────────────────────────────────────────
      INSERT INTO public.acct_gl_bridge_log(source_table, source_id, event_type, status, journal_entry_id, notes)
      VALUES('unified_assets', v_asset.id::text, 'asset_depreciation', 'success', v_entry_id, v_idem_key);

      v_posted := v_posted + 1;
      v_total  := v_total + v_period_charge;

    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT;
      INSERT INTO public.acct_gl_bridge_log(source_table, source_id, event_type, status, error_message, notes)
      VALUES('unified_assets', v_asset.id::text, 'asset_depreciation', 'error', v_err_msg, v_idem_key);
      v_errors := v_errors + 1;
    END;
  END LOOP;

  -- ── Write summary run record ──────────────────────────────────────────────
  INSERT INTO public.asset_depreciation_runs(
    fiscal_period_id, period_label, periods_per_year,
    run_date, asset_count, total_depreciation, skipped_count, error_count,
    status, posted_by
  ) VALUES(
    p_fiscal_period_id,
    v_period.period_label,
    p_periods_per_year,
    CURRENT_DATE,
    v_posted,
    v_total,
    v_skipped,
    v_errors,
    CASE WHEN v_errors > 0 AND v_posted = 0 THEN 'error'
         WHEN v_errors > 0 THEN 'partial'
         ELSE 'completed' END,
    auth.uid()
  )
  RETURNING id INTO v_run_id;

  RETURN jsonb_build_object(
    'run_id',   v_run_id,
    'posted',   v_posted,
    'skipped',  v_skipped,
    'errors',   v_errors,
    'total_depreciation', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_asset_depreciation_to_gl(uuid, int) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Preview helper — returns what would be posted WITHOUT committing
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.preview_asset_depreciation(
  p_periods_per_year int DEFAULT 12
)
RETURNS TABLE (
  asset_id              uuid,
  asset_code            text,
  asset_name            text,
  depreciation_method   text,
  purchase_value        numeric,
  accumulated_dep       numeric,
  nbv                   numeric,
  period_charge         numeric,
  already_fully_dep     boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  -- Server-side role check (Finance and above; auditors also allowed to preview)
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id   = auth.uid()
      AND role IN ('super_admin','Admin','admin','finance','financialAdmin','accountant','auditor')
  ) THEN
    RAISE EXCEPTION 'Access denied: Finance or Admin role required to preview depreciation.';
  END IF;

  -- Input validation
  IF p_periods_per_year IS NULL OR p_periods_per_year NOT IN (1, 4, 12) THEN
    RAISE EXCEPTION 'Invalid p_periods_per_year: must be 1, 4, or 12.';
  END IF;

  RETURN QUERY
  SELECT
    ua.id                                                AS asset_id,
    ua.asset_code,
    ua.name                                              AS asset_name,
    ua.depreciation_method,
    ua.purchase_value,
    ua.accumulated_depreciation                          AS accumulated_dep,
    GREATEST(0, ua.purchase_value - ua.accumulated_depreciation) AS nbv,
    CASE
      WHEN ua.accumulated_depreciation >= ua.purchase_value THEN 0::numeric
      WHEN ua.depreciation_method = 'straight_line' THEN
        LEAST(
          ROUND(ua.purchase_value / (ua.useful_life_years * p_periods_per_year), 4),
          ua.purchase_value - ua.accumulated_depreciation
        )
      WHEN ua.depreciation_method = 'declining_balance' THEN
        LEAST(
          ROUND(
            GREATEST(0, ua.purchase_value - ua.accumulated_depreciation)
            * COALESCE(ua.depreciation_rate, 1.0 / ua.useful_life_years)
            / p_periods_per_year,
            4
          ),
          ua.purchase_value - ua.accumulated_depreciation
        )
      ELSE
        ROUND(ua.purchase_value / (ua.useful_life_years * p_periods_per_year), 4)
    END                                                  AS period_charge,
    (ua.accumulated_depreciation >= ua.purchase_value)   AS already_fully_dep
  FROM public.unified_assets ua
  WHERE ua.status IN ('available', 'assigned', 'maintenance')
    AND ua.purchase_value    IS NOT NULL
    AND ua.purchase_value    > 0
    AND ua.useful_life_years IS NOT NULL
    AND ua.useful_life_years > 0
    AND ua.depreciation_method IS NOT NULL
  ORDER BY ua.asset_code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.preview_asset_depreciation(int) TO authenticated;

COMMIT;

-- =============================================================================
-- AFTER RUNNING THIS MIGRATION
-- =============================================================================
-- 1. Configure the 'asset_depreciation' bridge event in:
--    Accounting → Financial Operations → GL Bridge Settings
--    Set debit = Depreciation Expense account, credit = Accumulated Depreciation
--
-- 2. Verify the new table:
--    SELECT * FROM asset_depreciation_runs LIMIT 5;
--
-- 3. Preview what would be posted (dry-run):
--    SELECT * FROM preview_asset_depreciation(12);
-- =============================================================================
