-- Allow every active Super Admin to manage the Super Admin roster.
-- Preserve RLS, the three-account limit, and the protected owner appointment.
DROP TRIGGER IF EXISTS protect_super_admin_creation_trigger ON public.super_admins;

DROP POLICY IF EXISTS super_admins_active_admin_manage ON public.super_admins;
CREATE POLICY super_admins_active_admin_manage ON public.super_admins
  FOR ALL TO authenticated
  USING ((SELECT public.is_super_admin(auth.uid())))
  WITH CHECK ((SELECT public.is_super_admin(auth.uid())));

CREATE OR REPLACE FUNCTION public.guard_super_admin_appointment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actor uuid := auth.uid();
  is_service boolean := auth.role() = 'service_role';
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(16103000);

  IF NOT is_service AND (actor IS NULL OR NOT public.is_super_admin(actor)) THEN
    RAISE EXCEPTION 'Only an active Super Admin can manage appointments' USING ERRCODE = '42501';
  END IF;

  IF TG_OP <> 'INSERT'
     AND OLD.user_id = 'eeaf10a4-84ad-42d7-8042-ab0a42e69e5b'::uuid THEN
    RAISE EXCEPTION 'Protected owner appointment is immutable' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Create a new appointment instead of changing its user' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE'
     OR (TG_OP = 'UPDATE' AND OLD.is_active AND NOT NEW.is_active) THEN
    IF OLD.is_active AND (
      SELECT count(*) FROM public.super_admins WHERE is_active AND id <> OLD.id
    ) = 0 THEN
      RAISE EXCEPTION 'Cannot remove the last active Super Admin' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  IF TG_OP = 'INSERT'
     OR (TG_OP = 'UPDATE' AND NEW.is_active AND NOT OLD.is_active) THEN
    IF actor IS NOT NULL THEN NEW.appointed_by := actor; END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_super_admin_appointment() FROM PUBLIC, authenticated, anon;
