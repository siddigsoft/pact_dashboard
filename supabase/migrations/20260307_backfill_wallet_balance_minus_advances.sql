-- =============================================================================
-- Backfill wallet balance so it reflects "money not yet received":
-- balance = total_earned - sum(disbursed advances).
-- Run once to fix wallets that were updated before the approval trigger stopped
-- adding advances to balance.
-- =============================================================================

WITH advance_sums AS (
  SELECT
    wt.wallet_id,
    COALESCE(SUM(wt.amount), 0)::numeric AS advance_sum
  FROM public.wallet_transactions wt
  JOIN public.down_payment_requests dpr
    ON dpr.id = (wt.metadata->>'down_payment_request_id')::uuid
  WHERE wt.type = 'down_payment_advance'
    AND dpr.status IN ('approved', 'fully_paid', 'partially_paid')
  GROUP BY wt.wallet_id
)
UPDATE public.wallets w
SET
  balances = jsonb_set(
    COALESCE(w.balances, '{"SDG": 0}'::jsonb),
    '{SDG}',
    to_jsonb(GREATEST(0, COALESCE((w.total_earned)::numeric, 0) - COALESCE(a.advance_sum, 0)))
  ),
  balance_cents = GREATEST(0, (COALESCE((w.total_earned)::numeric, 0) * 100 - COALESCE(a.advance_sum, 0) * 100)::bigint),
  updated_at = NOW()
FROM advance_sums a
WHERE a.wallet_id = w.id;

UPDATE public.wallets w
SET
  balances = jsonb_set(COALESCE(w.balances, '{"SDG": 0}'::jsonb), '{SDG}', to_jsonb(GREATEST(0, COALESCE((w.total_earned)::numeric, 0)))),
  balance_cents = GREATEST(0, (COALESCE((w.total_earned)::numeric, 0) * 100)::bigint),
  updated_at = NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM public.wallet_transactions wt
  JOIN public.down_payment_requests dpr ON dpr.id = (wt.metadata->>'down_payment_request_id')::uuid
  WHERE wt.wallet_id = w.id AND wt.type = 'down_payment_advance'
    AND dpr.status IN ('approved', 'fully_paid', 'partially_paid')
);
