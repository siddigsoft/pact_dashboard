-- =============================================================================
-- Migration: Retainer payout currency + FX conversion support
-- Date: 2026-08-03
--
-- Adds retainer_payout_currency to user_classifications so a retainer can be
-- denominated in one currency (e.g. USD) but credited to the wallet in another
-- (e.g. SDG) using the exchange rate recorded in acct_exchange_rates at
-- processing time.
--
-- When retainer_payout_currency IS NULL or equals retainer_currency, the
-- existing behaviour is preserved (no conversion).
--
-- Safe to re-run: ALTER uses IF NOT EXISTS; view uses CREATE OR REPLACE.
-- =============================================================================

-- 1. Add column -----------------------------------------------------------------
ALTER TABLE public.user_classifications
  ADD COLUMN IF NOT EXISTS retainer_payout_currency text;

-- 2. Refresh view to expose the new column --------------------------------------
CREATE OR REPLACE VIEW public.current_user_classifications AS
SELECT DISTINCT ON (user_id)
  uc.id,
  uc.user_id,
  uc.classification_level,
  uc.role_scope,
  uc.effective_from,
  uc.effective_until,
  uc.has_retainer,
  uc.retainer_amount_cents,
  uc.retainer_currency,
  uc.retainer_payout_currency,
  uc.retainer_frequency,
  uc.is_active,
  uc.created_at,
  uc.updated_at,
  p.full_name,
  p.email,
  p.role AS user_role
FROM public.user_classifications uc
JOIN public.profiles p ON uc.user_id = p.id
WHERE uc.is_active = true
  AND uc.effective_from <= now()
  AND (uc.effective_until IS NULL OR uc.effective_until > now())
ORDER BY user_id, effective_from DESC;

-- 3. Update credit_retainer_wallet RPC to accept FX audit fields ----------------
--    p_base_currency / p_fx_rate are optional; when supplied they are recorded
--    in the transaction metadata so there is a full audit trail of what rate was
--    used for the conversion.
CREATE OR REPLACE FUNCTION public.credit_retainer_wallet(
  p_user_id         uuid,
  p_amount_cents    integer,
  p_currency        text,
  p_period          text,
  p_created_by      uuid    DEFAULT NULL,
  p_base_currency   text    DEFAULT NULL,
  p_fx_rate         numeric DEFAULT NULL
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
  v_metadata     jsonb;
BEGIN
  -- ── Authorization ────────────────────────────────────────────────────────
  SELECT role INTO v_caller_role
    FROM public.profiles
   WHERE id = auth.uid()::text;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('superAdmin', 'admin', 'financialAdmin') THEN
    RAISE EXCEPTION 'permission denied: only admin or financialAdmin may credit retainer wallets';
  END IF;

  -- ── Validate inputs ──────────────────────────────────────────────────────
  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'p_amount_cents must be positive';
  END IF;

  v_amount := p_amount_cents::numeric / 100;

  -- ── Build metadata (include FX fields when provided) ────────────────────
  v_metadata := jsonb_build_object('type', 'retainer', 'period', p_period);
  IF p_base_currency IS NOT NULL AND p_base_currency <> p_currency THEN
    v_metadata := v_metadata
      || jsonb_build_object('base_currency', p_base_currency)
      || jsonb_build_object('fx_rate', p_fx_rate);
  END IF;

  -- ── Fetch existing wallet ─────────────────────────────────────────────────
  SELECT id, balances, total_earned
    INTO v_wallet_id, v_cur_balances, v_cur_earned
    FROM public.wallets
   WHERE user_id = p_user_id
     FOR UPDATE;

  -- ── Create wallet if first ever credit ───────────────────────────────────
  IF NOT FOUND THEN
    INSERT INTO public.wallets (user_id, balances, total_earned)
    VALUES (p_user_id, jsonb_build_object(p_currency, v_amount), v_amount)
    RETURNING id, balances, total_earned
    INTO v_wallet_id, v_cur_balances, v_cur_earned;

    BEGIN
      INSERT INTO public.wallet_transactions (
        wallet_id, user_id, type, amount, amount_cents, currency,
        description, balance_before, balance_after, created_by, metadata
      ) VALUES (
        v_wallet_id, p_user_id, 'adjustment', v_amount, p_amount_cents, p_currency,
        'Monthly retainer - ' || p_period, 0, v_amount, p_created_by, v_metadata
      );
    EXCEPTION
      WHEN unique_violation THEN RETURN 'already_processed';
    END;

    RETURN 'ok';
  END IF;

  -- ── Existing wallet ───────────────────────────────────────────────────────
  v_cur_balance := COALESCE((v_cur_balances ->> p_currency)::numeric, 0);
  v_new_balance := ROUND(v_cur_balance + v_amount, 2);

  BEGIN
    INSERT INTO public.wallet_transactions (
      wallet_id, user_id, type, amount, amount_cents, currency,
      description, balance_before, balance_after, created_by, metadata
    ) VALUES (
      v_wallet_id, p_user_id, 'adjustment', v_amount, p_amount_cents, p_currency,
      'Monthly retainer - ' || p_period,
      v_cur_balance, v_new_balance, p_created_by, v_metadata
    );
  EXCEPTION
    WHEN unique_violation THEN RETURN 'already_processed';
  END;

  UPDATE public.wallets
     SET balances     = jsonb_set(v_cur_balances, ARRAY[p_currency], to_jsonb(v_new_balance)),
         total_earned = v_cur_earned + v_amount,
         updated_at   = now()
   WHERE id = v_wallet_id;

  RETURN 'ok';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.credit_retainer_wallet(uuid, integer, text, text, uuid, text, numeric)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.credit_retainer_wallet(uuid, integer, text, text, uuid, text, numeric)
  TO authenticated;
