-- These are byte-for-byte duplicates reported by the Supabase performance
-- advisor. Keep the actively used idx_pft_* copies and the constraint-backed
-- idempotency index; removing duplicates reduces every ledger write's work.
DROP INDEX IF EXISTS public.idx_pf_transactions_fund;
DROP INDEX IF EXISTS public.idx_pf_transactions_source;
DROP INDEX IF EXISTS public.ux_pre_fund_transactions_idempotency;
