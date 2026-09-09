-- Controlled remediation for settled legacy incentives.
-- Install this before 20260906_incentive_system_hardening.sql.  It deliberately
-- does not manufacture financial evidence: it can only link a uniquely matching,
-- already-posted wallet transaction or an existing payroll item whose reference
-- is the incentive payment itself.

ALTER TABLE public.mmp_incentive_payments
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversal_reason text,
  ADD COLUMN IF NOT EXISTS reversal_reference text;

CREATE TABLE IF NOT EXISTS public.mmp_incentive_settlements (
  payment_id uuid PRIMARY KEY REFERENCES public.mmp_incentive_payments(id) ON DELETE RESTRICT,
  method text NOT NULL CHECK (method IN ('wallet','payroll')),
  payment_reference text NOT NULL UNIQUE,
  payroll_item_id uuid,
  wallet_transaction_id uuid,
  settled_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz,
  reversal_reference text UNIQUE,
  reversal_reason text,
  reversal_wallet_transaction_id uuid
);

CREATE TABLE IF NOT EXISTS public.mmp_incentive_evidence_backfill_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.mmp_incentive_payments(id) ON DELETE RESTRICT,
  method text NOT NULL CHECK (method IN ('wallet','payroll')),
  source_row_id uuid NOT NULL,
  reversal_source_row_id uuid,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  linked_at timestamptz NOT NULL DEFAULT now(),
  evidence_snapshot jsonb NOT NULL,
  UNIQUE(payment_id)
);

REVOKE ALL ON public.mmp_incentive_evidence_backfill_audit FROM PUBLIC,authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS mmp_incentive_settlements_wallet_source_unique
  ON public.mmp_incentive_settlements(wallet_transaction_id)
  WHERE wallet_transaction_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS mmp_incentive_settlements_wallet_reversal_unique
  ON public.mmp_incentive_settlements(reversal_wallet_transaction_id)
  WHERE reversal_wallet_transaction_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS mmp_incentive_settlements_payroll_source_unique
  ON public.mmp_incentive_settlements(payroll_item_id)
  WHERE payroll_item_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.prevent_mmp_incentive_source_reuse()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
  FOR v_id IN SELECT x FROM unnest(ARRAY[
    NEW.wallet_transaction_id,NEW.reversal_wallet_transaction_id
  ]) x WHERE x IS NOT NULL ORDER BY x
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('mmp-incentive-wallet-source:'||v_id::text,0));
  END LOOP;
  IF NEW.wallet_transaction_id IS NOT NULL AND EXISTS(
    SELECT 1 FROM public.mmp_incentive_settlements e
    WHERE e.payment_id<>NEW.payment_id AND
      (e.wallet_transaction_id=NEW.wallet_transaction_id
       OR e.reversal_wallet_transaction_id=NEW.wallet_transaction_id)
  ) THEN RAISE EXCEPTION 'wallet evidence is already owned by another incentive payment'; END IF;
  IF NEW.reversal_wallet_transaction_id IS NOT NULL AND EXISTS(
    SELECT 1 FROM public.mmp_incentive_settlements e
    WHERE e.payment_id<>NEW.payment_id AND
      (e.wallet_transaction_id=NEW.reversal_wallet_transaction_id
       OR e.reversal_wallet_transaction_id=NEW.reversal_wallet_transaction_id)
  ) THEN RAISE EXCEPTION 'wallet reversal evidence is already owned by another incentive payment'; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS mmp_incentive_source_reuse_guard ON public.mmp_incentive_settlements;
CREATE TRIGGER mmp_incentive_source_reuse_guard
BEFORE INSERT OR UPDATE OF wallet_transaction_id,reversal_wallet_transaction_id,payroll_item_id
ON public.mmp_incentive_settlements
FOR EACH ROW EXECUTE FUNCTION public.prevent_mmp_incentive_source_reuse();

CREATE OR REPLACE FUNCTION public.get_legacy_incentive_evidence_report()
RETURNS TABLE(
  payment_id uuid, payment_status text, payment_method text, user_id uuid,
  bonus_amount_cents bigint, currency text, issue_code text, explanation text,
  eligible_source_count integer, eligible_source_ids uuid[],
  eligible_reversal_count integer, eligible_reversal_ids uuid[]
) LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public AS $$
DECLARE r record; v_role text; v_count integer; v_ids uuid[];
  v_reverse_count integer; v_reverse_ids uuid[]; v_issue text; v_explanation text;
BEGIN
  SELECT regexp_replace(lower(coalesce(role,'')), '[^a-z0-9]+', '', 'g')
    INTO v_role FROM public.profiles WHERE id=auth.uid();
  IF auth.uid() IS NULL OR v_role NOT IN ('admin','superadmin','financialadmin','finance') THEN
    RAISE EXCEPTION 'only Finance administrators may review legacy incentive evidence'
      USING ERRCODE='42501';
  END IF;

  FOR r IN
    SELECT p.*, e.method evidence_method, e.payment_reference evidence_reference,
      e.wallet_transaction_id evidence_wallet_id, e.payroll_item_id evidence_payroll_id,
      e.reversal_wallet_transaction_id evidence_reversal_id
    FROM public.mmp_incentive_payments p
    LEFT JOIN public.mmp_incentive_settlements e ON e.payment_id=p.id
    WHERE p.status IN ('paid','reversed')
    ORDER BY p.created_at,p.id
  LOOP
    v_count:=0; v_ids:='{}'; v_reverse_count:=0; v_reverse_ids:='{}';
    IF r.payment_method='wallet' OR r.payment_method IS NULL THEN
      SELECT count(*)::integer,coalesce(array_agg(w.id ORDER BY w.created_at,w.id),'{}')
        INTO v_count,v_ids
      FROM public.wallet_transactions w
      WHERE w.user_id=r.user_id AND w.amount_cents=r.bonus_amount_cents
        AND w.currency=r.currency AND w.type::text='adjustment' AND w.status::text='posted'
        AND (w.metadata->>'incentive_payment_id'=r.id::text
          OR (r.idempotency_key IS NOT NULL
            AND w.metadata->>'incentive_payment_id' IS NULL
            AND w.metadata->>'idempotency_key'=r.idempotency_key::text))
        AND NOT EXISTS(SELECT 1 FROM public.mmp_incentive_settlements owned
          WHERE owned.payment_id<>r.id AND
            (owned.wallet_transaction_id=w.id OR owned.reversal_wallet_transaction_id=w.id));
      IF r.status='reversed' THEN
        SELECT count(*)::integer,coalesce(array_agg(w.id ORDER BY w.created_at,w.id),'{}')
          INTO v_reverse_count,v_reverse_ids
        FROM public.wallet_transactions w
        WHERE w.user_id=r.user_id AND w.amount_cents=-r.bonus_amount_cents
          AND w.currency=r.currency AND w.type::text='adjustment' AND w.status::text='posted'
          AND w.metadata->>'incentive_payment_id'=r.id::text
          AND (r.reversal_reference IS NULL
            OR w.metadata->>'reversal_reference'=r.reversal_reference)
          AND NOT EXISTS(SELECT 1 FROM public.mmp_incentive_settlements owned
            WHERE owned.payment_id<>r.id AND
              (owned.wallet_transaction_id=w.id OR owned.reversal_wallet_transaction_id=w.id));
      END IF;
    ELSIF r.payment_method='payroll' AND to_regclass('public.payroll_run_items') IS NOT NULL THEN
      EXECUTE 'SELECT count(*)::integer,coalesce(array_agg(i.id ORDER BY i.created_at,i.id),''{}'')
        FROM public.payroll_run_items i
        WHERE i.user_id=$1 AND i.amount_cents=$2 AND i.currency=$3
          AND i.type::text=''incentive_bonus'' AND i.reference_id=$4
          AND NOT EXISTS(SELECT 1 FROM public.mmp_incentive_settlements owned
            WHERE owned.payment_id<>$4 AND owned.payroll_item_id=i.id)'
        INTO v_count,v_ids USING r.user_id,r.bonus_amount_cents,r.currency,r.id;
    END IF;

    v_issue:=NULL; v_explanation:=NULL;
    IF r.payment_method IS NULL THEN
      v_issue:='missing_payment_method';
      v_explanation:='The legacy payment does not identify wallet or payroll; Finance must verify the source.';
    ELSIF r.payment_method NOT IN ('wallet','payroll') THEN
      v_issue:='unsupported_payment_method';
      v_explanation:='The stored payment method is not supported by the evidence invariant.';
    ELSIF r.status='reversed' AND r.payment_method<>'wallet' THEN
      v_issue:='unsupported_legacy_reversal';
      v_explanation:='Only wallet reversals can be reconciled by this workflow.';
    ELSIF r.payment_method='payroll' AND to_regclass('public.payroll_run_items') IS NULL THEN
      v_issue:='payroll_unavailable';
      v_explanation:='Payroll evidence cannot be checked because payroll_run_items is unavailable.';
    ELSIF v_count=0 THEN
      v_issue:='no_trustworthy_source';
      v_explanation:='No posted source row has the exact recipient, amount, currency, type, and trusted incentive identity.';
    ELSIF v_count>1 THEN
      v_issue:='ambiguous_source';
      v_explanation:='More than one trustworthy source row matches; Finance must determine the authoritative row.';
    ELSIF r.status='reversed' AND v_reverse_count=0 THEN
      v_issue:='no_trustworthy_reversal';
      v_explanation:='No posted reversal has the exact signed amount and incentive identity.';
    ELSIF r.status='reversed' AND v_reverse_count>1 THEN
      v_issue:='ambiguous_reversal';
      v_explanation:='More than one trustworthy reversal matches; Finance must determine the authoritative row.';
    ELSIF r.evidence_method IS NULL THEN
      v_issue:='ready_for_deterministic_backfill';
      v_explanation:='Exactly one trustworthy source match exists and can be linked by the audited backfill.';
    ELSIF r.evidence_method IS DISTINCT FROM r.payment_method
       OR r.evidence_reference IS DISTINCT FROM r.payment_reference
       OR (r.payment_method='wallet' AND r.evidence_wallet_id IS DISTINCT FROM v_ids[1])
       OR (r.payment_method='payroll' AND r.evidence_payroll_id IS DISTINCT FROM v_ids[1])
       OR (r.status='reversed' AND r.evidence_reversal_id IS DISTINCT FROM v_reverse_ids[1]) THEN
      v_issue:='existing_settlement_mismatch';
      v_explanation:='Existing settlement links do not match the unique trustworthy source.';
    END IF;

    IF v_issue IS NOT NULL THEN
      payment_id:=r.id; payment_status:=r.status; payment_method:=r.payment_method;
      user_id:=r.user_id; bonus_amount_cents:=r.bonus_amount_cents; currency:=r.currency;
      issue_code:=v_issue; explanation:=v_explanation;
      eligible_source_count:=v_count; eligible_source_ids:=v_ids;
      eligible_reversal_count:=v_reverse_count; eligible_reversal_ids:=v_reverse_ids;
      RETURN NEXT;
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.backfill_legacy_incentive_evidence(p_payment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.mmp_incentive_payments%ROWTYPE; v_actor uuid:=auth.uid(); v_role text;
  v_source uuid; v_sources uuid[]; v_source_count integer; v_reverse uuid;
  v_reverse_count integer:=0; v_ref text; v_reverse_ref text; v_snapshot jsonb;
BEGIN
  SELECT regexp_replace(lower(coalesce(role,'')), '[^a-z0-9]+', '', 'g')
    INTO v_role FROM public.profiles WHERE id=v_actor;
  IF v_actor IS NULL OR v_role NOT IN ('admin','superadmin','financialadmin','finance') THEN
    RAISE EXCEPTION 'only Finance administrators may backfill legacy incentive evidence'
      USING ERRCODE='42501';
  END IF;
  SELECT * INTO p FROM public.mmp_incentive_payments WHERE id=p_payment_id FOR UPDATE;
  IF NOT FOUND OR p.status NOT IN ('paid','reversed') THEN
    RAISE EXCEPTION 'only settled legacy incentive payments can be backfilled';
  END IF;
  IF EXISTS(SELECT 1 FROM public.mmp_incentive_evidence_backfill_audit WHERE payment_id=p.id) THEN
    RAISE EXCEPTION 'legacy incentive evidence was already backfilled';
  END IF;
  IF p.payment_method NOT IN ('wallet','payroll') OR (p.status='reversed' AND p.payment_method<>'wallet') THEN
    RAISE EXCEPTION 'payment method requires manual Finance review';
  END IF;

  IF p.payment_method='wallet' THEN
    IF p.idempotency_key IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(
        hashtextextended('mmp-incentive-legacy-claim:'||p.idempotency_key::text,0));
    END IF;
    SELECT count(*)::integer,array_agg(w.id ORDER BY w.created_at,w.id)
      INTO v_source_count,v_sources
    FROM public.wallet_transactions w
    WHERE w.user_id=p.user_id AND w.amount_cents=p.bonus_amount_cents
      AND w.currency=p.currency AND w.type::text='adjustment' AND w.status::text='posted'
      AND (w.metadata->>'incentive_payment_id'=p.id::text
        OR (p.idempotency_key IS NOT NULL
          AND w.metadata->>'incentive_payment_id' IS NULL
          AND w.metadata->>'idempotency_key'=p.idempotency_key::text))
      AND NOT EXISTS(SELECT 1 FROM public.mmp_incentive_settlements owned
        WHERE owned.payment_id<>p.id AND
          (owned.wallet_transaction_id=w.id OR owned.reversal_wallet_transaction_id=w.id));
    IF v_source_count<>1 THEN
      RAISE EXCEPTION 'deterministic backfill requires exactly one trustworthy source; found %',v_source_count;
    END IF;
    v_source:=v_sources[1];
    IF p.status='reversed' THEN
      SELECT count(*)::integer,(array_agg(w.id ORDER BY w.created_at,w.id))[1]
        INTO v_reverse_count,v_reverse
      FROM public.wallet_transactions w
      WHERE w.user_id=p.user_id AND w.amount_cents=-p.bonus_amount_cents
        AND w.currency=p.currency AND w.type::text='adjustment' AND w.status::text='posted'
        AND w.metadata->>'incentive_payment_id'=p.id::text
        AND (p.reversal_reference IS NULL
          OR w.metadata->>'reversal_reference'=p.reversal_reference)
        AND NOT EXISTS(SELECT 1 FROM public.mmp_incentive_settlements owned
          WHERE owned.payment_id<>p.id AND
            (owned.wallet_transaction_id=w.id OR owned.reversal_wallet_transaction_id=w.id));
      IF v_reverse_count<>1 THEN
        RAISE EXCEPTION 'deterministic backfill requires exactly one trustworthy reversal; found %',v_reverse_count;
      END IF;
    END IF;
    PERFORM 1 FROM public.wallet_transactions
      WHERE id IN (v_source,v_reverse) ORDER BY id FOR UPDATE;
    IF EXISTS(SELECT 1 FROM public.mmp_incentive_settlements owned
      WHERE owned.payment_id<>p.id AND
        (owned.wallet_transaction_id IN (v_source,v_reverse)
         OR owned.reversal_wallet_transaction_id IN (v_source,v_reverse))) THEN
      RAISE EXCEPTION 'trustworthy source was claimed by another incentive payment';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.wallet_transactions w
      WHERE w.id=v_source AND w.user_id=p.user_id
        AND w.amount_cents=p.bonus_amount_cents AND w.currency=p.currency
        AND w.type::text='adjustment' AND w.status::text='posted'
        AND (w.metadata->>'incentive_payment_id'=p.id::text
          OR (p.idempotency_key IS NOT NULL
            AND w.metadata->>'incentive_payment_id' IS NULL
            AND w.metadata->>'idempotency_key'=p.idempotency_key::text))) THEN
      RAISE EXCEPTION 'trustworthy source changed or was attributed to another incentive payment';
    END IF;
    IF p.status='reversed' AND NOT EXISTS(
      SELECT 1 FROM public.wallet_transactions w
      WHERE w.id=v_reverse AND w.user_id=p.user_id
        AND w.amount_cents=-p.bonus_amount_cents AND w.currency=p.currency
        AND w.type::text='adjustment' AND w.status::text='posted'
        AND w.metadata->>'incentive_payment_id'=p.id::text
        AND (p.reversal_reference IS NULL
          OR w.metadata->>'reversal_reference'=p.reversal_reference)
    ) THEN RAISE EXCEPTION 'trustworthy reversal changed or was claimed'; END IF;
    UPDATE public.wallet_transactions
      SET metadata=coalesce(metadata,'{}')||jsonb_build_object('incentive_payment_id',p.id)
      WHERE id=v_source AND metadata->>'incentive_payment_id' IS NULL;
    v_ref:=coalesce(p.payment_reference,'legacy-mmp-incentive:'||p.id);
    v_reverse_ref:=CASE WHEN p.status='reversed' THEN
      coalesce(p.reversal_reference,
        (SELECT metadata->>'reversal_reference' FROM public.wallet_transactions WHERE id=v_reverse),
        'legacy-mmp-incentive-reversal:'||p.id) END;
    IF p.status='reversed' THEN
      UPDATE public.wallet_transactions
        SET metadata=coalesce(metadata,'{}')||jsonb_build_object(
          'incentive_payment_id',p.id,'reversal_reference',v_reverse_ref)
        WHERE id=v_reverse;
    END IF;
    SELECT jsonb_build_object('payment',to_jsonb(p),'source',to_jsonb(w),
      'reversal_source',(SELECT to_jsonb(rw) FROM public.wallet_transactions rw WHERE rw.id=v_reverse))
      INTO v_snapshot FROM public.wallet_transactions w WHERE w.id=v_source;
    INSERT INTO public.mmp_incentive_settlements(
      payment_id,method,payment_reference,wallet_transaction_id,settled_at,
      reversed_at,reversal_reference,reversal_reason,reversal_wallet_transaction_id
    ) VALUES(p.id,'wallet',v_ref,v_source,coalesce(p.paid_at,p.created_at,now()),
      CASE WHEN p.status='reversed' THEN coalesce(p.reversed_at,p.paid_at,p.created_at,now()) END,
      v_reverse_ref,CASE WHEN p.status='reversed' THEN coalesce(p.reversal_reason,'Legacy reversal') END,
      v_reverse)
    ON CONFLICT(payment_id) DO UPDATE SET method=excluded.method,
      payment_reference=excluded.payment_reference,wallet_transaction_id=excluded.wallet_transaction_id,
      settled_at=excluded.settled_at,reversed_at=excluded.reversed_at,
      reversal_reference=excluded.reversal_reference,reversal_reason=excluded.reversal_reason,
      reversal_wallet_transaction_id=excluded.reversal_wallet_transaction_id,payroll_item_id=NULL;
  ELSE
    IF to_regclass('public.payroll_run_items') IS NULL THEN
      RAISE EXCEPTION 'payroll evidence is unavailable';
    END IF;
    EXECUTE 'SELECT count(*)::integer,array_agg(i.id ORDER BY i.created_at,i.id)
      FROM public.payroll_run_items i WHERE i.user_id=$1 AND i.amount_cents=$2
        AND i.currency=$3 AND i.type::text=''incentive_bonus'' AND i.reference_id=$4
        AND NOT EXISTS(SELECT 1 FROM public.mmp_incentive_settlements owned
          WHERE owned.payment_id<>$4 AND owned.payroll_item_id=i.id)'
      INTO v_source_count,v_sources USING p.user_id,p.bonus_amount_cents,p.currency,p.id;
    IF v_source_count<>1 THEN
      RAISE EXCEPTION 'deterministic backfill requires exactly one trustworthy source; found %',v_source_count;
    END IF;
    v_source:=v_sources[1]; v_ref:=coalesce(p.payment_reference,'legacy-mmp-incentive:'||p.id);
    EXECUTE 'SELECT 1 FROM public.payroll_run_items WHERE id=$1 FOR UPDATE'
      USING v_source;
    IF EXISTS(SELECT 1 FROM public.mmp_incentive_settlements owned
      WHERE owned.payment_id<>p.id AND owned.payroll_item_id=v_source) THEN
      RAISE EXCEPTION 'trustworthy payroll source was claimed by another incentive payment';
    END IF;
    EXECUTE 'SELECT jsonb_build_object(''payment'',to_jsonb($1),
      ''source'',to_jsonb(i)) FROM public.payroll_run_items i WHERE i.id=$2'
      INTO v_snapshot USING p,v_source;
    INSERT INTO public.mmp_incentive_settlements(
      payment_id,method,payment_reference,payroll_item_id,settled_at
    ) VALUES(p.id,'payroll',v_ref,v_source,coalesce(p.paid_at,p.created_at,now()))
    ON CONFLICT(payment_id) DO UPDATE SET method=excluded.method,
      payment_reference=excluded.payment_reference,payroll_item_id=excluded.payroll_item_id,
      settled_at=excluded.settled_at,wallet_transaction_id=NULL,reversed_at=NULL,
      reversal_reference=NULL,reversal_reason=NULL,reversal_wallet_transaction_id=NULL;
  END IF;

  UPDATE public.mmp_incentive_payments SET payment_reference=v_ref,
    reversal_reference=CASE WHEN status='reversed' THEN v_reverse_ref ELSE reversal_reference END
    WHERE id=p.id;
  INSERT INTO public.mmp_incentive_evidence_backfill_audit(
    payment_id,method,source_row_id,reversal_source_row_id,actor_id,evidence_snapshot
  ) VALUES(p.id,p.payment_method,v_source,v_reverse,v_actor,v_snapshot);
  RETURN jsonb_build_object('ok',true,'payment_id',p.id,'method',p.payment_method,
    'source_row_id',v_source,'reversal_source_row_id',v_reverse);
END $$;

REVOKE ALL ON FUNCTION public.get_legacy_incentive_evidence_report() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.backfill_legacy_incentive_evidence(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_legacy_incentive_evidence_report() TO authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_legacy_incentive_evidence(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_legacy_incentive_evidence_report() IS
  'Read-only Finance report of settled legacy incentives that do not yet have uniquely valid source evidence.';
COMMENT ON FUNCTION public.backfill_legacy_incentive_evidence(uuid) IS
  'Links one uniquely identified pre-existing wallet/payroll source and records an immutable audit snapshot; never creates financial evidence.';