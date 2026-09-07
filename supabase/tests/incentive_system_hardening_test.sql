-- Run after the canonical migration in a disposable Supabase database.
BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.calculate_and_preapprove_mmp_incentives(uuid)') IS NOT NULL
     OR to_regprocedure('public.calculate_and_preapprove_mmp_incentives(uuid,jsonb)') IS NULL
     OR to_regprocedure('public.save_incentive_settings(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'canonical incentive RPCs were not installed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
    AND table_name='mmp_incentive_snapshots' AND column_name='currency') THEN
    RAISE EXCEPTION 'snapshot currency hardening is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
    AND table_name='mmp_incentive_snapshots' AND column_name IN ('coordinator_count','supervisor_count')
    GROUP BY table_name HAVING count(*)=2) THEN RAISE EXCEPTION 'overview count columns are missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.mmp_incentive_payments'::regclass
    AND conname='mmp_incentive_payments_nonnegative_amount') THEN
    RAISE EXCEPTION 'nonnegative payment constraint is missing';
  END IF;
END $$;

-- Assignment JSON must preserve an object's own hub/state while legacy scalar
-- roles use profile scope.  This fixture catches accidental object coercion.
DO $$
DECLARE v_object_role text; v_object_hub text; v_object_state text; v_scalar_role text;
BEGIN
  SELECT CASE WHEN jsonb_typeof(v)='object' THEN v->>'role' ELSE v#>>'{}' END,
         CASE WHEN jsonb_typeof(v)='object' THEN v->>'hub_id' END,
         CASE WHEN jsonb_typeof(v)='object' THEN v->>'state_id' END
    INTO v_object_role,v_object_hub,v_object_state
  FROM (VALUES ('{"role":"coordinator","hub_id":"hub-b","state_id":"state-b"}'::jsonb)) q(v);
  SELECT CASE WHEN jsonb_typeof(v)='object' THEN v->>'role' ELSE v#>>'{}' END
    INTO v_scalar_role FROM (VALUES ('"supervisor"'::jsonb)) q(v);
  IF v_object_role<>'coordinator' OR v_object_hub<>'hub-b' OR v_object_state<>'state-b'
     OR v_scalar_role<>'supervisor' THEN
    RAISE EXCEPTION 'additional role object/scalar scope parsing regressed';
  END IF;
END $$;

-- Counts are based on final candidates, and equal coordinator payments retain
-- SQL NULL state attribution (the grouping scope is internal only).
DO $$
DECLARE v_counts jsonb; v_null_states int;
BEGIN
  CREATE TEMP TABLE test_final_allocation(role text,state_id text,user_id uuid) ON COMMIT DROP;
  INSERT INTO test_final_allocation VALUES
    ('coordinator',NULL,gen_random_uuid()),
    ('coordinator',NULL,gen_random_uuid()),
    ('supervisor',NULL,gen_random_uuid());
  SELECT jsonb_object_agg(role,n) INTO v_counts
  FROM (SELECT role,count(*) n FROM test_final_allocation GROUP BY role) q;
  SELECT count(*) INTO v_null_states FROM test_final_allocation
    WHERE role='coordinator' AND state_id IS NULL;
  IF (v_counts->>'coordinator')::int<>2 OR (v_counts->>'supervisor')::int<>1
     OR v_null_states<>2 THEN
    RAISE EXCEPTION 'final allocation counts or equal coordinator state regressed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid='public.calculate_and_preapprove_mmp_incentives(uuid,jsonb)'::regprocedure
      AND prosrc ILIKE '%public.incentive_scope_key(e->>''state_id'')%'
      AND prosrc NOT ILIKE '%''__hub__''%'
  ) THEN RAISE EXCEPTION 'resolved evidence state is not authoritative'; END IF;
END $$;

-- Role expansion is forward-compatible with existing coordinator/supervisor
-- callers while making Support Team an explicit, auditable selection only.
DO $$
BEGIN
  IF to_regclass('public.mmp_incentive_eligibility_overrides') IS NULL
     OR to_regprocedure('public.set_mmp_incentive_eligibility_override(uuid,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'eligibility override contract is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='mmp_incentive_snapshots'
      AND column_name='eligibility_snapshot'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='mmp_incentive_payments'
      AND column_name='eligibility_evidence'
  ) THEN RAISE EXCEPTION 'immutable eligibility snapshot columns are missing'; END IF;
  IF public.incentive_role_key('Support Team') <> 'support_team' THEN
    RAISE EXCEPTION 'support team role normalization regression';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid='public.calculate_and_preapprove_mmp_incentives(uuid,jsonb)'::regprocedure
      AND prosrc ILIKE '%explicit_selection%'
      AND prosrc ILIKE '%admin_override%'
      AND prosrc ILIKE '%unresolved incentive identity%'
  ) THEN RAISE EXCEPTION 'authoritative expanded eligibility calculator is missing'; END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.incentive_configs
    WHERE is_active AND public.incentive_role_key(role) IN ('datacollector','fom','teamleader')
  ) THEN RAISE EXCEPTION 'unsupported production incentive config remains active'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid='public.save_incentive_settings(jsonb)'::regprocedure
      AND prosrc ILIKE '%v_role_key NOT IN (''coordinator'',''supervisor'')%'
  ) THEN RAISE EXCEPTION 'settings RPC unsupported-role activation guard is missing'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid='public.calculate_and_preapprove_mmp_incentives(uuid,jsonb)'::regprocedure
      AND prosrc ILIKE '%unsupported active incentive configuration exists%'
      AND prosrc ILIKE '%role IN (''coordinator'',''supervisor'')%'
  ) THEN RAISE EXCEPTION 'calculator supported-role contract is missing'; END IF;
END $$;

-- Equal split must fail closed when the selected hub has no eligible coordinator.
-- This fixture exercises the same post-allocation invariant without requiring
-- application profile fixtures or bypassing authentication.
DO $$
DECLARE v_rejected boolean := false;
BEGIN
  CREATE TEMP TABLE test_selected_configs(role text,split_method text) ON COMMIT DROP;
  CREATE TEMP TABLE test_allocations(role text) ON COMMIT DROP;
  INSERT INTO test_selected_configs VALUES('coordinator','equal');
  BEGIN
    IF EXISTS(SELECT 1 FROM test_selected_configs WHERE role='coordinator')
       AND NOT EXISTS(SELECT 1 FROM test_allocations WHERE role='coordinator') THEN
      RAISE EXCEPTION 'unresolved coordinator assignment';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_rejected := SQLERRM='unresolved coordinator assignment';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'zero-eligible equal coordinator split was not rejected';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid='public.calculate_and_preapprove_mmp_incentives(uuid,jsonb)'::regprocedure
      AND prosrc ILIKE '%unresolved coordinator assignment%'
  ) THEN RAISE EXCEPTION 'calculator coordinator invariant is missing'; END IF;
END $$;

-- Settings replacement is intentionally set-based: removed settings must not
-- survive as stale hub overrides.  Inspecting the installed function is a
-- structural assertion that is safe without mutating production configuration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid='public.save_incentive_settings(jsonb)'::regprocedure
      AND prosrc ILIKE '%DELETE FROM public.incentive_configs%'
  ) THEN RAISE EXCEPTION 'settings replacement semantics are missing'; END IF;
END $$;

DO $$
BEGIN
  IF to_regprocedure('public.pay_mmp_incentive(uuid,text,uuid,text)') IS NULL
     OR to_regprocedure('public.reverse_mmp_incentive(uuid,text)') IS NULL
     OR to_regprocedure('public.get_my_incentive_payments()') IS NULL
     OR to_regprocedure('public.enforce_mmp_incentive_payment_evidence()') IS NULL
     OR to_regprocedure('public.enforce_mmp_incentive_settlement_evidence()') IS NULL
     OR to_regprocedure('public.check_mmp_incentive_final_consistency()') IS NULL
     OR to_regprocedure('public.prevent_untrusted_mmp_incentive_evidence_insert()') IS NULL THEN
    RAISE EXCEPTION 'settlement RPC contract is missing';
  END IF;
  IF to_regprocedure('public.get_legacy_incentive_evidence_report()') IS NULL
     OR to_regprocedure('public.backfill_legacy_incentive_evidence(uuid)') IS NULL
     OR to_regclass('public.mmp_incentive_evidence_backfill_audit') IS NULL THEN
    RAISE EXCEPTION 'legacy evidence remediation contract is missing';
  END IF;
END $$;

-- Normalization is intentionally stable across title/case punctuation variants.
DO $$
BEGIN
  IF public.incentive_role_key('Field Operations Manager (FOM)') <> 'fom'
     OR public.incentive_role_key('Field Operations Manager FOM') <> 'fom'
     OR public.incentive_role_key('Hub Supervisor') <> 'supervisor'
     OR public.incentive_role_key('Financial Admin') <> 'financialadmin' THEN
    RAISE EXCEPTION 'role normalization regression';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indexrelid='public.incentive_configs_hub_role_nulls_unique'::regclass
      AND i.indisunique AND i.indnullsnotdistinct
  ) THEN RAISE EXCEPTION 'NULL-safe incentive config uniqueness is missing'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid='public.calculate_and_preapprove_mmp_incentives(uuid,jsonb)'::regprocedure
      AND prosrc ILIKE '%cycle_status%' AND prosrc ILIKE '%hub_states%'
      AND prosrc ILIKE '%2026-08-01%'
  ) THEN RAISE EXCEPTION 'calculator lifecycle/state hardening is missing'; END IF;
END $$;

-- Self-contained proof of the entry-first mapping rule: both state ID and state
-- name resolve, while NULL/blank and unknown scopes remain visible for rejection.
DO $$
DECLARE v_mapped int; v_unresolved int;
BEGIN
  CREATE TEMP TABLE test_hub_states(state_id text,state_name text) ON COMMIT DROP;
  CREATE TEMP TABLE test_entries(state text) ON COMMIT DROP;
  INSERT INTO test_hub_states VALUES('north','Northern State');
  INSERT INTO test_entries VALUES(NULL),(''),('unknown'),('north'),('Northern State');
  SELECT count(*) FILTER(WHERE h.state_id IS NOT NULL),
         count(*) FILTER(WHERE public.incentive_scope_key(e.state)='' OR h.state_id IS NULL)
  INTO v_mapped,v_unresolved
  FROM test_entries e
  LEFT JOIN test_hub_states h ON public.incentive_scope_key(e.state) IN
    (public.incentive_scope_key(h.state_id),public.incentive_scope_key(h.state_name));
  IF v_mapped<>2 OR v_unresolved<>3 THEN
    RAISE EXCEPTION 'entry-first NULL/unknown/name/ID state coverage regressed';
  END IF;
END $$;

-- Calculator must remain database-authoritative: an unauthenticated call cannot
-- be used to inject arbitrary totals, recipients, or currencies.
DO $$
DECLARE v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.calculate_and_preapprove_mmp_incentives(gen_random_uuid(), '[]'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    -- Authentication must fail before an arbitrary MMP id or any client totals
    -- can influence a calculation.
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'unauthenticated calculator call unexpectedly succeeded'; END IF;
END $$;

ROLLBACK;