-- FOM Direct (Bypass) Approval Fix
-- Problems:
--   1. SELECT policy + RPC treat FOM as hub-scoped (like a supervisor),
--      so FOM only sees submissions from their own hub.
--   2. The UPDATE policy only allows FOM to update tier1 fields when
--      tier1_status = 'pending', so FOM cannot approve tier2/tier3
--      (needed for the direct/bypass approval path).
-- Solutions:
--   1. Update SELECT policy → FOM sees ALL submissions (like admin).
--   2. Update RPC get_all_operational_cost_submissions() → returns ALL for FOM.
--   3. Add new UPDATE policy → FOM can update any non-paid submission
--      (enables the bypass approval path that fills all tiers at once).

-- ============================================================
-- Step 1: Update SELECT policy — FOM sees all submissions
-- ============================================================
DROP POLICY IF EXISTS "Supervisors can view hub operational cost submissions" ON operational_cost_submissions;

CREATE POLICY "Supervisors and FOM can view operational cost submissions"
  ON operational_cost_submissions FOR SELECT
  USING (
    submitted_by = auth.uid()
    OR
    -- FOM and Country Director: see all submissions regardless of hub
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('Field Operation Manager (FOM)', 'fom', 'Country Director', 'country_director')
    )
    OR
    -- Supervisors (not FOM): see submissions from their hub(s) only
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('hubSupervisor', 'supervisor')
      AND (
        p.hub_id = operational_cost_submissions.hub_id
        OR (p.location->>'secondary_hub_id') = operational_cost_submissions.hub_id
      )
    )
  );

-- ============================================================
-- Step 2: Update RPC — FOM gets ALL records (same as admin)
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

  -- Admins, Super Admins, FOM, and Country Director: see everything
  IF is_admin_or_super_admin()
     OR v_role IN ('Field Operation Manager (FOM)', 'fom', 'Country Director', 'country_director')
  THEN
    RETURN QUERY SELECT * FROM operational_cost_submissions ORDER BY created_at DESC;

  -- Supervisors (not FOM): see submissions from their hub(s)
  ELSIF v_role IN ('hubSupervisor', 'supervisor') THEN
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
-- Step 3: Add FOM bypass UPDATE policy
-- Allows FOM to update ALL tier fields on any non-paid submission.
-- The existing supervisor tier1 UPDATE policy stays in place for
-- normal flow. This is an additional PERMISSIVE policy — if either
-- policy matches, the update is allowed.
-- ============================================================
DROP POLICY IF EXISTS "FOM can bypass approve operational cost submissions" ON operational_cost_submissions;

CREATE POLICY "FOM can bypass approve operational cost submissions"
  ON operational_cost_submissions FOR UPDATE
  USING (
    status NOT IN ('paid', 'reconciled')
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('Field Operation Manager (FOM)', 'fom')
    )
  )
  WITH CHECK (
    wallet_transaction_id IS NULL
    AND paid_at IS NULL
  );

-- Done.
-- After applying:
-- • FOM can see ALL operational cost submissions (not just their hub).
-- • FOM can click "Direct Approve" to bypass the normal tier flow and
--   push a submission directly to Finance level with a single signature.
