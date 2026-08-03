-- Prevent duplicate retainer payments for the same user in the same period.
-- wallet_transactions stores retainers as type='adjustment' with metadata->>'type' = 'retainer'
-- and metadata->>'period' = 'YYYY-MM'.  A partial unique index on (user_id, period)
-- filtered to retainer rows guarantees at most one payment per user per period
-- even if two concurrent calls both pass the client-side duplicate check.

CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_retainer_unique
  ON public.wallet_transactions (user_id, (metadata->>'period'))
  WHERE metadata->>'type' = 'retainer';
