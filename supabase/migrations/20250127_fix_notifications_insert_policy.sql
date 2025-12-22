-- Migration: Fix notifications INSERT RLS policy to allow system notifications
-- Description: Updates INSERT policy to allow authenticated users to create notifications for any user
-- Also fixes SELECT policy to check both recipient_id and user_id
-- Date: 2025-01-27

-- IMPORTANT: This migration must run AFTER consolidated_chat_notifications.sql
-- to ensure the SELECT policy checks both recipient_id and user_id

-- Drop the restrictive INSERT policy that only allows creating notifications for yourself
DROP POLICY IF EXISTS "notifications_insert_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_authenticated" ON public.notifications;

-- Create a new INSERT policy that allows any authenticated user to create notifications
-- This allows the system to create notifications for any user (not just themselves)
CREATE POLICY "notifications_insert_authenticated" 
ON public.notifications 
FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

-- CRITICAL: Update SELECT policy to check both recipient_id and user_id for compatibility
-- The consolidated_chat_notifications.sql only checks user_id, which causes notifications
-- with recipient_id to not be visible. This fixes that issue.
-- Also allows admins to see system notifications (MMP uploads, etc.) even if not direct recipient
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" 
ON public.notifications 
FOR SELECT 
USING (
  -- User's own notifications
  (recipient_id IS NOT NULL AND recipient_id = auth.uid()) OR 
  (user_id IS NOT NULL AND user_id = auth.uid()) OR
  -- Admins can see system and assignment notifications (MMP uploads, MMP forwarded to FOM, site visits, etc.)
  (
    entity_type IN ('mmpFile', 'siteVisit') AND
    event_type IN ('system', 'assignments', 'approvals') AND
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'Admin', 'super_admin', 'superAdmin', 'SuperAdmin')
    )
  )
);

-- Update UPDATE policy to check both recipient_id and user_id
DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own" 
ON public.notifications 
FOR UPDATE 
USING (
  recipient_id = auth.uid() OR 
  user_id = auth.uid()
)
WITH CHECK (
  recipient_id = auth.uid() OR 
  user_id = auth.uid()
);

-- Update DELETE policy to check both recipient_id and user_id
DROP POLICY IF EXISTS "notifications_delete_own" ON public.notifications;
CREATE POLICY "notifications_delete_own" 
ON public.notifications 
FOR DELETE 
USING (
  recipient_id = auth.uid() OR 
  user_id = auth.uid()
);

-- Add comments explaining the policies
COMMENT ON POLICY "notifications_insert_authenticated" ON public.notifications IS 
'Any authenticated user can create notifications for any user (allows system notifications)';

COMMENT ON POLICY "notifications_select_own" ON public.notifications IS 
'Users can view notifications where recipient_id or user_id matches their user ID';

COMMENT ON POLICY "notifications_update_own" ON public.notifications IS 
'Users can update notifications where recipient_id or user_id matches their user ID (e.g., mark as read)';

COMMENT ON POLICY "notifications_delete_own" ON public.notifications IS 
'Users can delete notifications where recipient_id or user_id matches their user ID';

