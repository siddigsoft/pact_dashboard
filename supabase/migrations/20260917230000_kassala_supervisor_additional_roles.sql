-- Recognize hub-scoped Supervisor assignments stored in profiles.additional_roles.
-- This is the assignment source used by the Admin user panel for a Field
-- Assistant who supervises a specific hub.

CREATE OR REPLACE FUNCTION public.is_kassala_hub_supervisor(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    -- Primary Supervisor role with a profile-level hub assignment.
    SELECT 1
    FROM public.profiles p
    JOIN public.hubs h
      ON h.id::text IN (
        p.hub_id::text,
        coalesce(p.secondary_hub_id::text, p.location->>'secondary_hub_id')
      )
    WHERE p.id = p_user_id
      AND regexp_replace(lower(coalesce(p.role, '')), '[^a-z]', '', 'g')
          IN ('supervisor', 'hubsupervisor')
      AND regexp_replace(lower(coalesce(h.name, '')), '[^a-z]', '', 'g')
          IN ('kassala', 'kassalahub')

    UNION ALL

    -- Hub-scoped secondary roles from the Admin user panel.
    SELECT 1
    FROM public.profiles p
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(p.additional_roles) = 'array' THEN p.additional_roles
        ELSE '[]'::jsonb
      END
    ) additional_role(value)
    LEFT JOIN public.hubs h
      ON h.id::text = additional_role.value->>'hub_id'
    WHERE p.id = p_user_id
      AND regexp_replace(
            lower(coalesce(additional_role.value->>'role', '')),
            '[^a-z]',
            '',
            'g'
          ) IN ('supervisor', 'hubsupervisor')
      AND regexp_replace(
            lower(coalesce(h.name, additional_role.value->>'hub_id', '')),
            '[^a-z]',
            '',
            'g'
          ) IN ('kassala', 'kassalahub')

    UNION ALL

    -- Legacy hub-scoped role rows.
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

    -- Canonical role assignment paired with profile-level hub scope.
    SELECT 1
    FROM public.canonical_user_role_assignments a
    JOIN public.roles r
      ON r.id = a.role_id
     AND r.is_active = true
    JOIN public.profiles p ON p.id = a.user_id
    JOIN public.hubs h
      ON h.id::text IN (
        p.hub_id::text,
        coalesce(p.secondary_hub_id::text, p.location->>'secondary_hub_id')
      )
    WHERE a.user_id = p_user_id
      AND regexp_replace(lower(coalesce(r.name, '')), '[^a-z]', '', 'g')
          IN ('supervisor', 'hubsupervisor')
      AND regexp_replace(lower(coalesce(h.name, '')), '[^a-z]', '', 'g')
          IN ('kassala', 'kassalahub')
  );
$function$;

REVOKE ALL ON FUNCTION public.is_kassala_hub_supervisor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_kassala_hub_supervisor(uuid) TO authenticated, service_role;