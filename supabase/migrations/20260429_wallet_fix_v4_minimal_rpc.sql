-- =============================================================================
-- RUNBOOK v4 (MINIMAL, DEFINITIVE)
-- Fix "Wallet not found for user <uuid>" on down-payment approval
-- =============================================================================
-- Run this ONCE in the Supabase SQL editor (project: abznugnirnlrqnnfkein).
-- Safe to re-run — all statements are idempotent.
--
-- Root cause:
--   wallets.user_id has FK → profiles.id.  If the requester has no profiles
--   row (possible when the FK on down_payment_requests.requested_by was not
--   enforced or was added later), the wallet INSERT raises a FK violation.
--   The previous helper function caught that error with RAISE NOTICE (invisible)
--   and returned normally, leaving the wallet uncreated.  The existing "Wallet
--   not found" trigger then fired and blocked the approval.
--
-- Fix:
--   A new SECURITY DEFINER RPC `ensure_wallet_and_profile(uuid)` that:
--     1. Inserts a minimal profile row (only id; every other column is nullable)
--        using ON CONFLICT DO NOTHING — no auth.users lookup needed.
--     2. Inserts a zero-balance wallet row — ON CONFLICT DO NOTHING.
--   This RPC is called by the frontend before every approval update.
-- =============================================================================

-- ── 1. Diagnostic: show current state ────────────────────────────────────────
-- These are SELECT-only and are always safe to run.

-- All triggers on down_payment_requests (so you can see the "Wallet not found" one)
SELECT
  t.tgname  AS trigger_name,
  CASE t.tgtype & 2 WHEN 2 THEN 'BEFORE' ELSE 'AFTER' END AS timing,
  CASE
    WHEN t.tgtype & 16 = 16 THEN 'UPDATE'
    WHEN t.tgtype &  4 =  4 THEN 'INSERT'
    WHEN t.tgtype &  8 =  8 THEN 'DELETE'
    ELSE 'OTHER'
  END       AS event,
  p.proname AS function_name,
  t.tgenabled AS enabled
FROM pg_trigger t
JOIN pg_class  c ON c.oid = t.tgrelid
JOIN pg_proc   p ON p.oid = t.tgfoid
WHERE c.relname = 'down_payment_requests'
  AND NOT t.tgisinternal
ORDER BY timing, trigger_name;

-- Status for the specific failing user
SELECT
  '47c7d526-3b74-4178-8326-3d79a68e31a5'::uuid AS user_id,
  EXISTS(SELECT 1 FROM public.profiles WHERE id    = '47c7d526-3b74-4178-8326-3d79a68e31a5') AS has_profile,
  EXISTS(SELECT 1 FROM public.wallets  WHERE user_id = '47c7d526-3b74-4178-8326-3d79a68e31a5') AS has_wallet;

-- ── 2. The minimal RPC ────────────────────────────────────────────────────────
-- Only id is required in profiles (every other column is nullable with defaults).
-- Running as SECURITY DEFINER bypasses RLS entirely.

CREATE OR REPLACE FUNCTION public.ensure_wallet_and_profile(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Step A: create a minimal profile if one doesn't exist.
  --         The profiles table only requires id; all other columns are nullable.
  INSERT INTO public.profiles (id)
  VALUES (p_user_id)
  ON CONFLICT (id) DO NOTHING;

  -- Step B: create a zero-balance wallet (FK now satisfied by step A).
  INSERT INTO public.wallets (
    user_id, currency, balance_cents, total_earned_cents,
    total_paid_out_cents, pending_payout_cents, balances, total_earned
  )
  VALUES (p_user_id, 'SDG', 0, 0, 0, 0, '{"SDG": 0}'::jsonb, 0)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN true;

EXCEPTION WHEN OTHERS THEN
  -- Use RAISE WARNING so this shows up in Supabase Dashboard → Logs → Postgres
  RAISE WARNING 'ensure_wallet_and_profile: FAILED for % — % (%)',
    p_user_id, SQLERRM, SQLSTATE;
  RETURN false;
END;
$$;

-- Allow authenticated users to call it (the frontend calls it via .rpc())
GRANT EXECUTE ON FUNCTION public.ensure_wallet_and_profile(uuid) TO authenticated;

-- ── 3. Backfill: create missing profiles + wallets for all existing requesters ─
-- Profiles first (wallet FK requires it)
INSERT INTO public.profiles (id)
SELECT DISTINCT dp.requested_by
FROM public.down_payment_requests dp
WHERE dp.requested_by IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = dp.requested_by)
ON CONFLICT (id) DO NOTHING;

-- Wallets next
INSERT INTO public.wallets (
  user_id, currency, balance_cents, total_earned_cents,
  total_paid_out_cents, pending_payout_cents, balances, total_earned
)
SELECT DISTINCT dp.requested_by, 'SDG', 0, 0, 0, 0, '{"SDG": 0}'::jsonb, 0
FROM public.down_payment_requests dp
WHERE dp.requested_by IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.wallets w WHERE w.user_id = dp.requested_by)
ON CONFLICT (user_id) DO NOTHING;

-- ── 4. Verification ───────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(DISTINCT dp.requested_by)
   FROM public.down_payment_requests dp
   WHERE dp.requested_by IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.wallets w WHERE w.user_id = dp.requested_by)
  ) AS requesters_still_missing_wallet,   -- TARGET: 0

  (SELECT COUNT(DISTINCT dp.requested_by)
   FROM public.down_payment_requests dp
   WHERE dp.requested_by IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = dp.requested_by)
  ) AS requesters_still_missing_profile,  -- TARGET: 0

  EXISTS(SELECT 1 FROM public.wallets
         WHERE user_id = '47c7d526-3b74-4178-8326-3d79a68e31a5')
    AS problem_user_wallet_exists;        -- TARGET: true
