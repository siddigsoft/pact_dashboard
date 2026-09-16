-- Dedicated Down Payment disbursement capability.
-- Approval and payment are intentionally separate: granting mark_paid never
-- grants either approval tier or any correction/delete/reconcile capability.

CREATE OR REPLACE FUNCTION public._assert_down_payment_payment_access()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- The canonical authorization function gives explicit user denies
  -- precedence over role defaults and includes the Super Admin bypass.
  PERFORM public.assert_resource_permission('down_payments', 'mark_paid');
  PERFORM public.assert_resource_permission('pre_funding', 'use_for_payment');
  -- Trusted only after both canonical assertions above.  This is LOCAL to
  -- the current transaction and lets the nested legacy source-payment
  -- routine retain its existing guard without opening OCS callers.
  PERFORM set_config('app.down_payment_payment_authorized', 'on', true);
END;
$$;

REVOKE ALL ON FUNCTION public._assert_down_payment_payment_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._assert_down_payment_payment_access() TO authenticated, service_role;

COMMENT ON FUNCTION public._assert_down_payment_payment_access() IS
  'Authorizes Down Payment disbursement only; approval and all source/payment evidence checks remain in the atomic payment RPC.';

-- Preserve the established role guard for every other caller while allowing
-- the nested Down Payment source routine to observe the trusted local marker.
CREATE OR REPLACE FUNCTION public._assert_finance_role()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR current_setting('app.pre_fund_payment_authorized', true) = 'on'
     OR current_setting('app.down_payment_payment_authorized', true) = 'on' THEN
    RETURN;
  END IF;
  SELECT lower(trim(role)) INTO v_role FROM public.profiles
  WHERE id = auth.uid() LIMIT 1;
  IF v_role IS NULL OR v_role NOT IN (
    'super_admin', 'superadmin', 'admin', 'administrator',
    'finance', 'finance admin', 'financialadmin', 'financial_admin', 'accountant'
  ) THEN
    RAISE EXCEPTION 'Access denied: finance or admin role required (role="%").',
      coalesce(v_role, '<null>');
  END IF;
END;
$$;

-- Existing canonical role rows (including installations predating the
-- capability) receive the payment pair. User overrides are not touched.
INSERT INTO public.permissions (role_id, resource, action)
SELECT r.id, v.resource, v.action
FROM public.roles r
CROSS JOIN (VALUES
  ('down_payments', 'mark_paid'),
  ('pre_funding', 'use_for_payment')
) AS v(resource, action)
WHERE lower(replace(replace(r.name, ' ', '_'), '-', '_')) IN
  ('admin', 'financialadmin', 'financial_admin')
  AND r.is_active = true
ON CONFLICT (role_id, resource, action) DO NOTHING;

-- Replace only the authorization gate in the established atomic RPC.  Using
-- pg_get_functiondef preserves its deployed argument signature and all locks,
-- idempotency, receipt, currency, balance, and lifecycle checks verbatim.
DO $migration$
DECLARE
  v_definition text;
  v_old_count integer;
  v_new_count integer;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'record_down_payment_with_wallet_rpc'
    AND oidvectortypes(p.proargtypes) =
      'uuid, uuid, numeric, text, text, text, text, integer';

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'record_down_payment_with_wallet_rpc(uuid,uuid,numeric,text,text,text,text,integer) is not deployed';
  END IF;

  v_old_count := (length(v_definition) -
    length(replace(v_definition, 'PERFORM public._assert_finance_role();', '')))
    / length('PERFORM public._assert_finance_role();');
  v_new_count := (length(v_definition) -
    length(replace(v_definition, 'PERFORM public._assert_down_payment_payment_access();', '')))
    / length('PERFORM public._assert_down_payment_payment_access();');

  IF v_old_count = 1 AND v_new_count = 0 THEN
    v_definition := replace(v_definition,
      'PERFORM public._assert_finance_role();',
      'PERFORM public._assert_down_payment_payment_access();');
  ELSIF v_old_count = 0 AND v_new_count = 1 THEN
    NULL; -- already migrated; reruns are safe
  ELSE
    RAISE EXCEPTION
      'Unexpected Down Payment payment RPC authorization gates (old=%, new=%)',
      v_old_count, v_new_count;
  END IF;
  EXECUTE v_definition;
END;
$migration$;
