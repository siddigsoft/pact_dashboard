-- ═══════════════════════════════════════════════════════════════════════════
-- MMP DELETE FIX — Combined migration (single copy-paste for Supabase Studio)
-- Date: 2026-08-07
--
-- Why this exists:
--   deleteMMPFile fails with "Database delete failed" because several FK
--   constraints on tables that reference mmp_files / mmp_site_entries still
--   use ON DELETE NO ACTION (the Postgres default).  When code tries to delete
--   mmp_files, Postgres raises a FK violation because:
--     1. mmp_site_entries still exist  (mmp_site_entries.mmp_file_id NO ACTION)
--     2. site_visits still reference mmp_site_entries  (NO ACTION)
--     3. Client-side attempts to nullify those references are blocked by RLS
--
-- This script FIXES ALL THREE layers in one pass:
--   STEP 1 — site_visits / site_visit_costs FKs  → SET NULL
--   STEP 2 — mmp_site_entries.mmp_file_id         → CASCADE  (and all others)
--   STEP 3 — SECURITY DEFINER RPC for safe pre-clearing even without migrations
--
-- Safe to re-run: every DROP CONSTRAINT uses IF EXISTS; CREATE OR REPLACE on RPC.
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1  (from 20260803_mmp_fk_set_null_on_delete.sql)
-- Convert site_visits and site_visit_costs FKs that blocked mmp_site_entries
-- deletion from NO ACTION to SET NULL.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1a. site_visits.mmp_id → mmp_files
--     Column was created as TEXT; cast to UUID first (nullify non-UUID values).
UPDATE public.site_visits
  SET mmp_id = NULL
  WHERE mmp_id IS NOT NULL
    AND mmp_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

ALTER TABLE public.site_visits
  DROP CONSTRAINT IF EXISTS site_visits_mmp_id_fkey;

DO $$
BEGIN
  -- Only cast if the column is still text
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'site_visits'
      AND column_name = 'mmp_id' AND data_type = 'text'
  ) THEN
    ALTER TABLE public.site_visits ALTER COLUMN mmp_id TYPE uuid USING mmp_id::uuid;
  END IF;
END $$;

ALTER TABLE public.site_visits
  ADD CONSTRAINT site_visits_mmp_id_fkey
  FOREIGN KEY (mmp_id) REFERENCES public.mmp_files(id)
  ON DELETE SET NULL;

-- 1b. site_visits.mmp_site_entry_id → mmp_site_entries
ALTER TABLE public.site_visits
  DROP CONSTRAINT IF EXISTS site_visits_mmp_site_entry_id_fkey;
ALTER TABLE public.site_visits
  ADD CONSTRAINT site_visits_mmp_site_entry_id_fkey
  FOREIGN KEY (mmp_site_entry_id) REFERENCES public.mmp_site_entries(id)
  ON DELETE SET NULL;

-- 1c. site_visit_costs.mmp_site_entry_id → mmp_site_entries (if column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'site_visit_costs'
      AND column_name = 'mmp_site_entry_id'
  ) THEN
    ALTER TABLE public.site_visit_costs
      DROP CONSTRAINT IF EXISTS site_visit_costs_mmp_site_entry_id_fkey;
    ALTER TABLE public.site_visit_costs
      ADD CONSTRAINT site_visit_costs_mmp_site_entry_id_fkey
      FOREIGN KEY (mmp_site_entry_id) REFERENCES public.mmp_site_entries(id)
      ON DELETE SET NULL;
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2  (from 20260803b_mmp_full_fk_audit.sql)
-- Convert the ownership FK on mmp_site_entries to CASCADE, and fix all other
-- remaining NO ACTION / RESTRICT FKs referencing mmp_files or mmp_site_entries.
-- ─────────────────────────────────────────────────────────────────────────────

-- 2a. mmp_site_entries.mmp_file_id → mmp_files  ← THE KEY ONE
--     When mmp_files is deleted, Postgres now cascades to mmp_site_entries.
ALTER TABLE public.mmp_site_entries
  DROP CONSTRAINT IF EXISTS mmp_site_entries_mmp_file_id_fkey;
ALTER TABLE public.mmp_site_entries
  ADD CONSTRAINT mmp_site_entries_mmp_file_id_fkey
  FOREIGN KEY (mmp_file_id) REFERENCES public.mmp_files(id)
  ON DELETE CASCADE NOT VALID;

-- 2b. site_visit_photos.mmp_id → mmp_files (if table/column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'site_visit_photos'
      AND column_name = 'mmp_id'
  ) THEN
    ALTER TABLE public.site_visit_photos DROP CONSTRAINT IF EXISTS site_visit_photos_mmp_id_fkey;
    ALTER TABLE public.site_visit_photos
      ADD CONSTRAINT site_visit_photos_mmp_id_fkey
      FOREIGN KEY (mmp_id) REFERENCES public.mmp_files(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

-- 2c. document_index.mmp_id → mmp_files (if column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'document_index'
      AND column_name = 'mmp_id'
  ) THEN
    ALTER TABLE public.document_index DROP CONSTRAINT IF EXISTS document_index_mmp_id_fkey;
    ALTER TABLE public.document_index
      ADD CONSTRAINT document_index_mmp_id_fkey
      FOREIGN KEY (mmp_id) REFERENCES public.mmp_files(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

-- 2d. wallet_transactions FKs → mmp_site_entries
ALTER TABLE public.wallet_transactions
  DROP CONSTRAINT IF EXISTS wallet_transactions_related_site_visit_id_fkey;
ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_related_site_visit_id_fkey
  FOREIGN KEY (related_site_visit_id) REFERENCES public.mmp_site_entries(id)
  ON DELETE SET NULL NOT VALID;

ALTER TABLE public.wallet_transactions
  DROP CONSTRAINT IF EXISTS wallet_transactions_site_visit_id_fkey;
ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_site_visit_id_fkey
  FOREIGN KEY (site_visit_id) REFERENCES public.mmp_site_entries(id)
  ON DELETE SET NULL NOT VALID;

-- 2e. location_logs FKs → mmp_site_entries (CASCADE — rows are owned by the entry)
ALTER TABLE public.location_logs
  DROP CONSTRAINT IF EXISTS location_logs_site_visit_id_fkey;
ALTER TABLE public.location_logs
  ADD CONSTRAINT location_logs_site_visit_id_fkey
  FOREIGN KEY (site_visit_id) REFERENCES public.mmp_site_entries(id)
  ON DELETE CASCADE NOT VALID;

ALTER TABLE public.location_logs
  DROP CONSTRAINT IF EXISTS location_logs_visit_id_fkey;
ALTER TABLE public.location_logs
  ADD CONSTRAINT location_logs_visit_id_fkey
  FOREIGN KEY (visit_id) REFERENCES public.mmp_site_entries(id)
  ON DELETE CASCADE NOT VALID;

-- 2f. reports.site_visit_id → mmp_site_entries
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_site_visit_id_fkey;
UPDATE public.reports SET site_visit_id = NULL
  WHERE site_visit_id IS NOT NULL
    AND site_visit_id NOT IN (SELECT id FROM public.mmp_site_entries);
ALTER TABLE public.reports
  ADD CONSTRAINT reports_site_visit_id_fkey
  FOREIGN KEY (site_visit_id) REFERENCES public.mmp_site_entries(id)
  ON DELETE SET NULL NOT VALID;

-- 2g. safety_checklists.site_visit_id → mmp_site_entries
ALTER TABLE public.safety_checklists DROP CONSTRAINT IF EXISTS safety_checklists_site_visit_id_fkey;
ALTER TABLE public.safety_checklists
  ADD CONSTRAINT safety_checklists_site_visit_id_fkey
  FOREIGN KEY (site_visit_id) REFERENCES public.mmp_site_entries(id)
  ON DELETE SET NULL NOT VALID;

-- 2h. visit_status.site_visit_id → mmp_site_entries
ALTER TABLE public.visit_status DROP CONSTRAINT IF EXISTS visit_status_site_visit_id_fkey;
ALTER TABLE public.visit_status
  ADD CONSTRAINT visit_status_site_visit_id_fkey
  FOREIGN KEY (site_visit_id) REFERENCES public.mmp_site_entries(id)
  ON DELETE SET NULL NOT VALID;

-- 2i. site_visit_costs.site_visit_id → mmp_site_entries (CASCADE — costs owned by entry)
ALTER TABLE public.site_visit_costs DROP CONSTRAINT IF EXISTS site_visit_costs_site_visit_id_fkey;
ALTER TABLE public.site_visit_costs
  ADD CONSTRAINT site_visit_costs_site_visit_id_fkey
  FOREIGN KEY (site_visit_id) REFERENCES public.mmp_site_entries(id)
  ON DELETE CASCADE NOT VALID;

-- 2j. Catch-all: fix any remaining NO ACTION / RESTRICT FKs dynamically
DO $$
DECLARE
  rec          RECORD;
  v_nullable   boolean;
  v_drop       text;
  v_add        text;
BEGIN
  FOR rec IN
    SELECT tc.table_name, tc.constraint_name, kcu.column_name, ccu.table_name AS foreign_table
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND ccu.table_name IN ('mmp_files', 'mmp_site_entries')
      AND rc.delete_rule IN ('NO ACTION', 'RESTRICT')
  LOOP
    SELECT col.is_nullable = 'YES' INTO v_nullable
    FROM information_schema.columns col
    WHERE col.table_schema = 'public'
      AND col.table_name = rec.table_name
      AND col.column_name = rec.column_name;

    v_drop := format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I',
                     rec.table_name, rec.constraint_name);
    v_add  := format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(id) ON DELETE %s NOT VALID',
      rec.table_name, rec.constraint_name, rec.column_name, rec.foreign_table,
      CASE WHEN v_nullable THEN 'SET NULL' ELSE 'CASCADE' END
    );
    RAISE NOTICE 'Auto-fixing FK: %.% → % (%)',
      rec.table_name, rec.column_name, rec.foreign_table,
      CASE WHEN v_nullable THEN 'SET NULL' ELSE 'CASCADE' END;
    EXECUTE v_drop;
    EXECUTE v_add;
  END LOOP;
END $$;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3  (from 20260807_prepare_mmp_delete_rpc.sql)
-- SECURITY DEFINER RPC — belt-and-suspenders FK pre-clearing that bypasses RLS.
-- After STEP 1+2, the DB-level cascade handles everything; this RPC is kept as
-- an extra safety net for any future schema additions.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.prepare_mmp_delete(p_mmp_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_ids   uuid[];
  v_visits_sv   int := 0;
  v_visits_mmp  int := 0;
  v_costs       int := 0;
BEGIN
  SELECT ARRAY(SELECT id FROM public.mmp_site_entries WHERE mmp_file_id = p_mmp_id)
    INTO v_entry_ids;

  IF array_length(v_entry_ids, 1) IS NOT NULL THEN
    UPDATE public.site_visits SET mmp_site_entry_id = NULL
      WHERE mmp_site_entry_id = ANY(v_entry_ids);
    GET DIAGNOSTICS v_visits_sv = ROW_COUNT;
  END IF;

  UPDATE public.site_visits SET mmp_id = NULL WHERE mmp_id::text = p_mmp_id::text;
  GET DIAGNOSTICS v_visits_mmp = ROW_COUNT;

  IF array_length(v_entry_ids, 1) IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='site_visit_costs' AND column_name='mmp_site_entry_id'
  ) THEN
    EXECUTE format(
      'UPDATE public.site_visit_costs SET mmp_site_entry_id = NULL WHERE mmp_site_entry_id = ANY(%L::uuid[])',
      v_entry_ids
    );
    GET DIAGNOSTICS v_costs = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'entries', array_length(v_entry_ids, 1),
    'visits_sv', v_visits_sv,
    'visits_mmp', v_visits_mmp,
    'costs', v_costs
  );
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_mmp_delete(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prepare_mmp_delete(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_mmp_delete(uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification (run separately after applying):
--
-- SELECT tc.table_name, kcu.column_name, ccu.table_name AS references, rc.delete_rule
-- FROM information_schema.table_constraints tc
-- JOIN information_schema.key_column_usage kcu
--   ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
-- JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
-- JOIN information_schema.referential_constraints rc
--   ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
-- WHERE tc.constraint_type = 'FOREIGN KEY'
--   AND tc.table_schema = 'public'
--   AND ccu.table_name IN ('mmp_files', 'mmp_site_entries')
-- ORDER BY tc.table_name, kcu.column_name;
-- Expected: zero rows with delete_rule = 'NO ACTION' or 'RESTRICT'
-- ─────────────────────────────────────────────────────────────────────────────
