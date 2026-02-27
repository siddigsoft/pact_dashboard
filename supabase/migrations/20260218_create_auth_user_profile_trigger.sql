-- ============================================================================
-- AUTO-CREATE / UPSERT PROFILES FROM AUTH.USERS (TRIGGER)
-- ============================================================================
-- Purpose: when a new row is inserted into auth.users, create or upsert a
-- corresponding row in public.profiles so new users show up for approval.
--
-- Run this file in Supabase Dashboard → SQL (owner or a role that can
-- create SECURITY DEFINER functions and triggers on auth.users).
-- Created: 2026-02-18
-- ============================================================================

BEGIN;

-- Function: upsert a profile row when a new auth.user is created
CREATE OR REPLACE FUNCTION public.handle_auth_user_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert profile derived from auth.users; keep id = auth.users.id
  INSERT INTO public.profiles (id, email, full_name, avatar_url, created_at)
  VALUES (
    NEW.id,
    NEW.email,
    (NEW.raw_user_meta_data->>'full_name')::text,
    (NEW.raw_user_meta_data->>'avatar_url')::text,
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
      avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url);

  RETURN NEW;
END;
$$;

-- Trigger: call function AFTER INSERT on auth.users
DROP TRIGGER IF EXISTS auth_user_insert_trigger ON auth.users;
CREATE TRIGGER auth_user_insert_trigger
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_auth_user_insert();

COMMIT;

-- Notes:
-- 1) The function uses NEW.raw_user_meta_data->>'field' to populate profile
--    fields. Adjust field names if your clients store different keys.
-- 2) SECURITY DEFINER is used so the function can perform inserts even when
--    auth role is limited; run this as owner in the SQL editor to set
--    appropriate ownership. If you have a custom policy, review security.
-- 3) Existing users will not be retroactively added by this trigger; use
--    the backfill migration (created alongside this file) to add them.
