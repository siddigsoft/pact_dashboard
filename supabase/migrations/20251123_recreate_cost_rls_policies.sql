-- =====================================================
-- RECREATE RLS POLICIES (drops existing first)
-- =====================================================
-- Use this if you get "policy already exists" errors
-- =====================================================

-- Drop all existing policies first
DROP POLICY IF EXISTS "Users can view own submissions" ON site_visit_cost_submissions;
DROP POLICY IF EXISTS "Users can create submissions" ON site_visit_cost_submissions;
DROP POLICY IF EXISTS "Users can update own pending submissions" ON site_visit_cost_submissions;
DROP POLICY IF EXISTS "Admins can update submissions" ON site_visit_cost_submissions;
DROP POLICY IF EXISTS "Users can delete own pending submissions" ON site_visit_cost_submissions;
DROP POLICY IF EXISTS "Users can view relevant history" ON cost_approval_history;
DROP POLICY IF EXISTS "System can insert history" ON cost_approval_history;

-- Enable RLS (in case it's not enabled)
ALTER TABLE public.site_visit_cost_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_approval_history ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RECREATE ALL POLICIES
-- =====================================================

-- Policy 1: Users can view their own submissions + Admins/Finance can view all
CREATE POLICY "Users can view own submissions"
  ON site_visit_cost_submissions
  FOR SELECT
  USING (
    submitted_by = auth.uid()
    OR 
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

-- Policy 4: Admins/Finance can update any submission
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

-- Policy 6: Users can view history for their submissions
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

-- Policy 7: System can insert history records
CREATE POLICY "System can insert history"
  ON cost_approval_history
  FOR INSERT
  WITH CHECK (true);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_visit_cost_submissions TO authenticated;
GRANT SELECT, INSERT ON public.cost_approval_history TO authenticated;

-- =====================================================
-- VERIFICATION
-- =====================================================
-- Verify RLS is enabled
SELECT tablename, rowsecurity FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('site_visit_cost_submissions', 'cost_approval_history');

-- Verify policies exist
SELECT schemaname, tablename, policyname, cmd 
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename LIKE '%cost%'
ORDER BY tablename, cmd;
