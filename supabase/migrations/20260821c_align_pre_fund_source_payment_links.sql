-- ============================================================================
-- ALIGN PRE-FUND SOURCE PAYMENT LINKS WITH VERIFIED LEDGER SPEND
-- 2026-08-21
-- Safe to re-run. Prevents payment-filter screens from counting a linked
-- payment whose source request was later cancelled, rejected, or invalidated.
-- ============================================================================

-- This read model deliberately uses the reconciliation ledger, rather than raw
-- transaction rows. It therefore applies the same source validation and
-- reversal handling used to maintain pre_fund_requests.paid_amount.
CREATE OR REPLACE VIEW public.pre_fund_source_payment_links_v
WITH (security_invoker = true)
AS
SELECT
  e.id AS payment_event_id,
  e.source_table,
  e.source_id,
  e.pre_fund_request_id AS fund_id,
  f.name AS fund_name,
  f.currency,
  e.amount AS payment_amount,
  e.transaction_date AS payment_date,
  e.reference,
  e.description,
  e.receipt_url,
  e.user_id,
  e.created_by,
  e.occurred_at
FROM public.pre_fund_event_ledger_v e
JOIN public.pre_fund_requests f ON f.id = e.pre_fund_request_id
WHERE e.source_table IN ('down_payment_requests', 'operational_cost_submissions')
  AND e.source_id IS NOT NULL
  AND e.transaction_type = 'payment'
  AND e.source_is_verified = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.pre_fund_transactions reversal
    WHERE reversal.reversal_of_id = e.id
  );

GRANT SELECT ON public.pre_fund_source_payment_links_v TO authenticated;