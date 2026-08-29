-- Correct the amount of the latest direct fund top-up without rewriting or
-- deleting financial evidence. The original receipt and GL journal are fully
-- reversed, then a replacement receipt and journal are posted for the corrected
-- amount. The fund balance changes only by the difference.

CREATE OR REPLACE FUNCTION public.adjust_latest_direct_pre_fund_topup_rpc(
  p_expected_transaction_id UUID,
  p_corrected_amount NUMERIC,
  p_reason TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_original public.pre_fund_transactions%ROWTYPE;
  v_fund public.pre_fund_requests%ROWTYPE;
  v_existing_event RECORD;
  v_original_journal RECORD;
  v_latest_id UUID;
  v_period_id UUID;
  v_reversal_transaction_id UUID;
  v_replacement_transaction_id UUID;
  v_reversal_journal_id UUID;
  v_replacement_journal_id UUID;
  v_allocated_total NUMERIC;
  v_adjustment_amount NUMERIC;
  v_new_funded_amount NUMERIC;
  v_new_available_balance NUMERIC;
  v_original_line_count INTEGER;
BEGIN
  PERFORM public._assert_direct_pre_fund_top_up_role();

  IF p_expected_transaction_id IS NULL THEN
    RAISE EXCEPTION 'Select the latest direct fund top-up to adjust.';
  END IF;
  IF p_corrected_amount IS NULL
     OR p_corrected_amount::text IN ('NaN', 'Infinity', '-Infinity')
     OR p_corrected_amount <= 0 THEN
    RAISE EXCEPTION 'The corrected amount must be finite and greater than zero.';
  END IF;
  IF NULLIF(BTRIM(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required to adjust the latest direct fund top-up.';
  END IF;

  SELECT *
    INTO v_original
    FROM public.pre_fund_transactions
   WHERE id = p_expected_transaction_id
   FOR UPDATE;

  IF NOT FOUND
     OR v_original.transaction_type <> 'receipt'
     OR COALESCE(v_original.event_metadata ->> 'event_type', '') <> 'direct_fund_top_up'
     OR v_original.idempotency_key NOT LIKE 'direct-fund-topup:%' THEN
    RAISE EXCEPTION 'Only a direct fund-level top-up can be adjusted here. The original fund receipt cannot be changed.';
  END IF;
  IF p_corrected_amount >= v_original.amount THEN
    RAISE EXCEPTION 'The corrected amount must be less than the currently recorded top-up amount (% %).',
      v_original.amount, v_original.currency;
  END IF;

  SELECT replacement.id,
         replacement.amount,
         replacement.pre_fund_request_id
    INTO v_existing_event
    FROM public.pre_fund_transactions replacement
   WHERE replacement.event_metadata ->> 'adjusted_from_transaction_id' = v_original.id::text
     AND replacement.transaction_type = 'receipt'
   LIMIT 1;
  IF FOUND THEN
    SELECT *
      INTO v_fund
      FROM public.pre_fund_requests
     WHERE id = v_existing_event.pre_fund_request_id;
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'replacement_transaction_id', v_existing_event.id,
      'corrected_amount', v_existing_event.amount,
      'new_funded_amount', v_fund.amount,
      'new_available_balance', v_fund.available_balance
    );
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.pre_fund_transactions event
     WHERE event.reversal_of_id = v_original.id
  ) THEN
    RAISE EXCEPTION 'This direct fund top-up has already been reversed or adjusted.';
  END IF;

  SELECT *
    INTO v_fund
    FROM public.pre_fund_requests
   WHERE id = v_original.pre_fund_request_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The fund for this top-up no longer exists.';
  END IF;

  SELECT t.id
    INTO v_latest_id
    FROM public.pre_fund_transactions t
   WHERE t.pre_fund_request_id = v_original.pre_fund_request_id
     AND t.transaction_type = 'receipt'
     AND COALESCE(t.event_metadata ->> 'event_type', '') = 'direct_fund_top_up'
     AND NOT EXISTS (
       SELECT 1
         FROM public.pre_fund_transactions event
        WHERE event.reversal_of_id = t.id
     )
   ORDER BY t.occurred_at DESC, t.id DESC
   LIMIT 1;

  IF v_latest_id IS NULL THEN
    RAISE EXCEPTION 'There is no active direct top-up available to adjust.';
  END IF;
  IF v_latest_id <> v_original.id THEN
    RAISE EXCEPTION 'Only the latest direct fund top-up can be adjusted. Refresh Funding History and try again.';
  END IF;

  v_adjustment_amount := v_original.amount - p_corrected_amount;
  v_new_funded_amount := v_fund.amount - v_adjustment_amount;
  v_new_available_balance := v_fund.available_balance - v_adjustment_amount;

  IF v_new_funded_amount < 0 OR v_new_available_balance < 0 THEN
    RAISE EXCEPTION
      'The corrected amount is too low. Only % % remains available, so the top-up cannot be reduced by % %.',
      v_fund.available_balance, v_fund.currency, v_adjustment_amount, v_original.currency;
  END IF;
  IF v_new_funded_amount < COALESCE(v_fund.paid_amount, 0) + COALESCE(v_fund.committed_amount, 0) THEN
    RAISE EXCEPTION
      'The corrected amount is too low because the restored fund amount would be below paid and committed activity.';
  END IF;

  SELECT COALESCE(SUM(allocation.allocated_amount), 0)
    INTO v_allocated_total
    FROM public.pre_fund_allocations allocation
   WHERE allocation.pre_fund_request_id = v_fund.id;
  IF v_allocated_total > v_new_funded_amount THEN
    RAISE EXCEPTION
      'The corrected amount is too low because staff allocations (%) would exceed the restored fund amount (%).',
      v_allocated_total, v_new_funded_amount;
  END IF;

  SELECT *
    INTO v_original_journal
    FROM public.acct_journal_entries journal
   WHERE journal.source_type = 'pre_fund_transactions'
     AND journal.source_id = v_original.id
     AND journal.status = 'posted'
   ORDER BY journal.posted_at DESC NULLS LAST, journal.id DESC
   LIMIT 1
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The latest top-up has no posted GL journal. Resolve it through Finance reconciliation before adjusting it.';
  END IF;

  SELECT count(*)
    INTO v_original_line_count
    FROM public.acct_journal_lines
   WHERE entry_id = v_original_journal.id;
  IF v_original_line_count = 0 THEN
    RAISE EXCEPTION 'The latest top-up GL journal has no lines and cannot be adjusted automatically.';
  END IF;

  SELECT id
    INTO v_period_id
    FROM public.acct_fiscal_periods
   WHERE start_date <= CURRENT_DATE
     AND end_date >= CURRENT_DATE
     AND status = 'open'
   ORDER BY start_date DESC
   LIMIT 1;
  IF v_period_id IS NULL THEN
    RAISE EXCEPTION 'No open fiscal period exists for today.';
  END IF;

  INSERT INTO public.pre_fund_transactions (
    pre_fund_request_id,
    transaction_type,
    amount,
    currency,
    reference,
    description,
    transaction_date,
    created_by,
    receipt_url,
    idempotency_key,
    reversal_of_id,
    event_actor_id,
    event_reason,
    event_metadata
  ) VALUES (
    v_original.pre_fund_request_id,
    'reversal',
    v_original.amount,
    v_original.currency,
    'ADJ-REV-' || COALESCE(v_original.reference, left(v_original.id::text, 8)),
    'Amount correction reversal of direct fund top-up ' || v_original.id::text,
    CURRENT_DATE,
    v_actor_id,
    v_original.receipt_url,
    'direct-topup-adjustment-reversal:' || v_original.id::text,
    v_original.id,
    v_actor_id,
    BTRIM(p_reason),
    jsonb_build_object(
      'event_type', 'direct_fund_top_up_adjustment',
      'original_transaction_id', v_original.id,
      'original_amount', v_original.amount,
      'corrected_amount', p_corrected_amount,
      'adjustment_amount', v_adjustment_amount,
      'reason', BTRIM(p_reason)
    )
  ) RETURNING id INTO v_reversal_transaction_id;

  INSERT INTO public.pre_fund_transactions (
    pre_fund_request_id,
    transaction_type,
    amount,
    currency,
    reference,
    description,
    transaction_date,
    created_by,
    receipt_url,
    idempotency_key,
    event_actor_id,
    event_reason,
    event_metadata
  ) VALUES (
    v_original.pre_fund_request_id,
    'receipt',
    p_corrected_amount,
    v_original.currency,
    'ADJ-' || COALESCE(v_original.reference, left(v_original.id::text, 8)),
    'Corrected direct fund top-up replacing ' || v_original.id::text,
    CURRENT_DATE,
    v_actor_id,
    v_original.receipt_url,
    'direct-fund-topup:adjusted:' || v_original.id::text,
    v_actor_id,
    'direct_fund_top_up_adjusted',
    COALESCE(v_original.event_metadata, '{}'::jsonb) || jsonb_build_object(
      'event_type', 'direct_fund_top_up',
      'adjusted_from_transaction_id', v_original.id,
      'original_amount', v_original.amount,
      'corrected_amount', p_corrected_amount,
      'adjustment_amount', v_adjustment_amount,
      'adjustment_reason', BTRIM(p_reason)
    )
  ) RETURNING id INTO v_replacement_transaction_id;

  INSERT INTO public.acct_journal_entries (
    description_en, description_ar, posting_date, period_id, country_id,
    status, source_type, source_id, idempotency_key, created_by
  ) VALUES (
    'Amount Correction Reversal — Pre-Fund Top-Up — ' || v_fund.name,
    'عكس تصحيح مبلغ تعبئة التمويل المسبق — ' || v_fund.name,
    CURRENT_DATE, v_period_id, v_original_journal.country_id,
    'draft', 'pre_fund_transactions', v_reversal_transaction_id,
    'pf-direct-topup-adjustment-reversal:' || v_original.id::text, v_actor_id
  ) RETURNING id INTO v_reversal_journal_id;

  INSERT INTO public.acct_journal_lines (
    entry_id, line_no, account_id, fund_id, debit_credit,
    original_amount, original_currency, functional_amount, functional_currency,
    description, function
  )
  SELECT
    v_reversal_journal_id,
    line.line_no,
    line.account_id,
    line.fund_id,
    CASE line.debit_credit WHEN 'DR' THEN 'CR' WHEN 'CR' THEN 'DR' ELSE line.debit_credit END,
    line.original_amount,
    line.original_currency,
    line.functional_amount,
    line.functional_currency,
    'Amount correction reversal — ' || COALESCE(line.description, 'direct pre-fund top-up'),
    line.function
  FROM public.acct_journal_lines line
  WHERE line.entry_id = v_original_journal.id
  ORDER BY line.line_no, line.id;

  INSERT INTO public.acct_journal_entries (
    description_en, description_ar, posting_date, period_id, country_id,
    status, source_type, source_id, idempotency_key, created_by
  ) VALUES (
    'Corrected Pre-Fund Top-Up — ' || v_fund.name,
    'تعبئة مصححة للتمويل المسبق — ' || v_fund.name,
    CURRENT_DATE, v_period_id, v_original_journal.country_id,
    'draft', 'pre_fund_transactions', v_replacement_transaction_id,
    'pf-direct-topup-adjusted:' || v_original.id::text, v_actor_id
  ) RETURNING id INTO v_replacement_journal_id;

  INSERT INTO public.acct_journal_lines (
    entry_id, line_no, account_id, fund_id, debit_credit,
    original_amount, original_currency, functional_amount, functional_currency,
    description, function
  )
  SELECT
    v_replacement_journal_id,
    line.line_no,
    line.account_id,
    line.fund_id,
    line.debit_credit,
    CASE
      WHEN line.original_amount IS NULL THEN NULL
      ELSE line.original_amount * p_corrected_amount / v_original.amount
    END,
    line.original_currency,
    CASE
      WHEN line.functional_amount IS NULL THEN NULL
      ELSE line.functional_amount * p_corrected_amount / v_original.amount
    END,
    line.functional_currency,
    'Corrected amount — ' || COALESCE(line.description, 'direct pre-fund top-up'),
    line.function
  FROM public.acct_journal_lines line
  WHERE line.entry_id = v_original_journal.id
  ORDER BY line.line_no, line.id;

  UPDATE public.acct_journal_entries
     SET status = 'posted', posted_at = now(), posted_by = v_actor_id
   WHERE id IN (v_reversal_journal_id, v_replacement_journal_id)
     AND status = 'draft';

  IF (SELECT count(*) FROM public.acct_journal_entries
      WHERE id IN (v_reversal_journal_id, v_replacement_journal_id)
        AND status = 'posted') <> 2 THEN
    RAISE EXCEPTION 'Unable to post both direct top-up adjustment journals.';
  END IF;

  INSERT INTO public.acct_gl_bridge_log (
    source_table, source_id, event_type, status, journal_entry_id
  ) VALUES
    (
      'pre_fund_transactions', v_reversal_transaction_id,
      'pre_fund_direct_topup_adjustment_reversal', 'success', v_reversal_journal_id
    ),
    (
      'pre_fund_transactions', v_replacement_transaction_id,
      'pre_fund_direct_topup_adjusted', 'success', v_replacement_journal_id
    );

  UPDATE public.pre_fund_requests
     SET amount = v_new_funded_amount,
         available_balance = v_new_available_balance,
         updated_at = now()
   WHERE id = v_fund.id;

  PERFORM pg_notify('acct_journal_posted', v_reversal_journal_id::text);
  PERFORM pg_notify('acct_journal_posted', v_replacement_journal_id::text);

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'fund_id', v_fund.id,
    'original_amount', v_original.amount,
    'corrected_amount', p_corrected_amount,
    'adjustment_amount', v_adjustment_amount,
    'new_funded_amount', v_new_funded_amount,
    'new_available_balance', v_new_available_balance,
    'reversal_transaction_id', v_reversal_transaction_id,
    'replacement_transaction_id', v_replacement_transaction_id,
    'reversal_journal_id', v_reversal_journal_id,
    'replacement_journal_id', v_replacement_journal_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_latest_direct_pre_fund_topup_rpc(UUID,NUMERIC,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_latest_direct_pre_fund_topup_rpc(UUID,NUMERIC,TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';