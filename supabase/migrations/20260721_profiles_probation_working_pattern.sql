-- ============================================================================
-- RUNBOOK: Add probation & working-pattern columns to profiles
-- Run ONCE in Supabase SQL Editor (production and any other environment).
-- Safe to re-run: all statements use IF NOT EXISTS.
-- ============================================================================

-- These three columns are used by the Employment & Contract section.
-- Without them the "Save Employment Record" button fails with:
--   "Could not find the 'probation_confirmed' column of 'profiles' in the schema cache"

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS probation_end_date   date,
  ADD COLUMN IF NOT EXISTS probation_confirmed  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS working_pattern      text CHECK (
    working_pattern IS NULL OR working_pattern IN (
      'full-time', 'part-time', 'remote', 'hybrid', 'field'
    )
  );

-- Verify
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'profiles'
  AND column_name  IN ('probation_end_date', 'probation_confirmed', 'working_pattern')
ORDER BY column_name;
