-- Migration: Fix Super-Admin RLS Policy
-- Date: 2025-12-17
-- Description: Allow admins to create super_admins (not just existing super_admins)

-- Drop existing policies
DROP POLICY IF EXISTS "super_admins_manage" ON super_admins;
DROP POLICY IF EXISTS "super_admins_view" ON super_admins;

-- Create updated VIEW policy: Allow admins and super_admins to view
CREATE POLICY "super_admins_view" ON super_admins
  FOR SELECT
  USING (
    -- Allow if user is admin or superAdmin
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'Admin', 'superAdmin', 'SuperAdmin', 'super_admin')
    )
    OR
    -- Allow if user is already a super_admin
    EXISTS (
      SELECT 1 FROM super_admins
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Create updated MANAGE policy: Allow admins and super_admins to insert/update/delete
CREATE POLICY "super_admins_manage" ON super_admins
  FOR ALL
  USING (
    -- Allow if user is admin or superAdmin
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'Admin', 'superAdmin', 'SuperAdmin', 'super_admin')
    )
    OR
    -- Allow if user is already a super_admin
    EXISTS (
      SELECT 1 FROM super_admins
      WHERE user_id = auth.uid() AND is_active = true
    )
  )
  WITH CHECK (
    -- Same check for inserts/updates
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

-- Log the migration
DO $$
BEGIN
  RAISE NOTICE '✅ Fixed super_admins RLS policy - Admins can now create super_admins';
END $$;
