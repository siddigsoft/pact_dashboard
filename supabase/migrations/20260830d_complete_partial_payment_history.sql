-- Show every source-linked payment instalment, including payments later
-- neutralised by an immutable reversal. Deleted payment snapshots continue to
-- come from payment_event_delete_audit because those rows are physically absent.

CREATE OR REPLACE VIEW public.pre_fund_source_payment_history_v
WITH (security_invoker = true)
AS
SELECT
  payment.id AS payment_event_id,
  payment.source_table,
  payment.source_id,
  payment.pre_fund_request_id AS fund_id,
  fund.name AS fund_name,
  payment.currency,
  payment.amount AS payment_amount,
  payment.transaction_date AS payment_date,
  payment.reference,
  payment.description,
  payment.receipt_url,
  payment.user_id,
  payment.created_by,
  payment.occurred_at,
  payment.idempotency_key,
  CASE WHEN reversal.id IS NULL THEN 'active'::text ELSE 'reversed'::text END AS history_status,
  reversal.id AS reversal_event_id,
  reversal.occurred_at AS reversed_at,
  COALESCE(reversal.event_reason, reversal.description) AS reversal_reason
FROM public.pre_fund_transactions payment
JOIN public.pre_fund_requests fund
  ON fund.id = payment.pre_fund_request_id
LEFT JOIN LATERAL (
  SELECT r.id, r.occurred_at, r.event_reason, r.description
  FROM public.pre_fund_transactions r
  WHERE r.reversal_of_id = payment.id
    AND r.transaction_type IN ('reversal', 'return')
  ORDER BY r.occurred_at DESC NULLS LAST, r.created_at DESC NULLS LAST, r.id DESC
  LIMIT 1
) reversal ON true
WHERE payment.source_table IN ('down_payment_requests', 'operational_cost_submissions')
  AND payment.source_id IS NOT NULL
  AND payment.transaction_type = 'payment';

GRANT SELECT ON public.pre_fund_source_payment_history_v TO authenticated;

NOTIFY pgrst, 'reload schema';