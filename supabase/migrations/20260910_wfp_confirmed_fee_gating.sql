-- Gate ordinary site/transport fee settlement on an exact WFP confirmation.
-- Incentive bonus wallet transactions are deliberately not touched by this
-- migration; this only changes the ordinary site-entry completion path.

BEGIN;

ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS fee_wallet_credit_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE public.down_payment_requests
  ADD COLUMN IF NOT EXISTS site_fee_applied_cents bigint NOT NULL DEFAULT 0;

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
DO $$
DECLARE r record;
BEGIN
  SELECT id, site_visit_id, related_site_visit_id INTO r
    FROM public.wallet_transactions
   WHERE site_visit_id IS NOT NULL AND related_site_visit_id IS NOT NULL
     AND site_visit_id IS DISTINCT FROM related_site_visit_id
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'ORDINARY_EARNING_REFERENCE_MISMATCH: transaction % has two different site IDs (% and %)',
      r.id, r.site_visit_id, r.related_site_visit_id;
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid='public.wallet_transactions'::regclass
                    AND conname='wallet_transactions_site_refs_equal') THEN
    ALTER TABLE public.wallet_transactions
      ADD CONSTRAINT wallet_transactions_site_refs_equal
      CHECK (site_visit_id IS NULL OR related_site_visit_id IS NULL
             OR site_visit_id=related_site_visit_id) NOT VALID;
  END IF;
END $$;
ALTER TABLE public.wallet_transactions
  VALIDATE CONSTRAINT wallet_transactions_site_refs_equal;

-- Immutable evidence ledger for deterministic advance applications.  A row is
-- one site/request allocation; the source payment IDs remain immutable evidence
-- and retries may only link the resulting wallet transaction.
CREATE TABLE IF NOT EXISTS public.site_advance_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mmp_site_entry_id uuid NOT NULL REFERENCES public.mmp_site_entries(id),
  down_payment_request_id uuid NOT NULL REFERENCES public.down_payment_requests(id),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id),
  gross_cents bigint NOT NULL CHECK (gross_cents >= 0),
  applied_cents bigint NOT NULL CHECK (applied_cents >= 0),
  -- Snapshot at allocation time only; current residual is always recomputed
  -- from the canonical event ledger minus active applications.
  application_residual_cents bigint NOT NULL CHECK (application_residual_cents >= 0),
  source_payment_ids jsonb NOT NULL,
  wallet_transaction_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mmp_site_entry_id, down_payment_request_id)
);
CREATE INDEX IF NOT EXISTS site_advance_applications_site_idx
  ON public.site_advance_applications(mmp_site_entry_id);
ALTER TABLE public.site_advance_applications ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute
     WHERE attrelid='public.site_advance_applications'::regclass
       AND attname='remaining_paid_cents' AND NOT attisdropped
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_attribute
     WHERE attrelid='public.site_advance_applications'::regclass
       AND attname='application_residual_cents' AND NOT attisdropped
  ) THEN
    EXECUTE
      'ALTER TABLE public.site_advance_applications '
      'RENAME COLUMN remaining_paid_cents TO application_residual_cents';
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
     WHERE attrelid='public.site_advance_applications'::regclass
       AND attname='application_residual_cents' AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'SITE_ADVANCE_APPLICATION_SCHEMA_UNSUPPORTED: application_residual_cents is missing; reconcile the partial table before migration';
  END IF;
END $$;
-- The current residual is calculated from verified net events on every read;
-- application evidence never claims to be a current request balance.
CREATE OR REPLACE VIEW public.site_advance_application_current_v
WITH (security_invoker = true) AS
SELECT a.id, a.mmp_site_entry_id, a.down_payment_request_id, a.recipient_id,
       a.gross_cents, a.applied_cents, a.source_payment_ids,
       a.wallet_transaction_id, a.created_at, a.updated_at,
       greatest(
         coalesce((
           SELECT sum(round(e.signed_paid_amount * 100)::bigint)
           FROM public.pre_fund_event_ledger_v e
           WHERE e.source_table = 'down_payment_requests'
             AND e.source_id = a.down_payment_request_id
             AND e.source_is_verified
             AND e.currency = 'SDG'
         ), 0)
         - coalesce((
           SELECT sum(a2.applied_cents)
           FROM public.site_advance_applications a2
           WHERE a2.down_payment_request_id = a.down_payment_request_id
             AND a2.applied_cents > 0
         ), 0), 0) AS current_residual_cents
  FROM public.site_advance_applications a;
GRANT SELECT ON public.site_advance_application_current_v TO authenticated;
REVOKE ALL ON public.site_advance_applications FROM PUBLIC, authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    EXECUTE 'REVOKE ALL ON public.site_advance_applications FROM anon';
  END IF;
END $$;
DROP POLICY IF EXISTS site_advance_applications_authorized_read
  ON public.site_advance_applications;
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
      AND OLD.application_residual_cents=NEW.application_residual_cents
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
  v_source_table text := NEW.source_table;
  v_original record;
  v_reversal_count integer;
  v_request_applied_cents bigint;
BEGIN
  IF NEW.transaction_type='reversal' AND NEW.reversal_of_id IS NULL THEN
    RAISE EXCEPTION 'ADVANCE_REVERSAL_INVALID: reversal requires reversal_of_id';
  END IF;
  IF NEW.reversal_of_id IS NOT NULL
     AND NEW.transaction_type NOT IN ('reversal','return') THEN
    RAISE EXCEPTION 'ADVANCE_REVERSAL_INVALID: only reversal/return events may reference reversal_of_id';
  END IF;
  IF NEW.reversal_of_id IS NOT NULL THEN
    -- A reversal is allowed to omit source fields, but never to omit the
    -- identity of the event it reverses. Resolve both fields from the
    -- canonical ledger, rather than trusting a client-supplied source.
    SELECT source_table, source_id
      INTO v_source_table, v_request
      FROM public.pre_fund_event_ledger_v
     WHERE id=NEW.reversal_of_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ADVANCE_REVERSAL_INVALID: reversal_of_id % is not a ledger event',
        NEW.reversal_of_id;
    END IF;
    IF v_source_table='down_payment_requests' AND v_request IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(v_request::text, 0));
      PERFORM 1 FROM public.down_payment_requests WHERE id=v_request FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'ADVANCE_REVERSAL_INVALID: request % does not exist', v_request;
      END IF;
      SELECT site_fee_applied_cents INTO v_request_applied_cents
        FROM public.down_payment_requests WHERE id=v_request FOR UPDATE;
    END IF;
    SELECT source_table, source_id, transaction_type, currency, amount
      INTO v_original
      FROM public.pre_fund_event_ledger_v
     WHERE id=NEW.reversal_of_id;
    IF v_original.source_table='down_payment_requests'
       AND v_original.transaction_type <> 'payment' THEN
      RAISE EXCEPTION 'ADVANCE_REVERSAL_INVALID: reversal target % is not a payment',
        NEW.reversal_of_id;
    END IF;
    IF v_original.source_table='down_payment_requests'
       AND NEW.source_table IS NOT NULL
       AND NEW.source_table IS DISTINCT FROM v_original.source_table THEN
      RAISE EXCEPTION 'ADVANCE_REVERSAL_SOURCE_MISMATCH: source table does not match reversal target %',
        NEW.reversal_of_id;
    END IF;
    IF v_original.source_table='down_payment_requests'
       AND NEW.source_id IS NOT NULL
       AND NEW.source_id IS DISTINCT FROM v_original.source_id THEN
      RAISE EXCEPTION 'ADVANCE_REVERSAL_SOURCE_MISMATCH: source id does not match reversal target %',
        NEW.reversal_of_id;
    END IF;
    IF v_original.source_table='down_payment_requests'
       AND (NEW.currency IS DISTINCT FROM v_original.currency
       OR NEW.amount IS DISTINCT FROM v_original.amount) THEN
      RAISE EXCEPTION 'ADVANCE_REVERSAL_AMOUNT_CURRENCY_MISMATCH: reversal target % must match payment',
        NEW.reversal_of_id;
    END IF;
    IF v_original.source_table='down_payment_requests' THEN
      NEW.source_table := v_original.source_table;
      NEW.source_id := v_original.source_id;
    END IF;
  ELSIF v_source_table='down_payment_requests'
        AND NEW.transaction_type IN ('reversal','return') THEN
    RAISE EXCEPTION 'ADVANCE_REVERSAL_INVALID: down-payment reversal/return requires reversal_of_id';
  END IF;
  IF NEW.transaction_type IN ('reversal','return') THEN
    SELECT count(*) INTO v_reversal_count
      FROM public.pre_fund_transactions
     WHERE reversal_of_id=NEW.reversal_of_id;
    IF v_reversal_count > 0 THEN
      RAISE EXCEPTION 'ADVANCE_REVERSAL_DUPLICATE: payment event % already has a reversal',
        NEW.reversal_of_id;
    END IF;
  END IF;
  IF v_source_table='down_payment_requests'
     AND NEW.transaction_type IN ('reversal','return')
     AND current_user <> pg_get_userbyid(
       (SELECT relowner FROM pg_class WHERE oid='public.pre_fund_transactions'::regclass))
  THEN
    RAISE EXCEPTION 'DOWN_PAYMENT_REVERSAL_TRUSTED_PATH_REQUIRED: use the controlled reconciliation workflow';
  END IF;
  IF v_request IS NOT NULL AND v_source_table='down_payment_requests' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_request::text, 0));
    PERFORM 1 FROM public.down_payment_requests WHERE id=v_request FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ADVANCE_REVERSAL_INVALID: request % does not exist', v_request;
    END IF;
    SELECT site_fee_applied_cents INTO v_request_applied_cents
      FROM public.down_payment_requests WHERE id=v_request;
  END IF;
  IF v_source_table='down_payment_requests'
     AND NEW.transaction_type IN ('reversal','return')
     AND (
       EXISTS (
         SELECT 1 FROM public.site_advance_applications a
          WHERE a.down_payment_request_id=v_request AND a.applied_cents>0
       )
       OR coalesce(v_request_applied_cents,0)>0
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

CREATE OR REPLACE FUNCTION public.guard_down_payment_payment_owner()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.source_table='down_payment_requests'
     AND NEW.transaction_type='payment'
     AND current_user <> pg_get_userbyid(
       (SELECT relowner FROM pg_class WHERE oid='public.pre_fund_transactions'::regclass))
  THEN
    RAISE EXCEPTION 'DOWN_PAYMENT_PAYMENT_TRUSTED_PATH_REQUIRED: use the controlled payment RPC';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_down_payment_payment_owner
  ON public.pre_fund_transactions;
CREATE TRIGGER trg_guard_down_payment_payment_owner
BEFORE INSERT ON public.pre_fund_transactions
FOR EACH ROW EXECUTE FUNCTION public.guard_down_payment_payment_owner();

DO $$
DECLARE r record;
BEGIN
  SELECT reversal_of_id, count(*) AS n INTO r
    FROM public.pre_fund_transactions
   WHERE reversal_of_id IS NOT NULL
   GROUP BY reversal_of_id HAVING count(*) > 1 LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'ADVANCE_REVERSAL_DUPLICATES: payment event % has % reversals; reconcile before migration',
      r.reversal_of_id, r.n;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS ux_pre_fund_one_reversal_per_event
  ON public.pre_fund_transactions(reversal_of_id)
  WHERE reversal_of_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_applied_down_payment_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.site_advance_applications
              WHERE down_payment_request_id=OLD.id AND applied_cents>0)
     AND NOT (current_user = pg_get_userbyid(
       (SELECT relowner FROM pg_class WHERE oid='public.down_payment_requests'::regclass))
       AND current_setting('app.wfp_wallet_settlement',true)='on')
     AND (NEW.status IS DISTINCT FROM OLD.status
       OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
       OR NEW.mmp_site_entry_id IS DISTINCT FROM OLD.mmp_site_entry_id
       OR NEW.site_visit_id IS DISTINCT FROM OLD.site_visit_id
       OR NEW.site_fee_applied_cents IS DISTINCT FROM OLD.site_fee_applied_cents
       OR NEW.metadata IS DISTINCT FROM OLD.metadata
       OR TG_OP='DELETE') THEN
    RAISE EXCEPTION 'ADVANCE_SOURCE_IMMUTABLE_AFTER_APPLICATION: request % requires Finance reconciliation',
      OLD.id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_guard_applied_down_payment_mutation
  ON public.down_payment_requests;
CREATE TRIGGER trg_guard_applied_down_payment_mutation
BEFORE UPDATE OF status,requested_by,mmp_site_entry_id,site_visit_id,metadata,site_fee_applied_cents
  OR DELETE ON public.down_payment_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_applied_down_payment_mutation();

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

-- A confirmed site's ordinary earning is the settlement. The receipt centre
-- must not add a second direct-cash settlement on top of that earning.
CREATE OR REPLACE FUNCTION public.guard_direct_cash_after_wallet_earning()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.fee_paid_status='paid'
     AND NOT (
       current_user = pg_get_userbyid(
         (SELECT relowner FROM pg_class WHERE oid='public.mmp_site_entries'::regclass))
       AND current_setting('app.wfp_wallet_settlement', true)='on'
     )
     AND EXISTS (
       SELECT 1 FROM public.wallet_transactions w
        WHERE (w.site_visit_id=NEW.id OR w.related_site_visit_id=NEW.id)
          AND w.type IN ('earning','site_visit_fee')
     ) THEN
    RAISE EXCEPTION 'DIRECT_PAYMENT_BLOCKED_WALLET_SETTLED: site % already has an ordinary wallet earning; Finance must not pay it again',
      NEW.id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_direct_cash_after_wallet_earning
  ON public.mmp_site_entries;
CREATE TRIGGER trg_guard_direct_cash_after_wallet_earning
BEFORE INSERT OR UPDATE OF fee_paid_status ON public.mmp_site_entries
FOR EACH ROW EXECUTE FUNCTION public.guard_direct_cash_after_wallet_earning();

-- Once settled, fields that determine entitlement, attribution, and payment
-- references are immutable. There is intentionally no compensation bypass.
CREATE OR REPLACE FUNCTION public.guard_settled_site_financial_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF lower(trim(coalesce(OLD.status,'')))='wfp_confirmed'
     AND NOT (current_user = pg_get_userbyid(
       (SELECT relowner FROM pg_class WHERE oid='public.mmp_site_entries'::regclass))
       AND current_setting('app.wfp_wallet_settlement',true)='on')
     AND (
    NEW.enumerator_fee IS DISTINCT FROM OLD.enumerator_fee OR
    NEW.transport_fee IS DISTINCT FROM OLD.transport_fee OR
    NEW.cost IS DISTINCT FROM OLD.cost OR
    NEW.attribution_collector_id IS DISTINCT FROM OLD.attribution_collector_id OR
    NEW.attribution_status IS DISTINCT FROM OLD.attribution_status OR
    NEW.accepted_by IS DISTINCT FROM OLD.accepted_by OR
    NEW.claimed_by IS DISTINCT FROM OLD.claimed_by OR
    NEW.visit_completed_by IS DISTINCT FROM OLD.visit_completed_by OR
    NEW.visit_started_by IS DISTINCT FROM OLD.visit_started_by OR
    NEW.site_name IS DISTINCT FROM OLD.site_name OR
    NEW.fee_pre_fund_id IS DISTINCT FROM OLD.fee_pre_fund_id OR
    NEW.fee_payment_reference IS DISTINCT FROM OLD.fee_payment_reference
    OR NEW.fee_wallet_credit_amount IS DISTINCT FROM OLD.fee_wallet_credit_amount
  ) THEN
    RAISE EXCEPTION 'WFP_SETTLED_FINANCIAL_FIELDS_IMMUTABLE: Finance reconciliation is required for site %',
      OLD.id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_settled_site_financial_mutation
  ON public.mmp_site_entries;
CREATE TRIGGER trg_guard_settled_site_financial_mutation
BEFORE UPDATE ON public.mmp_site_entries
FOR EACH ROW EXECUTE FUNCTION public.guard_settled_site_financial_mutation();
CREATE OR REPLACE FUNCTION public.guard_wallet_component_trusted()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' AND (
       coalesce(NEW.fee_wallet_credit_amount,0)<>0
       OR (NEW.fee_paid_status='paid'
           AND lower(trim(coalesce(NEW.status,'')))='wfp_confirmed')
     )
     AND NOT (current_user = pg_get_userbyid(
       (SELECT relowner FROM pg_class WHERE oid='public.mmp_site_entries'::regclass))
       AND current_setting('app.wfp_wallet_settlement',true)='on')
  THEN
    RAISE EXCEPTION 'WFP_WALLET_COMPONENT_TRUSTED_PATH_REQUIRED';
  END IF;
  IF TG_OP='UPDATE' AND NEW.fee_wallet_credit_amount IS DISTINCT FROM OLD.fee_wallet_credit_amount
     AND NOT (current_user = pg_get_userbyid(
       (SELECT relowner FROM pg_class WHERE oid='public.mmp_site_entries'::regclass))
       AND current_setting('app.wfp_wallet_settlement',true)='on') THEN
    RAISE EXCEPTION 'WFP_WALLET_COMPONENT_TRUSTED_PATH_REQUIRED';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_wallet_component_trusted
  ON public.mmp_site_entries;
CREATE TRIGGER trg_guard_wallet_component_trusted
BEFORE INSERT OR UPDATE OF fee_wallet_credit_amount ON public.mmp_site_entries
FOR EACH ROW EXECUTE FUNCTION public.guard_wallet_component_trusted();

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
  v_marker bigint;
  v_applied_sum bigint;
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
  LOOP
    IF v_remaining_cents <= 0 THEN EXIT; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(v_tx.request_id::text, 0));
    PERFORM 1 FROM public.down_payment_requests d
      WHERE d.id=v_tx.request_id
        AND d.status IN ('paid','reconciled','partially_paid','fully_paid')
      FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;
    SELECT site_fee_applied_cents INTO v_marker
      FROM public.down_payment_requests WHERE id=v_tx.request_id;
    SELECT coalesce(sum(applied_cents),0) INTO v_applied_sum
      FROM public.site_advance_applications
     WHERE down_payment_request_id=v_tx.request_id;
    IF coalesce(v_marker,0) <> coalesce(v_applied_sum,0) THEN
      RAISE EXCEPTION 'ADVANCE_APPLICATION_MARKER_MISMATCH: request %',
        v_tx.request_id;
    END IF;
    -- Lock all immutable base evidence first; only then recompute its verified
    -- net through the production-shaped canonical ledger view.
    PERFORM 1 FROM public.pre_fund_transactions p
      WHERE p.source_table='down_payment_requests' AND p.source_id=v_tx.request_id
      AND p.transaction_type IN ('payment','reversal','return') FOR UPDATE;
    IF EXISTS (
      SELECT 1 FROM public.pre_fund_event_ledger_v e
       WHERE e.source_table='down_payment_requests' AND e.source_id=v_tx.request_id
         AND e.transaction_type IN ('payment','reversal','return')
         AND (e.source_is_verified IS DISTINCT FROM true OR e.currency IS DISTINCT FROM 'SDG')
    ) THEN
      RAISE EXCEPTION 'ADVANCE_EVIDENCE_INVALID: request % has unverified or non-SDG evidence',
        v_tx.request_id;
    END IF;
     SELECT coalesce(sum(round(e.signed_paid_amount*100)::bigint),0)::bigint,
            jsonb_agg(e.id ORDER BY e.transaction_date,e.created_at,e.id)
      INTO v_paid_cents, v_payment_ids
       FROM public.pre_fund_event_ledger_v e
      WHERE e.source_table='down_payment_requests' AND e.source_id=v_tx.request_id
        AND e.transaction_type IN ('payment','reversal','return');
    SELECT coalesce(sum(applied_cents),0) INTO v_available_cents
      FROM public.site_advance_applications
     WHERE down_payment_request_id=v_tx.request_id;
    v_request_cents := greatest(v_paid_cents - v_available_cents, 0);
    v_apply_cents := least(v_remaining_cents, v_request_cents);
    IF v_apply_cents <= 0 THEN CONTINUE; END IF;
    INSERT INTO public.site_advance_applications
      (mmp_site_entry_id,down_payment_request_id,recipient_id,gross_cents,
        applied_cents,application_residual_cents,source_payment_ids)
    VALUES (NEW.id,v_tx.request_id,v_user_id,v_gross_cents,v_apply_cents,
             v_request_cents-v_apply_cents,v_payment_ids);
    PERFORM set_config('app.wfp_wallet_settlement','on',true);
    UPDATE public.down_payment_requests
       SET site_fee_applied_cents=site_fee_applied_cents+v_apply_cents
     WHERE id=v_tx.request_id;
    PERFORM set_config('app.wfp_wallet_settlement','off',true);
    v_remaining_cents := v_remaining_cents-v_apply_cents;
  END LOOP;
  v_advance_deducted := (v_gross_cents-v_remaining_cents)/100.0;
  v_amount_cents := v_remaining_cents;
  v_amount := v_amount_cents/100.0;
  UPDATE public.mmp_site_entries
     SET fee_advance_offset_amount = (v_gross_cents-v_remaining_cents)/100.0
   WHERE id=NEW.id;

  -- A fully covered fee is settled by the offset itself. Do not manufacture a
  -- zero-value wallet transaction; mark the existing paid projection so the
  -- normal paid-transition GL trigger can run atomically.
  IF v_amount_cents = 0 THEN
    UPDATE public.mmp_site_entries
       SET fee_paid_status='paid',
           fee_paid_amount=v_gross_amount,
           fee_cash_paid_amount=0,
           fee_advance_offset_amount=v_gross_amount,
           fee_wallet_credit_amount=0
     WHERE id=NEW.id;
    RETURN NEW;
  END IF;

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
                          'net_earning_cents', v_amount_cents,
                         'advance_application_ids',
                           (SELECT coalesce(jsonb_agg(id ORDER BY id),'[]'::jsonb)
                              FROM public.site_advance_applications
                             WHERE mmp_site_entry_id=NEW.id),
                         'advance_evidence',
                           (SELECT coalesce(jsonb_agg(jsonb_build_object(
                              'application_id',id,'request_id',down_payment_request_id,
                              'source_payment_ids',source_payment_ids,
                              'applied_cents',applied_cents,
                               'application_residual_cents',application_residual_cents)
                              ORDER BY id),'[]'::jsonb)
                              FROM public.site_advance_applications
                             WHERE mmp_site_entry_id=NEW.id)))
  RETURNING id INTO v_transaction_id;
  PERFORM set_config('app.wfp_wallet_settlement', 'on', true);
  UPDATE public.mmp_site_entries
     SET fee_paid_status='paid',
         fee_paid_amount=v_gross_amount,
         fee_cash_paid_amount=0,
         fee_advance_offset_amount=(v_gross_cents-v_amount_cents)/100.0,
         fee_wallet_credit_amount=v_amount
   WHERE id=NEW.id;
  PERFORM set_config('app.wfp_wallet_settlement', 'off', true);
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

CREATE OR REPLACE FUNCTION public.guard_wfp_confirmation_projection()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF lower(trim(coalesce(OLD.status,''))) <> 'wfp_confirmed'
     AND lower(trim(coalesce(NEW.status,'')))='wfp_confirmed'
     AND (
       coalesce(NEW.fee_paid_status,'') IN ('paid','partially_paid')
       OR coalesce(NEW.fee_paid_amount,0)>0
       OR coalesce(NEW.fee_cash_paid_amount,0)>0
       OR coalesce(NEW.fee_wallet_credit_amount,0)>0
       OR NEW.fee_payment_reference IS NOT NULL
       OR NEW.fee_receipt_url IS NOT NULL
       OR NEW.fee_payment_notes IS NOT NULL
     )
     AND NOT (
       current_user = pg_get_userbyid(
         (SELECT relowner FROM pg_class WHERE oid='public.mmp_site_entries'::regclass))
       AND current_setting('app.redirect_settlement',true)='on'
       AND EXISTS (
         SELECT 1 FROM public.cycle_exception_actions a
          WHERE a.redirect_fee_site_entry_id=NEW.id
            AND a.decision='redirect' AND a.executed=true
       )
     ) THEN
    RAISE EXCEPTION 'WFP_CONFIRMATION_FINANCIAL_PROJECTION_FORBIDDEN: confirm WFP first, then use trusted settlement';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_wfp_confirmation_projection
  ON public.mmp_site_entries;
CREATE TRIGGER trg_guard_wfp_confirmation_projection
BEFORE UPDATE ON public.mmp_site_entries
FOR EACH ROW EXECUTE FUNCTION public.guard_wfp_confirmation_projection();

-- Keep the production fee bridge authoritative for every settlement path. The
-- redirect-aware bridge remains the existing function contract; this body
-- additionally carries the wallet-payable component and rejects imbalance.
CREATE OR REPLACE FUNCTION public.acct_trig_mmp_site_entries_fee_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  gross numeric := round(coalesce(NEW.enumerator_fee,0)+coalesce(NEW.transport_fee,0),2);
  cash numeric := round(coalesce(NEW.fee_cash_paid_amount,0),2);
  advance numeric := round(coalesce(NEW.fee_advance_offset_amount,0),2);
  wallet numeric := round(coalesce(NEW.fee_wallet_credit_amount,0),2);
  cash_account text := CASE WHEN lower(replace(coalesce(NEW.fee_payment_method,''),' ','_'))='bank_transfer' THEN '1020' ELSE '1010' END;
  lines jsonb;
  entry uuid;
  country uuid;
  has_redirect boolean := false;
  authoritative_offset numeric := 0;
  expected_cash numeric;
BEGIN
  IF NEW.fee_paid_status IS DISTINCT FROM 'paid' OR OLD.fee_paid_status='paid'
     OR public.has_active_enumerator_fee_bridge(NEW.id) THEN RETURN NEW; END IF;
  -- Preserve the latest redirect path: redirected fees are cash-only and use
  -- the authoritative executed allocation, never the ordinary advance marker.
  IF to_regclass('public.cycle_exception_actions') IS NOT NULL
     AND to_regclass('public.cycle_exception_action_allocations') IS NOT NULL THEN
    EXECUTE $q$
      SELECT EXISTS (
        SELECT 1 FROM public.cycle_exception_actions a
         WHERE a.redirect_fee_site_entry_id=$1 AND a.decision='redirect'
           AND a.executed=true
           AND coalesce(a.correction_status,'') NOT IN
             ('reopened_for_correction','historically_reconciled','reprocessed_payment_reversed')
        UNION ALL
        SELECT 1 FROM public.cycle_exception_action_allocations al
        JOIN public.cycle_exception_actions a ON a.id=al.action_id
         WHERE al.target_site_id=$1 AND a.decision='redirect' AND a.executed=true
           AND coalesce(a.correction_status,'') NOT IN
             ('reopened_for_correction','historically_reconciled','reprocessed_payment_reversed')
      )$q$ INTO has_redirect USING NEW.id;
  END IF;
  IF has_redirect THEN
    EXECUTE $q$
      SELECT coalesce(sum(al.amount),0)
        FROM public.cycle_exception_action_allocations al
        JOIN public.cycle_exception_actions a ON a.id=al.action_id
       WHERE al.target_site_id=$1 AND a.decision='redirect' AND a.executed=true
         AND coalesce(a.correction_status,'') NOT IN
           ('reopened_for_correction','historically_reconciled','reprocessed_payment_reversed')$q$
      INTO authoritative_offset USING NEW.id;
    EXECUTE $q$
      SELECT coalesce(sum(coalesce(a.redirect_fee_settled_amount,a.decision_amount,a.advance_amount)),0)
        FROM public.cycle_exception_actions a
       WHERE a.redirect_fee_site_entry_id=$1 AND a.decision='redirect' AND a.executed=true
         AND coalesce(a.correction_status,'') NOT IN
           ('reopened_for_correction','historically_reconciled','reprocessed_payment_reversed')
         AND NOT EXISTS (
           SELECT 1 FROM public.cycle_exception_action_allocations al
            WHERE al.action_id=a.id)$q$
      INTO expected_cash USING NEW.id;
    authoritative_offset := authoritative_offset + coalesce(expected_cash,0);
    authoritative_offset := round(authoritative_offset,2);
    expected_cash := round(greatest(gross-authoritative_offset,0),2);
    cash := coalesce(NEW.fee_cash_paid_amount,expected_cash);
    IF authoritative_offset < 0 OR authoritative_offset > gross
       OR coalesce(NEW.fee_paid_amount,0)<>gross
       OR coalesce(NEW.fee_advance_offset_amount,0)<>authoritative_offset
       OR cash<>expected_cash OR wallet<>0 THEN
      RAISE EXCEPTION 'Redirect fee completion components must equal gross fee';
    END IF;
    IF expected_cash <= 0 THEN
      RETURN NEW;
    END IF;
    lines := jsonb_build_array(
      jsonb_build_object('account_code','5200','debit_credit','DR','amount',cash,'currency','SDG','function','program'),
      jsonb_build_object('account_code',cash_account,'debit_credit','CR','amount',cash,'currency','SDG','function','none')
    );
    BEGIN
      SELECT country_id INTO country FROM public.mmp_files WHERE id=NEW.mmp_file_id;
      entry := public.acct_bridge_post_journal('mmp_site_entries',NEW.id,'enumerator_fee_paid',
        coalesce(NEW.fee_paid_at::date,current_date),'Enumerator Fee Paid: '||coalesce(NEW.site_name,NEW.id::text),
        'أجر معدد مدفوع: '||coalesce(NEW.site_name,NEW.id::text),lines,NEW.fee_paid_by,country);
      INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,journal_entry_id)
      VALUES ('mmp_site_entries',NEW.id,'enumerator_fee_paid','success',entry);
    EXCEPTION WHEN OTHERS THEN
      RAISE;
    END;
    RETURN NEW;
  END IF;
  IF round(cash+advance+wallet,2) <> gross OR gross <= 0
     OR coalesce(NEW.fee_paid_amount,0) <> gross
     OR cash < 0 OR advance < 0 OR wallet < 0 THEN
    RAISE EXCEPTION 'FEE_GL_COMPONENTS_UNBALANCED: gross %, cash %, advance %, wallet %',
      gross,cash,advance,wallet;
  END IF;
  SELECT country_id INTO country FROM public.mmp_files WHERE id=NEW.mmp_file_id;
  lines := jsonb_build_array(
    jsonb_build_object('account_code','5200','debit_credit','DR','amount',gross,'currency','SDG','function','program'),
    jsonb_build_object('account_code',cash_account,'debit_credit','CR','amount',cash,'currency','SDG','function','none'),
    jsonb_build_object('account_code','1510','debit_credit','CR','amount',advance,'currency','SDG','function','program'),
    jsonb_build_object('account_code','2600','debit_credit','CR','amount',wallet,'currency','SDG','function','program')
  );
  BEGIN
    entry := public.acct_bridge_post_journal(
      'mmp_site_entries',NEW.id,'enumerator_fee_paid',
      coalesce(NEW.fee_paid_at::date,current_date),
      'Enumerator Fee Paid: '||coalesce(NEW.site_name,NEW.id::text),
      'أجر معدد مدفوع: '||coalesce(NEW.site_name,NEW.id::text),
      lines,NEW.fee_paid_by,country);
    INSERT INTO public.acct_gl_bridge_log
      (source_table,source_id,event_type,status,journal_entry_id)
    VALUES ('mmp_site_entries',NEW.id,'enumerator_fee_paid','success',entry);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.acct_gl_bridge_log
      (source_table,source_id,event_type,status,error_message)
    VALUES ('mmp_site_entries',NEW.id,'enumerator_fee_paid','error',SQLERRM);
  END;
  RETURN NEW;
END $$;

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

SELECT set_config('app.wfp_wallet_settlement','on',true);
UPDATE public.down_payment_requests d
   SET site_fee_applied_cents = coalesce((
     SELECT sum(a.applied_cents)
       FROM public.site_advance_applications a
      WHERE a.down_payment_request_id=d.id
   ),0);
SELECT set_config('app.wfp_wallet_settlement','off',true);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.down_payment_requests d
    WHERE d.site_fee_applied_cents IS DISTINCT FROM coalesce((
      SELECT sum(a.applied_cents) FROM public.site_advance_applications a
       WHERE a.down_payment_request_id=d.id
    ),0)
  ) THEN
    RAISE EXCEPTION 'ADVANCE_APPLICATION_MARKER_BACKFILL_MISMATCH';
  END IF;
END $$;

COMMIT;