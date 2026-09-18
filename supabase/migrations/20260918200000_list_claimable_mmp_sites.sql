-- Claimable list was timing out under RLS: per-row resource_override_allows +
-- current_user_mmp_scope forced a seq scan (~8s) past PostgREST statement timeout.
-- Mobile logs: PostgrestException 57014 on _loadAvailableSites for Dispatched+state.

CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_claimable_state
  ON public.mmp_site_entries (state, created_at DESC)
  WHERE status = 'Dispatched' AND accepted_by IS NULL;

CREATE OR REPLACE FUNCTION public.list_claimable_mmp_sites(
  p_state_name text,
  p_limit int DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_scope jsonb;
  v_state text := nullif(btrim(coalesce(p_state_name, '')), '');
  v_limit int := GREATEST(1, LEAST(coalesce(p_limit, 500), 1000));
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF v_state IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Evaluate hub/state scope once (not per row via RLS).
  v_scope := public.current_user_mmp_scope();

  SELECT coalesce(jsonb_agg(x.payload ORDER BY x.created_at DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      e.created_at,
      (to_jsonb(e) - 'fee_payment_notes')
        || jsonb_build_object(
          'mmp_files', jsonb_build_object(
            'id', f.id,
            'name', f.name,
            'project_id', f.project_id
          )
        ) AS payload
    FROM public.mmp_site_entries e
    LEFT JOIN public.mmp_files f ON f.id = e.mmp_file_id
    WHERE e.status = 'Dispatched'
      AND e.accepted_by IS NULL
      AND e.state ILIKE ('%' || v_state || '%')
      AND public.mmp_entry_is_in_scope(e.state, e.hub_office, v_scope)
    ORDER BY e.created_at DESC
    LIMIT v_limit
  ) x;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.list_claimable_mmp_sites(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_claimable_mmp_sites(text, int) TO authenticated;
