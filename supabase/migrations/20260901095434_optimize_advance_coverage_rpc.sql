CREATE INDEX IF NOT EXISTS idx_dpr_mmp_entry_latest_coverage
  ON public.down_payment_requests (mmp_site_entry_id, created_at DESC)
  INCLUDE (status, requested_by)
  WHERE mmp_site_entry_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_advance_coverage_data()
RETURNS TABLE (
  entry_id uuid,
  site_name text,
  hub_name text,
  state_name text,
  locality_name text,
  mmp_file_id uuid,
  mmp_name text,
  advance_status text,
  data_collector_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH latest_request AS (
    SELECT DISTINCT ON (dr.mmp_site_entry_id)
      dr.mmp_site_entry_id,
      dr.status,
      dr.requested_by
    FROM public.down_payment_requests dr
    WHERE dr.mmp_site_entry_id IS NOT NULL
    ORDER BY dr.mmp_site_entry_id, dr.created_at DESC
  )
  SELECT
    e.id,
    COALESCE(e.site_name, '—'),
    COALESCE(e.hub_office, '—'),
    COALESCE(e.state, '—'),
    COALESCE(e.locality, '—'),
    e.mmp_file_id,
    COALESCE(f.name, '—'),
    latest.status,
    COALESCE(p.full_name, '—')
  FROM public.mmp_site_entries e
  LEFT JOIN public.mmp_files f ON f.id = e.mmp_file_id
  LEFT JOIN latest_request latest ON latest.mmp_site_entry_id = e.id
  LEFT JOIN public.profiles p ON p.id = latest.requested_by
  WHERE e.status NOT IN ('cancelled', 'removed', 'reclaimed')
  ORDER BY e.hub_office NULLS LAST, e.site_name;
$function$;

-- One JSON value bypasses the API row cap, avoiding six full executions for
-- the six 1,000-row ranges currently required to load 5,640 coverage rows.
CREATE OR REPLACE FUNCTION public.get_advance_coverage_data_v2()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(to_jsonb(coverage)), '[]'::jsonb)
  FROM public.get_advance_coverage_data() coverage;
$function$;

GRANT EXECUTE ON FUNCTION public.get_advance_coverage_data() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_advance_coverage_data_v2() TO authenticated, anon, service_role;
