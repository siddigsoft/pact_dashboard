-- =========================================
-- COST APPROVAL SYSTEM CLEANUP
-- =========================================
-- Run this BEFORE running COST_APPROVAL_SYSTEM.sql
-- This drops any old versions of tables/views with incorrect column names

-- Drop old views first (they might reference old table structure)
DROP VIEW IF EXISTS pending_cost_approvals CASCADE;
DROP VIEW IF EXISTS user_cost_submission_summary CASCADE;
DROP VIEW IF EXISTS mmp_cost_submission_summary CASCADE;

-- Drop old triggers
DROP TRIGGER IF EXISTS trg_record_cost_approval_action ON site_visit_cost_submissions;
DROP TRIGGER IF EXISTS trg_calculate_total_cost ON site_visit_cost_submissions;
DROP TRIGGER IF EXISTS trg_update_cost_submission_timestamp ON site_visit_cost_submissions;

-- Drop old functions
DROP FUNCTION IF EXISTS record_cost_approval_action();
DROP FUNCTION IF EXISTS calculate_total_cost_submission();
DROP FUNCTION IF EXISTS update_cost_submission_timestamp();

-- Drop old tables (this will also drop all dependent objects)
DROP TABLE IF EXISTS cost_approval_history CASCADE;
DROP TABLE IF EXISTS site_visit_cost_submissions CASCADE;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'CLEANUP COMPLETE!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'All old cost approval objects have been dropped.';
  RAISE NOTICE 'You can now run COST_APPROVAL_SYSTEM.sql';
  RAISE NOTICE '';
END $$;
