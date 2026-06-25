-- =============================================================================
-- Fix notifications NOT NULL constraints (title_en, title_ar, message_en, message_ar)
-- Run this in Supabase SQL Editor FIRST (before the RPC).
-- The down_payment trigger inserts into notifications without these columns,
-- causing 23502 constraint violations when status → fully_paid.
-- =============================================================================

-- title_en / title_ar
ALTER TABLE public.notifications
  ALTER COLUMN title_en DROP NOT NULL;
ALTER TABLE public.notifications
  ALTER COLUMN title_en SET DEFAULT '';

ALTER TABLE public.notifications
  ALTER COLUMN title_ar DROP NOT NULL;
ALTER TABLE public.notifications
  ALTER COLUMN title_ar SET DEFAULT '';

-- message_en / message_ar  ← the column shown in the new error
ALTER TABLE public.notifications
  ALTER COLUMN message_en DROP NOT NULL;
ALTER TABLE public.notifications
  ALTER COLUMN message_en SET DEFAULT '';

ALTER TABLE public.notifications
  ALTER COLUMN message_ar DROP NOT NULL;
ALTER TABLE public.notifications
  ALTER COLUMN message_ar SET DEFAULT '';
