-- Regression coverage for 20260916160000_prefund_payment_permissions.sql.
--
-- This is intentionally disposable: all assertions run in one transaction and
-- no fixture rows are required. It validates the deployed function definitions
-- and the preserved legacy function name, which catches partial migration
-- application without requiring a production-like fund fixture.
BEGIN;

DO $$
DECLARE
  v_auth text;
  v_shared text;
  v_wrapper text;
  v_reconciled text;
  v_legacy text;
  v_constraint text;
  v_selector text;
  v_guard text;
  v_down text;
  v_atomic text;
  v_role_id uuid;
BEGIN
  IF to_regprocedure('public._assert_down_payment_payment_access()') IS NULL THEN
    RAISE EXCEPTION 'dedicated Down Payment payment assertion is missing';
  END IF;
  SELECT pg_get_functiondef('public._assert_down_payment_payment_access()'::regprocedure) INTO v_down;
  FOREACH v_auth IN ARRAY ARRAY[
    'assert_resource_permission(''down_payments'', ''mark_paid'')',
    'assert_resource_permission(''pre_funding'', ''use_for_payment'')',
    'app.down_payment_payment_authorized'
  ] LOOP
    IF position(v_auth IN v_down) = 0 THEN
      RAISE EXCEPTION 'Down Payment assertion is missing: %', v_auth;
    END IF;
  END LOOP;
  SELECT pg_get_functiondef(
    'public.record_down_payment_with_wallet_rpc(uuid,uuid,numeric,text,text,text,text,integer)'::regprocedure
  ) INTO v_atomic;
  IF position('_assert_down_payment_payment_access' IN v_atomic) = 0
     OR position('_assert_finance_role' IN v_atomic) > 0 THEN
    RAISE EXCEPTION 'atomic Down Payment RPC did not receive its dedicated gate';
  END IF;
  -- Existing finance defaults and the later Field Assistant payment grant must
  -- both use the dedicated payment capabilities.
  IF EXISTS (SELECT 1 FROM public.roles WHERE lower(replace(name, ' ', '_')) IN ('admin', 'financialadmin', 'financial_admin') AND is_active) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.permissions p JOIN public.roles r ON r.id = p.role_id
      WHERE r.is_active AND lower(replace(r.name, ' ', '_')) IN ('admin', 'financialadmin', 'financial_admin')
        AND p.resource = 'down_payments' AND p.action = 'mark_paid'
    ) THEN RAISE EXCEPTION 'finance defaults are missing down_payments:mark_paid'; END IF;
  END IF;
  SELECT id INTO v_role_id
  FROM public.roles
  WHERE regexp_replace(lower(name), '[^a-z0-9]+', '', 'g') = 'fieldassistant'
    AND is_active
  LIMIT 1;
  IF v_role_id IS NOT NULL THEN
    IF EXISTS (
      SELECT required.resource, required.action
      FROM (VALUES
        ('down_payments', 'mark_paid'),
        ('cost_submissions', 'mark_paid'),
        ('pre_funding', 'use_for_payment')
      ) AS required(resource, action)
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.permissions p
        WHERE p.role_id = v_role_id
          AND p.resource = required.resource
          AND p.action = required.action
      )
    ) THEN
      RAISE EXCEPTION 'Field Assistant is missing a required payment capability';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.permissions p
      WHERE p.role_id = v_role_id
        AND p.action = 'approve'
        AND p.resource IN ('down_payments', 'cost_submissions', 'pre_funding')
    ) THEN
      RAISE EXCEPTION 'Field Assistant payment grant must not add approval authority';
    END IF;
  END IF;
  IF to_regprocedure('public._assert_pre_fund_payment_access()') IS NULL THEN
    RAISE EXCEPTION 'dedicated Pre-Fund payment assertion is missing';
  END IF;
  IF to_regprocedure('public.record_required_pre_fund_payment_rpc(text,uuid,uuid,numeric,text,date,uuid,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'public payment RPC is missing';
  END IF;
  IF to_regprocedure('public.record_required_pre_fund_payment_legacy_rpc(text,uuid,uuid,numeric,text,date,uuid,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'legacy payment RPC rename was not applied';
  END IF;
  -- The migration's guarded rename is what makes re-application safe: both
  -- the preserved implementation and the new public wrapper are present.

  SELECT pg_get_functiondef(
    'public._assert_pre_fund_payment_access()'::regprocedure
  ) INTO v_auth;
  IF position('is_super_admin' IN lower(v_auth)) = 0
     OR position('assert_resource_permission(''cost_submissions'', ''mark_paid'')' IN v_auth) = 0
     OR position('assert_resource_permission(''pre_funding'', ''use_for_payment'')' IN v_auth) = 0
     OR position('is_super_admin' IN lower(v_auth))
        > position('assert_resource_permission' IN lower(v_auth)) THEN
    RAISE EXCEPTION 'payment assertion must check Super Admin first and require both dedicated actions';
  END IF;

  SELECT pg_get_functiondef(
    'public._record_shared_cost_submission_payment(uuid,uuid,numeric,text,date,uuid,text,text,text)'::regprocedure
  ) INTO v_shared;
  FOREACH v_auth IN ARRAY ARRAY[
    'FOR UPDATE',
    'approved',
    'partially_paid',
    'currency',
    'available_balance',
    '_assert_pre_fund_payment_access',
    'p_user_id'
  ] LOOP
    IF position(lower(v_auth) IN lower(v_shared)) = 0 THEN
      RAISE EXCEPTION 'shared payment function is missing required guard: %', v_auth;
    END IF;
  END LOOP;
  IF position('NULL, p_receipt_url' IN v_shared) = 0
     AND position('null, p_receipt_url' IN lower(v_shared)) = 0 THEN
    RAISE EXCEPTION 'shared OCS linkage must pass NULL personal-allocation identity';
  END IF;
  IF position('_assert_pre_fund_payment_access' IN v_shared)
       > position('SELECT * INTO v_source' IN v_shared)
     OR position('idempotent' IN lower(v_shared))
       > position('SELECT * INTO v_source' IN v_shared)
     OR position('idempotency_key' IN lower(v_shared)) = 0
     OR position('source_table' IN lower(v_shared)) = 0
     OR position('source_id' IN lower(v_shared)) = 0
     OR position('pre_fund_request_id' IN lower(v_shared)) = 0 THEN
    RAISE EXCEPTION 'OCS idempotency must authorize and validate event identity before mutable source checks';
  END IF;

  SELECT pg_get_functiondef(
    'public.record_required_pre_fund_payment_rpc(text,uuid,uuid,numeric,text,date,uuid,text,text,text)'::regprocedure
  ) INTO v_wrapper;
  IF position('_record_shared_cost_submission_payment' IN v_wrapper) = 0
     OR position('record_required_pre_fund_payment_legacy_rpc' IN v_wrapper) = 0 THEN
    RAISE EXCEPTION 'public wrapper does not preserve shared OCS and legacy branches';
  END IF;

  SELECT pg_get_functiondef(
    'public.record_reconciled_required_pre_fund_payment_rpc(text,uuid,uuid,numeric,text,date,uuid,text,text,text)'::regprocedure
  ) INTO v_reconciled;
  IF position('_record_shared_cost_submission_payment' IN v_reconciled) = 0
     OR position('_record_shared_cost_submission_payment' IN v_reconciled)
          > position('_assert_finance_role' IN v_reconciled)
     OR position('down_payment_requests' IN v_reconciled) = 0
     OR position('pre_fund_source_total_reconciled' IN v_reconciled) = 0 THEN
    RAISE EXCEPTION 'reconciled RPC does not dispatch OCS first while preserving Down-Payment reconciliation';
  END IF;

  SELECT pg_get_functiondef(
    'public.record_required_pre_fund_payment_legacy_rpc(text,uuid,uuid,numeric,text,date,uuid,text,text,text)'::regprocedure
  ) INTO v_legacy;
  IF position('link_payment_atomically_rpc' IN v_legacy) = 0 THEN
    RAISE EXCEPTION 'legacy renamed implementation is not retained';
  END IF;

  SELECT pg_get_constraintdef(oid)
  INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.permissions'::regclass
    AND conname = 'permissions_action_check';
  IF v_constraint IS NULL
     OR position('mark_paid' IN v_constraint) = 0
     OR position('use_for_payment' IN v_constraint) = 0 THEN
    RAISE EXCEPTION 'permission action constraint does not include dedicated payment actions';
  END IF;

  IF to_regprocedure('public.get_payment_eligible_pre_funds(text)') IS NULL THEN
    RAISE EXCEPTION 'narrow payment fund selector RPC is missing';
  END IF;
  SELECT pg_get_functiondef(
    'public.get_payment_eligible_pre_funds(text)'::regprocedure
  ) INTO v_selector;
  IF position('mark_paid' IN lower(v_selector)) = 0
     OR position('use_for_payment' IN lower(v_selector)) = 0
     OR position('available_balance' IN lower(v_selector)) = 0
     OR position('active' IN lower(v_selector)) = 0
     OR position('low_balance' IN lower(v_selector)) = 0 THEN
    RAISE EXCEPTION 'selector RPC is missing dual authorization or fund filters';
  END IF;

  SELECT pg_get_functiondef(
    'public.guard_finance_resource_transition()'::regprocedure
  ) INTO v_guard;
  IF position('app.pre_fund_payment_rpc' IN lower(v_guard)) = 0
     OR position('operational_cost_submissions' IN lower(v_guard)) = 0
     OR position('assert_resource_permission(resource, ''approve'')' IN v_guard) = 0
     OR position('assert_resource_permission(''pre_funding'', ''update'')' IN v_guard) = 0 THEN
    RAISE EXCEPTION 'finance transition guard does not preserve direct/Down-Payment checks and OCS bypass';
  END IF;
END $$;

ROLLBACK;