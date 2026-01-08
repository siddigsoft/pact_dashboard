-- =============================================================================
-- QUICK FIX: Create wallet transactions for 4 specific sites
-- Run this to immediately fix the 4 sites shown in the query results
-- =============================================================================

-- Site IDs to fix
-- 1ce9fb02-e17b-48e3-a21f-0e687989d390 - HAY ALARAB
-- 7a1e75d0-c77d-46c8-8d23-08f1a9f9cc33 - KABUSHI
-- 592da95b-6717-4665-bb7b-b4b30b9617cb - ALSHARGEY8
-- f9513f1d-5dea-4a1f-84a8-551ab2ba3bd6 - BASABIR

DO $$
DECLARE
  site_record RECORD;
  v_user_id uuid;
  v_wallet_id uuid;
  v_amount numeric;
  v_amount_cents bigint;
  v_current_balance numeric;
  v_new_balance numeric;
  v_transaction_id uuid;
BEGIN
  -- Loop through the 4 sites
  FOR site_record IN 
    SELECT 
      id,
      site_name,
      accepted_by,
      claimed_by,
      visit_completed_by,
      cost,
      enumerator_fee,
      transport_fee
    FROM mmp_site_entries
    WHERE id IN (
      '1ce9fb02-e17b-48e3-a21f-0e687989d390',
      '7a1e75d0-c77d-46c8-8d23-08f1a9f9cc33',
      '592da95b-6717-4665-bb7b-b4b30b9617cb',
      'f9513f1d-5dea-4a1f-84a8-551ab2ba3bd6'
    )
    AND NOT EXISTS (
      SELECT 1 
      FROM wallet_transactions wt
      WHERE (wt.site_visit_id = site_record.id OR wt.related_site_visit_id = site_record.id)
        AND wt.type = 'earning'
    )
  LOOP
    -- Determine user to pay
    v_user_id := CASE
      WHEN site_record.accepted_by IS NOT NULL 
        AND site_record.accepted_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
        THEN site_record.accepted_by::uuid
      WHEN site_record.claimed_by IS NOT NULL THEN site_record.claimed_by
      WHEN site_record.visit_completed_by IS NOT NULL THEN site_record.visit_completed_by
      ELSE NULL
    END;

    IF v_user_id IS NULL THEN
      RAISE NOTICE 'Skipping site % - no user to pay', site_record.id;
      CONTINUE;
    END IF;

    -- Calculate amount
    v_amount := COALESCE(
      NULLIF(site_record.cost, 0),
      COALESCE(site_record.enumerator_fee, 0) + COALESCE(site_record.transport_fee, 0),
      0
    );

    IF v_amount <= 0 THEN
      RAISE NOTICE 'Skipping site % - no amount to pay', site_record.id;
      CONTINUE;
    END IF;

    v_amount_cents := ROUND(v_amount * 100)::bigint;

    -- Get or create wallet
    SELECT id INTO v_wallet_id
    FROM wallets
    WHERE user_id = v_user_id;

    IF v_wallet_id IS NULL THEN
      -- Create new wallet
      INSERT INTO wallets (user_id, balances, total_earned, total_earned_cents, balance_cents)
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
      
      RAISE NOTICE 'Created new wallet % for user %', v_wallet_id, v_user_id;
    ELSE
      -- Get current balance
      SELECT 
        COALESCE((balances->>'SDG')::numeric, COALESCE(balance_cents, 0) / 100.0, 0)
      INTO v_current_balance
      FROM wallets
      WHERE id = v_wallet_id;

      v_new_balance := v_current_balance + v_amount;

      -- Update wallet balance
      UPDATE wallets
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

    -- Create wallet transaction
    INSERT INTO wallet_transactions (
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
      'earning',
      v_amount,
      v_amount_cents,
      'SDG',
      site_record.id,
      site_record.id,
      format('Site visit completed: %s', site_record.site_name),
      v_current_balance,
      v_new_balance,
      'pending'
    )
    RETURNING id INTO v_transaction_id;

    RAISE NOTICE '✅ Created transaction % for site % (%): % SDG to user %', 
      v_transaction_id, site_record.id, site_record.site_name, v_amount, v_user_id;

  END LOOP;

  RAISE NOTICE '✅ Completed processing all sites';
END $$;

-- Verify the results
SELECT 
  mse.id,
  mse.site_name,
  mse.status,
  wt.id as transaction_id,
  wt.amount as transaction_amount,
  wt.created_at as transaction_created_at,
  w.balances->>'SDG' as wallet_balance
FROM mmp_site_entries mse
LEFT JOIN wallet_transactions wt ON (
  (wt.site_visit_id = mse.id OR wt.related_site_visit_id = mse.id)
  AND wt.type IN ('earning', 'site_visit_fee')
)
LEFT JOIN wallets w ON w.user_id = 'ffe061ba-17d5-4a19-b8ec-6909b4251c6a'::uuid
WHERE mse.id IN (
  '1ce9fb02-e17b-48e3-a21f-0e687989d390',
  '7a1e75d0-c77d-46c8-8d23-08f1a9f9cc33',
  '592da95b-6717-4665-bb7b-b4b30b9617cb',
  'f9513f1d-5dea-4a1f-84a8-551ab2ba3bd6'
)
ORDER BY mse.site_name;

