-- Include canonical secondary role assignments when resolving the Kassala
-- Supervisor exception. The earlier resolver covered profile.role and the
-- legacy user_roles table, but could miss a Supervisor role assigned through
-- the current canonical access manager to a Field Assistant profile.

CREATE OR REPLACE FUNCTION public.is_kassala_hub_supervisor(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.hubs h
      ON h.id::text IN (p.hub_id::text, p.secondary_hub_id::text)
    WHERE p.id = p_user_id
      AND regexp_replace(lower(coalesce(p.role, '')), '[^a-z]', '', 'g')
          IN ('supervisor', 'hubsupervisor')
      AND regexp_replace(lower(coalesce(h.name, '')), '[^a-z]', '', 'g')
          IN ('kassala', 'kassalahub')

    UNION ALL

    SELECT 1
    FROM public.user_roles ur
    LEFT JOIN public.roles r ON r.id = ur.role_id
    JOIN public.hubs h ON h.id::text = ur.hub_id::text
    WHERE ur.user_id = p_user_id
      AND coalesce(ur.status, 'active') = 'active'
      AND regexp_replace(lower(coalesce(r.name, ur.role, '')), '[^a-z]', '', 'g')
          IN ('supervisor', 'hubsupervisor')
      AND regexp_replace(lower(coalesce(h.name, '')), '[^a-z]', '', 'g')
          IN ('kassala', 'kassalahub')

    UNION ALL

    SELECT 1
    FROM public.canonical_user_role_assignments a
    JOIN public.roles r
      ON r.id = a.role_id
     AND r.is_active = true
    JOIN public.profiles p ON p.id = a.user_id
    JOIN public.hubs h
      ON h.id::text IN (p.hub_id::text, p.secondary_hub_id::text)
    WHERE a.user_id = p_user_id
      AND regexp_replace(lower(coalesce(r.name, '')), '[^a-z]', '', 'g')
          IN ('supervisor', 'hubsupervisor')
      AND regexp_replace(lower(coalesce(h.name, '')), '[^a-z]', '', 'g')
          IN ('kassala', 'kassalahub')
  );
$function$;

REVOKE ALL ON FUNCTION public.is_kassala_hub_supervisor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_kassala_hub_supervisor(uuid) TO authenticated, service_role;