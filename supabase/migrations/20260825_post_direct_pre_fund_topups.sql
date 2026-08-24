-- Direct Pre-Fund top-ups must leave the fund subledger and the posted GL in
-- lockstep.  This replaces the prior routine that recorded a successful bridge
-- event while the related journal remained a draft.

CREATE OR REPLACE FUNCTION public.record_direct_pre_fund_topup_rpc(
  p_fund_id UUID,
  p_amount NUMERIC,
  p_funding_source TEXT,
  p_reason TEXT,
  p_receipt_url TEXT,
  p_supporting_document_urls JSONB DEFAULT '[]'::jsonb,
  p_idempotency_key TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fund RECORD;
  v_existing_txn RECORD;
  v_existing_journal RECORD;
  v_receipt_account_id UUID;
  v_liability_account_id UUID;
  v_period_id UUID;
  v_accounting_fund_id UUID;
  v_active_accounting_fund_count INTEGER;
  v_country_id UUID;
  v_journal_entry_id UUID;
  v_transaction_id UUID;
  v_event_key TEXT;
  v_document_urls JSONB;
BEGIN
  PERFORM public._assert_direct_pre_fund_top_up_role();

  IF p_amount IS NULL
     OR p_amount::text IN ('NaN', 'Infinity', '-Infinity')
     OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Top-up amount must be finite and greater than zero.';
  END IF;
  IF NULLIF(BTRIM(p_funding_source), '') IS NULL THEN
    RAISE EXCEPTION 'Funding source is required.';
  END IF;
  IF NULLIF(BTRIM(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Top-up reason is required.';
  END IF;
  IF NULLIF(BTRIM(p_receipt_url), '') IS NULL THEN
    RAISE EXCEPTION 'A receipt or supporting document is required.';
  END IF;

  v_document_urls := COALESCE(p_supporting_document_urls, '[]'::jsonb);
  IF jsonb_typeof(v_document_urls) <> 'array' THEN
    RAISE EXCEPTION 'Supporting document references must be an array.';
  END IF;
  IF jsonb_array_length(v_document_urls) = 0 THEN
    v_document_urls := jsonb_build_array(p_receipt_url);
  END IF;

  v_event_key := NULLIF(BTRIM(p_idempotency_key), '');
  IF v_event_key IS NULL THEN
    RAISE EXCEPTION 'A top-up idempotency key is required.';
  END IF;
  v_event_key := 'direct-fund-topup:' || v_event_key;
  -- Serialise a same-key retry before checking historical evidence. The unique
  -- event key already prevents a duplicate row; this makes the concurrent
  -- caller receive the completed idempotent response instead of a unique-key
  -- error.
  PERFORM pg_advisory_xact_lock(hashtext('direct-pre-fund-topup:' || v_event_key));

  SELECT id, pre_fund_request_id
    INTO v_existing_txn
    FROM public.pre_fund_transactions
   WHERE idempotency_key = v_event_key;

  IF FOUND THEN
    IF v_existing_txn.pre_fund_request_id <> p_fund_id THEN
      RAISE EXCEPTION 'This top-up idempotency key is already assigned to another fund.';
    END IF;

    SELECT id, status
      INTO v_existing_journal
      FROM public.acct_journal_entries
     WHERE idempotency_key = 'pf-direct-topup:' || v_event_key
     LIMIT 1;

    IF NOT FOUND OR v_existing_journal.status <> 'posted' THEN
      RAISE EXCEPTION
        'This top-up has historical evidence but no posted journal. Resolve it through the Finance reconciliation workflow before retrying.';
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'transaction_id', v_existing_txn.id,
      'journal_entry_id', v_existing_journal.id
    );
  END IF;

  SELECT *
    INTO v_fund
    FROM public.pre_fund_requests
   WHERE id = p_fund_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fund not found.';
  END IF;

  BEGIN
    v_country_id := NULLIF(to_jsonb(v_fund) ->> 'country_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Fund country_id must be a valid country UUID.';
  END;

  IF v_fund.status NOT IN ('active', 'low_balance') THEN
    RAISE EXCEPTION 'Direct top-ups are only allowed for active or low-balance funds (current status="%").',
      v_fund.status;
  END IF;
  IF NULLIF(BTRIM(v_fund.gl_receipt_account), '') IS NULL
     OR NULLIF(BTRIM(v_fund.gl_liability_account), '') IS NULL THEN
    RAISE EXCEPTION 'Fund GL receipt/bank and donor-liability accounts must be configured before a direct top-up.';
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

  SELECT count(*)
    INTO v_active_accounting_fund_count
    FROM public.acct_funds
   WHERE is_active = true;
  IF v_active_accounting_fund_count <> 1 THEN
    RAISE EXCEPTION 'Exactly one active Accounting Fund must be configured for Pre-Fund top-up posting (found %).',
      v_active_accounting_fund_count;
  END IF;

  SELECT id INTO v_accounting_fund_id
    FROM public.acct_funds
   WHERE is_active = true;

  SELECT id
    INTO v_receipt_account_id
    FROM public.acct_accounts
   WHERE code = v_fund.gl_receipt_account
     AND is_active = true
     AND is_postable = true
     AND (country_id = v_country_id OR country_id IS NULL)
   ORDER BY CASE WHEN country_id = v_country_id THEN 0 ELSE 1 END
   LIMIT 1;

  SELECT id
    INTO v_liability_account_id
    FROM public.acct_accounts
   WHERE code = v_fund.gl_liability_account
     AND is_active = true
     AND is_postable = true
     AND (country_id = v_country_id OR country_id IS NULL)
   ORDER BY CASE WHEN country_id = v_country_id THEN 0 ELSE 1 END
   LIMIT 1;
  IF v_receipt_account_id IS NULL OR v_liability_account_id IS NULL THEN
    RAISE EXCEPTION 'Configured fund GL account is missing, inactive, non-postable, or unavailable for the fund country.';
  END IF;

  INSERT INTO public.pre_fund_transactions (
    pre_fund_request_id, transaction_type, amount, currency, reference,
    description, transaction_date, reconciled, created_by, receipt_url,
    idempotency_key, event_actor_id, event_reason, event_metadata
  ) VALUES (
    p_fund_id, 'receipt', p_amount, v_fund.currency,
    'DIRECT-TOPUP-' || upper(left(p_fund_id::text, 8)),
    'Direct fund-level top-up from ' || BTRIM(p_funding_source),
    CURRENT_DATE, false, auth.uid(), p_receipt_url,
    v_event_key, auth.uid(), BTRIM(p_reason),
    jsonb_build_object(
      'event_type', 'direct_fund_top_up',
      'funding_source', BTRIM(p_funding_source),
      'reason', BTRIM(p_reason),
      'supporting_document_urls', v_document_urls
    )
  ) RETURNING id INTO v_transaction_id;

  -- The journal remains draft only while its lines are being constructed.  The
  -- status transition below runs the existing balance/period guards before any
  -- fund balance or bridge success evidence is written.
  INSERT INTO public.acct_journal_entries (
    description_en, description_ar, posting_date, period_id, status,
    source_type, source_id, idempotency_key, created_by, country_id
  ) VALUES (
    'Pre-Fund Top-Up Received — ' || v_fund.name,
    'استلام تعبئة التمويل المسبق — ' || v_fund.name,
    CURRENT_DATE, v_period_id, 'draft',
    'pre_fund_transactions', v_transaction_id,
    'pf-direct-topup:' || v_event_key, auth.uid(), v_country_id
  ) RETURNING id INTO v_journal_entry_id;

  INSERT INTO public.acct_journal_lines (
    entry_id, line_no, account_id, fund_id, debit_credit,
    original_amount, original_currency, functional_amount, functional_currency,
    description, function
  ) VALUES
    (v_journal_entry_id, 1, v_receipt_account_id, v_accounting_fund_id, 'DR',
     p_amount, v_fund.currency, p_amount, v_fund.currency,
     'Pre-fund top-up receipt — ' || v_fund.name, 'program'),
    (v_journal_entry_id, 2, v_liability_account_id, v_accounting_fund_id, 'CR',
     p_amount, v_fund.currency, p_amount, v_fund.currency,
     'Pre-fund top-up deferred liability — ' || v_fund.name, 'program');

  UPDATE public.acct_journal_entries
     SET status = 'posted',
         posted_at = now(),
         posted_by = auth.uid()
   WHERE id = v_journal_entry_id
     AND status = 'draft';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unable to post the top-up journal.';
  END IF;

  INSERT INTO public.acct_gl_bridge_log (
    source_table, source_id, event_type, status, journal_entry_id
  ) VALUES (
    'pre_fund_transactions', v_transaction_id, 'pre_fund_direct_topup_received',
    'success', v_journal_entry_id
  );

  UPDATE public.pre_fund_requests
     SET amount = amount + p_amount,
         available_balance = available_balance + p_amount,
         status = CASE WHEN status = 'low_balance' THEN 'active' ELSE status END,
         updated_at = now()
   WHERE id = p_fund_id;

  PERFORM pg_notify('acct_journal_posted', v_journal_entry_id::text);

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'transaction_id', v_transaction_id,
    'journal_entry_id', v_journal_entry_id,
    'new_funded_amount', v_fund.amount + p_amount,
    'new_available_balance', v_fund.available_balance + p_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_direct_pre_fund_topup_rpc(UUID,NUMERIC,TEXT,TEXT,TEXT,JSONB,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_direct_pre_fund_topup_rpc(UUID,NUMERIC,TEXT,TEXT,TEXT,JSONB,TEXT) TO authenticated;