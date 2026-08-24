-- Repair the operational-cost bridge where a legacy trigger still uses 1200
-- while the account mapper and modern COA use six-digit codes.
-- This preserves existing account UUIDs and only creates standard global
-- accounts when neither the legacy nor canonical account exists.

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

  IF NOT EXISTS (SELECT 1 FROM public.acct_accounts WHERE code = '570000') THEN
    IF EXISTS (SELECT 1 FROM public.acct_accounts WHERE code = '5700') THEN
      UPDATE public.acct_accounts SET code = '570000' WHERE code = '5700';
    ELSE
      INSERT INTO public.acct_accounts (
        code, name_en, name_ar, account_type, subtype, parent_id, is_active, is_postable
      ) VALUES (
        '570000', 'Programme Vehicle & Fuel', 'مركبات ووقود البرنامج',
        'expense', 'program_expense',
        (SELECT id FROM public.acct_accounts
         WHERE code IN ('500000', '5000') AND country_id IS NULL
         ORDER BY CASE code WHEN '500000' THEN 0 ELSE 1 END
         LIMIT 1),
        true, true
      );
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.acct_bridge_ops_cost_account(p_category text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE p_category
    WHEN 'incentives'               THEN '507000'
    WHEN 'communications'           THEN '580000'
    WHEN 'training'                 THEN '532001'
    WHEN 'general_transport'        THEN '570000'
    WHEN 'equipment'                THEN '520001'
    WHEN 'printing'                 THEN '520001'
    WHEN 'meetings'                 THEN '532001'
    WHEN 'permits'                  THEN '631000'
    WHEN 'meals'                    THEN '531009'
    WHEN 'accommodation'            THEN '531009'
    WHEN 'fuel'                     THEN '570000'
    WHEN 'airfare'                  THEN '570000'
    WHEN 'taxi'                     THEN '570000'
    WHEN 'supplies'                 THEN '520001'
    WHEN 'office_supplies'          THEN '520001'
    WHEN 'professional_development' THEN '532001'
    WHEN 'medical'                  THEN '615000'
    ELSE '505000'
  END;
$$;

CREATE OR REPLACE FUNCTION public.acct_trig_operational_cost_submissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_id uuid;
  v_amount numeric(20,4);
  v_expense_acc text;
BEGIN
  IF NOT (
    tg_op = 'UPDATE'
    AND old.status IS DISTINCT FROM new.status
    AND new.status = 'paid'
  ) THEN
    RETURN new;
  END IF;

  v_amount := COALESCE(new.paid_amount_cents, new.amount_cents, 0) / 100.0;
  IF v_amount <= 0 THEN
    RETURN new;
  END IF;

  v_expense_acc := public.acct_bridge_ops_cost_account(new.expense_category);
  BEGIN
    v_entry_id := public.acct_bridge_post_journal(
      'operational_cost_submissions',
      new.id,
      'paid',
      COALESCE(new.expense_date, new.paid_at::date, current_date),
      'Operational Cost Paid: ' || COALESCE(new.expense_category, 'general'),
      'تكلفة تشغيلية مدفوعة: ' || COALESCE(new.expense_category, 'عامة'),
      jsonb_build_array(
        jsonb_build_object(
          'account_code', v_expense_acc,
          'debit_credit', 'DR',
          'amount', v_amount,
          'currency', COALESCE(new.currency, 'SDG'),
          'description', COALESCE(new.description, new.expense_category),
          'function', 'program'
        ),
        jsonb_build_object(
          'account_code', '120000',
          'debit_credit', 'CR',
          'amount', v_amount,
          'currency', COALESCE(new.currency, 'SDG'),
          'description', 'Cash Payment — Ops Cost #' || new.id::text,
          'function', 'none'
        )
      ),
      COALESCE(new.tier2_approved_by, new.tier1_approved_by, new.submitted_by),
      new.country_id
    );

    INSERT INTO public.acct_gl_bridge_log (
      source_table, source_id, event_type, status, journal_entry_id
    ) VALUES (
      'operational_cost_submissions', new.id, 'ops_cost_paid', 'success', v_entry_id
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.acct_gl_bridge_log (
      source_table, source_id, event_type, status, error_message
    ) VALUES (
      'operational_cost_submissions', new.id, 'ops_cost_paid', 'error', SQLERRM
    );
  END;

  RETURN new;
END;
$$;