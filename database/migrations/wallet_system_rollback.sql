-- ====================================
-- PACT Wallet System Rollback
-- Restore to single-currency wallet system
-- ====================================

-- WARNING: This will delete new tables and restore old schema
-- Only run this if migration failed or needs to be reverted

-- Step 1: Drop new tables
DROP TABLE IF EXISTS site_visit_costs CASCADE;
DROP TABLE IF EXISTS withdrawal_requests CASCADE;

-- Step 2: Restore wallets table to old structure
ALTER TABLE wallets 
  DROP COLUMN IF EXISTS balances,
  DROP COLUMN IF EXISTS total_earned,
  DROP COLUMN IF EXISTS total_withdrawn;

ALTER TABLE wallets 
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'SDG'::text,
  ADD COLUMN IF NOT EXISTS balance_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_earned_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_paid_out_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_payout_cents bigint NOT NULL DEFAULT 0;

-- Step 3: Restore old wallet data from backup
UPDATE wallets w
SET 
  currency = COALESCE(b.currency, 'SDG'),
  balance_cents = COALESCE(b.balance_cents, 0),
  total_earned_cents = COALESCE(b.total_earned_cents, 0),
  total_paid_out_cents = COALESCE(b.total_paid_out_cents, 0),
  pending_payout_cents = COALESCE(b.pending_payout_cents, 0)
FROM wallets_backup b
WHERE w.id = b.id;

-- Step 4: Drop backup table
DROP TABLE IF EXISTS wallets_backup;

-- Step 5: Drop new triggers
DROP TRIGGER IF EXISTS auto_create_wallet ON profiles;
DROP TRIGGER IF EXISTS update_wallets_updated_at ON wallets;
DROP TRIGGER IF EXISTS update_withdrawal_requests_updated_at ON withdrawal_requests;
DROP TRIGGER IF EXISTS update_site_visit_costs_updated_at ON site_visit_costs;

-- Step 6: Drop new functions
DROP FUNCTION IF EXISTS create_wallet_for_user();
DROP FUNCTION IF EXISTS update_updated_at_column();

-- ====================================
-- Rollback Complete!
-- ====================================
-- The database has been restored to the old wallet schema
-- You can now re-run the migration or investigate issues
-- ====================================
