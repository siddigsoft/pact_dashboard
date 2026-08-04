-- Paginate get_coordinator_site_entries so coordinator views do not dump every row.
-- Drop the old single-arg overload so PostgREST resolves the paginated signature.
DROP FUNCTION IF EXISTS public.get_coordinator_site_entries(uuid);

CREATE OR REPLACE FUNCTION public.get_coordinator_site_entries(
  p_user_id uuid DEFAULT NULL,
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0
)
RETURNS TABLE(
  id uuid, mmp_file_id uuid, mmp_name text, site_code text, hub_office text,
  state text, locality text, site_name text, cp_name text, visit_type text,
  visit_date text, main_activity text, activity_at_site text, monitoring_by text,
  survey_tool text, use_market_diversion boolean, use_warehouse_monitoring boolean,
  comments text, additional_data jsonb, status text,
  verified_at timestamptz, verified_by text, verification_notes text,
  cost numeric, enumerator_fee numeric, transport_fee numeric,
  accepted_by text, accepted_at timestamptz, forwarded_to_user_id uuid, created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id, e.mmp_file_id, f.name AS mmp_name,
    e.site_code, e.hub_office, e.state, e.locality, e.site_name, e.cp_name,
    e.visit_type, e.visit_date, e.main_activity, e.activity_at_site,
    e.monitoring_by, e.survey_tool, e.use_market_diversion, e.use_warehouse_monitoring,
    e.comments, e.additional_data, e.status,
    e.verified_at, e.verified_by, e.verification_notes,
    e.cost, e.enumerator_fee, e.transport_fee,
    e.accepted_by, e.accepted_at, e.forwarded_to_user_id, e.created_at
  FROM mmp_site_entries e
  JOIN mmp_files f ON f.id = e.mmp_file_id
  WHERE (
    p_user_id IS NULL
    OR e.forwarded_to_user_id = p_user_id
    OR (e.additional_data->>'assigned_to') = p_user_id::text
    OR e.accepted_by = p_user_id::text
  )
  ORDER BY e.created_at DESC NULLS LAST
  LIMIT GREATEST(COALESCE(p_limit, 100), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

GRANT EXECUTE ON FUNCTION public.get_coordinator_site_entries(uuid, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_coordinator_site_entries(uuid, int, int) TO service_role;
