-- =============================================================================
-- PACT Accounting — Country-Partitioned Chart of Accounts
-- =============================================================================
-- What this does
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Adds country_id to profiles (each user belongs to a country)
-- 2. Adds country_id to operational_cost_submissions + auto-stamps on INSERT
-- 3. Adds country_id to down_payment_requests        + auto-stamps on INSERT
-- 4. Modifies acct_accounts: same account code can exist per country
--    e.g.  code='5400', country_id=<Sudan>   ← Sudan costs hit this
--          code='5400', country_id=<Kenya>   ← Kenya costs hit this
--          code='5400', country_id=NULL       ← global fallback
-- 5. Adds country_id to acct_journal_entries for per-country GL reporting
-- 6. Creates a new country-aware version of acct_bridge_post_journal
--    (9-param; old 8-param stays intact for payroll/wallet/etc. triggers)
-- 7. Updates ops-cost + down-payment triggers to pass country_id
-- 8. Backfills existing records via submitted_by/requested_by → profiles
-- =============================================================================
-- Apply : MANUAL — paste into Supabase SQL editor, run once
-- Safe  : YES — all changes are IF NOT EXISTS / idempotent
-- =============================================================================

set lock_timeout = '5s';

-- =============================================================================
-- STEP 0 — Fix the broken notification trigger (NEW.result → NEW.status)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.acct_trg_gl_bridge_failure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'error' THEN
    PERFORM public.acct_notify_role_users(
      'accounting_gl_bridge_failure',
      'GL Bridge Posting Failed',
      format('GL bridge posting failed for %s (record %s): %s',
        COALESCE(NEW.source_table, 'unknown table'),
        COALESCE(NEW.source_id::text, '?'),
        COALESCE(NEW.error_message, 'No details available')
      ),
      '/accounting/gl-bridge',
      jsonb_build_object(
        'log_id',       NEW.id,
        'source_table', NEW.source_table,
        'source_id',    NEW.source_id,
        'error',        NEW.error_message
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

-- =============================================================================
-- STEP 1 — Add country_id to profiles
-- =============================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country_id uuid REFERENCES countries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_country_id
  ON public.profiles(country_id);

-- =============================================================================
-- STEP 2 — Add country_id to operational_cost_submissions
--           + auto-stamp trigger (reads submitted_by → profiles.country_id)
-- =============================================================================
ALTER TABLE public.operational_cost_submissions
  ADD COLUMN IF NOT EXISTS country_id uuid REFERENCES countries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ocs_country_id
  ON public.operational_cost_submissions(country_id);

CREATE OR REPLACE FUNCTION public.ocs_stamp_country()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.country_id IS NULL AND NEW.submitted_by IS NOT NULL THEN
    SELECT country_id
      INTO NEW.country_id
      FROM public.profiles
     WHERE id = NEW.submitted_by;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ocs_stamp_country ON public.operational_cost_submissions;
CREATE TRIGGER trg_ocs_stamp_country
  BEFORE INSERT ON public.operational_cost_submissions
  FOR EACH ROW EXECUTE FUNCTION public.ocs_stamp_country();

-- =============================================================================
-- STEP 3 — Add country_id to down_payment_requests
--           + auto-stamp trigger (reads requested_by → profiles.country_id)
-- =============================================================================
ALTER TABLE public.down_payment_requests
  ADD COLUMN IF NOT EXISTS country_id uuid REFERENCES countries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dpr_country_id
  ON public.down_payment_requests(country_id);

CREATE OR REPLACE FUNCTION public.dpr_stamp_country()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.country_id IS NULL AND NEW.requested_by IS NOT NULL THEN
    SELECT country_id
      INTO NEW.country_id
      FROM public.profiles
     WHERE id = NEW.requested_by;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dpr_stamp_country ON public.down_payment_requests;
CREATE TRIGGER trg_dpr_stamp_country
  BEFORE INSERT ON public.down_payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.dpr_stamp_country();

-- =============================================================================
-- STEP 4 — Modify acct_accounts for country partitioning
--   • Drop the global UNIQUE(code) constraint
--   • Add country_id column
--   • Two partial unique indexes:
--       acct_accounts_code_global_uq  → one global row per code (country_id IS NULL)
--       acct_accounts_code_country_uq → one row per (code, country_id)
-- =============================================================================
ALTER TABLE public.acct_accounts
  DROP CONSTRAINT IF EXISTS acct_accounts_code_key;

ALTER TABLE public.acct_accounts
  ADD COLUMN IF NOT EXISTS country_id uuid REFERENCES countries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_acct_accounts_country_id
  ON public.acct_accounts(country_id);

-- One global account per code (country_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS acct_accounts_code_global_uq
  ON public.acct_accounts(code)
  WHERE country_id IS NULL;

-- One country-specific account per (code, country)
CREATE UNIQUE INDEX IF NOT EXISTS acct_accounts_code_country_uq
  ON public.acct_accounts(code, country_id)
  WHERE country_id IS NOT NULL;

-- =============================================================================
-- STEP 5 — Add country_id to acct_journal_entries
-- =============================================================================
ALTER TABLE public.acct_journal_entries
  ADD COLUMN IF NOT EXISTS country_id uuid REFERENCES countries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_acct_je_country_id
  ON public.acct_journal_entries(country_id);

-- =============================================================================
-- STEP 6 — New 9-param acct_bridge_post_journal (country-aware)
--
--   Account resolution order:
--     1. code = X AND country_id = p_country_id   (country-specific account)
--     2. code = X AND country_id IS NULL           (global fallback)
--
--   The old 8-param version stays untouched — payroll/wallet/etc. triggers
--   keep using it unchanged.
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
  v_entry_id      uuid;
  v_idempotency   text;
  v_period_id     uuid;
  v_fund_id       uuid;
  v_poster_id     uuid;
  v_line          jsonb;
  v_line_no       int  := 0;
  v_account_id    uuid;
  v_balance       numeric(20,4);
  v_engine_on     boolean;
  v_bridge_on     boolean;
BEGIN
  -- ── Gate: engine + bridge-specific flag ────────────────────────────────────
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

  -- ── Idempotency ─────────────────────────────────────────────────────────────
  v_idempotency := p_source_table || '::' || p_source_id::text || '::' || p_event_type;

  SELECT id INTO v_entry_id
    FROM public.acct_journal_entries
   WHERE idempotency_key = v_idempotency;
  IF FOUND THEN
    RETURN v_entry_id;
  END IF;

  -- ── Resolve open fiscal period ───────────────────────────────────────────────
  SELECT id INTO v_period_id
    FROM public.acct_fiscal_periods
   WHERE status IN ('open','soft_closed')
     AND start_date <= p_posting_date
     AND end_date   >= p_posting_date
   ORDER BY start_date DESC
   LIMIT 1;
  IF v_period_id IS NULL THEN
    RAISE EXCEPTION 'BRIDGE_NO_PERIOD: no open fiscal period for date %', p_posting_date;
  END IF;

  -- ── Resolve fund ─────────────────────────────────────────────────────────────
  SELECT id INTO v_fund_id
    FROM public.acct_funds
   WHERE code = 'GENERAL' AND is_active = true
   LIMIT 1;
  IF v_fund_id IS NULL THEN
    SELECT id INTO v_fund_id
      FROM public.acct_funds
     WHERE is_active = true
     ORDER BY created_at
     LIMIT 1;
  END IF;
  IF v_fund_id IS NULL THEN
    RAISE EXCEPTION 'BRIDGE_NO_FUND: no active fund found';
  END IF;

  -- ── Resolve poster ───────────────────────────────────────────────────────────
  v_poster_id := p_posted_by;
  IF v_poster_id IS NULL THEN
    SELECT id INTO v_poster_id
      FROM public.profiles
     WHERE lower(role) IN ('super_admin','superadmin')
     ORDER BY created_at
     LIMIT 1;
  END IF;
  IF v_poster_id IS NULL THEN
    RAISE EXCEPTION 'BRIDGE_NO_POSTER: no super_admin profile found';
  END IF;

  -- ── Validate lines ───────────────────────────────────────────────────────────
  IF jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'BRIDGE_INSUFFICIENT_LINES: must supply at least 2 lines';
  END IF;

  -- ── Insert journal entry (with country_id) ───────────────────────────────────
  INSERT INTO public.acct_journal_entries (
    period_id, posting_date, description_en, description_ar,
    source_type, source_id, status, idempotency_key,
    posted_at, posted_by, created_by, country_id
  ) VALUES (
    v_period_id,
    p_posting_date,
    p_description_en,
    p_description_ar,
    p_source_table,
    p_source_id,
    'posted',
    v_idempotency,
    now(),
    v_poster_id,
    v_poster_id,
    p_country_id
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_entry_id;

  IF v_entry_id IS NULL THEN
    SELECT id INTO v_entry_id
      FROM public.acct_journal_entries
     WHERE idempotency_key = v_idempotency;
    RETURN v_entry_id;
  END IF;

  -- ── Insert journal lines ─────────────────────────────────────────────────────
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_line_no := v_line_no + 1;

    -- Country-first account resolution:
    --   1. country-specific account (code + country_id)
    --   2. global fallback (code + country_id IS NULL)
    SELECT id INTO v_account_id
      FROM public.acct_accounts
     WHERE code        = (v_line->>'account_code')
       AND is_postable = true
       AND (country_id = p_country_id OR country_id IS NULL)
     ORDER BY
       CASE WHEN country_id = p_country_id THEN 0 ELSE 1 END
     LIMIT 1;

    IF v_account_id IS NULL THEN
      RAISE EXCEPTION 'BRIDGE_ACCOUNT_NOT_FOUND: code=%, country=%',
        (v_line->>'account_code'), p_country_id;
    END IF;

    INSERT INTO public.acct_journal_lines (
      entry_id, line_no, account_id, fund_id, function,
      original_amount, original_currency,
      functional_amount, functional_currency,
      debit_credit, description
    ) VALUES (
      v_entry_id,
      v_line_no,
      v_account_id,
      v_fund_id,
      COALESCE(v_line->>'function', 'program'),
      (v_line->>'amount')::numeric,
      COALESCE(v_line->>'currency', 'SDG'),
      (v_line->>'amount')::numeric,
      'SDG',
      v_line->>'debit_credit',
      v_line->>'description'
    );
  END LOOP;

  -- ── Balance check ────────────────────────────────────────────────────────────
  SELECT SUM(
    CASE WHEN debit_credit = 'DR' THEN functional_amount
         ELSE -functional_amount END
  ) INTO v_balance
  FROM public.acct_journal_lines
  WHERE entry_id = v_entry_id;

  IF abs(COALESCE(v_balance, 1)) > 0.005 THEN
    RAISE EXCEPTION 'BRIDGE_IMBALANCE: DR/CR mismatch by % for entry %',
      v_balance, v_entry_id;
  END IF;

  PERFORM pg_notify('acct_journal_posted', v_entry_id::text);
  RETURN v_entry_id;
END $$;

COMMENT ON FUNCTION public.acct_bridge_post_journal(text,uuid,text,date,text,text,jsonb,uuid,uuid) IS
  'Country-aware GL bridge. Resolves accounts by (code, country_id) with '
  'global fallback (country_id IS NULL). 9th param p_country_id is optional.';

-- =============================================================================
-- STEP 7 — Update ops-cost trigger to pass NEW.country_id
-- =============================================================================
CREATE OR REPLACE FUNCTION public.acct_trig_operational_cost_submissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_id    uuid;
  v_amount      numeric(20,4);
  v_expense_acc text;
BEGIN
  IF tg_op = 'UPDATE'
     AND old.status IS DISTINCT FROM new.status
     AND new.status = 'paid' THEN

    v_amount      := COALESCE(new.amount_cents, 0) / 100.0;
    v_expense_acc := public.acct_bridge_ops_cost_account(new.expense_category);

    IF v_amount <= 0 THEN RETURN new; END IF;

    BEGIN
      v_entry_id := public.acct_bridge_post_journal(
        'operational_cost_submissions',
        new.id,
        'paid',
        COALESCE(new.expense_date, current_date),
        'Operational Cost Paid: ' || COALESCE(new.expense_category, 'general'),
        'تكلفة تشغيلية مدفوعة: ' || COALESCE(new.expense_category, 'عامة'),
        jsonb_build_array(
          jsonb_build_object(
            'account_code', v_expense_acc,
            'debit_credit', 'DR',
            'amount',       v_amount,
            'currency',     COALESCE(new.currency, 'SDG'),
            'description',  COALESCE(new.description, new.expense_category),
            'function',     'program'
          ),
          jsonb_build_object(
            'account_code', '1200',
            'debit_credit', 'CR',
            'amount',       v_amount,
            'currency',     COALESCE(new.currency, 'SDG'),
            'description',  'Cash Payment — Ops Cost #' || new.id::text,
            'function',     'none'
          )
        ),
        new.tier2_approved_by,
        new.country_id          -- ← country from source record
      );

      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, journal_entry_id)
      VALUES
        ('operational_cost_submissions', new.id, 'ops_cost_paid', 'success', v_entry_id);

    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message)
      VALUES
        ('operational_cost_submissions', new.id, 'ops_cost_paid', 'error', sqlerrm);
    END;
  END IF;

  RETURN new;
END $$;

-- =============================================================================
-- STEP 8 — Update down-payment trigger to pass NEW.country_id
-- =============================================================================
CREATE OR REPLACE FUNCTION public.acct_trig_down_payment_requests()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_id uuid;
  v_amount   numeric(20,4);
BEGIN
  IF tg_op = 'UPDATE'
     AND old.status IS DISTINCT FROM new.status
     AND new.status = 'fully_paid' THEN

    v_amount := COALESCE(new.total_paid_amount, new.requested_amount, 0);
    IF v_amount <= 0 THEN RETURN new; END IF;

    BEGIN
      v_entry_id := public.acct_bridge_post_journal(
        'down_payment_requests',
        new.id,
        'fully_paid',
        current_date,
        'Field Advance Disbursed: ' || COALESCE(new.site_name, new.id::text),
        'صرف سلفة ميدانية: '         || COALESCE(new.site_name, new.id::text),
        jsonb_build_array(
          jsonb_build_object(
            'account_code', '1510',
            'debit_credit', 'DR',
            'amount',       v_amount,
            'currency',     'SDG',
            'description',  'Travel Advance — ' || COALESCE(new.site_name, 'Field Site'),
            'function',     'program'
          ),
          jsonb_build_object(
            'account_code', '1200',
            'debit_credit', 'CR',
            'amount',       v_amount,
            'currency',     'SDG',
            'description',  'Cash — Field Advance #' || new.id::text,
            'function',     'none'
          )
        ),
        new.admin_processed_by,
        new.country_id          -- ← country from source record
      );

      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, journal_entry_id)
      VALUES
        ('down_payment_requests', new.id, 'down_payment_fully_paid', 'success', v_entry_id);

    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message)
      VALUES
        ('down_payment_requests', new.id, 'down_payment_fully_paid', 'error', sqlerrm);
    END;
  END IF;

  RETURN new;
END $$;

-- =============================================================================
-- STEP 9 — Grant execute on the new 9-param function
-- =============================================================================
GRANT EXECUTE ON FUNCTION public.acct_bridge_post_journal(text,uuid,text,date,text,text,jsonb,uuid,uuid)
  TO authenticated;

-- =============================================================================
-- STEP 10 — Backfill: stamp country_id on existing source records
--           (runs AFTER admin has set country_id on profiles)
--           Safe to run multiple times — only updates NULL rows.
-- =============================================================================

-- 10a: operational_cost_submissions — via submitted_by
UPDATE public.operational_cost_submissions ocs
   SET country_id = p.country_id
  FROM public.profiles p
 WHERE ocs.submitted_by = p.id
   AND ocs.country_id IS NULL
   AND p.country_id IS NOT NULL;

-- 10b: down_payment_requests — via requested_by
UPDATE public.down_payment_requests dpr
   SET country_id = p.country_id
  FROM public.profiles p
 WHERE dpr.requested_by = p.id
   AND dpr.country_id IS NULL
   AND p.country_id IS NOT NULL;

-- =============================================================================
-- STEP 11 — Verify: check how many records now have a country stamped
-- =============================================================================
SELECT
  'operational_cost_submissions' AS table_name,
  COUNT(*)                       AS total,
  COUNT(country_id)              AS with_country,
  COUNT(*) - COUNT(country_id)   AS missing_country
FROM public.operational_cost_submissions
WHERE lower(status) = 'paid'
UNION ALL
SELECT
  'down_payment_requests',
  COUNT(*),
  COUNT(country_id),
  COUNT(*) - COUNT(country_id)
FROM public.down_payment_requests
WHERE lower(status) = 'fully_paid';

-- Country distribution on profiles (sanity check):
SELECT country_id, COUNT(*) AS users
  FROM public.profiles
 GROUP BY country_id
 ORDER BY users DESC;
