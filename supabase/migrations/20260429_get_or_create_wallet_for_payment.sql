-- get_or_create_wallet_for_payment
-- SECURITY DEFINER so financial admins / admins can read+create wallets
-- for any user without RLS blocking them.
-- Returns: { wallet_id: uuid, balances: jsonb }

CREATE OR REPLACE FUNCTION public.get_or_create_wallet_for_payment(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id uuid;
  v_balances  jsonb;
BEGIN
  -- Ensure profile row exists (wallets.user_id → profiles.id FK)
  INSERT INTO public.profiles (id)
  VALUES (p_user_id)
  ON CONFLICT (id) DO NOTHING;

  -- Ensure wallet exists
  INSERT INTO public.wallets (
    user_id, currency, balance_cents,
    total_earned_cents, total_paid_out_cents,
    pending_payout_cents, balances, total_earned
  )
  VALUES (p_user_id, 'SDG', 0, 0, 0, 0, '{"SDG": 0}'::jsonb, 0)
  ON CONFLICT (user_id) DO NOTHING;

  -- Fetch wallet (SECURITY DEFINER bypasses RLS on SELECT)
  SELECT id, COALESCE(balances, '{"SDG": 0}'::jsonb)
  INTO  v_wallet_id, v_balances
  FROM  public.wallets
  WHERE user_id = p_user_id
  LIMIT 1;

  IF v_wallet_id IS NULL THEN
    RAISE EXCEPTION 'Wallet could not be created for user %', p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'wallet_id', v_wallet_id,
    'balances',  v_balances
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'get_or_create_wallet_for_payment failed for %: % (%)',
                p_user_id, SQLERRM, SQLSTATE;
  RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_wallet_for_payment(uuid)
  TO authenticated;
