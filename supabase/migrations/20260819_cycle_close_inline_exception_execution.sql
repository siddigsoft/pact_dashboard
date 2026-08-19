-- =============================================================================
-- Task #548 — Cycle Close: Inline Exception Execution
-- Date: 2026-08-19
--
-- 1. Defensively add new columns to cycle_exception_actions
-- 2. Replace permissive RLS policy with role-aware policies
--    (helpers renamed to avoid colliding with existing public.is_super_admin)
-- 3. Revoke direct execute on post_exception_recovery_to_gl
-- 4. Create SECURITY DEFINER RPC execute_cycle_close_exception
-- 5. BEFORE UPDATE trigger on mmp_files as hard close gate
--
-- Redirect inserts an idempotency row into acct_gl_bridge_log before marking
-- the fee paid. This migration also corrects the existing fee trigger's stale
-- uuid=text sentinel lookup so that guard can execute safely.
--
-- Safe to re-run: all DDL uses IF NOT EXISTS / CREATE OR REPLACE /
-- DROP IF EXISTS / DROP POLICY IF EXISTS.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Defensive column additions to cycle_exception_actions
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.cycle_exception_actions
  ADD COLUMN IF NOT EXISTS receipt_reference   text,
  ADD COLUMN IF NOT EXISTS return_method       text,
  ADD COLUMN IF NOT EXISTS execution_error     text,
  ADD COLUMN IF NOT EXISTS action_payload      jsonb;

-- The central dispatcher hard-gates each source table. Without this flag every
-- Return / Write-Off / Redirect attempt raises BRIDGE_SKIP.
INSERT INTO public.feature_flags (key, description, is_enabled)
VALUES (
  'acct.bridge.cycle_exception_actions',
  'Post Cycle Close exception recovery and reclassification journals',
  true
)
ON CONFLICT (key) DO UPDATE SET is_enabled = true;

-- The existing fee-paid bridge predates acct_gl_bridge_log.source_id becoming
-- UUID and compares it to NEW.id::text. Redirect invokes this trigger after
-- inserting its sentinel, so correct the lookup to UUID before creating the RPC.
CREATE OR REPLACE FUNCTION public.acct_trig_mmp_site_entries_fee_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_fee    numeric(18,2);
  v_advance_amt  numeric(18,2) := 0;
  v_net_cash     numeric(18,2);
  v_cash_account text;
  v_entry_id     uuid;
  v_lines        jsonb;
  v_country_id   uuid;
BEGIN
  IF NEW.fee_paid_status IS DISTINCT FROM 'paid' THEN RETURN NEW; END IF;
  IF OLD.fee_paid_status = 'paid' THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1
    FROM public.acct_gl_bridge_log
    WHERE source_table = 'mmp_site_entries'
      AND source_id = NEW.id
      AND event_type = 'enumerator_fee_paid'
      AND status = 'success'
  ) THEN
    RETURN NEW;
  END IF;

  v_total_fee := COALESCE(NEW.enumerator_fee, 0) + COALESCE(NEW.transport_fee, 0);
  IF v_total_fee <= 0 THEN RETURN NEW; END IF;

  SELECT COALESCE(total_paid_amount, requested_amount, 0)
  INTO v_advance_amt
  FROM public.down_payment_requests
  WHERE mmp_site_entry_id = NEW.id
    AND status IN ('paid', 'fully_paid', 'partially_paid')
  ORDER BY total_paid_amount DESC NULLS LAST
  LIMIT 1;

  v_advance_amt := COALESCE(v_advance_amt, 0);
  v_net_cash := GREATEST(v_total_fee - v_advance_amt, 0);
  v_cash_account := CASE
    WHEN NEW.fee_payment_method = 'bank_transfer' THEN '1020'
    ELSE '1010'
  END;

  SELECT m.country_id
  INTO v_country_id
  FROM public.mmp_files m
  WHERE m.id = NEW.mmp_file_id
  LIMIT 1;

  IF v_advance_amt > 0 THEN
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code','5200','debit_credit','DR','amount',v_total_fee,'currency','SDG','description','Enumerator Fee — ' || COALESCE(NEW.site_name,'Site'),'function','program'),
      jsonb_build_object('account_code',v_cash_account,'debit_credit','CR','amount',v_net_cash,'currency','SDG','description','Cash paid (net of advance) — ' || COALESCE(NEW.site_name,'Site'),'function','none'),
      jsonb_build_object('account_code','1510','debit_credit','DR','amount',v_advance_amt,'currency','SDG','description','Advance offset — ' || COALESCE(NEW.site_name,'Site'),'function','program'),
      jsonb_build_object('account_code','5200','debit_credit','CR','amount',v_advance_amt,'currency','SDG','description','Advance offsets fee expense — ' || COALESCE(NEW.site_name,'Site'),'function','program')
    );
  ELSE
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code','5200','debit_credit','DR','amount',v_total_fee,'currency','SDG','description','Enumerator Fee — ' || COALESCE(NEW.site_name,'Site'),'function','program'),
      jsonb_build_object('account_code',v_cash_account,'debit_credit','CR','amount',v_total_fee,'currency','SDG','description','Cash payment — ' || COALESCE(NEW.site_name,'Site'),'function','none')
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
    VALUES
      ('mmp_site_entries', NEW.id, 'enumerator_fee_paid', 'success', v_entry_id);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.acct_gl_bridge_log
      (source_table, source_id, event_type, status, error_message)
    VALUES
      ('mmp_site_entries', NEW.id, 'enumerator_fee_paid', 'error', SQLERRM);
  END;

  RETURN NEW;
END;
$$;

-- Apply the same UUID correction to the existing fee reconciliation RPC.
CREATE OR REPLACE FUNCTION public.post_enumerator_fees_to_gl()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_posted  int := 0;
  v_skipped int := 0;
  v_errors  int := 0;
  v_rec     RECORD;
  v_advance numeric(18,2);
  v_net     numeric(18,2);
  v_fee     numeric(18,2);
  v_acc     text;
  v_lines   jsonb;
  v_eid     uuid;
  v_cid     uuid;
BEGIN
  FOR v_rec IN
    SELECT s.*, m.country_id
    FROM public.mmp_site_entries s
    JOIN public.mmp_files m ON m.id = s.mmp_file_id
    WHERE s.fee_paid_status = 'paid'
      AND NOT EXISTS (
        SELECT 1
        FROM public.acct_gl_bridge_log l
        WHERE l.source_table = 'mmp_site_entries'
          AND l.source_id = s.id
          AND l.event_type = 'enumerator_fee_paid'
          AND l.status = 'success'
      )
    ORDER BY s.fee_paid_at NULLS LAST
  LOOP
    BEGIN
      v_fee := COALESCE(v_rec.enumerator_fee, 0) + COALESCE(v_rec.transport_fee, 0);
      IF v_fee <= 0 THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      SELECT COALESCE(total_paid_amount, requested_amount, 0)
      INTO v_advance
      FROM public.down_payment_requests
      WHERE mmp_site_entry_id = v_rec.id
        AND status IN ('paid','fully_paid','partially_paid')
      ORDER BY total_paid_amount DESC NULLS LAST
      LIMIT 1;

      v_advance := COALESCE(v_advance, 0);
      v_net := GREATEST(v_fee - v_advance, 0);
      v_acc := CASE
        WHEN v_rec.fee_payment_method = 'bank_transfer' THEN '1020'
        ELSE '1010'
      END;
      v_cid := v_rec.country_id;

      IF v_advance > 0 THEN
        v_lines := jsonb_build_array(
          jsonb_build_object('account_code','5200','debit_credit','DR','amount',v_fee,'currency','SDG','description','Enumerator Fee — '||COALESCE(v_rec.site_name,'Site'),'function','program'),
          jsonb_build_object('account_code',v_acc,'debit_credit','CR','amount',v_net,'currency','SDG','description','Cash paid (net) — '||COALESCE(v_rec.site_name,'Site'),'function','none'),
          jsonb_build_object('account_code','1510','debit_credit','DR','amount',v_advance,'currency','SDG','description','Advance offset — '||COALESCE(v_rec.site_name,'Site'),'function','program'),
          jsonb_build_object('account_code','5200','debit_credit','CR','amount',v_advance,'currency','SDG','description','Advance offsets fee — '||COALESCE(v_rec.site_name,'Site'),'function','program')
        );
      ELSE
        v_lines := jsonb_build_array(
          jsonb_build_object('account_code','5200','debit_credit','DR','amount',v_fee,'currency','SDG','description','Enumerator Fee — '||COALESCE(v_rec.site_name,'Site'),'function','program'),
          jsonb_build_object('account_code',v_acc,'debit_credit','CR','amount',v_fee,'currency','SDG','description','Cash payment — '||COALESCE(v_rec.site_name,'Site'),'function','none')
        );
      END IF;

      v_eid := public.acct_bridge_post_journal(
        'mmp_site_entries', v_rec.id, 'enumerator_fee_paid',
        COALESCE(v_rec.fee_paid_at::date, current_date),
        'Enumerator Fee Paid: ' || COALESCE(v_rec.site_name, v_rec.id::text),
        'أجر معدد مدفوع: ' || COALESCE(v_rec.site_name, v_rec.id::text),
        v_lines, v_rec.fee_paid_by, v_cid
      );

      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, journal_entry_id)
      VALUES
        ('mmp_site_entries', v_rec.id, 'enumerator_fee_paid', 'success', v_eid);
      v_posted := v_posted + 1;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message)
      VALUES
        ('mmp_site_entries', v_rec.id, 'enumerator_fee_paid', 'error', SQLERRM);
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'posted', v_posted,
    'skipped', v_skipped,
    'errors', v_errors
  );
END;
$$;

-- Additional indexes useful for mmp/advance lookup
CREATE INDEX IF NOT EXISTS idx_cea_advance
  ON public.cycle_exception_actions (advance_id)
  WHERE advance_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cea_mmp_advance
  ON public.cycle_exception_actions (mmp_file_id, advance_id)
  WHERE advance_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cea_advance_executed
  ON public.cycle_exception_actions (advance_id, executed)
  WHERE advance_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Role-aware helper functions
--    NOTE: public.is_super_admin(uuid) already exists system-wide (checks
--    the super_admins table). We use a separate function scoped to this
--    feature so we do NOT collide with or revoke the generic helper.
-- ─────────────────────────────────────────────────────────────────────────────

-- is_cycle_exception_executor: checks profiles.role, profiles.additional_roles,
-- and user_roles. Includes all authorized executor role variants (normalised).
CREATE OR REPLACE FUNCTION public.is_cycle_exception_executor(p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_uid
      AND (
        -- Primary role check (normalised: strip spaces/underscores/hyphens)
        lower(regexp_replace(coalesce(p.role, ''), '[\s_\-]+', '', 'g'))
          IN (
            'superadmin', 'admin',
            'superadministrator',
            'finance', 'financialadmin', 'financeadmin', 'accountant',
            'fom', 'fieldoperationmanager', 'fieldoperationmanagerfom',
            'fieldoperationsmanager'
          )
        OR
        -- additional_roles JSON array check
        EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(p.additional_roles) = 'array'
                 THEN p.additional_roles
                 ELSE '[]'::jsonb END
          ) AS r
          WHERE lower(regexp_replace(coalesce(r->>'role', ''), '[\s_\-]+', '', 'g'))
                IN (
                  'superadmin', 'admin',
                  'superadministrator',
                  'finance', 'financialadmin', 'financeadmin', 'accountant',
                  'fom', 'fieldoperationmanager', 'fieldoperationmanagerfom',
                  'fieldoperationsmanager'
                )
        )
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = p_uid
      AND lower(regexp_replace(coalesce(ur.role::text, ''), '[\s_\-]+', '', 'g'))
          IN (
            'superadmin', 'admin',
            'superadministrator',
            'finance', 'financialadmin', 'financeadmin', 'accountant',
            'fom', 'fieldoperationmanager', 'fieldoperationmanagerfom',
            'fieldoperationsmanager'
          )
  )
$$;

-- is_cycle_exception_super_admin: checks profiles.role and user_roles only
-- for super admin variants. Does NOT touch the generic public.is_super_admin.
CREATE OR REPLACE FUNCTION public.is_cycle_exception_super_admin(p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_uid
      AND lower(regexp_replace(coalesce(p.role, ''), '[\s_\-]+', '', 'g'))
          IN ('superadmin', 'superadministrator')
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = p_uid
      AND lower(regexp_replace(coalesce(ur.role::text, ''), '[\s_\-]+', '', 'g'))
          IN ('superadmin', 'superadministrator')
  )
$$;

-- is_cycle_exception_manager: roles authorized to approve operational changes
-- and write-offs. Finance may execute Return and Redirect, but cannot approve
-- cancel/reduce/reassign/hold/roll/writeoff decisions.
CREATE OR REPLACE FUNCTION public.is_cycle_exception_manager(p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_uid
      AND (
        lower(regexp_replace(coalesce(p.role, ''), '[\s_\-]+', '', 'g'))
          IN (
            'superadmin', 'admin',
            'superadministrator',
            'fom', 'fieldoperationmanager', 'fieldoperationmanagerfom',
            'fieldoperationsmanager'
          )
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(p.additional_roles) = 'array'
                 THEN p.additional_roles
                 ELSE '[]'::jsonb END
          ) AS r
          WHERE lower(regexp_replace(coalesce(r->>'role', ''), '[\s_\-]+', '', 'g'))
            IN (
              'superadmin', 'admin',
              'superadministrator',
              'fom', 'fieldoperationmanager', 'fieldoperationmanagerfom',
              'fieldoperationsmanager'
            )
        )
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = p_uid
      AND lower(regexp_replace(coalesce(ur.role::text, ''), '[\s_\-]+', '', 'g'))
        IN (
          'superadmin', 'admin',
          'superadministrator',
          'fom', 'fieldoperationmanager', 'fieldoperationmanagerfom',
          'fieldoperationsmanager'
        )
  )
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Replace permissive RLS policy with role-aware policies
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop the dangerously permissive policy
DROP POLICY IF EXISTS "Finance and Admin can manage cycle exception actions"
  ON public.cycle_exception_actions;

-- Direct table writes are intentionally not allowed. All mutation must pass
-- through execute_cycle_close_exception so clients cannot forge executed=true.
DROP POLICY IF EXISTS "cea_super_admin_all" ON public.cycle_exception_actions;
DROP POLICY IF EXISTS "cea_super_admin_select" ON public.cycle_exception_actions;
CREATE POLICY "cea_super_admin_select"
  ON public.cycle_exception_actions
  FOR SELECT
  USING (public.is_cycle_exception_super_admin(auth.uid()));

-- Authorized executors may read the audit trail. The SECURITY DEFINER RPC owns
-- all inserts/updates so validation and audit fields cannot be bypassed.
DROP POLICY IF EXISTS "cea_executor_all" ON public.cycle_exception_actions;
DROP POLICY IF EXISTS "cea_executor_select" ON public.cycle_exception_actions;
CREATE POLICY "cea_executor_select"
  ON public.cycle_exception_actions
  FOR SELECT
  USING (public.is_cycle_exception_executor(auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Revoke direct execute on post_exception_recovery_to_gl from
--    authenticated and PUBLIC. The SECURITY DEFINER wrapper RPC below
--    is the only authorised entry point.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.post_exception_recovery_to_gl(uuid)
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.post_exception_recovery_to_gl(uuid)
  FROM PUBLIC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. SECURITY DEFINER RPC: execute_cycle_close_exception
--
-- Decision classification
-- ────────────────────────
-- approved-only (advance.status = 'approved'):
--   cancel, reduce, reassign, hold
--   justification required for: cancel, hold
--
-- paid-only (advance.status IN paid/fully_paid/partially_paid):
--   roll     — paid advance, no GL, no amount required, justification required
--   return   — paid, full amount = paid amount, GL, required: justification +
--              recovery_date + return_method (cash|bank_transfer) +
--              receipt_reference
--   writeoff — paid, full amount, GL, required: justification
--   redirect — paid, full amount, GL, required: justification
--
-- Source "not covered" condition: not_covered_flag=true OR status='not_covered'
-- Target "covered" condition:    not_covered_flag=false AND status!='not_covered'
--
-- Enumerator identity: mmp_site_entries.accepted_by (text, may be UUID-shaped)
--
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.execute_cycle_close_exception(
  p_mmp_id             uuid,
  p_site_id            uuid,            -- mmp_site_entries.id (not_covered site)
  p_advance_id         uuid,            -- down_payment_requests.id
  p_decision           text,            -- see classification above
  p_amount             numeric          DEFAULT NULL,
  p_justification      text             DEFAULT NULL,
  p_target_mmp_id      uuid             DEFAULT NULL,  -- roll: destination MMP
  p_target_site_id     uuid             DEFAULT NULL,  -- reassign/roll: destination site
  p_receipt_reference  text             DEFAULT NULL,
  p_return_method      text             DEFAULT NULL,  -- 'cash' | 'bank_transfer'
  p_recovery_date      date             DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Actor (always derived from auth.uid — never accepted as param)
  v_actor_id         uuid        := auth.uid();
  v_actor_name       text;

  -- Source records
  v_mmp              RECORD;
  v_site             RECORD;
  v_advance          RECORD;
  v_country_id       uuid;

  -- Decision classification
  v_is_paid_decision boolean;   -- roll/return/writeoff/redirect
  v_is_gl_decision   boolean;   -- return/writeoff/redirect
  v_is_approved_only boolean;   -- cancel/reduce/reassign/hold
  v_is_manager       boolean;

  -- Paid amount reference
  v_paid_amount      numeric;

  -- Enumerator identity from accepted_by (text that may be UUID-shaped)
  v_enumerator_id    uuid;
  v_enumerator_name  text;

  -- Validation temporaries
  v_target_site      RECORD;
  v_target_mmp       RECORD;

  -- Existing action state
  v_existing_action  RECORD;
  v_action_id        uuid;
  v_has_existing_action boolean := false;

  -- GL
  v_journal_id       uuid;
  v_gl_event         text;
  v_gl_lines         jsonb;
  v_gl_desc_en       text;
  v_gl_desc_ar       text;
  v_cash_acct        text;
  v_advance_acct     text;
  v_enum_fee_acct    text;
  v_writeoff_acct    text;

  v_now              timestamptz := now();
BEGIN
  -- ── 0. Authentication ──────────────────────────────────────────────────────
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  -- ── 1. Authorisation ──────────────────────────────────────────────────────
  IF NOT public.is_cycle_exception_executor(v_actor_id) THEN
    RETURN jsonb_build_object('ok', false,
      'error', 'Access denied: FOM / Finance / Admin / Super Admin role required');
  END IF;

  SELECT COALESCE(full_name, email, id::text) INTO v_actor_name
  FROM public.profiles WHERE id = v_actor_id;

  -- ── 2. Validate decision value ─────────────────────────────────────────────
  IF p_decision NOT IN (
    'cancel','reduce','reassign','hold',   -- approved-only
    'roll','return','writeoff','redirect'  -- paid-only (roll = no GL)
  ) THEN
    RETURN jsonb_build_object('ok', false,
      'error', 'Invalid decision. Must be one of: cancel, reduce, reassign, hold, roll, return, writeoff, redirect');
  END IF;

  -- Classify decision
  v_is_approved_only := p_decision IN ('cancel','reduce','reassign','hold');
  v_is_paid_decision := p_decision IN ('roll','return','writeoff','redirect');
  v_is_gl_decision   := p_decision IN ('return','writeoff','redirect');
  v_is_manager       := public.is_cycle_exception_manager(v_actor_id);

  -- Finance can execute collection and accounting reclassification actions.
  -- Operational changes and write-offs require FOM/Admin/Super Admin authority.
  IF p_decision IN ('cancel','reduce','reassign','hold','roll','writeoff')
     AND NOT v_is_manager THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'This decision requires FOM / Admin / Super Admin authorization'
    );
  END IF;

  -- ── 3. Validate return_method when provided ────────────────────────────────
  IF p_return_method IS NOT NULL
     AND p_return_method NOT IN ('cash','bank_transfer') THEN
    RETURN jsonb_build_object('ok', false,
      'error', 'return_method must be ''cash'' or ''bank_transfer''');
  END IF;

  -- ── 4. Acquire advisory transaction lock (serialize per advance) ───────────
  PERFORM pg_advisory_xact_lock(hashtext('cea_advance:' || p_advance_id::text));

  -- Idempotency must be checked before mutable source validation. Successful
  -- actions can cancel the advance or move it to another site, so validating
  -- current status/site first would make a retry after a lost response fail.
  SELECT * INTO v_existing_action
  FROM public.cycle_exception_actions
  WHERE mmp_file_id = p_mmp_id
    AND advance_id = p_advance_id
  ORDER BY created_at DESC
  LIMIT 1;
  v_has_existing_action := FOUND;

  IF v_has_existing_action AND v_existing_action.executed THEN
    IF v_existing_action.mmp_site_entry_id IS DISTINCT FROM p_site_id THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'Executed action exists for a different source site'
      );
    END IF;
    IF v_existing_action.decision IS DISTINCT FROM p_decision THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'Conflicting executed action (' || v_existing_action.decision
                 || ') already exists for this advance'
      );
    END IF;
    RETURN jsonb_build_object(
      'ok',               true,
      'action_id',        v_existing_action.id,
      'executed_at',      v_existing_action.executed_at,
      'journal_entry_id', v_existing_action.gl_journal_entry_id,
      'message',          'Already executed (idempotent)'
    );
  END IF;

  -- ── 5. Validate source MMP ────────────────────────────────────────────────
  SELECT * INTO v_mmp FROM public.mmp_files WHERE id = p_mmp_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false,
      'error', 'MMP not found: ' || p_mmp_id);
  END IF;

  -- MMP is closed if cycle_status='closed' OR status='closed'
  IF coalesce(v_mmp.cycle_status,'') = 'closed'
     OR coalesce(v_mmp.status,'') = 'closed' THEN
    RETURN jsonb_build_object('ok', false,
      'error', 'Source MMP is already closed');
  END IF;

  v_country_id := v_mmp.country_id;

  -- ── 6. Validate source site ───────────────────────────────────────────────
  SELECT * INTO v_site
  FROM public.mmp_site_entries
  WHERE id = p_site_id AND mmp_file_id = p_mmp_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false,
      'error', 'Site entry not found or does not belong to the specified MMP');
  END IF;

  -- Source must be "not covered": not_covered_flag=true OR status='not_covered'
  IF NOT (
    coalesce(v_site.not_covered_flag, false) = true
    OR lower(coalesce(v_site.status,'')) = 'not_covered'
  ) THEN
    RETURN jsonb_build_object('ok', false,
      'error', 'Source site is not marked as not_covered');
  END IF;

  -- Resolve enumerator identity from accepted_by (text column, may be UUID-shaped)
  -- Safe UUID cast: only when the text matches UUID format
  IF v_site.accepted_by IS NOT NULL
     AND v_site.accepted_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    v_enumerator_id := v_site.accepted_by::uuid;
    SELECT COALESCE(full_name, email) INTO v_enumerator_name
    FROM public.profiles WHERE id = v_enumerator_id LIMIT 1;
  ELSE
    v_enumerator_id   := NULL;
    v_enumerator_name := v_site.accepted_by;  -- store raw text if not UUID
  END IF;

  -- ── 7. Validate advance ───────────────────────────────────────────────────
  SELECT * INTO v_advance
  FROM public.down_payment_requests
  WHERE id = p_advance_id AND mmp_site_entry_id = p_site_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false,
      'error', 'Advance not found or does not belong to the specified site');
  END IF;

  -- Enforce status classification
  IF v_is_approved_only THEN
    IF v_advance.status NOT IN ('approved') THEN
      RETURN jsonb_build_object('ok', false,
        'error', p_decision || ' requires advance status=approved. Current: '
                 || coalesce(v_advance.status, 'null'));
    END IF;
  END IF;

  IF v_is_paid_decision THEN
    IF v_advance.status NOT IN ('paid','fully_paid','partially_paid') THEN
      RETURN jsonb_build_object('ok', false,
        'error', p_decision || ' requires advance in a paid status. Current: '
                 || coalesce(v_advance.status, 'null'));
    END IF;
  END IF;

  -- Compute canonical paid amount: prefer non-zero total_paid_amount, else requested
  v_paid_amount := COALESCE(NULLIF(v_advance.total_paid_amount, 0),
                             v_advance.requested_amount, 0);

  -- ── 8. GL / full-amount decisions: return / writeoff / redirect ────────────
  IF v_is_gl_decision THEN
    IF COALESCE(p_amount, 0) <= 0 THEN
      RETURN jsonb_build_object('ok', false,
        'error', 'amount must be positive for ' || p_decision);
    END IF;
    IF p_amount <> v_paid_amount THEN
      RETURN jsonb_build_object('ok', false,
        'error', 'amount must equal the full paid amount ('
                 || v_paid_amount || ') for ' || p_decision);
    END IF;
    IF p_justification IS NULL OR trim(p_justification) = '' THEN
      RETURN jsonb_build_object('ok', false,
        'error', 'justification is required for ' || p_decision);
    END IF;

    -- Support both the currently deployed four-digit PACT COA and the optional
    -- six-digit standardization migration. Pick the account code that actually
    -- exists instead of hard-coding one schema generation.
    SELECT code INTO v_advance_acct
    FROM public.acct_accounts
    WHERE code = ANY (ARRAY['1510', '151000'])
      AND is_postable = true
      AND (country_id = v_country_id OR country_id IS NULL)
    ORDER BY CASE WHEN country_id = v_country_id THEN 0 ELSE 1 END,
             array_position(ARRAY['1510', '151000'], code)
    LIMIT 1;
    IF v_advance_acct IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'Transport Advance GL account is missing (expected 1510 or 151000)'
      );
    END IF;

    IF p_decision = 'writeoff' THEN
      SELECT code INTO v_writeoff_acct
      FROM public.acct_accounts
      WHERE code = ANY (ARRAY['5900', '590000'])
        AND is_postable = true
        AND (country_id = v_country_id OR country_id IS NULL)
      ORDER BY CASE WHEN country_id = v_country_id THEN 0 ELSE 1 END,
               array_position(ARRAY['5900', '590000'], code)
      LIMIT 1;
      IF v_writeoff_acct IS NULL THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'Write-Off GL account is missing (expected 5900 or 590000)'
        );
      END IF;
    ELSIF p_decision = 'redirect' THEN
      SELECT code INTO v_enum_fee_acct
      FROM public.acct_accounts
      WHERE code = ANY (ARRAY['5200', '520001', '520000'])
        AND is_postable = true
        AND (country_id = v_country_id OR country_id IS NULL)
      ORDER BY CASE WHEN country_id = v_country_id THEN 0 ELSE 1 END,
               array_position(ARRAY['5200', '520001', '520000'], code)
      LIMIT 1;
      IF v_enum_fee_acct IS NULL THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'Enumerator Fees GL account is missing (expected 5200, 520001, or 520000)'
        );
      END IF;
    END IF;

    IF p_decision = 'return' THEN
      IF p_recovery_date IS NULL THEN
        RETURN jsonb_build_object('ok', false,
          'error', 'recovery_date is required for return');
      END IF;
      IF p_return_method IS NULL OR trim(p_return_method) = '' THEN
        RETURN jsonb_build_object('ok', false,
          'error', 'return_method is required for return');
      END IF;
      IF p_receipt_reference IS NULL OR trim(p_receipt_reference) = '' THEN
        RETURN jsonb_build_object('ok', false,
          'error', 'receipt_reference is required for return');
      END IF;
      SELECT code INTO v_cash_acct
      FROM public.acct_accounts
      WHERE code = ANY (
        CASE p_return_method
          WHEN 'bank_transfer' THEN ARRAY['1020', '1200', '102000', '120000']
          ELSE ARRAY['1010', '1200', '101000', '120000']
        END
      )
        AND is_postable = true
        AND (country_id = v_country_id OR country_id IS NULL)
      ORDER BY CASE WHEN country_id = v_country_id THEN 0 ELSE 1 END,
      array_position(
        CASE p_return_method
          WHEN 'bank_transfer' THEN ARRAY['1020', '1200', '102000', '120000']
          ELSE ARRAY['1010', '1200', '101000', '120000']
        END,
        code
      )
      LIMIT 1;
      IF v_cash_acct IS NULL THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', CASE p_return_method
            WHEN 'bank_transfer' THEN 'Bank GL account is missing (expected 1020/1200 or 102000/120000)'
            ELSE 'Cash GL account is missing (expected 1010/1200 or 101000/120000)'
          END
        );
      END IF;
    END IF;
  END IF;

  -- ── 9. roll: paid, no GL, justification required ──────────────────────────
  IF p_decision = 'roll' THEN
    IF p_justification IS NULL OR trim(p_justification) = '' THEN
      RETURN jsonb_build_object('ok', false,
        'error', 'justification is required for roll');
    END IF;
  END IF;

  -- ── 10. cancel / hold: approved, justification required ───────────────────
  IF p_decision IN ('cancel','hold') THEN
    IF p_justification IS NULL OR trim(p_justification) = '' THEN
      RETURN jsonb_build_object('ok', false,
        'error', 'justification is required for ' || p_decision);
    END IF;
  END IF;

  -- ── 11. reduce: approved, amount > 0 and < requested ─────────────────────
  IF p_decision = 'reduce' THEN
    IF COALESCE(p_amount, 0) <= 0 THEN
      RETURN jsonb_build_object('ok', false,
        'error', 'amount must be > 0 for reduce');
    END IF;
    IF p_amount >= v_advance.requested_amount THEN
      RETURN jsonb_build_object('ok', false,
        'error', 'amount must be less than the requested amount ('
                 || v_advance.requested_amount || ') for reduce');
    END IF;
  END IF;

  -- ── 12. reassign: same MMP, covered target, same enumerator (accepted_by) ─
  IF p_decision = 'reassign' THEN
    IF p_target_site_id IS NULL THEN
      RETURN jsonb_build_object('ok', false,
        'error', 'target_site_id is required for reassign');
    END IF;
    SELECT * INTO v_target_site
    FROM public.mmp_site_entries
    WHERE id = p_target_site_id AND mmp_file_id = p_mmp_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false,
        'error', 'Target site not found in the same MMP');
    END IF;
    IF coalesce(v_target_site.not_covered_flag, false) = true
       OR lower(coalesce(v_target_site.status,'')) = 'not_covered' THEN
      RETURN jsonb_build_object('ok', false,
        'error', 'Target site for reassign must be a covered site');
    END IF;
    -- Same-enumerator check: accepted_by must match exactly, neither may be NULL
    IF v_site.accepted_by IS NULL OR v_target_site.accepted_by IS NULL THEN
      RETURN jsonb_build_object('ok', false,
        'error', 'Both source and target sites must have an assigned enumerator (accepted_by) for reassign');
    END IF;
    IF v_site.accepted_by IS DISTINCT FROM v_target_site.accepted_by THEN
      RETURN jsonb_build_object('ok', false,
        'error', 'Target site for reassign must be assigned to the same enumerator');
    END IF;
  END IF;

  -- ── 13. roll / hold: target MMP (different from source), covered site ──────
  IF p_decision IN ('roll','hold') THEN
    IF p_target_mmp_id IS NULL THEN
      RETURN jsonb_build_object('ok', false,
        'error', 'target_mmp_id is required for ' || p_decision);
    END IF;
    IF p_target_site_id IS NULL THEN
      RETURN jsonb_build_object('ok', false,
        'error', 'target_site_id is required for ' || p_decision);
    END IF;
    -- Must be a different MMP than source
    IF p_target_mmp_id = p_mmp_id THEN
      RETURN jsonb_build_object('ok', false,
        'error', 'Target MMP must be different from the source MMP for ' || p_decision);
    END IF;

    SELECT * INTO v_target_mmp FROM public.mmp_files WHERE id = p_target_mmp_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Target MMP not found');
    END IF;
    IF coalesce(v_target_mmp.cycle_status,'') = 'closed'
       OR coalesce(v_target_mmp.status,'') = 'closed' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Target MMP is closed');
    END IF;
    IF v_target_mmp.country_id IS DISTINCT FROM v_country_id THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'Target MMP must be in the same country as the source MMP'
      );
    END IF;

    SELECT * INTO v_target_site
    FROM public.mmp_site_entries
    WHERE id = p_target_site_id AND mmp_file_id = p_target_mmp_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false,
        'error', 'Target site not found in the target MMP');
    END IF;
    IF coalesce(v_target_site.not_covered_flag, false) = true
       OR lower(coalesce(v_target_site.status,'')) = 'not_covered' THEN
      RETURN jsonb_build_object('ok', false,
        'error', 'Target site for ' || p_decision || ' must be a covered site');
    END IF;
    -- Same-enumerator check: accepted_by must match exactly
    IF v_site.accepted_by IS NULL OR v_target_site.accepted_by IS NULL THEN
      RETURN jsonb_build_object('ok', false,
        'error', 'Both source and target sites must have an assigned enumerator (accepted_by) for ' || p_decision);
    END IF;
    IF v_site.accepted_by IS DISTINCT FROM v_target_site.accepted_by THEN
      RETURN jsonb_build_object('ok', false,
        'error', 'Target site for ' || p_decision || ' must be assigned to the same enumerator');
    END IF;
  END IF;

  -- ── 14. Reuse a failed/unexecuted action or create the audit row ───────────
  IF v_has_existing_action THEN
    v_action_id := v_existing_action.id;
    UPDATE public.cycle_exception_actions SET
      decision          = p_decision,
      decision_amount   = p_amount,
      justification     = p_justification,
      target_site_id    = p_target_site_id,
      rollover_mmp_id   = p_target_mmp_id,
      receipt_reference = p_receipt_reference,
      return_method     = p_return_method,
      recovery_date     = p_recovery_date,
      execution_error   = NULL
    WHERE id = v_action_id;
  ELSE
    -- Insert a new action record
    INSERT INTO public.cycle_exception_actions (
      mmp_file_id, mmp_site_entry_id, advance_id,
      enumerator_id, enumerator_name,
      site_name,
      advance_amount, advance_status,
      decision, decision_amount, justification, target_site_id,
      rollover_mmp_id,
      receipt_reference, return_method, recovery_date,
      executed,
      created_by_name
    ) VALUES (
      p_mmp_id, p_site_id, p_advance_id,
      v_enumerator_id,
      v_enumerator_name,
      v_site.site_name,
      -- Store paid amount for paid decisions, requested amount for approved
      CASE WHEN v_is_paid_decision THEN v_paid_amount
           ELSE COALESCE(v_advance.requested_amount, 0) END,
      v_advance.status,
      p_decision, p_amount, p_justification, p_target_site_id,
      p_target_mmp_id,
      p_receipt_reference, p_return_method, p_recovery_date,
      false,
      v_actor_name
    )
    RETURNING id INTO v_action_id;
  END IF;

  -- ── 15. Execute action atomically ─────────────────────────────────────────
  -- All source mutations occur inside this exception block.
  -- Any failure leaves the action row unexecuted with execution_error set.
  BEGIN

    CASE p_decision

      -- ── cancel: mark advance cancelled ────────────────────────────────────
      WHEN 'cancel' THEN
        UPDATE public.down_payment_requests SET
          status   = 'cancelled',
          metadata = COALESCE(metadata, '{}'::jsonb)
                     || jsonb_build_object(
                          'cancelled_by',        v_actor_id,
                          'cancelled_at',        v_now,
                          'cancel_reason',       'cycle_exception_cancel',
                          'exception_action_id', v_action_id,
                          'justification',       p_justification
                        )
        WHERE id = p_advance_id;

      -- ── reduce: lower requested_amount ────────────────────────────────────
      WHEN 'reduce' THEN
        UPDATE public.down_payment_requests SET
          requested_amount = p_amount,
          metadata         = COALESCE(metadata, '{}'::jsonb)
                             || jsonb_build_object(
                                  'reduced_by',          v_actor_id,
                                  'reduced_at',          v_now,
                                  'original_amount',     requested_amount,
                                  'reduced_to',          p_amount,
                                  'exception_action_id', v_action_id
                                )
        WHERE id = p_advance_id;

      -- ── reassign: move advance to covered site (same MMP, same enumerator) ─
      WHEN 'reassign' THEN
        UPDATE public.down_payment_requests SET
          mmp_site_entry_id = p_target_site_id,
          metadata          = COALESCE(metadata, '{}'::jsonb)
                              || jsonb_build_object(
                                   'reassigned_by',       v_actor_id,
                                   'reassigned_at',       v_now,
                                   'from_site_id',        p_site_id,
                                   'to_site_id',          p_target_site_id,
                                   'exception_action_id', v_action_id
                                 )
        WHERE id = p_advance_id;
        UPDATE public.cycle_exception_actions SET
          rollover_site_id   = p_target_site_id,
          rollover_site_name = (
            SELECT site_name FROM public.mmp_site_entries WHERE id = p_target_site_id
          )
        WHERE id = v_action_id;

      -- ── hold: approved advance, no GL, move to a different MMP ───────────
      WHEN 'hold' THEN
        UPDATE public.down_payment_requests SET
          mmp_site_entry_id = p_target_site_id,
          metadata          = COALESCE(metadata, '{}'::jsonb)
                              || jsonb_build_object(
                                   'held_by',             v_actor_id,
                                   'held_at',             v_now,
                                   'from_mmp_id',         p_mmp_id,
                                   'to_mmp_id',           p_target_mmp_id,
                                   'from_site_id',        p_site_id,
                                   'to_site_id',          p_target_site_id,
                                   'exception_action_id', v_action_id,
                                   'justification',       p_justification
                                 )
        WHERE id = p_advance_id;
        UPDATE public.cycle_exception_actions SET
          rollover_mmp_id    = p_target_mmp_id,
          rollover_site_id   = p_target_site_id,
          rollover_site_name = (
            SELECT site_name FROM public.mmp_site_entries WHERE id = p_target_site_id
          )
        WHERE id = v_action_id;

      -- ── roll: paid advance, no GL, move to a different MMP ───────────────
      WHEN 'roll' THEN
        UPDATE public.down_payment_requests SET
          mmp_site_entry_id = p_target_site_id,
          metadata          = COALESCE(metadata, '{}'::jsonb)
                              || jsonb_build_object(
                                   'rolled_by',           v_actor_id,
                                   'rolled_at',           v_now,
                                   'from_mmp_id',         p_mmp_id,
                                   'to_mmp_id',           p_target_mmp_id,
                                   'from_site_id',        p_site_id,
                                   'to_site_id',          p_target_site_id,
                                   'exception_action_id', v_action_id,
                                   'justification',       p_justification
                                 )
        WHERE id = p_advance_id;
        UPDATE public.cycle_exception_actions SET
          rollover_mmp_id    = p_target_mmp_id,
          rollover_site_id   = p_target_site_id,
          rollover_site_name = (
            SELECT site_name FROM public.mmp_site_entries WHERE id = p_target_site_id
          )
        WHERE id = v_action_id;

      -- ── return: cash received, post GL ────────────────────────────────────
      WHEN 'return' THEN
        v_gl_event   := 'exception_return_received';
        v_gl_desc_en := 'Cash Return — ' || COALESCE(v_site.site_name, 'Site');
        v_gl_desc_ar := 'استرداد نقدي — ' || COALESCE(v_site.site_name, 'Site');
        v_gl_lines   := jsonb_build_array(
          jsonb_build_object(
            'account_code', v_cash_acct, 'debit_credit', 'DR',
            'amount', p_amount, 'currency', 'SDG',
            'description', v_gl_desc_en, 'function', 'none'),
          jsonb_build_object(
            'account_code', v_advance_acct, 'debit_credit', 'CR',
            'amount', p_amount, 'currency', 'SDG',
            'description', v_gl_desc_en, 'function', 'program')
        );

        -- Post GL — failure exits immediately, leaving action unexecuted
        BEGIN
          v_journal_id := public.acct_bridge_post_journal(
            'cycle_exception_actions', v_action_id, v_gl_event,
            COALESCE(p_recovery_date, v_now::date),
            v_gl_desc_en, v_gl_desc_ar,
            v_gl_lines, v_actor_id, v_country_id
          );
        EXCEPTION WHEN OTHERS THEN
          UPDATE public.cycle_exception_actions SET
            execution_error = SQLERRM
          WHERE id = v_action_id;
          INSERT INTO public.acct_gl_bridge_log
            (source_table, source_id, event_type, status, error_message)
          VALUES
            ('cycle_exception_actions', v_action_id, v_gl_event, 'error', SQLERRM);
          RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
        END;

        UPDATE public.cycle_exception_actions SET
          gl_posted            = true,
          gl_posted_at         = v_now,
          gl_journal_entry_id  = v_journal_id
        WHERE id = v_action_id;

        INSERT INTO public.acct_gl_bridge_log
          (source_table, source_id, event_type, status, journal_entry_id)
        VALUES
          ('cycle_exception_actions', v_action_id, v_gl_event, 'success', v_journal_id);

        UPDATE public.down_payment_requests SET
          status   = 'fully_paid',
          metadata = COALESCE(metadata, '{}'::jsonb)
                     || jsonb_build_object(
                          'exception_action_id', v_action_id,
                          'return_received_by',  v_actor_id,
                          'return_received_at',  v_now,
                          'return_method',       p_return_method,
                          'receipt_reference',   p_receipt_reference,
                          'recovery_date',       p_recovery_date,
                          'gl_journal_entry_id', v_journal_id
                        )
        WHERE id = p_advance_id;

      -- ── writeoff: post GL, then mark advance cancelled ────────────────────
      WHEN 'writeoff' THEN
        v_gl_event   := 'exception_writeoff';
        v_gl_desc_en := 'Advance Write-Off — ' || COALESCE(v_site.site_name, 'Site');
        v_gl_desc_ar := 'شطب سلفة — ' || COALESCE(v_site.site_name, 'Site');
        v_gl_lines   := jsonb_build_array(
          jsonb_build_object(
            'account_code', v_writeoff_acct, 'debit_credit', 'DR',
            'amount', p_amount, 'currency', 'SDG',
            'description', v_gl_desc_en, 'function', 'program'),
          jsonb_build_object(
            'account_code', v_advance_acct, 'debit_credit', 'CR',
            'amount', p_amount, 'currency', 'SDG',
            'description', v_gl_desc_en, 'function', 'program')
        );

        BEGIN
          v_journal_id := public.acct_bridge_post_journal(
            'cycle_exception_actions', v_action_id, v_gl_event,
            v_now::date, v_gl_desc_en, v_gl_desc_ar,
            v_gl_lines, v_actor_id, v_country_id
          );
        EXCEPTION WHEN OTHERS THEN
          UPDATE public.cycle_exception_actions SET
            execution_error = SQLERRM
          WHERE id = v_action_id;
          INSERT INTO public.acct_gl_bridge_log
            (source_table, source_id, event_type, status, error_message)
          VALUES
            ('cycle_exception_actions', v_action_id, v_gl_event, 'error', SQLERRM);
          RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
        END;

        UPDATE public.cycle_exception_actions SET
          gl_posted            = true,
          gl_posted_at         = v_now,
          gl_journal_entry_id  = v_journal_id
        WHERE id = v_action_id;

        INSERT INTO public.acct_gl_bridge_log
          (source_table, source_id, event_type, status, journal_entry_id)
        VALUES
          ('cycle_exception_actions', v_action_id, v_gl_event, 'success', v_journal_id);

        UPDATE public.down_payment_requests SET
          status   = 'cancelled',
          metadata = COALESCE(metadata, '{}'::jsonb)
                     || jsonb_build_object(
                          'exception_action_id', v_action_id,
                          'written_off_by',      v_actor_id,
                          'written_off_at',      v_now,
                          'justification',       p_justification,
                          'gl_journal_entry_id', v_journal_id
                        )
        WHERE id = p_advance_id;

      -- ── redirect: reclassify advance as enumerator fee ────────────────────
      WHEN 'redirect' THEN
        -- Locking the source site above serializes this action with normal fee
        -- payment updates. If a normal fee payment won the race, do not post a
        -- second reclassification journal.
        IF coalesce(v_site.fee_paid_status, '') = 'paid'
           OR EXISTS (
             SELECT 1
             FROM public.acct_gl_bridge_log
             WHERE source_table = 'mmp_site_entries'
               AND source_id = p_site_id
               AND event_type = 'enumerator_fee_paid'
               AND status = 'success'
           ) THEN
          RETURN jsonb_build_object(
            'ok', false,
            'error', 'Enumerator fee is already paid or posted for this site; Redirect cannot be executed twice'
          );
        END IF;

        v_gl_event   := 'exception_redirect_to_fees';
        v_gl_desc_en := 'Advance → Enumerator Fee — ' || COALESCE(v_site.site_name, 'Site');
        v_gl_desc_ar := 'تحويل سلفة → أتعاب — ' || COALESCE(v_site.site_name, 'Site');
        v_gl_lines   := jsonb_build_array(
          jsonb_build_object(
            'account_code', v_enum_fee_acct, 'debit_credit', 'DR',
            'amount', p_amount, 'currency', 'SDG',
            'description', v_gl_desc_en, 'function', 'program'),
          jsonb_build_object(
            'account_code', v_advance_acct, 'debit_credit', 'CR',
            'amount', p_amount, 'currency', 'SDG',
            'description', v_gl_desc_en, 'function', 'program')
        );

        BEGIN
          v_journal_id := public.acct_bridge_post_journal(
            'cycle_exception_actions', v_action_id, v_gl_event,
            v_now::date, v_gl_desc_en, v_gl_desc_ar,
            v_gl_lines, v_actor_id, v_country_id
          );
        EXCEPTION WHEN OTHERS THEN
          UPDATE public.cycle_exception_actions SET
            execution_error = SQLERRM
          WHERE id = v_action_id;
          INSERT INTO public.acct_gl_bridge_log
            (source_table, source_id, event_type, status, error_message)
          VALUES
            ('cycle_exception_actions', v_action_id, v_gl_event, 'error', SQLERRM);
          RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
        END;

        UPDATE public.cycle_exception_actions SET
          gl_posted            = true,
          gl_posted_at         = v_now,
          gl_journal_entry_id  = v_journal_id
        WHERE id = v_action_id;

        INSERT INTO public.acct_gl_bridge_log
          (source_table, source_id, event_type, status, journal_entry_id)
        VALUES
          ('cycle_exception_actions', v_action_id, v_gl_event, 'success', v_journal_id);

        -- Insert a "success" idempotency row for enumerator_fee_paid on this
        -- site entry BEFORE setting fee_paid_status='paid', so the existing
        -- acct_trig_mmp_site_entries_fee_paid trigger's "already posted" guard
        -- fires and returns harmlessly, preventing a duplicate GL journal.
        -- (acct_gl_bridge_log has no unique constraint; guard with NOT EXISTS)
        IF NOT EXISTS (
          SELECT 1 FROM public.acct_gl_bridge_log
          WHERE source_table = 'mmp_site_entries'
            AND source_id    = p_site_id
            AND event_type   = 'enumerator_fee_paid'
            AND status       = 'success'
        ) THEN
          INSERT INTO public.acct_gl_bridge_log
            (source_table, source_id, event_type, status, journal_entry_id)
          VALUES
            ('mmp_site_entries', p_site_id, 'enumerator_fee_paid', 'success', v_journal_id);
        END IF;

        -- Now update fee payment fields on the site entry
        UPDATE public.mmp_site_entries SET
          fee_paid_status  = 'paid',
          fee_paid_amount  = p_amount,
          fee_paid_at      = v_now,
          fee_paid_by      = v_actor_id
        WHERE id = p_site_id;

        UPDATE public.down_payment_requests SET
          status   = 'cancelled',
          metadata = COALESCE(metadata, '{}'::jsonb)
                     || jsonb_build_object(
                          'exception_action_id',    v_action_id,
                          'redirected_to_fees_by',  v_actor_id,
                          'redirected_at',          v_now,
                          'justification',          p_justification,
                          'gl_journal_entry_id',    v_journal_id
                        )
        WHERE id = p_advance_id;

      ELSE
        -- Unreachable; guards above validate decision before here
        RETURN jsonb_build_object('ok', false,
          'error', 'Unknown decision: ' || p_decision);
    END CASE;

    -- ── 16. Mark action executed, store audit fields ───────────────────────
    UPDATE public.cycle_exception_actions SET
      executed          = true,
      executed_at       = v_now,
      executed_by       = v_actor_id,
      executed_by_name  = v_actor_name,
      execution_note    = 'Executed via execute_cycle_close_exception',
      execution_error   = NULL,
      -- Update receipt/recovery fields preserving existing if param is null
      receipt_reference = COALESCE(p_receipt_reference, receipt_reference),
      return_method     = COALESCE(p_return_method,     return_method),
      recovery_date     = COALESCE(p_recovery_date,     recovery_date),
      recovery_amount   = CASE
                            WHEN v_is_gl_decision THEN p_amount
                            ELSE recovery_amount
                          END,
      -- Store paid amount for paid decisions, advance_amount already set on insert
      advance_amount    = CASE
                            WHEN v_is_paid_decision THEN v_paid_amount
                            ELSE advance_amount
                          END,
      action_payload    = jsonb_build_object(
                            'decision',          p_decision,
                            'amount',            p_amount,
                            'justification',     p_justification,
                            'target_mmp_id',     p_target_mmp_id,
                            'target_site_id',    p_target_site_id,
                            'receipt_reference', p_receipt_reference,
                            'return_method',     p_return_method,
                            'recovery_date',     p_recovery_date,
                            'actor_id',          v_actor_id,
                            'actor_name',        v_actor_name,
                            'executed_at',       v_now
                          )
    WHERE id = v_action_id;

  EXCEPTION WHEN OTHERS THEN
    -- Store error; leave action unexecuted; all mutations within this block
    -- will be rolled back by the exception handler automatically.
    UPDATE public.cycle_exception_actions SET
      execution_error = SQLERRM
    WHERE id = v_action_id;
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
  END;

  -- ── 17. Return success ─────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'ok',               true,
    'action_id',        v_action_id,
    'executed_at',      v_now,
    'journal_entry_id', v_journal_id,
    'message',          'Exception action executed successfully'
  );

END;
$$;

-- Grant only this wrapper RPC to authenticated; inner helpers stay private.
REVOKE ALL ON FUNCTION public.execute_cycle_close_exception(
  uuid, uuid, uuid, text, numeric, text, uuid, uuid, text, text, date
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_cycle_close_exception(
  uuid, uuid, uuid, text, numeric, text, uuid, uuid, text, text, date
) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. BEFORE UPDATE trigger on mmp_files — hard close gate
--
-- Fires before any UPDATE of cycle_status on mmp_files. On transition
-- to 'closed' it rejects the attempt if:
--   (a) This MMP has any cycle_exception_actions where executed=false
--       (an unexecuted action is still pending).
--   (b) Any down_payment_requests in approved or paid status still sits
--       on a not-covered source site belonging to this MMP without a
--       matching cycle_exception_actions row that is executed=true.
--
-- This ensures close_mmp_and_lock_incentives (and any other path that
-- transitions cycle_status → 'closed') cannot bypass exception execution.
--
-- The trigger function is idempotent (CREATE OR REPLACE).
-- The trigger itself is idempotent (DROP IF EXISTS then CREATE).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trig_mmp_files_exception_close_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending_actions  int;
  v_unresolved_advances int;
BEGIN
  -- Only fire when cycle_status is transitioning to 'closed'
  IF NEW.cycle_status IS NOT DISTINCT FROM OLD.cycle_status THEN
    RETURN NEW;
  END IF;
  IF NEW.cycle_status <> 'closed' THEN
    RETURN NEW;
  END IF;

  -- Gate A: any unexecuted exception actions for this MMP
  SELECT COUNT(*) INTO v_pending_actions
  FROM public.cycle_exception_actions
  WHERE mmp_file_id = NEW.id
    AND executed = false;

  IF v_pending_actions > 0 THEN
    RAISE EXCEPTION
      'CYCLE_CLOSE_GATE: % unexecuted exception action(s) must be executed before closing this cycle.',
      v_pending_actions;
  END IF;

  -- Gate B: approved or paid advances on not-covered sites with no executed action
  SELECT COUNT(*) INTO v_unresolved_advances
  FROM public.down_payment_requests dpr
  JOIN public.mmp_site_entries mse
    ON mse.id = dpr.mmp_site_entry_id
  WHERE mse.mmp_file_id = NEW.id
    AND (
      coalesce(mse.not_covered_flag, false) = true
      OR lower(coalesce(mse.status,'')) = 'not_covered'
    )
    AND dpr.status IN ('approved','paid','fully_paid','partially_paid')
    AND NOT EXISTS (
      SELECT 1
      FROM public.cycle_exception_actions cea
      WHERE cea.mmp_file_id  = NEW.id
        AND cea.advance_id   = dpr.id
        AND cea.executed     = true
    );

  IF v_unresolved_advances > 0 THEN
    RAISE EXCEPTION
      'CYCLE_CLOSE_GATE: % advance(s) on not-covered sites have no executed exception action. Execute all exception actions before closing.',
      v_unresolved_advances;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger (idempotent via DROP IF EXISTS)
DROP TRIGGER IF EXISTS trg_mmp_files_exception_close_gate ON public.mmp_files;
CREATE TRIGGER trg_mmp_files_exception_close_gate
  BEFORE UPDATE OF cycle_status ON public.mmp_files
  FOR EACH ROW
  EXECUTE FUNCTION public.trig_mmp_files_exception_close_gate();

COMMENT ON FUNCTION public.trig_mmp_files_exception_close_gate() IS
  'Hard server gate: prevents transitioning mmp_files.cycle_status to ''closed'' '
  'while any cycle_exception_actions are unexecuted or while approved/paid advances '
  'remain on not-covered sites without a matching executed exception action.';

COMMIT;
