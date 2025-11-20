-- Migration: Add uploaded_by column to mmp_files table
-- This column will store the uploader's name and role in format "Name (Role)"

BEGIN;

-- Add uploaded_by column if it doesn't exist
ALTER TABLE public.mmp_files
  ADD COLUMN IF NOT EXISTS uploaded_by text;

-- Backfill uploaded_by from workflow.uploader if present
UPDATE public.mmp_files 
SET uploaded_by = CASE 
  WHEN workflow->'uploader' IS NOT NULL AND workflow->'uploader'->>'name' IS NOT NULL THEN
    CASE 
      WHEN workflow->'uploader'->>'role' IS NOT NULL THEN
        (workflow->'uploader'->>'name') || ' (' || (workflow->'uploader'->>'role') || ')'
      ELSE
        workflow->'uploader'->>'name'
    END
  ELSE 'Unknown'
END
WHERE uploaded_by IS NULL;

COMMIT;
