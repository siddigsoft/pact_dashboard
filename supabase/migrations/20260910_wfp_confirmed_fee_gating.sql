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
BEGIN
  -- "completed", submitted, approved, etc. are not settlement states.
  -- Normalize only for comparison; do not broaden the accepted state.
  IF lower(trim(coalesce(NEW.status, ''))) <> 'wfp_confirmed'
     OR lower(trim(coalesce(OLD.status, ''))) = 'wfp_confirmed' THEN
    RETURN NEW;
  END IF;

  IF NEW.accepted_by IS NOT NULL THEN
    BEGIN
      -- uuid input accepts upper-case hexadecimal safely.
      v_user_id := NEW.accepted_by::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'INVALID_RECIPIENT: accepted_by is not a UUID';
    END;
  ELSE
    v_user_id := coalesce(NEW.claimed_by, NEW.visit_completed_by);
  END IF;
  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  v_gross_amount := coalesce(nullif(NEW.cost, 0),
                             coalesce(NEW.enumerator_fee, 0) +
                             coalesce(NEW.transport_fee, 0), 0);
  IF v_gross_amount <= 0 THEN RETURN NEW; END IF;
  v_site_name := coalesce(NEW.site_name, 'Site');

  -- The earning check must precede advance mutation.  The site row is already
  -- locked by the UPDATE trigger; lock matching advances before calculating.
  IF EXISTS (SELECT 1 FROM public.wallet_transactions
              WHERE (site_visit_id = NEW.id OR related_site_visit_id = NEW.id)
                AND type IN ('earning', 'site_visit_fee')) THEN
    RETURN NEW;
  END IF;
  PERFORM 1 FROM public.down_payment_requests d
   WHERE d.requested_by = v_user_id
     AND d.status IN ('partially_paid', 'fully_paid', 'approved')
     AND d.metadata->>'advance_reconciled_at' IS NULL
      AND (d.mmp_site_entry_id = NEW.id OR d.site_visit_id = NEW.id
           OR trim(d.site_name) = trim(coalesce(NEW.site_name, 'Site'))
           OR d.site_name ILIKE '%' || trim(coalesce(NEW.site_name, 'Site')) || '%')
   FOR UPDATE;
  SELECT coalesce(sum(greatest(0, coalesce(d.total_paid_amount,
                                           d.approved_amount,
                                           d.requested_amount, 0))), 0)
    INTO v_advance_deducted
    FROM public.down_payment_requests d
   WHERE d.requested_by = v_user_id
     AND d.status IN ('partially_paid', 'fully_paid', 'approved')
     AND d.metadata->>'advance_reconciled_at' IS NULL
     AND (d.mmp_site_entry_id = NEW.id OR d.site_visit_id = NEW.id
          OR trim(d.site_name) = trim(v_site_name)
          OR d.site_name ILIKE '%' || trim(v_site_name) || '%');

  v_amount := greatest(0, v_gross_amount - coalesce(v_advance_deducted, 0));
  IF v_advance_deducted > 0 THEN
    UPDATE public.down_payment_requests
       SET metadata = jsonb_set(coalesce(metadata, '{}'::jsonb),
                                '{advance_reconciled_at}', to_jsonb(now()::text)),
           updated_at = now()
     WHERE requested_by = v_user_id
       AND status IN ('partially_paid', 'fully_paid', 'approved')
       AND metadata->>'advance_reconciled_at' IS NULL
       AND (mmp_site_entry_id = NEW.id OR site_visit_id = NEW.id
            OR trim(site_name) = trim(v_site_name)
            OR site_name ILIKE '%' || trim(v_site_name) || '%');
  END IF;
  v_amount_cents := round(v_amount * 100)::bigint;

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
     v_current_balance, v_new_balance, 'pending',
     jsonb_build_object('status', 'wfp_confirmed',
                        'gross_amount', v_gross_amount,
                        'advance_deducted', coalesce(v_advance_deducted, 0)));
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