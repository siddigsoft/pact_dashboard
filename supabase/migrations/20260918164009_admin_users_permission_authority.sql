-- Admin role was missing core users CRUD permissions (read/create/update/delete/
-- assign/export). Role creation validates that every granted permission is one
-- the actor already holds, so selecting the Users page (users:read) failed with
-- "Cannot grant permissions beyond actor authority" for Admins.
--
-- Also make that failure message name the blocked permission for easier support.

insert into public.permissions (role_id, resource, action)
select r.id, v.resource, v.action
from public.roles r
cross join (values
  ('users', 'read'),
  ('users', 'create'),
  ('users', 'update'),
  ('users', 'delete'),
  ('users', 'assign'),
  ('users', 'export')
) as v(resource, action)
where regexp_replace(lower(r.name), '[^a-z]', '', 'g') = 'admin'
  and r.is_active = true
on conflict (role_id, resource, action) do nothing;

create or replace function public.upsert_role_access(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role_id uuid;
  v_name text;
  v_display text;
  v_description text;
  v_is_active boolean;
  v_perm jsonb;
  v_column jsonb;
  v_tab jsonb;
  v_slug text;
  v_user_id uuid;
  v_set_primary boolean;
  v_reason text;
  v_before jsonb;
  v_after jsonb;
  v_page_slugs text[];
  v_assign_ids uuid[];
  v_existing_roles text[];
  v_is_create boolean := false;
  v_blocked_resource text;
  v_blocked_action text;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not public.current_user_has_resource_permission('roles',
    case when nullif(payload->>'role_id', '') is null then 'create' else 'update' end) then
    raise exception 'Not authorized to manage roles' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(16103000);

  v_role_id := nullif(payload->>'role_id', '')::uuid;
  v_name := nullif(btrim(coalesce(payload->>'name', '')), '');
  v_display := nullif(btrim(coalesce(payload->>'display_name', '')), '');
  v_description := nullif(btrim(coalesce(payload->>'description', '')), '');
  v_is_active := coalesce((payload->>'is_active')::boolean, true);
  v_set_primary := coalesce((payload->>'set_as_primary')::boolean, false);
  v_reason := nullif(btrim(coalesce(payload->>'reason', '')), '');

  if v_name is null or v_display is null then
    raise exception 'name and display_name are required' using errcode = '22023';
  end if;

  if not public.is_super_admin(v_actor) and (
    regexp_replace(lower(v_name), '[^a-z]', '', 'g') in ('superadmin', 'superadministrator', 'admin', 'administrator', 'ict')
    or exists (select 1 from public.roles r where r.id = v_role_id and r.is_system_role)
  ) then
    raise exception 'Only a Super Admin can manage protected roles' using errcode = '42501';
  end if;

  if payload ? 'page_slugs' and jsonb_typeof(payload->'page_slugs') is distinct from 'array' then
    raise exception 'page_slugs must be an array' using errcode = '22023';
  end if;
  if payload ? 'permissions' and jsonb_typeof(payload->'permissions') is distinct from 'array' then
    raise exception 'permissions must be an array' using errcode = '22023';
  end if;
  if payload ? 'assign_user_ids' and jsonb_typeof(payload->'assign_user_ids') is distinct from 'array' then
    raise exception 'assign_user_ids must be an array' using errcode = '22023';
  end if;
  if payload ? 'page_slugs' and jsonb_typeof(payload->'page_slugs') = 'array' then
    select coalesce(array_agg(x), array[]::text[]) into v_page_slugs
    from (
      select distinct nullif(btrim(value #>> '{}'), '') as x
      from jsonb_array_elements(payload->'page_slugs')
    ) s where x is not null;
  else
    v_page_slugs := array[]::text[];
  end if;

  if payload ? 'tab_rules' and jsonb_typeof(payload->'tab_rules') is distinct from 'array' then
    raise exception 'tab_rules must be an array' using errcode = '22023';
  end if;
  if payload ? 'column_rules' and jsonb_typeof(payload->'column_rules') is distinct from 'array' then
    raise exception 'column_rules must be an array' using errcode = '22023';
  end if;
  if payload ? 'cost_scope' and not coalesce(public.workspace_check_super_admin(), false) then
    raise exception 'Only a workspace Super Admin can configure cost scope' using errcode = '42501';
  end if;

  if payload ? 'assign_user_ids' and jsonb_typeof(payload->'assign_user_ids') = 'array' then
    select coalesce(array_agg(x), array[]::uuid[]) into v_assign_ids
    from (
      select distinct nullif(btrim(value #>> '{}'), '')::uuid as x
      from jsonb_array_elements(payload->'assign_user_ids')
    ) s where x is not null;
  else
    v_assign_ids := array[]::uuid[];
  end if;

  if cardinality(v_assign_ids) > 0 and not public.current_user_has_resource_permission('roles', 'assign') then
    raise exception 'Not authorized to assign roles' using errcode = '42501';
  end if;

  -- Validate before replacing permissions so a save cannot bootstrap itself
  -- into capabilities the actor did not already hold.
  if not public.is_super_admin(v_actor) then
    for v_perm in select value from jsonb_array_elements(coalesce(payload->'permissions', '[]'::jsonb)) loop
      v_blocked_resource := btrim(coalesce(v_perm->>'resource', ''));
      v_blocked_action := btrim(coalesce(v_perm->>'action', ''));
      if (v_blocked_resource = 'system' and v_blocked_action = 'override')
        or v_blocked_resource = 'super_admins'
        or not public.current_user_has_resource_permission(v_blocked_resource, v_blocked_action) then
        raise exception 'Cannot grant permissions beyond actor authority (%:%)',
          coalesce(nullif(v_blocked_resource, ''), '?'),
          coalesce(nullif(v_blocked_action, ''), '?')
          using errcode = '42501';
      end if;
    end loop;
  end if;

  if v_role_id is not null then
    select jsonb_build_object(
      'role', to_jsonb(r),
      'permissions', coalesce((
        select jsonb_agg(jsonb_build_object('resource', p.resource, 'action', p.action, 'conditions', p.conditions) order by p.resource, p.action)
        from public.permissions p where p.role_id = r.id
      ), '[]'::jsonb),
      'page_slugs', coalesce((select jsonb_agg(c.page_slug order by c.page_slug) from public.page_role_configs c where r.name = any(c.roles)), '[]'::jsonb),
      'tab_rules', coalesce((select jsonb_agg(to_jsonb(c) order by c.page_slug) from public.role_tab_configs c where c.role_id = r.id), '[]'::jsonb),
      'column_rules', coalesce((select jsonb_agg(to_jsonb(c) order by c.page_slug, c.column_key) from public.column_visibility_config c where c.role = r.name and c.user_id is null), '[]'::jsonb),
      'data_scopes', coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from public.data_scope_config c where c.role = r.name and c.user_id is null), '[]'::jsonb),
      'assign_user_ids', coalesce((select jsonb_agg(a.user_id order by a.user_id) from public.canonical_user_role_assignments a where a.role_id = r.id), '[]'::jsonb)
    ) into v_before
    from public.roles r where r.id = v_role_id for update;

    if v_before is null then
      raise exception 'Role % not found', v_role_id using errcode = 'P0002';
    end if;

    if v_before->'role'->>'name' is distinct from v_name then
      raise exception 'Role identifiers cannot be renamed; update the display name instead' using errcode = '22023';
    end if;

    update public.roles
    set name = v_name, display_name = v_display, description = v_description,
        is_active = v_is_active, updated_at = now()
    where id = v_role_id;
  else
    v_is_create := true;
    insert into public.roles (name, display_name, description, is_system_role, is_active, created_by)
    values (v_name, v_display, v_description, false, v_is_active, v_actor)
    returning id into v_role_id;
  end if;

  delete from public.permissions where role_id = v_role_id;
  if payload ? 'permissions' and jsonb_typeof(payload->'permissions') = 'array' then
    for v_perm in select value from jsonb_array_elements(payload->'permissions') loop
      if nullif(btrim(coalesce(v_perm->>'resource', '')), '') is not null
         and nullif(btrim(coalesce(v_perm->>'action', '')), '') is not null then
        insert into public.permissions (role_id, resource, action, conditions)
        values (v_role_id, btrim(v_perm->>'resource'), btrim(v_perm->>'action'),
          case when v_perm ? 'conditions' then v_perm->'conditions' else null end)
        on conflict (role_id, resource, action) do update
          set conditions = excluded.conditions;
      end if;
    end loop;
  end if;

  if payload ? 'page_slugs' then
    update public.page_role_configs
      set roles = array_remove(roles, v_name), updated_by = v_actor, updated_at = now()
      where v_name = any(roles) and page_slug not like '%:%'
        and not (page_slug = any(v_page_slugs));
  end if;

  foreach v_slug in array v_page_slugs loop
    select roles into v_existing_roles
    from public.page_role_configs where page_slug = v_slug for update;

    if found then
      if not coalesce(v_name = any (v_existing_roles), false) then
        update public.page_role_configs
        set roles = array_append(coalesce(v_existing_roles, array[]::text[]), v_name), updated_by = v_actor, updated_at = now()
        where page_slug = v_slug;
      end if;
    else
      insert into public.page_role_configs (page_slug, roles, updated_by, updated_at)
      values (v_slug, array[v_name], v_actor, now());
    end if;
  end loop;

  if payload ? 'tab_rules' then
    delete from public.role_tab_configs where role_id = v_role_id;
    for v_tab in select value from jsonb_array_elements(payload->'tab_rules') loop
      if jsonb_typeof(v_tab) <> 'object'
        or nullif(btrim(v_tab->>'page_slug'), '') is null
        or btrim(v_tab->>'page_slug') not like '%:%'
        or jsonb_typeof(v_tab->'is_blocked') is distinct from 'boolean'
      then
        raise exception 'Each tab rule requires a hub:tab page_slug and boolean is_blocked' using errcode = '22023';
      end if;
      insert into public.role_tab_configs(role_id, page_slug, is_blocked, updated_by)
        values(v_role_id, btrim(v_tab->>'page_slug'), (v_tab->>'is_blocked')::boolean, v_actor)
        on conflict(role_id, page_slug) do update set is_blocked = excluded.is_blocked, updated_by = excluded.updated_by, updated_at = now();
    end loop;
  end if;

  if payload ? 'column_rules' then
    delete from public.column_visibility_config where role = v_name and user_id is null;
    for v_column in select value from jsonb_array_elements(payload->'column_rules') loop
      if jsonb_typeof(v_column) <> 'object'
        or nullif(btrim(v_column->>'page_slug'), '') is null
        or nullif(btrim(v_column->>'column_key'), '') is null
        or jsonb_typeof(v_column->'is_hidden') is distinct from 'boolean'
      then
        raise exception 'Each column rule requires page_slug, column_key and boolean is_hidden' using errcode = '22023';
      end if;
      insert into public.column_visibility_config(role, page_slug, column_key, is_hidden, set_by)
        values(v_name, btrim(v_column->>'page_slug'), btrim(v_column->>'column_key'), (v_column->>'is_hidden')::boolean, v_actor)
        on conflict (role, page_slug, column_key) where role is not null
        do update set is_hidden = excluded.is_hidden, set_by = excluded.set_by;
    end loop;
  end if;
  if payload ? 'cost_scope' then
    if jsonb_typeof(payload->'cost_scope') <> 'object' then
      raise exception 'cost_scope must be an object' using errcode = '22023';
    end if;
    perform public.replace_operational_cost_data_scope(null, v_name,
      payload->'cost_scope'->>'mode',
      coalesce(payload->'cost_scope'->'include_values', '[]'::jsonb),
      coalesce(payload->'cost_scope'->'exclude_values', '[]'::jsonb));
  end if;

  foreach v_user_id in array v_assign_ids loop
    if not exists (select 1 from public.profiles where id = v_user_id) then
      raise exception 'Target user % not found', v_user_id using errcode = 'P0002';
    end if;

    insert into public.canonical_user_role_assignments (user_id, role_id, assigned_by, reason)
    values (v_user_id, v_role_id, v_actor, coalesce(v_reason, 'Assigned from role lifecycle'))
    on conflict (user_id, role_id) do nothing;

    if v_set_primary then
      update public.profiles set role = v_name where id = v_user_id;
    end if;
  end loop;

  select jsonb_build_object(
    'role', to_jsonb(r),
    'permissions', coalesce((
      select jsonb_agg(jsonb_build_object('resource', p.resource, 'action', p.action, 'conditions', p.conditions) order by p.resource, p.action)
      from public.permissions p where p.role_id = r.id
    ), '[]'::jsonb),
    'page_slugs', coalesce((select jsonb_agg(c.page_slug order by c.page_slug) from public.page_role_configs c where r.name = any(c.roles)), '[]'::jsonb),
    'tab_rules', coalesce((select jsonb_agg(to_jsonb(c) order by c.page_slug) from public.role_tab_configs c where c.role_id = r.id), '[]'::jsonb),
    'column_rules', coalesce((select jsonb_agg(to_jsonb(c) order by c.page_slug, c.column_key) from public.column_visibility_config c where c.role = r.name and c.user_id is null), '[]'::jsonb),
    'data_scopes', coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from public.data_scope_config c where c.role = r.name and c.user_id is null), '[]'::jsonb),
    'assign_user_ids', coalesce((select jsonb_agg(a.user_id order by a.user_id) from public.canonical_user_role_assignments a where a.role_id = r.id), '[]'::jsonb),
    'set_as_primary', v_set_primary
  ) into v_after
  from public.roles r where r.id = v_role_id;

  insert into public.role_access_audit (role_id, actor_id, action, reason, before_state, after_state)
  values (v_role_id, v_actor, case when v_is_create then 'create' else 'update' end,
    coalesce(v_reason, case when v_is_create then 'Role created via role lifecycle' else 'Role updated via role lifecycle' end),
    v_before, v_after);

  return v_after;
end;
$$;

revoke all on function public.upsert_role_access(jsonb) from public;
grant execute on function public.upsert_role_access(jsonb) to authenticated;
