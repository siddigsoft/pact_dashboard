-- Fix: Allow supervisors with a secondary hub to see cost submissions from BOTH hubs
-- Problem: RLS SELECT policy only checks p.hub_id (primary hub), ignoring secondary hub
--          stored in profiles.location->>'secondary_hub_id'
--          Also: get_all_operational_cost_submissions() RPC returns only own submissions
--          for non-admins, meaning supervisors couldn't use it at all.
-- Solution:
--   1. Drop and recreate the supervisor SELECT policy to check primary AND secondary hub
--   2. Recreate the RPC to return hub submissions for supervisors

-- ============================================================
-- Step 1: Update the Supervisor SELECT policy to include secondary hub
-- ============================================================
DROP POLICY IF EXISTS "Supervisors can view hub operational cost submissions" ON operational_cost_submissions;

CREATE POLICY "Supervisors can view hub operational cost submissions"
  ON operational_cost_submissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('hubSupervisor', 'supervisor', 'Field Operation Manager (FOM)', 'fom')
      AND (
        -- Primary hub match
        p.hub_id = operational_cost_submissions.hub_id
        OR
        -- Secondary hub match (stored in location JSONB)
        (p.location->>'secondary_hub_id') = operational_cost_submissions.hub_id
      )
    )
  );

-- ============================================================
-- Step 2: Update the RPC to return submissions for supervisor's hubs
-- SECURITY DEFINER bypasses RLS so the WHERE clause is the access control
-- ============================================================
CREATE OR REPLACE FUNCTION get_all_operational_cost_submissions()
RETURNS SETOF operational_cost_submissions AS $$
DECLARE
  v_hub_id TEXT;
  v_secondary_hub_id TEXT;
  v_role TEXT;
BEGIN
  SELECT hub_id, role, location->>'secondary_hub_id'
  INTO v_hub_id, v_role, v_secondary_hub_id
  FROM profiles WHERE id = auth.uid();

  -- Admins and Super Admins: see everything
  IF is_admin_or_super_admin() THEN
    RETURN QUERY SELECT * FROM operational_cost_submissions ORDER BY created_at DESC;

  -- Supervisors and FOM: see submissions from their hub(s)
  ELSIF v_role IN ('hubSupervisor', 'supervisor', 'Field Operation Manager (FOM)', 'fom') THEN
    RETURN QUERY
      SELECT * FROM operational_cost_submissions
      WHERE hub_id = v_hub_id
         OR (v_secondary_hub_id IS NOT NULL AND hub_id = v_secondary_hub_id)
      ORDER BY created_at DESC;

  -- Everyone else: see only their own submissions
  ELSE
    RETURN QUERY SELECT * FROM operational_cost_submissions
      WHERE submitted_by = auth.uid() ORDER BY created_at DESC;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_all_operational_cost_submissions() TO authenticated;

-- ============================================================
-- Also update the Supervisor UPDATE policy to allow updates on secondary hub
-- ============================================================
DROP POLICY IF EXISTS "Supervisors can update tier1 for hub submissions" ON operational_cost_submissions;

CREATE POLICY "Supervisors can update tier1 for hub submissions"
  ON operational_cost_submissions FOR UPDATE
  USING (
    tier1_status = 'pending'
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('hubSupervisor', 'supervisor', 'Field Operation Manager (FOM)', 'fom')
      AND (
        p.hub_id = operational_cost_submissions.hub_id
        OR (p.location->>'secondary_hub_id') = operational_cost_submissions.hub_id
      )
    )
  )
  WITH CHECK (
    tier2_status = 'pending'
    AND tier2_approved_by IS NULL
    AND wallet_transaction_id IS NULL
    AND paid_at IS NULL
  );

-- Done. Run this in Supabase SQL Editor.
-- After running, supervisors with a secondary hub will see cost submissions from BOTH hubs.
