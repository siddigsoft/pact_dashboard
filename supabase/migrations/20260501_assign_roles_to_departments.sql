-- ============================================================
-- Bulk-assign roles to departments
-- Run AFTER pact_departments_hierarchy.sql
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

DO $$
DECLARE
  ops_id   uuid;
  coord_id uuid;
  updated_dc    integer;
  updated_coord integer;
BEGIN

  -- ── Find departments ──────────────────────────────────────

  SELECT id INTO ops_id
  FROM departments WHERE name = 'Operations' LIMIT 1;

  SELECT id INTO coord_id
  FROM departments WHERE name = 'Project / Process Coordination' LIMIT 1;

  IF ops_id IS NULL THEN
    RAISE EXCEPTION 'Operations department not found. Run pact_departments_hierarchy.sql first.';
  END IF;

  IF coord_id IS NULL THEN
    RAISE EXCEPTION 'Project / Process Coordination department not found. Run pact_departments_hierarchy.sql first.';
  END IF;

  -- ── 1. Data Collectors → Operations ──────────────────────

  UPDATE profiles
  SET department_id = ops_id
  WHERE role IN (
    'dataCollector',
    'DataCollector',
    'data_collector',
    'Data Collector',
    'datacollector'
  );

  GET DIAGNOSTICS updated_dc = ROW_COUNT;

  -- ── 2. Coordinators → Project / Process Coordination ─────

  UPDATE profiles
  SET department_id = coord_id
  WHERE role IN (
    'coordinator',
    'Coordinator'
  );

  GET DIAGNOSTICS updated_coord = ROW_COUNT;

  -- ── Summary ───────────────────────────────────────────────

  RAISE NOTICE '✓ Data Collectors  → Operations:                  % profile(s)', updated_dc;
  RAISE NOTICE '✓ Coordinators     → Project / Process Coordination: % profile(s)', updated_coord;
  RAISE NOTICE '─────────────────────────────────────────────────────────';
  RAISE NOTICE 'Total updated: % profile(s)', updated_dc + updated_coord;

END $$;
