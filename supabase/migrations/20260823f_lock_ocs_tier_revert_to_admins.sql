-- Lock Operational Cost tier reverts to Admin and Super Admin users only.
-- This supersedes the earlier executable RPC grant so legacy per-user action
-- overrides cannot be used to call the payment-affecting tier revert directly.

BEGIN;

REVOKE ALL ON FUNCTION public.revert_operational_cost_tier_atomically_rpc(UUID[],TEXT) FROM authenticated;

CREATE OR REPLACE FUNCTION public.revert_operational_cost_tier_as_admin_rpc(
  p_source_ids UUID[],
  p_tier TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_key TEXT;
  v_is_service_role BOOLEAN := COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role';
BEGIN
  IF NOT v_is_service_role THEN
    SELECT regexp_replace(lower(coalesce(role, '')), '[^a-z]', '', 'g')
    INTO v_role_key
    FROM public.profiles
    WHERE id = auth.uid();

    IF COALESCE(v_role_key, '') NOT IN ('admin', 'administrator', 'superadmin', 'superadministrator')
       AND NOT public.is_super_admin(auth.uid())
    THEN
      RAISE EXCEPTION 'Access denied: only an Admin or Super Admin can revert an approval tier.';
    END IF;
  END IF;

  RETURN public.revert_operational_cost_tier_atomically_rpc(p_source_ids, p_tier);
END;
$$;

REVOKE ALL ON FUNCTION public.revert_operational_cost_tier_as_admin_rpc(UUID[],TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revert_operational_cost_tier_as_admin_rpc(UUID[],TEXT) TO authenticated;

COMMIT;