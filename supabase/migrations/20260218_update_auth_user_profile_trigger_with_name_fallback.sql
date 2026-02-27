-- ============================================================================
-- UPDATE: handle_auth_user_insert() WITH NAME FALLBACK
-- ============================================================================
-- Improves the trigger function so that when a new auth.user is created the
-- profile's full_name is chosen from available metadata or derived from the
-- email local-part when metadata is missing. This reduces blank-name cases.
--
-- Run in Supabase Dashboard → SQL (owner context recommended).
-- Created: 2026-02-18
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_auth_user_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_full_name text;
  v_avatar_url text;
BEGIN
  -- Prefer explicit full_name or name from raw_user_meta_data, then derive
  -- a readable name from the email local-part as a last resort.
  v_full_name := NULL;
  IF NEW.raw_user_meta_data IS NOT NULL THEN
    v_full_name := (NEW.raw_user_meta_data->>'full_name')::text;
    IF v_full_name IS NULL OR v_full_name = '' THEN
      v_full_name := (NEW.raw_user_meta_data->>'name')::text;
    END IF;
  END IF;

  IF v_full_name IS NULL OR v_full_name = '' THEN
    -- derive from email: take local-part and replace dots/underscores with spaces,
    -- then initcap to make it readable (e.g., 'john.doe' -> 'John Doe')
    v_full_name := initcap(replace(replace(split_part(NEW.email, '@', 1), '.', ' '), '_', ' '));
  END IF;

  v_avatar_url := NULL;
  IF NEW.raw_user_meta_data IS NOT NULL THEN
    v_avatar_url := (NEW.raw_user_meta_data->>'avatar_url')::text;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, avatar_url, created_at)
  VALUES (NEW.id, NEW.email, v_full_name, v_avatar_url, now())
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
      avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url);

  RETURN NEW;
END;
$$;

COMMIT;

-- Notes:
-- 1) This replaces the previous function. Running it will not retroactively
--    change existing profiles — run the provided backfill migration to update
--    existing rows.
-- 2) If you store names under different keys inside raw_user_meta_data, add
--    them to the lookup above.
