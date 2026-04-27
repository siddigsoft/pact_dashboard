-- =====================================================================
-- Profile: add default_country_id column
-- Run this in Supabase SQL editor ONCE before the Uganda COA migration
-- =====================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS default_country_id UUID REFERENCES public.countries(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.default_country_id
  IS 'User default accounting country for scoped COA/Journal/Trial-Balance views';
