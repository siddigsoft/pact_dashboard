-- =============================================================================
-- FIX: "new row violates row-level security policy for table wallets"
-- =============================================================================
-- When an admin processes a down-payment, processPayment() inserts a wallet
-- row for the REQUESTER (user_id = requester's UUID, not auth.uid()).
-- The existing wallets_insert_combined policy only allows:
--   1. user_id = auth.uid()          (own wallet)
--   2. has_role('admin')
--   3. has_role('financialAdmin')
-- Super-admin, fom, countrydirector, ict, data_team roles are not covered.
-- This migration also creates an RPC that bypasses RLS entirely so the
-- frontend can call it instead of a raw INSERT.
-- =============================================================================

-- ── 1. Widen the INSERT policy to cover all admin-level roles ────────────────
DROP POLICY IF EXISTS wallets_insert_combined ON public.wallets;

CREATE POLICY wallets_insert_combined
  ON public.wallets FOR INSERT
  WITH CHECK (
    -- own wallet
    user_id = (SELECT auth.uid())
    -- any admin-level role (profiles.role)
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = ANY (ARRAY[
          'admin',          'Admin',
          'superadmin',     'SuperAdmin',   'super_admin',
          'financialAdmin', 'financialadmin', 'FinancialAdmin',
          'fom',            'FOM',
          'countrydirector','CountryDirector','country_director',
          'ict',            'ICT',
          'datateam',       'DataTeam',      'data_team'
        ]::text[])
    )
  );

-- ── 2. RPC that creates a wallet bypassing RLS (SECURITY DEFINER) ────────────
-- Frontend can call: supabase.rpc('create_wallet_for_user', { target_user_id: uuid })
-- It still enforces that the caller has an admin-level role before acting.
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
  -- Verify caller has an admin-level role
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;

  IF v_caller_role IS NULL OR v_caller_role NOT IN (
    'admin',          'Admin',
    'superadmin',     'SuperAdmin',   'super_admin',
    'financialAdmin', 'financialadmin', 'FinancialAdmin',
    'fom',            'FOM',
    'countrydirector','CountryDirector','country_director',
    'ict',            'ICT',
    'datateam',       'DataTeam',      'data_team'
  ) THEN
    RAISE EXCEPTION 'Permission denied: admin role required to create wallets for other users.';
  END IF;

  -- Upsert wallet (silently do nothing if already exists)
  INSERT INTO public.wallets (
    user_id, currency, balance_cents, total_earned_cents,
    total_paid_out_cents, pending_payout_cents, balances, total_earned
  )
  VALUES (
    target_user_id, 'SDG', 0, 0, 0, 0, '{"SDG": 0}'::jsonb, 0
  )
  ON CONFLICT (user_id) DO NOTHING;

  SELECT id INTO v_wallet_id FROM public.wallets WHERE user_id = target_user_id;

  RETURN json_build_object('wallet_id', v_wallet_id, 'user_id', target_user_id);
END;
$$;

COMMENT ON FUNCTION public.create_wallet_for_user(uuid) IS
  'Admin-only RPC: creates a zero-balance SDG wallet for target_user_id. '
  'Bypasses RLS via SECURITY DEFINER but enforces caller admin-role check. '
  'Idempotent — safe to call even if the wallet already exists.';
