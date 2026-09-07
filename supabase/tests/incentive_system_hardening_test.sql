-- Run after both hardening migrations in a disposable database.
BEGIN;

DO $$
BEGIN
 IF to_regprocedure('public.calculate_and_preapprove_mmp_incentives(uuid)') IS NOT NULL
    OR to_regprocedure('public.calculate_and_preapprove_mmp_incentives(uuid,jsonb)') IS NULL
    OR to_regprocedure('public.set_mmp_incentive_eligibility_override(uuid,text,text,text,text,text)') IS NULL
    OR to_regprocedure('public.revoke_mmp_incentive_eligibility_override(uuid,text)') IS NULL
    OR to_regprocedure('public.resolve_mmp_hub_state(text,text)') IS NULL
    OR to_regclass('public.mmp_incentive_eligibility_overrides') IS NULL THEN
   RAISE EXCEPTION 'canonical eligibility RPC contract is missing';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
   AND table_name='mmp_incentive_snapshots' AND column_name IN ('currency','eligibility_snapshot','role_counts')
   GROUP BY table_name HAVING count(*)=3)
 OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
   AND table_name='mmp_incentive_payments' AND column_name='eligibility_evidence') THEN
   RAISE EXCEPTION 'eligibility snapshot fields are missing';
 END IF;
END $$;

-- NULL state is a real, deduplicated hub scope; a PK on nullable state_id would
-- reject it before ON CONFLICT can arbitrate automatic and explicit candidates.
DO $$
DECLARE n int;
BEGIN
 CREATE TEMP TABLE eligible(user_id uuid,role text,state_key text NOT NULL,state_id text,
   priority int,PRIMARY KEY(user_id,role,state_key)) ON COMMIT DROP;
 INSERT INTO eligible VALUES ('00000000-0000-0000-0000-000000000001','support_team','',NULL,10)
   ON CONFLICT(user_id,role,state_key) DO UPDATE SET priority=excluded.priority;
 INSERT INTO eligible VALUES ('00000000-0000-0000-0000-000000000001','support_team','',NULL,20)
   ON CONFLICT(user_id,role,state_key) DO UPDATE SET priority=excluded.priority;
 SELECT count(*) INTO n FROM eligible;
 IF n<>1 OR (SELECT priority FROM eligible)<>20 THEN RAISE EXCEPTION 'NULL-safe eligibility precedence regressed'; END IF;
END $$;

DO $$
BEGIN
 IF public.incentive_role_key('Support Team')<>'support_team'
    OR public.incentive_role_key('Field Operations Manager (FOM)')<>'fom'
    OR public.incentive_role_key('Hub Supervisor')<>'supervisor' THEN
   RAISE EXCEPTION 'four-role normalization regression';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid='public.calculate_and_preapprove_mmp_incentives(uuid,jsonb)'::regprocedure
   AND prosrc ILIKE '%ambiguous incentive roles for user%'
   AND prosrc ILIKE '%state-scoped coordinator overrides require proportional%'
   AND prosrc ILIKE '%to_jsonb(f)->>''hub_name''%'
   AND prosrc ILIKE '%resolve_mmp_hub_state%'
   AND prosrc ILIKE '%ON CONFLICT(user_id,role,state_key)%') THEN
   RAISE EXCEPTION 'eligibility safety controls are missing';
 END IF;
END $$;

-- Both state ID and display name canonicalize to the same state key.
DO $$
DECLARE a text; b text;
BEGIN
 CREATE TEMP TABLE states(hub_id text,state_id text,state_name text) ON COMMIT DROP;
 INSERT INTO states VALUES ('h','north','Northern State');
 SELECT state_id INTO a FROM states WHERE public.incentive_scope_key('north') IN(public.incentive_scope_key(state_id),public.incentive_scope_key(state_name));
 SELECT state_id INTO b FROM states WHERE public.incentive_scope_key('Northern State') IN(public.incentive_scope_key(state_id),public.incentive_scope_key(state_name));
 IF a IS DISTINCT FROM 'north' OR b IS DISTINCT FROM 'north' THEN RAISE EXCEPTION 'state canonicalization regressed'; END IF;
END $$;

DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid='public.mmp_incentive_eligibility_override_live_unique'::regclass AND indisunique)
    OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid='public.calculate_and_preapprove_mmp_incentives(uuid,jsonb)'::regprocedure
      AND prosrc ILIKE '%cycle_status%' AND prosrc ILIKE '%2026-08-01%'
      AND prosrc ILIKE '%status IN (''paid'',''reversed'')%') THEN
   RAISE EXCEPTION 'lifecycle or override hardening is missing';
 END IF;
END $$;

ROLLBACK;