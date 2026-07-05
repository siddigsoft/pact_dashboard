-- ============================================================================
-- Pre-Fund renewal approval-bypass fix + matching_scope enum alignment
-- ============================================================================
-- Fixes two bugs found in code review of the Pre-Funding Management System:
--
-- 1. run_pre_fund_renewal_check() auto_activate path silently bypassed the
--    approval chain even when auto_renewal_bypass_approvals = false. It
--    inserted the renewal as 'pending_grace' and a second step in the same
--    function auto-promoted it to 'active' once grace_expires_at elapsed,
--    without ever touching pre_fund_approval_steps or requiring an approver
--    action. This migration changes the non-bypass path to insert the
--    renewal as 'pending_approval' and clone the parent fund's approval
--    steps (mirroring the existing auto_draft renewal path), so it can only
--    become active via the normal approval flow
--    (process_pf_step_action -> 'awaiting_receipt' -> activate_pre_fund_rpc).
--    The old grace-activation block is kept ONLY to finish activating any
--    legacy 'pending_grace' rows created before this fix; new renewals never
--    enter that status again.
--
-- 2. pre_fund_settings.default_matching_scope allowed ('global','project',
--    'country'), which is inconsistent with the fund-level matching_scope
--    enum used by pre_fund_requests / PreFundingRegistry.tsx / this settings
--    page ('country','project','country_project',
--    'country_project_category'). This migration widens the CHECK
--    constraint and remaps any existing 'global' rows to 'country_project'
--    (the closest broad-scope equivalent) so the column stays valid.
--
-- Safe to re-run: CREATE OR REPLACE FUNCTION + guarded ALTER/UPDATE.
-- ============================================================================

-- ── Fix 2: widen default_matching_scope CHECK + backfill invalid values ────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pre_fund_settings' AND column_name = 'default_matching_scope'
  ) THEN
    -- Drop (or widen) the CHECK constraint FIRST — the old constraint only
    -- allowed ('global','project','country'), so remapping legacy values to
    -- 'country_project' before this would itself violate it.
    ALTER TABLE pre_fund_settings
      DROP CONSTRAINT IF EXISTS pre_fund_settings_default_matching_scope_check;

    -- Now safe to remap legacy values that don't satisfy the new CHECK.
    UPDATE pre_fund_settings
    SET default_matching_scope = 'country_project'
    WHERE default_matching_scope NOT IN ('country','project','country_project','country_project_category');

    ALTER TABLE pre_fund_settings
      ADD CONSTRAINT pre_fund_settings_default_matching_scope_check
      CHECK (default_matching_scope IN ('country','project','country_project','country_project_category'));

    ALTER TABLE pre_fund_settings
      ALTER COLUMN default_matching_scope SET DEFAULT 'country_project';
  END IF;
END $$;

-- ── Fix 0: drop store_pre_fund_bank_key if it exists with a different
--           return type (e.g. VOID from an earlier bundle) so the
--           canonical migration's CREATE OR REPLACE (RETURNS jsonb) below
--           and in 20260627_pre_fund_rpcs_canonical.sql doesn't fail with
--           "cannot change return type of existing function".
DROP FUNCTION IF EXISTS store_pre_fund_bank_key(uuid, text, text);

-- ── Fix 1: run_pre_fund_renewal_check() — route non-bypass renewals through
--           the approval chain instead of a silent grace-window auto-promote.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION run_pre_fund_renewal_check()
RETURNS TABLE(fund_id UUID, fund_name TEXT, action TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_role        TEXT;
  r                 RECORD;
  v_new_id          UUID;
  v_receipt_acct_id UUID;
  v_liab_acct_id    UUID;
  v_je_id           UUID;
  v_ik              TEXT;
BEGIN
  -- Guard: allow pg_cron (current_user = postgres/supabase_admin/service_role) OR
  -- Edge Function scheduler (JWT role = service_role).
  DECLARE
    v_jwt_role_guard text := '';
  BEGIN
    BEGIN
      v_jwt_role_guard := coalesce(
        current_setting('request.jwt.claims', true)::json->>'role',
        ''
      );
    EXCEPTION WHEN OTHERS THEN
      v_jwt_role_guard := coalesce(current_setting('request.jwt.claims.role', true), '');
    END;
    IF current_user NOT IN ('postgres', 'supabase_admin', 'supabase_auth_admin', 'service_role')
       AND v_jwt_role_guard NOT IN ('service_role')
    THEN
      RAISE EXCEPTION 'run_pre_fund_renewal_check: unauthorized caller (db_user="%" jwt_role="%").',
        current_user, v_jwt_role_guard;
    END IF;
  END;

  -- Mark funds ending within warning_days as ending_soon
  UPDATE pre_fund_requests
  SET ending_soon_alert = true, updated_at = now()
  WHERE status IN ('active','low_balance')
    AND end_date IS NOT NULL
    AND end_date <= (CURRENT_DATE + (warning_days || ' days')::INTERVAL)
    AND ending_soon_alert = false;

  -- Mark funds with available_balance below threshold as low_balance
  UPDATE pre_fund_requests
  SET status = 'low_balance', low_balance_alert = true, updated_at = now()
  WHERE status = 'active'
    AND threshold_pct IS NOT NULL
    AND amount > 0
    AND (available_balance / amount * 100) <= threshold_pct;

  -- ── Auto-draft renewal for eligible funds (auto_renewal_mode = 'auto_draft') ─────────────
  FOR r IN
    SELECT
      id, name, source, amount, currency, period_type_id, period_type_name,
      country_id, project_id, grant_id, matching_scope,
      threshold_pct, threshold_amount, warning_days, auto_renewal_mode, auto_renewal_days_before,
      gl_receipt_account, gl_liability_account, gl_expense_account, gl_cf_account,
      notification_recipients, end_date
    FROM pre_fund_requests
    WHERE status IN ('active','low_balance')
      AND auto_renewal_mode = 'auto_draft'
      AND end_date IS NOT NULL
      AND end_date <= (CURRENT_DATE + COALESCE(auto_renewal_days_before, 7))
      AND NOT EXISTS (
        SELECT 1 FROM pre_fund_requests r2
        WHERE r2.notes LIKE '%Auto-renewed from fund id: ' || pre_fund_requests.id::text || '%'
          AND r2.status = 'draft'
      )
  LOOP
    INSERT INTO pre_fund_requests (
      name, source, amount, currency, period_type_id, period_type_name,
      country_id, project_id, grant_id, matching_scope,
      threshold_pct, threshold_amount, warning_days, auto_renewal_mode, auto_renewal_days_before,
      gl_receipt_account, gl_liability_account, gl_expense_account, gl_cf_account,
      notification_recipients, notes, status, available_balance, committed_amount, paid_amount,
      start_date, end_date
    ) VALUES (
      r.name || ' (Renewal)', r.source, r.amount, r.currency, r.period_type_id, r.period_type_name,
      r.country_id, r.project_id, r.grant_id, r.matching_scope,
      r.threshold_pct, r.threshold_amount, r.warning_days, r.auto_renewal_mode, r.auto_renewal_days_before,
      r.gl_receipt_account, r.gl_liability_account, r.gl_expense_account, r.gl_cf_account,
      r.notification_recipients,
      'Auto-renewed from fund id: ' || r.id::text,
      'draft', 0, 0, 0,
      r.end_date + 1,
      r.end_date + 1 + COALESCE(
        (SELECT day_count FROM pre_fund_period_types WHERE id = r.period_type_id), 30
      )
    ) RETURNING id INTO v_new_id;

    INSERT INTO pre_fund_approval_steps (
      pre_fund_request_id, step_order, step_label,
      assigned_user_id, assigned_user_ids, is_required, required_approvals, status
    )
    SELECT
      v_new_id, step_order, step_label,
      assigned_user_id, assigned_user_ids, is_required,
      COALESCE(required_approvals, 1), 'pending'
    FROM pre_fund_approval_steps
    WHERE pre_fund_request_id = r.id
    ORDER BY step_order;

    IF NOT FOUND THEN
      INSERT INTO pre_fund_approval_steps (
        pre_fund_request_id, step_order, step_label,
        assigned_user_ids, is_required, required_approvals, status
      ) VALUES (
        v_new_id, 1, 'Finance Review (Auto-Renewal)',
        '{}', true, 1, 'pending'
      );
    END IF;
  END LOOP;

  -- ── Auto-activate renewal for eligible funds (auto_renewal_mode = 'auto_activate') ──
  -- bypass=TRUE  → create directly as 'active' (no approval gate), same as before.
  -- bypass=FALSE → create as 'pending_approval' and clone the parent fund's approval
  --   steps, so the renewal enters the SAME approval chain as any manually-created
  --   fund. It is activated ONLY after all required steps are approved via
  --   process_pf_step_action() (-> 'awaiting_receipt') and then manually activated
  --   through activate_pre_fund_rpc (receipt upload / bank match) — never
  --   auto-promoted by a timer.
  FOR r IN
    SELECT
      id AS src_id,
      name, source, amount, currency, period_type_id, period_type_name,
      country_id, project_id, grant_id, matching_scope,
      threshold_pct, threshold_amount, warning_days,
      auto_renewal_mode, auto_renewal_days_before, auto_renewal_bypass_approvals,
      gl_receipt_account, gl_liability_account, gl_expense_account, gl_cf_account,
      notification_recipients, end_date
    FROM pre_fund_requests
    WHERE status IN ('active','low_balance')
      AND auto_renewal_mode = 'auto_activate'
      AND end_date IS NOT NULL
      AND end_date <= (CURRENT_DATE + COALESCE(auto_renewal_days_before, 7))
      AND NOT EXISTS (
        SELECT 1 FROM pre_fund_requests r2
        WHERE r2.notes LIKE '%Auto-activated from fund id: ' || pre_fund_requests.id::text || '%'
          AND r2.status IN ('draft','pending_approval','pending_grace','active','awaiting_receipt')
      )
  LOOP
    INSERT INTO pre_fund_requests (
      name, source, amount, currency, period_type_id, period_type_name,
      country_id, project_id, grant_id, matching_scope,
      threshold_pct, threshold_amount, warning_days,
      auto_renewal_mode, auto_renewal_days_before, auto_renewal_bypass_approvals,
      gl_receipt_account, gl_liability_account, gl_expense_account, gl_cf_account,
      notification_recipients, notes,
      status, available_balance, committed_amount, paid_amount,
      activated_at, start_date, end_date, grace_expires_at
    )
    VALUES (
      r.name || ' (Auto-Renewal)',
      r.source,
      r.amount, r.currency,
      r.period_type_id, r.period_type_name,
      r.country_id, r.project_id, r.grant_id, r.matching_scope,
      r.threshold_pct, r.threshold_amount, r.warning_days,
      r.auto_renewal_mode, r.auto_renewal_days_before, r.auto_renewal_bypass_approvals,
      r.gl_receipt_account, r.gl_liability_account,
      r.gl_expense_account, r.gl_cf_account,
      r.notification_recipients,
      'Auto-activated from fund id: ' || r.src_id::text || '; actor=system',
      CASE WHEN r.auto_renewal_bypass_approvals THEN 'active' ELSE 'pending_approval' END,
      CASE WHEN r.auto_renewal_bypass_approvals THEN r.amount ELSE 0 END,
      0, 0,
      CASE WHEN r.auto_renewal_bypass_approvals THEN now() ELSE NULL END,
      r.end_date + 1,
      r.end_date + 1 + COALESCE(
        (SELECT day_count FROM pre_fund_period_types WHERE id = r.period_type_id), 30
      ),
      NULL
    )
    RETURNING id INTO v_new_id;

    IF r.auto_renewal_bypass_approvals THEN
      SELECT id INTO v_receipt_acct_id FROM acct_accounts WHERE code = r.gl_receipt_account LIMIT 1;
      SELECT id INTO v_liab_acct_id    FROM acct_accounts WHERE code = r.gl_liability_account LIMIT 1;

      IF v_receipt_acct_id IS NOT NULL AND v_liab_acct_id IS NOT NULL THEN
        v_ik := 'pf-received-' || v_new_id::TEXT || '-autorenewal';

        IF NOT EXISTS (SELECT 1 FROM acct_journal_entries WHERE idempotency_key = v_ik) THEN
          INSERT INTO acct_journal_entries (
            description_en, description_ar, posting_date, status,
            source_type, source_id, idempotency_key, created_by
          ) VALUES (
            'Pre-Fund Auto-Renewed — ' || r.name,
            'تجديد التمويل المسبق تلقائياً — ' || r.name,
            CURRENT_DATE, 'draft',
            'pre_fund_requests', v_new_id, v_ik, NULL
          ) RETURNING id INTO v_je_id;

          INSERT INTO acct_journal_lines (entry_id, line_no, account_id, debit_credit,
            original_amount, original_currency, functional_amount, functional_currency,
            description, function)
          VALUES
            (v_je_id, 1, v_receipt_acct_id, 'DR',
             r.amount, r.currency, r.amount, r.currency,
             'Pre-fund auto-renewal receipt — ' || r.name, 'program'),
            (v_je_id, 2, v_liab_acct_id, 'CR',
             r.amount, r.currency, r.amount, r.currency,
             'Pre-fund auto-renewal liability — ' || r.name, 'program');

          INSERT INTO acct_gl_bridge_log (source_table, source_id, event_type, status, journal_entry_id)
          VALUES ('pre_fund_requests', v_new_id, 'pre_fund_received', 'success', v_je_id);
        END IF;
      END IF;
    ELSE
      INSERT INTO pre_fund_approval_steps (
        pre_fund_request_id, step_order, step_label,
        assigned_user_id, assigned_user_ids, is_required, required_approvals, status
      )
      SELECT
        v_new_id, step_order, step_label,
        assigned_user_id, assigned_user_ids, is_required,
        COALESCE(required_approvals, 1), 'pending'
      FROM pre_fund_approval_steps
      WHERE pre_fund_request_id = r.src_id
      ORDER BY step_order;

      IF NOT FOUND THEN
        INSERT INTO pre_fund_approval_steps (
          pre_fund_request_id, step_order, step_label,
          assigned_user_ids, is_required, required_approvals, status
        ) VALUES (
          v_new_id, 1, 'Finance Review (Auto-Renewal)',
          '{}', true, 1, 'pending'
        );
      END IF;
    END IF;
  END LOOP;

  -- Step 2 (LEGACY): Activate any pre-existing pending_grace renewals whose grace window
  --         has already expired. New auto_activate renewals no longer enter pending_grace
  --         (see fix above) — this block is retained only for backward compatibility with
  --         rows created before this fix, and is safe to keep indefinitely: it simply
  --         activates old rows if any exist; new rows skip this path entirely.
  FOR r IN
    UPDATE pre_fund_requests
    SET status = 'active',
        available_balance = amount,
        activated_at = now(),
        updated_at = now()
    WHERE status = 'pending_grace'
      AND grace_expires_at IS NOT NULL
      AND grace_expires_at < now()
    RETURNING id, name, amount, currency, gl_receipt_account, gl_liability_account
  LOOP
    SELECT id INTO v_receipt_acct_id FROM acct_accounts WHERE code = r.gl_receipt_account LIMIT 1;
    SELECT id INTO v_liab_acct_id    FROM acct_accounts WHERE code = r.gl_liability_account LIMIT 1;

    IF v_receipt_acct_id IS NOT NULL AND v_liab_acct_id IS NOT NULL THEN
      v_ik := 'pf-received-' || r.id::TEXT || '-grace-activated';

      IF NOT EXISTS (SELECT 1 FROM acct_journal_entries WHERE idempotency_key = v_ik) THEN
        INSERT INTO acct_journal_entries (
          description_en, description_ar, posting_date, status,
          source_type, source_id, idempotency_key, created_by
        ) VALUES (
          'Pre-Fund Activated (Grace Period Expired) — ' || r.name,
          'تفعيل التمويل (انتهاء فترة السماح) — ' || r.name,
          CURRENT_DATE, 'draft',
          'pre_fund_requests', r.id, v_ik, NULL
        ) RETURNING id INTO v_je_id;

        INSERT INTO acct_journal_lines (entry_id, line_no, account_id, debit_credit,
          original_amount, original_currency, functional_amount, functional_currency,
          description, function)
        VALUES
          (v_je_id, 1, v_receipt_acct_id, 'DR',
           r.amount, r.currency, r.amount, r.currency,
           'Pre-fund grace-activation receipt — ' || r.name, 'program'),
          (v_je_id, 2, v_liab_acct_id, 'CR',
           r.amount, r.currency, r.amount, r.currency,
           'Pre-fund grace-activation liability — ' || r.name, 'program');

        INSERT INTO acct_gl_bridge_log (source_table, source_id, event_type, status, journal_entry_id)
        VALUES ('pre_fund_requests', r.id, 'pre_fund_received', 'success', v_je_id);
      END IF;
    END IF;
  END LOOP;

  -- Notify Finance team of any auto-activations that just fired (immediate bypass OR grace-expired)
  INSERT INTO notification_events (event_type, reference_type, title, message, target_roles, metadata)
  SELECT
    'pre_fund_auto_activated',
    'pre_fund_request',
    'Pre-Fund Auto-Activated',
    CASE
      WHEN auto_renewal_bypass_approvals
        THEN 'Fund "' || name || '" was automatically activated immediately (bypass approvals enabled). Actor: system.'
      ELSE 'Fund "' || name || '" was automatically activated after the grace window expired. Actor: system.'
    END,
    '["super_admin","admin","financialAdmin"]'::JSONB,
    jsonb_build_object(
      'fund_id', id, 'amount', amount, 'currency', currency,
      'actor', 'system',
      'bypass_approvals', auto_renewal_bypass_approvals
    )
  FROM pre_fund_requests
  WHERE status = 'active'
    AND activated_at >= now() - INTERVAL '1 minute'
    AND notes LIKE '%Auto-activated from fund id:%'
    AND notes LIKE '%actor=system%';

  RETURN QUERY
    SELECT id, name, 'ending_soon_check'::TEXT
    FROM pre_fund_requests
    WHERE ending_soon_alert = true AND status IN ('active','low_balance');
END;
$$;

REVOKE ALL ON FUNCTION run_pre_fund_renewal_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION run_pre_fund_renewal_check() FROM authenticated;
GRANT EXECUTE ON FUNCTION run_pre_fund_renewal_check() TO service_role;
