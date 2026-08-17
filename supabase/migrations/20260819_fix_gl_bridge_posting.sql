-- =============================================================================
-- Fix GL Bridge Posting — draft-then-post pattern + feature flags
-- Date: 2026-08-17
--
-- Root causes this migration fixes:
--
--   1. Feature flags (acct.posting_engine.enabled, acct.bridge.*) may not
--      exist yet, causing acct_bridge_post_journal() to raise BRIDGE_SKIP and
--      log every posting attempt as 'error'.
--
--   2. The line-insert guard trigger (trg_acct_jl_insert_guard, from migration
--      20260803e) blocks INSERT into acct_journal_lines when the parent entry
--      status is 'posted'. acct_bridge_post_journal() inserts the entry as
--      'posted' first, then tries to insert lines — this is blocked.
--
--   3. Our manual RPCs (post_downpayments_to_gl, post_cost_submissions_to_gl)
--      call acct_bridge_post_journal(), inheriting both problems above.
--
-- Fix: rewrite all four functions (2 trigger functions + 2 manual RPCs) to use
-- the draft-then-post pattern: INSERT entry (draft) → INSERT lines → UPDATE to
-- posted. This bypasses acct_bridge_post_journal() entirely and is immune to
-- the feature flag gate and the insert guard.
--
-- Also creates:
--   • gl_bridge_account() helper function (if not already deployed)
--   • GENERAL fund row (if none exists)
--   • Feature flag rows for the three bridge event types
--
-- Safe to re-run: all uses CREATE OR REPLACE / ON CONFLICT DO NOTHING/UPDATE.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. FEATURE FLAGS — enable posting engine + three bridge flags
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.feature_flags (key, description, is_enabled)
VALUES
  ('acct.posting_engine.enabled',
   'GL posting engine master switch — must be ON for any journal posting',
   true),
  ('acct.bridge.down_payment_requests',
   'Auto-post GL journals when down_payment_requests.status → fully_paid',
   true),
  ('acct.bridge.operational_cost_submissions',
   'Auto-post GL journals when operational_cost_submissions.status → paid',
   true),
  ('acct.bridge.pre_fund_transactions',
   'Auto-post GL journals for pre-fund disbursement transactions',
   true)
ON CONFLICT (key) DO UPDATE SET is_enabled = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. gl_bridge_account() — reads debit/credit account UUIDs from config table
--    (idempotent: CREATE OR REPLACE)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.gl_bridge_account(
  p_source_event text,
  p_side         text   -- 'debit' or 'credit'
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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
-- 3. GENERAL fund — create if none exists
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.acct_funds (code, name_en, name_ar, restriction_type, is_active)
SELECT 'GENERAL', 'General Fund', 'الصندوق العام', 'without_restriction', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.acct_funds WHERE code = 'GENERAL'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. REWRITE acct_trig_down_payment_requests()
--    Uses draft-then-post pattern — no dependency on acct_bridge_post_journal.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.acct_trig_down_payment_requests()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_id    uuid;
  v_period_id   uuid;
  v_fund_id     uuid;
  v_poster_id   uuid;
  v_amount      numeric(20,4);
  v_dr_acct_id  uuid;
  v_cr_acct_id  uuid;
  v_idempotency text;
BEGIN
  -- Only fire when status changes to 'fully_paid'
  IF NOT (
    tg_op = 'UPDATE'
    AND old.status IS DISTINCT FROM new.status
    AND new.status = 'fully_paid'
  ) THEN
    RETURN new;
  END IF;

  v_amount      := COALESCE(new.total_paid_amount, new.requested_amount, 0);
  IF v_amount <= 0 THEN RETURN new; END IF;

  -- Idempotency check: skip if already journaled
  v_idempotency := 'down_payment_requests::' || new.id::text || '::fully_paid';
  IF EXISTS (SELECT 1 FROM public.acct_journal_entries WHERE idempotency_key = v_idempotency) THEN
    RETURN new;
  END IF;

  BEGIN
    -- Open fiscal period
    SELECT id INTO v_period_id
    FROM   public.acct_fiscal_periods
    WHERE  status IN ('open', 'soft_closed')
      AND  start_date <= current_date
      AND  end_date   >= current_date
    ORDER BY start_date DESC LIMIT 1;

    IF v_period_id IS NULL THEN
      INSERT INTO public.acct_gl_bridge_log (source_table, source_id, event_type, status, error_message)
      VALUES ('down_payment_requests', new.id, 'down_payment_fully_paid', 'error', 'No open fiscal period for ' || current_date::text);
      RETURN new;
    END IF;

    -- Fund
    SELECT id INTO v_fund_id FROM public.acct_funds WHERE code = 'GENERAL' AND is_active = true LIMIT 1;
    IF v_fund_id IS NULL THEN
      SELECT id INTO v_fund_id FROM public.acct_funds WHERE is_active = true ORDER BY created_at LIMIT 1;
    END IF;
    IF v_fund_id IS NULL THEN
      INSERT INTO public.acct_gl_bridge_log (source_table, source_id, event_type, status, error_message)
      VALUES ('down_payment_requests', new.id, 'down_payment_fully_paid', 'error', 'No active fund found');
      RETURN new;
    END IF;

    -- Poster: fall back to first super_admin
    v_poster_id := COALESCE(new.admin_processed_by, new.requested_by);
    IF v_poster_id IS NULL THEN
      SELECT id INTO v_poster_id FROM public.profiles WHERE lower(role) IN ('super_admin','superadmin') ORDER BY created_at LIMIT 1;
    END IF;

    -- Account lookup: DR 1510 Staff/Travel Advances, CR 1200 Cash/Bank
    -- Restrict to country-specific or global (country_id IS NULL); prefer local over global.
    SELECT id INTO v_dr_acct_id
    FROM   public.acct_accounts
    WHERE  code = '1510' AND is_postable = true
      AND  (country_id = new.country_id OR country_id IS NULL)
    ORDER  BY CASE WHEN country_id IS NOT NULL THEN 0 ELSE 1 END, created_at
    LIMIT  1;

    SELECT id INTO v_cr_acct_id
    FROM   public.acct_accounts
    WHERE  code = '1200' AND is_postable = true
      AND  (country_id = new.country_id OR country_id IS NULL)
    ORDER  BY CASE WHEN country_id IS NOT NULL THEN 0 ELSE 1 END, created_at
    LIMIT  1;

    IF v_dr_acct_id IS NULL OR v_cr_acct_id IS NULL THEN
      INSERT INTO public.acct_gl_bridge_log (source_table, source_id, event_type, status, error_message)
      VALUES ('down_payment_requests', new.id, 'down_payment_fully_paid', 'error',
              'Account not found — DR 1510: ' || CASE WHEN v_dr_acct_id IS NULL THEN 'missing' ELSE 'ok' END
              || ', CR 1200: ' || CASE WHEN v_cr_acct_id IS NULL THEN 'missing' ELSE 'ok' END
              || '. Add these accounts in the Chart of Accounts first.');
      RETURN new;
    END IF;

    -- Step 1: Insert DRAFT entry
    INSERT INTO public.acct_journal_entries (
      period_id, posting_date,
      description_en, description_ar,
      source_type, source_id, country_id,
      status, idempotency_key,
      posted_by, created_by
    ) VALUES (
      v_period_id,
      current_date,
      'Field Advance Disbursed: ' || COALESCE(new.site_name, new.id::text),
      'صرف سلفة ميدانية: '         || COALESCE(new.site_name, new.id::text),
      'down_payment_requests',
      new.id,
      new.country_id,
      'draft',
      v_idempotency,
      v_poster_id,
      v_poster_id
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_entry_id;

    IF v_entry_id IS NULL THEN
      SELECT id INTO v_entry_id FROM public.acct_journal_entries WHERE idempotency_key = v_idempotency;
      RETURN new;
    END IF;

    -- Step 2: Insert journal lines (allowed on 'draft' entry)
    INSERT INTO public.acct_journal_lines (
      entry_id, line_no, account_id, fund_id,
      debit_credit, functional_amount, original_amount,
      original_currency, functional_currency, fx_rate,
      function, description
    ) VALUES
      (v_entry_id, 1, v_dr_acct_id, v_fund_id,
       'DR', v_amount, v_amount, 'SDG', 'SDG', 1.0,
       'program',
       'Travel Advance — ' || COALESCE(new.site_name, 'Field Site')),
      (v_entry_id, 2, v_cr_acct_id, v_fund_id,
       'CR', v_amount, v_amount, 'SDG', 'SDG', 1.0,
       'none',
       'Cash — Field Advance #' || new.id::text);

    -- Step 3: Promote to POSTED
    UPDATE public.acct_journal_entries
    SET status = 'posted', posted_at = now()
    WHERE id = v_entry_id;

    INSERT INTO public.acct_gl_bridge_log (source_table, source_id, event_type, status, journal_entry_id)
    VALUES ('down_payment_requests', new.id, 'down_payment_fully_paid', 'success', v_entry_id);

  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.acct_gl_bridge_log (source_table, source_id, event_type, status, error_message)
    VALUES ('down_payment_requests', new.id, 'down_payment_fully_paid', 'error', SQLERRM);
  END;

  RETURN new;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. REWRITE acct_trig_operational_cost_submissions()
--    Uses draft-then-post pattern.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.acct_trig_operational_cost_submissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_id    uuid;
  v_period_id   uuid;
  v_fund_id     uuid;
  v_poster_id   uuid;
  v_amount      numeric(20,4);
  v_dr_acct_id  uuid;
  v_cr_acct_id  uuid;
  v_expense_acc text;
  v_idempotency text;
BEGIN
  -- Only fire when status changes to 'paid'
  IF NOT (
    tg_op = 'UPDATE'
    AND old.status IS DISTINCT FROM new.status
    AND new.status = 'paid'
  ) THEN
    RETURN new;
  END IF;

  v_amount := COALESCE(new.paid_amount_cents, new.amount_cents, 0) / 100.0;
  IF v_amount <= 0 THEN RETURN new; END IF;

  v_idempotency := 'operational_cost_submissions::' || new.id::text || '::paid';
  IF EXISTS (SELECT 1 FROM public.acct_journal_entries WHERE idempotency_key = v_idempotency) THEN
    RETURN new;
  END IF;

  BEGIN
    -- Fiscal period
    SELECT id INTO v_period_id
    FROM   public.acct_fiscal_periods
    WHERE  status IN ('open', 'soft_closed')
      AND  start_date <= COALESCE(new.expense_date, current_date)
      AND  end_date   >= COALESCE(new.expense_date, current_date)
    ORDER BY start_date DESC LIMIT 1;

    IF v_period_id IS NULL THEN
      -- Fallback: use current date period
      SELECT id INTO v_period_id
      FROM   public.acct_fiscal_periods
      WHERE  status IN ('open', 'soft_closed')
        AND  start_date <= current_date
        AND  end_date   >= current_date
      ORDER BY start_date DESC LIMIT 1;
    END IF;

    IF v_period_id IS NULL THEN
      INSERT INTO public.acct_gl_bridge_log (source_table, source_id, event_type, status, error_message)
      VALUES ('operational_cost_submissions', new.id, 'ops_cost_paid', 'error', 'No open fiscal period');
      RETURN new;
    END IF;

    -- Fund
    SELECT id INTO v_fund_id FROM public.acct_funds WHERE code = 'GENERAL' AND is_active = true LIMIT 1;
    IF v_fund_id IS NULL THEN
      SELECT id INTO v_fund_id FROM public.acct_funds WHERE is_active = true ORDER BY created_at LIMIT 1;
    END IF;
    IF v_fund_id IS NULL THEN
      INSERT INTO public.acct_gl_bridge_log (source_table, source_id, event_type, status, error_message)
      VALUES ('operational_cost_submissions', new.id, 'ops_cost_paid', 'error', 'No active fund found');
      RETURN new;
    END IF;

    -- Poster
    v_poster_id := COALESCE(new.tier2_approved_by, new.submitted_by);
    IF v_poster_id IS NULL THEN
      SELECT id INTO v_poster_id FROM public.profiles WHERE lower(role) IN ('super_admin','superadmin') ORDER BY created_at LIMIT 1;
    END IF;

    -- Expense account from category mapping, then CR 1200
    v_expense_acc := public.acct_bridge_ops_cost_account(new.expense_category);

    SELECT id INTO v_dr_acct_id
    FROM   public.acct_accounts
    WHERE  code = v_expense_acc AND is_postable = true
      AND  (country_id = new.country_id OR country_id IS NULL)
    ORDER  BY CASE WHEN country_id IS NOT NULL THEN 0 ELSE 1 END, created_at
    LIMIT  1;

    SELECT id INTO v_cr_acct_id
    FROM   public.acct_accounts
    WHERE  code = '1200' AND is_postable = true
      AND  (country_id = new.country_id OR country_id IS NULL)
    ORDER  BY CASE WHEN country_id IS NOT NULL THEN 0 ELSE 1 END, created_at
    LIMIT  1;

    IF v_dr_acct_id IS NULL OR v_cr_acct_id IS NULL THEN
      INSERT INTO public.acct_gl_bridge_log (source_table, source_id, event_type, status, error_message)
      VALUES ('operational_cost_submissions', new.id, 'ops_cost_paid', 'error',
              'Account not found — DR ' || v_expense_acc || ': '
              || CASE WHEN v_dr_acct_id IS NULL THEN 'missing' ELSE 'ok' END
              || ', CR 1200: ' || CASE WHEN v_cr_acct_id IS NULL THEN 'missing' ELSE 'ok' END
              || '. Add these accounts in the Chart of Accounts first.');
      RETURN new;
    END IF;

    -- Draft entry
    INSERT INTO public.acct_journal_entries (
      period_id, posting_date,
      description_en, description_ar,
      source_type, source_id, country_id,
      status, idempotency_key,
      posted_by, created_by
    ) VALUES (
      v_period_id,
      COALESCE(new.expense_date, current_date),
      'Operational Cost Paid: ' || COALESCE(new.expense_category, 'general'),
      'تكلفة تشغيلية مدفوعة: '   || COALESCE(new.expense_category, 'عامة'),
      'operational_cost_submissions',
      new.id,
      new.country_id,
      'draft',
      v_idempotency,
      v_poster_id,
      v_poster_id
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_entry_id;

    IF v_entry_id IS NULL THEN RETURN new; END IF;

    -- Lines
    INSERT INTO public.acct_journal_lines (
      entry_id, line_no, account_id, fund_id,
      debit_credit, functional_amount, original_amount,
      original_currency, functional_currency, fx_rate,
      function, description
    ) VALUES
      (v_entry_id, 1, v_dr_acct_id, v_fund_id,
       'DR', v_amount, v_amount,
       COALESCE(new.currency, 'SDG'), 'SDG', 1.0,
       'program',
       COALESCE(new.description, new.expense_category)),
      (v_entry_id, 2, v_cr_acct_id, v_fund_id,
       'CR', v_amount, v_amount,
       COALESCE(new.currency, 'SDG'), 'SDG', 1.0,
       'none',
       'Cash Payment — Ops Cost #' || new.id::text);

    -- Post
    UPDATE public.acct_journal_entries
    SET status = 'posted', posted_at = now()
    WHERE id = v_entry_id;

    INSERT INTO public.acct_gl_bridge_log (source_table, source_id, event_type, status, journal_entry_id)
    VALUES ('operational_cost_submissions', new.id, 'ops_cost_paid', 'success', v_entry_id);

  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.acct_gl_bridge_log (source_table, source_id, event_type, status, error_message)
    VALUES ('operational_cost_submissions', new.id, 'ops_cost_paid', 'error', SQLERRM);
  END;

  RETURN new;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. REWRITE post_downpayments_to_gl()
--    Manual RPC — draft-then-post, no feature flag gate.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.post_downpayments_to_gl()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_posted   int  := 0;
  v_skipped  int  := 0;
  v_errors   int  := 0;
  v_rec      RECORD;
  v_entry_id uuid;
  v_period   RECORD;
  v_fund_id  uuid;
  v_poster_id uuid;
  v_dr_acct_id uuid;
  v_cr_acct_id uuid;
  v_amount   numeric(20,4);
  v_idempotency text;
  v_err_msg  text;
BEGIN
  -- Role check
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin','Admin','admin','finance','financialAdmin','accountant')
  ) THEN
    RETURN jsonb_build_object('error', 'Access denied: Finance or Admin role required.');
  END IF;

  -- Pre-fetch GENERAL fund
  SELECT id INTO v_fund_id FROM public.acct_funds WHERE code = 'GENERAL' AND is_active = true LIMIT 1;
  IF v_fund_id IS NULL THEN
    SELECT id INTO v_fund_id FROM public.acct_funds WHERE is_active = true ORDER BY created_at LIMIT 1;
  END IF;
  IF v_fund_id IS NULL THEN
    RETURN jsonb_build_object('error', 'No active fund found. Create a GENERAL fund in the Accounting module first.');
  END IF;

  FOR v_rec IN
    SELECT dpr.*
    FROM   public.down_payment_requests dpr
    WHERE  dpr.status = 'fully_paid'
      AND  NOT EXISTS (
             SELECT 1 FROM public.acct_gl_bridge_log l
             WHERE  l.source_table = 'down_payment_requests'
               AND  l.source_id   = dpr.id
               AND  l.status      = 'success'
           )
    ORDER BY dpr.updated_at
  LOOP
    v_idempotency := 'down_payment_requests::' || v_rec.id::text || '::fully_paid';

    -- Skip if already journaled (idempotency)
    IF EXISTS (SELECT 1 FROM public.acct_journal_entries WHERE idempotency_key = v_idempotency) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    BEGIN
      v_amount := COALESCE(v_rec.total_paid_amount, v_rec.requested_amount, 0);
      IF v_amount <= 0 THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      -- Find open fiscal period for transaction date
      SELECT fp.* INTO v_period
      FROM   public.acct_fiscal_periods fp
      WHERE  fp.status IN ('open', 'soft_closed')
        AND  fp.start_date <= COALESCE(v_rec.updated_at::date, current_date)
        AND  fp.end_date   >= COALESCE(v_rec.updated_at::date, current_date)
      LIMIT 1;

      IF v_period IS NULL THEN
        -- Fallback: any open period
        SELECT fp.* INTO v_period FROM public.acct_fiscal_periods fp
        WHERE fp.status IN ('open','soft_closed') ORDER BY fp.start_date DESC LIMIT 1;
      END IF;

      IF v_period IS NULL THEN
        INSERT INTO public.acct_gl_bridge_log (source_table, source_id, event_type, status, error_message)
        VALUES ('down_payment_requests', v_rec.id, 'down_payment_fully_paid', 'skipped', 'No open fiscal period');
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      -- Accounts: local country first, then global (country_id IS NULL). Never cross-country.
      SELECT id INTO v_dr_acct_id FROM public.acct_accounts
      WHERE code = '1510' AND is_postable = true
        AND (country_id = v_rec.country_id OR country_id IS NULL)
      ORDER BY CASE WHEN country_id IS NOT NULL THEN 0 ELSE 1 END, created_at LIMIT 1;

      SELECT id INTO v_cr_acct_id FROM public.acct_accounts
      WHERE code = '1200' AND is_postable = true
        AND (country_id = v_rec.country_id OR country_id IS NULL)
      ORDER BY CASE WHEN country_id IS NOT NULL THEN 0 ELSE 1 END, created_at LIMIT 1;

      IF v_dr_acct_id IS NULL OR v_cr_acct_id IS NULL THEN
        INSERT INTO public.acct_gl_bridge_log (source_table, source_id, event_type, status, error_message)
        VALUES ('down_payment_requests', v_rec.id, 'down_payment_fully_paid', 'error',
                'Account not found: DR 1510 ' || CASE WHEN v_dr_acct_id IS NULL THEN 'MISSING' ELSE 'ok' END
                || ', CR 1200 ' || CASE WHEN v_cr_acct_id IS NULL THEN 'MISSING' ELSE 'ok' END);
        v_errors := v_errors + 1;
        CONTINUE;
      END IF;

      -- Poster
      v_poster_id := COALESCE(v_rec.admin_processed_by, v_rec.requested_by);
      IF v_poster_id IS NULL THEN
        SELECT id INTO v_poster_id FROM public.profiles WHERE lower(role) IN ('super_admin','superadmin') ORDER BY created_at LIMIT 1;
      END IF;

      -- Draft → lines → post
      INSERT INTO public.acct_journal_entries (
        period_id, posting_date, description_en, description_ar,
        source_type, source_id, country_id, status, idempotency_key, posted_by, created_by
      ) VALUES (
        v_period.id,
        COALESCE(v_rec.updated_at::date, current_date),
        'Field Advance Disbursed: ' || COALESCE(v_rec.site_name, v_rec.id::text),
        'صرف سلفة ميدانية: '         || COALESCE(v_rec.site_name, v_rec.id::text),
        'down_payment_requests', v_rec.id, v_rec.country_id, 'draft', v_idempotency, v_poster_id, v_poster_id
      )
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id INTO v_entry_id;

      IF v_entry_id IS NULL THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      INSERT INTO public.acct_journal_lines (
        entry_id, line_no, account_id, fund_id, debit_credit,
        functional_amount, original_amount, original_currency, functional_currency, fx_rate,
        function, description
      ) VALUES
        (v_entry_id, 1, v_dr_acct_id, v_fund_id, 'DR',
         v_amount, v_amount, 'SDG', 'SDG', 1.0,
         'program', 'Travel Advance — ' || COALESCE(v_rec.site_name, 'Field Site')),
        (v_entry_id, 2, v_cr_acct_id, v_fund_id, 'CR',
         v_amount, v_amount, 'SDG', 'SDG', 1.0,
         'none', 'Cash — Field Advance #' || v_rec.id::text);

      UPDATE public.acct_journal_entries
      SET status = 'posted', posted_at = now()
      WHERE id = v_entry_id;

      INSERT INTO public.acct_gl_bridge_log (source_table, source_id, event_type, status, journal_entry_id)
      VALUES ('down_payment_requests', v_rec.id, 'down_payment_fully_paid', 'success', v_entry_id);

      v_posted := v_posted + 1;

    EXCEPTION WHEN OTHERS THEN
      v_err_msg := SQLERRM;
      INSERT INTO public.acct_gl_bridge_log (source_table, source_id, event_type, status, error_message)
      VALUES ('down_payment_requests', v_rec.id, 'down_payment_fully_paid', 'error', v_err_msg);
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('posted', v_posted, 'skipped', v_skipped, 'errors', v_errors);
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_downpayments_to_gl() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. REWRITE post_cost_submissions_to_gl()
--    Manual RPC — draft-then-post, no feature flag gate.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.post_cost_submissions_to_gl()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_posted      int  := 0;
  v_skipped     int  := 0;
  v_errors      int  := 0;
  v_rec         RECORD;
  v_entry_id    uuid;
  v_period      RECORD;
  v_fund_id     uuid;
  v_poster_id   uuid;
  v_dr_acct_id  uuid;
  v_cr_acct_id  uuid;
  v_amount      numeric(20,4);
  v_expense_acc text;
  v_idempotency text;
  v_err_msg     text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin','Admin','admin','finance','financialAdmin','accountant')
  ) THEN
    RETURN jsonb_build_object('error', 'Access denied: Finance or Admin role required.');
  END IF;

  SELECT id INTO v_fund_id FROM public.acct_funds WHERE code = 'GENERAL' AND is_active = true LIMIT 1;
  IF v_fund_id IS NULL THEN
    SELECT id INTO v_fund_id FROM public.acct_funds WHERE is_active = true ORDER BY created_at LIMIT 1;
  END IF;
  IF v_fund_id IS NULL THEN
    RETURN jsonb_build_object('error', 'No active fund found.');
  END IF;

  FOR v_rec IN
    SELECT ocs.*
    FROM   public.operational_cost_submissions ocs
    WHERE  ocs.status = 'paid'
      AND  NOT EXISTS (
             SELECT 1 FROM public.acct_gl_bridge_log l
             WHERE  l.source_table = 'operational_cost_submissions'
               AND  l.source_id   = ocs.id
               AND  l.status      = 'success'
           )
    ORDER BY ocs.paid_at, ocs.updated_at
  LOOP
    v_idempotency := 'operational_cost_submissions::' || v_rec.id::text || '::paid';

    IF EXISTS (SELECT 1 FROM public.acct_journal_entries WHERE idempotency_key = v_idempotency) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    BEGIN
      v_amount := COALESCE(v_rec.paid_amount_cents, v_rec.amount_cents, 0) / 100.0;
      IF v_amount <= 0 THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      SELECT fp.* INTO v_period
      FROM   public.acct_fiscal_periods fp
      WHERE  fp.status IN ('open','soft_closed')
        AND  fp.start_date <= COALESCE(v_rec.expense_date, v_rec.paid_at::date, current_date)
        AND  fp.end_date   >= COALESCE(v_rec.expense_date, v_rec.paid_at::date, current_date)
      LIMIT 1;

      IF v_period IS NULL THEN
        SELECT fp.* INTO v_period FROM public.acct_fiscal_periods fp
        WHERE fp.status IN ('open','soft_closed') ORDER BY fp.start_date DESC LIMIT 1;
      END IF;

      IF v_period IS NULL THEN
        INSERT INTO public.acct_gl_bridge_log (source_table, source_id, event_type, status, error_message)
        VALUES ('operational_cost_submissions', v_rec.id, 'ops_cost_paid', 'skipped', 'No open fiscal period');
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      v_expense_acc := public.acct_bridge_ops_cost_account(v_rec.expense_category);

      SELECT id INTO v_dr_acct_id FROM public.acct_accounts
      WHERE code = v_expense_acc AND is_postable = true
        AND (country_id = v_rec.country_id OR country_id IS NULL)
      ORDER BY CASE WHEN country_id IS NOT NULL THEN 0 ELSE 1 END, created_at LIMIT 1;

      SELECT id INTO v_cr_acct_id FROM public.acct_accounts
      WHERE code = '1200' AND is_postable = true
        AND (country_id = v_rec.country_id OR country_id IS NULL)
      ORDER BY CASE WHEN country_id IS NOT NULL THEN 0 ELSE 1 END, created_at LIMIT 1;

      IF v_dr_acct_id IS NULL OR v_cr_acct_id IS NULL THEN
        INSERT INTO public.acct_gl_bridge_log (source_table, source_id, event_type, status, error_message)
        VALUES ('operational_cost_submissions', v_rec.id, 'ops_cost_paid', 'error',
                'Account not found: DR ' || v_expense_acc || ' '
                || CASE WHEN v_dr_acct_id IS NULL THEN 'MISSING' ELSE 'ok' END
                || ', CR 1200 ' || CASE WHEN v_cr_acct_id IS NULL THEN 'MISSING' ELSE 'ok' END);
        v_errors := v_errors + 1;
        CONTINUE;
      END IF;

      v_poster_id := COALESCE(v_rec.tier2_approved_by, v_rec.submitted_by);
      IF v_poster_id IS NULL THEN
        SELECT id INTO v_poster_id FROM public.profiles WHERE lower(role) IN ('super_admin','superadmin') ORDER BY created_at LIMIT 1;
      END IF;

      INSERT INTO public.acct_journal_entries (
        period_id, posting_date, description_en, description_ar,
        source_type, source_id, country_id, status, idempotency_key, posted_by, created_by
      ) VALUES (
        v_period.id,
        COALESCE(v_rec.expense_date, v_rec.paid_at::date, current_date),
        'Operational Cost Paid: ' || COALESCE(v_rec.expense_category, 'general'),
        'تكلفة تشغيلية مدفوعة: '   || COALESCE(v_rec.expense_category, 'عامة'),
        'operational_cost_submissions', v_rec.id, v_rec.country_id, 'draft', v_idempotency, v_poster_id, v_poster_id
      )
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id INTO v_entry_id;

      IF v_entry_id IS NULL THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      INSERT INTO public.acct_journal_lines (
        entry_id, line_no, account_id, fund_id, debit_credit,
        functional_amount, original_amount, original_currency, functional_currency, fx_rate,
        function, description
      ) VALUES
        (v_entry_id, 1, v_dr_acct_id, v_fund_id, 'DR',
         v_amount, v_amount, COALESCE(v_rec.currency,'SDG'), 'SDG', 1.0,
         'program', COALESCE(v_rec.description, v_rec.expense_category)),
        (v_entry_id, 2, v_cr_acct_id, v_fund_id, 'CR',
         v_amount, v_amount, COALESCE(v_rec.currency,'SDG'), 'SDG', 1.0,
         'none', 'Cash Payment — Ops Cost #' || v_rec.id::text);

      UPDATE public.acct_journal_entries
      SET status = 'posted', posted_at = now()
      WHERE id = v_entry_id;

      INSERT INTO public.acct_gl_bridge_log (source_table, source_id, event_type, status, journal_entry_id)
      VALUES ('operational_cost_submissions', v_rec.id, 'ops_cost_paid', 'success', v_entry_id);

      v_posted := v_posted + 1;

    EXCEPTION WHEN OTHERS THEN
      v_err_msg := SQLERRM;
      INSERT INTO public.acct_gl_bridge_log (source_table, source_id, event_type, status, error_message)
      VALUES ('operational_cost_submissions', v_rec.id, 'ops_cost_paid', 'error', v_err_msg);
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('posted', v_posted, 'skipped', v_skipped, 'errors', v_errors);
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_cost_submissions_to_gl() TO authenticated;

COMMIT;
