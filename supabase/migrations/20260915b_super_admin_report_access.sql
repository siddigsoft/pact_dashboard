-- Final report-access hardening.
--
-- This is deliberately a superseding migration.  The earlier report
-- migrations remain immutable because they may already have been applied.
-- All report boundaries below use the same current-user Super Admin
-- predicate, and an active Super Admin is evaluated before any deny override.

CREATE OR REPLACE FUNCTION public.current_user_is_super_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role_key text;
  v_found boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  -- The profile role is the primary application authority source.  Strip
  -- punctuation and whitespace so Super Admin, super_admin, and superAdmin
  -- have the same server-side meaning.
  SELECT regexp_replace(
           lower(btrim(coalesce(p.role::text, ''))),
           '[^a-z0-9]+', '', 'g'
         )
    INTO v_role_key
  FROM public.profiles p
  WHERE p.id = v_uid;

  IF v_role_key IN ('superadmin', 'superadministrator') THEN
    RETURN true;
  END IF;

  -- Some installations do not have the table yet.  Dynamic SQL keeps this
  -- final migration installable on both current and older schemas.
  IF to_regclass('public.super_admins') IS NOT NULL THEN
    BEGIN
      EXECUTE
        'SELECT EXISTS (
           SELECT 1 FROM public.super_admins
           WHERE user_id = $1 AND is_active IS TRUE
         )'
        INTO v_found
        USING v_uid;
      IF coalesce(v_found, false) THEN
        RETURN true;
      END IF;
    EXCEPTION
      WHEN undefined_column OR undefined_table OR insufficient_privilege THEN
        NULL;
    END;
  END IF;

  -- user_roles has existed in both legacy (role text) and normalized
  -- (role_id -> roles.name) forms.  Evaluate both sources when present.
  IF to_regclass('public.user_roles') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_roles'
        AND column_name = 'role'
    ) THEN
      BEGIN
        EXECUTE
          'SELECT EXISTS (
             SELECT 1 FROM public.user_roles
             WHERE user_id = $1
               AND regexp_replace(lower(btrim(coalesce(role::text, ''''))),
                                  ''[^a-z0-9]+'', '''', ''g'')
                   IN (''superadmin'', ''superadministrator'')
           )'
          INTO v_found
          USING v_uid;
        IF coalesce(v_found, false) THEN
          RETURN true;
        END IF;
      EXCEPTION
        WHEN undefined_column OR undefined_table OR insufficient_privilege THEN
          NULL;
      END;
    END IF;

    IF to_regclass('public.roles') IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'user_roles'
           AND column_name = 'role_id'
       ) THEN
      BEGIN
        EXECUTE
          'SELECT EXISTS (
             SELECT 1
             FROM public.user_roles ur
             JOIN public.roles r ON r.id = ur.role_id
             WHERE ur.user_id = $1
               AND r.is_active IS TRUE
               AND regexp_replace(lower(btrim(coalesce(r.name::text, ''''))),
                                  ''[^a-z0-9]+'', '''', ''g'')
                   IN (''superadmin'', ''superadministrator'')
           )'
          INTO v_found
          USING v_uid;
        IF coalesce(v_found, false) THEN
          RETURN true;
        END IF;
      EXCEPTION
        WHEN undefined_column OR undefined_table OR insufficient_privilege THEN
          NULL;
      END;
    END IF;
  END IF;

  -- Preserve the existing workspace authority source when it is available.
  -- A missing or incompatible legacy helper must not turn an ordinary caller
  -- into a Super Admin, so failures here fail closed.
  IF to_regprocedure('public.workspace_check_super_admin()') IS NOT NULL THEN
    BEGIN
      EXECUTE 'SELECT public.workspace_check_super_admin()'
        INTO v_found;
      IF coalesce(v_found, false) THEN
        RETURN true;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.current_user_is_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_is_super_admin() TO authenticated, service_role;

COMMENT ON FUNCTION public.current_user_is_super_admin() IS
  'Canonical fail-closed current-user Super Admin predicate: normalized profile role, active super_admins membership, normalized user_roles/roles sources, and the existing workspace authority helper.';

-- Super Admin is checked before active explicit deny overrides.  No ordinary
-- role gains access: invalid kinds and unauthenticated callers still fail.
CREATE OR REPLACE FUNCTION public.mmp_report_permission(p_action text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_override boolean;
BEGIN
  IF auth.uid() IS NULL OR p_action NOT IN
    ('full_report', 'state_report', 'hub_report') THEN
    RETURN false;
  END IF;

  IF public.current_user_is_super_admin() THEN
    RETURN true;
  END IF;

  SELECT o.is_granted
    INTO v_override
  FROM public.user_permission_overrides o
  WHERE o.user_id = auth.uid()
    AND o.resource = 'mmp'
    AND o.action = p_action
    AND (o.expires_at IS NULL OR o.expires_at > now())
  LIMIT 1;
  IF FOUND THEN
    RETURN v_override;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r
      ON r.is_active = true
     AND (r.id = ur.role_id OR r.name = ur.role)
    JOIN public.permissions p ON p.role_id = r.id
    WHERE ur.user_id = auth.uid()
      AND p.resource = 'mmp'
      AND p.action = p_action
  );
END;
$$;

-- The scope helper is retained for all existing callers, but the canonical
-- Super Admin branch is organization-wide and cannot be narrowed by profile
-- hub/state fields.
CREATE OR REPLACE FUNCTION public.current_user_mmp_scope()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_profile profiles%ROWTYPE;
  v_role_key text;
  v_requires_hub_scope boolean := false;
  v_can_report boolean := false;
  v_hub_ids text[] := ARRAY[]::text[];
  v_state_ids text[] := ARRAY[]::text[];
  v_state_names text[] := ARRAY[]::text[];
  v_item jsonb;
BEGIN
  IF public.current_user_is_super_admin() THEN
    RETURN jsonb_build_object(
      'super_admin', true,
      'hub_scoped', false,
      'can_report', true,
      'role', 'superadmin',
      'hub_ids', to_jsonb(ARRAY[
        'countryoffice', 'portsudanhub', 'dongolahub',
        'forchanahub', 'kassalahub', 'kostihub'
      ]::text[]),
      'state_ids', to_jsonb(ARRAY[
        'khartoum', 'redsea', 'northern', 'rivernile',
        'westdarfur', 'centraldarfur', 'kassala', 'gedarif',
        'gezira', 'sennar', 'bluenile', 'whitenile',
        'northkordofan', 'southkordofan', 'westkordofan',
        'northdarfur', 'southdarfur', 'eastdarfur'
      ]::text[]),
      'state_names', to_jsonb(ARRAY[
        'Khartoum', 'Red Sea', 'Northern', 'River Nile',
        'West Darfur', 'Central Darfur', 'Kassala', 'Gedarif',
        'Al Gezira', 'Sennar', 'Blue Nile', 'White Nile',
        'North Kordofan', 'South Kordofan', 'West Kordofan',
        'North Darfur', 'South Darfur', 'East Darfur'
      ]::text[])
    );
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authenticated profile not found' USING ERRCODE = '42501';
  END IF;

  v_role_key := public.mmp_canonical_role_key(v_profile.role::text);
  v_requires_hub_scope := v_role_key IN ('supervisor', 'coordinator');
  v_can_report := v_role_key IN (
    'superadmin', 'admin', 'ict', 'countrydirector', 'fom',
    'supervisor', 'coordinator'
  );

  IF v_requires_hub_scope THEN
    v_hub_ids := array_remove(ARRAY[
      v_profile.hub_id,
      coalesce(v_profile.secondary_hub_id, v_profile.location->>'secondary_hub_id')
    ], NULL);
  END IF;

  IF jsonb_typeof(v_profile.additional_roles) = 'array' THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_profile.additional_roles)
    LOOP
      IF public.mmp_canonical_role_key(v_item->>'role') = 'supervisor'
         AND v_item->>'hub_id' IS NOT NULL THEN
        IF v_role_key NOT IN ('superadmin', 'admin', 'ict', 'countrydirector', 'fom') THEN
          v_requires_hub_scope := true;
          v_can_report := true;
        END IF;
        v_hub_ids := array_append(v_hub_ids, v_item->>'hub_id');
      END IF;
    END LOOP;
  END IF;

  SELECT coalesce(array_agg(DISTINCT public.mmp_canonical_hub_key(hub_id)), ARRAY[]::text[])
    INTO v_hub_ids
  FROM unnest(v_hub_ids) AS hub_id
  WHERE public.mmp_scope_key(hub_id) <> '';

  SELECT
    coalesce(array_agg(DISTINCT mapping.state_id) FILTER (WHERE mapping.state_id IS NOT NULL), ARRAY[]::text[]),
    coalesce(array_agg(DISTINCT mapping.state_name) FILTER (WHERE mapping.state_name IS NOT NULL), ARRAY[]::text[])
  INTO v_state_ids, v_state_names
  FROM (
    VALUES
      ('countryoffice', 'khartoum', 'Khartoum'),
      ('countryoffice', 'redsea', 'Red Sea'),
      ('portsudanhub', 'redsea', 'Red Sea'),
      ('dongolahub', 'northern', 'Northern'),
      ('dongolahub', 'rivernile', 'River Nile'),
      ('forchanahub', 'westdarfur', 'West Darfur'),
      ('forchanahub', 'centraldarfur', 'Central Darfur'),
      ('kassalahub', 'kassala', 'Kassala'),
      ('kassalahub', 'gedarif', 'Gedarif'),
      ('kassalahub', 'gezira', 'Al Gezira'),
      ('kassalahub', 'sennar', 'Sennar'),
      ('kassalahub', 'bluenile', 'Blue Nile'),
      ('kostihub', 'whitenile', 'White Nile'),
      ('kostihub', 'northkordofan', 'North Kordofan'),
      ('kostihub', 'southkordofan', 'South Kordofan'),
      ('kostihub', 'westkordofan', 'West Kordofan'),
      ('kostihub', 'northdarfur', 'North Darfur'),
      ('kostihub', 'southdarfur', 'South Darfur'),
      ('kostihub', 'eastdarfur', 'East Darfur')
  ) AS mapping(hub_key, state_id, state_name)
  WHERE mapping.hub_key = ANY (
    SELECT public.mmp_canonical_hub_key(h) FROM unnest(v_hub_ids) AS h
  );

  RETURN jsonb_build_object(
    'super_admin', false,
    'hub_scoped', v_requires_hub_scope,
    'can_report', v_can_report,
    'role', v_role_key,
    'hub_ids', to_jsonb(v_hub_ids),
    'state_ids', to_jsonb(v_state_ids),
    'state_names', to_jsonb(v_state_names)
  );
END;
$$;

-- Never trust a caller-supplied scope marker.  The report RPC passes the
-- server-generated scope, while direct predicate calls remain fail-closed.
CREATE OR REPLACE FUNCTION public.mmp_entry_is_in_report_scope(
  p_report_kind text,
  p_state text,
  p_hub_office text,
  p_scope jsonb
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state_key text;
  v_hub_key text;
BEGIN
  IF public.current_user_is_super_admin() THEN
    RETURN true;
  END IF;

  IF p_report_kind = 'full_report' THEN
    RETURN true;
  END IF;

  IF p_report_kind NOT IN ('state_report', 'hub_report')
     OR p_state IS NULL
     OR public.mmp_scope_key(p_state) = '' THEN
    RETURN false;
  END IF;

  v_hub_key := public.mmp_resolve_entry_hub_key(p_state, p_hub_office);
  IF v_hub_key IS NULL THEN
    RETURN false;
  END IF;

  IF p_report_kind = 'hub_report' THEN
    RETURN EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(p_scope->'hub_ids') = 'array'
          THEN p_scope->'hub_ids' ELSE '[]'::jsonb END
      ) AS h(value)
      WHERE v_hub_key = public.mmp_canonical_hub_key(h.value)
    );
  END IF;

  v_state_key := public.mmp_scope_key(p_state);
  RETURN EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(p_scope->'state_ids') = 'array'
        THEN p_scope->'state_ids' ELSE '[]'::jsonb END
    ) AS s(value)
    WHERE v_state_key = public.mmp_scope_key(s.value)
  );
END;
$$;

-- The export assertion was introduced by the merged report-boundary work.
-- Point it at the same canonical predicate so an explicit deny cannot
-- accidentally block a Super Admin download.
CREATE OR REPLACE FUNCTION public.assert_report_export_permission(
  p_resource text,
  p_action text DEFAULT 'export'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_override boolean;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN;
  END IF;

  IF v_uid IS NULL OR NULLIF(btrim(p_resource), '') IS NULL
     OR p_action IS DISTINCT FROM 'export' THEN
    RAISE EXCEPTION 'Report export permission denied' USING ERRCODE = '42501';
  END IF;

  IF public.current_user_is_super_admin() THEN
    RETURN;
  END IF;

  SELECT o.is_granted INTO v_override
  FROM public.user_permission_overrides o
  WHERE o.user_id = v_uid
    AND o.resource = p_resource
    AND o.action = p_action
    AND (o.expires_at IS NULL OR o.expires_at > now())
  LIMIT 1;
  IF FOUND THEN
    IF v_override IS TRUE THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'Report export permission denied for %.%', p_resource, p_action
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r
      ON r.is_active = true
     AND (r.id = ur.role_id OR r.name = ur.role)
    JOIN public.permissions p ON p.role_id = r.id
    WHERE ur.user_id = v_uid
      AND p.resource = p_resource
      AND p.action = p_action
  ) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'Report export permission denied for %.%', p_resource, p_action
    USING ERRCODE = '42501';
END;
$$;

-- Replace the report RPC so all three report kinds use an organization-wide,
-- complete payload for Super Admins.  The body intentionally preserves the
-- established response contract and the ordinary-user scope behavior.
CREATE OR REPLACE FUNCTION public.get_mmp_report_payload(
  p_mmp_id uuid,
  p_report_kind text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_scope jsonb;
  v_profile profiles%ROWTYPE;
  v_profile_state text;
  v_location_state text;
  v_report_kind text := lower(btrim(coalesce(p_report_kind, '')));
  v_is_super_admin boolean := public.current_user_is_super_admin();
  v_is_scoped boolean;
  v_mmp jsonb;
  v_entries jsonb;
  v_entry_ids uuid[];
  v_profiles jsonb;
  v_down_payments jsonb;
  v_cost_submissions jsonb;
  v_activity_logs jsonb;
  v_state_ids text[];
  v_item jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF v_report_kind NOT IN ('full_report', 'state_report', 'hub_report') THEN
    RAISE EXCEPTION 'Invalid MMP report kind' USING ERRCODE = '22023';
  END IF;

  IF NOT v_is_super_admin
     AND NOT public.mmp_report_permission(v_report_kind) THEN
    RAISE EXCEPTION 'You do not have permission to open this MMP report'
      USING ERRCODE = '42501';
  END IF;

  v_scope := public.current_user_mmp_scope();
  -- A Super Admin gets the full payload regardless of the requested report
  -- presentation kind.  This prevents hub/state scope checks from filtering
  -- entries or hiding workflow/audit data.
  v_is_scoped := v_report_kind <> 'full_report' AND NOT v_is_super_admin;

  IF v_report_kind = 'full_report'
     AND NOT v_is_super_admin
     AND coalesce((v_scope->>'hub_scoped')::boolean, false) THEN
    RAISE EXCEPTION 'Your scope is not authorized for full MMP reports'
      USING ERRCODE = '42501';
  END IF;

  IF v_report_kind = 'hub_report'
     AND NOT v_is_super_admin
     AND coalesce(jsonb_array_length(v_scope->'hub_ids'), 0) = 0 THEN
    RAISE EXCEPTION 'No canonical hub assignment is available for this report'
      USING ERRCODE = '42501';
  END IF;

  IF NOT v_is_super_admin THEN
    SELECT * INTO v_profile
    FROM public.profiles
    WHERE id = auth.uid();
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Authenticated profile not found' USING ERRCODE = '42501';
    END IF;

    v_profile_state := NULLIF(public.mmp_scope_key(v_profile.state_id), '');
    v_location_state := NULLIF(public.mmp_scope_key(
      coalesce(v_profile.location->>'state_id', v_profile.location->>'state')
    ), '');
    IF v_report_kind = 'state_report'
       AND v_profile_state IS NOT NULL
       AND v_location_state IS NOT NULL
       AND v_profile_state <> v_location_state THEN
      RAISE EXCEPTION 'Caller state assignment is ambiguous'
        USING ERRCODE = '42501';
    END IF;

    IF v_report_kind = 'state_report' THEN
      v_state_ids := ARRAY[]::text[];
      SELECT coalesce(array_agg(DISTINCT public.mmp_scope_key(s.value)), ARRAY[]::text[])
        INTO v_state_ids
      FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(v_scope->'state_ids') = 'array'
          THEN v_scope->'state_ids' ELSE '[]'::jsonb END
      ) AS s(value)
      WHERE public.mmp_scope_key(s.value) <> '';

      IF coalesce(v_profile_state, v_location_state) IS NOT NULL THEN
        v_state_ids := array_append(v_state_ids, coalesce(v_profile_state, v_location_state));
      END IF;

      IF jsonb_typeof(v_profile.additional_roles) = 'array' THEN
        FOR v_item IN SELECT value FROM jsonb_array_elements(v_profile.additional_roles)
        LOOP
          IF jsonb_typeof(v_item) = 'object'
             AND NULLIF(public.mmp_scope_key(v_item->>'state_id'), '') IS NOT NULL THEN
            v_state_ids := array_append(v_state_ids, public.mmp_scope_key(v_item->>'state_id'));
          END IF;
        END LOOP;
      END IF;

      SELECT coalesce(array_agg(DISTINCT s), ARRAY[]::text[])
        INTO v_state_ids
      FROM unnest(v_state_ids) AS s
      WHERE s <> '';
      IF cardinality(v_state_ids) = 0 THEN
        RAISE EXCEPTION 'No unambiguous state assignment is available for this report'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  IF v_report_kind = 'state_report' AND NOT v_is_super_admin THEN
    v_scope := v_scope || jsonb_build_object('state_ids', to_jsonb(v_state_ids));
  END IF;

  SELECT jsonb_build_object(
    'id', f.id,
    'name', f.name,
    'mmp_id', f.mmp_id,
    'status', f.status,
    'cycle_status', f.cycle_status,
    'created_at', f.created_at,
    'uploaded_by', f.uploaded_by,
    'workflow', CASE WHEN v_is_scoped THEN '{}'::jsonb ELSE coalesce(f.workflow, '{}'::jsonb) END,
    'archivedby', CASE WHEN v_is_scoped THEN NULL ELSE f.archivedby END,
    'archivedat', CASE WHEN v_is_scoped THEN NULL ELSE f.archivedat END,
    'project', jsonb_build_object('name', p.name)
  )
  INTO v_mmp
  FROM public.mmp_files f
  LEFT JOIN public.projects p ON p.id = f.project_id
  WHERE f.id = p_mmp_id;

  IF v_mmp IS NULL THEN
    RAISE EXCEPTION 'MMP not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT
    coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.created_at, e.id), '[]'::jsonb),
    coalesce(array_agg(e.id), ARRAY[]::uuid[])
  INTO v_entries, v_entry_ids
  FROM public.mmp_site_entries e
  WHERE e.mmp_file_id = p_mmp_id
    AND public.mmp_entry_is_in_report_scope(v_report_kind, e.state, e.hub_office, v_scope);

  IF v_is_scoped AND cardinality(v_entry_ids) = 0 THEN
    RAISE EXCEPTION 'You do not have access to this MMP report' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_object_agg(
    p.id::text, coalesce(p.full_name, p.email, p.id::text)
  ), '{}'::jsonb)
  INTO v_profiles
  FROM public.profiles p
  WHERE p.id::text IN (
    SELECT DISTINCT coalesce(e.additional_data->>'assigned_to', e.forwarded_to_user_id::text)
    FROM public.mmp_site_entries e
    WHERE e.id = ANY(v_entry_ids)
    UNION
    SELECT DISTINCT e.visit_completed_by::text
    FROM public.mmp_site_entries e
    WHERE e.id = ANY(v_entry_ids)
  );

  SELECT coalesce(jsonb_agg(to_jsonb(dp) ORDER BY dp.created_at DESC), '[]'::jsonb)
  INTO v_down_payments
  FROM public.down_payment_requests dp
  WHERE dp.mmp_site_entry_id = ANY(v_entry_ids);

  SELECT coalesce(jsonb_agg(to_jsonb(cs) ORDER BY cs.created_at DESC), '[]'::jsonb)
  INTO v_cost_submissions
  FROM public.operational_cost_submissions cs
  LEFT JOIN public.profiles submitter ON submitter.id = cs.submitted_by
  LEFT JOIN public.mmp_site_entries linked_entry ON linked_entry.id = cs.mmp_site_entry_id
  WHERE (cs.mmp_file_id = p_mmp_id OR cs.mmp_id = p_mmp_id)
    AND (
      v_report_kind = 'full_report'
      OR public.mmp_entry_is_in_report_scope(
        v_report_kind, linked_entry.state, linked_entry.hub_office, v_scope
      )
      OR (
        linked_entry.id IS NULL
        AND public.mmp_entry_is_in_report_scope(
          v_report_kind,
          coalesce(submitter.state_id, submitter.location->>'state_id',
            submitter.location->>'state'),
          coalesce(cs.hub_id, submitter.hub_id,
            submitter.location->>'secondary_hub_id'),
          v_scope
        )
      )
    );

  IF v_is_scoped THEN
    v_activity_logs := '[]'::jsonb;
  ELSE
    SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.timestamp DESC), '[]'::jsonb)
      INTO v_activity_logs
    FROM (
      SELECT *
      FROM public.audit_logs
      WHERE entity_type IN ('mmp', 'mmp_file', 'mmp_files')
        AND entity_id::text = p_mmp_id::text
      ORDER BY timestamp DESC
      LIMIT 100
    ) a;
  END IF;

  RETURN jsonb_build_object(
    'mmp', v_mmp,
    'entries', v_entries,
    'profile_map', v_profiles,
    'down_payments', v_down_payments,
    'cost_submissions', v_cost_submissions,
    'activity_logs', v_activity_logs,
    'scope', v_scope
  );
END;
$$;

REVOKE ALL ON FUNCTION public.current_user_mmp_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mmp_report_permission(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mmp_entry_is_in_report_scope(text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_mmp_report_payload(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_mmp_report_payload(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_report_export_permission(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_mmp_scope() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mmp_report_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mmp_entry_is_in_report_scope(text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mmp_report_payload(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mmp_report_payload(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_report_export_permission(text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_mmp_report_payload(uuid, text) IS
  'Returns complete organization-wide payloads for Super Admins and server-scoped MMP full, state, or hub reports for other authorized users.';