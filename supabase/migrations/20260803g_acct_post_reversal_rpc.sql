-- =============================================================================
-- Migration: acct_post_reversal RPC
-- Date: 2026-08-03
-- Purpose: Provide a single SECURITY DEFINER RPC that atomically:
--   1. Posts a reversal journal entry via the same draft-then-post pattern
--      as acct_post_journal (sanctions check, balance check, triggers).
--   2. Marks the original entry as status='reversed' with reversed_by_entry_id
--      set to the new entry — bypassing the acct_je_no_direct_update RLS
--      policy (USING false) which blocks direct client-side UPDATEs.
--
-- Why a separate RPC rather than extending acct_post_journal:
--   acct_post_journal is called by many bridge RPCs and the GL UI; adding an
--   optional p_original_entry_id parameter would add dead-weight to every call.
--   A focused RPC keeps the contract clean and auditable.
--
-- Idempotency:
--   If the idempotency key already exists, the existing reversal entry is returned
--   and the original is still marked reversed (in case a previous attempt posted
--   the entry but failed before the UPDATE).
--
-- Safe to re-run: CREATE OR REPLACE.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.acct_post_reversal(
  p_original_entry_id uuid,
  p_payload           jsonb,
  p_idempotency_key   text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_entry_id      uuid;
  v_user_id           uuid    := auth.uid();
  v_user_role         text;
  v_period_id         uuid    := (p_payload->>'period_id')::uuid;
  v_period_row        RECORD;
  v_posting_date      date;
  v_lines             jsonb   := COALESCE(p_payload->'lines', '[]'::jsonb);
  v_line              jsonb;
  v_idx               int;
  v_balance_row       RECORD;
  v_acct_row          RECORD;
  v_partner_id        uuid;
  v_screen            RECORD;
  v_original_status   text;
  v_function_required boolean := public.feature_enabled('acct.function_required');
  v_fund_required     boolean := public.feature_enabled('acct.fund_required');
  v_engine_on         boolean := public.feature_enabled('acct.posting_engine.enabled');
  v_sanctions_block   boolean := public.feature_enabled('acct.sanctions.block_on_match');
  v_sod_enforce       boolean := public.feature_enabled('acct.sod.enforce');
BEGIN
  -- ── Auth + engine + key gates ──────────────────────────────────────────────
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: acct_post_reversal must be called by an authenticated user';
  END IF;
  IF NOT v_engine_on THEN
    RAISE EXCEPTION 'POSTING_ENGINE_DISABLED: feature flag acct.posting_engine.enabled is OFF';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED';
  END IF;
  IF p_original_entry_id IS NULL THEN
    RAISE EXCEPTION 'ORIGINAL_ENTRY_REQUIRED: p_original_entry_id must be provided';
  END IF;

  -- ── Authorization ──────────────────────────────────────────────────────────
  SELECT role INTO v_user_role FROM public.profiles WHERE id = v_user_id;
  IF v_user_role IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: caller has no profile row';
  END IF;
  IF v_user_role NOT IN ('super_admin','finance','accountant') THEN
    RAISE EXCEPTION 'AUTHORIZATION_FAILED: role % may not post reversals', v_user_role;
  END IF;

  -- ── Idempotency: if reversal was already posted, just ensure original is marked ──
  SELECT id INTO v_new_entry_id
    FROM public.acct_journal_entries
   WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    -- Reversal entry exists — make sure original is marked (covers partial failure)
    UPDATE public.acct_journal_entries
       SET status               = 'reversed',
           reversed_by_entry_id = v_new_entry_id
     WHERE id     = p_original_entry_id
       AND status = 'posted';
    RETURN v_new_entry_id;
  END IF;

  -- ── Validate original entry exists and is eligible ────────────────────────
  SELECT status INTO v_original_status
    FROM public.acct_journal_entries
   WHERE id = p_original_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORIGINAL_NOT_FOUND: journal entry % does not exist', p_original_entry_id;
  END IF;
  IF v_original_status NOT IN ('posted') THEN
    RAISE EXCEPTION 'ORIGINAL_NOT_REVERSIBLE: entry % has status %; only posted entries can be reversed',
      p_original_entry_id, v_original_status;
  END IF;

  -- ── Period validation ─────────────────────────────────────────────────────
  SELECT status, start_date, end_date INTO v_period_row
    FROM public.acct_fiscal_periods
   WHERE id = v_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: %', v_period_id;
  END IF;
  IF v_period_row.status NOT IN ('open','soft_closed') THEN
    RAISE EXCEPTION 'PERIOD_CLOSED: period % is %', v_period_id, v_period_row.status;
  END IF;
  v_posting_date := COALESCE((p_payload->>'posting_date')::date, CURRENT_DATE);
  IF v_posting_date < v_period_row.start_date OR v_posting_date > v_period_row.end_date THEN
    RAISE EXCEPTION 'POSTING_DATE_OUT_OF_PERIOD: posting_date % not in period [% .. %]',
      v_posting_date, v_period_row.start_date, v_period_row.end_date;
  END IF;

  -- ── At least 2 lines ──────────────────────────────────────────────────────
  IF jsonb_array_length(v_lines) < 2 THEN
    RAISE EXCEPTION 'INSUFFICIENT_LINES: a reversal must have at least 2 lines';
  END IF;

  -- ── Per-line validation ───────────────────────────────────────────────────
  CREATE TEMP TABLE IF NOT EXISTS _acct_rev_line_check (
    line_no             int,
    account_id          uuid,
    fund_id             uuid,
    function_text       text,
    debit_credit        char(2),
    functional_amount   numeric(20,4),
    original_amount     numeric(20,4),
    original_currency   text,
    functional_currency text,
    fx_rate             numeric(20,8),
    project_id          uuid,
    grant_id            uuid,
    cost_center_id      uuid,
    partner_id          uuid,
    description         text
  ) ON COMMIT DROP;
  DELETE FROM _acct_rev_line_check;

  v_idx := 0;
  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    v_idx := v_idx + 1;

    IF v_fund_required AND (v_line->>'fund_id') IS NULL THEN
      RAISE EXCEPTION 'MISSING_FUND: line %', v_idx;
    END IF;
    IF (v_line->>'function') IS NULL THEN
      RAISE EXCEPTION 'MISSING_FUNCTION: line %', v_idx;
    END IF;

    SELECT id, is_active, is_postable, account_type INTO v_acct_row
      FROM public.acct_accounts
     WHERE id = (v_line->>'account_id')::uuid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ACCOUNT_NOT_FOUND: line %, id=%', v_idx, v_line->>'account_id';
    END IF;
    IF NOT v_acct_row.is_active THEN
      RAISE EXCEPTION 'ACCOUNT_INACTIVE: line %, account=%', v_idx, v_line->>'account_id';
    END IF;
    IF NOT v_acct_row.is_postable THEN
      RAISE EXCEPTION 'ACCOUNT_NOT_POSTABLE: line %, account=%', v_idx, v_line->>'account_id';
    END IF;
    IF v_function_required
       AND v_acct_row.account_type = 'expense'
       AND (v_line->>'function') = 'none' THEN
      RAISE EXCEPTION 'MISSING_FUNCTION: expense line % must specify program/mng/fundraising', v_idx;
    END IF;
    IF (v_line->>'original_currency') IS DISTINCT FROM COALESCE(v_line->>'functional_currency','SDG')
       AND (v_line->>'fx_rate') IS NULL THEN
      RAISE EXCEPTION 'FX_RATE_MISSING: line % crosses currency boundary without fx_rate', v_idx;
    END IF;

    INSERT INTO _acct_rev_line_check VALUES (
      v_idx,
      (v_line->>'account_id')::uuid,
      (v_line->>'fund_id')::uuid,
      v_line->>'function',
      v_line->>'debit_credit',
      (v_line->>'functional_amount')::numeric,
      (v_line->>'original_amount')::numeric,
      v_line->>'original_currency',
      COALESCE(v_line->>'functional_currency','SDG'),
      NULLIF(v_line->>'fx_rate','')::numeric,
      NULLIF(v_line->>'project_id','')::uuid,
      NULLIF(v_line->>'grant_id','')::uuid,
      NULLIF(v_line->>'cost_center_id','')::uuid,
      NULLIF(v_line->>'partner_id','')::uuid,
      v_line->>'description'
    );
  END LOOP;

  -- ── Application-level balance check ──────────────────────────────────────
  FOR v_balance_row IN
    SELECT fund_id,
           SUM(CASE WHEN debit_credit='DR' THEN functional_amount ELSE 0 END) AS dr,
           SUM(CASE WHEN debit_credit='CR' THEN functional_amount ELSE 0 END) AS cr
      FROM _acct_rev_line_check
     GROUP BY fund_id
  LOOP
    IF v_balance_row.dr <> v_balance_row.cr THEN
      RAISE EXCEPTION 'BALANCE_MISMATCH: fund=% dr=% cr=%',
        v_balance_row.fund_id, v_balance_row.dr, v_balance_row.cr;
    END IF;
  END LOOP;

  -- ── Sanctions check ───────────────────────────────────────────────────────
  IF v_sanctions_block THEN
    FOR v_partner_id IN
      SELECT DISTINCT partner_id FROM _acct_rev_line_check WHERE partner_id IS NOT NULL
    LOOP
      SELECT * INTO v_screen FROM public.acct_screen_party(v_partner_id);
      IF v_screen.matched THEN
        RAISE EXCEPTION 'SANCTIONS_BLOCK: partner % matches sanctions list (party=%, score=%)',
          v_partner_id, v_screen.matched_party_id, v_screen.match_score;
      END IF;
    END LOOP;
  END IF;

  -- SoD placeholder (same reasoning as acct_post_journal)
  PERFORM v_sod_enforce;

  -- ── INSERT reversal entry as 'draft' ──────────────────────────────────────
  INSERT INTO public.acct_journal_entries (
    period_id, posting_date, description_en, description_ar,
    source_type, source_id, status, branch_id, idempotency_key,
    created_by
  ) VALUES (
    v_period_id,
    v_posting_date,
    p_payload->>'description_en',
    p_payload->>'description_ar',
    'reversal',
    p_original_entry_id,
    'draft',
    NULLIF(p_payload->>'branch_id','')::uuid,
    p_idempotency_key,
    v_user_id
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_new_entry_id;

  IF v_new_entry_id IS NULL THEN
    -- Race condition: another session posted same key; retrieve and still mark original
    SELECT id INTO v_new_entry_id FROM public.acct_journal_entries WHERE idempotency_key = p_idempotency_key;
    UPDATE public.acct_journal_entries
       SET status = 'reversed', reversed_by_entry_id = v_new_entry_id
     WHERE id = p_original_entry_id AND status = 'posted';
    RETURN v_new_entry_id;
  END IF;

  -- ── INSERT lines (entry is 'draft' → INSERT guard allows this) ───────────
  INSERT INTO public.acct_journal_lines (
    entry_id, line_no, account_id, fund_id, function,
    project_id, grant_id, cost_center_id, partner_id,
    original_amount, original_currency,
    functional_amount, functional_currency, fx_rate,
    debit_credit, description
  )
  SELECT v_new_entry_id, line_no, account_id, fund_id, function_text,
         project_id, grant_id, cost_center_id, partner_id,
         original_amount, original_currency,
         functional_amount, functional_currency, fx_rate,
         debit_credit, description
    FROM _acct_rev_line_check
   ORDER BY line_no;

  -- ── Transition reversal entry to 'posted' (fires DEFERRED balance trigger) ─
  UPDATE public.acct_journal_entries
     SET status    = 'posted',
         posted_at = now(),
         posted_by = v_user_id
   WHERE id = v_new_entry_id;

  -- ── Mark original as 'reversed' — atomic in same transaction ─────────────
  UPDATE public.acct_journal_entries
     SET status               = 'reversed',
         reversed_by_entry_id = v_new_entry_id
   WHERE id     = p_original_entry_id
     AND status = 'posted';  -- no-op if already reversed (concurrent call)

  PERFORM pg_notify('acct_journal_posted', v_new_entry_id::text);

  RETURN v_new_entry_id;
END $$;

COMMENT ON FUNCTION public.acct_post_reversal(uuid, jsonb, text) IS
  'Posts a reversal journal entry and atomically marks the original as ''reversed''. '
  'SECURITY DEFINER so the acct_je_no_direct_update RLS policy is bypassed for the '
  'original-entry status update. Uses draft-then-post ordering. Idempotent on '
  'p_idempotency_key. The original entry must be in ''posted'' status.';

GRANT EXECUTE ON FUNCTION public.acct_post_reversal(uuid, jsonb, text) TO authenticated;

COMMIT;
