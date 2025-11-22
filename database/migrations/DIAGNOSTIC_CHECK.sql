-- ====================================
-- DIAGNOSTIC CHECK
-- Run this to see your current database state
-- ====================================

-- Check which tables exist
SELECT 
  'TABLE CHECK' as check_type,
  table_name,
  'EXISTS' as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'profiles', 'projects', 'mmp_files', 'mmp_site_entries',
    'wallet_balances', 'wallet_transactions',
    'project_budgets', 'mmp_budgets', 'budget_transactions', 'budget_alerts'
  )
ORDER BY table_name;

-- Check mmp_site_entries columns if table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'mmp_site_entries'
  ) THEN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'mmp_site_entries TABLE EXISTS';
    RAISE NOTICE 'Here are its current columns:';
    RAISE NOTICE '========================================';
  ELSE
    RAISE NOTICE '';
    RAISE NOTICE 'mmp_site_entries table does NOT exist yet';
  END IF;
END $$;

-- Show columns for mmp_site_entries if it exists
SELECT 
  'COLUMN CHECK' as check_type,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'mmp_site_entries'
ORDER BY ordinal_position;

-- Check for any foreign key constraints on mmp_site_entries
SELECT
  'FOREIGN KEY CHECK' as check_type,
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_name = 'mmp_site_entries'
  AND tc.table_schema = 'public';

-- Summary
DO $$
DECLARE
  v_total_tables INTEGER;
  v_mmp_exists BOOLEAN;
BEGIN
  SELECT COUNT(*) INTO v_total_tables
  FROM information_schema.tables 
  WHERE table_schema = 'public';
  
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'mmp_site_entries'
  ) INTO v_mmp_exists;
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'DIAGNOSTIC SUMMARY';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Total tables in public schema: %', v_total_tables;
  RAISE NOTICE 'mmp_site_entries exists: %', v_mmp_exists;
  RAISE NOTICE '';
  
  IF v_mmp_exists THEN
    RAISE NOTICE 'RECOMMENDATION:';
    RAISE NOTICE 'The mmp_site_entries table already exists.';
    RAISE NOTICE 'Use ULTRA_SAFE_SETUP.sql which will skip it';
    RAISE NOTICE 'and only create missing tables.';
  ELSE
    RAISE NOTICE 'RECOMMENDATION:';
    RAISE NOTICE 'Run ULTRA_SAFE_SETUP.sql to create all tables.';
  END IF;
  RAISE NOTICE '========================================';
END $$;
