-- Update withdrawal_requests status CHECK constraint to support two-step approval workflow
-- This migration adds 'supervisor_approved' and 'processing' statuses to the allowed values

-- Drop the existing constraint
ALTER TABLE public.withdrawal_requests
DROP CONSTRAINT withdrawal_requests_status_check;

-- Add the new constraint with all required statuses
ALTER TABLE public.withdrawal_requests
ADD CONSTRAINT withdrawal_requests_status_check 
CHECK (status = ANY (ARRAY['pending'::text, 'supervisor_approved'::text, 'processing'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text]));
