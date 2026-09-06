-- Secure hub-scoped MMP lists and reports for supervisors/coordinators.
-- Management roles retain organization-wide report access.

CREATE OR REPLACE FUNCTION public.mmp_scope_key(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT regexp_replace(
    regexp_replace(lower(coalesce(p_value, '')), '\s+state$', ''),
    '[^a-z0-9]+', '', 'g'
  );
$$;

CREATE OR REPLACE FUNCTION public.mmp_canonical_hub_key(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE public.mmp_scope_key(p_value)
    WHEN 'countryoffice' THEN 'countryoffice'
    WHEN 'co' THEN 'countryoffice'
    WHEN 'khartoum' THEN 'countryoffice'
    WHEN 'khartoumhub' THEN 'countryoffice'
    WHEN 'portsudan' THEN 'portsudanhub'
    WHEN 'portsudanhub' THEN 'portsudanhub'
    WHEN 'redsea' THEN 'portsudanhub'
    WHEN 'redseahub' THEN 'portsudanhub'
    WHEN 'dongola' THEN 'dongolahub'
    WHEN 'dongolahub' THEN 'dongolahub'
    WHEN 'northernhub' THEN 'dongolahub'
    WHEN 'forchana' THEN 'forchanahub'
    WHEN 'farchana' THEN 'forchanahub'
    WHEN 'forchanahub' THEN 'forchanahub'
    WHEN 'zalingei' THEN 'forchanahub'
    WHEN 'zalingeihub' THEN 'forchanahub'
    WHEN 'westdarfur' THEN 'forchanahub'
    WHEN 'centraldarfur' THEN 'forchanahub'
    WHEN 'elgeneina' THEN 'forchanahub'
    WHEN 'geneina' THEN 'forchanahub'
    WHEN 'kassala' THEN 'kassalahub'
    WHEN 'kassalahub' THEN 'kassalahub'
    WHEN 'gedarif' THEN 'kassalahub'
    WHEN 'algadarif' THEN 'kassalahub'
    WHEN 'gadarif' THEN 'kassalahub'
    WHEN 'gezira' THEN 'kassalahub'
    WHEN 'algezira' THEN 'kassalahub'
    WHEN 'aljazira' THEN 'kassalahub'
    WHEN 'sennar' THEN 'kassalahub'
    WHEN 'bluenile' THEN 'kassalahub'
    WHEN 'kosti' THEN 'kostihub'
    WHEN 'kostihub' THEN 'kostihub'
    WHEN 'whitenile' THEN 'kostihub'
    WHEN 'rabak' THEN 'kostihub'
    WHEN 'northkordofan' THEN 'kostihub'
    WHEN 'southkordofan' THEN 'kostihub'
    WHEN 'westkordofan' THEN 'kostihub'
    WHEN 'northdarfur' THEN 'kostihub'
    WHEN 'southdarfur' THEN 'kostihub'
    WHEN 'eastdarfur' THEN 'kostihub'
    WHEN 'elfasher' THEN 'kostihub'
    WHEN 'fasher' THEN 'kostihub'
    WHEN 'nyala' THEN 'kostihub'
    WHEN 'eddaein' THEN 'kostihub'
    WHEN 'daein' THEN 'kostihub'
    WHEN 'elobeid' THEN 'kostihub'
    WHEN 'obeid' THEN 'kostihub'
    WHEN 'kadugli' THEN 'kostihub'
    ELSE public.mmp_scope_key(p_value)
  END;
$$;

CREATE OR REPLACE FUNCTION public.mmp_canonical_role_key(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE public.mmp_scope_key(p_value)
    WHEN 'fieldoperationmanager' THEN 'fom'
    WHEN 'fieldoperationmanagerfom' THEN 'fom'
    WHEN 'fieldopsmanager' THEN 'fom'
    WHEN 'hubsupervisor' THEN 'supervisor'
    ELSE public.mmp_scope_key(p_value)
  END;
$$;

CREATE OR REPLACE FUNCTION public.mmp_resolve_entry_hub_key(
  p_state text,
  p_hub_office text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  v_hub_key text := public.mmp_canonical_hub_key(p_hub_office);
  v_state_key text := public.mmp_scope_key(p_state);
  v_known_hubs constant text[] := ARRAY[
    'countryoffice', 'portsudanhub', 'dongolahub',
    'forchanahub', 'kassalahub', 'kostihub'
  ];
  v_known_states constant text[] := ARRAY[
    'khartoum', 'redsea', 'northern', 'rivernile',
    'westdarfur', 'centraldarfur', 'kassala', 'gedarif',
    'algezira', 'gezira', 'sennar', 'bluenile', 'whitenile',
    'northkordofan', 'southkordofan', 'westkordofan',
    'northdarfur', 'southdarfur', 'eastdarfur'
  ];
  v_hub_known boolean;
  v_state_known boolean;
  v_pair_valid boolean;
BEGIN
  v_hub_known := v_hub_key = ANY(v_known_hubs);
  v_state_known := v_state_key = ANY(v_known_states);

  -- A populated, recognized hub office is authoritative. If the independently
  -- resolved state conflicts with it, reject the malformed row from all hubs.
  -- Red Sea deliberately belongs to both Country Office and Port Sudan.
  IF v_hub_known THEN
    v_pair_valid := CASE v_state_key
      WHEN 'khartoum' THEN v_hub_key = 'countryoffice'
      WHEN 'redsea' THEN v_hub_key IN ('countryoffice', 'portsudanhub')
      WHEN 'northern' THEN v_hub_key = 'dongolahub'
      WHEN 'rivernile' THEN v_hub_key = 'dongolahub'
      WHEN 'westdarfur' THEN v_hub_key = 'forchanahub'
      WHEN 'centraldarfur' THEN v_hub_key = 'forchanahub'
      WHEN 'kassala' THEN v_hub_key = 'kassalahub'
      WHEN 'gedarif' THEN v_hub_key = 'kassalahub'
      WHEN 'algezira' THEN v_hub_key = 'kassalahub'
      WHEN 'gezira' THEN v_hub_key = 'kassalahub'
      WHEN 'sennar' THEN v_hub_key = 'kassalahub'
      WHEN 'bluenile' THEN v_hub_key = 'kassalahub'
      WHEN 'whitenile' THEN v_hub_key = 'kostihub'
      WHEN 'northkordofan' THEN v_hub_key = 'kostihub'
      WHEN 'southkordofan' THEN v_hub_key = 'kostihub'
      WHEN 'westkordofan' THEN v_hub_key = 'kostihub'
      WHEN 'northdarfur' THEN v_hub_key = 'kostihub'
      WHEN 'southdarfur' THEN v_hub_key = 'kostihub'
      WHEN 'eastdarfur' THEN v_hub_key = 'kostihub'
      ELSE true
    END;
    IF v_state_known AND NOT v_pair_valid THEN
      RETURN NULL;
    END IF;
    RETURN v_hub_key;
  END IF;

  -- Legacy rows without a recognized hub office may fall back only when the
  -- state maps to one hub. Ambiguous Red Sea rows fail closed.
  RETURN CASE v_state_key
    WHEN 'khartoum' THEN 'countryoffice'
    WHEN 'northern' THEN 'dongolahub'
    WHEN 'rivernile' THEN 'dongolahub'
    WHEN 'westdarfur' THEN 'forchanahub'
    WHEN 'centraldarfur' THEN 'forchanahub'
    WHEN 'kassala' THEN 'kassalahub'
    WHEN 'gedarif' THEN 'kassalahub'
    WHEN 'algezira' THEN 'kassalahub'
    WHEN 'gezira' THEN 'kassalahub'
    WHEN 'sennar' THEN 'kassalahub'
    WHEN 'bluenile' THEN 'kassalahub'
    WHEN 'whitenile' THEN 'kostihub'
    WHEN 'northkordofan' THEN 'kostihub'
    WHEN 'southkordofan' THEN 'kostihub'
    WHEN 'westkordofan' THEN 'kostihub'
    WHEN 'northdarfur' THEN 'kostihub'
    WHEN 'southdarfur' THEN 'kostihub'
    WHEN 'eastdarfur' THEN 'kostihub'
    ELSE NULL
  END;
END;
$$;

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
      IF public.mmp_canonical_role_key(v_item->>'role') = 'supervisor' AND v_item->>'hub_id' IS NOT NULL THEN
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
    'hub_scoped', v_requires_hub_scope,
    'can_report', v_can_report,
    'role', v_role_key,
    'hub_ids', to_jsonb(v_hub_ids),
    'state_ids', to_jsonb(v_state_ids),
    'state_names', to_jsonb(v_state_names)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mmp_entry_is_in_scope(
  p_state text,
  p_hub_office text,
  p_scope jsonb
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    NOT coalesce((p_scope->>'hub_scoped')::boolean, false)
    OR (
      public.mmp_resolve_entry_hub_key(p_state, p_hub_office) IS NOT NULL
      AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(p_scope->'hub_ids') AS hub(value)
      WHERE public.mmp_resolve_entry_hub_key(p_state, p_hub_office)
        = public.mmp_canonical_hub_key(hub.value)
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.get_accessible_mmp_ids()
RETURNS TABLE(mmp_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_scope jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  v_scope := public.current_user_mmp_scope();

  IF coalesce((v_scope->>'hub_scoped')::boolean, false) THEN
    RETURN QUERY
    SELECT DISTINCT e.mmp_file_id
    FROM public.mmp_site_entries e
    WHERE e.mmp_file_id IS NOT NULL
      AND public.mmp_entry_is_in_scope(e.state, e.hub_office, v_scope);
  ELSE
    RETURN QUERY SELECT f.id FROM public.mmp_files f;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_mmp_report_payload(p_mmp_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_scope jsonb;
  v_is_scoped boolean;
  v_mmp jsonb;
  v_entries jsonb;
  v_entry_ids uuid[];
  v_profiles jsonb;
  v_down_payments jsonb;
  v_cost_submissions jsonb;
  v_activity_logs jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  v_scope := public.current_user_mmp_scope();
  v_is_scoped := coalesce((v_scope->>'hub_scoped')::boolean, false);

  IF NOT coalesce((v_scope->>'can_report')::boolean, false) THEN
    RAISE EXCEPTION 'Your role is not authorized to open MMP reports' USING ERRCODE = '42501';
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
    AND public.mmp_entry_is_in_scope(e.state, e.hub_office, v_scope);

  IF v_is_scoped AND cardinality(v_entry_ids) = 0 THEN
    RAISE EXCEPTION 'You do not have access to this MMP report' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_object_agg(p.id::text, coalesce(p.full_name, p.email, p.id::text)), '{}'::jsonb)
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
  WHERE (cs.mmp_file_id = p_mmp_id OR cs.mmp_id = p_mmp_id)
    AND (
      NOT v_is_scoped
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(v_scope->'hub_ids') AS hub(value)
        WHERE public.mmp_canonical_hub_key(
          coalesce(
            cs.hub_id,
            submitter.hub_id,
            submitter.state_id,
            submitter.location->>'state_id',
            submitter.location->>'state'
          )
        ) = public.mmp_canonical_hub_key(hub.value)
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
REVOKE ALL ON FUNCTION public.get_accessible_mmp_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_mmp_report_payload(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_mmp_scope() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_accessible_mmp_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mmp_report_payload(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_mmp_report_payload(uuid) IS
  'Returns a complete MMP report payload restricted to the signed-in supervisor/coordinator assigned hubs.';

-- Existing broad authenticated SELECT policies remain available for other roles.
-- These restrictive policies are ANDed with them and prevent supervisors and
-- coordinators from bypassing hub scope through direct PostgREST table queries.
DROP POLICY IF EXISTS mmp_files_hub_scope_restrictive ON public.mmp_files;
CREATE POLICY mmp_files_hub_scope_restrictive
ON public.mmp_files
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  NOT coalesce((public.current_user_mmp_scope()->>'hub_scoped')::boolean, false)
  OR EXISTS (
    SELECT 1
    FROM public.mmp_site_entries e
    WHERE e.mmp_file_id = mmp_files.id
      AND public.mmp_entry_is_in_scope(e.state, e.hub_office, public.current_user_mmp_scope())
  )
);

DROP POLICY IF EXISTS mmp_site_entries_hub_scope_restrictive ON public.mmp_site_entries;
CREATE POLICY mmp_site_entries_hub_scope_restrictive
ON public.mmp_site_entries
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.mmp_entry_is_in_scope(state, hub_office, public.current_user_mmp_scope())
);

DROP POLICY IF EXISTS audit_logs_mmp_hub_scope_restrictive ON public.audit_logs;
CREATE POLICY audit_logs_mmp_hub_scope_restrictive
ON public.audit_logs
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  entity_type NOT IN ('mmp', 'mmp_file', 'mmp_files')
  OR NOT coalesce((public.current_user_mmp_scope()->>'hub_scoped')::boolean, false)
);