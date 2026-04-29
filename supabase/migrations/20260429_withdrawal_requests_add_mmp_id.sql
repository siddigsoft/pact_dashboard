-- Fix: add mmp_id to the existing withdrawal_requests table
-- The table was already created by create_wallet_tables.sql without mmp_id,
-- but useCycleCloseReadiness and MMPCycleClose query .eq('mmp_id', mmpId).
-- Run this ONCE in the Supabase SQL editor.

-- Step 1: add the column (safe to re-run)
ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS mmp_id uuid REFERENCES public.mmp_files(id) ON DELETE CASCADE;

-- Step 2: create the index the original migration wanted
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_mmp_id
  ON public.withdrawal_requests(mmp_id);

-- Step 3: also create the updated_at trigger if not already present
CREATE OR REPLACE FUNCTION public.update_withdrawal_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS withdrawal_requests_updated_at ON public.withdrawal_requests;
CREATE TRIGGER withdrawal_requests_updated_at
  BEFORE UPDATE ON public.withdrawal_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_withdrawal_requests_updated_at();
