-- Atomic, authorised period close and cost allocation posting.
-- This supersedes the earlier best-effort period-close allocation helper.  Do not
-- call journal tables from a browser for allocation posting.

BEGIN;

-- These tables were originally introduced in an unversioned SQL file. Define
-- the small allocation schema here as well so this timestamped migration can
-- be applied safely on a clean database.
CREATE TABLE IF NOT EXISTS public.acct_cost_allocation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_name TEXT NOT NULL,
  source_account_id UUID REFERENCES public.acct_accounts(id) ON DELETE SET NULL,
  source_account_code TEXT,
  basis_type TEXT NOT NULL DEFAULT 'equal'
    CHECK (basis_type IN ('equal', 'budget_pct', 'headcount')),
  target_count INT NOT NULL DEFAULT 2,
  is_active BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.acct_cost_allocation_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES public.acct_cost_allocation_rules(id) ON DELETE CASCADE,
  target_account_id UUID NOT NULL REFERENCES public.acct_accounts(id) ON DELETE CASCADE,
  weight_pct NUMERIC(8,4) NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_acct_alloc_targets_rule
  ON public.acct_cost_allocation_targets(rule_id);

CREATE TABLE IF NOT EXISTS public.acct_allocation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_allocated NUMERIC(18,2) NOT NULL DEFAULT 0,
  rule_count INT NOT NULL DEFAULT 0,
  journal_entry_id UUID,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('pending', 'completed', 'reversed', 'failed')),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.acct_cost_allocation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acct_cost_allocation_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acct_allocation_runs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.acct_allocation_runs
  ADD COLUMN IF NOT EXISTS period_id uuid REFERENCES public.acct_fiscal_periods(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS acct_allocation_runs_idempotency_key_uq
  ON public.acct_allocation_runs (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS acct_allocation_runs_completed_period_uq
  ON public.acct_allocation_runs (period_id)
  WHERE period_id IS NOT NULL
    AND status = 'completed'
    AND idempotency_key IS NOT NULL;

-- Allocation configuration and run records must never be writable by every
-- authenticated caller. Finance can manage rules; auditors can inspect them.
DROP POLICY IF EXISTS alloc_rules_all ON public.acct_cost_allocation_rules;
DROP POLICY IF EXISTS cost_alloc_targets_all ON public.acct_cost_allocation_targets;
DROP POLICY IF EXISTS alloc_runs_all ON public.acct_allocation_runs;
DROP POLICY IF EXISTS acct_allocation_rules_read ON public.acct_cost_allocation_rules;
DROP POLICY IF EXISTS acct_allocation_rules_write ON public.acct_cost_allocation_rules;
DROP POLICY IF EXISTS acct_allocation_targets_read ON public.acct_cost_allocation_targets;
DROP POLICY IF EXISTS acct_allocation_targets_write ON public.acct_cost_allocation_targets;
DROP POLICY IF EXISTS acct_allocation_runs_read ON public.acct_allocation_runs;
CREATE POLICY acct_allocation_rules_read ON public.acct_cost_allocation_rules
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
      AND lower(regexp_replace(coalesce(role, ''), '[^a-zA-Z]', '', 'g'))
          IN ('superadmin','admin','finance','financialadmin','accountant','auditor'))
  );
CREATE POLICY acct_allocation_rules_write ON public.acct_cost_allocation_rules
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
      AND lower(regexp_replace(coalesce(role, ''), '[^a-zA-Z]', '', 'g'))
          IN ('superadmin','admin','finance','financialadmin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
      AND lower(regexp_replace(coalesce(role, ''), '[^a-zA-Z]', '', 'g'))
          IN ('superadmin','admin','finance','financialadmin'))
  );
CREATE POLICY acct_allocation_targets_read ON public.acct_cost_allocation_targets
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
      AND lower(regexp_replace(coalesce(role, ''), '[^a-zA-Z]', '', 'g'))
          IN ('superadmin','admin','finance','financialadmin','accountant','auditor'))
  );
CREATE POLICY acct_allocation_targets_write ON public.acct_cost_allocation_targets
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
      AND lower(regexp_replace(coalesce(role, ''), '[^a-zA-Z]', '', 'g'))
          IN ('superadmin','admin','finance','financialadmin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
      AND lower(regexp_replace(coalesce(role, ''), '[^a-zA-Z]', '', 'g'))
          IN ('superadmin','admin','finance','financialadmin'))
  );
CREATE POLICY acct_allocation_runs_read ON public.acct_allocation_runs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
       WHERE id = auth.uid()
          AND lower(regexp_replace(coalesce(role, ''), '[^a-zA-Z]', '', 'g'))
              IN ('superadmin','admin','finance','financialadmin','accountant','auditor')
    )
  );

CREATE OR REPLACE FUNCTION public.acct_run_cost_allocation(
  p_period_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_period public.acct_fiscal_periods%ROWTYPE;
  v_run_id uuid;
  v_journal_id uuid;
  v_fund_id uuid;
  v_key text;
  v_rule record;
  v_target record;
  v_pool numeric(20,4);
  v_weight numeric(20,6);
  v_amount numeric(20,2);
  v_remaining numeric(20,2);
  v_target_count integer;
  v_account_ok boolean;
  v_existing_period_run record;
  v_legacy_run_count integer;
  v_line_no integer := 0;
  v_rule_count integer := 0;
  v_total numeric(20,2) := 0;
  v_dr numeric(20,2) := 0;
  v_cr numeric(20,2) := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: authenticated user required';
  END IF;
  SELECT lower(regexp_replace(coalesce(role, ''), '[^a-zA-Z]', '', 'g'))
    INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF coalesce(v_role, '') NOT IN ('superadmin','admin','finance','financialadmin') THEN
    RAISE EXCEPTION 'AUTHORIZATION_FAILED: Finance or Admin role required' USING ERRCODE = '42501';
  END IF;

  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED';
  END IF;
  v_key := btrim(p_idempotency_key);
  PERFORM pg_advisory_xact_lock(hashtext('acct-allocation:' || v_key));

  SELECT * INTO v_period
    FROM public.acct_fiscal_periods
   WHERE id = p_period_id
   FOR UPDATE;
  IF p_period_id IS NULL THEN
    SELECT * INTO v_period
      FROM public.acct_fiscal_periods
     WHERE current_date BETWEEN start_date AND end_date
       AND status IN ('open', 'soft_closed')
     ORDER BY start_date DESC
     LIMIT 1
     FOR UPDATE;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: no open fiscal period was found';
  END IF;
  IF v_period.status NOT IN ('open', 'soft_closed') THEN
    RAISE EXCEPTION 'PERIOD_CLOSED: period % is %', v_period.id, v_period.status;
  END IF;

  -- The period row lock serialises all allocation attempts. A completed
  -- allocation is a business fact for that period, independent of whichever
  -- browser request or idempotency UUID initiated it.
  -- Legacy period-close allocation recorded a completed row for each rule.
  -- Treat that history as already allocated (never replay it), while the
  -- new non-null idempotency key distinguishes the atomic singleton run.
  SELECT count(*)
    INTO v_legacy_run_count
    FROM public.acct_allocation_runs
   WHERE period_id = v_period.id
     AND status = 'completed'
     AND idempotency_key IS NULL;
  IF v_legacy_run_count > 0 THEN
    RETURN jsonb_build_object(
      'status', 'legacy_completed',
      'idempotent', true,
      'rule_count', 0,
      'total_allocated', 0,
      'message', 'Existing legacy allocation history was retained; no allocation was reposted.'
    );
  END IF;

  SELECT id, journal_entry_id, total_allocated, rule_count
    INTO v_existing_period_run
    FROM public.acct_allocation_runs
   WHERE period_id = v_period.id AND status = 'completed'
   ORDER BY created_at DESC
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'completed', 'idempotent', true,
      'run_id', v_existing_period_run.id,
      'journal_entry_id', v_existing_period_run.journal_entry_id,
      'total_allocated', v_existing_period_run.total_allocated,
      'rule_count', v_existing_period_run.rule_count);
  END IF;

  SELECT id INTO v_run_id
    FROM public.acct_allocation_runs
   WHERE idempotency_key = v_key;
  IF FOUND THEN
    SELECT journal_entry_id, total_allocated, rule_count
      INTO v_journal_id, v_total, v_rule_count
      FROM public.acct_allocation_runs WHERE id = v_run_id;
    RETURN jsonb_build_object('status', 'completed', 'idempotent', true,
      'run_id', v_run_id, 'journal_entry_id', v_journal_id,
      'total_allocated', v_total, 'rule_count', v_rule_count);
  END IF;

  SELECT id INTO v_fund_id FROM public.acct_funds
   WHERE code = 'GENERAL' AND is_active = true LIMIT 1;
  IF v_fund_id IS NULL THEN
    SELECT id INTO v_fund_id FROM public.acct_funds
     WHERE is_active = true ORDER BY created_at LIMIT 1;
  END IF;
  IF v_fund_id IS NULL THEN
    RAISE EXCEPTION 'NO_ACTIVE_FUND: create an active fund before allocating costs';
  END IF;

  -- Header remains draft until every line has been inserted and checked.
  INSERT INTO public.acct_journal_entries (
    period_id, posting_date, description_en, description_ar, source_type,
    status, idempotency_key, created_by
  ) VALUES (
    v_period.id, v_period.end_date,
    'Cost Allocation — ' || v_period.start_date || ' to ' || v_period.end_date,
    'توزيع التكاليف للفترة',
    'cost_allocation', 'draft', 'cost-allocation:' || v_key, auth.uid()
  ) RETURNING id INTO v_journal_id;

  FOR v_rule IN
    SELECT r.id, r.pool_name, r.source_account_id
      FROM public.acct_cost_allocation_rules r
     WHERE r.is_active
     ORDER BY r.id
  LOOP
    SELECT is_active AND is_postable INTO v_account_ok
      FROM public.acct_accounts WHERE id = v_rule.source_account_id;
    IF coalesce(v_account_ok, false) = false THEN
      RAISE EXCEPTION 'INVALID_ALLOCATION_RULE: source account for rule % is missing, inactive, or non-postable', v_rule.id;
    END IF;
    SELECT count(*), coalesce(sum(weight_pct), 0)
      INTO v_target_count, v_weight
      FROM public.acct_cost_allocation_targets
     WHERE rule_id = v_rule.id;
    IF v_target_count = 0 OR abs(v_weight - 100) > 0.0001 THEN
      RAISE EXCEPTION 'INVALID_ALLOCATION_RULE: rule % must have targets totaling exactly 100%%', v_rule.id;
    END IF;

    -- Net posted activity in the requested period, rounded once to the journal
    -- currency precision.  Allocation journals themselves are excluded to avoid
    -- allocating an earlier allocation run a second time.
    SELECT round(coalesce(sum(CASE WHEN jl.debit_credit = 'DR'
                                   THEN jl.functional_amount
                                   ELSE -jl.functional_amount END), 0), 2)
      INTO v_pool
      FROM public.acct_journal_lines jl
      JOIN public.acct_journal_entries je ON je.id = jl.entry_id
     WHERE jl.account_id = v_rule.source_account_id
       AND je.period_id = v_period.id
       AND je.status = 'posted'
       AND coalesce(je.source_type, '') <> 'cost_allocation';
    IF v_pool <= 0 THEN
      CONTINUE;
    END IF;

    v_remaining := v_pool;
    FOR v_target IN
      SELECT target_account_id, weight_pct,
             row_number() over (ORDER BY id) AS ordinal
        FROM public.acct_cost_allocation_targets
       WHERE rule_id = v_rule.id
       ORDER BY id
    LOOP
      SELECT is_active AND is_postable INTO v_account_ok
        FROM public.acct_accounts WHERE id = v_target.target_account_id;
      IF coalesce(v_account_ok, false) = false THEN
        RAISE EXCEPTION 'INVALID_ALLOCATION_RULE: target account for rule % is missing, inactive, or non-postable', v_rule.id;
      END IF;
      IF v_target.ordinal = v_target_count THEN
        v_amount := v_remaining; -- absorb rounding residual on final debit
      ELSE
        v_amount := round(v_pool * v_target.weight_pct / 100, 2);
        v_remaining := v_remaining - v_amount;
      END IF;
      IF v_amount <= 0 THEN CONTINUE; END IF;
      v_line_no := v_line_no + 1;
      INSERT INTO public.acct_journal_lines (
        entry_id, line_no, account_id, fund_id, function, debit_credit,
        original_amount, original_currency, functional_amount, functional_currency, description
      ) VALUES (
        v_journal_id, v_line_no, v_target.target_account_id, v_fund_id, 'program', 'DR',
        v_amount, 'SDG', v_amount, 'SDG', 'Allocated from pool: ' || v_rule.pool_name
      );
      v_dr := v_dr + v_amount;
    END LOOP;
    v_line_no := v_line_no + 1;
    INSERT INTO public.acct_journal_lines (
      entry_id, line_no, account_id, fund_id, function, debit_credit,
      original_amount, original_currency, functional_amount, functional_currency, description
    ) VALUES (
      v_journal_id, v_line_no, v_rule.source_account_id, v_fund_id, 'program', 'CR',
      v_pool, 'SDG', v_pool, 'SDG', 'Pool clearing: ' || v_rule.pool_name
    );
    v_cr := v_cr + v_pool;
    v_total := v_total + v_pool;
    v_rule_count := v_rule_count + 1;
  END LOOP;

  IF v_rule_count = 0 THEN
    DELETE FROM public.acct_journal_entries WHERE id = v_journal_id;
    RETURN jsonb_build_object('status', 'no_activity', 'idempotent', false,
      'total_allocated', 0, 'rule_count', 0);
  END IF;
  IF v_dr <> v_cr OR v_dr <> v_total THEN
    RAISE EXCEPTION 'ALLOCATION_IMBALANCE: debit %, credit %, total %', v_dr, v_cr, v_total;
  END IF;

  UPDATE public.acct_journal_entries
     SET status = 'posted', posted_at = now(), posted_by = auth.uid()
   WHERE id = v_journal_id;

  -- A completed run is only written after the journal has been successfully posted.
  INSERT INTO public.acct_allocation_runs (
    period_id, run_date, total_allocated, rule_count, journal_entry_id,
    status, notes, created_by, idempotency_key
  ) VALUES (
    v_period.id, v_period.end_date, v_total, v_rule_count, v_journal_id,
    'completed', 'Posted allocation journal with ' || v_line_no || ' lines', auth.uid(), v_key
  ) RETURNING id INTO v_run_id;
  PERFORM pg_notify('acct_journal_posted', v_journal_id::text);
  RETURN jsonb_build_object('status', 'completed', 'idempotent', false,
    'run_id', v_run_id, 'journal_entry_id', v_journal_id,
    'total_allocated', v_total, 'rule_count', v_rule_count, 'line_count', v_line_no);
END $$;

CREATE OR REPLACE FUNCTION public.acct_close_fiscal_period(
  p_period_id uuid,
  p_next_status text,
  p_run_allocation boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_period public.acct_fiscal_periods%ROWTYPE;
  v_allocation jsonb := NULL;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT lower(regexp_replace(coalesce(role, ''), '[^a-zA-Z]', '', 'g'))
    INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF coalesce(v_role, '') NOT IN ('superadmin','admin','finance','financialadmin') THEN
    RAISE EXCEPTION 'AUTHORIZATION_FAILED: Finance or Admin role required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_period FROM public.acct_fiscal_periods WHERE id = p_period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PERIOD_NOT_FOUND: %', p_period_id; END IF;
  IF NOT ((v_period.status = 'open' AND p_next_status = 'soft_closed')
       OR (v_period.status = 'soft_closed' AND p_next_status IN ('open','hard_closed'))
       OR (v_period.status = 'hard_closed' AND p_next_status IN ('soft_closed','locked'))) THEN
    RAISE EXCEPTION 'INVALID_PERIOD_TRANSITION: % to %', v_period.status, p_next_status;
  END IF;
  IF p_next_status = 'locked' AND v_role <> 'superadmin' THEN
    RAISE EXCEPTION 'AUTHORIZATION_FAILED: only Super Admin may lock a period' USING ERRCODE = '42501';
  END IF;
  IF p_run_allocation AND p_next_status IN ('soft_closed', 'hard_closed') THEN
    v_allocation := public.acct_run_cost_allocation(
      p_period_id, 'period-close:' || p_period_id::text || ':' || p_next_status
    );
  END IF;
  UPDATE public.acct_fiscal_periods
     SET status = p_next_status,
         closed_at = CASE WHEN p_next_status IN ('soft_closed','hard_closed','locked') THEN now() ELSE NULL END
   WHERE id = p_period_id;
  INSERT INTO public.acct_period_close_log (period_id, from_status, to_status, changed_by, note)
  VALUES (p_period_id, v_period.status, p_next_status, auth.uid(),
          CASE WHEN p_run_allocation THEN 'Allocation requested in the same transaction' ELSE NULL END);
  RETURN jsonb_build_object('status', p_next_status, 'period_id', p_period_id,
                            'allocation', v_allocation);
END $$;

REVOKE ALL ON FUNCTION public.acct_run_cost_allocation(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.acct_close_fiscal_period(uuid, text, boolean) FROM PUBLIC;
DO $$
BEGIN
  IF to_regprocedure('public.run_period_close_allocation(uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.run_period_close_allocation(uuid) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.run_period_close_allocation(uuid) FROM authenticated;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.acct_run_cost_allocation(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.acct_close_fiscal_period(uuid, text, boolean) TO authenticated;

COMMIT;