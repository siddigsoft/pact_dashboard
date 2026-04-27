-- =============================================================================
-- FIX: Wallet not found for user — bulk down-payment approval
-- =============================================================================
-- A trigger on down_payment_requests raises "Wallet not found for user <uuid>"
-- when the requester has no wallet row yet. This migration adds a BEFORE UPDATE
-- trigger that auto-creates the wallet (silently) before the main trigger runs.
-- Trigger name starts with 'aaa_' so it fires first (alphabetical order within
-- the same timing+event).
-- =============================================================================

-- Step 1 — helper function: ensure a wallet row exists for a given profile id
CREATE OR REPLACE FUNCTION public.ensure_wallet_exists_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.wallets (
    user_id,
    currency,
    balance_cents,
    total_earned_cents,
    total_paid_out_cents,
    pending_payout_cents,
    balances,
    total_earned
  )
  VALUES (
    p_user_id,
    'SDG',
    0, 0, 0, 0,
    '{"SDG": 0}'::jsonb,
    0
  )
  ON CONFLICT (user_id) DO NOTHING;
EXCEPTION
  WHEN OTHERS THEN
    -- Non-fatal: log and continue so the approving update is never blocked
    RAISE NOTICE 'ensure_wallet_exists_for_user: skipping user % — %', p_user_id, SQLERRM;
END;
$$;

-- Step 2 — trigger function: called BEFORE UPDATE on down_payment_requests
CREATE OR REPLACE FUNCTION public.trg_aaa_ensure_wallet_on_dpr_approve()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only act when status is moving into an approved/paid state
  IF NEW.status IN ('approved', 'partially_paid', 'fully_paid', 'pending_admin')
     AND NEW.requested_by IS NOT NULL THEN
    PERFORM public.ensure_wallet_exists_for_user(NEW.requested_by);
  END IF;
  RETURN NEW;
END;
$$;

-- Step 3 — attach the trigger (DROP first for idempotency)
DROP TRIGGER IF EXISTS aaa_ensure_wallet_on_dpr_approve ON public.down_payment_requests;

CREATE TRIGGER aaa_ensure_wallet_on_dpr_approve
  BEFORE UPDATE ON public.down_payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_aaa_ensure_wallet_on_dpr_approve();

-- Done
COMMENT ON FUNCTION public.ensure_wallet_exists_for_user(uuid) IS
  'Idempotently creates a zero-balance SDG wallet for a profile. Called by the '
  'aaa_ensure_wallet_on_dpr_approve trigger before any down_payment_requests '
  'UPDATE so downstream triggers always find an existing wallet row.';
