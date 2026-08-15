-- =============================================================================
-- Migration: Grant superAdmin access to user_classifications RLS policies
-- Date: 2026-08-15
-- Run in: Supabase Studio → SQL Editor
-- Safe to re-run: DROP POLICY IF EXISTS before each CREATE POLICY
--
-- Fixes: superAdmin role was missing from the INSERT, UPDATE, and DELETE
-- policies on user_classifications, causing silent RLS violations when a
-- Super Admin tries to assign or update a classification.
-- =============================================================================

-- INSERT: add superAdmin alongside admin / ict / financialAdmin
DROP POLICY IF EXISTS "Admin insert user_classifications" ON public.user_classifications;
CREATE POLICY "Admin insert user_classifications"
  ON public.user_classifications
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('superAdmin', 'admin', 'ict', 'financialAdmin')
    )
  );

-- UPDATE: add superAdmin alongside admin / ict / financialAdmin
DROP POLICY IF EXISTS "Admin update user_classifications" ON public.user_classifications;
CREATE POLICY "Admin update user_classifications"
  ON public.user_classifications
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('superAdmin', 'admin', 'ict', 'financialAdmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('superAdmin', 'admin', 'ict', 'financialAdmin')
    )
  );

-- DELETE: add superAdmin alongside admin / ict
DROP POLICY IF EXISTS "Admin delete user_classifications" ON public.user_classifications;
CREATE POLICY "Admin delete user_classifications"
  ON public.user_classifications
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('superAdmin', 'admin', 'ict')
    )
  );

-- =============================================================================
-- MIGRATION COMPLETE
-- superAdmin can now INSERT, UPDATE, and DELETE user_classifications rows.
-- =============================================================================
