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
-- Strategy (mirrors 20260803b_mmp_full_fk_audit.sql):
--   • NOT NULL FK columns  → ON DELETE CASCADE   (child rows deleted with parent)
--   • nullable FK columns  → ON DELETE SET NULL  (row survives, FK becomes NULL)
--
-- Safe to re-run: every DROP CONSTRAINT uses IF EXISTS.
-- Run in Supabase Dashboard → SQL Editor → New Query → Run.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 1 — Constraints on ad_hoc_mmp_files
-- ─────────────────────────────────────────────────────────────────────────────

-- 1a. ad_hoc_mmp_files.user_id → auth.users
--     NOT NULL ownership FK: CASCADE so the file record is removed when the
--     user account is deleted.
ALTER TABLE public.ad_hoc_mmp_files
  DROP CONSTRAINT IF EXISTS ad_hoc_mmp_files_user_id_fkey;

ALTER TABLE public.ad_hoc_mmp_files
  ADD CONSTRAINT ad_hoc_mmp_files_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 2 — Constraints on ad_hoc_mmp_site_entries
-- ─────────────────────────────────────────────────────────────────────────────

-- NOTE: ad_hoc_mmp_site_entries.mmp_file_id was already defined as
--   ON DELETE CASCADE in the original migration — no action needed there.

-- 2a. ad_hoc_mmp_site_entries.user_id → auth.users
--     NOT NULL ownership FK: CASCADE so entries are removed when the user is
--     deleted.
ALTER TABLE public.ad_hoc_mmp_site_entries
  DROP CONSTRAINT IF EXISTS ad_hoc_mmp_site_entries_user_id_fkey;

ALTER TABLE public.ad_hoc_mmp_site_entries
  ADD CONSTRAINT ad_hoc_mmp_site_entries_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE;

-- 2b. ad_hoc_mmp_site_entries.assign_to → auth.users
--     Nullable assignment column: SET NULL so the entry survives when the
--     assigned user is removed (it just becomes unassigned).
ALTER TABLE public.ad_hoc_mmp_site_entries
  DROP CONSTRAINT IF EXISTS ad_hoc_mmp_site_entries_assign_to_fkey;

ALTER TABLE public.ad_hoc_mmp_site_entries
  ADD CONSTRAINT ad_hoc_mmp_site_entries_assign_to_fkey
  FOREIGN KEY (assign_to)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- 2c. ad_hoc_mmp_site_entries.verified_by → auth.users
--     Nullable audit column: SET NULL so verification history survives even if
--     the verifying user account is deleted.
ALTER TABLE public.ad_hoc_mmp_site_entries
  DROP CONSTRAINT IF EXISTS ad_hoc_mmp_site_entries_verified_by_fkey;

ALTER TABLE public.ad_hoc_mmp_site_entries
  ADD CONSTRAINT ad_hoc_mmp_site_entries_verified_by_fkey
  FOREIGN KEY (verified_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 3 — Catch-all: fix any remaining NO ACTION constraints dynamically
-- ─────────────────────────────────────────────────────────────────────────────
-- Queries information_schema to find any FK still using NO ACTION / RESTRICT
-- that points TO ad_hoc_mmp_files or ad_hoc_mmp_site_entries (i.e. child
-- tables added after this migration was written), and converts them using the
-- same nullable/NOT NULL heuristic.

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
      'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I.%I(id) ON DELETE %s',
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
