-- Monitoring Page Access: lets super_admins grant specific users access to /admin/monitoring
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS monitoring_page_access (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by  UUID NOT NULL REFERENCES auth.users(id),
  granted_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE monitoring_page_access ENABLE ROW LEVEL SECURITY;

-- Super admins can read, insert, and delete all rows
DROP POLICY IF EXISTS "monitoring_access_super_admin_all" ON monitoring_page_access;
CREATE POLICY "monitoring_access_super_admin_all" ON monitoring_page_access
  FOR ALL USING (public.is_super_admin());

-- Any authenticated user can check whether they personally have access
DROP POLICY IF EXISTS "monitoring_access_user_read_own" ON monitoring_page_access;
CREATE POLICY "monitoring_access_user_read_own" ON monitoring_page_access
  FOR SELECT USING (user_id = auth.uid());
