-- Migration: SECURITY DEFINER RPC for MMP delete FK pre-clearing
-- Date: 2026-08-07
--
-- Problem: deleteMMPFile's client-side FK pre-clearing (step 4.5 in
-- useMMPOperations.ts) runs as the authenticated user.  RLS on site_visits and
-- site_visit_costs blocks the UPDATE calls, leaving FK references alive.
-- This causes mmp_site_entries delete (step 5) to fail silently, and then the
-- final mmp_files delete (step 7) to fail with a FK violation.
--
-- Fix: A SECURITY DEFINER function that runs as the DB owner (bypasses RLS) and:
--   1. Nullifies site_visits.mmp_id             → mmp_files        (text or uuid)
--   2. Nullifies site_visits.mmp_site_entry_id  → mmp_site_entries
--   3. Nullifies site_visit_costs.mmp_site_entry_id → mmp_site_entries (if col exists)
--
-- NOTE: This is intentionally complementary to 20260803_mmp_fk_set_null_on_delete.sql.
-- Run BOTH migrations for the cleanest setup, but this one alone is sufficient to
-- unblock MMP deletion even if the 20260803 migration hasn't been applied yet.

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
  -- 1. Collect site entry IDs for this MMP
  SELECT ARRAY(
    SELECT id FROM public.mmp_site_entries
    WHERE mmp_file_id = p_mmp_id
  ) INTO v_entry_ids;

  -- 2. Nullify site_visits.mmp_site_entry_id for those entries
  IF array_length(v_entry_ids, 1) IS NOT NULL THEN
    UPDATE public.site_visits
       SET mmp_site_entry_id = NULL
     WHERE mmp_site_entry_id = ANY(v_entry_ids);
    GET DIAGNOSTICS v_visits_sv = ROW_COUNT;
  END IF;

  -- 3. Nullify site_visits.mmp_id (column may be TEXT or UUID — handle both)
  BEGIN
    -- Try direct UUID comparison first
    UPDATE public.site_visits
       SET mmp_id = NULL
     WHERE mmp_id::text = p_mmp_id::text;
    GET DIAGNOSTICS v_visits_mmp = ROW_COUNT;
  EXCEPTION WHEN others THEN
    -- Fallback: text comparison
    UPDATE public.site_visits
       SET mmp_id = NULL
     WHERE mmp_id::text = p_mmp_id::text;
    GET DIAGNOSTICS v_visits_mmp = ROW_COUNT;
  END;

  -- 4. Nullify site_visit_costs.mmp_site_entry_id (column may not exist on all schemas)
  IF array_length(v_entry_ids, 1) IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'site_visit_costs'
      AND column_name  = 'mmp_site_entry_id'
  ) THEN
    EXECUTE format(
      'UPDATE public.site_visit_costs SET mmp_site_entry_id = NULL WHERE mmp_site_entry_id = ANY(%L::uuid[])',
      v_entry_ids
    );
    GET DIAGNOSTICS v_costs = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'ok',              true,
    'entry_ids',       array_length(v_entry_ids, 1),
    'visits_sv_rows',  v_visits_sv,
    'visits_mmp_rows', v_visits_mmp,
    'costs_rows',      v_costs
  );
END;
$$;

-- Grant execute only to authenticated users (the function itself uses SECURITY DEFINER)
REVOKE ALL ON FUNCTION public.prepare_mmp_delete(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prepare_mmp_delete(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_mmp_delete(uuid) TO service_role;

COMMENT ON FUNCTION public.prepare_mmp_delete(uuid) IS
  'Clears all FK references that would block deletion of an MMP file and its site entries. '
  'Runs as SECURITY DEFINER to bypass RLS on site_visits and site_visit_costs. '
  'Must be called before deleting mmp_site_entries and mmp_files.';
