-- Allow the authorized newest-payment hard-delete RPC to recalculate a paid
-- Down Payment after the payment event and its financial evidence are removed.
-- Direct/browser updates remain blocked by the paid-reopen guard.

CREATE OR REPLACE FUNCTION public.guard_paid_down_payment_reopen()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.down_payment_paid_reopen_rpc', true) = 'on'
     OR current_setting('app.pre_fund_payment_rpc', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF (
    OLD.status IN ('partially_paid', 'fully_paid', 'paid', 'reconciled')
    OR COALESCE(OLD.total_paid_amount, 0) > 0
  )
  AND (
    NEW.status NOT IN ('partially_paid', 'fully_paid', 'paid', 'reconciled')
    OR COALESCE(NEW.total_paid_amount, 0) < COALESCE(OLD.total_paid_amount, 0)
  )
  AND (
    EXISTS (
      SELECT 1
      FROM public.pre_fund_transactions t
      WHERE t.source_table = 'down_payment_requests'
        AND t.source_id = OLD.id
        AND t.transaction_type = 'payment'
        AND NOT EXISTS (
          SELECT 1
          FROM public.pre_fund_transactions r
          WHERE r.reversal_of_id = t.id
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.wallet_transactions wt
      WHERE wt.metadata ->> 'down_payment_request_id' = OLD.id::TEXT
        AND wt.status::TEXT IN ('pending', 'posted')
    )
  ) THEN
    RAISE EXCEPTION
      'A paid Down Payment must be reopened through the controlled financial reversal workflow.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_paid_down_payment_reopen ON public.down_payment_requests;
CREATE TRIGGER trg_guard_paid_down_payment_reopen
  BEFORE UPDATE OF status, total_paid_amount
  ON public.down_payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_paid_down_payment_reopen();
