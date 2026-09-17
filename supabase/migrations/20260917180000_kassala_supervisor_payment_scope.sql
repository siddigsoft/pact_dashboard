-- Kassala Hub supervisors may disburse eligible Down Payments for Kassala only.
-- This is derived from the live hub assignment, so future Kassala supervisors
-- receive the same scoped capability without granting payment to all Field
-- Assistants or to supervisors assigned to other hubs.

CREATE OR REPLACE FUNCTION public.is_kassala_hub_supervisor(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.hubs h
      ON h.id::text IN (p.hub_id::text, p.secondary_hub_id::text)
    WHERE p.id = p_user_id
      AND regexp_replace(lower(coalesce(p.role, '')), '[^a-z]', '', 'g')
          IN ('supervisor', 'hubsupervisor')
      AND regexp_replace(lower(coalesce(h.name, '')), '[^a-z]', '', 'g')
          IN ('kassala', 'kassalahub')

    UNION ALL

    SELECT 1
    FROM public.user_roles ur
    LEFT JOIN public.roles r ON r.id = ur.role_id
    JOIN public.hubs h ON h.id::text = ur.hub_id::text
    WHERE ur.user_id = p_user_id
      AND coalesce(ur.status, 'active') = 'active'
      AND regexp_replace(lower(coalesce(r.name, ur.role, '')), '[^a-z]', '', 'g')
          IN ('supervisor', 'hubsupervisor')
      AND regexp_replace(lower(coalesce(h.name, '')), '[^a-z]', '', 'g')
          IN ('kassala', 'kassalahub')
  );
$function$;

REVOKE ALL ON FUNCTION public.is_kassala_hub_supervisor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_kassala_hub_supervisor(uuid) TO authenticated, service_role;

-- Remove the earlier role-wide Field Assistant payment grant. Payment now
-- follows the Kassala supervisor assignment rather than a broad role name.
DELETE FROM public.permissions p
USING public.roles r
WHERE p.role_id = r.id
  AND regexp_replace(lower(r.name), '[^a-z0-9]+', '', 'g') = 'fieldassistant'
  AND (p.resource, p.action) IN (
    ('down_payments', 'mark_paid'),
    ('cost_submissions', 'mark_paid'),
    ('pre_funding', 'use_for_payment')
  );

-- Add the two Down Payment capabilities dynamically to the canonical manifest.
-- User-level denies still take precedence in both the browser evaluator and
-- current_user_has_resource_permission().
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

    UNION ALL

    SELECT scoped.resource, scoped.action, NULL::jsonb
    FROM (VALUES
      ('down_payments'::text, 'mark_paid'::text),
      ('pre_funding'::text, 'use_for_payment'::text)
    ) AS scoped(resource, action)
    WHERE public.is_kassala_hub_supervisor(user_uuid)
  ) permission_set;
$function$;

REVOKE ALL ON FUNCTION public.get_user_permissions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_permissions(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assert_kassala_down_payment_scope(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_allowed boolean;
BEGIN
  IF auth.role() = 'service_role' OR public.is_super_admin(v_user_id) THEN
    RETURN;
  END IF;

  -- Existing canonical payment roles keep their established global scope even
  -- if the same account also carries a Kassala supervisor assignment.
  IF EXISTS (
    SELECT 1
    FROM public.canonical_user_role_assignments a
    JOIN public.roles r ON r.id = a.role_id AND r.is_active = true
    JOIN public.permissions paid
      ON paid.role_id = r.id
     AND paid.resource = 'down_payments'
     AND paid.action = 'mark_paid'
    JOIN public.permissions fund
      ON fund.role_id = r.id
     AND fund.resource = 'pre_funding'
     AND fund.action = 'use_for_payment'
    WHERE a.user_id = v_user_id
  ) THEN
    RETURN;
  END IF;

  -- Existing non-supervisor payment roles keep their established scope.
  IF NOT public.is_kassala_hub_supervisor(v_user_id) THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.down_payment_requests d
    JOIN public.hubs h ON h.id::text = d.hub_id::text
    WHERE d.id = p_request_id
      AND regexp_replace(lower(coalesce(h.name, d.hub_name, '')), '[^a-z]', '', 'g')
          IN ('kassala', 'kassalahub')
  ) INTO v_allowed;

  IF NOT coalesce(v_allowed, false) THEN
    RAISE EXCEPTION 'Access denied: Kassala Hub supervisors may only pay Kassala Hub requests.'
      USING ERRCODE = '42501';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_kassala_down_payment_scope(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_kassala_down_payment_scope(uuid) TO authenticated, service_role;

-- Page visibility and explicit read grants must not turn a supervisor into an
-- all-hubs reader. Supervisors always receive only their assigned hub rows.
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
      EXISTS (
        SELECT 1
        FROM assignments a
        WHERE a.role_code IN ('superadmin','admin','financialadmin','ict','fom',
                              'fieldoperationmanager','countrydirector','datateam')
      )
      OR c.primary_role IN ('superadmin','admin','financialadmin','ict','fom',
                            'fieldoperationmanager','countrydirector','datateam')
      OR EXISTS (
        SELECT 1
        FROM public.page_access_overrides pao
        WHERE pao.user_id = c.user_id
          AND pao.page_slug = 'down-payment-approval'
          AND pao.is_blocked = false
          AND (pao.expires_at IS NULL OR pao.expires_at > now())
          AND coalesce(pao.notes, '') !~ '"r"[[:space:]]*:[[:space:]]*false'
      )
      OR EXISTS (
        SELECT 1
        FROM public.user_permission_overrides upo
        WHERE upo.user_id = c.user_id
          AND upo.resource = 'down_payments'
          AND upo.action = 'read'
          AND upo.is_granted = true
          AND (upo.expires_at IS NULL OR upo.expires_at > now())
      ) AS can_read_all,
      ARRAY_REMOVE(ARRAY[c.primary_hub_id, c.secondary_hub_id] || ARRAY(
        SELECT a.hub_id
        FROM assignments a
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
      (a.is_supervisor AND d.hub_id::text = ANY(a.supervised_hub_ids))
      OR (NOT a.is_supervisor AND (a.can_read_all OR d.requested_by = a.user_id))
    )
  ORDER BY d.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 1000), 1000))
  OFFSET greatest(coalesce(p_offset, 0), 0);
$function$;

REVOKE EXECUTE ON FUNCTION public.get_dp_requests_for_user_v2(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dp_requests_for_user_v2(integer, integer) TO authenticated;

-- The batch UI calls this reconciliation wrapper once per selected request.
-- Authorize the Down Payment branch with the dedicated capability pair and
-- enforce the request hub before locking or changing financial records.
DO $migration$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.record_reconciled_required_pre_fund_payment_rpc(text,uuid,uuid,numeric,text,date,uuid,text,text,text)'::regprocedure
  ) INTO v_definition;

  IF position('PERFORM public._assert_down_payment_payment_access();' IN v_definition) = 0 THEN
    v_definition := replace(
      v_definition,
      'PERFORM public._assert_finance_role();',
      $replacement$IF p_source_table = 'down_payment_requests' THEN
    PERFORM public._assert_down_payment_payment_access();
    PERFORM public.assert_kassala_down_payment_scope(p_source_id);
  ELSE
    PERFORM public._assert_finance_role();
  END IF;$replacement$
    );
  END IF;

  IF position('PERFORM public.assert_kassala_down_payment_scope(p_source_id);' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not install Kassala scope in reconciled Down Payment payment RPC';
  END IF;

  EXECUTE v_definition;
END;
$migration$;

-- The individual wallet-payment path uses a separate atomic RPC.
DO $migration$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.record_down_payment_with_wallet_rpc(uuid,uuid,numeric,text,text,text,text,integer)'::regprocedure
  ) INTO v_definition;

  IF position('PERFORM public.assert_kassala_down_payment_scope(p_request_id);' IN v_definition) = 0 THEN
    v_definition := replace(
      v_definition,
      'PERFORM public._assert_down_payment_payment_access();',
      'PERFORM public._assert_down_payment_payment_access();'
      || E'\n  PERFORM public.assert_kassala_down_payment_scope(p_request_id);'
    );
  END IF;

  IF position('PERFORM public.assert_kassala_down_payment_scope(p_request_id);' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not install Kassala scope in atomic Down Payment payment RPC';
  END IF;

  EXECUTE v_definition;
END;
$migration$;
