-- Task #53 — Show landing page KPI numbers to anonymous visitors too.
--
-- Problem: The public landing page (`/`, src/pages/Index.tsx) is reachable
-- without a session, but its KPI strip ("Live Sites", "Active Teams",
-- "Tasks Completed", "Efficiency") aggregates client-side over
-- `mmp_site_entries` and `profiles`. Both tables are protected by RLS, and
-- the anon role has no rows, so unauthenticated visitors saw 0 / 0 / 0 / 0%
-- on the marketing page — exactly the audience the strip is meant to impress.
--
-- Fix: a single SECURITY DEFINER RPC that returns ONLY the aggregated
-- numbers (no row-level data, no PII), callable by the `anon` role.
-- The aggregation logic mirrors the JS in Index.tsx (Task #51) line-for-line
-- so the displayed numbers stay identical for logged-in vs anonymous users.
--
-- Security posture:
--   * SECURITY DEFINER bypasses RLS on the underlying tables.
--   * Only counts/percentages are returned. No ids, no titles, no names,
--     no timestamps, no foreign keys.
--   * Function is STABLE — Postgres can cache within a single statement.
--   * search_path is pinned to `public` so a malicious schema can't shadow
--     `mmp_site_entries` / `profiles`.

BEGIN;

CREATE OR REPLACE FUNCTION public.public_landing_kpis()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_now        timestamptz := now();
  v_30d_ago    timestamptz := now() - interval '30 days';
  v_60d_ago    timestamptz := now() - interval '60 days';

  v_live_sites          int := 0;
  v_tasks_completed     int := 0;
  v_total_entries       int := 0;
  v_efficiency          numeric := 0;
  v_active_teams        int := 0;

  v_recent_live         int := 0;
  v_older_live          int := 0;
  v_live_sites_trend    int := 0;

  v_recent_done         int := 0;
  v_older_done          int := 0;
  v_tasks_completed_trend int := 0;

  v_recent_total        int := 0;
  v_older_total         int := 0;
  v_recent_eff          numeric := 0;
  v_older_eff           numeric := 0;
  v_efficiency_trend    int := 0;

  v_active_teams_trend  int := 0;
BEGIN
  -- Status normalization MUST stay in sync with src/pages/Index.tsx:
  --   norm = lowercase, trimmed, with whitespace / _ / - removed.
  -- LIVE  = currently in the active workflow (after dispatch, before close).
  -- DONE  = terminal-success states.
  --
  -- Completion-time bucketing uses `completed_at` (Task #52), which is
  -- stamped by trigger when a row first transitions into a done state and
  -- preserved across later edits. Falling back to `updated_at` keeps any
  -- legacy rows that escaped the backfill from disappearing from the trend.
  WITH normalized AS (
    SELECT
      created_at,
      updated_at,
      completed_at,
      regexp_replace(lower(trim(coalesce(status::text, ''))), '[\s_-]+', '', 'g') AS s
    FROM public.mmp_site_entries
  ),
  classified AS (
    SELECT
      created_at,
      updated_at,
      COALESCE(completed_at, updated_at, created_at) AS done_at,
      (s IN ('dispatched','assigned','smartassigned','accepted',
             'inprogress','ongoing','started')) AS is_live,
      (s IN ('completed','verified','closed','cpverified')) AS is_done
    FROM normalized
  )
  SELECT
    COUNT(*) FILTER (WHERE is_live),
    COUNT(*) FILTER (WHERE is_done),
    COUNT(*),
    COUNT(*) FILTER (WHERE is_live
                       AND created_at >= v_30d_ago AND created_at < v_now),
    COUNT(*) FILTER (WHERE is_live
                       AND created_at >= v_60d_ago AND created_at < v_30d_ago),
    COUNT(*) FILTER (WHERE is_done
                       AND done_at >= v_30d_ago
                       AND done_at < v_now),
    COUNT(*) FILTER (WHERE is_done
                       AND done_at >= v_60d_ago
                       AND done_at < v_30d_ago),
    COUNT(*) FILTER (WHERE created_at >= v_30d_ago AND created_at < v_now),
    COUNT(*) FILTER (WHERE created_at >= v_60d_ago AND created_at < v_30d_ago)
  INTO
    v_live_sites,
    v_tasks_completed,
    v_total_entries,
    v_recent_live,
    v_older_live,
    v_recent_done,
    v_older_done,
    v_recent_total,
    v_older_total
  FROM classified;

  -- Efficiency = done / total * 100, rounded to one decimal place.
  v_efficiency := CASE
    WHEN v_total_entries > 0
      THEN round((v_tasks_completed::numeric / v_total_entries::numeric) * 1000) / 10
    ELSE 0
  END;

  -- Active teams: distinct profiles touched in the last 30 days.
  SELECT COUNT(*)
    INTO v_active_teams
    FROM public.profiles
   WHERE updated_at >= v_30d_ago;

  -- Live trend: % change in live count between the last 30d and the prior 30d.
  v_live_sites_trend := CASE
    WHEN v_older_live > 0
      THEN round(((v_recent_live - v_older_live)::numeric / v_older_live) * 100)::int
    WHEN v_recent_live > 0 THEN 100
    ELSE 0
  END;

  -- Completed trend.
  v_tasks_completed_trend := CASE
    WHEN v_older_done > 0
      THEN round(((v_recent_done - v_older_done)::numeric / v_older_done) * 100)::int
    WHEN v_recent_done > 0 THEN 100
    ELSE 0
  END;

  -- Efficiency trend: compare windowed efficiency 30d vs 60-30d.
  v_recent_eff := CASE WHEN v_recent_total > 0
    THEN (v_recent_done::numeric / v_recent_total) * 100 ELSE 0 END;
  v_older_eff  := CASE WHEN v_older_total > 0
    THEN (v_older_done::numeric  / v_older_total)  * 100 ELSE 0 END;
  v_efficiency_trend := CASE
    WHEN v_older_eff > 0
      THEN round(((v_recent_eff - v_older_eff) / v_older_eff) * 100)::int
    WHEN v_recent_eff > 0 THEN round(v_recent_eff)::int
    ELSE 0
  END;

  -- Active-teams trend: matches the synthetic heuristic in Index.tsx
  -- (`activeTeams > 0 ? min(round(activeTeams / 5), 50) : 0`).
  v_active_teams_trend := CASE
    WHEN v_active_teams > 0
      THEN LEAST(round(v_active_teams::numeric / 5)::int, 50)
    ELSE 0
  END;

  RETURN jsonb_build_object(
    'live_sites',            v_live_sites,
    'active_teams',          v_active_teams,
    'tasks_completed',       v_tasks_completed,
    'efficiency',            v_efficiency,
    'live_sites_trend',      v_live_sites_trend,
    'active_teams_trend',    v_active_teams_trend,
    'tasks_completed_trend', v_tasks_completed_trend,
    'efficiency_trend',      v_efficiency_trend
  );
END;
$$;

REVOKE ALL ON FUNCTION public.public_landing_kpis() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_landing_kpis() TO anon, authenticated;

COMMIT;

-- =============================================================================
-- VERIFICATION (run after applying — do NOT include in the migration tx):
-- =============================================================================
-- 1. Anonymous role can call it and gets a JSON object:
--    SET ROLE anon;
--    SELECT public.public_landing_kpis();
--    RESET ROLE;
--    -> { "live_sites": 6, "active_teams": 12, ... }
--
-- 2. Authenticated role gets the same numbers (sanity check vs the UI):
--    SET ROLE authenticated;
--    SELECT public.public_landing_kpis();
--    RESET ROLE;
--
-- 3. PUBLIC was revoked successfully (defense-in-depth):
--    SELECT has_function_privilege('public', 'public.public_landing_kpis()', 'EXECUTE');
--    -> false
--
-- 4. anon + authenticated explicitly granted:
--    SELECT has_function_privilege('anon',          'public.public_landing_kpis()', 'EXECUTE'),
--           has_function_privilege('authenticated', 'public.public_landing_kpis()', 'EXECUTE');
--    -> true, true
