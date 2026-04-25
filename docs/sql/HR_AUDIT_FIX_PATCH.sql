-- ============================================================================
-- PACT HR Audit — Hotfix patch  (rev 2 · 2026-04-25)
-- ----------------------------------------------------------------------------
-- Symptoms this patch resolves (one cause, several variables):
--   ERROR 42P01:  relation "v_social_employee" does not exist
--   ERROR 42P01:  relation "v_social_employer" does not exist
--   ERROR 42P01:  relation "v_caller_role"     does not exist
--   ERROR 42P01:  relation "v_opening"         does not exist
--   ERROR 42P01:  relation "v_count"           does not exist
--   ERROR 42P01:  relation "v_inserted"        does not exist
--
-- Root cause:
--   The original functions used  SELECT … INTO v_var FROM …  Some Supabase
--   project parsers misread that as the SQL-standard SELECT-INTO (CTAS) and
--   went looking for a table named v_var.
--
-- Fix (no data change):
--   Drop and recreate the affected functions using either
--     · scalar       v := (SELECT … FROM …)              assignment, or
--     · GET DIAGNOSTICS v = ROW_COUNT     after an INSERT.
--   No tables are touched.
--
-- How to use:
--   1. Open the Supabase SQL editor for  pactdb  (or whichever DB hit it).
--   2. Paste this whole file.  Click Run.
--   3. (Optional) Re-paste docs/sql/HR_AUDIT_MANUAL_APPLY.sql to confirm
--      everything else is in place — it's idempotent.
-- ============================================================================

-- 0. Clean up any stray relations that an earlier failed run might have made.
DROP TABLE IF EXISTS public.v_social_employee;
DROP TABLE IF EXISTS public.v_social_employer;
DROP TABLE IF EXISTS public.v_caller_role;
DROP TABLE IF EXISTS public.v_opening;
DROP TABLE IF EXISTS public.v_count;
DROP TABLE IF EXISTS public.v_inserted;
DROP VIEW  IF EXISTS public.v_social_employee;
DROP VIEW  IF EXISTS public.v_social_employer;
DROP VIEW  IF EXISTS public.v_caller_role;
DROP VIEW  IF EXISTS public.v_opening;
DROP VIEW  IF EXISTS public.v_count;
DROP VIEW  IF EXISTS public.v_inserted;


-- ============================================================================
-- 1. calculate_payroll_statutory — H10 (PIT, social insurance, optional Zakat)
-- ============================================================================
DROP FUNCTION IF EXISTS public.calculate_payroll_statutory(numeric, text, boolean);

CREATE OR REPLACE FUNCTION public.calculate_payroll_statutory(
  p_gross        numeric,
  p_country      text DEFAULT 'SD',
  p_apply_zakat  boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pit              numeric := 0;
  v_social_employee  numeric := 0;
  v_social_employer  numeric := 0;
  v_zakat            numeric := 0;
  v_bracket          record;
  v_taxable_in_band  numeric;
  v_today            date    := CURRENT_DATE;
BEGIN
  IF COALESCE(p_gross, 0) <= 0 THEN
    RETURN jsonb_build_object(
      'pit', 0, 'social_employee', 0, 'social_employer', 0,
      'zakat', 0, 'total_employee', 0, 'total_employer', 0
    );
  END IF;

  FOR v_bracket IN
    SELECT * FROM public.payroll_statutory_brackets
    WHERE country = p_country AND type = 'pit'
      AND effective_from <= v_today
      AND (effective_to IS NULL OR effective_to >= v_today)
    ORDER BY min_amount
  LOOP
    IF p_gross > v_bracket.min_amount THEN
      v_taxable_in_band := LEAST(p_gross, COALESCE(v_bracket.max_amount, p_gross))
                           - v_bracket.min_amount;
      v_pit := v_pit
               + (v_taxable_in_band * v_bracket.rate_percent / 100.0)
               + v_bracket.fixed_amount;
    END IF;
  END LOOP;

  v_social_employee := COALESCE((
    SELECT SUM(p_gross * rate_percent / 100.0 + fixed_amount)
    FROM public.payroll_statutory_brackets
    WHERE country = p_country AND type = 'social_employee'
      AND effective_from <= v_today
      AND (effective_to IS NULL OR effective_to >= v_today)
  ), 0);

  v_social_employer := COALESCE((
    SELECT SUM(p_gross * rate_percent / 100.0 + fixed_amount)
    FROM public.payroll_statutory_brackets
    WHERE country = p_country AND type = 'social_employer'
      AND effective_from <= v_today
      AND (effective_to IS NULL OR effective_to >= v_today)
  ), 0);

  IF p_apply_zakat THEN
    v_zakat := GREATEST(0, p_gross - v_pit - v_social_employee) * 0.025;
  END IF;

  RETURN jsonb_build_object(
    'pit',             ROUND(v_pit, 2),
    'social_employee', ROUND(v_social_employee, 2),
    'social_employer', ROUND(v_social_employer, 2),
    'zakat',           ROUND(v_zakat, 2),
    'total_employee',  ROUND(v_pit + v_social_employee + v_zakat, 2),
    'total_employer',  ROUND(v_social_employer, 2),
    'country',         p_country
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_payroll_statutory(numeric, text, boolean)
  TO authenticated;

COMMENT ON FUNCTION public.calculate_payroll_statutory(numeric, text, boolean) IS
  'H10 (rev2): PIT (progressive) + social-insurance (employee+employer) + optional Zakat. Uses scalar assignment to avoid SELECT-INTO parser ambiguity.';


-- ============================================================================
-- 2. accrue_eosb_for_period — H8 (race-safe monthly EOSB accrual)
-- ============================================================================
DROP FUNCTION IF EXISTS public.accrue_eosb_for_period(text);

CREATE OR REPLACE FUNCTION public.accrue_eosb_for_period(p_period text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_processed     int := 0;
  v_skipped       int := 0;
  v_emp           record;
  v_opening       numeric;
  v_accrual       numeric;
  v_caller_role   text;
  v_inserted_rows int;
BEGIN
  v_caller_role := (SELECT role FROM public.profiles WHERE id = auth.uid());
  IF v_caller_role IS NULL OR lower(v_caller_role) NOT IN ('super_admin','superadmin','admin','finance','hr') THEN
    RAISE EXCEPTION 'Unauthorized: only HR / finance / admin may accrue EOSB' USING ERRCODE = '42501';
  END IF;

  IF p_period !~ '^[0-9]{4}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'period must be YYYY-MM (got %)', p_period;
  END IF;

  FOR v_emp IN
    SELECT p.id AS user_id,
           p.contract_start_date,
           esc.base_salary,
           COALESCE(esc.currency, 'SDG') AS currency
    FROM public.profiles p
    LEFT JOIN public.employee_salary_config esc ON esc.user_id = p.id
    WHERE p.status = 'active'
      AND COALESCE(esc.base_salary, 0) > 0
      AND p.contract_start_date IS NOT NULL
  LOOP
    v_opening := COALESCE((
      SELECT closing_balance FROM public.eosb_accruals
      WHERE user_id = v_emp.user_id
      ORDER BY period DESC
      LIMIT 1
    ), 0);
    v_accrual := ROUND(v_emp.base_salary / 12.0, 2);

    INSERT INTO public.eosb_accruals
      (user_id, period, opening_balance, accrued_amount, closing_balance,
       base_salary, currency, created_by)
    VALUES
      (v_emp.user_id, p_period, v_opening, v_accrual, v_opening + v_accrual,
       v_emp.base_salary, v_emp.currency, auth.uid())
    ON CONFLICT (user_id, period) DO NOTHING;

    GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

    IF v_inserted_rows > 0 THEN
      v_processed := v_processed + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'period',    p_period,
    'processed', v_processed,
    'skipped',   v_skipped,
    'status',    'ok'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accrue_eosb_for_period(text) TO authenticated;

COMMENT ON FUNCTION public.accrue_eosb_for_period(text) IS
  'H8 (rev2 race-safe): one EOSB row per active employee per period. Idempotent via ON CONFLICT (user_id, period). Uses GET DIAGNOSTICS instead of SELECT-INTO.';


-- ============================================================================
-- 3. next_expense_claim_number — sequential EXP-YYYY-NNNNN id generator
-- ============================================================================
DROP FUNCTION IF EXISTS public.next_expense_claim_number();

CREATE OR REPLACE FUNCTION public.next_expense_claim_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_year  text := to_char(now(), 'YYYY');
  v_count int;
BEGIN
  v_count := (
    SELECT COUNT(*) + 1 FROM public.expense_claims
    WHERE claim_number LIKE 'EXP-' || v_year || '-%'
  );
  RETURN 'EXP-' || v_year || '-' || lpad(v_count::text, 5, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_expense_claim_number() TO authenticated;


-- ============================================================================
-- 4. Smoke tests — should each return a sensible result, not an error
-- ============================================================================
SELECT public.calculate_payroll_statutory(50000, 'SD', false) AS without_zakat,
       public.calculate_payroll_statutory(50000, 'SD', true)  AS with_zakat;

SELECT public.next_expense_claim_number() AS next_claim_no;
