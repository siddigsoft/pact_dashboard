-- =============================================================================
-- Pre-Fund Scheduler Fixes
-- Addresses three code-review findings without overwriting existing functions:
--   1. store_pre_fund_bank_key() — correct signature + pgp_sym_encrypt
--   2. auto_activate_from_bank_feed() — new DB function for automatic matching
--      (the manual UI button in PreFundingRegistry is kept as fallback)
--   3. pg_cron jobs — schedule both auto-renewal and bank-feed functions
--   4. pre_fund_settings columns used by the auto functions
--
-- NOTE: run_pre_fund_renewal_check() is intentionally NOT redefined here.
-- It was created by a prior migration with full renewal semantics (new-period
-- drafts, grace windows, audit actor). This file only schedules it via
-- pg_cron so it runs daily without any JWT context.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.  store_pre_fund_bank_key()
--     Exact signature: (p_settings_id uuid, p_key text)  ← matches UI call
--       supabase.rpc('store_pre_fund_bank_key', { p_settings_id, p_key })
--     Security:
--       • SECURITY DEFINER so it can write to pre_fund_settings
--       • SET search_path = public (closes SECURITY DEFINER injection gap)
--       • pgp_sym_encrypt() stores the key encrypted, never plaintext
--       • The passphrase is read from a Postgres config setting so it is
--         never hard-coded and never visible to clients.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.store_pre_fund_bank_key(
  p_settings_id uuid,
  p_key         text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_passphrase text;
BEGIN
  -- Caller must be an authenticated Supabase user or postgres service role.
  IF session_user NOT IN ('postgres', 'supabase_admin')
     AND NOT pg_has_role(session_user, 'authenticated', 'MEMBER') THEN
    RAISE EXCEPTION 'store_pre_fund_bank_key: unauthorised caller %', session_user;
  END IF;

  IF p_key IS NULL OR trim(p_key) = '' THEN
    RAISE EXCEPTION 'store_pre_fund_bank_key: p_key must not be empty';
  END IF;

  -- Passphrase stored in Postgres config (set via ALTER DATABASE/Supabase secrets).
  -- Falls back to a hard-fail so we never silently store plaintext.
  v_passphrase := current_setting('app.pre_fund_enc_key', true);
  IF v_passphrase IS NULL OR trim(v_passphrase) = '' THEN
    RAISE EXCEPTION
      'store_pre_fund_bank_key: app.pre_fund_enc_key config is not set. '
      'Run: ALTER DATABASE postgres SET app.pre_fund_enc_key = ''<secret>''';
  END IF;

  -- Encrypt and upsert — the raw key never touches the DB in plaintext.
  UPDATE public.pre_fund_settings
  SET bank_api_key_enc = encode(
                           pgp_sym_encrypt(trim(p_key), v_passphrase),
                           'base64'
                         )
  WHERE id = p_settings_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'store_pre_fund_bank_key: settings row % not found', p_settings_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.store_pre_fund_bank_key(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.store_pre_fund_bank_key(uuid, text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.  auto_activate_from_bank_feed()
--     New function — does NOT exist in any prior migration.
--     Queries pre_fund_bank_unmatched, matches by amount ± tolerance,
--     and activates awaiting_receipt funds automatically.
--     This is the automatic counterpart to the manual handleBankApiCheck UI
--     button in PreFundingRegistry.tsx (which is kept as a manual fallback).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_activate_from_bank_feed()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tol_pct     numeric;
  v_enabled     boolean;
  v_tolerance   numeric;
  v_fund        record;
  v_match       record;
  v_activated   int := 0;
  v_skipped     int := 0;
BEGIN
  -- Load global settings (tolerance defaults to 2 %, recon defaults to enabled)
  SELECT
    COALESCE(bank_match_tolerance_pct, 2) / 100.0,
    COALESCE(integration_bank_recon, true)
  INTO v_tol_pct, v_enabled
  FROM public.pre_fund_settings
  LIMIT 1;

  IF NOT v_enabled THEN
    RETURN jsonb_build_object('activated', 0, 'skipped', 0,
                              'note', 'bank_recon_disabled');
  END IF;

  FOR v_fund IN
    SELECT id, name, amount, currency,
           gl_receipt_account, gl_liability_account, created_by
    FROM   public.pre_fund_requests
    WHERE  status = 'awaiting_receipt'
    ORDER  BY created_at
  LOOP
    -- Skip funds without GL accounts — cannot post journal entries
    IF v_fund.gl_receipt_account IS NULL OR v_fund.gl_liability_account IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_tolerance := GREATEST(0.01, v_fund.amount * COALESCE(v_tol_pct, 0.02));

    -- Pick the oldest unmatched bank entry within amount ± tolerance
    SELECT *
    INTO   v_match
    FROM   public.pre_fund_bank_unmatched
    WHERE  match_status = 'unmatched'
      AND  currency     = v_fund.currency
      AND  ABS(amount - v_fund.amount) <= v_tolerance
    ORDER  BY transaction_date, created_at
    LIMIT  1;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    -- Activate the fund — opens its full budget
    UPDATE public.pre_fund_requests
    SET status            = 'active',
        available_balance = amount
    WHERE id = v_fund.id;

    -- Receipt transaction (audit trail)
    INSERT INTO public.pre_fund_transactions
      (pre_fund_request_id, transaction_type, amount, currency,
       transaction_date, description, created_by)
    VALUES
      (v_fund.id, 'receipt', v_fund.amount, v_fund.currency,
       COALESCE(v_match.transaction_date, CURRENT_DATE),
       format('Auto-activated via bank feed (ref: %s)',
              COALESCE(v_match.raw_reference, v_match.id::text)),
       NULL);

    -- Mark feed entry as matched
    UPDATE public.pre_fund_bank_unmatched
    SET match_status    = 'matched',
        matched_fund_id = v_fund.id,
        reviewed_at     = now()
    WHERE id = v_match.id;

    v_activated := v_activated + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'activated', v_activated,
    'skipped',   v_skipped,
    'run_at',    now()
  );
END;
$$;

-- Only service_role (pg_cron, Edge Functions) can invoke this — not the client
REVOKE ALL ON FUNCTION public.auto_activate_from_bank_feed() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.auto_activate_from_bank_feed() TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.  pg_cron jobs — schedule both the pre-existing renewal check and the new
--     bank-feed activation automatically.
--     Idempotent: unschedules before re-adding.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Clean up stale registrations
    PERFORM cron.unschedule(jobname)
    FROM    cron.job
    WHERE   jobname IN (
      'pre_fund_auto_renewal_daily',
      'pre_fund_bank_feed_15min'
    );

    -- Daily at 01:00 UTC — calls the pre-existing run_pre_fund_renewal_check()
    -- No JWT context needed: function now uses session_user-based auth
    PERFORM cron.schedule(
      'pre_fund_auto_renewal_daily',
      '0 1 * * *',
      $$SELECT public.run_pre_fund_renewal_check()$$
    );

    -- Every 15 min, business hours Mon–Sat 06:00–18:00 UTC
    PERFORM cron.schedule(
      'pre_fund_bank_feed_15min',
      '*/15 6-18 * * 0-5',
      $$SELECT public.auto_activate_from_bank_feed()$$
    );
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.  pre_fund_settings columns consumed by auto functions
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.pre_fund_settings
  ADD COLUMN IF NOT EXISTS bank_api_provider        text,
  ADD COLUMN IF NOT EXISTS bank_api_key_enc         text,
  ADD COLUMN IF NOT EXISTS bank_match_tolerance_pct numeric NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS integration_bank_recon   boolean NOT NULL DEFAULT true;
