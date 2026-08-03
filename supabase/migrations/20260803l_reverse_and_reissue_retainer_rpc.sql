-- =============================================================================
-- Migration: reverse_and_reissue_retainer RPC
-- Date: 2026-08-03
--
-- Atomically reverses a fallback (base-currency) retainer payment and
-- re-issues it in the correct payout currency.  All three writes happen
-- inside one DB transaction so no mid-step corruption is possible:
--   1. Look up the current FX rate (hard error if still missing).
--   2. Find the existing fallback transaction for user+period; read its
--      original amount directly so classification changes don't affect the
--      reversal/reissue calculation.
--   3. Verify the wallet has the full fallback amount available; if not, abort
--      with status 'insufficient_balance' — no data is mutated.
--   4. Delete the fallback transaction (clears the idempotency gate).
--   5. Subtract the exact fallback amount from the wallet balance.
--   6. Re-credit in the payout currency at the current FX rate.
--
-- Returns JSONB:
--   { "status": "ok",                 "reissued_currency": "<cur>", "reissued_amount": <n> }
--   { "status": "no_fx_rate",         "message": "..." }
--   { "status": "no_fallback_tx",     "message": "..." }
--   { "status": "already_correct",    "message": "..." }
--   { "status": "insufficient_balance", "message": "..." }
--
-- Authorization: superAdmin / admin / financialAdmin (same as credit_retainer_wallet).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reverse_and_reissue_retainer(
  p_user_id               uuid,
  p_period                text,
  p_base_currency         text,
  p_payout_currency       text,
  p_created_by            uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role         text;
  v_fx_rate             numeric;
  v_fallback_tx_id      uuid;
  v_fallback_amount     numeric;
  v_fallback_cents      integer;
  v_fallback_currency   text;
  v_payout_cents        integer;
  v_payout_amount       numeric;
  v_wallet_id           uuid;
  v_cur_balances        jsonb;
  v_cur_earned          numeric;
  v_base_balance        numeric;
  v_new_base_balance    numeric;
  v_payout_balance      numeric;
  v_new_payout_bal      numeric;
  v_metadata            jsonb;
  v_today               date;
BEGIN
  -- ── Authorization ────────────────────────────────────────────────────────
  SELECT role INTO v_caller_role
    FROM public.profiles
   WHERE id = auth.uid()::text;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('superAdmin', 'admin', 'financialAdmin') THEN
    RAISE EXCEPTION 'permission denied: only admin or financialAdmin may reprocess retainer wallets';
  END IF;

  v_today := CURRENT_DATE;

  -- ── 1. Look up the current FX rate ───────────────────────────────────────
  SELECT rate INTO v_fx_rate
    FROM public.acct_exchange_rates
   WHERE from_currency = p_base_currency
     AND to_currency   = p_payout_currency
     AND effective_date <= v_today
   ORDER BY effective_date DESC
   LIMIT 1;

  IF v_fx_rate IS NULL THEN
    RETURN jsonb_build_object(
      'status',  'no_fx_rate',
      'message', 'No exchange rate found for ' || p_base_currency || '→' || p_payout_currency ||
                 ' on or before ' || v_today
    );
  END IF;

  -- ── 2. Find the fallback transaction for this period ─────────────────────
  --    Read amount and amount_cents from the transaction itself so that any
  --    subsequent classification changes do not affect what we reverse/reissue.
  SELECT id, amount, amount_cents, currency
    INTO v_fallback_tx_id, v_fallback_amount, v_fallback_cents, v_fallback_currency
    FROM public.wallet_transactions
   WHERE user_id              = p_user_id
     AND metadata->>'type'   = 'retainer'
     AND metadata->>'period' = p_period
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status',  'no_fallback_tx',
      'message', 'No retainer transaction found for period ' || p_period
    );
  END IF;

  -- If the existing transaction is already in the payout currency the payment
  -- was either already reprocessed or never needed a fallback — nothing to do.
  IF v_fallback_currency = p_payout_currency THEN
    RETURN jsonb_build_object(
      'status',  'already_correct',
      'message', 'Transaction is already denominated in the payout currency (' || p_payout_currency || ')'
    );
  END IF;

  -- ── 3. Lock wallet and check available balance BEFORE any mutation ────────
  SELECT id, balances, total_earned
    INTO v_wallet_id, v_cur_balances, v_cur_earned
    FROM public.wallets
   WHERE user_id = p_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status',  'no_fallback_tx',
      'message', 'Wallet not found for user'
    );
  END IF;

  v_base_balance := COALESCE((v_cur_balances ->> v_fallback_currency)::numeric, 0);

  IF v_base_balance < v_fallback_amount THEN
    -- Refuse to reprocess: the member spent part of the fallback already.
    -- No data has been mutated — safe to return the error status.
    RETURN jsonb_build_object(
      'status',  'insufficient_balance',
      'message', 'Fallback-currency balance (' || v_base_balance || ' ' || v_fallback_currency ||
                 ') is less than the original retainer amount (' || v_fallback_amount || ' ' || v_fallback_currency ||
                 '). Manually adjust the balance before reprocessing.'
    );
  END IF;

  -- ── 4. Delete the fallback transaction (clears idempotency gate) ──────────
  DELETE FROM public.wallet_transactions WHERE id = v_fallback_tx_id;

  -- ── 5. Reverse wallet balance for the fallback currency ───────────────────
  v_new_base_balance := ROUND(v_base_balance - v_fallback_amount, 2);

  UPDATE public.wallets
     SET balances     = jsonb_set(v_cur_balances, ARRAY[v_fallback_currency], to_jsonb(v_new_base_balance)),
         total_earned = GREATEST(0, v_cur_earned - v_fallback_amount),
         updated_at   = now()
   WHERE id = v_wallet_id
  RETURNING balances, total_earned INTO v_cur_balances, v_cur_earned;

  -- ── 6. Re-credit in the payout currency ──────────────────────────────────
  --    Reissue amount is based on the original fallback transaction's amount_cents
  --    (not the current classification) so the reversal and reissue are symmetric.
  v_payout_cents   := ROUND(v_fallback_cents * v_fx_rate)::integer;
  v_payout_amount  := v_payout_cents::numeric / 100;

  v_payout_balance := COALESCE((v_cur_balances ->> p_payout_currency)::numeric, 0);
  v_new_payout_bal := ROUND(v_payout_balance + v_payout_amount, 2);

  v_metadata := jsonb_build_object(
    'type',          'retainer',
    'period',        p_period,
    'base_currency', p_base_currency,
    'fx_rate',       v_fx_rate
  );

  INSERT INTO public.wallet_transactions (
    wallet_id, user_id, type, amount, amount_cents, currency,
    description, balance_before, balance_after, created_by, metadata
  ) VALUES (
    v_wallet_id, p_user_id, 'adjustment', v_payout_amount, v_payout_cents, p_payout_currency,
    'Monthly retainer - ' || p_period,
    v_payout_balance, v_new_payout_bal,
    p_created_by, v_metadata
  );

  UPDATE public.wallets
     SET balances     = jsonb_set(v_cur_balances, ARRAY[p_payout_currency], to_jsonb(v_new_payout_bal)),
         total_earned = v_cur_earned + v_payout_amount,
         updated_at   = now()
   WHERE id = v_wallet_id;

  RETURN jsonb_build_object(
    'status',            'ok',
    'reissued_currency', p_payout_currency,
    'reissued_amount',   v_payout_amount
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reverse_and_reissue_retainer(uuid, text, text, text, uuid)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.reverse_and_reissue_retainer(uuid, text, text, text, uuid)
  TO authenticated;
