-- One role per person: clean duplicates, clear secondary roles, harden assign RPC.
WITH ranked AS (
  SELECT
    a.id,
    ROW_NUMBER() OVER (
      PARTITION BY a.user_id
      ORDER BY
        CASE
          WHEN regexp_replace(lower(COALESCE(r.name, '')), '[^a-z]', '', 'g')
             = regexp_replace(lower(COALESCE(p.role, '')), '[^a-z]', '', 'g')
          THEN 0 ELSE 1
        END,
        a.assigned_at DESC NULLS LAST,
        a.created_at DESC NULLS LAST,
        a.id
    ) AS rn
  FROM public.canonical_user_role_assignments a
  JOIN public.roles r ON r.id = a.role_id
  JOIN public.profiles p ON p.id = a.user_id
)
DELETE FROM public.canonical_user_role_assignments a
USING ranked
WHERE a.id = ranked.id AND ranked.rn > 1;

UPDATE public.profiles p
SET role = r.name
FROM public.canonical_user_role_assignments a
JOIN public.roles r ON r.id = a.role_id
WHERE a.user_id = p.id
  AND p.role IS DISTINCT FROM r.name;

UPDATE public.profiles
SET additional_roles = '[]'::jsonb
WHERE additional_roles IS NULL
   OR jsonb_typeof(additional_roles) <> 'array'
   OR jsonb_array_length(COALESCE(additional_roles, '[]'::jsonb)) > 0;

ALTER TABLE public.canonical_user_role_assignments
  DROP CONSTRAINT IF EXISTS canonical_user_role_assignments_user_id_role_id_key;
DROP INDEX IF EXISTS public.canonical_user_role_assignments_user_id_role_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS canonical_user_role_assignments_user_id_key
  ON public.canonical_user_role_assignments (user_id);

DROP FUNCTION IF EXISTS public.assign_role_to_user(uuid, uuid, text, boolean);

CREATE OR REPLACE FUNCTION public.assign_role_to_user(
  p_target_user_id uuid,
  p_target_role_id uuid,
  p_reason text DEFAULT NULL,
  p_make_primary boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_role public.roles%rowtype;
  v_previous_primary text;
  v_previous_role_id uuid;
  v_new_key text;
  v_is_system_text_role boolean := false;
begin
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not public.current_user_has_resource_permission('roles', 'assign') then
    raise exception 'Not authorized to assign roles' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(16103000);

  select role into v_previous_primary
  from public.profiles
  where id = p_target_user_id
  for update;
  if not found then
    raise exception 'Target user not found' using errcode = 'P0002';
  end if;

  select * into v_role
  from public.roles
  where id = p_target_role_id and is_active = true
  for update;
  if not found then
    raise exception 'Role not found or inactive' using errcode = 'P0002';
  end if;

  if not public.is_super_admin(v_actor_id) and (
    regexp_replace(lower(v_role.name), '[^a-z]', '', 'g') in ('superadmin', 'superadministrator', 'admin', 'administrator', 'ict')
    or exists (
      select 1
      from public.permissions permission
      where permission.role_id = v_role.id
        and (
          (permission.resource = 'system' and permission.action = 'override')
          or permission.resource = 'super_admins'
          or not public.current_user_has_resource_permission(permission.resource, permission.action)
        )
    )
  ) then
    raise exception 'Cannot assign roles beyond actor authority' using errcode = '42501';
  end if;

  select role_id into v_previous_role_id
  from public.canonical_user_role_assignments
  where user_id = p_target_user_id;

  delete from public.canonical_user_role_assignments
  where user_id = p_target_user_id
    and role_id is distinct from v_role.id;

  insert into public.canonical_user_role_assignments (user_id, role_id, assigned_by, reason)
  values (p_target_user_id, v_role.id, v_actor_id, nullif(btrim(p_reason), ''))
  on conflict (user_id) do update
    set role_id = excluded.role_id,
        assigned_by = excluded.assigned_by,
        reason = excluded.reason,
        assigned_at = now();

  update public.profiles
  set role = v_role.name,
      additional_roles = '[]'::jsonb
  where id = p_target_user_id;

  v_new_key := regexp_replace(lower(v_role.name), '[^a-z]', '', 'g');

  delete from public.user_roles ur
  where ur.user_id = p_target_user_id
    and (
      (ur.role_id is not null and ur.role_id is distinct from v_role.id)
      or (
        ur.role_id is null
        and ur.role is not null
        and regexp_replace(lower(ur.role), '[^a-z]', '', 'g') is distinct from v_new_key
      )
    );

  v_is_system_text_role := v_role.name = any (array[
    'SuperAdmin','Admin','CountryDirector','ICT','Field Operation Manager (FOM)',
    'FinancialAdmin','ProjectManager','SeniorOperationsLead','Supervisor','Coordinator',
    'DataTeam','DataCollector','Reviewer','Employee','HR','HRManager',
    'superAdmin','admin','countryDirector','ict','fom','financialAdmin','projectManager',
    'seniorOperationsLead','supervisor','coordinator','dataTeam','dataCollector','reviewer',
    'employee','hr','hrManager'
  ]::text[]);

  if v_is_system_text_role then
    insert into public.user_roles (user_id, role, assigned_at, status)
    select p_target_user_id, v_role.name, now(), 'offline'
    where not exists (
      select 1 from public.user_roles ur
      where ur.user_id = p_target_user_id
        and ur.role_id is null
        and regexp_replace(lower(coalesce(ur.role, '')), '[^a-z]', '', 'g') = v_new_key
    );
  else
    insert into public.user_roles (user_id, role_id, assigned_at, status)
    select p_target_user_id, v_role.id, now(), 'offline'
    where not exists (
      select 1 from public.user_roles ur
      where ur.user_id = p_target_user_id and ur.role_id = v_role.id
    );
  end if;

  insert into public.role_access_audit (role_id, actor_id, action, reason, before_state, after_state)
  values (
    v_role.id, v_actor_id, 'assign_primary',
    nullif(btrim(p_reason), ''),
    jsonb_build_object('user_id', p_target_user_id, 'previous_role_id', v_previous_role_id, 'primary_role', v_previous_primary),
    jsonb_build_object('user_id', p_target_user_id, 'role_id', v_role.id, 'primary_role', v_role.name, 'sole_role', true)
  );

  return jsonb_build_object(
    'user_id', p_target_user_id,
    'role_id', v_role.id,
    'role_name', v_role.name,
    'created', v_previous_role_id is distinct from v_role.id,
    'is_primary', true,
    'sole_role', true
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.assign_role_to_user(uuid, uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_role_to_user(uuid, uuid, text, boolean) TO authenticated;
