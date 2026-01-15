-- =====================================================
-- NOTIFICATIONS TABLE FIX
-- Run this in your Supabase SQL Editor
-- =====================================================

-- 1. Enable RLS on notifications table
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 2. Drop any existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can read their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Allow select notifications for authenticated" ON public.notifications;
DROP POLICY IF EXISTS "Allow insert notifications for authenticated" ON public.notifications;
DROP POLICY IF EXISTS "Allow update notifications for authenticated" ON public.notifications;
DROP POLICY IF EXISTS "notifications_select_policy" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_policy" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_policy" ON public.notifications;

-- 3. Create SELECT policy - users can read notifications where they are the user_id OR recipient_id
CREATE POLICY "Users can read their own notifications"
  ON public.notifications
  FOR SELECT
  USING (
    auth.uid() = user_id 
    OR auth.uid() = recipient_id
    OR auth.role() = 'service_role'
  );

-- 4. Create INSERT policy - authenticated users and service role can insert
CREATE POLICY "Allow insert notifications for authenticated"
  ON public.notifications
  FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    OR auth.role() = 'service_role'
  );

-- 5. Create UPDATE policy - users can update their own notifications (mark as read)
CREATE POLICY "Users can update their own notifications"
  ON public.notifications
  FOR UPDATE
  USING (
    auth.uid() = user_id 
    OR auth.uid() = recipient_id
    OR auth.role() = 'service_role'
  )
  WITH CHECK (
    auth.uid() = user_id 
    OR auth.uid() = recipient_id
    OR auth.role() = 'service_role'
  );

-- 6. Create DELETE policy - users can delete their own notifications
CREATE POLICY "Users can delete their own notifications"
  ON public.notifications
  FOR DELETE
  USING (
    auth.uid() = user_id 
    OR auth.uid() = recipient_id
    OR auth.role() = 'service_role'
  );

-- 7. Enable realtime for notifications table
-- First remove from existing publication if present
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.notifications;

-- Then add it back
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- 8. Create index for user_id if not exists (for faster queries)
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications USING btree (user_id);

-- 9. Create index for is_read if not exists (for unread count queries)
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications USING btree (is_read);

-- 10. Create composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_notifications_user_created 
  ON public.notifications USING btree (user_id, created_at DESC);

-- =====================================================
-- VERIFY THE FIX
-- Run these queries to verify notifications are working
-- =====================================================

-- Check if RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'notifications';

-- Check existing policies
SELECT policyname, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'notifications';

-- Check if table is in realtime publication
SELECT * FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' AND tablename = 'notifications';

-- Count existing notifications for current user (run in app context)
-- SELECT COUNT(*) FROM notifications WHERE user_id = auth.uid();
