-- ============================================================================
-- BACKFILL: create/ensure profile for user 5805810f-958f-48da-ad23-58545f992e72
-- ============================================================================
-- This safely copies data from auth.users into public.profiles for the
-- specified user id. Run this after the trigger migration above (or on its
-- own) in Supabase Dashboard → SQL.
-- Created: 2026-02-18
-- ============================================================================

BEGIN;

INSERT INTO public.profiles (id, email, full_name, avatar_url, created_at)
SELECT id, email, (raw_user_meta_data->>'full_name')::text, (raw_user_meta_data->>'avatar_url')::text, now()
FROM auth.users
WHERE id = '5805810f-958f-48da-ad23-58545f992e72'
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url);

COMMIT;

-- Note: if the above INSERT selects zero rows, it means the user id does
-- not exist in auth.users. If you created the auth user via the Admin API,
-- ensure the id matches and that a row exists in auth.users before running.
