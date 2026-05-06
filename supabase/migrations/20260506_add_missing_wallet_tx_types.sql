-- Fix: add missing wallet_tx_type enum values
-- 'reward'       — required by the acct_bridge_wallet_reward trigger (20260520_acct_phase2_gl_bridges.sql)
--                  The trigger fires on every wallet_transactions INSERT and compares new.type = 'reward'.
--                  PostgreSQL casts the literal to the enum at comparison time, so if 'reward' is absent
--                  the cast fails with "invalid input value for enum wallet_tx_type: reward" and ALL
--                  wallet_transactions inserts are blocked.
-- 'wallet_credit' — used by the credit-task-reward edge function when posting task reward credits.

DO $$ BEGIN
  ALTER TYPE wallet_tx_type ADD VALUE IF NOT EXISTS 'reward';
EXCEPTION WHEN others THEN null; END $$;

DO $$ BEGIN
  ALTER TYPE wallet_tx_type ADD VALUE IF NOT EXISTS 'wallet_credit';
EXCEPTION WHEN others THEN null; END $$;
