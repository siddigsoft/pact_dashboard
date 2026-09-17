-- Final Kassala supervisor policy:
--   * read and pay Down Payments across every hub
--   * use individual and batch payment paths
--   * never approve or delete Down Payment records/payments
-- The Kassala supervisor assignment remains the source of this authority.

DELETE FROM public.user_permission_overrides o
WHERE public.is_kassala_hub_supervisor(o.user_id)
  AND o.resource = 'down_payments'
  AND o.action IN ('approve', 'delete')
  AND o.is_granted = true;

CREATE OR REPLACE FUNCTION public.get_user_permissions(user_uuid uuid)
RETURNS TABLE(resource varchar, action varchar, conditions jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT DISTINCT permission_set.resource::varchar,
                  permission_set.action::varchar,
                  permission_set.conditions
  FROM (
    SELECT p.resource::text, p.action::text, p.conditions
    FROM public.canonical_user_role_assignments a
    JOIN public.roles r ON r.id = a.role_id AND r.is_active = true
    JOIN public.permissions p ON p.role_id = r.id
    WHERE a.user_id = user_uuid
      AND NOT (
        public.is_kassala_hub_supervisor(user_uuid)
        AND p.resource = 'down_payments'
        AND p.action IN ('approve', 'delete')
      )

    UNION ALL

    SELECT scoped.resource, scoped.action, NULL::jsonb
    FROM (VALUES
      ('down_payments'::text, 'read'::text),
      ('down_payments'::text, 'mark_paid'::text),
      ('pre_funding'::text, 'use_for_payment'::text)
    ) AS scoped(resource, action)
    WHERE public.is_kassala_hub_supervisor(user_uuid)
  ) permission_set;
$function$;

REVOKE ALL ON FUNCTION public.get_user_permissions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_permissions(uuid) TO authenticated, service_role;

-- Explicit approval/delete grants must not override the payment-only boundary.
CREATE OR REPLACE FUNCTION public.current_user_has_resource_permission(
  p_resource text,
  p_action text
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  caller uuid := auth.uid();
  override_value boolean;
BEGIN
  IF auth.role() = 'service_role' THEN RETURN true; END IF;
  IF caller IS NULL OR nullif(btrim(p_resource), '') IS NULL
     OR nullif(btrim(p_action), '') IS NULL THEN RETURN false; END IF;
  IF public.is_super_admin(caller) THEN RETURN true; END IF;

  IF public.is_kassala_hub_supervisor(caller)
     AND p_resource = 'down_payments'
     AND p_action IN ('approve', 'delete') THEN
    RETURN false;
  END IF;

  SELECT o.is_granted INTO override_value
  FROM public.user_permission_overrides o
  WHERE o.user_id = caller
    AND o.resource = p_resource
    AND o.action = p_action
    AND (o.expires_at IS NULL OR o.expires_at > now());
  IF FOUND THEN RETURN override_value; END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.get_user_permissions(caller) p
    WHERE p.resource = p_resource
      AND p.action = p_action
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.current_user_has_resource_permission(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_has_resource_permission(text, text) TO authenticated, service_role;

-- Kassala supervisors are intentionally global viewers on this page. Other
-- supervisors remain restricted to their assigned hubs.
CREATE OR REPLACE FUNCTION public.get_dp_requests_for_user_v2(
  p_limit integer DEFAULT 1000,
  p_offset integer DEFAULT 0
)
RETURNS SETOF public.down_payment_requests
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH caller AS (
    SELECT
      auth.uid() AS user_id,
      regexp_replace(lower(coalesce(p.role, '')), '[^a-z]', '', 'g') AS primary_role,
      p.hub_id::text AS primary_hub_id,
      p.secondary_hub_id::text AS secondary_hub_id
    FROM public.profiles AS p
    WHERE p.id = auth.uid()
  ),
  assignments AS (
    SELECT regexp_replace(lower(coalesce(r.name, ur.role, '')), '[^a-z]', '', 'g') AS role_code,
           ur.hub_id::text AS hub_id
    FROM public.user_roles AS ur
    LEFT JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND coalesce(ur.status, 'active') = 'active'
  ),
  access AS (
    SELECT
      c.user_id,
      public.is_kassala_hub_supervisor(c.user_id) AS is_global_payment_supervisor,
      EXISTS (
        SELECT 1 FROM assignments a
        WHERE a.role_code IN ('superadmin','admin','financialadmin','ict','fom',
                              'fieldoperationmanager','countrydirector','datateam')
      )
      OR c.primary_role IN ('superadmin','admin','financialadmin','ict','fom',
                            'fieldoperationmanager','countrydirector','datateam')
      OR EXISTS (
        SELECT 1 FROM public.page_access_overrides pao
        WHERE pao.user_id = c.user_id
          AND pao.page_slug = 'down-payment-approval'
          AND pao.is_blocked = false
          AND (pao.expires_at IS NULL OR pao.expires_at > now())
          AND coalesce(pao.notes, '') !~ '"r"[[:space:]]*:[[:space:]]*false'
      )
      OR EXISTS (
        SELECT 1 FROM public.user_permission_overrides upo
        WHERE upo.user_id = c.user_id
          AND upo.resource = 'down_payments'
          AND upo.action = 'read'
          AND upo.is_granted = true
          AND (upo.expires_at IS NULL OR upo.expires_at > now())
      ) AS can_read_all,
      ARRAY_REMOVE(ARRAY[c.primary_hub_id, c.secondary_hub_id] || ARRAY(
        SELECT a.hub_id FROM assignments a
        WHERE a.role_code IN ('supervisor', 'hubsupervisor')
      ), NULL) AS supervised_hub_ids,
      c.primary_role IN ('supervisor', 'hubsupervisor')
        OR EXISTS (
          SELECT 1 FROM assignments a
          WHERE a.role_code IN ('supervisor', 'hubsupervisor')
        ) AS is_supervisor
    FROM caller c
  )
  SELECT d.*
  FROM public.down_payment_requests AS d
  CROSS JOIN access a
  WHERE a.user_id IS NOT NULL
    AND (
      a.is_global_payment_supervisor
      OR (a.is_supervisor AND d.hub_id::text = ANY(a.supervised_hub_ids))
      OR (NOT a.is_supervisor AND (a.can_read_all OR d.requested_by = a.user_id))
    )
  ORDER BY d.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 1000), 1000))
  OFFSET greatest(coalesce(p_offset, 0), 0);
$function$;

REVOKE EXECUTE ON FUNCTION public.get_dp_requests_for_user_v2(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dp_requests_for_user_v2(integer, integer) TO authenticated;

-- Compatibility hook already installed in both individual and batch payment
-- paths. Global payment scope means the capability gate is sufficient.
CREATE OR REPLACE FUNCTION public.assert_kassala_down_payment_scope(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_kassala_down_payment_scope(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_kassala_down_payment_scope(uuid) TO authenticated, service_role;
