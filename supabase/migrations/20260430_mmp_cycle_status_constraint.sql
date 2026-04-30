-- Fix: expand mmp_files cycle_status check constraint to include 'pending_approval'.
-- The previous constraint only allowed ('active', 'closing', 'closed') so the
-- "Submit for Approval" step was rejected by the database.
--
-- Run this in your Supabase SQL Editor.

ALTER TABLE public.mmp_files
  DROP CONSTRAINT IF EXISTS mmp_files_cycle_status_check;

ALTER TABLE public.mmp_files
  ADD CONSTRAINT mmp_files_cycle_status_check
  CHECK (cycle_status IN ('active', 'closing', 'pending_approval', 'closed'));
