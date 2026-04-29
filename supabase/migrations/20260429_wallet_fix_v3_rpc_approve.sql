-- =============================================================================
-- RUNBOOK v3: Wallet-safe approval RPC + diagnostic queries
-- =============================================================================
-- WHEN TO RUN: Run in Supabase SQL editor (project: abznugnirnlrqnnfkein)
--
-- This creates an RPC that wraps every approval in a single transaction:
--   1. Ensures profile exists (from auth.users)
--   2. Ensures wallet exists (INSERT ... ON CONFLICT DO NOTHING, SECURITY DEFINER)
--   3. Performs the status UPDATE — wallet already exists, so the old trigger passes
--
-- Also includes diagnostic queries so you can see what's blocking the wallet.
-- =============================================================================

-- ── DIAGNOSTIC (read-only — always safe to run) ───────────────────────────────
-- Run this section first to understand the current state.

-- Q1: List ALL triggers on down_payment_requests
SELECT
  t.tgname          AS trigger_name,
  CASE t.tgtype & 2 WHEN 2 THEN 'BEFORE' ELSE 'AFTER' END AS timing,
  CASE
    WHEN t.tgtype & 16 = 16 THEN 'UPDATE'
    WHEN t.tgtype &  4 =  4 THEN 'INSERT'
    WHEN t.tgtype &  8 =  8 THEN 'DELETE'
    ELSE 'OTHER'
  END               AS event,
  p.proname         AS function_name,
  t.tgenabled       AS enabled
FROM pg_trigger t
JOIN pg_class  c ON c.oid = t.tgrelid
JOIN pg_proc   p ON p.oid = t.tgfoid
WHERE c.relname = 'down_payment_requests'
  AND NOT t.tgisinternal
ORDER BY timing, trigger_name;

-- Q2: Check profile + wallet for the problem user
SELECT
  '47c7d526-3b74-4178-8326-3d79a68e31a5'::uuid                  AS user_id,
  EXISTS(SELECT 1 FROM public.profiles WHERE id = '47c7d526-3b74-4178-8326-3d79a68e31a5')  AS has_profile,
  EXISTS(SELECT 1 FROM public.wallets  WHERE user_id = '47c7d526-3b74-4178-8326-3d79a68e31a5') AS has_wallet;

-- Q3: Count all requesters without wallets
SELECT COUNT(DISTINCT dp.requested_by) AS requesters_missing_wallet
FROM public.down_payment_requests dp
WHERE dp.requested_by IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.wallets w WHERE w.user_id = dp.requested_by);

-- ── FIX: safe approval RPC ────────────────────────────────────────────────────
-- This function wraps the full approval in one transaction.
-- It runs as SECURITY DEFINER so it can INSERT into wallets and profiles
-- regardless of RLS, and the wallet will exist by the time any trigger checks.

CREATE OR REPLACE FUNCTION public.safe_approve_down_payment(
  p_request_id  uuid,
  p_status      text,          -- 'approved' | 'pending_admin' | etc.
  p_update_json jsonb          -- remaining fields to UPDATE, e.g. {"approved_amount":40000,...}
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requested_by uuid;
  v_row_count    int;
  v_set_clause   text;
  v_key          text;
  v_val          text;
  v_pairs        text[] := ARRAY[]::text[];
  v_sql          text;
BEGIN
  -- 1. Get the requester
  SELECT requested_by INTO v_requested_by
  FROM public.down_payment_requests
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'request_not_found');
  END IF;

  -- 2. Ensure profile exists (wallet FK requires it)
  IF v_requested_by IS NOT NULL THEN
    INSERT INTO public.profiles (id, full_name, role, created_at, updated_at)
    SELECT
      au.id,
      COALESCE(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', au.email, 'Unknown User'),
      'dataCollector',
      NOW(), NOW()
    FROM auth.users au
    WHERE au.id = v_requested_by
    ON CONFLICT (id) DO NOTHING;

    -- 3. Ensure wallet exists
    INSERT INTO public.wallets (
      user_id, currency, balance_cents, total_earned_cents,
      total_paid_out_cents, pending_payout_cents, balances, total_earned
    )
    VALUES (v_requested_by, 'SDG', 0, 0, 0, 0, '{"SDG": 0}'::jsonb, 0)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  -- 4. Build SET clause from p_update_json + the status
  --    Allowed columns — only accept safe known fields to prevent SQL injection
  FOR v_key, v_val IN SELECT * FROM jsonb_each_text(p_update_json) LOOP
    IF v_key = ANY(ARRAY[
      'approved_amount','admin_notes','admin_processed_by','admin_processed_at',
      'supervisor_approved_by','supervisor_approved_at','supervisor_notes',
      'updated_at','total_paid_amount','payment_method','payment_reference',
      'payment_date','payment_processed_by','payment_notes','paid_at',
      'tier','tier1_approver','tier2_approver',
      'tier1_approved_at','tier2_approved_at',
      'tier1_notes','tier2_notes'
    ]) THEN
      v_pairs := v_pairs || format('%I = %L', v_key, v_val);
    END IF;
  END LOOP;

  -- Always set status and updated_at
  v_pairs := v_pairs || format('status = %L', p_status);
  v_pairs := v_pairs || format('updated_at = %L', NOW()::text);

  v_sql := format(
    'UPDATE public.down_payment_requests SET %s WHERE id = %L',
    array_to_string(v_pairs, ', '),
    p_request_id
  );

  EXECUTE v_sql;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;

  IF v_row_count = 0 THEN
    RETURN json_build_object('ok', false, 'error', 'no_rows_updated',
      'hint', 'RLS blocked the update or request no longer exists');
  END IF;

  RETURN json_build_object(
    'ok',           true,
    'request_id',   p_request_id,
    'status',       p_status,
    'rows_updated', v_row_count
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('ok', false, 'error', SQLERRM, 'sqlstate', SQLSTATE);
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.safe_approve_down_payment(uuid, text, jsonb) TO authenticated;

-- ── BACKFILL (run after the RPC is created) ───────────────────────────────────
-- Create profiles for requesters missing them, then create wallets.
INSERT INTO public.profiles (id, full_name, role, created_at, updated_at)
SELECT
  au.id,
  COALESCE(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', au.email, 'Unknown User'),
  'dataCollector', NOW(), NOW()
FROM auth.users au
WHERE EXISTS (
  SELECT 1 FROM public.down_payment_requests dp WHERE dp.requested_by = au.id
)
AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = au.id)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.wallets (
  user_id, currency, balance_cents, total_earned_cents,
  total_paid_out_cents, pending_payout_cents, balances, total_earned
)
SELECT DISTINCT dp.requested_by, 'SDG', 0, 0, 0, 0, '{"SDG": 0}'::jsonb, 0
FROM public.down_payment_requests dp
WHERE dp.requested_by IS NOT NULL
  AND EXISTS     (SELECT 1 FROM public.profiles p WHERE p.id = dp.requested_by)
  AND NOT EXISTS (SELECT 1 FROM public.wallets  w WHERE w.user_id = dp.requested_by)
ON CONFLICT (user_id) DO NOTHING;

-- Final check
SELECT
  (SELECT COUNT(DISTINCT dp.requested_by)
   FROM public.down_payment_requests dp
   WHERE dp.requested_by IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.wallets w WHERE w.user_id = dp.requested_by)
  ) AS requesters_still_missing_wallet;
