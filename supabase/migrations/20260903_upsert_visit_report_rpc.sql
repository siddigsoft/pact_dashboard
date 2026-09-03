-- Idempotent visit-report insert for completion retries.
-- A hard UNIQUE(site_visit_id) is unsafe because returned_to_fom / re-dispatch
-- legitimately needs a new report later. This RPC reuses the latest report when:
--   1) the site entry is already in a terminal completion status, OR
--   2) the same submitted_by created a report within the last 5 minutes.
-- Otherwise it inserts a new row.

CREATE OR REPLACE FUNCTION public.upsert_visit_report(
  p_site_visit_id uuid,
  p_report jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site_status text;
  v_existing reports%ROWTYPE;
  v_submitted_by uuid;
  v_new reports%ROWTYPE;
  v_terminal boolean;
  v_selected text[];
BEGIN
  IF p_site_visit_id IS NULL THEN
    RAISE EXCEPTION 'site_visit_id is required';
  END IF;

  SELECT status INTO v_site_status
  FROM mmp_site_entries
  WHERE id = p_site_visit_id;

  v_submitted_by := NULLIF(p_report->>'submitted_by', '')::uuid;

  SELECT * INTO v_existing
  FROM reports
  WHERE site_visit_id = p_site_visit_id
  ORDER BY submitted_at DESC NULLS LAST, last_modified DESC NULLS LAST
  LIMIT 1;

  v_terminal := lower(coalesce(v_site_status, '')) IN (
    'completed', 'submitted', 'wfp_confirmed', 'not_covered', 'cancelled', 'canceled', 'verified'
  );

  IF FOUND AND (
    v_terminal
    OR (
      v_submitted_by IS NOT NULL
      AND v_existing.submitted_by = v_submitted_by
      AND v_existing.submitted_at IS NOT NULL
      AND v_existing.submitted_at > now() - interval '5 minutes'
    )
  ) THEN
    RETURN jsonb_build_object(
      'id', v_existing.id,
      'reused', true,
      'site_visit_id', v_existing.site_visit_id
    );
  END IF;

  IF jsonb_typeof(p_report->'selected_activities') = 'array' THEN
    SELECT array_agg(value)
    INTO v_selected
    FROM jsonb_array_elements_text(p_report->'selected_activities') AS t(value);
  ELSE
    v_selected := NULL;
  END IF;

  INSERT INTO reports (
    site_visit_id,
    submitted_by,
    activities,
    notes,
    duration_minutes,
    coordinates,
    submitted_at,
    is_synced,
    selected_activities,
    activity_details,
    total_visit_fees
  )
  VALUES (
    p_site_visit_id,
    v_submitted_by,
    p_report->>'activities',
    coalesce(p_report->>'notes', ''),
    NULLIF(p_report->>'duration_minutes', '')::int,
    coalesce(p_report->'coordinates', '{}'::jsonb),
    coalesce(NULLIF(p_report->>'submitted_at', '')::timestamp, now()),
    coalesce((p_report->>'is_synced')::boolean, true),
    v_selected,
    CASE
      WHEN p_report ? 'activity_details' AND jsonb_typeof(p_report->'activity_details') = 'object'
        THEN p_report->'activity_details'
      ELSE NULL
    END,
    NULLIF(p_report->>'total_visit_fees', '')::int
  )
  RETURNING * INTO v_new;

  RETURN jsonb_build_object(
    'id', v_new.id,
    'reused', false,
    'site_visit_id', v_new.site_visit_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_visit_report(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_visit_report(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_visit_report(uuid, jsonb) TO service_role;

COMMENT ON FUNCTION public.upsert_visit_report(uuid, jsonb) IS
  'Idempotent visit report insert: reuses latest report for terminal sites or same-user retries within 5 minutes.';
