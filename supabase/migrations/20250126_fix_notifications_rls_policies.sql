-- Migration: Fix RLS policies for notifications table
-- Description: Updates RLS policies to ensure users can only delete/update their own notifications
-- Date: 2025-01-26

-- Drop the existing overly permissive policy
DROP POLICY IF EXISTS "notifications_all_auth" ON public.notifications;

-- Create separate policies for different operations

-- Policy for SELECT: Users can only see their own notifications
CREATE POLICY "notifications_select_own" 
ON public.notifications 
FOR SELECT 
USING (user_id = auth.uid());

-- Policy for INSERT: Any authenticated user can create notifications
-- (This allows the system to create notifications for any user)
CREATE POLICY "notifications_insert_authenticated" 
ON public.notifications 
FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

-- Policy for UPDATE: Users can only update their own notifications
-- (This allows marking notifications as read)
CREATE POLICY "notifications_update_own" 
ON public.notifications 
FOR UPDATE 
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Policy for DELETE: Users can only delete their own notifications
-- This is the key fix for the "Clear all" button
CREATE POLICY "notifications_delete_own" 
ON public.notifications 
FOR DELETE 
USING (user_id = auth.uid());

-- Add comment explaining the policies
COMMENT ON POLICY "notifications_select_own" ON public.notifications IS 
'Users can only view their own notifications';

COMMENT ON POLICY "notifications_insert_authenticated" ON public.notifications IS 
'Any authenticated user can create notifications (allows system to notify any user)';

COMMENT ON POLICY "notifications_update_own" ON public.notifications IS 
'Users can only update their own notifications (e.g., mark as read)';

COMMENT ON POLICY "notifications_delete_own" ON public.notifications IS 
'Users can only delete their own notifications (enables Clear all button)';

