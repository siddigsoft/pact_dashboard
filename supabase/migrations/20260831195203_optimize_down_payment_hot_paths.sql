-- Match the exact high-frequency badge predicate so Postgres can answer the
-- count from nine index entries instead of scanning every wide request row.
CREATE INDEX IF NOT EXISTS idx_dpr_manual_reconciliation_required
  ON public.down_payment_requests (id)
  WHERE status <> 'cancelled'
    AND metadata ->> 'manual_reconciliation_required' = 'true';

-- Support the three access branches in the paginated request feed while also
-- satisfying its created_at DESC ordering.
CREATE INDEX IF NOT EXISTS idx_dpr_requested_by_created_at
  ON public.down_payment_requests (requested_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dpr_hub_created_at
  ON public.down_payment_requests (hub_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.get_dp_requests_for_user_v2(
  p_user_id text,
  p_role text,
  p_hub_ids text[] DEFAULT ARRAY[]::text[],
  p_limit integer DEFAULT 1000,
  p_offset integer DEFAULT 0
)
RETURNS SETOF public.down_payment_requests
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT d.*
  FROM public.down_payment_requests AS d
  WHERE CASE
    WHEN regexp_replace(lower(coalesce(p_role, '')), '[^a-z]', '', 'g') = ANY(ARRAY[
      'superadmin','admin','financialadmin','ict','fom',
      'fieldoperationmanager','countrydirector','datateam'
    ]) THEN true
    WHEN regexp_replace(lower(coalesce(p_role, '')), '[^a-z]', '', 'g') = ANY(ARRAY[
      'supervisor','hubsupervisor'
    ]) THEN d.requested_by::text = p_user_id
      OR d.hub_id = ANY(coalesce(p_hub_ids, ARRAY[]::text[]))
    ELSE d.requested_by::text = p_user_id
  END
  ORDER BY d.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 1000), 1000))
  OFFSET greatest(coalesce(p_offset, 0), 0);
$function$;

COMMENT ON FUNCTION public.get_dp_requests_for_user_v2(text, text, text[], integer, integer)
IS 'Paginated down-payment feed with all supervised hubs pushed into SQL.';
