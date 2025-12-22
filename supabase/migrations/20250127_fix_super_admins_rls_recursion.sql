-- Migration: Fix infinite recursion in super_admins RLS policies
-- Description: Replaces self-referential RLS policies with SECURITY DEFINER function
-- Date: 2025-01-27

-- Drop existing function if it exists (may have different parameter name)
-- PostgreSQL doesn't allow changing parameter names with CREATE OR REPLACE
-- So we must drop first, then create with new parameter name
DO $$ 
BEGIN
  -- Drop function with UUID parameter (regardless of parameter name)
  DROP FUNCTION IF EXISTS public.is_super_admin(UUID);
  -- Drop function with no parameters if it exists
  DROP FUNCTION IF EXISTS public.is_super_admin();
EXCEPTION
  WHEN OTHERS THEN
    -- Ignore errors if function doesn't exist
    NULL;
END $$;

-- Create a SECURITY DEFINER function to check if a user is a super admin
-- This function bypasses RLS, preventing infinite recursion
-- Supports both: is_super_admin() and is_super_admin(user_id)
CREATE OR REPLACE FUNCTION public.is_super_admin(check_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.super_admins
    WHERE user_id = check_user_id
    AND is_active = true
  );
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.is_super_admin(UUID) TO authenticated;

-- Drop the existing recursive policies
DROP POLICY IF EXISTS "super_admins_view" ON public.super_admins;
DROP POLICY IF EXISTS "super_admins_view_own" ON public.super_admins;
DROP POLICY IF EXISTS "super_admins_view_admin" ON public.super_admins;
DROP POLICY IF EXISTS "super_admins_manage" ON public.super_admins;

-- Create new policies that use the function instead of self-referential queries
-- SELECT: Users can see their own super_admin record, or if they are a super admin, they can see all
CREATE POLICY "super_admins_select" ON public.super_admins
  FOR SELECT USING (
    user_id = auth.uid() OR public.is_super_admin()
  );

-- INSERT: Only existing super-admins can create new super-admin records
CREATE POLICY "super_admins_insert" ON public.super_admins
  FOR INSERT WITH CHECK (
    public.is_super_admin()
  );

-- UPDATE: Users can update their own record, or super-admins can update any record
CREATE POLICY "super_admins_update" ON public.super_admins
  FOR UPDATE USING (
    user_id = auth.uid() OR public.is_super_admin()
  ) WITH CHECK (
    user_id = auth.uid() OR public.is_super_admin()
  );

-- DELETE: Only super-admins can delete records (including their own)
CREATE POLICY "super_admins_delete" ON public.super_admins
  FOR DELETE USING (
    public.is_super_admin()
  );

-- Add comments
COMMENT ON FUNCTION public.is_super_admin(UUID) IS 
'Check if a user is an active super admin. Uses SECURITY DEFINER to bypass RLS and prevent infinite recursion.';

COMMENT ON POLICY "super_admins_select" ON public.super_admins IS 
'Users can view their own super_admin record, or super-admins can view all records';

COMMENT ON POLICY "super_admins_insert" ON public.super_admins IS 
'Only existing super-admins can create new super-admin records';

COMMENT ON POLICY "super_admins_update" ON public.super_admins IS 
'Users can update their own record, or super-admins can update any record';

COMMENT ON POLICY "super_admins_delete" ON public.super_admins IS 
'Only super-admins can delete super-admin records';

-- ============================================================================
-- Also fix deletion_audit_log policies that reference super_admins
-- ============================================================================

-- Drop existing policies that might have recursion issues
DROP POLICY IF EXISTS "deletion_audit_log_super_admin_create" ON public.deletion_audit_log;
DROP POLICY IF EXISTS "deletion_audit_log_view" ON public.deletion_audit_log;

-- Recreate deletion_audit_log policies using the function
CREATE POLICY "deletion_audit_log_insert" ON public.deletion_audit_log
  FOR INSERT WITH CHECK (
    public.is_super_admin()
  );

-- Super-admins and admins can view deletion logs
CREATE POLICY "deletion_audit_log_select" ON public.deletion_audit_log
  FOR SELECT USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'financialAdmin', 'ict')
    )
  );

COMMENT ON POLICY "deletion_audit_log_insert" ON public.deletion_audit_log IS 
'Only super-admins can create deletion audit log records';

COMMENT ON POLICY "deletion_audit_log_select" ON public.deletion_audit_log IS 
'Super-admins and admins can view deletion audit logs';

