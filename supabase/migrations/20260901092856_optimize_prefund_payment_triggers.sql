-- Avoid running the same general-ledger bridge twice for one source update.
-- The retained trg_* triggers execute the same functions as these legacy aliases.
DROP TRIGGER IF EXISTS acct_bridge_down_payments
  ON public.down_payment_requests;

DROP TRIGGER IF EXISTS acct_bridge_ops_cost
  ON public.operational_cost_submissions;

-- Atomic pre-fund payment/reversal RPCs set app.pre_fund_payment_rpc = 'on'
-- and explicitly refresh the affected fund after changing the ledger. Skipping
-- this source trigger in that context avoids an earlier, stale, duplicate
-- balance aggregation and an unnecessary pre_fund_requests update.
CREATE OR REPLACE FUNCTION public.refresh_pre_fund_balance_for_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_source_id UUID := COALESCE(NEW.id, OLD.id);
BEGIN
  IF current_setting('app.pre_fund_payment_rpc', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  UPDATE public.pre_fund_requests f
  SET paid_amount = b.verified_paid_amount,
      available_balance = b.verified_available_balance,
      updated_at = now()
  FROM public.pre_fund_balance_snapshot_v b
  WHERE b.fund_id = f.id
    AND EXISTS (
      SELECT 1
      FROM public.pre_fund_transactions t
      WHERE t.pre_fund_request_id = f.id
        AND t.source_table = TG_TABLE_NAME
        AND t.source_id = v_source_id
    );

  RETURN COALESCE(NEW, OLD);
END;
$function$;
