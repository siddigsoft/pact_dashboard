-- MMP Payment Tracking Migration
-- Run this in your Supabase SQL editor to enable per-cycle payment request tracking.
-- This adds a JSONB column to mmp_files that stores when payments were requested
-- and when they were confirmed, linked to the cycle close workflow.

ALTER TABLE mmp_files
  ADD COLUMN IF NOT EXISTS payment_tracking JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN mmp_files.payment_tracking IS
  'Tracks payment request/confirmation timestamps for each MMP cycle close.
   Structure: {
     payment_requested_at: ISO timestamp,
     payment_requested_by: user_id,
     payment_note: optional string,
     payments_confirmed_at: ISO timestamp,
     payments_confirmed_by: user_id
   }';

-- Optional: index for querying MMP files that have pending payment requests
CREATE INDEX IF NOT EXISTS idx_mmp_files_payment_tracking
  ON mmp_files USING GIN (payment_tracking);
