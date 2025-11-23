-- ============================================================================
-- DIAGNOSTIC: Check Current Schema in Supabase
-- ============================================================================
-- Run this FIRST to see what exists in your Supabase database
-- ============================================================================

-- Check if classification tables exist and what columns they have
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('user_classifications', 'classification_fee_structures')
ORDER BY table_name, ordinal_position;

-- Check all public tables (to see full schema)
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
