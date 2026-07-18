-- Prevent any authenticated user from deactivating their own profile.
-- This trigger fires on BEFORE UPDATE of the profiles table and raises an
-- exception if the caller attempts to flip their own is_active from true to
-- false.  It uses auth.uid() which resolves to the JWT subject of the
-- current Supabase session — the service-role key (used internally by edge
-- functions / migrations) has no JWT subject, so auth.uid() returns NULL and
-- the check is intentionally skipped for administrative back-end operations.

CREATE OR REPLACE FUNCTION public.prevent_self_deactivation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only block when a real user session is active (auth.uid() is non-null)
  -- and they are trying to set their own row's is_active to false.
  IF auth.uid() IS NOT NULL
     AND NEW.id = auth.uid()
     AND NEW.is_active = FALSE
     AND OLD.is_active = TRUE
  THEN
    RAISE EXCEPTION 'You cannot deactivate your own account.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_self_deactivation ON public.profiles;

CREATE TRIGGER trg_prevent_self_deactivation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_self_deactivation();
