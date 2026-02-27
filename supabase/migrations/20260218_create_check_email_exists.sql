-- ============================================================================
-- CREATE check_email_exists(email) FUNCTION
-- ============================================================================
-- Idempotent helper function used by the frontend to check if an email
-- is already present in the project's auth.users table. This avoids the
-- frontend calling a non-existent RPC and receiving 404.
--
-- Created: 2026-02-18
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.check_email_exists(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE (u.email IS NOT NULL AND lower(u.email) = lower(p_email))
       OR (u.raw_user_meta_data->>'email' IS NOT NULL AND lower(u.raw_user_meta_data->>'email') = lower(p_email))
  );
$$;

-- Grant execute to roles commonly used by the frontend. Adjust as needed.
GRANT EXECUTE ON FUNCTION public.check_email_exists(text) TO anon;
GRANT EXECUTE ON FUNCTION public.check_email_exists(text) TO authenticated;

COMMIT;

-- NOTE: Run this using the Supabase SQL editor (or any DB owner connection).
