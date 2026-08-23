-- ============================================================================
-- FINANCE-ONLY PRE-FUND LINKED PAYMENT FINDER
-- ============================================================================
-- Read-only search over immutable payment events. This function deliberately
-- does not call any correction, reversal, or balance-refresh routine.

CREATE OR REPLACE FUNCTION public.find_pre_fund_payment_events_rpc(
  p_amount NUMERIC,
  p_currency TEXT DEFAULT NULL
) RETURNS TABLE (
  event_id UUID,
  original_payment_event_id UUID,
  reversal_of_id UUID,
  event_type TEXT,
  link_status TEXT,
  fund_id UUID,
  fund_name TEXT,
  amount NUMERIC,
  currency TEXT,
  payment_date DATE,
  occurred_at TIMESTAMPTZ,
  reference TEXT,
  description TEXT,
  receipt_url TEXT,
  source_table TEXT,
  source_id UUID,
  source_title TEXT,
  source_status TEXT,
  submitter_id UUID,
  submitter_name TEXT,
  event_user_id UUID,
  event_user_name TEXT,
  event_created_by UUID,
  event_created_by_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._assert_finance_role();

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Enter a payment amount greater than zero.';
  END IF;

  RETURN QUERY
  SELECT
    event.id,
    COALESCE(event.reversal_of_id, event.id) AS original_payment_event_id,
    event.reversal_of_id,
    event.transaction_type,
    CASE
      WHEN event.transaction_type = 'reversal' THEN 'reversal'
      WHEN EXISTS (
        SELECT 1
        FROM public.pre_fund_transactions reversal
        WHERE reversal.reversal_of_id = event.id
          AND reversal.transaction_type = 'reversal'
      ) THEN 'reversed'
      ELSE 'active'
    END AS link_status,
    fund.id,
    fund.name,
    event.amount,
    event.currency,
    event.transaction_date,
    event.occurred_at,
    event.reference,
    event.description,
    event.receipt_url,
    event.source_table,
    event.source_id,
    CASE
      WHEN event.source_table = 'down_payment_requests'
        THEN COALESCE(down_payment.justification, down_payment.site_name, event.description, 'Down-payment request ' || event.source_id::TEXT)
      WHEN event.source_table = 'operational_cost_submissions'
        THEN COALESCE(cost_submission.description, event.description, 'Cost submission ' || event.source_id::TEXT)
      ELSE COALESCE(event.description, event.source_table, 'Pre-Fund event')
    END AS source_title,
    CASE
      WHEN event.source_table = 'down_payment_requests' THEN COALESCE(down_payment.status, 'missing')
      WHEN event.source_table = 'operational_cost_submissions' THEN COALESCE(cost_submission.status, 'missing')
      ELSE 'not_applicable'
    END AS source_status,
    COALESCE(down_payment.requested_by, cost_submission.submitted_by, event.user_id),
    COALESCE(submitter.full_name, submitter.email),
    event.user_id,
    COALESCE(paid_by.full_name, paid_by.email),
    event.created_by,
    COALESCE(recorded_by.full_name, recorded_by.email)
  FROM public.pre_fund_transactions event
  JOIN public.pre_fund_requests fund ON fund.id = event.pre_fund_request_id
  LEFT JOIN public.down_payment_requests down_payment
    ON event.source_table = 'down_payment_requests'
   AND down_payment.id = event.source_id
  LEFT JOIN public.operational_cost_submissions cost_submission
    ON event.source_table = 'operational_cost_submissions'
   AND cost_submission.id = event.source_id
  LEFT JOIN public.profiles submitter
    ON submitter.id = COALESCE(down_payment.requested_by, cost_submission.submitted_by, event.user_id)
  LEFT JOIN public.profiles paid_by ON paid_by.id = event.user_id
  LEFT JOIN public.profiles recorded_by ON recorded_by.id = event.created_by
  WHERE event.transaction_type IN ('payment', 'reversal')
    AND event.amount = p_amount
    AND (
      NULLIF(BTRIM(p_currency), '') IS NULL
      OR UPPER(event.currency) = UPPER(BTRIM(p_currency))
    )
  ORDER BY
    COALESCE(event.occurred_at, event.created_at) DESC,
    event.transaction_type,
    event.id;
END;
$$;

REVOKE ALL ON FUNCTION public.find_pre_fund_payment_events_rpc(NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_pre_fund_payment_events_rpc(NUMERIC, TEXT) TO authenticated;