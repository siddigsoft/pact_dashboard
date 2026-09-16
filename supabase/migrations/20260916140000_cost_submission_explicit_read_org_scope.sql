-- Explicit Access Control action grants for cost_submissions should unlock
-- org-wide Cost Submission visibility the same way down_payments:read already
-- unlocks Down Payment Approval for custom roles (e.g. Field Assistant).
--
-- Role-default cost_submissions:read (data collectors, etc.) must NOT become
-- org-wide — only an active user_permission_overrides grant does.

CREATE OR REPLACE FUNCTION public.user_has_explicit_resource_grant(
  p_user_id uuid,
  p_resource text,
  p_actions text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_permission_overrides o
    WHERE o.user_id = p_user_id
      AND o.resource = p_resource
      AND o.action = ANY (p_actions)
      AND o.is_granted IS TRUE
      AND (o.expires_at IS NULL OR o.expires_at > now())
  );
$$;

REVOKE ALL ON FUNCTION public.user_has_explicit_resource_grant(uuid, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_explicit_resource_grant(uuid, text, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_view_operational_cost_submission(
  p_submission_id uuid,
  p_viewer_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_role_key TEXT;
  v_viewer_country TEXT;
  v_viewer_org TEXT;
  v_submission_hub TEXT;
  v_project TEXT;
  v_state TEXT;
  v_country TEXT;
  v_org TEXT;
  v_mode TEXT;
  v_user_policy BOOLEAN;
  v_role_policy BOOLEAN;
  v_has_positive BOOLEAN;
  v_include_match BOOLEAN;
  v_excluded BOOLEAN;
  v_legacy_allowed BOOLEAN;
BEGIN
  IF p_submission_id IS NULL OR p_viewer_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_viewer_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  v_role_key := regexp_replace(lower(coalesce(v_profile.role, '')), '[^a-z]', '', 'g');
  v_viewer_country := NULLIF(lower(btrim(coalesce(
    to_jsonb(v_profile)->>'country_id',
    to_jsonb(v_profile)->>'country',
    to_jsonb(v_profile)->>'country_code'
  ))), '');
  v_viewer_org := NULLIF(lower(btrim(coalesce(
    to_jsonb(v_profile)->>'organization_id',
    to_jsonb(v_profile)->>'organization',
    to_jsonb(v_profile)->>'organization_code'
  ))), '');

  IF v_role_key IN ('superadmin', 'superadministrator')
     OR EXISTS (
       SELECT 1 FROM public.super_admins sa
       WHERE sa.user_id = p_viewer_id AND sa.is_active = TRUE
      )
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p_viewer_id
          AND regexp_replace(lower(coalesce(ur.role, '')), '[^a-z]', '', 'g')
            IN ('superadmin', 'superadministrator')
     )
  THEN
    RETURN TRUE;
  END IF;

  SELECT
    public.canonical_operational_cost_hub_id(coalesce(s.hub_id, submitter.hub_id,
      submitter.state_id, submitter.location->>'state_id')),
    s.project_id::text,
    NULLIF(lower(btrim(coalesce(submitter.state_id, submitter.location->>'state_id'))), ''),
    NULLIF(lower(btrim(coalesce(to_jsonb(submitter)->>'country_id',
      to_jsonb(submitter)->>'country', to_jsonb(submitter)->>'country_code'))), ''),
    NULLIF(lower(btrim(coalesce(to_jsonb(submitter)->>'organization_id',
      to_jsonb(submitter)->>'organization', to_jsonb(submitter)->>'organization_code'))), '')
  INTO v_submission_hub, v_project, v_state, v_country, v_org
  FROM public.operational_cost_submissions s
  JOIN public.profiles submitter ON submitter.id = s.submitted_by
  WHERE s.id = p_submission_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.data_scope_config c
    WHERE c.resource = 'operational_cost_submissions'
      AND c.scope_type = 'organization' AND c.scope_value = '__policy__'
      AND c.user_id = p_viewer_id
  ) INTO v_user_policy;
  SELECT EXISTS (
    SELECT 1 FROM public.data_scope_config c
    WHERE c.resource = 'operational_cost_submissions'
      AND c.scope_type = 'organization' AND c.scope_value = '__policy__'
      AND c.user_id IS NULL
      AND regexp_replace(lower(coalesce(c.role, '')), '[^a-z]', '', 'g') = v_role_key
  ) INTO v_role_policy;

  IF v_user_policy OR v_role_policy THEN
    SELECT c.mode INTO v_mode
    FROM public.data_scope_config c
    WHERE c.resource = 'operational_cost_submissions'
      AND c.is_excluded = FALSE
      AND c.scope_type = 'organization'
      AND c.scope_value = '__policy__'
      AND ((v_user_policy AND c.user_id = p_viewer_id)
        OR (NOT v_user_policy AND c.user_id IS NULL
          AND regexp_replace(lower(coalesce(c.role, '')), '[^a-z]', '', 'g') = v_role_key))
    ORDER BY c.created_at DESC
    LIMIT 1;

    SELECT EXISTS (
      SELECT 1 FROM public.data_scope_config c
      WHERE c.resource = 'operational_cost_submissions'
        AND c.scope_type = 'organization' AND c.scope_value = '__policy__'
        AND c.is_excluded = FALSE
        AND c.mode IN ('selected', 'country')
        AND ((v_user_policy AND c.user_id = p_viewer_id)
          OR (NOT v_user_policy AND c.user_id IS NULL
            AND regexp_replace(lower(coalesce(c.role, '')), '[^a-z]', '', 'g') = v_role_key))
    ) INTO v_has_positive;

    SELECT EXISTS (
      SELECT 1 FROM public.data_scope_config c
      WHERE c.resource = 'operational_cost_submissions'
        AND c.scope_type = 'organization' AND c.scope_value = '__policy__'
        AND ((v_user_policy AND c.user_id = p_viewer_id)
          OR (NOT v_user_policy AND c.user_id IS NULL
            AND regexp_replace(lower(coalesce(c.role, '')), '[^a-z]', '', 'g') = v_role_key))
        AND (
          EXISTS (
            SELECT 1
            FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c.exclude_values) = 'array'
              THEN c.exclude_values ELSE '[]'::jsonb END) selector
            WHERE jsonb_typeof(selector) = 'object'
              AND (
                (selector->>'type' = 'hub'
                  AND public.canonical_operational_cost_hub_id(selector->>'value') = v_submission_hub)
                OR (selector->>'type' = 'project'
                  AND NULLIF(lower(btrim(selector->>'value')), '') = v_project)
                OR (selector->>'type' = 'state'
                  AND NULLIF(lower(btrim(selector->>'value')), '') = v_state)
                OR (selector->>'type' = 'country'
                  AND v_country IS NOT NULL
                  AND NULLIF(lower(btrim(selector->>'value')), '') = v_country)
              )
          )
          OR (c.is_excluded AND c.scope_type = 'organization'
            AND c.scope_value = '__policy__')
        )
    ) INTO v_excluded;
    IF v_excluded THEN RETURN FALSE; END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.data_scope_config c
      WHERE c.resource = 'operational_cost_submissions'
        AND c.is_excluded = FALSE
        AND ((v_user_policy AND c.user_id = p_viewer_id)
          OR (NOT v_user_policy AND c.user_id IS NULL
            AND regexp_replace(lower(coalesce(c.role, '')), '[^a-z]', '', 'g') = v_role_key))
        AND (
          EXISTS (
            SELECT 1
            FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c.include_values) = 'array'
              THEN c.include_values ELSE '[]'::jsonb END) selector
            WHERE jsonb_typeof(selector) = 'object'
              AND (
                (selector->>'type' = 'hub'
                  AND public.canonical_operational_cost_hub_id(selector->>'value') = v_submission_hub)
                OR (selector->>'type' = 'project'
                  AND NULLIF(lower(btrim(selector->>'value')), '') = v_project)
                OR (selector->>'type' = 'state'
                  AND NULLIF(lower(btrim(selector->>'value')), '') = v_state)
                OR (selector->>'type' = 'country'
                  AND v_country IS NOT NULL
                  AND NULLIF(lower(btrim(selector->>'value')), '') = v_country)
              )
          )
        )
    ) INTO v_include_match;

    IF v_mode = 'none' THEN RETURN FALSE; END IF;
    IF v_mode = 'own' THEN
      RETURN EXISTS (
        SELECT 1 FROM public.operational_cost_submissions s
        WHERE s.id = p_submission_id AND s.submitted_by = p_viewer_id
      ) AND (NOT v_has_positive OR v_include_match);
    END IF;
    IF v_mode = 'selected' THEN RETURN v_include_match; END IF;
    IF v_mode = 'country' THEN
      RETURN (v_include_match OR (
        NOT v_has_positive
        AND v_country IS NOT NULL
        AND v_viewer_country IS NOT NULL
        AND v_country = v_viewer_country
      ));
    END IF;
    IF v_mode = 'organization' THEN
      RETURN (v_include_match OR (
        NOT v_has_positive
        AND v_org IS NOT NULL
        AND v_viewer_org IS NOT NULL
        AND v_org = v_viewer_org
      ));
    END IF;
    IF v_mode = 'assigned' THEN
      RETURN (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = p_viewer_id
            AND (public.canonical_operational_cost_hub_id(p.hub_id) = v_submission_hub
              OR public.canonical_operational_cost_hub_id(coalesce(
                to_jsonb(p)->>'secondary_hub_id', to_jsonb(p)->>'secondaryHubId'
              )) = v_submission_hub)
        )
        AND (NOT v_has_positive OR v_include_match)
      );
    END IF;
    IF v_mode <> 'role_default' THEN RETURN FALSE; END IF;
    IF v_has_positive AND NOT v_include_match THEN RETURN FALSE; END IF;
  END IF;

  -- Explicit Access Control grants (custom roles such as Field Assistant) get
  -- the same org-wide list Down Payment Approval already exposes.
  IF public.user_has_explicit_resource_grant(
    p_viewer_id,
    'cost_submissions',
    ARRAY['read', 'approve']::text[]
  ) THEN
    RETURN TRUE;
  END IF;

  v_legacy_allowed :=
    v_role_key IN ('admin', 'administrator', 'ict', 'financialadmin',
      'financeadmin', 'finance', 'fom', 'fieldoperationmanager',
      'fieldoperationmanagerfom', 'countrydirector')
    OR (
      v_role_key IN ('hubsupervisor', 'supervisor')
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = p_viewer_id
          AND (public.canonical_operational_cost_hub_id(p.hub_id) = v_submission_hub
            OR public.canonical_operational_cost_hub_id(coalesce(
              to_jsonb(p)->>'secondary_hub_id', to_jsonb(p)->>'secondaryHubId'
            )) = v_submission_hub)
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.operational_cost_submissions s
      WHERE s.id = p_submission_id AND s.submitted_by = p_viewer_id
    )
    OR EXISTS (
      SELECT 1 FROM public.super_admins sa
      WHERE sa.user_id = p_viewer_id AND sa.is_active = TRUE
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = p_viewer_id
        AND regexp_replace(lower(coalesce(ur.role, '')), '[^a-z]', '', 'g')
          IN ('admin', 'administrator', 'superadmin', 'superadministrator',
              'financialadmin', 'financeadmin', 'ict')
    );
  RETURN v_legacy_allowed;
END;
$$;
