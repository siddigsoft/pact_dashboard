-- Migration: Add fee columns to mmp_site_entries table
-- Description: Normalizes enumerator/transport fees that were previously stored in additional_data JSON
-- Date: 2025-11-21

BEGIN;

ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS enumerator_fee numeric(10,2),
  ADD COLUMN IF NOT EXISTS transport_fee numeric(10,2),
  ADD COLUMN IF NOT EXISTS cost numeric(10,2);

-- Backfill from JSON for existing rows
UPDATE public.mmp_site_entries
SET 
  enumerator_fee = COALESCE(
    enumerator_fee,
    (additional_data->>'enumerator_fee')::numeric
  ),
  transport_fee = COALESCE(
    transport_fee,
    (additional_data->>'transport_fee')::numeric
  ),
  cost = COALESCE(
    cost,
    (additional_data->>'cost')::numeric
  )
WHERE additional_data IS NOT NULL;

-- Create indexes for cost-based filtering
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_cost ON public.mmp_site_entries(cost);
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_enumerator_fee ON public.mmp_site_entries(enumerator_fee);
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_transport_fee ON public.mmp_site_entries(transport_fee);

-- Add comments
COMMENT ON COLUMN public.mmp_site_entries.enumerator_fee IS 'Enumerator fee in SDG, calculated from classification at claim time';
COMMENT ON COLUMN public.mmp_site_entries.transport_fee IS 'Transport budget in SDG, set at dispatch time';
COMMENT ON COLUMN public.mmp_site_entries.cost IS 'Total cost/payout in SDG (enumerator_fee + transport_fee)';

COMMIT;
