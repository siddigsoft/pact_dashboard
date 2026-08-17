-- ============================================================
-- Fix GL backfill RPCs: correct account codes + country fallback
-- post_downpayments_to_gl  → was searching '1510'/'1200' (non-existent)
-- post_cost_submissions_to_gl → same cash account bug + missing expense
--   codes remapped to nearest existing account (505000 catch-all)
-- Root cause: COA uses 6-digit codes (151000, 120000); country_id on all
-- postable accounts prevents lookup if advance.country_id doesn't match.
-- Fix: try country-specific first, fall back to any postable with that code.
-- ============================================================

-- ----------------------------------------------------------------
-- 1. post_downpayments_to_gl
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_downpayments_to_gl()
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
  v_dr_acct_id  uuid;   -- 151000 Travel Advances
  v_cr_acct_id  uuid;   -- 120000 Cash at Bank
  v_total_paid  numeric(20,4);
  v_posted_sum  numeric(20,4);
  v_gap         numeric(20,4);
  v_idempotency text;
  v_err_msg     text;
BEGIN
  -- Resolve fund
  SELECT id INTO v_fund_id FROM public.acct_funds
  WHERE  code = 'GENERAL' AND is_active = true LIMIT 1;
  IF v_fund_id IS NULL THEN
    SELECT id INTO v_fund_id FROM public.acct_funds WHERE is_active = true ORDER BY created_at LIMIT 1;
  END IF;
  IF v_fund_id IS NULL THEN
    RETURN jsonb_build_object('error', 'No active fund found.');
  END IF;

  FOR v_rec IN
    SELECT dpr.*
    FROM   public.down_payment_requests dpr
    WHERE  dpr.status IN ('partially_paid', 'fully_paid')
      AND  COALESCE(dpr.total_paid_amount, 0) > 0
    ORDER BY dpr.updated_at
  LOOP
    v_total_paid := COALESCE(v_rec.total_paid_amount, 0);

    -- Sum what's already been posted for this advance
    SELECT COALESCE(SUM(
             CASE
               WHEN l.amount IS NOT NULL THEN l.amount
               WHEN l.journal_entry_id IS NOT NULL THEN (
                 SELECT COALESCE(SUM(jl.functional_amount), 0)
                 FROM   public.acct_journal_lines jl
                 WHERE  jl.entry_id = l.journal_entry_id AND jl.debit_credit = 'DR'
               )
               ELSE 0
             END
           ), 0)
    INTO  v_posted_sum
    FROM  public.acct_gl_bridge_log l
    WHERE l.source_table = 'down_payment_requests'
      AND l.source_id    = v_rec.id
      AND l.status       = 'success';

    v_gap := v_total_paid - v_posted_sum;
    IF v_gap < 0.005 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_idempotency := 'down_payment_requests::' || v_rec.id::text
                  || '::reconcile_' || to_char(v_total_paid, 'FM999999999990.0000');

    IF EXISTS (
      SELECT 1 FROM public.acct_journal_entries
      WHERE  idempotency_key = v_idempotency AND status = 'posted'
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Remove any stale draft for this key
    DELETE FROM public.acct_journal_entries
    WHERE  idempotency_key = v_idempotency AND status = 'draft';

    BEGIN
      -- Open fiscal period
      SELECT fp.* INTO v_period
      FROM   public.acct_fiscal_periods fp
      WHERE  fp.status IN ('open', 'soft_closed')
        AND  fp.start_date <= COALESCE(v_rec.updated_at::date, current_date)
        AND  fp.end_date   >= COALESCE(v_rec.updated_at::date, current_date)
      LIMIT 1;
      IF v_period IS NULL THEN
        SELECT fp.* INTO v_period FROM public.acct_fiscal_periods fp
        WHERE  fp.status IN ('open', 'soft_closed') ORDER BY fp.start_date DESC LIMIT 1;
      END IF;
      IF v_period IS NULL THEN
        INSERT INTO public.acct_gl_bridge_log
          (source_table, source_id, event_type, status, error_message, amount)
        VALUES
          ('down_payment_requests', v_rec.id, 'installment_retroactive',
           'skipped', 'No open fiscal period', v_gap);
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      -- Travel Advances (151000): country-specific first, then global fallback
      SELECT COALESCE(
        (SELECT id FROM public.acct_accounts
          WHERE  code = '151000' AND is_postable = true
            AND  country_id = v_rec.country_id
          ORDER BY created_at LIMIT 1),
        (SELECT id FROM public.acct_accounts
          WHERE  code = '151000' AND is_postable = true
          ORDER BY created_at LIMIT 1)
      ) INTO v_dr_acct_id;

      -- Cash at Bank (120000): country-specific first, then global fallback
      SELECT COALESCE(
        (SELECT id FROM public.acct_accounts
          WHERE  code = '120000' AND is_postable = true
            AND  country_id = v_rec.country_id
          ORDER BY created_at LIMIT 1),
        (SELECT id FROM public.acct_accounts
          WHERE  code = '120000' AND is_postable = true
          ORDER BY created_at LIMIT 1)
      ) INTO v_cr_acct_id;

      IF v_dr_acct_id IS NULL OR v_cr_acct_id IS NULL THEN
        INSERT INTO public.acct_gl_bridge_log
          (source_table, source_id, event_type, status, error_message, amount)
        VALUES (
          'down_payment_requests', v_rec.id, 'installment_retroactive', 'error',
          'Account 151000 ' || CASE WHEN v_dr_acct_id IS NULL THEN 'MISSING' ELSE 'ok' END
          || ', 120000 '    || CASE WHEN v_cr_acct_id IS NULL THEN 'MISSING' ELSE 'ok' END,
          v_gap
        );
        v_errors := v_errors + 1;
        CONTINUE;
      END IF;

      v_poster_id := COALESCE(v_rec.admin_processed_by, v_rec.requested_by);
      IF v_poster_id IS NULL THEN
        SELECT id INTO v_poster_id FROM public.profiles
        WHERE  lower(role) IN ('super_admin', 'superadmin') ORDER BY created_at LIMIT 1;
      END IF;

      INSERT INTO public.acct_journal_entries (
        period_id, posting_date, description_en, description_ar,
        source_type, source_id, country_id,
        status, idempotency_key, posted_by, created_by
      ) VALUES (
        v_period.id,
        COALESCE(v_rec.updated_at::date, current_date),
        CASE v_rec.status
          WHEN 'fully_paid'
            THEN 'Field Advance (Retro Full): '    || COALESCE(v_rec.site_name, v_rec.id::text)
          ELSE     'Field Advance (Retro Partial): ' || COALESCE(v_rec.site_name, v_rec.id::text)
        END,
        CASE v_rec.status
          WHEN 'fully_paid'
            THEN 'سلفة ميدانية (إعادة ترحيل كاملة): '  || COALESCE(v_rec.site_name, v_rec.id::text)
          ELSE     'سلفة ميدانية (إعادة ترحيل جزئية): ' || COALESCE(v_rec.site_name, v_rec.id::text)
        END,
        'down_payment_requests', v_rec.id, v_rec.country_id,
        'draft', v_idempotency, v_poster_id, v_poster_id
      ) RETURNING id INTO v_entry_id;

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
         v_gap, v_gap, 'SDG', 'SDG', 1.0,
         'program', 'Travel Advance (retro) — ' || COALESCE(v_rec.site_name, 'Field Site')),
        (v_entry_id, 2, v_cr_acct_id, v_fund_id, 'CR',
         v_gap, v_gap, 'SDG', 'SDG', 1.0,
         'none', 'Cash (retro) — Advance #' || v_rec.id::text);

      UPDATE public.acct_journal_entries
      SET    status = 'posted', posted_at = now()
      WHERE  id = v_entry_id;

      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, journal_entry_id, amount)
      VALUES
        ('down_payment_requests', v_rec.id, 'installment_retroactive',
         'success', v_entry_id, v_gap);

      v_posted := v_posted + 1;

    EXCEPTION WHEN OTHERS THEN
      v_err_msg := SQLERRM;
      IF v_entry_id IS NOT NULL THEN
        DELETE FROM public.acct_journal_entries WHERE id = v_entry_id AND status = 'draft';
      END IF;
      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message, amount)
      VALUES
        ('down_payment_requests', v_rec.id, 'installment_retroactive', 'error', v_err_msg, v_gap);
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('posted', v_posted, 'skipped', v_skipped, 'errors', v_errors);
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_downpayments_to_gl() TO authenticated;


-- ----------------------------------------------------------------
-- 2. post_cost_submissions_to_gl
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_cost_submissions_to_gl()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_posted       int  := 0;
  v_skipped      int  := 0;
  v_errors       int  := 0;
  v_rec          RECORD;
  v_entry_id     uuid;
  v_period_id    uuid;
  v_fund_id      uuid;
  v_poster_id    uuid;
  v_dr_acct_id   uuid;
  v_cr_acct_id   uuid;
  v_amount       numeric(20,4);
  v_expense_code text;
  v_err_msg      text;
BEGIN
  SELECT id INTO v_fund_id FROM public.acct_funds
  WHERE  code = 'GENERAL' AND is_active = true LIMIT 1;
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
    BEGIN
      v_amount := COALESCE(v_rec.paid_amount_cents, v_rec.amount_cents, 0) / 100.0;
      IF v_amount <= 0 THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      -- Get the mapped expense account code from the bridge helper
      v_expense_code := public.acct_bridge_ops_cost_account(v_rec.expense_category);

      -- Try exact code match (country-aware), then global fallback
      SELECT id INTO v_dr_acct_id
      FROM   public.acct_accounts
      WHERE  code = v_expense_code AND is_postable = true
        AND  (country_id = v_rec.country_id OR country_id IS NULL OR v_rec.country_id IS NULL)
      ORDER BY CASE WHEN country_id = v_rec.country_id THEN 0 ELSE 1 END, created_at
      LIMIT 1;

      -- If code doesn't exist at all, fall back to 505000 (Operational Field Costs)
      IF v_dr_acct_id IS NULL THEN
        SELECT id INTO v_dr_acct_id FROM public.acct_accounts
        WHERE  code = '505000' AND is_postable = true
        ORDER BY created_at LIMIT 1;
      END IF;

      -- Cash at Bank (120000): country-specific first, then global fallback
      SELECT COALESCE(
        (SELECT id FROM public.acct_accounts
          WHERE  code = '120000' AND is_postable = true
            AND  country_id = v_rec.country_id
          ORDER BY created_at LIMIT 1),
        (SELECT id FROM public.acct_accounts
          WHERE  code = '120000' AND is_postable = true
          ORDER BY created_at LIMIT 1)
      ) INTO v_cr_acct_id;

      IF v_dr_acct_id IS NULL OR v_cr_acct_id IS NULL THEN
        INSERT INTO public.acct_gl_bridge_log
          (source_table, source_id, event_type, status, error_message)
        VALUES (
          'operational_cost_submissions', v_rec.id, 'ops_cost_paid', 'error',
          'Account not found — DR ' || v_expense_code || ': '
          || CASE WHEN v_dr_acct_id IS NULL THEN 'MISSING (no 505000 fallback)' ELSE 'ok' END
          || ', CR 120000: '
          || CASE WHEN v_cr_acct_id IS NULL THEN 'MISSING' ELSE 'ok' END
        );
        v_errors := v_errors + 1;
        CONTINUE;
      END IF;

      -- Fiscal period
      SELECT fp.id INTO v_period_id
      FROM   public.acct_fiscal_periods fp
      WHERE  fp.status IN ('open', 'soft_closed')
        AND  fp.start_date <= COALESCE(v_rec.expense_date, v_rec.paid_at::date, current_date)
        AND  fp.end_date   >= COALESCE(v_rec.expense_date, v_rec.paid_at::date, current_date)
      LIMIT 1;
      IF v_period_id IS NULL THEN
        SELECT fp.id INTO v_period_id FROM public.acct_fiscal_periods fp
        WHERE  fp.status IN ('open', 'soft_closed') ORDER BY fp.start_date DESC LIMIT 1;
      END IF;
      IF v_period_id IS NULL THEN
        INSERT INTO public.acct_gl_bridge_log
          (source_table, source_id, event_type, status, error_message)
        VALUES
          ('operational_cost_submissions', v_rec.id, 'ops_cost_paid',
           'skipped', 'No open fiscal period');
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      v_poster_id := COALESCE(v_rec.tier2_approved_by, v_rec.tier1_approved_by);
      IF v_poster_id IS NULL THEN
        SELECT id INTO v_poster_id FROM public.profiles
        WHERE  lower(role) IN ('super_admin', 'superadmin') ORDER BY created_at LIMIT 1;
      END IF;

      INSERT INTO public.acct_journal_entries (
        period_id, posting_date, description_en, description_ar,
        source_type, source_id, country_id,
        status, posted_by, created_by
      ) VALUES (
        v_period_id,
        COALESCE(v_rec.expense_date, v_rec.paid_at::date, current_date),
        'Operational Cost Paid: ' || COALESCE(v_rec.expense_category, 'general'),
        'تكلفة تشغيلية مدفوعة: '   || COALESCE(v_rec.expense_category, 'عامة'),
        'operational_cost_submissions', v_rec.id, v_rec.country_id,
        'draft', v_poster_id, v_poster_id
      ) RETURNING id INTO v_entry_id;

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
         v_amount, v_amount, COALESCE(v_rec.currency, 'SDG'), 'SDG', 1.0,
         'program', COALESCE(v_rec.description, v_rec.expense_category)),
        (v_entry_id, 2, v_cr_acct_id, v_fund_id, 'CR',
         v_amount, v_amount, COALESCE(v_rec.currency, 'SDG'), 'SDG', 1.0,
         'none', 'Cash Payment — Ops Cost #' || v_rec.id::text);

      UPDATE public.acct_journal_entries
      SET    status = 'posted', posted_at = now()
      WHERE  id = v_entry_id;

      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, journal_entry_id)
      VALUES
        ('operational_cost_submissions', v_rec.id, 'ops_cost_paid', 'success', v_entry_id);

      v_posted := v_posted + 1;

    EXCEPTION WHEN OTHERS THEN
      v_err_msg := SQLERRM;
      IF v_entry_id IS NOT NULL THEN
        DELETE FROM public.acct_journal_entries WHERE id = v_entry_id AND status = 'draft';
      END IF;
      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message)
      VALUES
        ('operational_cost_submissions', v_rec.id, 'ops_cost_paid', 'error', v_err_msg);
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('posted', v_posted, 'skipped', v_skipped, 'errors', v_errors);
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_cost_submissions_to_gl() TO authenticated;
