-- Fix: Tier 2 approval fails silently because existing RLS UPDATE policies
-- are too restrictive for admin roles to perform Tier 2 approvals.
-- 
-- Root cause: The "Admins can update tier2" policy requires tier1_status='approved'
-- but uses an exact role match list that may not cover all role string variants.
-- Also, admins who also act as Tier 1 approvers are blocked by the Supervisor policy.
--
-- Solution: Add scoped admin policies for both Tier 1 and Tier 2 approval actions,
-- with WITH CHECK constraints to enforce valid state transitions.

-- Policy 1: Allow admins to perform Tier 1 approval
-- Only applies when submission is pending Tier 1 review
DROP POLICY IF EXISTS "Admins can approve tier1 for operational costs" ON operational_cost_submissions;

CREATE POLICY "Admins can approve tier1 for operational costs"
  ON operational_cost_submissions FOR UPDATE
  USING (
    tier1_status = 'pending'
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN (
        'admin', 'Admin',
        'SuperAdmin', 'superAdmin', 'super_admin', 'Super Admin',
        'CountryDirector', 'countryDirector', 'Country Director'
      )
    )
  )
  WITH CHECK (
    tier1_status IN ('approved', 'rejected')
  );

-- Policy 2: Replace the existing "Admins can update tier2" policy with a broader role list
-- Only applies when Tier 1 is already approved
DROP POLICY IF EXISTS "Admins can update tier2 for all submissions" ON operational_cost_submissions;

CREATE POLICY "Admins can update tier2 for all submissions"
  ON operational_cost_submissions FOR UPDATE
  USING (
    tier1_status = 'approved'
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN (
        'admin', 'Admin',
        'SuperAdmin', 'superAdmin', 'super_admin', 'Super Admin',
        'CountryDirector', 'countryDirector', 'Country Director'
      )
    )
  )
  WITH CHECK (
    tier1_status = 'approved'
  );

-- Policy 3: Allow admins to recall/cancel approved submissions (admin recall feature)
DROP POLICY IF EXISTS "Admins can recall operational cost submissions" ON operational_cost_submissions;

CREATE POLICY "Admins can recall operational cost submissions"
  ON operational_cost_submissions FOR UPDATE
  USING (
    status IN ('approved', 'under_review')
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN (
        'admin', 'Admin',
        'SuperAdmin', 'superAdmin', 'super_admin', 'Super Admin'
      )
    )
  )
  WITH CHECK (
    status IN ('pending', 'cancelled', 'rejected')
  );

-- Policy 4: Allow submitters to delete their own pending submissions
DROP POLICY IF EXISTS "Users can delete own pending operational cost submissions" ON operational_cost_submissions;

CREATE POLICY "Users can delete own pending operational cost submissions"
  ON operational_cost_submissions FOR DELETE
  USING (
    auth.uid() = submitted_by
    AND status = 'pending'
    AND tier1_status = 'pending'
  );

-- Policy 5: Allow admins to delete submissions
DROP POLICY IF EXISTS "Admins can delete operational cost submissions" ON operational_cost_submissions;

CREATE POLICY "Admins can delete operational cost submissions"
  ON operational_cost_submissions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN (
        'admin', 'Admin',
        'SuperAdmin', 'superAdmin', 'super_admin', 'Super Admin'
      )
    )
  );
