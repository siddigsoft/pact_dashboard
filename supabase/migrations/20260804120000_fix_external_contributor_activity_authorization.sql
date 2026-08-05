-- Fix: update_external_contributor_activity must verify the activity is
-- assigned to the external member tied to the token before allowing an update.
-- Previously it only checked pa.project_id = v_project_id, which let any
-- token holder in the project update any activity — a broken-access-control gap.

CREATE OR REPLACE FUNCTION public.update_external_contributor_activity(
  p_token text,
  p_activity_id uuid,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id     uuid;
  v_member         jsonb;
  v_member_user_id text;
  v_allowed_statuses text[] := ARRAY['pending','inProgress','completed','cancelled'];
  v_db_status      text;
  v_is_authorized  boolean;
BEGIN
  -- Token basic sanity
  IF p_token IS NULL OR length(trim(p_token)) < 16 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  -- Status allowlist
  IF p_status IS NULL OR NOT (p_status = ANY (v_allowed_statuses)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;

  -- Resolve token → project + member record
  SELECT p.id, m.elem
  INTO v_project_id, v_member
  FROM public.projects p
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(p.team->'teamComposition', '[]'::jsonb)
  ) AS m(elem)
  WHERE m.elem->>'accessToken' = p_token
    AND COALESCE(m.elem->>'memberType', '') = 'external'
  LIMIT 1;

  IF v_project_id IS NULL OR v_member IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  v_member_user_id := v_member->>'userId';

  -- Authorization: activity must belong to the project AND the member must
  -- own it (explicitly assigned, or the fall-through where no assignments
  -- exist for this member in the project — same logic as get_external_contributor_portal).
  SELECT
    EXISTS (
      SELECT 1
      FROM public.project_activities pa
      WHERE pa.id = p_activity_id
        AND pa.project_id = v_project_id
        AND (
          -- Explicitly assigned to this member
          EXISTS (
            SELECT 1
            FROM public.project_activity_assignments paa
            WHERE paa.activity_id = pa.id
              AND paa.user_id::text = v_member_user_id
          )
          OR
          -- Fall-through: member has no explicit assignments in this project,
          -- so they see all unassigned activities (same as the read side)
          NOT EXISTS (
            SELECT 1
            FROM public.project_activities pa2
            JOIN public.project_activity_assignments paa2
              ON paa2.activity_id = pa2.id
            WHERE pa2.project_id = v_project_id
              AND paa2.user_id::text = v_member_user_id
          )
        )
    )
  INTO v_is_authorized;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- Map portal status → DB status
  v_db_status := CASE p_status
    WHEN 'inProgress' THEN 'in_progress'
    WHEN 'pending'    THEN 'open'
    ELSE p_status
  END;

  UPDATE public.project_activities
  SET    status     = v_db_status,
         updated_at = now()
  WHERE  id         = p_activity_id
    AND  project_id = v_project_id;

  RETURN jsonb_build_object('ok', true, 'activity_id', p_activity_id, 'status', p_status);
END;
$$;

-- Grants are unchanged — anon + authenticated may call this (token is the auth mechanism)
REVOKE ALL ON FUNCTION public.update_external_contributor_activity(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_external_contributor_activity(text, uuid, text) TO anon, authenticated;
