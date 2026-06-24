-- ============================================================================
-- PACT Command Center — Pre-Funding Migration Verification Script
-- Run this in the Supabase SQL Editor AFTER applying pre_funding_migration.sql
-- All queries should return the expected results shown in the comments.
-- ============================================================================

-- ─── 1. Table existence ───────────────────────────────────────────────────────
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'pre_fund_period_types',
    'pre_fund_settings',
    'pre_fund_requests',
    'pre_fund_approval_steps',
    'pre_fund_transactions',
    'pre_fund_reconciliations',
    'pre_fund_bank_unmatched'
  )
ORDER BY table_name;
-- Expected: 7 rows — all 7 table names listed above

-- ─── 2. Seed data — period types ─────────────────────────────────────────────
SELECT name, day_count, is_builtin, display_order
FROM pre_fund_period_types
ORDER BY display_order;
-- Expected: 7 rows (Weekly, Bi-weekly, Monthly, Quarterly, Annual, Project Duration, Custom)

-- ─── 3. Settings singleton ───────────────────────────────────────────────────
SELECT base_currency, default_threshold_pct, default_warning_days
FROM pre_fund_settings;
-- Expected: 1 row with defaults (USD, 20, 14)

-- ─── 4. RLS enabled on all tables ────────────────────────────────────────────
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'pre_fund_period_types',
    'pre_fund_settings',
    'pre_fund_requests',
    'pre_fund_approval_steps',
    'pre_fund_transactions',
    'pre_fund_reconciliations',
    'pre_fund_bank_unmatched'
  )
ORDER BY tablename;
-- Expected: 7 rows, all with rowsecurity = true

-- ─── 5. RLS policies ─────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename LIKE 'pre_fund_%'
ORDER BY tablename, policyname;
-- Expected: at least 9 policies across the 7 tables

-- ─── 6. GL account seeds ─────────────────────────────────────────────────────
SELECT code, name, type, normal_balance, is_active
FROM acct_accounts
WHERE code IN ('2400', '2401')
ORDER BY code;
-- Expected: 2 rows — Pre-Fund Liability (2400) and Pre-Fund Liability Next Period (2401)

-- ─── 7. Indexes ──────────────────────────────────────────────────────────────
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename LIKE 'pre_fund_%'
ORDER BY tablename, indexname;
-- Expected: at least 5 indexes (pf_approval_steps, pf_transactions x3, pf_recons, pf_bank_unmatched)

-- ─── 8. Column additions to existing tables ───────────────────────────────────
SELECT column_name, table_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'pre_fund_transaction_id'
  AND table_name IN ('operational_cost_submissions', 'down_payment_requests', 'acct_budget_encumbrances')
ORDER BY table_name;
-- Expected: up to 3 rows (only for tables that exist in your schema)

SELECT column_name, table_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'pre_fund_request_id'
  AND table_name = 'acct_bank_statement_lines';
-- Expected: 1 row if acct_bank_statement_lines exists in your schema

-- ─── 9. Rejection tracking columns on pre_fund_requests ──────────────────────
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'pre_fund_requests'
  AND column_name IN ('approved_by', 'approved_at', 'rejection_reason')
ORDER BY column_name;
-- Expected: 3 rows

-- ─── 10. Renewal check function ──────────────────────────────────────────────
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('run_pre_fund_renewal_check', 'store_pre_fund_bank_key', 'update_pre_fund_updated_at');
-- Expected: 3 rows

-- ─── All checks passed? ───────────────────────────────────────────────────────
-- If all queries above return the expected row counts and values,
-- the Pre-Funding migration is fully applied and ready to use.
-- Open /pre-funding in the app to get started.
