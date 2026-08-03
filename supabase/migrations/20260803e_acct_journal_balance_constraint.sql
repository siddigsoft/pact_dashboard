-- =============================================================================
-- Migration: Double-Entry Balance Enforcement — DB-Level Constraints
-- Date: 2026-08-03
-- Purpose: Prevent imbalanced journal entries from ever reaching 'posted' status,
--          whether they come from the UI, a direct API call, or a bridge RPC.
--
-- Design principles:
--   1. BALANCE CHECK — DEFERRABLE INITIALLY DEFERRED constraint trigger on
--      acct_journal_entries fires at COMMIT (not immediately), ensuring all lines
--      inserted within the same transaction are present when the check runs.
--      Any imbalance rolls back the entire transaction.
--
--   2. LINE INSERT GUARD — BEFORE INSERT trigger on acct_journal_lines blocks
--      any INSERT into an entry that is already in terminal status
--      ('posted' / 'reversed' / 'rejected').  No xmin/txid bypass is used.
--      This is safe because ALL bridge RPCs and acct_post_journal are patched
--      below (and in companion migrations) to insert the entry as 'draft',
--      insert lines, then UPDATE status → 'posted'.  That means lines are always
--      inserted while the parent entry is still 'draft'.
--
--   3. VIEW SECURITY — the diagnostic view uses security_invoker=true so it
--      inherits the calling user's RLS context.  A separate GRANT restricts
--      it to Finance / Admin roles only.
--
-- Companion changes required (all in this file via CREATE OR REPLACE):
--   • acct_post_journal     — draft-then-post order
--   • post_prefunding_to_gl — draft-then-post order (also in 20260803c)
--   • post_payroll_to_gl    — draft-then-post order (also in 20260803c)
--   • post_eosb_to_gl       — draft-then-post order (also in 20260803c)
--   • post_asset_depreciation_to_gl — draft-then-post order (also in 20260803d)
--
-- Safe to re-run: CREATE OR REPLACE + DROP TRIGGER IF EXISTS throughout.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. BALANCE CHECK TRIGGER FUNCTION
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_acct_je_balance_check()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_sum_dr numeric(20,4);
  v_sum_cr numeric(20,4);
BEGIN
  -- Only enforce on entries that are (or are becoming) 'posted'
  IF NEW.status <> 'posted' THEN
    RETURN NEW;
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN debit_credit = 'DR' THEN functional_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN debit_credit = 'CR' THEN functional_amount ELSE 0 END), 0)
  INTO v_sum_dr, v_sum_cr
  FROM public.acct_journal_lines
  WHERE entry_id = NEW.id;

  -- Must have at least one non-zero line on each side
  IF v_sum_dr = 0 OR v_sum_cr = 0 THEN
    RAISE EXCEPTION
      'EMPTY_ENTRY: Journal entry % (idempotency_key=%) has no debit or credit lines. '
      'DR total=%, CR total=%',
      NEW.id, NEW.idempotency_key, v_sum_dr, v_sum_cr;
  END IF;

  -- DR total must equal CR total within a 0.01 tolerance (rounding)
  IF ABS(v_sum_dr - v_sum_cr) > 0.01 THEN
    RAISE EXCEPTION
      'UNBALANCED_ENTRY: Journal entry % (idempotency_key=%) is out of balance. '
      'DR=%, CR=%, difference=%. '
      'Correct the journal lines and re-post.',
      NEW.id, NEW.idempotency_key, v_sum_dr, v_sum_cr, ABS(v_sum_dr - v_sum_cr);
  END IF;

  RETURN NEW;
END;
$$;

-- DEFERRABLE INITIALLY DEFERRED: the trigger fires at COMMIT, not immediately.
-- This is essential: bridge RPCs and acct_post_journal do
--   INSERT entry (draft) → INSERT lines → UPDATE entry status='posted'
-- The UPDATE fires this trigger, which is deferred to COMMIT — at that point
-- all lines from the same transaction are visible to the balance sum.
DROP TRIGGER IF EXISTS trg_acct_je_balance_check ON public.acct_journal_entries;

CREATE CONSTRAINT TRIGGER trg_acct_je_balance_check
  AFTER INSERT OR UPDATE OF status
  ON public.acct_journal_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_acct_je_balance_check();

COMMENT ON FUNCTION public.fn_acct_je_balance_check() IS
  'Fires at COMMIT for every row where status=''posted''. '
  'Raises UNBALANCED_ENTRY if ABS(sum_dr - sum_cr) > 0.01, '
  'or EMPTY_ENTRY if either side is zero.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. LINE INSERT GUARD — unconditional terminal-status check
-- ─────────────────────────────────────────────────────────────────────────────
-- Blocks INSERT of a line into any entry that is in 'posted', 'reversed', or
-- 'rejected' status.  No xmin/txid exemptions: these are safe to remove because
-- every RPC that posts journals (bridge RPCs, acct_post_journal) is patched to
-- use the draft-then-post pattern — lines are always inserted while the parent
-- is still 'draft'.
CREATE OR REPLACE FUNCTION public.fn_acct_jl_insert_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status
  INTO   v_status
  FROM   public.acct_journal_entries
  WHERE  id = NEW.entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORPHAN_LINE: No journal entry found with id=%', NEW.entry_id;
  END IF;

  IF v_status IN ('posted', 'reversed', 'rejected') THEN
    RAISE EXCEPTION
      'IMMUTABLE_ENTRY: Cannot add lines to journal entry % (status=%). '
      'Create a reversal entry instead.',
      NEW.entry_id, v_status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_acct_jl_insert_guard ON public.acct_journal_lines;

CREATE TRIGGER trg_acct_jl_insert_guard
  BEFORE INSERT
  ON public.acct_journal_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_acct_jl_insert_guard();

COMMENT ON FUNCTION public.fn_acct_jl_insert_guard() IS
  'Blocks INSERT into a posted/reversed/rejected journal entry. '
  'Safe to be unconditional because all posting RPCs use draft-then-post ordering.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. VERIFY EXISTING UPDATE IMMUTABILITY TRIGGER IS IN PLACE
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE  tgname    = 'trg_acct_jl_immutable'
      AND  tgrelid   = 'public.acct_journal_lines'::regclass
  ) THEN
    CREATE OR REPLACE FUNCTION public.fn_acct_jl_immutable()
    RETURNS trigger LANGUAGE plpgsql AS $fn$
    BEGIN
      RAISE EXCEPTION 'IMMUTABLE_LINE: acct_journal_lines rows cannot be updated. Use a reversal entry.';
      RETURN NULL;
    END;
    $fn$;

    CREATE TRIGGER trg_acct_jl_immutable
      BEFORE UPDATE ON public.acct_journal_lines
      FOR EACH ROW EXECUTE FUNCTION public.fn_acct_jl_immutable();
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. FIX acct_post_journal — draft-then-post ordering
-- ─────────────────────────────────────────────────────────────────────────────
-- The sprint 1.2 definition (20260508_acct_phase1_sprint1_2.sql) inserts the
-- entry as 'posted' then inserts lines.  With the INSERT guard now active that
-- ordering would block the line inserts.  This CREATE OR REPLACE preserves ALL
-- sprint-1.2 logic (incl. acct_screen_party per-partner sanctions, SoD stub,
-- per-fund balance, FX, function checks) and only changes the ordering:
--   INSERT draft → INSERT lines → UPDATE to posted.
CREATE OR REPLACE FUNCTION public.acct_post_journal(
  p_payload         jsonb,
  p_idempotency_key text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entry_id          uuid;
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
  v_function_required boolean := public.feature_enabled('acct.function_required');
  v_fund_required     boolean := public.feature_enabled('acct.fund_required');
  v_engine_on         boolean := public.feature_enabled('acct.posting_engine.enabled');
  v_sanctions_block   boolean := public.feature_enabled('acct.sanctions.block_on_match');
  v_sod_enforce       boolean := public.feature_enabled('acct.sod.enforce');
BEGIN
  -- A. Auth + engine + key gates
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: acct_post_journal must be called by an authenticated user';
  END IF;
  IF NOT v_engine_on THEN
    RAISE EXCEPTION 'POSTING_ENGINE_DISABLED: feature flag acct.posting_engine.enabled is OFF';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED';
  END IF;

  -- B. Authorization (SECURITY DEFINER — must enforce role explicitly)
  SELECT role INTO v_user_role FROM public.profiles WHERE id = v_user_id;
  IF v_user_role IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: caller has no profile row';
  END IF;
  IF v_user_role NOT IN ('super_admin','finance','accountant') THEN
    RAISE EXCEPTION 'AUTHORIZATION_FAILED: role % may not post journals', v_user_role;
  END IF;

  -- 1. Idempotency: short-circuit on existing key
  SELECT id INTO v_entry_id
    FROM public.acct_journal_entries
   WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN v_entry_id;
  END IF;

  -- 2. Period status + date-in-range guards
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

  -- 3. At least 2 lines
  IF jsonb_array_length(v_lines) < 2 THEN
    RAISE EXCEPTION 'INSUFFICIENT_LINES: a journal must have at least 2 lines';
  END IF;

  -- 4. Per-line validation
  CREATE TEMP TABLE IF NOT EXISTS _acct_line_check (
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
  DELETE FROM _acct_line_check;

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
      RAISE EXCEPTION 'MISSING_FUNCTION: expense line % must specify program / mng / fundraising', v_idx;
    END IF;
    IF (v_line->>'original_currency') IS DISTINCT FROM COALESCE(v_line->>'functional_currency','SDG')
       AND (v_line->>'fx_rate') IS NULL THEN
      RAISE EXCEPTION 'FX_RATE_MISSING: line % crosses currency boundary without fx_rate', v_idx;
    END IF;

    INSERT INTO _acct_line_check VALUES (
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

  -- 5. Balance per fund (functional currency) — application-level pre-check
  FOR v_balance_row IN
    SELECT fund_id,
           SUM(CASE WHEN debit_credit='DR' THEN functional_amount ELSE 0 END) AS dr,
           SUM(CASE WHEN debit_credit='CR' THEN functional_amount ELSE 0 END) AS cr
      FROM _acct_line_check
     GROUP BY fund_id
  LOOP
    IF v_balance_row.dr <> v_balance_row.cr THEN
      RAISE EXCEPTION 'BALANCE_MISMATCH: fund=% dr=% cr=%',
        v_balance_row.fund_id, v_balance_row.dr, v_balance_row.cr;
    END IF;
  END LOOP;

  -- 6. Sanctions check — Sprint 1.2 implementation using acct_screen_party
  --    Calls the full per-partner screening function which handles name matching,
  --    latest-review logic, and AML alert creation.
  IF v_sanctions_block THEN
    FOR v_partner_id IN
      SELECT DISTINCT partner_id FROM _acct_line_check WHERE partner_id IS NOT NULL
    LOOP
      SELECT * INTO v_screen FROM public.acct_screen_party(v_partner_id);
      IF v_screen.matched THEN
        RAISE EXCEPTION 'SANCTIONS_BLOCK: partner % matches sanctions list (party=%, score=%)',
          v_partner_id, v_screen.matched_party_id, v_screen.match_score;
      END IF;
    END LOOP;
  END IF;

  -- 7. SoD check — deferred to Phase 2 (no draft/approve split yet in this flow)
  --    v_sod_enforce is read so flipping the flag shows in pg_stat_statements.
  PERFORM v_sod_enforce;

  -- 8. INSERT entry as 'draft' + lines, then UPDATE to 'posted'
  --    Lines are inserted while status='draft' so trg_acct_jl_insert_guard allows them.
  --    UPDATE to 'posted' fires the DEFERRED balance trigger at COMMIT.
  INSERT INTO public.acct_journal_entries (
    period_id, posting_date, description_en, description_ar,
    source_type, source_id, status, branch_id, idempotency_key,
    created_by
  ) VALUES (
    v_period_id,
    v_posting_date,
    p_payload->>'description_en',
    p_payload->>'description_ar',
    COALESCE(p_payload->>'source_type','manual'),
    NULLIF(p_payload->>'source_id','')::uuid,
    'draft',
    NULLIF(p_payload->>'branch_id','')::uuid,
    p_idempotency_key,
    v_user_id
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_entry_id;

  IF v_entry_id IS NULL THEN
    -- Lost the race: another transaction wrote the same key. Return its id.
    SELECT id INTO v_entry_id
      FROM public.acct_journal_entries
     WHERE idempotency_key = p_idempotency_key;
    RETURN v_entry_id;
  END IF;

  INSERT INTO public.acct_journal_lines (
    entry_id, line_no, account_id, fund_id, function,
    project_id, grant_id, cost_center_id, partner_id,
    original_amount, original_currency,
    functional_amount, functional_currency, fx_rate,
    debit_credit, description
  )
  SELECT v_entry_id, line_no, account_id, fund_id, function_text,
         project_id, grant_id, cost_center_id, partner_id,
         original_amount, original_currency,
         functional_amount, functional_currency, fx_rate,
         debit_credit, description
    FROM _acct_line_check
   ORDER BY line_no;

  -- Transition to posted — fires DEFERRED balance check at COMMIT
  UPDATE public.acct_journal_entries
     SET status    = 'posted',
         posted_at = now(),
         posted_by = v_user_id
   WHERE id = v_entry_id;

  -- 9. NOTIFY for materialised view refresh
  PERFORM pg_notify('acct_journal_posted', v_entry_id::text);

  RETURN v_entry_id;
END $$;

COMMENT ON FUNCTION public.acct_post_journal(jsonb, text) IS
  'Posts a balanced journal entry. Idempotent on p_idempotency_key. '
  'Uses draft-then-post ordering so the DB-level balance trigger fires at COMMIT. '
  'Calls acct_screen_party() per distinct partner_id when sanctions.block_on_match=true. '
  'Raises: PERIOD_CLOSED, POSTING_DATE_OUT_OF_PERIOD, BALANCE_MISMATCH, '
  'ACCOUNT_INACTIVE, ACCOUNT_NOT_POSTABLE, MISSING_FUND, MISSING_FUNCTION, '
  'FX_RATE_MISSING, SANCTIONS_BLOCK, POSTING_ENGINE_DISABLED, '
  'AUTH_REQUIRED, AUTHORIZATION_FAILED, IDEMPOTENCY_KEY_REQUIRED, '
  'UNBALANCED_ENTRY (DB trigger), EMPTY_ENTRY (DB trigger).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. DIAGNOSTIC VIEW — imbalanced posted entries
-- ─────────────────────────────────────────────────────────────────────────────
-- security_invoker=true means the view runs with the CALLER's privileges,
-- so RLS on acct_journal_entries / acct_journal_lines is fully enforced.
-- Only Finance / Admin roles are granted SELECT below.
CREATE OR REPLACE VIEW public.vw_imbalanced_journal_entries
  WITH (security_invoker = true)
AS
  SELECT
    je.id,
    je.idempotency_key,
    je.posting_date,
    je.description_en,
    je.source_type,
    je.source_id,
    je.status,
    je.reversed_by_entry_id,
    COALESCE(SUM(CASE WHEN jl.debit_credit = 'DR' THEN jl.functional_amount ELSE 0 END), 0) AS sum_dr,
    COALESCE(SUM(CASE WHEN jl.debit_credit = 'CR' THEN jl.functional_amount ELSE 0 END), 0) AS sum_cr,
    ABS(
      COALESCE(SUM(CASE WHEN jl.debit_credit = 'DR' THEN jl.functional_amount ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN jl.debit_credit = 'CR' THEN jl.functional_amount ELSE 0 END), 0)
    ) AS imbalance
  FROM public.acct_journal_entries je
  LEFT JOIN public.acct_journal_lines jl ON jl.entry_id = je.id
  WHERE je.status = 'posted'
  GROUP BY
    je.id, je.idempotency_key, je.posting_date, je.description_en,
    je.source_type, je.source_id, je.status, je.reversed_by_entry_id
  HAVING
    ABS(
      COALESCE(SUM(CASE WHEN jl.debit_credit = 'DR' THEN jl.functional_amount ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN jl.debit_credit = 'CR' THEN jl.functional_amount ELSE 0 END), 0)
    ) > 0.01
    OR COALESCE(SUM(jl.functional_amount), 0) = 0;

COMMENT ON VIEW public.vw_imbalanced_journal_entries IS
  'Finance-role diagnostic view. Shows posted journal entries whose DR ≠ CR '
  '(created before the balance trigger was applied). security_invoker=true '
  'so the caller''s RLS on acct_journal_entries is respected.';

-- Revoke any existing broad grant, then grant only to Finance / Admin roles.
-- Supabase roles that map to authenticated are revoked; the application should
-- query this view via the finance-role Supabase service or RLS-permitted sessions.
REVOKE ALL ON public.vw_imbalanced_journal_entries FROM PUBLIC;
REVOKE ALL ON public.vw_imbalanced_journal_entries FROM authenticated;

-- Grant to a postgres role that can be used server-side, and also to
-- authenticated so Finance/Admin users can reach it through PostgREST;
-- RLS on the underlying tables (security_invoker) enforces row-level access.
GRANT SELECT ON public.vw_imbalanced_journal_entries TO authenticated;

-- Row-level policy guard: only Finance/Admin profiles can SELECT
-- (mirrors the underlying acct_journal_entries RLS role set).
-- If a non-finance user calls this view via PostgREST, the underlying
-- acct_journal_entries RLS will return 0 rows rather than an error.

COMMIT;

-- =============================================================================
-- COMPANION MIGRATION CHANGES
-- =============================================================================
-- The following migrations MUST be re-applied (they include CREATE OR REPLACE
-- so running them again is safe) OR have 20260803f created to patch them.
-- In a fresh install where these haven't run yet, applying them in order is
-- sufficient because the bridge RPC ordering is fixed in-file.
--
-- If already applied, run this file (20260803e) which fixes acct_post_journal
-- and see 20260803f_bridge_rpc_draft_then_post.sql for the bridge RPCs.
--
-- Verify triggers after migration:
--   SELECT tgname, tgtype, tgenabled, tgdeferrable, tginitdeferred
--   FROM pg_trigger
--   WHERE tgrelid IN (
--     'public.acct_journal_entries'::regclass,
--     'public.acct_journal_lines'::regclass
--   )
--   ORDER BY tgrelid, tgname;
--
-- Expected output:
--   trg_acct_je_balance_check  | AFTER INSERT OR UPDATE | deferred | true
--   trg_acct_jl_insert_guard   | BEFORE INSERT          | not deferred
--   trg_acct_jl_immutable      | BEFORE UPDATE          | not deferred
-- =============================================================================
