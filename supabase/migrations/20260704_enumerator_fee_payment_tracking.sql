-- Enumerator Fee Payment Tracking
-- Temporary/standalone payment ledger for enumerator fees, independent of the
-- Wallet/Withdrawal flow and independent of the site visit "completed" status.
--
-- Context: many site visits are currently completed OUTSIDE the app (paper /
-- field process), so the automatic wallet-credit-on-complete flow never fires.
-- Finance still needs a way to record "this fee was paid" for reporting and
-- reconciliation purposes until field staff are required to use the app
-- (targeted for July) for site visit completion.
--
-- This does NOT touch wallet_transactions, down_payment_requests, or the
-- withdrawal approval flow. It is a pure record-keeping ledger on top of
-- mmp_site_entries.

ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS fee_paid_status   text        NOT NULL DEFAULT 'unpaid'
    CHECK (fee_paid_status IN ('unpaid', 'paid')),
  ADD COLUMN IF NOT EXISTS fee_paid_amount   numeric,
  ADD COLUMN IF NOT EXISTS fee_paid_at       timestamptz,
  ADD COLUMN IF NOT EXISTS fee_paid_by       uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS fee_payment_method text,
  ADD COLUMN IF NOT EXISTS fee_payment_notes  text;

CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_fee_paid_status
  ON public.mmp_site_entries(fee_paid_status);

COMMENT ON COLUMN public.mmp_site_entries.fee_paid_status IS
  'Manual finance ledger for enumerator fee payments made outside the Wallet/Withdrawal flow (e.g. site visit completed outside the app). Independent of cost_acknowledged and site visit status.';
COMMENT ON COLUMN public.mmp_site_entries.fee_paid_by IS
  'auth.users id of the finance/admin user who marked this fee as paid.';

-- ── Runbook ──────────────────────────────────────────────────────────────
-- 1. Open Supabase Dashboard → SQL Editor → run this file (safe to re-run,
--    all statements are IF NOT EXISTS / idempotent).
-- 2. No further steps needed — the Enumerator Fees Report page reads/writes
--    these columns directly via the existing mmp_site_entries RLS policies
--    (no new policy required; existing "mmp_site_entries_update_authenticated"
--    policy already allows authenticated updates, access to the Pay action
--    itself is gated in the UI to Super Admin / Admin / Financial Admin).
