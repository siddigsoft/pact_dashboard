-- Gate ordinary site/transport fee settlement on an exact WFP confirmation.
-- Incentive bonus wallet transactions are deliberately not touched by this
-- migration; this only changes the ordinary site-entry completion path.

BEGIN;

-- Refuse to hide legacy duplicates. Finance gets the exact affected IDs and
-- must reconcile them before the durable idempotency index is installed.
DO $$
DECLARE r record;
BEGIN
  SELECT site_id, array_agg(tx_id ORDER BY tx_id) AS ids, count(DISTINCT tx_id) AS n
    INTO r FROM (
      SELECT DISTINCT id AS tx_id, coalesce(site_visit_id, related_site_visit_id) AS site_id
        FROM public.wallet_transactions
       WHERE type IN ('earning','site_visit_fee')
         AND (site_visit_id IS NOT NULL OR related_site_visit_id IS NOT NULL)
    ) x
   GROUP BY site_id HAVING count(DISTINCT tx_id) > 1 LIMIT 1;
  IF r.n IS NOT NULL THEN
    RAISE EXCEPTION 'ORDINARY_EARNING_DUPLICATES: canonical site % has % transactions (%); reconcile before migration',
      r.site_id, r.n, r.ids;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS ux_wallet_ordinary_site_earning
  ON public.wallet_transactions (coalesce(site_visit_id, related_site_visit_id))
  WHERE type IN ('earning', 'site_visit_fee')
    AND (site_visit_id IS NOT NULL OR related_site_visit_id IS NOT NULL);

-- Immutable evidence ledger for deterministic advance applications.  A row is
-- one site/request allocation; the source payment IDs remain immutable evidence
-- and retries update only the applied/remaining projection.
CREATE TABLE IF NOT EXISTS public.site_advance_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mmp_site_entry_id uuid NOT NULL REFERENCES public.mmp_site_entries(id),
  down_payment_request_id uuid NOT NULL REFERENCES public.down_payment_requests(id),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id),
  gross_cents bigint NOT NULL CHECK (gross_cents >= 0),
  applied_cents bigint NOT NULL CHECK (applied_cents >= 0),
  remaining_paid_cents bigint NOT NULL CHECK (remaining_paid_cents >= 0),
  source_payment_ids jsonb NOT NULL,
  wallet_transaction_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mmp_site_entry_id, down_payment_request_id)
);
CREATE INDEX IF NOT EXISTS site_advance_applications_site_idx
  ON public.site_advance_applications(mmp_site_entry_id);
ALTER TABLE public.site_advance_applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_advance_applications FROM PUBLIC, authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    EXECUTE 'REVOKE ALL ON public.site_advance_applications FROM anon';
  END IF;
END $$;
CREATE POLICY site_advance_applications_authorized_read
  ON public.site_advance_applications FOR SELECT TO authenticated
  USING (public.can_manage_covered_fee_payments());
GRANT SELECT ON public.site_advance_applications TO authenticated;
CREATE OR REPLACE FUNCTION public.site_advance_applications_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF TG_OP='UPDATE'
     AND current_user = pg_get_userbyid(
       (SELECT relowner FROM pg_class WHERE oid='public.site_advance_applications'::regclass))
     AND OLD.mmp_site_entry_id=NEW.mmp_site_entry_id
     AND OLD.down_payment_request_id=NEW.down_payment_request_id
     AND OLD.recipient_id=NEW.recipient_id
     AND OLD.gross_cents=NEW.gross_cents
     AND OLD.applied_cents=NEW.applied_cents
     AND OLD.remaining_paid_cents=NEW.remaining_paid_cents
     AND OLD.source_payment_ids=NEW.source_payment_ids
     AND OLD.wallet_transaction_id IS NULL
     AND NEW.wallet_transaction_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'SITE_ADVANCE_APPLICATION_IMMUTABLE: use trusted compensation workflow';
END $$;
DROP TRIGGER IF EXISTS trg_site_advance_applications_immutable
  ON public.site_advance_applications;
CREATE TRIGGER trg_site_advance_applications_immutable
BEFORE UPDATE OR DELETE ON public.site_advance_applications
FOR EACH ROW EXECUTE FUNCTION public.site_advance_applications_immutable();

CREATE OR REPLACE FUNCTION public.guard_advance_application_reversal()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_request uuid := NEW.source_id;
BEGIN
  IF v_request IS NULL AND NEW.reversal_of_id IS NOT NULL THEN
    SELECT source_id INTO v_request
      FROM public.pre_fund_transactions WHERE id=NEW.reversal_of_id;
  END IF;
  IF NEW.source_table='down_payment_requests'
     AND NEW.transaction_type IN ('reversal','return')
     AND NOT (
       current_user = pg_get_userbyid(
         (SELECT relowner FROM pg_class WHERE oid='public.pre_fund_transactions'::regclass))
       AND current_setting('app.advance_compensation',true) = 'on'
     )
     AND EXISTS (
       SELECT 1 FROM public.site_advance_applications a
        WHERE a.down_payment_request_id=v_request AND a.applied_cents>0
     ) THEN
    RAISE EXCEPTION 'ADVANCE_REVERSAL_BLOCKED: release/compensate site advance applications for request % first',
      v_request;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_advance_application_reversal
  ON public.pre_fund_transactions;
CREATE TRIGGER trg_guard_advance_application_reversal
BEFORE INSERT ON public.pre_fund_transactions
FOR EACH ROW EXECUTE FUNCTION public.guard_advance_application_reversal();

CREATE OR REPLACE FUNCTION public.guard_ordinary_site_wallet_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_site_id uuid := coalesce(NEW.site_visit_id, NEW.related_site_visit_id);
  v_owner name;
  v_status text;
BEGIN
  IF coalesce(NEW.type::text, '') NOT IN ('earning', 'site_visit_fee')
     AND (TG_OP <> 'UPDATE' OR coalesce(OLD.type::text, '') NOT IN ('earning', 'site_visit_fee')) THEN
    RETURN NEW;
  END IF;
  SELECT pg_get_userbyid(c.relowner) INTO v_owner
    FROM pg_class c WHERE c.oid = 'public.mmp_site_entries'::regclass;
  -- The ordinary completion function is SECURITY DEFINER and therefore runs
  -- as the table owner.  Client inserts remain rejected even with forged
  -- metadata; unrelated bonus/payroll rows have no site reference.
  IF current_user::name <> v_owner THEN
    RAISE EXCEPTION 'ORDINARY_SITE_EARNING_TRUSTED_PATH_REQUIRED';
  END IF;
  IF coalesce(NEW.type::text, '') IN ('earning', 'site_visit_fee') THEN
    IF v_site_id IS NULL THEN
      RAISE EXCEPTION 'ORDINARY_SITE_EARNING_REQUIRES_SITE_REFERENCE';
    END IF;
    SELECT lower(trim(coalesce(status, ''))) INTO v_status
      FROM public.mmp_site_entries WHERE id = v_site_id FOR SHARE;
    IF v_status IS DISTINCT FROM 'wfp_confirmed' THEN
      RAISE EXCEPTION 'ORDINARY_SITE_EARNING_REQUIRES_WFP_CONFIRMED';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_ordinary_site_wallet_insert
  ON public.wallet_transactions;
CREATE TRIGGER trg_guard_ordinary_site_wallet_insert
BEFORE INSERT OR UPDATE ON public.wallet_transactions
FOR EACH ROW EXECUTE FUNCTION public.guard_ordinary_site_wallet_insert();

CREATE OR REPLACE FUNCTION public.create_wallet_transaction_on_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_wallet_id uuid;
  v_amount numeric;
  v_amount_cents bigint;
  v_current_balance numeric := 0;
  v_new_balance numeric;
  v_site_name text;
  v_advance_deducted numeric := 0;
  v_gross_amount numeric;
  v_gross_cents bigint;
  v_remaining_cents bigint;
  v_request_cents bigint;
  v_available_cents bigint;
  v_apply_cents bigint;
  v_payment_ids jsonb;
  v_application_id uuid;
  v_transaction_id uuid;
  v_tx record;
  v_existing uuid;
  v_paid_cents bigint;
  v_event_currency text;
BEGIN
  -- "completed", submitted, approved, etc. are not settlement states.
  -- Normalize only for comparison; do not broaden the accepted state.
  IF lower(trim(coalesce(NEW.status, ''))) <> 'wfp_confirmed'
     OR lower(trim(coalesce(OLD.status, ''))) = 'wfp_confirmed' THEN
    RETURN NEW;
  END IF;

  -- Attribution is the authoritative WFP resolution.  Accepted/claimed
  -- fields are never a payment fallback: unresolved or mismatched rows fail
  -- closed for Finance reconciliation.
  IF NEW.attribution_collector_id IS NULL
     OR coalesce(NEW.attribution_status, 'unresolved') NOT IN ('auto','corrected') THEN
    RAISE EXCEPTION 'UNRESOLVED_WFP_ATTRIBUTION: site %', NEW.id;
  END IF;
  IF NEW.accepted_by IS NOT NULL THEN
    BEGIN
      IF NEW.accepted_by::uuid <> NEW.attribution_collector_id THEN
        RAISE EXCEPTION 'WFP_ATTRIBUTION_MISMATCH: site %', NEW.id;
      END IF;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'WFP_ATTRIBUTION_MISMATCH: site %', NEW.id;
    END;
  END IF;
  IF NEW.claimed_by IS NOT NULL AND NEW.claimed_by <> NEW.attribution_collector_id
     THEN RAISE EXCEPTION 'WFP_ATTRIBUTION_MISMATCH: site %', NEW.id; END IF;
  IF NEW.visit_completed_by IS NOT NULL AND NEW.visit_completed_by <> NEW.attribution_collector_id
     THEN RAISE EXCEPTION 'WFP_ATTRIBUTION_MISMATCH: site %', NEW.id; END IF;
  IF NEW.visit_started_by IS NOT NULL AND NEW.visit_started_by <> NEW.attribution_collector_id
     THEN RAISE EXCEPTION 'WFP_ATTRIBUTION_MISMATCH: site %', NEW.id; END IF;
  v_user_id := NEW.attribution_collector_id;

  -- Entitlement is precisely enumerator fee plus transport, represented in
  -- integer cents. Generic cost is deliberately not part of this calculation.
  v_gross_cents := round((coalesce(NEW.enumerator_fee,0) +
                          coalesce(NEW.transport_fee,0)) * 100)::bigint;
  IF v_gross_cents <= 0 THEN RETURN NEW; END IF;
  v_gross_amount := v_gross_cents / 100.0;
  v_site_name := coalesce(NEW.site_name, 'Site');

  -- The earning check must precede advance mutation.  The site row is already
  -- locked by the UPDATE trigger; lock matching advances before calculating.
  IF EXISTS (SELECT 1 FROM public.wallet_transactions
              WHERE (site_visit_id = NEW.id OR related_site_visit_id = NEW.id)
                AND type IN ('earning', 'site_visit_fee')) THEN
    RETURN NEW;
  END IF;
  v_remaining_cents := v_gross_cents;
  -- Exact IDs only.  Net immutable pre-fund payment events are authoritative;
  -- approved/requested/total_paid_amount fields are never evidence.
  FOR v_tx IN
    SELECT d.id AS request_id
      FROM public.down_payment_requests d
     WHERE d.requested_by=v_user_id
       AND d.status IN ('paid','reconciled','partially_paid','fully_paid')
       AND (d.mmp_site_entry_id=NEW.id OR d.site_visit_id=NEW.id)
     ORDER BY d.id
     FOR UPDATE
  LOOP
    IF v_remaining_cents <= 0 THEN EXIT; END IF;
    -- Lock all immutable evidence first; only then recompute its verified net.
    PERFORM 1 FROM public.pre_fund_transactions p
      WHERE p.source_table='down_payment_requests' AND p.source_id=v_tx.request_id
      AND p.transaction_type IN ('payment','reversal','return') FOR UPDATE;
    IF EXISTS (
      SELECT 1 FROM public.pre_fund_transactions p
       WHERE p.source_table='down_payment_requests' AND p.source_id=v_tx.request_id
         AND p.transaction_type IN ('payment','reversal','return')
         AND (p.source_is_verified IS DISTINCT FROM true OR p.currency IS DISTINCT FROM 'SDG')
    ) THEN
      RAISE EXCEPTION 'ADVANCE_EVIDENCE_INVALID: request % has unverified or non-SDG evidence',
        v_tx.request_id;
    END IF;
    SELECT coalesce(sum(CASE WHEN p.transaction_type='payment'
                             THEN round(p.amount*100)::bigint
                             WHEN p.transaction_type IN ('reversal','return')
                             THEN -round(p.amount*100)::bigint ELSE 0 END),0)::bigint,
           jsonb_agg(p.id ORDER BY p.transaction_date,p.created_at,p.id)
      INTO v_paid_cents, v_payment_ids
      FROM public.pre_fund_transactions p
     WHERE p.source_table='down_payment_requests' AND p.source_id=v_tx.request_id
       AND p.transaction_type IN ('payment','reversal','return');
    SELECT coalesce(sum(applied_cents),0) INTO v_available_cents
      FROM public.site_advance_applications
     WHERE down_payment_request_id=v_tx.request_id;
    v_request_cents := greatest(v_paid_cents - v_available_cents, 0);
    v_apply_cents := least(v_remaining_cents, v_request_cents);
    IF v_apply_cents <= 0 THEN CONTINUE; END IF;
    INSERT INTO public.site_advance_applications
      (mmp_site_entry_id,down_payment_request_id,recipient_id,gross_cents,
       applied_cents,remaining_paid_cents,source_payment_ids)
    VALUES (NEW.id,v_tx.request_id,v_user_id,v_gross_cents,v_apply_cents,
            v_request_cents-v_apply_cents,v_payment_ids)
    ON CONFLICT (mmp_site_entry_id,down_payment_request_id) DO UPDATE
      SET applied_cents=excluded.applied_cents,
          remaining_paid_cents=excluded.remaining_paid_cents,
          updated_at=now();
    v_remaining_cents := v_remaining_cents-v_apply_cents;
  END LOOP;
  v_advance_deducted := (v_gross_cents-v_remaining_cents)/100.0;
  v_amount_cents := v_remaining_cents;
  v_amount := v_amount_cents/100.0;
  UPDATE public.mmp_site_entries
     SET fee_advance_offset_amount = (v_gross_cents-v_remaining_cents)/100.0
   WHERE id=NEW.id;

  -- Serialize first-wallet creation as well as existing balance updates.
  INSERT INTO public.wallets (user_id, balances, total_earned,
                              total_earned_cents, balance_cents)
  VALUES (v_user_id, jsonb_build_object('SDG', 0), 0, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT id, coalesce(case when balance_cents is not null
                           then balance_cents / 100.0 end,
                      (balances->>'SDG')::numeric, 0)
    INTO v_wallet_id, v_current_balance
    FROM public.wallets WHERE user_id = v_user_id FOR UPDATE;
  v_new_balance := v_current_balance + v_amount;
  UPDATE public.wallets
     SET balances = jsonb_set(coalesce(balances, '{"SDG":0}'::jsonb),
                              '{SDG}', to_jsonb(v_new_balance)),
         total_earned = coalesce(total_earned, 0) + v_amount,
         total_earned_cents = coalesce(total_earned_cents, 0) + v_amount_cents,
         balance_cents = round(v_new_balance * 100)::bigint,
         updated_at = now()
   WHERE id = v_wallet_id;

  INSERT INTO public.wallet_transactions
    (wallet_id, user_id, type, amount, amount_cents, currency,
     site_visit_id, related_site_visit_id, description, balance_before,
     balance_after, status, metadata)
  VALUES
    (v_wallet_id, v_user_id, 'earning', v_amount, v_amount_cents, 'SDG',
     NEW.id, NEW.id,
     format('WFP confirmed site: %s%s', v_site_name,
       CASE WHEN v_advance_deducted > 0
         THEN format(' | Advance deducted: -%s SDG', v_advance_deducted) ELSE '' END),
      v_current_balance, v_new_balance, 'posted',
      jsonb_build_object('status', 'wfp_confirmed',
                         'gross_cents', v_gross_cents,
                         'applied_advance_cents', v_gross_cents-v_amount_cents,
                         'remaining_paid_cents', v_amount_cents,
                         'advance_application_ids',
                           (SELECT coalesce(jsonb_agg(id ORDER BY id),'[]'::jsonb)
                              FROM public.site_advance_applications
                             WHERE mmp_site_entry_id=NEW.id),
                         'advance_evidence',
                           (SELECT coalesce(jsonb_agg(jsonb_build_object(
                              'application_id',id,'request_id',down_payment_request_id,
                              'source_payment_ids',source_payment_ids,
                              'applied_cents',applied_cents,
                              'remaining_paid_cents',remaining_paid_cents)
                              ORDER BY id),'[]'::jsonb)
                              FROM public.site_advance_applications
                             WHERE mmp_site_entry_id=NEW.id)))
  RETURNING id INTO v_transaction_id;
  UPDATE public.site_advance_applications
     SET wallet_transaction_id=v_transaction_id, updated_at=now()
   WHERE mmp_site_entry_id=NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_create_wallet_transaction_on_completion
  ON public.mmp_site_entries;
CREATE TRIGGER trigger_create_wallet_transaction_on_completion
AFTER UPDATE OF status ON public.mmp_site_entries
FOR EACH ROW
WHEN (lower(trim(coalesce(NEW.status, ''))) = 'wfp_confirmed'
  AND lower(trim(coalesce(OLD.status, ''))) <> 'wfp_confirmed')
EXECUTE FUNCTION public.create_wallet_transaction_on_completion();

CREATE OR REPLACE FUNCTION public.guard_mmp_site_fee_paid_requires_wfp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.fee_paid_status = 'paid'
     AND (TG_OP = 'INSERT' OR OLD.fee_paid_status IS DISTINCT FROM 'paid')
     AND lower(trim(coalesce(NEW.status, ''))) <> 'wfp_confirmed' THEN
    RAISE EXCEPTION 'FEE_PAID_REQUIRES_WFP_CONFIRMED: site % has status %',
      NEW.id, coalesce(NEW.status, '<null>');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_mmp_site_fee_paid_requires_wfp
  ON public.mmp_site_entries;
CREATE TRIGGER trg_guard_mmp_site_fee_paid_requires_wfp
BEFORE INSERT OR UPDATE OF fee_paid_status ON public.mmp_site_entries
FOR EACH ROW
EXECUTE FUNCTION public.guard_mmp_site_fee_paid_requires_wfp();

-- Existing paid rows are historical evidence and remain eligible for the
-- explicit GL backfill. New non-WFP transitions are ignored by the live GL
-- trigger; reversal/repair transitions remain untouched. Keep the latest
-- acct_trig_mmp_site_entries_fee_paid body (including redirect handling) and
-- narrow only its event predicate here.
DROP TRIGGER IF EXISTS trg_mmp_site_fee_gl_post ON public.mmp_site_entries;
CREATE TRIGGER trg_mmp_site_fee_gl_post
AFTER UPDATE ON public.mmp_site_entries
FOR EACH ROW
WHEN (NEW.fee_paid_status = 'paid'
  AND OLD.fee_paid_status IS DISTINCT FROM 'paid'
  AND lower(trim(coalesce(NEW.status, ''))) = 'wfp_confirmed')
EXECUTE FUNCTION public.acct_trig_mmp_site_entries_fee_paid();

COMMIT;