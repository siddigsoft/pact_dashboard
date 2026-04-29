-- =============================================================================
-- RUNBOOK: Fix "Wallet not found for user <uuid>" on Down-Payment Approval
-- =============================================================================
-- WHEN TO RUN: Run this ONCE in the Supabase SQL editor (project: abznugnirnlrqnnfkein)
-- WHAT IT DOES:
--   1. Widens the wallets INSERT policy so superAdmin / fom / etc. can create
--      wallets for other users (the previous policy only covered 'admin').
--   2. Creates a SECURITY DEFINER helper function that bypasses RLS entirely,
--      used by the BEFORE UPDATE trigger and the frontend RPC call.
--   3. Creates a BEFORE UPDATE trigger on down_payment_requests named
--      aaa_ensure_wallet_on_dpr_approve (the 'aaa_' prefix makes it fire
--      FIRST, before the existing trigger that raises the error).
--   4. Backfills zero-balance wallets for every existing requester who has none.
-- =============================================================================

-- ── 1. Widen INSERT policy to ALL admin-level roles ──────────────────────────
DROP POLICY IF EXISTS wallets_insert_combined ON public.wallets;

CREATE POLICY wallets_insert_combined
  ON public.wallets FOR INSERT
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = ANY (ARRAY[
          'admin',           'Admin',
          'superadmin',      'SuperAdmin',    'super_admin',
          'financialAdmin',  'financialadmin','FinancialAdmin',
          'fom',             'FOM',
          'countrydirector', 'CountryDirector','country_director',
          'ict',             'ICT',
          'datateam',        'DataTeam',       'data_team'
        ]::text[])
    )
  );

-- ── 2. SECURITY DEFINER helper — creates a wallet bypassing RLS ──────────────
CREATE OR REPLACE FUNCTION public.ensure_wallet_exists_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.wallets (
    user_id, currency, balance_cents, total_earned_cents,
    total_paid_out_cents, pending_payout_cents, balances, total_earned
  )
  VALUES (p_user_id, 'SDG', 0, 0, 0, 0, '{"SDG": 0}'::jsonb, 0)
  ON CONFLICT (user_id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'ensure_wallet_exists_for_user: skipping % — %', p_user_id, SQLERRM;
END;
$$;

-- ── 3. Admin-facing RPC (called by the frontend as Route 3) ──────────────────
CREATE OR REPLACE FUNCTION public.create_wallet_for_user(target_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_wallet_id   uuid;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid() LIMIT 1;

  IF v_caller_role IS NULL OR v_caller_role NOT IN (
    'admin','Admin','superadmin','SuperAdmin','super_admin',
    'financialAdmin','financialadmin','FinancialAdmin',
    'fom','FOM','countrydirector','CountryDirector','country_director',
    'ict','ICT','datateam','DataTeam','data_team'
  ) THEN
    RAISE EXCEPTION 'Permission denied: admin role required.';
  END IF;

  PERFORM public.ensure_wallet_exists_for_user(target_user_id);
  SELECT id INTO v_wallet_id FROM public.wallets WHERE user_id = target_user_id;
  RETURN json_build_object('wallet_id', v_wallet_id, 'user_id', target_user_id);
END;
$$;

-- ── 4. BEFORE UPDATE trigger — auto-creates wallet before existing trigger ────
-- The 'aaa_' prefix ensures this trigger fires BEFORE the trigger that raises
-- "Wallet not found for user <uuid>".
CREATE OR REPLACE FUNCTION public.trg_aaa_ensure_wallet_on_dpr_approve()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('approved','partially_paid','fully_paid','pending_admin')
     AND NEW.requested_by IS NOT NULL THEN
    PERFORM public.ensure_wallet_exists_for_user(NEW.requested_by);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS aaa_ensure_wallet_on_dpr_approve ON public.down_payment_requests;

CREATE TRIGGER aaa_ensure_wallet_on_dpr_approve
  BEFORE UPDATE ON public.down_payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_aaa_ensure_wallet_on_dpr_approve();

-- ── 5. Backfill — create wallets for ALL existing requesters who have none ────
INSERT INTO public.wallets (
  user_id, currency, balance_cents, total_earned_cents,
  total_paid_out_cents, pending_payout_cents, balances, total_earned
)
SELECT DISTINCT
  dp.requested_by, 'SDG', 0, 0, 0, 0, '{"SDG": 0}'::jsonb, 0
FROM public.down_payment_requests dp
WHERE dp.requested_by IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.wallets w WHERE w.user_id = dp.requested_by)
ON CONFLICT (user_id) DO NOTHING;

-- Show result
DO $$
DECLARE
  v_total int;
  v_backfilled int;
BEGIN
  SELECT COUNT(*) INTO v_total FROM public.wallets;
  SELECT COUNT(DISTINCT dp.requested_by) INTO v_backfilled
  FROM public.down_payment_requests dp
  WHERE dp.requested_by IS NOT NULL;
  RAISE NOTICE 'Done. Total wallet rows: %. Down-payment requesters: %.', v_total, v_backfilled;
END;
$$;
