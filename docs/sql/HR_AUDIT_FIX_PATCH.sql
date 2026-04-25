-- ============================================================================
-- PACT HR Audit — Hotfix patch  (2026-04-25)
-- ----------------------------------------------------------------------------
-- Symptom you hit:
--   ERROR 42P01:  relation "v_social_employee" does not exist
--
-- Root cause:
--   The original calculate_payroll_statutory() used
--     SELECT COALESCE(SUM(...),0) INTO v_social_employee FROM ...;
--   Some Supabase project parsers misread the  INTO v_social_employee  bit
--   as the SQL-standard  SELECT … INTO new_table  (CTAS-style) instead of
--   the plpgsql  INTO variable  form, then complained the relation didn't
--   exist. Same problem for v_social_employer.
--
-- Fix:
--   Drops the old function (if any), drops any stray relations the bad parse
--   may have created, then recreates the function using unambiguous scalar
--   assignment   v := (SELECT … FROM …)   form. No data loss — the function
--   is pure compute, and the brackets table is untouched.
--
-- How to use:
--   1. Open the Supabase SQL editor for  pactdb  (or whichever DB hit the
--      error).
--   2. Paste this whole file.  Click Run.
--   3. Then re-run  docs/sql/HR_AUDIT_MANUAL_APPLY.sql  if you want to make
--      sure everything else from the bundle is in place. Both files are
--      idempotent.
-- ============================================================================

-- 1. Clean up any stray relations a previous failed run might have produced.
DROP TABLE IF EXISTS public.v_social_employee;
DROP TABLE IF EXISTS public.v_social_employer;
DROP VIEW  IF EXISTS public.v_social_employee;
DROP VIEW  IF EXISTS public.v_social_employer;

-- 2. Drop the old function so the recreate is clean (signature must match).
DROP FUNCTION IF EXISTS public.calculate_payroll_statutory(numeric, text, boolean);

-- 3. Recreate with safe scalar assignment.
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

  -- Progressive PIT
  FOR v_bracket IN
    SELECT *
    FROM public.payroll_statutory_brackets
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

  -- Flat-rate social insurance — scalar assignment (no SELECT INTO)
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

  -- Optional Zakat (2.5% of net-of-statutory salary)
  IF p_apply_zakat THEN
    v_zakat := GREATEST(0, p_gross - v_pit - v_social_employee) * 0.025;
  END IF;

  RETURN jsonb_build_object(
    'pit',             ROUND(v_pit,             2),
    'social_employee', ROUND(v_social_employee, 2),
    'social_employer', ROUND(v_social_employer, 2),
    'zakat',           ROUND(v_zakat,           2),
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

-- 4. Quick smoke test — should return non-null jsonb with all keys.
SELECT public.calculate_payroll_statutory(50000, 'SD', false)  AS without_zakat,
       public.calculate_payroll_statutory(50000, 'SD', true)   AS with_zakat;
