-- Complete per-source payment history plus an authorized, newest-first physical
-- deletion path. The active financial rows are removed, but a full immutable
-- audit snapshot survives independently.

CREATE TABLE IF NOT EXISTS public.payment_event_delete_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_event_id UUID NOT NULL,
  source_table TEXT NOT NULL CHECK (source_table IN ('down_payment_requests', 'operational_cost_submissions')),
  source_id UUID NOT NULL,
  fund_id UUID,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL,
  payment_date DATE,
  receipt_url TEXT,
  reference TEXT,
  description TEXT,
  recorded_by UUID,
  recorded_at TIMESTAMPTZ,
  deleted_by UUID NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deletion_reason TEXT NOT NULL CHECK (length(btrim(deletion_reason)) >= 5),
  payment_snapshot JSONB NOT NULL,
  source_before_snapshot JSONB NOT NULL,
  source_after_snapshot JSONB,
  fund_snapshot JSONB,
  fund_after_snapshot JSONB,
  wallet_snapshots JSONB NOT NULL DEFAULT '[]'::jsonb,
  journal_snapshots JSONB NOT NULL DEFAULT '[]'::jsonb,
  journal_line_snapshots JSONB NOT NULL DEFAULT '[]'::jsonb,
  bridge_snapshots JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_event_delete_audit_event
  ON public.payment_event_delete_audit(payment_event_id);
CREATE INDEX IF NOT EXISTS idx_payment_event_delete_audit_source
  ON public.payment_event_delete_audit(source_table, source_id, deleted_at DESC);

ALTER TABLE public.payment_event_delete_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_event_delete_audit_finance_read ON public.payment_event_delete_audit;
CREATE POLICY payment_event_delete_audit_finance_read
  ON public.payment_event_delete_audit FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND regexp_replace(lower(trim(p.role)), '[^a-z]', '', 'g')
          IN ('admin', 'administrator', 'finance', 'financeadmin', 'financialadmin', 'accountant', 'superadmin')
    )
  );
REVOKE INSERT, UPDATE, DELETE ON public.payment_event_delete_audit FROM authenticated;
GRANT SELECT ON public.payment_event_delete_audit TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_payment_delete_audit_immutable()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Payment deletion audit records are immutable.';
END;
$$;
DROP TRIGGER IF EXISTS trg_payment_delete_audit_immutable ON public.payment_event_delete_audit;
CREATE TRIGGER trg_payment_delete_audit_immutable
  BEFORE UPDATE OR DELETE ON public.payment_event_delete_audit
  FOR EACH ROW EXECUTE FUNCTION public.guard_payment_delete_audit_immutable();

-- Keep the general ledger immutable; only this SECURITY DEFINER transaction may
-- physically remove a payment event after its complete snapshot is secured.
CREATE OR REPLACE FUNCTION public.pre_fund_guard_event_immutability()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('app.authorized_payment_hard_delete', true) = 'on'
       AND current_user NOT IN ('authenticated', 'anon') THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Pre-fund payment events are immutable. Create a reversal event instead.';
  END IF;
  IF (to_jsonb(OLD) - ARRAY['reconciled', 'reconciled_at'])
     IS DISTINCT FROM
     (to_jsonb(NEW) - ARRAY['reconciled', 'reconciled_at']) THEN
    RAISE EXCEPTION 'Pre-fund payment events are immutable. Only reconciliation status may be updated.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_latest_source_payment_rpc(
  p_payment_event_id UUID,
  p_reason TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_role TEXT;
  v_payment public.pre_fund_transactions%ROWTYPE;
  v_latest UUID;
  v_source_before JSONB;
  v_source_after JSONB;
  v_fund_before JSONB;
  v_fund_after JSONB;
  v_wallets JSONB;
  v_journals JSONB;
  v_lines JSONB;
  v_bridges JSONB;
  v_wallet_ids UUID[];
  v_journal_ids UUID[];
  v_remaining_paid NUMERIC := 0;
  v_due NUMERIC := 0;
  v_latest_remaining UUID;
  v_latest_receipt TEXT;
  v_latest_notes TEXT;
  v_latest_at TIMESTAMPTZ;
  v_paid NUMERIC;
  v_available NUMERIC;
  v_wallet RECORD;
  v_wallet_effect_cents BIGINT;
BEGIN
  SELECT regexp_replace(lower(trim(role)), '[^a-z]', '', 'g')
    INTO v_role FROM public.profiles WHERE id = v_actor;
  IF v_role NOT IN ('admin', 'administrator', 'finance', 'financeadmin', 'financialadmin', 'accountant', 'superadmin') THEN
    RAISE EXCEPTION 'Only Admin, Finance, or Super Admin may delete payments.';
  END IF;
  IF p_payment_event_id IS NULL OR length(btrim(coalesce(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'A deletion reason of at least 5 characters is required.';
  END IF;

  SELECT * INTO v_payment
  FROM public.pre_fund_transactions
  WHERE id = p_payment_event_id
    AND transaction_type = 'payment'
    AND source_table IN ('down_payment_requests', 'operational_cost_submissions')
    AND source_id IS NOT NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active source payment not found.'; END IF;
  IF EXISTS (SELECT 1 FROM public.pre_fund_transactions WHERE reversal_of_id = v_payment.id) THEN
    RAISE EXCEPTION 'A reversed payment is historical evidence and cannot be physically deleted.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.pre_fund_finance_exception_decisions d
    WHERE d.transaction_id = v_payment.id OR d.correction_transaction_id = v_payment.id
  ) THEN
    RAISE EXCEPTION 'This payment is referenced by a Finance exception decision and cannot be physically deleted.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_payment.source_table || ':' || v_payment.source_id::text, 0));
  SELECT t.id INTO v_latest
  FROM public.pre_fund_transactions t
  WHERE t.source_table = v_payment.source_table AND t.source_id = v_payment.source_id
    AND t.transaction_type = 'payment'
    AND NOT EXISTS (SELECT 1 FROM public.pre_fund_transactions r WHERE r.reversal_of_id = t.id)
  ORDER BY t.occurred_at DESC NULLS LAST, t.created_at DESC NULLS LAST, t.id DESC
  LIMIT 1;
  IF v_latest IS DISTINCT FROM v_payment.id THEN
    RAISE EXCEPTION 'Only the newest payment for this request can be deleted. Refresh payment history and try again.';
  END IF;

  IF v_payment.source_table = 'down_payment_requests' THEN
    SELECT to_jsonb(d) INTO v_source_before FROM public.down_payment_requests d WHERE id = v_payment.source_id FOR UPDATE;
  ELSE
    SELECT to_jsonb(o) INTO v_source_before FROM public.operational_cost_submissions o WHERE id = v_payment.source_id FOR UPDATE;
  END IF;
  IF v_source_before IS NULL THEN RAISE EXCEPTION 'Payment source no longer exists.'; END IF;
  SELECT to_jsonb(f) INTO v_fund_before FROM public.pre_fund_requests f WHERE id = v_payment.pre_fund_request_id FOR UPDATE;

  SELECT coalesce(array_agg(w.id), '{}'::uuid[]), coalesce(jsonb_agg(to_jsonb(w)), '[]'::jsonb)
    INTO v_wallet_ids, v_wallets
  FROM public.wallet_transactions w
  WHERE w.metadata ->> 'pre_fund_transaction_id' = v_payment.id::text
     OR w.metadata ->> 'pre_fund_payment_event_key' = v_payment.idempotency_key;

  SELECT coalesce(array_agg(j.id), '{}'::uuid[]), coalesce(jsonb_agg(to_jsonb(j)), '[]'::jsonb)
    INTO v_journal_ids, v_journals
  FROM public.acct_journal_entries j
  WHERE j.source_type = 'pre_fund_transactions' AND j.source_id = v_payment.id;
  SELECT coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) INTO v_lines
  FROM public.acct_journal_lines l WHERE l.entry_id = ANY(v_journal_ids);
  SELECT coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) INTO v_bridges
  FROM public.acct_gl_bridge_log b
  WHERE (b.source_table = 'pre_fund_transactions' AND b.source_id = v_payment.id)
     OR b.journal_entry_id = ANY(v_journal_ids);

  INSERT INTO public.payment_event_delete_audit (
    payment_event_id, source_table, source_id, fund_id, amount, currency,
    payment_date, receipt_url, reference, description, recorded_by, recorded_at,
    deleted_by, deletion_reason, payment_snapshot, source_before_snapshot,
    fund_snapshot, wallet_snapshots, journal_snapshots, journal_line_snapshots, bridge_snapshots
  ) VALUES (
    v_payment.id, v_payment.source_table, v_payment.source_id, v_payment.pre_fund_request_id,
    v_payment.amount, v_payment.currency, v_payment.transaction_date, v_payment.receipt_url,
    v_payment.reference, v_payment.description, v_payment.created_by,
    coalesce(v_payment.occurred_at, v_payment.created_at), v_actor, btrim(p_reason),
    to_jsonb(v_payment), v_source_before, v_fund_before, v_wallets, v_journals, v_lines, v_bridges
  );

  DELETE FROM public.acct_gl_bridge_log
  WHERE (source_table = 'pre_fund_transactions' AND source_id = v_payment.id)
     OR journal_entry_id = ANY(v_journal_ids);
  DELETE FROM public.acct_journal_lines WHERE entry_id = ANY(v_journal_ids);
  DELETE FROM public.acct_journal_entries WHERE id = ANY(v_journal_ids);
  FOR v_wallet IN
    SELECT * FROM public.wallet_transactions WHERE id = ANY(v_wallet_ids) AND status = 'posted'
  LOOP
    v_wallet_effect_cents := CASE
      WHEN v_wallet.amount_cents < 0 THEN v_wallet.amount_cents
      WHEN v_wallet.type IN ('withdrawal', 'adjustment_debit', 'penalty') THEN -abs(v_wallet.amount_cents)
      ELSE abs(v_wallet.amount_cents)
    END;
    UPDATE public.wallets
    SET balance_cents = coalesce(balance_cents, 0) - v_wallet_effect_cents,
        total_earned_cents = CASE
          WHEN v_wallet_effect_cents > 0 THEN greatest(coalesce(total_earned_cents, 0) - abs(v_wallet_effect_cents), 0)
          ELSE total_earned_cents END,
        total_paid_out_cents = CASE
          WHEN v_wallet_effect_cents < 0 THEN greatest(coalesce(total_paid_out_cents, 0) - abs(v_wallet_effect_cents), 0)
          ELSE total_paid_out_cents END,
        total_earned = CASE
          WHEN v_wallet_effect_cents > 0 THEN greatest(coalesce(total_earned, 0) - abs(v_wallet_effect_cents)::numeric / 100, 0)
          ELSE total_earned END,
        total_withdrawn = CASE
          WHEN v_wallet_effect_cents < 0 THEN greatest(coalesce(total_withdrawn, 0) - abs(v_wallet_effect_cents)::numeric / 100, 0)
          ELSE total_withdrawn END,
        balances = jsonb_set(coalesce(balances, '{}'::jsonb), ARRAY[coalesce(v_wallet.currency, 'SDG')],
          to_jsonb((coalesce(balance_cents, 0) - v_wallet_effect_cents)::numeric / 100), true),
        updated_at = now()
    WHERE id = v_wallet.wallet_id;
  END LOOP;
  DELETE FROM public.wallet_transactions WHERE id = ANY(v_wallet_ids);
  PERFORM set_config('app.authorized_payment_hard_delete', 'on', true);
  DELETE FROM public.pre_fund_transactions WHERE id = v_payment.id;

  SELECT coalesce(sum(t.amount), 0) INTO v_remaining_paid
  FROM public.pre_fund_transactions t
  WHERE t.source_table = v_payment.source_table AND t.source_id = v_payment.source_id
    AND t.transaction_type = 'payment'
    AND NOT EXISTS (SELECT 1 FROM public.pre_fund_transactions r WHERE r.reversal_of_id = t.id);
  SELECT t.id, t.receipt_url, t.description, coalesce(t.occurred_at, t.created_at)
    INTO v_latest_remaining, v_latest_receipt, v_latest_notes, v_latest_at
  FROM public.pre_fund_transactions t
  WHERE t.source_table = v_payment.source_table AND t.source_id = v_payment.source_id
    AND t.transaction_type = 'payment'
    AND NOT EXISTS (SELECT 1 FROM public.pre_fund_transactions r WHERE r.reversal_of_id = t.id)
  ORDER BY t.occurred_at DESC NULLS LAST, t.created_at DESC NULLS LAST, t.id DESC LIMIT 1;

  PERFORM set_config('app.pre_fund_payment_rpc', 'on', true);
  IF v_payment.source_table = 'down_payment_requests' THEN
    v_due := coalesce(nullif((v_source_before ->> 'approved_amount')::numeric, 0),
      nullif((v_source_before -> 'metadata' ->> 'approved_amount')::numeric, 0),
      (v_source_before ->> 'requested_amount')::numeric, 0);
    UPDATE public.down_payment_requests
    SET total_paid_amount = v_remaining_paid,
        remaining_amount = greatest(v_due - v_remaining_paid, 0),
        status = CASE WHEN v_remaining_paid <= 0 THEN 'approved'
                      WHEN v_remaining_paid >= v_due THEN 'fully_paid' ELSE 'partially_paid' END,
        fully_paid_at = CASE WHEN v_remaining_paid >= v_due THEN fully_paid_at ELSE NULL END,
        pre_fund_transaction_id = v_latest_remaining,
        wallet_transaction_ids = coalesce((
          SELECT jsonb_agg(value) FROM jsonb_array_elements(coalesce(wallet_transaction_ids, '[]'::jsonb))
          WHERE value #>> '{}' <> ALL(coalesce(v_wallet_ids::text[], '{}'::text[]))
        ), '[]'::jsonb),
        payment_proof_url = v_latest_receipt,
        payment_proof_notes = v_latest_notes,
        payment_proof_uploaded_at = v_latest_at,
        updated_at = now()
    WHERE id = v_payment.source_id;
    SELECT to_jsonb(d) INTO v_source_after FROM public.down_payment_requests d WHERE id = v_payment.source_id;
  ELSE
    v_due := coalesce((v_source_before ->> 'amount_cents')::numeric, 0) / 100;
    UPDATE public.operational_cost_submissions
    SET amount_paid_cents = round(v_remaining_paid * 100),
        status = CASE WHEN v_remaining_paid <= 0 THEN 'approved'
                      WHEN v_remaining_paid >= v_due THEN 'paid' ELSE 'partially_paid' END,
        paid_at = CASE WHEN v_remaining_paid > 0 THEN v_latest_at ELSE NULL END,
        paid_by = CASE WHEN v_remaining_paid > 0 THEN paid_by ELSE NULL END,
        pre_fund_transaction_id = v_latest_remaining,
        wallet_transaction_id = CASE WHEN wallet_transaction_id = ANY(v_wallet_ids) THEN NULL ELSE wallet_transaction_id END,
        payment_proof_url = v_latest_receipt,
        payment_proof_notes = v_latest_notes,
        payment_proof_uploaded_at = v_latest_at,
        updated_at = now()
    WHERE id = v_payment.source_id;
    SELECT to_jsonb(o) INTO v_source_after FROM public.operational_cost_submissions o WHERE id = v_payment.source_id;
  END IF;

  SELECT verified_paid_amount, verified_available_balance INTO v_paid, v_available
  FROM public.pre_fund_balance_snapshot_v WHERE fund_id = v_payment.pre_fund_request_id;
  UPDATE public.pre_fund_requests
  SET paid_amount = coalesce(v_paid, 0), available_balance = coalesce(v_available, amount), updated_at = now()
  WHERE id = v_payment.pre_fund_request_id;
  SELECT to_jsonb(f) INTO v_fund_after FROM public.pre_fund_requests f WHERE id = v_payment.pre_fund_request_id;

  UPDATE public.payment_event_delete_audit
  SET source_after_snapshot = v_source_after, fund_after_snapshot = v_fund_after
  WHERE payment_event_id = v_payment.id;

  RETURN jsonb_build_object('success', true, 'deleted_payment_event_id', v_payment.id,
    'source_table', v_payment.source_table, 'source_id', v_payment.source_id,
    'deleted_amount', v_payment.amount);
END;
$$;

-- Permit the function itself to finish its after-snapshot while still rejecting
-- all direct audit edits. The trigger checks this transaction-local marker.
CREATE OR REPLACE FUNCTION public.guard_payment_delete_audit_immutable()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_setting('app.authorized_payment_hard_delete', true) = 'on'
     AND current_user NOT IN ('authenticated', 'anon') THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  RAISE EXCEPTION 'Payment deletion audit records are immutable.';
END;
$$;

REVOKE ALL ON FUNCTION public.delete_latest_source_payment_rpc(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_latest_source_payment_rpc(UUID, TEXT) TO authenticated;
NOTIFY pgrst, 'reload schema';