-- Bounded monitoring feed and server-side aggregates.
-- The original get_monitoring_actions(text, timestamptz, timestamptz, text)
-- remains available as an immediate rollback path.

CREATE INDEX IF NOT EXISTS idx_action_status_overrides_latest
  ON public.action_status_overrides (action_type, action_id, set_at DESC);

CREATE OR REPLACE FUNCTION public.get_monitoring_actions_v2(
  p_type               text        DEFAULT NULL,
  p_from               timestamptz DEFAULT NULL,
  p_to                 timestamptz DEFAULT NULL,
  p_sender             text        DEFAULT NULL,
  p_limit              integer     DEFAULT 100,
  p_before_created_at  timestamptz DEFAULT NULL,
  p_before_action_id   text        DEFAULT NULL
)
RETURNS TABLE (
  action_id      text,
  action_type    text,
  source_table   text,
  sender_id      text,
  sender_name    text,
  sender_role    text,
  recipient_role text,
  native_status  text,
  created_at     timestamptz,
  updated_at     timestamptz,
  details        jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 250);
BEGIN
  IF COALESCE(public.is_super_admin(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: super administrator required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    da.action_id,
    da.action_type,
    da.source_table,
    da.sender_id,
    da.sender_name,
    da.sender_role,
    da.recipient_role,
    da.native_status,
    da.created_at,
    da.updated_at,
    da.details
  FROM public.dashboard_actions da
  WHERE (p_type IS NULL OR da.action_type = p_type)
    AND (p_from IS NULL OR da.created_at >= p_from)
    AND (p_to IS NULL OR da.created_at <= p_to)
    AND (p_sender IS NULL OR da.sender_name ILIKE '%' || p_sender || '%')
    AND (
      p_before_created_at IS NULL
      OR da.created_at < p_before_created_at
      OR (
        da.created_at = p_before_created_at
        AND da.action_id < COALESCE(p_before_action_id, E'\uffff')
      )
    )
  ORDER BY da.created_at DESC, da.action_id DESC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_monitoring_actions_v2(
  text, timestamptz, timestamptz, text, integer, timestamptz, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_monitoring_actions_v2(
  text, timestamptz, timestamptz, text, integer, timestamptz, text
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_monitoring_action_stats_v2(
  p_type   text        DEFAULT NULL,
  p_from   timestamptz DEFAULT NULL,
  p_to     timestamptz DEFAULT NULL,
  p_sender text        DEFAULT NULL
)
RETURNS TABLE (
  total         bigint,
  received      bigint,
  acted         bigint,
  ignored       bigint,
  no_response   bigint,
  critical      bigint,
  acted_today   bigint,
  response_rate integer,
  type_counts   jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF COALESCE(public.is_super_admin(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: super administrator required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH latest_overrides AS (
    SELECT DISTINCT ON (aso.action_type, aso.action_id)
      aso.action_type,
      aso.action_id,
      aso.status
    FROM public.action_status_overrides aso
    ORDER BY aso.action_type, aso.action_id, aso.set_at DESC
  ),
  base AS (
    SELECT
      da.action_type,
      da.created_at,
      da.updated_at,
      COALESCE(lo.status, 'received') AS dashboard_status
    FROM public.dashboard_actions da
    LEFT JOIN latest_overrides lo
      ON lo.action_type = da.action_type
     AND lo.action_id = da.action_id
    WHERE (p_type IS NULL OR da.action_type = p_type)
      AND (p_from IS NULL OR da.created_at >= p_from)
      AND (p_to IS NULL OR da.created_at <= p_to)
      AND (p_sender IS NULL OR da.sender_name ILIKE '%' || p_sender || '%')
  ),
  per_type AS (
    SELECT
      b.action_type,
      count(*) AS total_count,
      count(*) FILTER (WHERE b.dashboard_status = 'acted') AS acted_count,
      count(*) FILTER (WHERE b.dashboard_status = 'received') AS received_count
    FROM base b
    GROUP BY b.action_type
  ),
  totals AS (
    SELECT
      count(*) AS total_count,
      count(*) FILTER (WHERE dashboard_status = 'received') AS received_count,
      count(*) FILTER (WHERE dashboard_status = 'acted') AS acted_count,
      count(*) FILTER (WHERE dashboard_status = 'ignored') AS ignored_count,
      count(*) FILTER (WHERE dashboard_status = 'no_response') AS no_response_count,
      count(*) FILTER (
        WHERE dashboard_status = 'no_response'
           OR created_at < now() - interval '48 hours'
      ) AS critical_count,
      count(*) FILTER (WHERE updated_at >= current_date) AS acted_today_count
    FROM base
  )
  SELECT
    t.total_count,
    t.received_count,
    t.acted_count,
    t.ignored_count,
    t.no_response_count,
    t.critical_count,
    t.acted_today_count,
    CASE
      WHEN t.total_count = 0 THEN 0
      ELSE round(100.0 * t.acted_count / t.total_count)::integer
    END,
    COALESCE((
      SELECT jsonb_object_agg(
        pt.action_type,
        jsonb_build_object(
          'total', pt.total_count,
          'acted', pt.acted_count,
          'received', pt.received_count
        )
      )
      FROM per_type pt
    ), '{}'::jsonb)
  FROM totals t;
END;
$$;

REVOKE ALL ON FUNCTION public.get_monitoring_action_stats_v2(
  text, timestamptz, timestamptz, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_monitoring_action_stats_v2(
  text, timestamptz, timestamptz, text
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_site_visit_pipeline_counts_v2()
RETURNS TABLE (
  status text,
  count  bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF COALESCE(public.is_super_admin(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: super administrator required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT sv.status::text, count(*)::bigint
  FROM public.site_visits sv
  GROUP BY sv.status
  ORDER BY sv.status;
END;
$$;

REVOKE ALL ON FUNCTION public.get_site_visit_pipeline_counts_v2()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_site_visit_pipeline_counts_v2()
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_monitoring_actions_v2(
  text, timestamptz, timestamptz, text, integer, timestamptz, text
) IS 'Bounded keyset-paginated monitoring feed. Retains legacy row shape for frontend compatibility.';

COMMENT ON FUNCTION public.get_monitoring_action_stats_v2(
  text, timestamptz, timestamptz, text
) IS 'Server-side monitoring KPI and module aggregates without transferring full action rows.';

COMMENT ON FUNCTION public.get_site_visit_pipeline_counts_v2()
  IS 'Server-side Site Visit status counts for the monitoring pipeline.';
