-- Migration: Fix MMP FK constraints to use ON DELETE SET NULL
-- Date: 2026-08-03
-- Description: Changes three FK constraints that used ON DELETE NO ACTION (the default)
--   to ON DELETE SET NULL so that deleting an MMP or its site entries can never be
--   blocked by orphaned visit or cost records.
--
-- Affected constraints:
--   a) site_visits.mmp_id              → mmp_files        (NO ACTION → SET NULL)
--   b) site_visits.mmp_site_entry_id   → mmp_site_entries (NO ACTION → SET NULL)
--   c) site_visit_costs.mmp_site_entry_id → mmp_site_entries (SET NULL, if column exists)
--
-- NOTE: site_visits.mmp_id was originally created as TEXT while mmp_files.id is UUID.
-- This migration casts the column to UUID first (nullifying any non-UUID values).
-- No existing data is changed beyond that cast.

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────────
-- (a) site_visits.mmp_id → mmp_files
--     Step 1: nullify any values that aren't valid UUIDs (prevents cast failure)
--     Step 2: cast column from text to uuid
--     Step 3: add FK with ON DELETE SET NULL
-- ──────────────────────────────────────────────────────────────────────────────
UPDATE public.site_visits
  SET mmp_id = NULL
  WHERE mmp_id IS NOT NULL
    AND mmp_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

ALTER TABLE public.site_visits
  DROP CONSTRAINT IF EXISTS site_visits_mmp_id_fkey;

ALTER TABLE public.site_visits
  ALTER COLUMN mmp_id TYPE uuid USING mmp_id::uuid;

ALTER TABLE public.site_visits
  ADD CONSTRAINT site_visits_mmp_id_fkey
  FOREIGN KEY (mmp_id)
  REFERENCES public.mmp_files(id)
  ON DELETE SET NULL;

-- ──────────────────────────────────────────────────────────────────────────────
-- (b) site_visits.mmp_site_entry_id → mmp_site_entries
--     (already uuid — just replacing NO ACTION with SET NULL)
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.site_visits
  DROP CONSTRAINT IF EXISTS site_visits_mmp_site_entry_id_fkey;

ALTER TABLE public.site_visits
  ADD CONSTRAINT site_visits_mmp_site_entry_id_fkey
  FOREIGN KEY (mmp_site_entry_id)
  REFERENCES public.mmp_site_entries(id)
  ON DELETE SET NULL;

-- ──────────────────────────────────────────────────────────────────────────────
-- (c) site_visit_costs.mmp_site_entry_id → mmp_site_entries
--     The original site_visit_costs table uses site_visit_id, not mmp_site_entry_id.
--     Some deployments may have added mmp_site_entry_id later; guard with a
--     column-existence check so this is safe on both old and new schemas.
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'site_visit_costs'
       AND column_name  = 'mmp_site_entry_id'
  ) THEN
    ALTER TABLE public.site_visit_costs
      DROP CONSTRAINT IF EXISTS site_visit_costs_mmp_site_entry_id_fkey;

    ALTER TABLE public.site_visit_costs
      ADD CONSTRAINT site_visit_costs_mmp_site_entry_id_fkey
      FOREIGN KEY (mmp_site_entry_id)
      REFERENCES public.mmp_site_entries(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

COMMIT;
