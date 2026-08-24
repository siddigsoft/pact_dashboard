-- Repair the legacy Down Payment GL bridge, which still searched for 1510/1200
-- after the chart of accounts was standardized to six-digit codes.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.acct_accounts WHERE code = '120000') THEN
    IF EXISTS (SELECT 1 FROM public.acct_accounts WHERE code = '1200') THEN
      UPDATE public.acct_accounts SET code = '120000' WHERE code = '1200';
    ELSE
      INSERT INTO public.acct_accounts (
        code, name_en, name_ar, account_type, subtype, is_active, is_postable
      ) VALUES (
        '120000', 'Cash at Bank', 'نقد لدى البنك',
        'asset', 'current_asset', true, true
      );
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.acct_accounts WHERE code = '151000') THEN
    IF EXISTS (SELECT 1 FROM public.acct_accounts WHERE code = '1510') THEN
      UPDATE public.acct_accounts SET code = '151000' WHERE code = '1510';
    ELSE
      INSERT INTO public.acct_accounts (
        code, name_en, name_ar, account_type, subtype, parent_id, is_active, is_postable
      ) VALUES (
        '151000', 'Travel Advances', 'سلف السفر',
        'asset', 'current_asset',
        (SELECT id FROM public.acct_accounts
         WHERE code IN ('150000', '1500') AND country_id IS NULL
         ORDER BY CASE code WHEN '150000' THEN 0 ELSE 1 END
         LIMIT 1),
        true, true
      );
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.acct_trig_down_payment_requests()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_id uuid;
  v_period_id uuid;
  v_fund_id uuid;
  v_poster_id uuid;
  v_amount numeric(20,4);
  v_dr_acct_id uuid;
  v_cr_acct_id uuid;
  v_idempotency text;
BEGIN
  IF NOT (
    tg_op = 'UPDATE'
    AND old.status IS DISTINCT FROM new.status
    AND new.status = 'fully_paid'
  ) THEN
    RETURN new;
  END IF;

  v_amount := COALESCE(new.total_paid_amount, new.requested_amount, 0);
  IF v_amount <= 0 THEN
    RETURN new;
  END IF;

  v_idempotency := 'down_payment_requests::' || new.id::text || '::fully_paid';
  IF EXISTS (
    SELECT 1 FROM public.acct_journal_entries
    WHERE idempotency_key = v_idempotency
  ) THEN
    RETURN new;
  END IF;

  BEGIN
    SELECT id INTO v_period_id
    FROM public.acct_fiscal_periods
    WHERE status IN ('open', 'soft_closed')
      AND start_date <= current_date
      AND end_date >= current_date
    ORDER BY start_date DESC
    LIMIT 1;

    IF v_period_id IS NULL THEN
      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message)
      VALUES (
        'down_payment_requests', new.id, 'down_payment_fully_paid', 'error',
        'No open fiscal period for ' || current_date::text
      );
      RETURN new;
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
      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message)
      VALUES (
        'down_payment_requests', new.id, 'down_payment_fully_paid',
        'error', 'No active fund found'
      );
      RETURN new;
    END IF;

    v_poster_id := COALESCE(new.admin_processed_by, new.requested_by);
    IF v_poster_id IS NULL THEN
      SELECT id INTO v_poster_id
      FROM public.profiles
      WHERE lower(role) IN ('super_admin', 'superadmin')
      ORDER BY created_at
      LIMIT 1;
    END IF;

    SELECT id INTO v_dr_acct_id
    FROM public.acct_accounts
    WHERE code = '151000'
      AND is_active = true
      AND is_postable = true
      AND (country_id = new.country_id OR country_id IS NULL)
    ORDER BY CASE WHEN country_id = new.country_id THEN 0 ELSE 1 END, created_at
    LIMIT 1;

    SELECT id INTO v_cr_acct_id
    FROM public.acct_accounts
    WHERE code = '120000'
      AND is_active = true
      AND is_postable = true
      AND (country_id = new.country_id OR country_id IS NULL)
    ORDER BY CASE WHEN country_id = new.country_id THEN 0 ELSE 1 END, created_at
    LIMIT 1;

    IF v_dr_acct_id IS NULL OR v_cr_acct_id IS NULL THEN
      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message)
      VALUES (
        'down_payment_requests', new.id, 'down_payment_fully_paid', 'error',
        'Account not found — DR 151000: '
        || CASE WHEN v_dr_acct_id IS NULL THEN 'missing' ELSE 'ok' END
        || ', CR 120000: '
        || CASE WHEN v_cr_acct_id IS NULL THEN 'missing' ELSE 'ok' END
        || '. Add these accounts in the Chart of Accounts first.'
      );
      RETURN new;
    END IF;

    INSERT INTO public.acct_journal_entries (
      period_id, posting_date, description_en, description_ar,
      source_type, source_id, country_id, status, idempotency_key,
      posted_by, created_by
    ) VALUES (
      v_period_id, current_date,
      'Field Advance Disbursed: ' || COALESCE(new.site_name, new.id::text),
      'صرف سلفة ميدانية: ' || COALESCE(new.site_name, new.id::text),
      'down_payment_requests', new.id, new.country_id, 'draft',
      v_idempotency, v_poster_id, v_poster_id
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_entry_id;

    IF v_entry_id IS NULL THEN
      RETURN new;
    END IF;

    INSERT INTO public.acct_journal_lines (
      entry_id, line_no, account_id, fund_id, debit_credit,
      functional_amount, original_amount, original_currency,
      functional_currency, fx_rate, function, description
    ) VALUES
      (v_entry_id, 1, v_dr_acct_id, v_fund_id, 'DR',
       v_amount, v_amount, 'SDG', 'SDG', 1.0, 'program',
       'Travel Advance — ' || COALESCE(new.site_name, 'Field Site')),
      (v_entry_id, 2, v_cr_acct_id, v_fund_id, 'CR',
       v_amount, v_amount, 'SDG', 'SDG', 1.0, 'none',
       'Cash — Field Advance #' || new.id::text);

    UPDATE public.acct_journal_entries
    SET status = 'posted', posted_at = now()
    WHERE id = v_entry_id;

    INSERT INTO public.acct_gl_bridge_log (
      source_table, source_id, event_type, status, journal_entry_id
    ) VALUES (
      'down_payment_requests', new.id, 'down_payment_fully_paid',
      'success', v_entry_id
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.acct_gl_bridge_log (
      source_table, source_id, event_type, status, error_message
    ) VALUES (
      'down_payment_requests', new.id, 'down_payment_fully_paid',
      'error', SQLERRM
    );
  END;

  RETURN new;
END;
$$;