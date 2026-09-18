-- Authoritative claimant reassignment.  Raw collection and WFP attribution
-- columns are deliberately never updated; this table is the effective overlay.
CREATE TABLE IF NOT EXISTS public.site_claimant_reassignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_entry_id uuid NOT NULL REFERENCES public.mmp_site_entries(id) ON DELETE RESTRICT,
  old_claimant_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  new_claimant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (length(btrim(reason)) >= 5),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  original_earning_transaction_id uuid REFERENCES public.wallet_transactions(id) ON DELETE SET NULL,
  debit_transaction_id uuid REFERENCES public.wallet_transactions(id) ON DELETE SET NULL,
  credit_transaction_id uuid REFERENCES public.wallet_transactions(id) ON DELETE SET NULL,
  amount_cents bigint NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  settlement_kind text NOT NULL DEFAULT 'unpaid'
    CHECK (settlement_kind IN ('unpaid', 'wallet_only')),
  created_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL UNIQUE
);
ALTER TABLE public.site_claimant_reassignments
  ADD COLUMN IF NOT EXISTS idempotency_site_entry_id uuid
    REFERENCES public.mmp_site_entries(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS idempotency_new_claimant_id uuid
    REFERENCES public.profiles(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS site_claimant_reassignments_site_idx
  ON public.site_claimant_reassignments(site_entry_id, created_at DESC);

-- Minimal, report-safe projection.  It intentionally contains no reason,
-- actor, or financial evidence; the authoritative audit remains private.
CREATE TABLE IF NOT EXISTS public.site_effective_claimant_projection (
  site_entry_id uuid PRIMARY KEY REFERENCES public.mmp_site_entries(id) ON DELETE CASCADE,
  effective_claimant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.site_effective_claimant_projection ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS site_effective_claimant_projection_read
  ON public.site_effective_claimant_projection;
CREATE POLICY site_effective_claimant_projection_read
  ON public.site_effective_claimant_projection FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.mmp_site_entries e
    WHERE e.id = site_effective_claimant_projection.site_entry_id
  ));
REVOKE ALL ON public.site_effective_claimant_projection FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.site_effective_claimant_projection TO authenticated;

-- Seed only the latest audit decision.  Re-running this migration is safe.
INSERT INTO public.site_effective_claimant_projection (site_entry_id, effective_claimant_id)
SELECT DISTINCT ON (r.site_entry_id) r.site_entry_id, r.new_claimant_id
FROM public.site_claimant_reassignments r
ORDER BY r.site_entry_id, r.created_at DESC, r.id DESC
ON CONFLICT (site_entry_id) DO UPDATE
SET effective_claimant_id = EXCLUDED.effective_claimant_id, updated_at = now();

-- Recoverable claimant debt is intentional: the former wallet may go negative.
-- The legacy schema used a CHECK (balance_cents >= 0), so remove only that
-- obsolete invariant while retaining all other wallet constraints.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.wallets'::regclass
      AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%balance_cents%>= 0%'
  LOOP
    EXECUTE format('ALTER TABLE public.wallets DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.site_claimant_reassignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS site_claimant_reassignments_read ON public.site_claimant_reassignments;
CREATE POLICY site_claimant_reassignments_read ON public.site_claimant_reassignments
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR actor_id = auth.uid()
         OR old_claimant_id = auth.uid() OR new_claimant_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON public.site_claimant_reassignments FROM authenticated, anon;
GRANT SELECT ON public.site_claimant_reassignments TO authenticated;

CREATE OR REPLACE FUNCTION public.site_claimant_reassignment_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Claimant reassignment audit evidence is append-only.';
END $$;
DROP TRIGGER IF EXISTS trg_site_claimant_reassignment_immutable
  ON public.site_claimant_reassignments;
CREATE TRIGGER trg_site_claimant_reassignment_immutable
  BEFORE UPDATE OR DELETE ON public.site_claimant_reassignments
  FOR EACH ROW EXECUTE FUNCTION public.site_claimant_reassignment_immutable();

CREATE OR REPLACE VIEW public.site_effective_claimants
WITH (security_invoker = true) AS
SELECT e.id AS site_entry_id,
       COALESCE(p.effective_claimant_id,
         CASE WHEN e.accepted_by::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN e.accepted_by::text::uuid END,
         CASE WHEN e.claimed_by::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN e.claimed_by::text::uuid END) AS effective_claimant_id
FROM public.mmp_site_entries e
LEFT JOIN public.site_effective_claimant_projection p
  ON p.site_entry_id = e.id;
GRANT SELECT ON public.site_effective_claimants TO authenticated;

-- The existing ordinary-settlement guard takes a site-row FOR SHARE lock before
-- this trigger runs. Reassignment takes the same row FOR UPDATE. Do not also
-- take the claimant advisory lock here: the WFP AFTER UPDATE settlement path
-- already owns the site row, so row-then-advisory would deadlock against the
-- reassignment RPC's advisory-then-row order.
CREATE OR REPLACE FUNCTION public.guard_site_claimant_wallet_settlement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  effective_id uuid;
BEGIN
  IF NEW.status::text = 'posted'
     AND NEW.type::text IN ('earning', 'site_visit_fee')
     AND COALESCE(NEW.metadata ->> 'reassignment_kind', '') <> 'claimant'
     AND COALESCE(NEW.site_visit_id, NEW.related_site_visit_id) IS NOT NULL THEN
    SELECT c.effective_claimant_id INTO effective_id
    FROM public.site_effective_claimants c
    WHERE c.site_entry_id = COALESCE(NEW.site_visit_id, NEW.related_site_visit_id);

    IF effective_id IS NOT NULL AND effective_id <> NEW.user_id THEN
      RAISE EXCEPTION
        'CLAIMANT_SETTLEMENT_MISMATCH: effective claimant % does not match wallet recipient %.',
        effective_id, NEW.user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_site_claimant_wallet_settlement
  ON public.wallet_transactions;
CREATE TRIGGER trg_guard_site_claimant_wallet_settlement
  BEFORE INSERT OR UPDATE OF status, user_id, site_visit_id, related_site_visit_id
  ON public.wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.guard_site_claimant_wallet_settlement();

CREATE OR REPLACE FUNCTION public.reassign_site_claimant_rpc(
  p_site_entry_id uuid,
  p_new_claimant_id uuid,
  p_reason text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  s public.mmp_site_entries%ROWTYPE;
  old_id uuid;
  new_profile public.profiles%ROWTYPE;
  existing public.site_claimant_reassignments%ROWTYPE;
  earning public.wallet_transactions%ROWTYPE;
  latest public.site_claimant_reassignments%ROWTYPE;
  old_wallet public.wallets%ROWTYPE;
  new_wallet public.wallets%ROWTYPE;
  debit_id uuid;
  credit_id uuid;
  amount bigint := 0;
  idem text := NULLIF(btrim(p_idempotency_key), '');
  settlement text := 'unpaid';
  old_before numeric;
  new_before numeric;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only an active Super Admin may reassign a claimant.';
  END IF;
  IF p_site_entry_id IS NULL OR p_new_claimant_id IS NULL
     OR NULLIF(btrim(p_reason), '') IS NULL OR length(btrim(p_reason)) < 5
     OR idem IS NULL THEN
    RAISE EXCEPTION 'A site, eligible claimant, and reason of at least 5 characters are required.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'site_claimant_reassignment:' || p_site_entry_id::text, 0));
  SELECT * INTO existing FROM public.site_claimant_reassignments
    WHERE idempotency_key = idem;
  IF FOUND THEN
    IF existing.site_entry_id <> p_site_entry_id
       OR existing.new_claimant_id <> p_new_claimant_id THEN
      RAISE EXCEPTION 'Idempotency key fingerprint does not match this site and claimant.';
    END IF;
    -- A retry of an older A->B request may arrive after a later B->C change.
    -- Return the original result without rewinding the latest projection.
    RETURN jsonb_build_object('success', true, 'idempotent', true,
      'reassignment_id', existing.id, 'amount_cents', existing.amount_cents);
  END IF;

  SELECT * INTO s FROM public.mmp_site_entries WHERE id = p_site_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Site entry not found.'; END IF;
  SELECT r.new_claimant_id INTO old_id
  FROM public.site_claimant_reassignments r
  WHERE r.site_entry_id = s.id
  ORDER BY r.created_at DESC, r.id DESC LIMIT 1;
  IF old_id IS NULL AND s.accepted_by IS NOT NULL
     AND s.accepted_by::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN old_id := s.accepted_by::text::uuid; END IF;
  IF old_id IS NULL AND s.claimed_by IS NOT NULL
     AND s.claimed_by::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN old_id := s.claimed_by::text::uuid; END IF;
  IF old_id IS NULL THEN RAISE EXCEPTION 'This site has no claimant to reassign.'; END IF;
  IF old_id = p_new_claimant_id THEN RAISE EXCEPTION 'The new claimant must be different.'; END IF;
  SELECT * INTO latest FROM public.site_claimant_reassignments r
    WHERE r.site_entry_id = s.id ORDER BY r.created_at DESC, r.id DESC LIMIT 1;

  SELECT * INTO new_profile FROM public.profiles WHERE id = p_new_claimant_id;
  IF NOT FOUND OR COALESCE(new_profile.is_active, false) IS NOT TRUE
     OR lower(COALESCE(new_profile.role, '')) NOT IN
        ('collector','enumerator','field enumerator','field_enumerator','datacollector',
         'data collector','data_collector') THEN
    RAISE EXCEPTION 'The selected claimant is not an active eligible collector.';
  END IF;

  -- Applied advances, cash/non-wallet settlement, and WFP-confirmed evidence
  -- are intentionally fail-closed for Finance Reconciliation.
  IF EXISTS (SELECT 1 FROM public.site_advance_applications a
             WHERE a.mmp_site_entry_id = s.id AND COALESCE(a.applied_cents, 0) > 0) THEN
    RAISE EXCEPTION 'This site has an advance offset; send it to Finance Reconciliation.';
  END IF;
  IF COALESCE(s.fee_cash_paid_amount, 0) > 0
     OR (lower(COALESCE(s.fee_paid_status, '')) = 'paid'
         AND COALESCE(s.fee_wallet_credit_amount, 0) <= 0) THEN
    RAISE EXCEPTION 'This site has a non-wallet settlement; send it to Finance Reconciliation.';
  END IF;

  -- Only a single posted wallet earning is safe to compensate.  Anything
  -- ambiguous (or cash/non-wallet) is blocked rather than guessed.
  IF latest.original_earning_transaction_id IS NOT NULL THEN
    SELECT * INTO earning FROM public.wallet_transactions
      WHERE id = latest.original_earning_transaction_id;
  ELSE
    SELECT * INTO earning
    FROM public.wallet_transactions t
    WHERE (t.site_visit_id = s.id OR t.related_site_visit_id = s.id)
      AND t.status::text = 'posted'
      AND t.type::text IN ('earning', 'site_visit_fee')
      AND t.user_id = old_id
    ORDER BY t.created_at, t.id LIMIT 1;
  END IF;
  IF FOUND THEN
    IF (SELECT count(*) FROM public.wallet_transactions t
        WHERE (t.site_visit_id = s.id OR t.related_site_visit_id = s.id)
          AND t.status::text = 'posted'
          AND t.type::text IN ('earning', 'site_visit_fee')) <> 1 THEN
      RAISE EXCEPTION 'Ambiguous wallet settlement; send this case to Finance Reconciliation.';
    END IF;
    amount := COALESCE(NULLIF(earning.amount_cents, 0),
      round(COALESCE(earning.amount, 0) * 100)::bigint);
    IF amount <= 0 THEN RAISE EXCEPTION 'Invalid wallet earning; send this case to Finance Reconciliation.'; END IF;
    -- Lock both wallets in UUID order, preventing A/B deadlocks.
    PERFORM 1 FROM public.wallets
      WHERE user_id IN (old_id, p_new_claimant_id)
      ORDER BY user_id FOR UPDATE;
    SELECT * INTO old_wallet FROM public.wallets WHERE user_id = old_id;
    SELECT * INTO new_wallet FROM public.wallets WHERE user_id = p_new_claimant_id;
    IF old_wallet.id IS NULL OR new_wallet.id IS NULL THEN
      RAISE EXCEPTION 'Both claimants must have wallets; send this case to Finance Reconciliation.';
    END IF;
    settlement := 'wallet_only';
    PERFORM set_config('app.claimant_reassignment', 'true', true);
    old_before := COALESCE(old_wallet.balance_cents, 0);
    new_before := COALESCE(new_wallet.balance_cents, 0);
    -- The canonical posted-transaction trigger owns balances, projections,
    -- multi-currency jsonb updates, and totals.  Do not pre-update wallets:
    -- doing so would double-apply these compensating rows.
    INSERT INTO public.wallet_transactions
      (wallet_id,user_id,amount_cents,currency,type,status,posted_at,memo,
       site_visit_id,related_site_visit_id,amount,balance_before,balance_after,
       created_by,metadata)
    VALUES (old_wallet.id,old_id,-amount,COALESCE(earning.currency,'SDG'),
      'adjustment_debit','posted',now(),'Claimant reassignment debit',
      s.id,s.id,-amount / 100.0,old_before / 100.0,(old_before-amount) / 100.0,auth.uid(),
      jsonb_build_object('reassignment_site_id',s.id,'reassignment_kind','claimant',
        'original_earning_transaction_id',earning.id,'compensating_side','debit',
        'reassignment_rpc_marker',true,'reassignment_new_claimant_id',p_new_claimant_id))
    RETURNING id INTO debit_id;
    INSERT INTO public.wallet_transactions
      (wallet_id,user_id,amount_cents,currency,type,status,posted_at,memo,
       site_visit_id,related_site_visit_id,amount,balance_before,balance_after,
       created_by,metadata)
    VALUES (new_wallet.id,p_new_claimant_id,amount,COALESCE(earning.currency,'SDG'),
      'adjustment_credit','posted',now(),'Claimant reassignment credit',
      s.id,s.id,amount / 100.0,new_before / 100.0,(new_before+amount) / 100.0,auth.uid(),
      jsonb_build_object('reassignment_site_id',s.id,'reassignment_kind','claimant',
        'original_earning_transaction_id',earning.id,'compensating_side','credit',
        'reassignment_rpc_marker',true,'reassignment_old_claimant_id',old_id))
    RETURNING id INTO credit_id;
    UPDATE public.wallet_transactions
    SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'compensating_transaction_id', credit_id)
    WHERE id = debit_id;
    UPDATE public.wallet_transactions
    SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'compensating_transaction_id', debit_id)
    WHERE id = credit_id;
  END IF;

  INSERT INTO public.site_claimant_reassignments
    (site_entry_id,old_claimant_id,new_claimant_id,reason,actor_id,
     original_earning_transaction_id,debit_transaction_id,credit_transaction_id,
     amount_cents,settlement_kind,idempotency_key,idempotency_site_entry_id,idempotency_new_claimant_id)
  VALUES (s.id,old_id,p_new_claimant_id,btrim(p_reason),auth.uid(),earning.id,
          debit_id,credit_id,amount,settlement,idem,s.id,p_new_claimant_id)
  RETURNING * INTO existing;

  INSERT INTO public.site_effective_claimant_projection (site_entry_id, effective_claimant_id)
  VALUES (s.id, p_new_claimant_id)
  ON CONFLICT (site_entry_id) DO UPDATE
  SET effective_claimant_id = EXCLUDED.effective_claimant_id, updated_at = now();

  INSERT INTO public.notifications (user_id,title,message,type,link,related_entity_id,related_entity_type)
  SELECT DISTINCT recipient, 'Site claimant changed',
    'A site claimant was changed. Reason: ' || btrim(p_reason),
    'info','/super-admin/data-management',s.id::text,'siteVisit'
  FROM (
    SELECT old_id AS recipient
    UNION SELECT p_new_claimant_id
    UNION SELECT NULLIF(s.additional_data ->> 'supervisor_id','')::uuid
    UNION SELECT p.id FROM public.profiles p
      WHERE lower(COALESCE(p.role,'')) IN ('supervisor','hubsupervisor','hub_supervisor')
        AND p.is_active IS TRUE
        AND (s.hub_office IS NULL OR p.hub_id = s.hub_office)
  ) recipients
  WHERE recipient IS NOT NULL;
  RETURN jsonb_build_object('success',true,'idempotent',false,
    'reassignment_id',existing.id,'amount_cents',amount,'settlement_kind',settlement);
END;
$$;

-- Permit recoverable debt and preserve each currency projection for all
-- subsequent posted rows (the legacy trigger rejected negative balances and
-- replaced the entire balances document).
CREATE OR REPLACE FUNCTION public.update_wallet_balance()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE delta bigint; new_balance bigint; abs_amount bigint;
BEGIN
  IF NEW.status = 'posted' AND (OLD.status IS NULL OR OLD.status <> 'posted') THEN
    abs_amount := abs(NEW.amount_cents);
    delta := CASE WHEN NEW.amount_cents < 0 THEN NEW.amount_cents
      WHEN NEW.type IN ('withdrawal','adjustment_debit','penalty') THEN -abs_amount
      ELSE abs_amount END;
    SELECT balance_cents INTO new_balance FROM public.wallets WHERE id = NEW.wallet_id;
    new_balance := coalesce(new_balance,0) + delta;
    IF new_balance < 0 AND NOT (
      current_setting('app.claimant_reassignment', true) = 'true'
      AND NEW.type = 'adjustment_debit'
      AND (NEW.metadata ->> 'reassignment_rpc_marker')::boolean IS TRUE
      AND NULLIF(NEW.metadata ->> 'reassignment_site_id', '') IS NOT NULL
      AND NULLIF(NEW.metadata ->> 'original_earning_transaction_id', '') IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.mmp_site_entries e
        WHERE e.id = (NEW.metadata ->> 'reassignment_site_id')::uuid
      )
      AND EXISTS (
        SELECT 1 FROM public.wallet_transactions original
        WHERE original.id = (NEW.metadata ->> 'original_earning_transaction_id')::uuid
          AND original.type::text IN ('earning','site_visit_fee')
          AND original.status::text = 'posted'
      )
    ) THEN
      RAISE EXCEPTION 'Insufficient wallet balance. Current: %, Requested: %',
        (SELECT balance_cents FROM public.wallets WHERE id = NEW.wallet_id),
        abs_amount;
    END IF;
    UPDATE public.wallets SET balance_cents = new_balance,
      total_earned_cents = CASE WHEN NEW.type IN ('site_visit_fee','earning','bonus','adjustment_credit')
        OR (NEW.amount_cents > 0 AND NEW.type NOT IN ('withdrawal','adjustment_debit','penalty'))
        THEN total_earned_cents + abs_amount ELSE total_earned_cents END,
      total_paid_out_cents = CASE WHEN NEW.type IN ('withdrawal','adjustment_debit')
        OR NEW.amount_cents < 0 THEN total_paid_out_cents + abs_amount ELSE total_paid_out_cents END,
      total_earned = CASE WHEN NEW.type IN ('site_visit_fee','earning','bonus','adjustment_credit')
        OR (NEW.amount_cents > 0 AND NEW.type NOT IN ('withdrawal','adjustment_debit','penalty'))
        THEN coalesce(total_earned,0)+abs_amount/100.0 ELSE total_earned END,
      total_withdrawn = CASE WHEN NEW.type IN ('withdrawal','adjustment_debit')
        OR NEW.amount_cents < 0 THEN coalesce(total_withdrawn,0)+abs_amount/100.0 ELSE total_withdrawn END,
      balances = jsonb_set(coalesce(balances,'{}'::jsonb),
        ARRAY[coalesce(NEW.currency,'SDG')],
        to_jsonb((coalesce((balances ->> coalesce(NEW.currency,'SDG'))::numeric,0)
          + delta / 100.0)), true), updated_at = now()
    WHERE id = NEW.wallet_id;
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.reassign_site_claimant_rpc(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reassign_site_claimant_rpc(uuid, uuid, text, text) TO authenticated;
NOTIFY pgrst, 'reload schema';