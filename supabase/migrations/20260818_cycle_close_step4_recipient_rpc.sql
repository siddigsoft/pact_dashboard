-- Resolve Step 4 Cycle Close recipients (Coordinator/Supervisor) server-side.
-- Scope is derived from affected mmp_site_entries rows:
--   - Coordinators in matching states
--   - Supervisors in matching hubs or hub states
--   - Additional supervisor roles (profiles.additional_roles) with hub_id

CREATE OR REPLACE FUNCTION public.get_cycle_close_step4_recipients(
  p_site_ids uuid[]
)
RETURNS TABLE(user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site_ids uuid[] := coalesce(p_site_ids, ARRAY[]::uuid[]);
BEGIN
  IF cardinality(v_site_ids) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH target_sites AS (
    SELECT
      e.id,
      regexp_replace(lower(coalesce(e.state, '')), '[^a-z0-9]', '', 'g') AS state_norm,
      regexp_replace(lower(coalesce(e.hub_office, '')), '[^a-z0-9]', '', 'g') AS hub_norm
    FROM public.mmp_site_entries e
    WHERE e.id = ANY(v_site_ids)
  ),
  target_scope AS (
    SELECT
      ARRAY(
        SELECT DISTINCT regexp_replace(ts.state_norm, 'state$', '')
        FROM target_sites ts
        WHERE ts.state_norm <> ''
      ) AS states,
      ARRAY(
        SELECT DISTINCT ts.hub_norm
        FROM target_sites ts
        WHERE ts.hub_norm <> ''
      ) AS hubs
  ),
  approved_profiles AS (
    SELECT
      p.id,
      regexp_replace(lower(coalesce(p.role, '')), '[^a-z0-9]', '', 'g') AS role_norm,
      regexp_replace(regexp_replace(lower(coalesce(p.state_id, '')), '[^a-z0-9]', '', 'g'), 'state$', '') AS state_norm,
      regexp_replace(lower(coalesce(p.hub_id, '')), '[^a-z0-9]', '', 'g') AS hub_norm,
      p.additional_roles
    FROM public.profiles p
    WHERE coalesce(lower(p.status), '') = 'approved'
  ),
  additional_supervisor_hubs AS (
    SELECT
      p.id AS profile_id,
      regexp_replace(lower(coalesce(r->>'hub_id', '')), '[^a-z0-9]', '', 'g') AS hub_norm
    FROM approved_profiles p
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(p.additional_roles) = 'array' THEN p.additional_roles
        ELSE '[]'::jsonb
      END
    ) AS r
    WHERE regexp_replace(lower(coalesce(r->>'role', '')), '[^a-z0-9]', '', 'g') IN ('supervisor', 'hubsupervisor')
  ),
  hub_to_state AS (
    SELECT
      regexp_replace(lower(coalesce(hs.hub_id, '')), '[^a-z0-9]', '', 'g') AS hub_norm,
      regexp_replace(regexp_replace(lower(coalesce(hs.state_id, '')), '[^a-z0-9]', '', 'g'), 'state$', '') AS state_norm
    FROM public.hub_states hs
  )
  SELECT DISTINCT p.id
  FROM approved_profiles p
  CROSS JOIN target_scope t
  LEFT JOIN additional_supervisor_hubs ash ON ash.profile_id = p.id
  WHERE (
    -- Coordinators by state
    p.role_norm = 'coordinator'
    AND p.state_norm <> ''
    AND p.state_norm = ANY(t.states)
  )
  OR (
    -- Supervisors by direct hub/state
    p.role_norm IN ('supervisor', 'hubsupervisor')
    AND (
      (p.hub_norm <> '' AND p.hub_norm = ANY(t.hubs))
      OR (p.state_norm <> '' AND p.state_norm = ANY(t.states))
      OR EXISTS (
        SELECT 1
        FROM hub_to_state h2s
        WHERE h2s.hub_norm = p.hub_norm
          AND h2s.state_norm = ANY(t.states)
      )
    )
  )
  OR (
    -- Supervisors via additional_roles[] hub assignment
    ash.hub_norm <> ''
    AND (
      ash.hub_norm = ANY(t.hubs)
      OR EXISTS (
        SELECT 1
        FROM hub_to_state h2s
        WHERE h2s.hub_norm = ash.hub_norm
          AND h2s.state_norm = ANY(t.states)
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_cycle_close_step4_recipients(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_cycle_close_step4_recipients(uuid[]) TO authenticated;
