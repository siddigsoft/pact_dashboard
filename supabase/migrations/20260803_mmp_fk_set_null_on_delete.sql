-- Migration: Fix MMP FK constraints to use ON DELETE SET NULL
-- Date: 2026-08-03
-- Description: Changes three FK constraints that used ON DELETE NO ACTION (the default)
--   to ON DELETE SET NULL so that deleting an MMP or its site entries can never be
--   blocked by orphaned visit or cost records.
--
-- Affected constraints:
--   a) site_visits.mmp_id              → mmp_files        (NO ACTION → SET NULL)
--   b) site_visits.mmp_site_entry_id   → mmp_site_entries (NO ACTION → SET NULL)
--   c) site_visit_costs.mmp_site_entry_id → mmp_site_entries (NO ACTION → SET NULL)
--
-- No existing data is changed — SET NULL only fires when the referenced row is deleted.

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────────
-- (a) site_visits.mmp_id → mmp_files
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.site_visits
  DROP CONSTRAINT IF EXISTS site_visits_mmp_id_fkey;

ALTER TABLE public.site_visits
  ADD CONSTRAINT site_visits_mmp_id_fkey
  FOREIGN KEY (mmp_id)
  REFERENCES public.mmp_files(id)
  ON DELETE SET NULL;

-- ──────────────────────────────────────────────────────────────────────────────
-- (b) site_visits.mmp_site_entry_id → mmp_site_entries
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
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.site_visit_costs
  DROP CONSTRAINT IF EXISTS site_visit_costs_mmp_site_entry_id_fkey;

ALTER TABLE public.site_visit_costs
  ADD CONSTRAINT site_visit_costs_mmp_site_entry_id_fkey
  FOREIGN KEY (mmp_site_entry_id)
  REFERENCES public.mmp_site_entries(id)
  ON DELETE SET NULL;

COMMIT;
