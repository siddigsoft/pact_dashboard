-- =============================================================================
-- Field Payments Centre — Column additions
-- Date: 2026-08-18
--
-- 1. mmp_site_entries: receipt upload + fee_paid_amount already exists;
--    add fee_receipt_url, fee_receipt_uploaded_at
-- 2. cycle_exception_actions: recovery receipt columns for Return/Writeoff/Redirect
-- Safe to re-run: ADD COLUMN IF NOT EXISTS throughout
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. mmp_site_entries — enumerator fee receipt storage
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS fee_receipt_url          text,
  ADD COLUMN IF NOT EXISTS fee_receipt_uploaded_at  timestamptz,
  ADD COLUMN IF NOT EXISTS fee_receipt_uploaded_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fee_paid_amount          numeric(18,2);  -- net amount actually paid (may differ from fee total after advance deduction)

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. cycle_exception_actions — recovery / resolution receipt columns
--    Used by: Return Required, Write-Off approval doc, Redirect-to-fees receipt
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.cycle_exception_actions
  ADD COLUMN IF NOT EXISTS receipt_url              text,           -- uploaded receipt/approval doc
  ADD COLUMN IF NOT EXISTS receipt_uploaded_at      timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_uploaded_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recovery_amount          numeric(18,2),  -- actual cash collected (Return decisions)
  ADD COLUMN IF NOT EXISTS recovery_date            date,           -- date cash was collected
  ADD COLUMN IF NOT EXISTS recovery_collected_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recovery_collected_by_name text,
  ADD COLUMN IF NOT EXISTS redirect_fee_site_entry_id uuid REFERENCES public.mmp_site_entries(id) ON DELETE SET NULL,
  -- links a Redirect decision to the fee payment row it created in mmp_site_entries
  ADD COLUMN IF NOT EXISTS gl_posted                boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gl_posted_at             timestamptz,
  ADD COLUMN IF NOT EXISTS gl_journal_entry_id      uuid;           -- FK to acct_journal_entries when GL integration is complete

-- Index for Finance lookups by MMP and execution status
CREATE INDEX IF NOT EXISTS idx_cea_mmp_executed
  ON public.cycle_exception_actions(mmp_file_id, executed, decision);

CREATE INDEX IF NOT EXISTS idx_cea_gl_pending
  ON public.cycle_exception_actions(gl_posted)
  WHERE gl_posted = false AND executed = true;

COMMIT;
