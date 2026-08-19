-- =============================================================================
-- Cycle Close Redirect — Reprocessed Payment Reversal (Task 562)
--
-- This is the THIRD correction path for a legacy Redirect. It applies only when
-- the original advance was intentionally RESTORED (cancelled -> pending) and then
-- PAID AGAIN through the normal advance-payment flow (installment / fully paid),
-- producing later GL journals and later wallet debits that must be reversed so a
-- clean, unexecuted replacement resolution can be produced.
--
-- Distinct from the two existing paths, both of which are left UNCHANGED:
--   * reopen_cycle_redirect_for_correction     (20260819g) — advance still
--     cancelled, no reprocessing; reverses only the original Redirect journal.
--   * reconcile_reprocessed_cycle_redirect     (20260819m) — advance reprocessed
--     but accounting-only; preserves the current advance, status, site, metadata.
--
-- The reprocessed-payment path here goes further than the accounting-only path:
--   1. Reverses the original Redirect journal (via acct_post_reversal), exactly
--      like the historical path, reusing its immutable fee snapshot and its
--      later-fee-activity fail-closed checks and preserving the original bridge
--      log with acct_gl_bridge_reversal_links.
--   2. Reverses every LATER advance-payment GL journal that was posted after the
--      proven restore, inside a nested subtransaction so any single failure rolls
--      the whole set back.
--   3. Reverses every LATER wallet transaction (current refs minus original refs)
--      by marking each source row status='reversed' (never deleting) and undoing
--      its exact balance effect on the wallet.
--   4. Restores the advance to its original paid state, source site, total paid,
--      original payment refs, and remaining amount, removes the Redirect markers,
--      and creates a new unexecuted replacement cycle_exception_actions row so
--      Final Close stays blocked until a fresh resolution executes.
--
-- INVARIANTS (fail closed everywhere):
--   * Nothing is ever deleted — journals are reversed, wallet rows are marked
--     reversed, and the advance metadata/audit_log/payment_proof is preserved.
--   * Every mutation is atomic within the single RPC transaction; the later
--     journal reversals additionally use a nested subtransaction.
--   * Ambiguous, missing, or error-only later history is rejected for manual
--     Finance review rather than guessed at.
--   * Same idempotency key returns the completed result; a different key or a
--     different completed correction path fails.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Extend the correction_status constraint with the third status.
--    Constraint name is dropped/recreated dynamically to stay in sync with the
--    two earlier migrations that own it.
-- -----------------------------------------------------------------------------
ALTER TABLE public.cycle_exception_actions
  DROP CONSTRAINT IF EXISTS cycle_exception_actions_correction_status_check;
ALTER TABLE public.cycle_exception_actions
  ADD CONSTRAINT cycle_exception_actions_correction_status_check
  CHECK (
    correction_status IS NULL
    OR correction_status IN (
      'reopened_for_correction',
      'historically_reconciled',
      'reprocessed_payment_reversed'
    )
  );

CREATE INDEX IF NOT EXISTS idx_cea_reprocessed_payment_reversals
  ON public.cycle_exception_actions (mmp_file_id, corrected_at DESC)
  WHERE correction_status = 'reprocessed_payment_reversed';

-- -----------------------------------------------------------------------------
-- 2. Dedicated immutable parent/child audit tables for this correction.
--    acct_gl_bridge_reversal_links (20260819g) still records ONLY the original
--    Redirect journal reversal. These new tables record the parent correction
--    event plus one child row per later payment journal reversal and one child
--    row per later wallet reversal, with unique links and idempotency and
--    read-only authenticated RLS.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cycle_redirect_reprocessed_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correction_action_id uuid NOT NULL UNIQUE
    REFERENCES public.cycle_exception_actions(id),
  advance_id uuid NOT NULL REFERENCES public.down_payment_requests(id),
  original_journal_entry_id uuid NOT NULL REFERENCES public.acct_journal_entries(id),
  original_reversal_journal_entry_id uuid NOT NULL UNIQUE
    REFERENCES public.acct_journal_entries(id),
  replacement_action_id uuid REFERENCES public.cycle_exception_actions(id),
  restore_event_at timestamptz,
  original_total_paid numeric(18,2),
  reprocessed_total_paid numeric(18,2),
  reprocessed_site_entry_id uuid REFERENCES public.mmp_site_entries(id),
  original_wallet_transaction_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  reprocessed_wallet_transaction_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  payment_proof_url text,
  later_journal_reversal_count integer NOT NULL DEFAULT 0,
  later_wallet_reversal_count integer NOT NULL DEFAULT 0,
  later_gl_total numeric(18,2) NOT NULL DEFAULT 0,
  later_wallet_total numeric(18,2) NOT NULL DEFAULT 0,
  reason text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  reversed_by uuid NOT NULL REFERENCES public.profiles(id),
  reversed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cycle_redirect_reprocessed_reversals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cycle_redirect_reprocessed_reversals_read
  ON public.cycle_redirect_reprocessed_reversals;
CREATE POLICY cycle_redirect_reprocessed_reversals_read
  ON public.cycle_redirect_reprocessed_reversals
  FOR SELECT TO authenticated
  USING (public.is_cycle_exception_executor(auth.uid()));
GRANT SELECT ON public.cycle_redirect_reprocessed_reversals TO authenticated;

-- One child row per reversed LATER advance-payment journal.
CREATE TABLE IF NOT EXISTS public.cycle_redirect_reprocessed_journal_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL
    REFERENCES public.cycle_redirect_reprocessed_reversals(id) ON DELETE CASCADE,
  bridge_log_id uuid NOT NULL UNIQUE REFERENCES public.acct_gl_bridge_log(id),
  original_journal_entry_id uuid NOT NULL UNIQUE
    REFERENCES public.acct_journal_entries(id),
  reversal_journal_entry_id uuid NOT NULL UNIQUE
    REFERENCES public.acct_journal_entries(id),
  event_type text NOT NULL,
  amount numeric(18,2) NOT NULL,
  reversed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cycle_redirect_reprocessed_journal_reversals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cycle_redirect_reprocessed_journal_reversals_read
  ON public.cycle_redirect_reprocessed_journal_reversals;
CREATE POLICY cycle_redirect_reprocessed_journal_reversals_read
  ON public.cycle_redirect_reprocessed_journal_reversals
  FOR SELECT TO authenticated
  USING (public.is_cycle_exception_executor(auth.uid()));
GRANT SELECT ON public.cycle_redirect_reprocessed_journal_reversals TO authenticated;

-- One child row per reversed LATER wallet transaction.
CREATE TABLE IF NOT EXISTS public.cycle_redirect_reprocessed_wallet_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL
    REFERENCES public.cycle_redirect_reprocessed_reversals(id) ON DELETE CASCADE,
  wallet_transaction_id uuid NOT NULL UNIQUE
    REFERENCES public.wallet_transactions(id),
  wallet_id uuid REFERENCES public.wallets(id),
  currency text NOT NULL,
  amount numeric(18,2) NOT NULL,
  balance_effect numeric(18,2) NOT NULL,
  reversed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cycle_redirect_reprocessed_wallet_reversals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cycle_redirect_reprocessed_wallet_reversals_read
  ON public.cycle_redirect_reprocessed_wallet_reversals;
CREATE POLICY cycle_redirect_reprocessed_wallet_reversals_read
  ON public.cycle_redirect_reprocessed_wallet_reversals
  FOR SELECT TO authenticated
  USING (public.is_cycle_exception_executor(auth.uid()));
GRANT SELECT ON public.cycle_redirect_reprocessed_wallet_reversals TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. Replace acct_post_reversal safely in this later migration.
--    Reversal journal entries must preserve the ORIGINAL journal's country_id,
--    and reversal lines must preserve the ORIGINAL line company_id. The rest of
--    the engine (case-safe authorization, all validation, idempotency, and the
--    reversal guard trigger behavior) is retained unchanged. Auth is NOT
--    weakened: it keeps the case-safe is_cycle_redirect_correction_authorizer
--    check introduced by 20260819m (or the legacy block, if 20260819m has not
--    yet run in this environment).
-- -----------------------------------------------------------------------------
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
  v_existing_source_type text;
  v_existing_source_id uuid;
  v_user_id           uuid    := auth.uid();
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
  v_original_country  uuid;
  v_original_branch   uuid;
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

  -- ── Authorization (case-safe, not weakened) ────────────────────────────────
  IF NOT public.is_cycle_redirect_correction_authorizer(v_user_id) THEN
    RAISE EXCEPTION 'AUTHORIZATION_FAILED: caller may not post reversals';
  END IF;

  -- ── Idempotency: if reversal was already posted, just ensure original is marked ──
  SELECT id, source_type, source_id
    INTO v_new_entry_id, v_existing_source_type, v_existing_source_id
    FROM public.acct_journal_entries
   WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing_source_type IS DISTINCT FROM 'reversal'
       OR v_existing_source_id IS DISTINCT FROM p_original_entry_id THEN
      RAISE EXCEPTION
        'IDEMPOTENCY_KEY_CONFLICT: key % belongs to a different journal operation',
        p_idempotency_key;
    END IF;
    UPDATE public.acct_journal_entries
       SET status               = 'reversed',
           reversed_by_entry_id = v_new_entry_id
     WHERE id     = p_original_entry_id
       AND status = 'posted';
    RETURN v_new_entry_id;
  END IF;

  -- ── Validate original entry exists and is eligible; capture its country_id ──
  SELECT status, country_id, branch_id
    INTO v_original_status, v_original_country, v_original_branch
    FROM public.acct_journal_entries
   WHERE id = p_original_entry_id
   FOR UPDATE;
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
    company_id          uuid,
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
      (
        SELECT original_line.company_id
        FROM public.acct_journal_lines original_line
        WHERE original_line.entry_id = p_original_entry_id
          AND original_line.line_no = coalesce(
            NULLIF(v_line->>'line_no', '')::integer,
            v_idx
          )
      ),
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

  -- ── INSERT reversal entry as 'draft' — preserve original country_id ────────
  INSERT INTO public.acct_journal_entries (
    period_id, posting_date, description_en, description_ar,
    source_type, source_id, status, branch_id, idempotency_key,
    country_id, created_by
  ) VALUES (
    v_period_id,
    v_posting_date,
    p_payload->>'description_en',
    p_payload->>'description_ar',
    'reversal',
    p_original_entry_id,
    'draft',
    v_original_branch,
    p_idempotency_key,
    v_original_country,
    v_user_id
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_new_entry_id;

  IF v_new_entry_id IS NULL THEN
    SELECT id INTO v_new_entry_id FROM public.acct_journal_entries WHERE idempotency_key = p_idempotency_key;
    UPDATE public.acct_journal_entries
       SET status = 'reversed', reversed_by_entry_id = v_new_entry_id
     WHERE id = p_original_entry_id AND status = 'posted';
    RETURN v_new_entry_id;
  END IF;

  -- ── INSERT lines (entry is 'draft' → INSERT guard allows this) ───────────
  --    Preserve each original line's company_id independently. A reversal can
  --    never infer one journal-wide company when legacy lines disagree.
  INSERT INTO public.acct_journal_lines (
    entry_id, line_no, account_id, fund_id, function, company_id,
    project_id, grant_id, cost_center_id, partner_id,
    original_amount, original_currency,
    functional_amount, functional_currency, fx_rate,
    debit_credit, description
  )
  SELECT v_new_entry_id, line_no, account_id, fund_id, function_text, company_id,
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
     AND status = 'posted';

  PERFORM pg_notify('acct_journal_posted', v_new_entry_id::text);

  RETURN v_new_entry_id;
END $$;

COMMENT ON FUNCTION public.acct_post_reversal(uuid, jsonb, text) IS
  'Posts a reversal journal entry and atomically marks the original as ''reversed''. '
  'Preserves the original journal country_id and the original line company_id on the '
  'reversal. Case-safe authorization via is_cycle_redirect_correction_authorizer. '
  'Idempotent on p_idempotency_key. The original entry must be ''posted''.';

GRANT EXECUTE ON FUNCTION public.acct_post_reversal(uuid, jsonb, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. The reprocessed-payment reversal RPC.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reverse_reprocessed_cycle_redirect_for_correction(
  p_action_id uuid,
  p_reason text,
  p_period_id uuid,
  p_idempotency_key text,
  p_confirm_reverse_later_payment boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_now timestamptz := clock_timestamp();
  v_action public.cycle_exception_actions%ROWTYPE;
  v_advance public.down_payment_requests%ROWTYPE;
  v_source public.mmp_site_entries%ROWTYPE;
  v_target public.mmp_site_entries%ROWTYPE;
  v_mmp public.mmp_files%ROWTYPE;
  v_journal public.acct_journal_entries%ROWTYPE;
  v_original_journal_id uuid;
  v_period public.acct_fiscal_periods%ROWTYPE;
  v_target_id uuid;
  v_reversal_payload jsonb;
  v_reversal_result uuid;
  v_reversal_idempotency_key text;
  v_reversal_journal_id uuid;
  v_gross_fee numeric;
  v_snapshot_prior numeric;
  v_settled_amount numeric;
  v_snapshot_remaining numeric;
  v_current_gross numeric;
  v_bridge_log_id uuid;
  v_bridge_log_count bigint;
  v_restore_ts timestamptz;
  -- reference sets
  v_original_refs uuid[];
  v_current_refs uuid[];
  v_later_refs uuid[];
  -- aggregates
  v_parent_id uuid;
  v_later_journal_count integer := 0;
  v_later_wallet_count integer := 0;
  v_later_gl_total numeric(18,2) := 0;
  v_later_wallet_total numeric(18,2) := 0;
  v_replacement_action_id uuid;
  v_later_reversal_ids jsonb := '[]'::jsonb;
  v_later_wallet_ids jsonb := '[]'::jsonb;
  v_original_paid_status text;
  v_original_total_paid numeric;
  v_expected_later_total numeric(18,2);
  -- loop vars
  v_rec RECORD;
  v_lp_reversal_id uuid;
  v_lp_payload jsonb;
  v_lp_amount numeric(18,2);
  v_lp_count bigint;
  v_wt RECORD;
  v_wallet public.wallets%ROWTYPE;
  v_effect numeric(18,2);
  v_effect_cents bigint;
BEGIN
  -- ── Authentication and authorization ───────────────────────────────────────
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Authentication is required.');
  END IF;

  IF NOT public.is_cycle_redirect_correction_authorizer(v_actor_id) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Only Super Admin, Finance, or Accountant users may reverse a reprocessed Redirect payment.'
    );
  END IF;

  -- High-risk acknowledgement is mandatory.
  IF p_confirm_reverse_later_payment IS DISTINCT FROM true THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'You must confirm the high-risk reversal of the later reprocessed payment.'
    );
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'A reversal reason of at least 10 characters is required.'
    );
  END IF;

  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) < 12 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'A valid idempotency key is required.');
  END IF;

  v_reversal_idempotency_key := 'cycle-redirect-reprocessed-payment-reversal:'
    || p_action_id::text || ':' || trim(p_idempotency_key);

  -- ── Lock the action ────────────────────────────────────────────────────────
  SELECT *
  INTO v_action
  FROM public.cycle_exception_actions
  WHERE id = p_action_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cycle exception action was not found.');
  END IF;

  -- Same-key retry returns the already-completed result; a different path or a
  -- different key fails closed.
  IF v_action.correction_status IS NOT NULL THEN
    IF v_action.correction_status = 'reprocessed_payment_reversed'
       AND v_action.correction_idempotency_key IS NOT DISTINCT FROM trim(p_idempotency_key) THEN
      RETURN jsonb_build_object(
        'ok', true,
        'already_corrected', true,
        'correction_mode', 'reprocessed_payment_reversed',
        'action_id', v_action.id,
        'advance_id', v_action.advance_id,
        'reversal_journal_entry_id', v_action.correction_reversal_journal_id,
        'replacement_action_id', v_action.correction_replacement_action_id,
        'corrected_at', v_action.corrected_at
      );
    END IF;

    RETURN jsonb_build_object(
      'ok', false,
      'error', 'This Redirect already has a different completed correction.'
    );
  END IF;

  IF v_action.decision <> 'redirect' OR NOT coalesce(v_action.executed, false) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Only an executed Redirect action can be reversed by this correction.'
    );
  END IF;

  -- Normalized allocation ledger rows are handled by newer workflows.
  IF EXISTS (
    SELECT 1
    FROM public.cycle_exception_action_allocations allocation
    WHERE allocation.action_id = v_action.id
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'This Redirect uses the normalized allocation ledger and is not a legacy reversal candidate.'
    );
  END IF;

  IF v_action.advance_id IS NULL OR v_action.mmp_site_entry_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The legacy action is missing its source advance or source site reference.'
    );
  END IF;

  -- Same advisory advance lock as the sibling correction RPCs.
  PERFORM pg_advisory_xact_lock(hashtext('cea_advance:' || v_action.advance_id::text));

  SELECT *
  INTO v_mmp
  FROM public.mmp_files
  WHERE id = v_action.mmp_file_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'The source cycle no longer exists.');
  END IF;

  IF lower(coalesce(v_mmp.cycle_status, '')) = 'closed'
     OR lower(coalesce(v_mmp.status, '')) = 'closed' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Reopen the cycle before reversing its reprocessed Redirect payment.'
    );
  END IF;

  SELECT *
  INTO v_source
  FROM public.mmp_site_entries
  WHERE id = v_action.mmp_site_entry_id
    AND mmp_file_id = v_action.mmp_file_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'The original source site no longer exists.');
  END IF;

  -- The original source site must still be NOT covered.
  IF NOT (
    coalesce(v_source.not_covered_flag, false)
    OR lower(coalesce(v_source.status, '')) = 'not_covered'
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The source site must still be marked not covered before this Redirect can be reversed.'
    );
  END IF;

  SELECT *
  INTO v_advance
  FROM public.down_payment_requests
  WHERE id = v_action.advance_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'The source advance no longer exists.');
  END IF;

  -- The advance must currently be PAID and STILL carry the original Redirect
  -- audit marker (the reprocessed-payment signature).
  IF coalesce(v_advance.metadata->>'exception_action_id', '') <> v_action.id::text THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The current advance no longer carries the original Redirect audit marker.'
    );
  END IF;

  IF v_advance.status NOT IN ('paid', 'fully_paid') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Only one fully paid reprocessed advance is supported; partial payment history requires manual Finance review.'
    );
  END IF;
  -- Installment payment_type/history is rejected: no immutable pre-Redirect
  -- installment snapshot exists to restore to.
  IF lower(coalesce(v_advance.payment_type, '')) = 'installments'
     OR jsonb_typeof(v_advance.paid_installments) = 'array'
        AND jsonb_array_length(coalesce(v_advance.paid_installments, '[]'::jsonb)) > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Installment advances have no immutable pre-Redirect snapshot and cannot be reversed automatically. Finance must review it manually.'
    );
  END IF;

  -- ── Prove a post-Redirect restore audit event (cancelled -> pending*) and
  --    capture its timestamp. Later payment history is defined relative to it. ─
  SELECT max((audit_event->>'timestamp')::timestamptz)
  INTO v_restore_ts
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(v_advance.metadata->'audit_log') = 'array'
        THEN v_advance.metadata->'audit_log'
      ELSE '[]'::jsonb
    END
  ) audit_event
  WHERE lower(coalesce(audit_event->>'action', '')) = 'restored'
    AND lower(coalesce(audit_event->>'previousValue', '')) = 'cancelled'
    AND regexp_replace(
      lower(coalesce(audit_event->>'newValue', '')),
      '[^a-z0-9]', '', 'g'
    ) IN ('pendingadmin', 'pending', 'approved')
    AND coalesce(audit_event->>'timestamp', '') ~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}'
    AND (audit_event->>'timestamp')::timestamptz
      > coalesce(v_action.executed_at, v_action.created_at);

  IF v_restore_ts IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The advance has no proven post-Redirect cancelled-to-pending restoration audit. Finance must review it manually.'
    );
  END IF;

  -- Original paid status recorded on the action (used to restore the advance).
  IF v_action.advance_status NOT IN ('paid', 'fully_paid') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Only an originally fully paid advance can be restored automatically.'
    );
  END IF;
  v_original_paid_status := v_action.advance_status;
  v_original_total_paid := round(coalesce(v_action.advance_amount, 0), 2);
  IF v_original_total_paid <= 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The original paid amount was not recorded safely on this action.'
    );
  END IF;
  IF abs(
       v_original_total_paid
       - round(coalesce(v_advance.approved_amount, v_advance.requested_amount, 0), 2)
     ) > 0.005 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The original full-payment amount no longer matches the approved/requested advance amount. Finance must review it manually.'
    );
  END IF;

  -- ── Lock the original Redirect journal ─────────────────────────────────────
  IF v_action.gl_journal_entry_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The original Redirect has no GL journal reference and cannot be reversed automatically.'
    );
  END IF;

  SELECT *
  INTO v_journal
  FROM public.acct_journal_entries
  WHERE id = v_action.gl_journal_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'The original Redirect journal no longer exists.');
  END IF;

  IF v_journal.status <> 'posted' OR v_journal.reversed_by_entry_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The original Redirect journal is not an unreversed posted journal.'
    );
  END IF;
  v_original_journal_id := v_journal.id;

  SELECT *
  INTO v_period
  FROM public.acct_fiscal_periods
  WHERE id = p_period_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_period.status NOT IN ('open', 'soft_closed')
     OR current_date NOT BETWEEN v_period.start_date AND v_period.end_date THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Select an open or soft-closed fiscal period that contains today.'
    );
  END IF;

  -- Same legacy source-site restriction as the sibling RPCs.
  IF v_action.redirect_fee_site_entry_id IS NOT NULL
     AND v_action.redirect_fee_site_entry_id <> v_action.mmp_site_entry_id THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'This Redirect settled a separate target site and is not eligible for the legacy reprocessed-payment reversal.'
    );
  END IF;
  v_target_id := v_action.mmp_site_entry_id;

  SELECT *
  INTO v_target
  FROM public.mmp_site_entries
  WHERE id = v_target_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'The fee site affected by the Redirect no longer exists.');
  END IF;

  -- Later fee-settlement activity on the affected site fails closed (identical
  -- to the historical reconciliation path).
  IF EXISTS (
    SELECT 1
    FROM public.acct_gl_bridge_log bridge
    WHERE bridge.source_table = 'mmp_site_entries'
      AND bridge.source_id = v_target_id
      AND bridge.event_type = 'enumerator_fee_paid'
      AND bridge.status = 'success'
      AND bridge.journal_entry_id IS DISTINCT FROM v_journal.id
      AND bridge.created_at > coalesce(v_action.executed_at, v_action.created_at)
  ) OR EXISTS (
    SELECT 1
    FROM public.cycle_exception_action_allocations allocation
    WHERE allocation.target_site_id = v_target_id
      AND allocation.created_at > coalesce(v_action.executed_at, v_action.created_at)
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Later fee-settlement activity exists for the affected site. Finance must review it manually before reversing this Redirect.'
    );
  END IF;

  -- ── Reuse the immutable Redirect fee snapshot (historical RPC contract) ────
  IF v_action.redirect_fee_gross_amount IS NULL
     OR v_action.redirect_fee_prior_settled_amount IS NULL
     OR v_action.redirect_fee_settled_amount IS NULL
     OR v_action.redirect_fee_remaining_amount IS NULL
     OR v_action.redirect_fee_status IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The immutable Redirect fee snapshot is incomplete. Finance must review it manually.'
    );
  END IF;

  v_gross_fee := round(v_action.redirect_fee_gross_amount, 2);
  v_snapshot_prior := round(v_action.redirect_fee_prior_settled_amount, 2);
  v_settled_amount := round(v_action.redirect_fee_settled_amount, 2);
  v_snapshot_remaining := round(v_action.redirect_fee_remaining_amount, 2);

  IF v_gross_fee <= 0
     OR v_snapshot_prior <> 0
     OR v_settled_amount <> v_gross_fee
     OR v_snapshot_remaining <> 0
     OR v_action.redirect_fee_status <> 'paid'
     OR abs(
       v_snapshot_prior + v_settled_amount + v_snapshot_remaining - v_gross_fee
     ) > 0.005 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The immutable Redirect fee snapshot is not an exact full legacy settlement. Finance must review it manually.'
    );
  END IF;

  v_current_gross := round(
    coalesce(v_target.enumerator_fee, 0) + coalesce(v_target.transport_fee, 0),
    2
  );

  SELECT count(*), (array_agg(id))[1]
  INTO v_bridge_log_count, v_bridge_log_id
  FROM public.acct_gl_bridge_log
  WHERE source_table = 'mmp_site_entries'
    AND source_id = v_target_id
    AND event_type = 'enumerator_fee_paid'
    AND status = 'success'
    AND journal_entry_id = v_journal.id;

  IF v_bridge_log_count <> 1
     OR abs(v_current_gross - v_gross_fee) > 0.005
     OR v_target.fee_paid_status IS DISTINCT FROM 'paid'
     OR v_target.fee_paid_at IS DISTINCT FROM v_action.executed_at
     OR v_target.fee_paid_by IS DISTINCT FROM v_action.executed_by
     OR abs(coalesce(v_target.fee_paid_amount, 0) - v_gross_fee) > 0.005
     OR abs(coalesce(v_target.fee_cash_paid_amount, 0) - v_gross_fee) > 0.005
     OR abs(coalesce(v_target.fee_advance_offset_amount, 0)) > 0.005
     OR abs(coalesce(v_target.fee_unallocated_amount, 0)) > 0.005
     OR nullif(trim(coalesce(v_target.fee_payment_method, '')), '') IS NOT NULL
     OR nullif(trim(coalesce(v_target.fee_payment_notes, '')), '') IS NOT NULL
     OR v_target.fee_receipt_url IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The legacy source fee no longer matches the exact Redirect snapshot. Finance must review it manually.'
    );
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- STEP A — Reverse the ORIGINAL Redirect journal (like the historical path)
  --          and preserve the original bridge log via reversal links.
  -- ═══════════════════════════════════════════════════════════════════════════
  -- Every mutation from this point runs inside one exception block. Any
  -- validation or reversal failure rolls back the original Redirect reversal,
  -- all later journal/wallet reversals, fee reset, audit rows, and advance/action
  -- changes before a structured error is returned.
  BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'line_no', line.line_no,
      'account_id', line.account_id,
      'fund_id', line.fund_id,
      'function', coalesce(line.function, 'none'),
      'project_id', line.project_id,
      'grant_id', line.grant_id,
      'cost_center_id', line.cost_center_id,
      'partner_id', line.partner_id,
      'debit_credit', CASE line.debit_credit WHEN 'DR' THEN 'CR' ELSE 'DR' END,
      'original_amount', line.original_amount,
      'original_currency', line.original_currency,
      'functional_amount', line.functional_amount,
      'functional_currency', line.functional_currency,
      'fx_rate', line.fx_rate,
      'description', 'Reprocessed-payment reversal (original Redirect): ' || trim(p_reason)
    )
    ORDER BY line.line_no
  )
  INTO v_reversal_payload
  FROM public.acct_journal_lines line
  WHERE line.entry_id = v_original_journal_id;

  IF v_reversal_payload IS NULL OR jsonb_array_length(v_reversal_payload) < 2 THEN
    RAISE EXCEPTION 'ORIGINAL_REDIRECT_LINES_INVALID: journal lines are missing or incomplete';
  END IF;

  v_reversal_payload := jsonb_build_object(
    'description_en', 'Reverse incorrect Cycle Close Redirect (reprocessed) — ' || trim(p_reason),
    'posting_date', current_date,
    'period_id', p_period_id,
    'lines', v_reversal_payload
  );

  BEGIN
    v_reversal_result := public.acct_post_reversal(
      v_journal.id,
      v_reversal_payload,
      v_reversal_idempotency_key
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'ORIGINAL_REDIRECT_REVERSAL_FAILED: %', SQLERRM;
  END;

  v_reversal_journal_id := v_reversal_result;
  IF v_reversal_journal_id IS NULL THEN
    RAISE EXCEPTION 'ORIGINAL_REDIRECT_REVERSAL_NULL: no journal ID was returned';
  END IF;

  INSERT INTO public.acct_gl_bridge_reversal_links (
    bridge_log_id,
    original_journal_entry_id,
    reversal_journal_entry_id,
    correction_action_id,
    reason,
    reversed_by,
    reversed_at
  ) VALUES (
    v_bridge_log_id,
    v_original_journal_id,
    v_reversal_journal_id,
    v_action.id,
    trim(p_reason),
    v_actor_id,
    v_now
  );

  -- Reset only the exact legacy target fee.
  UPDATE public.mmp_site_entries
  SET fee_paid_status = 'unpaid',
      fee_paid_amount = 0,
      fee_cash_paid_amount = 0,
      fee_advance_offset_amount = 0,
      fee_unallocated_amount = 0,
      fee_paid_at = NULL,
      fee_paid_by = NULL,
      fee_payment_method = NULL,
      fee_payment_notes = 'Reprocessed Redirect reversed on ' || v_now::date || ': ' || trim(p_reason)
  WHERE id = v_target_id;

  -- ── Create the parent audit record now that we have the original reversal ──
  INSERT INTO public.cycle_redirect_reprocessed_reversals (
    correction_action_id,
    advance_id,
    original_journal_entry_id,
    original_reversal_journal_entry_id,
    reason,
    idempotency_key,
    reversed_by,
    reversed_at
  ) VALUES (
    v_action.id,
    v_advance.id,
    v_original_journal_id,
    v_reversal_journal_id,
    trim(p_reason),
    trim(p_idempotency_key),
    v_actor_id,
    v_now
  )
  RETURNING id INTO v_parent_id;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- STEP B — Reverse ALL later advance-payment journals, atomically. Identify
  --          candidates ONLY from successful bridge logs for this advance, of
  --          type installment_payment / down_payment_fully_paid, created after
  --          the proven restore. Each must have exactly one success log and one
  --          unambiguous posted/unreversed matching journal.
  --          A nested subtransaction rolls back the whole set on any failure.
  -- ═══════════════════════════════════════════════════════════════════════════
  BEGIN
    FOR v_rec IN
      SELECT bridge.id AS bridge_log_id,
             bridge.journal_entry_id,
             bridge.event_type,
             bridge.amount AS bridge_amount,
             bridge.created_at
      FROM public.acct_gl_bridge_log bridge
      WHERE bridge.source_table = 'down_payment_requests'
        AND bridge.source_id = v_advance.id
        AND bridge.event_type IN ('installment_payment', 'down_payment_fully_paid')
        AND bridge.status = 'success'
        AND bridge.journal_entry_id IS NOT NULL
        AND bridge.created_at > v_restore_ts
      ORDER BY bridge.created_at
    LOOP
      -- Exactly one success log for this specific journal (no ambiguity).
      SELECT count(*)
      INTO v_lp_count
      FROM public.acct_gl_bridge_log dup
      WHERE dup.source_table = 'down_payment_requests'
        AND dup.source_id = v_advance.id
        AND dup.event_type = v_rec.event_type
        AND dup.status = 'success'
        AND dup.journal_entry_id = v_rec.journal_entry_id;

      IF v_lp_count <> 1 THEN
        RAISE EXCEPTION
          'AMBIGUOUS_LATER_PAYMENT_LOG: journal % has % success logs',
          v_rec.journal_entry_id, v_lp_count;
      END IF;

      -- Lock the later journal; require an unambiguous posted, unreversed entry
      -- whose source_type/source_id match this advance.
      SELECT *
      INTO v_journal
      FROM public.acct_journal_entries
      WHERE id = v_rec.journal_entry_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'LATER_JOURNAL_MISSING: journal % not found', v_rec.journal_entry_id;
      END IF;
      IF v_journal.status <> 'posted' OR v_journal.reversed_by_entry_id IS NOT NULL THEN
        RAISE EXCEPTION
          'LATER_JOURNAL_NOT_REVERSIBLE: journal % is % (reversed_by %)',
          v_journal.id, v_journal.status, coalesce(v_journal.reversed_by_entry_id::text, 'none');
      END IF;
      IF v_journal.source_type IS DISTINCT FROM 'down_payment_requests'
         OR v_journal.source_id IS DISTINCT FROM v_advance.id THEN
        RAISE EXCEPTION
          'LATER_JOURNAL_SOURCE_MISMATCH: journal % source %/%',
          v_journal.id, coalesce(v_journal.source_type, 'null'),
          coalesce(v_journal.source_id::text, 'null');
      END IF;

      -- Derive the amount from the bridge amount and/or the balanced journal
      -- debit lines; require them to agree when both are present.
      SELECT round(sum(CASE WHEN line.debit_credit = 'DR' THEN line.functional_amount ELSE 0 END), 2)
      INTO v_lp_amount
      FROM public.acct_journal_lines line
      WHERE line.entry_id = v_journal.id;

      IF v_lp_amount IS NULL OR v_lp_amount <= 0 THEN
        RAISE EXCEPTION 'LATER_JOURNAL_AMOUNT_INVALID: journal % has no positive debit total', v_journal.id;
      END IF;
      IF v_rec.bridge_amount IS NOT NULL
         AND abs(round(v_rec.bridge_amount, 2) - v_lp_amount) > 0.005 THEN
        RAISE EXCEPTION
          'LATER_JOURNAL_AMOUNT_MISMATCH: journal % bridge % vs lines %',
          v_journal.id, round(v_rec.bridge_amount, 2), v_lp_amount;
      END IF;

      SELECT jsonb_agg(
        jsonb_build_object(
          'line_no', line.line_no,
          'account_id', line.account_id,
          'fund_id', line.fund_id,
          'function', coalesce(line.function, 'none'),
          'project_id', line.project_id,
          'grant_id', line.grant_id,
          'cost_center_id', line.cost_center_id,
          'partner_id', line.partner_id,
          'debit_credit', CASE line.debit_credit WHEN 'DR' THEN 'CR' ELSE 'DR' END,
          'original_amount', line.original_amount,
          'original_currency', line.original_currency,
          'functional_amount', line.functional_amount,
          'functional_currency', line.functional_currency,
          'fx_rate', line.fx_rate,
          'description', 'Reprocessed-payment reversal (later payment): ' || trim(p_reason)
        )
        ORDER BY line.line_no
      )
      INTO v_lp_payload
      FROM public.acct_journal_lines line
      WHERE line.entry_id = v_journal.id;

      IF v_lp_payload IS NULL OR jsonb_array_length(v_lp_payload) < 2 THEN
        RAISE EXCEPTION 'LATER_JOURNAL_LINES_INVALID: journal % lines missing', v_journal.id;
      END IF;

      v_lp_payload := jsonb_build_object(
        'description_en', 'Reverse reprocessed advance payment — ' || trim(p_reason),
        'posting_date', current_date,
        'period_id', p_period_id,
        'lines', v_lp_payload
      );

      v_lp_reversal_id := public.acct_post_reversal(
        v_journal.id,
        v_lp_payload,
        v_reversal_idempotency_key || ':later-journal:' || v_journal.id::text
      );

      IF v_lp_reversal_id IS NULL THEN
        RAISE EXCEPTION 'LATER_JOURNAL_REVERSAL_NULL: journal %', v_journal.id;
      END IF;

      INSERT INTO public.cycle_redirect_reprocessed_journal_reversals (
        parent_id,
        bridge_log_id,
        original_journal_entry_id,
        reversal_journal_entry_id,
        event_type,
        amount
      ) VALUES (
        v_parent_id,
        v_rec.bridge_log_id,
        v_journal.id,
        v_lp_reversal_id,
        v_rec.event_type,
        v_lp_amount
      );

      v_later_journal_count := v_later_journal_count + 1;
      v_later_gl_total := v_later_gl_total + v_lp_amount;
      v_later_reversal_ids := v_later_reversal_ids || to_jsonb(v_lp_reversal_id);
    END LOOP;

    -- Any non-success row mixed into the later payment trail is ambiguous. Do
    -- not accept a successful retry while silently ignoring its failed sibling.
    IF EXISTS (
      SELECT 1
      FROM public.acct_gl_bridge_log bridge
      WHERE bridge.source_table = 'down_payment_requests'
        AND bridge.source_id = v_advance.id
        AND bridge.event_type IN ('installment_payment', 'down_payment_fully_paid')
        AND bridge.status <> 'success'
        AND bridge.created_at > v_restore_ts
    ) THEN
      RAISE EXCEPTION 'AMBIGUOUS_LATER_PAYMENT_HISTORY: a post-restore payment bridge attempt failed';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.acct_gl_bridge_log bridge
      WHERE bridge.source_table = 'down_payment_requests'
        AND bridge.source_id = v_advance.id
        AND bridge.event_type IN ('installment_payment', 'down_payment_fully_paid')
        AND bridge.status = 'success'
        AND bridge.journal_entry_id IS NULL
        AND bridge.created_at > v_restore_ts
    ) THEN
      RAISE EXCEPTION 'AMBIGUOUS_LATER_PAYMENT_HISTORY: a success bridge row has no journal';
    END IF;
    IF v_later_journal_count = 0 THEN
      RAISE EXCEPTION 'MISSING_LATER_PAYMENT_HISTORY: no post-restore payment journal could be proven';
    END IF;
    IF v_later_journal_count <> 1 THEN
      RAISE EXCEPTION
        'UNSUPPORTED_LATER_INSTALLMENT_HISTORY: expected one full-payment journal, found %',
        v_later_journal_count;
    END IF;

    -- The current paid total must prove the same one later increment recorded by
    -- the GL bridge. This prevents an unrelated post-restore journal from being
    -- treated as the reprocessed payment.
    v_expected_later_total := round(
      coalesce(v_advance.total_paid_amount, 0) - v_original_total_paid,
      2
    );
    IF v_expected_later_total <= 0
       OR abs(v_expected_later_total - v_later_gl_total) > 0.005 THEN
      RAISE EXCEPTION
        'LATER_PAYMENT_TOTAL_MISMATCH: current paid delta % does not equal later GL total %',
        v_expected_later_total, v_later_gl_total;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Nested subtransaction rollback: undo every later-journal reversal above.
    -- Surface the failure so the entire RPC transaction also rolls back.
    RAISE EXCEPTION 'LATER_PAYMENT_REVERSAL_FAILED: %', SQLERRM;
  END;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- STEP C — Reverse LATER wallet transactions.
  --          Normalize source_payment_references (may be nested JSON) into the
  --          set of ORIGINAL refs. Current wallet_transaction_ids must be valid
  --          UUIDs and contain every original ref. Later refs = current - original.
  -- ═══════════════════════════════════════════════════════════════════════════

  -- Both provenance snapshots must be explicit arrays. SQL NULL, JSON null,
  -- objects, and scalars are unknown provenance—not evidence of "no wallet".
  -- An explicit [] remains valid for proven batch-payment cases.
  IF jsonb_typeof(v_action.source_payment_references) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION
      'ORIGINAL_WALLET_REFERENCES_INVALID: source payment references must be an explicit JSON array';
  END IF;
  IF jsonb_typeof(v_advance.wallet_transaction_ids) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION
      'CURRENT_WALLET_REFERENCES_INVALID: wallet transaction references must be an explicit JSON array';
  END IF;

  -- Original refs: recursively flatten arbitrarily nested legacy arrays. Any
  -- non-string or malformed UUID leaf fails closed instead of being discarded.
  IF EXISTS (
    WITH RECURSIVE reference_nodes(value) AS (
      SELECT v_action.source_payment_references
      UNION ALL
      SELECT child.value
      FROM reference_nodes node
      CROSS JOIN LATERAL jsonb_array_elements(node.value) child(value)
      WHERE jsonb_typeof(node.value) = 'array'
    )
    SELECT 1
    FROM reference_nodes
    WHERE jsonb_typeof(value) <> 'array'
      AND (
        jsonb_typeof(value) <> 'string'
        OR (value #>> '{}') !~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      )
  ) THEN
    RAISE EXCEPTION 'ORIGINAL_WALLET_REFERENCES_INVALID: a legacy source reference is not a UUID';
  END IF;

  SELECT array_agg(DISTINCT ref_id)
  INTO v_original_refs
  FROM (
    WITH RECURSIVE reference_nodes(value) AS (
      SELECT v_action.source_payment_references
      UNION ALL
      SELECT child.value
      FROM reference_nodes node
      CROSS JOIN LATERAL jsonb_array_elements(node.value) child(value)
      WHERE jsonb_typeof(node.value) = 'array'
    )
    SELECT (value #>> '{}')::uuid AS ref_id
    FROM reference_nodes
    WHERE jsonb_typeof(value) = 'string'
  ) refs;
  v_original_refs := coalesce(v_original_refs, ARRAY[]::uuid[]);

  -- Current refs: must all be valid UUIDs.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(v_advance.wallet_transaction_ids) AS t(val)
    WHERE val !~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
  ) THEN
    RAISE EXCEPTION 'CURRENT_WALLET_REFERENCES_INVALID: the advance carries non-UUID references';
  END IF;

  SELECT array_agg(DISTINCT val::uuid)
  INTO v_current_refs
  FROM jsonb_array_elements_text(v_advance.wallet_transaction_ids) AS t(val);
  v_current_refs := coalesce(v_current_refs, ARRAY[]::uuid[]);

  -- Current must contain every original ref.
  IF EXISTS (
    SELECT 1 FROM unnest(v_original_refs) o WHERE o <> ALL (v_current_refs)
  ) THEN
    RAISE EXCEPTION 'ORIGINAL_WALLET_REFERENCE_MISSING: current advance no longer contains all original references';
  END IF;

  -- Later refs = current minus original.
  SELECT array_agg(c)
  INTO v_later_refs
  FROM unnest(v_current_refs) c
  WHERE c <> ALL (v_original_refs);
  v_later_refs := coalesce(v_later_refs, ARRAY[]::uuid[]);

  IF array_length(v_later_refs, 1) IS NOT NULL THEN
    FOREACH v_target_id IN ARRAY v_later_refs LOOP
      -- Lock and validate each later wallet transaction.
      SELECT *
      INTO v_wt
      FROM public.wallet_transactions
      WHERE id = v_target_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'LATER_WALLET_TRANSACTION_MISSING: reference % could not be resolved', v_target_id;
      END IF;

      -- Must be a down_payment / down_payment_advance transaction for the same
      -- request/user, created after restore, not failed/reversed.
      IF v_wt.type::text NOT IN ('down_payment', 'down_payment_advance')
         OR v_wt.user_id IS DISTINCT FROM v_advance.requested_by
         OR coalesce(
              v_wt.metadata->>'down_payment_request_id',
              v_wt.metadata->>'request_id',
              ''
            ) <> v_advance.id::text
         OR v_wt.created_at IS NULL
         OR v_wt.created_at <= v_restore_ts
         OR v_wt.status::text NOT IN ('pending', 'posted') THEN
        RAISE EXCEPTION
          'LATER_WALLET_TRANSACTION_INVALID: transaction % is not a valid post-restore payment for advance %',
          v_wt.id, v_advance.id;
      END IF;

      -- Provable balance effect: balance_after - balance_before is either 0
      -- (no direct effect, e.g. batch-payment trail) or exactly the positive
      -- transaction amount.
      v_effect := round(coalesce(v_wt.balance_after, 0) - coalesce(v_wt.balance_before, 0), 2);
      IF v_wt.amount IS NULL OR round(v_wt.amount, 2) <= 0 THEN
        RAISE EXCEPTION 'LATER_WALLET_AMOUNT_INVALID: transaction % has no positive amount', v_wt.id;
      END IF;
      IF v_wt.amount_cents IS NULL
         OR abs((v_wt.amount_cents::numeric / 100.0) - round(v_wt.amount, 2)) > 0.005 THEN
        RAISE EXCEPTION
          'LATER_WALLET_AMOUNT_MISMATCH: transaction % amount and amount_cents disagree',
          v_wt.id;
      END IF;
      IF NOT (abs(v_effect) < 0.005 OR abs(v_effect - round(v_wt.amount, 2)) < 0.005) THEN
        RAISE EXCEPTION
          'LATER_WALLET_EFFECT_UNPROVABLE: transaction % effect % does not match amount %',
          v_wt.id, v_effect, round(v_wt.amount, 2);
      END IF;
      IF v_wt.status::text = 'posted' AND abs(v_effect) < 0.005 THEN
        RAISE EXCEPTION
          'LATER_WALLET_EFFECT_AMBIGUOUS: posted transaction % has no recorded balance effect',
          v_wt.id;
      END IF;

      -- Mark the source row reversed; append immutable reversal metadata. Never
      -- delete. Marking status='reversed' does NOT re-trigger balance changes
      -- because update_wallet_balance only acts on transitions INTO 'posted'.
      UPDATE public.wallet_transactions
      SET status = 'reversed',
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'cycle_redirect_reprocessed_reversal', jsonb_build_object(
              'correction_action_id', v_action.id,
              'parent_reversal_id', v_parent_id,
              'reversed_by', v_actor_id,
              'reversed_at', v_now,
              'reason', trim(p_reason),
              'balance_effect', v_effect
            )
          )
      WHERE id = v_wt.id;

      -- If the effect was nonzero, undo it on the wallet: lock the wallet and
      -- subtract only the exact currency balance, adjusting the cent/earned
      -- compatibility totals per the transaction shape without going negative.
      IF abs(v_effect) >= 0.005 THEN
        IF v_wt.wallet_id IS NULL THEN
          RAISE EXCEPTION
            'LATER_WALLET_LINK_MISSING: transaction % has a balance effect but no wallet',
            v_wt.id;
        END IF;

        SELECT *
        INTO v_wallet
        FROM public.wallets
        WHERE id = v_wt.wallet_id
        FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION
            'LATER_WALLET_MISSING: wallet % for transaction % does not exist',
            v_wt.wallet_id, v_wt.id;
        END IF;

        v_effect_cents := round(v_effect * 100)::bigint;
        IF coalesce(
             (v_wallet.balances->>coalesce(v_wt.currency, 'SDG'))::numeric,
             0
           ) < v_effect
           OR coalesce(v_wallet.total_earned, 0) < v_effect
           OR (
             v_wt.status::text = 'posted'
             AND (
               v_wallet.balance_cents < v_effect_cents
               OR v_wallet.total_earned_cents < v_effect_cents
             )
           ) THEN
          RAISE EXCEPTION
            'LATER_WALLET_BALANCE_INSUFFICIENT: wallet % cannot prove an exact reversal of transaction %',
            v_wallet.id, v_wt.id;
        END IF;

        UPDATE public.wallets
        SET balance_cents = CASE
              WHEN v_wt.status::text = 'posted'
                THEN balance_cents - v_effect_cents
              ELSE balance_cents
            END,
            total_earned_cents = CASE
              WHEN v_wt.status::text = 'posted'
                THEN total_earned_cents - v_effect_cents
              ELSE total_earned_cents
            END,
            total_earned = coalesce(total_earned, 0) - v_effect,
            balances = jsonb_set(
              coalesce(balances, '{"SDG": 0}'::jsonb),
              ARRAY[coalesce(v_wt.currency, 'SDG')],
              to_jsonb(
                (balances->>coalesce(v_wt.currency, 'SDG'))::numeric - v_effect
              )
            ),
            updated_at = now()
        WHERE id = v_wallet.id;
      END IF;

      INSERT INTO public.cycle_redirect_reprocessed_wallet_reversals (
        parent_id,
        wallet_transaction_id,
        wallet_id,
        currency,
        amount,
        balance_effect
      ) VALUES (
        v_parent_id,
        v_wt.id,
        v_wt.wallet_id,
        coalesce(v_wt.currency, 'SDG'),
        round(v_wt.amount, 2),
        v_effect
      );

      v_later_wallet_count := v_later_wallet_count + 1;
      v_later_wallet_total := v_later_wallet_total + round(v_wt.amount, 2);
      v_later_wallet_ids := v_later_wallet_ids || to_jsonb(v_wt.id);
    END LOOP;
  END IF;

  -- ── Reconcile the later wallet total against the later GL total ────────────
  IF v_later_wallet_count > 0 THEN
    IF v_later_wallet_count <> 1 THEN
      RAISE EXCEPTION
        'UNSUPPORTED_LATER_WALLET_HISTORY: expected one full-payment wallet record, found %',
        v_later_wallet_count;
    END IF;
    IF abs(v_later_wallet_total - v_later_gl_total) > 0.005 THEN
      RAISE EXCEPTION
        'LATER_WALLET_GL_TOTAL_MISMATCH: wallet total % does not equal GL total %',
        v_later_wallet_total, v_later_gl_total;
    END IF;
  ELSE
    -- No later wallet rows: require a preserved payment_proof_url for the
    -- batch-payment trail before trusting the later GL journals.
    IF nullif(trim(coalesce(v_advance.payment_proof_url, '')), '') IS NULL
       OR v_advance.payment_proof_uploaded_at IS NULL
       OR v_advance.payment_proof_uploaded_at <= v_restore_ts THEN
      RAISE EXCEPTION
        'LATER_BATCH_PROOF_MISSING: no post-restore payment proof exists for the later batch payment';
    END IF;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- STEP D — Restore the advance to its original paid state and produce a new
  --          unexecuted replacement resolution so Final Close stays blocked.
  -- ═══════════════════════════════════════════════════════════════════════════

  UPDATE public.down_payment_requests
  SET status = v_original_paid_status,
      mmp_site_entry_id = v_action.mmp_site_entry_id,
      total_paid_amount = v_original_total_paid,
      remaining_amount = 0,
      wallet_transaction_ids = to_jsonb(v_original_refs),
      metadata = (
        coalesce(metadata, '{}'::jsonb)
        - ARRAY[
          'exception_action_id',
          'redirected_to_fees_by',
          'redirected_at',
          'justification',
          'gl_journal_entry_id'
        ]::text[]
      ) || jsonb_build_object(
        'cycle_redirect_reprocessed_reversal', jsonb_build_object(
          'original_action_id', v_action.id,
          'original_journal_entry_id', v_original_journal_id,
          'reversal_journal_entry_id', v_reversal_journal_id,
          'parent_reversal_id', v_parent_id,
          'later_journal_reversal_ids', v_later_reversal_ids,
          'later_wallet_transaction_ids', v_later_wallet_ids,
          'later_journal_reversal_count', v_later_journal_count,
          'later_wallet_reversal_count', v_later_wallet_count,
          'later_gl_total', v_later_gl_total,
          'later_wallet_total', v_later_wallet_total,
          'restored_status', v_original_paid_status,
          'restored_at', v_now,
          'corrected_by', v_actor_id,
          'reason', trim(p_reason)
        )
      )
  WHERE id = v_advance.id;

  SELECT coalesce(full_name, email, id::text)
  INTO v_actor_name
  FROM public.profiles
  WHERE id = v_actor_id;

  -- New unexecuted replacement action — mirrors the strict reopen path exactly
  -- so Final Close remains blocked until a new resolution executes.
  INSERT INTO public.cycle_exception_actions (
    mmp_file_id,
    mmp_site_entry_id,
    advance_id,
    enumerator_id,
    enumerator_name,
    site_name,
    advance_amount,
    advance_status,
    decision,
    decision_amount,
    justification,
    executed,
    created_by_name,
    action_payload
  ) VALUES (
    v_action.mmp_file_id,
    v_action.mmp_site_entry_id,
    v_action.advance_id,
    v_action.enumerator_id,
    v_action.enumerator_name,
    v_action.site_name,
    v_action.advance_amount,
    v_original_paid_status,
    'redirect',
    NULL,
    NULL,
    false,
    v_actor_name,
    jsonb_build_object(
      'reopened_from_action_id', v_action.id,
      'reopened_at', v_now,
      'reopened_by', v_actor_id,
      'reopened_reason', 'reprocessed_payment_reversed'
    )
  )
  RETURNING id INTO v_replacement_action_id;

  -- Mark the original correction status and save the full audit snapshot.
  UPDATE public.cycle_exception_actions
  SET correction_status = 'reprocessed_payment_reversed',
      corrected_at = v_now,
      corrected_by = v_actor_id,
      corrected_by_name = v_actor_name,
      correction_reason = trim(p_reason),
      correction_reversal_journal_id = v_reversal_journal_id,
      correction_replacement_action_id = v_replacement_action_id,
      correction_idempotency_key = trim(p_idempotency_key),
      action_payload = coalesce(action_payload, '{}'::jsonb) || jsonb_build_object(
        'correction', jsonb_build_object(
          'status', 'reprocessed_payment_reversed',
          'mode', 'reprocessed_payment_reversed',
          'corrected_at', v_now,
          'corrected_by', v_actor_id,
          'reason', trim(p_reason),
          'original_journal_entry_id', v_original_journal_id,
          'reversal_journal_entry_id', v_reversal_journal_id,
          'replacement_action_id', v_replacement_action_id,
          'parent_reversal_id', v_parent_id,
          'later_journal_reversal_ids', v_later_reversal_ids,
          'later_wallet_transaction_ids', v_later_wallet_ids,
          'later_journal_reversal_count', v_later_journal_count,
          'later_wallet_reversal_count', v_later_wallet_count,
          'later_gl_total', v_later_gl_total,
          'later_wallet_total', v_later_wallet_total,
          'restored_advance_status', v_original_paid_status
        )
      )
  WHERE id = v_action.id;

  -- Finalize the parent audit record aggregates + replacement link.
  UPDATE public.cycle_redirect_reprocessed_reversals
  SET replacement_action_id = v_replacement_action_id,
      restore_event_at = v_restore_ts,
      original_total_paid = v_original_total_paid,
      reprocessed_total_paid = v_advance.total_paid_amount,
      reprocessed_site_entry_id = v_advance.mmp_site_entry_id,
      original_wallet_transaction_ids = to_jsonb(v_original_refs),
      reprocessed_wallet_transaction_ids = to_jsonb(v_current_refs),
      payment_proof_url = v_advance.payment_proof_url,
      later_journal_reversal_count = v_later_journal_count,
      later_wallet_reversal_count = v_later_wallet_count,
      later_gl_total = v_later_gl_total,
      later_wallet_total = v_later_wallet_total
  WHERE id = v_parent_id;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The reprocessed-payment reversal was not applied: ' || SQLERRM
    );
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'correction_mode', 'reprocessed_payment_reversed',
    'action_id', v_action.id,
    'advance_id', v_action.advance_id,
    'source_site_id', v_action.mmp_site_entry_id,
    'reversal_journal_entry_id', v_reversal_journal_id,
    'replacement_action_id', v_replacement_action_id,
    'restored_advance_status', v_original_paid_status,
    'later_journal_reversal_count', v_later_journal_count,
    'later_wallet_reversal_count', v_later_wallet_count,
    'later_gl_total', v_later_gl_total,
    'later_wallet_total', v_later_wallet_total,
    'corrected_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_reprocessed_cycle_redirect_for_correction(uuid, text, uuid, text, boolean)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_reprocessed_cycle_redirect_for_correction(uuid, text, uuid, text, boolean)
  TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. Live enumerator-fee offset trigger/function: exclude the corrected
--    Redirect exactly like reopened_for_correction and historically_reconciled.
--    The only change from 20260819m is adding 'reprocessed_payment_reversed' to
--    each correction_status exclusion list.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.acct_trig_mmp_site_entries_fee_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gross_fee numeric(18,2);
  v_cash_amount numeric(18,2);
  v_advance_offset numeric(18,2);
  v_authoritative_offset numeric(18,2);
  v_expected_cash numeric(18,2);
  v_cash_account text;
  v_country_id uuid;
  v_entry_id uuid;
  v_lines jsonb;
  v_has_redirect boolean;
BEGIN
  IF NEW.fee_paid_status IS DISTINCT FROM 'paid' OR OLD.fee_paid_status = 'paid' THEN
    RETURN NEW;
  END IF;
  IF public.has_active_enumerator_fee_bridge(NEW.id) THEN
    RETURN NEW;
  END IF;

  v_gross_fee := round(COALESCE(NEW.enumerator_fee, 0) + COALESCE(NEW.transport_fee, 0), 2);
  v_advance_offset := COALESCE(NEW.fee_advance_offset_amount, 0);
  v_cash_account := CASE
    WHEN lower(replace(COALESCE(NEW.fee_payment_method, ''), ' ', '_')) = 'bank_transfer'
      THEN '1020'
    ELSE '1010'
  END;
  SELECT country_id INTO v_country_id FROM public.mmp_files WHERE id = NEW.mmp_file_id;

  SELECT EXISTS (
    SELECT 1
    FROM public.cycle_exception_actions action
    WHERE action.redirect_fee_site_entry_id = NEW.id
      AND action.decision = 'redirect'
      AND action.executed = true
      AND coalesce(action.correction_status, '') NOT IN (
        'reopened_for_correction',
        'historically_reconciled',
        'reprocessed_payment_reversed'
      )
    UNION ALL
    SELECT 1
    FROM public.cycle_exception_action_allocations allocation
    JOIN public.cycle_exception_actions action ON action.id = allocation.action_id
    WHERE allocation.target_site_id = NEW.id
      AND action.decision = 'redirect'
      AND action.executed = true
      AND coalesce(action.correction_status, '') NOT IN (
        'reopened_for_correction',
        'historically_reconciled',
        'reprocessed_payment_reversed'
      )
  ) INTO v_has_redirect;

  IF v_has_redirect THEN
    SELECT COALESCE(sum(allocation.amount), 0)
    INTO v_authoritative_offset
    FROM public.cycle_exception_action_allocations allocation
    JOIN public.cycle_exception_actions action ON action.id = allocation.action_id
    WHERE allocation.target_site_id = NEW.id
      AND action.decision = 'redirect'
      AND action.executed = true
      AND coalesce(action.correction_status, '') NOT IN (
        'reopened_for_correction',
        'historically_reconciled',
        'reprocessed_payment_reversed'
      );

    SELECT v_authoritative_offset + COALESCE(sum(
      COALESCE(action.redirect_fee_settled_amount, action.decision_amount, action.advance_amount)
    ), 0)
    INTO v_authoritative_offset
    FROM public.cycle_exception_actions action
    WHERE action.redirect_fee_site_entry_id = NEW.id
      AND action.decision = 'redirect'
      AND action.executed = true
      AND coalesce(action.correction_status, '') NOT IN (
        'reopened_for_correction',
        'historically_reconciled',
        'reprocessed_payment_reversed'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.cycle_exception_action_allocations allocation
        WHERE allocation.action_id = action.id
      );

    v_authoritative_offset := round(COALESCE(v_authoritative_offset, 0), 2);
    v_expected_cash := round(GREATEST(v_gross_fee - v_authoritative_offset, 0), 2);
    v_cash_amount := COALESCE(NEW.fee_cash_paid_amount, v_expected_cash);

    IF v_authoritative_offset < 0 OR v_authoritative_offset > v_gross_fee
       OR COALESCE(NEW.fee_paid_amount, 0) <> v_gross_fee
       OR COALESCE(NEW.fee_advance_offset_amount, 0) <> v_authoritative_offset
       OR v_cash_amount <> round(v_cash_amount, 2)
       OR v_cash_amount <> v_expected_cash THEN
      RAISE EXCEPTION
        'Redirect fee completion components must equal the gross fee (gross %, authoritative advance offset %, required cash %)',
        v_gross_fee, v_authoritative_offset, v_expected_cash;
    END IF;
    IF v_cash_amount <= 0 THEN RETURN NEW; END IF;
    v_lines := jsonb_build_array(
      jsonb_build_object(
        'account_code', '5200', 'debit_credit', 'DR', 'amount', v_cash_amount,
        'currency', 'SDG',
        'description', 'Cash completion after advance offset — '
          || COALESCE(NEW.site_name, 'Site') || '; cash SDG ' || v_cash_amount
          || '; prior advance offset SDG ' || v_advance_offset,
        'function', 'program'
      ),
      jsonb_build_object(
        'account_code', v_cash_account, 'debit_credit', 'CR', 'amount', v_cash_amount,
        'currency', 'SDG',
        'description', 'Cash completion after advance offset — '
          || COALESCE(NEW.site_name, 'Site') || '; cash SDG ' || v_cash_amount,
        'function', 'none'
      )
    );
  ELSE
    v_cash_amount := COALESCE(NEW.fee_cash_paid_amount, v_gross_fee);
    v_lines := jsonb_build_array(
      jsonb_build_object(
        'account_code', '5200', 'debit_credit', 'DR', 'amount', v_gross_fee,
        'currency', 'SDG',
        'description', 'Enumerator Fee — ' || COALESCE(NEW.site_name, 'Site'),
        'function', 'program'
      ),
      jsonb_build_object(
        'account_code', v_cash_account, 'debit_credit', 'CR', 'amount', v_cash_amount,
        'currency', 'SDG',
        'description', 'Enumerator fee cash component — ' || COALESCE(NEW.site_name, 'Site'),
        'function', 'none'
      ),
      jsonb_build_object(
        'account_code', '1510', 'debit_credit', 'CR', 'amount', v_advance_offset,
        'currency', 'SDG',
        'description', 'Transport advance offset — ' || COALESCE(NEW.site_name, 'Site'),
        'function', 'program'
      )
    );
  END IF;

  BEGIN
    v_entry_id := public.acct_bridge_post_journal(
      'mmp_site_entries', NEW.id, 'enumerator_fee_paid',
      COALESCE(NEW.fee_paid_at::date, current_date),
      'Enumerator Fee Paid: ' || COALESCE(NEW.site_name, NEW.id::text),
      'أجر معدد مدفوع: ' || COALESCE(NEW.site_name, NEW.id::text),
      v_lines, NEW.fee_paid_by, v_country_id
    );
    INSERT INTO public.acct_gl_bridge_log
      (source_table, source_id, event_type, status, journal_entry_id)
    VALUES ('mmp_site_entries', NEW.id, 'enumerator_fee_paid', 'success', v_entry_id);
  EXCEPTION WHEN OTHERS THEN
    IF v_has_redirect THEN
      RAISE;
    END IF;
    INSERT INTO public.acct_gl_bridge_log
      (source_table, source_id, event_type, status, error_message)
    VALUES ('mmp_site_entries', NEW.id, 'enumerator_fee_paid', 'error', SQLERRM);
  END;
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Extend the correction-history view to include the third status while
--    preserving the exact existing column names and order.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.cycle_redirect_correction_history
WITH (security_invoker = true)
AS
SELECT
  action.id AS action_id,
  action.mmp_file_id,
  action.mmp_site_entry_id AS source_site_id,
  action.advance_id,
  action.site_name AS source_site_name,
  action.enumerator_id,
  action.enumerator_name,
  action.advance_amount,
  action.advance_status,
  action.executed_at,
  action.executed_by,
  action.gl_journal_entry_id AS original_journal_entry_id,
  action.correction_status,
  action.corrected_at,
  action.corrected_by,
  action.corrected_by_name,
  action.correction_reason,
  action.correction_reversal_journal_id AS reversal_journal_entry_id,
  action.correction_replacement_action_id AS replacement_action_id
FROM public.cycle_exception_actions action
WHERE action.decision = 'redirect'
  AND action.correction_status IN (
    'reopened_for_correction',
    'historically_reconciled',
    'reprocessed_payment_reversed'
  );

GRANT SELECT ON public.cycle_redirect_correction_history TO authenticated;

COMMIT;
