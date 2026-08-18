-- Keep public.user_roles in lockstep with profiles.role.
-- Changing a user's primary role on the profile (User Detail, Employees, bulk
-- edit, or any SQL update) must add the new role and drop the previous primary
-- unless it is still listed in profiles.additional_roles.

CREATE OR REPLACE FUNCTION public.sync_user_roles_from_profile_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  extra_roles text[];
  old_role text;
  new_role text;
BEGIN
  new_role := nullif(btrim(coalesce(NEW.role, '')), '');
  old_role := CASE
    WHEN TG_OP = 'UPDATE' THEN nullif(btrim(coalesce(OLD.role, '')), '')
    ELSE NULL
  END;

  extra_roles := ARRAY(
    SELECT DISTINCT lower(regexp_replace(coalesce(r->>'role', ''), '[\s_-]+', '', 'g'))
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(NEW.additional_roles) = 'array' THEN NEW.additional_roles
        ELSE '[]'::jsonb
      END
    ) AS r
    WHERE coalesce(r->>'role', '') <> ''
  );

  IF new_role IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = NEW.id
        AND lower(ur.role) = lower(new_role)
    ) THEN
      BEGIN
        INSERT INTO public.user_roles (user_id, role, status, assigned_at)
        VALUES (NEW.id, new_role, 'offline', now());
      EXCEPTION WHEN check_violation OR unique_violation THEN
        -- profiles.role can use labels that user_roles.role_check does not allow.
        -- Never block the profile save if the companion row cannot be inserted.
        NULL;
      END;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND old_role IS NOT NULL
     AND lower(old_role) IS DISTINCT FROM lower(new_role)
     AND NOT (lower(regexp_replace(old_role, '[\s_-]+', '', 'g')) = ANY (extra_roles))
  THEN
    DELETE FROM public.user_roles
    WHERE user_id = NEW.id
      AND lower(role) = lower(old_role);
  END IF;

  IF new_role IS NOT NULL
     AND lower(regexp_replace(new_role, '[\s_-]+', '', 'g')) IN (
       'admin', 'superadmin', 'ict', 'fom', 'fieldoperationmanager',
       'supervisor', 'hubsupervisor', 'datateam', 'financialadmin',
       'countrydirector', 'coordinator'
     )
     AND NOT ('datacollector' = ANY (extra_roles))
  THEN
    DELETE FROM public.user_roles
    WHERE user_id = NEW.id
      AND lower(regexp_replace(role, '[\s_-]+', '', 'g')) = 'datacollector';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_user_roles_from_profile_role ON public.profiles;
CREATE TRIGGER trg_sync_user_roles_from_profile_role
AFTER INSERT OR UPDATE OF role ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_user_roles_from_profile_role();
