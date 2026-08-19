-- =============================================================================
-- GL Bridge failed-posting queue and targeted retry
--
-- The existing backfill RPCs intentionally process every eligible source row.
-- This migration adds a read model for each unresolved failed attempt and a
-- retry RPC that accepts exactly one failed log record.
-- =============================================================================

BEGIN;

-- Keep this migration safe to apply on databases that have the original bridge
-- log but not the later enrichment migrations yet.
ALTER TABLE public.acct_gl_bridge_log
  ADD COLUMN IF NOT EXISTS amount numeric(20,4),
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.get_unresolved_gl_bridge_errors(
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  id uuid,
  source_table text,
  source_id uuid,
  event_type text,
  status text,
  journal_entry_id uuid,
  error_message text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Keep the queue restricted to the same finance/admin audience as the
  -- posting RPCs. SECURITY DEFINER is needed because bridge logs are not
  -- directly readable by every finance role under the normal table policies.
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND lower(replace(coalesce(p.role, ''), ' ', '_')) IN
        ('super_admin', 'superadmin', 'admin', 'finance',
         'financialadmin', 'financial_admin', 'accountant')
  ) THEN
    RETURN;
  END IF;

  -- Do not collapse rows by source or event. Installments can share the same
  -- event type, and a later successful installment must never hide an earlier
  -- failed installment that still needs Finance's attention.
  RETURN QUERY
  SELECT l.id,
         l.source_table,
         l.source_id,
         l.event_type,
         l.status,
         l.journal_entry_id,
         l.error_message,
         l.created_at
  FROM public.acct_gl_bridge_log l
  WHERE l.status = 'error'
    AND l.resolved_at IS NULL
  ORDER BY l.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_unresolved_gl_bridge_errors(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.retry_gl_bridge_posting(p_log_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec         record;
  v_entry_id    uuid;
  v_period_id   uuid;
  v_fund_id     uuid;
  v_poster_id   uuid;
  v_dr_acct_id  uuid;
  v_cr_acct_id  uuid;
  v_total_paid  numeric(20,4);
  v_posted_sum  numeric(20,4);
  v_gap         numeric(20,4);
  v_failed_amount numeric(20,4);
  v_post_amount numeric(20,4);
  v_amount      numeric(20,4);
  v_expense_code text;
  v_idempotency text;
  v_error       text;
  v_source_table text;
  v_source_id uuid;
  v_event_type text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND lower(replace(coalesce(p.role, ''), ' ', '_')) IN
        ('super_admin', 'superadmin', 'admin', 'finance',
         'financialadmin', 'financial_admin', 'accountant')
  ) THEN
    RETURN jsonb_build_object('status', 'error', 'error', 'Access denied: Finance or Admin role required.');
  END IF;

  SELECT l.source_table, l.source_id, l.event_type, l.amount
  INTO v_source_table, v_source_id, v_event_type, v_failed_amount
  FROM public.acct_gl_bridge_log l
  WHERE l.id = p_log_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'error', 'error', 'The failed posting was not found.');
  END IF;

  -- Serialise retries for the source. Each error log is its own queue item:
  -- this prevents a later successful installment from hiding an earlier failed
  -- installment with the same event type.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_source_table || ':' || v_source_id::text,
    0
  ));

  IF NOT EXISTS (
    SELECT 1
    FROM public.acct_gl_bridge_log l
    WHERE l.id = p_log_id
      AND l.status = 'error'
      AND l.resolved_at IS NULL
  ) THEN
    RETURN jsonb_build_object('status', 'skipped', 'message', 'This failure has already been handled.');
  END IF;

  IF v_source_table NOT IN ('down_payment_requests', 'operational_cost_submissions') THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'Targeted retry is not supported for this source table.'
    );
  END IF;

  SELECT id INTO v_fund_id
  FROM public.acct_funds
  WHERE code = 'GENERAL' AND is_active = true
  LIMIT 1;
  IF v_fund_id IS NULL THEN
    SELECT id INTO v_fund_id
    FROM public.acct_funds
    WHERE is_active = true
    ORDER BY created_at
    LIMIT 1;
  END IF;
  IF v_fund_id IS NULL THEN
    UPDATE public.acct_gl_bridge_log
    SET error_message = 'No active fund found.'
    WHERE id = p_log_id;
    RETURN jsonb_build_object('status', 'error', 'error', 'No active fund found.');
  END IF;

  IF v_source_table = 'down_payment_requests' THEN
    SELECT dpr.* INTO v_rec
    FROM public.down_payment_requests dpr
    WHERE dpr.id = v_source_id
      AND dpr.status IN ('partially_paid', 'fully_paid');

    IF NOT FOUND THEN
      UPDATE public.acct_gl_bridge_log
      SET resolved_at = now(), resolved_by = auth.uid()
      WHERE id = p_log_id;
      RETURN jsonb_build_object('status', 'skipped', 'message', 'Advance is no longer payable.');
    END IF;

    -- Match the bridge's established source semantics: fully paid legacy
    -- advances may only have requested_amount populated.
    v_total_paid := COALESCE(v_rec.total_paid_amount, v_rec.requested_amount, 0);
    IF v_total_paid <= 0 THEN
      UPDATE public.acct_gl_bridge_log
      SET error_message = 'Advance has no paid or requested amount to post.'
      WHERE id = p_log_id;
      RETURN jsonb_build_object('status', 'error', 'error', 'Advance has no paid or requested amount to post.');
    END IF;

    SELECT COALESCE(SUM(
      CASE
        WHEN l.amount IS NOT NULL THEN l.amount
        WHEN l.journal_entry_id IS NOT NULL THEN (
          SELECT COALESCE(SUM(jl.functional_amount), 0)
          FROM public.acct_journal_lines jl
          WHERE jl.entry_id = l.journal_entry_id
            AND jl.debit_credit = 'DR'
        )
        ELSE 0
      END
    ), 0)
    INTO v_posted_sum
    FROM public.acct_gl_bridge_log l
    WHERE l.source_table = v_source_table
      AND l.source_id = v_source_id
      AND l.status = 'success';

    v_gap := v_total_paid - v_posted_sum;
    IF v_gap < 0.005 THEN
      UPDATE public.acct_gl_bridge_log
      SET resolved_at = now(), resolved_by = auth.uid()
      WHERE id = p_log_id;
      RETURN jsonb_build_object('status', 'skipped', 'message', 'The paid amount is already fully posted.');
    END IF;

    -- Use the amount recorded on the selected failed log row. This prevents a
    -- retry from silently posting a newer installment or a source-wide total.
    v_post_amount := v_failed_amount;
    IF v_post_amount IS NULL OR v_post_amount <= 0 THEN
      UPDATE public.acct_gl_bridge_log
      SET error_message = 'The selected failure has no retryable amount.'
      WHERE id = p_log_id;
      RETURN jsonb_build_object('status', 'error', 'error', 'The selected failure has no retryable amount.');
    END IF;
    IF v_post_amount > v_gap + 0.005 THEN
      UPDATE public.acct_gl_bridge_log
      SET error_message = 'The selected failed amount exceeds the remaining unposted advance balance.'
      WHERE id = p_log_id;
      RETURN jsonb_build_object(
        'status', 'error',
        'error', 'The selected failed amount exceeds the remaining unposted advance balance.'
      );
    END IF;

    v_idempotency := 'down_payment_requests::' || v_source_id::text
      || '::retry_log_' || p_log_id::text;

    IF EXISTS (
      SELECT 1 FROM public.acct_journal_entries
      WHERE idempotency_key = v_idempotency AND status = 'posted'
    ) THEN
      UPDATE public.acct_gl_bridge_log
      SET resolved_at = now(), resolved_by = auth.uid()
      WHERE id = p_log_id;
      RETURN jsonb_build_object('status', 'skipped', 'message', 'This posting already exists.');
    END IF;

    DELETE FROM public.acct_journal_entries
    WHERE idempotency_key = v_idempotency AND status = 'draft';

    BEGIN
      SELECT fp.id INTO v_period_id
      FROM public.acct_fiscal_periods fp
      WHERE fp.status IN ('open', 'soft_closed')
        AND fp.start_date <= COALESCE(v_rec.updated_at::date, current_date)
        AND fp.end_date >= COALESCE(v_rec.updated_at::date, current_date)
      LIMIT 1;
      IF v_period_id IS NULL THEN
        SELECT fp.id INTO v_period_id
        FROM public.acct_fiscal_periods fp
        WHERE fp.status IN ('open', 'soft_closed')
        ORDER BY fp.start_date DESC
        LIMIT 1;
      END IF;
      IF v_period_id IS NULL THEN
        RAISE EXCEPTION 'No open fiscal period';
      END IF;

      SELECT COALESCE(
        (SELECT a.id FROM public.acct_accounts a
         WHERE a.code = '151000' AND a.is_postable = true
           AND a.country_id = v_rec.country_id
         ORDER BY a.created_at LIMIT 1),
        (SELECT a.id FROM public.acct_accounts a
         WHERE a.code = '151000' AND a.is_postable = true
         ORDER BY a.created_at LIMIT 1)
      ) INTO v_dr_acct_id;

      SELECT COALESCE(
        (SELECT a.id FROM public.acct_accounts a
         WHERE a.code = '120000' AND a.is_postable = true
           AND a.country_id = v_rec.country_id
         ORDER BY a.created_at LIMIT 1),
        (SELECT a.id FROM public.acct_accounts a
         WHERE a.code = '120000' AND a.is_postable = true
         ORDER BY a.created_at LIMIT 1)
      ) INTO v_cr_acct_id;

      IF v_dr_acct_id IS NULL OR v_cr_acct_id IS NULL THEN
        RAISE EXCEPTION 'Required accounts missing: 151000=% 120000=%',
          CASE WHEN v_dr_acct_id IS NULL THEN 'MISSING' ELSE 'ok' END,
          CASE WHEN v_cr_acct_id IS NULL THEN 'MISSING' ELSE 'ok' END;
      END IF;

      v_poster_id := COALESCE(v_rec.admin_processed_by, v_rec.requested_by);
      IF v_poster_id IS NULL THEN
        SELECT p.id INTO v_poster_id
        FROM public.profiles p
        WHERE lower(replace(coalesce(p.role, ''), ' ', '_')) IN ('super_admin', 'superadmin')
        ORDER BY p.created_at
        LIMIT 1;
      END IF;

      INSERT INTO public.acct_journal_entries (
        period_id, posting_date, description_en, description_ar,
        source_type, source_id, country_id, status, idempotency_key,
        posted_by, created_by
      ) VALUES (
        v_period_id,
        COALESCE(v_rec.updated_at::date, current_date),
        CASE WHEN v_rec.status = 'fully_paid'
          THEN 'Field Advance (Retro Full): ' || COALESCE(v_rec.site_name, v_source_id::text)
          ELSE 'Field Advance (Retro Partial): ' || COALESCE(v_rec.site_name, v_source_id::text)
        END,
        CASE WHEN v_rec.status = 'fully_paid'
          THEN 'سلفة ميدانية (إعادة ترحيل كاملة): ' || COALESCE(v_rec.site_name, v_source_id::text)
          ELSE 'سلفة ميدانية (إعادة ترحيل جزئية): ' || COALESCE(v_rec.site_name, v_source_id::text)
        END,
        v_source_table, v_source_id, v_rec.country_id, 'draft',
        v_idempotency, v_poster_id, v_poster_id
      ) RETURNING id INTO v_entry_id;

      INSERT INTO public.acct_journal_lines (
        entry_id, line_no, account_id, fund_id, debit_credit,
        functional_amount, original_amount, original_currency,
        functional_currency, fx_rate, function, description
      ) VALUES
        (v_entry_id, 1, v_dr_acct_id, v_fund_id, 'DR',
         v_post_amount, v_post_amount, 'SDG', 'SDG', 1.0, 'program',
         'Travel Advance (retro) — ' || COALESCE(v_rec.site_name, 'Field Site')),
        (v_entry_id, 2, v_cr_acct_id, v_fund_id, 'CR',
         v_post_amount, v_post_amount, 'SDG', 'SDG', 1.0, 'none',
         'Cash (retro) — Advance #' || v_source_id::text);

      UPDATE public.acct_journal_entries
      SET status = 'posted', posted_at = now()
      WHERE id = v_entry_id;

      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, journal_entry_id, amount)
      VALUES
        (v_source_table, v_source_id, v_event_type,
         'success', v_entry_id, v_post_amount);
      UPDATE public.acct_gl_bridge_log
      SET resolved_at = now(), resolved_by = auth.uid()
      WHERE id = p_log_id;

      RETURN jsonb_build_object(
        'status', 'success', 'journal_entry_id', v_entry_id, 'amount', v_post_amount
      );
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
      IF v_entry_id IS NOT NULL THEN
        DELETE FROM public.acct_journal_entries
        WHERE id = v_entry_id AND status = 'draft';
      END IF;
      UPDATE public.acct_gl_bridge_log
      SET error_message = v_error
      WHERE id = p_log_id;
      RETURN jsonb_build_object('status', 'error', 'error', v_error);
    END;
  END IF;

  -- Operational cost retry.
  SELECT ocs.* INTO v_rec
  FROM public.operational_cost_submissions ocs
  WHERE ocs.id = v_source_id
    AND ocs.status = 'paid';

  IF NOT FOUND THEN
    UPDATE public.acct_gl_bridge_log
    SET resolved_at = now(), resolved_by = auth.uid()
    WHERE id = p_log_id;
    RETURN jsonb_build_object('status', 'skipped', 'message', 'Operational cost is no longer payable.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.acct_gl_bridge_log l
    WHERE l.source_table = v_source_table
      AND l.source_id = v_source_id
      AND l.status = 'success'
  ) THEN
    UPDATE public.acct_gl_bridge_log
    SET resolved_at = now(), resolved_by = auth.uid()
    WHERE id = p_log_id;
    RETURN jsonb_build_object('status', 'skipped', 'message', 'This posting already exists.');
  END IF;

  v_amount := COALESCE(v_rec.paid_amount_cents, v_rec.amount_cents, 0) / 100.0;
  IF v_amount <= 0 THEN
    UPDATE public.acct_gl_bridge_log
    SET resolved_at = now(), resolved_by = auth.uid()
    WHERE id = p_log_id;
    RETURN jsonb_build_object('status', 'skipped', 'message', 'Operational cost has no paid amount.');
  END IF;

  v_idempotency := 'ocs::' || v_source_id::text || '::paid';
  IF EXISTS (
    SELECT 1 FROM public.acct_journal_entries
    WHERE idempotency_key IN (
      v_idempotency,
      'operational_cost_submissions::' || v_source_id::text || '::paid'
    ) AND status = 'posted'
  ) THEN
    UPDATE public.acct_gl_bridge_log
    SET resolved_at = now(), resolved_by = auth.uid()
    WHERE id = p_log_id;
    RETURN jsonb_build_object('status', 'skipped', 'message', 'This posting already exists.');
  END IF;

  BEGIN
    SELECT fp.id INTO v_period_id
    FROM public.acct_fiscal_periods fp
    WHERE fp.status IN ('open', 'soft_closed')
      AND fp.start_date <= COALESCE(v_rec.expense_date, v_rec.paid_at::date, current_date)
      AND fp.end_date >= COALESCE(v_rec.expense_date, v_rec.paid_at::date, current_date)
    LIMIT 1;
    IF v_period_id IS NULL THEN
      SELECT fp.id INTO v_period_id
      FROM public.acct_fiscal_periods fp
      WHERE fp.status IN ('open', 'soft_closed')
      ORDER BY fp.start_date DESC
      LIMIT 1;
    END IF;
    IF v_period_id IS NULL THEN
      RAISE EXCEPTION 'No open fiscal period';
    END IF;

    v_expense_code := public.acct_bridge_ops_cost_account(v_rec.expense_category);
    SELECT a.id INTO v_dr_acct_id
    FROM public.acct_accounts a
    WHERE a.code = v_expense_code
      AND a.is_postable = true
      AND (a.country_id = v_rec.country_id OR a.country_id IS NULL OR v_rec.country_id IS NULL)
    ORDER BY CASE WHEN a.country_id = v_rec.country_id THEN 0 ELSE 1 END, a.created_at
    LIMIT 1;

    IF v_dr_acct_id IS NULL THEN
      SELECT a.id INTO v_dr_acct_id
      FROM public.acct_accounts a
      WHERE a.code = '505000' AND a.is_postable = true
      ORDER BY a.created_at
      LIMIT 1;
    END IF;

    SELECT COALESCE(
      (SELECT a.id FROM public.acct_accounts a
       WHERE a.code = '120000' AND a.is_postable = true
         AND a.country_id = v_rec.country_id
       ORDER BY a.created_at LIMIT 1),
      (SELECT a.id FROM public.acct_accounts a
       WHERE a.code = '120000' AND a.is_postable = true
       ORDER BY a.created_at LIMIT 1)
    ) INTO v_cr_acct_id;

    IF v_dr_acct_id IS NULL OR v_cr_acct_id IS NULL THEN
      RAISE EXCEPTION 'Required accounts missing: DR=% CR 120000=%',
        CASE WHEN v_dr_acct_id IS NULL THEN 'MISSING' ELSE 'ok' END,
        CASE WHEN v_cr_acct_id IS NULL THEN 'MISSING' ELSE 'ok' END;
    END IF;

    v_poster_id := COALESCE(v_rec.tier2_approved_by, v_rec.tier1_approved_by);
    IF v_poster_id IS NULL THEN
      SELECT p.id INTO v_poster_id
      FROM public.profiles p
      WHERE lower(replace(coalesce(p.role, ''), ' ', '_')) IN ('super_admin', 'superadmin')
      ORDER BY p.created_at
      LIMIT 1;
    END IF;

    DELETE FROM public.acct_journal_entries
    WHERE idempotency_key = v_idempotency AND status = 'draft';

    INSERT INTO public.acct_journal_entries (
      period_id, posting_date, description_en, description_ar,
      source_type, source_id, country_id, status, idempotency_key,
      posted_by, created_by
    ) VALUES (
      v_period_id,
      COALESCE(v_rec.expense_date, v_rec.paid_at::date, current_date),
      'Operational Cost Paid: ' || COALESCE(v_rec.expense_category, 'general'),
      'تكلفة تشغيلية مدفوعة: ' || COALESCE(v_rec.expense_category, 'عامة'),
      v_source_table, v_source_id, v_rec.country_id, 'draft',
      v_idempotency, v_poster_id, v_poster_id
    ) RETURNING id INTO v_entry_id;

    INSERT INTO public.acct_journal_lines (
      entry_id, line_no, account_id, fund_id, debit_credit,
      functional_amount, original_amount, original_currency,
      functional_currency, fx_rate, function, description
    ) VALUES
      (v_entry_id, 1, v_dr_acct_id, v_fund_id, 'DR',
       v_amount, v_amount, COALESCE(v_rec.currency, 'SDG'), 'SDG', 1.0,
       'program', COALESCE(v_rec.description, v_rec.expense_category)),
      (v_entry_id, 2, v_cr_acct_id, v_fund_id, 'CR',
       v_amount, v_amount, COALESCE(v_rec.currency, 'SDG'), 'SDG', 1.0,
       'none', 'Cash Payment — Ops Cost #' || v_source_id::text);

    UPDATE public.acct_journal_entries
    SET status = 'posted', posted_at = now()
    WHERE id = v_entry_id;

    INSERT INTO public.acct_gl_bridge_log
      (source_table, source_id, event_type, status, journal_entry_id)
    VALUES
      (v_source_table, v_source_id, v_event_type, 'success', v_entry_id);
    UPDATE public.acct_gl_bridge_log
    SET resolved_at = now(), resolved_by = auth.uid()
    WHERE id = p_log_id;

    RETURN jsonb_build_object(
      'status', 'success', 'journal_entry_id', v_entry_id, 'amount', v_amount
    );
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    IF v_entry_id IS NOT NULL THEN
      DELETE FROM public.acct_journal_entries
      WHERE id = v_entry_id AND status = 'draft';
    END IF;
    UPDATE public.acct_gl_bridge_log
    SET error_message = v_error
    WHERE id = p_log_id;
    RETURN jsonb_build_object('status', 'error', 'error', v_error);
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.retry_gl_bridge_posting(uuid) TO authenticated;

COMMIT;