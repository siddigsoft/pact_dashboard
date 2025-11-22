-- ====================================
-- PRE-FLIGHT CHECK
-- Run this BEFORE the main setup to verify prerequisites
-- ====================================

DO $$
DECLARE
  v_profiles_exists BOOLEAN;
  v_projects_exists BOOLEAN;
  v_mmp_files_exists BOOLEAN;
  v_missing_tables TEXT[];
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'PRE-FLIGHT DATABASE CHECK';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  
  -- Check for required core tables
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) INTO v_profiles_exists;
  
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'projects'
  ) INTO v_projects_exists;
  
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'mmp_files'
  ) INTO v_mmp_files_exists;
  
  -- Report status
  RAISE NOTICE 'Core Tables Check:';
  RAISE NOTICE '  profiles: %', CASE WHEN v_profiles_exists THEN '✓ EXISTS' ELSE '✗ MISSING' END;
  RAISE NOTICE '  projects: %', CASE WHEN v_projects_exists THEN '✓ EXISTS' ELSE '✗ MISSING' END;
  RAISE NOTICE '  mmp_files: %', CASE WHEN v_mmp_files_exists THEN '✓ EXISTS' ELSE '✗ MISSING' END;
  RAISE NOTICE '';
  
  -- Build list of missing tables
  v_missing_tables := ARRAY[]::TEXT[];
  IF NOT v_profiles_exists THEN
    v_missing_tables := array_append(v_missing_tables, 'profiles');
  END IF;
  IF NOT v_projects_exists THEN
    v_missing_tables := array_append(v_missing_tables, 'projects');
  END IF;
  IF NOT v_mmp_files_exists THEN
    v_missing_tables := array_append(v_missing_tables, 'mmp_files');
  END IF;
  
  -- Provide guidance
  IF array_length(v_missing_tables, 1) > 0 THEN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'ACTION REQUIRED!';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Missing core tables detected.';
    RAISE NOTICE 'You MUST run the main schema first:';
    RAISE NOTICE '';
    RAISE NOTICE '1. Go to Supabase SQL Editor';
    RAISE NOTICE '2. Open: supabase/schema.sql';
    RAISE NOTICE '3. Run the entire file';
    RAISE NOTICE '4. Wait for completion';
    RAISE NOTICE '5. Then run SAFE_COMPLETE_SETUP.sql';
    RAISE NOTICE '';
    RAISE NOTICE 'Missing tables: %', array_to_string(v_missing_tables, ', ');
    RAISE NOTICE '========================================';
  ELSE
    RAISE NOTICE '========================================';
    RAISE NOTICE '✓ ALL CHECKS PASSED!';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Your database has all required core tables.';
    RAISE NOTICE 'You can safely run SAFE_COMPLETE_SETUP.sql';
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
  END IF;
END $$;
