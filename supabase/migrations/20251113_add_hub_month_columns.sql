-- Migration: Add hub and month columns to mmp_files table
-- These columns will store the hub and month selected during MMP upload

BEGIN;

-- Add hub column if it doesn't exist
ALTER TABLE public.mmp_files
  ADD COLUMN IF NOT EXISTS hub text;

-- Add month column if it doesn't exist  
ALTER TABLE public.mmp_files
  ADD COLUMN IF NOT EXISTS month text;

COMMIT;
