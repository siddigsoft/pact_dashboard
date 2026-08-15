-- =============================================================================
-- Migration: Incentive MMP Tab — DB support
-- Date: 2026-08-15
-- Run in: Supabase Studio → SQL Editor
-- Safe to re-run: uses IF NOT EXISTS / DO NOTHING guards
--
-- No new tables are required for the Incentive MMP Tab UI.
-- All incentive data lives in tables from:
--   supabase_migrations/20260815_incentive_system_foundation.sql
--
-- This file adds two things:
--   1. reference_id column on payroll_run_items  — links a payroll bonus line
--      back to the mmp_incentive_payments row for idempotency checks.
--   2. A UNIQUE partial index on (reference_id) for non-null rows so that a
--      Finance retry / concurrent click cannot insert a second bonus line for
--      the same incentive payment row.
-- =============================================================================

-- 1. Add reference_id if it doesn't exist
ALTER TABLE public.payroll_run_items
  ADD COLUMN IF NOT EXISTS reference_id uuid;

-- 2. Unique constraint: at most one payroll line per incentive payment row.
--    Partial (WHERE reference_id IS NOT NULL) so regular payroll rows
--    (reference_id = NULL) are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_run_items_incentive_reference
  ON public.payroll_run_items(reference_id)
  WHERE reference_id IS NOT NULL;

-- =============================================================================
-- MIGRATION COMPLETE
-- After running this, every payroll incentive_bonus insert that references the
-- same mmp_incentive_payments.id will hit a unique-violation on retry rather
-- than silently creating a duplicate payout line.
-- =============================================================================
