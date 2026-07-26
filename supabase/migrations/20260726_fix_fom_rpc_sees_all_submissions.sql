-- ============================================================
-- Fix: FOM (Field Operation Manager) was incorrectly merged into
-- the Supervisor hub-filter branch in migration 20260501.
-- FOM has no hub_id, so hub_id = NULL returns zero rows.
-- Restores FOM (and Country Director) to the "see all" branch.
-- ============================================================

CREATE OR REPLACE FUNCTION get_all_operational_cost_submissions()
RETURNS SETOF operational_cost_submissions AS $$
DECLARE
  v_hub_id        TEXT;
  v_secondary_hub TEXT;
  v_role          TEXT;
  v_clean_role    TEXT;
BEGIN
  SELECT hub_id, role, location->>'secondary_hub_id'
    INTO v_hub_id, v_role, v_secondary_hub
  FROM profiles WHERE id = auth.uid();

  -- Normalised role for loose matching
  v_clean_role := lower(replace(replace(coalesce(v_role, ''), ' ', ''), '_', ''));

  -- Admins, Super Admins, FOM, Country Director → see everything
  IF is_admin_or_super_admin()
     OR v_clean_role IN ('fom', 'fieldoperationmanager', 'fieldoperationsmanager',
                         'countrydirector', 'country director')
     OR v_role IN ('Field Operation Manager (FOM)', 'fom',
                   'Country Director', 'country_director')
  THEN
    RETURN QUERY
      SELECT * FROM operational_cost_submissions ORDER BY created_at DESC;

  -- Hub Supervisors → see their assigned hub(s) only
  ELSIF v_clean_role IN ('supervisor', 'hubsupervisor', 'hubsupervisors')
     OR v_role IN ('Supervisor', 'hubSupervisor', 'hub_supervisor',
                   'supervisor', 'HubSupervisor')
  THEN
    RETURN QUERY
      SELECT * FROM operational_cost_submissions
      WHERE hub_id = v_hub_id
         OR (v_secondary_hub IS NOT NULL AND hub_id = v_secondary_hub)
      ORDER BY created_at DESC;

  -- Everyone else → own submissions only
  ELSE
    RETURN QUERY
      SELECT * FROM operational_cost_submissions
      WHERE submitted_by = auth.uid()
      ORDER BY created_at DESC;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_all_operational_cost_submissions() TO authenticated;
