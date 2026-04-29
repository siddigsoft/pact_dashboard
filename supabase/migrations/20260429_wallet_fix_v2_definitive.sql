-- =============================================================================
-- RUNBOOK v2 (DEFINITIVE): Fix "Wallet not found for user <uuid>"
-- =============================================================================
-- WHEN TO RUN:
--   Run this ONCE in the Supabase SQL editor (project: abznugnirnlrqnnfkein).
--   Run it even if you ran the previous runbook — this replaces it.
--
-- WHAT IT DOES:
--   1. Creates minimal profiles (from auth.users data) for any down-payment
--      requesters who are missing a profiles row.  The wallets table has a FK
--      → profiles.id, so without a profile the wallet INSERT is silently
--      rejected inside the EXCEPTION block of ensure_wallet_exists_for_user.
--   2. Directly backfills zero-balance wallets for every requester who has a
--      profile but no wallet.
--   3. Replaces the BEFORE UPDATE trigger function with a version that handles
--      the missing-profile case at the DB level and uses RAISE WARNING (visible
--      in Supabase logs) instead of RAISE NOTICE (invisible).
--   4. Prints a summary showing how many wallets are still missing (should be 0).
-- =============================================================================

-- ── STEP 1: ensure profiles exist for all down-payment requesters ─────────────
-- wallets.user_id has FK → profiles.id ON DELETE CASCADE.
-- If the profile is missing, the wallet INSERT throws a FK violation which the
-- EXCEPTION WHEN OTHERS block in ensure_wallet_exists_for_user silently eats.
-- We fix that by creating a minimal placeholder profile from auth.users data.
INSERT INTO public.profiles (id, full_name, role, created_at, updated_at)
SELECT
  au.id,
  COALESCE(
    au.raw_user_meta_data->>'full_name',
    au.raw_user_meta_data->>'name',
    au.email,
    'Unknown User'
  ),
  'dataCollector',
  NOW(),
  NOW()
FROM auth.users au
WHERE EXISTS (
  SELECT 1 FROM public.down_payment_requests dp
  WHERE dp.requested_by = au.id
)
AND NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = au.id
)
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE v_n int;
BEGIN
  SELECT COUNT(*) INTO v_n
  FROM public.down_payment_requests dp
  WHERE dp.requested_by IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = dp.requested_by);
  IF v_n > 0 THEN
    RAISE WARNING 'STEP 1: % requester(s) STILL missing a profile after insert — '
      'their auth.users row may not exist. Wallets for these users cannot be created.', v_n;
  ELSE
    RAISE NOTICE 'STEP 1 OK: All down-payment requesters now have a profiles row.';
  END IF;
END $$;

-- ── STEP 2: backfill missing wallets for all requesters who have a profile ────
INSERT INTO public.wallets (
  user_id, currency, balance_cents, total_earned_cents,
  total_paid_out_cents, pending_payout_cents, balances, total_earned
)
SELECT DISTINCT
  dp.requested_by,
  'SDG',
  0, 0, 0, 0,
  '{"SDG": 0}'::jsonb,
  0
FROM public.down_payment_requests dp
WHERE dp.requested_by IS NOT NULL
  AND EXISTS     (SELECT 1 FROM public.profiles p WHERE p.id = dp.requested_by)
  AND NOT EXISTS (SELECT 1 FROM public.wallets  w WHERE w.user_id = dp.requested_by)
ON CONFLICT (user_id) DO NOTHING;

DO $$
DECLARE v_missing int; v_total int;
BEGIN
  SELECT COUNT(DISTINCT dp.requested_by) INTO v_missing
  FROM public.down_payment_requests dp
  WHERE dp.requested_by IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.wallets w WHERE w.user_id = dp.requested_by);
  SELECT COUNT(*) INTO v_total FROM public.wallets;
  RAISE NOTICE 'STEP 2: Backfill complete. Total wallets: %. Requesters still missing wallets: % (should be 0).', v_total, v_missing;
END $$;

-- ── STEP 3: replace trigger function with robust version ──────────────────────
-- Differences from the previous version:
--   • Handles missing profile: tries to INSERT profile from auth.users first.
--   • Does the wallet INSERT inline (no helper function call) — avoids any
--     silent-exception issue in the helper.
--   • Uses RAISE WARNING (level shown in Supabase Dashboard logs) instead of
--     RAISE NOTICE (not shown by default) so failures are visible.

CREATE OR REPLACE FUNCTION public.trg_aaa_ensure_wallet_on_dpr_approve()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_exists boolean;
BEGIN
  -- Only act when status moves to an approval-path value
  IF NEW.status NOT IN ('approved', 'partially_paid', 'fully_paid', 'pending_admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.requested_by IS NULL THEN
    RETURN NEW;
  END IF;

  -- Fast path: wallet already exists
  SELECT EXISTS(SELECT 1 FROM public.wallets WHERE user_id = NEW.requested_by)
    INTO v_wallet_exists;
  IF v_wallet_exists THEN
    RETURN NEW;
  END IF;

  -- Wallet missing — try to create it.
  BEGIN
    -- Ensure profile row exists (wallets.user_id FK → profiles.id)
    INSERT INTO public.profiles (id, full_name, role, created_at, updated_at)
    SELECT
      au.id,
      COALESCE(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', au.email, 'Unknown User'),
      'dataCollector',
      NOW(),
      NOW()
    FROM auth.users au
    WHERE au.id = NEW.requested_by
    ON CONFLICT (id) DO NOTHING;

    -- Create wallet
    INSERT INTO public.wallets (
      user_id, currency, balance_cents, total_earned_cents,
      total_paid_out_cents, pending_payout_cents, balances, total_earned
    )
    VALUES (NEW.requested_by, 'SDG', 0, 0, 0, 0, '{"SDG": 0}'::jsonb, 0)
    ON CONFLICT (user_id) DO NOTHING;

    RAISE WARNING 'aaa_ensure_wallet: auto-created wallet for user % on DPR %', NEW.requested_by, NEW.id;

  EXCEPTION WHEN OTHERS THEN
    -- Log visibly (WARNING shows in Supabase Dashboard → Logs → Postgres)
    RAISE WARNING 'aaa_ensure_wallet: FAILED to create wallet for user % on DPR % — %: %',
      NEW.requested_by, NEW.id, SQLSTATE, SQLERRM;
    -- Do NOT re-raise — let the existing trigger handle its own error message.
  END;

  RETURN NEW;
END;
$$;

-- Re-install trigger (in case it was not installed by the previous runbook)
DROP TRIGGER IF EXISTS aaa_ensure_wallet_on_dpr_approve ON public.down_payment_requests;

CREATE TRIGGER aaa_ensure_wallet_on_dpr_approve
  BEFORE UPDATE ON public.down_payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_aaa_ensure_wallet_on_dpr_approve();

-- ── STEP 4: final verification summary ───────────────────────────────────────
DO $$
DECLARE
  v_missing_wallets  int;
  v_missing_profiles int;
  v_total_wallets    int;
BEGIN
  SELECT COUNT(DISTINCT dp.requested_by) INTO v_missing_wallets
  FROM public.down_payment_requests dp
  WHERE dp.requested_by IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.wallets w WHERE w.user_id = dp.requested_by);

  SELECT COUNT(DISTINCT dp.requested_by) INTO v_missing_profiles
  FROM public.down_payment_requests dp
  WHERE dp.requested_by IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = dp.requested_by);

  SELECT COUNT(*) INTO v_total_wallets FROM public.wallets;

  RAISE NOTICE '=== SUMMARY ===';
  RAISE NOTICE 'Total wallets in DB        : %', v_total_wallets;
  RAISE NOTICE 'Requesters missing wallets : % (target: 0)', v_missing_wallets;
  RAISE NOTICE 'Requesters missing profiles: % (target: 0)', v_missing_profiles;
  IF v_missing_wallets = 0 THEN
    RAISE NOTICE 'STATUS: ALL CLEAR — approval should work now.';
  ELSE
    RAISE WARNING 'STATUS: % requester(s) still missing wallets — check profiles step above.', v_missing_wallets;
  END IF;
END $$;
