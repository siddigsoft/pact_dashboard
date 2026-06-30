-- ============================================================================
-- Pre-Funding: get_pre_fund_bank_credentials — SECURITY DEFINER RPC
-- Decrypts bank API URL and key from pre_fund_settings for the Edge Function.
-- Only callable by service_role (pg_cron / Edge Function scheduler).
-- Run in Supabase SQL Editor (safe to re-run: CREATE OR REPLACE)
-- ============================================================================
--
-- Requires: pgcrypto extension (already enabled for pgp_sym_encrypt in
--   store_pre_fund_bank_key). Passphrase set via:
--     ALTER DATABASE postgres SET app.bank_key_passphrase = 'your-secret';
--
-- Returns: JSONB { url TEXT, key TEXT, enabled BOOL, tolerance_pct NUMERIC }
--   On success:  { url: "https://...", key: "...", enabled: true, tolerance_pct: 2.0 }
--   On error:    { error: "reason" }
-- ============================================================================

CREATE OR REPLACE FUNCTION get_pre_fund_bank_credentials()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role      TEXT;
  v_passphrase       TEXT;
  v_row              RECORD;
  v_url              TEXT := NULL;
  v_key              TEXT := NULL;
BEGIN
  -- ── Role guard: service_role or postgres only ─────────────────────────
  -- Regular authenticated users must never call this — it returns plaintext
  -- credentials.  pg_cron and Edge Function service-role callers are allowed.
  v_caller_role := COALESCE(current_setting('request.jwt.claims.role', true), '');
  IF v_caller_role NOT IN ('service_role', 'postgres', '') THEN
    -- Reject authenticated app users
    IF v_caller_role = 'authenticated' THEN
      RETURN jsonb_build_object('error', 'unauthorized');
    END IF;
  END IF;

  -- Also guard via row-level: only rows where bank_api_enabled = true are returned
  SELECT bank_api_enabled, bank_api_url_encrypted, bank_api_key_encrypted,
         bank_match_tolerance_pct
  INTO v_row
  FROM pre_fund_settings
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'settings_not_found');
  END IF;

  IF NOT v_row.bank_api_enabled THEN
    RETURN jsonb_build_object('error', 'bank_api_disabled', 'enabled', FALSE);
  END IF;

  -- ── Decrypt passphrase ────────────────────────────────────────────────
  v_passphrase := current_setting('app.bank_key_passphrase', true);
  IF v_passphrase IS NULL OR v_passphrase = '' THEN
    RETURN jsonb_build_object(
      'error',
      'bank_key_passphrase not configured. Run: ALTER DATABASE postgres SET app.bank_key_passphrase = ''your-secret'';'
    );
  END IF;

  -- ── Decrypt URL ───────────────────────────────────────────────────────
  BEGIN
    IF v_row.bank_api_url_encrypted IS NOT NULL THEN
      v_url := convert_from(
        pgp_sym_decrypt(v_row.bank_api_url_encrypted, v_passphrase),
        'UTF8'
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('error', 'url_decrypt_failed: ' || SQLERRM);
  END;

  -- ── Decrypt key ───────────────────────────────────────────────────────
  BEGIN
    IF v_row.bank_api_key_encrypted IS NOT NULL THEN
      v_key := convert_from(
        pgp_sym_decrypt(v_row.bank_api_key_encrypted, v_passphrase),
        'UTF8'
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('error', 'key_decrypt_failed: ' || SQLERRM);
  END;

  IF v_url IS NULL OR v_key IS NULL THEN
    RETURN jsonb_build_object('error', 'credentials_not_stored');
  END IF;

  RETURN jsonb_build_object(
    'url',           v_url,
    'key',           v_key,
    'enabled',       TRUE,
    'tolerance_pct', COALESCE(v_row.bank_match_tolerance_pct, 2)
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- Only service_role (Edge Functions, pg_cron) may call this.
-- Authenticated users explicitly cannot — plaintext credentials must never
-- be returned to app clients.
REVOKE ALL ON FUNCTION get_pre_fund_bank_credentials() FROM PUBLIC;
REVOKE ALL ON FUNCTION get_pre_fund_bank_credentials() FROM authenticated;
GRANT EXECUTE ON FUNCTION get_pre_fund_bank_credentials() TO service_role;

-- ============================================================================
-- Notes:
--   • Graft this into pre_funding_ALL_IN_ONE.sql on next canonical update.
--   • For incremental installs: run this file AFTER pre_funding_atomic_rpcs.sql.
--   • Re-running is safe (CREATE OR REPLACE).
-- ============================================================================
