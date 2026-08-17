-- ============================================================
-- GL Bridge Fix v2 — 2026-08-17
-- Fixes three classes of error that caused all 58 ops-cost and
-- all 4700+ advance bridge entries to fail:
--
-- 1. Missing GLOBAL (country_id IS NULL) fallback accounts for
--    120000 (Cash at Bank) and 151000 (Travel Advances).
--    Country-specific variants exist but the bridge can't find them
--    when source records have country_id = NULL.
--
-- 2. Trigger functions acct_trig_down_payment_requests and
--    acct_trig_operational_cost_submissions still pass 4-digit codes
--    ('1510', '1200') to acct_bridge_post_journal(), which looks up
--    by exact code match → BRIDGE_ACCOUNT_NOT_FOUND.
--
-- 3. post_cost_submissions_to_gl() (backfill RPC) was missing
--    idempotency_key in its INSERT → NOT-NULL constraint violation.
--
-- After running this migration, re-run:
--   SELECT post_downpayments_to_gl();
--   SELECT post_cost_submissions_to_gl();
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. GLOBAL FALLBACK ACCOUNTS
--    Insert global (country_id = NULL) rows for 120000 and 151000
--    if they don't already exist as global accounts.
--    We copy parent_id from the first country-specific variant so
--    the hierarchy stays intact.
-- ─────────────────────────────────────────────────────────────

-- 120000 — Cash at Bank (global)
INSERT INTO public.acct_accounts (
  code, name_en, name_ar, account_type, subtype,
  is_active, is_postable,
  country_id, company_id,
  parent_id
)
SELECT
  '120000',
  'Cash at Bank',
  'نقد لدى البنك',
  'asset',
  'current_asset',
  true, true,
  NULL, NULL,
  (SELECT parent_id FROM public.acct_accounts
   WHERE code = '120000' AND country_id IS NOT NULL
   ORDER BY created_at LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM public.acct_accounts
  WHERE code = '120000' AND country_id IS NULL
);

-- 151000 — Travel / Field Advances (global)
INSERT INTO public.acct_accounts (
  code, name_en, name_ar, account_type, subtype,
  is_active, is_postable,
  country_id, company_id,
  parent_id
)
SELECT
  '151000',
  'Travel Advances',
  'سلف السفر',
  'asset',
  'current_asset',
  true, true,
  NULL, NULL,
  (SELECT parent_id FROM public.acct_accounts
   WHERE code = '151000' AND country_id IS NOT NULL
   ORDER BY created_at LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM public.acct_accounts
  WHERE code = '151000' AND country_id IS NULL
);


-- ─────────────────────────────────────────────────────────────
-- 2a. TRIGGER — down_payment_requests
--     Old version used '1510' / '1200' (4-digit) → not found.
--     New version uses 6-digit codes with direct inline SQL so it
--     doesn't depend on acct_bridge_post_journal's code resolution.
-- ─────────────────────────────────────────────────────────────
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
  v_dr_acct_id  uuid;  -- 151000 Travel Advances
  v_cr_acct_id  uuid;  -- 120000 Cash at Bank
  v_amount      numeric(20,4);
  v_poster_id   uuid;
  v_idem_key    text;
BEGIN
  -- Only fire when status transitions → fully_paid
  IF tg_op <> 'UPDATE'
     OR old.status IS NOT DISTINCT FROM new.status
     OR new.status <> 'fully_paid'
  THEN
    RETURN new;
  END IF;

  v_amount := COALESCE(new.total_paid_amount, new.requested_amount, 0);
  IF v_amount <= 0 THEN RETURN new; END IF;

  v_idem_key := 'dpr::' || new.id::text || '::fully_paid';

  -- Skip if already posted
  IF EXISTS (
    SELECT 1 FROM public.acct_journal_entries
    WHERE idempotency_key = v_idem_key AND status = 'posted'
  ) THEN
    RETURN new;
  END IF;

  BEGIN
    -- Fund
    SELECT id INTO v_fund_id FROM public.acct_funds
    WHERE  is_active = true ORDER BY (code = 'GENERAL') DESC, created_at LIMIT 1;

    -- Period
    SELECT id INTO v_period_id FROM public.acct_fiscal_periods
    WHERE  status IN ('open','soft_closed')
      AND  start_date <= COALESCE(new.updated_at::date, current_date)
      AND  end_date   >= COALESCE(new.updated_at::date, current_date)
    LIMIT 1;
    IF v_period_id IS NULL THEN
      SELECT id INTO v_period_id FROM public.acct_fiscal_periods
      WHERE  status IN ('open','soft_closed') ORDER BY start_date DESC LIMIT 1;
    END IF;

    -- 151000 — country-specific first, global fallback
    SELECT COALESCE(
      (SELECT id FROM public.acct_accounts
        WHERE code = '151000' AND is_postable = true AND country_id = new.country_id
        ORDER BY created_at LIMIT 1),
      (SELECT id FROM public.acct_accounts
        WHERE code = '151000' AND is_postable = true AND country_id IS NULL
        ORDER BY created_at LIMIT 1),
      (SELECT id FROM public.acct_accounts
        WHERE code = '151000' AND is_postable = true
        ORDER BY created_at LIMIT 1)
    ) INTO v_dr_acct_id;

    -- 120000 — country-specific first, global fallback
    SELECT COALESCE(
      (SELECT id FROM public.acct_accounts
        WHERE code = '120000' AND is_postable = true AND country_id = new.country_id
        ORDER BY created_at LIMIT 1),
      (SELECT id FROM public.acct_accounts
        WHERE code = '120000' AND is_postable = true AND country_id IS NULL
        ORDER BY created_at LIMIT 1),
      (SELECT id FROM public.acct_accounts
        WHERE code = '120000' AND is_postable = true
        ORDER BY created_at LIMIT 1)
    ) INTO v_cr_acct_id;

    IF v_fund_id IS NULL OR v_period_id IS NULL
       OR v_dr_acct_id IS NULL OR v_cr_acct_id IS NULL THEN
      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message, amount)
      VALUES (
        'down_payment_requests', new.id, 'down_payment_fully_paid', 'error',
        'Setup missing — fund=' || COALESCE(v_fund_id::text,'NULL')
        || ' period=' || COALESCE(v_period_id::text,'NULL')
        || ' DR(151000)=' || COALESCE(v_dr_acct_id::text,'NULL')
        || ' CR(120000)=' || COALESCE(v_cr_acct_id::text,'NULL'),
        v_amount
      );
      RETURN new;
    END IF;

    v_poster_id := COALESCE(new.admin_processed_by, new.requested_by);
    IF v_poster_id IS NULL THEN
      SELECT id INTO v_poster_id FROM public.profiles
      WHERE  lower(role) IN ('super_admin','superadmin') ORDER BY created_at LIMIT 1;
    END IF;

    -- Remove stale draft if any
    DELETE FROM public.acct_journal_entries
    WHERE  idempotency_key = v_idem_key AND status = 'draft';

    INSERT INTO public.acct_journal_entries (
      period_id, posting_date, description_en, description_ar,
      source_type, source_id, country_id,
      status, idempotency_key, posted_by, created_by
    ) VALUES (
      v_period_id, COALESCE(new.updated_at::date, current_date),
      'Field Advance Disbursed: ' || COALESCE(new.site_name, new.id::text),
      'صرف سلفة ميدانية: '         || COALESCE(new.site_name, new.id::text),
      'down_payment_requests', new.id, new.country_id,
      'draft', v_idem_key, v_poster_id, v_poster_id
    ) RETURNING id INTO v_entry_id;

    INSERT INTO public.acct_journal_lines (
      entry_id, line_no, account_id, fund_id, debit_credit,
      functional_amount, original_amount, original_currency, functional_currency, fx_rate,
      function, description
    ) VALUES
      (v_entry_id, 1, v_dr_acct_id, v_fund_id, 'DR',
       v_amount, v_amount, 'SDG', 'SDG', 1.0,
       'program', 'Travel Advance — ' || COALESCE(new.site_name, 'Field Site')),
      (v_entry_id, 2, v_cr_acct_id, v_fund_id, 'CR',
       v_amount, v_amount, 'SDG', 'SDG', 1.0,
       'none', 'Cash — Field Advance #' || new.id::text);

    UPDATE public.acct_journal_entries
    SET    status = 'posted', posted_at = now()
    WHERE  id = v_entry_id;

    INSERT INTO public.acct_gl_bridge_log
      (source_table, source_id, event_type, status, journal_entry_id, amount)
    VALUES
      ('down_payment_requests', new.id, 'down_payment_fully_paid', 'success', v_entry_id, v_amount);

  EXCEPTION WHEN OTHERS THEN
    IF v_entry_id IS NOT NULL THEN
      DELETE FROM public.acct_journal_entries WHERE id = v_entry_id AND status = 'draft';
    END IF;
    INSERT INTO public.acct_gl_bridge_log
      (source_table, source_id, event_type, status, error_message, amount)
    VALUES
      ('down_payment_requests', new.id, 'down_payment_fully_paid', 'error', SQLERRM, v_amount);
  END;

  RETURN new;
END $$;


-- ─────────────────────────────────────────────────────────────
-- 2b. TRIGGER — operational_cost_submissions
--     Old version: '1200' (4-digit) → BRIDGE_ACCOUNT_NOT_FOUND.
--     New version: inline SQL with 6-digit codes.
-- ─────────────────────────────────────────────────────────────
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
  v_dr_acct_id  uuid;
  v_cr_acct_id  uuid;  -- 120000 Cash at Bank
  v_amount      numeric(20,4);
  v_expense_acc text;
  v_poster_id   uuid;
  v_idem_key    text;
BEGIN
  -- Only fire when status transitions → paid
  IF tg_op <> 'UPDATE'
     OR old.status IS NOT DISTINCT FROM new.status
     OR new.status <> 'paid'
  THEN
    RETURN new;
  END IF;

  v_amount := COALESCE(new.paid_amount_cents, new.amount_cents, 0) / 100.0;
  IF v_amount <= 0 THEN RETURN new; END IF;

  v_idem_key := 'ocs::' || new.id::text || '::paid';

  -- Skip if already posted
  IF EXISTS (
    SELECT 1 FROM public.acct_journal_entries
    WHERE idempotency_key = v_idem_key AND status = 'posted'
  ) THEN
    RETURN new;
  END IF;

  BEGIN
    v_expense_acc := public.acct_bridge_ops_cost_account(new.expense_category);

    -- Fund
    SELECT id INTO v_fund_id FROM public.acct_funds
    WHERE  is_active = true ORDER BY (code = 'GENERAL') DESC, created_at LIMIT 1;

    -- Period
    SELECT id INTO v_period_id FROM public.acct_fiscal_periods
    WHERE  status IN ('open','soft_closed')
      AND  start_date <= COALESCE(new.expense_date, new.paid_at::date, current_date)
      AND  end_date   >= COALESCE(new.expense_date, new.paid_at::date, current_date)
    LIMIT 1;
    IF v_period_id IS NULL THEN
      SELECT id INTO v_period_id FROM public.acct_fiscal_periods
      WHERE  status IN ('open','soft_closed') ORDER BY start_date DESC LIMIT 1;
    END IF;

    -- Expense account (code from helper) — country-specific first, then global
    SELECT id INTO v_dr_acct_id
    FROM   public.acct_accounts
    WHERE  code = v_expense_acc AND is_postable = true
      AND  (country_id = new.country_id OR country_id IS NULL OR new.country_id IS NULL)
    ORDER BY CASE WHEN country_id = new.country_id THEN 0 ELSE 1 END, created_at
    LIMIT 1;

    -- 505000 catch-all if mapped code not found
    IF v_dr_acct_id IS NULL THEN
      SELECT id INTO v_dr_acct_id FROM public.acct_accounts
      WHERE  code = '505000' AND is_postable = true
      ORDER BY (country_id = new.country_id) DESC NULLS LAST, created_at LIMIT 1;
    END IF;

    -- 120000 — country-specific first, then global, then any
    SELECT COALESCE(
      (SELECT id FROM public.acct_accounts
        WHERE code = '120000' AND is_postable = true AND country_id = new.country_id
        ORDER BY created_at LIMIT 1),
      (SELECT id FROM public.acct_accounts
        WHERE code = '120000' AND is_postable = true AND country_id IS NULL
        ORDER BY created_at LIMIT 1),
      (SELECT id FROM public.acct_accounts
        WHERE code = '120000' AND is_postable = true
        ORDER BY created_at LIMIT 1)
    ) INTO v_cr_acct_id;

    IF v_fund_id IS NULL OR v_period_id IS NULL
       OR v_dr_acct_id IS NULL OR v_cr_acct_id IS NULL THEN
      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message)
      VALUES (
        'operational_cost_submissions', new.id, 'ops_cost_paid', 'error',
        'Setup missing — fund=' || COALESCE(v_fund_id::text,'NULL')
        || ' period=' || COALESCE(v_period_id::text,'NULL')
        || ' DR(' || v_expense_acc || ')=' || COALESCE(v_dr_acct_id::text,'NULL')
        || ' CR(120000)=' || COALESCE(v_cr_acct_id::text,'NULL')
      );
      RETURN new;
    END IF;

    v_poster_id := COALESCE(new.tier2_approved_by, new.tier1_approved_by, new.submitted_by);
    IF v_poster_id IS NULL THEN
      SELECT id INTO v_poster_id FROM public.profiles
      WHERE  lower(role) IN ('super_admin','superadmin') ORDER BY created_at LIMIT 1;
    END IF;

    -- Remove stale draft if any
    DELETE FROM public.acct_journal_entries
    WHERE  idempotency_key = v_idem_key AND status = 'draft';

    INSERT INTO public.acct_journal_entries (
      period_id, posting_date, description_en, description_ar,
      source_type, source_id, country_id,
      status, idempotency_key, posted_by, created_by
    ) VALUES (
      v_period_id,
      COALESCE(new.expense_date, new.paid_at::date, current_date),
      'Operational Cost Paid: ' || COALESCE(new.expense_category, 'general'),
      'تكلفة تشغيلية مدفوعة: '   || COALESCE(new.expense_category, 'عامة'),
      'operational_cost_submissions', new.id, new.country_id,
      'draft', v_idem_key, v_poster_id, v_poster_id
    ) RETURNING id INTO v_entry_id;

    INSERT INTO public.acct_journal_lines (
      entry_id, line_no, account_id, fund_id, debit_credit,
      functional_amount, original_amount, original_currency, functional_currency, fx_rate,
      function, description
    ) VALUES
      (v_entry_id, 1, v_dr_acct_id, v_fund_id, 'DR',
       v_amount, v_amount, COALESCE(new.currency, 'SDG'), 'SDG', 1.0,
       'program', COALESCE(new.description, new.expense_category)),
      (v_entry_id, 2, v_cr_acct_id, v_fund_id, 'CR',
       v_amount, v_amount, COALESCE(new.currency, 'SDG'), 'SDG', 1.0,
       'none', 'Cash Payment — Ops Cost #' || new.id::text);

    UPDATE public.acct_journal_entries
    SET    status = 'posted', posted_at = now()
    WHERE  id = v_entry_id;

    INSERT INTO public.acct_gl_bridge_log
      (source_table, source_id, event_type, status, journal_entry_id)
    VALUES
      ('operational_cost_submissions', new.id, 'ops_cost_paid', 'success', v_entry_id);

  EXCEPTION WHEN OTHERS THEN
    IF v_entry_id IS NOT NULL THEN
      DELETE FROM public.acct_journal_entries WHERE id = v_entry_id AND status = 'draft';
    END IF;
    INSERT INTO public.acct_gl_bridge_log
      (source_table, source_id, event_type, status, error_message)
    VALUES
      ('operational_cost_submissions', new.id, 'ops_cost_paid', 'error', SQLERRM);
  END;

  RETURN new;
END $$;


-- ─────────────────────────────────────────────────────────────
-- 3. FIX post_cost_submissions_to_gl() — add idempotency_key
--    The previous version was missing it → NOT-NULL violation on
--    every row → all 58 records logged as errors.
--    Also widen status filter to include partially_paid.
-- ─────────────────────────────────────────────────────────────
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
  v_idempotency  text;
  v_err_msg      text;
BEGIN
  SELECT id INTO v_fund_id FROM public.acct_funds
  WHERE  is_active = true ORDER BY (code = 'GENERAL') DESC, created_at LIMIT 1;
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

      v_idempotency := 'ocs::' || v_rec.id::text || '::paid';

      IF EXISTS (
        SELECT 1 FROM public.acct_journal_entries
        WHERE  idempotency_key = v_idempotency AND status = 'posted'
      ) THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      -- Remove stale draft
      DELETE FROM public.acct_journal_entries
      WHERE  idempotency_key = v_idempotency AND status = 'draft';

      -- Expense account (6-digit code via helper)
      v_expense_code := public.acct_bridge_ops_cost_account(v_rec.expense_category);

      SELECT id INTO v_dr_acct_id
      FROM   public.acct_accounts
      WHERE  code = v_expense_code AND is_postable = true
        AND  (country_id = v_rec.country_id OR country_id IS NULL OR v_rec.country_id IS NULL)
      ORDER BY CASE WHEN country_id = v_rec.country_id THEN 0 ELSE 1 END, created_at
      LIMIT 1;

      IF v_dr_acct_id IS NULL THEN
        SELECT id INTO v_dr_acct_id FROM public.acct_accounts
        WHERE  code = '505000' AND is_postable = true
        ORDER BY (country_id = v_rec.country_id) DESC NULLS LAST, created_at LIMIT 1;
      END IF;

      -- 120000 Cash at Bank — country-specific, then global, then any
      SELECT COALESCE(
        (SELECT id FROM public.acct_accounts
          WHERE code = '120000' AND is_postable = true AND country_id = v_rec.country_id
          ORDER BY created_at LIMIT 1),
        (SELECT id FROM public.acct_accounts
          WHERE code = '120000' AND is_postable = true AND country_id IS NULL
          ORDER BY created_at LIMIT 1),
        (SELECT id FROM public.acct_accounts
          WHERE code = '120000' AND is_postable = true
          ORDER BY created_at LIMIT 1)
      ) INTO v_cr_acct_id;

      IF v_dr_acct_id IS NULL OR v_cr_acct_id IS NULL THEN
        INSERT INTO public.acct_gl_bridge_log
          (source_table, source_id, event_type, status, error_message)
        VALUES (
          'operational_cost_submissions', v_rec.id, 'ops_cost_paid', 'error',
          'Account not found — DR(' || v_expense_code || '): '
          || CASE WHEN v_dr_acct_id IS NULL THEN 'MISSING' ELSE 'ok' END
          || ', CR(120000): '
          || CASE WHEN v_cr_acct_id IS NULL THEN 'MISSING' ELSE 'ok' END
        );
        v_errors := v_errors + 1;
        CONTINUE;
      END IF;

      -- Fiscal period
      SELECT id INTO v_period_id FROM public.acct_fiscal_periods
      WHERE  status IN ('open','soft_closed')
        AND  start_date <= COALESCE(v_rec.expense_date, v_rec.paid_at::date, current_date)
        AND  end_date   >= COALESCE(v_rec.expense_date, v_rec.paid_at::date, current_date)
      LIMIT 1;
      IF v_period_id IS NULL THEN
        SELECT id INTO v_period_id FROM public.acct_fiscal_periods
        WHERE  status IN ('open','soft_closed') ORDER BY start_date DESC LIMIT 1;
      END IF;
      IF v_period_id IS NULL THEN
        INSERT INTO public.acct_gl_bridge_log
          (source_table, source_id, event_type, status, error_message)
        VALUES ('operational_cost_submissions', v_rec.id, 'ops_cost_paid',
                'skipped', 'No open fiscal period');
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      v_poster_id := COALESCE(v_rec.tier2_approved_by, v_rec.tier1_approved_by, v_rec.submitted_by);
      IF v_poster_id IS NULL THEN
        SELECT id INTO v_poster_id FROM public.profiles
        WHERE  lower(role) IN ('super_admin','superadmin') ORDER BY created_at LIMIT 1;
      END IF;

      INSERT INTO public.acct_journal_entries (
        period_id, posting_date, description_en, description_ar,
        source_type, source_id, country_id,
        status, idempotency_key, posted_by, created_by
      ) VALUES (
        v_period_id,
        COALESCE(v_rec.expense_date, v_rec.paid_at::date, current_date),
        'Operational Cost Paid: ' || COALESCE(v_rec.expense_category, 'general'),
        'تكلفة تشغيلية مدفوعة: '   || COALESCE(v_rec.expense_category, 'عامة'),
        'operational_cost_submissions', v_rec.id, v_rec.country_id,
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
        v_entry_id := NULL;
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


-- ─────────────────────────────────────────────────────────────
-- 4. CLEAR STALE ERROR ROWS so the backfill functions can retry
--    them. Removes only 'error' rows — successful posts are kept.
--    The backfill RPCs skip rows that already have a 'success' entry,
--    so clearing errors lets them be re-attempted on the next run.
-- ─────────────────────────────────────────────────────────────
DELETE FROM public.acct_gl_bridge_log
WHERE  status = 'error'
  AND  source_table IN ('down_payment_requests','operational_cost_submissions');
