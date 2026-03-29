-- Advance Coverage RPC: SECURITY DEFINER to bypass RLS on mmp_site_entries
-- Used by: System Monitoring Dashboard + Down-Payment Approval > Site Coverage tab

DROP FUNCTION IF EXISTS public.get_advance_coverage_data();

CREATE OR REPLACE FUNCTION public.get_advance_coverage_data()
RETURNS TABLE (
  entry_id            uuid,
  site_name           text,
  hub_name            text,
  state_name          text,
  locality_name       text,
  mmp_file_id         uuid,
  mmp_name            text,
  advance_status      text,
  data_collector_name text
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT
    e.id                                                     AS entry_id,
    COALESCE(e.site_name, '—')                               AS site_name,
    COALESCE(e.hub_office, '—')                              AS hub_name,
    COALESCE(e.state, '—')                                   AS state_name,
    COALESCE(e.locality, '—')                                AS locality_name,
    e.mmp_file_id,
    COALESCE(f.name, '—')                                    AS mmp_name,
    d.status                                                 AS advance_status,
    COALESCE(p.full_name, '—')                               AS data_collector_name
  FROM  public.mmp_site_entries e
  LEFT  JOIN public.mmp_files   f ON f.id = e.mmp_file_id
  LEFT  JOIN LATERAL (
    SELECT dr.status, dr.requested_by
    FROM   public.down_payment_requests dr
    WHERE  dr.mmp_site_entry_id = e.id
    ORDER  BY dr.created_at DESC
    LIMIT  1
  ) d ON true
  LEFT  JOIN public.profiles p ON p.id = d.requested_by
  WHERE e.status NOT IN ('cancelled', 'removed', 'reclaimed')
  ORDER BY hub_name NULLS LAST, site_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_advance_coverage_data() TO authenticated, anon, service_role;
