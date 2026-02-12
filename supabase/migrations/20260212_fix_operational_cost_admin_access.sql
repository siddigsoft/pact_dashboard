-- Fix: Super Admin / Admin access to ALL cost submission tables
-- Problem: RLS SELECT policies fail due to nested RLS checks on profiles/user_roles tables
-- Solution: 
--   1. Create SECURITY DEFINER helper functions to check admin roles (bypasses RLS recursion)
--   2. Create SECURITY DEFINER RPC function to fetch all operational costs for admins
--   3. Recreate SELECT policies using the helper functions for both tables
--   4. Add full UPDATE policy for Super Admins

-- ============================================================
-- Step 1: Helper function to check if user is admin/super admin
-- SECURITY DEFINER runs with table owner privileges, bypassing RLS
-- ============================================================
CREATE OR REPLACE FUNCTION is_admin_or_super_admin()
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
  has_admin_user_role BOOLEAN;
BEGIN
  SELECT role INTO user_role FROM profiles WHERE id = auth.uid();
  
  IF user_role IN (
    'admin', 'Admin', 'administrator',
    'SuperAdmin', 'superAdmin', 'super_admin', 'Super Admin',
    'CountryDirector', 'countryDirector', 'Country Director',
    'FinancialAdmin', 'finance_admin',
    'ICT', 'ict'
  ) THEN
    RETURN TRUE;
  END IF;
  
  SELECT EXISTS (
    SELECT 1 FROM super_admins WHERE user_id = auth.uid() AND is_active = true
  ) INTO has_admin_user_role;
  
  IF has_admin_user_role THEN
    RETURN TRUE;
  END IF;
  
  SELECT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND LOWER(role) IN ('admin', 'superadmin', 'financialadmin', 'ict')
  ) INTO has_admin_user_role;
  
  RETURN has_admin_user_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================
-- Step 2: Helper function to check if user is a supervisor for a given hub
-- ============================================================
CREATE OR REPLACE FUNCTION is_hub_supervisor(check_hub_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
  user_hub TEXT;
BEGIN
  SELECT role, hub_id INTO user_role, user_hub FROM profiles WHERE id = auth.uid();
  RETURN user_hub = check_hub_id AND user_role IN (
    'hubSupervisor', 'supervisor', 'Field Operation Manager (FOM)', 'fom'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================
-- Step 3: Helper function for checking submission eligibility
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
    'hubSupervisor', 'supervisor',
    'FinancialAdmin', 'finance_admin',
    'ICT', 'ict'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================
-- Step 4: RPC function for admin users to fetch ALL operational costs
-- This bypasses RLS entirely via SECURITY DEFINER
-- ============================================================
CREATE OR REPLACE FUNCTION get_all_operational_cost_submissions()
RETURNS SETOF operational_cost_submissions AS $$
BEGIN
  IF is_admin_or_super_admin() THEN
    RETURN QUERY SELECT * FROM operational_cost_submissions ORDER BY created_at DESC;
  ELSE
    RETURN QUERY SELECT * FROM operational_cost_submissions 
      WHERE submitted_by = auth.uid() ORDER BY created_at DESC;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================
-- Step 5: Fix operational_cost_submissions SELECT policies
-- ============================================================
DROP POLICY IF EXISTS "Users can view own operational cost submissions" ON operational_cost_submissions;
DROP POLICY IF EXISTS "Supervisors can view hub operational cost submissions" ON operational_cost_submissions;
DROP POLICY IF EXISTS "Admins can view all operational cost submissions" ON operational_cost_submissions;

CREATE POLICY "Users can view own operational cost submissions"
  ON operational_cost_submissions FOR SELECT
  USING (auth.uid() = submitted_by);

CREATE POLICY "Supervisors can view hub operational cost submissions"
  ON operational_cost_submissions FOR SELECT
  USING (is_hub_supervisor(hub_id));

CREATE POLICY "Admins can view all operational cost submissions"
  ON operational_cost_submissions FOR SELECT
  USING (is_admin_or_super_admin());

-- ============================================================
-- Step 6: Fix operational_cost_submissions INSERT policy
-- ============================================================
DROP POLICY IF EXISTS "Authorized roles can create operational cost submissions" ON operational_cost_submissions;

CREATE POLICY "Authorized roles can create operational cost submissions"
  ON operational_cost_submissions FOR INSERT
  WITH CHECK (
    auth.uid() = submitted_by
    AND can_submit_operational_costs()
  );

-- ============================================================
-- Step 7: Fix operational_cost_submissions UPDATE policies
-- ============================================================
DROP POLICY IF EXISTS "Super admins can update any operational cost submission" ON operational_cost_submissions;
DROP POLICY IF EXISTS "Users can update own pending operational cost submissions" ON operational_cost_submissions;
DROP POLICY IF EXISTS "Supervisors can update tier1 for hub submissions" ON operational_cost_submissions;
DROP POLICY IF EXISTS "Admins can update tier2 for all submissions" ON operational_cost_submissions;
DROP POLICY IF EXISTS "Finance can process payments" ON operational_cost_submissions;

CREATE POLICY "Super admins can update any operational cost submission"
  ON operational_cost_submissions FOR UPDATE
  USING (is_admin_or_super_admin());

CREATE POLICY "Users can update own pending operational cost submissions"
  ON operational_cost_submissions FOR UPDATE
  USING (
    auth.uid() = submitted_by
    AND status = 'pending'
    AND tier1_status = 'pending'
  )
  WITH CHECK (
    auth.uid() = submitted_by
    AND status = 'pending'
    AND tier1_status = 'pending'
  );

CREATE POLICY "Supervisors can update tier1 for hub submissions"
  ON operational_cost_submissions FOR UPDATE
  USING (
    tier1_status = 'pending'
    AND is_hub_supervisor(hub_id)
  )
  WITH CHECK (
    tier2_status = 'pending'
    AND tier2_approved_by IS NULL
    AND wallet_transaction_id IS NULL
    AND paid_at IS NULL
  );

CREATE POLICY "Admins can update tier2 for all submissions"
  ON operational_cost_submissions FOR UPDATE
  USING (
    tier1_status = 'approved'
    AND is_admin_or_super_admin()
  );

CREATE POLICY "Finance can process payments"
  ON operational_cost_submissions FOR UPDATE
  USING (
    status = 'approved'
    AND tier1_status = 'approved'
    AND tier2_status = 'approved'
    AND is_admin_or_super_admin()
  );

-- ============================================================
-- Step 8: Helper to check if user has any reviewer/approver role
-- Preserves existing access for FOM, Finance Admin, ICT, supervisors
-- ============================================================
CREATE OR REPLACE FUNCTION is_cost_reviewer()
RETURNS BOOLEAN AS $$
DECLARE
  profile_role TEXT;
  has_reviewer_user_role BOOLEAN;
BEGIN
  SELECT role INTO profile_role FROM profiles WHERE id = auth.uid();
  
  IF profile_role IN (
    'admin', 'Admin', 'administrator',
    'SuperAdmin', 'superAdmin', 'super_admin', 'Super Admin',
    'CountryDirector', 'countryDirector', 'Country Director',
    'FinancialAdmin', 'finance_admin',
    'Field Operation Manager (FOM)', 'fom', 'fieldOpManager',
    'hubSupervisor', 'supervisor',
    'ICT', 'ict'
  ) THEN
    RETURN TRUE;
  END IF;
  
  SELECT EXISTS (
    SELECT 1 FROM super_admins WHERE user_id = auth.uid() AND is_active = true
  ) INTO has_reviewer_user_role;
  
  IF has_reviewer_user_role THEN
    RETURN TRUE;
  END IF;
  
  SELECT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND LOWER(role) IN ('admin', 'superadmin', 'financialadmin', 'fom', 'ict', 'hubsupervisor', 'supervisor')
  ) INTO has_reviewer_user_role;
  
  RETURN has_reviewer_user_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================
-- Step 9: Fix site_visit_cost_submissions SELECT policies
-- Preserves access for FOM, Finance Admin, ICT (from original policies)
-- ============================================================
DROP POLICY IF EXISTS "Users can view own submissions" ON site_visit_cost_submissions;
DROP POLICY IF EXISTS "Admins can view all site visit cost submissions" ON site_visit_cost_submissions;

CREATE POLICY "Users can view own submissions"
  ON site_visit_cost_submissions FOR SELECT
  USING (
    submitted_by = auth.uid()
    OR is_cost_reviewer()
  );

-- ============================================================
-- Step 10: Fix site_visit_cost_submissions UPDATE policies
-- Preserves access for FOM, Finance Admin (from original policies)
-- ============================================================
DROP POLICY IF EXISTS "Admins can update submissions" ON site_visit_cost_submissions;

CREATE POLICY "Admins can update submissions"
  ON site_visit_cost_submissions FOR UPDATE
  USING (is_cost_reviewer());

-- ============================================================
-- Step 11: Fix cost_approval_history SELECT policies
-- Preserves access for FOM, Finance Admin, ICT (from original policies)
-- ============================================================
DROP POLICY IF EXISTS "Users can view relevant history" ON cost_approval_history;

CREATE POLICY "Users can view relevant history"
  ON cost_approval_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM site_visit_cost_submissions 
      WHERE id = submission_id 
      AND submitted_by = auth.uid()
    )
    OR is_cost_reviewer()
  );

-- ============================================================
-- Grant permissions
-- ============================================================
GRANT EXECUTE ON FUNCTION is_admin_or_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION is_hub_supervisor(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION can_submit_operational_costs() TO authenticated;
GRANT EXECUTE ON FUNCTION get_all_operational_cost_submissions() TO authenticated;
GRANT EXECUTE ON FUNCTION is_cost_reviewer() TO authenticated;

-- ============================================================
-- Done! Run this migration in Supabase SQL Editor.
-- It fixes RLS for both operational_cost_submissions AND site_visit_cost_submissions
-- Super Admins will now be able to see all submissions
-- ============================================================
