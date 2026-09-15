-- Make the Down Payment feed derive identity and access from the authenticated
-- database user. The previous SECURITY DEFINER version trusted p_user_id,
-- p_role and p_hub_ids from the browser, which allowed callers to claim a
-- broader role or another user's identity.

DROP FUNCTION IF EXISTS public.get_dp_requests_for_user_v2(text, text, text[], integer, integer);

CREATE FUNCTION public.get_dp_requests_for_user_v2(
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
      lower(regexp_replace(coalesce(p.role, ''), '[^a-z]', '', 'g')) AS primary_role,
      p.hub_id::text AS primary_hub_id,
      p.secondary_hub_id::text AS secondary_hub_id
    FROM public.profiles AS p
    WHERE p.id = auth.uid()
  ),
  assignments AS (
    SELECT lower(regexp_replace(coalesce(ur.role, ''), '[^a-z]', '', 'g')) AS role_code,
           ur.hub_id::text AS hub_id
    FROM public.user_roles AS ur
    WHERE ur.user_id = auth.uid()
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
          -- notes is legacy free text in older environments. Regex keeps this
          -- migration safe even where a historic row contains invalid JSON.
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
      a.can_read_all
      OR d.requested_by = a.user_id
      OR (a.is_supervisor AND d.hub_id::text = ANY(a.supervised_hub_ids))
    )
  ORDER BY d.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 1000), 1000))
  OFFSET greatest(coalesce(p_offset, 0), 0);
$function$;

REVOKE EXECUTE ON FUNCTION public.get_dp_requests_for_user_v2(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dp_requests_for_user_v2(integer, integer) TO authenticated;

COMMENT ON FUNCTION public.get_dp_requests_for_user_v2(integer, integer)
IS 'Secure paginated Down Payment feed. Identity, page grants, action grants and hub scope are derived from auth.uid() server-side.';
