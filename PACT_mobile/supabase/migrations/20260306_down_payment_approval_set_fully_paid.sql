-- =============================================================================
-- When an advance is approved and the wallet is credited (process_down_payment_approval),
-- also set total_paid_amount and status = 'fully_paid' on the request so that
-- site completion deduction finds the advance and so mobile receipt confirmation works.
-- =============================================================================

CREATE OR REPLACE FUNCTION process_down_payment_approval()
RETURNS TRIGGER AS $$
DECLARE
  user_wallet RECORD;
  transaction_record RECORD;
  no_txn_yet boolean;
BEGIN
  -- Check "no transaction yet" (wallet_transaction_ids is JSONB)
  no_txn_yet := (
    NEW.wallet_transaction_ids IS NULL
    OR jsonb_array_length(COALESCE(NEW.wallet_transaction_ids, '[]'::jsonb)) = 0
  );

  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') AND no_txn_yet THEN
    -- Get user's wallet (support balance_cents or balances->>'SDG')
    SELECT * INTO user_wallet
    FROM wallets
    WHERE user_id = NEW.requested_by;

    IF user_wallet IS NULL THEN
      RAISE EXCEPTION 'Wallet not found for user %', NEW.requested_by;
    END IF;

    -- Create wallet transaction
    INSERT INTO wallet_transactions (
      wallet_id,
      user_id,
      type,
      amount,
      amount_cents,
      currency,
      description,
      balance_before,
      balance_after,
      metadata,
      created_at
    ) VALUES (
      user_wallet.id,
      NEW.requested_by,
      'down_payment_advance',
      NEW.requested_amount,
      (NEW.requested_amount * 100)::bigint,
      'SDG',
      format('Down-payment advance for %s', NEW.site_name),
      COALESCE(
        (user_wallet.balance_cents::numeric / 100.0),
        (user_wallet.balances->>'SDG')::numeric,
        0
      ),
      COALESCE(
        (user_wallet.balance_cents::numeric / 100.0),
        (user_wallet.balances->>'SDG')::numeric,
        0
      ),
      jsonb_build_object(
        'down_payment_request_id', NEW.id,
        'site_name', NEW.site_name,
        'payment_type', NEW.payment_type
      ),
      NOW()
    ) RETURNING id INTO transaction_record;

    -- Add to total_earned only. Do NOT add to balance: balance = money not yet received (DB source of truth).
    UPDATE wallets
    SET
      total_earned = COALESCE(total_earned, 0) + NEW.requested_amount,
      total_earned_cents = COALESCE(total_earned_cents, 0) + (NEW.requested_amount * 100)::bigint,
      updated_at = NOW()
    WHERE id = user_wallet.id;

    -- Mark the advance as fully paid so completion deduction and mobile receipt confirmation work.
    -- Append transaction id to wallet_transaction_ids (JSONB array).
    UPDATE down_payment_requests
    SET
      total_paid_amount = NEW.requested_amount,
      remaining_amount = 0,
      status = 'fully_paid',
      wallet_transaction_ids = COALESCE(wallet_transaction_ids, '[]'::jsonb) || jsonb_build_array(transaction_record.id::text),
      updated_at = NOW()
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
