-- Database-authoritative, resource-specific data scope for Operational Cost
-- Submissions.  The legacy rows in data_scope_config deliberately retain the
-- resource key "legacy"; they are not silently reinterpreted as a cost scope.

BEGIN;

-- ─── Backwards-compatible data-scope shape ────────────────────────────────────
ALTER TABLE public.data_scope_config
  ADD COLUMN IF NOT EXISTS resource TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'role_default',
  ADD COLUMN IF NOT EXISTS is_excluded BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS include_values JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS exclude_values JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.data_scope_config
  DROP CONSTRAINT IF EXISTS data_scope_config_scope_type_check;
ALTER TABLE public.data_scope_config
  ADD CONSTRAINT data_scope_config_scope_type_check
  CHECK (scope_type IN ('hub', 'project', 'state', 'cost_center', 'country', 'organization'));

ALTER TABLE public.data_scope_config
  DROP CONSTRAINT IF EXISTS data_scope_config_mode_check;
ALTER TABLE public.data_scope_config
  ADD CONSTRAINT data_scope_config_mode_check
  CHECK (mode IN ('role_default', 'none', 'own', 'assigned', 'selected', 'country', 'organization'));

DROP INDEX IF EXISTS public.uq_dsc_user;
DROP INDEX IF EXISTS public.uq_dsc_role;
CREATE UNIQUE INDEX IF NOT EXISTS uq_dsc_user_resource
  ON public.data_scope_config (user_id, resource, scope_type, scope_value)
  WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_dsc_role_resource
  ON public.data_scope_config (role, resource, scope_type, scope_value)
  WHERE role IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dsc_resource_user
  ON public.data_scope_config (resource, user_id, role);

CREATE TABLE IF NOT EXISTS public.data_scope_config_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_scope_config_id UUID,
  operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  row_snapshot JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dsc_history_config
  ON public.data_scope_config_history (data_scope_config_id, changed_at DESC);

CREATE OR REPLACE FUNCTION public.audit_data_scope_config_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.data_scope_config_history
    (data_scope_config_id, operation, changed_by, row_snapshot)
  VALUES (
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    auth.uid(),
    CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_data_scope_config ON public.data_scope_config;
CREATE TRIGGER trg_audit_data_scope_config
  AFTER INSERT OR UPDATE OR DELETE ON public.data_scope_config
  FOR EACH ROW EXECUTE FUNCTION public.audit_data_scope_config_change();

ALTER TABLE public.data_scope_config_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS data_scope_config_history_admin_read
  ON public.data_scope_config_history;
CREATE POLICY data_scope_config_history_admin_read
  ON public.data_scope_config_history FOR SELECT TO authenticated
  USING (public.workspace_check_super_admin());

-- Keep hub matching consistent with the established Forchana aliases even if
-- this migration is installed on a database that has not run the older fix.
CREATE OR REPLACE FUNCTION public.canonical_operational_cost_hub_id(p_hub_id text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_hub_id IS NULL OR btrim(p_hub_id) = '' THEN NULL
    WHEN lower(regexp_replace(replace(replace(btrim(p_hub_id), '_', ' '), '-', ' '), '\s+', ' ', 'g'))
      ~ '(forchana|farchana|west darfur|central darfur|el geneina|geneina)'
      THEN 'forchana-hub'
    ELSE lower(btrim(p_hub_id))
  END;
$$;

-- ─── One authorization predicate used by both SELECT paths ───────────────────
-- p_viewer_id is explicit so the preview RPC can evaluate another user's
-- effective scope without changing auth.uid() or duplicating this logic.
CREATE OR REPLACE FUNCTION public.can_view_operational_cost_submission(
  p_submission_id UUID,
  p_viewer_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_submitter public.profiles%ROWTYPE;
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

  -- A Super Admin is deliberately outside all configured exclusions. Table
  -- membership remains authoritative even when profiles.role has another label.
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

  -- The assignment fallback is intentionally submission hub →
  -- submitter hub → submitter state/location, preserving the canonical hub
  -- normalization used by the existing supervisor behavior.
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

  -- Explicit user policy wins over the role policy, including an explicit
  -- "none" policy.  No resource-specific policy means legacy role/hub rules.
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
    -- role_default uses the legacy role/hub behavior below, while still
    -- allowing resource-specific positive selectors to narrow it.
    IF v_mode <> 'role_default' THEN RETURN FALSE; END IF;
    IF v_has_positive AND NOT v_include_match THEN RETURN FALSE; END IF;
  END IF;

  -- Legacy behavior: administrators/FOM/Country Directors see all, supervisors
  -- see their assigned canonical hub (including the secondary hub), and all
  -- other roles see only their own submissions.
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

REVOKE ALL ON FUNCTION public.can_view_operational_cost_submission(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_operational_cost_submission(UUID, UUID) TO authenticated;

-- ─── RLS and authoritative list RPC ──────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own operational cost submissions"
  ON public.operational_cost_submissions;
DROP POLICY IF EXISTS "Supervisors can view hub operational cost submissions"
  ON public.operational_cost_submissions;
DROP POLICY IF EXISTS "Supervisors and FOM can view operational cost submissions"
  ON public.operational_cost_submissions;
DROP POLICY IF EXISTS "Admins can view all operational cost submissions"
  ON public.operational_cost_submissions;
DROP POLICY IF EXISTS operational_cost_submissions_select_combined
  ON public.operational_cost_submissions;
DROP POLICY IF EXISTS operational_cost_submissions_scope_select
  ON public.operational_cost_submissions;
DO $$
DECLARE
  v_policy RECORD;
BEGIN
  FOR v_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'operational_cost_submissions'
      AND cmd = 'SELECT'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.operational_cost_submissions',
      v_policy.policyname
    );
  END LOOP;
END;
$$;
CREATE POLICY operational_cost_submissions_scope_select
  ON public.operational_cost_submissions FOR SELECT TO authenticated
  USING (public.can_view_operational_cost_submission(id, auth.uid()));

CREATE OR REPLACE FUNCTION public.get_all_operational_cost_submissions()
RETURNS SETOF public.operational_cost_submissions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.*
  FROM public.operational_cost_submissions s
  WHERE public.can_view_operational_cost_submission(s.id, auth.uid())
  ORDER BY s.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_all_operational_cost_submissions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_all_operational_cost_submissions() TO authenticated;

-- Admin-only preview for Access Manager and audit tooling.  It intentionally
-- returns a count rather than rows, and evaluates the exact same predicate.
CREATE OR REPLACE FUNCTION public.preview_operational_cost_submission_scope(
  p_target_user_id UUID DEFAULT auth.uid()
)
RETURNS TABLE (
  target_user_id UUID,
  effective_mode TEXT,
  policy_source TEXT,
  visible_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_role TEXT;
  v_user_policy BOOLEAN;
  v_role_policy BOOLEAN;
  v_mode TEXT;
  v_super_admin BOOLEAN;
BEGIN
  IF NOT coalesce(public.workspace_check_super_admin(), FALSE) THEN
    RAISE EXCEPTION 'Access denied: only a workspace Super Admin can preview cost submission scope';
  END IF;

  SELECT regexp_replace(lower(coalesce(role, '')), '[^a-z]', '', 'g')
    INTO v_target_role FROM public.profiles WHERE id = p_target_user_id;
  IF p_target_user_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_user_id)
  THEN
    RAISE EXCEPTION 'Target user does not exist';
  END IF;

  SELECT (
    v_target_role IN ('superadmin', 'superadministrator')
    OR EXISTS (
      SELECT 1 FROM public.super_admins sa
      WHERE sa.user_id = p_target_user_id AND sa.is_active = TRUE
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = p_target_user_id
        AND regexp_replace(lower(coalesce(ur.role, '')), '[^a-z]', '', 'g')
          IN ('superadmin', 'superadministrator')
    )
  ) INTO v_super_admin;

  IF v_super_admin THEN
    RETURN QUERY SELECT p_target_user_id, 'super_admin'::TEXT,
      'super_admin'::TEXT,
      (SELECT count(*) FROM public.operational_cost_submissions);
    RETURN;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.data_scope_config
    WHERE resource = 'operational_cost_submissions'
      AND scope_type = 'organization' AND scope_value = '__policy__'
      AND user_id = p_target_user_id)
    INTO v_user_policy;
  SELECT EXISTS (SELECT 1 FROM public.data_scope_config
    WHERE resource = 'operational_cost_submissions'
      AND scope_type = 'organization' AND scope_value = '__policy__'
      AND user_id IS NULL
      AND regexp_replace(lower(coalesce(role, '')), '[^a-z]', '', 'g') = v_target_role)
    INTO v_role_policy;
  IF v_user_policy OR v_role_policy THEN
    SELECT mode INTO v_mode FROM public.data_scope_config
    WHERE resource = 'operational_cost_submissions'
      AND is_excluded = FALSE
      AND scope_type = 'organization' AND scope_value = '__policy__'
      AND ((v_user_policy AND user_id = p_target_user_id)
        OR (NOT v_user_policy AND user_id IS NULL
          AND regexp_replace(lower(coalesce(role, '')), '[^a-z]', '', 'g') = v_target_role))
    ORDER BY created_at DESC LIMIT 1;
  ELSE
    v_mode := 'role_default';
  END IF;

  RETURN QUERY SELECT
    p_target_user_id,
    v_mode,
    CASE WHEN v_user_policy THEN 'user'
         WHEN v_role_policy THEN 'role'
         ELSE 'legacy' END,
    (SELECT count(*) FROM public.operational_cost_submissions s
      WHERE public.can_view_operational_cost_submission(s.id, p_target_user_id));
END;
$$;

REVOKE ALL ON FUNCTION public.preview_operational_cost_submission_scope(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_operational_cost_submission_scope(UUID) TO authenticated;

-- Replace the complete resource policy in one transaction.  A user-level
-- role_default is inheritance, so it removes the user policy rather than
-- storing a redundant row.  A role-level role_default is a real role policy.
CREATE OR REPLACE FUNCTION public.replace_operational_cost_data_scope(
  p_target_user_id UUID DEFAULT NULL,
  p_target_role TEXT DEFAULT NULL,
  p_mode TEXT DEFAULT 'role_default',
  p_include_values JSONB DEFAULT '[]'::jsonb,
  p_exclude_values JSONB DEFAULT '[]'::jsonb
)
RETURNS TABLE (
  target_user_id UUID,
  effective_mode TEXT,
  policy_source TEXT,
  visible_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_key TEXT;
  v_target_role TEXT;
  v_target_user_id UUID;
  v_has_target_user BOOLEAN;
  v_super_admin BOOLEAN;
  v_selector JSONB;
  v_count BIGINT;
BEGIN
  IF NOT coalesce(public.workspace_check_super_admin(), FALSE) THEN
    RAISE EXCEPTION 'Access denied: only a workspace Super Admin can replace cost submission scope';
  END IF;

  IF (p_target_user_id IS NULL) = (NULLIF(btrim(p_target_role), '') IS NULL) THEN
    RAISE EXCEPTION 'Exactly one of p_target_user_id or p_target_role is required';
  END IF;

  IF p_mode IS NULL OR p_mode NOT IN ('role_default', 'none', 'own', 'assigned', 'selected', 'country', 'organization') THEN
    RAISE EXCEPTION 'Invalid operational cost scope mode: %', p_mode;
  END IF;

  IF jsonb_typeof(coalesce(p_include_values, '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(coalesce(p_exclude_values, '[]'::jsonb)) <> 'array'
  THEN
    RAISE EXCEPTION 'Selector values must be JSON arrays';
  END IF;

  FOR v_selector IN
    SELECT value FROM jsonb_array_elements(coalesce(p_include_values, '[]'::jsonb))
    UNION ALL
    SELECT value FROM jsonb_array_elements(coalesce(p_exclude_values, '[]'::jsonb))
  LOOP
    IF jsonb_typeof(v_selector) <> 'object'
       OR jsonb_typeof(v_selector->'type') <> 'string'
       OR jsonb_typeof(v_selector->'value') <> 'string'
       OR jsonb_typeof(v_selector->'label') <> 'string'
       OR NULLIF(btrim(v_selector->>'type'), '') IS NULL
       OR NULLIF(btrim(v_selector->>'value'), '') IS NULL
       OR NULLIF(btrim(v_selector->>'label'), '') IS NULL
       OR lower(btrim(v_selector->>'type')) NOT IN ('hub', 'project', 'state', 'country')
    THEN
      RAISE EXCEPTION 'Each selector must be {type,value,label} with a supported non-empty type/value/label';
    END IF;
  END LOOP;

  IF p_target_user_id IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_user_id)
      INTO v_has_target_user;
    IF NOT v_has_target_user THEN
      RAISE EXCEPTION 'Target user does not exist';
    END IF;
    v_target_user_id := p_target_user_id;
  ELSE
    v_target_role := btrim(p_target_role);
    v_role_key := regexp_replace(lower(v_target_role), '[^a-z]', '', 'g');
    IF v_role_key = '' THEN
      RAISE EXCEPTION 'Target role cannot be blank';
    END IF;
    IF v_role_key IN ('superadmin', 'superadministrator') THEN
      RAISE EXCEPTION 'Super Admin scope cannot be restricted';
    END IF;
  END IF;

  -- Super Admin targets are immutable from this API.
  IF p_target_user_id IS NOT NULL THEN
    SELECT (
      regexp_replace(lower(coalesce(p.role, '')), '[^a-z]', '', 'g')
        IN ('superadmin', 'superadministrator')
      OR EXISTS (
        SELECT 1 FROM public.super_admins sa
        WHERE sa.user_id = p_target_user_id AND sa.is_active = TRUE
      )
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p_target_user_id
          AND regexp_replace(lower(coalesce(ur.role, '')), '[^a-z]', '', 'g')
            IN ('superadmin', 'superadministrator')
      )
    ) INTO v_super_admin
    FROM public.profiles p WHERE p.id = p_target_user_id;
    IF v_super_admin THEN
      RAISE EXCEPTION 'Super Admin scope cannot be restricted';
    END IF;
  END IF;

  DELETE FROM public.data_scope_config c
  WHERE c.resource = 'operational_cost_submissions'
    AND (
      (p_target_user_id IS NOT NULL AND c.user_id = p_target_user_id)
      OR (p_target_user_id IS NULL AND c.user_id IS NULL
        AND regexp_replace(lower(coalesce(c.role, '')), '[^a-z]', '', 'g') = v_role_key)
    );

  IF NOT (p_target_user_id IS NOT NULL AND p_mode = 'role_default') THEN
    INSERT INTO public.data_scope_config (
      user_id, role, resource, mode, scope_type, scope_value,
      is_excluded, include_values, exclude_values, set_by
    ) VALUES (
      p_target_user_id, CASE WHEN p_target_user_id IS NULL THEN v_target_role ELSE NULL END,
      'operational_cost_submissions', p_mode, 'organization', '__policy__',
      FALSE, coalesce(p_include_values, '[]'::jsonb), coalesce(p_exclude_values, '[]'::jsonb),
      auth.uid()
    );
  END IF;

  -- Return the same effective result shape as preview. Role targets report the
  -- union of rows visible to users carrying that normalized role.
  IF p_target_user_id IS NOT NULL THEN
    RETURN QUERY
      SELECT * FROM public.preview_operational_cost_submission_scope(p_target_user_id);
  ELSE
    SELECT mode INTO v_role_key
    FROM public.data_scope_config
    WHERE resource = 'operational_cost_submissions'
      AND scope_type = 'organization' AND scope_value = '__policy__'
      AND user_id IS NULL
      AND regexp_replace(lower(coalesce(role, '')), '[^a-z]', '', 'g') = v_role_key
      AND is_excluded = FALSE;
    SELECT count(DISTINCT s.id) INTO v_count
    FROM public.operational_cost_submissions s
    WHERE EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE regexp_replace(lower(coalesce(p.role, '')), '[^a-z]', '', 'g') = regexp_replace(lower(v_target_role), '[^a-z]', '', 'g')
        AND public.can_view_operational_cost_submission(s.id, p.id)
    );
    RETURN QUERY SELECT NULL::UUID, coalesce(v_role_key, 'role_default'),
      'role'::TEXT, v_count;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_operational_cost_data_scope(UUID, TEXT, TEXT, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_operational_cost_data_scope(UUID, TEXT, TEXT, JSONB, JSONB) TO authenticated;

-- The payment-linked supplement remains strict-admin-only, but cannot broaden
-- visibility beyond the exact same predicate used by the list RPC.
CREATE OR REPLACE FUNCTION public.get_admin_payment_linked_operational_cost_submissions()
RETURNS SETOF public.operational_cost_submissions
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role_key TEXT;
BEGIN
  SELECT regexp_replace(lower(coalesce(role, '')), '[^a-z]', '', 'g')
    INTO v_role_key FROM public.profiles WHERE id = auth.uid();
  IF coalesce(v_role_key, '') NOT IN ('admin', 'administrator', 'superadmin', 'superadministrator', 'ict')
     AND NOT EXISTS (
       SELECT 1 FROM public.super_admins sa
       WHERE sa.user_id = auth.uid() AND sa.is_active = TRUE
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = auth.uid()
         AND regexp_replace(lower(coalesce(ur.role, '')), '[^a-z]', '', 'g')
            IN ('admin', 'administrator', 'superadmin', 'superadministrator', 'ict')
     )
  THEN
    RAISE EXCEPTION 'Access denied: only an Admin or Super Admin can view payment-linked cost submissions.';
  END IF;

  RETURN QUERY SELECT s.*
  FROM public.operational_cost_submissions s
  WHERE public.can_view_operational_cost_submission(s.id, auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.pre_fund_transactions payment
      WHERE payment.source_table = 'operational_cost_submissions'
        AND payment.source_id = s.id
        AND payment.transaction_type = 'payment'
        AND NOT EXISTS (
          SELECT 1 FROM public.pre_fund_transactions reversal
          WHERE reversal.reversal_of_id = payment.id
            AND reversal.transaction_type = 'reversal'
        )
    )
  ORDER BY s.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_payment_linked_operational_cost_submissions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_payment_linked_operational_cost_submissions() TO authenticated;

COMMIT;