-- Migration: Add forwarding columns to mmp_site_entries
-- This adds the columns needed for coordinator site forwarding

-- Add forwarded_to_user_id column
ALTER TABLE mmp_site_entries 
ADD COLUMN IF NOT EXISTS forwarded_to_user_id TEXT;

-- Add forwarded_by_user_id column  
ALTER TABLE mmp_site_entries
ADD COLUMN IF NOT EXISTS forwarded_by_user_id TEXT;

-- Add forwarded_at column
ALTER TABLE mmp_site_entries
ADD COLUMN IF NOT EXISTS forwarded_at TIMESTAMP WITH TIME ZONE;

-- Add workflow JSONB column for tracking workflow state
ALTER TABLE mmp_site_entries
ADD COLUMN IF NOT EXISTS workflow JSONB DEFAULT '{}'::jsonb;

-- Create index for faster coordinator queries
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_forwarded_to_user_id 
ON mmp_site_entries(forwarded_to_user_id) 
WHERE forwarded_to_user_id IS NOT NULL;

-- Backfill forwarded_to_user_id from additional_data.assigned_to for existing records
UPDATE mmp_site_entries
SET forwarded_to_user_id = additional_data->>'assigned_to'
WHERE additional_data->>'assigned_to' IS NOT NULL
AND forwarded_to_user_id IS NULL;

-- Backfill forwarded_by_user_id from additional_data.assigned_by for existing records
UPDATE mmp_site_entries
SET forwarded_by_user_id = additional_data->>'assigned_by'
WHERE additional_data->>'assigned_by' IS NOT NULL
AND forwarded_by_user_id IS NULL;

-- Backfill forwarded_at from additional_data.assigned_at for existing records
UPDATE mmp_site_entries
SET forwarded_at = (additional_data->>'assigned_at')::timestamp with time zone
WHERE additional_data->>'assigned_at' IS NOT NULL
AND forwarded_at IS NULL;

COMMENT ON COLUMN mmp_site_entries.forwarded_to_user_id IS 'User ID of the coordinator this site was forwarded to';
COMMENT ON COLUMN mmp_site_entries.forwarded_by_user_id IS 'User ID who forwarded this site';
COMMENT ON COLUMN mmp_site_entries.forwarded_at IS 'Timestamp when the site was forwarded';
COMMENT ON COLUMN mmp_site_entries.workflow IS 'JSONB object tracking workflow state and history';
