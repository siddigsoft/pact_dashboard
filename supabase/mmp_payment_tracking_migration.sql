-- MMP Payment Tracking Migration
-- Run this in your Supabase SQL editor to enable per-cycle payment request tracking
-- and exchange rate fee locking.
--
-- Step 1: Add payment_tracking JSONB column to mmp_files
-- -------------------------------------------------------
ALTER TABLE mmp_files
  ADD COLUMN IF NOT EXISTS payment_tracking JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN mmp_files.payment_tracking IS
  'Tracks payment request/confirmation timestamps and exchange rate for each MMP cycle close.
   Structure: {
     payment_requested_at: ISO timestamp,
     payment_requested_by: user_id,
     payment_note: optional string,
     payments_confirmed_at: ISO timestamp,
     payments_confirmed_by: user_id,
     exchange_rate_applied: number (1 USD = X SDG),
     exchange_rate_applied_at: ISO timestamp,
     exchange_rate_applied_by: user_id,
     exchange_rate_sites_updated: number
   }';

-- Optional: GIN index for querying MMP files that have pending payment requests
CREATE INDEX IF NOT EXISTS idx_mmp_files_payment_tracking
  ON mmp_files USING GIN (payment_tracking);


-- Step 2: Add mmp_fee wallet transaction type (if wallet_transactions.type is an enum)
-- --------------------------------------------------------------------------------------
-- Run this ONLY if your wallet_transactions table uses a PostgreSQL enum for the type column.
-- Check first: SELECT pg_typeof(type) FROM wallet_transactions LIMIT 1;
-- If it returns 'text' you can skip this block.
-- If it returns a custom enum name, run:

DO $$
BEGIN
  -- Try to add the value; silently skip if the type column is not an enum or value already exists
  BEGIN
    ALTER TYPE wallet_transaction_type ADD VALUE IF NOT EXISTS 'mmp_fee';
  EXCEPTION
    WHEN undefined_object THEN NULL;  -- enum type doesn't exist — column is plain text, skip
    WHEN duplicate_object THEN NULL;  -- value already exists, skip
  END;
END $$;
