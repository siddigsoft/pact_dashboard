-- =============================================================================
-- Chart of Accounts company scoping
-- Date: 2026-08-21
--
-- Maps the active PACT companies to their operating countries, assigns every
-- country-specific account to that company, and keeps global accounts shared.
-- It also adds company ownership to GL lines and updates the two live bridge
-- triggers originally introduced by 20260817_fix_gl_bridge_v2.sql.
--
-- Safe to re-run: all data updates are deterministic and trigger functions are
-- replaced in place.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Map each PACT operating company to its country.
-- -----------------------------------------------------------------------------
WITH company_country_map (company_name, country_code) AS (
  VALUES
    ('PACT Sudan', 'SD'),
    ('PACT S.SUDAN', 'SS'),
    ('PACT Rwanda', 'RW'),
    ('PACT Uganda', 'UG')
)
UPDATE public.companies AS company
SET country_id = country.id
FROM company_country_map AS mapping
JOIN public.countries AS country
  ON upper(country.code) = mapping.country_code
WHERE company.name_en = mapping.company_name
  AND company.country_id IS DISTINCT FROM country.id;

-- Do not leave the COA partially scoped if the required reference data is
-- incomplete or ambiguous. The error tells Finance exactly what must be
-- created or de-duplicated before account ownership can be assigned safely.
DO $$
DECLARE
  invalid_mappings text;
BEGIN
  WITH company_country_map (company_name, country_code) AS (
    VALUES
      ('PACT Sudan', 'SD'),
      ('PACT S.SUDAN', 'SS'),
      ('PACT Rwanda', 'RW'),
      ('PACT Uganda', 'UG')
  ),
  mapping_counts AS (
    SELECT
      mapping.company_name,
      mapping.country_code,
      count(company.id) AS company_count
    FROM company_country_map AS mapping
    LEFT JOIN public.countries AS country
      ON upper(country.code) = mapping.country_code
    LEFT JOIN public.companies AS company
      ON company.name_en = mapping.company_name
     AND company.country_id = country.id
    GROUP BY mapping.company_name, mapping.country_code
  )
  SELECT string_agg(
    company_name || ' → ' || country_code || ' (' || company_count || ' matches)',
    ', ' ORDER BY company_name
  )
  INTO invalid_mappings
  FROM mapping_counts
  WHERE company_count <> 1;

  IF invalid_mappings IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot scope the Chart of Accounts until every company/country mapping has exactly one company: %',
      invalid_mappings;
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Scope country-specific accounts to the company for that country.
--    Rows with neither a country nor a company are deliberately global and
--    remain unscoped. Preserve existing company ownership on countryless Odoo
--    import rows, because that ownership is more specific than country data.
-- -----------------------------------------------------------------------------
WITH company_country_map (company_name) AS (
  VALUES
    ('PACT Sudan'),
    ('PACT S.SUDAN'),
    ('PACT Rwanda'),
    ('PACT Uganda')
),
target_companies AS (
  SELECT company.id, company.country_id
  FROM public.companies AS company
  JOIN company_country_map AS mapping
    ON mapping.company_name = company.name_en
)
UPDATE public.acct_accounts AS account
SET company_id = company.id
FROM target_companies AS company
WHERE account.country_id = company.country_id
  AND account.country_id IS NOT NULL
  AND account.company_id IS DISTINCT FROM company.id;

-- A row is global only when both dimensions are unassigned. Do not clear
-- company_id for countryless rows: the Odoo import uses that shape for
-- company-specific accounts and the COA filter relies on it.

-- Country-specific accounts outside the four supported PACT operating
-- countries cannot be safely assigned. Fail rather than silently displaying
-- them as global accounts in every company view.
DO $$
DECLARE
  unmapped_country_codes text;
BEGIN
  SELECT string_agg(DISTINCT country.code, ', ' ORDER BY country.code)
  INTO unmapped_country_codes
  FROM public.acct_accounts AS account
  JOIN public.countries AS country
    ON country.id = account.country_id
  WHERE account.country_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.companies AS company
      WHERE company.country_id = account.country_id
        AND company.name_en IN (
          'PACT Sudan',
          'PACT S.SUDAN',
          'PACT Rwanda',
          'PACT Uganda'
        )
    );

  IF unmapped_country_codes IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot scope country-specific accounts because no PACT company is mapped for country code(s): %',
      unmapped_country_codes;
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Store company ownership on journal lines.
--    The bridge uses this to keep global accounts attached to the source
--    company while account_id itself can still reference a shared account.
-- -----------------------------------------------------------------------------
ALTER TABLE public.acct_journal_lines
  ADD COLUMN IF NOT EXISTS company_id uuid
  REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_acct_journal_lines_company_id
  ON public.acct_journal_lines(company_id);

-- Bring existing country-stamped journal entries in line with the new model.
WITH company_country_map (company_name) AS (
  VALUES
    ('PACT Sudan'),
    ('PACT S.SUDAN'),
    ('PACT Rwanda'),
    ('PACT Uganda')
),
target_companies AS (
  SELECT company.id, company.country_id
  FROM public.companies AS company
  JOIN company_country_map AS mapping
    ON mapping.company_name = company.name_en
)
UPDATE public.acct_journal_lines AS line
SET company_id = company.id
FROM public.acct_journal_entries AS entry
JOIN target_companies AS company
  ON company.country_id = entry.country_id
WHERE line.entry_id = entry.id
  AND line.company_id IS NULL;

-- -----------------------------------------------------------------------------
-- 4. Scope all GL bridge lines centrally.
--    The two automatic triggers below pass company_id explicitly. This guard
--    also covers existing manual backfill and targeted-retry RPCs so they
--    cannot select a countryless account belonging to a different company.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.acct_scope_gl_bridge_journal_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_type       text;
  v_country_id        uuid;
  v_company_id        uuid;
  v_account_code      text;
  v_scoped_account_id uuid;
BEGIN
  SELECT entry.source_type, entry.country_id
  INTO v_source_type, v_country_id
  FROM public.acct_journal_entries AS entry
  WHERE entry.id = new.entry_id;

  IF NOT FOUND
     OR v_source_type NOT IN ('down_payment_requests', 'operational_cost_submissions')
  THEN
    RETURN new;
  END IF;

  SELECT company.id
  INTO v_company_id
  FROM public.companies AS company
  WHERE company.country_id = v_country_id
    AND company.name_en IN ('PACT Sudan', 'PACT S.SUDAN', 'PACT Rwanda', 'PACT Uganda')
  ORDER BY company.name_en
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION
      'GL bridge entry % has no company mapped to country %',
      new.entry_id, coalesce(v_country_id::text, 'NULL');
  END IF;

  SELECT account.code
  INTO v_account_code
  FROM public.acct_accounts AS account
  WHERE account.id = new.account_id;

  IF v_account_code IS NULL THEN
    RAISE EXCEPTION 'GL bridge account % does not exist', new.account_id;
  END IF;

  -- Prefer a country-local account, then a countryless account owned by the
  -- source company, then a truly global (unowned) fallback. Never let a
  -- countryless account belonging to another company cross the company boundary.
  SELECT account.id
  INTO v_scoped_account_id
  FROM public.acct_accounts AS account
  WHERE account.code = v_account_code
    AND account.is_postable = true
    AND (
      (account.country_id = v_country_id AND account.company_id = v_company_id)
      OR (account.country_id IS NULL AND account.company_id = v_company_id)
      OR (account.country_id IS NULL AND account.company_id IS NULL)
    )
  ORDER BY CASE
    WHEN account.country_id = v_country_id AND account.company_id = v_company_id THEN 0
    WHEN account.country_id IS NULL AND account.company_id = v_company_id THEN 1
    WHEN account.country_id IS NULL AND account.company_id IS NULL THEN 2
    ELSE 3
  END, account.created_at
  LIMIT 1;

  IF v_scoped_account_id IS NULL THEN
    RAISE EXCEPTION
      'No company-scoped account found for code %, company %, country %',
      v_account_code, v_company_id, v_country_id;
  END IF;

  new.account_id := v_scoped_account_id;
  new.company_id := v_company_id;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_scope_gl_bridge_journal_line ON public.acct_journal_lines;
CREATE TRIGGER trg_scope_gl_bridge_journal_line
  BEFORE INSERT ON public.acct_journal_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.acct_scope_gl_bridge_journal_line();

-- -----------------------------------------------------------------------------
-- 5. Update the live advance bridge trigger.
--    This is the installment-safe successor of the trigger originally fixed in
--    20260817_fix_gl_bridge_v2.sql. Resolve country-specific accounts first,
--    then global fallbacks, and stamp both generated lines with the source
--    company.
-- -----------------------------------------------------------------------------
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
  v_company_id  uuid;
  v_amount      numeric(20,4);
  v_dr_acct_id  uuid;
  v_cr_acct_id  uuid;
  v_idempotency text;
  v_desc_en     text;
  v_desc_ar     text;
BEGIN
  IF tg_op <> 'UPDATE' THEN RETURN new; END IF;

  -- One GL entry per payment increment.
  v_amount := COALESCE(new.total_paid_amount, 0) - COALESCE(old.total_paid_amount, 0);
  IF v_amount <= 0 THEN RETURN new; END IF;

  v_idempotency := 'down_payment_requests::' || new.id::text || '::pmt_'
                || to_char(COALESCE(new.total_paid_amount, 0), 'FM999999999990.0000');

  IF EXISTS (
    SELECT 1
    FROM public.acct_journal_entries
    WHERE idempotency_key = v_idempotency
      AND status = 'posted'
  ) THEN
    RETURN new;
  END IF;

  DELETE FROM public.acct_journal_entries
  WHERE idempotency_key = v_idempotency
    AND status = 'draft';

  IF new.status = 'fully_paid' THEN
    v_desc_en := 'Field Advance Final Payment: ' || COALESCE(new.site_name, new.id::text);
    v_desc_ar := 'الدفعة الأخيرة للسلفة الميدانية: ' || COALESCE(new.site_name, new.id::text);
  ELSE
    v_desc_en := 'Field Advance Installment: ' || COALESCE(new.site_name, new.id::text);
    v_desc_ar := 'قسط سلفة ميدانية: ' || COALESCE(new.site_name, new.id::text);
  END IF;

  BEGIN
    SELECT company.id
    INTO v_company_id
    FROM public.companies AS company
    WHERE company.country_id = new.country_id
      AND company.name_en IN ('PACT Sudan', 'PACT S.SUDAN', 'PACT Rwanda', 'PACT Uganda')
    ORDER BY company.name_en
    LIMIT 1;

    IF v_company_id IS NULL THEN
      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message, amount)
      VALUES
        ('down_payment_requests', new.id, 'installment_payment', 'error',
         'No company is mapped to this advance''s country; assign the requester to a mapped country before posting.',
         v_amount);
      RETURN new;
    END IF;

    SELECT id
    INTO v_period_id
    FROM public.acct_fiscal_periods
    WHERE status IN ('open', 'soft_closed')
      AND start_date <= current_date
      AND end_date >= current_date
    ORDER BY start_date DESC
    LIMIT 1;

    IF v_period_id IS NULL THEN
      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message, amount)
      VALUES
        ('down_payment_requests', new.id, 'installment_payment', 'error',
         'No open fiscal period for ' || current_date::text, v_amount);
      RETURN new;
    END IF;

    SELECT id
    INTO v_fund_id
    FROM public.acct_funds
    WHERE code = 'GENERAL' AND is_active = true
    LIMIT 1;
    IF v_fund_id IS NULL THEN
      SELECT id
      INTO v_fund_id
      FROM public.acct_funds
      WHERE is_active = true
      ORDER BY created_at
      LIMIT 1;
    END IF;
    IF v_fund_id IS NULL THEN
      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message, amount)
      VALUES
        ('down_payment_requests', new.id, 'installment_payment', 'error',
         'No active fund', v_amount);
      RETURN new;
    END IF;

    v_poster_id := COALESCE(new.admin_processed_by, new.requested_by);
    IF v_poster_id IS NULL THEN
      SELECT id
      INTO v_poster_id
      FROM public.profiles
      WHERE lower(role) IN ('super_admin', 'superadmin')
      ORDER BY created_at
      LIMIT 1;
    END IF;

    SELECT id
    INTO v_dr_acct_id
    FROM public.acct_accounts
    WHERE code = '151000'
      AND is_postable = true
      AND (
        (country_id = new.country_id AND company_id = v_company_id)
        OR (country_id IS NULL AND company_id = v_company_id)
        OR (country_id IS NULL AND company_id IS NULL)
      )
    ORDER BY CASE
      WHEN country_id = new.country_id AND company_id = v_company_id THEN 0
      WHEN country_id IS NULL AND company_id = v_company_id THEN 1
      WHEN country_id IS NULL AND company_id IS NULL THEN 2
      ELSE 3
    END, created_at
    LIMIT 1;

    SELECT id
    INTO v_cr_acct_id
    FROM public.acct_accounts
    WHERE code = '120000'
      AND is_postable = true
      AND (
        (country_id = new.country_id AND company_id = v_company_id)
        OR (country_id IS NULL AND company_id = v_company_id)
        OR (country_id IS NULL AND company_id IS NULL)
      )
    ORDER BY CASE
      WHEN country_id = new.country_id AND company_id = v_company_id THEN 0
      WHEN country_id IS NULL AND company_id = v_company_id THEN 1
      WHEN country_id IS NULL AND company_id IS NULL THEN 2
      ELSE 3
    END, created_at
    LIMIT 1;

    IF v_dr_acct_id IS NULL OR v_cr_acct_id IS NULL THEN
      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message, amount)
      VALUES
        ('down_payment_requests', new.id, 'installment_payment', 'error',
         'Account not found — DR 151000: '
         || CASE WHEN v_dr_acct_id IS NULL THEN 'missing' ELSE 'ok' END
         || ', CR 120000: '
         || CASE WHEN v_cr_acct_id IS NULL THEN 'missing' ELSE 'ok' END,
         v_amount);
      RETURN new;
    END IF;

    INSERT INTO public.acct_journal_entries (
      period_id, posting_date, description_en, description_ar,
      source_type, source_id, country_id,
      status, idempotency_key, posted_by, created_by
    ) VALUES (
      v_period_id, current_date,
      v_desc_en, v_desc_ar,
      'down_payment_requests', new.id, new.country_id,
      'draft', v_idempotency, v_poster_id, v_poster_id
    )
    RETURNING id INTO v_entry_id;

    INSERT INTO public.acct_journal_lines (
      entry_id, line_no, account_id, fund_id, company_id, debit_credit,
      functional_amount, original_amount, original_currency, functional_currency, fx_rate,
      function, description
    ) VALUES
      (v_entry_id, 1, v_dr_acct_id, v_fund_id, v_company_id, 'DR',
       v_amount, v_amount, 'SDG', 'SDG', 1.0,
       'program', 'Travel Advance — ' || COALESCE(new.site_name, 'Field Site')),
      (v_entry_id, 2, v_cr_acct_id, v_fund_id, v_company_id, 'CR',
       v_amount, v_amount, 'SDG', 'SDG', 1.0,
       'none', 'Cash — Field Advance #' || new.id::text);

    UPDATE public.acct_journal_entries
    SET status = 'posted', posted_at = now()
    WHERE id = v_entry_id;

    INSERT INTO public.acct_gl_bridge_log
      (source_table, source_id, event_type, status, journal_entry_id, amount)
    VALUES
      ('down_payment_requests', new.id, 'installment_payment', 'success',
       v_entry_id, v_amount);

  EXCEPTION WHEN OTHERS THEN
    IF v_entry_id IS NOT NULL THEN
      DELETE FROM public.acct_journal_entries
      WHERE id = v_entry_id AND status = 'draft';
    END IF;
    INSERT INTO public.acct_gl_bridge_log
      (source_table, source_id, event_type, status, error_message, amount)
    VALUES
      ('down_payment_requests', new.id, 'installment_payment', 'error',
       SQLERRM, v_amount);
  END;

  RETURN new;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Update the live operational-cost bridge trigger with the same company
--    stamping behavior.
-- -----------------------------------------------------------------------------
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
  v_company_id  uuid;
  v_amount      numeric(20,4);
  v_dr_acct_id  uuid;
  v_cr_acct_id  uuid;
  v_expense_acc text;
  v_idempotency text;
BEGIN
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
  IF EXISTS (
    SELECT 1
    FROM public.acct_journal_entries
    WHERE idempotency_key = v_idempotency
  ) THEN
    RETURN new;
  END IF;

  BEGIN
    SELECT company.id
    INTO v_company_id
    FROM public.companies AS company
    WHERE company.country_id = new.country_id
      AND company.name_en IN ('PACT Sudan', 'PACT S.SUDAN', 'PACT Rwanda', 'PACT Uganda')
    ORDER BY company.name_en
    LIMIT 1;

    IF v_company_id IS NULL THEN
      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message)
      VALUES
        ('operational_cost_submissions', new.id, 'ops_cost_paid', 'error',
         'No company is mapped to this operational cost''s country; assign the submitter to a mapped country before posting.');
      RETURN new;
    END IF;

    SELECT id
    INTO v_period_id
    FROM public.acct_fiscal_periods
    WHERE status IN ('open', 'soft_closed')
      AND start_date <= COALESCE(new.expense_date, current_date)
      AND end_date >= COALESCE(new.expense_date, current_date)
    ORDER BY start_date DESC
    LIMIT 1;

    IF v_period_id IS NULL THEN
      SELECT id
      INTO v_period_id
      FROM public.acct_fiscal_periods
      WHERE status IN ('open', 'soft_closed')
        AND start_date <= current_date
        AND end_date >= current_date
      ORDER BY start_date DESC
      LIMIT 1;
    END IF;

    IF v_period_id IS NULL THEN
      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message)
      VALUES
        ('operational_cost_submissions', new.id, 'ops_cost_paid', 'error',
         'No open fiscal period');
      RETURN new;
    END IF;

    SELECT id
    INTO v_fund_id
    FROM public.acct_funds
    WHERE code = 'GENERAL' AND is_active = true
    LIMIT 1;
    IF v_fund_id IS NULL THEN
      SELECT id
      INTO v_fund_id
      FROM public.acct_funds
      WHERE is_active = true
      ORDER BY created_at
      LIMIT 1;
    END IF;
    IF v_fund_id IS NULL THEN
      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message)
      VALUES
        ('operational_cost_submissions', new.id, 'ops_cost_paid', 'error',
         'No active fund found');
      RETURN new;
    END IF;

    v_poster_id := COALESCE(new.tier2_approved_by, new.submitted_by);
    IF v_poster_id IS NULL THEN
      SELECT id
      INTO v_poster_id
      FROM public.profiles
      WHERE lower(role) IN ('super_admin', 'superadmin')
      ORDER BY created_at
      LIMIT 1;
    END IF;

    v_expense_acc := public.acct_bridge_ops_cost_account(new.expense_category);

    SELECT id
    INTO v_dr_acct_id
    FROM public.acct_accounts
    WHERE code = v_expense_acc
      AND is_postable = true
      AND (
        (country_id = new.country_id AND company_id = v_company_id)
        OR (country_id IS NULL AND company_id = v_company_id)
        OR (country_id IS NULL AND company_id IS NULL)
      )
    ORDER BY CASE
      WHEN country_id = new.country_id AND company_id = v_company_id THEN 0
      WHEN country_id IS NULL AND company_id = v_company_id THEN 1
      WHEN country_id IS NULL AND company_id IS NULL THEN 2
      ELSE 3
    END, created_at
    LIMIT 1;

    SELECT id
    INTO v_cr_acct_id
    FROM public.acct_accounts
    WHERE code = '120000'
      AND is_postable = true
      AND (
        (country_id = new.country_id AND company_id = v_company_id)
        OR (country_id IS NULL AND company_id = v_company_id)
        OR (country_id IS NULL AND company_id IS NULL)
      )
    ORDER BY CASE
      WHEN country_id = new.country_id AND company_id = v_company_id THEN 0
      WHEN country_id IS NULL AND company_id = v_company_id THEN 1
      WHEN country_id IS NULL AND company_id IS NULL THEN 2
      ELSE 3
    END, created_at
    LIMIT 1;

    IF v_dr_acct_id IS NULL OR v_cr_acct_id IS NULL THEN
      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message)
      VALUES
        ('operational_cost_submissions', new.id, 'ops_cost_paid', 'error',
         'Account not found — DR ' || v_expense_acc || ': '
         || CASE WHEN v_dr_acct_id IS NULL THEN 'missing' ELSE 'ok' END
         || ', CR 120000: '
         || CASE WHEN v_cr_acct_id IS NULL THEN 'missing' ELSE 'ok' END
         || '. Add these accounts in the Chart of Accounts first.');
      RETURN new;
    END IF;

    INSERT INTO public.acct_journal_entries (
      period_id, posting_date, description_en, description_ar,
      source_type, source_id, country_id,
      status, idempotency_key, posted_by, created_by
    ) VALUES (
      v_period_id,
      COALESCE(new.expense_date, current_date),
      'Operational Cost Paid: ' || COALESCE(new.expense_category, 'general'),
      'تكلفة تشغيلية مدفوعة: ' || COALESCE(new.expense_category, 'عامة'),
      'operational_cost_submissions', new.id, new.country_id,
      'draft', v_idempotency, v_poster_id, v_poster_id
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_entry_id;

    IF v_entry_id IS NULL THEN RETURN new; END IF;

    INSERT INTO public.acct_journal_lines (
      entry_id, line_no, account_id, fund_id, company_id,
      debit_credit, functional_amount, original_amount,
      original_currency, functional_currency, fx_rate,
      function, description
    ) VALUES
      (v_entry_id, 1, v_dr_acct_id, v_fund_id, v_company_id,
       'DR', v_amount, v_amount,
       COALESCE(new.currency, 'SDG'), 'SDG', 1.0,
       'program', COALESCE(new.description, new.expense_category)),
      (v_entry_id, 2, v_cr_acct_id, v_fund_id, v_company_id,
       'CR', v_amount, v_amount,
       COALESCE(new.currency, 'SDG'), 'SDG', 1.0,
       'none', 'Cash Payment — Ops Cost #' || new.id::text);

    UPDATE public.acct_journal_entries
    SET status = 'posted', posted_at = now()
    WHERE id = v_entry_id;

    INSERT INTO public.acct_gl_bridge_log
      (source_table, source_id, event_type, status, journal_entry_id)
    VALUES
      ('operational_cost_submissions', new.id, 'ops_cost_paid', 'success', v_entry_id);

  EXCEPTION WHEN OTHERS THEN
    IF v_entry_id IS NOT NULL THEN
      DELETE FROM public.acct_journal_entries
      WHERE id = v_entry_id AND status = 'draft';
    END IF;
    INSERT INTO public.acct_gl_bridge_log
      (source_table, source_id, event_type, status, error_message)
    VALUES
      ('operational_cost_submissions', new.id, 'ops_cost_paid', 'error', SQLERRM);
  END;

  RETURN new;
END;
$$;

COMMIT;
