-- Align signed_paid_amount in pre_fund_event_ledger_v so only payment/return reversals
-- (not direct receipt adjustment reversals) reduce the operational paid amount.

CREATE OR REPLACE VIEW public.pre_fund_event_ledger_v
WITH (security_invoker = true)
AS
SELECT
  t.id,
  t.pre_fund_request_id,
  t.transaction_type,
  t.amount,
  t.currency,
  t.transaction_date,
  t.source_table,
  t.source_id,
  t.reference,
  t.description,
  t.user_id,
  t.created_by,
  t.idempotency_key,
  t.reversal_of_id,
  t.event_reason,
  t.event_metadata,
  t.occurred_at,
  CASE
    WHEN t.source_table = 'down_payment_requests' THEN
      dp.id IS NOT NULL
      AND dp.status IN ('partially_paid', 'fully_paid', 'paid', 'reconciled')
      AND COALESCE((dp.metadata ->> 'deleted')::boolean, false) = false
    WHEN t.source_table = 'operational_cost_submissions' THEN
      ocs.id IS NOT NULL
      AND ocs.status IN ('partially_paid', 'paid', 'reconciled')
    WHEN t.source_table IS NULL THEN true
    ELSE true
  END AS source_is_verified,
  CASE
    WHEN t.transaction_type = 'payment' THEN t.amount
    WHEN t.transaction_type = 'return' THEN -t.amount
    WHEN t.transaction_type = 'reversal' AND (
      t.source_table IS NOT NULL
      OR (orig.id IS NOT NULL AND orig.transaction_type = 'payment')
    ) THEN -t.amount
    ELSE 0
  END AS signed_paid_amount,
  t.created_at,
  t.receipt_url,
  t.reconciled,
  t.reconciled_at
FROM public.pre_fund_transactions t
LEFT JOIN public.down_payment_requests dp
  ON t.source_table = 'down_payment_requests' AND dp.id = t.source_id
LEFT JOIN public.operational_cost_submissions ocs
  ON t.source_table = 'operational_cost_submissions' AND ocs.id = t.source_id
LEFT JOIN public.pre_fund_transactions orig
  ON t.reversal_of_id = orig.id;
