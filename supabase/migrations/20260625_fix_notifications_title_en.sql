-- =============================================================================
-- Fix notifications.title_en NOT NULL constraint
-- Run this in Supabase SQL Editor FIRST (before the RPC).
-- The GL bridge trigger inserts into notifications without title_en,
-- causing a 23502 constraint violation on down_payment status → fully_paid.
-- =============================================================================

-- Make title_en optional (empty string default for backwards compatibility)
ALTER TABLE public.notifications
  ALTER COLUMN title_en DROP NOT NULL;

ALTER TABLE public.notifications
  ALTER COLUMN title_en SET DEFAULT '';

-- Same for title_ar to be consistent
ALTER TABLE public.notifications
  ALTER COLUMN title_ar DROP NOT NULL;

ALTER TABLE public.notifications
  ALTER COLUMN title_ar SET DEFAULT '';
