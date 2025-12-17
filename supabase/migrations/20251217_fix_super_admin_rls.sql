-- Migration: Fix Super-Admin RLS Policy
-- Date: 2025-12-17
-- Description: Only super_admins can manage super_admins. First one must be created via SQL.

-- Drop existing policies
DROP POLICY IF EXISTS "super_admins_manage" ON super_admins;
DROP POLICY IF EXISTS "super_admins_view" ON super_admins;

-- VIEW policy: Only super_admins and admins can view the list
CREATE POLICY "super_admins_view" ON super_admins
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'Admin', 'superAdmin', 'SuperAdmin', 'super_admin')
    )
    OR
    EXISTS (
      SELECT 1 FROM super_admins
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- MANAGE policy: ONLY existing super_admins can insert/update/delete
CREATE POLICY "super_admins_manage" ON super_admins
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM super_admins
      WHERE user_id = auth.uid() AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM super_admins
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Log the migration
DO $$
BEGIN
  RAISE NOTICE '✅ Super_admins RLS policy: Only super_admins can manage super_admins';
  RAISE NOTICE '⚠️  To create the FIRST super admin, run the INSERT query below in SQL Editor';
END $$;

-- ============================================================================
-- TO CREATE THE FIRST SUPER ADMIN, RUN THIS QUERY (replace with actual user_id):
-- ============================================================================
-- INSERT INTO super_admins (user_id, appointment_reason, is_active)
-- SELECT id, 'Initial system super admin', true
-- FROM profiles
-- WHERE email = 'siddigsoft123@gmail.com'
-- LIMIT 1;
-- ============================================================================
