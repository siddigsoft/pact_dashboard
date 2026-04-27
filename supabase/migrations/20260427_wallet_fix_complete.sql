-- =============================================================================
-- COMPLETE WALLET FIX — run this ONCE in Supabase SQL editor
-- Fixes three related issues:
--   1. "Wallet not found for user <uuid>" on bulk approve
--   2. "new row violates row-level security policy for table wallets" on Process Payment
--   3. Backfills wallets for all existing requesters who have none
-- =============================================================================

-- ── STEP 1: Widen the wallet INSERT policy to cover all admin-level roles ────
DROP POLICY IF EXISTS wallets_insert_combined ON public.wallets;

CREATE POLICY wallets_insert_combined
  ON public.wallets FOR INSERT
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = ANY (ARRAY[
          'admin',          'Admin',
          'superadmin',     'SuperAdmin',   'super_admin',
          'financialAdmin', 'financialadmin','FinancialAdmin',
          'fom',            'FOM',
          'countrydirector','CountryDirector','country_director',
          'ict',            'ICT',
          'datateam',       'DataTeam',      'data_team'
        ]::text[])
    )
  );

-- ── STEP 2: Helper — silently create a wallet (SECURITY DEFINER = bypasses RLS) ──
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

-- ── STEP 3: Admin RPC — create wallet for another user (called from frontend) ──
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

-- ── STEP 4: BEFORE UPDATE trigger — auto-creates wallet before DB trigger fires ──
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

-- ── STEP 5: Backfill — create wallets for all requesters who have none ────────
-- Runs with service-role privileges in the SQL editor (bypasses RLS)
INSERT INTO public.wallets (
  user_id, currency, balance_cents, total_earned_cents,
  total_paid_out_cents, pending_payout_cents, balances, total_earned
)
SELECT DISTINCT
  dp.requested_by,
  'SDG', 0, 0, 0, 0, '{"SDG": 0}'::jsonb, 0
FROM public.down_payment_requests dp
WHERE dp.requested_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.wallets w WHERE w.user_id = dp.requested_by
  )
ON CONFLICT (user_id) DO NOTHING;

-- Show how many wallets were created
DO $$
DECLARE v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.wallets;
  RAISE NOTICE 'Done. Total wallet rows now: %', v_count;
END;
$$;
