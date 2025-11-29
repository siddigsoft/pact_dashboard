-- =============================================================================
-- PACT Workflow Platform: Add Missing Columns to mmp_site_entries
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- =============================================================================

-- Step 1: Add visit tracking columns (timestamps and user references)
ALTER TABLE public.mmp_site_entries 
ADD COLUMN IF NOT EXISTS visit_started_at TIMESTAMPTZ;

ALTER TABLE public.mmp_site_entries 
ADD COLUMN IF NOT EXISTS visit_started_by UUID REFERENCES public.profiles(id);

ALTER TABLE public.mmp_site_entries 
ADD COLUMN IF NOT EXISTS visit_completed_at TIMESTAMPTZ;

ALTER TABLE public.mmp_site_entries 
ADD COLUMN IF NOT EXISTS visit_completed_by UUID REFERENCES public.profiles(id);

-- Step 2: Add acceptance tracking columns
ALTER TABLE public.mmp_site_entries 
ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;

ALTER TABLE public.mmp_site_entries 
ADD COLUMN IF NOT EXISTS accepted_by UUID REFERENCES public.profiles(id);

-- Step 3: Add fee columns (if not already present)
ALTER TABLE public.mmp_site_entries 
ADD COLUMN IF NOT EXISTS enumerator_fee NUMERIC(12,2) DEFAULT 0;

ALTER TABLE public.mmp_site_entries 
ADD COLUMN IF NOT EXISTS transport_fee NUMERIC(12,2) DEFAULT 0;

ALTER TABLE public.mmp_site_entries 
ADD COLUMN IF NOT EXISTS cost NUMERIC(12,2) DEFAULT 0;

-- Step 4: Backfill fee data from additional_data JSON (for historical records)
-- This copies any fee values stored in the JSON column to the new dedicated columns
UPDATE public.mmp_site_entries
SET 
  enumerator_fee = COALESCE(
    enumerator_fee,
    (additional_data->>'enumerator_fee')::NUMERIC,
    0
  ),
  transport_fee = COALESCE(
    transport_fee,
    (additional_data->>'transport_fee')::NUMERIC,
    0
  ),
  cost = COALESCE(
    cost,
    (additional_data->>'cost')::NUMERIC,
    (additional_data->>'enumerator_fee')::NUMERIC + COALESCE((additional_data->>'transport_fee')::NUMERIC, 0),
    0
  )
WHERE 
  (enumerator_fee IS NULL OR enumerator_fee = 0)
  AND additional_data IS NOT NULL
  AND (additional_data->>'enumerator_fee') IS NOT NULL;

-- Step 5: Backfill visit tracking data from additional_data JSON
UPDATE public.mmp_site_entries
SET 
  visit_started_at = COALESCE(
    visit_started_at,
    (additional_data->>'visit_started_at')::TIMESTAMPTZ
  ),
  visit_started_by = COALESCE(
    visit_started_by,
    (additional_data->>'visit_started_by')::UUID
  ),
  visit_completed_at = COALESCE(
    visit_completed_at,
    (additional_data->>'visit_completed_at')::TIMESTAMPTZ
  ),
  visit_completed_by = COALESCE(
    visit_completed_by,
    (additional_data->>'visit_completed_by')::UUID
  )
WHERE 
  additional_data IS NOT NULL
  AND (
    (additional_data->>'visit_started_at') IS NOT NULL
    OR (additional_data->>'visit_completed_at') IS NOT NULL
  );

-- Step 6: Ensure cost is always calculated correctly for existing records
UPDATE public.mmp_site_entries
SET cost = COALESCE(enumerator_fee, 0) + COALESCE(transport_fee, 0)
WHERE cost IS NULL OR cost = 0
  AND (enumerator_fee > 0 OR transport_fee > 0);

-- Step 7: Refresh the PostgREST schema cache so the API recognizes new columns
NOTIFY pgrst, 'reload schema';

-- Step 8: Verify the columns were added successfully
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'mmp_site_entries'
  AND column_name IN (
    'visit_started_at', 'visit_started_by', 
    'visit_completed_at', 'visit_completed_by',
    'accepted_at', 'accepted_by',
    'enumerator_fee', 'transport_fee', 'cost'
  )
ORDER BY column_name;
