-- =============================================================================
-- Installment GL Posting for Field Advances
-- Date: 2026-08-20
--
-- Problem: acct_trig_down_payment_requests() only fired on status='fully_paid'.
-- Installment payments (status='partially_paid') were silently skipped.
--
-- Fix overview
-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Add amount column to acct_gl_bridge_log + backfill historical rows
--    Historical success logs have amount IS NULL. Backfill from journal_lines
--    so reconciliation works correctly for already-posted advances.
--
-- 1. Rewrite acct_trig_down_payment_requests()
--    Fires on total_paid_amount INCREASE (one JE per payment event).
--    Idempotency checks status='posted'; deletes orphaned drafts so a
--    failed mid-posting attempt is automatically retried on the next update.
--
-- 2. Rewrite post_downpayments_to_gl() retroactive RPC
--    Amount-based reconciliation: gap = total_paid_amount − posted_sum.
--    posted_sum uses log.amount when non-NULL, falls back to journal_lines
--    for historical logs where amount was NULL before this migration.
--    Posts only the gap — never the full amount — so double-posting is
--    impossible regardless of prior posting history.
--
-- Failure sequence this handles correctly:
--   installment 1 (100 SDG) → trigger ERROR  → log amount=100, status='error'
--   installment 2 ( 50 SDG) → trigger SUCCESS → log amount=50,  status='success'
--   RPC runs                → posted_sum=50, gap=100 → posts 100 ✓
--   RPC runs again          → posted_sum=150, gap=0  → skipped  ✓
--
-- Safe to re-run: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE + idempotent
-- backfill UPDATE throughout.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0a. Add amount tracking to the bridge log
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.acct_gl_bridge_log
  ADD COLUMN IF NOT EXISTS amount numeric(20,4);

-- ─────────────────────────────────────────────────────────────────────────────
-- 0b. Backfill amount for existing successful down_payment_requests log rows.
--     For every 'success' log that has a journal_entry_id but no amount yet,
--     set amount = sum of DR lines on that entry (= the debit = the installment amt).
--     This ensures the retroactive RPC's SUM(l.amount) is correct for historical
--     postings made before this migration was applied.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.acct_gl_bridge_log l
SET    amount = (
         SELECT COALESCE(SUM(jl.functional_amount), 0)
         FROM   public.acct_journal_lines jl
         WHERE  jl.entry_id     = l.journal_entry_id
           AND  jl.debit_credit = 'DR'
       )
WHERE  l.source_table      = 'down_payment_requests'
  AND  l.status            = 'success'
  AND  l.amount            IS NULL
  AND  l.journal_entry_id  IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. REWRITE acct_trig_down_payment_requests()
--    Fires when total_paid_amount INCREASES (one JE per payment event).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.acct_trig_down_payment_requests()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_id    uuid;
  v_period_id   uuid;
  v_fund_id     uuid;
  v_poster_id   uuid;
  v_amount      numeric(20,4);
  v_dr_acct_id  uuid;
  v_cr_acct_id  uuid;
  v_idempotency text;
  v_desc_en     text;
  v_desc_ar     text;
BEGIN
  IF tg_op <> 'UPDATE' THEN RETURN new; END IF;

  -- Detect a payment: total_paid_amount increased in this UPDATE
  v_amount := COALESCE(new.total_paid_amount, 0) - COALESCE(old.total_paid_amount, 0);
  IF v_amount <= 0 THEN RETURN new; END IF;

  -- Unique key: the new cumulative total after this payment.
  -- total_paid_amount increases monotonically → unique per payment event.
  v_idempotency := 'down_payment_requests::' || new.id::text || '::pmt_'
                || to_char(COALESCE(new.total_paid_amount, 0), 'FM999999999990.0000');

  -- Skip only if a fully POSTED entry already exists for this idempotency key.
  -- A 'draft' entry means a previous attempt failed mid-way; delete it so we
  -- can retry cleanly on this trigger firing.
  IF EXISTS (
    SELECT 1 FROM public.acct_journal_entries
    WHERE  idempotency_key = v_idempotency AND status = 'posted'
  ) THEN
    RETURN new;
  END IF;

  DELETE FROM public.acct_journal_entries
  WHERE  idempotency_key = v_idempotency AND status = 'draft';

  IF new.status = 'fully_paid' THEN
    v_desc_en := 'Field Advance Final Payment: '       || COALESCE(new.site_name, new.id::text);
    v_desc_ar := 'الدفعة الأخيرة للسلفة الميدانية: '  || COALESCE(new.site_name, new.id::text);
  ELSE
    v_desc_en := 'Field Advance Installment: '         || COALESCE(new.site_name, new.id::text);
    v_desc_ar := 'قسط سلفة ميدانية: '                  || COALESCE(new.site_name, new.id::text);
  END IF;

  BEGIN
    -- Fiscal period
    SELECT id INTO v_period_id
    FROM   public.acct_fiscal_periods
    WHERE  status IN ('open','soft_closed')
      AND  start_date <= current_date
      AND  end_date   >= current_date
    ORDER BY start_date DESC LIMIT 1;

    IF v_period_id IS NULL THEN
      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message, amount)
      VALUES
        ('down_payment_requests', new.id, 'installment_payment', 'error',
         'No open fiscal period for ' || current_date::text, v_amount);
      RETURN new;
    END IF;

    -- Fund
    SELECT id INTO v_fund_id FROM public.acct_funds
    WHERE  code = 'GENERAL' AND is_active = true LIMIT 1;
    IF v_fund_id IS NULL THEN
      SELECT id INTO v_fund_id FROM public.acct_funds
      WHERE  is_active = true ORDER BY created_at LIMIT 1;
    END IF;
    IF v_fund_id IS NULL THEN
      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message, amount)
      VALUES
        ('down_payment_requests', new.id, 'installment_payment', 'error',
         'No active fund', v_amount);
      RETURN new;
    END IF;

    -- Poster
    v_poster_id := COALESCE(new.admin_processed_by, new.requested_by);
    IF v_poster_id IS NULL THEN
      SELECT id INTO v_poster_id FROM public.profiles
      WHERE  lower(role) IN ('super_admin','superadmin') ORDER BY created_at LIMIT 1;
    END IF;

    -- Accounts (local-country first, then global fallback)
    SELECT id INTO v_dr_acct_id FROM public.acct_accounts
    WHERE  code = '1510' AND is_postable = true
      AND  (country_id = new.country_id OR country_id IS NULL)
    ORDER BY CASE WHEN country_id IS NOT NULL THEN 0 ELSE 1 END, created_at LIMIT 1;

    SELECT id INTO v_cr_acct_id FROM public.acct_accounts
    WHERE  code = '1200' AND is_postable = true
      AND  (country_id = new.country_id OR country_id IS NULL)
    ORDER BY CASE WHEN country_id IS NOT NULL THEN 0 ELSE 1 END, created_at LIMIT 1;

    IF v_dr_acct_id IS NULL OR v_cr_acct_id IS NULL THEN
      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message, amount)
      VALUES
        ('down_payment_requests', new.id, 'installment_payment', 'error',
         'Account not found — DR 1510: '
         || CASE WHEN v_dr_acct_id IS NULL THEN 'missing' ELSE 'ok' END
         || ', CR 1200: '
         || CASE WHEN v_cr_acct_id IS NULL THEN 'missing' ELSE 'ok' END,
         v_amount);
      RETURN new;
    END IF;

    -- Step 1: DRAFT entry
    INSERT INTO public.acct_journal_entries (
      period_id, posting_date, description_en, description_ar,
      source_type, source_id, country_id,
      status, idempotency_key, posted_by, created_by
    ) VALUES (
      v_period_id, current_date,
      v_desc_en, v_desc_ar,
      'down_payment_requests', new.id, new.country_id,
      'draft', v_idempotency, v_poster_id, v_poster_id
    )
    RETURNING id INTO v_entry_id;

    IF v_entry_id IS NULL THEN RETURN new; END IF;

    -- Step 2: Lines (allowed on draft)
    INSERT INTO public.acct_journal_lines (
      entry_id, line_no, account_id, fund_id, debit_credit,
      functional_amount, original_amount, original_currency, functional_currency, fx_rate,
      function, description
    ) VALUES
      (v_entry_id, 1, v_dr_acct_id, v_fund_id, 'DR',
       v_amount, v_amount, 'SDG', 'SDG', 1.0,
       'program',
       'Travel Advance — ' || COALESCE(new.site_name, 'Field Site')),
      (v_entry_id, 2, v_cr_acct_id, v_fund_id, 'CR',
       v_amount, v_amount, 'SDG', 'SDG', 1.0,
       'none',
       'Cash — Field Advance #' || new.id::text);

    -- Step 3: POST
    UPDATE public.acct_journal_entries
    SET    status = 'posted', posted_at = now()
    WHERE  id = v_entry_id;

    INSERT INTO public.acct_gl_bridge_log
      (source_table, source_id, event_type, status, journal_entry_id, amount)
    VALUES
      ('down_payment_requests', new.id, 'installment_payment', 'success',
       v_entry_id, v_amount);

  EXCEPTION WHEN OTHERS THEN
    -- On any unhandled error, remove the draft so the next trigger firing
    -- (e.g. once the fiscal-period issue is resolved) retries cleanly.
    IF v_entry_id IS NOT NULL THEN
      DELETE FROM public.acct_journal_entries WHERE id = v_entry_id AND status = 'draft';
    END IF;
    INSERT INTO public.acct_gl_bridge_log
      (source_table, source_id, event_type, status, error_message, amount)
    VALUES
      ('down_payment_requests', new.id, 'installment_payment', 'error',
       SQLERRM, v_amount);
  END;

  RETURN new;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. REWRITE post_downpayments_to_gl()
--    Amount-based reconciliation.  For each advance:
--      posted_sum = SUM of successful log amounts
--                   (fallback to journal_lines when log.amount IS NULL
--                    for rows written before this migration)
--      gap = total_paid_amount − posted_sum
--      if gap > 0.005 → post a reconciliation JE for the gap
--    Idempotency key includes total_paid_amount so a re-run after new
--    installments are collected posts the newly-accrued gap correctly.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.post_downpayments_to_gl()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_posted      int  := 0;
  v_skipped     int  := 0;
  v_errors      int  := 0;
  v_rec         RECORD;
  v_entry_id    uuid;
  v_period      RECORD;
  v_fund_id     uuid;
  v_poster_id   uuid;
  v_dr_acct_id  uuid;
  v_cr_acct_id  uuid;
  v_total_paid  numeric(20,4);
  v_posted_sum  numeric(20,4);
  v_gap         numeric(20,4);
  v_idempotency text;
  v_err_msg     text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE  id = auth.uid()
      AND  role IN ('super_admin','Admin','admin','finance','financialAdmin','accountant')
  ) THEN
    RETURN jsonb_build_object('error','Access denied: Finance or Admin role required.');
  END IF;

  -- Pre-fetch GENERAL fund
  SELECT id INTO v_fund_id FROM public.acct_funds
  WHERE  code = 'GENERAL' AND is_active = true LIMIT 1;
  IF v_fund_id IS NULL THEN
    SELECT id INTO v_fund_id FROM public.acct_funds
    WHERE  is_active = true ORDER BY created_at LIMIT 1;
  END IF;
  IF v_fund_id IS NULL THEN
    RETURN jsonb_build_object('error','No active fund found.');
  END IF;

  FOR v_rec IN
    SELECT dpr.*
    FROM   public.down_payment_requests dpr
    WHERE  dpr.status IN ('partially_paid', 'fully_paid')
      AND  COALESCE(dpr.total_paid_amount, 0) > 0
    ORDER BY dpr.updated_at
  LOOP
    v_total_paid := COALESCE(v_rec.total_paid_amount, 0);

    -- Sum of successfully journalled amounts for this advance.
    -- When log.amount IS NULL (rows written before this migration's backfill),
    -- fall back to the sum of DR lines on the referenced journal entry.
    -- This ensures correct reconciliation regardless of when the log row was created.
    SELECT COALESCE(SUM(
             CASE
               WHEN l.amount IS NOT NULL THEN l.amount
               WHEN l.journal_entry_id IS NOT NULL THEN (
                 SELECT COALESCE(SUM(jl.functional_amount), 0)
                 FROM   public.acct_journal_lines jl
                 WHERE  jl.entry_id     = l.journal_entry_id
                   AND  jl.debit_credit = 'DR'
               )
               ELSE 0
             END
           ), 0)
    INTO  v_posted_sum
    FROM  public.acct_gl_bridge_log l
    WHERE l.source_table = 'down_payment_requests'
      AND l.source_id    = v_rec.id
      AND l.status       = 'success';

    v_gap := v_total_paid - v_posted_sum;

    IF v_gap < 0.005 THEN
      -- Fully reconciled within rounding tolerance
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Idempotency key includes total_paid_amount: if more installments are
    -- paid later, the key changes and a fresh reconciliation can be run.
    v_idempotency := 'down_payment_requests::' || v_rec.id::text || '::reconcile_'
                  || to_char(v_total_paid, 'FM999999999990.0000');

    -- Skip if this exact reconciliation pass has already been posted
    IF EXISTS (
      SELECT 1 FROM public.acct_journal_entries
      WHERE  idempotency_key = v_idempotency AND status = 'posted'
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Remove any orphaned draft from a previous failed attempt
    DELETE FROM public.acct_journal_entries
    WHERE  idempotency_key = v_idempotency AND status = 'draft';

    BEGIN
      -- Fiscal period: try the record's date first, fall back to most-recent open
      SELECT fp.* INTO v_period
      FROM   public.acct_fiscal_periods fp
      WHERE  fp.status IN ('open','soft_closed')
        AND  fp.start_date <= COALESCE(v_rec.updated_at::date, current_date)
        AND  fp.end_date   >= COALESCE(v_rec.updated_at::date, current_date)
      LIMIT 1;

      IF v_period IS NULL THEN
        SELECT fp.* INTO v_period FROM public.acct_fiscal_periods fp
        WHERE  fp.status IN ('open','soft_closed') ORDER BY fp.start_date DESC LIMIT 1;
      END IF;

      IF v_period IS NULL THEN
        INSERT INTO public.acct_gl_bridge_log
          (source_table, source_id, event_type, status, error_message, amount)
        VALUES
          ('down_payment_requests', v_rec.id, 'installment_retroactive', 'skipped',
           'No open fiscal period', v_gap);
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      SELECT id INTO v_dr_acct_id FROM public.acct_accounts
      WHERE  code = '1510' AND is_postable = true
        AND  (country_id = v_rec.country_id OR country_id IS NULL)
      ORDER BY CASE WHEN country_id IS NOT NULL THEN 0 ELSE 1 END, created_at LIMIT 1;

      SELECT id INTO v_cr_acct_id FROM public.acct_accounts
      WHERE  code = '1200' AND is_postable = true
        AND  (country_id = v_rec.country_id OR country_id IS NULL)
      ORDER BY CASE WHEN country_id IS NOT NULL THEN 0 ELSE 1 END, created_at LIMIT 1;

      IF v_dr_acct_id IS NULL OR v_cr_acct_id IS NULL THEN
        INSERT INTO public.acct_gl_bridge_log
          (source_table, source_id, event_type, status, error_message, amount)
        VALUES
          ('down_payment_requests', v_rec.id, 'installment_retroactive', 'error',
           'Account 1510 ' || CASE WHEN v_dr_acct_id IS NULL THEN 'MISSING' ELSE 'ok' END
           || ', 1200 '    || CASE WHEN v_cr_acct_id IS NULL THEN 'MISSING' ELSE 'ok' END,
           v_gap);
        v_errors := v_errors + 1;
        CONTINUE;
      END IF;

      v_poster_id := COALESCE(v_rec.admin_processed_by, v_rec.requested_by);
      IF v_poster_id IS NULL THEN
        SELECT id INTO v_poster_id FROM public.profiles
        WHERE  lower(role) IN ('super_admin','superadmin') ORDER BY created_at LIMIT 1;
      END IF;

      -- DRAFT (gap amount only — never the full total)
      INSERT INTO public.acct_journal_entries (
        period_id, posting_date, description_en, description_ar,
        source_type, source_id, country_id,
        status, idempotency_key, posted_by, created_by
      ) VALUES (
        v_period.id,
        COALESCE(v_rec.updated_at::date, current_date),
        CASE v_rec.status
          WHEN 'fully_paid' THEN 'Field Advance (Retro Full): '    || COALESCE(v_rec.site_name, v_rec.id::text)
          ELSE                   'Field Advance (Retro Partial): ' || COALESCE(v_rec.site_name, v_rec.id::text)
        END,
        CASE v_rec.status
          WHEN 'fully_paid' THEN 'سلفة ميدانية (إعادة ترحيل كاملة): ' || COALESCE(v_rec.site_name, v_rec.id::text)
          ELSE                   'سلفة ميدانية (إعادة ترحيل جزئية): ' || COALESCE(v_rec.site_name, v_rec.id::text)
        END,
        'down_payment_requests', v_rec.id, v_rec.country_id,
        'draft', v_idempotency, v_poster_id, v_poster_id
      )
      RETURNING id INTO v_entry_id;

      IF v_entry_id IS NULL THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      -- Lines for the GAP only
      INSERT INTO public.acct_journal_lines (
        entry_id, line_no, account_id, fund_id, debit_credit,
        functional_amount, original_amount, original_currency, functional_currency, fx_rate,
        function, description
      ) VALUES
        (v_entry_id, 1, v_dr_acct_id, v_fund_id, 'DR',
         v_gap, v_gap, 'SDG', 'SDG', 1.0,
         'program',
         'Travel Advance (retro gap) — ' || COALESCE(v_rec.site_name, 'Field Site')),
        (v_entry_id, 2, v_cr_acct_id, v_fund_id, 'CR',
         v_gap, v_gap, 'SDG', 'SDG', 1.0,
         'none',
         'Cash (retro) — Advance #' || v_rec.id::text);

      UPDATE public.acct_journal_entries
      SET    status = 'posted', posted_at = now()
      WHERE  id = v_entry_id;

      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, journal_entry_id, amount)
      VALUES
        ('down_payment_requests', v_rec.id, 'installment_retroactive', 'success',
         v_entry_id, v_gap);

      v_posted := v_posted + 1;

    EXCEPTION WHEN OTHERS THEN
      v_err_msg := SQLERRM;
      IF v_entry_id IS NOT NULL THEN
        DELETE FROM public.acct_journal_entries WHERE id = v_entry_id AND status = 'draft';
      END IF;
      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message, amount)
      VALUES
        ('down_payment_requests', v_rec.id, 'installment_retroactive', 'error',
         v_err_msg, v_gap);
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('posted', v_posted, 'skipped', v_skipped, 'errors', v_errors);
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_downpayments_to_gl() TO authenticated;

COMMIT;
