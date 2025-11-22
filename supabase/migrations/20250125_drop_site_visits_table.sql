-- Migration: Drop site_visits table and migrate foreign keys to mmp_site_entries
-- Description: Removes site_visits table and updates all foreign keys to reference mmp_site_entries
-- Date: 2025-01-25
-- WARNING: This will permanently delete all site_visits data and related records
-- 
-- IMPORTANT: Before running this migration:
-- 1. Ensure all data has been migrated from site_visits to mmp_site_entries
-- 2. Update any existing foreign key values in dependent tables to point to mmp_site_entries.id
-- 3. Backup your database before running this migration

BEGIN;

-- Step 1: Drop old foreign key constraints that reference site_visits
-- This allows us to recreate them pointing to mmp_site_entries

-- Drop FK from location_logs
ALTER TABLE public.location_logs 
  DROP CONSTRAINT IF EXISTS location_logs_site_visit_id_fkey;

ALTER TABLE public.location_logs 
  DROP CONSTRAINT IF EXISTS location_logs_visit_id_fkey;

-- Drop FK from reports
ALTER TABLE public.reports 
  DROP CONSTRAINT IF EXISTS reports_site_visit_id_fkey;

-- Drop FK from safety_checklists
ALTER TABLE public.safety_checklists 
  DROP CONSTRAINT IF EXISTS safety_checklists_site_visit_id_fkey;

-- Drop FK from site_locations
ALTER TABLE public.site_locations 
  DROP CONSTRAINT IF EXISTS site_locations_site_id_fkey;

-- Drop FK from visit_status
ALTER TABLE public.visit_status 
  DROP CONSTRAINT IF EXISTS visit_status_site_visit_id_fkey;

-- Drop FK from wallet_transactions
ALTER TABLE public.wallet_transactions 
  DROP CONSTRAINT IF EXISTS wallet_transactions_related_site_visit_id_fkey;

-- Step 2: Add new foreign key constraints pointing to mmp_site_entries
-- Note: These columns will now reference mmp_site_entries.id instead of site_visits.id

-- Add FK from location_logs.site_visit_id to mmp_site_entries
ALTER TABLE public.location_logs 
  ADD CONSTRAINT location_logs_site_visit_id_fkey 
  FOREIGN KEY (site_visit_id) 
  REFERENCES public.mmp_site_entries(id) 
  ON DELETE CASCADE;

-- Add FK from location_logs.visit_id to mmp_site_entries
ALTER TABLE public.location_logs 
  ADD CONSTRAINT location_logs_visit_id_fkey 
  FOREIGN KEY (visit_id) 
  REFERENCES public.mmp_site_entries(id) 
  ON DELETE CASCADE;

-- Add FK from reports.site_visit_id to mmp_site_entries
ALTER TABLE public.reports 
  ADD CONSTRAINT reports_site_visit_id_fkey 
  FOREIGN KEY (site_visit_id) 
  REFERENCES public.mmp_site_entries(id) 
  ON DELETE CASCADE;

-- Add FK from safety_checklists.site_visit_id to mmp_site_entries
ALTER TABLE public.safety_checklists 
  ADD CONSTRAINT safety_checklists_site_visit_id_fkey 
  FOREIGN KEY (site_visit_id) 
  REFERENCES public.mmp_site_entries(id) 
  ON DELETE CASCADE;

-- Add FK from site_locations.site_id to mmp_site_entries
ALTER TABLE public.site_locations 
  ADD CONSTRAINT site_locations_site_id_fkey 
  FOREIGN KEY (site_id) 
  REFERENCES public.mmp_site_entries(id) 
  ON DELETE CASCADE;

-- Add FK from visit_status.site_visit_id to mmp_site_entries
ALTER TABLE public.visit_status 
  ADD CONSTRAINT visit_status_site_visit_id_fkey 
  FOREIGN KEY (site_visit_id) 
  REFERENCES public.mmp_site_entries(id) 
  ON DELETE CASCADE;

-- Add FK from wallet_transactions.related_site_visit_id to mmp_site_entries
ALTER TABLE public.wallet_transactions 
  ADD CONSTRAINT wallet_transactions_related_site_visit_id_fkey 
  FOREIGN KEY (related_site_visit_id) 
  REFERENCES public.mmp_site_entries(id) 
  ON DELETE SET NULL;

-- Step 3: Drop dependent tables/views that might reference site_visits
-- (Add any views or other objects here if they exist)

-- Step 4: Drop indexes on site_visits table (if any exist)
DROP INDEX IF EXISTS idx_site_visits_hub_office;
DROP INDEX IF EXISTS idx_site_visits_monitoring_by;
DROP INDEX IF EXISTS idx_site_visits_survey_tool;
DROP INDEX IF EXISTS idx_site_visits_locality;
DROP INDEX IF EXISTS idx_site_visits_state;
DROP INDEX IF EXISTS idx_site_visits_mmp_id;
DROP INDEX IF EXISTS idx_site_visits_status;
DROP INDEX IF EXISTS idx_site_visits_assigned_to;
DROP INDEX IF EXISTS idx_site_visits_user_id;

-- Step 5: Drop the site_visits table
DROP TABLE IF EXISTS public.site_visits CASCADE;

-- Step 6: Update related_entity_type check constraint in chats table
-- Remove 'siteVisit' from the allowed values
ALTER TABLE public.chats 
  DROP CONSTRAINT IF EXISTS chats_related_entity_type_check;

ALTER TABLE public.chats 
  ADD CONSTRAINT chats_related_entity_type_check 
  CHECK (related_entity_type = ANY (ARRAY['mmpFile'::text, 'project'::text]));

-- Step 7: Update related_entity_type check constraint in notifications table
-- Remove 'siteVisit' from the allowed values
ALTER TABLE public.notifications 
  DROP CONSTRAINT IF EXISTS notifications_related_entity_type_check;

ALTER TABLE public.notifications 
  ADD CONSTRAINT notifications_related_entity_type_check 
  CHECK (related_entity_type = ANY (ARRAY['mmpFile'::text, 'transaction'::text, 'chat'::text, 'user'::text]));

COMMIT;

-- Verification queries (run separately to confirm):
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'site_visits';
-- Should return no rows if successful

