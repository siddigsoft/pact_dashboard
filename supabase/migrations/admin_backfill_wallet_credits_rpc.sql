-- ============================================================
-- Admin Backfill Wallet Credits RPC
-- SECURITY DEFINER: runs as the function owner (postgres),
-- bypassing ALL RLS policies on wallets and wallet_transactions.
-- No policy tweaks needed — this is the single reliable path
-- for admin-initiated backfill of historical site visit credits.
--
-- Apply via: Supabase Dashboard → SQL Editor → run this file.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_backfill_site_visit_credit(
  p_site_visit_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry           RECORD;
  v_user_id         uuid;
  v_amount          numeric;
  v_wallet          RECORD;
  v_wallet_id       uuid;
  v_current_balance numeric;
  v_new_balance     numeric;
  v_tx_id           uuid;
BEGIN
  -- ── 1. Fetch site entry ──────────────────────────────────────────────────
  SELECT id, site_name, site_code, status,
         accepted_by, visit_completed_by,
         enumerator_fee, transport_fee, cost
  INTO v_entry
  FROM public.mmp_site_entries
  WHERE id = p_site_visit_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Site entry not found');
  END IF;

  -- ── 2. Resolve payee UUID (visit_completed_by → accepted_by) ────────────
  -- accepted_by is stored as text; cast only when it looks like a uuid.
  v_user_id := COALESCE(
    v_entry.visit_completed_by::uuid,
    CASE
      WHEN v_entry.accepted_by ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      THEN v_entry.accepted_by::uuid
      ELSE NULL
    END
  );

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'No valid payee UUID in visit_completed_by or accepted_by');
  END IF;

  -- ── 3. Verify payee exists in profiles (FK requirement) ──────────────────
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', format('Payee %s not found in profiles (may be a deleted user)', v_user_id)
    );
  END IF;

  -- ── 4. Calculate fee amount ──────────────────────────────────────────────
  v_amount := COALESCE(v_entry.enumerator_fee, 0) + COALESCE(v_entry.transport_fee, 0);
  IF v_amount <= 0 THEN
    v_amount := COALESCE(v_entry.cost, 0);
  END IF;

  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'No fee amount found (enumerator_fee + transport_fee = 0, cost = 0)');
  END IF;

  -- ── 5. Duplicate check ───────────────────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM public.wallet_transactions
    WHERE site_visit_id = p_site_visit_id
       OR related_site_visit_id = p_site_visit_id
  ) THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already credited (duplicate skipped)', 'skipped', true);
  END IF;

  -- ── 6. Get or create wallet ──────────────────────────────────────────────
  SELECT id,
         COALESCE((balances->>'SDG')::numeric, 0) AS sdg_balance,
         COALESCE(total_earned, 0)               AS total_earned
  INTO v_wallet
  FROM public.wallets
  WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    -- Create wallet — all NOT NULL columns have DEFAULT 0, safe to omit them
    INSERT INTO public.wallets (user_id, balances, total_earned)
    VALUES (v_user_id, jsonb_build_object('SDG', 0), 0)
    RETURNING id,
              COALESCE((balances->>'SDG')::numeric, 0),
              COALESCE(total_earned, 0)
    INTO v_wallet_id, v_current_balance, v_current_balance;

    -- Re-select to get the full record properly
    SELECT id,
           COALESCE((balances->>'SDG')::numeric, 0) AS sdg_balance,
           COALESCE(total_earned, 0)               AS total_earned
    INTO v_wallet
    FROM public.wallets
    WHERE user_id = v_user_id;
  END IF;

  v_wallet_id       := v_wallet.id;
  v_current_balance := COALESCE(v_wallet.sdg_balance, 0);
  v_new_balance     := v_current_balance + v_amount;

  -- ── 7. Insert wallet transaction ─────────────────────────────────────────
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
    metadata
  ) VALUES (
    v_wallet_id,
    v_user_id,
    'earning',
    v_amount,
    ROUND(v_amount * 100)::bigint,
    'SDG',
    p_site_visit_id,
    p_site_visit_id,
    format('Site visit fee: %s (%s)', COALESCE(v_entry.site_name, 'Unknown'), COALESCE(v_entry.site_code, '')),
    v_current_balance,
    v_new_balance,
    jsonb_build_object(
      'site_name', v_entry.site_name,
      'site_code', v_entry.site_code,
      'enumerator_fee', v_entry.enumerator_fee,
      'transport_fee', v_entry.transport_fee,
      'backfill', true
    )
  )
  RETURNING id INTO v_tx_id;

  -- ── 8. Update wallet balance ─────────────────────────────────────────────
  UPDATE public.wallets
  SET
    balances     = jsonb_set(COALESCE(balances, '{}'::jsonb), '{SDG}', to_jsonb(v_new_balance)),
    total_earned = COALESCE(total_earned, 0) + v_amount,
    balance_cents = ROUND(v_new_balance * 100)::bigint,
    total_earned_cents = COALESCE(total_earned_cents, 0) + ROUND(v_amount * 100)::bigint,
    updated_at   = now()
  WHERE id = v_wallet_id;

  RETURN jsonb_build_object(
    'success',     true,
    'message',     format('Credited %s SDG to user %s', v_amount, v_user_id),
    'tx_id',       v_tx_id,
    'wallet_id',   v_wallet_id,
    'amount',      v_amount
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'message', SQLERRM,
    'detail',  SQLSTATE
  );
END;
$$;

-- Grant execute to authenticated users (RLS controls who calls it via the JS check)
GRANT EXECUTE ON FUNCTION public.admin_backfill_site_visit_credit(uuid) TO authenticated;
