-- =============================================================================
-- Pre-Fund Scheduler Fixes
-- Addresses three code-review findings:
--   1. run_pre_fund_renewal_check() — replace JWT-based auth with session_user
--      check so pg_cron can invoke it without JWT context.
--   2. store_pre_fund_bank_key()   — add SET search_path = public to the
--      SECURITY DEFINER function (security best-practice gap).
--   3. Automatic bank-feed activation — add a pg_cron job + DB function that
--      runs the amount±tolerance matching automatically every 15 minutes so
--      awaiting_receipt funds activate without any manual UI trigger.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.  run_pre_fund_renewal_check() — cron-safe rewrite
--     Old version gated on request.jwt.claims.role which is absent in pg_cron.
--     New version uses pg_has_role(session_user,...) + relaxed to also allow
--     the postgres/service_role users that pg_cron runs as.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.run_pre_fund_renewal_check()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session text := session_user;       -- reliable in ALL exec contexts incl. pg_cron
  v_checked  int  := 0;
  v_renewed  int  := 0;
  v_fund     record;
  v_new_end  date;
BEGIN
  -- Allow postgres service role (pg_cron) and authenticated Supabase users.
  -- Deliberately NOT checking request.jwt.claims — absent in pg_cron context.
  IF v_session NOT IN ('postgres', 'supabase_admin')
     AND NOT pg_has_role(v_session, 'authenticated', 'MEMBER') THEN
    RAISE EXCEPTION 'run_pre_fund_renewal_check: caller % is not authorised', v_session;
  END IF;

  FOR v_fund IN
    SELECT
      pfr.id,
      pfr.name,
      pfr.end_date,
      pfr.auto_renewal_mode,
      pfr.auto_renewal_days_before,
      pfr.auto_renewal_bypass_approvals,
      pft.day_count  AS period_day_count,
      pfr.period_type_id,
      pfr.amount,
      pfr.currency,
      pfr.created_by
    FROM public.pre_fund_requests pfr
    LEFT JOIN public.pre_fund_period_types pft ON pft.id = pfr.period_type_id
    WHERE pfr.status IN ('active', 'low_balance')
      AND pfr.auto_renewal_mode <> 'off'
      AND pfr.end_date IS NOT NULL
      -- Trigger when within the configured lead-time window
      AND pfr.end_date <= (CURRENT_DATE + COALESCE(pfr.auto_renewal_days_before, 14))
  LOOP
    v_checked := v_checked + 1;

    -- Calculate new end date using the fund's period length (or 90-day default)
    v_new_end := v_fund.end_date + COALESCE(v_fund.period_day_count, 90);

    IF v_fund.auto_renewal_mode = 'auto_activate' OR v_fund.auto_renewal_bypass_approvals THEN
      -- Auto-activate path: extend directly
      UPDATE public.pre_fund_requests
      SET end_date = v_new_end,
          status   = 'active'   -- restore if it fell to low_balance
      WHERE id = v_fund.id;
      v_renewed := v_renewed + 1;

      -- Audit entry
      INSERT INTO public.pre_fund_transactions
        (pre_fund_request_id, transaction_type, amount, currency,
         transaction_date, description, created_by)
      VALUES
        (v_fund.id, 'carry_forward', 0, v_fund.currency,
         CURRENT_DATE,
         format('Auto-renewal: period extended to %s', v_new_end),
         v_fund.created_by)
      ON CONFLICT DO NOTHING;

    ELSIF v_fund.auto_renewal_mode = 'auto_draft' THEN
      -- Draft path: push to pending_approval so a human reviews before spend
      UPDATE public.pre_fund_requests
      SET status = 'pending_approval'
      WHERE id = v_fund.id
        AND status NOT IN ('pending_approval', 'draft');
      v_renewed := v_renewed + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'checked', v_checked,
    'renewed', v_renewed,
    'run_at',  now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_pre_fund_renewal_check() TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_pre_fund_renewal_check() TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.  store_pre_fund_bank_key() — add SET search_path = public
--     SECURITY DEFINER functions without an explicit search_path are
--     vulnerable to search-path injection attacks.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.store_pre_fund_bank_key(
  p_provider  text,
  p_api_key   text,
  p_caller_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public           -- ← closes the search-path injection gap
AS $$
BEGIN
  -- Caller must be an authenticated Supabase user or postgres service role.
  IF session_user NOT IN ('postgres', 'supabase_admin')
     AND NOT pg_has_role(session_user, 'authenticated', 'MEMBER') THEN
    RAISE EXCEPTION 'store_pre_fund_bank_key: unauthorised caller %', session_user;
  END IF;

  -- Upsert the encrypted key into the settings table.
  -- The actual encryption is handled by pgcrypto/vault at rest; we store as-is
  -- here and rely on Supabase Vault or column-level encryption applied via
  -- storage policy. The key is never returned to the client.
  INSERT INTO public.pre_fund_settings (bank_api_provider, bank_api_key_enc)
  VALUES (p_provider, p_api_key)
  ON CONFLICT (id) DO UPDATE
    SET bank_api_provider = EXCLUDED.bank_api_provider,
        bank_api_key_enc  = EXCLUDED.bank_api_key_enc,
        updated_at        = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.store_pre_fund_bank_key(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.store_pre_fund_bank_key(text, text, uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3a. auto_activate_from_bank_feed() — DB function for automatic matching
--     Matches unmatched pre_fund_bank_unmatched entries against
--     awaiting_receipt funds by amount ± tolerance, then activates the fund.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_activate_from_bank_feed()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings    record;
  v_tolerance   numeric;
  v_fund        record;
  v_match       record;
  v_activated   int := 0;
  v_skipped     int := 0;
BEGIN
  -- Load global settings (tolerance defaults to 2 %)
  SELECT
    COALESCE(bank_match_tolerance_pct, 2) / 100.0 AS tol_pct,
    COALESCE(integration_bank_recon, true)         AS enabled
  INTO v_settings
  FROM public.pre_fund_settings
  LIMIT 1;

  IF NOT FOUND OR NOT v_settings.enabled THEN
    RETURN jsonb_build_object('activated', 0, 'skipped', 0, 'note', 'bank_recon disabled');
  END IF;

  FOR v_fund IN
    SELECT id, name, amount, currency,
           gl_receipt_account, gl_liability_account, created_by
    FROM   public.pre_fund_requests
    WHERE  status = 'awaiting_receipt'
    ORDER  BY created_at
  LOOP
    -- Skip if GL accounts not configured — cannot post journal
    IF v_fund.gl_receipt_account IS NULL OR v_fund.gl_liability_account IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_tolerance := GREATEST(0.01, v_fund.amount * v_settings.tol_pct);

    -- Find the first unmatched bank entry that fits amount ± tolerance
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

    -- ── Activate the fund ──────────────────────────────────────────────────
    UPDATE public.pre_fund_requests
    SET status           = 'active',
        available_balance = amount,    -- open the full budget on activation
        activated_at     = now()
    WHERE id = v_fund.id;

    -- ── Receipt transaction (audit trail) ──────────────────────────────────
    INSERT INTO public.pre_fund_transactions
      (pre_fund_request_id, transaction_type, amount, currency,
       transaction_date, description, created_by)
    VALUES
      (v_fund.id, 'receipt', v_fund.amount, v_fund.currency,
       COALESCE(v_match.transaction_date, CURRENT_DATE),
       format('Auto-activated via bank feed (ref: %s)',
              COALESCE(v_match.raw_reference, v_match.id::text)),
       NULL);                           -- system-generated

    -- ── Mark feed entry as matched ─────────────────────────────────────────
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

GRANT EXECUTE ON FUNCTION public.auto_activate_from_bank_feed() TO service_role;
-- Do NOT grant to authenticated — this is a background-only function

-- ─────────────────────────────────────────────────────────────────────────────
-- 3b. pg_cron jobs — schedule both functions automatically
--     Requires pg_cron extension. Jobs are idempotent (unschedule then add).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Only proceed if pg_cron is available
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove stale jobs if they exist (idempotent)
    PERFORM cron.unschedule(jobname)
    FROM    cron.job
    WHERE   jobname IN (
      'pre_fund_auto_renewal_daily',
      'pre_fund_bank_feed_15min'
    );

    -- Daily auto-renewal check at 01:00 UTC
    PERFORM cron.schedule(
      'pre_fund_auto_renewal_daily',
      '0 1 * * *',
      $$SELECT public.run_pre_fund_renewal_check()$$
    );

    -- Bank-feed auto-activation every 15 minutes during business hours
    PERFORM cron.schedule(
      'pre_fund_bank_feed_15min',
      '*/15 6-18 * * 0-5',
      $$SELECT public.auto_activate_from_bank_feed()$$
    );
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.  Ensure pre_fund_settings has the columns used by auto_activate_from_bank_feed
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.pre_fund_settings
  ADD COLUMN IF NOT EXISTS bank_api_provider   text,
  ADD COLUMN IF NOT EXISTS bank_api_key_enc    text,
  ADD COLUMN IF NOT EXISTS bank_match_tolerance_pct numeric NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS integration_bank_recon   boolean NOT NULL DEFAULT true;
