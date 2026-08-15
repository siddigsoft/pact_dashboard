-- Fix: get_all_operational_cost_submissions() and the supervisor RLS SELECT policy
-- both read secondary_hub_id only from location JSONB, ignoring the dedicated
-- profiles.secondary_hub_id column added in 20260224_add_secondary_hub_id.sql.
-- Also: supervisors should ALWAYS see their OWN submissions (submitted_by = auth.uid()),
-- regardless of which hub they are currently assigned to — so hub reassignments
-- cannot cause a supervisor's own past submissions to disappear.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Update the RPC to read from column first, JSONB as fallback
--    Also include submitted_by = auth.uid() so own submissions are always visible
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_all_operational_cost_submissions()
RETURNS SETOF operational_cost_submissions AS $$
DECLARE
  v_hub_id        TEXT;
  v_secondary_hub TEXT;
  v_role          TEXT;
BEGIN
  -- Read both hubs: column takes priority, JSONB is fallback for legacy rows
  SELECT
    hub_id,
    role,
    COALESCE(secondary_hub_id, location->>'secondary_hub_id')
  INTO v_hub_id, v_role, v_secondary_hub
  FROM profiles WHERE id = auth.uid();

  -- Admins and Super Admins: see everything
  IF is_admin_or_super_admin() THEN
    RETURN QUERY SELECT * FROM operational_cost_submissions ORDER BY created_at DESC;

  -- Supervisors and FOM: see submissions from their hub(s) PLUS their own submissions
  ELSIF v_role IN (
    'Supervisor', 'hubSupervisor', 'supervisor', 'hub_supervisor',
    'Field Operation Manager (FOM)', 'fom'
  ) THEN
    RETURN QUERY
      SELECT * FROM operational_cost_submissions
      WHERE submitted_by = auth.uid()           -- always include own submissions
         OR hub_id = v_hub_id                   -- primary hub team submissions
         OR (v_secondary_hub IS NOT NULL AND hub_id = v_secondary_hub) -- secondary hub
      ORDER BY created_at DESC;

  -- Everyone else: see only their own submissions
  ELSE
    RETURN QUERY
      SELECT * FROM operational_cost_submissions
      WHERE submitted_by = auth.uid()
      ORDER BY created_at DESC;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_all_operational_cost_submissions() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Fix the RLS SELECT policy to match (column + JSONB + own submissions)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Supervisors can view hub operational cost submissions" ON operational_cost_submissions;

CREATE POLICY "Supervisors can view hub operational cost submissions"
  ON operational_cost_submissions FOR SELECT
  USING (
    -- Own submissions: always visible
    submitted_by = (SELECT auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('hubSupervisor', 'supervisor', 'hub_supervisor',
                     'Field Operation Manager (FOM)', 'fom')
      AND (
        -- Primary hub match
        p.hub_id = operational_cost_submissions.hub_id
        OR
        -- Secondary hub: check dedicated column first, then JSONB fallback
        COALESCE(p.secondary_hub_id, p.location->>'secondary_hub_id')
          = operational_cost_submissions.hub_id
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Fix Ahmed Abbas's hub assignment:
--    Primary = Country Office (where his 35 submissions live)
--    Secondary = Dongola Hub  (the additional hub he supervises)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE profiles
SET
  hub_id           = 'country-office',
  secondary_hub_id = 'dongola-hub'
WHERE LOWER(full_name) LIKE '%ahmed%abbas%'
  AND role IN ('supervisor', 'hubSupervisor', 'Supervisor');

-- Verify:
SELECT id, full_name, hub_id, secondary_hub_id
FROM profiles
WHERE LOWER(full_name) LIKE '%ahmed%abbas%';
