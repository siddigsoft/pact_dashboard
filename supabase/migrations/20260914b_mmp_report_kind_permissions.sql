-- Server-authoritative MMP report permissions and independent report scopes.
--
-- This supersedes the one-kind (hub-scoped) implementation in
-- 20260906_mmp_supervisor_hub_scoped_reports.sql.  The one argument RPC is
-- retained as a compatibility wrapper and is deliberately equivalent to a
-- full_report request.

-- Older installations may still have the narrow action constraint from the
-- original role-management migration.  Keep the existing permission model,
-- but allow the three independently grantable MMP report actions.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.permissions'::regclass
      AND conname = 'permissions_action_check'
  ) THEN
    ALTER TABLE public.permissions DROP CONSTRAINT permissions_action_check;
  END IF;
  ALTER TABLE public.permissions
    ADD CONSTRAINT permissions_action_check CHECK (action = ANY (ARRAY[
      'create','read','update','delete','approve','assign','archive','restore',
      'override','export','submit','full_report','state_report','hub_report'
    ]::text[]));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Preserve existing mmp:export grants while making each report kind
-- independently revocable.  No new authorization table is introduced.
INSERT INTO public.permissions (role_id, resource, action)
SELECT DISTINCT p.role_id, 'mmp', report_action.action
FROM public.permissions p
CROSS JOIN (VALUES ('full_report'), ('state_report'), ('hub_report'))
  AS report_action(action)
WHERE p.resource = 'mmp'
  AND p.action = 'export'
ON CONFLICT (role_id, resource, action) DO NOTHING;

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

  -- A live user override, including an explicit false override, always wins
  -- over role permissions.  The unique key on the table makes this scalar.
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

-- This predicate intentionally calls the existing canonical entry resolver.
-- State reports require both a recognized state and a valid state/hub pair;
-- malformed or ambiguous rows are never included.
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
  v_is_scoped boolean;
  v_mmp jsonb;
  v_entries jsonb;
  v_entry_ids uuid[];
  v_profiles jsonb;
  v_down_payments jsonb;
  v_cost_submissions jsonb;
  v_activity_logs jsonb;
  v_hub_ids text[];
  v_state_ids text[];
  v_item jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF v_report_kind NOT IN ('full_report', 'state_report', 'hub_report') THEN
    RAISE EXCEPTION 'Invalid MMP report kind' USING ERRCODE = '22023';
  END IF;

  IF NOT public.mmp_report_permission(v_report_kind) THEN
    RAISE EXCEPTION 'You do not have permission to open this MMP report'
      USING ERRCODE = '42501';
  END IF;

  v_scope := public.current_user_mmp_scope();
  v_is_scoped := v_report_kind <> 'full_report';

  -- Full reports are only for the existing organization-wide report-eligible
  -- scope.  A permission override cannot turn a hub-scoped assignment into a
  -- full organization report.
  IF v_report_kind = 'full_report'
     AND coalesce((v_scope->>'hub_scoped')::boolean, false) THEN
    RAISE EXCEPTION 'Your scope is not authorized for full MMP reports'
      USING ERRCODE = '42501';
  END IF;

  IF v_report_kind = 'hub_report'
     AND coalesce(jsonb_array_length(v_scope->'hub_ids'), 0) = 0 THEN
    RAISE EXCEPTION 'No canonical hub assignment is available for this report'
      USING ERRCODE = '42501';
  END IF;

  -- State scope is assembled from the existing hub-to-state mapping plus the
  -- caller's own unambiguous profile state.  A conflicting profile/location
  -- state fails closed rather than silently choosing one.
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

    -- Additional role objects can carry an explicitly assigned state.
    IF jsonb_typeof(v_profile.additional_roles) = 'array' THEN
      FOR v_item IN SELECT value FROM jsonb_array_elements(v_profile.additional_roles)
      LOOP
        IF jsonb_typeof(v_item) = 'object'
           AND NULLIF(public.mmp_scope_key(v_item->>'state_id'), '') IS NOT NULL THEN
          v_state_ids := array_append(
            v_state_ids, public.mmp_scope_key(v_item->>'state_id')
          );
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

  -- Keep the established scope shape in the response.  The report kind is
  -- intentionally not added to the payload so existing consumers retain the
  -- exact response contract.
  IF v_report_kind = 'state_report' THEN
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
    AND public.mmp_entry_is_in_report_scope(
      v_report_kind, e.state, e.hub_office, v_scope
    );

  IF v_is_scoped AND cardinality(v_entry_ids) = 0 THEN
    RAISE EXCEPTION 'You do not have access to this MMP report'
      USING ERRCODE = '42501';
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

  -- Cost rows must be tied to an authorized entry, or have an independently
  -- resolvable canonical location.  In particular, a broad mmp_file_id alone
  -- never grants a scoped report access to a row.
  SELECT coalesce(jsonb_agg(to_jsonb(cs) ORDER BY cs.created_at DESC), '[]'::jsonb)
  INTO v_cost_submissions
  FROM public.operational_cost_submissions cs
  LEFT JOIN public.profiles submitter ON submitter.id = cs.submitted_by
  LEFT JOIN public.mmp_site_entries linked_entry
    ON linked_entry.id = cs.mmp_site_entry_id
  WHERE (cs.mmp_file_id = p_mmp_id OR cs.mmp_id = p_mmp_id)
    AND (
      v_report_kind = 'full_report'
      OR EXISTS (
        SELECT 1
        FROM public.mmp_site_entries ce
        WHERE ce.id = cs.mmp_site_entry_id
          AND public.mmp_entry_is_in_report_scope(
            v_report_kind, ce.state, ce.hub_office, v_scope
          )
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

-- Compatibility for existing callers.  This is intentionally a wrapper,
-- rather than a second implementation that could drift in authorization.
CREATE OR REPLACE FUNCTION public.get_mmp_report_payload(p_mmp_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.get_mmp_report_payload(p_mmp_id, 'full_report');
$$;

REVOKE ALL ON FUNCTION public.mmp_report_permission(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mmp_entry_is_in_report_scope(text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_mmp_report_payload(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_mmp_report_payload(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mmp_report_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mmp_entry_is_in_report_scope(text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mmp_report_payload(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mmp_report_payload(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.get_mmp_report_payload(uuid, text) IS
  'Returns the requested server-authorized MMP full, state, or hub report payload.';
COMMENT ON FUNCTION public.get_mmp_report_payload(uuid) IS
  'Compatibility wrapper for get_mmp_report_payload(uuid, full_report).';