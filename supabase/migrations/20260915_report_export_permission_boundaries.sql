-- Canonical server-side report/export authorization assertion.
-- Date: 2026-09-15. Safe to re-run.
--
-- This migration intentionally does not wrap or rename accounting RPCs.
-- Those acct_* functions are shared page-data loaders, not export-only
-- boundaries. Dedicated export callers (Edge Functions) invoke this assertion
-- before their service-role data queries.

CREATE OR REPLACE FUNCTION public.assert_report_export_permission(
  p_resource text,
  p_action text DEFAULT 'export'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_override boolean;
BEGIN
  -- service_role is an explicit machine-to-machine exception. API-key-only
  -- callers do not have a unified user identity and are checked by fd-api.
  IF auth.role() = 'service_role' THEN
    RETURN;
  END IF;

  IF v_uid IS NULL OR NULLIF(btrim(p_resource), '') IS NULL
     OR p_action IS DISTINCT FROM 'export' THEN
    RAISE EXCEPTION 'Report export permission denied'
      USING ERRCODE = '42501';
  END IF;

  -- Match the UI's highest-privilege bypass. Active, table-backed Super
  -- Admins receive every permission before individual overrides are evaluated.
  IF public.is_super_admin(v_uid) THEN
    RETURN;
  END IF;

  -- An active override, including an explicit deny, takes precedence over
  -- ordinary role-derived permissions. Expired overrides are ignored.
  SELECT o.is_granted
    INTO v_override
  FROM public.user_permission_overrides o
  WHERE o.user_id = v_uid
    AND o.resource = p_resource
    AND o.action = p_action
    AND (o.expires_at IS NULL OR o.expires_at > now())
  LIMIT 1;

  IF FOUND THEN
    IF v_override IS TRUE THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'Report export permission denied for %.%',
      p_resource, p_action USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r
      ON r.is_active = true
     AND (r.id = ur.role_id OR r.name = ur.role)
    JOIN public.permissions p ON p.role_id = r.id
    WHERE ur.user_id = v_uid
      AND p.resource = p_resource
      AND p.action = p_action
  ) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'Report export permission denied for %.%',
    p_resource, p_action USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.assert_report_export_permission(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_report_export_permission(text, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.assert_report_export_permission(text, text) IS
  'Canonical report/export assertion: active Super Admin bypass, then active user override, then active user_roles/roles/permissions; service_role is the documented machine exception.';

-- Existing PACT archives must only be signed by the guarded Edge Function.
-- Storage policies are permissive by default, so use a restrictive ceiling to
-- prevent any authenticated policy from granting direct SELECT/signing access
-- to this private export bucket. service_role bypasses RLS in the Edge Function.
DROP POLICY IF EXISTS field_data_archives_export_ceiling ON storage.objects;
CREATE POLICY field_data_archives_export_ceiling
  ON storage.objects
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (bucket_id <> 'field-data-archives');