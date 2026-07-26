-- Migration: Delete Request Workflow for operational_cost_submissions
-- Any user can request deletion with a reason; Admin/SuperAdmin/FinancialAdmin can approve or reject.
-- Apply manually in Supabase SQL editor.

ALTER TABLE operational_cost_submissions
  ADD COLUMN IF NOT EXISTS delete_requested_at  timestamptz,
  ADD COLUMN IF NOT EXISTS delete_requested_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delete_request_reason text,
  ADD COLUMN IF NOT EXISTS delete_request_status text CHECK (delete_request_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS delete_request_notes  text,
  ADD COLUMN IF NOT EXISTS delete_request_reviewed_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delete_request_reviewed_at  timestamptz;

COMMENT ON COLUMN operational_cost_submissions.delete_request_status IS 'pending = awaiting admin review; approved = admin approved deletion (row deleted); rejected = admin rejected, feedback sent to requester';
