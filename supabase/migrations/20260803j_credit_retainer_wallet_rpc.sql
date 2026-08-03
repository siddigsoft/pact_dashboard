-- credit_retainer_wallet: atomic RPC that inserts the transaction record AND
-- updates the wallet balance inside a single DB transaction so an interrupted
-- mid-write can never leave the two out of sync.
--
-- Authorization: caller must be authenticated with role superAdmin, admin, or
-- financialAdmin as recorded in public.profiles.  Any other caller gets a
-- permission-denied exception before any write is attempted.
--
-- The existing partial unique index  wallet_transactions_retainer_unique
-- (user_id, metadata->>'period') WHERE metadata->>'type' = 'retainer'
-- is still the idempotency gate: a duplicate call gets unique_violation and
-- the function returns 'already_processed' without touching the balance.
--
-- Returns: 'ok' | 'already_processed'

CREATE OR REPLACE FUNCTION public.credit_retainer_wallet(
  p_user_id      uuid,
  p_amount_cents integer,
  p_currency     text,
  p_period       text,
  p_created_by   uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role  text;
  v_amount       numeric;
  v_wallet_id    uuid;
  v_cur_balances jsonb;
  v_cur_earned   numeric;
  v_cur_balance  numeric;
  v_new_balance  numeric;
BEGIN
  -- ── Authorization ────────────────────────────────────────────────────────
  -- Only superAdmin, admin, and finance_admin may credit retainers.
  -- auth.uid() returns NULL when called outside an authenticated session,
  -- which will correctly fail the role lookup and raise the exception below.
  SELECT role INTO v_caller_role
    FROM public.profiles
   WHERE id = auth.uid()::text;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('superAdmin', 'admin', 'financialAdmin') THEN
    RAISE EXCEPTION 'permission denied: only admin or finance_admin may credit retainer wallets';
  END IF;

  -- ── Validate inputs ──────────────────────────────────────────────────────
  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'p_amount_cents must be positive';
  END IF;

  v_amount := p_amount_cents::numeric / 100;

  -- ── Fetch existing wallet ─────────────────────────────────────────────────
  SELECT id, balances, total_earned
    INTO v_wallet_id, v_cur_balances, v_cur_earned
    FROM public.wallets
   WHERE user_id = p_user_id
     FOR UPDATE;   -- row-lock so concurrent calls serialise on this user

  -- ── Create wallet if first ever credit ───────────────────────────────────
  IF NOT FOUND THEN
    INSERT INTO public.wallets (user_id, balances, total_earned)
    VALUES (
      p_user_id,
      jsonb_build_object(p_currency, v_amount),
      v_amount
    )
    RETURNING id, balances, total_earned
    INTO v_wallet_id, v_cur_balances, v_cur_earned;

    BEGIN
      INSERT INTO public.wallet_transactions (
        wallet_id, user_id, type, amount, amount_cents, currency,
        description, balance_before, balance_after, created_by, metadata
      ) VALUES (
        v_wallet_id, p_user_id, 'adjustment', v_amount, p_amount_cents, p_currency,
        'Monthly retainer - ' || p_period, 0, v_amount,
        p_created_by, jsonb_build_object('type', 'retainer', 'period', p_period)
      );
    EXCEPTION
      WHEN unique_violation THEN
        RETURN 'already_processed';
    END;

    RETURN 'ok';
  END IF;

  -- ── Existing wallet: compute new balance ─────────────────────────────────
  v_cur_balance := COALESCE((v_cur_balances ->> p_currency)::numeric, 0);
  v_new_balance := ROUND(v_cur_balance + v_amount, 2);

  -- ── Insert transaction first — unique index fires here on duplicate ───────
  BEGIN
    INSERT INTO public.wallet_transactions (
      wallet_id, user_id, type, amount, amount_cents, currency,
      description, balance_before, balance_after, created_by, metadata
    ) VALUES (
      v_wallet_id, p_user_id, 'adjustment', v_amount, p_amount_cents, p_currency,
      'Monthly retainer - ' || p_period,
      v_cur_balance, v_new_balance,
      p_created_by, jsonb_build_object('type', 'retainer', 'period', p_period)
    );
  EXCEPTION
    WHEN unique_violation THEN
      RETURN 'already_processed';
  END;

  -- ── Update wallet balance — runs only if transaction insert succeeded ─────
  UPDATE public.wallets
     SET balances     = jsonb_set(v_cur_balances, ARRAY[p_currency], to_jsonb(v_new_balance)),
         total_earned = v_cur_earned + v_amount,
         updated_at   = now()
   WHERE id = v_wallet_id;

  RETURN 'ok';
END;
$$;

-- Restrict to authenticated only; the role check inside the function is the
-- real gate.  service_role already has implicit EXECUTE via SECURITY DEFINER.
REVOKE EXECUTE ON FUNCTION public.credit_retainer_wallet(uuid, integer, text, text, uuid)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.credit_retainer_wallet(uuid, integer, text, text, uuid)
  TO authenticated;
