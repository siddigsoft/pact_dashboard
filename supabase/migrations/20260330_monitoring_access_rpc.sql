-- Fix: ensure non-super-admin users can check their own monitoring access
-- Run this in Supabase SQL Editor

-- 1. Re-apply the user self-read RLS policy (in case it was missing or dropped)
DROP POLICY IF EXISTS "monitoring_access_user_read_own" ON monitoring_page_access;
CREATE POLICY "monitoring_access_user_read_own" ON monitoring_page_access
  FOR SELECT USING (user_id = auth.uid());

-- 2. SECURITY DEFINER function — bypasses RLS entirely for self-check
--    Called from the frontend instead of a direct table query so access works
--    regardless of RLS policy state.
CREATE OR REPLACE FUNCTION public.check_monitoring_access()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.monitoring_page_access WHERE user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.check_monitoring_access() TO authenticated;
