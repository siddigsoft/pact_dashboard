-- Add 'down_payment_advance' to wallet_tx_type enum
-- Required for process_down_payment_approval() trigger when approving advances

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'down_payment_advance'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'wallet_tx_type')
  ) THEN
    ALTER TYPE wallet_tx_type ADD VALUE 'down_payment_advance';
  END IF;
END $$;
