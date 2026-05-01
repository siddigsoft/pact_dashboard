-- Fix: 'Supervisor' (capital S) cannot submit operational costs
-- Root cause: can_submit_operational_costs() only listed 'hubSupervisor' and 'supervisor'
-- (lowercase), but profiles.role stores the value as 'Supervisor' (capital S).
-- Same gap exists in is_hub_supervisor() and the SELECT/UPDATE policies for supervisors.
-- This migration adds 'Supervisor' to every place that role-checks supervisor identity.

-- ============================================================
-- 1. Fix can_submit_operational_costs() — controls the INSERT RLS policy
-- ============================================================
CREATE OR REPLACE FUNCTION can_submit_operational_costs()
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role FROM profiles WHERE id = auth.uid();
  RETURN user_role IN (
    'Field Operation Manager (FOM)', 'fom', 'fieldOpManager',
    'Coordinator', 'coordinator',
    'CountryDirector', 'countryDirector', 'Country Director',
    'admin', 'Admin', 'administrator',
    'SuperAdmin', 'superAdmin', 'super_admin', 'Super Admin',
    'Supervisor', 'hubSupervisor', 'supervisor', 'hub_supervisor',
    'FinancialAdmin', 'finance_admin',
    'ICT', 'ict'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================
-- 2. Fix is_hub_supervisor() — used by SELECT and UPDATE policies
-- ============================================================
CREATE OR REPLACE FUNCTION is_hub_supervisor(check_hub_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
  user_hub  TEXT;
  secondary_hub TEXT;
BEGIN
  SELECT role, hub_id, location->>'secondary_hub_id'
    INTO user_role, user_hub, secondary_hub
  FROM profiles WHERE id = auth.uid();

  IF user_role NOT IN (
    'Supervisor', 'hubSupervisor', 'supervisor', 'hub_supervisor',
    'Field Operation Manager (FOM)', 'fom'
  ) THEN
    RETURN FALSE;
  END IF;

  RETURN user_hub = check_hub_id
      OR (secondary_hub IS NOT NULL AND secondary_hub = check_hub_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================
-- 3. Refresh the Supervisor SELECT policy to include capital-S Supervisor
-- ============================================================
DROP POLICY IF EXISTS "Supervisors can view hub operational cost submissions" ON operational_cost_submissions;

CREATE POLICY "Supervisors can view hub operational cost submissions"
  ON operational_cost_submissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN (
          'Supervisor', 'hubSupervisor', 'supervisor', 'hub_supervisor',
          'Field Operation Manager (FOM)', 'fom'
        )
        AND (
          p.hub_id = operational_cost_submissions.hub_id
          OR (p.location->>'secondary_hub_id') = operational_cost_submissions.hub_id
        )
    )
  );

-- ============================================================
-- 4. Refresh the Supervisor UPDATE (tier 1 approval) policy
-- ============================================================
DROP POLICY IF EXISTS "Supervisors can update tier1 for hub submissions" ON operational_cost_submissions;

CREATE POLICY "Supervisors can update tier1 for hub submissions"
  ON operational_cost_submissions FOR UPDATE
  USING (
    tier1_status = 'pending'
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN (
          'Supervisor', 'hubSupervisor', 'supervisor', 'hub_supervisor',
          'Field Operation Manager (FOM)', 'fom'
        )
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

-- ============================================================
-- 5. Fix get_all_operational_cost_submissions() RPC
--    Supervisors should see their hub's submissions, not just their own
-- ============================================================
CREATE OR REPLACE FUNCTION get_all_operational_cost_submissions()
RETURNS SETOF operational_cost_submissions AS $$
DECLARE
  v_hub_id        TEXT;
  v_secondary_hub TEXT;
  v_role          TEXT;
BEGIN
  SELECT hub_id, role, location->>'secondary_hub_id'
    INTO v_hub_id, v_role, v_secondary_hub
  FROM profiles WHERE id = auth.uid();

  IF is_admin_or_super_admin() THEN
    RETURN QUERY SELECT * FROM operational_cost_submissions ORDER BY created_at DESC;

  ELSIF v_role IN (
    'Supervisor', 'hubSupervisor', 'supervisor', 'hub_supervisor',
    'Field Operation Manager (FOM)', 'fom'
  ) THEN
    RETURN QUERY
      SELECT * FROM operational_cost_submissions
      WHERE hub_id = v_hub_id
         OR (v_secondary_hub IS NOT NULL AND hub_id = v_secondary_hub)
      ORDER BY created_at DESC;

  ELSE
    RETURN QUERY
      SELECT * FROM operational_cost_submissions
      WHERE submitted_by = auth.uid()
      ORDER BY created_at DESC;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION can_submit_operational_costs()             TO authenticated;
GRANT EXECUTE ON FUNCTION is_hub_supervisor(TEXT)                    TO authenticated;
GRANT EXECUTE ON FUNCTION get_all_operational_cost_submissions()     TO authenticated;

-- ============================================================
-- Done. Run this in the Supabase SQL Editor.
-- Supervisors (any casing) can now INSERT and the RLS no longer blocks them.
-- ============================================================
