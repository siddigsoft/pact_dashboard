-- =============================================================================
-- QUICK FIX: Update trigger to use 'earning' instead of 'site_visit_fee'
-- Run this if you're getting "invalid input value for enum wallet_tx_type: 'site_visit_fee'"
-- =============================================================================

-- Update the trigger function to use 'earning' type
CREATE OR REPLACE FUNCTION public.create_wallet_transaction_on_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id uuid;
  v_wallet_id uuid;
  v_amount numeric;
  v_amount_cents bigint;
  v_current_balance numeric;
  v_new_balance numeric;
  v_transaction_id uuid;
  v_site_name text;
BEGIN
  -- Only process if status changed to 'Completed' or 'completed'
  IF (NEW.status IS DISTINCT FROM OLD.status) 
     AND (LOWER(NEW.status) = 'completed')
     AND (OLD.status IS NULL OR LOWER(OLD.status) != 'completed') THEN
    
    -- Determine user to pay (priority: accepted_by > claimed_by > visit_completed_by)
    -- Handle type mismatch: accepted_by is text, others are uuid
    v_user_id := CASE
      WHEN NEW.accepted_by IS NOT NULL THEN 
        CASE 
          WHEN NEW.accepted_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
          THEN NEW.accepted_by::uuid
          ELSE NULL
        END
      WHEN NEW.claimed_by IS NOT NULL THEN NEW.claimed_by
      WHEN NEW.visit_completed_by IS NOT NULL THEN NEW.visit_completed_by
      ELSE NULL
    END;

    -- Skip if no user to pay
    IF v_user_id IS NULL THEN
      RAISE NOTICE 'No user to pay for site % (accepted_by: %, claimed_by: %, visit_completed_by: %)', 
        NEW.id, NEW.accepted_by, NEW.claimed_by, NEW.visit_completed_by;
      RETURN NEW;
    END IF;

    -- Calculate amount (priority: cost > enumerator_fee + transport_fee)
    v_amount := COALESCE(
      NULLIF(NEW.cost, 0),
      COALESCE(NEW.enumerator_fee, 0) + COALESCE(NEW.transport_fee, 0),
      0
    );

    -- Skip if amount is zero or negative
    IF v_amount <= 0 THEN
      RAISE NOTICE 'No fee amount for site % (cost: %, enumerator_fee: %, transport_fee: %)', 
        NEW.id, NEW.cost, NEW.enumerator_fee, NEW.transport_fee;
      RETURN NEW;
    END IF;

    v_amount_cents := ROUND(v_amount * 100)::bigint;
    v_site_name := COALESCE(NEW.site_name, 'Site');

    -- Check if transaction already exists for this site visit
    IF EXISTS (
      SELECT 1 FROM public.wallet_transactions
      WHERE (site_visit_id = NEW.id OR related_site_visit_id = NEW.id)
        AND type = 'earning'
    ) THEN
      RAISE NOTICE 'Wallet transaction already exists for site visit %', NEW.id;
      RETURN NEW;
    END IF;

    -- Get or create wallet
    SELECT id INTO v_wallet_id
    FROM public.wallets
    WHERE user_id = v_user_id;

    IF v_wallet_id IS NULL THEN
      -- Create new wallet
      INSERT INTO public.wallets (user_id, balances, total_earned, total_earned_cents, balance_cents)
      VALUES (
        v_user_id,
        jsonb_build_object('SDG', v_amount),
        v_amount,
        v_amount_cents,
        v_amount_cents
      )
      RETURNING id INTO v_wallet_id;

      v_current_balance := 0;
      v_new_balance := v_amount;
    ELSE
      -- Get current balance (prefer balance_cents if available, otherwise use balances JSONB)
      SELECT 
        COALESCE(
          CASE WHEN balance_cents IS NOT NULL THEN balance_cents / 100.0 ELSE NULL END,
          (balances->>'SDG')::numeric,
          0
        )
      INTO v_current_balance
      FROM public.wallets
      WHERE id = v_wallet_id;

      v_new_balance := v_current_balance + v_amount;

      -- Update wallet balance
      UPDATE public.wallets
      SET 
        balances = jsonb_set(
          COALESCE(balances, '{"SDG": 0}'::jsonb),
          '{SDG}',
          to_jsonb(v_new_balance)
        ),
        total_earned = COALESCE(total_earned, 0) + v_amount,
        total_earned_cents = COALESCE(total_earned_cents, 0) + v_amount_cents,
        balance_cents = ROUND(v_new_balance * 100)::bigint,
        updated_at = now()
      WHERE id = v_wallet_id;
    END IF;

    -- Create wallet transaction (using 'earning' type, not 'site_visit_fee')
    INSERT INTO public.wallet_transactions (
      wallet_id,
      user_id,
      type,
      amount,
      amount_cents,
      currency,
      site_visit_id,
      related_site_visit_id,
      description,
      balance_before,
      balance_after,
      status
    )
    VALUES (
      v_wallet_id,
      v_user_id,
      'earning',  -- FIXED: Changed from 'site_visit_fee' to 'earning'
      v_amount,
      v_amount_cents,
      'SDG',
      NEW.id,
      NEW.id,
      format('Site visit completed: %s', v_site_name),
      v_current_balance,
      v_new_balance,
      'pending'
    )
    RETURNING id INTO v_transaction_id;

    RAISE NOTICE 'Created wallet transaction % for site visit %: % SDG to user %', 
      v_transaction_id, NEW.id, v_amount, v_user_id;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- The trigger should already exist, but this ensures it's using the updated function
-- No need to recreate the trigger, just the function

