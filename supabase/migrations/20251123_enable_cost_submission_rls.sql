-- =====================================================
-- ENABLE ROW LEVEL SECURITY FOR COST SUBMISSION TABLES
-- =====================================================
-- Run this in Supabase SQL Editor after creating the tables
-- This ensures proper data security for cost submissions
-- =====================================================

-- Enable RLS on cost submission tables
ALTER TABLE public.site_visit_cost_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_approval_history ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- POLICIES FOR site_visit_cost_submissions
-- =====================================================

-- Policy 1: Users can view their own submissions + Admins/Finance can view all
CREATE POLICY "Users can view own submissions"
  ON site_visit_cost_submissions
  FOR SELECT
  USING (
    submitted_by = auth.uid()
    OR 
    -- Admins and finance users can see all submissions
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND LOWER(role) IN ('admin', 'financialadmin', 'fom', 'ict')
    )
  );

-- Policy 2: Users can create their own submissions
CREATE POLICY "Users can create submissions"
  ON site_visit_cost_submissions
  FOR INSERT
  WITH CHECK (submitted_by = auth.uid());

-- Policy 3: Users can update their own pending submissions
CREATE POLICY "Users can update own pending submissions"
  ON site_visit_cost_submissions
  FOR UPDATE
  USING (
    submitted_by = auth.uid() 
    AND status = 'pending'
  )
  WITH CHECK (
    submitted_by = auth.uid()
  );

-- Policy 4: Admins/Finance can update any submission (for approval/rejection)
CREATE POLICY "Admins can update submissions"
  ON site_visit_cost_submissions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND LOWER(role) IN ('admin', 'financialadmin', 'fom')
    )
  );

-- Policy 5: Users can delete their own pending submissions
CREATE POLICY "Users can delete own pending submissions"
  ON site_visit_cost_submissions
  FOR DELETE
  USING (
    submitted_by = auth.uid() 
    AND status = 'pending'
  );

-- =====================================================
-- POLICIES FOR cost_approval_history
-- =====================================================

-- Policy 1: Users can view history for their submissions + Admins can view all
CREATE POLICY "Users can view relevant history"
  ON cost_approval_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM site_visit_cost_submissions 
      WHERE id = submission_id 
      AND (
        submitted_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM user_roles 
          WHERE user_id = auth.uid() 
          AND LOWER(role) IN ('admin', 'financialadmin', 'fom', 'ict')
        )
      )
    )
  );

-- Policy 2: System can insert history records (trigger uses SECURITY DEFINER)
CREATE POLICY "System can insert history"
  ON cost_approval_history
  FOR INSERT
  WITH CHECK (true);

-- =====================================================
-- GRANT PERMISSIONS (after RLS enabled)
-- =====================================================
-- These were set earlier but re-grant to be sure
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_visit_cost_submissions TO authenticated;
GRANT SELECT, INSERT ON public.cost_approval_history TO authenticated;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================
-- Run these after to verify RLS is enabled:
-- 
-- SELECT tablename, rowsecurity FROM pg_tables 
-- WHERE schemaname = 'public' 
-- AND tablename IN ('site_visit_cost_submissions', 'cost_approval_history');
--
-- Should show: rowsecurity = true for both tables
--
-- SELECT policyname, tablename, cmd FROM pg_policies 
-- WHERE schemaname = 'public' 
-- AND tablename LIKE '%cost%';
--
-- Should show all 8 policies created above
