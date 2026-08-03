-- Migration: FK audit for ad_hoc_mmp_files and ad_hoc_mmp_site_entries
-- Date: 2026-08-03
-- Description: Fix all FK constraints on the ad-hoc MMP tables so that deletes
--   cannot be blocked by NO ACTION (the implicit default).
--
-- Context: The ad-hoc MMP tables were created in 20260429_ad_hoc_mmp_tables.sql.
--   The mmp_file_id FK on ad_hoc_mmp_site_entries was already written as
--   ON DELETE CASCADE.  All auth.users FKs (user_id, assign_to, verified_by)
--   were left without an explicit delete rule, so PostgreSQL defaulted them to
--   NO ACTION — meaning any attempt to delete a referenced auth.users row, or
--   to hard-delete an ad_hoc_mmp_files row that still has site entries pointing
--   to a deleted user, would be blocked.
--
-- Safe to re-run: all ALTER TABLE blocks are wrapped in IF EXISTS guards so
--   this migration is a no-op on databases where the ad-hoc MMP tables have
--   not yet been created.
-- Run in Supabase Dashboard → SQL Editor → New Query → Run.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 1 — Constraints on ad_hoc_mmp_files
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name   = 'ad_hoc_mmp_files'
  ) THEN
    -- 1a. ad_hoc_mmp_files.user_id → auth.users
    --     NOT NULL ownership FK: CASCADE so the file record is removed when the
    --     user account is deleted.
    ALTER TABLE public.ad_hoc_mmp_files
      DROP CONSTRAINT IF EXISTS ad_hoc_mmp_files_user_id_fkey;

    ALTER TABLE public.ad_hoc_mmp_files
      ADD CONSTRAINT ad_hoc_mmp_files_user_id_fkey
      FOREIGN KEY (user_id)
      REFERENCES auth.users(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 2 — Constraints on ad_hoc_mmp_site_entries
-- ─────────────────────────────────────────────────────────────────────────────

-- NOTE: ad_hoc_mmp_site_entries.mmp_file_id was already defined as
--   ON DELETE CASCADE in the original migration — no action needed there.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name   = 'ad_hoc_mmp_site_entries'
  ) THEN
    -- 2a. ad_hoc_mmp_site_entries.user_id → auth.users
    ALTER TABLE public.ad_hoc_mmp_site_entries
      DROP CONSTRAINT IF EXISTS ad_hoc_mmp_site_entries_user_id_fkey;

    ALTER TABLE public.ad_hoc_mmp_site_entries
      ADD CONSTRAINT ad_hoc_mmp_site_entries_user_id_fkey
      FOREIGN KEY (user_id)
      REFERENCES auth.users(id)
      ON DELETE CASCADE
      NOT VALID;

    -- 2b. ad_hoc_mmp_site_entries.assign_to → auth.users
    --     Nullable: SET NULL so the entry survives when the assigned user is removed.
    ALTER TABLE public.ad_hoc_mmp_site_entries
      DROP CONSTRAINT IF EXISTS ad_hoc_mmp_site_entries_assign_to_fkey;

    ALTER TABLE public.ad_hoc_mmp_site_entries
      ADD CONSTRAINT ad_hoc_mmp_site_entries_assign_to_fkey
      FOREIGN KEY (assign_to)
      REFERENCES auth.users(id)
      ON DELETE SET NULL
      NOT VALID;

    -- 2c. ad_hoc_mmp_site_entries.verified_by → auth.users
    --     Nullable audit column: SET NULL so history survives if the user is deleted.
    ALTER TABLE public.ad_hoc_mmp_site_entries
      DROP CONSTRAINT IF EXISTS ad_hoc_mmp_site_entries_verified_by_fkey;

    ALTER TABLE public.ad_hoc_mmp_site_entries
      ADD CONSTRAINT ad_hoc_mmp_site_entries_verified_by_fkey
      FOREIGN KEY (verified_by)
      REFERENCES auth.users(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 3 — Catch-all: fix any remaining NO ACTION constraints dynamically
-- ─────────────────────────────────────────────────────────────────────────────
-- Queries information_schema — safe even when tables don't exist (returns 0 rows).

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
      ON  rc.constraint_name   = tc.constraint_name
      AND rc.constraint_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema    = 'public'
      AND ccu.table_name     IN ('ad_hoc_mmp_files', 'ad_hoc_mmp_site_entries')
      AND rc.delete_rule     IN ('NO ACTION', 'RESTRICT')
  LOOP
    SELECT (is_nullable = 'YES')
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
      'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I.%I(id) ON DELETE %s NOT VALID',
      rec.table_schema, rec.table_name, rec.constraint_name,
      rec.column_name,
      rec.table_schema, rec.foreign_table,
      CASE WHEN is_nullable THEN 'SET NULL' ELSE 'CASCADE' END
    );

    RAISE NOTICE 'Fixing FK on %.% (→ %): % → %',
      rec.table_name, rec.column_name, rec.foreign_table,
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
--   AND ccu.table_name IN ('ad_hoc_mmp_files', 'ad_hoc_mmp_site_entries')
-- ORDER BY tc.table_name, kcu.column_name;
--
-- Expected: zero rows with delete_rule = 'NO ACTION' or 'RESTRICT'
-- ─────────────────────────────────────────────────────────────────────────────
