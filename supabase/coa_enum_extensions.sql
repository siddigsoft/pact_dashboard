-- ============================================================
-- STEP 1 of 3 — Run this file FIRST, then click Run.
-- Wait for success before running coa_rw_qa_us_ke_migration.sql
--
-- Why: PostgreSQL requires ALTER TYPE...ADD VALUE to be committed
-- in its own transaction before the new enum values can be used
-- in INSERT/UPDATE statements.
-- ============================================================

-- Extend acct_account_subtype enum with COA-specific subtypes.
-- ADD VALUE IF NOT EXISTS is idempotent — safe to run again.

ALTER TYPE acct_account_subtype ADD VALUE IF NOT EXISTS 'header';
ALTER TYPE acct_account_subtype ADD VALUE IF NOT EXISTS 'fixed_asset';
ALTER TYPE acct_account_subtype ADD VALUE IF NOT EXISTS 'other_asset';
ALTER TYPE acct_account_subtype ADD VALUE IF NOT EXISTS 'investment';
ALTER TYPE acct_account_subtype ADD VALUE IF NOT EXISTS 'grant';
ALTER TYPE acct_account_subtype ADD VALUE IF NOT EXISTS 'other_income';
ALTER TYPE acct_account_subtype ADD VALUE IF NOT EXISTS 'personnel';
ALTER TYPE acct_account_subtype ADD VALUE IF NOT EXISTS 'travel';
ALTER TYPE acct_account_subtype ADD VALUE IF NOT EXISTS 'program';
ALTER TYPE acct_account_subtype ADD VALUE IF NOT EXISTS 'admin';
ALTER TYPE acct_account_subtype ADD VALUE IF NOT EXISTS 'supplies';
ALTER TYPE acct_account_subtype ADD VALUE IF NOT EXISTS 'indirect';
ALTER TYPE acct_account_subtype ADD VALUE IF NOT EXISTS 'unrestricted';
ALTER TYPE acct_account_subtype ADD VALUE IF NOT EXISTS 'restricted';
ALTER TYPE acct_account_subtype ADD VALUE IF NOT EXISTS 'retained_earnings';

-- Confirm
DO $$ BEGIN RAISE NOTICE '✅ Enum extensions committed — proceed to run coa_rw_qa_us_ke_migration.sql'; END $$;
