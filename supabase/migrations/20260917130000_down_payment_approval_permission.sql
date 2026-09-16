-- Down Payment approval is an independently grantable capability.
-- This migration is intentionally later than 20260917120000: that migration
-- has already been applied in some environments and must not be edited.
--
-- The RPC is a legacy SECURITY DEFINER entry point.  Its authorization must
-- use the canonical permission assertion so a custom Role Management grant
-- (including a Field Assistant grant) works without inheriting admin role
-- controls.  All row ownership/scope, workflow, amount, wallet and trigger
-- checks remain in the existing database path.

CREATE OR REPLACE FUNCTION public.safe_approve_down_payment(
  p_request_id uuid,
  p_status text,
  p_update_json jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requested_by uuid;
  v_row_count integer;
  v_set_clause text;
  v_key text;
  v_val text;
  v_pairs text[] := ARRAY[]::text[];
  v_sql text;
BEGIN
  -- Explicit denies are honored by assert_resource_permission; SuperAdmin
  -- remains supported by the canonical assertion.
  PERFORM public.assert_resource_permission('down_payments', 'approve');

  IF p_status NOT IN ('approved', 'pending_admin', 'rejected') THEN
    RAISE EXCEPTION 'Unsupported down-payment approval status: %', p_status;
  END IF;

  SELECT requested_by INTO v_requested_by
  FROM public.down_payment_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'request_not_found');
  END IF;

  IF v_requested_by IS NOT NULL THEN
    INSERT INTO public.profiles (id, full_name, role, created_at, updated_at)
    SELECT au.id, COALESCE(au.raw_user_meta_data->>'full_name',
      au.raw_user_meta_data->>'name', au.email, 'Unknown'),
      'dataCollector', NOW(), NOW()
    FROM auth.users au WHERE au.id = v_requested_by
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.wallets (
      user_id, currency, balance_cents, total_earned_cents,
      total_paid_out_cents, pending_payout_cents, balances, total_earned
    ) VALUES (v_requested_by, 'SDG', 0, 0, 0, 0, '{"SDG": 0}'::jsonb, 0)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  FOR v_key, v_val IN SELECT * FROM jsonb_each_text(p_update_json) LOOP
    IF v_key = ANY(ARRAY[
      'approved_amount','admin_notes','admin_processed_by','admin_processed_at',
      'supervisor_approved_by','supervisor_approved_at','supervisor_notes',
      'updated_at','total_paid_amount','payment_method','payment_reference',
      'payment_date','payment_processed_by','payment_notes','paid_at',
      'tier','tier1_approver','tier2_approver','tier1_approved_at',
      'tier2_approved_at','tier1_notes','tier2_notes'
    ]) THEN
      v_pairs := v_pairs || format('%I = %L', v_key, v_val);
    END IF;
  END LOOP;
  v_pairs := v_pairs || format('status = %L', p_status);
  v_pairs := v_pairs || format('updated_at = %L', NOW()::text);
  v_sql := format('UPDATE public.down_payment_requests SET %s WHERE id = %L',
    array_to_string(v_pairs, ', '), p_request_id);
  EXECUTE v_sql;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count = 0 THEN
    RETURN json_build_object('ok', false, 'error', 'no_rows_updated',
      'hint', 'RLS blocked the update or request no longer exists');
  END IF;
  RETURN json_build_object('ok', true, 'request_id', p_request_id,
    'status', p_status, 'rows_updated', v_row_count);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('ok', false, 'error', SQLERRM, 'sqlstate', SQLSTATE);
END;
$$;

-- Narrow one-argument entry point used by explicit approvers.  Do not expose
-- caller-controlled actor, status, amount, or target fields on this path.
CREATE OR REPLACE FUNCTION public.safe_approve_down_payment(p_request_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hub text;
  v_scope_hub text;
  v_count integer;
BEGIN
  PERFORM public.assert_resource_permission('down_payments', 'approve');
  SELECT d.hub_id, p.hub_id INTO v_hub, v_scope_hub
  FROM public.down_payment_requests d
  LEFT JOIN public.profiles p ON p.id = auth.uid()
  WHERE d.id = p_request_id AND d.status = 'pending_admin';
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'not_pending_admin');
  END IF;
  -- Scope is deliberately fail-closed for non-administrative explicit
  -- approvers.  A hub must be proven from the request and caller profile.
  IF NOT public.is_super_admin(auth.uid())
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid()
         AND lower(coalesce(p.role, '')) IN
           ('admin','administrator','financialadmin','financial_admin','finance admin')
     )
     AND (v_hub IS NULL OR v_scope_hub IS NULL OR v_hub <> v_scope_hub) THEN
    RETURN json_build_object('ok', false, 'error', 'out_of_scope');
  END IF;
  UPDATE public.down_payment_requests
  SET status = 'approved',
      admin_status = 'approved',
      admin_processed_by = auth.uid(),
      admin_processed_at = now(),
      updated_at = now()
  WHERE id = p_request_id AND status = 'pending_admin';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RETURN json_build_object('ok', false, 'error', 'not_pending_admin');
  END IF;
  RETURN json_build_object('ok', true, 'request_id', p_request_id,
    'status', 'approved', 'actor_id', auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.safe_approve_down_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.safe_approve_down_payment(uuid)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.safe_approve_down_payment(uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
-- No frontend caller uses this legacy caller-controlled overload.  Keep it
-- available only to trusted internal jobs; explicit Role Management callers
-- must use the one-argument atomic path above.
GRANT EXECUTE ON FUNCTION public.safe_approve_down_payment(uuid, text, jsonb)
  TO service_role;

-- Preserve intended defaults only; notably do not add this capability to
-- Field Assistant or any other field role.
INSERT INTO public.permissions (role_id, resource, action)
SELECT r.id, 'down_payments', 'approve'
FROM public.roles r
WHERE lower(replace(replace(r.name, ' ', '_'), '-', '_'))
  IN ('admin', 'financialadmin', 'financial_admin')
  AND r.is_active = true
ON CONFLICT (role_id, resource, action) DO NOTHING;