-- Add 'down_payment' to wallet_tx_type enum
-- This migration adds support for down payment transactions in the wallet system

DO $$ 
BEGIN
  -- Check if 'down_payment' already exists in the enum
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_enum 
    WHERE enumlabel = 'down_payment' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'wallet_tx_type')
  ) THEN
    -- Add 'down_payment' to the enum
    ALTER TYPE wallet_tx_type ADD VALUE 'down_payment';
  END IF;
END $$;

