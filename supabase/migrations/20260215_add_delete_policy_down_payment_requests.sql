-- Migration: Add DELETE policy for down_payment_requests
-- Purpose: Allow admins to permanently delete cancelled down payment requests
-- This prevents "Cancelled" status from showing on mobile app after admin bulk delete

-- Allow admins to delete cancelled down payment requests
CREATE POLICY "down_payment_requests_admin_delete" ON down_payment_requests
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin')
    )
    AND status = 'cancelled'
  );

-- Allow users to delete their own cancelled requests
CREATE POLICY "down_payment_requests_user_delete" ON down_payment_requests
  FOR DELETE USING (
    requested_by = auth.uid()
    AND status = 'cancelled'
  );
