-- External contributor portal: token-based public access (no login required).

CREATE OR REPLACE FUNCTION public.get_external_contributor_portal(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
  v_name text;
  v_project_code text;
  v_status text;
  v_start_date date;
  v_end_date date;
  v_description text;
  v_budget jsonb;
  v_member jsonb;
  v_activities jsonb;
  v_member_user_id text;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 16 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  SELECT
    p.id,
    p.name,
    p.project_code,
    p.status::text,
    p.start_date,
    p.end_date,
    p.description,
    p.budget,
    m.elem
  INTO
    v_project_id,
    v_name,
    v_project_code,
    v_status,
    v_start_date,
    v_end_date,
    v_description,
    v_budget,
    v_member
  FROM public.projects p
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.team->'teamComposition', '[]'::jsonb)) AS m(elem)
  WHERE m.elem->>'accessToken' = p_token
    AND COALESCE(m.elem->>'memberType', '') = 'external'
  LIMIT 1;

  IF v_project_id IS NULL OR v_member IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  v_member_user_id := v_member->>'userId';

  SELECT COALESCE(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.sort_date NULLS LAST), '[]'::jsonb)
  INTO v_activities
  FROM (
    SELECT
      pa.id,
      pa.title AS name,
      pa.description,
      pa.start_date AS "startDate",
      pa.end_date AS "dueDate",
      CASE pa.status
        WHEN 'in_progress' THEN 'inProgress'
        WHEN 'open' THEN 'pending'
        WHEN 'assigned' THEN 'pending'
        ELSE pa.status
      END AS status,
      pa.notes,
      pa.created_at AS "createdAt",
      COALESCE(pa.start_date, pa.created_at::date) AS sort_date,
      EXISTS (
        SELECT 1
        FROM public.project_activity_assignments paa
        WHERE paa.activity_id = pa.id
          AND paa.user_id::text = v_member_user_id
      ) AS explicitly_assigned
    FROM public.project_activities pa
    WHERE pa.project_id = v_project_id
  ) x
  WHERE x.explicitly_assigned
     OR NOT EXISTS (
          SELECT 1
          FROM public.project_activities pa2
          JOIN public.project_activity_assignments paa2 ON paa2.activity_id = pa2.id
          WHERE pa2.project_id = v_project_id
            AND paa2.user_id::text = v_member_user_id
        );

  RETURN jsonb_build_object(
    'ok', true,
    'project', jsonb_build_object(
      'id', v_project_id,
      'name', v_name,
      'projectCode', v_project_code,
      'status', v_status,
      'startDate', v_start_date,
      'endDate', v_end_date,
      'description', v_description,
      'budget', v_budget
    ),
    'member', v_member,
    'activities', COALESCE(v_activities, '[]'::jsonb)
  );
END;
$$;

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
  v_project_id uuid;
  v_member jsonb;
  v_allowed_statuses text[] := ARRAY['pending','inProgress','completed','cancelled'];
  v_db_status text;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 16 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  IF p_status IS NULL OR NOT (p_status = ANY (v_allowed_statuses)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;

  SELECT p.id, m.elem
  INTO v_project_id, v_member
  FROM public.projects p
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.team->'teamComposition', '[]'::jsonb)) AS m(elem)
  WHERE m.elem->>'accessToken' = p_token
    AND COALESCE(m.elem->>'memberType', '') = 'external'
  LIMIT 1;

  IF v_project_id IS NULL OR v_member IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.project_activities pa
    WHERE pa.id = p_activity_id AND pa.project_id = v_project_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  v_db_status := CASE p_status
    WHEN 'inProgress' THEN 'in_progress'
    WHEN 'pending' THEN 'open'
    ELSE p_status
  END;

  UPDATE public.project_activities
  SET status = v_db_status,
      updated_at = now()
  WHERE id = p_activity_id
    AND project_id = v_project_id;

  RETURN jsonb_build_object('ok', true, 'activity_id', p_activity_id, 'status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION public.get_external_contributor_portal(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_external_contributor_activity(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_external_contributor_portal(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_external_contributor_activity(text, uuid, text) TO anon, authenticated;
