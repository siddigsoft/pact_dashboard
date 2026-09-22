-- Speed up Super Admin Data Management → Claimed Sites.
-- Root causes addressed:
-- 1. FORCE RLS on mmp_site_entries made SECURITY DEFINER still pay hub-scope RLS
-- 2. Joining site_effective_claimants (security_invoker view) re-scanned entries under RLS
-- 3. Profile join used p.id::text = coalesce(...), blocking index use
-- 4. Feed required full joined materialization before LIMIT; filter_options repeated it
--
-- Auth remains gated by superadmin_can_access_data_management().

CREATE OR REPLACE FUNCTION public.superadmin_claimed_sites_query(
  p_global_search text DEFAULT NULL,
  p_site_search text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_locality text DEFAULT NULL,
  p_activity text DEFAULT NULL,
  p_mmp_file_id uuid DEFAULT NULL,
  p_claimant_key text DEFAULT NULL,
  p_no_transport boolean DEFAULT false,
  p_limit integer DEFAULT 200,
  p_offset integer DEFAULT 0,
  p_before_created_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  lim integer := least(greatest(coalesce(p_limit, 200), 1), 200);
  off integer := greatest(coalesce(p_offset, 0), 0);
  rows jsonb;
  filtered bigint;
  total bigint;
  next_created_at timestamptz;
  next_id uuid;
  needs_name_search boolean := nullif(btrim(p_global_search), '') IS NOT NULL;
BEGIN
  IF NOT public.superadmin_can_access_data_management() THEN
    RAISE EXCEPTION 'User is not authorized to query data management.';
  END IF;

  -- Cheap total under claimed-status partial index (no joins).
  SELECT count(*) INTO total
  FROM public.mmp_site_entries e
  WHERE public.superadmin_is_claimed_status(e.status);

  WITH candidates AS (
    SELECT
      e.id,
      e.site_name,
      e.site_code,
      e.state,
      e.locality,
      e.status,
      e.accepted_by,
      e.claimed_by,
      e.accepted_at,
      e.dispatched_at,
      e.enumerator_fee,
      e.transport_fee,
      e.created_at,
      coalesce(e.main_activity, e.activity_at_site) AS main_activity,
      e.mmp_file_id,
      e.hub_office,
      coalesce(
        proj.effective_claimant_id,
        CASE
          WHEN e.accepted_by ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN e.accepted_by::uuid
          ELSE NULL
        END,
        e.claimed_by
      ) AS claimant_uuid,
      coalesce(
        proj.effective_claimant_id::text,
        nullif(e.accepted_by, ''),
        e.claimed_by::text,
        e.additional_data->>'claimed_by',
        e.additional_data->>'assigned_to'
      ) AS claimant_key
    FROM public.mmp_site_entries e
    LEFT JOIN public.site_effective_claimant_projection proj
      ON proj.site_entry_id = e.id
    WHERE public.superadmin_is_claimed_status(e.status)
      AND public.superadmin_claimed_search_match(
        coalesce(e.site_name, '') || ' ' || coalesce(e.site_code, ''),
        p_site_search
      )
      AND (
        nullif(btrim(p_status), '') IS NULL
        OR public.superadmin_claimed_status_key(e.status)
           = public.superadmin_claimed_status_key(p_status)
      )
      AND (nullif(btrim(p_state), '') IS NULL OR e.state = p_state)
      AND (nullif(btrim(p_locality), '') IS NULL OR e.locality = p_locality)
      AND (
        nullif(btrim(p_activity), '') IS NULL
        OR coalesce(e.main_activity, e.activity_at_site) = p_activity
      )
      AND (p_mmp_file_id IS NULL OR e.mmp_file_id = p_mmp_file_id)
      AND (
        NOT coalesce(p_no_transport, false)
        OR e.transport_fee IS NULL
        OR e.transport_fee = 0
      )
      AND (
        nullif(btrim(p_claimant_key), '') IS NULL
        OR coalesce(
          proj.effective_claimant_id::text,
          nullif(e.accepted_by, ''),
          e.claimed_by::text,
          e.additional_data->>'claimed_by',
          e.additional_data->>'assigned_to'
        ) = p_claimant_key
      )
  ),
  enriched AS (
    SELECT
      c.*,
      coalesce(
        nullif(p.full_name, ''),
        nullif(p.username, ''),
        nullif(p.email, ''),
        c.claimant_key
      ) AS effective_claimant_name,
      coalesce(m.name, m.title, m.mmp_id) AS mmp_name
    FROM candidates c
    LEFT JOIN public.profiles p ON p.id = c.claimant_uuid
    LEFT JOIN public.mmp_files m ON m.id = c.mmp_file_id
  ),
  filtered AS (
    SELECT *
    FROM enriched b
    WHERE
      NOT needs_name_search
      OR public.superadmin_claimed_search_match(
        concat_ws(
          ' ',
          b.site_name,
          b.site_code,
          b.effective_claimant_name,
          b.claimant_key,
          b.state,
          b.locality,
          b.mmp_name
        ),
        p_global_search
      )
  ),
  counted AS (SELECT count(*)::bigint AS n FROM filtered),
  page AS (
    SELECT f.*
    FROM filtered f
    WHERE p_before_id IS NULL
       OR (coalesce(f.created_at, '-infinity'::timestamptz), f.id)
          < (coalesce(p_before_created_at, '-infinity'::timestamptz), p_before_id)
    ORDER BY f.created_at DESC NULLS LAST, f.id DESC
    LIMIT lim
    OFFSET CASE WHEN p_before_id IS NULL THEN off ELSE 0 END
  )
  SELECT
    coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', page.id,
            'site_name', page.site_name,
            'site_code', page.site_code,
            'state', page.state,
            'locality', page.locality,
            'status', page.status,
            'accepted_by', page.accepted_by,
            'claimed_by', page.claimed_by,
            'accepted_at', page.accepted_at,
            'dispatched_at', page.dispatched_at,
            'enumerator_fee', page.enumerator_fee,
            'transport_fee', page.transport_fee,
            'created_at', page.created_at,
            'main_activity', page.main_activity,
            'mmp_file_id', page.mmp_file_id,
            'hub_office', page.hub_office,
            'claimant_key', page.claimant_key,
            'effective_claimant_name', page.effective_claimant_name,
            'mmp_name', page.mmp_name
          )
          ORDER BY page.created_at DESC NULLS LAST, page.id DESC
        )
        FROM page
      ),
      '[]'::jsonb
    ),
    (SELECT n FROM counted)
  INTO rows, filtered;

  IF jsonb_array_length(rows) > 0 THEN
    next_id := (rows -> -1 ->> 'id')::uuid;
    next_created_at := (rows -> -1 ->> 'created_at')::timestamptz;
  END IF;

  RETURN jsonb_build_object(
    'rows', rows,
    'filtered_count', filtered,
    'total_count', total,
    'offset', off,
    'next_offset', off + jsonb_array_length(rows),
    'limit', lim,
    'next_before_created_at', next_created_at,
    'next_before_id', next_id,
    'has_more', jsonb_array_length(rows) = lim
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_claimed_sites_filter_options(
  p_global_search text DEFAULT NULL,
  p_site_search text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_locality text DEFAULT NULL,
  p_activity text DEFAULT NULL,
  p_mmp_file_id uuid DEFAULT NULL,
  p_claimant_key text DEFAULT NULL,
  p_no_transport boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  needs_name_search boolean := nullif(btrim(p_global_search), '') IS NOT NULL;
BEGIN
  IF NOT public.superadmin_can_access_data_management() THEN
    RAISE EXCEPTION 'User is not authorized to query data management.';
  END IF;

  RETURN (
    WITH candidates AS (
      SELECT
        e.state,
        e.locality,
        coalesce(e.main_activity, e.activity_at_site) AS activity,
        public.superadmin_claimed_status_key(e.status) AS status_key,
        e.mmp_file_id,
        e.transport_fee,
        coalesce(e.site_name, '') AS site_name,
        coalesce(e.site_code, '') AS site_code,
        coalesce(
          proj.effective_claimant_id,
          CASE
            WHEN e.accepted_by ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN e.accepted_by::uuid
            ELSE NULL
          END,
          e.claimed_by
        ) AS claimant_uuid,
        coalesce(
          proj.effective_claimant_id::text,
          nullif(e.accepted_by, ''),
          e.claimed_by::text,
          e.additional_data->>'claimed_by',
          e.additional_data->>'assigned_to'
        ) AS claimant_key
      FROM public.mmp_site_entries e
      LEFT JOIN public.site_effective_claimant_projection proj
        ON proj.site_entry_id = e.id
      WHERE public.superadmin_is_claimed_status(e.status)
        AND public.superadmin_claimed_search_match(
          coalesce(e.site_name, '') || ' ' || coalesce(e.site_code, ''),
          p_site_search
        )
    ),
    enriched AS (
      SELECT
        c.*,
        coalesce(
          nullif(p.full_name, ''),
          nullif(p.username, ''),
          nullif(p.email, ''),
          c.claimant_key
        ) AS claimant_name,
        coalesce(m.name, m.title, m.mmp_id) AS mmp_name
      FROM candidates c
      LEFT JOIN public.profiles p ON p.id = c.claimant_uuid
      LEFT JOIN public.mmp_files m ON m.id = c.mmp_file_id
    ),
    searched AS (
      SELECT *
      FROM enriched b
      WHERE
        NOT needs_name_search
        OR public.superadmin_claimed_search_match(
          concat_ws(
            ' ',
            b.site_name,
            b.site_code,
            b.claimant_name,
            b.claimant_key,
            b.state,
            b.locality,
            b.mmp_name
          ),
          p_global_search
        )
    ),
    states AS (
      SELECT DISTINCT state
      FROM searched b
      WHERE state IS NOT NULL
        AND (
          nullif(btrim(p_status), '') IS NULL
          OR b.status_key = public.superadmin_claimed_status_key(p_status)
        )
        AND (nullif(btrim(p_locality), '') IS NULL OR b.locality = p_locality)
        AND (nullif(btrim(p_activity), '') IS NULL OR b.activity = p_activity)
        AND (p_mmp_file_id IS NULL OR b.mmp_file_id = p_mmp_file_id)
        AND (nullif(btrim(p_claimant_key), '') IS NULL OR b.claimant_key = p_claimant_key)
        AND (
          NOT coalesce(p_no_transport, false)
          OR b.transport_fee IS NULL
          OR b.transport_fee = 0
        )
    ),
    localities AS (
      SELECT DISTINCT locality
      FROM searched b
      WHERE locality IS NOT NULL
        AND (
          nullif(btrim(p_status), '') IS NULL
          OR b.status_key = public.superadmin_claimed_status_key(p_status)
        )
        AND (nullif(btrim(p_state), '') IS NULL OR b.state = p_state)
        AND (nullif(btrim(p_activity), '') IS NULL OR b.activity = p_activity)
        AND (p_mmp_file_id IS NULL OR b.mmp_file_id = p_mmp_file_id)
        AND (nullif(btrim(p_claimant_key), '') IS NULL OR b.claimant_key = p_claimant_key)
        AND (
          NOT coalesce(p_no_transport, false)
          OR b.transport_fee IS NULL
          OR b.transport_fee = 0
        )
    ),
    activities AS (
      SELECT DISTINCT activity
      FROM searched b
      WHERE activity IS NOT NULL
        AND (
          nullif(btrim(p_status), '') IS NULL
          OR b.status_key = public.superadmin_claimed_status_key(p_status)
        )
        AND (nullif(btrim(p_state), '') IS NULL OR b.state = p_state)
        AND (nullif(btrim(p_locality), '') IS NULL OR b.locality = p_locality)
        AND (p_mmp_file_id IS NULL OR b.mmp_file_id = p_mmp_file_id)
        AND (nullif(btrim(p_claimant_key), '') IS NULL OR b.claimant_key = p_claimant_key)
        AND (
          NOT coalesce(p_no_transport, false)
          OR b.transport_fee IS NULL
          OR b.transport_fee = 0
        )
    ),
    statuses AS (
      SELECT DISTINCT status_key
      FROM searched b
      WHERE status_key IS NOT NULL
        AND (nullif(btrim(p_state), '') IS NULL OR b.state = p_state)
        AND (nullif(btrim(p_locality), '') IS NULL OR b.locality = p_locality)
        AND (nullif(btrim(p_activity), '') IS NULL OR b.activity = p_activity)
        AND (p_mmp_file_id IS NULL OR b.mmp_file_id = p_mmp_file_id)
        AND (nullif(btrim(p_claimant_key), '') IS NULL OR b.claimant_key = p_claimant_key)
        AND (
          NOT coalesce(p_no_transport, false)
          OR b.transport_fee IS NULL
          OR b.transport_fee = 0
        )
    ),
    mmps AS (
      SELECT DISTINCT mmp_file_id, mmp_name
      FROM searched b
      WHERE mmp_file_id IS NOT NULL
        AND (
          nullif(btrim(p_status), '') IS NULL
          OR b.status_key = public.superadmin_claimed_status_key(p_status)
        )
        AND (nullif(btrim(p_state), '') IS NULL OR b.state = p_state)
        AND (nullif(btrim(p_locality), '') IS NULL OR b.locality = p_locality)
        AND (nullif(btrim(p_activity), '') IS NULL OR b.activity = p_activity)
        AND (nullif(btrim(p_claimant_key), '') IS NULL OR b.claimant_key = p_claimant_key)
        AND (
          NOT coalesce(p_no_transport, false)
          OR b.transport_fee IS NULL
          OR b.transport_fee = 0
        )
    ),
    claimants AS (
      SELECT DISTINCT claimant_key, claimant_name
      FROM searched b
      WHERE claimant_key IS NOT NULL
        AND (
          nullif(btrim(p_status), '') IS NULL
          OR b.status_key = public.superadmin_claimed_status_key(p_status)
        )
        AND (nullif(btrim(p_state), '') IS NULL OR b.state = p_state)
        AND (nullif(btrim(p_locality), '') IS NULL OR b.locality = p_locality)
        AND (nullif(btrim(p_activity), '') IS NULL OR b.activity = p_activity)
        AND (p_mmp_file_id IS NULL OR b.mmp_file_id = p_mmp_file_id)
        AND (
          NOT coalesce(p_no_transport, false)
          OR b.transport_fee IS NULL
          OR b.transport_fee = 0
        )
    )
    SELECT jsonb_build_object(
      'states', (SELECT coalesce(jsonb_agg(state ORDER BY state), '[]'::jsonb) FROM states),
      'localities', (SELECT coalesce(jsonb_agg(locality ORDER BY locality), '[]'::jsonb) FROM localities),
      'activities', (SELECT coalesce(jsonb_agg(activity ORDER BY activity), '[]'::jsonb) FROM activities),
      'statuses', (SELECT coalesce(jsonb_agg(status_key ORDER BY status_key), '[]'::jsonb) FROM statuses),
      'mmps', (
        SELECT coalesce(
          jsonb_agg(jsonb_build_object('id', mmp_file_id, 'name', mmp_name) ORDER BY mmp_name),
          '[]'::jsonb
        )
        FROM mmps
      ),
      'claimants', (
        SELECT coalesce(
          jsonb_agg(jsonb_build_object('id', claimant_key, 'name', claimant_name) ORDER BY claimant_name),
          '[]'::jsonb
        )
        FROM claimants
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_claimed_sites_query(
  text, text, text, text, text, text, uuid, text, boolean, integer, integer, timestamptz, uuid
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.superadmin_claimed_sites_filter_options(
  text, text, text, text, text, text, uuid, text, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_claimed_sites_query(
  text, text, text, text, text, text, uuid, text, boolean, integer, integer, timestamptz, uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_claimed_sites_filter_options(
  text, text, text, text, text, text, uuid, text, boolean
) TO authenticated;

-- Drop the broken offset-only overload from the cast-fix migration if present.
DROP FUNCTION IF EXISTS public.superadmin_claimed_sites_query(
  text, text, text, text, text, text, uuid, text, boolean, integer, integer
);
