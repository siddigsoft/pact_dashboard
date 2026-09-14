-- Transactional regression checks for
-- 20260914_operational_cost_data_scope_authoritative.sql.
--
-- This is intentionally fixture-free: it can run safely against a populated
-- environment and verifies that the database cannot silently fall back to a
-- direct table read when the authoritative predicate/RPC changes.
BEGIN;

DO $$
DECLARE
  v_policy TEXT;
  v_list_rpc TEXT;
  v_replace_rpc TEXT;
  v_predicate TEXT;
  v_mode_check TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_predicate
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'can_view_operational_cost_submission'
  ORDER BY p.oid DESC
  LIMIT 1;
  IF v_predicate IS NULL OR position('SECURITY DEFINER' IN upper(v_predicate)) = 0 THEN
    RAISE EXCEPTION 'authorization predicate is missing or not SECURITY DEFINER';
  END IF;

  SELECT pg_get_functiondef(p.oid)
    INTO v_list_rpc
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_all_operational_cost_submissions'
  ORDER BY p.oid DESC
  LIMIT 1;
  IF v_list_rpc IS NULL
     OR position('can_view_operational_cost_submission' IN v_list_rpc) = 0
  THEN
    RAISE EXCEPTION 'list RPC does not use the shared authorization predicate';
  END IF;

  SELECT pg_get_functiondef(p.oid)
    INTO v_replace_rpc
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'replace_operational_cost_data_scope'
  ORDER BY p.oid DESC
  LIMIT 1;
  IF v_replace_rpc IS NULL
     OR position('SECURITY DEFINER' IN upper(v_replace_rpc)) = 0
     OR position('data_scope_config' IN v_replace_rpc) = 0
     OR position('workspace_check_super_admin' IN v_replace_rpc) = 0
  THEN
    RAISE EXCEPTION 'replace scope RPC is missing or not SECURITY DEFINER';
  END IF;

  IF position('workspace_check_super_admin' IN (
       SELECT pg_get_functiondef(p.oid)
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = 'preview_operational_cost_submission_scope'
       ORDER BY p.oid DESC
       LIMIT 1
     )) = 0
  THEN
    RAISE EXCEPTION 'preview RPC is not restricted by workspace Super Admin authority';
  END IF;

  SELECT pg_get_expr(c.conbin, c.conrelid)
    INTO v_mode_check
  FROM pg_constraint c
  WHERE c.conrelid = 'public.data_scope_config'::regclass
    AND c.conname = 'data_scope_config_mode_check';
  IF v_mode_check IS NULL
     OR position('selected' IN v_mode_check) = 0
     OR position('organization' IN v_mode_check) = 0
  THEN
    RAISE EXCEPTION 'resource-specific scope modes are incomplete';
  END IF;

  SELECT pg_get_expr(pol.polqual, pol.polrelid)
    INTO v_policy
  FROM pg_policy pol
  WHERE pol.polrelid = 'public.operational_cost_submissions'::regclass
    AND pol.polname = 'operational_cost_submissions_scope_select';
  IF v_policy IS NULL
     OR position('can_view_operational_cost_submission' IN v_policy) = 0
  THEN
    RAISE EXCEPTION 'operational cost SELECT RLS does not use shared predicate';
  END IF;

  RAISE NOTICE 'PASS: operational cost scope predicate, RPC, modes, and SELECT RLS are wired together';
END;
$$;

ROLLBACK;