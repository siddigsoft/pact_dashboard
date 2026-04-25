-- ============================================================================
-- HR Audit remediation — Phase 0 exit fixes
-- ----------------------------------------------------------------------------
-- Applied after the architect code review of 20260424_hr_audit_complete.sql
-- flagged three HIGH-severity defects:
--
--   FIX-1  H2  salary_advances.sa_update_owner used status='pending' but the
--              CHECK constraint enumerates 'pending_manager' / 'pending_finance'
--              etc. — there is no plain 'pending' state, so owners could never
--              edit their own row through the workflow. Widen owner-edit window
--              to BOTH pending_manager AND pending_finance, lock further states.
--
--   FIX-2  H3  expense_claims.ec_write USING allowed manager_id = auth.uid()
--              but WITH CHECK omitted manager — manager could not perform UPDATE
--              because the post-image failed the WITH CHECK. Add manager_id to
--              WITH CHECK so manager-approval transitions succeed.
--
--   FIX-3  H8  accrue_eosb_for_period used IF EXISTS + INSERT — race condition
--              under concurrent invocations. Replace with INSERT ... ON CONFLICT
--              (user_id, period) DO NOTHING (the unique constraint exists at
--              eosb_accruals(user_id, period) per migration 20260424).
-- ============================================================================

-- ── FIX-1: salary_advances owner-update policy ──────────────────────────────
DROP POLICY IF EXISTS sa_update_owner ON public.salary_advances;
CREATE POLICY sa_update_owner ON public.salary_advances FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  AND status IN ('pending_manager','pending_finance')
)
WITH CHECK (
  user_id = auth.uid()
  AND status IN ('pending_manager','pending_finance','cancelled')
);

-- ── FIX-2: expense_claims write policy — manager allowed in WITH CHECK ──────
DROP POLICY IF EXISTS ec_write ON public.expense_claims;
CREATE POLICY ec_write ON public.expense_claims FOR ALL TO authenticated
USING (
  user_id = auth.uid()
  OR manager_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
             AND lower(role) IN ('super_admin','superadmin','admin','finance','hr'))
)
WITH CHECK (
  user_id = auth.uid()
  OR manager_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
             AND lower(role) IN ('super_admin','superadmin','admin','finance','hr'))
);

-- ── FIX-3: accrue_eosb_for_period race-safe via ON CONFLICT ─────────────────
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
    SELECT p.id AS user_id, p.contract_start_date, esc.base_salary, COALESCE(esc.currency,'SDG') AS currency
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

    -- Race-safe insert: relies on UNIQUE (user_id, period) from 20260424 migration.
    -- ON CONFLICT DO NOTHING leaves ROW_COUNT at 0 when the row already exists,
    -- so GET DIAGNOSTICS distinguishes processed vs skipped without any
    -- SELECT-INTO syntax (which trips some Supabase parsers).
    INSERT INTO public.eosb_accruals
      (user_id, period, opening_balance, accrued_amount, closing_balance, base_salary, currency, created_by)
    VALUES
      (v_emp.user_id, p_period, v_opening, v_accrual, v_opening + v_accrual, v_emp.base_salary, v_emp.currency, auth.uid())
    ON CONFLICT (user_id, period) DO NOTHING;

    GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

    IF v_inserted_rows > 0 THEN
      v_processed := v_processed + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('period', p_period, 'processed', v_processed, 'skipped', v_skipped, 'status', 'ok');
END;
$$;

GRANT EXECUTE ON FUNCTION public.accrue_eosb_for_period(text) TO authenticated;
COMMENT ON FUNCTION public.accrue_eosb_for_period(text) IS
'H8 (race-safe): Posts one EOSB accrual row per active employee for the given period. Idempotent under concurrent calls via ON CONFLICT (user_id, period).';
