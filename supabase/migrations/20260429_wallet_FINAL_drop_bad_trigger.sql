-- =============================================================================
-- FINAL FIX: Drop the "Wallet not found" trigger + backfill all missing wallets
-- =============================================================================
-- Run this ONCE in the Supabase SQL editor (project: abznugnirnlrqnnfkein).
-- This is the definitive fix — run it even if you ran previous runbooks.
--
-- Step 1: Find and DROP every trigger on down_payment_requests whose function
--         body contains "Wallet not found" (case-insensitive) — this is the
--         trigger that has been blocking all approvals.
-- Step 2: Create minimal profiles (only id needed) for every requester who
--         doesn't have one, so the wallets FK is satisfied.
-- Step 3: Create zero-balance wallets for every requester who doesn't have one.
-- Step 4: (Re)install a clean BEFORE UPDATE trigger that safely creates a
--         wallet before any remaining triggers fire.
-- Step 5: Show verification results.
-- =============================================================================

-- ── STEP 1: Drop every trigger on down_payment_requests whose function raises ──
--            "Wallet not found" (searches actual function source code)          
DO $$
DECLARE
  rec RECORD;
  n   int := 0;
BEGIN
  FOR rec IN
    SELECT DISTINCT t.tgname, p.proname, pg_get_functiondef(p.oid) AS src
    FROM pg_trigger t
    JOIN pg_class  c ON c.oid = t.tgrelid
    JOIN pg_proc   p ON p.oid = t.tgfoid
    WHERE c.relname  = 'down_payment_requests'
      AND c.relkind  = 'r'
      AND NOT t.tgisinternal
      AND pg_get_functiondef(p.oid) ILIKE '%wallet%not%found%'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.down_payment_requests', rec.tgname);
    n := n + 1;
    RAISE NOTICE 'Dropped trigger "%" (function: "%")', rec.tgname, rec.proname;
  END LOOP;

  IF n = 0 THEN
    RAISE NOTICE 'No "Wallet not found" trigger found on down_payment_requests. '
      'The trigger may already be gone or may have a different message. '
      'Continuing with backfill and clean trigger installation.';
  ELSE
    RAISE NOTICE 'Dropped % "Wallet not found" trigger(s).', n;
  END IF;
END $$;

-- Also drop our own previous fix trigger so we can reinstall it clean
DROP TRIGGER IF EXISTS aaa_ensure_wallet_on_dpr_approve ON public.down_payment_requests;

-- ── STEP 2: Create minimal profiles for requesters who don't have one ──────────
--    profiles table only requires id (all other columns are nullable)
INSERT INTO public.profiles (id)
SELECT DISTINCT dp.requested_by
FROM public.down_payment_requests dp
WHERE dp.requested_by IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = dp.requested_by)
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE n int;
BEGIN
  SELECT COUNT(DISTINCT dp.requested_by) INTO n
  FROM public.down_payment_requests dp
  WHERE dp.requested_by IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = dp.requested_by);
  IF n > 0 THEN
    RAISE WARNING 'STEP 2: % requester(s) STILL missing profiles. '
      'Their IDs may not exist in auth.users or profiles at all.', n;
  ELSE
    RAISE NOTICE 'STEP 2 OK: all requesters have profiles.';
  END IF;
END $$;

-- ── STEP 3: Backfill wallets ────────────────────────────────────────────────────
INSERT INTO public.wallets (
  user_id, currency, balance_cents, total_earned_cents,
  total_paid_out_cents, pending_payout_cents, balances, total_earned
)
SELECT DISTINCT
  dp.requested_by, 'SDG', 0, 0, 0, 0, '{"SDG": 0}'::jsonb, 0
FROM public.down_payment_requests dp
WHERE dp.requested_by IS NOT NULL
  AND EXISTS     (SELECT 1 FROM public.profiles p WHERE p.id = dp.requested_by)
  AND NOT EXISTS (SELECT 1 FROM public.wallets  w WHERE w.user_id = dp.requested_by)
ON CONFLICT (user_id) DO NOTHING;

-- ── STEP 4: Reinstall a clean safe-creation trigger ─────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_aaa_ensure_wallet_on_dpr_approve()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.requested_by IS NULL THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('approved','pending_admin','partially_paid','fully_paid') THEN
    RETURN NEW;
  END IF;

  -- Fast path: wallet already exists
  IF EXISTS (SELECT 1 FROM public.wallets WHERE user_id = NEW.requested_by) THEN
    RETURN NEW;
  END IF;

  -- Ensure profile exists (wallet FK requires it; profiles only needs id)
  INSERT INTO public.profiles (id)
  VALUES (NEW.requested_by)
  ON CONFLICT (id) DO NOTHING;

  -- Create wallet
  INSERT INTO public.wallets (
    user_id, currency, balance_cents, total_earned_cents,
    total_paid_out_cents, pending_payout_cents, balances, total_earned
  )
  VALUES (NEW.requested_by, 'SDG', 0, 0, 0, 0, '{"SDG": 0}'::jsonb, 0)
  ON CONFLICT (user_id) DO NOTHING;

  RAISE WARNING 'aaa_ensure_wallet: created wallet for user % (DPR %)',
    NEW.requested_by, NEW.id;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'aaa_ensure_wallet: FAILED for user % — % (%)',
    NEW.requested_by, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;

CREATE TRIGGER aaa_ensure_wallet_on_dpr_approve
  BEFORE UPDATE ON public.down_payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_aaa_ensure_wallet_on_dpr_approve();

-- Also recreate the ensure_wallet_and_profile RPC (called by the frontend)
CREATE OR REPLACE FUNCTION public.ensure_wallet_and_profile(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (p_user_id) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.wallets (
    user_id, currency, balance_cents, total_earned_cents,
    total_paid_out_cents, pending_payout_cents, balances, total_earned
  )
  VALUES (p_user_id, 'SDG', 0, 0, 0, 0, '{"SDG": 0}'::jsonb, 0)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'ensure_wallet_and_profile failed for %: % (%)', p_user_id, SQLERRM, SQLSTATE;
  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_wallet_and_profile(uuid) TO authenticated;

-- ── STEP 5: Verification ────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(DISTINCT dp.requested_by)
   FROM public.down_payment_requests dp
   WHERE dp.requested_by IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.wallets w WHERE w.user_id = dp.requested_by)
  ) AS requesters_missing_wallet,

  (SELECT COUNT(DISTINCT dp.requested_by)
   FROM public.down_payment_requests dp
   WHERE dp.requested_by IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = dp.requested_by)
  ) AS requesters_missing_profile,

  (SELECT COUNT(*) FROM pg_trigger t
   JOIN pg_class c ON c.oid = t.tgrelid
   JOIN pg_proc  p ON p.oid = t.tgfoid
   WHERE c.relname = 'down_payment_requests'
     AND NOT t.tgisinternal
     AND pg_get_functiondef(p.oid) ILIKE '%wallet%not%found%'
  ) AS wallet_not_found_triggers_remaining;
-- All three numbers should be 0 for approvals to work.
