-- These partial expression indexes are not selected for the workflow's
-- array lookup and the measured fallback scan is sub-millisecond. Avoid
-- paying index maintenance cost on every wallet transaction write.
DROP INDEX IF EXISTS public.idx_wallet_tx_prefund_event_id;
DROP INDEX IF EXISTS public.idx_wallet_tx_prefund_event_key;
