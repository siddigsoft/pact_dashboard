-- ============================================================================
-- BACKFILL: upsert profiles and populate missing full_name
-- ============================================================================
-- This migration upserts profiles for all auth.users and fills empty/missing
-- `full_name` using raw_user_meta_data or a derived value from the email.
-- Run in Supabase Dashboard → SQL (owner context recommended).
-- Created: 2026-02-18
-- ============================================================================

BEGIN;

WITH src AS (
  SELECT
    id,
    email,
    COALESCE(
      NULLIF((raw_user_meta_data->>'full_name')::text, ''),
      NULLIF((raw_user_meta_data->>'name')::text, ''),
      initcap(replace(replace(split_part(email, '@', 1), '.', ' '), '_', ' '))
    ) AS computed_full_name,
    (raw_user_meta_data->>'avatar_url')::text AS avatar_url
  FROM auth.users
)
INSERT INTO public.profiles (id, email, full_name, avatar_url, created_at)
SELECT id, email, computed_full_name, avatar_url, now()
FROM src
ON CONFLICT (id) DO UPDATE
SET
  email = EXCLUDED.email,
  full_name = CASE
    WHEN public.profiles.full_name IS NULL OR public.profiles.full_name = '' THEN EXCLUDED.full_name
    ELSE public.profiles.full_name
  END,
  avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url);

COMMIT;

-- Note: This will touch every user in auth.users; for very large user tables
-- consider running a filtered backfill (e.g., WHERE public.profiles.full_name IS NULL)
-- or batching the operation.
