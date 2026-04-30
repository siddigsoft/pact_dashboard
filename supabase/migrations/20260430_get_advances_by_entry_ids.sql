-- SECURITY DEFINER function to fetch advance/down-payment request data
-- for a given list of mmp_site_entries IDs, bypassing row-level-security.
-- Used by CoordinatorSummaryCard so it can show advance status for ALL
-- site entries regardless of the caller's RLS visibility on down_payment_requests.

DROP FUNCTION IF EXISTS public.get_advances_by_entry_ids(uuid[]);

CREATE OR REPLACE FUNCTION public.get_advances_by_entry_ids(entry_ids uuid[])
RETURNS TABLE (
  id                  uuid,
  mmp_site_entry_id   uuid,
  status              text,
  requested_amount    numeric,
  approved_amount     numeric,
  total_paid_amount   numeric,
  justification       text
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT
    dr.id,
    dr.mmp_site_entry_id,
    dr.status::text,
    dr.requested_amount,
    dr.approved_amount,
    dr.total_paid_amount,
    dr.justification
  FROM public.down_payment_requests dr
  WHERE dr.mmp_site_entry_id = ANY(entry_ids)
    AND dr.status NOT IN ('deleted', 'cancelled')
  ORDER BY dr.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_advances_by_entry_ids(uuid[])
  TO authenticated, anon, service_role;
