-- =============================================================================
-- DEDUCT ADVANCES WHEN CREATING WALLET TRANSACTION ON SITE COMPLETION
-- When a site is marked Completed, the DB trigger creates a wallet transaction.
-- Previously it credited the full site fee; it now deducts any transport advances
-- the user already received (matching app logic in createSiteVisitWalletTransaction)
-- so wallet balance and site earning reflect net amount (fee minus advance).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_wallet_transaction_on_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id uuid;
  v_wallet_id uuid;
  v_amount numeric;
  v_amount_cents bigint;
  v_current_balance numeric;
  v_new_balance numeric;
  v_transaction_id uuid;
  v_site_name text;
  v_advance_deducted numeric := 0;
  v_gross_amount numeric;
BEGIN
  -- Only process if status changed to 'Completed' or 'completed'
  IF (NEW.status IS DISTINCT FROM OLD.status)
     AND (LOWER(NEW.status) = 'completed')
     AND (OLD.status IS NULL OR LOWER(OLD.status) != 'completed') THEN

    -- Determine user to pay (priority: accepted_by > claimed_by > visit_completed_by)
    v_user_id := CASE
      WHEN NEW.accepted_by IS NOT NULL THEN
        CASE
          WHEN NEW.accepted_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN NEW.accepted_by::uuid
          ELSE NULL
        END
      WHEN NEW.claimed_by IS NOT NULL THEN NEW.claimed_by
      WHEN NEW.visit_completed_by IS NOT NULL THEN NEW.visit_completed_by
      ELSE NULL
    END;

    IF v_user_id IS NULL THEN
      RAISE NOTICE 'No user to pay for site %', NEW.id;
      RETURN NEW;
    END IF;

    -- Gross amount (priority: cost > enumerator_fee + transport_fee)
    v_gross_amount := COALESCE(
      NULLIF(NEW.cost, 0),
      COALESCE(NEW.enumerator_fee, 0) + COALESCE(NEW.transport_fee, 0),
      0
    );

    IF v_gross_amount <= 0 THEN
      RAISE NOTICE 'No fee amount for site %', NEW.id;
      RETURN NEW;
    END IF;

    v_site_name := COALESCE(NEW.site_name, 'Site');
    v_amount := v_gross_amount;

    -- Deduct unreconciled transport advances for this site (same logic as app wallet-transactions.ts)
    SELECT COALESCE(SUM(dpr.total_paid_amount), 0) INTO v_advance_deducted
    FROM public.down_payment_requests dpr
    WHERE dpr.requested_by = v_user_id
      AND dpr.status IN ('partially_paid', 'fully_paid')
      AND (dpr.metadata->>'advance_reconciled_at') IS NULL
      AND COALESCE(dpr.total_paid_amount, 0) > 0
      AND (
        dpr.mmp_site_entry_id = NEW.id
        OR dpr.site_visit_id = NEW.id
        OR (trim(dpr.site_name) = trim(v_site_name))
        OR (dpr.site_name ILIKE '%' || trim(v_site_name) || '%')
      );

    v_advance_deducted := COALESCE(v_advance_deducted, 0);
    v_amount := GREATEST(0, v_amount - v_advance_deducted);

    -- Mark those advances as reconciled so they are not deducted again
    IF v_advance_deducted > 0 THEN
      UPDATE public.down_payment_requests
      SET
        metadata = jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{advance_reconciled_at}',
          to_jsonb(now()::text)
        ),
        updated_at = now()
      WHERE requested_by = v_user_id
        AND status IN ('partially_paid', 'fully_paid')
        AND (metadata->>'advance_reconciled_at') IS NULL
        AND (
          mmp_site_entry_id = NEW.id
          OR site_visit_id = NEW.id
          OR (trim(site_name) = trim(v_site_name))
          OR (site_name ILIKE '%' || trim(v_site_name) || '%')
        );
    END IF;

    v_amount_cents := ROUND(v_amount * 100)::bigint;

    -- Skip creating a transaction only if net amount is 0 AND we already have an earning for this site
    IF v_amount <= 0 THEN
      IF EXISTS (
        SELECT 1 FROM public.wallet_transactions
        WHERE (site_visit_id = NEW.id OR related_site_visit_id = NEW.id)
          AND type = 'earning'
      ) THEN
        RAISE NOTICE 'Wallet transaction already exists for site visit % (net 0 after advance)', NEW.id;
        RETURN NEW;
      END IF;
    END IF;

    -- If net amount is 0, we still create a 0-amount transaction for audit and duplicate prevention
    IF v_amount_cents < 0 THEN
      v_amount_cents := 0;
      v_amount := 0;
    END IF;

    -- Check if transaction already exists for this site visit
    IF EXISTS (
      SELECT 1 FROM public.wallet_transactions
      WHERE (site_visit_id = NEW.id OR related_site_visit_id = NEW.id)
        AND type = 'earning'
    ) THEN
      RAISE NOTICE 'Wallet transaction already exists for site visit %', NEW.id;
      RETURN NEW;
    END IF;

    -- Get or create wallet
    SELECT id INTO v_wallet_id
    FROM public.wallets
    WHERE user_id = v_user_id;

    IF v_wallet_id IS NULL THEN
      INSERT INTO public.wallets (user_id, balances, total_earned, total_earned_cents, balance_cents)
      VALUES (
        v_user_id,
        jsonb_build_object('SDG', v_amount),
        v_amount,
        v_amount_cents,
        v_amount_cents
      )
      RETURNING id INTO v_wallet_id;

      v_current_balance := 0;
      v_new_balance := v_amount;
    ELSE
      SELECT
        COALESCE(
          CASE WHEN balance_cents IS NOT NULL THEN balance_cents / 100.0 ELSE NULL END,
          (balances->>'SDG')::numeric,
          0
        )
      INTO v_current_balance
      FROM public.wallets
      WHERE id = v_wallet_id;

      v_new_balance := v_current_balance + v_amount;

      UPDATE public.wallets
      SET
        balances = jsonb_set(
          COALESCE(balances, '{"SDG": 0}'::jsonb),
          '{SDG}',
          to_jsonb(v_new_balance)
        ),
        total_earned = COALESCE(total_earned, 0) + v_amount,
        total_earned_cents = COALESCE(total_earned_cents, 0) + v_amount_cents,
        balance_cents = ROUND(v_new_balance * 100)::bigint,
        updated_at = now()
      WHERE id = v_wallet_id;
    END IF;

    -- Build description (include advance deduction when applicable)
    IF v_advance_deducted > 0 THEN
      v_site_name := format('Site visit completed: %s | Advance deducted: -%s SDG | Net credited: %s SDG',
        v_site_name, v_advance_deducted, v_amount);
    ELSE
      v_site_name := format('Site visit completed: %s', v_site_name);
    END IF;

    INSERT INTO public.wallet_transactions (
      wallet_id,
      user_id,
      type,
      amount,
      amount_cents,
      currency,
      site_visit_id,
      related_site_visit_id,
      description,
      balance_before,
      balance_after,
      status,
      metadata
    )
    VALUES (
      v_wallet_id,
      v_user_id,
      'earning',
      v_amount,
      v_amount_cents,
      'SDG',
      NEW.id,
      NEW.id,
      v_site_name,
      v_current_balance,
      v_new_balance,
      'pending',
      CASE WHEN v_advance_deducted > 0 THEN jsonb_build_object('advance_deducted', v_advance_deducted, 'gross_amount', v_gross_amount) ELSE NULL END
    )
    RETURNING id INTO v_transaction_id;

    RAISE NOTICE 'Created wallet transaction % for site visit %: net % SDG (gross % advance -%) to user %',
      v_transaction_id, NEW.id, v_amount, v_gross_amount, v_advance_deducted, v_user_id;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.create_wallet_transaction_on_completion() IS
  'Creates wallet transactions when site visits are marked completed. Deducts unreconciled transport advances so wallet/site earning reflect net amount (fee minus advance).';
