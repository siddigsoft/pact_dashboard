-- Migration: Full FK audit for mmp_files and mmp_site_entries
-- Date: 2026-08-03
-- Description: Comprehensive audit and fix of all FK constraints referencing
--   mmp_files or mmp_site_entries that still use ON DELETE NO ACTION (the default).
--
-- Context: The prior migration (20260803_mmp_fk_set_null_on_delete.sql) fixed
--   three known constraints on site_visits and site_visit_costs. This migration
--   covers all remaining tables discovered during a full schema audit.
--
-- Strategy:
--   • nullable FK columns  → ON DELETE SET NULL  (row survives, FK becomes NULL)
--   • NOT NULL FK columns  → ON DELETE CASCADE   (child rows deleted with parent)
--
-- Safe to re-run: every DROP CONSTRAINT uses IF EXISTS.
-- Run in Supabase Dashboard → SQL Editor → New Query → Run.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 1 — Tables that reference mmp_files(id)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1a. mmp_site_entries.mmp_file_id → mmp_files
--     NOT NULL ownership FK: CASCADE so entries auto-delete with their parent file.
--     (deleteMMPFile step 5 already pre-deletes entries; CASCADE makes it bullet-proof.)
ALTER TABLE public.mmp_site_entries
  DROP CONSTRAINT IF EXISTS mmp_site_entries_mmp_file_id_fkey;

ALTER TABLE public.mmp_site_entries
  ADD CONSTRAINT mmp_site_entries_mmp_file_id_fkey
  FOREIGN KEY (mmp_file_id)
  REFERENCES public.mmp_files(id)
  ON DELETE CASCADE;

-- 1b. site_visit_photos.mmp_id → mmp_files
--     Nullable audit/link column: SET NULL so photos survive independently.
--     If site_visit_photos does not exist yet this block is a no-op.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'site_visit_photos'
      AND column_name  = 'mmp_id'
  ) THEN
    -- Drop old constraint if it exists under any common naming variant
    ALTER TABLE public.site_visit_photos
      DROP CONSTRAINT IF EXISTS site_visit_photos_mmp_id_fkey;

    ALTER TABLE public.site_visit_photos
      ADD CONSTRAINT site_visit_photos_mmp_id_fkey
      FOREIGN KEY (mmp_id)
      REFERENCES public.mmp_files(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 1c. document_index.mmp_id → mmp_files
--     Nullable link column: SET NULL (documents can outlive the MMP record).
--     If this FK does not currently exist the ADD will create it; IF EXISTS
--     guards on the drop prevent errors on re-run.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'document_index'
      AND column_name  = 'mmp_id'
  ) THEN
    ALTER TABLE public.document_index
      DROP CONSTRAINT IF EXISTS document_index_mmp_id_fkey;

    -- Only add the FK if the column is not already a proper FK.
    -- (safe to add even if no FK currently exists)
    ALTER TABLE public.document_index
      ADD CONSTRAINT document_index_mmp_id_fkey
      FOREIGN KEY (mmp_id)
      REFERENCES public.mmp_files(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 2 — Tables that reference mmp_site_entries(id)
-- ─────────────────────────────────────────────────────────────────────────────
-- The three constraints on site_visits and site_visit_costs were already
-- converted to SET NULL by 20260803_mmp_fk_set_null_on_delete.sql.
--
-- Remaining tables audited below:

-- 2a. wallet_transactions.related_site_visit_id → mmp_site_entries
--     Already SET NULL in create_wallet_tables.sql — re-apply idempotently.
ALTER TABLE public.wallet_transactions
  DROP CONSTRAINT IF EXISTS wallet_transactions_related_site_visit_id_fkey;

ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_related_site_visit_id_fkey
  FOREIGN KEY (related_site_visit_id)
  REFERENCES public.mmp_site_entries(id)
  ON DELETE SET NULL;

-- 2b. wallet_transactions.site_visit_id → mmp_site_entries
--     Already SET NULL in create_wallet_tables.sql — re-apply idempotently.
ALTER TABLE public.wallet_transactions
  DROP CONSTRAINT IF EXISTS wallet_transactions_site_visit_id_fkey;

ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_site_visit_id_fkey
  FOREIGN KEY (site_visit_id)
  REFERENCES public.mmp_site_entries(id)
  ON DELETE SET NULL;

-- 2c. location_logs.site_visit_id → mmp_site_entries
--     Set by 20250125_drop_site_visits_table.sql as CASCADE; re-apply safely.
ALTER TABLE public.location_logs
  DROP CONSTRAINT IF EXISTS location_logs_site_visit_id_fkey;

ALTER TABLE public.location_logs
  ADD CONSTRAINT location_logs_site_visit_id_fkey
  FOREIGN KEY (site_visit_id)
  REFERENCES public.mmp_site_entries(id)
  ON DELETE CASCADE;

-- 2d. location_logs.visit_id → mmp_site_entries
ALTER TABLE public.location_logs
  DROP CONSTRAINT IF EXISTS location_logs_visit_id_fkey;

ALTER TABLE public.location_logs
  ADD CONSTRAINT location_logs_visit_id_fkey
  FOREIGN KEY (visit_id)
  REFERENCES public.mmp_site_entries(id)
  ON DELETE CASCADE;

-- 2e. reports.site_visit_id → mmp_site_entries
--     Null out any orphaned references before adding the constraint,
--     so existing rows with stale site_visit_id values don't block the ALTER.
UPDATE public.reports
   SET site_visit_id = NULL
 WHERE site_visit_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.mmp_site_entries e WHERE e.id = reports.site_visit_id
   );

ALTER TABLE public.reports
  DROP CONSTRAINT IF EXISTS reports_site_visit_id_fkey;

ALTER TABLE public.reports
  ADD CONSTRAINT reports_site_visit_id_fkey
  FOREIGN KEY (site_visit_id)
  REFERENCES public.mmp_site_entries(id)
  ON DELETE CASCADE;

-- 2f. safety_checklists.site_visit_id → mmp_site_entries
ALTER TABLE public.safety_checklists
  DROP CONSTRAINT IF EXISTS safety_checklists_site_visit_id_fkey;

ALTER TABLE public.safety_checklists
  ADD CONSTRAINT safety_checklists_site_visit_id_fkey
  FOREIGN KEY (site_visit_id)
  REFERENCES public.mmp_site_entries(id)
  ON DELETE CASCADE;

-- 2g. visit_status.site_visit_id → mmp_site_entries
ALTER TABLE public.visit_status
  DROP CONSTRAINT IF EXISTS visit_status_site_visit_id_fkey;

ALTER TABLE public.visit_status
  ADD CONSTRAINT visit_status_site_visit_id_fkey
  FOREIGN KEY (site_visit_id)
  REFERENCES public.mmp_site_entries(id)
  ON DELETE CASCADE;

-- 2h. site_visit_costs.site_visit_id → mmp_site_entries
--     NOT NULL: CASCADE so costs auto-delete when the entry is removed.
ALTER TABLE public.site_visit_costs
  DROP CONSTRAINT IF EXISTS site_visit_costs_site_visit_id_fkey;

ALTER TABLE public.site_visit_costs
  ADD CONSTRAINT site_visit_costs_site_visit_id_fkey
  FOREIGN KEY (site_visit_id)
  REFERENCES public.mmp_site_entries(id)
  ON DELETE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 3 — Catch-all: fix any remaining NO ACTION constraints dynamically
-- ─────────────────────────────────────────────────────────────────────────────
-- This block queries information_schema and pg_constraint to find any FK that
-- still uses RESTRICT or NO ACTION on mmp_files / mmp_site_entries, then
-- converts it to SET NULL (nullable columns) or CASCADE (NOT NULL columns).
-- Covers constraints created via Supabase dashboard or earlier migrations
-- that weren't present as named constraints in the files above.

DO $$
DECLARE
  rec RECORD;
  drop_sql  text;
  add_sql   text;
  is_nullable boolean;
BEGIN
  FOR rec IN
    SELECT
      tc.table_schema,
      tc.table_name,
      tc.constraint_name,
      kcu.column_name,
      ccu.table_name   AS foreign_table,
      rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON  kcu.constraint_name = tc.constraint_name
      AND kcu.table_schema    = tc.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON  ccu.constraint_name = tc.constraint_name
    JOIN information_schema.referential_constraints rc
      ON  rc.constraint_name        = tc.constraint_name
      AND rc.constraint_schema      = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema    = 'public'
      AND ccu.table_name     IN ('mmp_files', 'mmp_site_entries')
      AND rc.delete_rule     IN ('NO ACTION', 'RESTRICT')
  LOOP
    -- Determine nullability of the FK column
    SELECT is_nullable = 'YES'
    INTO   is_nullable
    FROM   information_schema.columns
    WHERE  table_schema = rec.table_schema
      AND  table_name   = rec.table_name
      AND  column_name  = rec.column_name;

    drop_sql := format(
      'ALTER TABLE %I.%I DROP CONSTRAINT IF EXISTS %I',
      rec.table_schema, rec.table_name, rec.constraint_name
    );
    add_sql := format(
      'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I.%I(id) ON DELETE %s',
      rec.table_schema, rec.table_name, rec.constraint_name,
      rec.column_name,
      rec.table_schema, rec.foreign_table,
      CASE WHEN is_nullable THEN 'SET NULL' ELSE 'CASCADE' END
    );

    RAISE NOTICE 'Fixing FK %.% (% → %): delete_rule % → %',
      rec.table_name, rec.column_name, rec.table_name, rec.foreign_table,
      rec.delete_rule,
      CASE WHEN is_nullable THEN 'SET NULL' ELSE 'CASCADE' END;

    EXECUTE drop_sql;
    EXECUTE add_sql;
  END LOOP;
END $$;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification query (run separately after applying this migration):
--
-- SELECT tc.table_name, kcu.column_name, ccu.table_name AS references, rc.delete_rule
-- FROM information_schema.table_constraints tc
-- JOIN information_schema.key_column_usage kcu
--   ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
-- JOIN information_schema.constraint_column_usage ccu
--   ON ccu.constraint_name = tc.constraint_name
-- JOIN information_schema.referential_constraints rc
--   ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
-- WHERE tc.constraint_type = 'FOREIGN KEY'
--   AND tc.table_schema = 'public'
--   AND ccu.table_name IN ('mmp_files', 'mmp_site_entries')
-- ORDER BY tc.table_name, kcu.column_name;
--
-- Expected: zero rows with delete_rule = 'NO ACTION' or 'RESTRICT'
-- ────────────────────────────────────────────────────────────────────────