-- ============================================================
-- Bulk-assign all Data Collectors → Operations department
-- Run this AFTER pact_departments_hierarchy.sql
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

DO $$
DECLARE
  ops_id uuid;
  updated_count integer;
BEGIN

  -- Find the Operations sub-department
  SELECT id INTO ops_id
  FROM departments
  WHERE name = 'Operations'
  LIMIT 1;

  IF ops_id IS NULL THEN
    RAISE EXCEPTION 'Operations department not found. Please run pact_departments_hierarchy.sql first.';
  END IF;

  -- Update all profiles whose role matches any known data collector variant
  UPDATE profiles
  SET department_id = ops_id
  WHERE role IN (
    'dataCollector',
    'DataCollector',
    'data_collector',
    'Data Collector',
    'datacollector'
  );

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  RAISE NOTICE 'Done — % data collector profile(s) assigned to Operations (id: %)', updated_count, ops_id;
END $$;
