-- Add explicit fee columns for MMP site entries
-- This migration normalizes enumerator/transport fees that were previously stored in additional_data JSON

BEGIN;

ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS enumerator_fee numeric,
  ADD COLUMN IF NOT EXISTS transport_fee numeric;

-- Backfill from JSON for existing rows
UPDATE public.mmp_site_entries
SET 
  enumerator_fee = COALESCE((additional_data->>'enumerator_fee')::numeric, enumerator_fee),
  transport_fee = COALESCE((additional_data->>'transport_fee')::numeric, transport_fee)
WHERE additional_data IS NOT NULL;

-- Helpful index for cost-based filtering
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_cost ON public.mmp_site_entries (cost);

COMMIT;
