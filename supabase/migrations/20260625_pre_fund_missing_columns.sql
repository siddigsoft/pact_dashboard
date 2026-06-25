-- =============================================================================
-- Pre-Fund Missing Columns — consolidation patch
-- Adds all columns required by the app/RPC layer that were not in the
-- original base migration.  Every statement is idempotent (IF NOT EXISTS).
-- Run AFTER any previous pre_fund migrations.
-- =============================================================================

-- ── 1. pre_fund_requests: cost_category ──────────────────────────────────────
-- Required for the country_project_category matching scope.
-- When set, the linkage engine only auto-links payments whose expense_category
-- matches this value.  NULL means "accept any category" (same as country_project).
ALTER TABLE public.pre_fund_requests
  ADD COLUMN IF NOT EXISTS cost_category text;

COMMENT ON COLUMN public.pre_fund_requests.cost_category IS
  'Restricts auto-linkage to payments with a matching expense_category. '
  'Only evaluated when matching_scope = ''country_project_category''. '
  'NULL = no category restriction.';

-- ── 2. pre_fund_transactions: user_id ────────────────────────────────────────
-- The field-staff member who submitted / triggered the payment.
-- Used for per-user allocation deductions inside link_payment_atomically_rpc.
ALTER TABLE public.pre_fund_transactions
  ADD COLUMN IF NOT EXISTS user_id uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.pre_fund_transactions.user_id IS
  'Field staff submitter whose allocation balance is debited when a payment '
  'is auto-linked.  Populated by the p_user_id argument of link_payment_atomically_rpc.';

-- ── 3. pre_fund_transactions: receipt_url ────────────────────────────────────
-- URL of the payment proof / receipt attachment stored alongside the transaction.
ALTER TABLE public.pre_fund_transactions
  ADD COLUMN IF NOT EXISTS receipt_url text;

COMMENT ON COLUMN public.pre_fund_transactions.receipt_url IS
  'Public URL of the payment receipt uploaded by the approver. '
  'Passed as p_receipt_url to link_payment_atomically_rpc.';

-- ── 4. Indexes for new columns ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pfr_cost_category
  ON public.pre_fund_requests(cost_category) WHERE cost_category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pft_user_id
  ON public.pre_fund_transactions(user_id) WHERE user_id IS NOT NULL;
